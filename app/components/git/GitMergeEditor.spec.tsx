import { describe, expect, it } from 'vitest';
import { hasUnresolvedConflictMarkers, seedRawText } from './GitMergeEditor';

/*
 * Reproduces the data-loss bug: clicking "Edit raw" before choosing a side for the
 * conflicts must NOT seed the textarea with a body that has the conflicting regions
 * stripped. seedRawText is the pure decision the toggle uses.
 */

const CONTENT_WITH_CONFLICT = [
  'line a',
  '<<<<<<< HEAD',
  'our change',
  '=======',
  'their change',
  '>>>>>>> branch',
  'line b',
].join('\n');

describe('seedRawText', () => {
  it('seeds from original content (markers intact) when conflicts are unresolved', () => {
    /*
     * `composed` here is what the component computes when nothing is chosen:
     * the conflict body resolved to '' and got filtered out.
     */
    const composedWithConflictStripped = ['line a', 'line b'].join('\n');

    const seeded = seedRawText(CONTENT_WITH_CONFLICT, composedWithConflictStripped, false);

    expect(seeded).toBe(CONTENT_WITH_CONFLICT);

    // The conflicting code must still be present.
    expect(seeded).toContain('our change');
    expect(seeded).toContain('their change');
    expect(seeded).toContain('<<<<<<< HEAD');
  });

  it('seeds from composed (marker-free) when every conflict has been resolved', () => {
    const composed = ['line a', 'our change', 'line b'].join('\n');

    const seeded = seedRawText(CONTENT_WITH_CONFLICT, composed, true);

    expect(seeded).toBe(composed);
    expect(seeded).not.toContain('<<<<<<<');
    expect(seeded).not.toContain('their change');
  });

  it('never returns content that has lost the conflict bodies while still unresolved', () => {
    /*
     * Even if composed happens to be non-empty for other reasons, an unresolved
     * state must fall back to the full original content.
     */
    const partiallyComposed = 'line a\nline b';

    expect(seedRawText(CONTENT_WITH_CONFLICT, partiallyComposed, false)).toContain('our change');
  });
});

/*
 * Reproduces the "permanently disabled Mark resolved" bug: a chosen side whose real
 * source content contains a line starting with 7+ of <, |, =, or > (a markdown/RST
 * divider, a section banner, arrow art) must NOT be mistaken for a leftover conflict
 * marker. Only an actual reconstructable conflict block counts.
 */
describe('hasUnresolvedConflictMarkers', () => {
  it('returns true while an actual conflict block remains in the composed text', () => {
    const composed = [
      'line a',
      '<<<<<<< HEAD',
      'our change',
      '=======',
      'their change',
      '>>>>>>> branch',
      'line b',
    ].join('\n');

    expect(hasUnresolvedConflictMarkers(composed)).toBe(true);
  });

  it('returns true for a leftover diff3 base marker block', () => {
    const composed = [
      '<<<<<<< HEAD',
      'our change',
      '|||||||  base',
      'base change',
      '=======',
      'their change',
      '>>>>>>> branch',
    ].join('\n');

    expect(hasUnresolvedConflictMarkers(composed)).toBe(true);
  });

  it('returns false for a fully resolved body (no markers)', () => {
    const composed = ['line a', 'our change', 'line b'].join('\n');

    expect(hasUnresolvedConflictMarkers(composed)).toBe(false);
  });

  it('does NOT flag a legitimate ======= markdown/RST divider as a conflict', () => {
    const composed = ['Heading', '=======', 'body text'].join('\n');

    expect(hasUnresolvedConflictMarkers(composed)).toBe(false);
  });

  it('does NOT flag a // ========= section banner as a conflict', () => {
    const composed = ['const x = 1;', '// =========================', 'const y = 2;'].join('\n');

    expect(hasUnresolvedConflictMarkers(composed)).toBe(false);
  });

  it('does NOT flag >>>>>>> arrow art or <<<<<<< lines as a conflict', () => {
    const composed = ['<<<<<<< pay attention', 'art', '>>>>>>> the end'].join('\n');

    // No paired ======= between them, so this never forms a conflict segment.
    expect(hasUnresolvedConflictMarkers(composed)).toBe(false);
  });

  it('does NOT flag a chosen side that legitimately contains a ======= divider line', () => {
    /*
     * This is the exact regression: the user accepts a side whose source includes a
     * "=======" divider. The composed output is marker-free (no real conflict block),
     * so resolve must be allowed.
     */
    const composed = ['line a', 'Section', '=======', 'content', 'line b'].join('\n');

    expect(hasUnresolvedConflictMarkers(composed)).toBe(false);
  });
});
