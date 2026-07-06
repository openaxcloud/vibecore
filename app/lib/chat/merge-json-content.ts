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
 *   - proposed parses    → deep-merge onto current (agent intent applied, current
 *     keys the agent didn't touch are preserved) → guaranteed valid JSON.
 *   - proposed truncated → repair it (recover the complete pairs emitted before
 *     the cut) and deep-merge that; else keep the current (valid) content — never
 *     regress a good file to a truncated one.
 *   - neither recoverable → undefined (genuine failure; caller surfaces/handles it).
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

/*
 * Close the open structures of a JSON PREFIX and try to parse it. Scans the
 * prefix tracking string/escape state and a bracket stack, strips a dangling
 * trailing comma, appends the missing `}` / `]` closers, and returns the parsed
 * value — or undefined if the prefix ends inside a string / key-without-value
 * (i.e. this cut point isn't clean; the caller tries an earlier one).
 */
function closeAndParsePrefix(prefix: string): JsonValue | undefined {
  const trimmed = prefix.replace(/,\s*$/, '').trimEnd();

  if (!trimmed) {
    return undefined;
  }

  let inString = false;
  let escaped = false;

  const closers: string[] = [];

  for (const char of trimmed) {
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }

      continue;
    }

    if (char === '"') {
      inString = true;
    } else if (char === '{') {
      closers.push('}');
    } else if (char === '[') {
      closers.push(']');
    } else if (char === '}' || char === ']') {
      closers.pop();
    }
  }

  // Ended mid-string → not a clean boundary; let the caller cut earlier.
  if (inString) {
    return undefined;
  }

  let candidate = trimmed;

  for (let i = closers.length - 1; i >= 0; i--) {
    candidate += closers[i];
  }

  return tryParse(candidate);
}

/*
 * Best-effort recovery of a JSON document truncated mid-stream — the dominant
 * package.json failure: the model's emission is cut off, leaving an unterminated
 * string ("Unterminated string in JSON at position …") or an unclosed object.
 * Walks the text once to collect structural cut points (a completed value / a
 * position before a comma), then, from the LATEST recoverable boundary backward,
 * closes the open brackets and re-parses. Conservative: it never invents values,
 * and only accepts a result that still carries real content (a non-empty object
 * or array) so genuine garbage isn't silently reduced to `{}`.
 */
export function repairTruncatedJson(text: string): string | undefined {
  const trimmed = (text ?? '').trim();

  if (!trimmed) {
    return undefined;
  }

  if (tryParse(trimmed) !== undefined) {
    return trimmed;
  }

  const cutPoints: number[] = [];

  let inString = false;
  let escaped = false;

  for (let i = 0; i < trimmed.length; i++) {
    const char = trimmed[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
        cutPoints.push(i + 1); // right after a completed string
      }

      continue;
    }

    if (char === '"') {
      inString = true;
    } else if (char === '}' || char === ']') {
      cutPoints.push(i + 1); // right after a closed object/array
    } else if (char === ',') {
      cutPoints.push(i); // before a comma
    } else if (/[0-9tfnleu.+-]/i.test(char)) {
      cutPoints.push(i + 1); // scalar (number / true / false / null) boundary
    }
  }

  for (let i = cutPoints.length - 1; i >= 0; i--) {
    const parsed = closeAndParsePrefix(trimmed.slice(0, cutPoints[i]));

    if (parsed === undefined) {
      continue;
    }

    const hasContent =
      (isPlainObject(parsed) && Object.keys(parsed).length > 0) || (Array.isArray(parsed) && parsed.length > 0);

    if (hasContent) {
      return JSON.stringify(parsed);
    }
  }

  return undefined;
}

export function mergeJsonContent(currentText: string, proposedText: string): string | undefined {
  const proposed = tryParse(proposedText);

  if (proposed !== undefined) {
    const current = tryParse(currentText);
    const merged = current !== undefined ? deepMerge(current, proposed) : proposed;

    return `${JSON.stringify(merged, null, 2)}\n`;
  }

  /*
   * Proposed is not valid JSON (e.g. truncated mid-stream). Before giving up, try
   * to REPAIR the truncation — recovering the complete key/value pairs the model
   * did emit (name/version/scripts/… before the cut) — and deep-merge that onto
   * the current file. This turns a hard "AI patch failed: Invalid JSON in
   * package.json: Unterminated string" into a valid write, so the class of error
   * stops repeating and npm install / preview can proceed.
   */
  const repaired = tryParse(repairTruncatedJson(proposedText) ?? '');

  if (repaired !== undefined) {
    const current = tryParse(currentText);
    const merged = current !== undefined ? deepMerge(current, repaired) : repaired;

    return `${JSON.stringify(merged, null, 2)}\n`;
  }

  /*
   * Nothing recoverable from proposed: keep the current file if it is itself
   * valid, rather than overwriting it with garbage.
   */
  if (tryParse(currentText) !== undefined) {
    return currentText;
  }

  return undefined;
}
