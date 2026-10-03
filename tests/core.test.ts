import { describe, expect, it } from 'vitest';
import { isThirdPartyDomain, registrableDomain } from '@/lib/domain';
import type { PolicySummary } from '@/lib/schema';
import { MAX_POLICY_CHARS, prepareDocuments, verifyQuotes } from '@/lib/policyPrompt';

describe('registrableDomain', () => {
  it('handles subdomains and multi-part suffixes', () => {
    expect(registrableDomain('.www.example.com')).toBe('example.com');
    expect(registrableDomain('shop.bbc.co.uk')).toBe('bbc.co.uk');
    expect(registrableDomain('localhost')).toBe('localhost');
    expect(isThirdPartyDomain('.doubleclick.net', 'example.com')).toBe(true);
    expect(isThirdPartyDomain('.cdn.example.com', 'example.com')).toBe(false);
  });
});

describe('prepareDocuments', () => {
  it('wraps documents and flags truncation', () => {
    const small = prepareDocuments([{ kind: 'privacy', url: 'https://a.com/privacy', text: 'hello' }]);
    expect(small.truncated).toBe(false);
    expect(small.body).toContain('<policy_document kind="privacy"');
    const big = prepareDocuments([{ kind: 'privacy', url: 'u', text: 'x'.repeat(MAX_POLICY_CHARS + 10) }]);
    expect(big.truncated).toBe(true);
  });
});

describe('verifyQuotes', () => {
  it('matches quotes ignoring case, whitespace and curly quotes', () => {
    const summary = {
      redFlags: [
        { flag: 'Sells data', severity: 'high', quote: '“We may SELL your   personal information”' },
        { flag: 'Made up', severity: 'high', quote: 'We read your mind' },
      ],
    } as unknown as PolicySummary;
    const docs = [{ kind: 'privacy', url: 'u', text: 'Notice: "We may sell your personal\ninformation" to partners.' }];
    expect(verifyQuotes(summary, docs)).toEqual([true, false]);
  });
});
