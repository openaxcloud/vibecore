import type { MetaFunction } from 'react-router';
import DPA from './ecode-exact/pages/DPA';
import Legal from './ecode-exact/pages/Legal';
import Privacy from './ecode-exact/pages/Privacy';
import ReportAbuse from './ecode-exact/pages/ReportAbuse';
import Security from './ecode-exact/pages/Security';
import StudentDPA from './ecode-exact/pages/StudentDPA';
import Subprocessors from './ecode-exact/pages/Subprocessors';
import Terms from './ecode-exact/pages/Terms';
import { formatMarketingDocumentTitle } from '~/lib/i18n/catalogs/marketing';
import {
  getMarketingExactLegalBlogCopy,
  type ExactLegalPageCopy,
  type ExactLegalPageKey,
} from '~/lib/i18n/catalogs/marketing-exact-legal-blog';
import { socialMetaTags } from '~/utils/social-meta';

export type LegalPageKey = ExactLegalPageKey;

export type LegalPageDefinition = ExactLegalPageCopy & {
  route: string;
};

const LEGAL_ROUTES = {
  legal: '/legal',
  terms: '/terms',
  privacy: '/privacy',
  subprocessors: '/subprocessors',
  dpa: '/dpa',
  'student-dpa': '/student-dpa',
  security: '/security',
  'report-abuse': '/report-abuse',
} as const satisfies Record<LegalPageKey, string>;

export function getEcodeExactLegalPages(language?: string | null): Record<LegalPageKey, LegalPageDefinition> {
  const pages = getMarketingExactLegalBlogCopy(language).exactLegalRegistry.pages;

  return Object.fromEntries(
    (Object.keys(LEGAL_ROUTES) as LegalPageKey[]).map((key) => [key, { ...pages[key], route: LEGAL_ROUTES[key] }]),
  ) as Record<LegalPageKey, LegalPageDefinition>;
}

export const ecodeLegalPages = getEcodeExactLegalPages('en');

export function makeEcodeLegalMeta(key: LegalPageKey): MetaFunction {
  return ({ data, location, matches }) => {
    const routeLanguage = (data as { language?: string } | undefined)?.language;

    const rootLanguage = (matches?.find((match) => match.id === 'root')?.data as { language?: string } | undefined)
      ?.language;

    const page = getEcodeExactLegalPages(routeLanguage ?? rootLanguage)[key];
    const title = formatMarketingDocumentTitle(page.title);

    /*
     * BUG-MKT-003 : canonical dérivé de `location.pathname`, jamais d'un chemin
     * recopié — une table écrite à la main dérive au premier renommage de route.
     */
    const social = socialMetaTags({ title, description: page.description, path: location?.pathname }).map((tag) => {
      const identifier = 'property' in tag ? tag.property : 'name' in tag ? tag.name : undefined;

      return identifier === 'og:image:alt' || identifier === 'twitter:image:alt'
        ? { ...tag, content: page.imageAlt }
        : tag;
    });

    return [{ title }, { name: 'description', content: page.description }, ...social];
  };
}

export function EcodeLegalPage() {
  return <Legal />;
}

export function EcodeTermsPage() {
  return <Terms />;
}

export function EcodePrivacyPage() {
  return <Privacy />;
}

export function EcodeSubprocessorsPage() {
  return <Subprocessors />;
}

export function EcodeDpaPage() {
  return <DPA />;
}

export function EcodeStudentDpaPage() {
  return <StudentDPA />;
}

export function EcodeSecurityPage() {
  return <Security />;
}

export function EcodeReportAbusePage() {
  return <ReportAbuse />;
}
