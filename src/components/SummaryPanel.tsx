import { useEffect, useState } from 'react';
import { SummaryView } from './SummaryView';
import type { SummaryState } from './useSummary';

export function SummaryPanel({
  state,
  onRun,
  onOpenSettings,
}: {
  state: SummaryState;
  onRun: (force?: boolean) => void;
  onOpenSettings: () => void;
}) {
  if (state.status === 'idle') {
    return (
      <div className="cw-col" style={{ alignItems: 'flex-start' }}>
        <p>Let AI read this site's privacy policy and terms, then summarize what data you give away.</p>
        <button className="cw-btn cw-btn-primary" onClick={() => onRun()}>
          Read the fine print for me
        </button>
      </div>
    );
  }
  if (state.status === 'loading') {
    return <Loading startedAt={state.startedAt} stage={state.stage} onRestart={() => onRun(true)} />;
  }
  if (state.status === 'error') {
    return (
      <div className="cw-col" style={{ alignItems: 'flex-start' }}>
        <div className="cw-notice cw-notice-error">{state.error}</div>
        <div className="cw-row">
          {state.needsSetup ? (
            <button className="cw-btn cw-btn-primary" onClick={onOpenSettings}>
              Open settings
            </button>
          ) : (
            <button className="cw-btn" onClick={() => onRun(true)}>
              Try again
            </button>
          )}
        </div>
      </div>
    );
  }
  return (
    <div className="cw-col">
      <SummaryView stored={state.summary} />
      <button className="cw-link cw-small" style={{ alignSelf: 'flex-start' }} onClick={() => onRun(true)}>
        Re-analyze
      </button>
    </div>
  );
}

function Loading({ startedAt, stage, onRestart }: { startedAt: number; stage?: string; onRestart: () => void }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const secs = Math.max(0, Math.round((now - startedAt) / 1000));
  return (
    <div className="cw-col" style={{ alignItems: 'flex-start' }}>
      <div className="cw-row">
        <div className="cw-spinner" />
        <span>
          {stage ?? 'Starting'}… <span className="cw-muted">{secs}s</span>
        </span>
      </div>
      <span className="cw-small cw-muted">Long policies can take a minute or two to read.</span>
      {secs >= 25 && (
        <button className="cw-btn cw-btn-sm" onClick={onRestart}>
          Taking too long? Start over
        </button>
      )}
    </div>
  );
}
