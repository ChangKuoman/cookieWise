// Runs in the background service worker: fetch policy pages, extract text,
// summarize with Claude (directly or through the proxy), and cache by content hash.
import Anthropic from '@anthropic-ai/sdk';
import { browser } from 'wxt/browser';
import type { OffscreenExtract } from './messages';
import type { StoredSummary } from './schema';
import { getSettings, getSummary, putSummary, type Settings } from './storage';
import { verifyQuotes, type PolicyDocument, type SummarizeResult } from './policyPrompt';
import { summarizeWithClaude } from './summarizeCore';
import { GeminiKeyError, summarizeWithGemini } from './summarizeGemini';
import type { PageInfo, PolicyLink } from './types';

const FALLBACK_PATHS: PolicyLink[] = [
  { kind: 'privacy', url: '/privacy' },
  { kind: 'privacy', url: '/privacy-policy' },
  { kind: 'terms', url: '/terms' },
  { kind: 'cookies', url: '/cookie-policy' },
];
const CACHE_FRESH_MS = 7 * 86_400_000;
const MIN_POLICY_CHARS = 800;

export class SetupRequiredError extends Error {}

const inFlight = new Map<string, Promise<StoredSummary>>();

export function summarizeSite(page: PageInfo, force = false): Promise<StoredSummary> {
  const existing = inFlight.get(page.site);
  if (existing) return existing;
  const p = run(page, force).finally(() => inFlight.delete(page.site));
  inFlight.set(page.site, p);
  return p;
}

async function run(page: PageInfo, force: boolean): Promise<StoredSummary> {
  const cached = await getSummary(page.site);
  if (cached && !force && Date.now() - cached.createdAt < CACHE_FRESH_MS) return cached;

  const settings = await getSettings();
  if (settings.mode === 'direct' && !settings.apiKey) throw new SetupRequiredError('Add your Claude API key in CookieWise settings.');
  if (settings.mode === 'gemini' && !settings.geminiApiKey) throw new SetupRequiredError('Add your Gemini API key in CookieWise settings.');
  if (settings.mode === 'proxy' && !settings.proxyUrl) throw new SetupRequiredError('Add your proxy URL in CookieWise settings.');

  const docs = await fetchPolicies(page);
  if (docs.length === 0) {
    throw new Error("Couldn't find a privacy policy or terms page on this site.");
  }
  const hash = await sha256(docs.map((d) => d.text).join('\n'));
  if (cached && cached.hash === hash && !force) {
    const refreshed = { ...cached, createdAt: Date.now() };
    await putSummary(refreshed);
    return refreshed;
  }

  const { summary, truncated, model } = await withKeepAlive(() => summarize(settings, page.site, docs));
  const stored: StoredSummary = {
    site: page.site,
    createdAt: Date.now(),
    policyUrls: docs.map((d) => d.url),
    hash,
    truncated,
    model,
    summary,
    redFlagVerified: verifyQuotes(summary, docs),
  };
  await putSummary(stored);
  return stored;
}

async function summarize(
  settings: Settings,
  site: string,
  documents: PolicyDocument[],
): Promise<SummarizeResult> {
  const request = { site, documents, language: settings.language };
  if (settings.mode === 'gemini') {
    try {
      return await summarizeWithGemini(settings.geminiApiKey, request, { model: settings.geminiModel, effort: settings.effort });
    } catch (e) {
      if (e instanceof GeminiKeyError) throw new SetupRequiredError(e.message);
      throw e;
    }
  }
  if (settings.mode === 'proxy') {
    const res = await fetch(settings.proxyUrl.replace(/\/$/, '') + '/summarize', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...request, effort: settings.effort }),
    });
    if (!res.ok) throw new Error(`Proxy error ${res.status}: ${await res.text()}`);
    return res.json();
  }
  if (settings.mode !== 'direct') throw new SetupRequiredError('Choose an AI provider in CookieWise settings.');
  const client = new Anthropic({ apiKey: settings.apiKey, dangerouslyAllowBrowser: true });
  try {
    return await summarizeWithClaude(client, request, { model: settings.model, effort: settings.effort });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new SetupRequiredError('Your Claude API key was rejected.');
    if (e instanceof Anthropic.RateLimitError) throw new Error('Rate limited by the Claude API. Try again in a minute.');
    if (e instanceof Anthropic.APIError) throw new Error(`Claude API error ${e.status}: ${e.message}`);
    throw e;
  }
}

async function fetchPolicies(page: PageInfo): Promise<PolicyDocument[]> {
  const origin = new URL(page.url).origin;
  // At most one document per kind, preferring links found on the page.
  const candidates = [...page.policyLinks, ...FALLBACK_PATHS.map((l) => ({ ...l, url: origin + l.url }))];
  const docs: PolicyDocument[] = [];
  const seenKinds = new Set<string>();
  const seenUrls = new Set<string>();
  for (const link of candidates) {
    if (seenKinds.has(link.kind) || seenUrls.has(link.url) || docs.length >= 3) continue;
    seenUrls.add(link.url);
    const text = await fetchAndExtract(link.url);
    if (text && text.length >= MIN_POLICY_CHARS) {
      docs.push({ kind: link.kind, url: link.url, text });
      seenKinds.add(link.kind);
    }
  }
  return docs;
}

async function fetchAndExtract(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { credentials: 'omit', redirect: 'follow' });
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('text/html')) return null;
    const html = await res.text();
    await ensureOffscreen();
    const msg: OffscreenExtract = { target: 'offscreen', type: 'extract', html, url: res.url };
    const text: string | null = await browser.runtime.sendMessage(msg);
    return text;
  } catch {
    return null;
  }
}

let creatingOffscreen: Promise<void> | null = null;
async function ensureOffscreen(): Promise<void> {
  const contexts = await browser.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
  if (contexts.length > 0) return;
  creatingOffscreen ??= browser.offscreen
    .createDocument({
      url: browser.runtime.getURL('/offscreen.html'),
      reasons: ['DOM_PARSER'],
      justification: 'Extract readable text from privacy policy pages.',
    })
    .finally(() => (creatingOffscreen = null));
  await creatingOffscreen;
}

/** Service workers are stopped after ~30s idle; extension API calls reset that timer. */
async function withKeepAlive<T>(fn: () => Promise<T>): Promise<T> {
  const timer = setInterval(() => browser.runtime.getPlatformInfo(), 20_000);
  try {
    return await fn();
  } finally {
    clearInterval(timer);
  }
}

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
