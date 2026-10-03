import type { Purpose, RiskTier } from './types';

export interface KnownCookie {
  match: RegExp;
  vendor: string;
  purpose: Purpose;
  description: string;
  /** Curated tier. Wins over the computed score (but not over a user override). */
  tier?: RiskTier;
  /** Only match when the cookie is set by one of these sites (for generic names like `id`). */
  domains?: string[];
}

// Hand-curated list of the most common cookies on the web. Purposes follow the
// Open Cookie Database where an entry exists there.
export const KNOWN_COOKIES: KnownCookie[] = [
  // ---- Cross-site advertising / tracking (Dangerous) ----
  { match: /^_fbp$/, vendor: 'Meta (Facebook)', purpose: 'marketing', tier: 'dangerous', description: 'Lets Facebook recognize you on every site that has the Meta Pixel, even if you never click anything.' },
  { match: /^fr$/, vendor: 'Meta (Facebook)', purpose: 'marketing', tier: 'dangerous', description: 'Facebook ad-targeting ID used across sites.' },
  { match: /^_fbc$/, vendor: 'Meta (Facebook)', purpose: 'marketing', tier: 'dangerous', description: 'Stores the last Facebook ad you clicked so the visit can be tied back to you.' },
  { match: /^(IDE|DSID|test_cookie|id|ar_debug)$/, domains: ['doubleclick.net'], vendor: 'Google Ads / DoubleClick', purpose: 'marketing', tier: 'dangerous', description: 'Google ad-network IDs that follow you across millions of sites to build an ad profile.' },
  { match: /^(__gads|__gpi|__gsas|__eoi)$/, vendor: 'Google AdSense', purpose: 'marketing', tier: 'dangerous', description: 'Google ad-serving ID used to target and measure ads.' },
  { match: /^_gcl_(au|aw|dc|gb|gf|ha)$/, vendor: 'Google Ads', purpose: 'marketing', tier: 'dangerous', description: 'Links your visit to Google ad clicks (conversion tracking).' },
  { match: /^(NID|ANID|AEC|1P_JAR|SOCS)$/, domains: ['google.com'], vendor: 'Google', purpose: 'marketing', tier: 'moderate', description: 'Google preference and ad-personalization ID.' },
  { match: /^_ttp$|^_tt_enable_cookie$|^ttwid$/, vendor: 'TikTok', purpose: 'marketing', tier: 'dangerous', description: 'TikTok Pixel ID that tracks you across sites for ads.' },
  { match: /^(uuid2|anj|sess|icu|usersync|XANDR_PANID)$/, domains: ['adnxs.com'], vendor: 'Xandr (Microsoft) / AppNexus', purpose: 'marketing', tier: 'dangerous', description: 'Ad-exchange ID used to auction your profile in real time.' },
  { match: /^(MUID|_uetsid|_uetvid|MR|ANONCHK|SRM_B)$/, vendor: 'Microsoft Bing Ads', purpose: 'marketing', tier: 'dangerous', description: 'Microsoft advertising ID that tracks visits across sites.' },
  { match: /^(cto_bundle|cto_bidid|criteo_.*)$/, vendor: 'Criteo', purpose: 'marketing', tier: 'dangerous', description: 'Retargeting: follows you around the web with ads for things you looked at.' },
  { match: /^(t_gid|taboola_.*|trc_cookie_storage)$/, vendor: 'Taboola', purpose: 'marketing', tier: 'dangerous', description: 'Taboola content-recommendation and ad tracking ID.' },
  { match: /^(obuid|outbrain_cid_fetch)$/, vendor: 'Outbrain', purpose: 'marketing', tier: 'dangerous', description: 'Outbrain recommendation/ad tracking ID.' },
  { match: /^(IDSYNC|_li_ss|rlas3|pxrc|_lr_.*)$/, vendor: 'LiveRamp (data broker)', purpose: 'marketing', tier: 'dangerous', description: 'Identity-resolution ID used by data brokers to link your browsing to your real-world identity.' },
  { match: /^(bcookie|lidc|UserMatchHistory|AnalyticsSyncHistory|li_sugr|_guid|li_fat_id)$/, vendor: 'LinkedIn', purpose: 'marketing', tier: 'dangerous', description: 'LinkedIn ad and Insight Tag tracking across sites.' },
  { match: /^(_pin_unauth|_pinterest_ct_ua|_pinterest_sess|_derived_epik)$/, vendor: 'Pinterest', purpose: 'marketing', tier: 'dangerous', description: 'Pinterest Tag that tracks visits for ad targeting.' },
  { match: /^(_scid|sc_at|_sctr|_schn)$/, vendor: 'Snapchat', purpose: 'marketing', tier: 'dangerous', description: 'Snap Pixel tracking ID.' },
  { match: /^(personalization_id|guest_id|guest_id_ads|guest_id_marketing|muc_ads)$/, vendor: 'X (Twitter)', purpose: 'marketing', tier: 'dangerous', description: 'X/Twitter ad-tracking ID.' },
  { match: /^(_rdt_uuid|_rdt_cid)$/, vendor: 'Reddit', purpose: 'marketing', tier: 'dangerous', description: 'Reddit Pixel tracking ID.' },
  { match: /^(uid|uic)$/, domains: ['criteo.com'], vendor: 'Criteo', purpose: 'marketing', tier: 'dangerous', description: 'Criteo cross-site retargeting ID.' },
  { match: /^(A3|B|IDSYNC|tbla_id)$/, domains: ['yahoo.com', 'taboola.com'], vendor: 'Yahoo / Taboola', purpose: 'marketing', tier: 'dangerous', description: 'Ad-network tracking ID.' },
  { match: /^(demdex|dextp|dpm|DST)$/, vendor: 'Adobe Audience Manager', purpose: 'marketing', tier: 'dangerous', description: 'Adobe data-management-platform ID shared with ad partners.' },
  { match: /^(TDID|TDCPM|TTDOptOut)$/, vendor: 'The Trade Desk', purpose: 'marketing', tier: 'dangerous', description: 'Ad-exchange ID used for real-time bidding on you.' },
  { match: /^(KTPCACOOKIE|KRTBCOOKIE_.*|PugT|tuuid|tuuid_lu|c|um|umeh|khaos|audit|ljt_reader|ljtrtb)$/, domains: ['pubmatic.com', 'kargo.com', 'bidswitch.net', 'rubiconproject.com', 'lijit.com', 'sovrn.com'], vendor: 'Ad exchange (PubMatic/Kargo/etc.)', purpose: 'marketing', tier: 'dangerous', description: 'Programmatic ad-exchange user ID.' },
  { match: /^(_hjAbsoluteSessionInProgress|_hjSessionUser_.*|_hjSession_.*|_hjid|_hjIncludedInSessionSample.*)$/, vendor: 'Hotjar', purpose: 'analytics', tier: 'moderate', description: 'Session recording: can capture your clicks, scrolling and mouse movements.' },
  { match: /^(_clck|_clsk|CLID|SM)$/, vendor: 'Microsoft Clarity', purpose: 'analytics', tier: 'moderate', description: 'Session recording and heatmaps of everything you do on the page.' },
  { match: /^(_fs_uid|fs_uid|fs_lua)$/, vendor: 'FullStory', purpose: 'analytics', tier: 'moderate', description: 'Session replay: records your entire visit.' },

  // ---- On-site analytics (Moderate) ----
  { match: /^_ga$|^_ga_.+$/, vendor: 'Google Analytics', purpose: 'analytics', description: 'Assigns you a unique ID to track your visits and behavior on this site (sent to Google).' },
  { match: /^(_gid|_gat.*|__utm[abcvz])$/, vendor: 'Google Analytics', purpose: 'analytics', description: 'Google Analytics visit tracking.' },
  { match: /^(mp_.*_mixpanel)$/, vendor: 'Mixpanel', purpose: 'analytics', description: 'Product analytics: tracks what you click and use.' },
  { match: /^(ajs_anonymous_id|ajs_user_id)$/, vendor: 'Segment', purpose: 'analytics', description: 'Customer-data platform ID; often forwarded to many other tools.' },
  { match: /^(amplitude_id.*|AMP_.*)$/, vendor: 'Amplitude', purpose: 'analytics', description: 'Product analytics user ID.' },
  { match: /^(s_cc|s_sq|s_vi|s_fid|s_ecid|AMCV_.*|AMCVS_.*|s_nr.*)$/, vendor: 'Adobe Analytics', purpose: 'analytics', description: 'Adobe Analytics visitor tracking.' },
  { match: /^(_hp2_id\..*|_hp2_ses_props\..*)$/, vendor: 'Heap', purpose: 'analytics', description: 'Captures every interaction for analytics.' },
  { match: /^(optimizelyEndUserId|_vwo_uuid.*|_vis_opt_.*|_vwo_.*)$/, vendor: 'A/B testing (Optimizely/VWO)', purpose: 'analytics', description: 'Puts you into experiments and tracks your behavior.' },
  { match: /^(__hstc|hubspotutk|__hssc|__hssrc)$/, vendor: 'HubSpot', purpose: 'marketing', tier: 'moderate', description: 'Marketing-automation tracking: ties your visits to a contact record if you ever fill a form.' },
  { match: /^(_mkto_trk)$/, vendor: 'Marketo', purpose: 'marketing', tier: 'moderate', description: 'Marketing-automation visitor tracking.' },
  { match: /^(intercom-id-.*|intercom-device-id-.*)$/, vendor: 'Intercom', purpose: 'functional', tier: 'moderate', description: 'Chat widget ID that also tracks visits.' },
  { match: /^(_pk_id\..*|_pk_ses\..*)$/, vendor: 'Matomo', purpose: 'analytics', tier: 'okay', description: 'Self-hosted analytics (usually privacy-friendly, data stays with the site).' },

  // ---- Preferences (Okay) ----
  { match: /^(lang|language|locale|i18n.*|NEXT_LOCALE|wp-wpml_current_language)$/i, vendor: 'Site', purpose: 'functional', tier: 'okay', description: 'Remembers your language.' },
  { match: /^(theme|color_?scheme|dark_?mode)$/i, vendor: 'Site', purpose: 'functional', tier: 'okay', description: 'Remembers light/dark theme.' },
  { match: /^(currency|country|region|timezone|tz)$/i, vendor: 'Site', purpose: 'functional', tier: 'okay', description: 'Remembers your region or currency.' },
  { match: /^(YSC|VISITOR_INFO1_LIVE|VISITOR_PRIVACY_METADATA|PREF)$/, vendor: 'YouTube', purpose: 'marketing', tier: 'moderate', description: 'YouTube embed: tracks videos you watch for recommendations and ads.' },

  // ---- Strictly necessary (Whatever) ----
  { match: /^(OptanonConsent|OptanonAlertBoxClosed|eupubconsent-v2|euconsent-v2|CookieConsent|cookieyes-consent|cmplz_.*|didomi_token|usprivacy|_iub_cs-.*|uc_settings|osano_consentmanager.*|notice_preferences|notice_gdpr_prefs|cookieconsent_status)$/, vendor: 'Consent manager', purpose: 'necessary', tier: 'whatever', description: 'Stores your cookie choices (so the banner stays closed).' },
  { match: /^(__cf_bm|cf_clearance|_cfuvid|__cflb)$/, vendor: 'Cloudflare', purpose: 'necessary', tier: 'whatever', description: 'Bot protection and load balancing.' },
  { match: /^(AWSALB|AWSALBCORS|AWSELB|AWSALBTG.*)$/, vendor: 'Amazon Web Services', purpose: 'necessary', tier: 'whatever', description: 'Load balancer: keeps you on the same server.' },
  { match: /^(JSESSIONID|PHPSESSID|ASP\.NET_SessionId|connect\.sid|laravel_session|_session_id|sessionid|SESSION|sid)$/i, vendor: 'Site', purpose: 'necessary', tier: 'whatever', description: 'Your session: keeps you logged in / remembers your visit.' },
  { match: /^(csrftoken|XSRF-TOKEN|_csrf|csrf_token|__RequestVerificationToken.*)$/i, vendor: 'Site', purpose: 'necessary', tier: 'whatever', description: 'Security token that protects your forms from attacks.' },
  { match: /^(__stripe_mid|__stripe_sid)$/, vendor: 'Stripe', purpose: 'necessary', tier: 'whatever', description: 'Payment fraud prevention.' },
  { match: /^(_GRECAPTCHA|rc::[abcd])$/, vendor: 'Google reCAPTCHA', purpose: 'necessary', tier: 'whatever', description: 'Bot detection for forms and logins.' },
];

