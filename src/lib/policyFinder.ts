import type { PolicyLink } from './types';

const PATTERNS: { kind: PolicyLink['kind']; re: RegExp }[] = [
  { kind: 'cookies', re: /cookie(s)?[\s-]*(policy|notice|statement|richtlinie)|politique.*cookies|pol[ií]tica de cookies/i },
  { kind: 'privacy', re: /privacy|data protection|datenschutz|confidentialit[eé]|privacidad|privacidade|informativa/i },
  { kind: 'terms', re: /terms|conditions|terms of (use|service)|user agreement|legal|nutzungsbedingungen|agb|conditions g[eé]n[eé]rales|t[eé]rminos/i },
];

/** Finds privacy / terms / cookie policy links, preferring links inside the banner, then the footer. */
export function findPolicyLinks(doc: Document = document, banner?: Element | null): PolicyLink[] {
  const scopes: ParentNode[] = [banner, doc.querySelector('footer'), doc].filter(Boolean) as ParentNode[];
  const found = new Map<PolicyLink['kind'], string>();

  for (const scope of scopes) {
    for (const a of scope.querySelectorAll<HTMLAnchorElement>('a[href]')) {
      const href = a.href;
      if (!/^https?:/.test(href)) continue;
      const text = `${a.textContent ?? ''} ${a.getAttribute('aria-label') ?? ''}`.trim();
      const path = new URL(href).pathname;
      for (const { kind, re } of PATTERNS) {
        if (found.has(kind)) continue;
        if (re.test(text) || re.test(path)) {
          found.set(kind, href.split('#')[0] ?? href);
          break;
        }
      }
    }
    if (found.size === PATTERNS.length) break;
  }
  return [...found].map(([kind, url]) => ({ kind, url }));
}
