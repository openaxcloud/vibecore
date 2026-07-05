import type { FileMap } from '~/lib/stores/files';
import type { FileHistory } from '~/types/actions';
import { WORK_DIR } from '~/utils/constants';

export type GitFileStatus = 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked' | 'conflicted';

export interface MaterialFileIcon {
  icon: string;
  color: string;
  label: string;
}

export interface OutlineSymbol {
  id: string;
  label: string;
  detail: string;
  line: number;
  kind: 'component' | 'function' | 'class' | 'style' | 'heading' | 'symbol';
}

export interface FileTimelineEntry {
  id: string;
  filePath: string;
  label: string;
  detail: string;
  status?: GitFileStatus;
  timestamp?: number;
}

const EXTENSION_ICONS: Record<string, MaterialFileIcon> = {
  ts: { icon: 'i-ph:file-ts', color: '#3178c6', label: 'TypeScript' },
  tsx: { icon: 'i-ph:file-ts', color: '#3178c6', label: 'TypeScript React' },
  js: { icon: 'i-ph:file-js', color: '#f7df1e', label: 'JavaScript' },
  jsx: { icon: 'i-ph:file-js', color: '#61dafb', label: 'JavaScript React' },
  json: { icon: 'i-ph:brackets-curly', color: '#f5a623', label: 'JSON' },
  css: { icon: 'i-ph:paint-brush', color: '#42a5f5', label: 'CSS' },
  scss: { icon: 'i-ph:paint-brush-broad', color: '#cf649a', label: 'SCSS' },
  sass: { icon: 'i-ph:paint-brush-broad', color: '#cf649a', label: 'Sass' },
  html: { icon: 'i-ph:code', color: '#e44d26', label: 'HTML' },
  md: { icon: 'i-ph:article', color: '#8a94a7', label: 'Markdown' },
  mdx: { icon: 'i-ph:article', color: '#8a94a7', label: 'MDX' },
  py: { icon: 'i-ph:file-py', color: '#3776ab', label: 'Python' },
  go: { icon: 'i-ph:file-code', color: '#00add8', label: 'Go' },
  rs: { icon: 'i-ph:file-code', color: '#dea584', label: 'Rust' },
  java: { icon: 'i-ph:coffee', color: '#f89820', label: 'Java' },
  png: { icon: 'i-ph:image', color: '#7e57c2', label: 'Image' },
  jpg: { icon: 'i-ph:image', color: '#7e57c2', label: 'Image' },
  jpeg: { icon: 'i-ph:image', color: '#7e57c2', label: 'Image' },
  gif: { icon: 'i-ph:image', color: '#7e57c2', label: 'Image' },
  webp: { icon: 'i-ph:image', color: '#7e57c2', label: 'Image' },
  svg: { icon: 'i-ph:vector-three', color: '#ffb13b', label: 'SVG' },
  lock: { icon: 'i-ph:lock-simple', color: '#8a94a7', label: 'Lockfile' },
  yml: { icon: 'i-ph:gear-six', color: '#cb6ce6', label: 'YAML' },
  yaml: { icon: 'i-ph:gear-six', color: '#cb6ce6', label: 'YAML' },
};

const SPECIAL_FILE_ICONS: Record<string, MaterialFileIcon> = {
  'package.json': { icon: 'i-ph:package', color: '#cb3837', label: 'npm package manifest' },
  'package-lock.json': { icon: 'i-ph:lock-simple', color: '#8a94a7', label: 'npm lockfile' },
  'pnpm-lock.yaml': { icon: 'i-ph:lock-simple', color: '#f69220', label: 'pnpm lockfile' },
  'yarn.lock': { icon: 'i-ph:lock-simple', color: '#2c8ebb', label: 'Yarn lockfile' },
  'vite.config.ts': { icon: 'i-ph:lightning', color: '#41d1ff', label: 'Vite config' },
  'vite.config.js': { icon: 'i-ph:lightning', color: '#41d1ff', label: 'Vite config' },
  'tsconfig.json': { icon: 'i-ph:gear-six', color: '#3178c6', label: 'TypeScript config' },
  '.env': { icon: 'i-ph:key', color: '#10b981', label: 'Environment file' },
  '.env.example': { icon: 'i-ph:key', color: '#10b981', label: 'Environment example' },
  dockerfile: { icon: 'i-ph:cube', color: '#2496ed', label: 'Dockerfile' },
};

export function materialFileIcon(filePathOrName: string): MaterialFileIcon {
  const name = filePathOrName.split('/').pop()?.toLowerCase() ?? filePathOrName.toLowerCase();
  const special = SPECIAL_FILE_ICONS[name];

  if (special) {
    return special;
  }

  /*
   * Treat `.env.local`, `.env.production`, … the same as `.env` instead of
   * splitting on the last dot (which would yield a bogus `local`/`production`
   * extension and fall through to the generic icon).
   */
  if (name === '.env' || name.startsWith('.env.')) {
    return SPECIAL_FILE_ICONS['.env'];
  }

  const extension = name.split('.').pop() ?? '';

  return (
    EXTENSION_ICONS[extension] ?? {
      icon: 'i-ph:file-duotone',
      color: 'var(--vc-ide-text-secondary)',
      label: 'File',
    }
  );
}

export function normalizeWorkspacePath(filePath: string): string {
  return filePath.replace(/^\/+/, '').replace(new RegExp(`^${WORK_DIR.replace(/^\/+/, '')}/?`), '');
}

