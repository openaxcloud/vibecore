/**
 * Map a Remix loader/action error caught by `<ErrorBoundary>` into a UX-ready
 * descriptor for the /projects/new page. The previous boundary always rendered
 * the same "Sign in to create a project" title regardless of the underlying
 * failure, which confused users who hit a network error during a cold start
 * (they saw "Sign in … fetch failed" even though they were authenticated).
 *
 * The categorizer is intentionally pure so it can be unit-tested in isolation
 * from React. The route only renders the result.
 */

import { isRouteErrorResponse } from 'react-router';

export type ProjectsNewErrorKind = 'auth' | 'network' | 'quota' | 'server' | 'unknown';

export interface ProjectsNewErrorDescriptor {
  kind: ProjectsNewErrorKind;
}

const NETWORK_MESSAGE_PATTERNS: readonly RegExp[] = [
  /fetch failed/i,
  /network(?:\s+error|\s+request\s+failed)?/i,
  /failed to fetch/i,
  /load failed/i,
  /ENETUNREACH/,
  /ENOTFOUND/,
  /ECONNREFUSED/,
  /ECONNRESET/,
  /EAI_AGAIN/,
  /aborted/i,
];

const PROJECT_QUOTA_PATTERN = /quota exceeded for projects\.count/i;

function looksLikeProjectQuotaError(error: unknown): boolean {
  const message = extractDetail(error);
  return PROJECT_QUOTA_PATTERN.test(message);
}

function looksLikeNetworkError(error: unknown): boolean {
  if (typeof error === 'object' && error !== null) {
    const cause = (error as { cause?: unknown }).cause;

    if (cause && cause !== error && looksLikeNetworkError(cause)) {
      return true;
    }
  }

  const message =
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as { message: unknown }).message === 'string'
      ? (error as { message: string }).message
      : typeof error === 'string'
        ? error
        : '';

  if (!message) {
    return false;
  }

  return NETWORK_MESSAGE_PATTERNS.some((pattern) => pattern.test(message));
}

function extractDetail(error: unknown): string {
  if (error == null) {
    return '';
  }

  if (typeof error === 'string') {
    return error;
  }

  if (typeof error === 'object' && 'message' in error && typeof (error as { message: unknown }).message === 'string') {
    return (error as { message: string }).message;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export function categorizeProjectsNewError(error: unknown): ProjectsNewErrorDescriptor {
  if (isRouteErrorResponse(error)) {
    const data = error.data as { error?: unknown } | undefined;
    const dataMessage = typeof data?.error === 'string' ? data.error : undefined;
    const detail = dataMessage ?? error.statusText ?? `HTTP ${error.status}`;

    if (error.status === 401 || error.status === 403) {
      return { kind: 'auth' };
    }

    if (error.status === 404) {
      return { kind: 'unknown' };
    }

    if (error.status >= 500) {
      return { kind: 'server' };
    }

    if ((error.status === 402 || error.status === 429) && PROJECT_QUOTA_PATTERN.test(detail)) {
      return { kind: 'quota' };
    }

    return { kind: 'unknown' };
  }

  if (looksLikeNetworkError(error)) {
    return { kind: 'network' };
  }

  if (looksLikeProjectQuotaError(error)) {
    return { kind: 'quota' };
  }

  return { kind: 'unknown' };
}
