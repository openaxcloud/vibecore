import { createHash } from 'node:crypto';
import { RESERVED_VM_TIERS, type ReservedVmTier } from '@vibecore/billing';
import { z } from 'zod';
import { appPublicEnglish } from './app-public-copy.js';

export const RESERVED_VM_TERMS_VERSION = 'reserved-vm-monthly-v1';

export const RESERVED_VM_PUBLIC_TIERS = (
  Object.entries(RESERVED_VM_TIERS) as Array<[ReservedVmTier, (typeof RESERVED_VM_TIERS)[ReservedVmTier]]>
).map(([id, tier]) => ({
  id,
  vcpu: tier.vcpu,
  memoryGb: tier.ramGb,
  monthlyPriceCents: tier.centsPerMonth,
}));

export type ReservedVmCapability =
  | { enabled: true; availableTiers: ReservedVmTier[] }
  | {
      enabled: false;
      reasonCode:
        | 'RESERVED_VM_DISABLED'
        | 'RESERVED_VM_OPERATOR_CONFIG_INCOMPLETE'
        | 'RESERVED_VM_STORAGE_SIZE_INVALID'
        | 'RESERVED_VM_STORAGE_CLASS_UNAVAILABLE'
        | 'RESERVED_VM_NODE_POOL_UNAVAILABLE'
        | 'RESERVED_VM_CAPABILITY_UNREACHABLE';
    };

const capabilitySchema = z.object({
  reservedVm: z.discriminatedUnion('enabled', [
    z
      .object({
        enabled: z.literal(true),
        availableTiers: z.array(z.enum(['shared-0.5', 'dedicated-1', 'dedicated-2', 'dedicated-4'])).min(1),
      })
      .passthrough(),
    z.object({
      enabled: z.literal(false),
      reasonCode: z.enum([
        'RESERVED_VM_DISABLED',
        'RESERVED_VM_OPERATOR_CONFIG_INCOMPLETE',
        'RESERVED_VM_STORAGE_SIZE_INVALID',
        'RESERVED_VM_STORAGE_CLASS_UNAVAILABLE',
        'RESERVED_VM_NODE_POOL_UNAVAILABLE',
      ]),
    }),
  ]),
});

export async function queryReservedVmCapability(input: {
  managerUrl: string;
  managerSecret?: string;
  fetchImpl?: typeof fetch;
}): Promise<ReservedVmCapability> {
  try {
    const response = await (input.fetchImpl ?? fetch)(`${input.managerUrl.replace(/\/+$/, '')}/runtime-capabilities`, {
      headers: {
        accept: 'application/json',
        ...(input.managerSecret ? { authorization: `Bearer ${input.managerSecret}` } : {}),
      },
      signal: AbortSignal.timeout(5_000),
    });

    if (!response.ok) {
      return { enabled: false, reasonCode: 'RESERVED_VM_CAPABILITY_UNREACHABLE' };
    }

    const parsed = capabilitySchema.safeParse(await response.json());

    if (!parsed.success) {
      return { enabled: false, reasonCode: 'RESERVED_VM_CAPABILITY_UNREACHABLE' };
    }

    return parsed.data.reservedVm.enabled
      ? { enabled: true, availableTiers: [...parsed.data.reservedVm.availableTiers] }
      : { enabled: false, reasonCode: parsed.data.reservedVm.reasonCode };
  } catch {
    return { enabled: false, reasonCode: 'RESERVED_VM_CAPABILITY_UNREACHABLE' };
  }
}

export function assertReservedVmConfirmation(input: {
  tier: ReservedVmTier | undefined;
  confirmation: { accepted: true; termsVersion: string; monthlyPriceCents: number } | undefined;
}): { tier: ReservedVmTier; monthlyPriceCents: number } {
  const expected = input.tier ? RESERVED_VM_TIERS[input.tier]?.centsPerMonth : undefined;

  if (!input.tier || !input.confirmation?.accepted) {
    throw Object.assign(new Error(appPublicEnglish('RESERVED_VM_CONFIRMATION_REQUIRED')), {
      code: 'RESERVED_VM_CONFIRMATION_REQUIRED',
      statusCode: 400,
    });
  }

  if (
    input.confirmation.termsVersion !== RESERVED_VM_TERMS_VERSION ||
    input.confirmation.monthlyPriceCents !== expected
  ) {
    throw Object.assign(new Error(appPublicEnglish('RESERVED_VM_PRICE_MISMATCH')), {
      code: 'RESERVED_VM_PRICE_MISMATCH',
      statusCode: 409,
    });
  }

  return { tier: input.tier, monthlyPriceCents: expected };
}

export function reservedVmRequestHash(input: Record<string, unknown>): string {
  const canonicalize = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (!value || typeof value !== 'object') return value;

    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  };

  return createHash('sha256')
    .update(JSON.stringify(canonicalize(input)))
    .digest('hex');
}
