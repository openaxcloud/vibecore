import { useStore } from '@nanostores/react';
import { Form, Link, NavLink } from '@remix-run/react';
import {
  Activity,
  Bell,
  BookOpen,
  Boxes,
  Braces,
  Building2,
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
  Instagram,
  KeyRound,
  Layers,
  LifeBuoy,
  LogOut,
  Lock,
  MailPlus,
  Menu,
  MonitorPlay,
  Rocket,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Terminal,
  Upload,
  Users,
  Youtube,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
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
import { Button } from '~/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/Card';
import { themeStore, toggleTheme } from '~/lib/stores/theme';
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

export const publicNav = [
  { label: 'Product', to: '/#product' },
  { label: 'Solutions', to: '/#solutions' },
  { label: 'Templates', to: '/templates' },
  { label: 'Security', to: '/security' },
  { label: 'Pricing', to: '/pricing' },
];

export const appNav = [
  { label: 'Dashboard', to: '/dashboard', icon: Gauge },
  { label: 'Projects', to: '/projects', icon: Boxes },
  { label: 'Create project', to: '/projects/new', icon: Sparkles },
  { label: 'Templates', to: '/dashboard/templates', icon: Layers },
  { label: 'Usage', to: '/usage', icon: Activity },
  { label: 'Billing', to: '/billing', icon: CreditCard },
  { label: 'Team', to: '/organization-members', icon: Users },
  { label: 'Support', to: '/support', icon: LifeBuoy },
];

export const accountNav = [
  { label: 'Account', to: '/account-settings', icon: Settings },
  { label: 'Security', to: '/security-settings', icon: ShieldCheck },
  { label: 'API keys', to: '/api-keys', icon: KeyRound },
  { label: 'Connected accounts', to: '/connected-accounts', icon: Github },
  { label: 'Notifications', to: '/notifications', icon: Bell },
];

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
      { name: 'Vite', Logo: SiVite, color: '#646CFF' },
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
}

export function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="vc-public-shell min-h-screen bg-bolt-elements-background-depth-1 text-bolt-elements-textPrimary">
      <PublicMarketingHeader />
      {children}
      <PublicMarketingFooter />
    </main>
  );
}

function VibecoreLogo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="vc-logo" aria-label="VibeCore">
      <span className="vc-logo-mark" aria-hidden>
        <Sparkles className="h-4 w-4" />
      </span>
      {!compact ? <span className="vc-logo-text">VibeCore</span> : null}
    </span>
  );
}

function PublicMarketingHeader() {
  const productItems = [
    ['AI Agent', '/#builder', 'Generate, patch and ship production apps from natural language.'],
    ['Browser IDE', '/#product', 'A preserved Bolt workbench with files, terminal, preview and deploy tools.'],
    ['Mobile IDE', '/#mobile', 'Review, run and inspect projects from phone and tablet layouts.'],
    ['Deployments', '/#deploy', 'Runtime-aware previews, snapshots and production release controls.'],
  ];
  const resourceItems = [
    ['Documentation', '/docs', 'Guides for projects, runtimes, security and deployment.'],
    ['Templates', '/templates', 'Production starters for SaaS, dashboards, APIs and AI tools.'],
    ['Changelog', '/changelog', 'Latest platform updates and validation notes.'],
    ['Status', '/status', 'Operational status and incident visibility.'],
  ];

  return (
    <header className="vc-public-header" role="banner" aria-label="Site header">
      <div className="vc-public-announcement">
        <div className="vc-public-container vc-public-announcement-inner">
          <span className="vc-badge">New</span>
          <span>Enterprise-grade mobile IDE, runtime status and Android build validation are now live.</span>
          <Link to="/contact-sales">Talk to an expert</Link>
        </div>
      </div>
      <nav className="vc-public-nav" aria-label="Main navigation">
        <div className="vc-public-container vc-public-nav-inner">
          <Link to="/" className="vc-public-brand">
            <VibecoreLogo />
          </Link>
          <div className="vc-public-desktop-nav" aria-label="Public navigation">
            <MarketingMenu label="Product" items={productItems} icon={Sparkles} />
            <MarketingMenu label="Resources" items={resourceItems} icon={BookOpen} />
            <NavButton to="/pricing">Pricing</NavButton>
            <NavButton to="/security">Security</NavButton>
            <NavButton to="/contact-sales">Enterprise</NavButton>
          </div>
          <div className="vc-public-actions">
            <PublicThemeToggle />
            <LinkButton to="/login" variant="ghost">
              Sign in
            </LinkButton>
            <LinkButton to="/signup">Start building</LinkButton>
            <details className="vc-public-mobile-menu">
              <summary aria-label="Open mobile menu">
                <Menu className="h-5 w-5" aria-hidden />
              </summary>
              <div className="vc-public-mobile-menu-panel">
                {[...productItems, ...resourceItems, ['Pricing', '/pricing', 'Plans for teams and enterprises']].map(
                  ([title, to, description]) => (
                    <Link key={to} to={to}>
                      <strong>{title}</strong>
                      <span>{description}</span>
                    </Link>
                  ),
                )}
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
            ? 'i-ph:sun-dim-duotone vc-public-theme-switch-icon'
            : 'i-ph:moon-stars-duotone vc-public-theme-switch-icon'
        }
        aria-hidden
      />
    </button>
  );
}

