# 🛡 CookieWise

A Chrome extension that reads a site's privacy policy and terms **before you click "Accept"**, tells you in plain language what data you're giving away (strictly necessary vs. optional), and lets you manage cookies ranked by how alarming they are:

| Tier | Meaning |
|---|---|
| 🔴 Dangerous | Follows you across sites, ad profiles, data brokers |
| 🟠 Moderate | Tracks you on this site with a persistent ID, session recording |
| 🟢 Okay | Preferences (language, theme), no profiling |
| ⚪ Whatever | Strictly necessary: login, cart, security, consent |

See [PLAN.md](PLAN.md) for the full design.

## Run it

```bash
npm install
npm run build
```

Then in Chrome: `chrome://extensions` → enable **Developer mode** → **Load unpacked** → pick `.output/chrome-mv3`.

For development with hot reload: `npm run dev` (opens a Chrome instance with the extension loaded).

### Set up the AI
Open **Dashboard & settings**: click the CookieWise toolbar icon → **Dashboard & settings** (or right-click the icon → **Options**). Under **AI settings**, pick one:
- **Your own Claude API key**, from [console.anthropic.com](https://console.anthropic.com/settings/keys). Default model: Opus 5.5, with Sonnet 5.5 as a cheaper option.
- **Your own Google Gemini API key**, from [aistudio.google.com/apikey](https://aistudio.google.com/apikey). Default model: Gemini 3.8 Flash. Flash-Lite and 3.1 Pro (preview) are also available.
- **A deployed CookieWise proxy** (see below). It uses Claude on the server.

Keys are stored only in the browser and sent only to that provider. Every provider gets the same prompt and the same output format. Without a key, everything except the AI summary still works.

## Features
- **Banner detection** for OneTrust, Cookiebot, Didomi, Quantcast, TrustArc, Usercentrics, Osano, CookieYes, Complianz, Iubenda, Klaro, plus a heuristic fallback.
- **"Read what you're agreeing to"** button next to the banner. It shows the tracking cookies set *before* you chose anything, and an AI summary with a privacy grade (A–F), red flags with verbatim quotes (each quote is checked against the source), what's necessary, what's optional, third parties, retention and your rights.
- **Accept only necessary** clicks the banner's reject or "necessary only" button, or opens settings and turns every toggle off. Afterwards it checks whether tracking cookies were set anyway and offers to delete them.
- **Popup**: cookies on the current page, grouped by tier, with a "why this tier" reason for each, bulk remove ("Remove all 🔴", "Keep only ⚪"), undo, always-block, manual re-tiering, and trust site.
- **Dashboard**: every site in the browser ranked by tracking, plus bulk cleanup.
- **Automation**: auto-delete 🔴 cookies the moment they're set, and delete 🔴 + 🟠 cookies when a site's last tab closes.
- **Toolbar badge**: the number of 🔴 cookies on the current tab.

## Tests
```bash
npm test          # unit tests: risk scorer, domains, quote verification, Gemini request/response
npm run compile   # typecheck
npm run build && npm run e2e   # loads the extension in Edge against a local fake site (no API calls)
```
The e2e test uses Microsoft Edge (Chrome 137+ no longer allows `--load-extension`). Override with `E2E_CHANNEL=chromium` if you have Playwright's Chromium installed. Add `E2E_HEADED=1` to watch it run.

## Proxy (optional)
`proxy/` is a Cloudflare Worker that keeps the API key on the server and caches summaries by policy hash, so each policy version is summarized once for every user.
```bash
cd proxy && npm install
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler deploy
```
Then choose "CookieWise proxy server" in settings and paste the Worker URL.

## Privacy
Only the public policy text and the site name are sent to the AI. Cookie values, browsing history and page contents never leave the browser.
