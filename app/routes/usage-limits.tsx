import { Gauge } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { LoaderFunctionArgs, MetaFunction } from 'react-router';
import { MarketingStaticPage, type MarketingPageDefinition } from '~/components/marketing/EcodeMarketingPages';
import { getMarketingExactUsageLimitsCopy } from '~/lib/i18n/catalogs/marketing-exact-usage-limits';
import { resolveRequestLocale } from '~/lib/i18n/request-locale';
import { MARKETING_SITE_URL, socialMetaTags } from '~/utils/social-meta';

const USAGE_LIMITS_ROUTES = { primary: '/pricing', secondary: '/usage' } as const;

export function loader({ request }: LoaderFunctionArgs) {
  return { language: resolveRequestLocale(request).language };
}

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  const language = data?.language === 'fr' ? 'fr' : 'en';
  const seo = getMarketingExactUsageLimitsCopy(language).exactUsageLimits.seo;
  const canonical = `${MARKETING_SITE_URL}/usage-limits`;

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

/*
 * Public usage-quota policy, written from E-Code's real metering/quota model
 * (packages/billing, packages/quota, the /usage dashboard and quota-exceeded flow).
 * Distinct from the signed-in /usage dashboard, which shows a customer's own numbers.
 */
export default function UsageLimitsPage() {
  const { i18n } = useTranslation();
  const copy = getMarketingExactUsageLimitsCopy(i18n.resolvedLanguage ?? i18n.language).exactUsageLimits.page;

  const page = {
    slug: 'usage-limits',
    title: copy.title,
    eyebrow: copy.eyebrow,
    description: copy.description,
    kind: 'legal',
    icon: Gauge,
    primaryAction: [copy.primaryAction, USAGE_LIMITS_ROUTES.primary] as const,
    secondaryAction: [copy.secondaryAction, USAGE_LIMITS_ROUTES.secondary] as const,
    highlights: copy.highlights,
    sections: copy.sections,
  } satisfies MarketingPageDefinition;

  return <MarketingStaticPage page={page} />;
}
