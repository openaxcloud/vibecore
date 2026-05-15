import { createTwoFilesPatch, structuredPatch } from 'diff';
import { MODIFICATIONS_TAG_NAME, WORK_DIR } from './constants';
import type { FileMap } from '~/lib/stores/files';

export const modificationsRegex = new RegExp(
  `^<${MODIFICATIONS_TAG_NAME}>[\\s\\S]*?<\\/${MODIFICATIONS_TAG_NAME}>\\s+`,
  'g',
);

interface ModifiedFile {
  type: 'diff' | 'file';
  content: string;
}

type FileModifications = Record<string, ModifiedFile>;

export interface ReviewableDiffLine {
  id: string;
  type: 'context' | 'add' | 'remove';
  content: string;
}

export interface ReviewableDiffHunk {
  id: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: ReviewableDiffLine[];
}

export function computeFileModifications(files: FileMap, modifiedFiles: Map<string, string>) {
  const modifications: FileModifications = {};

  let hasModifiedFiles = false;

  for (const [filePath, originalContent] of modifiedFiles) {
    const file = files[filePath];

    if (file?.type !== 'file') {
      continue;
    }

    const unifiedDiff = diffFiles(filePath, originalContent, file.content);

    if (!unifiedDiff) {
      // files are identical
      continue;
    }

    hasModifiedFiles = true;

    if (unifiedDiff.length > file.content.length) {
      // if there are lots of changes we simply grab the current file content since it's smaller than the diff
      modifications[filePath] = { type: 'file', content: file.content };
    } else {
      // otherwise we use the diff since it's smaller
      modifications[filePath] = { type: 'diff', content: unifiedDiff };
    }
  }

  if (!hasModifiedFiles) {
    return undefined;
  }

  return modifications;
}

/**
 * Computes a diff in the unified format. The only difference is that the header is omitted
 * because it will always assume that you're comparing two versions of the same file and
 * it allows us to avoid the extra characters we send back to the llm.
 *
 * @see https://www.gnu.org/software/diffutils/manual/html_node/Unified-Format.html
 */
export function diffFiles(fileName: string, oldFileContent: string, newFileContent: string) {
  let unifiedDiff = createTwoFilesPatch(fileName, fileName, oldFileContent, newFileContent);

  const patchHeaderEnd = `--- ${fileName}\n+++ ${fileName}\n`;
  const headerEndIndex = unifiedDiff.indexOf(patchHeaderEnd);

  if (headerEndIndex >= 0) {
    unifiedDiff = unifiedDiff.slice(headerEndIndex + patchHeaderEnd.length);
  }

  if (unifiedDiff === '') {
    return undefined;
  }

  return unifiedDiff;
}

function splitComparableLines(content: string) {
  const normalized = content.replace(/\r\n/g, '\n');

  if (normalized === '') {
    return [];
  }

  const lines = normalized.split('\n');

  if (lines[lines.length - 1] === '') {
    lines.pop();
  }

  return lines;
}

function hasTrailingNewline(content: string) {
  return content.endsWith('\n') || content.endsWith('\r\n');
}

export function buildReviewableDiffHunks(
  filePath: string,
  originalContent: string,
  proposedContent: string,
): ReviewableDiffHunk[] {
  const patch = structuredPatch(filePath, filePath, originalContent, proposedContent, '', '', {
    context: 3,
  });

  return patch.hunks.map((hunk, hunkIndex) => ({
    id: `${filePath}:${hunk.oldStart}:${hunk.newStart}:${hunkIndex}`,
    oldStart: hunk.oldStart,
    oldLines: hunk.oldLines,
    newStart: hunk.newStart,
    newLines: hunk.newLines,
    lines: hunk.lines.map((line, lineIndex) => {
      const marker = line[0];

      return {
        id: `${filePath}:${hunkIndex}:${lineIndex}`,
        type: marker === '+' ? 'add' : marker === '-' ? 'remove' : 'context',
        content: line.slice(1),
      };
    }),
  }));
}

