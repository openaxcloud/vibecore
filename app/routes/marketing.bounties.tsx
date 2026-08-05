import type { LoaderFunctionArgs, MetaFunction } from 'react-router';
import MarketingBounties from '~/components/marketing/ecode-exact/pages/Bounties';
import { getMarketingExactPartnersBountiesCopy } from '~/lib/i18n/catalogs/marketing-exact-partners-bounties';
import { resolveRequestLocale } from '~/lib/i18n/request-locale';
import { socialMetaTags } from '~/utils/social-meta';

/*
 * Dedicated React route for /marketing/bounties — more specific than the
 * `marketing.$slug` catch-all (which serves the old purple static bundle), so
 * RR7 renders the on-theme (E-Code orange) React page here instead.
 */
export function loader({ request }: LoaderFunctionArgs) {
  return { language: resolveRequestLocale(request).language };
}

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  const seo = getMarketingExactPartnersBountiesCopy(data?.language).exactBounties.seo;

  return [{ title: seo.title }, { name: 'description', content: seo.description }, ...socialMetaTags(seo)];
};

export default function MarketingBountiesRoute() {
  return <MarketingBounties />;
}
