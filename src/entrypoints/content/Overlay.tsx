import { useEffect, useState } from 'react';
import { SummaryPanel } from '@/components/SummaryPanel';
import { TierCounts } from '@/components/TierChip';
import { useSummary } from '@/components/useSummary';
import { acceptAll, acceptNecessaryOnly, bannerStillVisible, type BannerMatch } from '@/lib/consent';
import { sendToBackground } from '@/lib/messages';
import type { PageInfo, RiskTier, ScoredCookie, SiteReport } from '@/lib/types';

interface Props {
  banner: BannerMatch;
  getPage: () => PageInfo;
  autoAnalyze: boolean;
  onClose: () => void;
}

type Result =
  | { kind: 'necessary'; leftover: ScoredCookie[] }
  | { kind: 'accepted' }
  | { kind: 'failed' };

const TRACKING: RiskTier[] = ['dangerous', 'moderate'];
const counts = (r: SiteReport | null) => {
  const c = { dangerous: 0, moderate: 0, okay: 0, whatever: 0 };
  r?.cookies.forEach((x) => c[x.tier]++);
  return c;
};

export function Overlay({ banner, getPage, autoAnalyze, onClose }: Props) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState<PageInfo | null>(() => (autoAnalyze ? getPage() : null));
  const [before, setBefore] = useState<SiteReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const { state, run } = useSummary(page, true);

  const report = () => {
    const p = getPage();
    return sendToBackground({ type: 'getSiteReport', site: p.site, resourceHosts: p.resourceHosts });
  };

  useEffect(() => {
    report().then(setBefore, () => {});
  }, []);

  useEffect(() => {
    // If the user answers the banner themselves, get out of the way.
    const t = setInterval(() => {
      if (!bannerStillVisible(banner) && !busy && !result) onClose();
    }, 1000);
    return () => clearInterval(t);
  }, [busy, result]);

  const openPanel = () => {
    setOpen(true);
    if (!page) setPage(getPage());
  };

  const necessaryOnly = async () => {
    setBusy(true);
    const outcome = await acceptNecessaryOnly(banner);
    if (outcome === 'failed') {
      setResult({ kind: 'failed' });
      setBusy(false);
      return;
    }
    await new Promise((r) => setTimeout(r, 2000));
    const after = await report().catch(() => null);
    setResult({ kind: 'necessary', leftover: after?.cookies.filter((c) => TRACKING.includes(c.tier)) ?? [] });
    setBusy(false);
  };

  const all = () => {
    const outcome = acceptAll(banner);
    setResult(outcome === 'failed' ? { kind: 'failed' } : { kind: 'accepted' });
    if (outcome !== 'failed') setTimeout(onClose, 3000);
  };

  const deleteLeftover = async (leftover: ScoredCookie[]) => {
    setBusy(true);
    await sendToBackground({ type: 'deleteCookies', cookies: leftover });
    setResult({ kind: 'necessary', leftover: [] });
    setBusy(false);
  };

  const pre = counts(before);
  const preTracking = pre.dangerous + pre.moderate;

  if (!open) {
    return (
      <div className="cw-root" style={{ ...badgeStyle, bottom: badgeBottom(banner) }}>
        <button className="cw-btn cw-btn-primary" style={{ borderRadius: 999, padding: '8px 14px', boxShadow: shadow }} onClick={openPanel}>
          🛡 Read what you're agreeing to
          {preTracking > 0 && <span style={{ marginLeft: 6, opacity: 0.9 }}>· 🔴 {pre.dangerous} 🟠 {pre.moderate}</span>}
        </button>
        <button className="cw-btn cw-btn-sm" style={{ borderRadius: 999, boxShadow: shadow }} onClick={onClose} aria-label="Dismiss CookieWise">
          ✕
        </button>
      </div>
    );
  }

  return (
    <div className="cw-root" style={panelStyle} role="dialog" aria-label="CookieWise privacy summary">
      <div className="cw-spread" style={{ padding: '12px 14px', borderBottom: '1px solid var(--cw-line)' }}>
        <div>
          <h1>🛡 CookieWise</h1>
          <span className="cw-small cw-muted">Before you accept cookies on {getPage().site}</span>
        </div>
        <button className="cw-btn cw-btn-ghost" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>

      <div className="cw-col" style={{ padding: 14, gap: 12, overflowY: 'auto', flex: 1 }}>
        {before && (
          <div className={`cw-notice ${preTracking ? 'cw-notice-warn' : ''}`}>
            <div className="cw-spread">
              <span className="cw-small">Already set before you chose anything:</span>
              <TierCounts counts={pre} />
            </div>
            {pre.dangerous > 0 && (
              <p className="cw-small" style={{ marginTop: 4 }}>
                ⚠ This site is tracking you before asking. We can delete these if you choose “necessary only”.
              </p>
            )}
          </div>
        )}

        {result ? (
          <ResultView result={result} busy={busy} onDelete={deleteLeftover} onClose={onClose} />
        ) : (
          <SummaryPanel state={state} onRun={run} onOpenSettings={() => sendToBackground({ type: 'openOptions' })} />
        )}
      </div>

      {!result && (
        <div className="cw-col" style={{ padding: '10px 14px', borderTop: '1px solid var(--cw-line)', gap: 6 }}>
          <button className="cw-btn cw-btn-primary" disabled={busy} onClick={necessaryOnly}>
            {busy ? 'Working…' : '✅ Accept only necessary'}
          </button>
          <div className="cw-row">
            <button className="cw-btn cw-grow" disabled={busy || !banner.accept} onClick={all}>
              Accept all
            </button>
            <button className="cw-btn cw-btn-ghost cw-grow" onClick={onClose}>
              I'll decide myself
            </button>
          </div>
          <span className="cw-small cw-muted">Detected: {banner.cmp}</span>
        </div>
      )}
    </div>
  );
}

