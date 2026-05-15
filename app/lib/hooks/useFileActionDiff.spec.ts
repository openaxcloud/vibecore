import { describe, expect, it } from 'vitest';

import { computeFileActionDiff } from './useFileActionDiff';
import type { FileMap } from '~/lib/stores/files';
import type { FileActionBlock } from '~/types/message-blocks';

function fileBlock(filePath: string, content: string): FileActionBlock {
  return {
    id: `block-${filePath}`,
    kind: 'fileAction',
    artifactId: 'art-1',
    actionId: `act-${filePath}`,
    filePath,
    content,
    streaming: false,
  };
}

describe('computeFileActionDiff', () => {
  it('resolves relative paths against WORK_DIR and reads the matching workbench file', () => {
    const files: FileMap = {
      '/home/project/src/App.tsx': { type: 'file', content: 'export const App = () => null;\n', isBinary: false },
    };

    const diff = computeFileActionDiff(files, fileBlock('src/App.tsx', 'export const App = () => <div />;\n'));

    expect(diff.absolutePath).toBe('/home/project/src/App.tsx');
    expect(diff.isNewFile).toBe(false);
    expect(diff.originalContent).toContain('const App = () => null');
    expect(diff.proposedContent).toContain('<div />');
    expect(diff.summary.hasChanges).toBe(true);
    expect(diff.summary.addedLines).toBeGreaterThan(0);
    expect(diff.summary.removedLines).toBeGreaterThan(0);
    expect(diff.hunks.length).toBeGreaterThan(0);
  });

  it('flags brand-new files when the workbench has no matching path', () => {
    const files: FileMap = {};

    const diff = computeFileActionDiff(files, fileBlock('src/brand-new.ts', 'export const created = true;\n'));

    expect(diff.isNewFile).toBe(true);
    expect(diff.originalContent).toBe('');
    expect(diff.summary.addedLines).toBeGreaterThan(0);
    expect(diff.summary.removedLines).toBe(0);
  });

  it('returns an empty hunk set when proposed content matches stored content', () => {
    const same = 'unchanged\nfile\n';

    const files: FileMap = {
      '/home/project/src/same.ts': { type: 'file', content: same, isBinary: false },
    };

    const diff = computeFileActionDiff(files, fileBlock('src/same.ts', same));

    expect(diff.isNewFile).toBe(false);
    expect(diff.hunks).toHaveLength(0);
    expect(diff.summary.hasChanges).toBe(false);
    expect(diff.summary.addedLines).toBe(0);
    expect(diff.summary.removedLines).toBe(0);
  });

  it('accepts absolute paths verbatim instead of double-prefixing WORK_DIR', () => {
    const files: FileMap = {
      '/home/project/src/abs.ts': { type: 'file', content: 'a\n', isBinary: false },
    };

    const diff = computeFileActionDiff(files, fileBlock('/home/project/src/abs.ts', 'a\nb\n'));

    expect(diff.absolutePath).toBe('/home/project/src/abs.ts');
    expect(diff.isNewFile).toBe(false);
    expect(diff.summary.addedLines).toBe(1);
  });

  it('treats a folder entry at the same path as if no file existed', () => {
    const files: FileMap = {
      '/home/project/src/legacy.ts': { type: 'folder' },
    };

    const diff = computeFileActionDiff(files, fileBlock('src/legacy.ts', 'export {};\n'));

    expect(diff.isNewFile).toBe(true);
    expect(diff.originalContent).toBe('');
    expect(diff.summary.addedLines).toBeGreaterThan(0);
  });
});
