/*
 * SSH git URL helpers for the Git pane (client-side). Mirror the server-side
 * sshHostFromGitUrl / isSshGitUrl in the ide-panel route so the UI binds keys to
 * the origin host exactly the way push/pull do.
 */

/** scp-like `git@host:path` or `ssh://[user@]host[:port]/path` → host (lowercased). */
export function sshHostFromGitUrl(url: string): string | null {
  const trimmed = (url ?? '').trim();
  const proto = trimmed.match(/^ssh:\/\/(?:[^@/]+@)?([^:/]+)/i);

  if (proto) {
    return proto[1].toLowerCase();
  }

  const scp = trimmed.match(/^[^@\s/]+@([^:\s/]+):/);

  return scp ? scp[1].toLowerCase() : null;
}

/** True for an SSH git remote (`git@host:path` or `ssh://…`), false for https/empty. */
export function isSshRemoteUrl(url: string): boolean {
  const value = (url ?? '').trim();

  // Reject whitespace-bearing values, matching the server-side isSshGitUrl.
  if (!value || /\s/.test(value)) {
    return false;
  }

  return /^ssh:\/\/[^/]+\/.+/.test(value) || /^[^@\s/]+@[^:\s/]+:.+/.test(value);
}
