/**
 * Active Rate Card resolution — DB-backed, versioned, with a built-in fallback.
 *
 * The DB row (`RateCard`, seeded by migration 0070) is authoritative so a price
 * change is an INSERT + active flip, not a deploy. The built-in card from
 * packages/billing is the fallback when the table is empty or the stored JSON
 * fails validation — pricing must never 500 a publish.
 *
 * Cached for 60s per process: the deploy path and the metering sweep both read
 * it on every call, and a stale-by-a-minute price is harmless (the metering
 * event stamps the version it actually used).
 */
import {
  BUILTIN_RATE_CARD,
  availableMachineSizes,
  machineSizeFromCard,
  type DeployMachineSize,
  type RateCard,
} from '@vibecore/billing';
import { z } from 'zod';

import type { ApiStore } from './store.js';

const machineSizeSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  vcpu: z.number().positive(),
  ramGb: z.number().positive(),
  cpuMillicores: z.number().int().positive(),
  ramMb: z.number().int().positive(),
  computeUnitsPerSecond: z.number().positive(),
});

const rateCardSchema = z.object({
  version: z.number().int().positive(),
  effectiveAt: z.string().min(1),
  currency: z.literal('usd'),
  compute: z.object({
    cpuSecondUnits: z.number().positive(),
    gbSecondUnits: z.number().positive(),
    unitCents: z.number().positive(),
    requestCents: z.number().positive(),
    baseCentsPerMonth: z.number().nonnegative(),
    egressCentsPerGib: z.number().nonnegative(),
  }),
  machineSizes: z.array(machineSizeSchema).min(1),
  planMaxMachineVcpu: z.record(z.number().positive()),
});

const CACHE_TTL_MS = 60_000;

let cached: { card: RateCard; at: number } | undefined;

/** Test hook: drop the process-level cache. */
export function resetRateCardCache() {
  cached = undefined;
}

export async function getActiveRateCard(store: Pick<ApiStore, 'getActiveRateCard'>): Promise<RateCard> {
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.card;
  }

  let card: RateCard = BUILTIN_RATE_CARD;

  try {
    const row = await store.getActiveRateCard();

    if (row) {
      const parsed = rateCardSchema.safeParse(row.data);

      if (parsed.success) {
        card = parsed.data as RateCard;
      } else {
        console.error('rate-card: active DB row failed validation, using built-in card', {
          version: row.version,
          issues: parsed.error.issues.slice(0, 3),
        });
      }
    }
  } catch (error) {
    console.error('rate-card: read failed, using built-in card', { error: (error as Error).message });
  }

  cached = { card, at: Date.now() };

  return card;
}

/**
 * The cluster's CURRENT per-pod scheduling ceiling in vCPU. Nodes are
 * e2-standard-4 (3920m allocatable) today, so anything above 2 vCPU
 * requests==limits cannot be placed; the default is deliberately the measured
 * truth, not the catalogue's ambition. Raise via env when a bigger node pool
 * lands — the catalogue then opens up without a code change.
 */
export function maxSchedulableVcpu(): number {
  const parsed = Number(process.env.SERVER_DEPLOY_MAX_VCPU);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 2;
}

export class MachineSizeError extends Error {
  statusCode = 400;

  constructor(
    message: string,
    readonly code: 'MACHINE_SIZE_UNKNOWN' | 'MACHINE_SIZE_PLAN' | 'MACHINE_SIZE_CAPACITY',
  ) {
    super(message);
  }
}

/**
 * Resolve + authorize the machine size for a publish. Unknown key → 400 (an
 * explicit user choice is never silently downgraded); size above the plan
 * ceiling or the scheduling ceiling → 400 with a distinct code. Absent key →
 * the card's default size.
 */
export function resolveDeployMachineSize(
  card: RateCard,
  requested: string | undefined,
  planKey: string,
): DeployMachineSize {
  const size = requested ? card.machineSizes.find((candidate) => candidate.key === requested) : undefined;

  if (requested && !size) {
    throw new MachineSizeError(`Unknown machine size '${requested}'.`, 'MACHINE_SIZE_UNKNOWN');
  }

  const resolved = size ?? machineSizeFromCard(card, undefined);

  const annotated = availableMachineSizes(card, planKey, maxSchedulableVcpu()).find(
    (candidate) => candidate.key === resolved.key,
  );

  if (annotated && !annotated.available) {
    if (annotated.reason === 'plan') {
      throw new MachineSizeError(
        `The ${resolved.label} size is not available on the ${planKey} plan.`,
        'MACHINE_SIZE_PLAN',
      );
    }

    throw new MachineSizeError(
      `The ${resolved.label} size is temporarily unavailable (capacity).`,
      'MACHINE_SIZE_CAPACITY',
    );
  }

  return resolved;
}

/** k8s quantity strings for a size — requests == limits by contract. */
export function machineSizeResources(size: DeployMachineSize): {
  cpuRequest: string;
  cpuLimit: string;
  memoryRequest: string;
  memoryLimit: string;
} {
  const cpu = `${size.cpuMillicores}m`;
  const memory = `${size.ramMb}Mi`;

  return { cpuRequest: cpu, cpuLimit: cpu, memoryRequest: memory, memoryLimit: memory };
}
