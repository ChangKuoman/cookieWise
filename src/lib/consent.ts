// Cookie-banner detection and "accept necessary only" automation. Runs in the content script.

export interface BannerMatch {
  cmp: string;
  root: Element;
  accept?: HTMLElement;
  reject?: HTMLElement;
  settings?: HTMLElement;
}

interface CmpRule {
  name: string;
  root: string;
  accept?: string;
  reject?: string;
  settings?: string;
  /** Inside the preference center: reject-all or save button. */
  prefsReject?: string;
  shadowHost?: boolean;
}

// Known consent-management platforms. Selectors from the CMPs' own markup.
const CMPS: CmpRule[] = [
  { name: 'OneTrust', root: '#onetrust-banner-sdk', accept: '#onetrust-accept-btn-handler', reject: '#onetrust-reject-all-handler', settings: '#onetrust-pc-btn-handler', prefsReject: '.ot-pc-refuse-all-handler, .save-preference-btn-handler' },
  { name: 'Cookiebot', root: '#CybotCookiebotDialog', accept: '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll, #CybotCookiebotDialogBodyButtonAccept', reject: '#CybotCookiebotDialogBodyButtonDecline', settings: '#CybotCookiebotDialogBodyButtonDetails' },
  { name: 'Didomi', root: '#didomi-notice, #didomi-popup', accept: '#didomi-notice-agree-button', reject: '#didomi-notice-disagree-button, .didomi-continue-without-agreeing', settings: '#didomi-notice-learn-more-button', prefsReject: '.didomi-consent-popup-actions button[aria-label*="Disagree"], .didomi-consent-popup-footer .didomi-button-standard' },
  { name: 'Quantcast Choice', root: '.qc-cmp2-container', accept: '.qc-cmp2-summary-buttons button[mode="primary"]', reject: '.qc-cmp2-summary-buttons button[mode="secondary"]' },
  { name: 'TrustArc', root: '#truste-consent-track', accept: '#truste-consent-button', reject: '#truste-consent-required', settings: '#truste-show-consent' },
  { name: 'Usercentrics', root: '#usercentrics-root, #usercentrics-cmp-ui', shadowHost: true, accept: '[data-testid="uc-accept-all-button"], #accept', reject: '[data-testid="uc-deny-all-button"], #deny' },
  { name: 'Osano', root: '.osano-cm-window:not(.osano-cm-window--hidden) .osano-cm-dialog', accept: '.osano-cm-accept-all, .osano-cm-accept', reject: '.osano-cm-denyAll, .osano-cm-deny' },
  { name: 'CookieYes', root: '.cky-consent-container', accept: '.cky-btn-accept', reject: '.cky-btn-reject', settings: '.cky-btn-customize' },
  { name: 'Complianz', root: '#cmplz-cookiebanner-container .cmplz-cookiebanner', accept: '.cmplz-accept', reject: '.cmplz-deny', settings: '.cmplz-view-preferences' },
  { name: 'Cookie Consent', root: '.cc-window:not(.cc-invisible), .cc-banner', accept: '.cc-allow, .cc-btn.cc-dismiss', reject: '.cc-deny' },
  { name: 'Iubenda', root: '#iubenda-cs-banner', accept: '.iubenda-cs-accept-btn', reject: '.iubenda-cs-reject-btn', settings: '.iubenda-cs-customize-btn' },
  { name: 'Klaro', root: '.klaro .cookie-notice, .klaro .cookie-modal', accept: '.cm-btn-accept-all, .cm-btn-success', reject: '.cm-btn-decline' },
];

const ACCEPT_RE =
  /^(accept|allow|agree|i agree|i accept|ok|okay|got it|yes|sounds good|accept all( cookies)?|allow all( cookies)?|accept (&|and) (close|continue)|aceptar( todo)?|accepter( tout)?|tout accepter|akzeptieren|alle akzeptieren|zustimmen|accetta( tutto)?|aceitar)\b/i;
const REJECT_RE =
  /(reject|decline|deny|refuse|disagree|necessary only|only necessary|essential only|only essential|necessary cookies only|continue without|use necessary|rechazar|refuser|tout refuser|ablehnen|nur notwendige|rifiuta|recusar)/i;
const SETTINGS_RE = /(settings|preferences|customi[sz]e|manage|more options|options|configur|personnaliser|einstellungen|preferencias|impostazioni)/i;
const SAVE_RE = /(save|confirm( my)? choices|confirm|submit|apply|done|guardar|enregistrer|speichern|salva)/i;
const COOKIE_TEXT_RE = /(cookie|consent|gdpr|tracking|personal data|privacy|datenschutz|confidentialité)/i;
const BUTTONS = 'button, a, [role="button"], input[type="button"], input[type="submit"]';

function visible(el: Element | null | undefined): el is HTMLElement {
  if (!el || !(el instanceof HTMLElement)) return false;
  if (el.getClientRects().length === 0) return false;
  const s = getComputedStyle(el);
  return s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.05;
}

