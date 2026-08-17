import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Measured on an iPhone 13 against the live IDE: the Git panel's refresh and
 * settings buttons rendered at 28×42 CSS pixels — under the 44×44 minimum of
 * WCAG 2.5.5 (Target Size). Their twin in `GitBranchSyncControls` already used
 * `min-h-11 min-w-11` (44px), so the same feature shipped two different target
 * sizes depending on which control you reached for.
 *
 * A source-level guard is the right shape here: the defect is a class choice,
 * it needs no browser, and it names the offending line directly. `h-8 w-8`
 * (32px) is what regressed these two, so icon-only buttons in the Git panel may
 * not use it.
 */
const GIT_TAB = readFileSync(join(__dirname, 'GitTab.tsx'), 'utf8');
const SYNC_CONTROLS = readFileSync(join(__dirname, 'GitBranchSyncControls.tsx'), 'utf8');

/*
 * Read the button's markup from its `data-testid` up to its closing `>`. A naive
 * `indexOf('>')` stops at the arrow in `onClick={() => …}`, so walk to the first
 * `>` that actually closes the tag: the one followed by a newline and indentation.
 */
function classNamesOf(source: string, testId: string) {
  const start = source.indexOf(`data-testid="${testId}"`);

  expect(start, `${testId} not found`).toBeGreaterThan(-1);

  const rest = source.slice(start);
  const end = rest.search(/>\s*\n/);

  return rest.slice(0, end === -1 ? 600 : end);
}

describe('Git panel icon buttons meet the WCAG 2.5.5 target size', () => {
  it('gives the branch refresh button a 44px minimum, like its twin', () => {
    expect(classNamesOf(GIT_TAB, 'git-branch-refresh')).toContain('min-h-11 min-w-11');
  });

  it('gives the settings toggle the same minimum', () => {
    expect(classNamesOf(GIT_TAB, 'git-settings-toggle')).toContain('min-h-11 min-w-11');
  });

  it('no longer sizes either of them with the 32px h-8/w-8 pair', () => {
    expect(classNamesOf(GIT_TAB, 'git-branch-refresh')).not.toMatch(/\bh-8 w-8\b/);
    expect(classNamesOf(GIT_TAB, 'git-settings-toggle')).not.toMatch(/\bh-8 w-8\b/);
  });

  it('keeps the twin control that was already correct as the reference', () => {
    expect(classNamesOf(SYNC_CONTROLS, 'git-refresh')).toContain('min-h-11 min-w-11');
  });
});
