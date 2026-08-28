import { createHash } from 'node:crypto';

const REMIX_IDE_STATE_DIGEST = /^sha256:[a-f0-9]{64}$/;
const INVALID_JSON = Symbol('invalid-remix-ide-state-json');

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

function normalizeJson(value: unknown): JsonValue | typeof INVALID_JSON {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : INVALID_JSON;

  if (Array.isArray(value)) {
    const normalized: JsonValue[] = [];
    for (const entry of value) {
      const item = normalizeJson(entry);
      if (item === INVALID_JSON) return INVALID_JSON;
      normalized.push(item);
    }
    return normalized;
  }

  if (!value || typeof value !== 'object') return INVALID_JSON;
  if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) return INVALID_JSON;

  const normalized: Record<string, JsonValue> = {};
  for (const [key, entry] of Object.entries(value)) {
    // Object properties with `undefined` are absent from JSON. The IDE merge
    // helper intentionally emits a few such optional keys, so normalize them
    // before both the JSONB write and the digest instead of hashing JS-only data.
    if (entry === undefined) continue;
    const item = normalizeJson(entry);
    if (item === INVALID_JSON) return INVALID_JSON;
    normalized[key] = item;
  }
  return normalized;
}

function canonicalJson(value: unknown): string | undefined {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') return Number.isFinite(value) ? JSON.stringify(value) : undefined;

  if (Array.isArray(value)) {
    const entries = value.map(canonicalJson);
    return entries.every((entry): entry is string => entry !== undefined) ? `[${entries.join(',')}]` : undefined;
  }

  if (!value || typeof value !== 'object') return undefined;

  const record = value as Record<string, unknown>;
  const entries: string[] = [];

  for (const key of Object.keys(record).sort()) {
    const encoded = canonicalJson(record[key]);
    if (encoded === undefined) return undefined;
    entries.push(`${JSON.stringify(key)}:${encoded}`);
  }

  return `{${entries.join(',')}}`;
}

/**
 * Seal the exact verified IDE/file manifest staged on a RemixJob. JSONB may
 * reorder object keys, so both writers and finalizers hash this canonical form.
 */
export function remixIdeStateDigest(value: unknown): string | undefined {
  const normalized = normalizeJson(value);
  if (normalized === INVALID_JSON) return undefined;
  const canonical = canonicalJson(normalized);
  if (canonical === undefined) return undefined;
  return `sha256:${createHash('sha256').update(canonical, 'utf8').digest('hex')}`;
}

export function normalizeRemixIdeState(value: unknown): JsonValue | undefined {
  const normalized = normalizeJson(value);
  return normalized === INVALID_JSON ? undefined : normalized;
}

export function validRemixIdeStatePin(value: unknown, digest: unknown): digest is string {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    typeof digest === 'string' &&
    REMIX_IDE_STATE_DIGEST.test(digest) &&
    remixIdeStateDigest(value) === digest
  );
}
