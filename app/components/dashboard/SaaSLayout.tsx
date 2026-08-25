import { useStore } from '@nanostores/react';
import * as Popover from '@radix-ui/react-popover';
import type { TFunction } from 'i18next';
import {
  Activity,
  ArrowUpRight,
  Bell,
  BookOpen,
  Boxes,
  Braces,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Command,
  CreditCard,
  FileArchive,
  FileCode2,
  Gauge,
  GitBranch,
  Github,
  Globe2,
  KeyRound,
  Layers,
  LifeBuoy,
  LogOut,
  Lock,
  MailPlus,
  Menu,
  Monitor,
  MonitorPlay,
  Moon,
  Plus,
  Rocket,
  Search,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Sun,
  Terminal,
  Twitter,
  Upload,
  User as UserIcon,
  Users,
  X,
  Youtube,
  Linkedin,
  Instagram,
  SlidersHorizontal,
  type LucideIcon,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';
import { useTranslation } from 'react-i18next';
import type { IconType } from 'react-icons';
import {
  SiAnthropic,
  SiExpo,
  SiFastify,
  SiFramer,
  SiGithub,
  SiNextdotjs,
  SiNodedotjs,
  SiOpenai,
  SiPostgresql,
  SiPrisma,
  SiReact,
  SiRemix,
  SiTailwindcss,
  SiTypescript,
  SiVite,
} from 'react-icons/si';
import { Form, Link, NavLink, useFetcher, useLocation, useNavigate, useNavigation } from 'react-router';
import { AsyncPanelError, AsyncPanelSkeleton } from './AsyncPanelState';
import { ProductTour } from './ProductTour';
import { ProjectCardMenu, ProjectRenameForm } from './ProjectCardMenu';
import {
  type CommandPaletteItem,
  clampSelectionIndex,
  filterCommandPaletteItems,
  resolveCommandPaletteKey,
} from './command-palette-search';
import { pushRecentCommand, readRecentCommands, recordRecentCommand } from './recent-commands';
import {
  SIDEBAR_AUTO_COLLAPSE_MEDIA_QUERY,
  persistSidebarCollapsed,
  readStoredSidebarCollapsed,
  reflectSidebarCollapsedOnRoot,
} from './sidebar-collapse';
import { EcodeBrandMark } from '~/components/brand/EcodeBrandMark';
import { LanguageSwitch } from '~/components/i18n/LanguageSwitch';
import { EcodeExactPublicShell } from '~/components/marketing/ecode-exact/EcodeExactShell';
import { Button } from '~/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/Card';
import { EmptyState } from '~/components/ui/EmptyState';
import UiPopover from '~/components/ui/Popover';
import { RelativeTime } from '~/components/ui/RelativeTime';
import { SkipLink } from '~/components/ui/SkipLink';
import { formatClientAstResidualCopy, getClientAstResidualCopy } from '~/lib/i18n/catalogs/client-ast-residual';
import { legacyMarketingEn, legacyMarketingKeyByEnglish } from '~/lib/i18n/catalogs/legacy-marketing';
import { userAreaEn, type UserAreaTranslationKey } from '~/lib/i18n/catalogs/user-area';
import { formatUserAreaNumber } from '~/lib/i18n/user-area-locale';
import type { ProjectLifecycle } from '~/lib/project-card-presentation';
import { profileStore } from '~/lib/stores/profile';
import { themeStore, toggleTheme } from '~/lib/stores/theme';
import { resolveUserAreaSurface } from '~/lib/user-area-surface';
import { classNames } from '~/utils/classNames';

type Icon = LucideIcon;
type TemplateProvider = {
  name: string;
  Logo: IconType;
  color: string;
};
type TemplateCard = {
  id: string;
  name: string;
  nameKey: UserAreaTranslationKey;
  stack: string;
  stackKey: UserAreaTranslationKey;
  tag: string;
  tagKey: UserAreaTranslationKey;
  providers: TemplateProvider[];
};

type MarketingMenuItem = readonly [title: string, to: string, description: string];
type FooterLink = readonly [label: string, to: string];
type FooterUtilityLink = { label: string; to: string; icon: Icon; external?: boolean };
type FooterColumn = {
  title: string;
  links: readonly FooterLink[];
};

export const ECODE_MARKETING_BRAND = {
  name: 'E-Code',
  tagline: legacyMarketingEn['legacyMarketing.brand.tagline'],
  description: legacyMarketingEn['legacyMarketing.brand.description'],
  legalName: 'E-Code.AI (Snatch Group Limited)',
  logoSrc: '/assets/logo.svg',
  aiAvatarSrc: '/assets/ai-avatar.svg',
  faviconSrc: '/favicon.svg',
  appleTouchIconSrc: '/apple-touch-icon.png',
  repositoryUrl: 'https://github.com/openaxcloud/vibecore',
} as const;

export const publicNav = [
  { label: legacyMarketingEn['legacyMarketing.nav.product'], to: '/features' },
  { label: legacyMarketingEn['legacyMarketing.nav.solutions'], to: '/solutions/app-builder' },
  { label: legacyMarketingEn['legacyMarketing.nav.resources'], to: '/docs' },
  { label: legacyMarketingEn['legacyMarketing.nav.company'], to: '/about' },
  { label: legacyMarketingEn['legacyMarketing.nav.pricing'], to: '/pricing' },
  { label: legacyMarketingEn['legacyMarketing.nav.teams'], to: '/team' },
];

export const publicMarketingMenus = {
  product: [
    [
      legacyMarketingEn['legacyMarketing.nav.aiAgent'],
      '/ai-agent',
      legacyMarketingEn['legacyMarketing.description.aiAgent'],
    ],
    [
      legacyMarketingEn['legacyMarketing.nav.browserIde'],
      '/features',
      legacyMarketingEn['legacyMarketing.description.browserIde'],
    ],
    [
      legacyMarketingEn['legacyMarketing.nav.multiplayer'],
      '/features#multiplayer',
      legacyMarketingEn['legacyMarketing.description.multiplayer'],
    ],
    [
      legacyMarketingEn['legacyMarketing.nav.mobileApp'],
      '/mobile',
      legacyMarketingEn['legacyMarketing.description.mobileApp'],
    ],
    [
      legacyMarketingEn['legacyMarketing.nav.desktopApp'],
      '/desktop',
      legacyMarketingEn['legacyMarketing.description.desktopApp'],
    ],
    [
      legacyMarketingEn['legacyMarketing.nav.aiPlatform'],
      '/ai',
      legacyMarketingEn['legacyMarketing.description.aiPlatform'],
    ],
    [
      legacyMarketingEn['legacyMarketing.nav.deployments'],
      '/marketing/deployments',
      legacyMarketingEn['legacyMarketing.description.deployments'],
    ],
    [
      legacyMarketingEn['legacyMarketing.nav.bounties'],
      '/marketing/bounties',
      legacyMarketingEn['legacyMarketing.description.bounties'],
    ],
    [
      legacyMarketingEn['legacyMarketing.nav.teams'],
      '/marketing/teams',
      legacyMarketingEn['legacyMarketing.description.teams'],
    ],
  ],
  solutions: [
    [
      legacyMarketingEn['legacyMarketing.nav.appBuilder'],
      '/solutions/app-builder',
      legacyMarketingEn['legacyMarketing.description.appBuilder'],
    ],
    [
      legacyMarketingEn['legacyMarketing.nav.websiteBuilder'],
      '/solutions/website-builder',
      legacyMarketingEn['legacyMarketing.description.websiteBuilder'],
    ],
    [
      legacyMarketingEn['legacyMarketing.nav.gameBuilder'],
      '/solutions/game-builder',
      legacyMarketingEn['legacyMarketing.description.gameBuilder'],
    ],
    [
      legacyMarketingEn['legacyMarketing.nav.dashboardBuilder'],
      '/solutions/dashboard-builder',
      legacyMarketingEn['legacyMarketing.description.dashboardBuilder'],
    ],
    [
      legacyMarketingEn['legacyMarketing.nav.chatbotBuilder'],
      '/solutions/chatbot-builder',
      legacyMarketingEn['legacyMarketing.description.chatbotBuilder'],
    ],
    [
      legacyMarketingEn['legacyMarketing.nav.internalAiBuilder'],
      '/solutions/internal-ai-builder',
      legacyMarketingEn['legacyMarketing.description.internalAiBuilder'],
    ],
    [
      legacyMarketingEn['legacyMarketing.nav.enterprise'],
      '/solutions/enterprise',
      legacyMarketingEn['legacyMarketing.description.enterprise'],
    ],
    [
      legacyMarketingEn['legacyMarketing.nav.startups'],
      '/solutions/startups',
      legacyMarketingEn['legacyMarketing.description.startups'],
    ],
    [
      legacyMarketingEn['legacyMarketing.nav.freelancers'],
      '/solutions/freelancers',
      legacyMarketingEn['legacyMarketing.description.freelancers'],
    ],
  ],
  resources: [
    [
      legacyMarketingEn['legacyMarketing.nav.documentation'],
      '/docs',
      legacyMarketingEn['legacyMarketing.description.documentation'],
    ],
    [
      legacyMarketingEn['legacyMarketing.nav.aiDocumentation'],
      '/ai-documentation',
      legacyMarketingEn['legacyMarketing.description.aiDocumentation'],
    ],
    [
      legacyMarketingEn['legacyMarketing.nav.tutorials'],
      '/tutorials',
      legacyMarketingEn['legacyMarketing.description.tutorials'],
    ],
    [legacyMarketingEn['legacyMarketing.nav.blog'], '/blog', legacyMarketingEn['legacyMarketing.description.blog']],
    [
      legacyMarketingEn['legacyMarketing.nav.changelog'],
      '/changelog',
      legacyMarketingEn['legacyMarketing.description.changelog'],
    ],
    [
      legacyMarketingEn['legacyMarketing.nav.community'],
      '/community',
      legacyMarketingEn['legacyMarketing.description.community'],
    ],
    [
      legacyMarketingEn['legacyMarketing.nav.templates'],
      '/templates',
      legacyMarketingEn['legacyMarketing.description.templates'],
    ],
    [
      legacyMarketingEn['legacyMarketing.nav.caseStudies'],
      '/case-studies',
      legacyMarketingEn['legacyMarketing.description.caseStudies'],
    ],
    [
      legacyMarketingEn['legacyMarketing.nav.helpCenter'],
      '/help-center',
      legacyMarketingEn['legacyMarketing.description.helpCenter'],
    ],
    [
      legacyMarketingEn['legacyMarketing.nav.status'],
      '/status',
      legacyMarketingEn['legacyMarketing.description.status'],
    ],
  ],
  company: [
    [legacyMarketingEn['legacyMarketing.nav.about'], '/about', legacyMarketingEn['legacyMarketing.description.about']],
    [
      legacyMarketingEn['legacyMarketing.nav.careers'],
      '/careers',
      legacyMarketingEn['legacyMarketing.description.careers'],
    ],
    [legacyMarketingEn['legacyMarketing.nav.press'], '/press', legacyMarketingEn['legacyMarketing.description.press']],
    [
      legacyMarketingEn['legacyMarketing.nav.partners'],
      '/partners',
      legacyMarketingEn['legacyMarketing.description.partners'],
    ],
    [
      legacyMarketingEn['legacyMarketing.nav.contact'],
      '/contact',
      legacyMarketingEn['legacyMarketing.description.contact'],
    ],
    [
      legacyMarketingEn['legacyMarketing.nav.accessibility'],
      '/accessibility',
      legacyMarketingEn['legacyMarketing.description.accessibility'],
    ],
  ],
} as const satisfies Record<string, readonly MarketingMenuItem[]>;

export const publicFooterColumns: readonly FooterColumn[] = [
  {
    title: legacyMarketingEn['legacyMarketing.nav.product'],
    links: [
      [legacyMarketingEn['legacyMarketing.nav.aiAgent'], '/ai-agent'],
      [legacyMarketingEn['legacyMarketing.nav.ide'], '/features'],
      [legacyMarketingEn['legacyMarketing.nav.multiplayer'], '/features#multiplayer'],
      [legacyMarketingEn['legacyMarketing.nav.mobileApp'], '/mobile'],
      [legacyMarketingEn['legacyMarketing.nav.teams'], '/marketing/teams'],
      [legacyMarketingEn['legacyMarketing.nav.deployments'], '/marketing/deployments'],
      [legacyMarketingEn['legacyMarketing.nav.pricing'], '/pricing'],
      [legacyMarketingEn['legacyMarketing.nav.bounties'], '/marketing/bounties'],
      [legacyMarketingEn['legacyMarketing.nav.aiPlatform'], '/ai'],
    ],
  },
  {
    title: legacyMarketingEn['legacyMarketing.nav.resources'],
    links: [
      [legacyMarketingEn['legacyMarketing.nav.docs'], '/docs'],
      [legacyMarketingEn['legacyMarketing.nav.blog'], '/blog'],
      [legacyMarketingEn['legacyMarketing.nav.community'], '/community'],
      [legacyMarketingEn['legacyMarketing.nav.templates'], '/templates'],
      [legacyMarketingEn['legacyMarketing.nav.languages'], '/templates/languages'],
      [legacyMarketingEn['legacyMarketing.nav.status'], '/status'],
      [legacyMarketingEn['legacyMarketing.nav.forum'], '/forum'],
    ],
  },
  {
    title: legacyMarketingEn['legacyMarketing.nav.company'],
    links: [
      [legacyMarketingEn['legacyMarketing.nav.about'], '/about'],
      [legacyMarketingEn['legacyMarketing.nav.careers'], '/careers'],
      [legacyMarketingEn['legacyMarketing.nav.press'], '/press'],
      [legacyMarketingEn['legacyMarketing.nav.partners'], '/partners'],
      [legacyMarketingEn['legacyMarketing.nav.contactSales'], '/contact-sales'],
    ],
  },
  {
    title: legacyMarketingEn['legacyMarketing.nav.legal'],
    links: [
      [legacyMarketingEn['legacyMarketing.nav.terms'], '/terms'],
      [legacyMarketingEn['legacyMarketing.nav.privacy'], '/privacy'],
      [legacyMarketingEn['legacyMarketing.nav.subprocessors'], '/subprocessors'],
      [legacyMarketingEn['legacyMarketing.nav.dpa'], '/dpa'],
      [legacyMarketingEn['legacyMarketing.nav.studentDpa'], '/student-dpa'],
      [legacyMarketingEn['legacyMarketing.nav.security'], '/security'],
      [legacyMarketingEn['legacyMarketing.nav.reportAbuse'], '/report-abuse'],
    ],
  },
] as const;

export const publicFooterActionLinks = [
  [legacyMarketingEn['legacyMarketing.action.talkToSales'], '/contact-sales'],
  [legacyMarketingEn['legacyMarketing.action.startBuilding'], '/register'],
] as const satisfies readonly FooterLink[];

export const publicCompareLinks = [
  [legacyMarketingEn['legacyMarketing.compare.githubCodespaces'], '/compare/github-codespaces'],
  [legacyMarketingEn['legacyMarketing.compare.glitch'], '/compare/glitch'],
  [legacyMarketingEn['legacyMarketing.compare.heroku'], '/compare/heroku'],
  [legacyMarketingEn['legacyMarketing.compare.codesandbox'], '/compare/codesandbox'],
  [legacyMarketingEn['legacyMarketing.compare.awsCloud9'], '/compare/aws-cloud9'],
] as const satisfies readonly FooterLink[];

export const publicFooterUtilityLinks = [
  {
    label: legacyMarketingEn['legacyMarketing.social.twitter'],
    to: 'https://twitter.com/ecode',
    icon: Twitter,
    external: true,
  },
  {
    label: legacyMarketingEn['legacyMarketing.social.github'],
    to: 'https://github.com/ecode',
    icon: Github,
    external: true,
  },
  {
    label: legacyMarketingEn['legacyMarketing.social.youtube'],
    to: 'https://youtube.com/ecode',
    icon: Youtube,
    external: true,
  },
  {
    label: legacyMarketingEn['legacyMarketing.social.linkedin'],
    to: 'https://linkedin.com/company/ecode',
    icon: Linkedin,
    external: true,
  },
  {
    label: legacyMarketingEn['legacyMarketing.social.instagram'],
    to: 'https://instagram.com/ecode',
    icon: Instagram,
    external: true,
  },
] as const satisfies readonly FooterUtilityLink[];

function translateLegacyMarketing(translate: TFunction, copy: string): string {
  const key = legacyMarketingKeyByEnglish[copy];
  return key ? String(translate(key)) : String(translate('common.unavailable'));
}

type NavItem = {
  label: string;
  labelKey: UserAreaTranslationKey;
  to: string;
  icon: Icon;
  shortcut?: string;
  end?: boolean;
};

function navItem(
  labelKey: UserAreaTranslationKey,
  to: string,
  icon: Icon,
  options?: Pick<NavItem, 'shortcut' | 'end'>,
): NavItem {
  return { label: userAreaEn[labelKey], labelKey, to, icon, ...options };
}

export const workspaceNav: NavItem[] = [
  navItem('userArea.navigation.search', '/command-palette', Search, { shortcut: '⌘K' }),
  navItem('userArea.navigation.dashboard', '/dashboard', Gauge),
  navItem('userArea.navigation.projects', '/projects', Boxes),
  navItem('userArea.navigation.templates', '/dashboard/templates', Layers),
];

export const orgNav = [
  navItem('userArea.navigation.usage', '/usage', Activity),
  navItem('userArea.navigation.billing', '/billing', CreditCard),
  navItem('userArea.navigation.team', '/organization-members', Users),
  navItem('userArea.navigation.support', '/support', LifeBuoy),
];

export const appNav = [...workspaceNav, navItem('userArea.navigation.createProject', '/projects/new', Plus), ...orgNav];

export const accountNav = [
  navItem('userArea.navigation.account', '/account-settings', Settings, { end: true }),
  navItem('userArea.navigation.security', '/security-settings', ShieldCheck),
  navItem('userArea.navigation.apiKeys', '/api-keys', KeyRound),
  navItem('userArea.navigation.connectedAccounts', '/account-settings/connected', Github),
  navItem('userArea.navigation.notifications', '/notifications', Bell),
  navItem('userArea.navigation.desktopApp', '/desktop-settings', Monitor),
  navItem('userArea.navigation.workspaceSettings', '/workspace-settings', SlidersHorizontal),
  navItem('userArea.navigation.dataPrivacy', '/account-settings/data', ShieldAlert),
];

const USER_AREA_ROUTE_PREFIXES = [
  '/account-settings',
  '/api-keys',
  '/audit-logs',
  '/billing',
  '/dashboard',
  '/desktop-settings',
  '/enterprise-sso-settings',
  '/invoices',
  '/notifications',
  '/organization-',
  '/payment-method',
  '/projects',
  '/recent-projects',
  '/recovery-codes',
  '/roles-and-permissions',
  '/scim-token-settings',
  '/security-settings',
  '/session-security',
  '/support',
  '/usage',
  '/workspace-settings',
] as const;

export function isUserAreaDestination(pathname: string): boolean {
  if (/^\/projects\/[^/]+\/ide(?:\/|$)/u.test(pathname)) {
    return false;
  }

  return USER_AREA_ROUTE_PREFIXES.some((prefix) =>
    prefix.endsWith('-') ? pathname.startsWith(prefix) : pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function shouldShowUserAreaNavigationSkeleton({
  currentPathname,
  targetPathname,
  navigationState,
}: {
  currentPathname: string;
  targetPathname?: string;
  navigationState: 'idle' | 'loading' | 'submitting';
}): boolean {
  return (
    navigationState === 'loading' &&
    Boolean(targetPathname) &&
    targetPathname !== currentPathname &&
    isUserAreaDestination(targetPathname ?? '')
  );
}

export const projectNav = [
  { labelKey: 'userArea.navigation.overview', suffix: '', icon: Gauge },
  { labelKey: 'userArea.navigation.openIde', suffix: '/ide', icon: FileCode2 },
  { labelKey: 'userArea.navigation.settings', suffix: '/settings', icon: Settings },
  { labelKey: 'userArea.navigation.environmentVariables', suffix: '/env', icon: Braces },
  { labelKey: 'userArea.navigation.secrets', suffix: '/secrets', icon: Lock },
  { labelKey: 'userArea.navigation.collaborators', suffix: '/collaborators', icon: Users },
  { labelKey: 'userArea.navigation.snapshots', suffix: '/snapshots', icon: Layers },
  { labelKey: 'userArea.navigation.deployments', suffix: '/deployments', icon: Rocket },
  { labelKey: 'userArea.navigation.customDomains', suffix: '/domains', icon: Globe2 },
  { labelKey: 'userArea.navigation.logs', suffix: '/logs', icon: Terminal },
  { labelKey: 'userArea.navigation.activity', suffix: '/activity', icon: Activity },
  { labelKey: 'userArea.navigation.git', suffix: '/git', icon: GitBranch },
];

export const templates: TemplateCard[] = [
  {
    id: 'react-saas',
    name: userAreaEn['userArea.template.reactSaas.name'],
    nameKey: 'userArea.template.reactSaas.name',
    stack: userAreaEn['userArea.template.reactSaas.stack'],
    stackKey: 'userArea.template.reactSaas.stack',
    tag: userAreaEn['userArea.template.reactSaas.tag'],
    tagKey: 'userArea.template.reactSaas.tag',
    providers: [
      { name: 'React', Logo: SiReact, color: '#61DAFB' },
      { name: 'Vite', Logo: SiVite, color: '#41D1FF' },
      { name: 'TypeScript', Logo: SiTypescript, color: '#3178C6' },
    ],
  },
  {
    id: 'next-dashboard',
    name: userAreaEn['userArea.template.nextDashboard.name'],
    nameKey: 'userArea.template.nextDashboard.name',
    stack: userAreaEn['userArea.template.nextDashboard.stack'],
    stackKey: 'userArea.template.nextDashboard.stack',
    tag: userAreaEn['userArea.template.nextDashboard.tag'],
    tagKey: 'userArea.template.nextDashboard.tag',
    providers: [
      { name: 'Next.js', Logo: SiNextdotjs, color: 'var(--vc-ide-text-primary)' },
      { name: 'Prisma', Logo: SiPrisma, color: '#B8C4D9' },
      { name: 'Tailwind CSS', Logo: SiTailwindcss, color: '#06B6D4' },
    ],
  },
  {
    id: 'fastify-api',
    name: userAreaEn['userArea.template.fastifyApi.name'],
    nameKey: 'userArea.template.fastifyApi.name',
    stack: userAreaEn['userArea.template.fastifyApi.stack'],
    stackKey: 'userArea.template.fastifyApi.stack',
    tag: userAreaEn['userArea.template.fastifyApi.tag'],
    tagKey: 'userArea.template.fastifyApi.tag',
    providers: [
      { name: 'Node.js', Logo: SiNodedotjs, color: '#5FA04E' },
      { name: 'Fastify', Logo: SiFastify, color: 'var(--vc-ide-text-primary)' },
      { name: 'PostgreSQL', Logo: SiPostgresql, color: '#4169E1' },
    ],
  },
  {
    id: 'ai-agent',
    name: userAreaEn['userArea.template.aiAgent.name'],
    nameKey: 'userArea.template.aiAgent.name',
    stack: userAreaEn['userArea.template.aiAgent.stack'],
    stackKey: 'userArea.template.aiAgent.stack',
    tag: userAreaEn['userArea.template.aiAgent.tag'],
    tagKey: 'userArea.template.aiAgent.tag',
    providers: [
      { name: 'OpenAI', Logo: SiOpenai, color: 'var(--vc-ide-text-primary)' },
      { name: 'Anthropic', Logo: SiAnthropic, color: '#D97757' },
      { name: 'GitHub', Logo: SiGithub, color: 'var(--vc-ide-text-primary)' },
    ],
  },
  {
    id: 'landing-page',
    name: userAreaEn['userArea.template.landingPage.name'],
    nameKey: 'userArea.template.landingPage.name',
    stack: userAreaEn['userArea.template.landingPage.stack'],
    stackKey: 'userArea.template.landingPage.stack',
    tag: userAreaEn['userArea.template.landingPage.tag'],
    tagKey: 'userArea.template.landingPage.tag',
    providers: [
      { name: 'Remix', Logo: SiRemix, color: 'var(--vc-ide-text-primary)' },
      { name: 'Tailwind CSS', Logo: SiTailwindcss, color: '#06B6D4' },
      { name: 'Framer', Logo: SiFramer, color: '#0055FF' },
    ],
  },
  {
    id: 'mobile-starter',
    name: userAreaEn['userArea.template.mobileStarter.name'],
    nameKey: 'userArea.template.mobileStarter.name',
    stack: userAreaEn['userArea.template.mobileStarter.stack'],
    stackKey: 'userArea.template.mobileStarter.stack',
    tag: userAreaEn['userArea.template.mobileStarter.tag'],
    tagKey: 'userArea.template.mobileStarter.tag',
    providers: [
      { name: 'Expo', Logo: SiExpo, color: 'var(--vc-ide-text-primary)' },
      { name: 'React', Logo: SiReact, color: '#61DAFB' },
      { name: 'TypeScript', Logo: SiTypescript, color: '#3178C6' },
    ],
  },
];

export interface ProjectCard {
  id: string;
  name: string;
  status?: string;
  updated?: string;
  stack?: string;
  sourceType?: string;
  previewImageUrl?: string;
  ideUrl?: string;

  /** Real lifecycle derived from API data (deployments count / soft-delete). */
  lifecycle?: ProjectLifecycle;

  /** Raw updatedAt ISO string — drives the relative "Updated ..." label. */
  updatedAtIso?: string;

  /** Deployments on this project — gates the type-the-name delete confirmation. */
  deploymentCount?: number;
}

export function PublicShell({ children }: { children: React.ReactNode }) {
  return <EcodeExactPublicShell>{children}</EcodeExactPublicShell>;
}

function EcodeMarketingLogo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="vc-logo" aria-label={ECODE_MARKETING_BRAND.name}>
      {/* Inline SVG mark (no external file fetch / external CSS) so the e-code
          logo always renders in the user area — the previous <img> relied on
          CSS classes that don't load in this shell. */}
      <EcodeBrandMark size="sm" showText={!compact} gradientId="ecode-app-logo" />
    </span>
  );
}

export function PublicMarketingHeader() {
  const { t } = useTranslation();

  const mobileItems = [
    ...publicMarketingMenus.product,
    ...publicMarketingMenus.solutions,
    ...publicMarketingMenus.resources,
    ...publicMarketingMenus.company,
    [
      legacyMarketingEn['legacyMarketing.nav.pricing'],
      '/pricing',
      legacyMarketingEn['legacyMarketing.description.pricing'],
    ],
    [legacyMarketingEn['legacyMarketing.nav.teams'], '/team', legacyMarketingEn['legacyMarketing.description.team']],
  ] as const satisfies readonly MarketingMenuItem[];

  return (
    <header className="vc-public-header" role="banner" aria-label={t('legacyMarketing.chrome.siteHeader')}>
      <div className="vc-public-announcement">
        <div className="vc-public-container vc-public-announcement-inner">
          <span className="vc-badge">{t('legacyMarketing.chrome.new')}</span>
          <span>{t('legacyMarketing.chrome.announcement')}</span>
          <Link to="/contact-sales">{t('legacyMarketing.action.talkToExpert')}</Link>
        </div>
      </div>
      <nav className="vc-public-nav" aria-label={t('legacyMarketing.chrome.mainNavigation')}>
        <div className="vc-public-container vc-public-nav-inner">
          <Link to="/" className="vc-public-brand">
            <EcodeMarketingLogo />
          </Link>
          <div className="vc-public-desktop-nav" aria-label={t('legacyMarketing.chrome.publicNavigation')}>
            <MarketingMenu
              label={legacyMarketingEn['legacyMarketing.nav.product']}
              items={publicMarketingMenus.product}
              icon={Sparkles}
            />
            <MarketingMenu
              label={legacyMarketingEn['legacyMarketing.nav.solutions']}
              items={publicMarketingMenus.solutions}
              icon={Rocket}
            />
            <MarketingMenu
              label={legacyMarketingEn['legacyMarketing.nav.resources']}
              items={publicMarketingMenus.resources}
              icon={BookOpen}
            />
            <MarketingMenu
              label={legacyMarketingEn['legacyMarketing.nav.company']}
              items={publicMarketingMenus.company}
              icon={ShieldCheck}
            />
            <NavButton to="/gallery">{t('legacyMarketing.nav.gallery')}</NavButton>
            <NavButton to="/pricing">{t('legacyMarketing.nav.pricing')}</NavButton>
            <NavButton to="/team">{t('legacyMarketing.nav.teams')}</NavButton>
          </div>
          <div className="vc-public-actions">
            <PublicThemeToggle />
            <LanguageSwitch />
            <LinkButton to="/login" variant="ghost">
              {t('legacyMarketing.action.logIn')}
            </LinkButton>
            <LinkButton to="/register">{t('legacyMarketing.action.getStarted')}</LinkButton>
            <details className="vc-public-mobile-menu">
              <summary aria-label={t('legacyMarketing.chrome.openMobileMenu')}>
                <Menu className="h-5 w-5" aria-hidden />
              </summary>
              <div className="vc-public-mobile-menu-panel">
                {mobileItems.map(([title, to, description]) => (
                  <Link key={`${title}-${to}`} to={to}>
                    <strong>{translateLegacyMarketing(t, title)}</strong>
                    <span>{translateLegacyMarketing(t, description)}</span>
                  </Link>
                ))}
              </div>
            </details>
          </div>
        </div>
      </nav>
    </header>
  );
}

function PublicThemeToggle() {
  const { t } = useTranslation();
  const theme = useStore(themeStore);
  const nextTheme = theme === 'dark' ? 'light' : 'dark';

  return (
    <button
      type="button"
      className="vc-public-theme-switch"
      title={t('legacyMarketing.chrome.switchTheme')}
      aria-label={t(
        nextTheme === 'light' ? 'legacyMarketing.chrome.switchToLight' : 'legacyMarketing.chrome.switchToDark',
      )}
      data-testid="public-theme-toggle"
      onClick={toggleTheme}
    >
      <span
        className={
          theme === 'dark'
            ? 'i-ph:sun-dim-bold vc-public-theme-switch-icon'
            : 'i-ph:moon-stars-bold vc-public-theme-switch-icon'
        }
        aria-hidden
      />
    </button>
  );
}

function MarketingMenu({
  label,
  items,
  icon: menuIcon,
}: {
  label: string;
  items: readonly MarketingMenuItem[];
  icon: Icon;
}) {
  const { t } = useTranslation();
  const MenuIcon = menuIcon;

  return (
    <details className="vc-marketing-menu">
      <summary>
        {translateLegacyMarketing(t, label)}
        <ChevronRight className="h-3 w-3" aria-hidden />
      </summary>
      <div className="vc-marketing-menu-panel">
        {items.map(([title, to, description]) => (
          <Link key={`${title}-${to}`} to={to}>
            <MenuIcon className="h-4 w-4" aria-hidden />
            <span>
              <strong>{translateLegacyMarketing(t, title)}</strong>
              <small>{translateLegacyMarketing(t, description)}</small>
            </span>
          </Link>
        ))}
      </div>
    </details>
  );
}

export function PublicMarketingFooter() {
  const { t } = useTranslation();

  return (
    <footer
      id="company"
      className="vc-public-footer"
      role="contentinfo"
      aria-label={t('legacyMarketing.footer.siteFooter')}
    >
      <div className="vc-public-container">
        <div className="vc-public-footer-cta">
          <div>
            <span className="vc-badge">
              <ShieldCheck className="h-3 w-3" aria-hidden />
              {t('legacyMarketing.footer.fortune500')}
            </span>
            <h2>{t('legacyMarketing.footer.title')}</h2>
            <p>{t('legacyMarketing.footer.body')}</p>
          </div>
          <div className="vc-public-footer-actions">
            {publicFooterActionLinks.map(([label, to], index) => (
              <LinkButton key={to} to={to} variant={index === 0 ? 'default' : 'outline'}>
                {translateLegacyMarketing(t, label)}
                {index === 0 ? <ArrowUpRight className="h-4 w-4" aria-hidden /> : null}
              </LinkButton>
            ))}
          </div>
        </div>
        <div className="vc-public-footer-metrics" aria-label={t('legacyMarketing.footer.metrics')}>
          <article>
            <span>{t('legacyMarketing.footer.uptime')}</span>
            <strong>99.99%</strong>
          </article>
          <article>
            <span>{t('legacyMarketing.footer.enterpriseTeams')}</span>
            <strong>4,500+</strong>
          </article>
        </div>
        <div className="vc-public-footer-grid">
          <div className="vc-public-footer-brand">
            <EcodeMarketingLogo />
            <p>{t('legacyMarketing.brand.description')}</p>
            <div className="vc-public-trust-list">
              <span>
                <CheckCircle2 className="h-4 w-4" /> {t('legacyMarketing.footer.aiGovernance')}
              </span>
              <span>
                <Globe2 className="h-4 w-4" /> {t('legacyMarketing.footer.globalPreviews')}
              </span>
              <span>
                <ShieldCheck className="h-4 w-4" /> {t('legacyMarketing.footer.securityControls')}
              </span>
            </div>
          </div>
          {publicFooterColumns.map((column) => (
            <nav key={column.title} aria-label={translateLegacyMarketing(t, column.title)}>
              <h3>{translateLegacyMarketing(t, column.title)}</h3>
              {column.links.map(([label, to]) => (
                <Link key={`${column.title}-${label}-${to}`} to={to}>
                  {translateLegacyMarketing(t, label)}
                </Link>
              ))}
            </nav>
          ))}
        </div>
        <div className="vc-public-footer-compare">
          <div>
            <h3>{t('legacyMarketing.footer.compareTitle')}</h3>
            <p>{t('legacyMarketing.footer.compareBody')}</p>
          </div>
          <div role="list" aria-label={t('legacyMarketing.footer.comparisons')}>
            {publicCompareLinks.map(([label, to]) => (
              <Link key={to} to={to}>
                {translateLegacyMarketing(t, label)}
              </Link>
            ))}
          </div>
        </div>
        <div className="vc-public-footer-trust-row">
          <span>
            <ShieldCheck className="h-5 w-5" aria-hidden /> {t('legacyMarketing.footer.socCompliance')}
          </span>
          <span>
            <Globe2 className="h-5 w-5" aria-hidden /> {t('legacyMarketing.footer.regions')}
          </span>
          <span>
            <Sparkles className="h-5 w-5" aria-hidden /> {t('legacyMarketing.footer.audit')}
          </span>
        </div>
        <div className="vc-public-footer-bottom">
          <span>
            © {new Date().getFullYear()} {ECODE_MARKETING_BRAND.legalName}. {t('legacyMarketing.footer.rights')}
          </span>
          <div>
            {publicFooterUtilityLinks.map((utilityLink) => {
              const FooterIcon = utilityLink.icon;

              return utilityLink.external ? (
                <a
                  key={utilityLink.to}
                  href={utilityLink.to}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={translateLegacyMarketing(t, utilityLink.label)}
                >
                  <FooterIcon className="h-4 w-4" />
                </a>
              ) : (
                <Link
                  key={utilityLink.to}
                  to={utilityLink.to}
                  aria-label={translateLegacyMarketing(t, utilityLink.label)}
                >
                  <FooterIcon className="h-4 w-4" />
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </footer>
  );
}

function useSidebarController() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [hasExplicitChoice, setHasExplicitChoice] = useState(false);

  /*
   * Seed from localStorage AFTER hydration (the server always renders
   * expanded, so the first client render must match it). There is still no
   * flash of the wrong state: the inline boot script in app/root.tsx already
   * reflected the persisted choice on <html> as data-ecode-sidebar-collapsed
   * before first paint, and the attribute-keyed CSS in app/styles/index.scss
   * keeps the shell in that geometry until this state catches up.
   */
  useEffect(() => {
    const stored = readStoredSidebarCollapsed();

    if (stored !== null) {
      setSidebarCollapsed(stored);
      setHasExplicitChoice(true);
      reflectSidebarCollapsedOnRoot(stored);

      return;
    }

    if (typeof window !== 'undefined' && window.matchMedia(SIDEBAR_AUTO_COLLAPSE_MEDIA_QUERY).matches) {
      setSidebarCollapsed(true);
      reflectSidebarCollapsedOnRoot(true);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const mql = window.matchMedia(SIDEBAR_AUTO_COLLAPSE_MEDIA_QUERY);

    const onChange = (event: MediaQueryListEvent) => {
      if (!hasExplicitChoice) {
        setSidebarCollapsed(event.matches);
        reflectSidebarCollapsedOnRoot(event.matches);
      }
    };

    mql.addEventListener('change', onChange);

    return () => mql.removeEventListener('change', onChange);
  }, [hasExplicitChoice]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const mql = window.matchMedia('(min-width: 1024px)');

    const onChange = (event: MediaQueryListEvent) => {
      if (event.matches) {
        setDrawerOpen(false);
      }
    };

    mql.addEventListener('change', onChange);

    return () => mql.removeEventListener('change', onChange);
  }, []);

  const toggleSidebar = useCallback(() => {
    setHasExplicitChoice(true);
    setSidebarCollapsed((current) => {
      const next = !current;
      persistSidebarCollapsed(next);
      reflectSidebarCollapsedOnRoot(next);

      return next;
    });
  }, []);

  return {
    sidebarCollapsed,
    toggleSidebar,
    drawerOpen,
    openDrawer: useCallback(() => setDrawerOpen(true), []),
    closeDrawer: useCallback(() => setDrawerOpen(false), []),
  };
}

function useSidebarShortcuts({ toggleSidebar, onSearch }: { toggleSidebar: () => void; onSearch: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;

      const inEditableField =
        !!target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      const meta = event.metaKey || event.ctrlKey;

      if (!meta) {
        return;
      }

      if (event.key === '\\') {
        event.preventDefault();
        toggleSidebar();

        return;
      }

      if ((event.key === 'k' || event.key === 'K') && !inEditableField) {
        event.preventDefault();
        onSearch();
      }
    };

    window.addEventListener('keydown', onKey);

    return () => window.removeEventListener('keydown', onKey);
  }, [toggleSidebar, onSearch]);
}

export function AppShell({
  title,
  description,
  children,
  actions,
  hideHeader = false,
  hideTopBar = false,
  mainClassName,
  contentClassName,
  serverSync = true,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
  hideHeader?: boolean;
  hideTopBar?: boolean;
  mainClassName?: string;
  contentClassName?: string;

  /*
   * Vrai quand la page est servie à un utilisateur AUTHENTIFIÉ. Les routes de
   * l'espace utilisateur le sont toutes (défaut), mais `AppShell` sert aussi de
   * coque à des pages publiques — `EnterpriseFormPage` (`/invitations/accept`)
   * et les frontières d'erreur de `root` — qui doivent passer `false` : sinon le
   * tour interroge `/api/user/preferences`, reçoit 401, et le navigateur
   * journalise une erreur que l'audit live EN/FR rejette.
   */
  serverSync?: boolean;
}) {
  const { t } = useTranslation();
  const { sidebarCollapsed, toggleSidebar, drawerOpen, openDrawer, closeDrawer } = useSidebarController();
  const navigate = useNavigate();
  const location = useLocation();
  const navigation = useNavigation();

  const [tourRestartToken, setTourRestartToken] = useState(0);

  const showNavigationSkeleton = shouldShowUserAreaNavigationSkeleton({
    currentPathname: location.pathname,
    targetPathname: navigation.location?.pathname,
    navigationState: navigation.state,
  });

  const pendingSurface =
    showNavigationSkeleton && navigation.location ? resolveUserAreaSurface(navigation.location.pathname) : null;

  const displayedTitle = pendingSurface?.title ?? title;
  const displayedDescription = pendingSurface ? t('userArea.shell.loadingLatest') : description;

  useSidebarShortcuts({
    toggleSidebar,
    onSearch: useCallback(() => navigate('/command-palette'), [navigate]),
  });

  return (
    <main
      className={classNames(
        'vc-user-area-shell min-h-[100dvh] bg-bolt-elements-background-depth-1 text-bolt-elements-textPrimary',
        mainClassName,
      )}
    >
      <SkipLink label={t('userArea.shell.skipToContent')} />
      <div
        className={classNames(
          'vc-app-shell-grid grid min-h-[100dvh]',
          sidebarCollapsed ? 'lg:grid-cols-[56px_1fr]' : 'lg:grid-cols-[240px_1fr]',
        )}
      >
        <DesktopSidebar collapsed={sidebarCollapsed} toggleSidebar={toggleSidebar} />
        <MobileSidebarDrawer open={drawerOpen} onClose={closeDrawer} />
        <section
          id="main-content"
          tabIndex={-1}
          aria-busy={showNavigationSkeleton || undefined}
          className="min-w-0 outline-none"
        >
          {!hideTopBar ? (
            <TopBar
              onOpenDrawer={openDrawer}
              onStartTour={() => setTourRestartToken((current) => current + 1)}
              title={displayedTitle}
            />
          ) : null}
          <div className={classNames('mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:py-8', contentClassName)}>
            {!hideHeader ? (
              <div
                className="mb-6 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-5 shadow-sm sm:p-6"
                data-vc-tour-target="page-header"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="mb-2 text-xs font-medium uppercase text-bolt-elements-textTertiary">
                      {t('userArea.shell.workspaceConsole')}
                    </p>
                    <h1 className="vc-app-shell-title text-[28px] font-semibold leading-[36px] tracking-normal sm:text-[32px] sm:leading-[40px]">
                      {displayedTitle}
                    </h1>
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-bolt-elements-textSecondary">
                      {displayedDescription}
                    </p>
                  </div>
                  {!pendingSurface && actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
                </div>
              </div>
            ) : null}
            {showNavigationSkeleton ? (
              <div data-testid="user-area-navigation-skeleton">
                <AsyncPanelSkeleton label={t('userArea.shell.loadingPage')} rows={5} />
              </div>
            ) : (
              children
            )}
          </div>
        </section>
      </div>
      {!hideTopBar ? <ProductTour restartToken={tourRestartToken} serverSync={serverSync} /> : null}
    </main>
  );
}

function DesktopSidebar({ collapsed, toggleSidebar }: { collapsed: boolean; toggleSidebar: () => void }) {
  const { t } = useTranslation();

  return (
    <aside
      className={classNames(
        'vc-sidebar vc-sidebar--desktop relative overflow-visible border-r border-bolt-elements-borderColor bg-bolt-elements-background-depth-2',
        collapsed && 'vc-sidebar--collapsed',
      )}
      role="navigation"
      aria-label={t('userArea.shell.mainNavigation')}
      data-vc-tour-target="navigation"
    >
      <SidebarHeader collapsed={collapsed} />
      <SidebarToggle collapsed={collapsed} onToggle={toggleSidebar} />
      <SidebarBody collapsed={collapsed} />
      <SidebarFooter collapsed={collapsed} />
    </aside>
  );
}

function SidebarHeader({ collapsed }: { collapsed: boolean }) {
  const { t } = useTranslation();

  return (
    <Link
      to="/organization-switcher"
      className={classNames(
        'vc-sidebar-header group relative flex h-[56px] shrink-0 items-center border-b border-bolt-elements-borderColor transition-colors hover:bg-bolt-elements-background-depth-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-accent-action)]',
        collapsed ? 'justify-center px-1.5' : 'gap-2 px-3',
      )}
      aria-label={t('userArea.shell.organizationSwitcher')}
      title={collapsed ? t('userArea.shell.organizationSwitcher') : undefined}
    >
      <span
        className={classNames(
          'flex shrink-0 items-center justify-center rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-3',
          collapsed ? 'h-7 w-7' : 'h-8 w-8',
        )}
        aria-hidden
      >
        <Sparkles className={collapsed ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
      </span>
      {!collapsed ? (
        <span className="vc-sidebar-fade-label min-w-0 flex-1">
          <span className="block text-sm font-semibold leading-tight">{ECODE_MARKETING_BRAND.name}</span>
          <span className="block truncate text-[11px] leading-tight text-bolt-elements-textTertiary">
            {t('userArea.shell.saasWorkspace')}
          </span>
        </span>
      ) : null}
      {collapsed ? <span className="vc-collapsed-nav-label">{t('userArea.shell.organizationSwitcher')}</span> : null}
    </Link>
  );
}

function SidebarToggle({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const { t } = useTranslation();

  return (
    <button
      type="button"
      onClick={onToggle}
      className="vc-sidebar-toggle group absolute right-[-22px] top-[6px] z-10 inline-flex h-[44px] w-[44px] items-center justify-center rounded-full text-bolt-elements-textTertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-accent-action)]"
      aria-label={collapsed ? t('userArea.shell.expandNavigation') : t('userArea.shell.collapseNavigation')}
      aria-expanded={!collapsed}
      aria-keyshortcuts="Meta+\\ Control+\\"
      title={collapsed ? t('userArea.shell.expandMenuShortcut') : t('userArea.shell.collapseMenuShortcut')}
    >
      <span className="vc-sidebar-toggle-visual inline-flex h-6 w-6 items-center justify-center rounded-full border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 shadow-sm transition-colors group-hover:bg-bolt-elements-background-depth-3 group-hover:text-bolt-elements-textPrimary">
        {collapsed ? (
          <ChevronRight className="h-3.5 w-3.5" aria-hidden />
        ) : (
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
        )}
      </span>
    </button>
  );
}

function SidebarBody({ collapsed, mobile = false }: { collapsed: boolean; mobile?: boolean }) {
  const { t } = useTranslation();

  return (
    <nav
      className={classNames(
        'min-h-0 flex-1 overflow-y-auto overflow-x-visible px-3 py-2',
        collapsed && 'items-center px-2',
        mobile && 'vc-sidebar-scroll-region',
      )}
      aria-label={t('userArea.shell.applicationNavigation')}
      data-testid={mobile ? 'mobile-navigation-scroll-region' : undefined}
    >
      <CreateProjectCta collapsed={collapsed} />
      <NavSection items={workspaceNav} collapsed={collapsed} />
      <NavSection label={t('userArea.navigation.organization')} items={orgNav} collapsed={collapsed} />
      <NavSection label={t('userArea.navigation.account')} items={accountNav} collapsed={collapsed} />
    </nav>
  );
}

function MobileSidebarDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', onKey);

    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <div
      className={classNames('vc-sidebar-drawer-root lg:hidden', open && 'vc-sidebar-drawer-root--open')}
      aria-hidden={!open}
    >
      <button
        type="button"
        className="vc-sidebar-drawer-overlay"
        aria-label={t('userArea.shell.closeNavigation')}
        onClick={onClose}
        tabIndex={open ? 0 : -1}
      />
      <aside
        className="vc-sidebar-drawer-panel"
        role="navigation"
        aria-label={t('userArea.shell.mainNavigation')}
        aria-hidden={!open}
      >
        <div className="flex h-[56px] items-center justify-between border-b border-bolt-elements-borderColor px-3">
          <Link
            to="/organization-switcher"
            className="flex min-h-[44px] min-w-0 items-center gap-2"
            aria-label={t('userArea.shell.organizationSwitcher')}
            onClick={onClose}
          >
            <EcodeBrandMark size="sm" showText gradientId="ecode-drawer-logo" />
          </Link>
          <button
            type="button"
            className="inline-flex h-[44px] w-[44px] items-center justify-center rounded-md text-bolt-elements-textTertiary hover:bg-bolt-elements-background-depth-3 hover:text-bolt-elements-textPrimary focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-accent-action)]"
            onClick={onClose}
            aria-label={t('userArea.shell.closeNavigation')}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <div className="flex min-h-0 flex-1 overflow-hidden" onClick={onClose} role="presentation">
          <SidebarBody collapsed={false} mobile />
        </div>
        <div className="vc-sidebar-drawer-footer shrink-0 border-t border-bolt-elements-borderColor px-3 pt-3">
          <SidebarFooter collapsed={false} embedded />
        </div>
      </aside>
    </div>
  );
}

function SidebarFooter({ collapsed, embedded = false }: { collapsed: boolean; embedded?: boolean }) {
  const { t } = useTranslation();
  const profile = useStore(profileStore);
  const theme = useStore(themeStore);
  const displayName = profile.username?.trim() || t('userArea.shell.signedInUser');

  const initials = displayName
    .split(/\s+/)
    .map((part: string) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const hasInitials = initials.length > 0 && profile.username?.trim();

  return (
    <div
      className={classNames(
        'vc-sidebar-footer',
        !embedded && 'shrink-0 border-t border-bolt-elements-borderColor bg-bolt-elements-background-depth-2',
        collapsed ? 'px-2 py-2' : 'px-3 py-2',
        embedded && 'p-0',
      )}
    >
      <Popover.Root>
        <Popover.Trigger asChild>
          <button
            type="button"
            className={classNames(
              'group inline-flex items-center rounded-md text-left text-sm transition-colors hover:bg-bolt-elements-background-depth-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-accent-action)]',
              collapsed ? 'h-[44px] w-[44px] justify-center px-0' : 'h-[44px] w-full gap-2 px-2',
            )}
            aria-label={t('userArea.shell.accountMenu')}
            title={collapsed ? t('userArea.shell.accountMenu') : undefined}
          >
            <span
              className={classNames(
                'vc-sidebar-avatar flex shrink-0 items-center justify-center rounded-full border border-bolt-elements-borderColor bg-bolt-elements-background-depth-3 text-[11px] font-semibold uppercase text-bolt-elements-textPrimary',
                collapsed ? 'h-7 w-7' : 'h-8 w-8',
              )}
              aria-hidden
            >
              {hasInitials ? initials : <UserIcon className={collapsed ? 'h-3.5 w-3.5' : 'h-4 w-4'} aria-hidden />}
            </span>
            {!collapsed ? (
              <span className="vc-sidebar-fade-label min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium leading-tight">{displayName}</span>
                <span className="block truncate text-[11px] leading-tight text-bolt-elements-textTertiary">
                  {t('userArea.shell.accountMenu')}
                </span>
              </span>
            ) : null}
            {collapsed ? <span className="vc-collapsed-nav-label">{t('userArea.shell.accountMenu')}</span> : null}
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            side={collapsed ? 'right' : 'top'}
            align={collapsed ? 'end' : 'start'}
            sideOffset={8}
            collisionPadding={12}
            hideWhenDetached
            className="vc-sidebar-popover z-[70] w-[min(14rem,calc(100vw-24px))] max-h-[min(420px,calc(100dvh-24px))] overflow-auto rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-1 shadow-lg"
          >
            <div className="border-b border-bolt-elements-borderColor px-3 py-2">
              <p className="truncate text-sm font-medium text-bolt-elements-textPrimary">{displayName}</p>
              {profile.bio ? (
                <p className="truncate text-[11px] text-bolt-elements-textTertiary">{profile.bio}</p>
              ) : null}
            </div>
            <div className="grid gap-0.5 py-1">
              <Popover.Close asChild>
                <Link
                  to="/account-settings"
                  className="flex min-h-[44px] items-center gap-2 rounded-md px-3 py-2 text-sm text-bolt-elements-textSecondary transition-colors hover:bg-bolt-elements-background-depth-3 hover:text-bolt-elements-textPrimary focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-accent-action)]"
                >
                  <Settings className="h-4 w-4" aria-hidden />
                  {t('userArea.shell.accountSettings')}
                </Link>
              </Popover.Close>
              <button
                type="button"
                onClick={() => toggleTheme()}
                className="flex min-h-[44px] items-center justify-between gap-2 rounded-md px-3 py-2 text-sm text-bolt-elements-textSecondary transition-colors hover:bg-bolt-elements-background-depth-3 hover:text-bolt-elements-textPrimary focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-accent-action)]"
              >
                <span className="flex items-center gap-2">
                  {theme === 'dark' ? (
                    <Sun className="h-4 w-4" aria-hidden />
                  ) : (
                    <Moon className="h-4 w-4" aria-hidden />
                  )}
                  {t('userArea.shell.theme')}
                </span>
                <span className="text-[11px] text-bolt-elements-textTertiary">
                  {theme === 'dark' ? t('userArea.shell.dark') : t('userArea.shell.light')}
                </span>
              </button>
            </div>
            <div className="border-t border-bolt-elements-borderColor pt-1">
              {/*
               * The sign-out Form is deliberately NOT wrapped in
               * <Popover.Close asChild>. `asChild` merges Radix's close
               * handler onto the Form itself, so clicking Submit closed the
               * popover — unmounting the portal content, and with it the form
               * — while the POST was still being dispatched. The result was an
               * intermittent sign-out that left the user on /dashboard.
               * Navigating to /login unmounts the popover anyway.
               */}
              <div>
                <Form method="post" action="/logout">
                  <button
                    type="submit"
                    className="flex min-h-[44px] w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-bolt-elements-textSecondary transition-colors hover:bg-bolt-elements-background-depth-3 hover:text-bolt-elements-textPrimary focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-accent-action)]"
                  >
                    <LogOut className="h-4 w-4" aria-hidden />
                    {t('userArea.shell.signOut')}
                  </button>
                </Form>
              </div>
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}

export function ProjectShell({
  projectId,
  title,
  description,
  children,
}: {
  projectId: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();

  return (
    <AppShell
      title={title}
      description={description}
      actions={<LinkButton to={`/projects/${projectId}/ide`}>{t('userArea.navigation.openIde')}</LinkButton>}
    >
      <div className="mb-6 overflow-x-auto rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-2 shadow-sm">
        <nav className="flex min-w-max gap-1" aria-label={t('userArea.project.navigation')}>
          {projectNav.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.labelKey}
                to={`/projects/${projectId}${item.suffix}`}
                end={item.suffix === ''}
                className={({ isActive }) =>
                  classNames(
                    'inline-flex min-h-[44px] items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
                    isActive
                      ? 'bg-bolt-elements-background-depth-3 text-bolt-elements-textPrimary'
                      : 'text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-3',
                  )
                }
              >
                <Icon className="h-4 w-4" aria-hidden />
                {t(item.labelKey)}
              </NavLink>
            );
          })}
        </nav>
      </div>
      {children}
    </AppShell>
  );
}

export function StatGrid({
  stats,
}: {
  stats: Array<{ label: string; value: string; detail: string; icon: Icon; to?: string; ariaLabel?: string }>;
}) {
  const { i18n } = useTranslation();
  const copy = getClientAstResidualCopy(i18n.resolvedLanguage ?? i18n.language);

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => {
        const Icon = stat.icon;

        const cardBody = (
          <>
            <CardHeader className="p-4 pb-2 sm:p-6 sm:pb-3">
              <div className="flex items-center justify-between">
                <CardDescription>{stat.label}</CardDescription>
                <span className="flex h-8 w-8 items-center justify-center rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-3">
                  <Icon className="h-4 w-4 text-bolt-elements-textSecondary" aria-hidden />
                </span>
              </div>
              <CardTitle className="text-2xl sm:text-3xl">{stat.value}</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
              <p className="text-xs text-bolt-elements-textSecondary">{stat.detail}</p>
            </CardContent>
          </>
        );

        if (stat.to) {
          return (
            <Link
              key={stat.label}
              to={stat.to}
              aria-label={
                stat.ariaLabel ??
                formatClientAstResidualCopy(copy['clientAst.dashboard.stat.view'], {
                  label: stat.label.toLocaleLowerCase(i18n.resolvedLanguage ?? i18n.language),
                })
              }
              className="group block rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-accent-action)]"
            >
              <Card className="h-full overflow-hidden border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 shadow-sm transition-colors group-hover:border-bolt-elements-borderColorActive">
                {cardBody}
              </Card>
            </Link>
          );
        }

        return (
          <Card
            key={stat.label}
            className="overflow-hidden border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 shadow-sm"
          >
            {cardBody}
          </Card>
        );
      })}
    </div>
  );
}

