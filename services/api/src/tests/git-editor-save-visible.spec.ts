import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { GitCliProvider, type ProjectFile } from '../project-storage.js';

/*
 * Reported live: after typing in the editor and saving, the Git panel still said
 * "0 changes" and both commit buttons stayed disabled — for good. The save lands
 * in the workspace pod (`PUT /files/write`) and in `ide-state`; neither of those
 * is the git working tree, and nothing else wrote it (only an agent artifact
 * close did). So git genuinely saw nothing, and `commit()` — which is handed the
 * user's current files — ignored them and staged an unchanged tree.
 *
 * Both entry points must now take the caller's files into account.
 */
const previousProjectStorageDir = process.env.PROJECT_STORAGE_DIR;

afterEach(() => {
  if (previousProjectStorageDir === undefined) {
    delete process.env.PROJECT_STORAGE_DIR;
  } else {
    process.env.PROJECT_STORAGE_DIR = previousProjectStorageDir;
  }
});

function file(path: string, content: string): ProjectFile {
  return { path, content, updatedAt: new Date(0).toISOString() };
}

async function seedCommittedProject(label: string) {
  const parent = await mkdtemp(join(tmpdir(), `vibecore-${label}-`));
  const storage = join(parent, '.vibecore-project-storage');
  process.env.PROJECT_STORAGE_DIR = storage;

  const projectId = `${label}-project`;
  const expectedOrganizationId = `${label}-organization`;
  const projectDir = join(storage, projectId);
  await mkdir(projectDir, { recursive: true });
  await writeFile(join(projectDir, 'App.tsx'), 'export const App = () => null;\n');

  const provider = new GitCliProvider();

  await provider.commit({
    projectId,
    expectedOrganizationId,
    message: 'chore: initial scaffold',
    files: [file('App.tsx', 'export const App = () => null;\n')],
  });

  return { provider, projectId, expectedOrganizationId, projectDir };
}

describe('an edit saved in the editor is visible to Git', () => {
  it('reports the edited file as changed instead of "0 changes"', async () => {
    const { provider, projectId, expectedOrganizationId } = await seedCommittedProject('git-status');
    const scope = { expectedOrganizationId };

    const clean = await provider.status(projectId, scope);
    expect(clean.changedFiles, 'a freshly committed project has nothing to report').toEqual([]);

    // What the IDE holds after the user typed and saved.
    const edited = [file('App.tsx', 'export const App = () => null;\n// QA edit\n')];

    const dirty = await provider.status(projectId, scope, edited);

    expect(dirty.changedFiles).toEqual(['App.tsx']);
    expect(dirty.fileStatuses?.[0]?.status).toBe('M');
  });

  /*
   * Found while writing the test above: `git()` trimmed ALL of git's output, and
   * `git status --porcelain=v1` marks an unstaged change with a LEADING SPACE
   * (" M path"). Trimming ate it on the first line, so the path parser's
   * `slice(3)` cut one character too many — the first changed file was reported
   * as "pp.tsx" instead of "App.tsx", and every per-file git action on that path
   * then targeted a file that does not exist.
   */
  it('reports the first changed path in full, not missing its first character', async () => {
    const { provider, projectId, expectedOrganizationId } = await seedCommittedProject('git-porcelain-trim');

    const status = await provider.status(projectId, { expectedOrganizationId }, [
      file('App.tsx', 'export const App = () => null;\n// edit\n'),
    ]);

    expect(status.changedFiles[0]).toBe('App.tsx');
    expect(status.changedFiles[0]).not.toBe('pp.tsx');
    expect(status.fileStatuses?.[0]?.path).toBe('App.tsx');
  });

  it('sees a file created in the editor that the working tree never had', async () => {
    const { provider, projectId, expectedOrganizationId } = await seedCommittedProject('git-status-new');

    const withNewFile = await provider.status(projectId, { expectedOrganizationId }, [
      file('App.tsx', 'export const App = () => null;\n'),
      file('src/added.ts', 'export const added = true;\n'),
    ]);

    expect(withNewFile.changedFiles).toContain('src/added.ts');
  });

  it('commits the caller files rather than dying on an unchanged tree', async () => {
    const { provider, projectId, expectedOrganizationId, projectDir } = await seedCommittedProject('git-commit');

    const commit = await provider.commit({
      projectId,
      expectedOrganizationId,
      message: 'feat: editor edit',
      files: [file('App.tsx', 'export const App = () => <div />;\n')],
    });

    expect(commit.sha).toMatch(/^[0-9a-f]{7,40}$/);
    expect(commit.message).toBe('feat: editor edit');

    // The commit really carries the new content, and the tree is clean after it.
    expect((await readFile(join(projectDir, 'App.tsx'))).toString()).toContain('<div />');
    expect((await provider.status(projectId, { expectedOrganizationId })).changedFiles).toEqual([]);
  });

  it('leaves the tree untouched when the files are identical, so polling status is not a write storm', async () => {
    const { provider, projectId, expectedOrganizationId, projectDir } = await seedCommittedProject('git-idempotent');

    const before = (await readFile(join(projectDir, 'App.tsx'))).toString();
    const unchanged = [file('App.tsx', before)];

    expect((await provider.status(projectId, { expectedOrganizationId }, unchanged)).changedFiles).toEqual([]);
    expect((await provider.status(projectId, { expectedOrganizationId }, unchanged)).changedFiles).toEqual([]);
    expect((await readFile(join(projectDir, 'App.tsx'))).toString()).toBe(before);
  });
});
