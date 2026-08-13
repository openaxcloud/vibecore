import { describe, expect, it } from 'vitest';
import { buildOverwritePrompt, findUploadCollisions } from './file-tree-upload-collision';
import type { FileMap } from '~/lib/stores/files';

const fileMap: FileMap = {
  '/home/project': { type: 'folder' },
  '/home/project/assets': { type: 'folder' },
  '/home/project/assets/logo.png': { type: 'file', content: 'OLD', isBinary: true },
  '/home/project/config.json': { type: 'file', content: '{}', isBinary: false },
};

describe('findUploadCollisions', () => {
  it('flags a dropped file that would overwrite an existing entry', () => {
    const collisions = findUploadCollisions([{ name: 'logo.png' }], '/home/project/assets', fileMap);

    expect(collisions).toEqual([{ file: { name: 'logo.png' }, filePath: '/home/project/assets/logo.png' }]);
  });

  it('returns nothing when the target name is free', () => {
    const collisions = findUploadCollisions([{ name: 'new.png' }], '/home/project/assets', fileMap);

    expect(collisions).toEqual([]);
  });

  it('keys collisions on the resolved path, not just the name', () => {
    // logo.png exists under /assets but not at the project root.
    const collisions = findUploadCollisions([{ name: 'logo.png' }], '/home/project', fileMap);

    expect(collisions).toEqual([]);
  });

  it('reports only the colliding files in a mixed batch', () => {
    const collisions = findUploadCollisions([{ name: 'config.json' }, { name: 'fresh.txt' }], '/home/project', fileMap);

    expect(collisions.map((collision) => collision.file.name)).toEqual(['config.json']);
  });
});

describe('buildOverwritePrompt', () => {
  it('uses singular wording for one collision', () => {
    const prompt = buildOverwritePrompt([{ file: { name: 'logo.png' }, filePath: '/x/logo.png' }]);

    expect(prompt).toBe('A file named "logo.png" already exists here. Overwrite it?');
  });

  it('lists every name for multiple collisions', () => {
    const prompt = buildOverwritePrompt([
      { file: { name: 'a.txt' }, filePath: '/x/a.txt' },
      { file: { name: 'b.txt' }, filePath: '/x/b.txt' },
    ]);

    expect(prompt).toContain('2 files already exist');
    expect(prompt).toContain('a.txt');
    expect(prompt).toContain('b.txt');
  });
});
