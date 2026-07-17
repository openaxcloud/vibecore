/**
 * Versioned Rate Card — the single priced catalogue for deployment compute.
 *
 * Prices used to be scattered as loose constants (compute-pricing.ts) and
 * hard-coded UI strings; the rate card gathers them into ONE versioned,
 * serializable document. The BUILT-IN card below is version 1 and doubles as
 * the seed for the `RateCard` DB row: the api serves the ACTIVE card from the
 * DB (falling back to this built-in when none is active), and every metering
 * event stamps the card version it was priced with — so a future price change
 * is a NEW version, never a silent mutation of history.
 *
 * Machine sizes follow Replit's ladder (0.25 → 8 vCPU, RAM = 4×vCPU GiB).
 * `requests == limits` on the runtime pod: the size the user picked is the
 * machine they get AND the machine they are billed for.
 */
import {
  COMPUTE_UNIT_CENTS,
  CPU_SECOND_COMPUTE_UNITS,
  DEPLOYMENT_BASE_CENTS_PER_MONTH,
  EGRESS_CENTS_PER_GIB,
  GB_SECOND_COMPUTE_UNITS,
  REQUEST_CENTS,
} from './compute-pricing.js';
import type { PlanKey } from './index.js';

export type DeployMachineSizeKey =
  | 'shared-0.25'
  | 'shared-0.5'
  | 'dedicated-1'
  | 'dedicated-2'
  | 'dedicated-4'
  | 'dedicated-8';

export interface DeployMachineSize {
  key: DeployMachineSizeKey;

  /** Human label, e.g. "0.5 vCPU · 2 GiB". */
  label: string;
  vcpu: number;
  ramGb: number;
  cpuMillicores: number;
  ramMb: number;

  /**
   * Compute units burned per ACTIVE second at this size (Replit formula:
   * 18 u/CPU-s + 2 u/GiB-s). Pre-computed so metering never re-derives it.
   */
  computeUnitsPerSecond: number;
}

function machineSize(key: DeployMachineSizeKey, vcpu: number, ramGb: number): DeployMachineSize {
  return {
    key,
    label: `${vcpu} vCPU · ${ramGb} GiB`,
    vcpu,
    ramGb,
    cpuMillicores: Math.round(vcpu * 1000),
    ramMb: Math.round(ramGb * 1024),
    computeUnitsPerSecond: vcpu * CPU_SECOND_COMPUTE_UNITS + ramGb * GB_SECOND_COMPUTE_UNITS,
  };
}

/** The deploy machine-size ladder (RAM = 4×vCPU GiB, Replit-parity). */
export const DEPLOY_MACHINE_SIZES: Record<DeployMachineSizeKey, DeployMachineSize> = {
  'shared-0.25': machineSize('shared-0.25', 0.25, 1),
  'shared-0.5': machineSize('shared-0.5', 0.5, 2),
  'dedicated-1': machineSize('dedicated-1', 1, 4),
  'dedicated-2': machineSize('dedicated-2', 2, 8),
  'dedicated-4': machineSize('dedicated-4', 4, 16),
  'dedicated-8': machineSize('dedicated-8', 8, 32),
};

export const DEFAULT_DEPLOY_MACHINE_SIZE: DeployMachineSizeKey = 'shared-0.5';

/**
 * Per-plan ceiling on the machine size a deployment may request, in vCPU.
 * Guard-rail: the free plan can never publish on the 8-vCPU size.
 */
export const PLAN_MAX_MACHINE_VCPU: Record<PlanKey, number> = {
  free: 4,
  starter: 8,
  core: 8,
  pro: 8,
  team: 8,
  enterprise: 8,
};

export interface RateCard {
  /** Monotonic version — a price change is a NEW version. */
  version: number;

  /** ISO date the card became effective. */
  effectiveAt: string;
  currency: 'usd';
  compute: {
    cpuSecondUnits: number;
    gbSecondUnits: number;

    /** Cents per ONE compute unit (fractional). */
    unitCents: number;

    /** Cents per ONE request (fractional). */
    requestCents: number;
    baseCentsPerMonth: number;
    egressCentsPerGib: number;
  };
  machineSizes: DeployMachineSize[];
  planMaxMachineVcpu: Record<string, number>;
}

/** Version 1 — transcribed from the loose compute-pricing constants. */
export const BUILTIN_RATE_CARD: RateCard = {
  version: 1,
  effectiveAt: '2026-07-16T00:00:00.000Z',
  currency: 'usd',
  compute: {
    cpuSecondUnits: CPU_SECOND_COMPUTE_UNITS,
    gbSecondUnits: GB_SECOND_COMPUTE_UNITS,
    unitCents: COMPUTE_UNIT_CENTS,
    requestCents: REQUEST_CENTS,
    baseCentsPerMonth: DEPLOYMENT_BASE_CENTS_PER_MONTH,
    egressCentsPerGib: EGRESS_CENTS_PER_GIB,
  },
  machineSizes: Object.values(DEPLOY_MACHINE_SIZES),
  planMaxMachineVcpu: PLAN_MAX_MACHINE_VCPU,
};

/** Resolve a size key against a card, degrading to the default (never throws). */
export function machineSizeFromCard(card: RateCard, key: string | null | undefined): DeployMachineSize {
  const found = card.machineSizes.find((size) => size.key === key);
  return found ?? card.machineSizes.find((size) => size.key === DEFAULT_DEPLOY_MACHINE_SIZE) ?? card.machineSizes[0];
}

/**
 * Compute units for an ACTIVE window at a size. NEVER returns 0 for a
 * non-empty window: billing a running machine 0 is always a bug, so the
 * result has a floor of 1 unit (Replit bills the same way — usage is
 * metered, but never free while the machine is up).
 */
export function machineComputeUnits(size: DeployMachineSize, activeSeconds: number): number {
  const seconds = Number.isFinite(activeSeconds) ? Math.max(0, activeSeconds) : 0;

  if (seconds === 0) {
    return 0;
  }

  return Math.max(1, size.computeUnitsPerSecond * seconds);
}

/**
 * The machine sizes a given plan may pick from the card, annotated with the
 * platform's CURRENT scheduling ceiling (maxSchedulableVcpu — node allocatable
 * is finite; a size the cluster cannot place must be visible but not
 * selectable, otherwise "publish" would hang a pod in Pending forever).
 */
export function availableMachineSizes(
  card: RateCard,
  planKey: string,
  maxSchedulableVcpu: number,
): Array<DeployMachineSize & { available: boolean; reason?: 'plan' | 'capacity' }> {
  const planMax = card.planMaxMachineVcpu[planKey] ?? card.planMaxMachineVcpu.free ?? 4;

  return card.machineSizes.map((size) => {
    if (size.vcpu > planMax) {
      return { ...size, available: false, reason: 'plan' as const };
    }

    if (size.vcpu > maxSchedulableVcpu) {
      return { ...size, available: false, reason: 'capacity' as const };
    }

    return { ...size, available: true };
  });
}