function labelOf(el: Element): string {
  const t = (el as HTMLElement).innerText || (el as HTMLInputElement).value || el.getAttribute('aria-label') || '';
  return t.replace(/\s+/g, ' ').trim();
}

function classifyButtons(root: ParentNode): Pick<BannerMatch, 'accept' | 'reject' | 'settings'> {
  const out: Pick<BannerMatch, 'accept' | 'reject' | 'settings'> = {};
  for (const el of root.querySelectorAll<HTMLElement>(BUTTONS)) {
    if (!visible(el)) continue;
    const label = labelOf(el);
    if (!label || label.length > 45) continue;
    if (!out.reject && REJECT_RE.test(label)) out.reject = el;
    else if (!out.accept && ACCEPT_RE.test(label)) out.accept = el;
    else if (!out.settings && SETTINGS_RE.test(label)) out.settings = el;
  }
  return out;
}

function q(root: ParentNode, sel?: string): HTMLElement | undefined {
  if (!sel) return undefined;
  const el = root.querySelector<HTMLElement>(sel);
  return visible(el) ? el : undefined;
}

export function detectBanner(doc: Document = document): BannerMatch | null {
  for (const rule of CMPS) {
    const host = doc.querySelector(rule.root);
    if (!host) continue;
    const scope: ParentNode = rule.shadowHost && host.shadowRoot ? host.shadowRoot : host;
    const accept = q(scope, rule.accept);
    const reject = q(scope, rule.reject);
    if (!rule.shadowHost && !visible(host)) continue;
    if (!accept && !reject) continue;
    const fallback = classifyButtons(scope);
    return {
      cmp: rule.name,
      root: host,
      accept: accept ?? fallback.accept,
      reject: reject ?? fallback.reject,
      settings: q(scope, rule.settings) ?? fallback.settings,
    };
  }
  return detectHeuristic(doc);
}

const HEURISTIC_ROOTS =
  '[id*="cookie" i], [class*="cookie" i], [id*="consent" i], [class*="consent" i], [id*="gdpr" i], [class*="gdpr" i], [id*="privacy" i][class*="banner" i], [role="dialog"], [role="alertdialog"], [aria-modal="true"], dialog[open]';

function detectHeuristic(doc: Document): BannerMatch | null {
  const candidates: { el: HTMLElement; buttons: ReturnType<typeof classifyButtons> }[] = [];
  for (const el of doc.querySelectorAll<HTMLElement>(HEURISTIC_ROOTS)) {
    if (!visible(el)) continue;
    const text = el.innerText ?? '';
    if (text.length < 20 || text.length > 4000 || !COOKIE_TEXT_RE.test(text)) continue;
    const buttons = classifyButtons(el);
    if (!buttons.accept) continue;
    candidates.push({ el, buttons });
  }
  // Prefer the outermost match so the whole banner is the root.
  const outer = candidates.find((c) => !candidates.some((o) => o !== c && o.el.contains(c.el)));
  return outer ? { cmp: 'Generic banner', root: outer.el, ...outer.buttons } : null;
}

export function bannerStillVisible(m: BannerMatch): boolean {
  return m.root.isConnected && visible(m.root as HTMLElement);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type ConsentOutcome = 'rejected' | 'customized' | 'accepted' | 'failed';

/** Click "reject" / "necessary only", or open settings and switch everything off. */
export async function acceptNecessaryOnly(m: BannerMatch): Promise<ConsentOutcome> {
  if (m.reject) {
    m.reject.click();
    return 'rejected';
  }
  if (!m.settings) return 'failed';

  m.settings.click();
  await sleep(800);
  const rule = CMPS.find((r) => r.name === m.cmp);
  const prefsReject = rule?.prefsReject ? document.querySelector<HTMLElement>(rule.prefsReject) : null;
  if (visible(prefsReject)) {
    prefsReject.click();
    return 'customized';
  }

  // Generic preference center: find the open dialog, switch off optional toggles, save.
  const dialog =
    [...document.querySelectorAll<HTMLElement>('[role="dialog"], [aria-modal="true"], dialog[open], ' + HEURISTIC_ROOTS)]
      .filter(visible)
      .find((el) => el.querySelector('input[type="checkbox"], [role="switch"]')) ?? (m.root as HTMLElement);

  const { reject } = classifyButtons(dialog);
  if (reject) {
    reject.click();
    return 'customized';
  }
  for (const box of dialog.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')) {
    if (box.checked && !box.disabled) box.click();
  }
  for (const sw of dialog.querySelectorAll<HTMLElement>('[role="switch"][aria-checked="true"]')) {
    if (sw.getAttribute('aria-disabled') !== 'true') sw.click();
  }
  const save = [...dialog.querySelectorAll<HTMLElement>(BUTTONS)].find(
    (b) => visible(b) && SAVE_RE.test(labelOf(b)) && !ACCEPT_RE.test(labelOf(b)),
  );
  if (!save) return 'failed';
  save.click();
  return 'customized';
}

export function acceptAll(m: BannerMatch): ConsentOutcome {
  if (!m.accept) return 'failed';
  m.accept.click();
  return 'accepted';
}
