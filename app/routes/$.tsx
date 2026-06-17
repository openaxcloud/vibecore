import { useEffect } from 'react';
import type { LoaderFunctionArgs, MetaFunction } from 'react-router';
import { isRouteErrorResponse, Link, useRouteError } from 'react-router';

import { LinkButton, PublicShell } from '~/components/dashboard/SaaSLayout';

/*
 * Remix v2 splat route. It matches any URL that no more specific route claims —
 * including the multi-segment paths that bot scanners probe (e.g.
 * `/administrator/manifests/files/joomla.xml`, `/wp-login.php/foo`).
 *
 * Before this route existed those requests produced no route match, and Remix
 * surfaced an ERROR-level `No route matches URL '…'` log on every scan. By
 * claiming the URL here and throwing a 404 *Response* (not a JS Error), the
 * request resolves as an expected "Not Found": Remix renders the ErrorBoundary
 * below and never routes the thrown Response through `handleError`/`console.error`,
 * so error budgets and paging stay clean.
 */

export const loader = ({ request }: LoaderFunctionArgs) => {
  /*
   * A thrown Response is the documented Remix way to signal an expected 404.
   * It is intentionally NOT a thrown Error, so it is never logged at error level.
   */
  throw new Response(`Not Found: ${new URL(request.url).pathname}`, {
    status: 404,
    statusText: 'Not Found',
  });
};

export const meta: MetaFunction = () => [{ title: 'Page not found · E-Code' }, { name: 'robots', content: 'noindex' }];

function NotFoundView({ status = 404 }: { status?: number }) {
  /*
   * The loader throws a 404 Response, so Remix renders this ErrorBoundary and the
   * route `meta` (with the proper title) never runs — leaving the document title at
   * the root default ("Loading..."). meta-on-error isn't supported in Remix v2, and
   * React 18 doesn't hoist a <title> element, so set it client-side here.
   */
  useEffect(() => {
    document.title = status === 404 ? 'Page not found · E-Code' : `Error ${status} · E-Code`;
  }, [status]);

  return (
    <PublicShell>
      <section
        className="mx-auto flex min-h-[60vh] w-full max-w-2xl flex-col items-center justify-center gap-6 px-6 py-24 text-center"
        role="main"
        aria-labelledby="not-found-heading"
      >
        <span className="text-sm font-semibold uppercase tracking-[0.2em] text-bolt-elements-textTertiary">
          {status === 404 ? '404' : `Error ${status}`}
        </span>
        <h1 id="not-found-heading" className="text-3xl font-semibold text-bolt-elements-textPrimary">
          {status === 404 ? 'This page could not be found' : 'Something went wrong'}
        </h1>
        <p className="max-w-md text-sm leading-6 text-bolt-elements-textSecondary">
          {status === 404
            ? 'The page you are looking for may have been moved, renamed, or never existed. Check the address or head back to a known place.'
            : 'The request could not be completed. Try again, or head back to a known place.'}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <LinkButton to="/">Back to homepage</LinkButton>
          <LinkButton to="/dashboard" variant="outline">
            Go to dashboard
          </LinkButton>
        </div>
        <Link to="/help-center" className="text-xs text-bolt-elements-textTertiary underline-offset-4 hover:underline">
          Visit the help center
        </Link>
      </section>
    </PublicShell>
  );
}

/*
 * The loader always throws, so in practice the ErrorBoundary renders. The default
 * export is kept as a defensive fallback in case the route is ever reached without
 * the loader (e.g. a future client-only navigation path).
 */
export default function SplatRoute() {
  return <NotFoundView status={404} />;
}

export function ErrorBoundary() {
  const error = useRouteError();

  /*
   * 404s (and any other thrown Response) are expected here — render a clean page.
   * Deliberately no console.error / logStore.logError: these are not incidents.
   */
  if (isRouteErrorResponse(error)) {
    return <NotFoundView status={error.status} />;
  }

  /*
   * An unexpected non-Response error reached us. Render gracefully rather than
   * bubbling to the root boundary; surfacing it as a 500-style page is enough.
   */
  return <NotFoundView status={500} />;
}
