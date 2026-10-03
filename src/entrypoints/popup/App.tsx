import { useCallback, useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { CookieList } from '@/components/CookieList';
import { SummaryPanel } from '@/components/SummaryPanel';
import { TierCounts } from '@/components/TierChip';
import { useSummary } from '@/components/useSummary';
import { countTiers, deleteCookies, getSiteReport, hasUndo, undoLastDelete } from '@/lib/cookieEngine';
import { registrableDomain, siteOfUrl } from '@/lib/domain';
import { sendToTab } from '@/lib/messages';
import { overrideKey, updateRules } from '@/lib/storage';
import type { PageInfo, RiskTier, ScoredCookie, SiteReport } from '@/lib/types';

type Tab = 'cookies' | 'summary';

export default function App() {
  const [page, setPage] = useState<PageInfo | null>(null);
  const [unsupported, setUnsupported] = useState(false);
  const [contentMissing, setContentMissing] = useState(false);
  const [report, setReport] = useState<SiteReport | null>(null);
  const [tab, setTab] = useState<Tab>('cookies');
  const [toast, setToast] = useState<{ text: string; undo: boolean } | null>(null);
  const { state: summary, run: runSummary } = useSummary(page);

  useEffect(() => {
    (async () => {
      // ?tabId= lets the e2e test open the popup as a page and point it at a site tab.
      const forced = new URLSearchParams(location.search).get('tabId');
      const t = forced ? await browser.tabs.get(Number(forced)) : (await browser.tabs.query({ active: true, currentWindow: true }))[0];
      const site = t?.url ? siteOfUrl(t.url) : null;
      if (!t?.id || !t.url || !site) return setUnsupported(true);
      const info = await sendToTab<PageInfo>(t.id, { type: 'getPageInfo' }).catch(() => null);
      if (!info) setContentMissing(true);
      setPage(info ?? { url: t.url, site, policyLinks: [], resourceHosts: [], bannerCmp: null });
    })();
  }, []);

  const refresh = useCallback(async () => {
    if (page) setReport(await getSiteReport(page.site, page.resourceHosts));
  }, [page]);

  useEffect(() => {
    refresh();
  }, [refresh, summary.status]);

  const remove = async (cookies: ScoredCookie[]) => {
    const n = await deleteCookies(cookies);
    setToast({ text: `Removed ${n} cookie${n === 1 ? '' : 's'}.`, undo: await hasUndo() });
    refresh();
  };

  const removeTiers = (tiers: RiskTier[]) => report && remove(report.cookies.filter((c) => tiers.includes(c.tier)));

  const undo = async () => {
    const n = await undoLastDelete();
    setToast({ text: `Restored ${n} cookie${n === 1 ? '' : 's'}.`, undo: false });
    refresh();
  };

  const block = async (c: ScoredCookie) => {
    const site = registrableDomain(c.domain);
    await updateRules((r) => {
      if (!r.blocked.some((b) => b.site === site && b.name === c.name)) r.blocked.push({ site, name: c.name });
    });
    await remove([c]);
    setToast({ text: `"${c.name}" from ${site} will be deleted whenever it comes back.`, undo: false });
  };

  const override = async (c: ScoredCookie, tier: RiskTier | null) => {
    const key = overrideKey(registrableDomain(c.domain), c.name);
    await updateRules((r) => {
      if (tier) r.overrides[key] = tier;
      else delete r.overrides[key];
    });
    refresh();
  };

  const toggleTrusted = async () => {
    if (!page) return;
    await updateRules((r) => {
      r.trusted = r.trusted.includes(page.site) ? r.trusted.filter((s) => s !== page.site) : [...r.trusted, page.site];
    });
    refresh();
  };

  if (unsupported) {
    return (
      <Shell>
        <div className="cw-notice" style={{ margin: 14 }}>
          CookieWise works on regular websites. Open a site to see its cookies.
        </div>
      </Shell>
    );
  }
  if (!page || !report) {
    return (
      <Shell>
        <div className="cw-row" style={{ padding: 20 }}>
          <div className="cw-spinner" /> Loading…
        </div>
      </Shell>
    );
  }

  const counts = countTiers(report.cookies);
  return (
    <Shell>
      <div className="cw-col" style={{ padding: '12px 14px 8px', gap: 6 }}>
        <div className="cw-spread">
          <div className="cw-row">
            {summary.status === 'done' && (
              <div className={`cw-grade cw-grade-${summary.summary.summary.score}`} style={{ width: 32, height: 32, fontSize: 16 }}>
                {summary.summary.summary.score}
              </div>
            )}
            <div>
              <h1 className="cw-ellipsis" style={{ maxWidth: 230 }}>
                {page.site}
              </h1>
              <span className="cw-small cw-muted">{report.cookies.length} cookies in play on this page</span>
            </div>
          </div>
          <label className="cw-row cw-small" title="Trusted sites are never auto-cleaned or auto-blocked">
            <input type="checkbox" checked={report.trusted} onChange={toggleTrusted} /> Trust site
          </label>
        </div>
        <TierCounts counts={counts} />
      </div>

      <div className="cw-tabs" role="tablist">
        <button className="cw-tab" role="tab" aria-selected={tab === 'cookies'} onClick={() => setTab('cookies')}>
          Cookies
        </button>
        <button className="cw-tab" role="tab" aria-selected={tab === 'summary'} onClick={() => setTab('summary')}>
          What you're giving away
        </button>
      </div>

      <div style={{ padding: 14, overflowY: 'auto', flex: 1 }}>
        {toast && (
          <div className="cw-notice cw-notice-ok cw-spread" style={{ marginBottom: 10 }}>
            <span>{toast.text}</span>
            {toast.undo && (
              <button className="cw-link" onClick={undo}>
                Undo
              </button>
            )}
          </div>
        )}

        {tab === 'cookies' ? (
          <div className="cw-col" style={{ gap: 12 }}>
            {contentMissing && (
              <div className="cw-notice cw-small">Reload this page to also see the third-party cookies it loads.</div>
            )}
            {report.cookies.length === 0 ? (
              <div className="cw-notice">No cookies on this site. 🎉</div>
            ) : (
              <>
                <div className="cw-row cw-wrap">
                  <button className="cw-btn cw-btn-danger" disabled={!counts.dangerous} onClick={() => removeTiers(['dangerous'])}>
                    Remove all 🔴
                  </button>
                  <button
                    className="cw-btn cw-btn-danger"
                    disabled={!counts.dangerous && !counts.moderate}
                    onClick={() => removeTiers(['dangerous', 'moderate'])}
                  >
                    Remove 🔴 + 🟠
                  </button>
                  <button
                    className="cw-btn"
                    title="Keeps strictly necessary cookies so you stay logged in"
                    onClick={() => removeTiers(['dangerous', 'moderate', 'okay'])}
                  >
                    Keep only ⚪
                  </button>
                </div>
                <CookieList cookies={report.cookies} onDelete={remove} onBlock={block} onOverride={override} />
              </>
            )}
          </div>
        ) : (
          <SummaryPanel state={summary} onRun={runSummary} onOpenSettings={() => browser.runtime.openOptionsPage()} />
        )}
      </div>

      <div className="cw-spread" style={{ borderTop: '1px solid var(--cw-line)', padding: '8px 14px' }}>
        <span className="cw-small cw-muted">CookieWise</span>
        <button className="cw-link cw-small" onClick={() => browser.runtime.openOptionsPage()}>
          Dashboard & settings
        </button>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="cw-root" style={{ width: 400, minHeight: 200, maxHeight: 590, display: 'flex', flexDirection: 'column' }}>
      {children}
    </div>
  );
}
