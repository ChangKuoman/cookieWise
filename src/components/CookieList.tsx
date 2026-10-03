import { stripDot } from '@/lib/domain';
import { TIER_META, TIERS, type RiskTier, type ScoredCookie } from '@/lib/types';

interface Props {
  cookies: ScoredCookie[];
  onDelete: (cookies: ScoredCookie[]) => void;
  onBlock?: (cookie: ScoredCookie) => void;
  onOverride?: (cookie: ScoredCookie, tier: RiskTier | null) => void;
}

export function CookieList({ cookies, onDelete, onBlock, onOverride }: Props) {
  return (
    <div className="cw-col" style={{ gap: 14 }}>
      {TIERS.map((tier) => {
        const group = cookies.filter((c) => c.tier === tier);
        if (group.length === 0) return null;
        const meta = TIER_META[tier];
        return (
          <div key={tier} className={`cw-group cw-group-${tier}`}>
            <div className="cw-spread">
              <div className="cw-col" style={{ gap: 0 }}>
                <h2>
                  {meta.emoji} {meta.label} <span className="cw-muted">({group.length})</span>
                </h2>
                <span className="cw-small cw-muted">{meta.blurb}</span>
              </div>
              {tier !== 'whatever' && (
                <button className="cw-btn cw-btn-sm cw-btn-danger" onClick={() => onDelete(group)}>
                  Remove all
                </button>
              )}
            </div>
            {group.map((c) => (
              <CookieRow key={c.key} cookie={c} onDelete={onDelete} onBlock={onBlock} onOverride={onOverride} />
            ))}
          </div>
        );
      })}
    </div>
  );
}

function CookieRow({
  cookie: c,
  onDelete,
  onBlock,
  onOverride,
}: { cookie: ScoredCookie } & Omit<Props, 'cookies'>) {
  const necessary = c.tier === 'whatever';
  const remove = () => {
    if (necessary && !confirm(`"${c.name}" looks strictly necessary. Removing it may log you out or empty your cart. Remove anyway?`)) return;
    onDelete([c]);
  };
  return (
    <div className="cw-cookie">
      <div className="cw-spread">
        <div className="cw-grow">
          <div className="cw-row">
            <span className="cw-cookie-name cw-ellipsis" title={c.name}>
              {c.name}
            </span>
            {c.thirdParty && <span className="cw-chip cw-chip-whatever">3rd-party</span>}
          </div>
          <div className="cw-small cw-muted cw-ellipsis">
            {c.vendor ? `${c.vendor} · ` : ''}
            {stripDot(c.domain)} · {expiry(c)}
          </div>
        </div>
        <button className="cw-btn cw-btn-sm" onClick={remove} title="Delete this cookie">
          Remove
        </button>
      </div>
      <p className="cw-small">{c.reasons[0] ?? 'No details known.'}</p>
      {(c.reasons.length > 1 || onBlock || onOverride) && (
        <details>
          <summary>Why this tier? · options</summary>
          <div className="cw-col" style={{ gap: 6, marginTop: 6 }}>
            {c.reasons.length > 1 && (
              <ul className="cw-small">
                {c.reasons.slice(1).map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            )}
            <div className="cw-row cw-wrap">
              {onBlock && (
                <button className="cw-btn cw-btn-sm" onClick={() => onBlock(c)}>
                  Always block
                </button>
              )}
              {onOverride && (
                <label className="cw-row cw-small">
                  Move to
                  <select
                    className="cw-select"
                    value={c.overridden ? c.tier : ''}
                    onChange={(e) => onOverride(c, (e.target.value || null) as RiskTier | null)}
                  >
                    <option value="">Automatic</option>
                    {TIERS.map((t) => (
                      <option key={t} value={t}>
                        {TIER_META[t].emoji} {TIER_META[t].label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          </div>
        </details>
      )}
    </div>
  );
}

function expiry(c: ScoredCookie): string {
  if (c.session || !c.expirationDate) return 'until browser closes';
  const days = Math.round((c.expirationDate * 1000 - Date.now()) / 86_400_000);
  if (days < 1) return 'expires today';
  if (days < 60) return `${days} days`;
  if (days < 730) return `${Math.round(days / 30)} months`;
  return `${Math.round(days / 365)} years`;
}
