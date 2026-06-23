/**
 * Pure helpers for the GitHub repositories display in {@link ./GitHubTab.tsx}.
 *
 * Extracted so the preview/expand splitting logic can be unit-tested without
 * mounting React or the Radix Collapsible. The previous inline implementation
 * placed the preview list and "Show more" button *inside* the CollapsibleContent
 * (which only mounts when expanded), making the 12-item preview and the
 * "Show more" button unreachable. These helpers make the split explicit so the
 * preview always renders and the Collapsible only reveals the remainder.
 */

export const DEFAULT_REPO_PREVIEW_COUNT = 12;

export interface RepoSplit<T> {
  /** Repositories shown before any "Show more" interaction (always visible). */
  preview: T[];

  /** Repositories revealed only when the section is expanded. */
  remaining: T[];

  /** Whether there are repositories beyond the preview (gates the toggle). */
  hasMore: boolean;

  /** How many repositories are hidden behind the toggle. */
  hiddenCount: number;
}

/**
 * Split a repository list into an always-visible preview and the remainder.
 *
 * @param repos        Full repository list.
 * @param previewCount How many to show before expanding. Defaults to 12.
 */
export function splitRepos<T>(repos: T[] | undefined | null, previewCount = DEFAULT_REPO_PREVIEW_COUNT): RepoSplit<T> {
  const safeRepos = Array.isArray(repos) ? repos : [];
  const count = Number.isFinite(previewCount) && previewCount > 0 ? Math.floor(previewCount) : 0;

  const preview = safeRepos.slice(0, count);
  const remaining = safeRepos.slice(count);

  return {
    preview,
    remaining,
    hasMore: remaining.length > 0,
    hiddenCount: remaining.length,
  };
}
