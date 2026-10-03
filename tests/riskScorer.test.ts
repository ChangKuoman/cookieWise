import { describe, expect, it } from 'vitest';
import { looksLikeUniqueId, scoreCookie, type RawCookie } from '@/lib/riskScorer';

const NOW = Date.UTC(2026, 9, 2) ;
const inDays = (d: number) => (NOW + d * 86_400_000) / 1000;
const cookie = (over: Partial<RawCookie>): RawCookie => ({
  name: 'x',
  domain: '.example.com',
  value: 'abc',
  session: false,
  expirationDate: inDays(30),
  sameSite: 'lax',
  ...over,
});
const score = (c: Partial<RawCookie>, ctx: Parameters<typeof scoreCookie>[1] = {}) =>
  scoreCookie(cookie(c), { site: 'example.com', now: NOW, ...ctx });

describe('scoreCookie tiers', () => {
  it('Meta pixel _fbp is dangerous', () => {
    expect(score({ name: '_fbp', value: 'fb.1.1696240000000.1234567890' }).tier).toBe('dangerous');
  });

  it('DoubleClick IDE on a third-party tracker domain is dangerous', () => {
    const r = score({ name: 'IDE', domain: '.doubleclick.net', sameSite: 'no_restriction', expirationDate: inDays(390), value: 'AHWqTUk3x9sPq0f2LmZ7Rb' });
    expect(r.tier).toBe('dangerous');
    expect(r.thirdParty).toBe(true);
    expect(r.vendor).toMatch(/DoubleClick/);
  });

  it('Google Analytics _ga is moderate', () => {
    const r = score({ name: '_ga', value: 'GA1.1.1234567890.1696240000', expirationDate: inDays(400) });
    expect(r.tier).toBe('moderate');
    expect(r.purpose).toBe('analytics');
  });

  it('Hotjar session recording is moderate', () => {
    expect(score({ name: '_hjSessionUser_123456' }).tier).toBe('moderate');
  });

  it('language preference is okay', () => {
    expect(score({ name: 'lang', value: 'en' }).tier).toBe('okay');
  });

  it('session and CSRF cookies are whatever', () => {
    expect(score({ name: 'PHPSESSID', session: true, value: 'k3j4h5g6f7d8s9a0q1w2e3r4' }).tier).toBe('whatever');
    expect(score({ name: 'csrftoken', expirationDate: inDays(365 * 2), value: 'Zx8Kq2Lm9Np4Rt6Vw1Yb3Cd5Fg7Hj0' }).tier).toBe('whatever');
    expect(score({ name: 'OptanonConsent' }).tier).toBe('whatever');
  });

  it('generic names only match vendors on their own domain', () => {
    // "id" on a normal site is not DoubleClick.
    expect(score({ name: 'id', value: '42' }).vendor).toBeUndefined();
    expect(score({ name: 'id', domain: '.doubleclick.net' }).tier).toBe('dangerous');
  });

  it('unknown third-party cookie with a unique ID is at least moderate', () => {
    const r = score({ name: 'zz_visitor', domain: '.someadtech.io', sameSite: 'no_restriction', value: 'f81d4fae7dec11d0a76500a0c91e6bf6', expirationDate: inDays(500) });
    expect(['moderate', 'dangerous']).toContain(r.tier);
  });

  it('policy saying data is sold raises non-necessary cookies but never necessary ones', () => {
    const base = score({ name: 'zz_qx', value: 'f81d4fae7dec11d0a76500a0c91e6bf6' });
    const sold = score({ name: 'zz_qx', value: 'f81d4fae7dec11d0a76500a0c91e6bf6' }, { policySellsData: true });
    expect(sold.points).toBeGreaterThan(base.points);
    expect(score({ name: 'PHPSESSID', session: true }, { policySellsData: true }).tier).toBe('whatever');
  });

  it('platform login cookies are not dangerous on the platform itself', () => {
    const login = { name: 'c_user', domain: '.facebook.com', value: '100012345678901', expirationDate: inDays(365) };
    expect(score(login, { site: 'facebook.com' }).tier).not.toBe('dangerous');
    expect(scoreCookie(cookie(login), { now: NOW }).tier).not.toBe('dangerous'); // auto-block context
    const seenFromShop = score(login, { site: 'shop.com' });
    expect(seenFromShop.tier).toBe('dangerous');
    expect(seenFromShop.reasons.join(' ')).toMatch(/log you out of facebook\.com/);
  });

  it('curated ad cookies on a platform are moderate first-party, dangerous elsewhere', () => {
    const fr = { name: 'fr', domain: '.facebook.com', value: '0aBcDeFgHiJkLmNoP.QrStUv' };
    expect(score(fr, { site: 'facebook.com' }).tier).toBe('moderate');
    expect(score(fr, { site: 'shop.com' }).tier).toBe('dangerous');
  });

  it('user override always wins', () => {
    const r = score({ name: '_fbp' }, { override: 'okay' });
    expect(r.tier).toBe('okay');
    expect(r.overridden).toBe(true);
  });
});

describe('looksLikeUniqueId', () => {
  it('detects random IDs, ignores short or repetitive values', () => {
    expect(looksLikeUniqueId('f81d4fae7dec11d0a76500a0c91e6bf6')).toBe(true);
    expect(looksLikeUniqueId('en')).toBe(false);
    expect(looksLikeUniqueId('aaaaaaaaaaaaaaaaaaaa')).toBe(false);
  });
});