// Pure ad-tech / tracking domains: nobody visits these directly, so their cookies are
// always trackers. Subset of DuckDuckGo Tracker Radar / Disconnect lists.
export const AD_TECH_DOMAINS = new Set([
  'doubleclick.net', 'googlesyndication.com', 'googleadservices.com', 'google-analytics.com',
  'facebook.net', 'adnxs.com', 'adsrvr.org', 'criteo.com', 'criteo.net', 'taboola.com',
  'outbrain.com', 'rlcdn.com', 'liveramp.com', 'pubmatic.com', 'rubiconproject.com', 'openx.net',
  'casalemedia.com', 'indexww.com', 'bidswitch.net', 'smartadserver.com', 'scorecardresearch.com',
  'quantserve.com', 'demdex.net', 'everesttech.net', 'omtrdc.net', 'ads-twitter.com',
  'sc-static.net', 'advertising.com', 'adform.net', 'mathtag.com', 'turn.com', 'agkn.com',
  'bluekai.com', 'krxd.net', 'exelator.com', 'eyeota.net', 'tapad.com', 'crwdcntrl.net',
  'id5-sync.com', 'sharethrough.com', '3lift.com', 'yieldmo.com', 'teads.tv', 'media.net',
  'amazon-adsystem.com', 'moatads.com', 'doubleverify.com', 'adsafeprotected.com', 'hotjar.com',
  'clarity.ms', 'fullstory.com', 'mouseflow.com', 'smartlook.com', 'zemanta.com', 'contextweb.com',
  'sonobi.com', 'gumgum.com', 'lijit.com', 'sovrn.com', 'kargo.com', 'onetag-sys.com',
  'stackadapt.com', 'adroll.com', 'perfectaudience.com', 'hs-analytics.net', 'hubspot.com',
]);

