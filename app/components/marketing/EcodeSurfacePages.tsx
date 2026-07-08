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
import type { MetaFunction } from 'react-router';
import { Link, useParams } from 'react-router';
import { PublicShell } from '~/components/dashboard/SaaSLayout';

type SurfaceCategory =
  | 'builder'
  | 'runtime'
  | 'data'
  | 'security'
  | 'team'
  | 'learning'
  | 'marketplace'
  | 'admin'
  | 'integration'
  | 'ai';

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
}

const categoryCopy = {
  builder: {
    eyebrow: 'Builder surface',
    primaryAction: ['Create project', '/projects/new'],
    secondaryAction: ['Browse templates', '/templates'],
    stats: [
      { label: 'Route status', value: 'Live page' },
      { label: 'Source', value: 'E-Code import' },
      { label: 'Flow', value: 'Prompt to preview' },
    ],
    controls: ['Typed project files', 'Preview verification', 'Agent patch review', 'Deployment handoff'],
    relatedRoutes: [
      { label: 'New project', to: '/projects/new', description: 'Start a governed E-Code workspace.' },
      { label: 'Templates', to: '/templates', description: 'Use production starters as a foundation.' },
      { label: 'Features', to: '/features', description: 'Review the imported E-Code product surface.' },
    ],
  },
  runtime: {
    eyebrow: 'Runtime surface',
    primaryAction: ['Open diagnostics', '/runtime-diagnostics'],
    secondaryAction: ['View status', '/status'],
    stats: [
      { label: 'Runtime loop', value: 'Run, log, preview' },
      { label: 'Adapters', value: 'Connected' },
      { label: 'Failure mode', value: 'Recoverable' },
    ],
    controls: ['Port detection', 'Log visibility', 'Preview health', 'Deployment readiness'],
    relatedRoutes: [
      {
        label: 'Runtime diagnostics',
        to: '/runtime-diagnostics',
        description: 'Inspect runtime readiness and errors.',
      },
      { label: 'Preview', to: '/preview', description: 'Validate rendered application output.' },
      { label: 'Status', to: '/status', description: 'Check platform operational state.' },
    ],
  },
  data: {
    eyebrow: 'Data surface',
    primaryAction: ['Open database', '/database'],
    secondaryAction: ['Read docs', '/docs'],
    stats: [
      { label: 'Data layer', value: 'Modeled' },
      { label: 'Secrets', value: 'Isolated' },
      { label: 'Preview', value: 'Seedable' },
    ],
    controls: ['Schema planning', 'Environment boundaries', 'Seed data', 'Rollback path'],
    relatedRoutes: [
      { label: 'Database', to: '/database', description: 'Model app data and persistence.' },
      { label: 'Object storage', to: '/object-storage', description: 'Attach files and media to projects.' },
      { label: 'Secrets', to: '/secrets', description: 'Keep credentials outside generated code.' },
    ],
  },
  security: {
    eyebrow: 'Security surface',
    primaryAction: ['Review security', '/security'],
    secondaryAction: ['Contact sales', '/contact-sales'],
    stats: [
      { label: 'Identity', value: 'Governed' },
      { label: 'Policy', value: 'Visible' },
      { label: 'Audit', value: 'Traceable' },
    ],
    controls: ['SSO planning', 'Role boundaries', 'Secrets hygiene', 'Audit evidence'],
    relatedRoutes: [
      { label: 'Security', to: '/security', description: 'Review public trust and security posture.' },
      { label: 'Authentication', to: '/authentication', description: 'Plan identity flows for generated apps.' },
      { label: 'Custom roles', to: '/custom-roles', description: 'Map access to team responsibility.' },
    ],
  },
  team: {
    eyebrow: 'Team surface',
    primaryAction: ['Open teams', '/teams'],
    secondaryAction: ['Contact sales', '/contact-sales'],
    stats: [
      { label: 'Collaboration', value: 'Shared' },
      { label: 'Access', value: 'Role-based' },
      { label: 'Review', value: 'Auditable' },
    ],
    controls: ['Member invites', 'Project access', 'Billing ownership', 'Release review'],
    relatedRoutes: [
      { label: 'Teams', to: '/teams', description: 'Coordinate members, billing and project access.' },
      { label: 'Collaboration', to: '/collaboration', description: 'Review multiplayer development workflows.' },
      { label: 'Marketing teams', to: '/marketing/teams', description: 'See enterprise team positioning.' },
    ],
  },
  learning: {
    eyebrow: 'Learning surface',
    primaryAction: ['Start learning', '/learn'],
    secondaryAction: ['Open docs', '/docs'],
    stats: [
      { label: 'Guides', value: 'Practical' },
      { label: 'Examples', value: 'Routable' },
      { label: 'Depth', value: 'Beginner to advanced' },
    ],
    controls: ['Guided tutorials', 'Reference docs', 'Template examples', 'Troubleshooting paths'],
    relatedRoutes: [
      { label: 'Learn', to: '/learn', description: 'Follow structured E-Code learning paths.' },
      { label: 'Tutorials', to: '/tutorials', description: 'Build real projects step by step.' },
      { label: 'Docs', to: '/docs', description: 'Use the primary product reference.' },
    ],
  },
  marketplace: {
    eyebrow: 'Marketplace surface',
    primaryAction: ['Explore apps', '/apps'],
    secondaryAction: ['Browse marketplace', '/marketplace'],
    stats: [
      { label: 'Catalog', value: 'Curated' },
      { label: 'Launch path', value: 'Template to app' },
      { label: 'Reuse', value: 'Team-ready' },
    ],
    controls: ['Reusable starters', 'Extension points', 'App templates', 'Review before release'],
    relatedRoutes: [
      { label: 'Apps', to: '/apps', description: 'Browse imported app and product surfaces.' },
      { label: 'Marketplace', to: '/marketplace', description: 'Discover reusable starters and patterns.' },
      { label: 'Extensions', to: '/extensions', description: 'Extend workspaces with approved tools.' },
    ],
  },
  admin: {
    eyebrow: 'Operations surface',
    primaryAction: ['Open analytics', '/analytics'],
    secondaryAction: ['Review account', '/account'],
    stats: [
      { label: 'Visibility', value: 'Operational' },
      { label: 'Controls', value: 'Account-aware' },
      { label: 'Signals', value: 'Actionable' },
    ],
    controls: ['Usage tracking', 'Plan visibility', 'Account settings', 'Operational alerts'],
    relatedRoutes: [
      { label: 'Analytics', to: '/analytics', description: 'Understand usage and delivery signals.' },
      { label: 'Account', to: '/account', description: 'Manage account-level product access.' },
      { label: 'Usage alerts', to: '/usage-alerts', description: 'Keep teams inside clear limits.' },
    ],
  },
  integration: {
    eyebrow: 'Integration surface',
    primaryAction: ['Connect GitHub', '/import-github'],
    secondaryAction: ['View integrations', '/integrations'],
    stats: [
      { label: 'Source', value: 'Importable' },
      { label: 'Adapters', value: 'Mapped' },
      { label: 'Tools', value: 'Governed' },
    ],
    controls: ['Repository import', 'Provider adapters', 'API contracts', 'Connection health'],
    relatedRoutes: [
      { label: 'GitHub import', to: '/import-github', description: 'Import repositories into E-Code.' },
      { label: 'Integrations', to: '/integrations', description: 'Connect approved product tools.' },
      { label: 'API SDK', to: '/api-sdk', description: 'Build against typed platform interfaces.' },
    ],
  },
  ai: {
    eyebrow: 'AI surface',
    primaryAction: ['Open AI studio', '/ai-agent/studio'],
    secondaryAction: ['Read AI docs', '/ai-documentation'],
    stats: [
      { label: 'Agent loop', value: 'Reviewable' },
      { label: 'Context', value: 'Workspace-aware' },
      { label: 'Output', value: 'Validated' },
    ],
    controls: ['Prompt planning', 'Patch review', 'Tool boundaries', 'Preview-aware checks'],
    relatedRoutes: [
      { label: 'AI Agent Studio', to: '/ai-agent/studio', description: 'Plan and inspect agent work.' },
      { label: 'Assistant', to: '/assistant', description: 'Use the everyday coding copilot.' },
      { label: 'AI documentation', to: '/ai-documentation', description: 'Understand model and tool behavior.' },
    ],
  },
} as const satisfies Record<
  SurfaceCategory,
  {
    eyebrow: string;
    primaryAction: SurfaceAction;
    secondaryAction: SurfaceAction;
    stats: readonly SurfaceStat[];
    controls: readonly string[];
    relatedRoutes: readonly SurfaceRelatedRoute[];
  }