export function applyReviewableDiffHunks(input: {
  originalContent: string;
  hunks: ReviewableDiffHunk[];
  acceptedHunkIds: Set<string> | string[];
}) {
  const { originalContent, hunks } = input;
  const acceptedHunkIds = input.acceptedHunkIds instanceof Set ? input.acceptedHunkIds : new Set(input.acceptedHunkIds);

  if (acceptedHunkIds.size === 0) {
    return originalContent;
  }

  const originalLines = splitComparableLines(originalContent);
  const outputLines: string[] = [];

  let cursor = 0;

  for (const hunk of hunks) {
    const hunkStartIndex = Math.max(0, hunk.oldStart - 1);
    const hunkEndIndex = hunkStartIndex + hunk.oldLines;

    if (!acceptedHunkIds.has(hunk.id)) {
      continue;
    }

    outputLines.push(...originalLines.slice(cursor, hunkStartIndex));

    for (const line of hunk.lines) {
      if (line.type === 'remove') {
        continue;
      }

      outputLines.push(line.content);
    }

    cursor = hunkEndIndex;
  }

  outputLines.push(...originalLines.slice(cursor));

  const newline = hasTrailingNewline(originalContent) ? '\n' : '';

  return `${outputLines.join('\n')}${newline}`;
}

export interface ReviewableDiffSummary {
  /** Number of `+` lines across every hunk. */
  addedLines: number;

  /** Number of `-` lines across every hunk. */
  removedLines: number;

  /** Number of hunks in the set. */
  hunkCount: number;

  /** True when at least one hunk has at least one added or removed line. */
  hasChanges: boolean;
}

/**
 * Aggregate add/remove counts across a set of reviewable hunks. Used by the
 * Sprint 2 inline-diff renderer to show an at-a-glance "+N / -M" pill on
 * each file action card, and by the agent panel's "Apply all" summary to
 * total up the impact of a multi-file patch before the user accepts it.
 *
 * Pure, allocation-light, safe to call on every render.
 */
export function summarizeReviewableDiffHunks(hunks: readonly ReviewableDiffHunk[]): ReviewableDiffSummary {
  let addedLines = 0;
  let removedLines = 0;

  for (const hunk of hunks) {
    for (const line of hunk.lines) {
      if (line.type === 'add') {
        addedLines += 1;
      } else if (line.type === 'remove') {
        removedLines += 1;
      }
    }
  }

  return {
    addedLines,
    removedLines,
    hunkCount: hunks.length,
    hasChanges: addedLines > 0 || removedLines > 0,
  };
}

/**
 * Sum a per-file diff summary into the aggregate counters used by the
 * "Apply N files · +A / -R" toast and the agent panel's Accept-all header.
 * Tracks how many files actually carry changes (no-op modifications still
 * round-trip through this path because the proposer can re-emit identical
 * content while streaming).
 */
export interface AggregatedDiffSummary {
  filesWithChanges: number;
  addedLines: number;
  removedLines: number;
  hunkCount: number;
}

export function aggregateReviewableDiffSummaries(summaries: readonly ReviewableDiffSummary[]): AggregatedDiffSummary {
  let filesWithChanges = 0;
  let addedLines = 0;
  let removedLines = 0;
  let hunkCount = 0;

  for (const summary of summaries) {
    if (summary.hasChanges) {
      filesWithChanges += 1;
    }

    addedLines += summary.addedLines;
    removedLines += summary.removedLines;
    hunkCount += summary.hunkCount;
  }

  return { filesWithChanges, addedLines, removedLines, hunkCount };
}

const regex = new RegExp(`^${WORK_DIR}\/`);

/**
 * Strips out the work directory from the file path.
 */
export function extractRelativePath(filePath: string) {
  return filePath.replace(regex, '');
}

/**
 * Converts the unified diff to HTML.
 *
 * Example:
 *
 * ```html
 * <bolt_file_modifications>
 * <diff path="/home/project/index.js">
 * - console.log('Hello, World!');
 * + console.log('Hello, Bolt!');
 * </diff>
 * </bolt_file_modifications>
 * ```
 */
export function fileModificationsToHTML(modifications: FileModifications) {
  const entries = Object.entries(modifications);

  if (entries.length === 0) {
    return undefined;
  }

  const result: string[] = [`<${MODIFICATIONS_TAG_NAME}>`];

  for (const [filePath, { type, content }] of entries) {
    result.push(`<${type} path=${JSON.stringify(filePath)}>`, content, `</${type}>`);
  }

  result.push(`</${MODIFICATIONS_TAG_NAME}>`);

  return result.join('\n');
}
