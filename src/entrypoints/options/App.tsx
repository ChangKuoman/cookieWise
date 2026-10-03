import { useCallback, useEffect, useMemo, useState } from 'react';
import { browser } from 'wxt/browser';
import { CookieList } from '@/components/CookieList';
import { TierCounts } from '@/components/TierChip';
import { deleteCookies, getAllSites, hasUndo, undoLastDelete, type SiteOverview } from '@/lib/cookieEngine';
import { registrableDomain } from '@/lib/domain';
import {
  DEFAULT_SETTINGS,
  getRules,
  getSettings,
  overrideKey,
  saveSettings,
  updateRules,
  type Rules,
  type Settings,
} from '@/lib/storage';
import { TIER_META, type RiskTier, type ScoredCookie } from '@/lib/types';

type Tab = 'sites' | 'rules' | 'settings';

export default function App() {
  const [tab, setTab] = useState<Tab>(() => (location.hash.slice(1) as Tab) || 'sites');
  useEffect(() => {
    location.hash = tab;
  }, [tab]);

  return (
    <div className="cw-root" style={{ minHeight: '100vh', background: 'var(--cw-soft)' }}>
      <div style={{ maxWidth: 860, margin: '0 auto', padding: '24px 20px' }}>
        <div className="cw-spread" style={{ marginBottom: 16 }}>
          <div>
            <h1 style={{ fontSize: 22 }}>🛡 CookieWise</h1>
            <p className="cw-muted">Know what you give away, and take it back.</p>
          </div>
        </div>
        <div className="cw-tabs" role="tablist" style={{ marginBottom: 16 }}>
          {(['sites', 'rules', 'settings'] as Tab[]).map((t) => (
            <button key={t} className="cw-tab" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
              {{ sites: 'All sites', rules: 'Rules & automation', settings: 'AI settings' }[t]}
            </button>
          ))}
        </div>
        {tab === 'sites' && <SitesTab />}
        {tab === 'rules' && <RulesTab />}
        {tab === 'settings' && <SettingsTab />}
      </div>
    </div>
  );
}

// ---------------- All sites ----------------