>;

function makeSurfacePage(input: SurfacePageInput): EcodeSurfacePageDefinition {
  const category = categoryCopy[input.category];

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
        title: `${input.title} workflow`,
        body: `${input.title} is now a real E-Code route backed by the imported E-Code product map. It keeps the user moving from intent to a visible, recoverable product workflow.`,
        items: input.highlights,
      },
      {
        title: 'Production controls',
        body: 'The route is wired through the public shell, navigation-safe links and responsive content instead of an empty compatibility page.',
        items: category.controls,
      },
    ],
    relatedRoutes: input.relatedRoutes ?? category.relatedRoutes,
  };
}

export const ecodeSurfacePages = {
  new: makeSurfacePage({
    slug: 'new',
    title: 'New E-Code Project',
    description:
      'A direct creation route for teams starting a new AI-built application from a prompt, template or import.',
    category: 'builder',
    icon: Plus,
    highlights: ['Natural-language brief', 'Template selection', 'Git/import choices', 'Preview-first validation'],
  }),
  home: makeSurfacePage({
    slug: 'home',
    title: 'Workspace Home',
    description:
      'A signed-in style home surface that routes users to recent work, creation flows, docs and team activity.',
    category: 'builder',
    icon: Gauge,
    highlights: ['Recent projects', 'Creation shortcuts', 'Team activity', 'Operational status'],
  }),
  'agent-activity': makeSurfacePage({
    slug: 'agent-activity',
    title: 'Agent Activity',
    description: 'A traceable activity route for AI planning, patch review, command execution and validation outcomes.',
    category: 'ai',
    icon: Activity,
    highlights: ['Prompt history', 'Patch summaries', 'Command results', 'Review checkpoints'],
  }),
  apps: makeSurfacePage({
    slug: 'apps',
    title: 'Apps',
    description:
      'The imported E-Code app catalog for internal tools, SaaS surfaces, AI workflows and reusable product kits.',
    category: 'marketplace',
    icon: Boxes,
    highlights: ['Internal tools', 'SaaS starters', 'AI applications', 'Reusable workspace kits'],
  }),
  teams: makeSurfacePage({
    slug: 'teams',
    title: 'Teams',
    description:
      'The plural E-Code teams route for organization workspaces, members, roles, billing and governed projects.',
    category: 'team',
    icon: Users,
    highlights: ['Members and roles', 'Shared billing', 'Project access', 'Audit-ready review'],
  }),
  vnc: makeSurfacePage({
    slug: 'vnc',
    title: 'VNC Runtime',
    description:
      'A runtime screen route for desktop-style previews, visual debugging and remote application inspection.',
    category: 'runtime',
    icon: MonitorPlay,
    highlights: ['Visual runtime access', 'Preview inspection', 'Remote debugging', 'Recoverable session state'],
  }),
  analytics: makeSurfacePage({
    slug: 'analytics',
    title: 'Analytics',
    description: 'Operational analytics for usage, build velocity, preview health, agent activity and team adoption.',
    category: 'admin',
    icon: Gauge,
    highlights: ['Usage signals', 'Preview health', 'Build velocity', 'Team adoption'],
  }),
  scalability: makeSurfacePage({
    slug: 'scalability',
    title: 'Scalability',
    description:
      'Capacity planning content for teams growing from first project to enterprise runtime and governance needs.',
    category: 'admin',
    icon: Rocket,
    highlights: ['Runtime scaling', 'Team growth', 'Release capacity', 'Enterprise controls'],
  }),
  education: makeSurfacePage({
    slug: 'education',
    title: 'Education',
    description: 'Education program guidance for classrooms, bootcamps and universities adopting E-Code safely.',
    category: 'learning',
    icon: Users,
    highlights: ['Student workspaces', 'Classroom templates', 'Privacy controls', 'Instructor review'],
  }),
  'api-sdk': makeSurfacePage({
    slug: 'api-sdk',
    title: 'API SDK',
    description:
      'Typed integration guidance for teams connecting E-Code projects, runtime events and platform automation.',
    category: 'integration',
    icon: Braces,
    highlights: ['Typed clients', 'Runtime events', 'Project automation', 'Webhook-ready contracts'],
  }),
  'mobile-apps': makeSurfacePage({
    slug: 'mobile-apps',
    title: 'Mobile Apps',
    description:
      'Mobile application delivery paths that connect Expo-style projects, previews and release preparation.',
    category: 'builder',
    icon: MonitorSmartphone,
    highlights: ['Phone previews', 'Tablet workflows', 'Expo starters', 'Release assets'],
  }),
  profile: makeSurfacePage({
    slug: 'profile',
    title: 'Profile',
    description: 'A public profile route for builders, projects, community identity and shared E-Code work.',
    category: 'team',
    icon: Users,
    highlights: ['Builder identity', 'Shared projects', 'Community context', 'Verified routes'],
  }),
  runtimes: makeSurfacePage({
    slug: 'runtimes',
    title: 'Runtimes',
    description:
      'Runtime choices for generated apps, including browser previews, remote execution and deployment handoff.',
    category: 'runtime',
    icon: Rocket,
    highlights: ['Browser runtime', 'Remote execution', 'Port mapping', 'Deployment handoff'],
  }),
  'runtime-diagnostics': makeSurfacePage({
    slug: 'runtime-diagnostics',
    title: 'Runtime Diagnostics',
    description:
      'A diagnostics surface for dependency install, server start, preview rendering and runtime error recovery.',
    category: 'runtime',
    icon: Activity,
    highlights: ['Install checks', 'Server health', 'Port detection', 'Error recovery'],
  }),
  'search-advanced': makeSurfacePage({
    slug: 'search-advanced',
    title: 'Advanced Search',
    description:
      'Search across projects, files, docs, templates, community content and agent activity with clearer scopes.',
    category: 'builder',
    icon: Search,
    highlights: ['Project scope', 'File search', 'Docs search', 'Agent context'],
  }),
  secrets: makeSurfacePage({
    slug: 'secrets',
    title: 'Secrets',
    description:
      'A secure route for environment secrets, provider credentials and runtime-safe configuration practices.',
    category: 'security',
    icon: Lock,
    highlights: ['Encrypted values', 'Runtime boundaries', 'Provider keys', 'No source leakage'],
  }),
  workflows: makeSurfacePage({
    slug: 'workflows',
    title: 'Workflows',
    description: 'Automated development workflows for generation, validation, review, preview and release preparation.',
    category: 'builder',
    icon: GitBranch,
    highlights: ['Prompt to patch', 'Validation gates', 'Review loops', 'Release preparation'],
  }),
  ssh: makeSurfacePage({
    slug: 'ssh',
    title: 'SSH Access',
    description: 'Secure shell access guidance for advanced runtime debugging without bypassing team controls.',
    category: 'security',
    icon: Terminal,
    highlights: ['Secure sessions', 'Scoped access', 'Audit context', 'Runtime debugging'],
  }),
  'security-scanner': makeSurfacePage({
    slug: 'security-scanner',
    title: 'Security Scanner',
    description: 'Scan generated code, dependencies and configuration for security issues before preview or release.',
    category: 'security',
    icon: ShieldCheck,
    highlights: ['Dependency review', 'Secret detection', 'Config checks', 'Release confidence'],
  }),
  dependencies: makeSurfacePage({
    slug: 'dependencies',
    title: 'Dependencies',
    description:
      'Dependency insight for generated projects, package updates, install failures and runtime compatibility.',
    category: 'runtime',
    icon: FileArchive,
    highlights: ['Package graph', 'Install health', 'Version updates', 'Runtime compatibility'],
  }),
  'object-storage': makeSurfacePage({
    slug: 'object-storage',
    title: 'Object Storage',
    description: 'Object storage planning for uploaded files, generated assets, public media and user content.',
    category: 'data',
    icon: FileArchive,
    highlights: ['Uploads', 'Public media', 'Access policies', 'Asset lifecycle'],
  }),
  'usage-alerts': makeSurfacePage({
    slug: 'usage-alerts',
    title: 'Usage Alerts',
    description: 'Alerting surfaces for spend, runtime limits, AI usage, team quotas and operational thresholds.',
    category: 'admin',
    icon: Activity,
    highlights: ['Spend alerts', 'Runtime limits', 'AI usage', 'Team quotas'],
  }),
  'mobile-admin': makeSurfacePage({
    slug: 'mobile-admin',
    title: 'Mobile Admin',
    description: 'Admin controls designed for phone and tablet review of projects, team access and platform state.',
    category: 'admin',
    icon: MonitorSmartphone,
    highlights: ['Mobile approvals', 'Team access', 'Project review', 'Operational status'],
  }),
  account: makeSurfacePage({
    slug: 'account',
    title: 'Account',
    description: 'Account-level settings for identity, plan ownership, billing direction and secure product access.',
    category: 'admin',
    icon: Settings,
    highlights: ['Identity', 'Billing context', 'Plan ownership', 'Security settings'],
  }),
  cycles: makeSurfacePage({
    slug: 'cycles',
    title: 'Cycles',
    description: 'Product cycle planning for prompts, implementation passes, validation gates and release readiness.',
    category: 'team',
    icon: Activity,
    highlights: ['Planning cycles', 'Build passes', 'Validation gates', 'Release readiness'],
  }),
  powerups: makeSurfacePage({
    slug: 'powerups',
    title: 'Powerups',
    description: 'Enhancement packs for agents, templates, integrations and runtime capabilities inside E-Code.',
    category: 'marketplace',
    icon: Sparkles,
    highlights: ['Agent boosts', 'Template packs', 'Runtime add-ons', 'Integration kits'],
  }),
  badges: makeSurfacePage({
    slug: 'badges',
    title: 'Badges',
    description: 'Recognition surfaces for builders, teams, launches, contribution quality and community activity.',
    category: 'marketplace',
    icon: ShieldCheck,
    highlights: ['Builder recognition', 'Launch milestones', 'Quality signals', 'Community proof'],
  }),
  subscribe: makeSurfacePage({
    slug: 'subscribe',
    title: 'Subscribe',
    description: 'A subscription route for plan selection, product updates and ongoing E-Code access.',
    category: 'admin',
    icon: CheckCircle2,
    highlights: ['Plan selection', 'Billing path', 'Product updates', 'Account continuity'],
  }),
  plans: makeSurfacePage({
    slug: 'plans',
    title: 'Plans',
    description: 'Plan comparison content for individuals, teams and enterprises using the E-Code platform.',
    category: 'admin',
    icon: Gauge,
    highlights: ['Individual plan', 'Team plan', 'Enterprise plan', 'Usage controls'],
    secondaryAction: ['View pricing', '/pricing'],
  }),
  learn: makeSurfacePage({
    slug: 'learn',
    title: 'Learn',
    description: 'Structured learning paths for prompt-to-app delivery, runtimes, security and team workflows.',
    category: 'learning',
    icon: LifeBuoy,
    highlights: ['First project', 'Runtime basics', 'Security practices', 'Team delivery'],
  }),
  themes: makeSurfacePage({
    slug: 'themes',
    title: 'Themes',
    description: 'Theme guidance for dark default, light mode, app styling, brand tokens and generated UI consistency.',
    category: 'builder',
    icon: Command,
    highlights: ['Dark default', 'Light toggle', 'Brand tokens', 'Responsive styling'],
  }),
  performance: makeSurfacePage({
    slug: 'performance',
    title: 'Performance',
    description:
      'Performance guidance for generated apps, previews, bundles, runtime start and user-facing responsiveness.',
    category: 'runtime',
    icon: Gauge,
    highlights: ['Bundle awareness', 'Fast previews', 'Runtime startup', 'Responsive UI'],
  }),
  'sso-configuration': makeSurfacePage({
    slug: 'sso-configuration',
    title: 'SSO Configuration',
    description: 'Configure enterprise identity, SAML/OIDC handoff, team domains and secure onboarding flows.',
    category: 'security',
    icon: KeyRound,
    highlights: ['SAML/OIDC', 'Domain policy', 'Secure onboarding', 'Access audit'],
  }),
  'custom-roles': makeSurfacePage({
    slug: 'custom-roles',
    title: 'Custom Roles',
    description: 'Role design for project access, billing administration, security ownership and release approvals.',
    category: 'security',
    icon: Users,
    highlights: ['Project roles', 'Billing admins', 'Security owners', 'Release approvers'],
  }),
  assistant: makeSurfacePage({
    slug: 'assistant',
    title: 'Assistant',
    description: 'The E-Code assistant route for daily coding help, project context, review support and next actions.',
    category: 'ai',
    icon: Sparkles,
    highlights: ['Project-aware help', 'Code suggestions', 'Review support', 'Next actions'],
  }),
  'code-search': makeSurfacePage({
    slug: 'code-search',
    title: 'Code Search',
    description: 'Code search across generated files, templates, dependencies and team-owned project repositories.',
    category: 'builder',
    icon: FileCode2,
    highlights: ['File search', 'Symbol discovery', 'Template lookup', 'Team context'],
  }),
  problems: makeSurfacePage({
    slug: 'problems',
    title: 'Problems',
    description: 'A diagnostics route for TypeScript errors, runtime failures, dependency issues and preview blockers.',
    category: 'runtime',
    icon: LifeBuoy,
    highlights: ['Type errors', 'Runtime failures', 'Dependency issues', 'Preview blockers'],
  }),
  database: makeSurfacePage({
    slug: 'database',
    title: 'Database',
    description: 'Database planning and implementation guidance for generated apps with real schemas and migrations.',
    category: 'data',
    icon: Braces,
    highlights: ['Schema design', 'Migrations', 'Seed data', 'Query safety'],
  }),
  console: makeSurfacePage({
    slug: 'console',
    title: 'Console',
    description: 'A product console route for commands, status output, runtime logs and operational actions.',
    category: 'runtime',
    icon: Command,
    highlights: ['Command output', 'Runtime logs', 'Operational actions', 'Status visibility'],
  }),
  shell: makeSurfacePage({
    slug: 'shell',
    title: 'Shell',
    description: 'Shell workflow guidance for controlled command execution inside an E-Code project environment.',
    category: 'runtime',
    icon: Terminal,
    highlights: ['Command execution', 'Environment context', 'Log capture', 'Safe recovery'],
  }),
  packages: makeSurfacePage({
    slug: 'packages',
    title: 'Packages',
    description:
      'Package management content for dependencies, workspace packages, version updates and install diagnostics.',
    category: 'runtime',
    icon: FileArchive,
    highlights: ['Workspace packages', 'Dependency versions', 'Install diagnostics', 'Update paths'],
  }),
  'kv-store': makeSurfacePage({
    slug: 'kv-store',
    title: 'KV Store',
    description: 'Key-value storage guidance for sessions, feature flags, lightweight state and edge-ready products.',
    category: 'data',
    icon: Layers,
    highlights: ['Session state', 'Feature flags', 'Edge data', 'Low-latency reads'],
  }),
  preview: makeSurfacePage({
    slug: 'preview',
    title: 'Preview',
    description: 'Preview validation for generated apps, visual QA, route checks and runtime readiness.',
    category: 'runtime',
    icon: MonitorPlay,
    highlights: ['Visual QA', 'Route checks', 'Runtime readiness', 'Shareable review'],
  }),
  authentication: makeSurfacePage({
    slug: 'authentication',
    title: 'Authentication',
    description: 'Authentication architecture for generated apps, from passwords and OAuth to enterprise SSO.',
    category: 'security',
    icon: KeyRound,
    highlights: ['Password auth', 'OAuth', 'Session security', 'Enterprise SSO'],
  }),
  extensions: makeSurfacePage({
    slug: 'extensions',
    title: 'Extensions',
    description: 'Extension points for project tools, data connectors, automations and approved agent capabilities.',
    category: 'integration',
    icon: Layers,
    highlights: ['Tool extensions', 'Data connectors', 'Agent capabilities', 'Approval controls'],
  }),
  integrations: makeSurfacePage({
    slug: 'integrations',
    title: 'Integrations',
    description: 'Connect source control, deployment providers, databases, AI providers and operational systems.',
    category: 'integration',
    icon: Globe2,
    highlights: ['Source control', 'Deployment providers', 'Databases', 'AI providers'],
  }),
  networking: makeSurfacePage({
    slug: 'networking',
    title: 'Networking',
    description: 'Networking guidance for exposed ports, preview URLs, custom domains and secure runtime connectivity.',
    category: 'runtime',
    icon: Globe2,
    highlights: ['Port mapping', 'Preview URLs', 'Custom domains', 'Secure connectivity'],
  }),
  threads: makeSurfacePage({
    slug: 'threads',
    title: 'Threads',
    description: 'Discussion threads for project review, agent decisions, team questions and release coordination.',
    category: 'team',
    icon: Users,
    highlights: ['Project discussion', 'Agent decisions', 'Review questions', 'Release coordination'],
  }),
  referrals: makeSurfacePage({
    slug: 'referrals',
    title: 'Referrals',
    description: 'Referral and invite flows for bringing builders, teams and partners into E-Code workspaces.',
    category: 'marketplace',
    icon: Users,
    highlights: ['Builder invites', 'Team referrals', 'Partner paths', 'Community growth'],
  }),
  'solartech-ai-chat': makeSurfacePage({
    slug: 'solartech-ai-chat',
    title: 'SolarTech AI Chat',
    description:
      'A real app route for the imported SolarTech AI chat template with support, sales and workflow patterns.',
    category: 'ai',
    icon: Sparkles,
    highlights: ['AI chat UX', 'Support workflows', 'Knowledge routing', 'Template-ready app'],
  }),
  'solartech-crm': makeSurfacePage({
    slug: 'solartech-crm',
    title: 'SolarTech CRM',
    description: 'A CRM app template route for pipeline management, accounts, opportunities and operational workflows.',
    category: 'marketplace',
    icon: Boxes,
    highlights: ['Pipeline views', 'Accounts', 'Opportunities', 'Operational dashboards'],
  }),
  'salesforcepro-crm': makeSurfacePage({
    slug: 'salesforcepro-crm',
    title: 'SalesforcePro CRM',
    description: 'An enterprise CRM template route adapted from E-Code for sales operations and account intelligence.',
    category: 'marketplace',
    icon: Users,
    highlights: ['Sales operations', 'Account intelligence', 'Team workflows', 'Executive reporting'],
  }),
  'solartech-fortune500-store': makeSurfacePage({
    slug: 'solartech-fortune500-store',
    title: 'SolarTech Fortune 500 Store',
    description: 'A commerce and procurement app route for enterprise catalogs, approvals and customer buying flows.',
    category: 'marketplace',
    icon: Boxes,
    highlights: ['Enterprise catalog', 'Procurement approvals', 'Commerce UX', 'Customer workflows'],
  }),
} as const satisfies Record<string, EcodeSurfacePageDefinition>;

