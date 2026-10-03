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
    return (
      <div className="cw-row">
        <div className="cw-spinner" />
        <span>Reading the privacy policy and terms… this can take up to a minute.</span>
      </div>
    );
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