export function ProjectGrid({ projects = [] }: { projects?: ProjectCard[] }) {
  const { t } = useTranslation();

  if (projects.length === 0) {
    return (
      <EmptyState
        title={t('userArea.project.noneTitle')}
        description={t('userArea.project.noneBody')}
        actionLabel={t('userArea.navigation.createProject')}
        to="/projects/new"
        icon={Sparkles}
      />
    );
  }

  return (
    <div
      data-testid="project-grid"
      className="grid min-w-0 justify-start gap-4 overflow-x-hidden"
      style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 19rem), 1fr))' }}
    >
      {projects.map((project) => (
        <ProjectGridCard key={project.id} project={project} />
      ))}
    </div>
  );
}

function ProjectGridCard({ project }: { project: ProjectCard }) {
  const { t } = useTranslation();

  // E16: the ⋯ menu's Rename swaps the card title for an inline input.
  const [renaming, setRenaming] = useState(false);
  const lifecycle = project.lifecycle ?? 'draft';
  const statusLabel = localizedProjectStatus(project, t);

  return (
    <Card className="group flex h-full min-w-0 w-full max-w-[26rem] flex-col overflow-hidden border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 shadow-sm transition-colors hover:border-bolt-elements-borderColorActive">
      <div className="vc-project-preview relative aspect-[16/10] w-full overflow-hidden border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-3">
        <ProjectPreviewMedia
          project={project}
          className="relative z-[1] h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.015] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
        />
        <span
          className="absolute right-3 top-3 z-[2] inline-flex min-h-7 items-center gap-1.5 rounded-full bg-black/70 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-sm"
          aria-label={t('userArea.project.status', { status: statusLabel })}
        >
          <span
            className={classNames(
              'h-1.5 w-1.5 rounded-full',
              lifecycle === 'deployed'
                ? 'bg-[var(--status-success-text)]'
                : lifecycle === 'draft'
                  ? 'bg-[var(--status-info-text)]'
                  : 'bg-bolt-elements-textTertiary',
            )}
            aria-hidden
          />
          {statusLabel}
        </span>
      </div>

      <CardHeader className="p-4 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {renaming ? (
              <ProjectRenameForm project={project} onDone={() => setRenaming(false)} />
            ) : (
              <CardTitle className="line-clamp-2 min-h-12 text-base leading-6" title={project.name}>
                {project.name}
              </CardTitle>
            )}
            <CardDescription className="mt-1 truncate text-xs">
              {project.stack ?? project.sourceType ?? t('userArea.project.persistent')}
            </CardDescription>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <ProjectCardMenu project={project} onRename={() => setRenaming(true)} />
          </div>
        </div>
      </CardHeader>
      <CardContent className="mt-auto space-y-3 p-4 pt-0">
        <div className="grid min-w-0 grid-cols-2 gap-3 border-y border-bolt-elements-borderColor py-3 text-xs">
          <div className="flex min-w-0 items-start gap-2">
            <Activity className="mt-0.5 h-3.5 w-3.5 shrink-0 text-bolt-elements-textTertiary" aria-hidden />
            <div className="min-w-0">
              <span className="block text-[11px] text-bolt-elements-textTertiary">
                {t('userArea.project.activity')}
              </span>
              <span className="mt-0.5 block truncate font-medium text-bolt-elements-textSecondary">
                {project.updatedAtIso ? (
                  <RelativeTime value={project.updatedAtIso} />
                ) : (
                  (project.updated ?? t('userArea.project.recently'))
                )}
              </span>
            </div>
          </div>
          <div className="flex min-w-0 items-start gap-2">
            <Rocket className="mt-0.5 h-3.5 w-3.5 shrink-0 text-bolt-elements-textTertiary" aria-hidden />
            <div className="min-w-0">
              <span className="block text-[11px] text-bolt-elements-textTertiary">
                {t('userArea.project.deployments')}
              </span>
              <span className="mt-0.5 block truncate font-medium text-bolt-elements-textSecondary">
                {t('userArea.project.deploymentCount', { count: project.deploymentCount ?? 0 })}
              </span>
            </div>
          </div>
        </div>
        <Link
          to={project.ideUrl ?? `/projects/${project.id}/ide`}
          className="inline-flex min-h-[44px] w-full items-center justify-between gap-3 rounded-md bg-bolt-elements-button-primary-background px-3.5 text-sm font-medium text-bolt-elements-button-primary-text transition-colors hover:bg-bolt-elements-button-primary-backgroundHover focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-action-primary)]"
        >
          <span className="inline-flex min-w-0 items-center gap-2">
            <MonitorPlay className="h-4 w-4 shrink-0" aria-hidden />
            <span>{t('userArea.navigation.openIde')}</span>
          </span>
          <ArrowUpRight className="h-4 w-4 shrink-0" aria-hidden />
        </Link>
      </CardContent>
    </Card>
  );
}

