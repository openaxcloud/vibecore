import { data as json, type LoaderFunctionArgs, type MetaFunction } from 'react-router';

import Subprocessors from '~/components/marketing/ecode-exact/pages/Subprocessors';
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
    pathname: '/subprocessors',
    seo: {
      title: copy['publicRouteSeo.subprocessors.title'],
      description: copy['publicRouteSeo.subprocessors.description'],
      imageAlt: copy['publicRouteSeo.subprocessors.imageAlt'],
    },
  });
};

export default function SubprocessorsRoute() {
  return <Subprocessors />;
}
