import { useStore } from '@nanostores/react';
import * as Popover from '@radix-ui/react-popover';
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
import { useCallback, useEffect, useMemo, useState } from 'react';
import type React from 'react';
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
import { EcodeExactPublicShell } from '~/components/marketing/ecode-exact/EcodeExactShell';
import { Button } from '~/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/Card';
import { EmptyState } from '~/components/ui/EmptyState';
import UiPopover from '~/components/ui/Popover';
import { RelativeTime } from '~/components/ui/RelativeTime';
import { SkipLink } from '~/components/ui/SkipLink';
import {
  projectDeploymentSummary,
  projectLifecycleDisplayLabel,
  type ProjectLifecycle,
} from '~/lib/project-card-presentation';
import { profileStore } from '~/lib/stores/profile';
import { themeStore, toggleTheme } from '~/lib/stores/theme';
import { resolveUserAreaSurface } from '~/lib/user-area-surface';
import { statusDisplayLabel } from '~/lib/user-facing-labels';
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
  stack: string;
  tag: string;
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
  tagline: 'Build software fast with AI',
  description: 'Code with AI. Deploy instantly. Share with the world. Build and ship software 10x faster.',
  legalName: 'E-Code.AI (Snatch Group Limited)',
  logoSrc: '/assets/logo.svg',
  aiAvatarSrc: '/assets/ai-avatar.svg',
  faviconSrc: '/favicon.svg',
  appleTouchIconSrc: '/apple-touch-icon.png',
  repositoryUrl: 'https://github.com/openaxcloud/vibecore',
} as const;

export const publicNav = [
  { label: 'Product', to: '/features' },
  { label: 'Solutions', to: '/solutions/app-builder' },
  { label: 'Resources', to: '/docs' },
  { label: 'Company', to: '/about' },
  { label: 'Pricing', to: '/pricing' },
  { label: 'Teams', to: '/team' },
];

export const publicMarketingMenus = {
  product: [
    ['AI Agent', '/ai-agent', 'Build production-ready apps with natural language prompts.'],
    ['Browser IDE', '/features', 'Enterprise-grade development workspace built for teams.'],
    ['Multiplayer', '/features#multiplayer', 'Live collaboration, pair programming, and shared presence.'],
    ['Mobile App', '/mobile', 'Ship from anywhere with a fully-featured mobile IDE.'],
    ['Desktop App', '/desktop', 'Optimized offline workflow with secure device sync.'],
    ['AI Platform', '/ai', 'Governance, observability, and orchestration for AI workloads.'],
    ['Deployments', '/marketing/deployments', 'Global edge infrastructure with Fortune 500 reliability.'],
    ['Bounties', '/marketing/bounties', 'Activate an on-demand developer network to accelerate delivery.'],
    ['Teams', '/marketing/teams', 'Enterprise controls, compliance, and insights for large orgs.'],
  ],
  solutions: [
    ['App Builder', '/solutions/app-builder', 'Rapidly prototype and deploy full-stack applications.'],
    ['Website Builder', '/solutions/website-builder', 'Create polished marketing sites with zero setup.'],
    ['Game Builder', '/solutions/game-builder', 'Design and launch interactive experiences powered by AI.'],
    ['Dashboard Builder', '/solutions/dashboard-builder', 'Data-rich dashboards with real-time collaboration.'],
    [
      'Chatbot / AI Agent Builder',
      '/solutions/chatbot-builder',
      'Deploy conversational assistants across your organization.',
    ],
    [
      'Internal AI Builder',
      '/solutions/internal-ai-builder',
      'Bring private AI agents to every team safely and securely.',
    ],
    ['Enterprise', '/solutions/enterprise', 'Fortune 500-grade platform with SSO, audit logs, and 99.99% SLA.'],
    ['Startups', '/solutions/startups', 'Ship your MVP 10x faster. Startup-friendly pricing.'],
    ['Freelancers', '/solutions/freelancers', 'Deliver client projects faster. Portfolio hosting included.'],
  ],
  resources: [
    ['Documentation', '/docs', 'Get started quickly with step-by-step guides.'],
    ['AI Documentation', '/ai-documentation', 'Complete AI capabilities guide.'],
    ['Tutorials', '/tutorials', 'Step-by-step learning from beginner to advanced.'],
    ['Blog', '/blog', 'Stories on shipping software at global scale.'],
    ['Changelog', '/changelog', 'Latest features and product updates.'],
    ['Community', '/community', 'Connect with builders and share best practices.'],
    ['Templates', '/templates', 'Launch with curated, industry-specific templates.'],
    ['Case Studies', '/case-studies', 'Real-world success stories from our customers.'],
    ['Help Center', '/help-center', 'FAQs, troubleshooting, and support.'],
    ['Status', '/status', 'Transparency around platform availability.'],
  ],
  company: [
    ['About', '/about', 'Learn about our mission and leadership team.'],
    ['Careers', '/careers', 'Join a distributed team building the future of software.'],
    ['Press', '/press', 'Press releases, media kit, and recent coverage.'],
    ['Partners', '/partners', 'Strategic alliances and solution partners.'],
    ['Contact', '/contact', 'Get in touch with our team.'],
    ['Accessibility', '/accessibility', 'Our commitment to inclusive design.'],
  ],
} as const satisfies Record<string, readonly MarketingMenuItem[]>;

