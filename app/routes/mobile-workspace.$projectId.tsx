import { MonitorSmartphone } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { data as json, type LoaderFunctionArgs, type MetaFunction } from 'react-router';
import { useParams } from 'react-router';
import { MarketingStaticPage, type MarketingPageDefinition } from '~/components/marketing/EcodeMarketingPages';
import {
  getCompatibilityRoutesCopy,
  resolveCompatibilityRouteLanguage,
} from '~/lib/i18n/catalogs/compatibility-routes';
import { localeResponseHeaders, resolveRequestLocale } from '~/lib/i18n/request-locale';
import { DEFAULT_OG_IMAGE } from '~/utils/social-meta';

export const MOBILE_WORKSPACE_CANONICAL_BASE_URL = 'https://e-code.ai/mobile-workspace';

type MobileWorkspaceLoaderData = Readonly<{ language: 'en' | 'fr' }>;

export function mobileWorkspaceCanonicalUrl(projectId: string): string {
  return `${MOBILE_WORKSPACE_CANONICAL_BASE_URL}/${encodeURIComponent(projectId)}`;
}

export function loader({ request }: LoaderFunctionArgs) {
  const localeResolution = resolveRequestLocale(request);
  const language = resolveCompatibilityRouteLanguage(localeResolution.language);

  return json<MobileWorkspaceLoaderData>(
    { language },
    { headers: localeResponseHeaders(request, { ...localeResolution, language }) },
  );
}

export const meta: MetaFunction<typeof loader> = ({ data, matches, params }) => {
  const rootData = matches.find((match) => match.id === 'root')?.data as { language?: string } | undefined;
  const language = resolveCompatibilityRouteLanguage(data?.language ?? rootData?.language);
  const copy = getCompatibilityRoutesCopy(language);
  const title = copy['mobileWorkspace.seo.title'];
  const description = copy['mobileWorkspace.seo.description'];
  const imageAlt = copy['mobileWorkspace.seo.imageAlt'];
  const canonicalUrl = mobileWorkspaceCanonicalUrl(params.projectId ?? 'project');

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

export function buildMobileWorkspacePage(projectId: string, language?: string | null): MarketingPageDefinition {
  const copy = getCompatibilityRoutesCopy(language);
  const projectPath = `/projects/${encodeURIComponent(projectId)}/ide?panel=agent`;

  return {
    slug: `mobile-workspace/${projectId}`,
    title: copy['mobileWorkspace.page.title'],
    eyebrow: copy['mobileWorkspace.page.eyebrow'],
    description: copy['mobileWorkspace.page.description'],
    kind: 'standard',
    icon: MonitorSmartphone,
    primaryAction: [copy['mobileWorkspace.page.primaryAction'], projectPath],
    secondaryAction: [copy['mobileWorkspace.page.secondaryAction'], '/mobile'],
    highlights: [
      copy['mobileWorkspace.highlight.phoneWorkflow'],
      copy['mobileWorkspace.highlight.projectContext'],
      copy['mobileWorkspace.highlight.agentPanel'],
      copy['mobileWorkspace.highlight.previewAccess'],
    ],
    sections: [
      {
        title: copy['mobileWorkspace.section.continue.title'],
        body: copy['mobileWorkspace.section.continue.body'],
        items: [
          copy['mobileWorkspace.section.continue.projectContext'],
          copy['mobileWorkspace.section.continue.mobileNavigation'],
          copy['mobileWorkspace.section.continue.agentWorkflow'],
          copy['mobileWorkspace.section.continue.previewAccess'],
        ],
      },
      {
        title: copy['mobileWorkspace.section.security.title'],
        body: copy['mobileWorkspace.section.security.body'],
        items: [
          copy['mobileWorkspace.section.security.authenticatedAccess'],
          copy['mobileWorkspace.section.security.projectPermissions'],
          copy['mobileWorkspace.section.security.workspaceControls'],
          copy['mobileWorkspace.section.security.teamGovernance'],
        ],
      },
    ],
  };
}

export default function MobileWorkspacePage() {
  const params = useParams();
  const { i18n } = useTranslation();
  const projectId = params.projectId ?? 'project';
  const language = i18n.resolvedLanguage ?? i18n.language;

  return <MarketingStaticPage page={buildMobileWorkspacePage(projectId, language)} />;
}
