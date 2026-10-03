# CookieWise: AI Cookie & Privacy Manager (Chrome Extension)

**One-liner:** Before you click "Accept", CookieWise reads the site's Terms of Service, Privacy Policy, and Cookie Policy. It tells you in plain language what data you're giving away, with the **strictly necessary** data shown separately from the optional data. You can then manage or delete the site's cookies from the extension.

---

## 1. Core User Flows

### Flow A: "Read before you accept"
1. The user visits a site and a cookie banner appears.
2. The content script detects the banner and adds a small floating badge next to it: **"🛡 Read what you're agreeing to"**.
3. In the background, the extension finds the site's Privacy, Terms, and Cookie policy links, fetches the pages, and extracts their text.
4. The AI returns a structured summary:
   - **Strictly necessary:** the data the service *needs* to work (session, login, security, load balancing, cart).
   - **Optional:** analytics, personalization, advertising, cross-site tracking.
   - **Who gets it:** third parties and data brokers, and whether the data is sold or shared.
   - **How long they keep it:** retention periods.
   - **Your rights:** opt-out, deletion, GDPR/CCPA contacts.
   - **🚩 Red flags:** e.g. "sells data", "shares with law enforcement without warrant", "biometric data", "can change terms without notice", "arbitration clause".
   - **Privacy score:** A–F, with a short reason.
   - **Risk breakdown:** the cookies this site has *already set before you chose anything*, counted per tier, e.g. "Already set: 🔴 3 🟠 2". This exposes tracking before consent. The summary's third-party list shows each partner's tier.
5. The user picks one of three actions:
   - **Accept only necessary:** the extension tries to click the banner's "Reject all" or "Necessary only" button.
   - **Accept all:** the extension clicks the banner's "Accept all" button.
   - **Decide myself:** the extension closes the panel and the user handles the banner.

### Flow B: Cookie manager (popup)
- Opening the popup on any tab shows the current site's cookies, grouped by **how alarming they are** (see §3.6 Risk Tiers):
  - 🔴 **Dangerous**
  - 🟠 **Moderate**
  - 🟢 **Okay**
  - ⚪ **Whatever**
- The header shows a summary like "3 🔴 · 5 🟠 · 4 🟢 · 6 ⚪".
- Each cookie shows:
  - Its name and domain
  - Whether it's first- or third-party
  - When it expires
  - What it's for, as a purpose label (Necessary, Functional, Analytics, or Marketing)
  - A **one-line "why this tier"** reason, e.g. "Tracks you across 1,000+ sites for ads, lasts 2 years"
- Actions:
  - Delete one cookie
  - Delete a whole tier: **"Remove all 🔴 Dangerous"**, or "Remove 🔴 + 🟠"
  - Delete everything except ⚪ Whatever, which keeps you logged in
  - **Always block** a cookie or domain, so it's deleted automatically whenever it's set again
  - **Trust this site** (whitelist)
- The cached AI summary for the site is one tab away.

### Flow C: Dashboard (options page)
- Shows every site that has cookies, sorted by tracker count or privacy score.
- Lets the user search, filter, and bulk-delete.
- Auto-clean rules:
  - "Always auto-delete 🔴 Dangerous cookies the moment they're set"
  - "Delete 🟠 Moderate cookies when I close the tab"
  - "Delete non-necessary cookies when I close the tab"
  - "Delete everything for sites I haven't visited in 30 days"
- Settings: AI provider and API key, auto-reject mode, summary language.

---

## 2. Architecture (Manifest V3)

```
┌──────────────────┐   messages   ┌─────────────────────────┐   fetch   ┌──────────────┐
│ Content Script   │ ───────────► │ Background Service      │ ────────► │ Policy pages │
│ - banner detect  │ ◄─────────── │ Worker                  │           └──────────────┘
│ - policy links   │              │ - policy fetch/cache    │   API     ┌──────────────┐
│ - overlay UI     │              │ - AI orchestration      │ ────────► │ AI (Claude)  │
│ - click reject   │              │ - cookie rules engine   │           │ via proxy    │
└──────────────────┘              │ - chrome.cookies.*      │           └──────────────┘
                                  └───────────┬─────────────┘
         ┌───────────────┐                    │            ┌──────────────────────┐
         │ Popup (React) │ ◄──────────────────┼──────────► │ Offscreen document   │
         │ Options page  │                    │            │ (DOMParser/Readability│
         └───────────────┘                    ▼            │  for HTML→text)      │
                                    chrome.storage.local   └──────────────────────┘
                                    (summaries, rules, cookie DB)
```

