/**
 * Import pricing — the estimate behind an import's UsageReservation ceiling
 * (D4 phase 1, billing minimal de sûreté).
 *
 * The BUILT-IN prices are ZERO on purpose: imports are free today and no price
 * has been measured or decided ("aucun chiffre sans mesure"). What phase 1
 * ships is the MECHANISM — every import opens an idempotent reservation, the
 * debit happens only after the billable step, and compensation runs on
 * cancel/timeout/failure — so the day a real price lands (a new rate-card
 * version), enforcement is already wired end-to-end. A zero ceiling exercises
 * exactly the same state machine as a real one.
 */

export interface ImportPricing {
  /** Version stamped on the reservation (audit trail, rate-card convention). */
  version: number;

  /** Flat cost per import operation, in credit cents. */
  baseCents: number;

  /** Cost per staged file, in credit cents. */
  perFileCents: number;
}

/** Version 1: imports are not charged (no measured price yet). */
export const BUILTIN_IMPORT_PRICING: ImportPricing = {
  version: 1,
  baseCents: 0,
  perFileCents: 0,
};

/**
 * The reservation ceiling for an import: base + per-file, ceil'd to whole
 * cents, never negative. This is an UPPER BOUND (what the user authorizes),
 * not the invoice — the committed debit is computed after the work and can
 * only be lower.
 */
export function estimateImportCreditCents(
  input: { fileCount: number },
  pricing: ImportPricing = BUILTIN_IMPORT_PRICING,
): number {
  const files = Number.isFinite(input.fileCount) ? Math.max(0, Math.floor(input.fileCount)) : 0;

  return Math.max(0, Math.ceil(pricing.baseCents + files * pricing.perFileCents));
}
