import { describe, expect, it } from 'vitest';

import {
  formatGitMergeEditorConflicts,
  formatGitMergeEditorCopy,
  gitMergeEditorEn,
  gitMergeEditorFr,
} from './git-merge-editor';

describe('git merge editor catalog', () => {
  it('keeps complete English and French key parity', () => {
    expect(Object.keys(gitMergeEditorFr).sort()).toEqual(Object.keys(gitMergeEditorEn).sort());
  });

  it('formats French plurals and interpolation without exposing raw keys', () => {
    expect(formatGitMergeEditorConflicts(1, 'fr')).toBe('1 conflit');
    expect(formatGitMergeEditorConflicts(2, 'fr')).toBe('2 conflits');
    expect(formatGitMergeEditorCopy(gitMergeEditorFr['gitMergeEditor.status.choose'], { chosen: 1, total: 2 })).toBe(
      'Choisissez une version pour chaque conflit (1/2).',
    );
  });
});
