import { data as json, type LoaderFunctionArgs } from 'react-router';
import { getFeaturesForRequest } from '~/lib/feature-announcements.server';
import { localeResponseHeaders, resolveRequestLocale } from '~/lib/i18n/request-locale';

export async function loader({ request }: LoaderFunctionArgs) {
  const locale = resolveRequestLocale(request);

  return json(getFeaturesForRequest(request, locale.language), {
    headers: localeResponseHeaders(request, locale),
  });
}
