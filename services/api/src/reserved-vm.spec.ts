import { describe, expect, it, vi } from 'vitest';

import {
  assertReservedVmConfirmation,
  queryReservedVmCapability,
  RESERVED_VM_PUBLIC_TIERS,
  RESERVED_VM_TERMS_VERSION,
  reservedVmRequestHash,
} from './reserved-vm.js';

describe('Reserved VM API contract', () => {
  it('publishes exactly the four fixed monthly tiers', () => {
    expect(RESERVED_VM_PUBLIC_TIERS).toEqual([
      { id: 'shared-0.5', vcpu: 0.5, memoryGb: 2, monthlyPriceCents: 2_000 },
      { id: 'dedicated-1', vcpu: 1, memoryGb: 4, monthlyPriceCents: 4_000 },
      { id: 'dedicated-2', vcpu: 2, memoryGb: 8, monthlyPriceCents: 8_000 },
      { id: 'dedicated-4', vcpu: 4, memoryGb: 16, monthlyPriceCents: 16_000 },
    ]);
  });

  it('requires explicit acceptance of the exact current terms and price', () => {
    expect(() => assertReservedVmConfirmation({ tier: 'shared-0.5', confirmation: undefined })).toThrow(
      /confirmation is required/i,
    );
    expect(() =>
      assertReservedVmConfirmation({
        tier: 'shared-0.5',
        confirmation: { accepted: true, termsVersion: RESERVED_VM_TERMS_VERSION, monthlyPriceCents: 4_000 },
      }),
    ).toThrow(/price confirmation is stale/i);
    expect(
      assertReservedVmConfirmation({
        tier: 'dedicated-4',
        confirmation: { accepted: true, termsVersion: RESERVED_VM_TERMS_VERSION, monthlyPriceCents: 16_000 },
      }),
    ).toEqual({ tier: 'dedicated-4', monthlyPriceCents: 16_000 });
  });

  it('advertises capability only for a valid live manager response and otherwise fails closed', async () => {
    const enabledFetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            reservedVm: {
              enabled: true,
              availableTiers: ['shared-0.5', 'dedicated-1', 'dedicated-2', 'dedicated-4'],
              storageGi: 50,
            },
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        ),
    );
    await expect(
      queryReservedVmCapability({ managerUrl: 'http://manager.test/', fetchImpl: enabledFetch as typeof fetch }),
    ).resolves.toEqual({
      enabled: true,
      availableTiers: ['shared-0.5', 'dedicated-1', 'dedicated-2', 'dedicated-4'],
    });
    expect(enabledFetch).toHaveBeenCalledWith(
      'http://manager.test/runtime-capabilities',
      expect.objectContaining({ headers: expect.objectContaining({ accept: 'application/json' }) }),
    );

    for (const fetchImpl of [
      vi.fn(async () => new Response('{}', { status: 200 })),
      vi.fn(async () => new Response('unavailable', { status: 503 })),
      vi.fn(async () => {
        throw new Error('network unavailable');
      }),
    ]) {
      await expect(
        queryReservedVmCapability({ managerUrl: 'http://manager.test', fetchImpl: fetchImpl as typeof fetch }),
      ).resolves.toEqual({ enabled: false, reasonCode: 'RESERVED_VM_CAPABILITY_UNREACHABLE' });
    }
  });

  it('hashes the same intent identically regardless of object key order', () => {
    expect(reservedVmRequestHash({ tier: 'dedicated-1', projectId: 'project-1' })).toBe(
      reservedVmRequestHash({ projectId: 'project-1', tier: 'dedicated-1' }),
    );
  });
});