export const ecodeAdvancedSurfacePages = {
  mobile: makeSurfacePage({
    slug: 'advanced/mobile',
    route: '/advanced/mobile',
    title: 'Advanced Mobile',
    description: 'Advanced mobile delivery for responsive IDE surfaces, app assets, previews and release workflows.',
    category: 'builder',
    icon: MonitorSmartphone,
    highlights: ['Responsive IDE', 'App assets', 'Mobile previews', 'Release workflows'],
  }),
  sso: makeSurfacePage({
    slug: 'advanced/sso',
    route: '/advanced/sso',
    title: 'Advanced SSO',
    description: 'Advanced identity architecture for enterprise SAML/OIDC, SCIM, domains and role mapping.',
    category: 'security',
    icon: KeyRound,
    highlights: ['SAML/OIDC', 'SCIM', 'Domain controls', 'Role mapping'],
  }),
  collaboration: makeSurfacePage({
    slug: 'advanced/collaboration',
    route: '/advanced/collaboration',
    title: 'Advanced Collaboration',
    description:
      'Team collaboration patterns for review threads, shared context, access controls and release coordination.',
    category: 'team',
    icon: Users,
    highlights: ['Review threads', 'Shared context', 'Access controls', 'Release coordination'],
  }),
  storage: makeSurfacePage({
    slug: 'advanced/storage',
    route: '/advanced/storage',
    title: 'Advanced Storage',
    description:
      'Storage architecture for generated apps, object buckets, KV data, database files and media lifecycle.',
    category: 'data',
    icon: FileArchive,
    highlights: ['Object buckets', 'KV data', 'Database files', 'Media lifecycle'],
  }),
  community: makeSurfacePage({
    slug: 'advanced/community',
    route: '/advanced/community',
    title: 'Advanced Community',
    description: 'Community architecture for posts, profiles, moderation, templates and builder discovery.',
    category: 'marketplace',
    icon: Users,
    highlights: ['Profiles', 'Posts', 'Moderation', 'Builder discovery'],
  }),
} as const satisfies Record<string, EcodeSurfacePageDefinition>;