### Permissions (`manifest.json`)
```json
{
  "manifest_version": 3,
  "permissions": ["cookies", "storage", "tabs", "scripting", "offscreen", "alarms", "browsingData"],
  "host_permissions": ["<all_urls>"],
  "background": { "service_worker": "background.js", "type": "module" },
  "content_scripts": [{ "matches": ["<all_urls>"], "js": ["content.js"], "run_at": "document_idle" }],
  "action": { "default_popup": "popup.html" },
  "options_page": "options.html"
}
```
The extension needs `<all_urls>` to read cookies from every domain and to fetch policy pages. The Chrome Web Store listing must explain why.

### Tech stack
- **WXT** (or Vite + CRXJS) with **TypeScript**. Either gives hot-reload during extension development.
- **React + Tailwind** for the popup and options page. The in-page overlay renders inside a **Shadow DOM** so the site's CSS can't break it.
- **@mozilla/readability** to turn policy HTML into clean text. It runs in the offscreen document because service workers have no DOM.
- **Open Cookie Database** (open source CSV, about 2k known cookies) for categorizing cookies by name.
- **Zod** to validate the AI's JSON output.

---

## 3. Key Modules

### 3.1 Banner detection (`content/bannerDetector.ts`)
Detection runs in this order:
1. **Known consent tools (CMPs):** OneTrust (`#onetrust-banner-sdk`), Cookiebot (`#CybotCookiebotDialog`), Didomi, Quantcast, TrustArc, Usercentrics, Osano, and others.
2. **IAB TCF API:** if `window.__tcfapi` exists, the site uses a TCF consent tool. The extension can read its vendor list, and possibly set consent through the API.
3. **Heuristic fallback:** look for fixed or sticky elements near the top or bottom of the page whose text matches `/cookie|consent|gdpr|privacy/i` and that contain buttons like "accept" or "agree".
4. Use a `MutationObserver` because many banners load late.

Each detector returns `{ element, acceptBtn, rejectBtn, settingsBtn }`.

### 3.2 Policy discovery (`content/policyFinder.ts` + background)
1. Scan `<a>` tags, starting with the banner itself and then the footer, for text or URLs matching privacy, terms, cookie policy, legal, or data protection.
2. If nothing is found, try common paths: `/privacy`, `/privacy-policy`, `/terms`, `/legal`, `/cookie-policy`.
3. The background worker fetches the pages, and Readability in the offscreen document extracts the text.
4. Hash the text (SHA-256) and cache the summary by `domain + hash`. If the policy hasn't changed, the AI isn't called again, and the user can be told when a policy *has* changed.

### 3.3 AI summarizer (`background/summarizer.ts`)
- **Model:** `claude-opus-5-5` at `low` effort by default, configurable to `claude-sonnet-5-5` and to `medium` or `high` effort. Uses structured outputs with a Zod schema and server-side refusal fallbacks (`fallbacks: "default"`).
- **Long policies:** Readability extracts the main text. Opus has a 1M-token context, so up to ~600k characters are sent in a single call. Anything longer is cut off, and the UI tells the user (no silent truncation).
- **Output:** strict JSON validated with Zod, using this schema:

```ts
type PolicySummary = {
  site: string;
  score: "A" | "B" | "C" | "D" | "F";
  scoreReason: string;
  strictlyNecessary: { data: string; purpose: string; quote?: string }[];
  optional: { data: string; purpose: string; category: "analytics"|"personalization"|"advertising"|"other";
              risk: "dangerous"|"moderate"|"okay"|"whatever" }[];
  thirdParties: { name: string; purpose: string; sells: boolean; risk: "dangerous"|"moderate"|"okay"|"whatever" }[];
  sellsData: boolean;            // feeds the cookie risk scorer
  partnerCount?: number;
  retention: string;
  yourRights: string[];
  redFlags: { flag: string; severity: "low"|"med"|"high"; quote: string }[];
  tldr: string; // 2 sentences max
};
```
- **Grounding:** every red flag must include a *direct quote* from the policy so the user can verify it. This guards against hallucinations. Show the quotes on hover.
- **Prompt rules:** the system prompt tells the model to treat the policy text as untrusted data and never follow instructions found inside it. This protects against prompt injection hidden in policy pages.

