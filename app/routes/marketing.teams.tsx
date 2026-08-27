import type { LoaderFunctionArgs, MetaFunction } from 'react-router';
import PublicTeamPage from '~/components/marketing/ecode-exact/pages/PublicTeamPage';
import { getMarketingExactAgreementTeamCopy } from '~/lib/i18n/catalogs/marketing-exact-agreement-team';
import { resolveRequestLocale } from '~/lib/i18n/request-locale';
import { socialMetaTags } from '~/utils/social-meta';

/*
 * Dedicated React route for /marketing/teams — more specific than the
 * `marketing.$slug` catch-all (which serves the old blue/purple static bundle),
 * so RR7 renders the on-theme (E-Code orange) React page here instead.
 */
export function loader({ request }: LoaderFunctionArgs) {
  return { language: resolveRequestLocale(request).language };
}

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  const seo = getMarketingExactAgreementTeamCopy(data?.language).exactTeam.seo;

  const social = socialMetaTags(seo).map((tag) => {
    const identifier = 'property' in tag ? tag.property : 'name' in tag ? tag.name : undefined;

    return identifier === 'og:image:alt' || identifier === 'twitter:image:alt'
      ? { ...tag, content: seo.imageAlt }
      : tag;
  });

  return [{ title: seo.title }, { name: 'description', content: seo.description }, ...social];
};

export default function MarketingTeamsRoute() {
  return <PublicTeamPage />;
}
