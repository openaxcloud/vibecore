import { data as json, type LoaderFunctionArgs, type MetaFunction } from 'react-router';
import ContactSales from '~/components/marketing/ecode-exact/pages/ContactSales';
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
    pathname: '/contact-sales',
    seo: {
      title: copy['publicRouteSeo.contactSales.title'],
      description: copy['publicRouteSeo.contactSales.description'],
      imageAlt: copy['publicRouteSeo.contactSales.imageAlt'],
    },
  });
};

export default function ContactSalesRoute() {
  return <ContactSales />;
}