export const publicFooterColumns: readonly FooterColumn[] = [
  {
    title: 'Product',
    links: [
      ['AI Agent', '/ai-agent'],
      ['IDE', '/features'],
      ['Multiplayer', '/features#multiplayer'],
      ['Mobile App', '/mobile'],
      ['Teams', '/marketing/teams'],
      ['Deployments', '/marketing/deployments'],
      ['Pricing', '/pricing'],
      ['Bounties', '/marketing/bounties'],
      ['AI Platform', '/ai'],
    ],
  },
  {
    title: 'Resources',
    links: [
      ['Docs', '/docs'],
      ['Blog', '/blog'],
      ['Community', '/community'],
      ['Templates', '/templates'],
      ['Languages', '/templates/languages'],
      ['Status', '/status'],
      ['Forum', '/forum'],
    ],
  },
  {
    title: 'Company',
    links: [
      ['About', '/about'],
      ['Careers', '/careers'],
      ['Press', '/press'],
      ['Partners', '/partners'],
      ['Contact sales', '/contact-sales'],
    ],
  },
  {
    title: 'Legal',
    links: [
      ['Terms', '/terms'],
      ['Privacy', '/privacy'],
      ['Subprocessors', '/subprocessors'],
      ['DPA', '/dpa'],
      ['US Student DPA', '/student-dpa'],
      ['Security', '/security'],
      ['Report Abuse', '/report-abuse'],
    ],
  },
] as const;

export const publicFooterActionLinks = [
  ['Talk to sales', '/contact-sales'],
  ['Start building', '/register'],
] as const satisfies readonly FooterLink[];

export const publicCompareLinks = [
  ['E-Code vs GitHub Codespaces', '/compare/github-codespaces'],
  ['E-Code vs Glitch', '/compare/glitch'],
  ['E-Code vs Heroku', '/compare/heroku'],
  ['E-Code vs CodeSandbox', '/compare/codesandbox'],
  ['E-Code vs AWS Cloud9', '/compare/aws-cloud9'],
] as const satisfies readonly FooterLink[];

export const publicFooterUtilityLinks = [
  { label: 'Twitter', to: 'https://twitter.com/ecode', icon: Twitter, external: true },
  { label: 'GitHub', to: 'https://github.com/ecode', icon: Github, external: true },
  { label: 'YouTube', to: 'https://youtube.com/ecode', icon: Youtube, external: true },
  { label: 'LinkedIn', to: 'https://linkedin.com/company/ecode', icon: Linkedin, external: true },
  { label: 'Instagram', to: 'https://instagram.com/ecode', icon: Instagram, external: true },
] as const satisfies readonly FooterUtilityLink[];

type NavItem = { label: string; to: string; icon: Icon; shortcut?: string; end?: boolean };

export const workspaceNav: NavItem[] = [
  { label: 'Search', to: '/command-palette', icon: Search, shortcut: '⌘K' },
  { label: 'Dashboard', to: '/dashboard', icon: Gauge },
  { label: 'Projects', to: '/projects', icon: Boxes },
  { label: 'Templates', to: '/dashboard/templates', icon: Layers },
];

export const orgNav = [
  { label: 'Usage', to: '/usage', icon: Activity },
  { label: 'Billing', to: '/billing', icon: CreditCard },
  { label: 'Team', to: '/organization-members', icon: Users },
  { label: 'Support', to: '/support', icon: LifeBuoy },
];

export const appNav = [...workspaceNav, { label: 'Create project', to: '/projects/new', icon: Plus }, ...orgNav];

export const accountNav = [
  { label: 'Account', to: '/account-settings', icon: Settings, end: true },
  { label: 'Security', to: '/security-settings', icon: ShieldCheck },
  { label: 'API keys', to: '/api-keys', icon: KeyRound },
  { label: 'Connected accounts', to: '/account-settings/connected', icon: Github },
  { label: 'Notifications', to: '/notifications', icon: Bell },
  { label: 'Desktop app', to: '/desktop-settings', icon: Monitor },
  { label: 'Workspace settings', to: '/workspace-settings', icon: SlidersHorizontal },
  { label: 'Data & privacy', to: '/account-settings/data', icon: ShieldAlert },
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
  { label: 'Overview', suffix: '', icon: Gauge },
  { label: 'Open IDE', suffix: '/ide', icon: FileCode2 },
  { label: 'Settings', suffix: '/settings', icon: Settings },
  { label: 'Env vars', suffix: '/env', icon: Braces },
  { label: 'Secrets', suffix: '/secrets', icon: Lock },
  { label: 'Collaborators', suffix: '/collaborators', icon: Users },
  { label: 'Snapshots', suffix: '/snapshots', icon: Layers },
  { label: 'Deployments', suffix: '/deployments', icon: Rocket },
  { label: 'Custom domains', suffix: '/domains', icon: Globe2 },
  { label: 'Logs', suffix: '/logs', icon: Terminal },
  { label: 'Activity', suffix: '/activity', icon: Activity },
  { label: 'Git', suffix: '/git', icon: GitBranch },
];