// Platforms people also use directly. Their cookies only count as trackers when they
// show up as a third party on someone else's site (that's how the "Like" button tracks you).
export const DUAL_USE_DOMAINS = new Set([
  'facebook.com', 'instagram.com', 'tiktok.com', 'linkedin.com', 'twitter.com', 'x.com',
  'pinterest.com', 'snapchat.com', 'reddit.com', 'yahoo.com', 'bing.com', 'yandex.ru',
  'google.com', 'youtube.com', 'amazon.com', 'microsoft.com',
]);

export const PRIVACY_FRIENDLY_ANALYTICS = /^(_pk_|plausible|_fathom|simple_analytics|umami)/i;

export const NECESSARY_HINT =
  /(sess|^sid$|csrf|xsrf|auth|token|login|^__host-|^__secure-|cart|basket|checkout|consent|loadbalanc|^lb_|^route$|captcha|^cf_|^__cf)/i;
export const FUNCTIONAL_HINT = /(lang|locale|theme|pref|currency|region|timezone|font|volume|dismiss|seen|banner_closed)/i;
export const ANALYTICS_HINT = /(analytic|_ga|stat|track|visitor|_id$|^_?uid$|metric|ab_?test|experiment)/i;
export const MARKETING_HINT = /(^ad|ads|_ad_|pixel|campaign|utm|retarget|affiliate|promo|sync)/i;

export function lookupCookie(name: string, site: string): KnownCookie | undefined {
  return KNOWN_COOKIES.find((k) => k.match.test(name) && (!k.domains || k.domains.includes(site)));
}