/*
 * Neutral, theme-correct placeholder shown until a REAL preview screenshot has
 * been captured (or if the capture fails to load). Deliberately NOT the old
 * synthetic "browser window" mock, which misrepresented the project as a generic
 * template. A real thumbnail replaces this fallback when it loads successfully.
 */
function ProjectPreviewFallback({ project }: { project: ProjectCard }) {
  const { t } = useTranslation();

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-bolt-elements-background-depth-3 px-5 text-center text-bolt-elements-textTertiary">
      <span className="flex h-10 w-10 items-center justify-center rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2">
        <MonitorPlay className="h-5 w-5" aria-hidden />
      </span>
      <span className="text-xs font-medium text-bolt-elements-textSecondary">{t('userArea.project.noPreview')}</span>
      <span className="max-w-48 text-[11px] leading-4">{t('userArea.project.previewPending')}</span>
      <span className="sr-only">{t('userArea.project.noPreviewFor', { name: project.name })}</span>
    </div>
  );
}

/*
 * Au-delà de ce délai, une vignette qui n'est toujours pas arrivée est traitée
 * comme absente. `onError` ne suffit pas : une réponse qui traîne n'est ni un
 * chargement ni une erreur, et la carte restait alors un rectangle vide — c'est
 * exactement ce qu'on voyait quand la lecture de vignette côté API attendait un
 * stockage objet injoignable.
 */
