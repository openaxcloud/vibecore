import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';

import { GitCliProvider } from '../project-storage.js';

/*
 * Regression for the live prod bug: the IDE Git tab showed two red
 * "[PANEL_BACKEND_UNAVAILABLE] Failed to load panel data" banners and "0 changed"
 * even after the agent edited files. Root cause: a project's API-pod storage dir
 * had a `.git` PATH that was not a valid repo (empty/partial), so ensureRepository
 * skipped `git init` and every git command failed with "fatal: not a git
 * repository" (git/status + git/branches → 500). The fix validates the repo with
 * `git rev-parse` and (re)inits when invalid.
 */
const previousProjectStorageDir = process.env.PROJECT_STORAGE_DIR;

afterEach(() => {
  if (previousProjectStorageDir === undefined) {
    delete process.env.PROJECT_STORAGE_DIR;
  } else {
    process.env.PROJECT_STORAGE_DIR = previousProjectStorageDir;
  }
});

describe('GitCliProvider self-heals an invalid .git (PANEL_BACKEND_UNAVAILABLE fix)', () => {
  it('does not throw on an empty/corrupt .git — status + branches self-heal, and the edited file shows as changed', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'vibecore-corrupt-git-'));
    const storage = join(parent, '.vibecore-project-storage');
    process.env.PROJECT_STORAGE_DIR = storage;

    const projectId = 'corrupt-git-project';
    const scope = { expectedOrganizationId: 'org_corrupt_git_project' };
    const projectDir = join(storage, projectId);

    // Reproduce prod: a `.git` PATH exists but is NOT a valid repository.
    await mkdir(join(projectDir, '.git'), { recursive: true });
    await writeFile(join(projectDir, 'Settings.tsx'), 'export const x = 1;\n');

    const provider = new GitCliProvider();

    // Before the fix these threw "fatal: not a git repository" (→ 500 → banner).
    const status = await provider.status(projectId, scope);
    expect(status.branch).toBeTruthy();
    // "0 changed" is fixed: the user's file surfaces as a real change.
    expect(status.changedFiles).toContain('Settings.tsx');

    const branches = await provider.listBranches(projectId, scope);
    expect(Array.isArray(branches)).toBe(true);
  });

  it('initialises a project that has no .git at all (status returns real changes)', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'vibecore-nogit-'));
    const storage = join(parent, '.vibecore-project-storage');
    process.env.PROJECT_STORAGE_DIR = storage;

    const projectId = 'no-git-project';
    const scope = { expectedOrganizationId: 'org_no_git_project' };
    const projectDir = join(storage, projectId);
    await mkdir(projectDir, { recursive: true });
    await writeFile(join(projectDir, 'App.tsx'), 'export default 1;\n');

    const provider = new GitCliProvider();
    const status = await provider.status(projectId, scope);

    expect(status.changedFiles).toContain('App.tsx');
  });
});
