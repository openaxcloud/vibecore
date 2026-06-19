/**
 * Compute / object-storage / database / deployment metering (Replit parity).
 *
 * Each function attributes real resource usage to an org: it records a usage
 * event (audit + quota) and, unless `shadow`, debits credits (packs then wallet
 * balance) at the exact Replit rates from `@vibecore/billing` compute-pricing.
 *
 * Callers pass the INCREMENTAL usage since the last meter (e.g. seconds of
 * runtime accrued this GC sweep) — these functions are not idempotent on their
 * own; the caller owns the "last metered at" marker. See spec §16.4 / P4.
 */
import {
  autoscaleUsageCents,
  ceilCents,
  computeUnitsCents,
  databaseComputeCents,
  egressCents,
  objectStorageCents,
  reservedVmCents,
  workspaceComputeUnits,
  type ReservedVmTier,
} from '@vibecore/billing';
import { debitCredits } from './credits-service.js';
import type { ApiStore } from './store.js';

export interface MeterResult {
  costCents: number;
  fromPacks: number;
  fromBalance: number;
  shadow: boolean;
}

async function charge(
  store: ApiStore,
  input: { organizationId: string; costCents: number; reason: string; shadow?: boolean; nowMs: number },
): Promise<MeterResult> {
  const cents = ceilCents(input.costCents);

  if (input.shadow || cents <= 0) {
    return { costCents: cents, fromPacks: 0, fromBalance: 0, shadow: Boolean(input.shadow) };
  }

  const { fromPacks, fromBalance } = await debitCredits(store, {
    organizationId: input.organizationId,
    amountCents: cents,
    reason: input.reason,
    nowMs: input.nowMs,
  });

  return { costCents: cents, fromPacks, fromBalance, shadow: false };
}

/**
 * Meter a slice of workspace runtime. Also fills the long-declared-but-unmetered
 *  `workspaces.runtimeMinutes` quota.
 */
export async function meterWorkspaceCompute(
  store: ApiStore,
  input: {
    organizationId: string;
    projectId?: string;
    cpuMillicores: number;
    ramMb: number;
    seconds: number;
    shadow?: boolean;
    nowMs: number;
  },
): Promise<MeterResult & { computeUnits: number; minutes: number }> {
  const units = workspaceComputeUnits(input.cpuMillicores, input.ramMb, input.seconds);
  const minutes = Math.max(0, Math.round(input.seconds / 60));
  await store.recordUsageEvent({
    organizationId: input.organizationId,
    type: 'workspaces.runtimeMinutes',
    quantity: minutes,
    metadata: { projectId: input.projectId, computeUnits: units },
  });

  const result = await charge(store, {
    organizationId: input.organizationId,
    costCents: computeUnitsCents(units),
    reason: 'workspace compute',
    shadow: input.shadow,
    nowMs: input.nowMs,
  });

  return { ...result, computeUnits: units, minutes };
}

/** Meter object storage: storage GiB-months + transfer + ops. */
export async function meterObjectStorage(
  store: ApiStore,
  input: {
    organizationId: string;
    gibMonths?: number;
    transferGib?: number;
    classAOps?: number;
    classBOps?: number;
    shadow?: boolean;
    nowMs: number;
  },
): Promise<MeterResult> {
  await store.recordUsageEvent({
    organizationId: input.organizationId,
    type: 'storage.objectGiBMonths',
    quantity: Math.ceil(input.gibMonths ?? 0),
    metadata: { transferGib: input.transferGib, classAOps: input.classAOps, classBOps: input.classBOps },
  });
  return charge(store, {
    organizationId: input.organizationId,
    costCents: objectStorageCents({
      gibMonths: input.gibMonths ?? 0,
      transferGib: input.transferGib,
      classAOps: input.classAOps,
      classBOps: input.classBOps,
    }),
    reason: 'object storage',
    shadow: input.shadow,
    nowMs: input.nowMs,
  });
}

const BYTES_PER_GIB = 1024 ** 3;

