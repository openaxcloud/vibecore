import { describe, expect, it } from 'vitest';
import { partitionFileReads, type FileArtifact } from './folderImport';

const makeFile = (relativePath: string, name = relativePath.split('/').pop() || relativePath): File => {
  const file = new File(['x'], name);
  Object.defineProperty(file, 'webkitRelativePath', { value: relativePath, configurable: true });

  return file;
};

const fulfilled = (artifact: FileArtifact): PromiseSettledResult<FileArtifact> => ({
  status: 'fulfilled',
  value: artifact,
});

const rejected = (reason: unknown): PromiseSettledResult<FileArtifact> => ({ status: 'rejected', reason });

describe('partitionFileReads', () => {
  it('keeps all successfully-read files', () => {
    const files = [makeFile('root/a.ts'), makeFile('root/b.ts')];

    const results = [fulfilled({ content: 'a', path: 'a.ts' }), fulfilled({ content: 'b', path: 'b.ts' })];

    const { artifacts, skippedPaths } = partitionFileReads(files, results);

    expect(artifacts).toHaveLength(2);
    expect(skippedPaths).toEqual([]);
  });

  it('skips only the failed files instead of aborting the whole import', () => {
    const files = [makeFile('root/a.ts'), makeFile('root/broken.ts'), makeFile('root/c.ts')];

    const results = [
      fulfilled({ content: 'a', path: 'a.ts' }),
      rejected(new Error('IO error')),
      fulfilled({ content: 'c', path: 'c.ts' }),
    ];

    const { artifacts, skippedPaths } = partitionFileReads(files, results);

    expect(artifacts.map((a) => a.path)).toEqual(['a.ts', 'c.ts']);
    expect(skippedPaths).toEqual(['broken.ts']);
  });

  it('strips the top-level folder segment from the skipped path', () => {
    const files = [makeFile('myproject/src/deep/file.ts')];
    const results = [rejected(new Error('permission denied'))];

    const { skippedPaths } = partitionFileReads(files, results);

    expect(skippedPaths).toEqual(['src/deep/file.ts']);
  });

  it('falls back to the file name when no relative path is available', () => {
    const file = new File(['x'], 'orphan.ts');
    const results = [rejected(new Error('abort'))];

    const { skippedPaths } = partitionFileReads([file], results);

    expect(skippedPaths).toEqual(['orphan.ts']);
  });

  it('does not throw even when every file fails', () => {
    const files = [makeFile('root/a.ts'), makeFile('root/b.ts')];
    const results = [rejected(new Error('1')), rejected(new Error('2'))];

    const { artifacts, skippedPaths } = partitionFileReads(files, results);

    expect(artifacts).toEqual([]);
    expect(skippedPaths).toEqual(['a.ts', 'b.ts']);
  });
});
