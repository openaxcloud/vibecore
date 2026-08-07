import { useTranslation } from 'react-i18next';
import { data, redirect, useLoaderData, type LoaderFunctionArgs, type MetaFunction } from 'react-router';
import { LinkButton, PublicShell } from '~/components/dashboard/SaaSLayout';
import {
  EcodeSurfacePageBySlug,
  getEcodeSurfacePage,
  makeEcodeSurfaceMetaTags,
} from '~/components/marketing/EcodeSurfacePages';
import { hasValidWebSession } from '~/lib/.server/require-session';
import { buildPublicRouteMeta, getPublicRouteSeoCopy } from '~/lib/i18n/catalogs/public-route-seo';
import { resolveSurfaceTwin } from '~/lib/surface-twins';

/*
 * Le 404 d'un slug inconnu est décidé DANS le loader, jamais au rendu : une
 * Response levée pendant le rendu du composant ne peut plus changer le statut
 * HTTP (Remix a déjà engagé un 200 depuis les loaders), ce qui produisait un
 * soft-404 — un corps « introuvable » servi en 200, que les moteurs indexent
 * comme une vraie page.
 *
 * BUG-MKT-005 : on RENVOIE ce 404 au lieu de le LEVER. Une Response levée fait
 * rendre l'ErrorBoundary, et React Router n'exécute PAS le `meta` d'une route en
 * erreur : le titre SERVI restait celui de la racine, c'est-à-dire un titre de
 * page d'accueil sur une page introuvable. En renvoyant les données avec
 * `status: 404`, le composant rend normalement, `meta` s'exécute au SSR — donc
 * un crawler, un partage social ou un `curl` voient le bon titre et le
 * `noindex` — et le statut reste un VRAI 404.
 */
export const loader = async ({ params, request }: LoaderFunctionArgs) => {
  const slug = params.slug ?? '';

  if (!getEcodeSurfacePage(slug)) {
    return data({ notFound: true as const }, { status: 404, statusText: 'Not Found' });
  }

  // Send a signed-in visitor to the real in-app page instead of the marketing twin.
  const twin = resolveSurfaceTwin(slug);

  if (twin && (await hasValidWebSession(request))) {
    throw redirect(twin);
  }

  return data({ notFound: false as const });
};

export const meta: MetaFunction<typeof loader> = ({ location, matches, params }) => {
  const page = getEcodeSurfacePage(params.slug ?? '');

  /*
   * `matches` / `location` sont optionnels ici : `meta` est aussi appelé hors
   * d'un rendu de route complet (tests, rendu d'erreur). Y accéder sans garde
   * faisait échouer le `meta` — donc plus de titre ni de `noindex` du tout.
   */
  const rootData = matches?.find((match) => match.id === 'root')?.data as { language?: string } | undefined;
  const language = rootData?.language;

  if (page) {
    return makeEcodeSurfaceMetaTags(page, language);
  }

  /*
   * Page introuvable : métadonnées localisées ET `noindex` explicite. Le repli
   * SEO de la racine ne pose pas de `robots`, donc sans ce bloc un 404 pourrait
   * entrer dans un index (BUG-MKT-009).
   */
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

/** Page introuvable rendue avec un vrai statut 404, un titre propre et localisée. */
function SurfaceNotFound() {
  const { i18n } = useTranslation();
  const copy = getPublicRouteSeoCopy(i18n.resolvedLanguage ?? i18n.language);

  return (
    <PublicShell>
      <section
        className="mx-auto flex min-h-[60vh] w-full max-w-2xl flex-col items-center justify-center gap-6 px-6 py-24 text-center"
        aria-labelledby="surface-not-found-heading"
      >
        <span className="text-sm font-semibold uppercase tracking-[0.2em] text-bolt-elements-textTertiary">404</span>
        <h1 id="surface-not-found-heading" className="text-3xl font-semibold text-bolt-elements-textPrimary">
          {copy['publicRouteSeo.notFound.heading']}
        </h1>
        <p className="max-w-md text-sm leading-6 text-bolt-elements-textSecondary">
          {copy['publicRouteSeo.notFound.description']}
        </p>
        <LinkButton to="/">{copy['publicRouteSeo.notFound.home']}</LinkButton>
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
