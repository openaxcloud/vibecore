export const DEPLOYMENT_IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/u;

export function resolveDeploymentIdempotencyKey(value: string | null | undefined): string {
  const candidate = value?.trim() ?? '';

  return DEPLOYMENT_IDEMPOTENCY_KEY_PATTERN.test(candidate) ? candidate : globalThis.crypto.randomUUID();
}

/**
 * Populate the hidden key synchronously before React Router serializes a Form.
 * The DOM value remains unchanged after a failed action, making retries of the
 * same user attempt idempotent; a successful navigation mounts a fresh form.
 */
export function ensureDeploymentIdempotencyKey(form: HTMLFormElement): void {
  const input = form.elements.namedItem('idempotencyKey');

  if (input instanceof HTMLInputElement && !DEPLOYMENT_IDEMPOTENCY_KEY_PATTERN.test(input.value.trim())) {
    input.value = globalThis.crypto.randomUUID();
  }
}
