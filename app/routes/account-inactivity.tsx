import { data as json, type LoaderFunctionArgs, type MetaFunction } from 'react-router';

import AccountInactivity from '~/components/marketing/ecode-exact/pages/AccountInactivity';
import { getMarketingExactAccountLanguagesCopy } from '~/lib/i18n/catalogs/marketing-exact-account-languages';
import { buildPublicRouteMeta } from '~/lib/i18n/catalogs/public-route-seo';
import { localeResponseHeaders, resolveRequestLocale } from '~/lib/i18n/request-locale';

// In-repo SSR (main Remix app) rather than the prebuilt external marketing bundle.
export function loader({ request }: LoaderFunctionArgs) {
  const locale = resolveRequestLocale(request);

  return json({ language: locale.language }, { headers: localeResponseHeaders(request, locale) });
}

export const meta: MetaFunction<typeof loader> = ({ data, matches }) => {
  const rootData = matches.find((match) => match.id === 'root')?.data as { language?: string } | undefined;
  const language = data?.language ?? rootData?.language;
  const seo = getMarketingExactAccountLanguagesCopy(language).exactAccountInactivity.seo;

  return buildPublicRouteMeta({ language, pathname: '/account-inactivity', seo });
};

export default function AccountInactivityRoute() {
  return <AccountInactivity />;
}
