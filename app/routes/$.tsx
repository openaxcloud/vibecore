import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { LoaderFunctionArgs, MetaFunction } from 'react-router';
import { data as json, isRouteErrorResponse, Link, useLoaderData, useRouteError } from 'react-router';

import { LinkButton, PublicShell } from '~/components/dashboard/SaaSLayout';
import {
  buildPublicRouteMeta,
  getPublicRouteSeoCopy,
  interpolatePublicRouteSeoCopy,
} from '~/lib/i18n/catalogs/public-route-seo';
import { localeResponseHeaders, resolveRequestLocale } from '~/lib/i18n/request-locale';

/*
 * Remix v2 splat route. It matches any URL that no more specific route claims —
 * including the multi-segment paths that bot scanners probe (e.g.
 * `/administrator/manifests/files/joomla.xml`, `/wp-login.php/foo`).
 *
 * Before this route existed those requests produced no route match, and Remix
 * surfaced an ERROR-level `No route matches URL '…'` log on every scan. By
 * claiming the URL here and returning route data with a 404 status, the request
 * resolves as an expected missing page without reaching `handleError` or
 * `console.error`, so error budgets and paging stay clean. Rendering the normal
 * route also lets React Router emit localized metadata for the 404 response.
 */

export const loader = ({ request }: LoaderFunctionArgs) => {
  const locale = resolveRequestLocale(request);
  const copy = getPublicRouteSeoCopy(locale.language);

  return json(
    { language: locale.language, status: 404 as const },
    {
      status: 404,
      statusText: copy['publicRouteSeo.notFound.httpStatus'],
      headers: localeResponseHeaders(request, locale),
    },
  );
};

export const meta: MetaFunction<typeof loader> = ({ data, location, matches }) => {
  /*
   * `matches` / `location` sont optionnels ici : `meta` est aussi appelé hors
   * d'un rendu de route complet (tests, rendu d'erreur). Y accéder sans garde
   * faisait échouer le `meta` — donc plus de titre ni de `noindex` du tout.
   */
  const rootData = matches?.find((match) => match.id === 'root')?.data as { language?: string } | undefined;
  const language = data?.language ?? rootData?.language;
  const copy = getPublicRouteSeoCopy(language);

  return buildPublicRouteMeta({
    language,
    pathname: location?.pathname ?? '/',
    robots: 'noindex,follow',
    seo: {
      title: copy['publicRouteSeo.notFound.seo.title'],
      description: copy['publicRouteSeo.notFound.seo.description'],
      imageAlt: copy['publicRouteSeo.notFound.seo.imageAlt'],
    },
  });
};

export function NotFoundView({ status = 404 }: { status?: number }) {
  const { i18n } = useTranslation();
  const copy = getPublicRouteSeoCopy(i18n.resolvedLanguage ?? i18n.language);
  const isNotFound = status === 404;
  const values = { status };

  /*
   * Unexpected route errors still render through this boundary. React Router
   * cannot derive boundary status from route metadata, so keep the client title
   * aligned with the rendered status as a defensive recovery path.
   */
  useEffect(() => {
    document.title = isNotFound
      ? copy['publicRouteSeo.notFound.seo.title']
      : interpolatePublicRouteSeoCopy(copy['publicRouteSeo.notFound.errorTitle'], values);
  }, [copy, isNotFound, status]);

  return (
    <PublicShell>
      <section
        className="mx-auto flex min-h-[60vh] w-full max-w-2xl flex-col items-center justify-center gap-6 px-6 py-24 text-center"
        role="main"
        aria-labelledby="not-found-heading"
      >
        <span className="text-sm font-semibold uppercase tracking-[0.2em] text-bolt-elements-textTertiary">
          {isNotFound ? status : interpolatePublicRouteSeoCopy(copy['publicRouteSeo.notFound.errorLabel'], values)}
        </span>
        <h1 id="not-found-heading" className="text-3xl font-semibold text-bolt-elements-textPrimary">
          {isNotFound ? copy['publicRouteSeo.notFound.heading'] : copy['publicRouteSeo.notFound.errorHeading']}
        </h1>
        <p className="max-w-md text-sm leading-6 text-bolt-elements-textSecondary">
          {isNotFound ? copy['publicRouteSeo.notFound.description'] : copy['publicRouteSeo.notFound.errorDescription']}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <LinkButton to="/">{copy['publicRouteSeo.notFound.home']}</LinkButton>
          <LinkButton to="/dashboard" variant="outline">
            {copy['publicRouteSeo.notFound.dashboard']}
          </LinkButton>
        </div>
        <Link to="/help-center" className="text-xs text-bolt-elements-textTertiary underline-offset-4 hover:underline">
          {copy['publicRouteSeo.notFound.help']}
        </Link>
      </section>
    </PublicShell>
  );
}

/*
 * The catch-all loader returns a normal route payload with an HTTP 404 status so
 * localized metadata and content are rendered together without logging an incident.
 */
export default function SplatRoute() {
  const data = useLoaderData<typeof loader>();

  return <NotFoundView status={data.status} />;
}

export function ErrorBoundary() {
  const error = useRouteError();

  /*
   * Any thrown Response is expected here — render a clean page. Deliberately no
   * console.error / logStore.logError: these are not incidents.
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
