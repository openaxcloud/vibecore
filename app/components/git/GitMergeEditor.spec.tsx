import { describe, expect, it } from 'vitest';
import { seedRawText } from './GitMergeEditor';

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
