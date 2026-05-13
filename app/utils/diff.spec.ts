import { describe, expect, it } from 'vitest';
import { WORK_DIR } from './constants';
import { applyReviewableDiffHunks, buildReviewableDiffHunks, extractRelativePath } from './diff';

describe('Diff', () => {
  it('should strip out Work_dir', () => {
    const filePath = `${WORK_DIR}/index.js`;
    const result = extractRelativePath(filePath);
    expect(result).toBe('index.js');
  });

  it('builds reviewable hunks and applies selected hunks only', () => {
    const original = [
      'export function App() {',
      '  return <h1>Old</h1>;',
      '}',
      '',
      'export const version = 1;',
      '',
    ].join('\n');
    const proposed = [
      'export function App() {',
      '  return <h1>New</h1>;',
      '}',
      '',
      'export const version = 2;',
      '',
    ].join('\n');

    const hunks = buildReviewableDiffHunks('src/App.tsx', original, proposed);

    expect(hunks).toHaveLength(1);
    expect(hunks[0].lines.some((line) => line.type === 'add' && line.content.includes('New'))).toBe(true);

    expect(applyReviewableDiffHunks({ originalContent: original, hunks, acceptedHunkIds: [] })).toBe(original);
    expect(applyReviewableDiffHunks({ originalContent: original, hunks, acceptedHunkIds: [hunks[0].id] })).toBe(
      proposed,
    );
  });

  it('can reject one hunk while accepting another', () => {
    const original = [
      'const a = 1;',
      'const keep1 = true;',
      'const keep2 = true;',
      'const keep3 = true;',
      'const keep4 = true;',
      'const keep5 = true;',
      'const keep6 = true;',
      'const keep7 = true;',
      'const keep8 = true;',
      'const b = 1;',
      '',
    ].join('\n');
    const proposed = [
      'const a = 2;',
      'const keep1 = true;',
      'const keep2 = true;',
      'const keep3 = true;',
      'const keep4 = true;',
      'const keep5 = true;',
      'const keep6 = true;',
      'const keep7 = true;',
      'const keep8 = true;',
      'const b = 2;',
      '',
    ].join('\n');

    const hunks = buildReviewableDiffHunks('src/two-hunks.ts', original, proposed);

    expect(hunks.length).toBeGreaterThanOrEqual(1);

    const result = applyReviewableDiffHunks({
      originalContent: original,
      hunks,
      acceptedHunkIds: [hunks[0].id],
    });

    expect(result).toContain('const a = 2;');
    expect(result).toContain('const b = 1;');
  });
});
