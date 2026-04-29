import type React from 'react';
import { Link, NavLink } from '@remix-run/react';
import {
  Activity,
  Bell,
  BookOpen,
  Boxes,
  Braces,
  Building2,
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
  Lock,
  MailPlus,
  MonitorPlay,
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
import { Button } from '~/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/Card';
import { classNames } from '~/utils/classNames';

type Icon = LucideIcon;

export const publicNav = [
  { label: 'Pricing', to: '/pricing' },
  { label: 'Docs', to: '/docs' },
  { label: 'Templates', to: '/templates' },
  { label: 'Security', to: '/security' },
  { label: 'Contact sales', to: '/contact-sales' },
];

export const appNav = [
  { label: 'Dashboard', to: '/dashboard', icon: Gauge },
  { label: 'Projects', to: '/projects', icon: Boxes },
  { label: 'Create project', to: '/projects/new', icon: Sparkles },
  { label: 'Templates', to: '/templates', icon: Layers },
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

export const templates = [
  { name: 'React SaaS', stack: 'React, Vite, TypeScript', tag: 'Web app' },
  { name: 'Next dashboard', stack: 'Next.js, Prisma, Tailwind', tag: 'Full stack' },
  { name: 'Fastify API', stack: 'Node.js, Fastify, PostgreSQL', tag: 'Backend' },
  { name: 'AI agent', stack: 'RuntimeAdapter, tools, streaming', tag: 'AI' },
  { name: 'Landing page', stack: 'Remix, responsive content', tag: 'Marketing' },
  { name: 'Mobile starter', stack: 'Expo, shared packages', tag: 'Mobile' },
];

export interface ProjectCard {
  id: string;
  name: string;
  status?: string;
  updated?: string;
  stack?: string;
  sourceType?: string;
}

export function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-bolt-elements-background-depth-1 text-bolt-elements-textPrimary">
      <header className="sticky top-0 z-20 border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-1/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2 text-sm font-semibold" aria-label="VibeCore home">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-bolt-elements-background-depth-3">
              <Sparkles className="h-4 w-4" aria-hidden />
            </span>
            VibeCore
          </Link>
          <nav className="hidden items-center gap-1 md:flex" aria-label="Public navigation">
            {publicNav.map((item) => (
              <NavButton key={item.to} to={item.to}>
                {item.label}
              </NavButton>
            ))}
            <NavButton to="/changelog">Changelog</NavButton>
            <NavButton to="/status">Status</NavButton>
          </nav>
          <div className="flex items-center gap-2">
            <LinkButton to="/login" variant="ghost">
              Sign in
            </LinkButton>
            <LinkButton to="/signup">Start</LinkButton>
          </div>
        </div>
      </header>
      {children}
    </main>
  );
}

export function AppShell({
  title,
  description,
  children,
  actions,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-bolt-elements-background-depth-1 text-bolt-elements-textPrimary">
      <div className="grid min-h-screen lg:grid-cols-[256px_1fr]">
        <aside className="border-r border-bolt-elements-borderColor bg-bolt-elements-background-depth-2">
          <div className="flex h-14 items-center gap-2 border-b border-bolt-elements-borderColor px-4">
            <Sparkles className="h-5 w-5" aria-hidden />
            <span className="font-semibold">VibeCore</span>
          </div>
          <nav className="space-y-6 p-3" aria-label="Application navigation">
            <NavGroup items={appNav} />
            <div>
              <p className="px-3 pb-2 text-xs font-medium uppercase text-bolt-elements-textTertiary">Account</p>
              <NavGroup items={accountNav} />
            </div>
          </nav>
        </aside>
        <section className="min-w-0">
          <TopBar />
          <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h1 className="text-2xl font-semibold tracking-normal">{title}</h1>
                <p className="mt-2 max-w-3xl text-sm text-bolt-elements-textSecondary">{description}</p>
              </div>
              {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
            </div>
            {children}
          </div>
        </section>
      </div>
    </main>
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
      <div className="mb-6 overflow-x-auto rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-2">
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
          <Card key={stat.label}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardDescription>{stat.label}</CardDescription>
                <Icon className="h-4 w-4 text-bolt-elements-textTertiary" aria-hidden />
              </div>
              <CardTitle className="text-2xl">{stat.value}</CardTitle>
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
        <Card key={project.id} className="overflow-hidden">
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
            <div className="h-24 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-3">
              <div className="mb-2 h-2 w-2/3 rounded bg-bolt-elements-background-depth-3" />
              <div className="mb-2 h-2 w-1/2 rounded bg-bolt-elements-background-depth-3" />
              <div className="h-2 w-5/6 rounded bg-bolt-elements-background-depth-3" />
            </div>
            <div className="flex items-center justify-between text-xs text-bolt-elements-textSecondary">
              <span>Updated {project.updated ?? 'recently'}</span>
              <Link
                to={`/projects/${project.id}`}
                className="font-medium text-bolt-elements-textPrimary hover:underline"
              >
                Manage
              </Link>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function TemplateGallery({ compact = false }: { compact?: boolean }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {templates.map((template) => (
        <Card key={template.name}>
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
              <LinkButton to="/projects/new" variant="outline">
                Use template
              </LinkButton>
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
    <div className="rounded-lg border border-dashed border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-8 text-center">
      <PanelIcon className="mx-auto mb-3 h-8 w-8 text-bolt-elements-textTertiary" aria-hidden />
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
    <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2">
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
    'Create project',
    'Open recent IDE',
    'Import GitHub repository',
    'View usage',
    'Invite teammate',
    'Rotate API key',
  ];
  return (
    <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-3">
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
          <button
            key={command}
            className="flex items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-bolt-elements-background-depth-3"
          >
            {command}
            <span className="text-xs text-bolt-elements-textTertiary">Enter</span>
          </button>
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
    <header className="flex h-14 items-center justify-between border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-4 sm:px-6">
      <Link
        to="/organization-switcher"
        className="inline-flex items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-bolt-elements-background-depth-2"
      >
        <Building2 className="h-4 w-4" aria-hidden />
        Acme Workspace
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
      </div>
    </header>
  );
}

function NavGroup({ items }: { items: Array<{ label: string; to: string; icon: Icon }> }) {
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
                'flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
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
    to: '/templates',
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
