import { MonitorPlay } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { data as json, type LoaderFunctionArgs, type MetaFunction } from 'react-router';
import { useParams } from 'react-router';
import { MarketingStaticPage, type MarketingPageDefinition } from '~/components/marketing/EcodeMarketingPages';
import {
  formatCompatibilityRouteCopy,
  getCompatibilityRoutesCopy,
  resolveCompatibilityRouteLanguage,
} from '~/lib/i18n/catalogs/compatibility-routes';
import { localeResponseHeaders, resolveRequestLocale } from '~/lib/i18n/request-locale';
import { DEFAULT_OG_IMAGE } from '~/utils/social-meta';

export const IDE_COMPATIBILITY_CANONICAL_BASE_URL = 'https://e-code.ai/ide';

type IdeCompatibilityLoaderData = Readonly<{ language: 'en' | 'fr' }>;

export function ideCompatibilityCanonicalUrl(projectId: string): string {
  return `${IDE_COMPATIBILITY_CANONICAL_BASE_URL}/${encodeURIComponent(projectId)}`;
}

export function loader({ request }: LoaderFunctionArgs) {
  const localeResolution = resolveRequestLocale(request);
  const language = resolveCompatibilityRouteLanguage(localeResolution.language);

  return json<IdeCompatibilityLoaderData>(
    { language },
    { headers: localeResponseHeaders(request, { ...localeResolution, language }) },
  );
}

export const meta: MetaFunction<typeof loader> = ({ data, matches, params }) => {
  const rootData = matches.find((match) => match.id === 'root')?.data as { language?: string } | undefined;
  const language = resolveCompatibilityRouteLanguage(data?.language ?? rootData?.language);
  const copy = getCompatibilityRoutesCopy(language);
  const projectId = params.id ?? 'project';
  const values = { projectId };
  const title = formatCompatibilityRouteCopy(copy['ideCompatibility.seo.title'], values);
  const description = formatCompatibilityRouteCopy(copy['ideCompatibility.seo.description'], values);
  const imageAlt = formatCompatibilityRouteCopy(copy['ideCompatibility.seo.imageAlt'], values);
  const canonicalUrl = ideCompatibilityCanonicalUrl(projectId);

  return [
    { title },
    { name: 'description', content: description },
    { property: 'og:title', content: title },
    { property: 'og:description', content: description },
    { property: 'og:type', content: 'website' },
    { property: 'og:url', content: canonicalUrl },
    { property: 'og:locale', content: language === 'fr' ? 'fr_FR' : 'en_US' },
    { property: 'og:locale:alternate', content: language === 'fr' ? 'en_US' : 'fr_FR' },
    { property: 'og:image', content: DEFAULT_OG_IMAGE },
    { property: 'og:image:alt', content: imageAlt },
    { name: 'twitter:card', content: 'summary_large_image' },
    { name: 'twitter:title', content: title },
    { name: 'twitter:description', content: description },
    { name: 'twitter:image', content: DEFAULT_OG_IMAGE },
    { name: 'twitter:image:alt', content: imageAlt },
    { tagName: 'link', rel: 'canonical', href: canonicalUrl },
    { tagName: 'link', rel: 'alternate', hrefLang: 'en', href: `${canonicalUrl}?lang=en` },
    { tagName: 'link', rel: 'alternate', hrefLang: 'fr', href: `${canonicalUrl}?lang=fr` },
    { tagName: 'link', rel: 'alternate', hrefLang: 'x-default', href: canonicalUrl },
  ];
};

export function buildIdeProjectCompatibilityPage(projectId: string, language?: string | null): MarketingPageDefinition {
  const copy = getCompatibilityRoutesCopy(language);
  const values = { projectId };
  const canonicalProjectPath = `/projects/${encodeURIComponent(projectId)}/ide`;

  return {
    slug: `ide/${projectId}`,
    title: formatCompatibilityRouteCopy(copy['ideCompatibility.page.title'], values),
    eyebrow: copy['ideCompatibility.page.eyebrow'],
    description: copy['ideCompatibility.page.description'],
    kind: 'standard',
    icon: MonitorPlay,
    primaryAction: [copy['ideCompatibility.page.primaryAction'], canonicalProjectPath],
    secondaryAction: [copy['ideCompatibility.page.secondaryAction'], '/projects'],
    highlights: [
      copy['ideCompatibility.highlight.canonicalRoute'],
      copy['ideCompatibility.highlight.idePreserved'],
      copy['ideCompatibility.highlight.runtimePanels'],
      copy['ideCompatibility.highlight.teamControls'],
    ],
    sections: [
      {
        title: copy['ideCompatibility.section.behavior.title'],
        body: copy['ideCompatibility.section.behavior.body'],
        items: [
          canonicalProjectPath,
          copy['ideCompatibility.section.behavior.projectLoader'],
          copy['ideCompatibility.section.behavior.authenticatedAccess'],
          copy['ideCompatibility.section.behavior.runtimeState'],
        ],
      },
      {
        title: copy['ideCompatibility.section.boundary.title'],
        body: copy['ideCompatibility.section.boundary.body'],
        items: [
          copy['ideCompatibility.section.boundary.noDuplicate'],
          copy['ideCompatibility.section.boundary.sharedModel'],
          copy['ideCompatibility.section.boundary.existingPanels'],
          copy['ideCompatibility.section.boundary.deploymentControls'],
        ],
      },
    ],
  };
}

export default function IdeProjectCompatibilityPage() {
  const params = useParams();
  const { i18n } = useTranslation();
  const projectId = params.id ?? 'project';
  const language = i18n.resolvedLanguage ?? i18n.language;

  return <MarketingStaticPage page={buildIdeProjectCompatibilityPage(projectId, language)} />;
}
