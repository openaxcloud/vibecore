import type { LoaderFunctionArgs, MetaFunction } from 'react-router';
import Partners from '~/components/marketing/ecode-exact/pages/Partners';
import { getMarketingExactPartnersBountiesCopy } from '~/lib/i18n/catalogs/marketing-exact-partners-bounties';
import { resolveRequestLocale } from '~/lib/i18n/request-locale';
import { socialMetaTags } from '~/utils/social-meta';

export function loader({ request }: LoaderFunctionArgs) {
  return { language: resolveRequestLocale(request).language };
}

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  const seo = getMarketingExactPartnersBountiesCopy(data?.language).exactPartners.seo;

  return [{ title: seo.title }, { name: 'description', content: seo.description }, ...socialMetaTags(seo)];
};

export default function PartnersRoute() {
  return <Partners />;
}
