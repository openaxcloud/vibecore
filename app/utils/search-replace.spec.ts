import { describe, expect, it } from 'vitest';
import {
  DIFF_EDIT_MIN_LINES,
  applySearchReplace,
  parseSearchReplaceBlocks,
  resolveDiffMinLines,
  type SearchReplaceBlock,
} from './search-replace';

/*
 * ---------------------------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------------------------
 */

/** Build a canonical block payload from search/replace bodies. */
function block(search: string, replace: string): string {
  return `<<<<<<< SEARCH\n${search}\n=======\n${replace}\n>>>>>>> REPLACE`;
}

/*
 * ---------------------------------------------------------------------------
 * Parser
 * ---------------------------------------------------------------------------
 */

describe('parseSearchReplaceBlocks', () => {
  it('parses a single block preserving exact body whitespace', () => {
    const result = parseSearchReplaceBlocks(block('const a = 1;', 'const a = 2;'));
    expect(result.malformed).toBe(false);
    expect(result.error).toBeUndefined();
    expect(result.blocks).toEqual([{ search: 'const a = 1;', replace: 'const a = 2;' }]);
  });

  it('preserves leading/trailing whitespace inside bodies (no trimming)', () => {
    const search = '  indented\n\ttabbed  ';
    const replace = '    deeper\n  ';
    const result = parseSearchReplaceBlocks(block(search, replace));
    expect(result.blocks[0].search).toBe(search);
    expect(result.blocks[0].replace).toBe(replace);
  });

  it('parses multiple blocks in order', () => {
    const payload = `${block('a', 'A')}\n${block('b', 'B')}\n${block('c', 'C')}`;
    const result = parseSearchReplaceBlocks(payload);
    expect(result.malformed).toBe(false);
    expect(result.blocks).toEqual([
      { search: 'a', replace: 'A' },
      { search: 'b', replace: 'B' },
      { search: 'c', replace: 'C' },
    ]);
  });

  it('accepts Aider-style markers with trailing text', () => {
    const payload = '<<<<<<< SEARCH\nfoo\n======= whatever\nbar\n>>>>>>> REPLACE ok';
    const result = parseSearchReplaceBlocks(payload);
    expect(result.malformed).toBe(false);
    expect(result.blocks).toEqual([{ search: 'foo', replace: 'bar' }]);
  });

  it('normalizes CRLF input to LF bodies', () => {
    const payload = '<<<<<<< SEARCH\r\nline1\r\nline2\r\n=======\r\nnew1\r\nnew2\r\n>>>>>>> REPLACE';
    const result = parseSearchReplaceBlocks(payload);
    expect(result.malformed).toBe(false);
    expect(result.blocks).toEqual([{ search: 'line1\nline2', replace: 'new1\nnew2' }]);
  });

  it('does not treat a ======= line INSIDE the replacement as a divider', () => {
    const replace = 'const bar = "=======";\n// ======= not a divider\nreturn 1;';
    const result = parseSearchReplaceBlocks(block('foo', replace));
    expect(result.malformed).toBe(false);
    expect(result.blocks).toHaveLength(1);
    expect(result.blocks[0].replace).toBe(replace);
  });

  it('ignores prose/framing lines between blocks', () => {
    const payload = `Here is the edit:\n${block('x', 'X')}\nand another:\n${block('y', 'Y')}`;
    const result = parseSearchReplaceBlocks(payload);
    expect(result.blocks).toEqual([
      { search: 'x', replace: 'X' },
      { search: 'y', replace: 'Y' },
    ]);
  });

  it('empty input → no blocks, not malformed', () => {
    expect(parseSearchReplaceBlocks('')).toEqual({ blocks: [], malformed: false });
  });

  it('supports empty search body (parsed, applier decides policy)', () => {
    const payload = '<<<<<<< SEARCH\n=======\nappended\n>>>>>>> REPLACE';
    const result = parseSearchReplaceBlocks(payload);
    expect(result.malformed).toBe(false);
    expect(result.blocks).toEqual([{ search: '', replace: 'appended' }]);
  });

  describe('malformed inputs → malformed=true with error, keeping leading blocks', () => {
    const cases: Array<{ name: string; payload: string; leading: SearchReplaceBlock[] }> = [
      {
        name: 'SEARCH without divider (unterminated search)',
        payload: '<<<<<<< SEARCH\nfoo\nbar',
        leading: [],
      },
      {
        name: 'divider without an open SEARCH',
        payload: 'just code\n=======\nmore',
        leading: [],
      },
      {
        name: 'REPLACE without an open SEARCH',
        payload: 'code\n>>>>>>> REPLACE',
        leading: [],
      },
      {
        name: 'REPLACE before divider',
        payload: '<<<<<<< SEARCH\nfoo\n>>>>>>> REPLACE',
        leading: [],
      },
      {
        name: 'unterminated replace (missing REPLACE marker)',
        payload: '<<<<<<< SEARCH\nfoo\n=======\nbar',
        leading: [],
      },
      {
        name: 'nested SEARCH before divider',
        payload: '<<<<<<< SEARCH\nfoo\n<<<<<<< SEARCH\nbar\n=======\nbaz\n>>>>>>> REPLACE',
        leading: [],
      },
      {
        name: 'one good block then a malformed one keeps the leading block',
        payload: `${block('ok', 'OK')}\n<<<<<<< SEARCH\ndangling`,
        leading: [{ search: 'ok', replace: 'OK' }],
      },
    ];

    for (const { name, payload, leading } of cases) {
      it(name, () => {
        const result = parseSearchReplaceBlocks(payload);
        expect(result.malformed).toBe(true);
        expect(typeof result.error).toBe('string');
        expect(result.error!.length).toBeGreaterThan(0);
        expect(result.blocks).toEqual(leading);
      });
    }
  });
});

