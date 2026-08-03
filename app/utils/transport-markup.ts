/*
 * BUG-AGENT-TRANSPORT-MARKUP — reject model transport markup at the write boundary.
 *
 * The model's own function-call transport is XML-ish markup that is supposed to be
 * consumed by the provider SDK and never surface as assistant text. In practice it
 * DOES leak: a prod Website Builder generation appended an `antml` closing wrapper
 * to ten source and configuration files (SOLUTIONS_REAL_PROOF_BLOCKERS.md §4), and
 * repair prompts reproduced it. Once written, the fragment is invalid syntax in
 * every language we generate — the app cannot boot.
 *
 * This module is the single definition of "transport markup" so the streaming
 * parser (hold back a partial fragment) and the write boundary (strip a complete
 * one) can never disagree about what counts.
 *
 * DELIBERATELY NARROW. This file's neighbours document two prior incidents where
 * over-eager "cleaning" corrupted legitimate source (HTML entities in JSX, a
 * single coloured <span>). So we only match markup that cannot occur in real
 * source we generate:
 *   - anything in the `antml` XML namespace (`<invoke>`, `</…>`) —
 *     `antml` is not a tag, component, or namespace in any language we emit;
 *   - the bare transport wrappers `function_calls` / `invoke` / `parameter`, and
 *     ONLY when they carry no attributes beyond the transport's own `name="…"`.
 * A real `</a>`, `</div>`, `<param>`, or `a < b` never matches.
 */

/** Bare (un-namespaced) transport wrapper tag names. */
const BARE_TAGS = ['function_calls', 'invoke', 'parameter'] as const;

const BARE_TAGS_ALT = BARE_TAGS.join('|');

/**
 * A COMPLETE transport tag anywhere in the content.
 * Namespaced: `<invoke name="x">`, `</function_calls>`, `<x/>`.
 * Bare: `<invoke>`, `<invoke name="x">`, `</parameter>`, `<parameter name="x">`.
 */
const COMPLETE_RE = new RegExp(
  `<\\/?antml:[A-Za-z0-9_.-]*(?:\\s[^>]*?)?\\/?>` + `|` + `<\\/?(?:${BARE_TAGS_ALT})(?:\\s+name="[^"]*")?\\s*\\/?>`,
  'g',
);

/**
 * A TRUNCATED transport tag at the very END of the content — the shape that lands
 * on disk when the stream dies mid-tag (`…}\n</antml`). Requires at least the full
 * literal `antml` (or a full bare tag name) so an ordinary unterminated `</a` or
 * `<div` is never touched.
 */
const TRUNCATED_TAIL_RE = new RegExp(
  `<\\/?antml(?::[A-Za-z0-9_.-]*)?(?:\\s[^>]*)?$` + `|` + `<\\/?(?:${BARE_TAGS_ALT})(?:\\s+name="[^"]*")?\\s*$`,
);

/**
 * Every literal a streamed buffer could END with partway through a transport tag.
 * Used for the streaming hold-back, where deferring an ambiguous tail costs one
 * chunk and prevents a partial tag from reaching the editor preview or autosave.
 */
const NAMESPACE_PREFIX = `${'antml'}:`;

const STREAM_OPENERS = [
  /*
   * The namespaced openers must be spelled out in full: the hold-back below
   * matches PROPER PREFIXES of these literals, so `</antml` is only recognised
   * as a partial tag because `</` is listed here. Listing just `</` would
   * only ever hold back a lone `<`.
   */
  `<${NAMESPACE_PREFIX}`,
  `</${NAMESPACE_PREFIX}`,
  ...BARE_TAGS.flatMap((tag) => [`<${tag}`, `</${tag}`]),
] as const;

export interface StripTransportMarkupResult {
  content: string;

  /** How many transport tags/fragments were removed. */
  stripped: number;

  /** The removed literals, for diagnostics (deduped, capped). */
  samples: string[];
}

/**
 * Remove every complete transport tag, plus a truncated one at the tail.
 * Pure and idempotent.
 */
export function stripTransportMarkup(content: string): StripTransportMarkupResult {
  const samples: string[] = [];

  let stripped = 0;

  const record = (match: string) => {
    stripped += 1;

    if (samples.length < 5 && !samples.includes(match)) {
      samples.push(match);
    }

    return '';
  };

  let next = content.replace(COMPLETE_RE, record);

  /*
   * Tail pass runs after the complete pass so `…</invoke></antml` clears
   * both. Only ever strips at the very end, so interior text is untouched.
   */
  next = next.replace(TRUNCATED_TAIL_RE, record);

  return { content: next, stripped, samples };
}

/** True when `content` carries transport markup that must never be persisted. */
export function hasTransportMarkup(content: string): boolean {
  return stripTransportMarkup(content).stripped > 0;
}

/**
 * Length of the trailing suffix of `content` that is a proper prefix of some
 * transport tag opener — i.e. a tag split across stream chunks. Returns 0 when
 * the tail is unambiguous.
 *
 * This is the streaming counterpart to `stripTransportMarkup`: the parser holds
 * this many characters back until the next chunk resolves them, exactly as it
 * already does for a split `</boltAction>`.
 */
export function trailingTransportFragmentLength(content: string): number {
  let longest = 0;

  for (const opener of STREAM_OPENERS) {
    /*
     * Up to and INCLUDING the opener's full length: a tail of exactly `</invoke`
     * is still an unfinished tag (no `>`), so it must be held back too.
     */
    const max = Math.min(content.length, opener.length);

    for (let k = max; k > longest; k--) {
      if (content.endsWith(opener.slice(0, k))) {
        longest = k;
        break;
      }
    }
  }

  return longest;
}