export const ecodeStandaloneSurfacePages = {
  'ai-agent/studio': makeSurfacePage({
    slug: 'ai-agent/studio',
    route: '/ai-agent/studio',
    title: 'AI Agent Studio',
    description: 'A studio route for planning, supervising and validating E-Code AI agent work inside real projects.',
    category: 'ai',
    icon: Sparkles,
    highlights: ['Prompt planning', 'Tool boundaries', 'Patch review', 'Preview-aware validation'],
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
    title: 'New Editor Session',
    description: 'Start a fresh editor session for an E-Code project, prompt or imported workspace.',
    category: 'builder',
    icon: FileCode2,
    highlights: ['Fresh workspace', 'Prompt context', 'File editor', 'Preview handoff'],
  }),
  'teams/new': makeSurfacePage({
    slug: 'teams/new',
    route: '/teams/new',
    title: 'New Team',
    description: 'Create a new E-Code team workspace with members, roles, billing context and project governance.',
    category: 'team',
    icon: Plus,
    highlights: ['Team creation', 'Member invites', 'Role planning', 'Shared billing'],
  }),
  'user/settings': makeSurfacePage({
    slug: 'user/settings',
    route: '/user/settings',
    title: 'User Settings',
    description: 'Personal settings for identity, notifications, editor defaults and connected E-Code accounts.',
    category: 'admin',
    icon: Settings,
    highlights: ['Identity settings', 'Notifications', 'Editor defaults', 'Connected accounts'],
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

export function makeEcodeSurfaceMetaTags(page: EcodeSurfacePageDefinition) {
  return [{ title: `${page.title} - E-Code` }, { name: 'description', content: page.description }];
}

export function makeEcodeSurfaceMeta(page: EcodeSurfacePageDefinition): MetaFunction {
  return () => makeEcodeSurfaceMetaTags(page);
}

export function EcodeSurfacePageBySlug() {
  const params = useParams();
  const slug = params.slug ?? '';
  const page = getEcodeSurfacePage(slug);

  if (!page) {
    throw new Response('E-Code surface page not found', { status: 404 });
  }

  return <EcodeSurfacePage page={page} />;
}

export function EcodeAdvancedSurfaceRoute() {
  const params = useParams();
  const page = getEcodeAdvancedSurfacePage(params.section ?? '');

  if (!page) {
    throw new Response('Advanced E-Code surface page not found', { status: 404 });
  }

  return <EcodeSurfacePage page={page} />;
}

export function EcodeSurfacePage({ page }: { page: EcodeSurfacePageDefinition }) {
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
              <span className="inline-flex items-center gap-2 rounded-full border border-[var(--ecode-border)] bg-[var(--ecode-surface)] px-4 py-2 text-[13px] font-semibold uppercase tracking-[0.24em] text-[var(--ecode-accent)]">
                <Icon className="h-4 w-4" aria-hidden />
                {page.eyebrow}
              </span>
              <h1 className="mt-8 max-w-4xl text-5xl font-bold leading-[1.04] tracking-tight text-[var(--ecode-text)] sm:text-6xl lg:text-7xl">
                {page.title}
              </h1>
              <p className="mt-6 max-w-3xl text-lg leading-8 text-[var(--ecode-text-secondary)] sm:text-xl">
                {page.description}
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <EcodeSurfaceActionLink to={page.primaryAction[1]}>{page.primaryAction[0]}</EcodeSurfaceActionLink>
                <EcodeSurfaceActionLink to={page.secondaryAction[1]} variant="secondary">
                  {page.secondaryAction[0]}
                </EcodeSurfaceActionLink>
              </div>
            </div>

            <aside
              className="overflow-hidden rounded-lg border border-[var(--ecode-border)] bg-[var(--ecode-surface)] shadow-[0_24px_80px_rgba(0,0,0,0.18)]"
              aria-label={`${page.title} route details`}
            >
              <div className="flex h-11 items-center gap-2 border-b border-[var(--ecode-border)] bg-[var(--ecode-surface-secondary)] px-4">
                <span className="h-2.5 w-2.5 rounded-full bg-red-400" aria-hidden />
                <span className="h-2.5 w-2.5 rounded-full bg-yellow-400" aria-hidden />
                <span className="h-2.5 w-2.5 rounded-full bg-green-400" aria-hidden />
                <strong className="ml-2 min-w-0 truncate text-[12px] font-semibold text-[var(--ecode-text-secondary)]">
                  {page.route}
                </strong>
              </div>
              <div className="grid gap-4 p-5">
                <div className="flex min-w-0 items-center gap-3 rounded-lg bg-[var(--ecode-background)] p-3 font-mono text-[12px] text-[var(--ecode-text-secondary)]">
                  <Terminal className="h-4 w-4 shrink-0 text-[var(--ecode-accent)]" aria-hidden />
                  <span className="min-w-0 [overflow-wrap:anywhere]">ecode route verify {page.route}</span>
                </div>
                <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                  {page.stats.map((stat) => (
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
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--ecode-accent)]" aria-hidden />
                  <span>Imported from E-Code and rendered through E-Code public navigation.</span>
                </div>
              </div>
            </aside>
          </div>
        </section>

        <section className="container-responsive py-16 sm:py-24" aria-label={`${page.title} imported capabilities`}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {page.highlights.map((highlight) => (
              <div
                key={highlight}
                className="flex min-h-[4.75rem] items-center gap-3 rounded-lg border border-[var(--ecode-border)] bg-[var(--ecode-surface)] p-4 text-[14px] font-medium text-[var(--ecode-text)]"
              >
                <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--ecode-accent)]" aria-hidden />
                <span>{highlight}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="container-responsive grid gap-5 lg:grid-cols-2">
          {page.sections.map((section) => (
            <article
              key={section.title}
              className="rounded-lg border border-[var(--ecode-border)] bg-[var(--ecode-surface)] p-6 sm:p-7"
            >
              <h2 className="text-2xl font-bold tracking-tight text-[var(--ecode-text)]">{section.title}</h2>
              <p className="mt-4 text-[15px] leading-7 text-[var(--ecode-text-secondary)]">{section.body}</p>
              <ul className="mt-6 grid gap-3">
                {section.items.map((item) => (
                  <li key={item} className="flex items-center gap-3 text-[14px] font-medium text-[var(--ecode-text)]">
                    <ArrowRight className="h-4 w-4 shrink-0 text-[var(--ecode-accent)]" aria-hidden />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </section>

        <section className="container-responsive py-16 sm:py-24" aria-label={`${page.title} related routes`}>
          <div className="grid gap-8 rounded-lg border border-[var(--ecode-border)] bg-[var(--ecode-surface)] p-6 sm:p-8 lg:grid-cols-[0.7fr_1.3fr]">
            <div>
              <span className="inline-flex rounded-full border border-[var(--ecode-border)] bg-[var(--ecode-background)] px-4 py-2 text-[13px] font-semibold uppercase tracking-[0.24em] text-[var(--ecode-accent)]">
                Connected routes
              </span>
              <h2 className="mt-5 text-3xl font-bold tracking-tight text-[var(--ecode-text)] sm:text-5xl">
                Keep moving through real pages.
              </h2>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {page.relatedRoutes.map((route) => (
                <Link
                  key={route.to}
                  to={route.to}
                  className="group flex min-h-[9rem] flex-col rounded-lg border border-[var(--ecode-border)] bg-[var(--ecode-background)] p-5 text-[var(--ecode-text)] no-underline transition hover:-translate-y-1 hover:border-[var(--ecode-accent)]"
                >
                  <strong className="text-base font-bold">{route.label}</strong>
                  <small className="mt-2 text-[13px] leading-6 text-[var(--ecode-text-secondary)]">
                    {route.description}
                  </small>
                  <span className="mt-auto inline-flex items-center pt-5 text-[13px] font-semibold text-[var(--ecode-accent)]">
                    Open
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
      : 'inline-flex min-h-[44px] items-center justify-center rounded-md border border-[var(--ecode-border)] bg-transparent px-5 py-3 text-[13px] font-semibold text-[var(--ecode-text)] transition hover:border-[var(--ecode-accent)] hover:text-[var(--ecode-accent)]';

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
  figma: 'Figma',

  /*
   * The 'bolt' route key is an internal identifier kept for backwards
   * compatibility; its user-facing label is brand-neutral so the upstream
   * codename never surfaces in titles, descriptions or the browser tab.
   */
  bolt: 'Legacy export',
  lovable: 'Lovable',
} as const satisfies Record<string, string>;

export type ProjectImportSource = keyof typeof PROJECT_IMPORT_SOURCE_LABELS;

/** Supported `:source` values for the project import surface route. */
export const PROJECT_IMPORT_SOURCES = Object.keys(PROJECT_IMPORT_SOURCE_LABELS) as ProjectImportSource[];

export function createProjectImportSurfacePage(projectId: string, source: string): EcodeSurfacePageDefinition {
  const label = PROJECT_IMPORT_SOURCE_LABELS[source as ProjectImportSource];

  if (!label) {
    throw new Response('Unsupported E-Code import source', { status: 404 });
  }

  return makeSurfacePage({
    slug: `projects/${projectId}/import/${source}`,
    route: `/projects/${projectId}/import/${source}`,
    title: `${label} Project Import`,
    description: `Import ${label} work into project ${projectId} with asset mapping, route planning and validation checks.`,
    category: 'integration',
    icon: Upload,
    highlights: [`${label} source mapping`, 'Project context', 'Dependency planning', 'Preview validation'],
    relatedRoutes: [
      { label: 'GitHub import', to: '/import-github', description: 'Import repository-backed projects.' },
      { label: 'Project overview', to: `/projects/${projectId}`, description: 'Return to the project workspace.' },
      { label: 'Preview', to: `/projects/${projectId}/preview`, description: 'Validate the imported app visually.' },
    ],
  });
}

export function createProjectDatabaseSurfacePage(projectId: string): EcodeSurfacePageDefinition {
  return makeSurfacePage({
    slug: `projects/${projectId}/database`,
    route: `/projects/${projectId}/database`,
    title: 'Project Database',
    description: `Project ${projectId} database planning for schemas, migrations, seed data and safe runtime configuration.`,
    category: 'data',
    icon: Braces,
    highlights: ['Project schema', 'Migrations', 'Seed data', 'Runtime variables'],
    relatedRoutes: [
      { label: 'Database', to: '/database', description: 'Review platform database guidance.' },
      { label: 'Secrets', to: '/secrets', description: 'Store database credentials safely.' },
      { label: 'Project preview', to: `/projects/${projectId}/preview`, description: 'Validate database-backed UI.' },
    ],
  });
}

export function createProjectPreviewSurfacePage(projectId: string): EcodeSurfacePageDefinition {
  return makeSurfacePage({
    slug: `projects/${projectId}/preview`,
    route: `/projects/${projectId}/preview`,
    title: 'Project Preview',
    description: `Preview route for project ${projectId}, focused on visual QA, runtime readiness and shareable review.`,
    category: 'runtime',
    icon: MonitorPlay,
    highlights: ['Visual QA', 'Runtime readiness', 'Route checks', 'Shareable review'],
    relatedRoutes: [
      { label: 'Preview', to: '/preview', description: 'Review platform preview behavior.' },
      { label: 'Runtime diagnostics', to: '/runtime-diagnostics', description: 'Inspect runtime blockers.' },
      {
        label: 'Project database',
        to: `/projects/${projectId}/database`,
        description: 'Validate data-backed features.',
      },
    ],
  });
}

export function createProjectCompatSurfacePage(projectId: string): EcodeSurfacePageDefinition {
  return makeSurfacePage({
    slug: `project/${projectId}`,
    route: `/project/${projectId}`,
    title: 'Project Compatibility Overview',
    description: `Compatibility route for legacy E-Code project ${projectId}, with links into the E-Code project workspace.`,
    category: 'builder',
    icon: Boxes,
    highlights: ['Legacy route support', 'Project overview', 'Workspace links', 'Preview handoff'],
    relatedRoutes: [
      { label: 'Projects', to: '/projects', description: 'Open the E-Code project list.' },
      { label: 'Project workspace', to: `/projects/${projectId}`, description: 'Open the canonical project route.' },
      { label: 'Editor', to: `/editor/${projectId}`, description: 'Use the imported editor compatibility route.' },
    ],
  });
}

export function createEditorSurfacePage(editorId: string): EcodeSurfacePageDefinition {
  return makeSurfacePage({
    slug: `editor/${editorId}`,
    route: `/editor/${editorId}`,
    title: 'Editor Session',
    description: `Editor compatibility route for session ${editorId}, preserving the E-Code path into the E-Code IDE flow.`,
    category: 'builder',
    icon: FileCode2,
    highlights: ['File editor', 'Agent context', 'Preview panel', 'Session continuity'],
    relatedRoutes: [
      { label: 'New editor session', to: '/editor/new', description: 'Start a new editor route.' },
      { label: 'Projects', to: '/projects', description: 'Open the canonical project workspace list.' },
      { label: 'Features', to: '/features', description: 'Review the imported E-Code IDE capabilities.' },
    ],
  });
}

export function createTeamSurfacePage(teamId: string, section?: 'settings'): EcodeSurfacePageDefinition {
  return makeSurfacePage({
    slug: section ? `teams/${teamId}/${section}` : `teams/${teamId}`,
    route: section ? `/teams/${teamId}/${section}` : `/teams/${teamId}`,
    title: section === 'settings' ? 'Team Settings' : 'Team Workspace',
    description:
      section === 'settings'
        ? `Settings route for team ${teamId}, including identity, members, billing context and project access.`
        : `Team route for ${teamId}, connecting members, shared projects, roles and review workflows.`,
    category: 'team',
    icon: section === 'settings' ? Settings : Users,
    highlights:
      section === 'settings'
        ? ['Member policy', 'Billing ownership', 'Project access', 'Audit context']
        : ['Members', 'Shared projects', 'Roles', 'Review workflows'],
    relatedRoutes: [
      { label: 'All teams', to: '/teams', description: 'Return to the imported teams route.' },
      { label: 'Create team', to: '/teams/new', description: 'Start a new team workspace.' },
      { label: 'Collaboration', to: '/collaboration', description: 'Review multiplayer team behavior.' },
    ],
  });
}

export function createProfileSurfacePage(username?: string): EcodeSurfacePageDefinition {
  const name = username ?? 'builder';

  return makeSurfacePage({
    slug: username ? `profile/${username}` : 'profile',
    route: username ? `/profile/${username}` : '/profile',
    title: username ? `${name} Profile` : 'Profile',
    description: username
      ? `Public E-Code profile route for ${name}, including builder identity, shared work and community context.`
      : 'A profile route for builder identity, shared projects, community presence and account discovery.',
    category: 'team',
    icon: Users,
    highlights: ['Builder identity', 'Shared projects', 'Community presence', 'Public route support'],
  });
}

export function createUserSurfacePage(username: string): EcodeSurfacePageDefinition {
  return makeSurfacePage({
    slug: `user/${username}`,
    route: `/user/${username}`,
    title: `${username} User Profile`,
    description: `Legacy E-Code user route for ${username}, mapped into a real E-Code profile-compatible surface.`,
    category: 'team',
    icon: Users,
    highlights: ['Legacy user route', 'Profile context', 'Shared projects', 'Community identity'],
    relatedRoutes: [
      { label: 'Profile', to: `/profile/${username}`, description: 'Open the equivalent profile route.' },
      { label: 'User settings', to: '/user/settings', description: 'Manage user-level preferences.' },
      { label: 'Community', to: '/community', description: 'Browse community routes.' },
    ],
  });
}
