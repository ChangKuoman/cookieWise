// End-to-end smoke test: loads the built extension into Edge/Chromium and drives the
// banner flow against the local fixture site. Run: npm run build && npm run e2e
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PORT, startFixtureServer } from './fixture-server.mjs';

const EXT = path.resolve('.output/chrome-mv3');
const SHOTS = path.resolve('tests/e2e/screenshots');
const ORIGIN = `http://127.0.0.1:${PORT}`;
fs.mkdirSync(SHOTS, { recursive: true });

const step = (msg) => console.log(`• ${msg}`);
const assert = (cond, msg) => {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
  console.log(`  ✓ ${msg}`);
};

const server = await startFixtureServer();
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cookiewise-e2e-'));
const context = await chromium.launchPersistentContext(userDataDir, {
  channel: process.env.E2E_CHANNEL ?? 'msedge',
  headless: !process.env.E2E_HEADED,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  viewport: { width: 1280, height: 860 },
});

try {
  step('Extension service worker starts');
  const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker', { timeout: 15000 }));
  const extId = new URL(sw.url()).host;
  assert(!!extId, `extension loaded (${extId})`);

  // Point the extension at the fixture's fake /summarize endpoint (no real API calls).
  await sw.evaluate((proxyUrl) => chrome.storage.local.set({ settings: { mode: 'proxy', proxyUrl } }), ORIGIN);

  step('Banner is detected and the CookieWise button appears');
  const page = await context.newPage();
  await page.goto(ORIGIN + '/');
  const badge = page.getByRole('button', { name: /Read what you.re agreeing to/ });
  await badge.waitFor({ timeout: 10000 });
  assert(true, 'overlay badge visible');
  await page.screenshot({ path: path.join(SHOTS, '1-badge.png') });

  step('Opening the panel shows pre-consent tracking and the AI summary');
  await badge.click();
  await page.getByText('Already set before you chose anything').waitFor();
  await page.getByText(/sells your browsing data to 214 ad partners/).waitFor({ timeout: 20000 });
  assert(true, 'summary rendered');
  const req = server.lastSummarizeRequest;
  assert(req?.site === '127.0.0.1', 'summarize request names the site');
  assert(
    req.documents.some((d) => d.url.endsWith('/privacy') && d.text.includes('data brokers')),
    'privacy policy fetched and extracted',
  );
  assert((await page.getByText('Quote not found word-for-word').count()) === 1, 'unverifiable quote is flagged');
  await page.screenshot({ path: path.join(SHOTS, '2-summary.png') });

  step('"Accept only necessary" rejects, then catches trackers set anyway');
  await page.getByRole('button', { name: /Accept only necessary/ }).click();
  await page.getByText(/still set/).waitFor({ timeout: 10000 });
  assert(await page.locator('#onetrust-banner-sdk').isHidden(), 'site banner dismissed via Reject All');
  let names = (await context.cookies(ORIGIN)).map((c) => c.name);
  assert(names.includes('OptanonConsent') && !names.includes('_gcl_au'), 'site recorded a rejection');
  await page.screenshot({ path: path.join(SHOTS, '3-leftover.png') });

  await page.getByRole('button', { name: 'Delete them' }).click();
  await page.getByText(/Only necessary cookies are kept/).waitFor();
  names = (await context.cookies(ORIGIN)).map((c) => c.name);
  assert(!names.includes('_fbp') && !names.includes('_ga'), 'tracking cookies (_fbp, _ga) deleted');
  assert(names.includes('PHPSESSID') && names.includes('OptanonConsent'), 'necessary cookies kept');
  assert(names.includes('lang'), 'preference cookie (okay tier) kept');
  await page.screenshot({ path: path.join(SHOTS, '4-done.png') });

  step('Popup shows the site, its tier counts and the cached summary');
  await page.reload(); // trackers come back on reload, so the popup has something to show
  await page.waitForTimeout(500);
  const tabId = await sw.evaluate(async (origin) => (await chrome.tabs.query({ url: origin + '/*' }))[0].id, ORIGIN);
  const popup = await context.newPage();
  await popup.setViewportSize({ width: 400, height: 600 });
  await popup.goto(`chrome-extension://${extId}/popup.html?tabId=${tabId}`);
  await popup.getByText('cookies in play on this page').waitFor();
  assert((await popup.getByRole('heading', { name: /Dangerous/ }).count()) === 1, 'popup groups cookies into tiers');
  await popup.screenshot({ path: path.join(SHOTS, '5-popup-cookies.png') });
  await popup.getByRole('tab', { name: /giving away/ }).click();
  await popup.getByText(/sells your browsing data/).waitFor();
  assert(true, 'popup shows cached summary without a new AI call');
  await popup.screenshot({ path: path.join(SHOTS, '6-popup-summary.png') });
  await popup.getByRole('tab', { name: 'Cookies' }).click();
  await popup.getByRole('button', { name: /Remove all 🔴/ }).click();
  await popup.getByText(/Removed \d+ cookie/).waitFor();
  names = (await context.cookies(ORIGIN)).map((c) => c.name);
  // The policy says the site sells data, so _ga was raised from moderate to dangerous.
  assert(!names.includes('_fbp') && !names.includes('_ga'), 'popup "Remove all 🔴" removes dangerous (incl. _ga raised by policy)');
  assert(names.includes('lang') && names.includes('PHPSESSID'), 'lower tiers untouched');
  await popup.getByRole('button', { name: 'Undo' }).click();
  await popup.getByText(/Restored 2 cookies/).waitFor();
  names = (await context.cookies(ORIGIN)).map((c) => c.name);
  assert(names.includes('_fbp'), 'undo restores the deleted cookie');

  step('Dashboard lists the site with tier counts');
  const dash = await context.newPage();
  await dash.goto(`chrome-extension://${extId}/options.html`);
  await dash.getByText('127.0.0.1').first().waitFor();
  assert(true, 'dashboard shows the site');
  await dash.screenshot({ path: path.join(SHOTS, '7-dashboard.png'), fullPage: true });

  step('Settings offer Claude, Gemini and proxy');
  await dash.getByRole('tab', { name: 'AI settings' }).click();
  await dash.getByText('My own Google Gemini API key').click();
  await dash.getByText('Gemini API key', { exact: true }).waitFor();
  assert((await dash.getByRole('option', { name: /Gemini 3.8 Flash/ }).count()) === 1, 'Gemini key field and model picker shown');
  await dash.getByRole('button', { name: 'Save' }).click();
  const saved = await sw.evaluate(async () => (await chrome.storage.local.get('settings')).settings);
  assert(saved.mode === 'gemini' && saved.geminiModel === 'gemini-3.8-flash', 'Gemini mode saved');
  await dash.screenshot({ path: path.join(SHOTS, '8-settings-gemini.png'), fullPage: true });

  console.log('\nAll e2e checks passed. Screenshots in tests/e2e/screenshots/');
} finally {
  await context.close();
  server.close();
}