function MarketingMenu({ label, items, icon: menuIcon }: { label: string; items: string[][]; icon: Icon }) {
  const MenuIcon = menuIcon;

  return (
    <details className="vc-marketing-menu">
      <summary>
        {label}
        <ChevronRight className="h-3 w-3" aria-hidden />
      </summary>
      <div className="vc-marketing-menu-panel">
        {items.map(([title, to, description]) => (
          <Link key={to} to={to}>
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

function PublicMarketingFooter() {
  const footerColumns = [
    {
      title: 'Product',
      links: [
        ['AI Agent', '/#builder'],
        ['IDE', '/#product'],
        ['Mobile', '/#mobile'],
        ['Deployments', '/#deploy'],
        ['Pricing', '/pricing'],
      ],
    },
    {
      title: 'Resources',
      links: [
        ['Docs', '/docs'],
        ['Templates', '/templates'],
        ['Changelog', '/changelog'],
        ['Status', '/status'],
        ['Contact sales', '/contact-sales'],
      ],
    },
    {
      title: 'Company',
      links: [
        ['Security', '/security'],
        ['Privacy', '/privacy'],
        ['Terms', '/terms'],
        ['Acceptable use', '/acceptable-use'],
      ],
    },
  ];

  return (
    <footer className="vc-public-footer" role="contentinfo" aria-label="Site footer">
      <div className="vc-public-container">
        <div className="vc-public-footer-cta">
          <div>
            <span className="vc-badge">
              <ShieldCheck className="h-3 w-3" aria-hidden />
              Enterprise ready
            </span>
            <h2>The future of governed software development.</h2>
            <p>
              VibeCore combines Bolt IDE ergonomics, managed runtimes, auditability and production deployment controls.
            </p>
          </div>
          <div className="vc-public-footer-actions">
            <LinkButton to="/contact-sales">Talk to sales</LinkButton>
            <LinkButton to="/signup" variant="outline">
              Start building
            </LinkButton>
          </div>
        </div>
        <div className="vc-public-footer-grid">
          <div className="vc-public-footer-brand">
            <VibecoreLogo />
            <p>Persistent projects, real runtimes and a preserved Bolt workbench for production teams.</p>
            <div className="vc-public-trust-list">
              <span>
                <CheckCircle2 className="h-4 w-4" /> Audit logs
              </span>
              <span>
                <Globe2 className="h-4 w-4" /> Global previews
              </span>
              <span>
                <ShieldCheck className="h-4 w-4" /> Security controls
              </span>
            </div>
          </div>
          {footerColumns.map((column) => (
            <nav key={column.title} aria-label={`${column.title} footer links`}>
              <h3>{column.title}</h3>
              {column.links.map(([label, to]) => (
                <Link key={to} to={to}>
                  {label}
                </Link>
              ))}
            </nav>
          ))}
        </div>
        <div className="vc-public-footer-bottom">
          <span>© {new Date().getFullYear()} VibeCore. All rights reserved.</span>
          <div>
            <a href="https://github.com/openaxcloud/vibecore" target="_blank" rel="noreferrer" aria-label="GitHub">
              <Github className="h-4 w-4" />
            </a>
            <a href="/docs" aria-label="Documentation">
              <BookOpen className="h-4 w-4" />
            </a>
            <a href="/status" aria-label="Status">
              <Globe2 className="h-4 w-4" />
            </a>
            <a href="/templates" aria-label="Templates">
              <Youtube className="h-4 w-4" />
            </a>
            <a href="/contact-sales" aria-label="Contact">
              <Instagram className="h-4 w-4" />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}

export function AppShell({
  title,
  description,
  children,
  actions,
  hideHeader = false,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
  hideHeader?: boolean;
}) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    setSidebarCollapsed(localStorage.getItem('vibecore:app-sidebar-collapsed') === 'true');
  }, []);

  const toggleSidebar = () => {
    setSidebarCollapsed((current) => {
      const next = !current;
      localStorage.setItem('vibecore:app-sidebar-collapsed', String(next));

      return next;
    });
  };

  return (
    <main className="min-h-screen bg-bolt-elements-background-depth-1 text-bolt-elements-textPrimary">
      <div
        className={classNames(
          'grid min-h-screen transition-[grid-template-columns] duration-200',
          sidebarCollapsed ? 'lg:grid-cols-[72px_1fr]' : 'lg:grid-cols-[256px_1fr]',
        )}
      >
        <aside className="hidden border-r border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 lg:block">
          <div
            className={classNames(
              'flex h-14 items-center border-b border-bolt-elements-borderColor',
              sidebarCollapsed ? 'justify-center px-2' : 'gap-2 px-4',
            )}
          >
            <Link
              to="/dashboard"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-3"
              aria-label="Dashboard"
              title="Dashboard"
            >
              <Sparkles className="h-4 w-4" aria-hidden />
            </Link>
            <div className={classNames('min-w-0', sidebarCollapsed && 'hidden')}>
              <span className="block text-sm font-semibold">VibeCore</span>
              <span className="block text-xs text-bolt-elements-textTertiary">SaaS workspace</span>
            </div>
          </div>
          <nav className={classNames('space-y-6 p-3', sidebarCollapsed && 'px-2')} aria-label="Application navigation">
            <NavGroup items={appNav} collapsed={sidebarCollapsed} />
            <div>
              {!sidebarCollapsed ? (
                <p className="px-3 pb-2 text-xs font-medium uppercase text-bolt-elements-textTertiary">Account</p>
              ) : (
                <div className="mx-auto mb-2 h-px w-8 bg-bolt-elements-borderColor" aria-hidden />
              )}
              <NavGroup items={accountNav} collapsed={sidebarCollapsed} />
              <div className={classNames('mt-2 px-1', sidebarCollapsed && 'px-0')}>
                <SignOutButton
                  className={classNames('w-full', sidebarCollapsed ? 'justify-center px-0' : 'justify-start')}
                  compact={sidebarCollapsed}
                  iconOnly={sidebarCollapsed}
                />
              </div>
            </div>
            <button
              type="button"
              onClick={toggleSidebar}
              className={classNames(
                'flex h-9 w-full items-center rounded-md border border-bolt-elements-borderColor text-sm text-bolt-elements-textSecondary transition-colors hover:bg-bolt-elements-background-depth-3 hover:text-bolt-elements-textPrimary',
                sidebarCollapsed ? 'justify-center px-0' : 'justify-between px-3',
              )}
              aria-label={sidebarCollapsed ? 'Expand navigation menu' : 'Collapse navigation menu'}
              title={sidebarCollapsed ? 'Expand menu' : 'Collapse menu'}
            >
              {!sidebarCollapsed ? <span>Collapse</span> : null}
              {sidebarCollapsed ? (
                <ChevronRight className="h-4 w-4" aria-hidden />
              ) : (
                <ChevronLeft className="h-4 w-4" aria-hidden />
              )}
            </button>
          </nav>
        </aside>
        <section className="min-w-0">
          <TopBar />
          <MobileAppNav />
          <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:py-8">
            {!hideHeader ? (
              <div className="mb-6 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-5 shadow-sm sm:p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="mb-2 text-xs font-medium uppercase text-bolt-elements-textTertiary">
                      Workspace console
                    </p>
                    <h1 className="text-2xl font-semibold tracking-normal sm:text-3xl">{title}</h1>
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-bolt-elements-textSecondary">{description}</p>
                  </div>
                  {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
                </div>
              </div>
            ) : null}
            {children}
          </div>
        </section>
      </div>
    </main>
  );
}

function MobileAppNav() {
  return (
    <nav
      className="flex gap-1 overflow-x-auto border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-2 lg:hidden"
      aria-label="Application mobile navigation"
    >
      {[...appNav, ...accountNav].map((item) => {
        const Icon = item.icon;
        const mobileLabel = item.to === '/projects/new' ? 'New project' : item.label;

        return (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              classNames(
                'inline-flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
                isActive
                  ? 'bg-bolt-elements-background-depth-3 text-bolt-elements-textPrimary'
                  : 'text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-3',
              )
            }
          >
            <Icon className="h-4 w-4" aria-hidden />
            {mobileLabel}
          </NavLink>
        );
      })}
      <SignOutButton className="shrink-0" compact />
    </nav>
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
                    'inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
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

export function StatGrid({ stats }: { stats: Array<{ label: string; value: string; detail: string; icon: Icon }> }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {stats.map((stat) => {
        const Icon = stat.icon;
        return (
          <Card
            key={stat.label}
            className="overflow-hidden border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 shadow-sm"
          >
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardDescription>{stat.label}</CardDescription>
                <span className="flex h-8 w-8 items-center justify-center rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-3">
                  <Icon className="h-4 w-4 text-bolt-elements-textSecondary" aria-hidden />
                </span>
              </div>
              <CardTitle className="text-3xl">{stat.value}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-bolt-elements-textSecondary">{stat.detail}</p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

export function ProjectGrid({ projects = [] }: { projects?: ProjectCard[] }) {
  if (projects.length === 0) {
    return (
      <EmptyPanel
        title="No projects yet"
        description="Create a persistent project to open the Bolt IDE with saved files, runtime sessions and snapshots."
        actionLabel="Create project"
        to="/projects/new"
        icon={Sparkles}
      />
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {projects.map((project) => (
        <Card
          key={project.id}
          className="group overflow-hidden border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 shadow-sm transition-colors hover:bg-bolt-elements-background-depth-3"
        >
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="text-lg">{project.name}</CardTitle>
                <CardDescription>{project.stack ?? project.sourceType ?? 'Persistent Bolt project'}</CardDescription>
              </div>
              <StatusPill label={project.status ?? 'Ready'} />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="vc-project-preview relative aspect-[16/9] overflow-hidden rounded-md">
              <ProjectPreviewFallback project={project} />
              {project.previewImageUrl ? (
                <img
                  src={project.previewImageUrl}
                  alt={`Latest homepage preview for ${project.name}`}
                  className="relative z-[1] h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.015]"
                  loading="lazy"
                  onError={(event) => {
                    event.currentTarget.style.display = 'none';
                  }}
                />
              ) : null}
            </div>
            <div className="flex items-center justify-between text-xs text-bolt-elements-textSecondary">
              <span>Updated {project.updated ?? 'recently'}</span>
              <Link
                to={`/projects/${project.id}/ide`}
                className="rounded-md px-2 py-1 font-medium text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-1"
              >
                Open IDE
              </Link>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ProjectPreviewFallback({ project }: { project: ProjectCard }) {
  return (
    <div className="absolute inset-0 p-3">
      <div className="vc-project-preview-shell flex h-full flex-col rounded-[6px]">
        <div className="vc-project-preview-bar flex h-7 items-center gap-1.5 px-2">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--vc-ide-accent-error)]" />
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--vc-ide-accent-warning)]" />
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--vc-ide-accent-success)]" />
          <span className="vc-project-preview-line ml-2 h-2 flex-1 rounded" />
        </div>
        <div className="flex flex-1 flex-col justify-center gap-2 px-4">
          <span className="h-2 w-16 rounded-full bg-gradient-to-r from-[var(--vc-ide-accent-ai-start)] to-[var(--vc-ide-accent-action)]" />
          <span className="vc-project-preview-line h-3 w-2/3 rounded" />
          <span className="vc-project-preview-line h-2 w-4/5 rounded" />
          <span className="vc-project-preview-line h-2 w-1/2 rounded" />
          <span className="sr-only">Fallback homepage preview for {project.name}</span>
        </div>
      </div>
    </div>
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
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_25%_20%,color-mix(in_srgb,var(--vc-ide-accent-action)_18%,transparent),transparent_34%),radial-gradient(circle_at_85%_10%,color-mix(in_srgb,var(--vc-ide-accent-ai-start)_16%,transparent),transparent_32%)]" />
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
          {!compact ? (
            <CardContent className="flex items-center justify-between">
              <span className="text-sm text-bolt-elements-textSecondary">Production starter</span>
              {mode === 'authenticated' ? (
                <Form method="post">
                  <input type="hidden" name="templateName" value={template.id} />
                  <input type="hidden" name="name" value={template.name} />
                  <Button type="submit" variant="outline">
                    Use template
                  </Button>
                </Form>
              ) : (
                <LinkButton to="/login" variant="outline">
                  Sign in to use
                </LinkButton>
              )}
            </CardContent>
          ) : null}
        </Card>
      ))}
    </div>
  );
}

export function EmptyPanel({
  title,
  description,
  actionLabel,
  to,
  icon = Search,
}: {
  title: string;
  description: string;
  actionLabel?: string;
  to?: string;
  icon?: Icon;
}) {
  const PanelIcon = icon;

  return (
    <div className="rounded-lg border border-dashed border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-8 text-center shadow-sm">
      <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-3">
        <PanelIcon className="h-6 w-6 text-bolt-elements-textSecondary" aria-hidden />
      </span>
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm text-bolt-elements-textSecondary">{description}</p>
      {actionLabel && to ? (
        <div className="mt-5">
          <LinkButton to={to}>{actionLabel}</LinkButton>
        </div>
      ) : null}
    </div>
  );
}

export function SettingsForm({
  fields,
  submitLabel = 'Save changes',
}: {
  fields: Array<{ label: string; name: string; type?: string; placeholder?: string }>;
  submitLabel?: string;
}) {
  return (
    <form className="grid gap-4" method="post">
      {fields.map((field) => (
        <label key={field.name} className="grid gap-2 text-sm font-medium">
          {field.label}
          <input
            className="h-10 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 text-sm outline-none focus:border-bolt-elements-focus"
            name={field.name}
            type={field.type ?? 'text'}
            placeholder={field.placeholder}
          />
        </label>
      ))}
      <div>
        <Button type="submit">{submitLabel}</Button>
      </div>
    </form>
  );
}

export function ActivityList({ items }: { items: Array<{ title: string; detail: string; icon?: Icon }> }) {
  return (
    <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 shadow-sm">
      {items.map((item, index) => {
        const Icon = item.icon ?? Activity;
        return (
          <div
            key={item.title}
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

export function CommandPalettePreview() {
  const commands = [
    { label: 'Create project', to: '/projects/new' },
    { label: 'Open recent projects', to: '/recent-projects' },
    { label: 'Import GitHub repository', to: '/import-github' },
    { label: 'View usage', to: '/usage' },
    { label: 'Invite teammate', to: '/invitations' },
    { label: 'Rotate API key', to: '/api-keys' },
  ];
  return (
    <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-3 shadow-sm">
      <label className="flex items-center gap-2 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-sm">
        <Command className="h-4 w-4 text-bolt-elements-textTertiary" aria-hidden />
        <input
          className="min-w-0 flex-1 bg-transparent outline-none"
          placeholder="Type a command or search..."
          aria-label="Command palette search"
        />
        <kbd className="rounded border border-bolt-elements-borderColor px-1.5 py-0.5 text-xs text-bolt-elements-textTertiary">
          K
        </kbd>
      </label>
      <div className="mt-3 grid gap-1">
        {commands.map((command) => (
          <Link
            key={command.to}
            to={command.to}
            className="flex items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-bolt-elements-background-depth-3"
          >
            {command.label}
            <span className="text-xs text-bolt-elements-textTertiary">Enter</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

export function StatusPill({ label }: { label: string }) {
  return (
    <span className="rounded-full border border-bolt-elements-borderColor px-2 py-1 text-xs text-bolt-elements-textSecondary">
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
  return (
    <Link
      to={to}
      className={classNames(
        'inline-flex h-9 items-center justify-center rounded-md px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-bolt-elements-borderColor',
        variant === 'default' && 'bg-bolt-elements-button-primary-background text-bolt-elements-button-primary-text',
        variant === 'outline' &&
          'border border-bolt-elements-borderColor text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-2',
        variant === 'ghost' &&
          'text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-2 hover:text-bolt-elements-textPrimary',
      )}
    >
      {children}
    </Link>
  );
}

function TopBar() {
  return (
    <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-1/95 px-4 backdrop-blur-xl sm:px-6">
      <Link
        to="/organization-switcher"
        className="inline-flex items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-bolt-elements-background-depth-2"
      >
        <Menu className="h-4 w-4 lg:hidden" aria-hidden />
        <Building2 className="h-4 w-4" aria-hidden />
        Organizations
      </Link>
      <div className="flex items-center gap-2">
        <Link
          to="/command-palette"
          className="hidden items-center gap-2 rounded-md border border-bolt-elements-borderColor px-3 py-1.5 text-sm text-bolt-elements-textSecondary sm:inline-flex"
        >
          <Command className="h-4 w-4" aria-hidden />
          Command palette
        </Link>
        <Link
          to="/notifications"
          className="rounded-md p-2 hover:bg-bolt-elements-background-depth-2"
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" aria-hidden />
        </Link>
        <SignOutButton compact />
      </div>
    </header>
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
    <Form method="post" action="/logout">
      <button
        type="submit"
        className={classNames(
          'inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm text-bolt-elements-textSecondary transition-colors hover:bg-bolt-elements-background-depth-2 hover:text-bolt-elements-textPrimary',
          className,
        )}
        aria-label="Sign out"
        title={iconOnly ? 'Sign out' : undefined}
      >
        <LogOut className="h-4 w-4" aria-hidden />
        {iconOnly ? null : !compact ? <span>Sign out</span> : <span className="hidden sm:inline">Sign out</span>}
      </button>
    </Form>
  );
}

function NavGroup({
  items,
  collapsed = false,
}: {
  items: Array<{ label: string; to: string; icon: Icon }>;
  collapsed?: boolean;
}) {
  return (
    <div className="grid gap-1">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              classNames(
                'flex h-9 items-center rounded-md text-sm transition-colors',
                collapsed ? 'justify-center px-0' : 'gap-2 px-3',
                isActive
                  ? 'bg-bolt-elements-background-depth-3 text-bolt-elements-textPrimary'
                  : 'text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-3',
              )
            }
            aria-label={collapsed ? item.label : undefined}
            title={collapsed ? item.label : undefined}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden />
            {!collapsed ? <span className="truncate">{item.label}</span> : null}
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
          'rounded-md px-3 py-2 text-sm transition-colors hover:bg-bolt-elements-background-depth-2',
          isActive ? 'text-bolt-elements-textPrimary' : 'text-bolt-elements-textSecondary',
        )
      }
    >
      {children}
    </NavLink>
  );
}

export const dashboardStats = [
  { label: 'Active workspaces', value: '1 / 4', detail: 'Remote runtime capacity available', icon: MonitorPlay },
  { label: 'AI tokens', value: '42%', detail: 'Plan usage this billing period', icon: Sparkles },
  { label: 'Deployments', value: '8', detail: 'Production and preview releases', icon: Rocket },
  { label: 'Open issues', value: '0', detail: 'No critical workspace failures', icon: ShieldCheck },
];

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
      detail: 'Persistent projects loaded from API',
      icon: Boxes,
    },
    {
      label: 'Active workspaces',
      value: String(input?.activeWorkspaces ?? 0),
      detail: 'Runtime sessions recorded in Postgres',
      icon: MonitorPlay,
    },
    { label: 'Plan', value: input?.planName ?? 'Free', detail: 'Billing state loaded from backend', icon: CreditCard },
    {
      label: 'AI cost',
      value: `$${((input?.aiCostCents ?? 0) / 100).toFixed(2)}`,
      detail: `${input?.usageEvents ?? 0} usage events recorded`,
      icon: Sparkles,
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
    description: 'Start with Bolt AI and capture the result as a SaaS project.',
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
