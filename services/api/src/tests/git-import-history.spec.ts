import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  truncateSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import JSZip from 'jszip';
import { afterEach, expect, it, vi } from 'vitest';
import { GitCliProvider, LocalProjectStorage } from '../project-storage.js';

afterEach(() => vi.unstubAllEnvs());

it('retains branch ancestry and tracking while rebuilding local Git metadata', async () => {
  const root = mkdtempSync(join(tmpdir(), 'git-import-history-'));
  const scratch = mkdtempSync(join(process.cwd(), '.git-import-scratch-test-'));

  try {
    const upstream = join(root, 'upstream');
    const bin = join(root, 'bin');
    const storage = join(root, 'projects');
    const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
    mkdirSync(bin);
    git(root, 'init', '-q', '-b', 'release', upstream);
    git(upstream, 'config', 'user.name', 'Fixture');
    git(upstream, 'config', 'user.email', 'fixture@example.invalid');
    writeFileSync(join(upstream, 'README'), 'first');
    git(upstream, 'add', 'README');
    git(upstream, 'commit', '-qm', 'first');
    symlinkSync('README', join(upstream, 'link'));
    git(upstream, 'add', 'link');
    git(upstream, 'commit', '-qm', 'second');

    // Only the external clone transport is doubled. All history, index and
    // config operations run the installed Git against disposable directories.
    vi.stubEnv('FIXTURE_GIT', execFileSync('which', ['git'], { encoding: 'utf8' }).trim());
    vi.stubEnv('FIXTURE_UPSTREAM', upstream);
    vi.stubEnv('GIT_ALLOW_PROTOCOL', 'file');
    writeFileSync(
      join(bin, 'git'),
      `#!/bin/sh
set -eu
for arg in "$@"; do
  if [ "$arg" = clone ]; then
    for target in "$@"; do :; done
    "$FIXTURE_GIT" clone --quiet --no-local --no-checkout --template= "$FIXTURE_UPSTREAM" "$target"
    "$FIXTURE_GIT" -C "$target" config fixture.private-setting local-only
    mkdir -p "$target/.git/hooks"
    echo inert > "$target/.git/hooks/local-marker"
    exit 0
  fi
done
exec "$FIXTURE_GIT" "$@"
`,
      { mode: 0o700 },
    );
    vi.stubEnv('PATH', bin + ':' + process.env.PATH);
    vi.stubEnv('PROJECT_STORAGE_DIR', storage);
    vi.stubEnv('GIT_IMPORT_SCRATCH_DIR', scratch);

    const provider = new GitCliProvider({ resolveHost: async () => ['93.184.216.34'] });
    const projectId = 'reserved-project';
    const project = join(storage, projectId);
    const imported = await provider.importRepository({
      repositoryUrl: 'https://fixture:transient@forge.example.invalid/source.git?temporary=value',
      branch: 'release',
      destinationProjectId: projectId,
    });
    await new LocalProjectStorage().writeFiles(projectId, imported.files);
    expect(imported.remoteUrl).toBe('https://forge.example.invalid/source.git');
    expect(git(project, 'remote', 'get-url', 'origin')).toBe(imported.remoteUrl);
    expect(git(project, 'rev-parse', 'HEAD~1')).toBe(git(upstream, 'rev-parse', 'HEAD~1'));
    expect(git(project, 'rev-parse', '@{upstream}')).toBe(git(upstream, 'rev-parse', 'HEAD'));
    expect(git(project, 'status', '--porcelain')).toBe('');
    expect(existsSync(join(project, 'link'))).toBe(false);
    expect(existsSync(join(project, '.git/hooks/local-marker'))).toBe(false);
    expect(readFileSync(join(project, '.git/config'), 'utf8')).not.toMatch(/private-setting|transient|temporary=value/);
    expect(git(project, 'config', '--get-urlmatch', 'http.followRedirects', imported.remoteUrl)).toBe('false');
    expect(git(project, 'config', '--get-urlmatch', 'http.curloptResolve', imported.remoteUrl)).toContain(
      '93.184.216.34',
    );

    await provider.commit({ projectId, message: 'third', files: [{ ...imported.files[0], content: 'edited' }] });
    expect(git(project, 'rev-parse', 'HEAD^')).toBe(git(upstream, 'rev-parse', 'HEAD'));
    expect(git(project, 'show', 'HEAD:link')).toBe('README');
    const saved = git(project, 'rev-parse', 'HEAD');
    const reloadedStorage = new LocalProjectStorage();
    await reloadedStorage.restoreSnapshot({
      projectId,
      workspaceId: undefined,
      files: await reloadedStorage.listFiles(projectId),
    });
    expect((await new GitCliProvider().status(projectId)).branch).toBe('release');
    expect(git(project, 'rev-parse', 'HEAD')).toBe(saved);
    expect(git(project, 'remote', 'get-url', 'origin')).toBe(imported.remoteUrl);

    // An ordinary, highly compressible file: a small network pack must not
    // authorize expansion of a file beyond the working-tree limit.
    writeFileSync(join(upstream, 'large.dat'), '');
    truncateSync(join(upstream, 'large.dat'), 26 * 1024 * 1024);
    git(upstream, 'add', 'large.dat');
    git(upstream, 'commit', '-qm', 'large test file');
    await expect(
      provider.importRepository({
        repositoryUrl: imported.remoteUrl,
        branch: 'release',
        destinationProjectId: 'too-large-project',
      }),
    ).rejects.toMatchObject({ code: 'IMPORT_TOO_LARGE' });
    expect(existsSync(join(storage, 'too-large-project'))).toBe(false);
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('GIT_IMPORT_SCRATCH_DIR', '');
    await expect(
      provider.importRepository({ repositoryUrl: imported.remoteUrl, destinationProjectId: 'unbounded-scratch' }),
    ).rejects.toMatchObject({ code: 'IMPORT_STORAGE_UNAVAILABLE' });
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(scratch, { recursive: true, force: true });
  }
});

it('imports ZIP working files without accepting repository metadata or replacing the existing origin', async () => {
  const storage = mkdtempSync(join(tmpdir(), 'git-zip-working-files-'));
  vi.stubEnv('PROJECT_STORAGE_DIR', storage);
  try {
    const archive = new JSZip();
    archive.file('README.md', 'working file');
    archive.file('.git/config', 'inert fixture marker');
    archive.file('nested/.Git/HEAD', 'inert fixture marker');
    const payload = await archive.generateAsync({ type: 'base64' });
    const files = new LocalProjectStorage();
    const provider = new GitCliProvider();
    await files.importZip('project', payload);
    const project = join(storage, 'project');
    expect(existsSync(join(project, '.git'))).toBe(false);
    expect(existsSync(join(project, 'nested/.Git'))).toBe(false);
    expect(readFileSync(join(project, 'README.md'), 'utf8')).toBe('working file');
    const remoteUrl = 'https://forge.example.invalid/fixture.git';
    await provider.configureRemote({ projectId: 'project', remoteUrl });
    const config = readFileSync(join(project, '.git/config'), 'utf8');
    await files.importZip('project', payload, { replaceExisting: true });
    expect(readFileSync(join(project, '.git/config'), 'utf8')).toBe(config);
  } finally {
    rmSync(storage, { recursive: true, force: true });
  }
});
