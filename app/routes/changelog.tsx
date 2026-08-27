import type { LinksFunction, LoaderFunctionArgs, MetaFunction } from 'react-router';

import Changelog from '~/components/marketing/ecode-exact/pages/Changelog';
import { getMarketingExactChangelogCopy } from '~/lib/i18n/catalogs/marketing-exact-changelog';
import { resolveRequestLocale } from '~/lib/i18n/request-locale';
import { MARKETING_SITE_URL, socialMetaTags } from '~/utils/social-meta';

export function loader({ request }: LoaderFunctionArgs) {
  return { language: resolveRequestLocale(request).language };
}

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  const language = data?.language === 'fr' ? 'fr' : 'en';
  const seo = getMarketingExactChangelogCopy(language).exactChangelog.seo;
  const canonical = `${MARKETING_SITE_URL}/changelog`;

  const social = socialMetaTags(seo).map((tag) => {
    const identifier = 'property' in tag ? tag.property : 'name' in tag ? tag.name : undefined;

    return identifier === 'og:image:alt' || identifier === 'twitter:image:alt'
      ? { ...tag, content: seo.imageAlt }
      : tag;
  });

  return [
    { title: seo.title },
    { name: 'description', content: seo.description },
    ...social,
    { property: 'og:url', content: canonical },
    { property: 'og:locale', content: language === 'fr' ? 'fr_FR' : 'en_US' },
    { property: 'og:locale:alternate', content: language === 'fr' ? 'en_US' : 'fr_FR' },
    { tagName: 'link', rel: 'canonical', href: canonical },
    { tagName: 'link', rel: 'alternate', hrefLang: 'en', href: `${canonical}?lang=en` },
    { tagName: 'link', rel: 'alternate', hrefLang: 'fr', href: `${canonical}?lang=fr` },
    { tagName: 'link', rel: 'alternate', hrefLang: 'x-default', href: canonical },
  ];
};

export const links: LinksFunction = () => [{ rel: 'alternate', type: 'application/rss+xml', href: '/changelog.xml' }];

export default function ChangelogRoute() {
  return <Changelog />;
}
