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
  base64?: string;
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
  status(
    projectId: string,
    workspaceId?: string,
  ): Promise<{
    branch: string;
    changedFiles: string[];
    fileStatuses?: Array<{ path: string; status: string }>;
    conflicts?: Array<{ path: string; status: string }>;
    ahead: number;
    behind: number;
  }>;
  commit(input: {
    projectId: string;
    workspaceId?: string;
    message: string;
    files: ProjectFile[];
    selectedFiles?: string[];
  }): Promise<{ sha: string; message: string }>;
  push(input: {
    projectId: string;
    workspaceId?: string;
    branch: string;
  }): Promise<{ pushed: boolean; branch: string }>;
  pull(input: {
    projectId: string;
    workspaceId?: string;
    branch: string;
  }): Promise<{ pulled: boolean; branch: string; changedFiles: string[] }>;
  listBranches(projectId: string, workspaceId?: string): Promise<string[]>;
  checkoutBranch(input: {
    projectId: string;
    workspaceId?: string;
    branch: string;
    create?: boolean;
    startPoint?: string;
  }): Promise<{ branch: string }>;
  stashPush(input: {
    projectId: string;
    workspaceId?: string;
    message?: string;
  }): Promise<{ stashed: boolean; output: string }>;
  stashList(
    projectId: string,
    workspaceId?: string,
  ): Promise<Array<{ id: string; branch?: string; message: string }>>;
  stashApply(input: {
    projectId: string;
    workspaceId?: string;
    stashRef: string;
    drop?: boolean;
  }): Promise<{ applied: boolean; output: string }>;
  cherryPick(input: {
    projectId: string;
    workspaceId?: string;
    sha: string;
  }): Promise<{ picked: boolean; output: string }>;
  resolveConflict(input: {
    projectId: string;
    workspaceId?: string;
    filePath: string;
    strategy: 'ours' | 'theirs';
  }): Promise<{ resolved: boolean; filePath: string; strategy: 'ours' | 'theirs' }>;
  logGraph(projectId: string, limit?: number, workspaceId?: string): Promise<GitCommitNode[]>;
  diff(projectId: string, filePath?: string, workspaceId?: string): Promise<string>;
  blame(input: {
    projectId: string;
    workspaceId?: string;
    filePath: string;
    startLine?: number;
    endLine?: number;
  }): Promise<GitBlameLine[]>;
  createPullRequest(input: {
    projectId: string;
    workspaceId?: string;
    title: string;
    body?: string;
    sourceBranch: string;
    targetBranch: string;
  }): Promise<{ url: string; number: number }>;
}

export interface ProjectStorage {
  writeFiles(
    projectId: string,
    files: Array<{ path: string; content: string }>,
    workspaceId?: string,
  ): Promise<ProjectFile[]>;
  listFiles(projectId: string, workspaceId?: string): Promise<ProjectFile[]>;
  exportZip(projectId: string): Promise<StoredArchive & { base64: string }>;
  importZip(projectId: string, base64: string, options?: { replaceExisting?: boolean }): Promise<ProjectFile[]>;
  createSnapshot(input: { projectId: string; label?: string; files: ProjectFile[] }): Promise<StoredArchive>;
  getSnapshotFiles(storageKey: string): Promise<ProjectFile[]>;
  restoreSnapshot(input: { projectId: string; workspaceId?: string; files: ProjectFile[] }): Promise<ProjectFile[]>;
}

export const SECONDARY_WORKSPACES_DIR = '.vibecore-workspaces';
const SAFE_WORKSPACE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

function workspaceSubpath(workspaceId: string, filePath = '') {
  if (!SAFE_WORKSPACE_ID.test(workspaceId)) {
    throw new Error('Invalid workspaceId');
  }

  return filePath ? `${SECONDARY_WORKSPACES_DIR}/${workspaceId}/${filePath}` : `${SECONDARY_WORKSPACES_DIR}/${workspaceId}`;
}

function safeWorkspacePath(projectId: string, workspaceId?: string, filePath = '') {
  if (!workspaceId) {
    return safeProjectPath(projectId, filePath);
  }

  return safeProjectPath(projectId, workspaceSubpath(workspaceId, filePath));
}

function now() {
  return new Date().toISOString();
}

function archiveKey(prefix: string, projectId: string) {
  return `${prefix}/${projectId}/${Date.now()}-${Math.random().toString(36).slice(2)}.zip`;
}

