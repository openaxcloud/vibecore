import { getGitStatusDisplayCopy, type GitStatusDisplayCopyKey } from '~/lib/i18n/catalogs/git-status-display';

export type GitStatusDisplayKey =
  | 'untracked'
  | 'modified'
  | 'added'
  | 'deleted'
  | 'renamed'
  | 'copied'
  | 'conflict'
  | 'changed';

export interface GitStatusDisplay {
  key: GitStatusDisplayKey;
  rawCode: string;
  displayCode: string;
  label: string;
  description: string;
  toneClassName: string;
}

const STATUS_DEFINITIONS: Record<
  GitStatusDisplayKey,
  Omit<GitStatusDisplay, 'key' | 'rawCode' | 'label' | 'description'> & {
    labelKey: GitStatusDisplayCopyKey;
    descriptionKey: GitStatusDisplayCopyKey;
    aliases: string[];
  }
> = {
  untracked: {
    displayCode: 'U',
    labelKey: 'gitStatusDisplay.status.untracked.label',
    descriptionKey: 'gitStatusDisplay.status.untracked.description',
    toneClassName:
      'border-amber-400/70 bg-amber-100 text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-200',
    aliases: ['??', '?', 'u', 'untracked', 'new'],
  },
  modified: {
    displayCode: 'M',
    labelKey: 'gitStatusDisplay.status.modified.label',
    descriptionKey: 'gitStatusDisplay.status.modified.description',
    toneClassName:
      'border-yellow-500/60 bg-yellow-100 text-yellow-800 dark:border-yellow-500/40 dark:bg-yellow-500/15 dark:text-yellow-200',
    aliases: ['m', 'modified', 'changed'],
  },
  added: {
    displayCode: 'A',
    labelKey: 'gitStatusDisplay.status.added.label',
    descriptionKey: 'gitStatusDisplay.status.added.description',
    toneClassName:
      'border-emerald-500/60 bg-emerald-100 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-200',
    aliases: ['a', 'added', 'add'],
  },
  deleted: {
    displayCode: 'D',
    labelKey: 'gitStatusDisplay.status.deleted.label',
    descriptionKey: 'gitStatusDisplay.status.deleted.description',
    toneClassName:
      'border-red-500/60 bg-red-100 text-red-800 dark:border-red-500/40 dark:bg-red-500/15 dark:text-red-200',
    aliases: ['d', 'deleted', 'removed'],
  },
  renamed: {
    displayCode: 'R',
    labelKey: 'gitStatusDisplay.status.renamed.label',
    descriptionKey: 'gitStatusDisplay.status.renamed.description',
    toneClassName:
      'border-sky-500/60 bg-sky-100 text-sky-800 dark:border-sky-500/40 dark:bg-sky-500/15 dark:text-sky-200',
    aliases: ['r', 'renamed', 'rename'],
  },
  copied: {
    displayCode: 'C',
    labelKey: 'gitStatusDisplay.status.copied.label',
    descriptionKey: 'gitStatusDisplay.status.copied.description',
    toneClassName:
      'border-teal-500/60 bg-teal-100 text-teal-800 dark:border-teal-500/40 dark:bg-teal-500/15 dark:text-teal-200',
    aliases: ['c', 'copied', 'copy'],
  },
  conflict: {
    displayCode: '!',
    labelKey: 'gitStatusDisplay.status.conflict.label',
    descriptionKey: 'gitStatusDisplay.status.conflict.description',
    toneClassName:
      'border-red-500/70 bg-red-100 text-red-800 dark:border-red-500/50 dark:bg-red-500/20 dark:text-red-100',
    aliases: [
      'uu',
      'aa',
      'dd',
      'au',
      'ua',
      'du',
      'ud',
      'conflict',
      'conflicted',
      'unmerged',
      'bothmodified',
      'both-modified',
    ],
  },
  changed: {
    displayCode: 'C',
    labelKey: 'gitStatusDisplay.status.changed.label',
    descriptionKey: 'gitStatusDisplay.status.changed.description',
    toneClassName:
      'border-bolt-elements-borderColor bg-bolt-elements-background-depth-3 text-bolt-elements-textSecondary',
    aliases: [],
  },
};

const STATUS_BY_ALIAS = Object.entries(STATUS_DEFINITIONS).reduce(
  (result, [key, definition]) => {
    for (const alias of definition.aliases) {
      result[alias] = key as GitStatusDisplayKey;
    }

    return result;
  },
  {} as Record<string, GitStatusDisplayKey>,
);

const LEGEND_KEYS: GitStatusDisplayKey[] = ['untracked', 'modified', 'added', 'deleted', 'renamed', 'conflict'];

function normalizeGitStatusCode(input: unknown) {
  return String(input ?? 'M')
    .trim()
    .replace(/\s+/g, '');
}

function keyFromNormalizedStatus(normalized: string): GitStatusDisplayKey {
  const lower = normalized.toLowerCase();
  const directMatch = STATUS_BY_ALIAS[lower];

  if (directMatch) {
    return directMatch;
  }

  if (normalized.length > 1) {
    /*
     * Unmerged porcelain codes carry a 'U' in either column (e.g. AU/UA/UD/DU/UU).
     * These are conflict states and must be resolved as such before the
     * single-column fallback below misreads them as Added/Untracked/etc.
     */
    if (lower.includes('u')) {
      return 'conflict';
    }

    const firstColumn = STATUS_BY_ALIAS[normalized[0]?.toLowerCase() ?? ''];

    if (firstColumn) {
      return firstColumn;
    }
  }

  return STATUS_BY_ALIAS[lower[0] ?? ''] ?? 'changed';
}

export function describeGitFileStatus(input: unknown, language?: string | null): GitStatusDisplay {
  const rawCode = normalizeGitStatusCode(input) || 'M';
  const key = keyFromNormalizedStatus(rawCode);
  const definition = STATUS_DEFINITIONS[key];
  const copy = getGitStatusDisplayCopy(language);

  return {
    key,
    rawCode,
    displayCode: definition.displayCode,
    label: copy[definition.labelKey],
    description: copy[definition.descriptionKey],
    toneClassName: definition.toneClassName,
  };
}

export function getGitStatusLegendItems(language?: string | null): GitStatusDisplay[] {
  return LEGEND_KEYS.map((key) => describeGitFileStatus(key, language));
}
