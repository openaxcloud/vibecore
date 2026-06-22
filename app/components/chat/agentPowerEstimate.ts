import type { AgentPowerControlsValue } from './AgentPowerControls';

/*
 * Default AI margin reserved/charged by the server on top of the raw provider
 * cost. MUST stay in sync with `DEFAULT_AI_MARGIN` in
 * packages/billing/src/credits.ts (the server source of truth applied by
 * `computeCreditCostCents` / `estimateCheckpointCostCents`). Inlined so the web
 * bundle stays free of the server billing package.
 */
export const DEFAULT_AI_MARGIN = 0.3;

/*
 * Proof-of-work estimate multipliers — mirror packages/billing/src/credits.ts
 * (the server-side source of truth used at checkpoint reservation:
 * BUILD_TIER_ESTIMATE_MULTIPLIER / HIGH_POWER / EXTENDED_THINKING / TURBO).
 * Inlined so the web bundle stays free of the server billing package; the live
 * settle figure comes from the server, this is just the pre-flight preview.
 */
export const POWER_ESTIMATE = {
  baselineCents: 25, // a "simple" Replit request (~$0.25)
  buildTier: { lite: 0.4, economy: 1, power: 1.8 } as Record<AgentPowerControlsValue['buildTier'], number>,
  highPower: 4,
  extendedThinking: 2.5,
  turbo: 6,
};

/**
 * Pre-flight proof-of-work cost preview shown next to the Power control.
 *
 * Mirrors the server's `estimateCheckpointCostCents`: build tier scales the base
 * (effort axis), power-control boosts are ADDITIVE surcharges (each
 * `multiplier − 1`, never compounding — the old `× highPower × thinking × turbo`
 * product produced an aberrant ~$27/message), and finally the server's
 * `DEFAULT_AI_MARGIN` is applied with `Math.ceil` so the preview matches the
 * credits the server actually reserves and settles (previously omitting the
 * margin under-displayed every estimate by ~1/1.3 ≈ 23%).
 */
export function estimateAgentPowerCents(value: AgentPowerControlsValue): number {
  const cents = POWER_ESTIMATE.baselineCents * (POWER_ESTIMATE.buildTier[value.buildTier] ?? 1);

  let surcharge = 0;

  if (value.highPowerModel) {
    surcharge += POWER_ESTIMATE.highPower - 1;
  }

  if (value.extendedThinking) {
    surcharge += POWER_ESTIMATE.extendedThinking - 1;
  }

  if (value.turboMode) {
    surcharge += POWER_ESTIMATE.turbo - 1;
  }

  const raw = cents * (1 + surcharge);

  return Math.ceil(raw * (1 + DEFAULT_AI_MARGIN));
}