function SitesTab() {
  const [sites, setSites] = useState<SiteOverview[] | null>(null);
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; undo: boolean } | null>(null);

  const refresh = useCallback(() => getAllSites().then(setSites), []);
  useEffect(() => {
    refresh();
  }, [refresh]);

  const totals = useMemo(() => {
    const t = { dangerous: 0, moderate: 0, okay: 0, whatever: 0 };
    sites?.forEach((s) => (Object.keys(t) as RiskTier[]).forEach((k) => (t[k] += s.counts[k])));
    return t;
  }, [sites]);

  const remove = async (cookies: ScoredCookie[]) => {
    const n = await deleteCookies(cookies);
    setToast({ text: `Removed ${n} cookie${n === 1 ? '' : 's'}.`, undo: await hasUndo() });
    refresh();
  };

  const removeEverywhere = (tiers: RiskTier[]) => {
    const all = sites?.flatMap((s) => s.cookies.filter((c) => tiers.includes(c.tier))) ?? [];
    if (all.length && confirm(`Remove ${all.length} cookies across all sites?`)) remove(all);
  };

  const block = async (c: ScoredCookie) => {
    const site = registrableDomain(c.domain);
    await updateRules((r) => {
      if (!r.blocked.some((b) => b.site === site && b.name === c.name)) r.blocked.push({ site, name: c.name });
    });
    remove([c]);
  };

  const override = async (c: ScoredCookie, tier: RiskTier | null) => {
    const key = overrideKey(registrableDomain(c.domain), c.name);
    await updateRules((r) => {
      if (tier) r.overrides[key] = tier;
      else delete r.overrides[key];
    });
    refresh();
  };

  if (!sites) return <div className="cw-row"><div className="cw-spinner" /> Scanning cookies…</div>;

  const filtered = sites.filter((s) => s.site.includes(query.toLowerCase().trim()));
  return (
    <div className="cw-col" style={{ gap: 12 }}>
      <div className="cw-card cw-spread cw-wrap">
        <div>
          <h2>{sites.length} sites have cookies in this browser</h2>
          <TierCounts counts={totals} />
        </div>
        <div className="cw-row">
          <button className="cw-btn cw-btn-danger" disabled={!totals.dangerous} onClick={() => removeEverywhere(['dangerous'])}>
            Remove all 🔴 everywhere
          </button>
          <button className="cw-btn cw-btn-danger" onClick={() => removeEverywhere(['dangerous', 'moderate'])}>
            Remove 🔴 + 🟠 everywhere
          </button>
        </div>
      </div>

      {toast && (
        <div className="cw-notice cw-notice-ok cw-spread">
          <span>{toast.text}</span>
          {toast.undo && (
            <button
              className="cw-link"
              onClick={async () => {
                const n = await undoLastDelete();
                setToast({ text: `Restored ${n} cookies.`, undo: false });
                refresh();
              }}
            >
              Undo
            </button>
          )}
        </div>
      )}

      <input className="cw-input" placeholder="Search sites…" value={query} onChange={(e) => setQuery(e.target.value)} />

      {filtered.map((s) => (
        <div key={s.site} className="cw-card cw-col">
          <div className="cw-spread cw-wrap">
            <button className="cw-link" style={{ textDecoration: 'none', fontWeight: 600, color: 'var(--cw-fg)' }} onClick={() => setExpanded(expanded === s.site ? null : s.site)}>
              {expanded === s.site ? '▾' : '▸'} {s.site} <span className="cw-muted">({s.total})</span>
            </button>
            <div className="cw-row">
              <TierCounts counts={s.counts} />
              <button
                className="cw-btn cw-btn-sm cw-btn-danger"
                disabled={!s.counts.dangerous && !s.counts.moderate}
                onClick={() => remove(s.cookies.filter((c) => c.tier === 'dangerous' || c.tier === 'moderate'))}
              >
                Remove 🔴🟠
              </button>
              <button className="cw-btn cw-btn-sm" onClick={() => confirm(`Remove all ${s.total} cookies for ${s.site}? You'll be logged out.`) && remove(s.cookies)}>
                Remove all
              </button>
            </div>
          </div>
          {expanded === s.site && <CookieList cookies={s.cookies} onDelete={remove} onBlock={block} onOverride={override} />}
        </div>
      ))}
    </div>
  );
}

// ---------------- Rules ----------------

