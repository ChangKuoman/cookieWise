import { browser, type Browser } from 'wxt/browser';
import { cookieUrl, registrableDomain, stripDot } from './domain';
import { scoreCookie } from './riskScorer';
import { getRules, getSummary, overrideKey, type Rules } from './storage';
import type { CookieRef, RiskTier, ScoredCookie, SiteReport } from './types';

type Cookie = Browser.cookies.Cookie;

export const cookieKey = (c: Pick<Cookie, 'name' | 'domain' | 'path' | 'storeId' | 'partitionKey'>) =>
  `${c.storeId}|${c.domain}|${c.path}|${c.name}|${c.partitionKey?.topLevelSite ?? ''}`;

/**
 * Cookies "in play" on a page: first-party cookies plus cookies belonging to every
 * third-party host the page loaded resources from, plus partitioned (CHIPS) cookies.
 */
export async function collectSiteCookies(site: string, resourceHosts: string[] = []): Promise<Cookie[]> {
  const domains = new Set([site, ...resourceHosts.map(registrableDomain)]);
  const lists = await Promise.all([
    ...[...domains].map((domain) => browser.cookies.getAll({ domain })),
    browser.cookies.getAll({ partitionKey: { topLevelSite: `https://${site}` } }).catch(() => [] as Cookie[]),
  ]);
  const byKey = new Map<string, Cookie>();
  for (const c of lists.flat()) byKey.set(cookieKey(c), c);
  return [...byKey.values()];
}

export function scoreCookies(
  cookies: Cookie[],
  site: string | undefined,
  rules: Rules,
  policySellsData = false,
): ScoredCookie[] {
  return cookies.map((c) => {
    const cookieSite = registrableDomain(c.domain);
    const r = scoreCookie(c, {
      site,
      // Policy signals only apply to the site's own cookies.
      policySellsData: policySellsData && cookieSite === site,
      override: rules.overrides[overrideKey(cookieSite, c.name)],
    });
    return {
      key: cookieKey(c),
      name: c.name,
      domain: c.domain,
      path: c.path,
      secure: c.secure,
      httpOnly: c.httpOnly,
      hostOnly: c.hostOnly,
      session: c.session,
      sameSite: c.sameSite,
      expirationDate: c.expirationDate,
      storeId: c.storeId,
      partitionKey: c.partitionKey,
      thirdParty: r.thirdParty,
      purpose: r.purpose,
      vendor: r.vendor,
      description: r.description,
      tier: r.tier,
      points: r.points,
      reasons: r.reasons,
      overridden: r.overridden,
    };
  });
}

export async function getSiteReport(site: string, resourceHosts: string[] = []): Promise<SiteReport> {
  const [cookies, rules, summary] = await Promise.all([
    collectSiteCookies(site, resourceHosts),
    getRules(),
    getSummary(site),
  ]);
  const scored = scoreCookies(cookies, site, rules, summary?.summary.sellsData ?? false);
  scored.sort((a, b) => b.points - a.points);
  return { site, cookies: scored, trusted: rules.trusted.includes(site) };
}

// ---------- Deletion with undo ----------

const UNDO_KEY = 'undoSnapshot';

async function removeOne(c: CookieRef | Cookie): Promise<boolean> {
  const details: Browser.cookies.CookieDetails = { url: cookieUrl(c), name: c.name, storeId: c.storeId };
  if (c.partitionKey) details.partitionKey = c.partitionKey;
  try {
    return !!(await browser.cookies.remove(details));
  } catch {
    return false;
  }
}

/** Removes cookies and keeps a snapshot (values included) so the last bulk delete can be undone. */
export async function deleteCookies(refs: CookieRef[], { snapshot = true } = {}): Promise<number> {
  if (snapshot) await saveUndoSnapshot(refs);
  let n = 0;
  for (const r of refs) if (await removeOne(r)) n++;
  return n;
}

async function saveUndoSnapshot(refs: CookieRef[]): Promise<void> {
  const wanted = new Set(refs.map((r) => cookieKey(r)));
  const domains = [...new Set(refs.map((r) => stripDot(r.domain)))];
  const live = (await Promise.all(domains.map((domain) => browser.cookies.getAll({ domain })))).flat();
  const partitioned = refs.some((r) => r.partitionKey)
    ? (await Promise.all(
        [...new Set(refs.map((r) => r.partitionKey?.topLevelSite).filter(Boolean))].map((topLevelSite) =>
          browser.cookies.getAll({ partitionKey: { topLevelSite } }).catch(() => [] as Cookie[]),
        ),
      )).flat()
    : [];
  const snapshot = [...live, ...partitioned].filter((c) => wanted.has(cookieKey(c)));
  await browser.storage.session.set({ [UNDO_KEY]: snapshot });
}

export async function undoLastDelete(): Promise<number> {
  const { [UNDO_KEY]: snapshot = [] } = (await browser.storage.session.get(UNDO_KEY)) as { [UNDO_KEY]?: Cookie[] };
  let n = 0;
  for (const c of snapshot) {
    const details: Browser.cookies.SetDetails = {
      url: cookieUrl(c),
      name: c.name,
      value: c.value,
      path: c.path,
      secure: c.secure,
      httpOnly: c.httpOnly,
      sameSite: c.sameSite,
      storeId: c.storeId,
    };
    if (!c.hostOnly) details.domain = c.domain;
    if (!c.session && c.expirationDate) details.expirationDate = c.expirationDate;
    if (c.partitionKey) details.partitionKey = c.partitionKey;
    try {
      if (await browser.cookies.set(details)) n++;
    } catch {
      /* cookie may be rejected by the browser (e.g. __Host- prefix rules); skip */
    }
  }
  await browser.storage.session.remove(UNDO_KEY);
  return n;
}

export async function hasUndo(): Promise<boolean> {
  const data = await browser.storage.session.get(UNDO_KEY);
  return Array.isArray(data[UNDO_KEY]) && data[UNDO_KEY].length > 0;
}

// ---------- Dashboard ----------

export interface SiteOverview {
  site: string;
  counts: Record<RiskTier, number>;
  total: number;
  cookies: ScoredCookie[];
}

export async function getAllSites(): Promise<SiteOverview[]> {
  const [all, rules] = await Promise.all([browser.cookies.getAll({}), getRules()]);
  const bySite = new Map<string, Cookie[]>();
  for (const c of all) {
    const s = registrableDomain(c.domain);
    bySite.set(s, [...(bySite.get(s) ?? []), c]);
  }
  const out: SiteOverview[] = [];
  for (const [site, cookies] of bySite) {
    const scored = scoreCookies(cookies, site, rules);
    const counts = { dangerous: 0, moderate: 0, okay: 0, whatever: 0 };
    for (const c of scored) counts[c.tier]++;
    out.push({ site, counts, total: scored.length, cookies: scored });
  }
  return out.sort(
    (a, b) => b.counts.dangerous - a.counts.dangerous || b.counts.moderate - a.counts.moderate || b.total - a.total,
  );
}

export function countTiers(cookies: ScoredCookie[]): Record<RiskTier, number> {
  const counts = { dangerous: 0, moderate: 0, okay: 0, whatever: 0 };
  for (const c of cookies) counts[c.tier]++;
  return counts;
}
