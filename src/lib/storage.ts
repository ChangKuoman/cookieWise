import { browser } from 'wxt/browser';
import type { StoredSummary } from './schema';
import type { RiskTier } from './types';

export type Effort = 'low' | 'medium' | 'high';

export type AiMode = 'direct' | 'gemini' | 'proxy';

export interface Settings {
  /** 'direct' = the user's own Claude API key. */
  mode: AiMode;
  apiKey: string;
  geminiApiKey: string;
  geminiModel: string;
  proxyUrl: string;
  model: string;
  effort: Effort;
  language: string;
  showBannerBadge: boolean;
  autoAnalyze: boolean;
  autoBlockDangerous: boolean;
  autoCleanOnClose: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  mode: 'direct',
  apiKey: '',
  geminiApiKey: '',
  geminiModel: 'gemini-3.8-flash',
  proxyUrl: '',
  model: 'claude-opus-5-5',
  effort: 'low',
  language: 'English',
  showBannerBadge: true,
  autoAnalyze: false,
  autoBlockDangerous: false,
  autoCleanOnClose: false,
};

export interface BlockRule {
  /** Registrable domain, e.g. "doubleclick.net". */
  site: string;
  /** Cookie name; omit to block every cookie from the site. */
  name?: string;
}

export interface Rules {
  blocked: BlockRule[];
  trusted: string[];
  /** key: `${site}|${name}` */
  overrides: Record<string, RiskTier>;
}

const DEFAULT_RULES: Rules = { blocked: [], trusted: [], overrides: {} };

export async function getSettings(): Promise<Settings> {
  const { settings } = await browser.storage.local.get('settings');
  return { ...DEFAULT_SETTINGS, ...(settings ?? {}) };
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings()), ...patch };
  await browser.storage.local.set({ settings: next });
  return next;
}

export async function getRules(): Promise<Rules> {
  const { rules } = await browser.storage.local.get('rules');
  return { ...DEFAULT_RULES, ...(rules ?? {}) };
}

export async function updateRules(fn: (r: Rules) => Rules | void): Promise<Rules> {
  const current = await getRules();
  const next = fn(current) ?? current;
  await browser.storage.local.set({ rules: next });
  return next;
}

export const overrideKey = (site: string, name: string) => `${site}|${name}`;

export async function getSummary(site: string): Promise<StoredSummary | undefined> {
  const key = `summary:${site}`;
  const data = await browser.storage.local.get(key);
  return data[key] as StoredSummary | undefined;
}

export async function putSummary(s: StoredSummary): Promise<void> {
  await browser.storage.local.set({ [`summary:${s.site}`]: s });
}
