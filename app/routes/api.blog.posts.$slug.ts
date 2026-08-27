import { data as json, type LoaderFunctionArgs } from 'react-router';

import { getRemainingRouteShellsCopy } from '~/lib/i18n/catalogs/remaining-route-shells';
import { localeResponseHeaders, resolveRequestLocale } from '~/lib/i18n/request-locale';
import { findEcodeBlogPost } from '~/lib/marketing/ecode-public-api-data.server';

export function loader({ params, request }: LoaderFunctionArgs) {
  const localeResolution = resolveRequestLocale(request);
  const headers = localeResponseHeaders(request, localeResolution);
  const post = findEcodeBlogPost(params.slug, localeResolution.language);

  if (!post) {
    return json(
      {
        errorCode: 'blogPostNotFound',
        message: getRemainingRouteShellsCopy(localeResolution.language)['remainingRoutes.blog.notFound'],
      },
      { status: 404, headers },
    );
  }

  headers.set('Cache-Control', 'public, max-age=300');

  return json(post, { headers });
}