### 3.4 Where the API key lives
| Option | Pros | Cons |
|---|---|---|
| **A. User brings their own key** (stored in `chrome.storage.local`) | No backend, no cost to you | Friction for users, and the key sits on the device |
| **B. Small backend proxy** (Cloudflare Worker / Vercel) | Key stays secret, server-side cache shared by all users (each popular site is summarized once) | You pay for usage and must add rate limiting |

**Recommendation:** build the hackathon demo with **B**, and add per-site caching on the server. Popular sites like google.com and amazon.com then cost almost nothing. Add A as an advanced setting later.

**Privacy promise:** only *public policy text* and the domain are sent to the AI. Cookie values and browsing history are never sent.

### 3.5 Cookie engine (`background/cookieEngine.ts`)
- **Reading cookies:** `chrome.cookies.getAll({ domain })` returns a site's cookies. Partitioned (CHIPS) cookies need the `partitionKey` option. To list third-party cookies set while visiting the current site, combine the tab's frames and requests with `getAll` per domain.
- **Categorizing:** each cookie is classified in this order:
  1. The CMP's own declared category, if available (OneTrust and Cookiebot expose these).
  2. Open Cookie Database lookup by name, e.g. `_ga` → Analytics, `_fbp` → Marketing.
  3. Heuristics: names containing `sess`, `csrf`, `auth`, or `xsrf` → Necessary; known ad domains → Marketing.
  4. Otherwise → Unknown.
  5. Feed the purpose into the **risk scorer (§3.6)** to get the tier the UI displays: 🔴 Dangerous, 🟠 Moderate, 🟢 Okay, or ⚪ Whatever.
- **Deleting:** `chrome.cookies.remove({ url, name, storeId })`. Build the URL from `secure`, `domain`, and `path`.
- **Block rules:** listen to `chrome.cookies.onChanged`. If a newly set cookie matches a block rule, remove it immediately.
- **Auto-clean:** use `chrome.tabs.onRemoved` (when a tab closes) and `chrome.alarms` (scheduled sweeps).
- **Beyond cookies (optional):** `chrome.browsingData.remove({ origins:[...] }, { localStorage, indexedDB, cacheStorage })`. Trackers also store data outside cookies.

### 3.6 Risk Tiers: "How alarming is this cookie?" (`lib/riskScorer.ts`)
The purpose label (Necessary, Analytics, and so on) says *what* a cookie does. The risk tier says **how much the user should care**. The UI groups, colors, and bulk-deletes by risk tier.

| Tier | Meaning for the user | Typical examples | Default action |
|---|---|---|---|
| 🔴 **Dangerous** | Follows you **across sites**, builds an ad profile, or feeds data brokers. Your data leaves this site. | `_fbp`, `IDE` / `test_cookie` (Google DoubleClick), `fr` (Facebook), `uuid2` (AppNexus), `_ttp` (TikTok), Criteo, Taboola, LiveRamp/data-broker IDs, cross-site fingerprinting | Recommend **Reject**. One click deletes them, and the user can opt in to auto-block |
| 🟠 **Moderate** | Tracks your behavior **on this site** with a persistent ID, or shares with a few named third parties. Not cross-site, but still profiling. | `_ga` / `_gid` (Google Analytics), Hotjar `_hjSessionUser` (session recording!), Mixpanel, A/B testing IDs, personalization/recommendation IDs | Recommend **Reject** unless you trust the site |
| 🟢 **Okay** | Remembers your **preferences**. No profiling and no sharing. | Language, theme, region/currency, "dismissed this popup", video volume, privacy-friendly first-party analytics (Plausible, anonymized Matomo) | Accepting is fine |
| ⚪ **Whatever** | **Strictly necessary**: the site breaks without it. Harmless and short-lived. | Session ID, login/auth, CSRF/XSRF token, load balancer, shopping cart, the consent cookie itself, bot protection (`__cf_bm`) | Always keep. Never auto-deleted |