function storageRoot() {
  return (
    process.env.PROJECT_STORAGE_DIR ??
    (process.env.NODE_ENV === 'production'
      ? '/tmp/vibecore-project-storage'
      : join(process.cwd(), '.vibecore-project-storage'))
  );
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
    if (entry.isDirectory() && entry.name === '.git') {
      continue;
    }

    if (entry.isDirectory() && current === '' && entry.name === SECONDARY_WORKSPACES_DIR) {
      continue;
    }

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

export async function archiveFiles(files: Array<{ path: string; content: string }>) {
  const zip = new JSZip();

  for (const file of files) {
    zip.file(file.path, file.content);
  }

  return zip.generateAsync({ type: 'nodebuffer' });
}

export async function filesFromZipBase64(base64: string): Promise<Array<{ path: string; content: string }>> {
  const zip = await JSZip.loadAsync(Buffer.from(base64, 'base64'));
  const files: Array<{ path: string; content: string }> = [];

  for (const [path, entry] of Object.entries(zip.files)) {
    if (!entry.dir) {
      files.push({ path, content: await entry.async('string') });
    }
  }

  return files;
}

export class LocalProjectStorage implements ProjectStorage {
  async writeFiles(projectId: string, files: Array<{ path: string; content: string }>, workspaceId?: string) {
    for (const file of files) {
      const target = safeWorkspacePath(projectId, workspaceId, file.path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, file.content, 'utf8');
    }

    return this.listFiles(projectId, workspaceId);
  }

  async listFiles(projectId: string, workspaceId?: string) {
    return walkFiles(safeWorkspacePath(projectId, workspaceId));
  }

  async exportZip(projectId: string) {
    const content = await archiveFiles(await this.listFiles(projectId));
    const storageKey = archiveKey('exports', projectId);
    const target = safeProjectPath('_objects', storageKey);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content);

    return { storageKey, byteLength: content.byteLength, base64: content.toString('base64'), createdAt: now() };
  }

  async importZip(projectId: string, base64: string, options: { replaceExisting?: boolean } = {}) {
    const files = await filesFromZipBase64(base64);

    if (options.replaceExisting) {
      await rm(safeProjectPath(projectId), { recursive: true, force: true });
    }

    return this.writeFiles(projectId, files);
  }

  async createSnapshot(input: { projectId: string; label?: string; files: ProjectFile[] }) {
    const content = await archiveFiles(input.files);
    const storageKey = archiveKey('snapshots', input.projectId);
    const target = safeProjectPath('_objects', storageKey);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content);

    return { storageKey, byteLength: content.byteLength, base64: content.toString('base64'), createdAt: now() };
  }

  async getSnapshotFiles(storageKey: string) {
    const files = await filesFromZipBase64(
      (await readFile(safeProjectPath('_objects', storageKey))).toString('base64'),
    );
    const updatedAt = now();

    return files.map((file) => ({ ...file, updatedAt }));
  }

  async restoreSnapshot(input: { projectId: string; workspaceId?: string; files: ProjectFile[] }) {
    const target = safeWorkspacePath(input.projectId, input.workspaceId);

    if (input.workspaceId) {
      await rm(target, { recursive: true, force: true });
    } else {
      // Clearing the primary tree must preserve `.vibecore-workspaces/`, or every
      // secondary workspace's `.git` and working tree would be destroyed.
      await clearTreePreservingSecondaryWorkspaces(target);
    }

    return this.writeFiles(input.projectId, input.files, input.workspaceId);
  }
}

async function clearTreePreservingSecondaryWorkspaces(target: string) {
  const entries = await readdir(target, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') {
      return [];
    }

    throw error;
  });

  for (const entry of entries) {
    if (entry.isDirectory() && entry.name === SECONDARY_WORKSPACES_DIR) {
      continue;
    }

    await rm(join(target, entry.name), { recursive: true, force: true });
  }
}

export class GitCliProvider implements GitProvider {
  private workspacePath(projectId: string, workspaceId?: string) {
    if (!workspaceId) {
      return safeProjectPath(projectId);
    }

    if (!SAFE_WORKSPACE_ID.test(workspaceId)) {
      throw new Error('Invalid workspaceId');
    }

    return safeProjectPath(projectId, `${SECONDARY_WORKSPACES_DIR}/${workspaceId}`);
  }

  private gitDir(projectId: string, workspaceId?: string) {
    return join(this.workspacePath(projectId, workspaceId), '.git');
  }

  private gitEnv() {
    return {
      ...process.env,
      GIT_CEILING_DIRECTORIES: storageRoot(),
    };
  }

  private async excludeSecondaryWorkspaceDir(projectId: string) {
    const excludePath = join(safeProjectPath(projectId), '.git', 'info', 'exclude');
    const marker = `/${SECONDARY_WORKSPACES_DIR}/`;

    try {
      const existing = await readFile(excludePath, 'utf8').catch(() => '');

      if (existing.split('\n').some((line) => line.trim() === marker)) {
        return;
      }

      await mkdir(dirname(excludePath), { recursive: true });
      await writeFile(excludePath, `${existing.replace(/\n*$/, '')}\n${marker}\n`, 'utf8');
    } catch {
      // Best-effort: failure to update the exclude file should not block git operations.
    }
  }