export const templates: TemplateCard[] = [
  {
    id: 'react-saas',
    name: 'React SaaS',
    stack: 'React, Vite, TypeScript',
    tag: 'Web app',
    providers: [
      { name: 'React', Logo: SiReact, color: '#61DAFB' },
      { name: 'Vite', Logo: SiVite, color: '#41D1FF' },
      { name: 'TypeScript', Logo: SiTypescript, color: '#3178C6' },
    ],
  },
  {
    id: 'next-dashboard',
    name: 'Next dashboard',
    stack: 'Next.js, Prisma, Tailwind',
    tag: 'Full stack',
    providers: [
      { name: 'Next.js', Logo: SiNextdotjs, color: 'var(--vc-ide-text-primary)' },
      { name: 'Prisma', Logo: SiPrisma, color: '#B8C4D9' },
      { name: 'Tailwind CSS', Logo: SiTailwindcss, color: '#06B6D4' },
    ],
  },
  {
    id: 'fastify-api',
    name: 'Fastify API',
    stack: 'Node.js, Fastify, PostgreSQL',
    tag: 'Backend',
    providers: [
      { name: 'Node.js', Logo: SiNodedotjs, color: '#5FA04E' },
      { name: 'Fastify', Logo: SiFastify, color: 'var(--vc-ide-text-primary)' },
      { name: 'PostgreSQL', Logo: SiPostgresql, color: '#4169E1' },
    ],
  },
  {
    id: 'ai-agent',
    name: 'AI agent',
    stack: 'RuntimeAdapter, tools, streaming',
    tag: 'AI',
    providers: [
      { name: 'OpenAI', Logo: SiOpenai, color: 'var(--vc-ide-text-primary)' },
      { name: 'Anthropic', Logo: SiAnthropic, color: '#D97757' },
      { name: 'GitHub', Logo: SiGithub, color: 'var(--vc-ide-text-primary)' },
    ],
  },
  {
    id: 'landing-page',
    name: 'Landing page',
    stack: 'Remix, responsive content',
    tag: 'Marketing',
    providers: [
      { name: 'Remix', Logo: SiRemix, color: 'var(--vc-ide-text-primary)' },
      { name: 'Tailwind CSS', Logo: SiTailwindcss, color: '#06B6D4' },
      { name: 'Framer', Logo: SiFramer, color: '#0055FF' },
    ],
  },
  {
    id: 'mobile-starter',
    name: 'Mobile starter',
    stack: 'Expo, shared packages',
    tag: 'Mobile',
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
  const mobileItems = [
    ...publicMarketingMenus.product,
    ...publicMarketingMenus.solutions,
    ...publicMarketingMenus.resources,
    ...publicMarketingMenus.company,
    ['Pricing', '/pricing', 'Plans for individuals, teams and enterprise deployments.'],
    ['Teams', '/team', 'Enterprise collaboration, controls and procurement support.'],
  ] as const satisfies readonly MarketingMenuItem[];

  return (
    <header className="vc-public-header" role="banner" aria-label="Site header">
      <div className="vc-public-announcement">
        <div className="vc-public-container vc-public-announcement-inner">
          <span className="vc-badge">NEW</span>
          <span>Introducing E-Code Enterprise Cloud with dedicated AI governance and auditability.</span>
          <Link to="/contact-sales">Talk to an expert</Link>
        </div>
      </div>
      <nav className="vc-public-nav" aria-label="Main navigation">
        <div className="vc-public-container vc-public-nav-inner">
          <Link to="/" className="vc-public-brand">
            <EcodeMarketingLogo />
          </Link>
          <div className="vc-public-desktop-nav" aria-label="Public navigation">
            <MarketingMenu label="Product" items={publicMarketingMenus.product} icon={Sparkles} />
            <MarketingMenu label="Solutions" items={publicMarketingMenus.solutions} icon={Rocket} />
            <MarketingMenu label="Resources" items={publicMarketingMenus.resources} icon={BookOpen} />
            <MarketingMenu label="Company" items={publicMarketingMenus.company} icon={ShieldCheck} />
            <NavButton to="/gallery">Gallery</NavButton>
            <NavButton to="/pricing">Pricing</NavButton>
            <NavButton to="/team">Teams</NavButton>
          </div>
          <div className="vc-public-actions">
            <PublicThemeToggle />
            <LinkButton to="/login" variant="ghost">
              Log in
            </LinkButton>
            <LinkButton to="/register">Get started</LinkButton>
            <details className="vc-public-mobile-menu">
              <summary aria-label="Open mobile menu">
                <Menu className="h-5 w-5" aria-hidden />
              </summary>
              <div className="vc-public-mobile-menu-panel">
                {mobileItems.map(([title, to, description]) => (
                  <Link key={`${title}-${to}`} to={to}>
                    <strong>{title}</strong>
                    <span>{description}</span>
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
  const theme = useStore(themeStore);
  const nextTheme = theme === 'dark' ? 'light' : 'dark';

  return (
    <button
      type="button"
      className="vc-public-theme-switch"
      title="Switch light/dark theme"
      aria-label={`Switch to ${nextTheme} theme`}
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
  const MenuIcon = menuIcon;

  return (
    <details className="vc-marketing-menu">
      <summary>
        {label}
        <ChevronRight className="h-3 w-3" aria-hidden />
      </summary>
      <div className="vc-marketing-menu-panel">
        {items.map(([title, to, description]) => (
          <Link key={`${title}-${to}`} to={to}>
            <MenuIcon className="h-4 w-4" aria-hidden />
            <span>
              <strong>{title}</strong>
              <small>{description}</small>
            </span>
          </Link>
        ))}
      </div>
    </details>
  );
}

export function PublicMarketingFooter() {
  return (
    <footer id="company" className="vc-public-footer" role="contentinfo" aria-label="Site footer">
      <div className="vc-public-container">
        <div className="vc-public-footer-cta">
          <div>
            <span className="vc-badge">
              <ShieldCheck className="h-3 w-3" aria-hidden />
              Built for Fortune 500
            </span>
            <h2>The future of enterprise software development.</h2>
            <p>
              E-Code combines secure cloud workspaces, intelligent automation and enterprise controls so your teams can
              ship faster across every device.
            </p>
          </div>
          <div className="vc-public-footer-actions">
            {publicFooterActionLinks.map(([label, to], index) => (
              <LinkButton key={to} to={to} variant={index === 0 ? 'default' : 'outline'}>
                {label}
                {index === 0 ? <ArrowUpRight className="h-4 w-4" aria-hidden /> : null}
              </LinkButton>
            ))}
          </div>
        </div>
        <div className="vc-public-footer-metrics" aria-label="Enterprise platform metrics">
          <article>
            <span>Global uptime</span>
            <strong>99.99%</strong>
          </article>
          <article>
            <span>Enterprise teams</span>
            <strong>4,500+</strong>
          </article>
        </div>
        <div className="vc-public-footer-grid">
          <div className="vc-public-footer-brand">
            <EcodeMarketingLogo />
            <p>{ECODE_MARKETING_BRAND.description}</p>
            <div className="vc-public-trust-list">
              <span>
                <CheckCircle2 className="h-4 w-4" /> AI governance
              </span>
              <span>
                <Globe2 className="h-4 w-4" /> Global previews
              </span>
              <span>
                <ShieldCheck className="h-4 w-4" /> Security controls
              </span>
            </div>
          </div>
          {publicFooterColumns.map((column) => (
            <nav key={column.title} aria-label={`${column.title} footer links`}>
              <h3>{column.title}</h3>
              {column.links.map(([label, to]) => (
                <Link key={`${column.title}-${label}-${to}`} to={to}>
                  {label}
                </Link>
              ))}
            </nav>
          ))}
        </div>
        <div className="vc-public-footer-compare">
          <div>
            <h3>Compare platforms</h3>
            <p>See how E-Code stacks up against other development clouds.</p>
          </div>
          <div role="list" aria-label="Platform comparisons">
            {publicCompareLinks.map(([label, to]) => (
              <Link key={to} to={to}>
                {label}
              </Link>
            ))}
          </div>
        </div>
        <div className="vc-public-footer-trust-row">
          <span>
            <ShieldCheck className="h-5 w-5" aria-hidden /> SOC2 Type II, ISO 27001, GDPR &amp; HIPAA ready.
          </span>
          <span>
            <Globe2 className="h-5 w-5" aria-hidden /> 18 global regions with enterprise data residency.
          </span>
          <span>
            <Sparkles className="h-5 w-5" aria-hidden /> AI governance, policy controls and audit logging.
          </span>
        </div>
        <div className="vc-public-footer-bottom">
          <span>
            © {new Date().getFullYear()} {ECODE_MARKETING_BRAND.legalName}. All rights reserved.
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
                  aria-label={utilityLink.label}
                >
                  <FooterIcon className="h-4 w-4" />
                </a>
              ) : (
                <Link key={utilityLink.to} to={utilityLink.to} aria-label={utilityLink.label}>
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
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
  hideHeader?: boolean;
  hideTopBar?: boolean;
  mainClassName?: string;
  contentClassName?: string;
}) {
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
  const displayedDescription = pendingSurface ? 'Loading the latest workspace data...' : description;

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
      <SkipLink />
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
                      Workspace console
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
                <AsyncPanelSkeleton label="Loading workspace page" rows={5} />
              </div>
            ) : (
              children
            )}
          </div>
        </section>
      </div>
      {!hideTopBar ? <ProductTour restartToken={tourRestartToken} /> : null}
    </main>
  );
}

function DesktopSidebar({ collapsed, toggleSidebar }: { collapsed: boolean; toggleSidebar: () => void }) {
  return (
    <aside
      className={classNames(
        'vc-sidebar vc-sidebar--desktop relative overflow-visible border-r border-bolt-elements-borderColor bg-bolt-elements-background-depth-2',
        collapsed && 'vc-sidebar--collapsed',
      )}
      role="navigation"
      aria-label="Main"
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
  return (
    <Link
      to="/organization-switcher"
      className={classNames(
        'vc-sidebar-header group relative flex h-[56px] shrink-0 items-center border-b border-bolt-elements-borderColor transition-colors hover:bg-bolt-elements-background-depth-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-accent-action)]',
        collapsed ? 'justify-center px-1.5' : 'gap-2 px-3',
      )}
      aria-label="Organization switcher"
      title={collapsed ? 'Organization switcher' : undefined}
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
            SaaS workspace
          </span>
        </span>
      ) : null}
      {collapsed ? <span className="vc-collapsed-nav-label">Organization switcher</span> : null}
    </Link>
  );
}

function SidebarToggle({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="vc-sidebar-toggle group absolute right-[-22px] top-[6px] z-10 inline-flex h-[44px] w-[44px] items-center justify-center rounded-full text-bolt-elements-textTertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-accent-action)]"
      aria-label={collapsed ? 'Expand navigation menu' : 'Collapse navigation menu'}
      aria-expanded={!collapsed}
      aria-keyshortcuts="Meta+\\ Control+\\"
      title={collapsed ? 'Expand menu (⌘\\)' : 'Collapse menu (⌘\\)'}
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
  return (
    <nav
      className={classNames(
        'min-h-0 flex-1 overflow-y-auto overflow-x-visible px-3 py-2',
        collapsed && 'items-center px-2',
        mobile && 'vc-sidebar-scroll-region',
      )}
      aria-label="Application navigation"
      data-testid={mobile ? 'mobile-navigation-scroll-region' : undefined}
    >
      <CreateProjectCta collapsed={collapsed} />
      <NavSection items={workspaceNav} collapsed={collapsed} />
      <NavSection label="Organization" items={orgNav} collapsed={collapsed} />
      <NavSection label="Account" items={accountNav} collapsed={collapsed} />
    </nav>
  );
}

function MobileSidebarDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
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
        aria-label="Close navigation"
        onClick={onClose}
        tabIndex={open ? 0 : -1}
      />
      <aside className="vc-sidebar-drawer-panel" role="navigation" aria-label="Main" aria-hidden={!open}>
        <div className="flex h-[56px] items-center justify-between border-b border-bolt-elements-borderColor px-3">
          <Link
            to="/organization-switcher"
            className="flex min-h-[44px] min-w-0 items-center gap-2"
            aria-label="Organization switcher"
            onClick={onClose}
          >
            <EcodeBrandMark size="sm" showText gradientId="ecode-drawer-logo" />
          </Link>
          <button
            type="button"
            className="inline-flex h-[44px] w-[44px] items-center justify-center rounded-md text-bolt-elements-textTertiary hover:bg-bolt-elements-background-depth-3 hover:text-bolt-elements-textPrimary focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-accent-action)]"
            onClick={onClose}
            aria-label="Close navigation"
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
  const profile = useStore(profileStore);
  const theme = useStore(themeStore);
  const displayName = profile.username?.trim() || 'Signed in user';

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
            aria-label="Account menu"
            title={collapsed ? 'Account menu' : undefined}
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
                  Account menu
                </span>
              </span>
            ) : null}
            {collapsed ? <span className="vc-collapsed-nav-label">Account menu</span> : null}
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
                  Account settings
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
                  Theme
                </span>
                <span className="text-[11px] text-bolt-elements-textTertiary">
                  {theme === 'dark' ? 'Dark' : 'Light'}
                </span>
              </button>
            </div>
            <div className="border-t border-bolt-elements-borderColor pt-1">
              <Popover.Close asChild>
                <Form method="post" action="/logout">
                  <button
                    type="submit"
                    className="flex min-h-[44px] w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-bolt-elements-textSecondary transition-colors hover:bg-bolt-elements-background-depth-3 hover:text-bolt-elements-textPrimary focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-accent-action)]"
                  >
                    <LogOut className="h-4 w-4" aria-hidden />
                    Sign out
                  </button>
                </Form>
              </Popover.Close>
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
  return (
    <AppShell
      title={title}
      description={description}
      actions={<LinkButton to={`/projects/${projectId}/ide`}>Open IDE</LinkButton>}
    >
      <div className="mb-6 overflow-x-auto rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-2 shadow-sm">
        <nav className="flex min-w-max gap-1" aria-label="Project navigation">
          {projectNav.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.label}
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
                {item.label}
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
              aria-label={stat.ariaLabel ?? `View ${stat.label.toLowerCase()}`}
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
  if (projects.length === 0) {
    return (
      <EmptyState
        title="No projects yet"
        description="Create a persistent project to open the E-Code IDE with saved files, runtime sessions and snapshots."
        actionLabel="Create project"
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
  // E16: the ⋯ menu's Rename swaps the card title for an inline input.
  const [renaming, setRenaming] = useState(false);
  const lifecycle = project.lifecycle ?? 'draft';
  const statusLabel = projectStatusLabel(project);

  return (
    <Card className="group flex h-full min-w-0 w-full max-w-[26rem] flex-col overflow-hidden border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 shadow-sm transition-colors hover:border-bolt-elements-borderColorActive">
      <div className="vc-project-preview relative aspect-[16/10] w-full overflow-hidden border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-3">
        <ProjectPreviewMedia
          project={project}
          className="relative z-[1] h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.015] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
        />
        <span
          className="absolute right-3 top-3 z-[2] inline-flex min-h-7 items-center gap-1.5 rounded-full bg-black/70 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-sm"
          aria-label={`Project status: ${statusLabel}`}
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
              {project.stack ?? project.sourceType ?? 'Persistent project'}
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
              <span className="block text-[11px] text-bolt-elements-textTertiary">Activity</span>
              <span className="mt-0.5 block truncate font-medium text-bolt-elements-textSecondary">
                {project.updatedAtIso ? <RelativeTime value={project.updatedAtIso} /> : (project.updated ?? 'recently')}
              </span>
            </div>
          </div>
          <div className="flex min-w-0 items-start gap-2">
            <Rocket className="mt-0.5 h-3.5 w-3.5 shrink-0 text-bolt-elements-textTertiary" aria-hidden />
            <div className="min-w-0">
              <span className="block text-[11px] text-bolt-elements-textTertiary">Deployments</span>
              <span className="mt-0.5 block truncate font-medium text-bolt-elements-textSecondary">
                {projectDeploymentSummary(project.deploymentCount)}
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
            <span>Open IDE</span>
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
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-bolt-elements-background-depth-3 px-5 text-center text-bolt-elements-textTertiary">
      <span className="flex h-10 w-10 items-center justify-center rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2">
        <MonitorPlay className="h-5 w-5" aria-hidden />
      </span>
      <span className="text-xs font-medium text-bolt-elements-textSecondary">No preview yet</span>
      <span className="max-w-48 text-[11px] leading-4">A captured app preview will appear here.</span>
      <span className="sr-only">No preview captured yet for {project.name}</span>
    </div>
  );
}

export function ProjectPreviewMedia({ project, className }: { project: ProjectCard; className?: string }) {
  const [failed, setFailed] = useState(false);

  if (!project.previewImageUrl || failed) {
    return <ProjectPreviewFallback project={project} />;
  }

  return (
    <img
      src={project.previewImageUrl}
      alt={`Latest preview of ${project.name}`}
      className={className}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

function projectStatusLabel(project: ProjectCard): string {
  const fallback = projectLifecycleDisplayLabel(project.lifecycle ?? 'draft');

  return statusDisplayLabel(project.status ?? fallback);
}

export function ProjectStatusPill({ project }: { project: ProjectCard }) {
  const lifecycle = project.lifecycle ?? 'draft';

  return (
    <StatusPill
      label={projectStatusLabel(project)}
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
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {templates.map((template) => (
        <Card
          key={template.name}
          className="group overflow-hidden border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 shadow-sm transition-colors hover:bg-bolt-elements-background-depth-3"
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
                    aria-label={`${provider.name} logo`}
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
                  className="vc-template-provider-pill rounded-full px-2 py-0.5 text-[10px] font-medium"
                >
                  {provider.name}
                </span>
              ))}
            </div>
          </div>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-lg">{template.name}</CardTitle>
              <StatusPill label={template.tag} />
            </div>
            <CardDescription>{template.stack}</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <span className="text-sm text-bolt-elements-textSecondary">Production starter</span>
            {/*
              Authenticated "Use template" creates the project from this template and goes
              straight to the IDE from wherever the card renders (Dashboard included): POST to
              the /dashboard/templates action, which creates via /projects/from-template and
              redirects to the project IDE — no /templates detour.
            */}
            {mode === 'authenticated' ? (
              <Form method="post" action="/dashboard/templates">
                <input type="hidden" name="templateName" value={template.id} />
                <input type="hidden" name="name" value={template.name} />
                <Button type="submit" variant="outline" className="min-h-[44px]">
                  Use template
                </Button>
              </Form>
            ) : compact ? (
              <LinkButton to="/templates" variant="outline">
                Use template
              </LinkButton>
            ) : (
              <LinkButton to="/login" variant="outline">
                Sign in to use
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
  const completed = steps.filter((step) => step.done).length;

  if (completed >= steps.length) {
    return null;
  }

  const currentKey = steps.find((step) => !step.done)?.key;

  return (
    <section
      aria-label="Get set up"
      className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-5 shadow-sm sm:p-6"
    >
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-[15px] font-semibold">Get set up</h2>
        <div
          role="progressbar"
          aria-label="Setup progress"
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
          {completed} of {steps.length}
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
                      className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none"
                      style={{
                        color: 'var(--status-success-text)',
                        background: 'color-mix(in srgb, var(--vc-ide-accent-success) 12%, transparent)',
                      }}
                    >
                      Done
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
                      ? 'bg-[var(--vc-ide-accent-action)] text-white transition-opacity hover:opacity-90'
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
  submitLabel = 'Save changes',
}: {
  fields: Array<{ label: string; name: string; type?: string; placeholder?: string; defaultValue?: string }>;
  submitLabel?: string;
}) {
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
          {submitLabel}
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
            <div>
              <p className="text-sm font-medium">{item.title}</p>
              <p className="mt-1 text-sm text-bolt-elements-textSecondary">{item.detail}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const COMMAND_PALETTE_ACTIONS: CommandPaletteItem[] = [
  { label: 'Create project', to: '/projects/new', hint: 'Action' },
  { label: 'Open recent projects', to: '/recent-projects', hint: 'Action' },
  { label: 'Import GitHub repository', to: '/import-github', hint: 'Action' },
  { label: 'View usage', to: '/usage', hint: 'Action' },
  { label: 'Invite teammate', to: '/invitations', hint: 'Action' },
  { label: 'Rotate API key', to: '/api-keys', hint: 'Action' },
  { label: 'Workspace settings', to: '/workspace-settings', hint: 'Settings' },
];

/**
 * Build the full command list: the static dashboard actions plus a "jump to
 * project" entry for every project the caller passes in, so the palette can
 * navigate to any of the user's real projects.
 */
export function buildCommandPaletteItems(projects: ProjectCard[] = []): CommandPaletteItem[] {
  const projectItems: CommandPaletteItem[] = projects.map((project) => ({
    label: project.name,
    to: project.ideUrl ?? `/projects/${project.id}`,
    hint: 'Project',
  }));

  return [...COMMAND_PALETTE_ACTIONS, ...projectItems];
}

export function CommandPalettePreview({ projects = [] }: { projects?: ProjectCard[] }) {
  const navigate = useNavigate();
  const allItems = useMemo(() => buildCommandPaletteItems(projects), [projects]);
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
          placeholder="Type a command or search..."
          aria-label="Command palette search"
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
          <p className="vc-sidebar-group-label px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.5px] text-bolt-elements-textTertiary">
            Recent
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
                <span className="text-xs text-bolt-elements-textTertiary">Recent</span>
              </Link>
            ))}
          </div>
        </div>
      ) : null}
      <div className="mt-3 grid gap-1" role="listbox" aria-label="Command palette results">
        {visibleItems.length === 0 ? (
          <p className="px-3 py-6 text-center text-[13px] text-bolt-elements-textTertiary">
            No results for “{query.trim()}”
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
              <span className="text-xs text-bolt-elements-textTertiary">Enter</span>
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
  return (
    <header
      className="sticky top-0 z-10 flex h-[56px] items-center justify-between gap-3 border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-1/95 px-4 backdrop-blur-xl sm:px-6"
      data-vc-tour-target="tools"
    >
      <button
        type="button"
        onClick={onOpenDrawer}
        className="relative inline-flex h-[44px] min-w-[44px] shrink-0 items-center justify-center gap-2 rounded-md px-2 text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-2 hover:text-bolt-elements-textPrimary focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-accent-action)] lg:hidden"
        aria-label="Open navigation menu"
        data-vc-tour-target="navigation"
      >
        <Menu className="h-4 w-4" aria-hidden />
        <span className="text-xs font-medium sm:sr-only">Menu</span>
      </button>
      {/* The title remains visible beside the tablet rail, where the sidebar only shows icons. */}
      {title ? <span className="min-w-0 flex-1 truncate text-base font-semibold xl:hidden">{title}</span> : null}
      <div className="hidden flex-1 xl:block" />
      <Link
        to="/command-palette"
        className="ml-auto hidden min-h-[44px] items-center gap-2 rounded-md border border-bolt-elements-borderColor px-3 py-1.5 text-sm text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-2 hover:text-bolt-elements-textPrimary focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-accent-action)] sm:inline-flex"
        aria-label="Open command palette"
      >
        <Command className="h-4 w-4" aria-hidden />
        Search
        <kbd className="vc-keyboard-shortcut rounded border border-bolt-elements-borderColor px-1.5 py-0.5 text-[10px] text-bolt-elements-textTertiary">
          ⌘K
        </kbd>
      </Link>
      <TopBarHelp onStartTour={onStartTour} />
      <TopBarNotifications />
    </header>
  );
}

function TopBarHelp({ onStartTour }: { onStartTour: () => void }) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          className="relative inline-flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-md text-bolt-elements-textSecondary transition-colors hover:bg-bolt-elements-background-depth-2 hover:text-bolt-elements-textPrimary focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-action-primary)]"
          aria-label="Help and guided tour"
          title="Help and guided tour"
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
          aria-label="Help menu"
        >
          <div className="px-2 pb-2 pt-1">
            <p className="text-sm font-semibold">Help</p>
            <p className="mt-1 text-xs leading-5 text-bolt-elements-textTertiary">
              Guides and support for your workspace.
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
                Open guided tour
              </button>
            </Popover.Close>
            <Popover.Close asChild>
              <Link
                to="/help-center"
                className="flex min-h-[44px] items-center gap-2 rounded-md px-3 py-2 text-sm text-bolt-elements-textSecondary transition-colors hover:bg-bolt-elements-background-depth-3 hover:text-bolt-elements-textPrimary focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-action-primary)]"
              >
                <LifeBuoy className="h-4 w-4" aria-hidden />
                Help center
              </Link>
            </Popover.Close>
            <Popover.Close asChild>
              <Link
                to="/support"
                className="flex min-h-[44px] items-center gap-2 rounded-md px-3 py-2 text-sm text-bolt-elements-textSecondary transition-colors hover:bg-bolt-elements-background-depth-3 hover:text-bolt-elements-textPrimary focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-action-primary)]"
              >
                <MailPlus className="h-4 w-4" aria-hidden />
                Contact support
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
          throw new Error('Notification feed request failed');
        }

        const payload = (await response.json()) as TopBarNotificationFeed;

        if (payload.unavailable || !Array.isArray(payload.notifications)) {
          throw new Error('Notification feed response was invalid');
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
              ? 'Notifications unavailable'
              : unreadCount > 0
                ? `Notifications (${unreadCount} unread)`
                : 'Notifications'
          }
        >
          <Bell className="h-4 w-4" aria-hidden />
          {unreadCount > 0 ? (
            <span
              className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-bolt-elements-item-contentAccent px-1 text-[10px] font-semibold leading-none text-white"
              aria-hidden
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          ) : null}
        </button>
      }
    >
      <div className="flex items-center justify-between gap-2 border-b border-bolt-elements-borderColor px-3 py-2">
        <p className="text-sm font-semibold">Notifications</p>
        {unreadCount > 0 ? (
          <markAllFetcher.Form method="post" action="/api/notifications/read-all">
            <button
              type="submit"
              disabled={markingAll}
              className="min-h-[44px] rounded px-2 text-xs font-medium text-[var(--vc-ide-accent-action)] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-accent-action)] disabled:opacity-60"
            >
              {markingAll ? 'Marking…' : 'Mark all read'}
            </button>
          </markAllFetcher.Form>
        ) : null}
      </div>
      {phase === 'loading' ? (
        <AsyncPanelSkeleton label="Loading notifications" rows={2} compact className="m-3" />
      ) : phase === 'error' && !feed ? (
        <AsyncPanelError
          title="Notifications could not load"
          description="Your notifications are unchanged. Check your connection and try again."
          onRetry={retry}
          compact
          className="m-3"
        />
      ) : (
        <>
          {phase === 'error' ? (
            <AsyncPanelError
              title="Notifications may be out of date"
              description="The last available notifications are shown below."
              onRetry={retry}
              compact
              className="m-3"
            />
          ) : null}
          {notifications.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-bolt-elements-textSecondary">You are all caught up.</p>
          ) : (
            <ul className="max-h-80 divide-y divide-bolt-elements-borderColor overflow-y-auto">
              {notifications.map((notification) => (
                <li key={notification.id} className="flex items-start gap-2 px-3 py-2.5">
                  <span
                    className={classNames(
                      'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                      notification.read ? 'bg-transparent' : 'bg-bolt-elements-item-contentAccent',
                    )}
                    aria-label={notification.read ? undefined : 'Unread'}
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
            View all notifications
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
  return (
    <Form method="post" action="/logout" className={iconOnly ? 'relative' : undefined}>
      <button
        type="submit"
        className={classNames(
          'group inline-flex h-[44px] items-center gap-2 rounded-md px-3 text-sm text-bolt-elements-textSecondary transition-colors hover:bg-bolt-elements-background-depth-2 hover:text-bolt-elements-textPrimary',
          className,
        )}
        aria-label="Sign out"
        title={iconOnly ? 'Sign out' : undefined}
      >
        <LogOut className={classNames('shrink-0', iconOnly ? 'h-[18px] w-[18px]' : 'h-4 w-4')} aria-hidden />
        {iconOnly ? null : !compact ? <span>Sign out</span> : <span className="hidden sm:inline">Sign out</span>}
        {iconOnly ? <span className="vc-collapsed-nav-label">Sign out</span> : null}
      </button>
    </Form>
  );
}

function NavSection({ label, items, collapsed }: { label?: string; items: NavItem[]; collapsed: boolean }) {
  return (
    <div className={classNames('w-full', collapsed && 'flex flex-col items-center')}>
      {label ? (
        !collapsed ? (
          <p className="vc-sidebar-group-label vc-sidebar-fade-label px-3 pb-0.5 text-[10px] font-semibold uppercase tracking-[0.5px] text-bolt-elements-textTertiary">
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
      aria-label={collapsed ? 'Create project' : undefined}
      title={collapsed ? 'Create project' : undefined}
      data-vc-tour-target="create-project"
    >
      <Plus className="h-4 w-4 shrink-0" aria-hidden />
      {!collapsed ? <span className="vc-sidebar-fade-label truncate">New project</span> : null}
      {collapsed ? <span className="vc-collapsed-nav-label">Create project</span> : null}
    </NavLink>
  );
}

function NavGroup({ items, collapsed = false }: { items: NavItem[]; collapsed?: boolean }) {
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
            aria-label={collapsed ? item.label : undefined}
            title={collapsed ? item.label : undefined}
          >
            <Icon
              className={classNames(
                'vc-sidebar-nav-icon shrink-0 transition-transform duration-150 group-hover:scale-[1.05]',
                collapsed ? 'h-[17px] w-[17px]' : 'h-[18px] w-[18px]',
              )}
              aria-hidden
            />
            {!collapsed ? <span className="vc-sidebar-fade-label flex-1 truncate">{item.label}</span> : null}
            {!collapsed && item.shortcut ? (
              <kbd className="vc-keyboard-shortcut vc-sidebar-shortcut ml-auto rounded border border-bolt-elements-borderColor px-1 py-0 text-[10px] font-medium leading-4 text-bolt-elements-textTertiary">
                {item.shortcut}
              </kbd>
            ) : null}
            {collapsed ? (
              <span className="vc-collapsed-nav-label">
                {item.label}
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

export function statsFromUsage(input?: {
  projects?: number;
  activeWorkspaces?: number;
  planName?: string;
  usageEvents?: number;
  aiCostCents?: number;
}) {
  return [
    {
      label: 'Projects',
      value: String(input?.projects ?? 0),
      detail: 'Open, manage or resume your work',
      icon: Boxes,
      to: '/projects',
      ariaLabel: 'View projects',
    },
    {
      label: 'Active workspaces',
      value: String(input?.activeWorkspaces ?? 0),
      detail: 'Project sessions running right now',
      icon: MonitorPlay,
      to: '/usage',
      ariaLabel: 'View workspace usage',
    },
    {
      label: 'Plan',
      value: input?.planName ?? 'Free',
      detail: 'Manage your subscription and payment',
      icon: CreditCard,
      to: '/billing',
      ariaLabel: 'View plan and billing',
    },
    {
      label: 'AI cost',
      value: `€${((input?.aiCostCents ?? 0) / 100).toFixed(2)}`,
      detail: `${input?.usageEvents ?? 0} metered action${input?.usageEvents === 1 ? '' : 's'} this cycle`,
      icon: Sparkles,
      to: '/usage',
      ariaLabel: 'View AI usage and cost',
    },
  ];
}

export const projectActivity = [
  { title: 'Workspace started', detail: 'Remote runtime entered running state.', icon: MonitorPlay },
  { title: 'Snapshot created', detail: 'Automatic checkpoint before AI changes.', icon: Layers },
  { title: 'Deployment queued', detail: 'Preview deployment requested by workspace agent.', icon: Rocket },
];

export const importOptions = [
  {
    title: 'Import GitHub',
    description: 'Connect a repository, choose a branch and create a persistent project.',
    to: '/import-github',
    icon: Github,
  },
  {
    title: 'Import zip',
    description: 'Upload an archive and extract it into a managed workspace volume.',
    to: '/import-zip',
    icon: FileArchive,
  },
  {
    title: 'Create from prompt',
    description: 'Start with E-Code AI and capture the result as a SaaS project.',
    to: '/projects/new',
    icon: Sparkles,
  },
  {
    title: 'Use template',
    description: 'Pick a curated starter with runtime and deployment defaults.',
    to: '/dashboard/templates',
    icon: Upload,
  },
];

export const publicFooterLinks = [
  { label: 'Privacy', to: '/privacy' },
  { label: 'Terms', to: '/terms' },
  { label: 'Acceptable use', to: '/acceptable-use' },
  { label: 'Security', to: '/security' },
  { label: 'Contact', to: '/contact-sales' },
  { label: 'Docs', to: '/docs' },
];

export const publicFeatureIcons = { BookOpen, MailPlus, Globe2, ShieldCheck };