/*
 * ---------------------------------------------------------------------------
 * Applier — exact
 * ---------------------------------------------------------------------------
 */

describe('applySearchReplace — exact matching', () => {
  it('replaces a unique anchor → applied-exact, ok:true', () => {
    const original = 'line1\nconst x = 1;\nline3';
    const result = applySearchReplace(original, [{ search: 'const x = 1;', replace: 'const x = 42;' }]);
    expect(result.ok).toBe(true);
    expect(result.content).toBe('line1\nconst x = 42;\nline3');
    expect(result.hunks[0].status).toBe('applied-exact');
    expect(result.hunks[0].index).toBe(0);
  });

  it('anchor appearing TWICE → failed-ambiguous, no guess, ok:false content:null', () => {
    const original = 'dup\nmiddle\ndup';
    const result = applySearchReplace(original, [{ search: 'dup', replace: 'X' }]);
    expect(result.ok).toBe(false);
    expect(result.content).toBeNull();
    expect(result.hunks[0].status).toBe('failed-ambiguous');
  });

  it('multi-line unique anchor replaced', () => {
    const original = 'a\nb\nc\nd';
    const result = applySearchReplace(original, [{ search: 'b\nc', replace: 'B\nC\nEXTRA' }]);
    expect(result.ok).toBe(true);
    expect(result.content).toBe('a\nB\nC\nEXTRA\nd');
    expect(result.hunks[0].status).toBe('applied-exact');
  });
});

/*
 * ---------------------------------------------------------------------------
 * Applier — fuzzy
 * ---------------------------------------------------------------------------
 */

