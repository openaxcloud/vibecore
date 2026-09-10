import { mkdir, mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { archiveFiles, GitCliProvider, LocalProjectStorage } from '../project-storage.js';

/*
 * AUDX-001 — symlink exfiltration through project storage.
 *
 * safeProjectPath() is purely LEXICAL: it normalises and compares strings, so it
 * cannot see a symlink. Git carries symlinks (mode 120000), so a repository
 * brought in by import / clone / pull can plant one; the lexical check then
 * approves `<root>/link` and readFile/writeFile FOLLOW it out of the project.
 *
 * Each test below drives ONE flow named in the audit, against a REAL symlink on
 * disk — not a mocked path helper, because the whole defect is that the string
 * looks fine and only the filesystem knows better.
 */
describe('AUDX-001 project-storage symlink containment', () => {
  const previous = process.env.PROJECT_STORAGE_DIR;

  let storageRoot: string;
  let outsideFile: string;
  let projectId: string;

  beforeEach(async () => {
    storageRoot = await mkdtemp(join(tmpdir(), 'audx001-'));
    process.env.PROJECT_STORAGE_DIR = storageRoot;
    projectId = 'project_victim';

    /*
     * A file the API process can read but the tenant must never reach: stands in
     * for /etc/passwd or another tenant's project directory.
     */
    const outsideDir = await mkdtemp(join(tmpdir(), 'audx001-outside-'));
    outsideFile = join(outsideDir, 'secret.txt');
    await writeFile(outsideFile, 'CROSS-TENANT-SECRET', 'utf8');

    await mkdir(join(storageRoot, projectId), { recursive: true });
  });

  afterEach(() => {
    if (previous === undefined) {
      delete process.env.PROJECT_STORAGE_DIR;
    } else {
      process.env.PROJECT_STORAGE_DIR = previous;
    }
  });

  /** Plant the symlink a malicious/compromised repository would carry. */
  async function plantSymlink(name = 'escape') {
    await symlink(outsideFile, join(storageRoot, projectId, name));

    return name;
  }

  /*
   * FLOW 1 — conflict-file. The audit's headline case: the merge-conflict viewer
   * reads the working-tree file verbatim, so following a symlink turns it into
   * an arbitrary-file read.
   */
  it('conflict-file refuses to read through a repo-planted symlink', async () => {
    const name = await plantSymlink();
    const git = new GitCliProvider(new LocalProjectStorage());

    await expect(git.conflictFile(projectId, name)).rejects.toThrow();
  });

  it('conflict-file still reads an ordinary file', async () => {
    await writeFile(join(storageRoot, projectId, 'ok.txt'), 'MERGE <<<<<<< MARKERS', 'utf8');

    const git = new GitCliProvider(new LocalProjectStorage());

    await expect(git.conflictFile(projectId, 'ok.txt')).resolves.toMatchObject({
      content: 'MERGE <<<<<<< MARKERS',
    });
  });

  /* FLOW 2 — mark-resolved writes the merged buffer back through the same path. */
  it('mark-resolved refuses to write through a repo-planted symlink', async () => {
    const name = await plantSymlink();
    const git = new GitCliProvider(new LocalProjectStorage());

    await expect(git.markResolved({ projectId, filePath: name, content: 'overwritten' })).rejects.toThrow();

    // The decisive assertion: the file OUTSIDE the project is untouched.
    expect(await readFile(outsideFile, 'utf8')).toBe('CROSS-TENANT-SECRET');
  });

  /*
   * FLOW 3 — restore. Restore clears the working tree first, which happens to
   * delete a symlink planted at the TOP level before the write loop runs. It does
   * NOT clear `.git` (wiping it would destroy history), so a link planted there
   * survives the clear and is still reachable by an attacker-chosen restore path.
   * That is the escape this asserts — a top-level link would have passed for the
   * wrong reason.
   */
  it('restore refuses to write through a symlink that survives the tree clear', async () => {
    await mkdir(join(storageRoot, projectId, '.git', 'hooks'), { recursive: true });
    await symlink(outsideFile, join(storageRoot, projectId, '.git', 'hooks', 'escape'));

    const storage = new LocalProjectStorage();

    await expect(
      storage.restoreSnapshot({ projectId, files: [{ path: '.git/hooks/escape', content: 'overwritten' }] }),
    ).rejects.toThrow();

    expect(await readFile(outsideFile, 'utf8')).toBe('CROSS-TENANT-SECRET');
  });

  /* FLOW 4 — import / autosave: the generic write path. */
  it('writeFiles refuses to write through a repo-planted symlink', async () => {
    const name = await plantSymlink();
    const storage = new LocalProjectStorage();

    await expect(storage.writeFiles(projectId, [{ path: name, content: 'overwritten' }])).rejects.toThrow();
    expect(await readFile(outsideFile, 'utf8')).toBe('CROSS-TENANT-SECRET');
  });

  /*
   * FLOW 5 — import. A zip is fully attacker-controlled, so it can carry a
   * `.git/` entry that lands next to a link the clear preserves.
   */
  it('importZip refuses to write through a symlink that survives the tree clear', async () => {
    await mkdir(join(storageRoot, projectId, '.git', 'hooks'), { recursive: true });
    await symlink(outsideFile, join(storageRoot, projectId, '.git', 'hooks', 'escape'));

    const storage = new LocalProjectStorage();
    const zip = (await archiveFiles([{ path: '.git/hooks/escape', content: 'overwritten' }])).toString('base64');

    await expect(storage.importZip(projectId, zip, { replaceExisting: true })).rejects.toThrow();
    expect(await readFile(outsideFile, 'utf8')).toBe('CROSS-TENANT-SECRET');
  });

  /*
   * A DANGLING symlink is the nastier variant: realpath() throws ENOENT, which an
   * ancestor-walk alone reads as "file not created yet" and approves — then the
   * write follows the link and CREATES the file outside the root. Only an lstat
   * on the final component catches it.
   */
  it('refuses a dangling symlink instead of creating the file outside the root', async () => {
    const outsideTarget = join(await mkdtemp(join(tmpdir(), 'audx001-dangling-')), 'not-yet.txt');
    await symlink(outsideTarget, join(storageRoot, projectId, 'dangling'));

    const storage = new LocalProjectStorage();

    await expect(storage.writeFiles(projectId, [{ path: 'dangling', content: 'created outside' }])).rejects.toThrow();

    await expect(readFile(outsideTarget, 'utf8')).rejects.toThrow();
  });

  /*
   * A symlinked DIRECTORY component escapes just as well as a symlinked file:
   * `ln -s /outside dir` then writing `dir/child.txt` lands outside. The final
   * component here is not itself a link, so only the ancestor realpath walk
   * catches this one — it is a genuinely different mechanism from the test above.
   */
  it('refuses to write through a symlinked parent directory', async () => {
    const outsideDir = await mkdtemp(join(tmpdir(), 'audx001-dir-'));
    await symlink(outsideDir, join(storageRoot, projectId, 'linkdir'));

    const storage = new LocalProjectStorage();

    await expect(storage.writeFiles(projectId, [{ path: 'linkdir/child.txt', content: 'escaped' }])).rejects.toThrow();

    await expect(readFile(join(outsideDir, 'child.txt'), 'utf8')).rejects.toThrow();
  });

  /*
   * Regression guard for the containment check itself. A secondary workspace's
   * directory is created lazily, so on the FIRST write its root does not exist.
   * An ancestor walk that does not stop at the root then reaches the project
   * directory — a strict ancestor — whose relative path starts with '..' and
   * looks exactly like an escape. That rejected every legitimate first write
   * into a new workspace: the guard has to let ordinary work through, or it gets
   * reverted rather than fixed.
   */
  it('allows a normal write into a workspace whose root does not exist yet', async () => {
    const storage = new LocalProjectStorage();

    const files = await storage.writeFiles(projectId, [{ path: 'src/app.ts', content: 'ok' }], 'workspace_new');

    expect(files.map((file) => file.path)).toContain('src/app.ts');
  });

  /*
   * Listing must not follow links either. readdir(withFileTypes) uses lstat
   * semantics, so a symlink is neither isFile() nor isDirectory() and is skipped
   * — this asserts that behaviour rather than assuming it, because the whole
   * export/import round-trip depends on it.
   */
  it('listFiles does not read the target of a symlink', async () => {
    await plantSymlink();
    await writeFile(join(storageRoot, projectId, 'real.txt'), 'ordinary', 'utf8');

    const storage = new LocalProjectStorage();

    const files = await storage.listFiles(projectId);

    expect(files.map((file) => file.path)).toEqual(['real.txt']);
    expect(JSON.stringify(files)).not.toContain('CROSS-TENANT-SECRET');
  });
});
