const SECRET_KEY_PATTERN = /secret|token|password|keyHash/i;

/**
 * Recursively redact secret-bearing values from an admin record before it is
 * rendered in the table or the Details panel.
 *
 * A value is redacted whenever its key (at ANY depth) matches the secret
 * pattern. Nested objects and arrays are walked so that a secret hidden under
 * a benign-named key (e.g. `metadata.token`, `config.password`) never leaks
 * verbatim into the UI.
 */
export function redactValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, val]) => [
        key,
        SECRET_KEY_PATTERN.test(key) ? '[redacted]' : redactValue(val),
      ]),
    );
  }

  return value;
}

export function redactRecord(record: Record<string, unknown>): Record<string, unknown> {
  return redactValue(record) as Record<string, unknown>;
}
