import type { LoaderFunctionArgs } from 'react-router';

import { renderSitemap } from '~/lib/marketing/sitemap-routes';

/*
 * BUG-MKT-001 — `public/robots.txt` annonce `Sitemap: https://e-code.ai/sitemap.xml`,
 * URL qui renvoyait 404. Le site publiait son propre pointeur mort.
 *
 * L'origine est dérivée de la requête (et non codée en dur) pour que les
 * environnements de préproduction émettent leurs propres URL : un sitemap
 * pointant vers la production depuis une préprod ferait indexer les mauvaises
 * pages.
 */
export function loader({ request }: LoaderFunctionArgs) {
  const { origin } = new URL(request.url);
  const lastmod = new Date().toISOString().slice(0, 10);

  return new Response(renderSitemap(origin, lastmod), {
    status: 200,
    headers: {
      'content-type': 'application/xml; charset=utf-8',

      /*
       * Cache court : le sitemap doit refléter une nouvelle page en heures, pas
       * en jours, sans pour autant être recalculé à chaque passage de robot.
       */
      'cache-control': 'public, max-age=3600',
    },
  });
}
