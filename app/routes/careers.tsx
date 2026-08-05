import { data as json, type LoaderFunctionArgs, type MetaFunction } from 'react-router';
import Careers from '~/components/marketing/ecode-exact/pages/Careers';
import { buildPublicRouteMeta, getPublicRouteSeoCopy } from '~/lib/i18n/catalogs/public-route-seo';
import { localeResponseHeaders, resolveRequestLocale } from '~/lib/i18n/request-locale';

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
    pathname: '/careers',
    seo: {
      title: copy['publicRouteSeo.careers.title'],
      description: copy['publicRouteSeo.careers.description'],
      imageAlt: copy['publicRouteSeo.careers.imageAlt'],
    },
  });
};

export default function CareersRoute() {
  return <Careers />;
}
