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
  databaseBillableStorageGib,
  databaseComputeCents,
  databaseStorageCents,
  egressCents,
  objectStorageCents,
  reservedVmCents,
  workspaceComputeUnits,
  type ReservedVmTier,
} from '@vibecore/billing';
import { debitCredits } from './credits-service.js';
import type { ObjectStorage } from './object-storage.js';
import type { ApiStore } from './store.js';

export interface MeterResult {
  costCents: number;
  fromPacks: number;
  fromBalance: number;

  /**
   * Usage cost not covered by credit packs or wallet balance — the pay-as-you-go
   * overage (billed to Stripe, counts toward the spend cap). 0 in shadow mode.
   */
  paygCents: number;
  shadow: boolean;
}

async function charge(
  store: ApiStore,
  input: {
    organizationId: string;
    costCents: number;
    reason: string;
    shadow?: boolean;
    nowMs: number;

    /**
     * Stable dedup key for the PAYG tracking-ledger entry. When provided (and the
     * usage incurs an overage beyond packs+balance), the overage is recorded as a
     * PAYG_CHARGE ledger row so `sumPaygSpendSince` — which drives the spend cap
     * (`checkServiceShutdown`) and 50/80/100% alerts — counts usage-based overage,
     * not just agent checkpoints. Deduped by (org, reference), so an idempotent
     * re-meter never double-counts. Omitted → no tracking row (overage still
     * overflows in the wallet exactly as before, no regression).
     */
    paygReference?: string;
  },
): Promise<MeterResult> {
  const cents = ceilCents(input.costCents);

  if (input.shadow || cents <= 0) {
    return { costCents: cents, fromPacks: 0, fromBalance: 0, paygCents: 0, shadow: Boolean(input.shadow) };
  }

  const { fromPacks, fromBalance } = await debitCredits(store, {
    organizationId: input.organizationId,
    amountCents: cents,
    reason: input.reason,
    nowMs: input.nowMs,
  });

  const paygCents = Math.max(0, cents - fromPacks - fromBalance);

  if (paygCents > 0 && input.paygReference) {
    await store
      .recordPaygCharge({ organizationId: input.organizationId, checkpointId: input.paygReference, cents: paygCents })
      .catch(() => {
        /* tracking-only; never block metering on a ledger write */
      });
  }

  return { costCents: cents, fromPacks, fromBalance, paygCents, shadow: false };
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
    paygReference?: string;
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
    paygReference: input.paygReference,
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
    paygReference?: string;
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
    paygReference: input.paygReference,
  });
}

const BYTES_PER_GIB = 1024 ** 3;

/**
 * Daily object-storage metering sweep (Replit-parity $0.03/GiB-month). Sums the
 * real stored bytes per org and meters one day's worth of GiB-months (so the
 * monthly total accrues across daily runs). Idempotent at the day granularity:
 * run once per day from the cron. SHADOW-safe via the `shadow` flag.
 */
/**
 * AUDX-023 — walk every project's REAL GCS bucket and persist what is there.
 *
 * `aggregateStorageBytesByOrg` sums `ProjectStorageObject.byteLength`: base64
 * archives held in PostgreSQL, written only by the snapshot/export path. The
 * `/object-storage/*` routes write to GCS and never touch that table, so bytes
 * uploaded through a signed URL were counted by nobody — while the sweep's own
 * comment claimed it summed "the REAL stored bytes".
 *
 * Uses `listAllObjects`, which pages to the end. `listObjects` returns ONE page
 * and stops at 1 000 objects (AUDX-024); an inventory built on it would swap one
 * wrong number for another.
 *
 * A project whose bucket does not exist yet contributes 0 and is NOT recorded —
 * absence of a bucket is not a measurement of zero, and writing 0 would let a
 * later quota check treat "never provisioned" as "measured empty".
 */
export async function inventoryObjectStorage(
  store: ApiStore,
  objectStorage: Pick<ObjectStorage, 'listAllObjects'>,
  input: { nowMs: number },
): Promise<{ projectsMeasured: number; projectsSkipped: number; bytesByOrg: Map<string, number>; totalBytes: number }> {
  const projects = await store.listAllProjectsForStorageInventory();
  const bytesByOrg = new Map<string, number>();
  const measuredAt = new Date(input.nowMs);

  let projectsMeasured = 0;
  let projectsSkipped = 0;
  let totalBytes = 0;

  for (const project of projects) {
    let inventory: Awaited<ReturnType<ObjectStorage['listAllObjects']>>;

    try {
      inventory = await objectStorage.listAllObjects(project.id);
    } catch {
      /*
       * No bucket, or GCS refused. Skipped and COUNTED as skipped: a sweep that
       * silently treated an unreadable bucket as empty would under-report usage
       * and under-bill, which is the very defect being fixed. The caller must be
       * able to see that the inventory was incomplete.
       */
      projectsSkipped += 1;
      continue;
    }

    projectsMeasured += 1;
    totalBytes += inventory.totalBytes;
    bytesByOrg.set(project.organizationId, (bytesByOrg.get(project.organizationId) ?? 0) + inventory.totalBytes);

    // Written only AFTER a successful listing, never on the failure path above.
    await store.recordProjectObjectStorageUsage({
      projectId: project.id,
      bytes: inventory.totalBytes,
      objectCount: inventory.objects.length,
      measuredAt,
    });
  }

  return { projectsMeasured, projectsSkipped, bytesByOrg, totalBytes };
}

