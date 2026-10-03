// Runs in the background service worker: fetch policy pages, extract text,
// summarize with Claude, Gemini or the proxy, and cache by content hash.
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
const PAGE_TIMEOUT_MS = 15_000;
const EXTRACT_TIMEOUT_MS = 10_000;
const AI_TIMEOUT_MS = 150_000;

export class SetupRequiredError extends Error {}

/** What the pipeline is doing right now, so the UI can show more than a spinner. */
export interface SummaryProgress {
  stage: string;
  startedAt: number;
}
export const progressKey = (site: string) => `progress:${site}`;

const inFlight = new Map<string, { promise: Promise<StoredSummary>; controller: AbortController }>();

/** One run per site. `force` (Try again / Re-analyze) cancels a run that is still going. */
export function summarizeSite(page: PageInfo, force = false): Promise<StoredSummary> {
  const existing = inFlight.get(page.site);
  if (existing && !force) return existing.promise;
  existing?.controller.abort();

  const controller = new AbortController();
  const promise = withKeepAlive(() => run(page, force, controller.signal)).finally(() => {
    if (inFlight.get(page.site)?.controller === controller) {
      inFlight.delete(page.site);
      browser.storage.local.remove(progressKey(page.site));
    }
  });
  inFlight.set(page.site, { promise, controller });
  return promise;
}

async function run(page: PageInfo, force: boolean, signal: AbortSignal): Promise<StoredSummary> {
  const started = Date.now();
  const progress = async (stage: string) => {
    if (signal.aborted) throw new Error('Restarted.');
    console.info(`[CookieWise] ${page.site}: ${stage} (+${((Date.now() - started) / 1000).toFixed(1)}s)`);
    await browser.storage.local.set({ [progressKey(page.site)]: { stage, startedAt: started } satisfies SummaryProgress });
  };

  const cached = await getSummary(page.site);
  if (cached && !force && Date.now() - cached.createdAt < CACHE_FRESH_MS) return cached;

  const settings = await getSettings();
  if (settings.mode === 'direct' && !settings.apiKey) throw new SetupRequiredError('Add your Claude API key in CookieWise settings.');
  if (settings.mode === 'gemini' && !settings.geminiApiKey) throw new SetupRequiredError('Add your Gemini API key in CookieWise settings.');
  if (settings.mode === 'proxy' && !settings.proxyUrl) throw new SetupRequiredError('Add your proxy URL in CookieWise settings.');

  await progress('Finding the privacy policy and terms');
  const docs = await fetchPolicies(page, signal, progress);
  if (docs.length === 0) {
    throw new Error("Couldn't find a privacy policy or terms page on this site (or the site blocked us from reading it).");
  }
  const hash = await sha256(docs.map((d) => d.text).join('\n'));
  if (cached && cached.hash === hash && !force) {
    const refreshed = { ...cached, createdAt: Date.now() };
    await putSummary(refreshed);
    return refreshed;
  }

  const words = Math.round(docs.reduce((n, d) => n + d.text.length, 0) / 6);
  await progress(`Asking ${providerName(settings)} to read ${docs.length} document${docs.length > 1 ? 's' : ''} (~${words.toLocaleString()} words)`);
  const { summary, truncated, model } = await summarize(settings, page.site, docs, signal);
  await progress('Done');

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

function providerName(s: Settings): string {
  return s.mode === 'gemini' ? 'Gemini' : s.mode === 'proxy' ? 'the CookieWise server' : 'Claude';
}

async function summarize(
  settings: Settings,
  site: string,
  documents: PolicyDocument[],
  outer: AbortSignal,
): Promise<SummarizeResult> {
  const request = { site, documents, language: settings.language };
  const signal = AbortSignal.any([outer, AbortSignal.timeout(AI_TIMEOUT_MS)]);
  try {
    if (settings.mode === 'gemini') {
      return await summarizeWithGemini(settings.geminiApiKey, request, { model: settings.geminiModel, effort: settings.effort }, signal);
    }
    if (settings.mode === 'proxy') {
      const res = await fetch(settings.proxyUrl.replace(/\/$/, '') + '/summarize', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...request, effort: settings.effort }),
        signal,
      });
      if (!res.ok) throw new Error(`Proxy error ${res.status}: ${await res.text()}`);
      return await res.json();
    }
    if (settings.mode !== 'direct') throw new SetupRequiredError('Choose an AI provider in CookieWise settings.');
    const client = new Anthropic({ apiKey: settings.apiKey, dangerouslyAllowBrowser: true, maxRetries: 1 });
    return await summarizeWithClaude(client, request, { model: settings.model, effort: settings.effort }, signal);
  } catch (e) {
    if (outer.aborted) throw new Error('Restarted.');
    if (signal.aborted) {
      throw new Error(
        `${providerName(settings)} didn't answer within ${AI_TIMEOUT_MS / 60_000} minutes. Try again, or choose a faster model or "Quick" analysis depth in settings.`,
      );
    }
    if (e instanceof GeminiKeyError) throw new SetupRequiredError(e.message);
    if (e instanceof Anthropic.AuthenticationError) throw new SetupRequiredError('Your Claude API key was rejected.');
    if (e instanceof Anthropic.RateLimitError) throw new Error('Rate limited by the Claude API. Try again in a minute.');
    if (e instanceof Anthropic.APIError) throw new Error(`Claude API error ${e.status}: ${e.message}`);
    throw e;
  }
}

async function fetchPolicies(
  page: PageInfo,
  signal: AbortSignal,
  progress: (stage: string) => Promise<void>,
): Promise<PolicyDocument[]> {
  const origin = new URL(page.url).origin;
  // At most one document per kind, preferring links found on the page.
  const candidates = [...page.policyLinks, ...FALLBACK_PATHS.map((l) => ({ ...l, url: origin + l.url }))];
  const docs: PolicyDocument[] = [];
  const seenKinds = new Set<string>();
  const seenUrls = new Set<string>();
  for (const link of candidates) {
    if (seenKinds.has(link.kind) || seenUrls.has(link.url) || docs.length >= 3) continue;
    seenUrls.add(link.url);
    await progress(`Reading ${new URL(link.url).pathname}`);
    const text = await fetchAndExtract(link.url, signal);
    if (text && text.length >= MIN_POLICY_CHARS) {
      docs.push({ kind: link.kind, url: link.url, text });
      seenKinds.add(link.kind);
    }
  }
  return docs;
}

async function fetchAndExtract(url: string, outer: AbortSignal): Promise<string | null> {
  const started = Date.now();
  try {
    const res = await fetch(url, {
      credentials: 'omit',
      redirect: 'follow',
      signal: AbortSignal.any([outer, AbortSignal.timeout(PAGE_TIMEOUT_MS)]),
    });
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('text/html')) {
      console.info(`[CookieWise] skipped ${url}: HTTP ${res.status} ${res.headers.get('content-type')}`);
      return null;
    }
    const html = await res.text();
    await ensureOffscreen();
    const msg: OffscreenExtract = { target: 'offscreen', type: 'extract', html, url: res.url };
    const text = await Promise.race([
      browser.runtime.sendMessage(msg) as Promise<string | null>,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), EXTRACT_TIMEOUT_MS)),
    ]);
    console.info(`[CookieWise] read ${url}: ${text?.length ?? 0} chars in ${Date.now() - started}ms`);
    return text;
  } catch (e) {
    console.info(`[CookieWise] failed ${url} after ${Date.now() - started}ms: ${(e as Error).message}`);
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