  private async ensureRepository(projectId: string, workspaceId?: string) {
    const target = this.workspacePath(projectId, workspaceId);
    const gitDir = this.gitDir(projectId, workspaceId);

    await mkdir(target, { recursive: true });

    if (await pathExists(gitDir)) {
      await execFile('git', ['--git-dir', gitDir, '--work-tree', target, 'config', 'user.name', 'You'], {
        cwd: target,
        env: this.gitEnv(),
      }).catch(() => undefined);
      await execFile(
        'git',
        ['--git-dir', gitDir, '--work-tree', target, 'config', 'user.email', 'you@vibecore.local'],
        {
          cwd: target,
          env: this.gitEnv(),
        },
      ).catch(() => undefined);

      if (!workspaceId) {
        await this.excludeSecondaryWorkspaceDir(projectId);
      }

      return;
    }

    await execFile('git', ['init', '--initial-branch=main'], { cwd: target, env: this.gitEnv() }).catch(async () => {
      await execFile('git', ['init'], { cwd: target, env: this.gitEnv() });
      await execFile('git', ['checkout', '-B', 'main'], { cwd: target, env: this.gitEnv() });
    });
    await execFile('git', ['config', 'user.name', 'You'], { cwd: target, env: this.gitEnv() });
    await execFile('git', ['config', 'user.email', 'you@vibecore.local'], { cwd: target, env: this.gitEnv() });

    if (!workspaceId) {
      await this.excludeSecondaryWorkspaceDir(projectId);
    }
  }

  private async git(projectId: string, args: string[], workspaceId?: string) {
    await this.ensureRepository(projectId, workspaceId);

    const result = await execFile(
      'git',
      [
        '--git-dir',
        this.gitDir(projectId, workspaceId),
        '--work-tree',
        this.workspacePath(projectId, workspaceId),
        ...args,
      ],
      {
        cwd: this.workspacePath(projectId, workspaceId),
        env: this.gitEnv(),
      },
    );

    return commandStdout(result).trim();
  }

