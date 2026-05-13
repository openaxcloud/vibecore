import { execFile as execFileCallback } from 'node:child_process';
import { access, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, normalize, relative } from 'node:path';
import { promisify } from 'node:util';
import JSZip from 'jszip';

const execFile = promisify(execFileCallback);

function commandStdout(result: unknown) {
  if (typeof result === 'string') {
    return result;
  }

  if (Array.isArray(result)) {
    return String(result[0] ?? '');
  }

  return String((result as { stdout?: unknown })?.stdout ?? '');
}

async function pathExists(path: string) {
  return access(path)
    .then(() => true)
    .catch(() => false);
}

export interface ProjectFile {
  path: string;
  content: string;
  updatedAt: string;
}

export interface StoredArchive {
  storageKey: string;
  byteLength: number;
  createdAt: string;
}

export interface GitCommitNode {
  sha: string;
  shortSha: string;
  parents: string[];
  author: string;
  date: string;
  message: string;
  refs?: string;
}

export interface GitBlameLine {
  line: number;
  sha: string;
  author: string;
  date: string;
  content: string;
}

export interface GitProvider {
  importRepository(input: {
    repositoryUrl: string;
    branch?: string;
  }): Promise<{ files: ProjectFile[]; defaultBranch: string; remoteUrl: string }>;
  status(projectId: string): Promise<{
    branch: string;
    changedFiles: string[];
    fileStatuses?: Array<{ path: string; status: string }>;
    conflicts?: Array<{ path: string; status: string }>;
    ahead: number;
    behind: number;
  }>;
  commit(input: {
    projectId: string;
    message: string;
    files: ProjectFile[];
    selectedFiles?: string[];
  }): Promise<{ sha: string; message: string }>;
  push(input: { projectId: string; branch: string }): Promise<{ pushed: boolean; branch: string }>;
  pull(input: {
    projectId: string;
    branch: string;
  }): Promise<{ pulled: boolean; branch: string; changedFiles: string[] }>;
  listBranches(projectId: string): Promise<string[]>;
  checkoutBranch(input: {
    projectId: string;
    branch: string;
    create?: boolean;
    startPoint?: string;
  }): Promise<{ branch: string }>;
  stashPush(input: { projectId: string; message?: string }): Promise<{ stashed: boolean; output: string }>;
  stashList(projectId: string): Promise<Array<{ id: string; branch?: string; message: string }>>;
  stashApply(input: {
    projectId: string;
    stashRef: string;
    drop?: boolean;
  }): Promise<{ applied: boolean; output: string }>;
  cherryPick(input: { projectId: string; sha: string }): Promise<{ picked: boolean; output: string }>;
  resolveConflict(input: {
    projectId: string;
    filePath: string;
    strategy: 'ours' | 'theirs';
  }): Promise<{ resolved: boolean; filePath: string; strategy: 'ours' | 'theirs' }>;
  logGraph(projectId: string, limit?: number): Promise<GitCommitNode[]>;
  diff(projectId: string, filePath?: string): Promise<string>;
  blame(input: { projectId: string; filePath: string; startLine?: number; endLine?: number }): Promise<GitBlameLine[]>;
  createPullRequest(input: {
    projectId: string;
    title: string;
    body?: string;
    sourceBranch: string;
    targetBranch: string;
  }): Promise<{ url: string; number: number }>;
}

export interface ProjectStorage {
  writeFiles(projectId: string, files: Array<{ path: string; content: string }>): Promise<ProjectFile[]>;
  listFiles(projectId: string): Promise<ProjectFile[]>;
  exportZip(projectId: string): Promise<StoredArchive & { base64: string }>;
  importZip(projectId: string, base64: string, options?: { replaceExisting?: boolean }): Promise<ProjectFile[]>;
  createSnapshot(input: { projectId: string; label?: string; files: ProjectFile[] }): Promise<StoredArchive>;
  getSnapshotFiles(storageKey: string): Promise<ProjectFile[]>;
  restoreSnapshot(input: { projectId: string; files: ProjectFile[] }): Promise<ProjectFile[]>;
}

function now() {
  return new Date().toISOString();
}

function archiveKey(prefix: string, projectId: string) {
  return `${prefix}/${projectId}/${Date.now()}-${Math.random().toString(36).slice(2)}.zip`;
}

