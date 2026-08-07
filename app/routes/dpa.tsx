import { data as json, type LoaderFunctionArgs, type MetaFunction } from 'react-router';

import DPA from '~/components/marketing/ecode-exact/pages/DPA';
import { buildPublicRouteMeta, getPublicRouteSeoCopy } from '~/lib/i18n/catalogs/public-route-seo';
import { localeResponseHeaders, resolveRequestLocale } from '~/lib/i18n/request-locale';

// In-repo SSR (main Remix app) rather than the prebuilt external marketing bundle.
export function loader({ request }: LoaderFunctionArgs) {
  const locale = resolveRequestLocale(request);

  return json({ language: locale.language }, { headers: localeResponseHeaders(request, locale) });
}

export const meta: MetaFunction<typeof loader> = ({ data, matches }) => {
  const rootData = matches.find((match) => match.id === 'root')?.data as { language?: string } | undefined;
  const language = data?.language ?? rootData?.language;
  const copy = getPublicRouteSeoCopy(language);

  return buildPublicRouteMeta({
    language,
    pathname: '/dpa',
    seo: {
      title: copy['publicRouteSeo.dpa.title'],
      description: copy['publicRouteSeo.dpa.description'],
      imageAlt: copy['publicRouteSeo.dpa.imageAlt'],
    },
  });
};

export default function DpaRoute() {
  return <DPA />;
}
