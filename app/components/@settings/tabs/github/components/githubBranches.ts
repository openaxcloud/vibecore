import { getSettingsConnectorsResidualCopy } from '~/lib/i18n/catalogs/settings-connectors-residual';
import type { GitHubConnection } from '~/types/GitHub';

export type GitHubBranchesErrorCode = 'invalidRepository' | 'fetchFailed';

export class GitHubBranchesError extends Error {
  readonly code: GitHubBranchesErrorCode;

  constructor(code: GitHubBranchesErrorCode) {
    const copy = getSettingsConnectorsResidualCopy('en');
    super(copy[`settingsResidual.branches.${code}`]);
    this.name = 'GitHubBranchesError';
    this.code = code;
  }
}

export interface CloneBranchInfo {
  name: string;
  sha: string;
  protected: boolean;
  isDefault: boolean;
}

export interface ResolvedBranches {
  branches: CloneBranchInfo[];
  defaultBranch: string;
}

/*
 * A GitHub connection is "server-side" / OAuth-backed when the store holds a
 * user but NO client token. For those users the decrypted OAuth token lives in
 * the API service (UserConnection.accessTokenEncrypted) and is intentionally
 * never sent to the browser, so the legacy /api/github-branches route — which
 * hard-requires a client-supplied token — returns "GitHub token is required"
 * and the branch selector breaks. Detect this case so we can route through the
 * UserConnection-backed proxy instead.
 */
export function isOAuthConnection(connection: GitHubConnection | null | undefined): boolean {
  return !!connection?.user && !connection?.token;
}

/*
 * Raw GitHub branch payload shape (as returned by api.github.com/.../branches
 * and forwarded verbatim by the /api/github-user `get_branches` proxy action).
 */
interface RawGitHubBranch {
  name: string;
  commit?: { sha?: string };
  protected?: boolean;
}

/*
 * Already-normalised branch shape returned by the /api/github-branches route
 * (used for the legacy client-token flow).
 */
interface NormalisedBranch {
  name: string;
  sha?: string;
  protected?: boolean;
  isDefault?: boolean;
}

function sortBranches(branches: CloneBranchInfo[]): CloneBranchInfo[] {
  return [...branches].sort((a, b) => {
    if (a.isDefault) {
      return -1;
    }

    if (b.isDefault) {
      return 1;
    }

    return a.name.localeCompare(b.name);
  });
}

/*
 * Normalise the raw GitHub branch list returned by the OAuth proxy
 * (`/api/github-user` action=get_branches) into the shape the UI consumes,
 * flagging the repo's default branch and sorting it first.
 */
export function normaliseProxyBranches(raw: unknown, defaultBranch: string): ResolvedBranches {
  const list = Array.isArray(raw) ? (raw as RawGitHubBranch[]) : [];

  const branches: CloneBranchInfo[] = list
    .filter((branch) => branch && typeof branch.name === 'string')
    .map((branch) => ({
      name: branch.name,
      sha: branch.commit?.sha ?? '',
      protected: branch.protected === true,
      isDefault: branch.name === defaultBranch,
    }));

  return { branches: sortBranches(branches), defaultBranch };
}

function normaliseRouteBranches(raw: unknown, fallbackDefault: string): ResolvedBranches {
  const data = (raw ?? {}) as { branches?: NormalisedBranch[]; defaultBranch?: string };
  const defaultBranch = data.defaultBranch || fallbackDefault;

  const branches: CloneBranchInfo[] = (data.branches ?? [])
    .filter((branch) => branch && typeof branch.name === 'string')
    .map((branch) => ({
      name: branch.name,
      sha: branch.sha ?? '',
      protected: branch.protected === true,
      isDefault: branch.isDefault ?? branch.name === defaultBranch,
    }));

  return { branches: sortBranches(branches), defaultBranch };
}

/*
 * Resolve the branches for a repository for the Clone flow, transparently
 * handling both connection styles:
 *
 *  - OAuth / server-side connection (no client token): go through the
 *    UserConnection-backed `/api/github-user` proxy, which attaches the
 *    decrypted OAuth token on the server. This is the path that was broken —
 *    the old code passed token:'' to /api/github-branches and the user got a
 *    "GitHub token is required" error.
 *
 *  - Legacy client-token connection: keep using /api/github-branches with the
 *    user's own token, exactly as before.
 *
 * `fetchImpl` is injectable for tests.
 */
export async function resolveCloneBranches(
  connection: GitHubConnection | null | undefined,
  repoFullName: string,
  defaultBranch: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ResolvedBranches> {
  const [owner, repo] = repoFullName.split('/');

  if (!owner || !repo) {
    throw new GitHubBranchesError('invalidRepository');
  }

  if (isOAuthConnection(connection)) {
    const response = await fetchImpl('/api/github-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'get_branches', repo: repoFullName }),
    });

    if (!response.ok) {
      throw new GitHubBranchesError('fetchFailed');
    }

    const data = (await response.json()) as { branches?: unknown };

    return normaliseProxyBranches(data.branches, defaultBranch);
  }

  const response = await fetchImpl('/api/github-branches', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ owner, repo, token: connection?.token ?? '' }),
  });

  if (!response.ok) {
    throw new GitHubBranchesError('fetchFailed');
  }

  const data = await response.json();

  return normaliseRouteBranches(data, defaultBranch);
}
