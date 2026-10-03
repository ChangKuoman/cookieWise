import type { StoredSummary } from '@/lib/schema';
import { TierChip } from './TierChip';

export function SummaryView({ stored }: { stored: StoredSummary }) {
  const s = stored.summary;
  return (
    <div className="cw-col" style={{ gap: 12 }}>
      <div className="cw-row" style={{ alignItems: 'flex-start', gap: 12 }}>
        <div className={`cw-grade cw-grade-${s.score}`} aria-label={`Privacy grade ${s.score}`}>
          {s.score}
        </div>
        <div className="cw-col" style={{ gap: 4 }}>
          <p style={{ fontWeight: 600 }}>{s.tldr}</p>
          <p className="cw-muted cw-small">{s.scoreReason}</p>
        </div>
      </div>

      {stored.truncated && (
        <div className="cw-notice cw-notice-warn cw-small">
          These documents were very long. Only the first part was analyzed.
        </div>
      )}

      {s.redFlags.length > 0 && (
        <div className="cw-section">
          <h3>🚩 Red flags</h3>
          {s.redFlags.map((f, i) => (
            <div key={i} className={`cw-flag cw-flag-${f.severity}`}>
              <strong>{f.flag}</strong>
              {f.quote && <span className="cw-quote">“{f.quote}”</span>}
              {stored.redFlagVerified[i] === false && (
                <span className="cw-small cw-muted">⚠ Quote not found word-for-word in the policy. Double-check this one.</span>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="cw-section">
        <h3>⚪ Strictly necessary (needed for the service to work)</h3>
        {s.strictlyNecessary.length === 0 ? (
          <p className="cw-muted">Nothing listed.</p>
        ) : (
          <ul>
            {s.strictlyNecessary.map((d, i) => (
              <li key={i}>
                <strong>{d.data}</strong>: {d.purpose}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="cw-section">
        <h3>Optional (what “Accept all” adds)</h3>
        {s.optional.length === 0 ? (
          <p className="cw-muted">Nothing optional found.</p>
        ) : (
          s.optional.map((d, i) => (
            <div key={i} className="cw-row" style={{ alignItems: 'flex-start' }}>
              <TierChip tier={d.risk} />
              <span>
                <strong>{d.data}</strong> <span className="cw-muted">({d.category})</span>: {d.purpose}
              </span>
            </div>
          ))
        )}
      </div>

      {s.thirdParties.length > 0 && (
        <div className="cw-section">
          <h3>
            Who else gets it{s.partnerCount ? ` (${s.partnerCount} partners)` : ''}
            {s.sellsData ? ' · 💸 data may be sold/shared' : ''}
          </h3>
          {s.thirdParties.map((t, i) => (
            <div key={i} className="cw-row" style={{ alignItems: 'flex-start' }}>
              <TierChip tier={t.risk} />
              <span>
                <strong>{t.name}</strong>: {t.purpose}
                {t.sells && <strong style={{ color: 'var(--cw-dangerous)' }}> · sold/shared for ads</strong>}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="cw-section">
        <h3>How long they keep it</h3>
        <p>{s.retention}</p>
      </div>

      {s.yourRights.length > 0 && (
        <div className="cw-section">
          <h3>Your rights</h3>
          <ul>
            {s.yourRights.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
          <p className="cw-small">
            <strong>Opt out / delete:</strong> {s.howToOptOut}
          </p>
        </div>
      )}

      <p className="cw-small cw-muted">
        Analyzed {new Date(stored.createdAt).toLocaleDateString()} from{' '}
        {stored.policyUrls.map((u, i) => (
          <span key={u}>
            {i > 0 && ', '}
            <a href={u} target="_blank" rel="noreferrer">
              {new URL(u).pathname}
            </a>
          </span>
        ))}
. AI summaries can be wrong, so check important points against the quotes and the policy itself.
      </p>
    </div>
  );
}