/**
 * Daily object-storage metering sweep (Replit-parity $0.03/GiB-month). Sums the
 * real stored bytes per org and meters one day's worth of GiB-months (so the
 * monthly total accrues across daily runs). Idempotent at the day granularity:
 * run once per day from the cron. SHADOW-safe via the `shadow` flag.
 */
export async function meterAllObjectStorage(
  store: ApiStore,
  input: { shadow?: boolean; nowMs: number; daysInPeriod?: number },
): Promise<{ orgsMetered: number; totalBytes: number; shadow: boolean }> {
  const days = input.daysInPeriod && input.daysInPeriod > 0 ? input.daysInPeriod : 30;
  const rows = await store.aggregateStorageBytesByOrg();

  let totalBytes = 0;

  for (const row of rows) {
    totalBytes += row.bytes;

    // bytes held for one day → GiB-months charged today = (bytes/GiB) * (1 / period days).
    const gibMonths = row.bytes / BYTES_PER_GIB / days;
    await meterObjectStorage(store, {
      organizationId: row.organizationId,
      gibMonths,
      shadow: input.shadow,
      nowMs: input.nowMs,
    });
  }

  return { orgsMetered: rows.length, totalBytes, shadow: Boolean(input.shadow) };
}

/** Meter database compute by active hours. */
export async function meterDatabaseCompute(
  store: ApiStore,
  input: {
    organizationId: string;
    cpuMillicores: number;
    ramMb: number;
    hours: number;
    shadow?: boolean;
    nowMs: number;
  },
): Promise<MeterResult> {
  await store.recordUsageEvent({
    organizationId: input.organizationId,
    type: 'database.activeHours',
    quantity: Math.ceil(input.hours),
  });
  return charge(store, {
    organizationId: input.organizationId,
    costCents: databaseComputeCents({ cpuMillicores: input.cpuMillicores, ramMb: input.ramMb, hours: input.hours }),
    reason: 'database compute',
    shadow: input.shadow,
    nowMs: input.nowMs,
  });
}

export type DeploymentKind = 'autoscale' | 'scheduled' | 'static' | 'reserved-vm';

/** Meter a deployment slice at the exact Replit tier rates. */
export async function meterDeployment(
  store: ApiStore,
  input: {
    organizationId: string;
    kind: DeploymentKind;
    computeUnits?: number;
    requests?: number;
    egressGib?: number;
    reservedTier?: ReservedVmTier;
    includeBase?: boolean;
    shadow?: boolean;
    nowMs: number;
  },
): Promise<MeterResult> {
  let cost = 0;

  switch (input.kind) {
    case 'autoscale':
    case 'scheduled':
      cost = autoscaleUsageCents({
        computeUnits: input.computeUnits ?? 0,
        requests: input.requests,
        includeBase: input.includeBase,
      });
      break;
    case 'static':
      cost = egressCents(input.egressGib ?? 0);
      break;
    case 'reserved-vm':
      cost = input.reservedTier ? reservedVmCents(input.reservedTier) : 0;
      break;
  }
  await store.recordUsageEvent({
    organizationId: input.organizationId,
    type: 'deployment.compute',

    /*
     * `quantity` here is a usage-event marker used to detect "metered exactly
     * once" (sumUsage), NOT the billable amount — the real charge is `cost`,
     * computed above via egressCents/autoscaleUsageCents/reservedVmCents. So the
     * `?? 1` floor keeps a kind without computeUnits/egressGib (e.g. a $0 static
     * deploy) recording a single marker event, which the idempotency guard relies
     * on. Changing it to 0 does not affect billing and breaks that signal.
     */
    quantity: Math.ceil(input.computeUnits ?? input.egressGib ?? 1),
    metadata: { kind: input.kind, requests: input.requests, reservedTier: input.reservedTier },
  });

  return charge(store, {
    organizationId: input.organizationId,
    costCents: cost,
    reason: `deployment ${input.kind}`,
    shadow: input.shadow,
    nowMs: input.nowMs,
  });
}