describe('applySearchReplace — fuzzy matching', () => {
  it('different leading indentation than the file → applied-fuzzy with re-indentation', () => {
    const original = '    if (cond) {\n        doThing();\n    }';

    // Search authored at column 0 (indentation-shifted vs the file's 4 spaces).
    const search = 'if (cond) {\n    doThing();\n}';
    const replace = 'if (cond) {\n    doOther();\n}';
    const result = applySearchReplace(original, [{ search, replace }]);
    expect(result.ok).toBe(true);
    expect(result.hunks[0].status).toBe('applied-fuzzy');

    // Replacement re-indented to the file's 4-space block indent.
    expect(result.content).toBe('    if (cond) {\n        doOther();\n    }');
  });

  it('trailing-whitespace drift → applied-fuzzy', () => {
    const original = 'const a = 1;   \nconst b = 2;';
    const search = 'const a = 1;\nconst b = 2;';
    const result = applySearchReplace(original, [{ search, replace: 'const a = 9;\nconst b = 8;' }]);
    expect(result.ok).toBe(true);
    expect(result.hunks[0].status).toBe('applied-fuzzy');
    expect(result.content).toBe('const a = 9;\nconst b = 8;');
  });

  it('blank-line whitespace drift → applied-fuzzy', () => {
    // File has a blank line containing spaces; search has a truly empty blank line.
    const original = 'foo\n   \nbar';
    const search = 'foo\n\nbar';
    const result = applySearchReplace(original, [{ search, replace: 'foo\n\nBAZ' }]);
    expect(result.ok).toBe(true);
    expect(result.hunks[0].status).toBe('applied-fuzzy');
    expect(result.content).toBe('foo\n\nBAZ');
  });

  it('multiple fuzzy candidate ranges → failed-ambiguous', () => {
    const original = 'x = 1\n----\nx = 1\n----\nend';

    /*
     * "x = 1" (trimmed) appears at two windows once exact match count is >1;
     * force fuzzy path by adding trailing space so exact substring differs.
     */
    const search = 'x = 1 ';
    const result = applySearchReplace(original, [{ search, replace: 'x = 2' }]);
    expect(result.ok).toBe(false);
    expect(result.content).toBeNull();
    expect(result.hunks[0].status).toBe('failed-ambiguous');
  });
});

/*
 * ---------------------------------------------------------------------------
 * Applier — base drift / not found
 * ---------------------------------------------------------------------------
 */

describe('applySearchReplace — base drift', () => {
  it('search text absent entirely → failed-not-found, ok:false, content:null', () => {
    const original = 'alpha\nbeta\ngamma';
    const result = applySearchReplace(original, [{ search: 'nonexistent line', replace: 'x' }]);
    expect(result.ok).toBe(false);
    expect(result.content).toBeNull();
    expect(result.hunks[0].status).toBe('failed-not-found');
  });
});

/*
 * ---------------------------------------------------------------------------
 * Applier — multi-block strictness & ordering
 * ---------------------------------------------------------------------------
 */

describe('applySearchReplace — multi-block', () => {
  it('all blocks apply → ok:true with full content', () => {
    const original = 'one\ntwo\nthree';

    const result = applySearchReplace(original, [
      { search: 'one', replace: '1' },
      { search: 'three', replace: '3' },
    ]);
    expect(result.ok).toBe(true);
    expect(result.content).toBe('1\ntwo\n3');
    expect(result.hunks.map((h) => h.status)).toEqual(['applied-exact', 'applied-exact']);
  });

  it('STRICT: one block fails → ok:false, content:null (no partial buffer), hunks show which failed', () => {
    const original = 'one\ntwo\nthree';

    const result = applySearchReplace(original, [
      { search: 'one', replace: '1' }, // would apply
      { search: 'MISSING', replace: 'x' }, // fails
      { search: 'three', replace: '3' }, // never reached
    ]);
    expect(result.ok).toBe(false);
    expect(result.content).toBeNull();
    expect(result.hunks).toHaveLength(3);
    expect(result.hunks[0].status).toBe('applied-exact');
    expect(result.hunks[1].status).toBe('failed-not-found');

    // Later blocks recorded for completeness (never applied).
    expect(result.hunks[2].status).toBe('failed-not-found');
    expect(result.hunks[1].block.search).toBe('MISSING');
  });

  it('ambiguous block in a batch also yields strict all-or-nothing failure', () => {
    const original = 'dup\ndup\ntail';

    const result = applySearchReplace(original, [
      { search: 'tail', replace: 'TAIL' },
      { search: 'dup', replace: 'X' },
    ]);
    expect(result.ok).toBe(false);
    expect(result.content).toBeNull();
    expect(result.hunks[1].status).toBe('failed-ambiguous');
  });

  it('order dependence: block 2 matches text produced by block 1', () => {
    const original = 'placeholder\nkeep';

    const result = applySearchReplace(original, [
      { search: 'placeholder', replace: 'inserted' },
      { search: 'inserted', replace: 'final' }, // only exists AFTER block 1
    ]);
    expect(result.ok).toBe(true);
    expect(result.content).toBe('final\nkeep');
    expect(result.hunks.map((h) => h.status)).toEqual(['applied-exact', 'applied-exact']);
  });
});

