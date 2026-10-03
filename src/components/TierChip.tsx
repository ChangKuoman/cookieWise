import { TIER_META, TIERS, type RiskTier } from '@/lib/types';

export function TierChip({ tier, count }: { tier: RiskTier; count?: number }) {
  const m = TIER_META[tier];
  return (
    <span className={`cw-chip cw-chip-${tier}`} title={m.blurb}>
      {m.emoji} {count !== undefined ? count : m.label}
    </span>
  );
}

export function TierCounts({ counts }: { counts: Record<RiskTier, number> }) {
  return (
    <div className="cw-counts" aria-label="Cookies by risk">
      {TIERS.map((t) => (
        <span key={t} title={TIER_META[t].label}>
          {TIER_META[t].emoji} {counts[t]}
        </span>
      ))}
    </div>
  );
}