#### Scoring algorithm
The score comes from deterministic local rules plus signals from the AI policy summary. The per-cookie tier is computed **locally, without calling the AI**, so it's instant and free.

```ts
type RiskTier = "dangerous" | "moderate" | "okay" | "whatever";

function scoreCookie(c: chrome.cookies.Cookie, ctx: SiteContext): { tier: RiskTier; points: number; reasons: string[] } {
  let pts = BASE_BY_PURPOSE[purposeOf(c)];   // necessary 0, functional 15, analytics 40, marketing 70, unknown 30
  const reasons: string[] = [];

  if (isKnownAdTracker(c.domain))          { pts += 30; reasons.push("Known ad/tracking network"); }
  if (isThirdParty(c, ctx.tabUrl))         { pts += 20; reasons.push("Set by a different company than this site"); }
  if (c.sameSite === "no_restriction")     { pts += 10; reasons.push("Can be read on other websites"); }
  if (expiresInDays(c) > 365)              { pts += 15; reasons.push("Lasts over a year"); }
  else if (c.session)                      { pts -= 10; reasons.push("Deleted when you close the browser"); }
  if (looksLikeUniqueId(c.value))          { pts += 10; reasons.push("Contains a unique ID that identifies you"); } // entropy check, value never leaves device
  if (ctx.policy?.sellsData)               { pts += 15; reasons.push("Policy says data may be sold/shared"); }
  if (isSessionRecorder(c.name))           { pts += 20; reasons.push("Records your clicks and mouse movement"); }
  if (isPrivacyFriendlyAnalytics(c))       { pts -= 25; }

  const tier = pts >= 70 ? "dangerous" : pts >= 40 ? "moderate" : pts >= 15 ? "okay" : "whatever";
  return { tier, points: pts, reasons };
}
```

#### Data sources
- **Tracker domain lists:** **DuckDuckGo Tracker Radar** (open data) or the Disconnect.me list. These answer "is this domain an ad network or data broker?"
- **Cookie purposes:** the **Open Cookie Database**, extended with a hand-curated `riskOverrides.json` for the top ~200 cookies. That way popular cookies like `_fbp` or `IDE` are always correct, whatever the formula says.
- **AI policy summary:** provides site-level modifiers, such as "sells data", "shares with N partners", and "retention over 2 years". These can bump a cookie's tier up but never down below its local score, so the AI can't make a tracker look safe.

#### UX details
- **Explanations in plain language:** each reason is written for normal people. For example, "Lets Facebook know you visited this site even if you never clicked anything", not "3P cookie with SameSite=None".
- **Site grade:** shown in the popup header and the toolbar badge, combining the AI's policy grade with the cookie counts. One 🔴 is enough to cap the grade at C.
- **Toolbar badge:** shows the 🔴 count in red, e.g. a red "7".
- **Why can't this be deleted?** ⚪ Whatever cookies are greyed out with "Removing this will log you out / empty your cart" and require a confirm step.
- **User overrides:** the user can manually move a cookie to another tier. The override is remembered per cookie name and domain.

### 3.7 Auto-reject (`content/consentActions.ts`)
- For known CMPs, click the real "Reject all" or "Necessary only" button. Some banners hide it behind "Settings", so open settings and turn off every toggle except necessary.
- Reuse the open-source rule sets from **Consent-O-Matic** or **DuckDuckGo autoconsent**. Both are MIT/MPL-licensed, cover hundreds of CMPs, and save months of work.
- After clicking, re-read the cookies to confirm that tracking cookies weren't set anyway. If they were, show a warning ("⚠ This site set tracking cookies despite rejection") and delete them.

---

## 4. Folder Structure
```
cookiewise/
├── wxt.config.ts
├── src/
│   ├── entrypoints/
│   │   ├── background.ts
│   │   ├── content/        (bannerDetector, policyFinder, consentActions, overlay/)
│   │   ├── popup/          (React: SiteCookies, SummaryCard, CategoryGroup)
│   │   ├── options/        (React: Dashboard, Rules, Settings)
│   │   └── offscreen/      (readability extraction)
│   ├── lib/
│   │   ├── summarizer.ts   cookieEngine.ts  categorizer.ts  riskScorer.ts  storage.ts  messages.ts
│   │   └── schema.ts       (zod PolicySummary)
│   └── data/  (open-cookie-database.json, tracker-radar-domains.json, riskOverrides.json)
├── proxy/                  (Cloudflare Worker: /summarize with cache + rate limit)
└── tests/                  (vitest for categorizer/schema; playwright for fixtures of CMP banners)
```

