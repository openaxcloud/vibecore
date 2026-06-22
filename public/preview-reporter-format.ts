/*
 * Pure formatting helpers shared (by mirrored implementation) with the
 * browser IIFE in `vibecore-preview-reporter.js`.
 *
 * The reporter itself ships as a plain static script that cannot import this
 * module at runtime, so the IIFE inlines an equivalent of these functions.
 * Keeping the canonical, side-effect-free logic here lets it be unit-tested
 * directly and guards against regressions in console serialization.
 */

export type ConsoleLevel = 'log' | 'info' | 'warn' | 'error' | 'debug';

export interface PreviewConsolePayload {
  type: 'PREVIEW_CONSOLE';
  level: ConsoleLevel;
  message: string;
  ts: number;
}

const MAX_MESSAGE_LENGTH = 8000;

/**
 * Serialize a single console argument to a stable, human-readable string.
 * Objects are JSON-stringified (with circular-reference safety); Errors keep
 * their stack; primitives use String(). Never throws.
 */
export function serializeConsoleArg(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (value === undefined) {
    return 'undefined';
  }

  if (value === null) {
    return 'null';
  }

  if (value instanceof Error) {
    return value.stack ? String(value.stack) : `${value.name}: ${value.message}`;
  }

  const valueType = typeof value;

  if (valueType === 'number' || valueType === 'boolean' || valueType === 'bigint' || valueType === 'symbol') {
    return String(value);
  }

  if (valueType === 'function') {
    return `[Function${(value as { name?: string }).name ? `: ${(value as { name?: string }).name}` : ''}]`;
  }

  try {
    const seen = new WeakSet<object>();

    const json = JSON.stringify(value, (_key, nested) => {
      if (typeof nested === 'object' && nested !== null) {
        if (seen.has(nested)) {
          return '[Circular]';
        }

        seen.add(nested);
      }

      if (typeof nested === 'bigint') {
        return String(nested);
      }

      return nested;
    });

    return json === undefined ? String(value) : json;
  } catch {
    try {
      return String(value);
    } catch {
      return '[Unserializable]';
    }
  }
}

/**
 * Join console arguments into a single message string, mirroring how a browser
 * console renders a `console.log(a, b, c)` call (space-separated).
 */
export function formatConsoleMessage(args: readonly unknown[]): string {
  const message = args.map((arg) => serializeConsoleArg(arg)).join(' ');

  if (message.length > MAX_MESSAGE_LENGTH) {
    return `${message.slice(0, MAX_MESSAGE_LENGTH)}… (truncated)`;
  }

  return message;
}

/**
 * Build the PREVIEW_CONSOLE postMessage payload for a captured console call.
 */
export function buildConsolePayload(
  level: ConsoleLevel,
  args: readonly unknown[],
  now: number = Date.now(),
): PreviewConsolePayload {
  return {
    type: 'PREVIEW_CONSOLE',
    level,
    message: formatConsoleMessage(args),
    ts: now,
  };
}
