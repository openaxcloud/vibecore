/**
 * Fuzzy-search over workbench files for the Sprint 3 @file-mention palette.
 *
 * The matcher is a tight, dependency-free fuzzy scorer (no `fuse.js`) tuned
 * for the chat composer use case:
 *   - matches the path component basename first, then path segments
 *   - rewards consecutive matches (so "App" beats "Aap" on "App.tsx")
 *   - rewards basename hits over deep-path hits
 *   - bails fast on long irrelevant strings via an early-exit char check
 *
 * `useFileMentions(query)` subscribes to `workbenchStore.files` and returns
 * the top N candidates ordered by score. The pure `scoreFileMention` and
 * `searchFileMentions` exports drive the unit tests directly.
 */

import { useStore } from '@nanostores/react';
import { useMemo } from 'react';

import type { FileMap } from '~/lib/stores/files';
import { workbenchStore } from '~/lib/stores/workbench';
import { WORK_DIR } from '~/utils/constants';

export interface FileMentionCandidate {
  /** Absolute path inside the workbench, e.g. `/home/project/src/App.tsx`. */
  absolutePath: string;

  /** Display path relative to WORK_DIR, e.g. `src/App.tsx`. */
  displayPath: string;

  /** Last path component, e.g. `App.tsx`. Used for ranking + as primary label. */
  basename: string;

  /** Score from `scoreFileMention`; higher is better. */
  score: number;
}

const PATH_SEP = '/';

function relativeToWorkDir(absolutePath: string): string {
  if (absolutePath.startsWith(`${WORK_DIR}/`)) {
    return absolutePath.slice(WORK_DIR.length + 1);
  }

  return absolutePath.replace(/^\/+/, '');
}

function basenameOf(absolutePath: string): string {
  const idx = absolutePath.lastIndexOf(PATH_SEP);
  return idx >= 0 ? absolutePath.slice(idx + 1) : absolutePath;
}

/**
 * Cheap subsequence test: are every char of `needle` present in `haystack`
 * in the same order (case-insensitive)? Returns -1 when no match, otherwise
 * a positive score weighted by:
 *   - +6 per consecutive char run (rewards "App" over "A.p.p")
 *   - +3 for a match at index 0 of the haystack
 *   - -1 per skipped char (penalises stretched matches)
 */
export function scoreFileMention(needle: string, haystack: string): number {
  if (needle.length === 0) {
    return 0;
  }

  if (needle.length > haystack.length) {
    return -1;
  }

  const n = needle.toLowerCase();
  const h = haystack.toLowerCase();

  let score = 0;
  let cursor = 0;
  let lastMatchIdx = -2;
  let consecutive = 0;

  for (let i = 0; i < n.length; i += 1) {
    const ch = n[i];

    let found = -1;

    for (let j = cursor; j < h.length; j += 1) {
      if (h[j] === ch) {
        found = j;
        break;
      }
    }

    if (found === -1) {
      return -1;
    }

    if (found === lastMatchIdx + 1) {
      consecutive += 1;
      score += 6 * consecutive;
    } else {
      consecutive = 0;
      score -= found - cursor;
    }

    if (found === 0) {
      score += 3;
    }

    lastMatchIdx = found;
    cursor = found + 1;
  }

  return score;
}

interface SearchOptions {
  limit?: number;

  /**
   * MRU file paths (displayPath form, e.g. `src/App.tsx`) to boost in
   * the ranking. The first entry gets the biggest bonus, decaying
   * linearly so recent picks rise to the top of the empty-query
   * default list and earn extra weight on partial fuzzy matches.
   */
  recentMentionedFilePaths?: readonly string[];
}

const DEFAULT_LIMIT = 12;
const MRU_BONUS_MAX = 200;
const MRU_BONUS_DECAY = 8;

function mruBonus(recent: readonly string[] | undefined, displayPath: string): number {
  if (!recent || recent.length === 0) {
    return 0;
  }

  const idx = recent.indexOf(displayPath);

  if (idx < 0) {
    return 0;
  }

  return Math.max(0, MRU_BONUS_MAX - idx * MRU_BONUS_DECAY);
}

/**
 * Pure search over a FileMap snapshot. Used by the React hook below
 * and unit-tested in isolation.
 */
export function searchFileMentions(files: FileMap, query: string, options: SearchOptions = {}): FileMentionCandidate[] {
  const limit = options.limit ?? DEFAULT_LIMIT;
  const candidates: FileMentionCandidate[] = [];

  const trimmed = query.trim();
  const isEmptyQuery = trimmed.length === 0;

  for (const [absolutePath, dirent] of Object.entries(files)) {
    if (!dirent || dirent.type !== 'file') {
      continue;
    }

    const basename = basenameOf(absolutePath);
    const displayPath = relativeToWorkDir(absolutePath);

    let score: number;

    if (isEmptyQuery) {
      /*
       * No query yet — return everything ordered by shallow paths first
       * so the most-recently-visible files surface naturally.
       */
      score = 1000 - displayPath.split(PATH_SEP).length;
    } else {
      const basenameScore = scoreFileMention(trimmed, basename);
      const pathScore = scoreFileMention(trimmed, displayPath);

      if (basenameScore < 0 && pathScore < 0) {
        continue;
      }

      // Prefer basename hits: a 1.5× weight breaks ties on common patterns.
      score = Math.max(basenameScore * 1.5, pathScore);
    }

    score += mruBonus(options.recentMentionedFilePaths, displayPath);

    candidates.push({ absolutePath, displayPath, basename, score });
  }

  candidates.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }

    return a.displayPath.localeCompare(b.displayPath);
  });

  if (candidates.length > limit) {
    candidates.length = limit;
  }

  return candidates;
}

/**
 * React hook: subscribes to the workbench file map and returns the top
 * N matches for the current query, memoised so re-renders with the same
 * query+files don't re-sort.
 */
export function useFileMentions(query: string, options: SearchOptions = {}): FileMentionCandidate[] {
  const files = useStore(workbenchStore.files) as FileMap;
  const limit = options.limit ?? DEFAULT_LIMIT;
  const recent = options.recentMentionedFilePaths;

  return useMemo(
    () => searchFileMentions(files, query, { limit, recentMentionedFilePaths: recent }),
    [files, query, limit, recent],
  );
}
