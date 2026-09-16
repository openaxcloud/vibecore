import { ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { LoaderFunctionArgs, MetaFunction } from 'react-router';
import { MarketingStaticPage, type MarketingPageDefinition } from '~/components/marketing/EcodeMarketingPages';
import { getMarketingExactAcceptableUseCopy } from '~/lib/i18n/catalogs/marketing-exact-acceptable-use';
import { resolveRequestLocale } from '~/lib/i18n/request-locale';
import { MARKETING_SITE_URL, socialMetaTags } from '~/utils/social-meta';

const ACCEPTABLE_USE_ROUTES = { primary: '/report-abuse', secondary: '/security' } as const;

export function loader({ request }: LoaderFunctionArgs) {
  return { language: resolveRequestLocale(request).language };
}

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  const language = data?.language === 'fr' ? 'fr' : 'en';
  const seo = getMarketingExactAcceptableUseCopy(language).exactAcceptableUse.seo;
  const canonical = `${MARKETING_SITE_URL}/acceptable-use`;

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

export default function AcceptableUsePage() {
  const { i18n } = useTranslation();
  const copy = getMarketingExactAcceptableUseCopy(i18n.resolvedLanguage ?? i18n.language).exactAcceptableUse.page;

  const page = {
    slug: 'acceptable-use',
    title: copy.title,
    eyebrow: copy.eyebrow,
    description: copy.description,
    kind: 'legal',
    icon: ShieldCheck,
    primaryAction: [copy.primaryAction, ACCEPTABLE_USE_ROUTES.primary] as const,
    secondaryAction: [copy.secondaryAction, ACCEPTABLE_USE_ROUTES.secondary] as const,
    highlights: copy.highlights,
    sections: copy.sections,
  } satisfies MarketingPageDefinition;

  return <MarketingStaticPage page={page} />;
}