function storageRoot() {
  return process.env.PROJECT_STORAGE_DIR ?? join(process.cwd(), '.vibecore-project-storage');
}

function safeProjectPath(projectId: string, filePath = '') {
  const root = join(storageRoot(), projectId);
  const target = normalize(join(root, filePath));

  if (relative(root, target).startsWith('..')) {
    throw new Error('Invalid project file path');
  }

  return target;
}

async function walkFiles(root: string, current = ''): Promise<ProjectFile[]> {
  const dir = join(root, current);

  const entries = await readdir(dir, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') {
      return [];
    }

    throw error;
  });

  const files: ProjectFile[] = [];

  for (const entry of entries) {
    const child = join(current, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await walkFiles(root, child)));
      continue;
    }

    if (entry.isFile()) {
      const fullPath = join(root, child);
      const metadata = await stat(fullPath);
      files.push({ path: child, content: await readFile(fullPath, 'utf8'), updatedAt: metadata.mtime.toISOString() });
    }
  }

  return files;
}

export class LocalProjectStorage implements ProjectStorage {
  async writeFiles(projectId: string, files: Array<{ path: string; content: string }>) {
    for (const file of files) {
      const target = safeProjectPath(projectId, file.path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, file.content, 'utf8');
    }

    return this.listFiles(projectId);
  }

  async listFiles(projectId: string) {
    return walkFiles(safeProjectPath(projectId));
  }

  async exportZip(projectId: string) {
    const zip = new JSZip();

    for (const file of await this.listFiles(projectId)) {
      zip.file(file.path, file.content);
    }

    const content = await zip.generateAsync({ type: 'nodebuffer' });
    const storageKey = archiveKey('exports', projectId);
    const target = safeProjectPath('_objects', storageKey);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content);

    return { storageKey, byteLength: content.byteLength, base64: content.toString('base64'), createdAt: now() };
  }

  async importZip(projectId: string, base64: string, options: { replaceExisting?: boolean } = {}) {
    const zip = await JSZip.loadAsync(Buffer.from(base64, 'base64'));
    const files: Array<{ path: string; content: string }> = [];

    for (const [path, entry] of Object.entries(zip.files)) {
      if (!entry.dir) {
        files.push({ path, content: await entry.async('string') });
      }
    }

    if (options.replaceExisting) {
      await rm(safeProjectPath(projectId), { recursive: true, force: true });
    }

    return this.writeFiles(projectId, files);
  }

  async createSnapshot(input: { projectId: string; label?: string; files: ProjectFile[] }) {
    const zip = new JSZip();

    for (const file of input.files) {
      zip.file(file.path, file.content);
    }

    const content = await zip.generateAsync({ type: 'nodebuffer' });
    const storageKey = archiveKey('snapshots', input.projectId);
    const target = safeProjectPath('_objects', storageKey);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content);

    return { storageKey, byteLength: content.byteLength, createdAt: now() };
  }

  async getSnapshotFiles(storageKey: string) {
    const zip = await JSZip.loadAsync(await readFile(safeProjectPath('_objects', storageKey)));
    const files: ProjectFile[] = [];

    for (const [path, entry] of Object.entries(zip.files)) {
      if (!entry.dir) {
        files.push({ path, content: await entry.async('string'), updatedAt: now() });
      }
    }

    return files;
  }

  async restoreSnapshot(input: { projectId: string; files: ProjectFile[] }) {
    await rm(safeProjectPath(input.projectId), { recursive: true, force: true });

    return this.writeFiles(input.projectId, input.files);
  }
}

export class GitCliProvider implements GitProvider {
  private workspacePath(projectId: string) {
    return safeProjectPath(projectId);
  }

  private gitDir(projectId: string) {
    return join(this.workspacePath(projectId), '.git');
  }

  private gitEnv() {
    return {
      ...process.env,
      GIT_CEILING_DIRECTORIES: storageRoot(),
    };
  }

