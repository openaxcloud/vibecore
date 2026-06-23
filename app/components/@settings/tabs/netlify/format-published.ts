import { formatDistanceToNow } from 'date-fns';

/**
 * Safely format a Netlify deploy's `published_at` timestamp as a relative
 * "X ago" string.
 *
 * Netlify's API returns a `published_deploy` object even for sites whose latest
 * deploy never finished publishing (e.g. a first deploy that is still building
 * or errored out). In those cases `published_at` is absent/null despite the
 * type declaring it required. Passing `undefined`/`null`/an unparseable value to
 * `new Date(...)` yields an Invalid Date, and `formatDistanceToNow` then throws
 * "Invalid time value" — which, thrown during render, takes down the whole panel.
 *
 * Returns `null` when there is no valid date so callers can skip rendering the
 * "Published … ago" line entirely.
 */
export function formatPublishedAgo(publishedAt: string | null | undefined): string | null {
  if (!publishedAt) {
    return null;
  }

  const date = new Date(publishedAt);

  if (isNaN(date.getTime())) {
    return null;
  }

  return `${formatDistanceToNow(date)} ago`;
}