export async function meterAllObjectStorage(
  store: ApiStore,
  input: {
    shadow?: boolean;
    nowMs: number;
    daysInPeriod?: number;
    /*
     * AUDX-023 — when given, the sweep inventories the REAL GCS buckets and adds
     * those bytes to the PostgreSQL archive total.
     *
     * ⚠️ OPT-IN, and it must stay opt-in until someone decides the billing
     * question: turning it on starts counting bytes that were NEVER counted, so
     * metered storage rises for anyone using object storage. That is a pricing
     * decision (D-03 = Avi), not an engineering one. With this absent the sweep
     * behaves exactly as before, to the byte.
     */
    objectStorage?: Pick<ObjectStorage, 'listAllObjects'>;
  },
): Promise<{
  orgsMetered: number;
  totalBytes: number;
  shadow: boolean;
  gcsBytes?: number;
  projectsMeasured?: number;
  projectsSkipped?: number;
}> {
  const days = input.daysInPeriod && input.daysInPeriod > 0 ? input.daysInPeriod : 30;
  const archiveRows = await store.aggregateStorageBytesByOrg();

  const inventory = input.objectStorage
    ? await inventoryObjectStorage(store, input.objectStorage, { nowMs: input.nowMs })
    : undefined;

  /*
   * Merge the two sources per org. An org holding ONLY GCS objects has no row in
   * `aggregateStorageBytesByOrg` at all — iterating the archive rows alone would
   * silently skip it, which is exactly how the GCS bytes went unbilled.
   */
  const merged = new Map<string, number>();

  for (const row of archiveRows) {
    merged.set(row.organizationId, (merged.get(row.organizationId) ?? 0) + row.bytes);
  }

  if (inventory) {
    for (const [organizationId, bytes] of inventory.bytesByOrg) {
      merged.set(organizationId, (merged.get(organizationId) ?? 0) + bytes);
    }
  }

  const rows = [...merged.entries()].map(([organizationId, bytes]) => ({ organizationId, bytes }));

  let totalBytes = 0;
  let orgsMetered = 0;

  // UTC midnight of the current day — the idempotency window for the daily sweep.
  const dayStartMs = Math.floor(input.nowMs / 86_400_000) * 86_400_000;

  // UTC-day key so the advisory lock auto-expires the dedup window (next day = new key).
  const utcDay = Math.floor(input.nowMs / 86_400_000);

  for (const row of rows) {
    totalBytes += row.bytes;

    /*
     * Idempotent per (org, UTC-day): skip orgs already metered for storage today so
     * a duplicate run (pod restart mid-sweep, double-schedule, manual re-trigger of
     * POST /internal/metering/object-storage) can't double-record the usage event
     * or double-charge the day's GiB-months. meterObjectStorage records a
     * storage.objectGiBMonths event, which is what we check for here.
     *
     * The check-then-meter is a read-then-write, so it must run inside a per-(org,
     * UTC-day) advisory lock — otherwise two overlapping sweeps can both pass the
     * existence check before either records its event (TOCTOU), then both meter and
     * double-charge. withSerializedMutation serializes the critical section across
     * pods so the second caller observes the first caller's recorded event and skips.
     */
    const metered = await store.withSerializedMutation(
      `metering:object-storage:${utcDay}:${row.organizationId}`,
      async () => {
        if (await store.hasUsageEventSince(row.organizationId, 'storage.objectGiBMonths', dayStartMs)) {
          return false;
        }

        // bytes held for one day → GiB-months charged today = (bytes/GiB) * (1 / period days).
        const gibMonths = row.bytes / BYTES_PER_GIB / days;
        await meterObjectStorage(store, {
          organizationId: row.organizationId,
          gibMonths,
          shadow: input.shadow,
          nowMs: input.nowMs,
          paygReference: `usage:object-storage:${utcDay}:${row.organizationId}`,
        });

        return true;
      },
    );

    if (metered) {
      orgsMetered += 1;
    }
  }

  return {
    orgsMetered,
    totalBytes,
    shadow: Boolean(input.shadow),
    ...(inventory
      ? {
          gcsBytes: inventory.totalBytes,
          projectsMeasured: inventory.projectsMeasured,
          projectsSkipped: inventory.projectsSkipped,
        }
      : {}),
  };
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
    paygReference?: string;
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
    paygReference: input.paygReference,
  });
}