  private async ensureRepository(projectId: string) {
    const target = this.workspacePath(projectId);
    const gitDir = this.gitDir(projectId);

    await mkdir(target, { recursive: true });

    if (await pathExists(gitDir)) {
      await execFile('git', ['--git-dir', gitDir, '--work-tree', target, 'config', 'user.name', 'You'], {
        cwd: target,
        env: this.gitEnv(),
      }).catch(() => undefined);
      await execFile('git', ['--git-dir', gitDir, '--work-tree', target, 'config', 'user.email', 'you@vibecore.local'], {
        cwd: target,
        env: this.gitEnv(),
      }).catch(() => undefined);
      return;
    }

    await execFile('git', ['init', '--initial-branch=main'], { cwd: target, env: this.gitEnv() }).catch(async () => {
      await execFile('git', ['init'], { cwd: target, env: this.gitEnv() });
      await execFile('git', ['checkout', '-B', 'main'], { cwd: target, env: this.gitEnv() });
    });
    await execFile('git', ['config', 'user.name', 'You'], { cwd: target, env: this.gitEnv() });
    await execFile('git', ['config', 'user.email', 'you@vibecore.local'], { cwd: target, env: this.gitEnv() });
  }

  private async git(projectId: string, args: string[]) {
    await this.ensureRepository(projectId);

    const result = await execFile('git', ['--git-dir', this.gitDir(projectId), '--work-tree', this.workspacePath(projectId), ...args], {
      cwd: this.workspacePath(projectId),
      env: this.gitEnv(),
    });

    return commandStdout(result).trim();
  }

  async importRepository(input: { repositoryUrl: string; branch?: string }) {
    const projectId = `import-${Date.now().toString(36)}`;
    const target = safeProjectPath(projectId);
    await execFile('git', ['clone', '--depth=1', ...(input.branch ? ['--branch', input.branch] : []), input.repositoryUrl, target], {
      env: this.gitEnv(),
    });

    const files = await walkFiles(target);

    const defaultBranch =
      input.branch ??
      commandStdout(await execFile('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: target, env: this.gitEnv() })).trim();

    return { files, defaultBranch, remoteUrl: input.repositoryUrl };
  }

  async status(projectId: string) {
    const branch = await this.git(projectId, ['symbolic-ref', '--short', 'HEAD']).catch(() => 'main');
    const porcelain = await this.git(projectId, ['status', '--porcelain=v1', '-uall']);
    const statusLines = porcelain.split('\n').filter(Boolean);
    const changedFiles = statusLines.map((line) => line.slice(3));
    const fileStatuses = statusLines.map((line) => ({ path: line.slice(3), status: line.slice(0, 2).trim() || 'M' }));
    const conflicts = statusLines
      .filter((line) => ['DD', 'AU', 'UD', 'UA', 'DU', 'AA', 'UU'].includes(line.slice(0, 2)))
      .map((line) => ({ path: line.slice(3), status: line.slice(0, 2) }));

    const aheadBehind = await this.git(projectId, ['rev-list', '--left-right', '--count', '@{upstream}...HEAD']).catch(
      () => '0\t0',
    );

    const [behind, ahead] = aheadBehind.split(/\s+/).map((value) => Number(value) || 0);

    return { branch, changedFiles, fileStatuses, conflicts, ahead, behind };
  }

  async commit(input: { projectId: string; message: string; files: ProjectFile[]; selectedFiles?: string[] }) {
    await this.ensureRepository(input.projectId);
    const selectedFiles = input.selectedFiles?.map((filePath) => filePath.replace(/^\/+/, '')).filter(Boolean) ?? [];
    const addArgs = selectedFiles.length ? ['add', '--', ...selectedFiles] : ['add', '--all'];

    await this.git(input.projectId, addArgs);
    await this.git(input.projectId, ['commit', '-m', input.message]);

    const sha = await this.git(input.projectId, ['rev-parse', 'HEAD']);

    return { sha, message: input.message };
  }

  async push(input: { projectId: string; branch: string }) {
    await this.git(input.projectId, ['push', 'origin', input.branch]);

    return { pushed: true, branch: input.branch };
  }

  async pull(input: { projectId: string; branch: string }) {
    await this.git(input.projectId, ['pull', 'origin', input.branch]);

    const status = await this.status(input.projectId);

    return { pulled: true, branch: input.branch, changedFiles: status.changedFiles };
  }

  async listBranches(projectId: string) {
    const output = await this.git(projectId, ['branch', '--all', '--format=%(refname:short)']);

    return [
      ...new Set(
        output
          .split('\n')
          .map((branch) => branch.replace(/^remotes\/origin\//, ''))
          .filter(Boolean),
      ),
    ];
  }

  async checkoutBranch(input: { projectId: string; branch: string; create?: boolean; startPoint?: string }) {
    if (input.create) {
      await this.git(input.projectId, ['checkout', '-b', input.branch, input.startPoint ?? 'HEAD']);
    } else {
      await this.git(input.projectId, ['checkout', input.branch]);
    }

    return { branch: input.branch };
  }

  async stashPush(input: { projectId: string; message?: string }) {
    const args = ['stash', 'push', '--include-untracked'];

    if (input.message) {
      args.push('-m', input.message);
    }

    const output = await this.git(input.projectId, args);

    return { stashed: !/No local changes/i.test(output), output };
  }

  async stashList(projectId: string) {
    const output = await this.git(projectId, ['stash', 'list', '--format=%gd%x09%gs']);

    return output
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [id, message = ''] = line.split('\t');
        const branch = message.match(/WIP on ([^:]+):/)?.[1];

        return { id, branch, message };
      });
  }

  async stashApply(input: { projectId: string; stashRef: string; drop?: boolean }) {
    const output = await this.git(input.projectId, ['stash', input.drop ? 'pop' : 'apply', input.stashRef]);

    return { applied: true, output };
  }

  async cherryPick(input: { projectId: string; sha: string }) {
    const output = await this.git(input.projectId, ['cherry-pick', input.sha]);

    return { picked: true, output };
  }

  async resolveConflict(input: { projectId: string; filePath: string; strategy: 'ours' | 'theirs' }) {
    const filePath = input.filePath.replace(/^\/+/, '');

    await this.git(input.projectId, ['checkout', `--${input.strategy}`, '--', filePath]);
    await this.git(input.projectId, ['add', '--', filePath]);

    return { resolved: true, filePath, strategy: input.strategy };
  }

  async logGraph(projectId: string, limit = 30) {
    const output = await this.git(projectId, [
      'log',
      `--max-count=${Math.max(1, Math.min(limit, 100))}`,
      '--date=iso-strict',
      '--pretty=format:%H%x09%h%x09%P%x09%an%x09%ad%x09%D%x09%s',
    ]).catch((error: any) => {
      const message = String(error?.stderr ?? error?.message ?? '');

      if (/does not have any commits yet|bad revision|unknown revision|ambiguous argument/i.test(message)) {
        return '';
      }

      throw error;
    });

    return output
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [sha, shortSha, parents = '', author = '', date = '', refs = '', message = ''] = line.split('\t');

        return {
          sha,
          shortSha,
          parents: parents ? parents.split(' ').filter(Boolean) : [],
          author,
          date,
          refs,
          message,
        };
      });
  }

