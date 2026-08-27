/** @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { ensureDeploymentIdempotencyKey, resolveDeploymentIdempotencyKey } from './deployment-idempotency';

afterEach(() => vi.restoreAllMocks());

describe('deployment idempotency attempts', () => {
  it('preserves a safe 16..128 character key across retries', () => {
    const key = 'runtime-attempt-0001';

    expect(resolveDeploymentIdempotencyKey(`  ${key}  `)).toBe(key);

    const form = document.createElement('form');
    const input = document.createElement('input');

    input.name = 'idempotencyKey';
    input.value = key;
    form.append(input);
    ensureDeploymentIdempotencyKey(form);
    ensureDeploymentIdempotencyKey(form);
    expect(input.value).toBe(key);
  });

  it('generates once for an empty or unsafe hidden value, then stabilizes that attempt', () => {
    const generated = '11111111-1111-4111-8111-111111111111';
    const randomUuid = vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(generated);
    const form = document.createElement('form');
    const input = document.createElement('input');

    input.name = 'idempotencyKey';
    input.value = 'unsafe key';
    form.append(input);

    ensureDeploymentIdempotencyKey(form);
    ensureDeploymentIdempotencyKey(form);

    expect(input.value).toBe(generated);
    expect(randomUuid).toHaveBeenCalledTimes(1);
    expect(resolveDeploymentIdempotencyKey('short')).toBe(generated);
  });
});
