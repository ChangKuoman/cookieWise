import { browser, type Browser } from 'wxt/browser';
import { collectSiteCookies, deleteCookies, getSiteReport, scoreCookies } from '@/lib/cookieEngine';
import { registrableDomain, siteOfUrl } from '@/lib/domain';
import type { BackgroundRequest } from '@/lib/messages';
import { sendToTab } from '@/lib/messages';
import { SetupRequiredError, summarizeSite } from '@/lib/policyPipeline';
import { scoreCookie } from '@/lib/riskScorer';
import { getRules, getSettings, overrideKey } from '@/lib/storage';
import type { PageInfo } from '@/lib/types';

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((msg: BackgroundRequest & { target?: string }, _sender, sendResponse) => {
    if (msg?.target === 'offscreen') return; // handled by the offscreen document
    handle(msg).then(sendResponse, (e) => sendResponse({ ok: false, error: String(e?.message ?? e) }));
    return true;
  });

  browser.cookies.onChanged.addListener(onCookieChanged);

  browser.tabs.onActivated.addListener(({ tabId }) => scheduleBadge(tabId));
  browser.tabs.onUpdated.addListener((tabId, info, tab) => {
    if (info.status === 'complete' && tab.active) scheduleBadge(tabId);
    if (info.status === 'complete' && tab.url) rememberTab(tabId, tab.url);
  });
  browser.tabs.onRemoved.addListener(onTabClosed);
});

async function handle(msg: BackgroundRequest): Promise<unknown> {
  switch (msg.type) {
    case 'getSummary':
      try {
        return { ok: true, summary: await summarizeSite(msg.page, msg.force) };
      } catch (e) {
        return { ok: false, error: (e as Error).message, needsSetup: e instanceof SetupRequiredError };
      }
    case 'getSiteReport':
      return getSiteReport(msg.site, msg.resourceHosts);
    case 'deleteCookies':
      return { deleted: await deleteCookies(msg.cookies) };
    case 'openOptions':
      return browser.runtime.openOptionsPage();
  }
}

// ---------- Block rules ----------

async function onCookieChanged({ removed, cookie }: Browser.cookies.CookieChangeInfo) {
  scheduleActiveBadge();
  if (removed) return;
  const site = registrableDomain(cookie.domain);
  const [rules, settings] = await Promise.all([getRules(), getSettings()]);
  if (rules.trusted.includes(site)) return;

  const blockedByRule = rules.blocked.some((r) => r.site === site && (!r.name || r.name === cookie.name));
  const autoBlocked =
    settings.autoBlockDangerous &&
    scoreCookie(cookie, { override: rules.overrides[overrideKey(site, cookie.name)] }).tier === 'dangerous';

  if (blockedByRule || autoBlocked) {
    await deleteCookies([cookie], { snapshot: false }).catch(() => {});
  }
}

// ---------- Toolbar badge: number of Dangerous cookies on the active tab ----------

let badgeTimer: ReturnType<typeof setTimeout> | undefined;

function scheduleActiveBadge() {
  clearTimeout(badgeTimer);
  badgeTimer = setTimeout(async () => {
    const [tab] = await browser.tabs.query({ active: true, lastFocusedWindow: true });
    if (tab?.id !== undefined) updateBadge(tab.id, tab.url);
  }, 1000);
}

function scheduleBadge(tabId: number) {
  browser.tabs.get(tabId).then((t) => updateBadge(tabId, t.url), () => {});
}

async function updateBadge(tabId: number, url?: string) {
  const site = url ? siteOfUrl(url) : null;
  if (!site) {
    await browser.action.setBadgeText({ tabId, text: '' });
    return;
  }
  const info = await sendToTab<PageInfo>(tabId, { type: 'getPageInfo' }).catch(() => null);
  const report = await getSiteReport(site, info?.resourceHosts ?? []);
  const dangerous = report.cookies.filter((c) => c.tier === 'dangerous').length;
  await browser.action.setBadgeBackgroundColor({ tabId, color: '#d93025' });
  await browser.action.setBadgeText({ tabId, text: dangerous ? String(dangerous) : '' });
}

// ---------- Auto-clean when the last tab of a site closes ----------

interface TabRecord {
  site: string;
  hosts: string[];
}

async function rememberTab(tabId: number, url: string) {
  const site = siteOfUrl(url);
  if (!site) return;
  const info = await sendToTab<PageInfo>(tabId, { type: 'getPageInfo' }).catch(() => null);
  const record: TabRecord = { site, hosts: info?.resourceHosts ?? [] };
  await browser.storage.session.set({ [`tab:${tabId}`]: record });
}

async function onTabClosed(tabId: number) {
  const key = `tab:${tabId}`;
  const { [key]: record } = (await browser.storage.session.get(key)) as Record<string, TabRecord | undefined>;
  await browser.storage.session.remove(key);
  if (!record) return;

  const settings = await getSettings();
  if (!settings.autoCleanOnClose) return;
  const rules = await getRules();
  if (rules.trusted.includes(record.site)) return;

  const stillOpen = (await browser.tabs.query({})).some((t) => t.url && siteOfUrl(t.url) === record.site);
  if (stillOpen) return;

  const cookies = scoreCookies(await collectSiteCookies(record.site, record.hosts), record.site, rules);
  const doomed = cookies.filter((c) => c.tier === 'dangerous' || c.tier === 'moderate');
  if (doomed.length) await deleteCookies(doomed, { snapshot: false });
}