export function gitStatusForPath(
  gitStatusByPath: Record<string, GitFileStatus | string | undefined> | undefined,
  filePath: string,
): GitFileStatus | undefined {
  if (!gitStatusByPath) {
    return undefined;
  }

  const normalizedTarget = normalizeWorkspacePath(filePath);

  for (const [candidate, status] of Object.entries(gitStatusByPath)) {
    const normalizedCandidate = normalizeWorkspacePath(candidate);

    if (normalizedCandidate === normalizedTarget) {
      return normalizeGitStatus(status);
    }
  }

  return undefined;
}

export function normalizeGitStatus(status: unknown): GitFileStatus | undefined {
  const value = String(status ?? '')
    .trim()
    .toLowerCase();

  if (!value) {
    return 'modified';
  }

  if (['a', 'added', 'add', 'new'].includes(value)) {
    return 'added';
  }

  if (['d', 'deleted', 'delete', 'removed'].includes(value)) {
    return 'deleted';
  }

  if (['r', 'renamed', 'rename'].includes(value)) {
    return 'renamed';
  }

  if (['??', '?', 'u', 'untracked'].includes(value)) {
    return 'untracked';
  }

  if (['uu', 'conflict', 'conflicted', 'both modified'].includes(value)) {
    return 'conflicted';
  }

  return 'modified';
}

export function buildGitStatusMap(changedFiles: unknown[] | undefined): Record<string, GitFileStatus> {
  const statusByPath: Record<string, GitFileStatus> = {};

  for (const entry of changedFiles ?? []) {
    if (typeof entry === 'string') {
      statusByPath[entry] = 'modified';
      continue;
    }

    if (!entry || typeof entry !== 'object') {
      continue;
    }

    const record = entry as Record<string, unknown>;
    const filePath = String(record.path ?? record.filePath ?? record.name ?? record.file ?? '').trim();

    if (!filePath) {
      continue;
    }

    statusByPath[filePath] =
      normalizeGitStatus(record.status ?? record.index ?? record.workingTree ?? record.type) ?? 'modified';
  }

  return statusByPath;
}

export function buildFileOutline(filePath: string | undefined, files: FileMap): OutlineSymbol[] {
  if (!filePath) {
    return [];
  }

  const entry = files[filePath];

  if (entry?.type !== 'file' || entry.isBinary) {
    return [];
  }

  const content = entry.content ?? '';
  const extension = filePath.split('.').pop()?.toLowerCase();
  const symbols: OutlineSymbol[] = [];

  content.split(/\r?\n/).forEach((line, index) => {
    const lineNumber = index + 1;
    const trimmed = line.trim();

    const match =
      trimmed.match(/^export\s+(?:default\s+)?function\s+([A-Za-z0-9_$]+)/) ??
      trimmed.match(/^function\s+([A-Za-z0-9_$]+)/) ??
      trimmed.match(/^export\s+(?:const|let|var)\s+([A-Za-z0-9_$]+)\s*=/) ??
      trimmed.match(/^const\s+([A-Za-z0-9_$]+)\s*=\s*(?:\([^)]*\)|[A-Za-z0-9_$]+)\s*=>/) ??
      trimmed.match(/^class\s+([A-Za-z0-9_$]+)/);

    if (match) {
      symbols.push({
        id: `${filePath}:${lineNumber}:${match[1]}`,
        label: match[1],
        detail: trimmed.slice(0, 120),
        line: lineNumber,
        kind: /^class\s/.test(trimmed) ? 'class' : /^[A-Z]/.test(match[1]) ? 'component' : 'function',
      });
      return;
    }

    if ((extension === 'css' || extension === 'scss') && /^[.#][A-Za-z0-9_-]+/.test(trimmed)) {
      const label = trimmed.split(/[,{ ]/)[0];
      symbols.push({
        id: `${filePath}:${lineNumber}:${label}`,
        label,
        detail: trimmed.slice(0, 120),
        line: lineNumber,
        kind: 'style',
      });

      return;
    }

    if ((extension === 'md' || extension === 'mdx') && /^#{1,6}\s+/.test(trimmed)) {
      symbols.push({
        id: `${filePath}:${lineNumber}:${trimmed}`,
        label: trimmed.replace(/^#{1,6}\s+/, ''),
        detail: trimmed,
        line: lineNumber,
        kind: 'heading',
      });
    }
  });

  return symbols.slice(0, 80);
}

export function buildFileTimeline(
  files: FileMap,
  fileHistory: Record<string, FileHistory>,
  gitStatusByPath?: Record<string, GitFileStatus | string | undefined>,
): FileTimelineEntry[] {
  const entries: FileTimelineEntry[] = [];

  for (const [filePath, history] of Object.entries(fileHistory)) {
    const latest = history.versions.at(-1);

    entries.push({
      id: `history:${filePath}:${latest?.timestamp ?? filePath}`,
      filePath,
      label: filePath.split('/').pop() ?? filePath,
      detail: latest?.timestamp ? `Edited ${new Date(latest.timestamp).toLocaleString()}` : 'Edited in this session',
      timestamp: latest?.timestamp,
    });
  }

  for (const filePath of Object.keys(files)) {
    const status = gitStatusForPath(gitStatusByPath, filePath);

    if (!status || entries.some((entry) => entry.filePath === filePath)) {
      continue;
    }

    entries.push({
      id: `git:${filePath}:${status}`,
      filePath,
      label: filePath.split('/').pop() ?? filePath,
      detail: `Git status: ${status}`,
      status,
    });
  }

  return entries.sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0)).slice(0, 50);
}
