/*
 * Revalidation policy for the project IDE route (shared by
 * projects.$projectId.ide.tsx and $accountSlug.$projectSlug.ide.tsx).
 *
 * The IDE swaps panels by rewriting client-only search params (?panel=,
 * ?commit=, ?peWindow=). Those navigations must NOT re-run the (expensive)
 * project loader: the loader data feeds initialIdePanels and the workspace
 * providers, and a re-run makes every service panel reload itself.
 *
 * BUG-IDE-PANEL-RECLICK-REPROVISION-001 — the previous guard additionally
 * required `currentUrl.search !== nextUrl.search`, so a navigation to the
 * IDENTICAL URL (re-clicking the already-active panel wrote the same ?panel=
 * value) fell through to defaultShouldRevalidate — which React Router sets to
 * TRUE when pathname+search are unchanged (same-URL navigation == refresh).
 * Result: a simple re-click on the active Webview/Deployments/Git/Snapshots
 * tab revalidated the whole route and reloaded the IDE. The guard now skips
 * revalidation whenever the URL differs only by client-IDE params — INCLUDING
 * not at all.
 */

export const IDE_CLIENT_SEARCH_PARAMS = new Set(['panel', 'commit', 'peWindow']);

export function routeKeyWithoutClientIdeParams(url: URL) {
  const searchParams = new URLSearchParams(url.search);

  for (const param of IDE_CLIENT_SEARCH_PARAMS) {
    searchParams.delete(param);
  }

  const search = searchParams.toString();

  return `${url.pathname}${search ? `?${search}` : ''}`;
}

export function shouldRevalidateProjectIde({
  currentUrl,
  nextUrl,
  formMethod,
  defaultShouldRevalidate,
}: {
  currentUrl: URL;
  nextUrl: URL;
  formMethod?: string;
  defaultShouldRevalidate: boolean;
}) {
  if (formMethod && formMethod.toUpperCase() !== 'GET') {
    return defaultShouldRevalidate;
  }

  if (
    currentUrl.origin === nextUrl.origin &&
    routeKeyWithoutClientIdeParams(currentUrl) === routeKeyWithoutClientIdeParams(nextUrl)
  ) {
    return false;
  }

  return defaultShouldRevalidate;
}