/*
 * AV-UX point 12 : 6s était trop court pour la première lecture d'une vignette
 * réelle (302 vers une URL GCS signée, stockage froid) — la carte basculait sur
 * « Aucun aperçu » alors qu'un aperçu existait. 15s laisse passer le trajet
 * froid ; et l'échéance est désormais RÉVERSIBLE : l'image reste montée sous le
 * repli et le remplace dès que son `onLoad` arrive.
 */
const PREVIEW_IMAGE_DEADLINE_MS = 15_000;

export function ProjectPreviewMedia({ project, className }: { project: ProjectCard; className?: string }) {
  const { t } = useTranslation();
  const [failed, setFailed] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const imageRef = useRef<HTMLImageElement | null>(null);

  const url = project.previewImageUrl;

  useEffect(() => {
    setFailed(false);
    setTimedOut(false);

    if (!url) {
      return undefined;
    }

    const minuterie = setTimeout(() => {
      /*
       * `complete` couvre l'image déjà servie par le cache entre le rendu et
       * l'échéance, cas où aucun `onLoad` ne se déclenche.
       */
      if (!imageRef.current?.complete) {
        setTimedOut(true);
      }
    }, PREVIEW_IMAGE_DEADLINE_MS);

    return () => clearTimeout(minuterie);
  }, [url]);

  if (!url || failed) {
    return <ProjectPreviewFallback project={project} />;
  }

  return (
    <>
      <img
        ref={imageRef}
        src={url}
        alt={t('userArea.project.latestPreview', { name: project.name })}
        aria-hidden={timedOut || undefined}
        className={className}
        loading="lazy"
        onLoad={() => setTimedOut(false)}
        onError={() => setFailed(true)}
      />
      {/*
       * Slow-but-successful thumbnails recover: the fallback overlays the
       * still-mounted image, and the image's onLoad clears the deadline so the
       * real preview replaces "No preview yet" as soon as it arrives.
       */}
      {timedOut ? <ProjectPreviewFallback project={project} /> : null}
    </>
  );
}

