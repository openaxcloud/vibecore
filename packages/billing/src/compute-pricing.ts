/**
 * Replit-parity compute / deployment / object-storage pricing.
 *
 * Exact rates transcribed from docs.replit.com/billing/{deployment-pricing,
 * object-storage-billing} (2026-06-16). Pure functions so metering (P4/P4b/P4d)
 * can attribute real cost to a checkpoint or a compute usage event.
 *
 * All functions return **cents** and may be FRACTIONAL (sub-cent) — metering
 * accumulates many tiny increments, so callers should sum fractional cents and
 * round once at settle (use `ceilCents`). Rounding each increment would grossly
 * over-bill. See docs/REPLIT_PARITY_SPEC.md §16.4.
 */

// --- Compute-unit conversion (deployment-pricing) ---------------------------
/** 1 CPU-second = 18 compute units. */
export const CPU_SECOND_COMPUTE_UNITS = 18;
/** 1 GB-second = 2 compute units. */
export const GB_SECOND_COMPUTE_UNITS = 2;

// --- Rates in cents ---------------------------------------------------------
/** $3.20 per million compute units. */
export const COMPUTE_UNIT_CENTS = 320 / 1_000_000;
/** $1.20 per million requests. */
export const REQUEST_CENTS = 120 / 1_000_000;
/** Autoscale / Scheduled base fee: $1.00/mo. */
export const DEPLOYMENT_BASE_CENTS_PER_MONTH = 100;
/** Static + Autoscale egress: $0.10 per GiB. */
export const EGRESS_CENTS_PER_GIB = 10;

/** Object storage: $0.03 per GiB-month (min 7-day billing per object). */
export const STORAGE_CENTS_PER_GIB_MONTH = 3;
/** Minimum storage billing period in days. */
export const STORAGE_MIN_BILLING_DAYS = 7;
/** Object storage data transfer: $0.10 per GiB. */
export const STORAGE_TRANSFER_CENTS_PER_GIB = 10;
/** Class A (basic/mutating) ops: $0.0006 per 1k requests = 0.06¢/1k. */
export const STORAGE_CLASS_A_CENTS_PER_OP = 0.06 / 1000;
/** Class B (advanced/read-metadata) ops: $0.0075 per 1k requests = 0.75¢/1k. */
export const STORAGE_CLASS_B_CENTS_PER_OP = 0.75 / 1000;

export type ReservedVmTier = 'shared-0.5' | 'dedicated-1' | 'dedicated-2' | 'dedicated-4';

/** Reserved VM flat monthly rates (cents). */
export const RESERVED_VM_TIERS: Record<ReservedVmTier, { vcpu: number; ramGb: number; centsPerMonth: number }> = {
  'shared-0.5': { vcpu: 0.5, ramGb: 2, centsPerMonth: 2000 },
  'dedicated-1': { vcpu: 1, ramGb: 4, centsPerMonth: 4000 },
  'dedicated-2': { vcpu: 2, ramGb: 8, centsPerMonth: 8000 },
  'dedicated-4': { vcpu: 4, ramGb: 16, centsPerMonth: 16_000 },
};

function clampNonNeg(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

/** Round fractional cents up to a whole cent for final billing. */
export function ceilCents(cents: number): number {
  return Math.ceil(clampNonNeg(cents));
}

/** Compute units for a CPU/RAM duration (e.g. workspace runtime, deploy request). */
export function computeUnits(cpuSeconds: number, gbSeconds: number): number {
  return clampNonNeg(cpuSeconds) * CPU_SECOND_COMPUTE_UNITS + clampNonNeg(gbSeconds) * GB_SECOND_COMPUTE_UNITS;
}

/**
 * Compute units consumed by a workspace/runtime slice. `cpuMillicores` and
 * `ramMb` are the pod's allocation; `seconds` is the active duration.
 */
export function workspaceComputeUnits(cpuMillicores: number, ramMb: number, seconds: number): number {
  const secs = clampNonNeg(seconds);
  const cpuSeconds = (clampNonNeg(cpuMillicores) / 1000) * secs;
  const gbSeconds = (clampNonNeg(ramMb) / 1024) * secs;
  return computeUnits(cpuSeconds, gbSeconds);
}

/** Dollar-cents for a number of compute units. */
export function computeUnitsCents(units: number): number {
  return clampNonNeg(units) * COMPUTE_UNIT_CENTS;
}

/** Autoscale/Scheduled usage cost (excludes the flat base unless requested). */
export function autoscaleUsageCents(input: {
  computeUnits: number;
  requests?: number;
  includeBase?: boolean;
}): number {
  const usage = computeUnitsCents(input.computeUnits) + clampNonNeg(input.requests ?? 0) * REQUEST_CENTS;
  return (input.includeBase ? DEPLOYMENT_BASE_CENTS_PER_MONTH : 0) + usage;
}

/** Flat monthly cost of a Reserved VM tier. */
export function reservedVmCents(tier: ReservedVmTier): number {
  return RESERVED_VM_TIERS[tier]?.centsPerMonth ?? 0;
}

/** Static/egress data-transfer cost. */
export function egressCents(gib: number): number {
  return clampNonNeg(gib) * EGRESS_CENTS_PER_GIB;
}

/** Object-storage cost for a billing window. */
export function objectStorageCents(input: {
  gibMonths: number; // GiB × fraction-of-month stored
  transferGib?: number;
  classAOps?: number;
  classBOps?: number;
}): number {
  return (
    clampNonNeg(input.gibMonths) * STORAGE_CENTS_PER_GIB_MONTH +
    clampNonNeg(input.transferGib ?? 0) * STORAGE_TRANSFER_CENTS_PER_GIB +
    clampNonNeg(input.classAOps ?? 0) * STORAGE_CLASS_A_CENTS_PER_OP +
    clampNonNeg(input.classBOps ?? 0) * STORAGE_CLASS_B_CENTS_PER_OP
  );
}

/** Database compute billed by active hours (uses the same Reserved-VM-style CU basis). */
export function databaseComputeCents(input: { cpuMillicores: number; ramMb: number; hours: number }): number {
  return computeUnitsCents(workspaceComputeUnits(input.cpuMillicores, input.ramMb, clampNonNeg(input.hours) * 3600));
}
