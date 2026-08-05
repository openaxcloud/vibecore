import { MonitorPlay } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { data as json, type LoaderFunctionArgs, type MetaFunction } from 'react-router';
import { MarketingStaticPage, type MarketingPageDefinition } from '~/components/marketing/EcodeMarketingPages';
import { getIdeNewRouteCopy, resolveIdeNewRouteLanguage } from '~/lib/i18n/catalogs/ide-new-route';
import { localeResponseHeaders, resolveRequestLocale } from '~/lib/i18n/request-locale';
import { DEFAULT_OG_IMAGE } from '~/utils/social-meta';

const IDE_NEW_CANONICAL_URL = 'https://e-code.ai/ide/new';

type IdeNewLoaderData = Readonly<{ language: 'en' | 'fr' }>;

export function loader({ request }: LoaderFunctionArgs) {
  const localeResolution = resolveRequestLocale(request);
  const language = resolveIdeNewRouteLanguage(localeResolution.language);

  return json<IdeNewLoaderData>(
    { language },
    { headers: localeResponseHeaders(request, { ...localeResolution, language }) },
  );
}

export const meta: MetaFunction<typeof loader> = ({ data, matches }) => {
  const rootData = matches.find((match) => match.id === 'root')?.data as { language?: string } | undefined;
  const language = resolveIdeNewRouteLanguage(data?.language ?? rootData?.language);
  const copy = getIdeNewRouteCopy(language);
  const title = copy['ideNew.seo.title'];
  const description = copy['ideNew.seo.description'];
  const imageAlt = copy['ideNew.seo.imageAlt'];

  return [
    { title },
    { name: 'description', content: description },
    { property: 'og:title', content: title },
    { property: 'og:description', content: description },
    { property: 'og:type', content: 'website' },
    { property: 'og:url', content: IDE_NEW_CANONICAL_URL },
    { property: 'og:locale', content: language === 'fr' ? 'fr_FR' : 'en_US' },
    { property: 'og:locale:alternate', content: language === 'fr' ? 'en_US' : 'fr_FR' },
    { property: 'og:image', content: DEFAULT_OG_IMAGE },
    { property: 'og:image:alt', content: imageAlt },
    { name: 'twitter:card', content: 'summary_large_image' },
    { name: 'twitter:title', content: title },
    { name: 'twitter:description', content: description },
    { name: 'twitter:image', content: DEFAULT_OG_IMAGE },
    { name: 'twitter:image:alt', content: imageAlt },
    { tagName: 'link', rel: 'canonical', href: IDE_NEW_CANONICAL_URL },
    { tagName: 'link', rel: 'alternate', hrefLang: 'en', href: `${IDE_NEW_CANONICAL_URL}?lang=en` },
    { tagName: 'link', rel: 'alternate', hrefLang: 'fr', href: `${IDE_NEW_CANONICAL_URL}?lang=fr` },
    { tagName: 'link', rel: 'alternate', hrefLang: 'x-default', href: IDE_NEW_CANONICAL_URL },
  ];
};

export function buildIdeNewPage(language?: string | null): MarketingPageDefinition {
  const copy = getIdeNewRouteCopy(language);

  return {
    slug: 'ide/new',
    title: copy['ideNew.page.title'],
    eyebrow: copy['ideNew.page.eyebrow'],
    description: copy['ideNew.page.description'],
    kind: 'standard',
    icon: MonitorPlay,
    primaryAction: [copy['ideNew.page.primaryAction'], '/projects/new'],
    secondaryAction: [copy['ideNew.page.secondaryAction'], '/templates'],
    highlights: [
      copy['ideNew.highlight.projectCreation'],
      copy['ideNew.highlight.ide'],
      copy['ideNew.highlight.templates'],
      copy['ideNew.highlight.runtimeSetup'],
    ],
    sections: [
      {
        title: copy['ideNew.section.start.title'],
        body: copy['ideNew.section.start.body'],
        items: [
          copy['ideNew.section.start.prompt'],
          copy['ideNew.section.start.templates'],
          copy['ideNew.section.start.repository'],
          copy['ideNew.section.start.preview'],
        ],
      },
      {
        title: copy['ideNew.section.canonical.title'],
        body: copy['ideNew.section.canonical.body'],
        items: [
          copy['ideNew.section.canonical.route'],
          copy['ideNew.section.canonical.workspace'],
          copy['ideNew.section.canonical.quota'],
          copy['ideNew.section.canonical.persistence'],
        ],
      },
    ],
  };
}

export default function IdeNewPage() {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;

  return <MarketingStaticPage page={buildIdeNewPage(language)} />;
}
