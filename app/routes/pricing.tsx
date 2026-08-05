import { data as json, type LoaderFunctionArgs, type MetaFunction } from 'react-router';

import { EcodePricingPage } from '~/components/marketing/EcodeProductMarketingPages';
import { buildMarketingPricingMeta } from '~/lib/i18n/catalogs/marketing-pricing-route';
import { localeResponseHeaders, resolveRequestLocale } from '~/lib/i18n/request-locale';

/*
 * Replit-parity pricing is rendered in-repo via the main Remix app (SSR) rather
 * than the prebuilt external marketing bundle, so the page is live, the
 * monthly/annual toggle is functional, and the plans stay in sync with the
 * backend credit plan catalog. See docs/REPLIT_PARITY_SPEC.md §10/§16.
 */
export function loader({ request }: LoaderFunctionArgs) {
  const locale = resolveRequestLocale(request);

  return json({ language: locale.language }, { headers: localeResponseHeaders(request, locale) });
}

export const meta: MetaFunction<typeof loader> = ({ data, matches }) => {
  const rootData = matches.find((match) => match.id === 'root')?.data as { language?: string } | undefined;

  return buildMarketingPricingMeta(data?.language ?? rootData?.language);
};

export default function PricingRoute() {
  return <EcodePricingPage />;
}
