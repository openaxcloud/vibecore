import { data as json, type LoaderFunctionArgs } from 'react-router';

import { localeResponseHeaders, resolveRequestLocale } from '~/lib/i18n/request-locale';
import { findEcodeBlogPostsByCategory } from '~/lib/marketing/ecode-public-api-data.server';

export function loader({ params, request }: LoaderFunctionArgs) {
  const localeResolution = resolveRequestLocale(request);
  const headers = localeResponseHeaders(request, localeResolution);

  headers.set('Cache-Control', 'public, max-age=300');

  return json(findEcodeBlogPostsByCategory(params.category, localeResolution.language), { headers });
}
