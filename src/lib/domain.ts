// Small public-suffix approximation: good enough to group cookies by site
// without shipping the full Public Suffix List.
const MULTI_PART_SUFFIXES = new Set([
  'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'me.uk', 'com.au', 'net.au', 'org.au', 'edu.au',
  'co.jp', 'ne.jp', 'or.jp', 'co.nz', 'org.nz', 'com.br', 'com.mx', 'com.ar', 'co.in',
  'co.kr', 'com.cn', 'com.tr', 'co.za', 'com.sg', 'com.hk', 'com.tw', 'co.il', 'com.my',
  'github.io', 'vercel.app', 'netlify.app', 'herokuapp.com', 'pages.dev', 'blogspot.com',
  'web.app', 'firebaseapp.com', 'azurewebsites.net', 'cloudfront.net', 'appspot.com',
]);

export function stripDot(domain: string): string {
  return domain.replace(/^\./, '').toLowerCase();
}

export function registrableDomain(hostOrDomain: string): string {
  const host = stripDot(hostOrDomain);
  if (/^[\d.]+$/.test(host) || host.includes(':') || !host.includes('.')) return host;
  const parts = host.split('.');
  const lastTwo = parts.slice(-2).join('.');
  if (parts.length > 2 && MULTI_PART_SUFFIXES.has(lastTwo)) return parts.slice(-3).join('.');
  return lastTwo;
}

export function siteOfUrl(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return registrableDomain(u.hostname);
  } catch {
    return null;
  }
}

/** True if the cookie domain belongs to a different site than `site`. */
export function isThirdPartyDomain(cookieDomain: string, site: string): boolean {
  return registrableDomain(cookieDomain) !== site;
}

export function cookieUrl(c: { domain: string; path: string; secure: boolean }): string {
  return `${c.secure ? 'https' : 'http'}://${stripDot(c.domain)}${c.path || '/'}`;
}