  async importRepository(input: { repositoryUrl: string; branch?: string }) {
    const projectId = `import-${Date.now().toString(36)}`;
    const target = safeProjectPath(projectId);
    await execFile(
      'git',
      ['clone', '--depth=1', ...(input.branch ? ['--branch', input.branch] : []), input.repositoryUrl, target],
      {
        env: this.gitEnv(),
      },
    );

    const files = await walkFiles(target);

    const defaultBranch =
      input.branch ??
      commandStdout(
        await execFile('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: target, env: this.gitEnv() }),
      ).trim();

    return { files, defaultBranch, remoteUrl: input.repositoryUrl };
  }

  async status(projectId: string, workspaceId?: string) {
    const branch = await this.git(projectId, ['symbolic-ref', '--short', 'HEAD'], workspaceId).catch(() => 'main');
    const porcelain = await this.git(projectId, ['status', '--porcelain=v1', '-uall'], workspaceId);
    const statusLines = porcelain.split('\n').filter(Boolean);
    const changedFiles = statusLines.map((line) => line.slice(3));
    const fileStatuses = statusLines.map((line) => ({ path: line.slice(3), status: line.slice(0, 2).trim() || 'M' }));
    const conflicts = statusLines
      .filter((line) => ['DD', 'AU', 'UD', 'UA', 'DU', 'AA', 'UU'].includes(line.slice(0, 2)))
      .map((line) => ({ path: line.slice(3), status: line.slice(0, 2) }));

    const aheadBehind = await this.git(
      projectId,
      ['rev-list', '--left-right', '--count', '@{upstream}...HEAD'],
      workspaceId,
    ).catch(() => '0\t0');

    const [behind, ahead] = aheadBehind.split(/\s+/).map((value) => Number(value) || 0);

    return { branch, changedFiles, fileStatuses, conflicts, ahead, behind };
  }

  async commit(input: {
    projectId: string;
    workspaceId?: string;
    message: string;
    files: ProjectFile[];
    selectedFiles?: string[];
  }) {
    await this.ensureRepository(input.projectId, input.workspaceId);
    const selectedFiles = input.selectedFiles?.map((filePath) => filePath.replace(/^\/+/, '')).filter(Boolean) ?? [];
    const addArgs = selectedFiles.length ? ['add', '--', ...selectedFiles] : ['add', '--all'];

    await this.git(input.projectId, addArgs, input.workspaceId);
    await this.git(input.projectId, ['commit', '-m', input.message], input.workspaceId);

    const sha = await this.git(input.projectId, ['rev-parse', 'HEAD'], input.workspaceId);

    return { sha, message: input.message };
  }

  async push(input: { projectId: string; workspaceId?: string; branch: string }) {
    await this.git(input.projectId, ['push', 'origin', input.branch], input.workspaceId);

    return { pushed: true, branch: input.branch };
  }

  async pull(input: { projectId: string; workspaceId?: string; branch: string }) {
    await this.git(input.projectId, ['pull', 'origin', input.branch], input.workspaceId);

    const status = await this.status(input.projectId, input.workspaceId);

    return { pulled: true, branch: input.branch, changedFiles: status.changedFiles };
  }

  async listBranches(projectId: string, workspaceId?: string) {
    const output = await this.git(projectId, ['branch', '--all', '--format=%(refname:short)'], workspaceId);

    return [
      ...new Set(
        output
          .split('\n')
          .map((branch) => branch.replace(/^remotes\/origin\//, ''))
          .filter(Boolean),
      ),
    ];
  }

  async checkoutBranch(input: {
    projectId: string;
    workspaceId?: string;
    branch: string;
    create?: boolean;
    startPoint?: string;
  }) {
    if (input.create) {
      await this.git(input.projectId, ['checkout', '-b', input.branch, input.startPoint ?? 'HEAD'], input.workspaceId);
    } else {
      await this.git(input.projectId, ['checkout', input.branch], input.workspaceId);
    }

    return { branch: input.branch };
  }

  async stashPush(input: { projectId: string; workspaceId?: string; message?: string }) {
    const args = ['stash', 'push', '--include-untracked'];

    if (input.message) {
      args.push('-m', input.message);
    }

    const output = await this.git(input.projectId, args, input.workspaceId);

    return { stashed: !/No local changes/i.test(output), output };
  }

  async stashList(projectId: string, workspaceId?: string) {
    const output = await this.git(projectId, ['stash', 'list', '--format=%gd%x09%gs'], workspaceId);

    return output
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [id, message = ''] = line.split('\t');
        const branch = message.match(/WIP on ([^:]+):/)?.[1];

        return { id, branch, message };
      });
  }

  async stashApply(input: { projectId: string; workspaceId?: string; stashRef: string; drop?: boolean }) {
    const output = await this.git(
      input.projectId,
      ['stash', input.drop ? 'pop' : 'apply', input.stashRef],
      input.workspaceId,
    );

    return { applied: true, output };
  }

  async cherryPick(input: { projectId: string; workspaceId?: string; sha: string }) {
    const output = await this.git(input.projectId, ['cherry-pick', input.sha], input.workspaceId);

    return { picked: true, output };
  }

  async resolveConflict(input: {
    projectId: string;
    workspaceId?: string;
    filePath: string;
    strategy: 'ours' | 'theirs';
  }) {
    const filePath = input.filePath.replace(/^\/+/, '');

    await this.git(input.projectId, ['checkout', `--${input.strategy}`, '--', filePath], input.workspaceId);
    await this.git(input.projectId, ['add', '--', filePath], input.workspaceId);

    return { resolved: true, filePath, strategy: input.strategy };
  }

  async logGraph(projectId: string, limit = 30, workspaceId?: string) {
    const output = await this.git(
      projectId,
      [
        'log',
        `--max-count=${Math.max(1, Math.min(limit, 100))}`,
        '--date=iso-strict',
        '--pretty=format:%H%x09%h%x09%P%x09%an%x09%ad%x09%D%x09%s',
      ],
      workspaceId,
    ).catch((error: any) => {
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

  async diff(projectId: string, filePath?: string, workspaceId?: string) {
    return this.git(projectId, ['diff', '--', ...(filePath ? [filePath] : [])], workspaceId).catch((error: any) => {
      const message = String(error?.stderr ?? error?.message ?? '');

      if (/bad revision|unknown revision|ambiguous argument/i.test(message)) {
        return '';
      }

      throw error;
    });
  }

  async blame(input: {
    projectId: string;
    workspaceId?: string;
    filePath: string;
    startLine?: number;
    endLine?: number;
  }) {
    const range =
      input.startLine && input.endLine
        ? [`-L`, `${Math.max(1, input.startLine)},${Math.max(input.startLine, input.endLine)}`]
        : [];
    const output = await this.git(
      input.projectId,
      ['blame', '--line-porcelain', ...range, '--', input.filePath.replace(/^\/+/, '')],
      input.workspaceId,
    );
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

  async createPullRequest(_input: {
    projectId: string;
    workspaceId?: string;
    title: string;
    body?: string;
    sourceBranch: string;
    targetBranch: string;
  }): Promise<{ url: string; number: number }> {
    void _input;
    throw new Error(
      'Pull request creation requires a GitHub integration provider; GitCliProvider does not create remote PRs.',
    );
  }
}
