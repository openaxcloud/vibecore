import { data as json, type LoaderFunctionArgs, type MetaFunction } from 'react-router';
import HelpCenter from '~/components/marketing/ecode-exact/pages/HelpCenter';
import { getMarketingExactHelpCenterCopy } from '~/lib/i18n/catalogs/marketing-exact-help-center';
import { buildPublicRouteMeta } from '~/lib/i18n/catalogs/public-route-seo';
import { localeResponseHeaders, resolveRequestLocale } from '~/lib/i18n/request-locale';

export function loader({ request }: LoaderFunctionArgs) {
  const locale = resolveRequestLocale(request);

  return json({ language: locale.language }, { headers: localeResponseHeaders(request, locale) });
}

export const meta: MetaFunction<typeof loader> = ({ data, matches }) => {
  const rootData = matches.find((match) => match.id === 'root')?.data as { language?: string } | undefined;
  const language = data?.language ?? rootData?.language;
  const seo = getMarketingExactHelpCenterCopy(language).exactHelpCenter.seo;

  return buildPublicRouteMeta({ language, pathname: '/help-center', seo });
};

export default function HelpCenterRoute() {
  return <HelpCenter />;
}
