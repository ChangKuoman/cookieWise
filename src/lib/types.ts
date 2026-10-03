export type RiskTier = 'dangerous' | 'moderate' | 'okay' | 'whatever';
export type Purpose = 'necessary' | 'functional' | 'analytics' | 'marketing' | 'unknown';

export const TIERS: RiskTier[] = ['dangerous', 'moderate', 'okay', 'whatever'];

export const TIER_META: Record<RiskTier, { emoji: string; label: string; blurb: string }> = {
  dangerous: {
    emoji: '🔴',
    label: 'Dangerous',
    blurb: 'Follows you across sites, builds ad profiles, or feeds data brokers.',
  },
  moderate: {
    emoji: '🟠',
    label: 'Moderate',
    blurb: 'Tracks your behavior on this site with a persistent ID.',
  },
  okay: { emoji: '🟢', label: 'Okay', blurb: 'Remembers your preferences. No profiling.' },
  whatever: {
    emoji: '⚪',
    label: 'Whatever',
    blurb: 'Strictly necessary. The site breaks without it.',
  },
};

/** A cookie as shown in the UI. Deliberately excludes the cookie value. */
export interface ScoredCookie {
  key: string;
  name: string;
  domain: string;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  hostOnly: boolean;
  session: boolean;
  sameSite: string;
  expirationDate?: number;
  storeId: string;
  partitionKey?: { topLevelSite?: string };
  thirdParty: boolean;
  purpose: Purpose;
  vendor?: string;
  description?: string;
  tier: RiskTier;
  points: number;
  reasons: string[];
  overridden: boolean;
}

/** Enough to locate and remove a cookie. */
export type CookieRef = Pick<
  ScoredCookie,
  'name' | 'domain' | 'path' | 'secure' | 'storeId' | 'partitionKey'
>;

export interface PolicyLink {
  kind: 'privacy' | 'terms' | 'cookies';
  url: string;
}

export interface PageInfo {
  url: string;
  site: string;
  policyLinks: PolicyLink[];
  resourceHosts: string[];
  bannerCmp: string | null;
}

export interface SiteReport {
  site: string;
  cookies: ScoredCookie[];
  trusted: boolean;
}
