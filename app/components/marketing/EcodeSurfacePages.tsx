import {
  Activity,
  ArrowRight,
  Boxes,
  Braces,
  CheckCircle2,
  Command,
  FileArchive,
  FileCode2,
  Gauge,
  GitBranch,
  Globe2,
  KeyRound,
  Layers,
  LifeBuoy,
  Lock,
  MonitorPlay,
  MonitorSmartphone,
  Plus,
  Rocket,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Terminal,
  Upload,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { MetaFunction } from 'react-router';
import { Link, useParams } from 'react-router';
import { PublicShell } from '~/components/dashboard/SaaSLayout';
import {
  getMarketingSurfaceCopy,
  marketingSurfaceCategoryEn,
  type MarketingSurfaceCategory,
} from '~/lib/i18n/catalogs/marketing-surface';
import {
  getMarketingImportSourceLabel,
  getMarketingSurfaceDynamicPageCopy,
  type MarketingSurfaceDynamicDescriptor,
} from '~/lib/i18n/catalogs/marketing-surface-dynamic';
import {
  getMarketingSurfacePageCopy,
  marketingSurfacePageEnglish as marketingSurfacePageEn,
} from '~/lib/i18n/catalogs/marketing-surface-pages';
import { normalizeSupportedLanguage } from '~/lib/i18n/language';

const englishSurfaceUi = getMarketingSurfaceCopy('en').ui;

type SurfaceCategory = MarketingSurfaceCategory;

type SurfaceAction = readonly [label: string, to: string];

interface SurfaceSection {
  title: string;
  body: string;
  items: readonly string[];
}

interface SurfaceStat {
  label: string;
  value: string;
}

interface SurfaceRelatedRoute {
  label: string;
  to: string;
  description: string;
}

export interface EcodeSurfacePageDefinition {
  slug: string;
  route: `/${string}`;
  title: string;
  eyebrow: string;
  description: string;
  category: SurfaceCategory;
  icon: LucideIcon;
  primaryAction: SurfaceAction;
  secondaryAction: SurfaceAction;
  highlights: readonly string[];
  stats: readonly SurfaceStat[];
  sections: readonly SurfaceSection[];
  relatedRoutes: readonly SurfaceRelatedRoute[];
  dynamicCopy?: MarketingSurfaceDynamicDescriptor;
}

interface SurfacePageInput {
  slug: string;
  route?: `/${string}`;
  title: string;
  description: string;
  category: SurfaceCategory;
  icon: LucideIcon;
  highlights: readonly string[];
  primaryAction?: SurfaceAction;
  secondaryAction?: SurfaceAction;
  sections?: readonly SurfaceSection[];
  relatedRoutes?: readonly SurfaceRelatedRoute[];
  dynamicCopy?: MarketingSurfaceDynamicDescriptor;
}

function makeSurfacePage(input: SurfacePageInput): EcodeSurfacePageDefinition {
  const category = marketingSurfaceCategoryEn.surfaceCategories[input.category];

  return {
    slug: input.slug,
    route: input.route ?? `/${input.slug}`,
    title: input.title,
    eyebrow: category.eyebrow,
    description: input.description,
    category: input.category,
    icon: input.icon,
    primaryAction: input.primaryAction ?? category.primaryAction,
    secondaryAction: input.secondaryAction ?? category.secondaryAction,
    highlights: input.highlights,
    stats: category.stats,
    sections: input.sections ?? [
      {
        title: englishSurfaceUi.workflowTitle(input.title),
        body: englishSurfaceUi.workflowBody(input.title),
        items: input.highlights,
      },
      {
        title: englishSurfaceUi.productionControls,
        body: englishSurfaceUi.productionBody,
        items: category.controls,
      },
    ],
    relatedRoutes: input.relatedRoutes ?? category.relatedRoutes,
    dynamicCopy: input.dynamicCopy,
  };
}

function makeDynamicSurfacePage(
  input: Omit<SurfacePageInput, 'title' | 'description' | 'highlights' | 'relatedRoutes'> & {
    dynamicCopy: MarketingSurfaceDynamicDescriptor;
  },
): EcodeSurfacePageDefinition {
  const copy = getMarketingSurfaceDynamicPageCopy('en', input.dynamicCopy);

  return makeSurfacePage({ ...input, ...copy });
}

export const ecodeSurfacePages = {
  new: makeSurfacePage({
    slug: 'new',
    title: marketingSurfacePageEn.new.title,
    description: marketingSurfacePageEn.new.description,
    category: 'builder',
    icon: Plus,
    highlights: marketingSurfacePageEn.new.highlights,
  }),
  home: makeSurfacePage({
    slug: 'home',
    title: marketingSurfacePageEn.home.title,
    description: marketingSurfacePageEn.home.description,
    category: 'builder',
    icon: Gauge,
    highlights: marketingSurfacePageEn.home.highlights,
  }),
  'agent-activity': makeSurfacePage({
    slug: 'agent-activity',
    title: marketingSurfacePageEn['agent-activity'].title,
    description: marketingSurfacePageEn['agent-activity'].description,
    category: 'ai',
    icon: Activity,
    highlights: marketingSurfacePageEn['agent-activity'].highlights,
  }),
  apps: makeSurfacePage({
    slug: 'apps',
    title: marketingSurfacePageEn.apps.title,
    description: marketingSurfacePageEn.apps.description,
    category: 'marketplace',
    icon: Boxes,
    highlights: marketingSurfacePageEn.apps.highlights,
  }),
  teams: makeSurfacePage({
    slug: 'teams',
    title: marketingSurfacePageEn.teams.title,
    description: marketingSurfacePageEn.teams.description,
    category: 'team',
    icon: Users,
    highlights: marketingSurfacePageEn.teams.highlights,
  }),
  vnc: makeSurfacePage({
    slug: 'vnc',
    title: marketingSurfacePageEn.vnc.title,
    description: marketingSurfacePageEn.vnc.description,
    category: 'runtime',
    icon: MonitorPlay,
    highlights: marketingSurfacePageEn.vnc.highlights,
  }),
  analytics: makeSurfacePage({
    slug: 'analytics',
    title: marketingSurfacePageEn.analytics.title,
    description: marketingSurfacePageEn.analytics.description,
    category: 'admin',
    icon: Gauge,
    highlights: marketingSurfacePageEn.analytics.highlights,
  }),
  scalability: makeSurfacePage({
    slug: 'scalability',
    title: marketingSurfacePageEn.scalability.title,
    description: marketingSurfacePageEn.scalability.description,
    category: 'admin',
    icon: Rocket,
    highlights: marketingSurfacePageEn.scalability.highlights,
  }),
  education: makeSurfacePage({
    slug: 'education',
    title: marketingSurfacePageEn.education.title,
    description: marketingSurfacePageEn.education.description,
    category: 'learning',
    icon: Users,
    highlights: marketingSurfacePageEn.education.highlights,
  }),
  'api-sdk': makeSurfacePage({
    slug: 'api-sdk',
    title: marketingSurfacePageEn['api-sdk'].title,
    description: marketingSurfacePageEn['api-sdk'].description,
    category: 'integration',
    icon: Braces,
    highlights: marketingSurfacePageEn['api-sdk'].highlights,
  }),
  'mobile-apps': makeSurfacePage({
    slug: 'mobile-apps',
    title: marketingSurfacePageEn['mobile-apps'].title,
    description: marketingSurfacePageEn['mobile-apps'].description,
    category: 'builder',
    icon: MonitorSmartphone,
    highlights: marketingSurfacePageEn['mobile-apps'].highlights,
  }),
  profile: makeSurfacePage({
    slug: 'profile',
    title: marketingSurfacePageEn.profile.title,
    description: marketingSurfacePageEn.profile.description,
    category: 'team',
    icon: Users,
    highlights: marketingSurfacePageEn.profile.highlights,
  }),
  runtimes: makeSurfacePage({
    slug: 'runtimes',
    title: marketingSurfacePageEn.runtimes.title,
    description: marketingSurfacePageEn.runtimes.description,
    category: 'runtime',
    icon: Rocket,
    highlights: marketingSurfacePageEn.runtimes.highlights,
  }),
  'runtime-diagnostics': makeSurfacePage({
    slug: 'runtime-diagnostics',
    title: marketingSurfacePageEn['runtime-diagnostics'].title,
    description: marketingSurfacePageEn['runtime-diagnostics'].description,
    category: 'runtime',
    icon: Activity,
    highlights: marketingSurfacePageEn['runtime-diagnostics'].highlights,
  }),
  'search-advanced': makeSurfacePage({
    slug: 'search-advanced',
    title: marketingSurfacePageEn['search-advanced'].title,
    description: marketingSurfacePageEn['search-advanced'].description,
    category: 'builder',
    icon: Search,
    highlights: marketingSurfacePageEn['search-advanced'].highlights,
  }),
  secrets: makeSurfacePage({
    slug: 'secrets',
    title: marketingSurfacePageEn.secrets.title,
    description: marketingSurfacePageEn.secrets.description,
    category: 'security',
    icon: Lock,
    highlights: marketingSurfacePageEn.secrets.highlights,
  }),
  workflows: makeSurfacePage({
    slug: 'workflows',
    title: marketingSurfacePageEn.workflows.title,
    description: marketingSurfacePageEn.workflows.description,
    category: 'builder',
    icon: GitBranch,
    highlights: marketingSurfacePageEn.workflows.highlights,
  }),
  ssh: makeSurfacePage({
    slug: 'ssh',
    title: marketingSurfacePageEn.ssh.title,
    description: marketingSurfacePageEn.ssh.description,
    category: 'security',
    icon: Terminal,
    highlights: marketingSurfacePageEn.ssh.highlights,
  }),
  'security-scanner': makeSurfacePage({
    slug: 'security-scanner',
    title: marketingSurfacePageEn['security-scanner'].title,
    description: marketingSurfacePageEn['security-scanner'].description,
    category: 'security',
    icon: ShieldCheck,
    highlights: marketingSurfacePageEn['security-scanner'].highlights,
  }),
  dependencies: makeSurfacePage({
    slug: 'dependencies',
    title: marketingSurfacePageEn.dependencies.title,
    description: marketingSurfacePageEn.dependencies.description,
    category: 'runtime',
    icon: FileArchive,
    highlights: marketingSurfacePageEn.dependencies.highlights,
  }),
  'object-storage': makeSurfacePage({
    slug: 'object-storage',
    title: marketingSurfacePageEn['object-storage'].title,
    description: marketingSurfacePageEn['object-storage'].description,
    category: 'data',
    icon: FileArchive,
    highlights: marketingSurfacePageEn['object-storage'].highlights,
  }),
  'usage-alerts': makeSurfacePage({
    slug: 'usage-alerts',
    title: marketingSurfacePageEn['usage-alerts'].title,
    description: marketingSurfacePageEn['usage-alerts'].description,
    category: 'admin',
    icon: Activity,
    highlights: marketingSurfacePageEn['usage-alerts'].highlights,
  }),
  'mobile-admin': makeSurfacePage({
    slug: 'mobile-admin',
    title: marketingSurfacePageEn['mobile-admin'].title,
    description: marketingSurfacePageEn['mobile-admin'].description,
    category: 'admin',
    icon: MonitorSmartphone,
    highlights: marketingSurfacePageEn['mobile-admin'].highlights,
  }),
  account: makeSurfacePage({
    slug: 'account',
    title: marketingSurfacePageEn.account.title,
    description: marketingSurfacePageEn.account.description,
    category: 'admin',
    icon: Settings,
    highlights: marketingSurfacePageEn.account.highlights,
  }),
  cycles: makeSurfacePage({
    slug: 'cycles',
    title: marketingSurfacePageEn.cycles.title,
    description: marketingSurfacePageEn.cycles.description,
    category: 'team',
    icon: Activity,
    highlights: marketingSurfacePageEn.cycles.highlights,
  }),
  powerups: makeSurfacePage({
    slug: 'powerups',
    title: marketingSurfacePageEn.powerups.title,
    description: marketingSurfacePageEn.powerups.description,
    category: 'marketplace',
    icon: Sparkles,
    highlights: marketingSurfacePageEn.powerups.highlights,
  }),
  badges: makeSurfacePage({
    slug: 'badges',
    title: marketingSurfacePageEn.badges.title,
    description: marketingSurfacePageEn.badges.description,
    category: 'marketplace',
    icon: ShieldCheck,
    highlights: marketingSurfacePageEn.badges.highlights,
  }),
  subscribe: makeSurfacePage({
    slug: 'subscribe',
    title: marketingSurfacePageEn.subscribe.title,
    description: marketingSurfacePageEn.subscribe.description,
    category: 'admin',
    icon: CheckCircle2,
    highlights: marketingSurfacePageEn.subscribe.highlights,
  }),
  plans: makeSurfacePage({
    slug: 'plans',
    title: marketingSurfacePageEn.plans.title,
    description: marketingSurfacePageEn.plans.description,
    category: 'admin',
    icon: Gauge,
    highlights: marketingSurfacePageEn.plans.highlights,
    secondaryAction: [marketingSurfacePageEn.plans.secondaryActionLabel, '/pricing'],
  }),
  learn: makeSurfacePage({
    slug: 'learn',
    title: marketingSurfacePageEn.learn.title,
    description: marketingSurfacePageEn.learn.description,
    category: 'learning',
    icon: LifeBuoy,
    highlights: marketingSurfacePageEn.learn.highlights,
  }),
  themes: makeSurfacePage({
    slug: 'themes',
    title: marketingSurfacePageEn.themes.title,
    description: marketingSurfacePageEn.themes.description,
    category: 'builder',
    icon: Command,
    highlights: marketingSurfacePageEn.themes.highlights,
  }),
  performance: makeSurfacePage({
    slug: 'performance',
    title: marketingSurfacePageEn.performance.title,
    description: marketingSurfacePageEn.performance.description,
    category: 'runtime',
    icon: Gauge,
    highlights: marketingSurfacePageEn.performance.highlights,
  }),
  'sso-configuration': makeSurfacePage({
    slug: 'sso-configuration',
    title: marketingSurfacePageEn['sso-configuration'].title,
    description: marketingSurfacePageEn['sso-configuration'].description,
    category: 'security',
    icon: KeyRound,
    highlights: marketingSurfacePageEn['sso-configuration'].highlights,
  }),
  'custom-roles': makeSurfacePage({
    slug: 'custom-roles',
    title: marketingSurfacePageEn['custom-roles'].title,
    description: marketingSurfacePageEn['custom-roles'].description,
    category: 'security',
    icon: Users,
    highlights: marketingSurfacePageEn['custom-roles'].highlights,
  }),
  assistant: makeSurfacePage({
    slug: 'assistant',
    title: marketingSurfacePageEn.assistant.title,
    description: marketingSurfacePageEn.assistant.description,
    category: 'ai',
    icon: Sparkles,
    highlights: marketingSurfacePageEn.assistant.highlights,
  }),
  'code-search': makeSurfacePage({
    slug: 'code-search',
    title: marketingSurfacePageEn['code-search'].title,
    description: marketingSurfacePageEn['code-search'].description,
    category: 'builder',
    icon: FileCode2,
    highlights: marketingSurfacePageEn['code-search'].highlights,
  }),
  problems: makeSurfacePage({
    slug: 'problems',
    title: marketingSurfacePageEn.problems.title,
    description: marketingSurfacePageEn.problems.description,
    category: 'runtime',
    icon: LifeBuoy,
    highlights: marketingSurfacePageEn.problems.highlights,
  }),
  database: makeSurfacePage({
    slug: 'database',
    title: marketingSurfacePageEn.database.title,
    description: marketingSurfacePageEn.database.description,
    category: 'data',
    icon: Braces,
    highlights: marketingSurfacePageEn.database.highlights,
  }),
  console: makeSurfacePage({
    slug: 'console',
    title: marketingSurfacePageEn.console.title,
    description: marketingSurfacePageEn.console.description,
    category: 'runtime',
    icon: Command,
    highlights: marketingSurfacePageEn.console.highlights,
  }),
  shell: makeSurfacePage({
    slug: 'shell',
    title: marketingSurfacePageEn.shell.title,
    description: marketingSurfacePageEn.shell.description,
    category: 'runtime',
    icon: Terminal,
    highlights: marketingSurfacePageEn.shell.highlights,
  }),
  packages: makeSurfacePage({
    slug: 'packages',
    title: marketingSurfacePageEn.packages.title,
    description: marketingSurfacePageEn.packages.description,
    category: 'runtime',
    icon: FileArchive,
    highlights: marketingSurfacePageEn.packages.highlights,
  }),
  'kv-store': makeSurfacePage({
    slug: 'kv-store',
    title: marketingSurfacePageEn['kv-store'].title,
    description: marketingSurfacePageEn['kv-store'].description,
    category: 'data',
    icon: Layers,
    highlights: marketingSurfacePageEn['kv-store'].highlights,
  }),
  preview: makeSurfacePage({
    slug: 'preview',
    title: marketingSurfacePageEn.preview.title,
    description: marketingSurfacePageEn.preview.description,
    category: 'runtime',
    icon: MonitorPlay,
    highlights: marketingSurfacePageEn.preview.highlights,
  }),
  authentication: makeSurfacePage({
    slug: 'authentication',
    title: marketingSurfacePageEn.authentication.title,
    description: marketingSurfacePageEn.authentication.description,
    category: 'security',
    icon: KeyRound,
    highlights: marketingSurfacePageEn.authentication.highlights,
  }),
  extensions: makeSurfacePage({
    slug: 'extensions',
    title: marketingSurfacePageEn.extensions.title,
    description: marketingSurfacePageEn.extensions.description,
    category: 'integration',
    icon: Layers,
    highlights: marketingSurfacePageEn.extensions.highlights,
  }),
  integrations: makeSurfacePage({
    slug: 'integrations',
    title: marketingSurfacePageEn.integrations.title,
    description: marketingSurfacePageEn.integrations.description,
    category: 'integration',
    icon: Globe2,
    highlights: marketingSurfacePageEn.integrations.highlights,
  }),
  networking: makeSurfacePage({
    slug: 'networking',
    title: marketingSurfacePageEn.networking.title,
    description: marketingSurfacePageEn.networking.description,
    category: 'runtime',
    icon: Globe2,
    highlights: marketingSurfacePageEn.networking.highlights,
  }),
  threads: makeSurfacePage({
    slug: 'threads',
    title: marketingSurfacePageEn.threads.title,
    description: marketingSurfacePageEn.threads.description,
    category: 'team',
    icon: Users,
    highlights: marketingSurfacePageEn.threads.highlights,
  }),
  referrals: makeSurfacePage({
    slug: 'referrals',
    title: marketingSurfacePageEn.referrals.title,
    description: marketingSurfacePageEn.referrals.description,
    category: 'marketplace',
    icon: Users,
    highlights: marketingSurfacePageEn.referrals.highlights,
  }),
  'solartech-ai-chat': makeSurfacePage({
    slug: 'solartech-ai-chat',
    title: marketingSurfacePageEn['solartech-ai-chat'].title,
    description: marketingSurfacePageEn['solartech-ai-chat'].description,
    category: 'ai',
    icon: Sparkles,
    highlights: marketingSurfacePageEn['solartech-ai-chat'].highlights,
  }),
  'solartech-crm': makeSurfacePage({
    slug: 'solartech-crm',
    title: marketingSurfacePageEn['solartech-crm'].title,
    description: marketingSurfacePageEn['solartech-crm'].description,
    category: 'marketplace',
    icon: Boxes,
    highlights: marketingSurfacePageEn['solartech-crm'].highlights,
  }),
  'salesforcepro-crm': makeSurfacePage({
    slug: 'salesforcepro-crm',
    title: marketingSurfacePageEn['salesforcepro-crm'].title,
    description: marketingSurfacePageEn['salesforcepro-crm'].description,
    category: 'marketplace',
    icon: Users,
    highlights: marketingSurfacePageEn['salesforcepro-crm'].highlights,
  }),
  'solartech-fortune500-store': makeSurfacePage({
    slug: 'solartech-fortune500-store',
    title: marketingSurfacePageEn['solartech-fortune500-store'].title,
    description: marketingSurfacePageEn['solartech-fortune500-store'].description,
    category: 'marketplace',
    icon: Boxes,
    highlights: marketingSurfacePageEn['solartech-fortune500-store'].highlights,
  }),
} as const satisfies Record<string, EcodeSurfacePageDefinition>;

export const ecodeAdvancedSurfacePages = {
  mobile: makeSurfacePage({
    slug: 'advanced/mobile',
    route: '/advanced/mobile',
    title: marketingSurfacePageEn['advanced/mobile'].title,
    description: marketingSurfacePageEn['advanced/mobile'].description,
    category: 'builder',
    icon: MonitorSmartphone,
    highlights: marketingSurfacePageEn['advanced/mobile'].highlights,
  }),
  sso: makeSurfacePage({
    slug: 'advanced/sso',
    route: '/advanced/sso',
    title: marketingSurfacePageEn['advanced/sso'].title,
    description: marketingSurfacePageEn['advanced/sso'].description,
    category: 'security',
    icon: KeyRound,
    highlights: marketingSurfacePageEn['advanced/sso'].highlights,
  }),
  collaboration: makeSurfacePage({
    slug: 'advanced/collaboration',
    route: '/advanced/collaboration',
    title: marketingSurfacePageEn['advanced/collaboration'].title,
    description: marketingSurfacePageEn['advanced/collaboration'].description,
    category: 'team',
    icon: Users,
    highlights: marketingSurfacePageEn['advanced/collaboration'].highlights,
  }),
  storage: makeSurfacePage({
    slug: 'advanced/storage',
    route: '/advanced/storage',
    title: marketingSurfacePageEn['advanced/storage'].title,
    description: marketingSurfacePageEn['advanced/storage'].description,
    category: 'data',
    icon: FileArchive,
    highlights: marketingSurfacePageEn['advanced/storage'].highlights,
  }),
  community: makeSurfacePage({
    slug: 'advanced/community',
    route: '/advanced/community',
    title: marketingSurfacePageEn['advanced/community'].title,
    description: marketingSurfacePageEn['advanced/community'].description,
    category: 'marketplace',
    icon: Users,
    highlights: marketingSurfacePageEn['advanced/community'].highlights,
  }),
} as const satisfies Record<string, EcodeSurfacePageDefinition>;

export const ecodeStandaloneSurfacePages = {
  'ai-agent/studio': makeSurfacePage({
    slug: 'ai-agent/studio',
    route: '/ai-agent/studio',
    title: marketingSurfacePageEn['ai-agent/studio'].title,
    description: marketingSurfacePageEn['ai-agent/studio'].description,
    category: 'ai',
    icon: Sparkles,
    highlights: marketingSurfacePageEn['ai-agent/studio'].highlights,
  }),

  /*
   * I28: `github-import` was a standalone brochure surface duplicating the real
   * `/import-github` flow. The `/github-import` route is now a 301 redirect to
   * `/import-github` (see app/routes/github-import.tsx), so it is intentionally
   * absent from this catalog — no surface page, no `ecodeCompatibilityRoutePatterns`
   * entry, and `getEcodeStandaloneSurfacePage('github-import')` resolves undefined.
   */
  'editor/new': makeSurfacePage({
    slug: 'editor/new',
    route: '/editor/new',
    title: marketingSurfacePageEn['editor/new'].title,
    description: marketingSurfacePageEn['editor/new'].description,
    category: 'builder',
    icon: FileCode2,
    highlights: marketingSurfacePageEn['editor/new'].highlights,
  }),
  'teams/new': makeSurfacePage({
    slug: 'teams/new',
    route: '/teams/new',
    title: marketingSurfacePageEn['teams/new'].title,
    description: marketingSurfacePageEn['teams/new'].description,
    category: 'team',
    icon: Plus,
    highlights: marketingSurfacePageEn['teams/new'].highlights,
  }),
  'user/settings': makeSurfacePage({
    slug: 'user/settings',
    route: '/user/settings',
    title: marketingSurfacePageEn['user/settings'].title,
    description: marketingSurfacePageEn['user/settings'].description,
    category: 'admin',
    icon: Settings,
    highlights: marketingSurfacePageEn['user/settings'].highlights,
  }),
} as const satisfies Record<string, EcodeSurfacePageDefinition>;

export const ecodeCompatibilityRoutePatterns = [
  ...Object.values(ecodeSurfacePages).map((page) => page.route),
  ...Object.values(ecodeAdvancedSurfacePages).map((page) => page.route),
  ...Object.values(ecodeStandaloneSurfacePages).map((page) => page.route),
  '/projects/:id/import/figma',
  '/projects/:id/import/bolt',
  '/projects/:id/import/lovable',
  '/projects/:id/database',
  '/projects/:id/preview',
  '/project/:id',
  '/editor/:id',
  '/teams/:id',
  '/teams/:id/settings',
  '/profile/:username',
  '/user/:username',
] as const satisfies readonly `/${string}`[];

export function getEcodeSurfacePage(slug: string): EcodeSurfacePageDefinition | undefined {
  return (ecodeSurfacePages as Record<string, EcodeSurfacePageDefinition>)[slug];
}

export function getEcodeAdvancedSurfacePage(section: string): EcodeSurfacePageDefinition | undefined {
  return (ecodeAdvancedSurfacePages as Record<string, EcodeSurfacePageDefinition>)[section];
}

export function getEcodeStandaloneSurfacePage(slug: string): EcodeSurfacePageDefinition | undefined {
  return (ecodeStandaloneSurfacePages as Record<string, EcodeSurfacePageDefinition>)[slug];
}

export function makeEcodeSurfaceMetaTags(page: EcodeSurfacePageDefinition, language?: string | null) {
  const dynamicPageCopy = page.dynamicCopy ? getMarketingSurfaceDynamicPageCopy(language, page.dynamicCopy) : undefined;
  const staticPageCopy = page.dynamicCopy ? undefined : getMarketingSurfacePageCopy(language, page.slug);
  const localizedTitle = dynamicPageCopy?.title ?? staticPageCopy?.title ?? page.title;
  const description = dynamicPageCopy?.description ?? staticPageCopy?.description ?? page.description;
  const title = `${localizedTitle} - E-Code`;
  const canonical = `https://e-code.ai${page.route}`;
  const french = normalizeSupportedLanguage(language) === 'fr';

  return [
    { title },
    { name: 'description', content: description },
    { property: 'og:title', content: title },
    { property: 'og:description', content: description },
    { property: 'og:type', content: 'website' },
    { property: 'og:url', content: canonical },
    { property: 'og:locale', content: french ? 'fr_FR' : 'en_US' },
    { property: 'og:locale:alternate', content: french ? 'en_US' : 'fr_FR' },
    { name: 'twitter:title', content: title },
    { name: 'twitter:description', content: description },
    { tagName: 'link', rel: 'canonical', href: canonical },
    { tagName: 'link', rel: 'alternate', hrefLang: 'en', href: `${canonical}?lang=en` },
    { tagName: 'link', rel: 'alternate', hrefLang: 'fr', href: `${canonical}?lang=fr` },
    { tagName: 'link', rel: 'alternate', hrefLang: 'x-default', href: canonical },
  ];
}

export function makeEcodeSurfaceMeta(page: EcodeSurfacePageDefinition): MetaFunction {
  return ({ matches }) => {
    const rootData = matches.find((match) => match.id === 'root')?.data as { language?: string } | undefined;

    return makeEcodeSurfaceMetaTags(page, rootData?.language);
  };
}

export function EcodeSurfacePageBySlug() {
  const params = useParams();
  const slug = params.slug ?? '';
  const page = getEcodeSurfacePage(slug);

  if (!page) {
    throw new Response(null, { status: 404 });
  }

  return <EcodeSurfacePage page={page} />;
}

export function EcodeAdvancedSurfaceRoute() {
  const params = useParams();
  const page = getEcodeAdvancedSurfacePage(params.section ?? '');

  if (!page) {
    throw new Response(null, { status: 404 });
  }

  return <EcodeSurfacePage page={page} />;
}

export function EcodeSurfacePage({ page }: { page: EcodeSurfacePageDefinition }) {
  const { i18n } = useTranslation();
  const activeLanguage = i18n.resolvedLanguage ?? i18n.language;
  const localizedCopy = getMarketingSurfaceCopy(activeLanguage);

  const dynamicPageCopy = page.dynamicCopy
    ? getMarketingSurfaceDynamicPageCopy(activeLanguage, page.dynamicCopy)
    : undefined;

  const staticPageCopy = page.dynamicCopy ? undefined : getMarketingSurfacePageCopy(activeLanguage, page.slug);

  const categoryEnglish = marketingSurfaceCategoryEn.surfaceCategories[page.category];
  const category = localizedCopy.categories[page.category];
  const localizedTitle = dynamicPageCopy?.title ?? staticPageCopy?.title ?? page.title;
  const localizedDescription = dynamicPageCopy?.description ?? staticPageCopy?.description ?? page.description;
  const localizedHighlights = dynamicPageCopy?.highlights ?? staticPageCopy?.highlights ?? page.highlights;
  const usesDefaultSections = page.sections[1]?.title === englishSurfaceUi.productionControls;

  const localizedSections = usesDefaultSections
    ? [
        {
          ...page.sections[0],
          title: localizedCopy.ui.workflowTitle(localizedTitle),
          body: localizedCopy.ui.workflowBody(localizedTitle),
          items: localizedHighlights,
        },
        {
          ...page.sections[1],
          title: localizedCopy.ui.productionControls,
          body: localizedCopy.ui.productionBody,
          items: category.controls,
        },
      ]
    : page.sections;
  const localizedPage = {
    ...page,
    title: localizedTitle,
    description: localizedDescription,
    highlights: localizedHighlights,
    eyebrow: category.eyebrow,
    primaryAction: page.primaryAction === categoryEnglish.primaryAction ? category.primaryAction : page.primaryAction,
    secondaryAction:
      staticPageCopy?.secondaryActionLabel !== undefined
        ? ([staticPageCopy.secondaryActionLabel, page.secondaryAction[1]] as const)
        : page.secondaryAction === categoryEnglish.secondaryAction
          ? category.secondaryAction
          : page.secondaryAction,
    stats: category.stats,
    sections: localizedSections,
    relatedRoutes:
      dynamicPageCopy?.relatedRoutes ??
      (page.relatedRoutes === categoryEnglish.relatedRoutes ? category.relatedRoutes : page.relatedRoutes),
  };

  const Icon = page.icon;

  return (
    <PublicShell>
      <main
        className="bg-[var(--ecode-background)] text-[var(--ecode-text)]"
        data-ecode-surface-page={page.slug}
        data-surface-category={page.category}
      >
        <section className="relative overflow-hidden border-b border-[var(--ecode-border)]">
          <div className="absolute inset-0 marketing-gradient opacity-70" aria-hidden />
          <div className="absolute inset-0 marketing-grid opacity-40" aria-hidden />
          <div className="container-responsive relative grid gap-10 py-20 sm:py-28 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
            <div className="max-w-4xl">
              <span className="inline-flex items-center gap-2 rounded-full border border-[var(--ecode-border)] bg-[var(--ecode-surface)] px-4 py-2 text-[13px] font-semibold uppercase tracking-[0.24em] text-[var(--ecode-accent-text)]">
                <Icon className="h-4 w-4" aria-hidden />
                {localizedPage.eyebrow}
              </span>
              <h1 className="mt-8 max-w-4xl text-5xl font-bold leading-[1.04] tracking-tight text-[var(--ecode-text)] sm:text-6xl lg:text-7xl">
                {localizedPage.title}
              </h1>
              <p className="mt-6 max-w-3xl text-lg leading-8 text-[var(--ecode-text-secondary)] sm:text-xl">
                {localizedPage.description}
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <EcodeSurfaceActionLink to={localizedPage.primaryAction[1]}>
                  {localizedPage.primaryAction[0]}
                </EcodeSurfaceActionLink>
                <EcodeSurfaceActionLink to={localizedPage.secondaryAction[1]} variant="secondary">
                  {localizedPage.secondaryAction[0]}
                </EcodeSurfaceActionLink>
              </div>
            </div>

            <aside
              className="overflow-hidden rounded-lg border border-[var(--ecode-border)] bg-[var(--ecode-surface)] shadow-[0_24px_80px_rgba(0,0,0,0.18)]"
              aria-label={localizedCopy.ui.routeDetails(localizedPage.title)}
            >
              <div className="flex h-11 items-center gap-2 border-b border-[var(--ecode-border)] bg-[var(--ecode-surface-secondary)] px-4">
                <span className="h-2.5 w-2.5 rounded-full bg-red-400" aria-hidden />
                <span className="h-2.5 w-2.5 rounded-full bg-yellow-400" aria-hidden />
                <span className="h-2.5 w-2.5 rounded-full bg-green-400" aria-hidden />
                <strong className="ml-2 min-w-0 truncate text-[12px] font-semibold text-[var(--ecode-text-secondary)]">
                  {localizedPage.route}
                </strong>
              </div>
              <div className="grid gap-4 p-5">
                <div className="flex min-w-0 items-center gap-3 rounded-lg bg-[var(--ecode-background)] p-3 font-mono text-[12px] text-[var(--ecode-text-secondary)]">
                  <Terminal className="h-4 w-4 shrink-0 text-[var(--ecode-accent-text)]" aria-hidden />
                  <code className="min-w-0 [overflow-wrap:anywhere]">ecode route verify {localizedPage.route}</code>
                </div>
                <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                  {localizedPage.stats.map((stat) => (
                    <div
                      key={`${stat.label}-${stat.value}`}
                      className="min-h-[5.75rem] rounded-lg border border-[var(--ecode-border)] bg-[var(--ecode-background)] p-4"
                    >
                      <span className="block text-[12px] leading-5 text-[var(--ecode-text-muted)]">{stat.label}</span>
                      <strong className="mt-2 block text-lg font-bold leading-tight text-[var(--ecode-text)]">
                        {stat.value}
                      </strong>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-3 rounded-lg bg-[var(--ecode-background)] p-3 text-[13px] text-[var(--ecode-text-secondary)]">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--ecode-accent-text)]" aria-hidden />
                  <span>{localizedCopy.ui.importedConfirmation}</span>
                </div>
              </div>
            </aside>
          </div>
        </section>

        <section
          className="container-responsive py-16 sm:py-24"
          aria-label={localizedCopy.ui.importedCapabilities(localizedPage.title)}
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {localizedPage.highlights.map((highlight) => (
              <div
                key={highlight}
                className="flex min-h-[4.75rem] items-center gap-3 rounded-lg border border-[var(--ecode-border)] bg-[var(--ecode-surface)] p-4 text-[14px] font-medium text-[var(--ecode-text)]"
              >
                <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--ecode-accent-text)]" aria-hidden />
                <span>{highlight}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="container-responsive grid gap-5 lg:grid-cols-2">
          {localizedPage.sections.map((section) => (
            <article
              key={section.title}
              className="rounded-lg border border-[var(--ecode-border)] bg-[var(--ecode-surface)] p-6 sm:p-7"
            >
              <h2 className="text-2xl font-bold tracking-tight text-[var(--ecode-text)]">{section.title}</h2>
              <p className="mt-4 text-[15px] leading-7 text-[var(--ecode-text-secondary)]">{section.body}</p>
              <ul className="mt-6 grid gap-3">
                {section.items.map((item) => (
                  <li key={item} className="flex items-center gap-3 text-[14px] font-medium text-[var(--ecode-text)]">
                    <ArrowRight className="h-4 w-4 shrink-0 text-[var(--ecode-accent-text)]" aria-hidden />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </section>

        <section
          className="container-responsive py-16 sm:py-24"
          aria-label={localizedCopy.ui.relatedRoutes(localizedPage.title)}
        >
          <div className="grid gap-8 rounded-lg border border-[var(--ecode-border)] bg-[var(--ecode-surface)] p-6 sm:p-8 lg:grid-cols-[0.7fr_1.3fr]">
            <div>
              <span className="inline-flex rounded-full border border-[var(--ecode-border)] bg-[var(--ecode-background)] px-4 py-2 text-[13px] font-semibold uppercase tracking-[0.24em] text-[var(--ecode-accent-text)]">
                {localizedCopy.ui.connectedRoutes}
              </span>
              <h2 className="mt-5 text-3xl font-bold tracking-tight text-[var(--ecode-text)] sm:text-5xl">
                {localizedCopy.ui.connectedTitle}
              </h2>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {localizedPage.relatedRoutes.map((route) => (
                <Link
                  key={route.to}
                  to={route.to}
                  className="group flex min-h-[9rem] flex-col rounded-lg border border-[var(--ecode-border)] bg-[var(--ecode-background)] p-5 text-[var(--ecode-text)] no-underline transition hover:-translate-y-1 hover:border-[var(--ecode-accent)]"
                >
                  <strong className="text-base font-bold">{route.label}</strong>
                  <small className="mt-2 text-[13px] leading-6 text-[var(--ecode-text-secondary)]">
                    {route.description}
                  </small>
                  <span className="mt-auto inline-flex items-center pt-5 text-[13px] font-semibold text-[var(--ecode-accent-text)]">
                    {localizedCopy.ui.open}
                    <ArrowRight className="ml-2 h-4 w-4 transition group-hover:translate-x-1" aria-hidden />
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      </main>
    </PublicShell>
  );
}

function EcodeSurfaceActionLink({
  children,
  to,
  variant = 'primary',
}: {
  children: ReactNode;
  to: string;
  variant?: 'primary' | 'secondary';
}) {
  const className =
    variant === 'primary'
      ? 'inline-flex min-h-[44px] items-center justify-center rounded-md bg-[var(--ecode-accent)] px-5 py-3 text-[13px] font-semibold text-white transition hover:bg-[var(--ecode-accent-hover)]'
      : 'inline-flex min-h-[44px] items-center justify-center rounded-md border border-[var(--ecode-border)] bg-transparent px-5 py-3 text-[13px] font-semibold text-[var(--ecode-text)] transition hover:border-[var(--ecode-accent)] hover:text-[var(--ecode-accent-text)]';

  if (/^(https?:)?\/\//.test(to)) {
    return (
      <a href={to} className={className}>
        {children}
        <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
      </a>
    );
  }

  return (
    <Link to={to} className={className}>
      {children}
      <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
    </Link>
  );
}

const PROJECT_IMPORT_SOURCE_LABELS = {
  figma: getMarketingImportSourceLabel('en', 'figma')!,

  /*
   * The 'bolt' route key is an internal identifier kept for backwards
   * compatibility; its user-facing label is brand-neutral so the upstream
   * codename never surfaces in titles, descriptions or the browser tab.
   */
  bolt: getMarketingImportSourceLabel('en', 'bolt')!,
  lovable: getMarketingImportSourceLabel('en', 'lovable')!,
} as const satisfies Record<string, string>;

export type ProjectImportSource = keyof typeof PROJECT_IMPORT_SOURCE_LABELS;

/** Supported `:source` values for the project import surface route. */
export const PROJECT_IMPORT_SOURCES = Object.keys(PROJECT_IMPORT_SOURCE_LABELS) as ProjectImportSource[];

export function createProjectImportSurfacePage(projectId: string, source: string): EcodeSurfacePageDefinition {
  if (!PROJECT_IMPORT_SOURCE_LABELS[source as ProjectImportSource]) {
    throw new Response(null, { status: 404 });
  }

  return makeDynamicSurfacePage({
    slug: `projects/${projectId}/import/${source}`,
    route: `/projects/${projectId}/import/${source}`,
    category: 'integration',
    icon: Upload,
    dynamicCopy: { key: 'projectImport', values: { projectId, source } },
  });
}

export function createProjectDatabaseSurfacePage(projectId: string): EcodeSurfacePageDefinition {
  return makeDynamicSurfacePage({
    slug: `projects/${projectId}/database`,
    route: `/projects/${projectId}/database`,
    category: 'data',
    icon: Braces,
    dynamicCopy: { key: 'projectDatabase', values: { projectId } },
  });
}

export function createProjectPreviewSurfacePage(projectId: string): EcodeSurfacePageDefinition {
  return makeDynamicSurfacePage({
    slug: `projects/${projectId}/preview`,
    route: `/projects/${projectId}/preview`,
    category: 'runtime',
    icon: MonitorPlay,
    dynamicCopy: { key: 'projectPreview', values: { projectId } },
  });
}

export function createProjectCompatSurfacePage(projectId: string): EcodeSurfacePageDefinition {
  return makeDynamicSurfacePage({
    slug: `project/${projectId}`,
    route: `/project/${projectId}`,
    category: 'builder',
    icon: Boxes,
    dynamicCopy: { key: 'projectCompat', values: { projectId } },
  });
}

export function createEditorSurfacePage(editorId: string): EcodeSurfacePageDefinition {
  return makeDynamicSurfacePage({
    slug: `editor/${editorId}`,
    route: `/editor/${editorId}`,
    category: 'builder',
    icon: FileCode2,
    dynamicCopy: { key: 'editor', values: { editorId } },
  });
}

export function createTeamSurfacePage(teamId: string, section?: 'settings'): EcodeSurfacePageDefinition {
  return makeDynamicSurfacePage({
    slug: section ? `teams/${teamId}/${section}` : `teams/${teamId}`,
    route: section ? `/teams/${teamId}/${section}` : `/teams/${teamId}`,
    category: 'team',
    icon: section === 'settings' ? Settings : Users,
    dynamicCopy: {
      key: section === 'settings' ? 'teamSettings' : 'teamWorkspace',
      values: { teamId },
    },
  });
}

export function createProfileSurfacePage(username?: string): EcodeSurfacePageDefinition {
  const name = username ?? 'builder';

  return makeDynamicSurfacePage({
    slug: username ? `profile/${username}` : 'profile',
    route: username ? `/profile/${username}` : '/profile',
    category: 'team',
    icon: Users,
    dynamicCopy: {
      key: username ? 'profileNamed' : 'profile',
      values: { username: name },
    },
  });
}

export function createUserSurfacePage(username: string): EcodeSurfacePageDefinition {
  return makeDynamicSurfacePage({
    slug: `user/${username}`,
    route: `/user/${username}`,
    category: 'team',
    icon: Users,
    dynamicCopy: { key: 'user', values: { username } },
  });
}
