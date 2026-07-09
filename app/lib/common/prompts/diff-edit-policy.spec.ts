import { describe, expect, it } from 'vitest';
import { getFineTunedPrompt } from './new-prompt';
import optimized from './optimized';
import { getSystemPrompt } from './prompts';

/**
 * Diff-edit increment 4/5 — golden/prompt tests.
 *
 * The prompts used to FORBID diffs outright ("NEVER use diffs", "WebContainer
 * CANNOT execute diff…", "always write your code in full no partial/diff
 * update"). This increment ACTIVATES the feature by replacing those blanket
 * rules with a HYBRID policy: full file by default, anchored search/replace
 * (type="diff") only for a small change to a large existing file.
 *
 * These tests pin, per variant:
 *   - the blanket anti-diff rules are gone;
 *   - the hybrid policy + exact type="diff" format + hard rules are present;
 *   - the ~500-line threshold, exact/unique anchor rule, and new-files-use-full
 *     rule are present;
 *   - the from-scratch path still emits type="file" (scaffold unchanged);
 *   - the rendered strings are non-trivial (template literals compiled).
 *
 * NOTE: the migration-specific "NEVER use diffs for migration files" lines live
 * inside <database_instructions> (Wave A, a different branch) and are LEFT
 * intact on purpose — they are CONSISTENT with the hybrid policy (SQL
 * migrations always use full content). We assert only that the GENERAL blanket
 * anti-diff instructions were removed.
 */

const cwd = '/home/project';
const sb = { isConnected: false, hasSelectedProject: false } as const;

const variants: Array<{ name: string; render: () => string }> = [
  { name: 'new-prompt (getFineTunedPrompt)', render: () => getFineTunedPrompt(cwd, sb) },
  { name: 'prompts (getSystemPrompt)', render: () => getSystemPrompt(cwd, sb) },
  {
    name: 'optimized',
    render: () => optimized({ cwd, allowedHtmlElements: ['div'], modificationTagName: 'mods', supabase: sb }),
  },
];

/** General blanket anti-diff strings that MUST be gone from every variant. */
const FORBIDDEN_BLANKET_STRINGS = [
  'CANNOT execute diff or patch editing',
  'no partial/diff update',
  'INCLUDE THE ENTIRE FILE CONTENT - NO PARTIAL UPDATES',
  'NEVER use diffs for new files or SQL migrations',
];

describe.each(variants)('diff-edit hybrid policy — $name', ({ render }) => {
  it('renders a valid, non-trivial prompt string (template literal compiled)', () => {
    const p = render();
    expect(typeof p).toBe('string');
    expect(p.length).toBeGreaterThan(2000);

    // Balanced boltArtifact/boltAction structure survived interpolation.
    expect(p).toContain('<boltArtifact');
    expect(p).toContain('<boltAction');
  });

  it('no longer contains the blanket anti-diff instructions', () => {
    const p = render();

    for (const s of FORBIDDEN_BLANKET_STRINGS) {
      expect(p).not.toContain(s);
    }
  });

  it('instructs the anchored type="diff" search/replace edit', () => {
    const p = render();
    expect(p).toContain('type="diff"');
    expect(p).toContain('<<<<<<< SEARCH');
    expect(p).toContain('=======');
    expect(p).toContain('>>>>>>> REPLACE');
  });

  it('documents the ~500-line hybrid threshold', () => {
    const p = render();
    expect(p).toContain('~500 lines');
  });

  it('requires the SEARCH anchor to be exact and unique', () => {
    const p = render();
    expect(p).toContain('BYTE-FOR-BYTE');
    expect(p).toContain('UNIQUE, contiguous anchor');
  });

  it('keeps full-file content as the default and for new files', () => {
    const p = render();
    expect(p).toContain('type="file"');

    // New files always use full content — scaffold/from-scratch stays full-file.
    expect(p).toContain('every NEW file');
    expect(p.toLowerCase()).toContain('from-scratch build');

    /*
     * ...and that from-scratch statement pins the file action (tolerate the
     * backtick-wrapped `type="file"` used in the prompts.ts variant).
     */
    expect(p).toMatch(/from-scratch build therefore ALWAYS uses `?type="file"`?/);
  });

  it('states type="diff" only edits an existing file (never creates one)', () => {
    const p = render();
    expect(p).toContain('NEVER use it to create a new file');
  });

  it('tells the model to fall back to full file when the anchor is uncertain', () => {
    const p = render();
    expect(p).toContain('fall back to');
    expect(p).toContain('full content');
  });
});

describe('diff-edit hybrid policy — scaffold / from-scratch behavior unchanged', () => {
  it('every variant still emits type="file" in its worked example (full-file scaffold path)', () => {
    for (const { render } of variants) {
      const p = render();
      expect(p).toContain('type="file"');
    }
  });
});
