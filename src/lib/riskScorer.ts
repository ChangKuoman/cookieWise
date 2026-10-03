import {
  ANALYTICS_HINT,
  FUNCTIONAL_HINT,
  MARKETING_HINT,
  NECESSARY_HINT,
  AD_TECH_DOMAINS,
  DUAL_USE_DOMAINS,
  PRIVACY_FRIENDLY_ANALYTICS,
  lookupCookie,
} from './cookieDb';
import { isThirdPartyDomain, registrableDomain } from './domain';
import type { Purpose, RiskTier } from './types';

export interface RawCookie {
  name: string;
  domain: string;
  value: string;
  session: boolean;
  expirationDate?: number;
  sameSite: string;
}

export interface ScoreContext {
  /** Site of the tab the cookie is seen from. Omit when unknown (dashboard, block rules). */
  site?: string;
  /** From the AI policy summary. */
  policySellsData?: boolean;
  /** User's manual re-tiering for this cookie. */
  override?: RiskTier;
  now?: number;
}

export interface ScoreResult {
  tier: RiskTier;
  points: number;
  reasons: string[];
  purpose: Purpose;
  thirdParty: boolean;
  vendor?: string;
  description?: string;
  overridden: boolean;
}

const BASE_BY_PURPOSE: Record<Purpose, number> = {
  necessary: 0,
  functional: 15,
  analytics: 40,
  marketing: 70,
  unknown: 30,
};

const TIER_RANK: Record<RiskTier, number> = { whatever: 0, okay: 1, moderate: 2, dangerous: 3 };

export function tierFromPoints(pts: number): RiskTier {
  return pts >= 70 ? 'dangerous' : pts >= 40 ? 'moderate' : pts >= 15 ? 'okay' : 'whatever';
}

export function maxTier(a: RiskTier, b: RiskTier): RiskTier {
  return TIER_RANK[a] >= TIER_RANK[b] ? a : b;
}


export function guessPurpose(name: string): Purpose {
  if (NECESSARY_HINT.test(name)) return 'necessary';
  if (MARKETING_HINT.test(name)) return 'marketing';
  if (ANALYTICS_HINT.test(name)) return 'analytics';
  if (FUNCTIONAL_HINT.test(name)) return 'functional';
  return 'unknown';
}

/** Rough check for "this value is a unique identifier". The value never leaves the device. */
export function looksLikeUniqueId(value: string): boolean {
  const v = decodeSafe(value);
  if (v.length < 16) return false;
  const counts = new Map<string, number>();
  for (const ch of v) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  let entropy = 0;
  for (const n of counts.values()) {
    const p = n / v.length;
    entropy -= p * Math.log2(p);
  }
  return entropy > 3.3;
}

function decodeSafe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

export function scoreCookie(c: RawCookie, ctx: ScoreContext = {}): ScoreResult {
  const cookieSite = registrableDomain(c.domain);
  const known = lookupCookie(c.name, cookieSite);
  const thirdParty = ctx.site ? isThirdPartyDomain(c.domain, ctx.site) : false;
  const dualUse = DUAL_USE_DOMAINS.has(cookieSite);
  const tracker = AD_TECH_DOMAINS.has(cookieSite) || (dualUse && thirdParty);
  let purpose: Purpose = known?.purpose ?? guessPurpose(c.name);
  if (purpose === 'unknown' && tracker) purpose = 'marketing';

  const reasons: string[] = [];
  if (known?.description) reasons.push(known.description);

  let pts = BASE_BY_PURPOSE[purpose];
  if (purpose === 'unknown') reasons.push('Purpose unknown: not in our cookie database');

  // Strictly-necessary cookies stay "Whatever" unless they come from a tracker.
  const necessary = purpose === 'necessary' && !tracker;

  if (!necessary) {
    if (tracker) {
      pts += 30;
      reasons.push(
        dualUse
          ? `${cookieSite} can see you're on this site, even if you never click its buttons`
          : 'Set by a known ad / tracking network',
      );
      if (dualUse) reasons.push(`Removing it may log you out of ${cookieSite}`);
    }
    if (thirdParty) {
      pts += 20;
      reasons.push(`Set by a different company (${cookieSite}) than this site`);
    }
    if (c.sameSite === 'no_restriction' && (thirdParty || tracker)) {
      pts += 10;
      reasons.push('Can be read when you visit other websites');
    }
    const days = c.expirationDate ? (c.expirationDate * 1000 - (ctx.now ?? Date.now())) / 86_400_000 : 0;
    if (!c.session && days > 365) {
      pts += 15;
      reasons.push(`Lasts ${Math.round(days / 365)}+ year(s)`);
    } else if (c.session) {
      pts -= 10;
      reasons.push('Deleted when you close the browser');
    }
    if (looksLikeUniqueId(c.value)) {
      pts += 10;
      reasons.push('Contains a unique ID that can identify you');
    }
    if (ctx.policySellsData && purpose !== 'functional') {
      pts += 15;
      reasons.push("This site's privacy policy says data may be sold or shared");
    }
    if (PRIVACY_FRIENDLY_ANALYTICS.test(c.name)) pts -= 25;
  } else if (!known) {
    reasons.push('Looks like a session, security, or consent cookie');
  }

  let tier = tierFromPoints(Math.max(0, pts));
  if (necessary) tier = 'whatever';
  if (known?.tier) {
    // Curated tier wins; only the policy saying "we sell data" may raise it further.
    tier = ctx.policySellsData && known.tier !== 'whatever' ? maxTier(known.tier, tier) : known.tier;
    // On the platform's own site (e.g. Facebook's `fr` on facebook.com) it's on-site profiling, not cross-site.
    if (tier === 'dangerous' && dualUse && !thirdParty) {
      tier = 'moderate';
      reasons.push(`Used by ${cookieSite} itself for ads and profiling`);
    }
  }

  let overridden = false;
  if (ctx.override) {
    tier = ctx.override;
    overridden = true;
    reasons.unshift('You moved this cookie to this tier');
  }

  return {
    tier,
    points: pts,
    reasons,
    purpose,
    thirdParty,
    vendor: known?.vendor,
    description: known?.description,
    overridden,
  };
}