function RulesTab() {
  const [rules, setRules] = useState<Rules | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  useEffect(() => {
    getRules().then(setRules);
    getSettings().then(setSettings);
  }, []);
  if (!rules || !settings) return null;

  const edit = async (fn: (r: Rules) => void) => setRules(await updateRules(fn));
  const toggle = async (key: 'autoBlockDangerous' | 'autoCleanOnClose' | 'showBannerBadge' | 'autoAnalyze') =>
    setSettings(await saveSettings({ [key]: !settings[key] }));

  return (
    <div className="cw-col" style={{ gap: 12 }}>
      <div className="cw-card cw-col">
        <h2>Automation</h2>
        <Check checked={settings.autoBlockDangerous} onChange={() => toggle('autoBlockDangerous')} label="Auto-delete 🔴 Dangerous cookies the moment they're set" hint="Cross-site trackers never stick. Trusted sites are skipped." />
        <Check checked={settings.autoCleanOnClose} onChange={() => toggle('autoCleanOnClose')} label="Delete 🔴 and 🟠 cookies when I close a site's last tab" hint="Keeps ⚪ and 🟢, so you stay logged in and keep your preferences." />
        <Check checked={settings.showBannerBadge} onChange={() => toggle('showBannerBadge')} label="Show the CookieWise button next to cookie banners" />
        <Check checked={settings.autoAnalyze} onChange={() => toggle('autoAnalyze')} label="Analyze privacy policies automatically when a banner appears" hint="Faster, but calls the AI on every new site with a banner (uses API credits)." />
      </div>

      <div className="cw-card cw-col">
        <h2>Always blocked</h2>
        {rules.blocked.length === 0 ? (
          <p className="cw-muted">Nothing yet. Use “Always block” on any cookie.</p>
        ) : (
          rules.blocked.map((b) => (
            <div key={`${b.site}|${b.name}`} className="cw-spread">
              <span>
                <code>{b.name ?? '* (all cookies)'}</code> from {b.site}
              </span>
              <button className="cw-btn cw-btn-sm" onClick={() => edit((r) => void (r.blocked = r.blocked.filter((x) => !(x.site === b.site && x.name === b.name))))}>
                Unblock
              </button>
            </div>
          ))
        )}
        <AddBlock onAdd={(site) => edit((r) => void r.blocked.push({ site }))} />
      </div>

      <div className="cw-card cw-col">
        <h2>Trusted sites</h2>
        <p className="cw-small cw-muted">Never auto-cleaned or auto-blocked. Toggle from the popup.</p>
        {rules.trusted.length === 0 ? (
          <p className="cw-muted">None.</p>
        ) : (
          rules.trusted.map((s) => (
            <div key={s} className="cw-spread">
              <span>{s}</span>
              <button className="cw-btn cw-btn-sm" onClick={() => edit((r) => void (r.trusted = r.trusted.filter((x) => x !== s)))}>
                Remove
              </button>
            </div>
          ))
        )}
      </div>

      <div className="cw-card cw-col">
        <h2>Your tier overrides</h2>
        {Object.keys(rules.overrides).length === 0 ? (
          <p className="cw-muted">None. Use “Move to” on any cookie.</p>
        ) : (
          Object.entries(rules.overrides).map(([key, tier]) => {
            const [site = '', name = ''] = key.split('|');
            return (
              <div key={key} className="cw-spread">
                <span>
                  <code>{name}</code> from {site} → {TIER_META[tier].emoji} {TIER_META[tier].label}
                </span>
                <button className="cw-btn cw-btn-sm" onClick={() => edit((r) => void delete r.overrides[key])}>
                  Reset
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function AddBlock({ onAdd }: { onAdd: (site: string) => void }) {
  const [value, setValue] = useState('');
  return (
    <form
      className="cw-row"
      onSubmit={(e) => {
        e.preventDefault();
        const site = registrableDomain(value.trim().replace(/^https?:\/\//, '').split('/')[0] ?? '');
        if (site) onAdd(site);
        setValue('');
      }}
    >
      <input className="cw-input" placeholder="Block every cookie from a domain, e.g. doubleclick.net" value={value} onChange={(e) => setValue(e.target.value)} />
      <button className="cw-btn" type="submit" disabled={!value.trim()}>
        Block
      </button>
    </form>
  );
}

// ---------------- Settings ----------------

function SettingsTab() {
  const [s, setS] = useState<Settings | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    getSettings().then(setS);
  }, []);
  if (!s) return null;

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => {
    setS({ ...s, [k]: v });
    setSaved(false);
  };
  const save = async () => {
    await saveSettings(s);
    setSaved(true);
  };
  const clearSummaries = async () => {
    const all = await browser.storage.local.get(null);
    await browser.storage.local.remove(Object.keys(all).filter((k) => k.startsWith('summary:')));
    alert('Cached summaries cleared.');
  };

  return (
    <div className="cw-col" style={{ gap: 12 }}>
      <div className="cw-card cw-col" style={{ gap: 12 }}>
        <h2>How CookieWise talks to the AI</h2>
        <label className="cw-check">
          <input type="radio" checked={s.mode === 'direct'} onChange={() => set('mode', 'direct')} />
          <span>
            <strong>My own Claude API key</strong>
            <br />
            <span className="cw-small cw-muted">Stored only in this browser and sent only to api.anthropic.com.</span>
          </span>
        </label>
        {s.mode === 'direct' && (
          <label className="cw-field">
            <span>Claude API key</span>
            <input className="cw-input" type="password" autoComplete="off" placeholder="sk-ant-…" value={s.apiKey} onChange={(e) => set('apiKey', e.target.value.trim())} />
            <span className="cw-small cw-muted">
              Get one at <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">console.anthropic.com</a>.
            </span>
          </label>
        )}
        <label className="cw-check">
          <input type="radio" checked={s.mode === 'gemini'} onChange={() => set('mode', 'gemini')} />
          <span>
            <strong>My own Google Gemini API key</strong>
            <br />
            <span className="cw-small cw-muted">Stored only in this browser and sent only to Google's Gemini API.</span>
          </span>
        </label>
        {s.mode === 'gemini' && (
          <label className="cw-field">
            <span>Gemini API key</span>
            <input className="cw-input" type="password" autoComplete="off" placeholder="AIza…" value={s.geminiApiKey} onChange={(e) => set('geminiApiKey', e.target.value.trim())} />
            <span className="cw-small cw-muted">
              Get one at <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">aistudio.google.com/apikey</a>. Free-tier keys have low rate limits, and Google may use free-tier data to improve its products.
            </span>
          </label>
        )}
        <label className="cw-check">
          <input type="radio" checked={s.mode === 'proxy'} onChange={() => set('mode', 'proxy')} />
          <span>
            <strong>CookieWise proxy server</strong>
            <br />
            <span className="cw-small cw-muted">Your deployed proxy (see /proxy). Keeps the key server-side and caches summaries for everyone.</span>
          </span>
        </label>
        {s.mode === 'proxy' && (
          <label className="cw-field">
            <span>Proxy URL</span>
            <input className="cw-input" placeholder="https://cookiewise-proxy.example.workers.dev" value={s.proxyUrl} onChange={(e) => set('proxyUrl', e.target.value.trim())} />
          </label>
        )}

        <div className="cw-row cw-wrap" style={{ gap: 16 }}>
          {s.mode === 'direct' && (
            <label className="cw-field">
              <span>Model</span>
              <select className="cw-select" style={{ fontSize: 13, padding: 6 }} value={s.model} onChange={(e) => set('model', e.target.value)}>
                <option value="claude-opus-5-5">Claude Opus 5.5 (best)</option>
                <option value="claude-sonnet-5-5">Claude Sonnet 5.5 (cheaper)</option>
              </select>
            </label>
          )}
          {s.mode === 'gemini' && (
            <label className="cw-field">
              <span>Model</span>
              <select className="cw-select" style={{ fontSize: 13, padding: 6 }} value={s.geminiModel} onChange={(e) => set('geminiModel', e.target.value)}>
                <option value="gemini-3.8-flash">Gemini 3.8 Flash (recommended)</option>
                <option value="gemini-3.5-flash-lite">Gemini 3.5 Flash-Lite (cheapest)</option>
                <option value="gemini-3.1-pro-preview">Gemini 3.1 Pro (preview, most capable)</option>
              </select>
            </label>
          )}
          <label className="cw-field">
            <span>Analysis depth</span>
            <select className="cw-select" style={{ fontSize: 13, padding: 6 }} value={s.effort} onChange={(e) => set('effort', e.target.value as Settings['effort'])}>
              <option value="low">Quick (fastest)</option>
              <option value="medium">Balanced</option>
              <option value="high">Thorough (slowest)</option>
            </select>
          </label>
          <label className="cw-field">
            <span>Summary language</span>
            <input className="cw-input" style={{ width: 160 }} value={s.language} onChange={(e) => set('language', e.target.value)} />
          </label>
        </div>

        <div className="cw-row">
          <button className="cw-btn cw-btn-primary" onClick={save}>
            Save
          </button>
          {saved && <span className="cw-muted">Saved ✓</span>}
          <span className="cw-grow" />
          <button className="cw-btn cw-btn-ghost" onClick={() => setS({ ...DEFAULT_SETTINGS, mode: s.mode, apiKey: s.apiKey, geminiApiKey: s.geminiApiKey, proxyUrl: s.proxyUrl })}>
            Reset to defaults
          </button>
        </div>
      </div>

      <div className="cw-card cw-col">
        <h2>Privacy promise</h2>
        <ul className="cw-small">
          <li>Only the public text of a site's privacy policy / terms and the site's name are sent to the AI.</li>
          <li>Cookie values, your browsing history, and page contents never leave your browser.</li>
          <li>Summaries are cached locally for 7 days and re-used if the policy hasn't changed.</li>
        </ul>
        <button className="cw-btn" style={{ alignSelf: 'flex-start' }} onClick={clearSummaries}>
          Clear cached summaries
        </button>
      </div>
    </div>
  );
}

function Check({ checked, onChange, label, hint }: { checked: boolean; onChange: () => void; label: string; hint?: string }) {
  return (
    <label className="cw-check">
      <input type="checkbox" checked={checked} onChange={onChange} />
      <span>
        {label}
        {hint && (
          <>
            <br />
            <span className="cw-small cw-muted">{hint}</span>
          </>
        )}
      </span>
    </label>
  );
}
