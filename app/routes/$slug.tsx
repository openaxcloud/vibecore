import { data, redirect, useLoaderData, type LoaderFunctionArgs, type MetaFunction } from 'react-router';
import { LinkButton, PublicShell } from '~/components/dashboard/SaaSLayout';
import {
  EcodeSurfacePageBySlug,
  getEcodeSurfacePage,
  makeEcodeSurfaceMetaTags,
} from '~/components/marketing/EcodeSurfacePages';
import { hasValidWebSession } from '~/lib/.server/require-session';
import { resolveSurfaceTwin } from '~/lib/surface-twins';

/*
 * The 404 for an unknown surface slug must be thrown from the loader, not the
 * component. A Response thrown during component render renders the ErrorBoundary
 * but cannot change the document's HTTP status — Remix has already committed 200
 * from the loaders by the time the component runs. That produced a soft-404
 * (HTTP 200 body that says "not found"), which search engines index as a real
 * page. Throwing here, before the status is committed, yields a true 404.
 */
export const loader = async ({ params, request }: LoaderFunctionArgs) => {
  const slug = params.slug ?? '';

  if (!getEcodeSurfacePage(slug)) {
    /*
     * BUG-MKT-005 : on RENVOIE le 404 au lieu de le LEVER.
     *
     * Une Response levée fait rendre l'ErrorBoundary, et React Router n'exécute
     * PAS le `meta` d'une route en erreur : le titre SERVI restait celui de la
     * racine (« E-Code — AI application development platform »), c'est-à-dire un
     * titre de page d'accueil sur une page introuvable.
     *
     * La raison d'origine du `throw` — obtenir un VRAI 404 et non un soft-404 en
     * 200 — est préservée : le statut est ici aussi décidé dans le loader, donc
     * avant que la réponse soit engagée. On garde le vrai 404 ET on récupère le
     * titre et le `noindex`.
     */
    return data({ notFound: true as const }, { status: 404, statusText: 'Not Found' });
  }

  // Send a signed-in visitor to the real in-app page instead of the marketing twin.
  const twin = resolveSurfaceTwin(slug);

  if (twin && (await hasValidWebSession(request))) {
    throw redirect(twin);
  }

  return data({ notFound: false as const });
};

export const meta: MetaFunction = ({ params }) => {
  const page = getEcodeSurfacePage(params.slug ?? '');

  return page
    ? makeEcodeSurfaceMetaTags(page)
    : [
        { title: 'Page not found · E-Code' },
        { name: 'description', content: 'This page could not be found on E-Code.' },

        // Une page introuvable ne doit jamais entrer dans un index.
        { name: 'robots', content: 'noindex, nofollow' },
      ];
};

/** Page introuvable rendue avec un vrai statut 404 et un titre propre. */
function SurfaceNotFound() {
  return (
    <PublicShell>
      <section
        className="mx-auto flex min-h-[60vh] w-full max-w-2xl flex-col items-center justify-center gap-6 px-6 py-24 text-center"
        aria-labelledby="surface-not-found-heading"
      >
        <span className="text-sm font-semibold uppercase tracking-[0.2em] text-bolt-elements-textTertiary">404</span>
        <h1 id="surface-not-found-heading" className="text-3xl font-semibold text-bolt-elements-textPrimary">
          This page could not be found
        </h1>
        <p className="max-w-md text-sm leading-6 text-bolt-elements-textSecondary">
          The page you are looking for may have been moved, renamed, or never existed.
        </p>
        <LinkButton to="/">Back to homepage</LinkButton>
      </section>
    </PublicShell>
  );
}

export default function EcodeRootSurfaceRoute() {
  const loaderData = useLoaderData<typeof loader>();

  if (loaderData?.notFound) {
    return <SurfaceNotFound />;
  }

  return <EcodeSurfacePageBySlug />;
}
