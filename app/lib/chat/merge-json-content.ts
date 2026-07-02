/**
 * Tolerant merge for a JSON file edit (e.g. package.json) used as a FALLBACK when
 * a patch proposal's content fails to apply/validate cleanly.
 *
 * Why: during project generation the runtime template and the agent both write
 * package.json. The agent's proposal is a full-file replacement whose base was
 * captured before the template's write, and mid-stream the proposed content is
 * often truncated (invalid JSON). Applying that verbatim either overwrites the
 * live valid file with garbage or hard-fails validation — surfacing
 * "Couldn't apply package.json" repeatedly. This merges instead of overwriting:
 *   - proposed parses  → deep-merge onto current (agent intent applied, current
 *     keys the agent didn't touch are preserved) → guaranteed valid JSON.
 *   - proposed invalid → keep the current (valid) content: never regress a good
 *     file to a truncated one.
 *   - neither parses   → undefined (genuine failure; caller surfaces the error).
 *
 * Deep-merge (objects merged recursively, arrays/scalars from proposed win). This
 * is the right semantic for the dominant create-time case (adding dependencies).
 * Pure + exported for unit testing.
 */

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

function isPlainObject(value: unknown): value is Record<string, JsonValue> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function deepMerge(base: JsonValue, override: JsonValue): JsonValue {
  if (isPlainObject(base) && isPlainObject(override)) {
    const result: Record<string, JsonValue> = { ...base };

    for (const [key, value] of Object.entries(override)) {
      result[key] = key in base ? deepMerge(base[key], value) : value;
    }

    return result;
  }

  // Arrays and scalars: the proposed (override) value wins outright.
  return override;
}

function tryParse(text: string): JsonValue | undefined {
  try {
    return JSON.parse(text) as JsonValue;
  } catch {
    return undefined;
  }
}

export function mergeJsonContent(currentText: string, proposedText: string): string | undefined {
  const proposed = tryParse(proposedText);

  if (proposed !== undefined) {
    const current = tryParse(currentText);
    const merged = current !== undefined ? deepMerge(current, proposed) : proposed;

    return `${JSON.stringify(merged, null, 2)}\n`;
  }

  /*
   * Proposed is not valid JSON (e.g. truncated mid-stream): keep the current file
   * if it is itself valid, rather than overwriting it with garbage.
   */
  if (tryParse(currentText) !== undefined) {
    return currentText;
  }

  return undefined;
}
