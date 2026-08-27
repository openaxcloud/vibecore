import { fileTreeEn, formatFileTreeCopy, type FileTreeCopy } from '~/lib/i18n/catalogs/file-tree';
import type { FileMap } from '~/lib/stores/files';
import type { FileHistory } from '~/types/actions';
import { WORK_DIR } from '~/utils/constants';

export type GitFileStatus = 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked' | 'conflicted';

export interface MaterialFileIcon {
  icon: string;
  color: string;
  label: string;
}

type FileTypeLabelKey = keyof FileTreeCopy['fileTypes'];
type MaterialFileIconDefinition = Omit<MaterialFileIcon, 'label'> & { labelKey: FileTypeLabelKey };

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

const EXTENSION_ICONS: Record<string, MaterialFileIconDefinition> = {
  ts: { icon: 'i-ph:file-ts', color: '#3178c6', labelKey: 'typescript' },
  tsx: { icon: 'i-ph:file-ts', color: '#3178c6', labelKey: 'typescriptReact' },
  js: { icon: 'i-ph:file-js', color: '#f7df1e', labelKey: 'javascript' },
  jsx: { icon: 'i-ph:file-js', color: '#61dafb', labelKey: 'javascriptReact' },
  json: { icon: 'i-ph:brackets-curly', color: '#f5a623', labelKey: 'json' },
  css: { icon: 'i-ph:paint-brush', color: '#42a5f5', labelKey: 'css' },
  scss: { icon: 'i-ph:paint-brush-broad', color: '#cf649a', labelKey: 'scss' },
  sass: { icon: 'i-ph:paint-brush-broad', color: '#cf649a', labelKey: 'sass' },
  html: { icon: 'i-ph:code', color: '#e44d26', labelKey: 'html' },
  md: { icon: 'i-ph:article', color: '#8a94a7', labelKey: 'markdown' },
  mdx: { icon: 'i-ph:article', color: '#8a94a7', labelKey: 'mdx' },
  py: { icon: 'i-ph:file-py', color: '#3776ab', labelKey: 'python' },
  go: { icon: 'i-ph:file-code', color: '#00add8', labelKey: 'go' },
  rs: { icon: 'i-ph:file-code', color: '#dea584', labelKey: 'rust' },
  java: { icon: 'i-ph:coffee', color: '#f89820', labelKey: 'java' },
  png: { icon: 'i-ph:image', color: '#7e57c2', labelKey: 'image' },
  jpg: { icon: 'i-ph:image', color: '#7e57c2', labelKey: 'image' },
  jpeg: { icon: 'i-ph:image', color: '#7e57c2', labelKey: 'image' },
  gif: { icon: 'i-ph:image', color: '#7e57c2', labelKey: 'image' },
  webp: { icon: 'i-ph:image', color: '#7e57c2', labelKey: 'image' },
  svg: { icon: 'i-ph:vector-three', color: '#ffb13b', labelKey: 'svg' },
  lock: { icon: 'i-ph:lock-simple', color: '#8a94a7', labelKey: 'lockfile' },
  yml: { icon: 'i-ph:gear-six', color: '#cb6ce6', labelKey: 'yaml' },
  yaml: { icon: 'i-ph:gear-six', color: '#cb6ce6', labelKey: 'yaml' },
};

const SPECIAL_FILE_ICONS: Record<string, MaterialFileIconDefinition> = {
  'package.json': { icon: 'i-ph:package', color: '#cb3837', labelKey: 'npmPackageManifest' },
  'package-lock.json': { icon: 'i-ph:lock-simple', color: '#8a94a7', labelKey: 'npmLockfile' },
  'pnpm-lock.yaml': { icon: 'i-ph:lock-simple', color: '#f69220', labelKey: 'pnpmLockfile' },
  'yarn.lock': { icon: 'i-ph:lock-simple', color: '#2c8ebb', labelKey: 'yarnLockfile' },
  'vite.config.ts': { icon: 'i-ph:lightning', color: '#41d1ff', labelKey: 'viteConfig' },
  'vite.config.js': { icon: 'i-ph:lightning', color: '#41d1ff', labelKey: 'viteConfig' },
  'tsconfig.json': { icon: 'i-ph:gear-six', color: '#3178c6', labelKey: 'typescriptConfig' },
  '.env': { icon: 'i-ph:key', color: '#10b981', labelKey: 'environmentFile' },
  '.env.example': { icon: 'i-ph:key', color: '#10b981', labelKey: 'environmentExample' },
  dockerfile: { icon: 'i-ph:cube', color: '#2496ed', labelKey: 'dockerfile' },
};

export function materialFileIcon(
  filePathOrName: string,
  labels: FileTreeCopy['fileTypes'] = fileTreeEn.fileTypes,
): MaterialFileIcon {
  const name = filePathOrName.split('/').pop()?.toLowerCase() ?? filePathOrName.toLowerCase();
  const special = SPECIAL_FILE_ICONS[name];

  if (special) {
    return { icon: special.icon, color: special.color, label: labels[special.labelKey] };
  }

  /*
   * Treat `.env.local`, `.env.production`, … the same as `.env` instead of
   * splitting on the last dot (which would yield a bogus `local`/`production`
   * extension and fall through to the generic icon).
   */
  if (name === '.env' || name.startsWith('.env.')) {
    const environment = SPECIAL_FILE_ICONS['.env'];

    return environment
      ? { icon: environment.icon, color: environment.color, label: labels[environment.labelKey] }
      : { icon: 'i-ph:file-duotone', color: 'var(--vc-ide-text-secondary)', label: labels.file };
  }

  const extension = name.split('.').pop() ?? '';

  const definition = EXTENSION_ICONS[extension];

  return definition
    ? { icon: definition.icon, color: definition.color, label: labels[definition.labelKey] }
    : { icon: 'i-ph:file-duotone', color: 'var(--vc-ide-text-secondary)', label: labels.file };
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
  options?: { locale?: string; copy?: FileTreeCopy['timeline'] },
): FileTimelineEntry[] {
  const entries: FileTimelineEntry[] = [];
  const timelineCopy = options?.copy ?? fileTreeEn.timeline;
  const locale = options?.locale ?? 'en-US';

  for (const [filePath, history] of Object.entries(fileHistory)) {
    const latest = history.versions.at(-1);

    entries.push({
      id: `history:${filePath}:${latest?.timestamp ?? filePath}`,
      filePath,
      label: filePath.split('/').pop() ?? filePath,
      detail: latest?.timestamp
        ? formatFileTreeCopy(timelineCopy.editedAt, { date: new Date(latest.timestamp).toLocaleString(locale) })
        : timelineCopy.editedThisSession,
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
      detail: formatFileTreeCopy(timelineCopy.gitStatus, { status }),
      status,
    });
  }

  return entries.sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0)).slice(0, 50);
}
