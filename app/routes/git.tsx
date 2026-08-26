import type { LoaderFunctionArgs } from 'react-router';
import { redirect } from 'react-router';

/*
 * `/git` was the legacy client-only clone surface. It mounted `useGit()` with no
 * project/workspace identity, which made the remote runtime adapter POST `{}` to
 * `/api/runtime/workspaces` twice and could never import anything. The real,
 * tenant-scoped import flow is `/import-github`: it creates the project through
 * the authenticated organization API, persists the files, then opens that
 * project's IDE. Keep old bookmarks working by redirecting rather than trying
 * to provision an ownerless workspace.
 */
export function legacyGitImportLocation(requestUrl: string): string {
  const source = new URL(requestUrl);
  const target = new URL('/import-github', source.origin);
  const repositoryUrl = source.searchParams.get('repositoryUrl') ?? source.searchParams.get('url');

  if (repositoryUrl) {
    target.searchParams.set('repositoryUrl', repositoryUrl);
  }

  for (const key of ['branch', 'name', 'lang'] as const) {
    const value = source.searchParams.get(key);

    if (value) {
      target.searchParams.set(key, value);
    }
  }

  return `${target.pathname}${target.search}`;
}

export async function loader({ request }: LoaderFunctionArgs) {
  return redirect(legacyGitImportLocation(request.url), 301);
}

/* The loader always redirects; the element exists only to satisfy route typing. */
export default function LegacyGitImportRedirect() {
  return null;
}