  async diff(projectId: string, filePath?: string) {
    return this.git(projectId, ['diff', '--', ...(filePath ? [filePath] : [])]).catch((error: any) => {
      const message = String(error?.stderr ?? error?.message ?? '');

      if (/bad revision|unknown revision|ambiguous argument/i.test(message)) {
        return '';
      }

      throw error;
    });
  }

  async blame(input: { projectId: string; filePath: string; startLine?: number; endLine?: number }) {
    const range =
      input.startLine && input.endLine
        ? [`-L`, `${Math.max(1, input.startLine)},${Math.max(input.startLine, input.endLine)}`]
        : [];
    const output = await this.git(input.projectId, [
      'blame',
      '--line-porcelain',
      ...range,
      '--',
      input.filePath.replace(/^\/+/, ''),
    ]);
    const lines: GitBlameLine[] = [];
    let current: Partial<GitBlameLine> = {};

    for (const line of output.split('\n')) {
      if (/^[0-9a-f]{40}\s/.test(line)) {
        const [sha, , finalLine] = line.split(' ');
        current = { sha, line: Number(finalLine) };
      } else if (line.startsWith('author ')) {
        current.author = line.slice('author '.length);
      } else if (line.startsWith('author-time ')) {
        current.date = new Date(Number(line.slice('author-time '.length)) * 1000).toISOString();
      } else if (line.startsWith('\t')) {
        lines.push({
          line: current.line ?? lines.length + 1,
          sha: current.sha ?? '',
          author: current.author ?? 'Unknown',
          date: current.date ?? '',
          content: line.slice(1),
        });
      }
    }

    return lines;
  }

  async createPullRequest(): Promise<{ url: string; number: number }> {
    throw new Error(
      'Pull request creation requires a GitHub integration provider; GitCliProvider does not create remote PRs.',
    );
  }
}