function localizedProjectStatus(
  project: ProjectCard,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  const lifecycle = project.lifecycle ?? 'draft';

  if (lifecycle === 'deployed') {
    return t('userArea.project.statusDeployed');
  }

  if (lifecycle === 'archived') {
    return t('userArea.project.statusArchived');
  }

  return t('userArea.project.statusDraft');
}

export function ProjectStatusPill({ project }: { project: ProjectCard }) {
  const { t } = useTranslation();
  const lifecycle = project.lifecycle ?? 'draft';

  return (
    <StatusPill
      label={localizedProjectStatus(project, t)}
      tone={lifecycle === 'deployed' ? 'success' : lifecycle === 'draft' ? 'info' : 'neutral'}
    />
  );
}

export function TemplateGallery({
  compact = false,
  mode = 'public',
}: {
  compact?: boolean;
  mode?: 'public' | 'authenticated';
}) {
  const { t } = useTranslation();

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {templates.map((template) => (
        <Card
          key={template.name}
          className="group flex h-full flex-col overflow-hidden border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 shadow-sm transition-colors hover:bg-bolt-elements-background-depth-3"
        >
          <div className="vc-template-preview relative m-3 mb-0 overflow-hidden p-3">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_25%_20%,color-mix(in_srgb,var(--vc-ide-accent-action)_18%,transparent),transparent_34%),radial-gradient(circle_at_85%_10%,color-mix(in_srgb,var(--vc-ide-accent-success)_16%,transparent),transparent_32%)]" />
            <div className="relative flex h-20 items-center justify-center gap-3">
              {template.providers.map((provider, index) => {
                const Logo = provider.Logo;

                return (
                  <div
                    key={provider.name}
                    className="vc-template-provider-logo flex h-12 w-12 items-center justify-center rounded-lg shadow-[var(--vc-ui-shadow-md)] transition-transform duration-150 group-hover:-translate-y-0.5"
                    style={{ transitionDelay: `${index * 35}ms` }}
                    title={provider.name}
                    aria-label={t('userArea.template.providerLogo', { provider: provider.name })}
                  >
                    <Logo className="h-6 w-6" style={{ color: provider.color }} aria-hidden />
                  </div>
                );
              })}
            </div>
            <div className="relative mt-2 flex items-center justify-center gap-1.5">
              {template.providers.map((provider) => (
                <span
                  key={provider.name}
                  className="vc-template-provider-pill rounded-full px-2 py-0.5 text-[11px] font-medium"
                >
                  {provider.name}
                </span>
              ))}
            </div>
          </div>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-lg">{t(template.nameKey)}</CardTitle>
              <StatusPill label={t(template.tagKey)} />
            </div>
            <CardDescription>{t(template.stackKey)}</CardDescription>
          </CardHeader>
          {/*
            `mt-auto` pins this footer to the bottom of the (grid-stretched) card.
            The card was `display: block`, so content flowed from the top and a
            two-line title pushed its CTA 64px below its neighbours' — the
            "Use template" buttons did not line up across a row.
          */}
          <CardContent className="mt-auto flex items-center justify-between">
            <span className="text-sm text-bolt-elements-textSecondary">{t('userArea.template.productionStarter')}</span>
            {/*
              Authenticated "Use template" creates the project from this template and goes
              straight to the IDE from wherever the card renders (Dashboard included): POST to
              the /dashboard/templates action, which creates via /projects/from-template and
              redirects to the project IDE — no /templates detour.
            */}
            {mode === 'authenticated' ? (
              <Form method="post" action="/dashboard/templates">
                <input type="hidden" name="templateName" value={template.id} />
                <input type="hidden" name="name" value={t(template.nameKey)} />
                <Button type="submit" variant="outline" className="min-h-[44px]">
                  {t('userArea.template.use')}
                </Button>
              </Form>
            ) : compact ? (
              <LinkButton to="/templates" variant="outline">
                {t('userArea.template.use')}
              </LinkButton>
            ) : (
              <LinkButton to="/login" variant="outline">
                {t('userArea.template.signInToUse')}
              </LinkButton>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/**
 * @deprecated Use `EmptyState` from `~/components/ui/EmptyState` — this alias
 * only remains so stray imports keep compiling until they migrate, and will be
 * removed.
 */
export const EmptyPanel = EmptyState;

export type OnboardingStep = {
  key: string;
  title: string;
  description: string;
  done: boolean;
  actionLabel: string;
  to?: string;

  /** 32px tile glyph for the not-done state (e.g. the deploy ▲). */
  glyph?: React.ReactNode;
};

/*
 * "Get set up" onboarding checklist (validated mock): header with a 120×6
 * blue-action progress gauge + "N of 3", then one row per step — a green
 * check disc + "Done" pill once complete, the CURRENT step gets the solid
 * blue CTA, later steps an outline CTA. Renders only while completedSteps<3;
 * step states are derived from real signals by the dashboard loader.
 */
export function OnboardingChecklistCard({ steps }: { steps: OnboardingStep[] }) {
  const { t } = useTranslation();
  const completed = steps.filter((step) => step.done).length;

  if (completed >= steps.length) {
    return null;
  }

  const currentKey = steps.find((step) => !step.done)?.key;

  return (
    <section
      aria-label={t('userArea.setup.label')}
      className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-5 shadow-sm sm:p-6"
    >
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-[15px] font-semibold">{t('userArea.setup.label')}</h2>
        <div
          role="progressbar"
          aria-label={t('userArea.setup.progress')}
          aria-valuemin={0}
          aria-valuemax={steps.length}
          aria-valuenow={completed}
          className="h-[6px] w-[120px] overflow-hidden rounded-full bg-bolt-elements-background-depth-3"
        >
          <div
            className="h-full rounded-full bg-[var(--vc-ide-accent-action)]"
            style={{ width: `${Math.round((completed / steps.length) * 100)}%` }}
          />
        </div>
        <span className="text-[13px] text-bolt-elements-textSecondary">
          {t('userArea.setup.progressCount', { completed, total: steps.length })}
        </span>
      </div>
      <ul className="mt-4 flex flex-col gap-3">
        {steps.map((step) => {
          const isCurrent = step.key === currentKey;

          return (
            <li key={step.key} className="flex items-center gap-3">
              {step.done ? (
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                  style={{ background: 'var(--vc-ide-accent-success)' }}
                  aria-hidden
                >
                  <Check className="h-4 w-4 text-white" />
                </span>
              ) : (
                <span
                  className={classNames(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1',
                    isCurrent ? 'text-[var(--vc-ide-accent-action)]' : 'text-bolt-elements-textTertiary',
                  )}
                  aria-hidden
                >
                  {step.glyph ?? <span className="text-[13px] leading-none">•</span>}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-sm font-semibold text-bolt-elements-textPrimary">
                  {step.title}
                  {step.done ? (
                    <span
                      className="rounded-full px-1.5 py-0.5 text-[11px] font-semibold leading-none"
                      style={{
                        color: 'var(--status-success-text)',
                        background: 'color-mix(in srgb, var(--vc-ide-accent-success) 12%, transparent)',
                      }}
                    >
                      {t('userArea.setup.done')}
                    </span>
                  ) : null}
                </p>
                <p className="mt-0.5 truncate text-[13px] text-bolt-elements-textSecondary">{step.description}</p>
              </div>
              {!step.done && step.to ? (
                <Link
                  to={step.to}
                  className={classNames(
                    'inline-flex h-[44px] shrink-0 items-center justify-center rounded-md px-3 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-accent-action)]',
                    isCurrent
                      ? // SCR-007 : `--vc-ide-accent-action` est la marque vive — 2,80:1 sous blanc. Ton renforcé : 5,16:1.
                        'bg-[var(--vc-action-primary-strong)] text-white transition-opacity hover:opacity-90'
                      : 'border border-bolt-elements-borderColor text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3',
                  )}
                >
                  {step.actionLabel}
                </Link>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function SettingsForm({
  fields,
  submitLabel,
}: {
  fields: Array<{ label: string; name: string; type?: string; placeholder?: string; defaultValue?: string }>;
  submitLabel?: string;
}) {
  const { t } = useTranslation();

  return (
    <form className="grid gap-4" method="post">
      {fields.map((field) => (
        <label key={field.name} className="grid gap-2 text-sm font-medium">
          {field.label}
          <input
            className="h-[44px] rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 text-sm outline-none focus:border-bolt-elements-focus"
            name={field.name}
            type={field.type ?? 'text'}
            placeholder={field.placeholder}
            defaultValue={field.defaultValue}
          />
        </label>
      ))}
      <div>
        <Button type="submit" className="min-h-[44px]">
          {submitLabel ?? t('userArea.form.saveChanges')}
        </Button>
      </div>
    </form>
  );
}

export function ActivityList({ items }: { items: Array<{ title: string; detail: React.ReactNode; icon?: Icon }> }) {
  return (
    <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 shadow-sm">
      {items.map((item, index) => {
        const Icon = item.icon ?? Activity;
        return (
          <div
            key={`${item.title}-${index}`}
            className={classNames('flex gap-3 p-4', index > 0 && 'border-t border-bolt-elements-borderColor')}
          >
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-bolt-elements-background-depth-3">
              <Icon className="h-4 w-4" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="break-words text-sm font-medium">{item.title}</p>
              <p className="mt-1 break-words text-sm text-bolt-elements-textSecondary">{item.detail}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const COMMAND_PALETTE_ACTIONS = [
  { labelKey: 'userArea.command.createProject', to: '/projects/new', hintKey: 'userArea.command.action' },
  { labelKey: 'userArea.command.openRecent', to: '/recent-projects', hintKey: 'userArea.command.action' },
  { labelKey: 'userArea.command.importGithub', to: '/import-github', hintKey: 'userArea.command.action' },
  { labelKey: 'userArea.command.viewUsage', to: '/usage', hintKey: 'userArea.command.action' },
  { labelKey: 'userArea.command.inviteTeammate', to: '/invitations', hintKey: 'userArea.command.action' },
  { labelKey: 'userArea.command.rotateApiKey', to: '/api-keys', hintKey: 'userArea.command.action' },
  {
    labelKey: 'userArea.command.workspaceSettings',
    to: '/workspace-settings',
    hintKey: 'userArea.command.settings',
  },
] as const satisfies readonly {
  labelKey: UserAreaTranslationKey;
  to: string;
  hintKey: UserAreaTranslationKey;
}[];

type UserAreaTranslate = (key: UserAreaTranslationKey, options?: Record<string, unknown>) => string;

const defaultUserAreaTranslate: UserAreaTranslate = (key, options) => {
  const template = userAreaEn[key];

  return template.replace(/\{(\w+)\}/gu, (token, name: string) => {
    const value = options?.[name];

    return value === undefined ? token : String(value);
  });
};

function localizedCommandPaletteActions(translate: UserAreaTranslate): CommandPaletteItem[] {
  return COMMAND_PALETTE_ACTIONS.map((item) => ({
    label: translate(item.labelKey),
    to: item.to,
    hint: translate(item.hintKey),
  }));
}

/**
 * Build the full command list: the static dashboard actions plus a "jump to
 * project" entry for every project the caller passes in, so the palette can
 * navigate to any of the user's real projects.
 */
export function buildCommandPaletteItems(
  projects: ProjectCard[] = [],
  translate: UserAreaTranslate = defaultUserAreaTranslate,
): CommandPaletteItem[] {
  const projectItems: CommandPaletteItem[] = projects.map((project) => ({
    label: project.name,
    to: project.ideUrl ?? `/projects/${project.id}`,
    hint: translate('userArea.command.project'),
  }));

  return [...localizedCommandPaletteActions(translate), ...projectItems];
}

export function CommandPalettePreview({ projects = [] }: { projects?: ProjectCard[] }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const allItems = useMemo(() => buildCommandPaletteItems(projects, (key, options) => t(key, options)), [projects, t]);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  /*
   * Recents load after mount (localStorage is client-only) so the server and
   * first client render stay identical — the Recent section pops in hydration-
   * safely. Stored as destinations and resolved against the live item list, so
   * a deleted project simply drops out.
   */
  const [recentDestinations, setRecentDestinations] = useState<string[]>([]);

  useEffect(() => {
    setRecentDestinations(readRecentCommands());
  }, []);

  const recentItems = useMemo(
    () =>
      recentDestinations
        .map((destination) => allItems.find((item) => item.to === destination))
        .filter((item): item is CommandPaletteItem => Boolean(item)),
    [allItems, recentDestinations],
  );

  const rememberCommand = useCallback((to: string) => {
    recordRecentCommand(to);
    setRecentDestinations((existing) => pushRecentCommand(existing, to));
  }, []);

  const visibleItems = useMemo(() => filterCommandPaletteItems(allItems, query), [allItems, query]);

  /* Keep the highlight in range whenever the filtered list shrinks/grows. */
  useEffect(() => {
    setActiveIndex((index) => clampSelectionIndex(index, visibleItems.length));
  }, [visibleItems.length]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      const result = resolveCommandPaletteKey(event.key, activeIndex, visibleItems);

      if (!result.handled) {
        return;
      }

      event.preventDefault();
      setActiveIndex(result.nextIndex);

      if (result.navigateTo) {
        rememberCommand(result.navigateTo.to);
        navigate(result.navigateTo.to);
      }
    },
    [activeIndex, navigate, rememberCommand, visibleItems],
  );

  return (
    <div className="min-w-0 max-w-full rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-3 shadow-sm">
      <label className="flex h-[44px] items-center gap-2 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 text-sm">
        <Command className="h-4 w-4 text-bolt-elements-textTertiary" aria-hidden />
        <input
          className="h-[44px] min-w-0 flex-1 bg-transparent outline-none"
          placeholder={t('userArea.command.placeholder')}
          aria-label={t('userArea.command.searchLabel')}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={handleKeyDown}
        />
        <kbd className="vc-keyboard-shortcut rounded border border-bolt-elements-borderColor px-1.5 py-0.5 text-xs text-bolt-elements-textTertiary">
          K
        </kbd>
      </label>
      {query.trim().length === 0 && recentItems.length > 0 ? (
        <div className="mt-3">
          <p className="vc-sidebar-group-label px-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.5px] text-bolt-elements-textTertiary">
            {t('userArea.command.recent')}
          </p>
          <div className="grid gap-1">
            {recentItems.map((command) => (
              <Link
                key={`recent-${command.to}`}
                to={command.to}
                onClick={() => rememberCommand(command.to)}
                className="flex min-h-[44px] items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-bolt-elements-background-depth-3"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate">{command.label}</span>
                  {command.hint ? (
                    <span className="shrink-0 text-xs text-bolt-elements-textTertiary">{command.hint}</span>
                  ) : null}
                </span>
                <span className="text-xs text-bolt-elements-textTertiary">{t('userArea.command.recent')}</span>
              </Link>
            ))}
          </div>
        </div>
      ) : null}
      <div className="mt-3 grid gap-1" role="listbox" aria-label={t('userArea.command.results')}>
        {visibleItems.length === 0 ? (
          <p className="px-3 py-6 text-center text-[13px] text-bolt-elements-textTertiary">
            {t('userArea.command.noResults', { query: query.trim() })}
          </p>
        ) : (
          visibleItems.map((command, index) => (
            <Link
              key={`${command.to}-${command.label}`}
              to={command.to}
              role="option"
              aria-selected={index === activeIndex}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => rememberCommand(command.to)}
              className={classNames(
                'flex min-h-[44px] items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-bolt-elements-background-depth-3',
                index === activeIndex && 'bg-bolt-elements-background-depth-3',
              )}
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate">{command.label}</span>
                {command.hint ? (
                  <span className="shrink-0 text-xs text-bolt-elements-textTertiary">{command.hint}</span>
                ) : null}
              </span>
              <span className="text-xs text-bolt-elements-textTertiary">{t('userArea.command.enter')}</span>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}

export function StatusPill({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'success' | 'info' }) {
  return (
    <span
      className={classNames(
        'shrink-0 rounded-full border px-2 py-1 text-xs',
        tone === 'success' &&
          'border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-[var(--status-success-text)]',
        tone === 'info' &&
          'border-[var(--status-info-border)] bg-[var(--status-info-bg)] text-[var(--status-info-text)]',
        tone === 'neutral' && 'border-bolt-elements-borderColor text-bolt-elements-textSecondary',
      )}
    >
      {label}
    </span>
  );
}

export function LinkButton({
  to,
  children,
  variant = 'default',
}: {
  to: string;
  children: React.ReactNode;
  variant?: 'default' | 'outline' | 'ghost';
}) {
  const className = classNames(
    'inline-flex h-[44px] items-center justify-center gap-2 rounded-md px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-action-primary)]',
    variant === 'default' &&
      'bg-bolt-elements-button-primary-background text-bolt-elements-button-primary-text hover:bg-bolt-elements-button-primary-backgroundHover',
    variant === 'outline' &&
      'border border-bolt-elements-borderColor text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-2',
    variant === 'ghost' &&
      'text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-2 hover:text-bolt-elements-textPrimary',
  );

  if (/^(https?:)?\/\//.test(to)) {
    return (
      <a href={to} className={className}>
        {children}
      </a>
    );
  }

  return (
    <Link to={to} className={className}>
      {children}
    </Link>
  );
}

function TopBar({
  onOpenDrawer,
  onStartTour,
  title,
}: {
  onOpenDrawer: () => void;
  onStartTour: () => void;
  title?: string;
}) {
  const { t } = useTranslation();

  return (
    <header
      className="sticky top-0 z-10 flex h-[56px] items-center justify-between gap-3 border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-1/95 px-4 backdrop-blur-xl sm:px-6"
      data-vc-tour-target="tools"
    >
      <button
        type="button"
        onClick={onOpenDrawer}
        className="relative inline-flex h-[44px] min-w-[44px] shrink-0 items-center justify-center gap-2 rounded-md px-2 text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-2 hover:text-bolt-elements-textPrimary focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-accent-action)] lg:hidden"
        aria-label={t('userArea.topbar.openNavigation')}
        data-vc-tour-target="navigation"
      >
        <Menu className="h-4 w-4" aria-hidden />
        {/*
         * `sm:sr-only` showed this label ONLY below 640px — precisely the width
         * where the top bar has the least room, so it stole space from the page
         * title beside it ("Tableau de bord" got 77px of the 119px it needs and
         * rendered as "Tableau …"). The button already carries an aria-label, so
         * hiding the duplicate text costs nothing and returns 21px to the title.
         */}
        <span className="sr-only">{t('userArea.topbar.menu')}</span>
      </button>
      {/* The title remains visible beside the tablet rail, where the sidebar only shows icons. */}
      {title ? <span className="min-w-0 flex-1 truncate text-base font-semibold xl:hidden">{title}</span> : null}
      <div className="hidden flex-1 xl:block" />
      <Link
        to="/command-palette"
        className="ml-auto hidden min-h-[44px] items-center gap-2 rounded-md border border-bolt-elements-borderColor px-3 py-1.5 text-sm text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-2 hover:text-bolt-elements-textPrimary focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-accent-action)] sm:inline-flex"
        aria-label={t('userArea.topbar.openCommandPalette')}
      >
        <Command className="h-4 w-4" aria-hidden />
        {t('userArea.topbar.search')}
        <kbd className="vc-keyboard-shortcut rounded border border-bolt-elements-borderColor px-1.5 py-0.5 text-[11px] text-bolt-elements-textTertiary">
          ⌘K
        </kbd>
      </Link>
      <TopBarHelp onStartTour={onStartTour} />
      {/*
       * Masquée sous 640px. À 390px les contrôles fixes de cette barre
       * (hamburger 44 + aide 44 + langue ~90 + notifications 44 + gaps 36 +
       * padding 32 = 290px) ne laissaient que 98px au titre, alors que les
       * pages de réglages en demandent 117 à 168 : « Usage overview »,
       * « Organization members », « Workspace settings »… étaient toutes
       * tronquées. La bascule reste accessible dans le panneau Réglages, et
       * la langue est de toute façon une préférence de compte persistée —
       * contrairement au titre, qui indique où l'on se trouve.
       */}
      <span className="hidden shrink-0 items-center sm:inline-flex">
        <LanguageSwitch />
      </span>
      <TopBarNotifications />
    </header>
  );
}

function TopBarHelp({ onStartTour }: { onStartTour: () => void }) {
  const { t } = useTranslation();

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          className="relative inline-flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-md text-bolt-elements-textSecondary transition-colors hover:bg-bolt-elements-background-depth-2 hover:text-bolt-elements-textPrimary focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-action-primary)]"
          aria-label={t('userArea.topbar.helpTour')}
          title={t('userArea.topbar.helpTour')}
          data-vc-tour-target="help"
        >
          <LifeBuoy className="h-4 w-4" aria-hidden />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="end"
          sideOffset={8}
          collisionPadding={12}
          className="z-[90] w-[min(18rem,calc(100vw-24px))] rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-2 text-bolt-elements-textPrimary shadow-xl"
          aria-label={t('userArea.topbar.helpMenu')}
        >
          <div className="px-2 pb-2 pt-1">
            <p className="text-sm font-semibold">{t('userArea.topbar.help')}</p>
            <p className="mt-1 text-xs leading-5 text-bolt-elements-textTertiary">
              {t('userArea.topbar.helpDescription')}
            </p>
          </div>
          <div className="grid gap-1 border-t border-bolt-elements-borderColor pt-2">
            <Popover.Close asChild>
              <button
                type="button"
                onClick={onStartTour}
                className="flex min-h-[44px] w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-bolt-elements-textSecondary transition-colors hover:bg-bolt-elements-background-depth-3 hover:text-bolt-elements-textPrimary focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-action-primary)]"
              >
                <BookOpen className="h-4 w-4" aria-hidden />
                {t('userArea.topbar.openTour')}
              </button>
            </Popover.Close>
            <Popover.Close asChild>
              <Link
                to="/help-center"
                className="flex min-h-[44px] items-center gap-2 rounded-md px-3 py-2 text-sm text-bolt-elements-textSecondary transition-colors hover:bg-bolt-elements-background-depth-3 hover:text-bolt-elements-textPrimary focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-action-primary)]"
              >
                <LifeBuoy className="h-4 w-4" aria-hidden />
                {t('userArea.topbar.helpCenter')}
              </Link>
            </Popover.Close>
            <Popover.Close asChild>
              <Link
                to="/support"
                className="flex min-h-[44px] items-center gap-2 rounded-md px-3 py-2 text-sm text-bolt-elements-textSecondary transition-colors hover:bg-bolt-elements-background-depth-3 hover:text-bolt-elements-textPrimary focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-action-primary)]"
              >
                <MailPlus className="h-4 w-4" aria-hidden />
                {t('userArea.topbar.contactSupport')}
              </Link>
            </Popover.Close>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/* Mirrors FeedNotification in routes/notifications.tsx (the /api/notifications proxy of GET /user/notifications). */
type TopBarNotification = {
  id: string;
  title: string;
  read: boolean;
  createdAt: string;
};

type TopBarNotificationFeed = {
  notifications: TopBarNotification[];
  unreadCount: number;
  unavailable?: boolean;
};

type TopBarNotificationState = {
  feed: TopBarNotificationFeed | null;
  phase: 'loading' | 'ready' | 'error';
};

const TOP_BAR_FEED_LIMIT = 8;
const TOP_BAR_FEED_POLL_MS = 60_000;
const TOP_BAR_FEED_TIMEOUT_MS = 12_000;

function TopBarNotifications() {
  const { t } = useTranslation();
  const [feedState, setFeedState] = useState<TopBarNotificationState>({ feed: null, phase: 'loading' });
  const [reloadToken, setReloadToken] = useState(0);
  const markAllFetcher = useFetcher<{ ok: boolean; unreadCount?: number }>();
  const markingAll = markAllFetcher.state !== 'idle';

  /*
   * The badge needs the unread count before the popover ever opens, so the
   * cheapest honest option is a light poll of the real feed: fetch on mount
   * plus every 60s via the existing /api/notifications proxy (skipped while
   * the tab is hidden). No socket, no per-open refetch.
   */
  useEffect(() => {
    let cancelled = false;

    const activeControllers = new Set<AbortController>();

    const load = async (foreground: boolean) => {
      if (document.hidden) {
        return;
      }

      if (foreground) {
        setFeedState((current) => ({ ...current, phase: 'loading' }));
      }

      const controller = new AbortController();

      activeControllers.add(controller);

      const timeout = window.setTimeout(() => controller.abort(), TOP_BAR_FEED_TIMEOUT_MS);

      try {
        const response = await fetch('/api/notifications', {
          headers: { accept: 'application/json' },
          signal: controller.signal,
        });

        if (!response.ok) {
          if (!cancelled) {
            setFeedState((current) => ({ ...current, phase: 'error' }));
          }

          return;
        }

        const payload = (await response.json()) as TopBarNotificationFeed;

        if (payload.unavailable || !Array.isArray(payload.notifications)) {
          if (!cancelled) {
            setFeedState((current) => ({ ...current, phase: 'error' }));
          }

          return;
        }

        if (!cancelled) {
          setFeedState({
            feed: { notifications: payload.notifications, unreadCount: payload.unreadCount ?? 0 },
            phase: 'ready',
          });
        }
      } catch {
        if (!cancelled) {
          setFeedState((current) => ({ ...current, phase: 'error' }));
        }
      } finally {
        window.clearTimeout(timeout);
        activeControllers.delete(controller);
      }
    };

    void load(true);

    const timer = window.setInterval(() => void load(false), TOP_BAR_FEED_POLL_MS);

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        void load(true);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      activeControllers.forEach((controller) => controller.abort());
    };
  }, [reloadToken]);

  // Fold a successful "Mark all read" back into the polled snapshot immediately.
  useEffect(() => {
    if (markAllFetcher.data?.ok) {
      const confirmedUnread = markAllFetcher.data.unreadCount ?? 0;
      setFeedState((current) => ({
        ...current,
        feed: current.feed
          ? {
              notifications: current.feed.notifications.map((notification) => ({ ...notification, read: true })),
              unreadCount: confirmedUnread,
            }
          : null,
      }));
    }
  }, [markAllFetcher.data]);

  const { feed, phase } = feedState;
  const unreadCount = feed?.unreadCount ?? 0;
  const notifications = (feed?.notifications ?? []).slice(0, TOP_BAR_FEED_LIMIT);
  const retry = () => setReloadToken((current) => current + 1);

  return (
    <UiPopover
      side="bottom"
      align="end"
      testId="topbar-notifications-popover"
      contentClassName="w-[min(22rem,calc(100vw-32px))] p-0 text-bolt-elements-textPrimary"
      trigger={
        <button
          type="button"
          className="relative inline-flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-md text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-2 hover:text-bolt-elements-textPrimary focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-accent-action)]"
          aria-label={
            phase === 'error' && !feed
              ? t('userArea.notifications.unavailable')
              : unreadCount > 0
                ? t('userArea.notifications.unread', { count: unreadCount })
                : t('userArea.notifications.label')
          }
        >
          <Bell className="h-4 w-4" aria-hidden />
          {unreadCount > 0 ? (
            <span
              className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-bolt-elements-item-contentAccent px-1 text-[11px] font-semibold leading-none text-white"
              aria-hidden
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          ) : null}
        </button>
      }
    >
      <div className="flex items-center justify-between gap-2 border-b border-bolt-elements-borderColor px-3 py-2">
        <p className="text-sm font-semibold">{t('userArea.notifications.label')}</p>
        {unreadCount > 0 ? (
          <markAllFetcher.Form method="post" action="/api/notifications/read-all">
            <button
              type="submit"
              disabled={markingAll}
              className="min-h-[44px] rounded px-2 text-xs font-medium text-[var(--vc-ide-accent-action)] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-accent-action)] disabled:opacity-60"
            >
              {markingAll ? t('userArea.notifications.marking') : t('userArea.notifications.markAllRead')}
            </button>
          </markAllFetcher.Form>
        ) : null}
      </div>
      {phase === 'loading' ? (
        <AsyncPanelSkeleton label={t('userArea.notifications.loading')} rows={2} compact className="m-3" />
      ) : phase === 'error' && !feed ? (
        <AsyncPanelError
          title={t('userArea.notifications.loadFailed')}
          description={t('userArea.notifications.loadFailedBody')}
          onRetry={retry}
          compact
          className="m-3"
        />
      ) : (
        <>
          {phase === 'error' ? (
            <AsyncPanelError
              title={t('userArea.notifications.outdated')}
              description={t('userArea.notifications.outdatedBody')}
              onRetry={retry}
              compact
              className="m-3"
            />
          ) : null}
          {notifications.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-bolt-elements-textSecondary">
              {t('userArea.notifications.empty')}
            </p>
          ) : (
            <ul className="max-h-80 divide-y divide-bolt-elements-borderColor overflow-y-auto">
              {notifications.map((notification) => (
                <li key={notification.id} className="flex items-start gap-2 px-3 py-2.5">
                  <span
                    className={classNames(
                      'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                      notification.read ? 'bg-transparent' : 'bg-bolt-elements-item-contentAccent',
                    )}
                    aria-label={notification.read ? undefined : t('userArea.notifications.unreadBadge')}
                  />
                  <span className="min-w-0 flex-1">
                    <span
                      className={classNames(
                        'block truncate text-sm',
                        notification.read ? 'text-bolt-elements-textSecondary' : 'font-semibold',
                      )}
                    >
                      {notification.title}
                    </span>
                    <RelativeTime
                      value={notification.createdAt}
                      className="mt-0.5 block text-[11px] text-bolt-elements-textTertiary"
                    />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <div className="border-t border-bolt-elements-borderColor p-1">
        <Popover.Close asChild>
          <Link
            to="/notifications"
            className="flex min-h-[44px] items-center justify-center rounded-md px-3 py-2 text-sm text-bolt-elements-textSecondary transition-colors hover:bg-bolt-elements-background-depth-3 hover:text-bolt-elements-textPrimary focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-accent-action)]"
          >
            {t('userArea.notifications.viewAll')}
          </Link>
        </Popover.Close>
      </div>
    </UiPopover>
  );
}

export function SignOutButton({
  className,
  compact = false,
  iconOnly = false,
}: {
  className?: string;
  compact?: boolean;
  iconOnly?: boolean;
}) {
  const { t } = useTranslation();

  return (
    <Form method="post" action="/logout" className={iconOnly ? 'relative' : undefined}>
      <button
        type="submit"
        className={classNames(
          'group inline-flex h-[44px] items-center gap-2 rounded-md px-3 text-sm text-bolt-elements-textSecondary transition-colors hover:bg-bolt-elements-background-depth-2 hover:text-bolt-elements-textPrimary',
          className,
        )}
        aria-label={t('userArea.shell.signOut')}
        title={iconOnly ? t('userArea.shell.signOut') : undefined}
      >
        <LogOut className={classNames('shrink-0', iconOnly ? 'h-[18px] w-[18px]' : 'h-4 w-4')} aria-hidden />
        {iconOnly ? null : !compact ? (
          <span>{t('userArea.shell.signOut')}</span>
        ) : (
          <span className="hidden sm:inline">{t('userArea.shell.signOut')}</span>
        )}
        {iconOnly ? <span className="vc-collapsed-nav-label">{t('userArea.shell.signOut')}</span> : null}
      </button>
    </Form>
  );
}

function NavSection({ label, items, collapsed }: { label?: string; items: NavItem[]; collapsed: boolean }) {
  return (
    <div className={classNames('w-full', collapsed && 'flex flex-col items-center')}>
      {label ? (
        !collapsed ? (
          <p className="vc-sidebar-group-label vc-sidebar-fade-label px-3 pb-0.5 text-[11px] font-semibold uppercase tracking-[0.5px] text-bolt-elements-textTertiary">
            {label}
          </p>
        ) : (
          <div className="vc-sidebar-divider mb-0.5 mt-0.5 h-px w-6 bg-bolt-elements-borderColor" aria-hidden />
        )
      ) : null}
      <NavGroup items={items} collapsed={collapsed} />
    </div>
  );
}

function CreateProjectCta({ collapsed }: { collapsed: boolean }) {
  const { t } = useTranslation();

  return (
    <NavLink
      to="/projects/new"
      end
      className={({ isActive }) =>
        classNames(
          'vc-sidebar-cta group relative inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-[12px] font-semibold transition-[background-color,filter,box-shadow] focus:outline-none focus:ring-2 focus:ring-[var(--vc-ide-accent-action)] focus:ring-offset-2 focus:ring-offset-bolt-elements-background-depth-2',
          collapsed ? 'h-[44px] w-[44px]' : 'h-[44px] w-full px-3',
          isActive && 'vc-sidebar-cta--active',
        )
      }
      aria-label={collapsed ? t('userArea.navigation.createProject') : undefined}
      title={collapsed ? t('userArea.navigation.createProject') : undefined}
      data-vc-tour-target="create-project"
    >
      <Plus className="h-4 w-4 shrink-0" aria-hidden />
      {!collapsed ? (
        <span className="vc-sidebar-fade-label truncate">{t('userArea.navigation.newProject')}</span>
      ) : null}
      {collapsed ? <span className="vc-collapsed-nav-label">{t('userArea.navigation.createProject')}</span> : null}
    </NavLink>
  );
}

function NavGroup({ items, collapsed = false }: { items: NavItem[]; collapsed?: boolean }) {
  const { t } = useTranslation();

  return (
    <div className={classNames('grid w-full gap-0', collapsed && 'place-items-center')}>
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              classNames(
                'vc-sidebar-nav-item group relative flex items-center rounded-md text-[13px] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-accent-action)]',
                collapsed ? 'h-[44px] w-[44px] justify-center px-0' : 'h-[44px] w-full gap-2 px-3',
                isActive
                  ? 'vc-sidebar-nav-item--active text-bolt-elements-textPrimary'
                  : 'text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-3 hover:text-bolt-elements-textPrimary',
              )
            }
            aria-label={collapsed ? t(item.labelKey) : undefined}
            title={collapsed ? t(item.labelKey) : undefined}
          >
            <Icon
              className={classNames(
                'vc-sidebar-nav-icon shrink-0 transition-transform duration-150 group-hover:scale-[1.05]',
                collapsed ? 'h-[17px] w-[17px]' : 'h-[18px] w-[18px]',
              )}
              aria-hidden
            />
            {!collapsed ? <span className="vc-sidebar-fade-label flex-1 truncate">{t(item.labelKey)}</span> : null}
            {!collapsed && item.shortcut ? (
              <kbd className="vc-keyboard-shortcut vc-sidebar-shortcut ml-auto rounded border border-bolt-elements-borderColor px-1 py-0 text-[11px] font-medium leading-4 text-bolt-elements-textTertiary">
                {item.shortcut}
              </kbd>
            ) : null}
            {collapsed ? (
              <span className="vc-collapsed-nav-label">
                {t(item.labelKey)}
                {item.shortcut ? <span className="ml-2 opacity-60">{item.shortcut}</span> : null}
              </span>
            ) : null}
          </NavLink>
        );
      })}
    </div>
  );
}

function NavButton({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        classNames(
          'inline-flex min-h-[44px] items-center rounded-md px-3 py-2 text-sm transition-colors hover:bg-bolt-elements-background-depth-2',
          isActive ? 'text-bolt-elements-textPrimary' : 'text-bolt-elements-textSecondary',
        )
      }
    >
      {children}
    </NavLink>
  );
}

export function statsFromUsage(
  input?: {
    projects?: number;
    activeWorkspaces?: number;
    planName?: string;
    usageEvents?: number;
    aiCostCents?: number;
  },
  translate: UserAreaTranslate = defaultUserAreaTranslate,
) {
  const usageEvents = input?.usageEvents ?? 0;

  return [
    {
      label: translate('userArea.stats.projects'),
      value: String(input?.projects ?? 0),
      detail: translate('userArea.stats.projectsDetail'),
      icon: Boxes,
      to: '/projects',
      ariaLabel: translate('userArea.stats.viewProjects'),
    },
    {
      label: translate('userArea.stats.activeWorkspaces'),
      value: String(input?.activeWorkspaces ?? 0),
      detail: translate('userArea.stats.activeWorkspacesDetail'),
      icon: MonitorPlay,
      to: '/usage',
      ariaLabel: translate('userArea.stats.viewWorkspaceUsage'),
    },
    {
      label: translate('userArea.stats.plan'),
      value:
        !input?.planName || input.planName.toLowerCase() === 'free' ? translate('userArea.stats.free') : input.planName,
      detail: translate('userArea.stats.planDetail'),
      icon: CreditCard,
      to: '/billing',
      ariaLabel: translate('userArea.stats.viewPlanBilling'),
    },
    {
      label: translate('userArea.stats.aiCost'),
      value: formatUserAreaNumber((input?.aiCostCents ?? 0) / 100, { style: 'currency', currency: 'EUR' }),
      detail: translate(
        usageEvents === 1 ? 'userArea.stats.meteredActions_one' : 'userArea.stats.meteredActions_other',
        { count: usageEvents },
      ),
      icon: Sparkles,
      to: '/usage',
      ariaLabel: translate('userArea.stats.viewAiUsage'),
    },
  ];
}

export const projectActivity = [
  {
    title: legacyMarketingEn['legacyMarketing.activity.workspaceStarted'],
    detail: legacyMarketingEn['legacyMarketing.activity.workspaceStartedDetail'],
    icon: MonitorPlay,
  },
  {
    title: legacyMarketingEn['legacyMarketing.activity.snapshotCreated'],
    detail: legacyMarketingEn['legacyMarketing.activity.snapshotCreatedDetail'],
    icon: Layers,
  },
  {
    title: legacyMarketingEn['legacyMarketing.activity.deploymentQueued'],
    detail: legacyMarketingEn['legacyMarketing.activity.deploymentQueuedDetail'],
    icon: Rocket,
  },
];

export const importOptions = [
  {
    title: userAreaEn['userArea.import.githubTitle'],
    titleKey: 'userArea.import.githubTitle',
    description: userAreaEn['userArea.import.githubBody'],
    descriptionKey: 'userArea.import.githubBody',
    to: '/import-github',
    icon: Github,
  },
  {
    title: userAreaEn['userArea.import.zipTitle'],
    titleKey: 'userArea.import.zipTitle',
    description: userAreaEn['userArea.import.zipBody'],
    descriptionKey: 'userArea.import.zipBody',
    to: '/import-zip',
    icon: FileArchive,
  },
  {
    title: userAreaEn['userArea.import.promptTitle'],
    titleKey: 'userArea.import.promptTitle',
    description: userAreaEn['userArea.import.promptBody'],
    descriptionKey: 'userArea.import.promptBody',
    to: '/projects/new',
    icon: Sparkles,
  },
  {
    title: userAreaEn['userArea.import.templateTitle'],
    titleKey: 'userArea.import.templateTitle',
    description: userAreaEn['userArea.import.templateBody'],
    descriptionKey: 'userArea.import.templateBody',
    to: '/dashboard/templates',
    icon: Upload,
  },
] as const satisfies readonly {
  title: string;
  titleKey: UserAreaTranslationKey;
  description: string;
  descriptionKey: UserAreaTranslationKey;
  to: string;
  icon: Icon;
}[];

export const publicFooterLinks = [
  { label: legacyMarketingEn['legacyMarketing.nav.privacy'], to: '/privacy' },
  { label: legacyMarketingEn['legacyMarketing.nav.terms'], to: '/terms' },
  { label: legacyMarketingEn['legacyMarketing.nav.acceptableUse'], to: '/acceptable-use' },
  { label: legacyMarketingEn['legacyMarketing.nav.security'], to: '/security' },
  { label: legacyMarketingEn['legacyMarketing.nav.contact'], to: '/contact-sales' },
  { label: legacyMarketingEn['legacyMarketing.nav.docs'], to: '/docs' },
];

export const publicFeatureIcons = { BookOpen, MailPlus, Globe2, ShieldCheck };