function ResultView({
  result,
  busy,
  onDelete,
  onClose,
}: {
  result: Result;
  busy: boolean;
  onDelete: (c: ScoredCookie[]) => void;
  onClose: () => void;
}) {
  if (result.kind === 'failed') {
    return (
      <div className="cw-notice cw-notice-error">
        We couldn't find a “reject” or “necessary only” option on this banner. Please use the site's own buttons. You can
        still remove cookies afterwards from the CookieWise toolbar icon.
      </div>
    );
  }
  if (result.kind === 'accepted') {
    return <div className="cw-notice">Accepted. You can remove cookies anytime from the CookieWise toolbar icon.</div>;
  }
  if (result.leftover.length === 0) {
    return (
      <div className="cw-col">
        <div className="cw-notice cw-notice-ok">✅ Done. Only necessary cookies are kept on this site.</div>
        <button className="cw-btn" onClick={onClose}>
          Close
        </button>
      </div>
    );
  }
  const d = result.leftover.filter((c) => c.tier === 'dangerous').length;
  return (
    <div className="cw-col">
      <div className="cw-notice cw-notice-warn">
        ⚠ You chose “necessary only”, but {result.leftover.length} tracking cookie
        {result.leftover.length === 1 ? ' is' : 's are'} still set ({d} 🔴 dangerous).
      </div>
      <ul className="cw-small">
        {result.leftover.slice(0, 8).map((c) => (
          <li key={c.key}>
            <code>{c.name}</code> {c.vendor ? `(${c.vendor})` : `(${c.domain})`}
          </li>
        ))}
        {result.leftover.length > 8 && <li>…and {result.leftover.length - 8} more</li>}
      </ul>
      <button className="cw-btn cw-btn-primary" disabled={busy} onClick={() => onDelete(result.leftover)}>
        Delete them
      </button>
    </div>
  );
}

/** Sit just above banners docked at the bottom so we never cover the site's own buttons. */
function badgeBottom(banner: BannerMatch): number {
  const r = banner.root.getBoundingClientRect();
  const docked = r.bottom >= innerHeight - 40 && r.height < innerHeight * 0.6;
  return docked ? Math.round(innerHeight - r.top + 12) : 16;
}

const shadow = '0 6px 24px rgba(0,0,0,.18)';
const badgeStyle: React.CSSProperties = {
  position: 'fixed',
  right: 16,
  bottom: 16,
  zIndex: 2147483647,
  display: 'flex',
  gap: 6,
  alignItems: 'center',
  background: 'transparent',
};
const panelStyle: React.CSSProperties = {
  position: 'fixed',
  right: 16,
  bottom: 16,
  zIndex: 2147483647,
  width: 400,
  maxWidth: 'calc(100vw - 32px)',
  maxHeight: 'min(640px, calc(100vh - 32px))',
  display: 'flex',
  flexDirection: 'column',
  borderRadius: 14,
  boxShadow: '0 12px 40px rgba(0,0,0,.28)',
  border: '1px solid var(--cw-line)',
  overflow: 'hidden',
};
