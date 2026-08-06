import { useEffect } from 'react';
import type { LoaderFunctionArgs, MetaFunction } from 'react-router';
import { data, isRouteErrorResponse, Link, useRouteError } from 'react-router';

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
   * BUG-MKT-005 : on RENVOIE un 404 au lieu de le LEVER.
   *
   * Une Response levée fait rendre l'ErrorBoundary, et React Router n'exécute
   * PAS le `meta` d'une route en erreur : le titre servi restait donc celui de
   * la racine. Le correctif client (`document.title` dans un effet) ne répare
   * que la navigation interne — un crawler, un partage social ou un `curl` ne
   * voient que le HTML du serveur, où le titre était générique.
   *
   * En renvoyant les données avec `status: 404`, le composant rend normalement,
   * `meta` s'exécute au SSR, et le statut HTTP reste 404. La propriété qui
   * motivait le `throw` est préservée : ce n'est toujours pas une erreur, donc
   * rien n'est journalisé au niveau error.
   */
  return data({ notFoundPath: new URL(request.url).pathname }, { status: 404, statusText: 'Not Found' });
};

export const meta: MetaFunction = () => [
  { title: 'Page not found · E-Code' },
  { name: 'description', content: 'This page could not be found on E-Code.' },
  // BUG-MKT-009 — une page introuvable ne doit jamais entrer dans un index.
  { name: 'robots', content: 'noindex, nofollow' },
];

function NotFoundView({ status = 404 }: { status?: number }) {
  /*
   * Filet pour le rendu via ErrorBoundary UNIQUEMENT. Sur le chemin normal, le
   * loader RENVOIE désormais le 404 et `meta` pose le titre dès le SSR ; mais une
   * route en erreur n'exécute pas `meta`, et React 18 ne hisse pas un <title>.
   * Poser le titre ici reste donc nécessaire pour ce chemin résiduel.
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
 * Chemin NORMAL depuis que le loader renvoie (au lieu de lever) : c'est ce
 * composant qui rend, donc `meta` s'applique et le titre est correct dès le SSR.
 * L'ErrorBoundary reste en filet pour les erreurs réellement inattendues.
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