---

## 5. Build Phases

> **Status (2026-10-02):** Phases 1 and 2 are built and tested. Most of Phase 3 is done: dashboard, block and trust rules, tier overrides, auto-block 🔴, auto-clean on tab close, undo. Remaining work: policy-change diffs, onboarding, and the Web Store listing.

### Phase 1: MVP (hackathon, about 1–2 days)
- [ ] Scaffold WXT, manifest, and popup.
- [ ] Risk scorer (§3.6) with `riskOverrides.json` for the top ~200 cookies and the Tracker Radar domain list.
- [ ] Popup lists the current site's cookies grouped by risk tier (🔴🟠🟢⚪), each with a plain-language reason. Supports delete one / delete tier / delete all except ⚪.
- [ ] Toolbar badge showing the 🔴 count.
- [ ] Policy finder, using link scanning only.
- [ ] Proxy that calls Claude and returns the `PolicySummary` JSON.
- [ ] Popup "Summary" tab with score, strictly necessary vs optional, and red flags with quotes.
- [ ] Cache summaries in `chrome.storage.local`.

### Phase 2: In-page experience
- [ ] Banner detection for the top 5 CMPs plus the heuristic fallback.
- [ ] Shadow-DOM overlay badge next to the banner, with the summary panel.
- [ ] "Accept necessary only" button, using autoconsent rules.
- [ ] Check that rejection was respected.

### Phase 3: Manager power features
- [ ] Options dashboard covering all sites.
- [ ] Block and whitelist rules, enforced through `cookies.onChanged`, including "auto-block all 🔴".
- [ ] User tier overrides.
- [ ] Auto-clean on tab close and on a schedule.
- [ ] Policy-change detection (the hash is already stored, but the diff UI isn't built): "Amazon updated its privacy policy, here's what changed" (diff the old and new summaries).

### Phase 4: Polish & ship
- [ ] Onboarding screen covering the privacy promise and API key choice.
- [ ] Multiple summary languages (the AI writes the summary in the user's language).
- [ ] Accessibility and dark mode.
- [ ] Chrome Web Store listing: privacy policy, permission justifications, screenshots.

---

## 6. Risks & Mitigations
| Risk | Mitigation |
|---|---|
| Banner detection breaks on unusual sites | Use autoconsent rule sets, keep the heuristic fallback, and let users always open the summary manually from the popup |
| AI hallucinates a red flag | Require a quote for every claim, show the quotes, and add a "Report wrong summary" button |
| Prompt injection inside policy pages | Mark the text as untrusted in the system prompt, validate output with Zod, and never let AI output trigger actions by itself |
| Policies are huge (50k+ words) | Readability cleanup, chunked map-reduce, and the server-side cache |
| Policy can't be found | Show "Couldn't find policy" with a field where the user can paste the URL |
| Cookie is "necessary" but miscategorized and deleting it logs the user out | Default to *never* auto-deleting ⚪ Whatever or Unknown cookies, and offer an undo snapshot before bulk deletes |
| Risk tier is wrong (scary label on a harmless cookie, or the reverse) | Curated overrides for popular cookies, show the "why" reasons so it's transparent, let users re-tier, and never let the AI lower a tier |
| Web Store review of `<all_urls>` | Write clear permission justifications and do no remote code execution |

---

## 7. Demo Script (for judges)
1. Open a news site → the banner appears → the CookieWise badge pulses.
2. Click it → in about 3 seconds the summary shows: "Grade D: shares with 312 ad partners, keeps data 13 months, 🚩 sells data for targeted ads. Accepting all adds 🔴 12 Dangerous cookies."
3. Click **"Necessary only"** → the banner closes, and the popup shows that 4 necessary cookies were kept and 0 trackers were set.
4. Visit a site you accepted earlier → popup shows "🔴 9 · 🟠 6 · 🟢 3 · ⚪ 4" → "Remove all 🔴 Dangerous" → the trackers are gone and you're still logged in.