/*
 * ---------------------------------------------------------------------------
 * Applier — special cases
 * ---------------------------------------------------------------------------
 */

describe('applySearchReplace — special cases', () => {
  it('no-op (search === replace) → applied-exact, content unchanged', () => {
    const original = 'keep me\nintact';
    const result = applySearchReplace(original, [{ search: 'keep me', replace: 'keep me' }]);
    expect(result.ok).toBe(true);
    expect(result.content).toBe(original);
    expect(result.hunks[0].status).toBe('applied-exact');
  });

  it('empty search → failed-ambiguous (documented reject-for-safety rule)', () => {
    const result = applySearchReplace('some file', [{ search: '', replace: 'appended' }]);
    expect(result.ok).toBe(false);
    expect(result.content).toBeNull();
    expect(result.hunks[0].status).toBe('failed-ambiguous');
  });

  it('replacement containing marker-like lines is NOT re-parsed', () => {
    const original = 'target';
    const replace = '<<<<<<< SEARCH\nnot parsed\n=======\nstill not\n>>>>>>> REPLACE';
    const result = applySearchReplace(original, [{ search: 'target', replace }]);
    expect(result.ok).toBe(true);
    expect(result.content).toBe(replace);
    expect(result.hunks[0].status).toBe('applied-exact');
  });

  it('end-to-end: parse then apply a marker-containing replacement stays intact', () => {
    const replace = 'a = "=======";';
    const parsed = parseSearchReplaceBlocks(block('a = 1;', replace));
    expect(parsed.malformed).toBe(false);

    const result = applySearchReplace('a = 1;', parsed.blocks);
    expect(result.ok).toBe(true);
    expect(result.content).toBe('a = "=======";');
  });

  it('empty block list → ok:true, content unchanged, no hunks', () => {
    const result = applySearchReplace('unchanged', []);
    expect(result.ok).toBe(true);
    expect(result.content).toBe('unchanged');
    expect(result.hunks).toEqual([]);
  });
});

/*
 * ---------------------------------------------------------------------------
 * DIFF_EDIT_MIN_LINES
 * ---------------------------------------------------------------------------
 */

describe('DIFF_EDIT_MIN_LINES / resolveDiffMinLines', () => {
  it('default is 500', () => {
    expect(DIFF_EDIT_MIN_LINES).toBe(500);
    expect(resolveDiffMinLines({})).toBe(500);
  });

  it('respects a valid env override', () => {
    expect(resolveDiffMinLines({ DIFF_EDIT_MIN_LINES: '1200' })).toBe(1200);
  });

  it('ignores invalid / non-positive overrides and falls back to 500', () => {
    expect(resolveDiffMinLines({ DIFF_EDIT_MIN_LINES: 'not-a-number' })).toBe(500);
    expect(resolveDiffMinLines({ DIFF_EDIT_MIN_LINES: '0' })).toBe(500);
    expect(resolveDiffMinLines({ DIFF_EDIT_MIN_LINES: '-10' })).toBe(500);
    expect(resolveDiffMinLines({ DIFF_EDIT_MIN_LINES: '' })).toBe(500);
  });
});
