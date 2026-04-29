import JSZip from 'jszip';
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, normalize, relative } from 'node:path';
import { promisify } from 'node:util';
import { execFile as execFileCallback } from 'node:child_process';

const execFile = promisify(execFileCallback);

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

export interface GitProvider {
  importRepository(input: { repositoryUrl: string; branch?: string }): Promise<{ files: ProjectFile[]; defaultBranch: string; remoteUrl: string }>;
  status(projectId: string): Promise<{ branch: string; changedFiles: string[]; ahead: number; behind: number }>;
  commit(input: { projectId: string; message: string; files: ProjectFile[] }): Promise<{ sha: string; message: string }>;
  push(input: { projectId: string; branch: string }): Promise<{ pushed: boolean; branch: string }>;
  pull(input: { projectId: string; branch: string }): Promise<{ pulled: boolean; branch: string; changedFiles: string[] }>;
  listBranches(projectId: string): Promise<string[]>;
  createPullRequest(input: { projectId: string; title: string; body?: string; sourceBranch: string; targetBranch: string }): Promise<{ url: string; number: number }>;
}

export interface ProjectStorage {
  writeFiles(projectId: string, files: Array<{ path: string; content: string }>): Promise<ProjectFile[]>;
  listFiles(projectId: string): Promise<ProjectFile[]>;
  exportZip(projectId: string): Promise<StoredArchive & { base64: string }>;
  importZip(projectId: string, base64: string): Promise<ProjectFile[]>;
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

  async importZip(projectId: string, base64: string) {
    const zip = await JSZip.loadAsync(Buffer.from(base64, 'base64'));
    const files: Array<{ path: string; content: string }> = [];

    for (const [path, entry] of Object.entries(zip.files)) {
      if (!entry.dir) {
        files.push({ path, content: await entry.async('string') });
      }
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

  private async git(projectId: string, args: string[]) {
    const { stdout } = await execFile('git', args, { cwd: this.workspacePath(projectId) });
    return stdout.trim();
  }

  async importRepository(input: { repositoryUrl: string; branch?: string }) {
    const projectId = `import-${Date.now().toString(36)}`;
    const target = safeProjectPath(projectId);
    await execFile('git', ['clone', '--depth=1', ...(input.branch ? ['--branch', input.branch] : []), input.repositoryUrl, target]);
    const files = await walkFiles(target);
    const defaultBranch = input.branch ?? (await execFile('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: target })).stdout.trim();

    return { files, defaultBranch, remoteUrl: input.repositoryUrl };
  }

  async status(projectId: string) {
    const branch = await this.git(projectId, ['rev-parse', '--abbrev-ref', 'HEAD']);
    const porcelain = await this.git(projectId, ['status', '--porcelain']);
    const changedFiles = porcelain
      .split('\n')
      .filter(Boolean)
      .map((line) => line.slice(3));
    const aheadBehind = await this.git(projectId, ['rev-list', '--left-right', '--count', '@{upstream}...HEAD']).catch(() => '0\t0');
    const [behind, ahead] = aheadBehind.split(/\s+/).map((value) => Number(value) || 0);

    return { branch, changedFiles, ahead, behind };
  }

  async commit(input: { projectId: string; message: string; files: ProjectFile[] }) {
    await execFile('git', ['add', '--all'], { cwd: this.workspacePath(input.projectId) });
    await execFile('git', ['commit', '-m', input.message], { cwd: this.workspacePath(input.projectId) });
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
    const output = await this.git(projectId, ['branch', '--format=%(refname:short)']);

    return output.split('\n').filter(Boolean);
  }

  async createPullRequest(): Promise<{ url: string; number: number }> {
    throw new Error('Pull request creation requires a GitHub integration provider; GitCliProvider does not create remote PRs.');
  }
}