/**
 * Meter database STORAGE (Replit parity — $0.03/GiB-month by the period's max
 * GiB). `billableGib` is the storage to charge, ALREADY floored (33 MB/DB) and
 * capped (10 GiB/DB) by the caller via {@link databaseBillableStorageGib} — kept
 * pre-applied so a sweep can sum several DBs without the org total being re-capped
 * at 10 GiB. `monthFraction` lets a daily sweep charge one day's fraction. Records
 * a `database.storageGiBMonths` usage event then debits credits (unless shadow).
 */
export async function meterDatabaseStorage(
  store: ApiStore,
  input: {
    organizationId: string;
    billableGib: number;

    /** Fraction-of-month the storage was held (daily sweep passes 1/daysInPeriod). */
    monthFraction?: number;
    shadow?: boolean;
    nowMs: number;
    paygReference?: string;
  },
): Promise<MeterResult & { billableGib: number; gibMonths: number }> {
  const billableGib = Math.max(0, input.billableGib);
  const gibMonths = billableGib * (input.monthFraction ?? 1);
  await store.recordUsageEvent({
    organizationId: input.organizationId,
    type: 'database.storageGiBMonths',
    quantity: Math.ceil(gibMonths),
    metadata: { billableGib },
  });

  const result = await charge(store, {
    organizationId: input.organizationId,
    costCents: databaseStorageCents(gibMonths),
    reason: 'database storage',
    shadow: input.shadow,
    nowMs: input.nowMs,
    paygReference: input.paygReference,
  });

  return { ...result, billableGib, gibMonths };
}

/**
 * Daily database-storage metering sweep (Replit parity). Sums each org's REAL
 * stored bytes across its ACTIVE database instances — applying the 33 MB floor +
 * 10 GiB cap PER DATABASE (so an empty DB still bills the floor) — and meters one
 * day's worth of GiB-months so the monthly total accrues across daily runs.
 * Idempotent per (org, UTC-day) under an advisory lock, mirroring
 * {@link meterAllObjectStorage}. SHADOW-safe via the `shadow` flag.
 */
export async function meterAllDatabaseStorage(
  store: ApiStore,
  input: { shadow?: boolean; nowMs: number; daysInPeriod?: number },
): Promise<{ orgsMetered: number; instances: number; shadow: boolean }> {
  const days = input.daysInPeriod && input.daysInPeriod > 0 ? input.daysInPeriod : 30;
  const instances = await store.listActiveDatabaseInstances();

  /*
   * Sum billable GiB per org, applying the floor/cap PER instance (Replit bills
   * the 33 MB floor per database, not per org).
   */
  const billableByOrg = new Map<string, { gib: number; count: number }>();

  for (const instance of instances) {
    const usedMb = Number(instance.sizeBytes ?? 0) / (1024 * 1024);
    const gib = databaseBillableStorageGib(usedMb);
    const entry = billableByOrg.get(instance.organizationId) ?? { gib: 0, count: 0 };
    entry.gib += gib;
    entry.count += 1;
    billableByOrg.set(instance.organizationId, entry);
  }

  const dayStartMs = Math.floor(input.nowMs / 86_400_000) * 86_400_000;
  const utcDay = Math.floor(input.nowMs / 86_400_000);

  let orgsMetered = 0;
  let meteredInstances = 0;

  for (const [organizationId, { gib, count }] of billableByOrg) {
    const metered = await store.withSerializedMutation(
      `metering:database-storage:${utcDay}:${organizationId}`,
      async () => {
        if (await store.hasUsageEventSince(organizationId, 'database.storageGiBMonths', dayStartMs)) {
          return false;
        }

        // `gib` is already the org's total billable GiB (floor/cap applied per DB).
        await meterDatabaseStorage(store, {
          organizationId,
          billableGib: gib,
          monthFraction: 1 / days,
          shadow: input.shadow,
          nowMs: input.nowMs,
          paygReference: `usage:database-storage:${utcDay}:${organizationId}`,
        });

        return true;
      },
    );

    if (metered) {
      orgsMetered += 1;
      meteredInstances += count;
    }
  }

  return { orgsMetered, instances: meteredInstances, shadow: Boolean(input.shadow) };
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
    paygReference?: string;

    /** Extra audit fields for the usage event (machineSize, rateCardVersion…). */
    metadata?: Record<string, unknown>;
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
    metadata: { kind: input.kind, requests: input.requests, reservedTier: input.reservedTier, ...input.metadata },
  });

  return charge(store, {
    organizationId: input.organizationId,
    costCents: cost,
    reason: `deployment ${input.kind}`,
    shadow: input.shadow,
    nowMs: input.nowMs,
    paygReference: input.paygReference,
  });
}
