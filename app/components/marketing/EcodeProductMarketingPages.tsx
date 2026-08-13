import {
  Activity,
  ArrowRight,
  BarChart3,
  Bot,
  Brain,
  BriefcaseBusiness,
  Building2,
  CheckCircle2,
  Cloud,
  Code2,
  Command,
  Cpu,
  Database,
  FileCode2,
  Gauge,
  GitBranch,
  Globe2,
  GraduationCap,
  Handshake,
  Layers,
  Lock,
  MessageSquare,
  MonitorSmartphone,
  Palette,
  PlayCircle,
  Rocket,
  Search,
  Shield,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Star,
  TerminalSquare,
  Users,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { MetaFunction } from 'react-router';
import { Link } from 'react-router';
import { PublicShell } from '~/components/dashboard/SaaSLayout';
import { getReelDemoHref } from '~/components/marketing/ecode-marketing-reels';
import { Button } from '~/components/ui/Button';
import { classNames } from '~/utils/classNames';
import { socialMetaTags } from '~/utils/social-meta';

type ProductPageKey =
  | 'ai-agent'
  | 'ide'
  | 'multiplayer'
  | 'mobile-app'
  | 'teams'
  | 'deployments'
  | 'pricing'
  | 'bounties'
  | 'ai-platform';

type CampaignPageKey = 'bounties' | 'deployments' | 'teams';

type PageRouteDefinition = {
  label: string;
  route: string;
  title: string;
  description: string;
};

type PricingPlanKey = 'free' | 'core' | 'pro' | 'team' | 'enterprise';

export const ecodeProductMarketingPages = {
  'ai-agent': {
    label: 'AI Agent',
    route: '/ai-agent',
    title: 'AI Agent v2',
    description: 'Describe your idea, watch E-Code build it, and deploy instantly from the public AI Agent page.',
  },
  ide: {
    label: 'IDE',
    route: '/features',
    title: 'Browser IDE',
    description: 'The E-Code browser IDE page with editor, terminal, files, previews and project workflows.',
  },
  multiplayer: {
    label: 'Multiplayer',
    route: '/features#multiplayer',
    title: 'Multiplayer',
    description: 'Live collaboration, pair programming, shared presence and review workflows inside the IDE page.',
  },
  'mobile-app': {
    label: 'Mobile App',
    route: '/mobile',
    title: 'Mobile IDE',
    description: 'The E-Code mobile app marketing page for editor, terminal, AI, preview, collaboration and Git.',
  },
  teams: {
    label: 'Teams',
    route: '/marketing/teams',
    title: 'Teams',
    description: 'Real-time collaboration, enterprise controls and governed project access for modern teams.',
  },
  deployments: {
    label: 'Deployments',
    route: '/marketing/deployments',
    title: 'Deployments',
    description: 'Production deployments with global routing, observability, rollbacks and enterprise controls.',
  },
  pricing: {
    label: 'Pricing',
    route: '/pricing',
    title: 'Pricing',
    description: 'E-Code pricing cards, comparison table, enterprise section and FAQ.',
  },
  bounties: {
    label: 'Bounties',
    route: '/marketing/bounties',
    title: 'Bounties',
    description: 'Outcome-based developer bounties with secure review sandboxes and managed payouts.',
  },
  'ai-platform': {
    label: 'AI Platform',
    route: '/ai',
    title: 'AI Platform',
    description: 'Enterprise AI that builds applications with natural-language prompts, tools and governance.',
  },
} as const satisfies Record<ProductPageKey, PageRouteDefinition>;

export const ecodeCampaignMarketingPages = {
  bounties: ecodeProductMarketingPages.bounties,
  deployments: ecodeProductMarketingPages.deployments,
  teams: ecodeProductMarketingPages.teams,
} as const satisfies Record<CampaignPageKey, PageRouteDefinition>;

/*
 * Monthly prices must stay aligned with packages/billing/src/index.ts.
 * The marketing page intentionally keeps Pro at $29 and Team at $99 because
 * those are the backend-enforced Stripe checkout amounts.
 */
export const ecodePricingPlans = [
  {
    key: 'free',
    name: 'Starter',
    description: 'Free daily Agent credits to learn and build',
    monthlyCents: 0,
    annualMonthlyCents: 0,
    cta: 'Start for Free',
    popular: false,
    enterprise: false,
    icon: <Sparkles className="h-7 w-7" aria-hidden />,
    gradient: 'from-slate-500 to-slate-700',
    features: [
      'Free daily Agent credits',
      'Built-in database',
      'Publish 1 project',
      'Private / password deployments',
      '1 collaborator',
      '1 agent at a time',
    ],
  },
  {
    key: 'core',
    name: 'Core',
    description: '€25/mo of credits, collaborators and any-region publishing',
    monthlyCents: 2500,
    annualMonthlyCents: 2000,
    cta: 'Get Core',
    popular: true,
    enterprise: false,
    icon: <Zap className="h-7 w-7" aria-hidden />,
    gradient: 'from-[var(--ecode-accent)] to-amber-500',
    features: [
      '€25/mo of credits',
      'Up to 5 collaborators',
      'Up to 2 parallel agents',
      'Unlimited workspaces',
      'Publish to any region',
      'Remove "Made with" badge',
      'AI integrations',
    ],
  },
  {
    key: 'pro',
    name: 'Pro',
    description: 'The most powerful models, more agents, premium support',
    monthlyCents: 10000,
    annualMonthlyCents: 9500,
    cta: 'Get Pro',
    popular: false,
    enterprise: false,
    icon: <Rocket className="h-7 w-7" aria-hidden />,
    gradient: 'from-[var(--ecode-accent)] to-[#F99D25]',
    features: [
      '€100/mo of credits',
      'Up to 15 collaborators',
      'Up to 50 viewers',
      'Up to 10 parallel agents',
      'Most powerful models',
      '28-day database rollbacks',
      'Premium support',
    ],
  },
  {
    key: 'enterprise',
    name: 'Enterprise',
    description: 'For large teams, compliance needs and custom infrastructure',
    monthlyCents: 0,
    annualMonthlyCents: 0,
    cta: 'Contact Sales',
    popular: false,
    enterprise: true,
    icon: <Building2 className="h-7 w-7" aria-hidden />,
    gradient: 'from-slate-800 to-black',
    features: [
      'SAML/OIDC SSO',
      'SCIM provisioning',
      'Custom quotas',
      'Audit export',
      'IP allowlist',
      'Premium support',
      'Private deployment options',
    ],
  },
] as const satisfies readonly {
  key: PricingPlanKey;
  name: string;
  description: string;
  monthlyCents: number;
  annualMonthlyCents: number;
  cta: string;
  popular: boolean;
  enterprise: boolean;
  icon: ReactNode;
  gradient: string;
  features: readonly string[];
}[];

const heroImage = '/assets/hero-image.svg';
const agentAvatar = '/assets/ai-avatar.svg';

const aiAgentProof = ['No credit card required', '100+ languages supported', 'Deploy in one click'] as const;

const trailerSegments = [
  {
    id: 'idea',
    title: 'Idea to App in 60 Seconds',
    timestamp: '00:12',
    description: 'See how a simple prompt becomes a complete full-stack application.',
  },
  {
    id: 'apis',
    title: 'Instant API Integrations',
    timestamp: '00:38',
    description: 'Watch the agent wire authentication, data models and service endpoints.',
  },
  {
    id: 'responsive-ui',
    title: 'Responsive UI Autodesign',
    timestamp: '00:55',
    description: 'The agent turns requirements into polished layouts for every screen size.',
  },
] as const;

const quickReels = [
  { id: 'multilingual', title: 'Multilingual Demo', timestamp: '0:24', icon: Globe2 },
  { id: 'database', title: 'Database Integration', timestamp: '0:31', icon: Database },
  { id: 'security', title: 'Auth & Security', timestamp: '0:29', icon: ShieldCheck },
  { id: 'deploy', title: 'Instant Deploy', timestamp: '0:18', icon: Rocket },
] as const;

const aiAgentCapabilities = [
  {
    title: 'Natural Language Understanding',
    description: 'Describe exactly what you need in everyday language.',
    examples: [
      'Build a todo app with dark mode',
      'Create a restaurant booking system',
      'Make an analytics dashboard with charts',
    ],
  },
  {
    title: 'Complete Project Generation',
    description: 'E-Code creates files, routes, components, configuration and dependencies.',
    examples: ['Generates project structure', 'Writes typed frontend and backend code', 'Installs dependencies'],
  },
  {
    title: 'Smart Code Decisions',
    description: 'The agent chooses frameworks, data flow and layouts based on the product goal.',
    examples: ['Chooses the right components', 'Adds validation and states', 'Keeps the app responsive'],
  },
  {
    title: 'Continuous Improvement',
    description: 'Ask for changes and the agent updates the project while preserving context.',
    examples: ['Iterates from feedback', 'Fixes build errors', 'Adds features without restarting'],
  },
] as const;

const aiAgentUseCases = [
  {
    category: 'Business',
    icon: BriefcaseBusiness,
    apps: ['CRM dashboard', 'Inventory tracker', 'Customer portal'],
    timing: 'Live in under 2 minutes',
  },
  {
    category: 'Personal',
    icon: Sparkles,
    apps: ['Habit tracker', 'Recipe app', 'Portfolio site'],
    timing: 'Prototype in 60 seconds',
  },
  {
    category: 'Education',
    icon: GraduationCap,
    apps: ['Quiz generator', 'Course portal', 'Study planner'],
    timing: 'Classroom ready',
  },
  {
    category: 'Games',
    icon: PlayCircle,
    apps: ['Puzzle game', 'Scoreboard', 'Mini arcade'],
    timing: 'Playable instantly',
  },
] as const;

const aiAgentComparison = [
  {
    title: 'No setup or boilerplate',
    description: 'Skip scaffolding, config files and dependency wrangling — the agent handles it end to end.',
    examples: [
      'Zero local tooling required',
      'Project structure generated for you',
      'Dependencies installed automatically',
    ],
  },
  {
    title: 'Full-stack, not snippets',
    description: 'Other assistants suggest code fragments. E-Code ships a complete, runnable application.',
    examples: ['Frontend, backend and data layer', 'Wired-up routes and components', 'Production-ready defaults'],
  },
  {
    title: 'Iterates with context',
    description: 'Keeps the whole project in mind so follow-up changes stay consistent instead of starting over.',
    examples: ['Remembers earlier decisions', 'Fixes its own build errors', 'Adds features without regressions'],
  },
  {
    title: 'From idea to live in minutes',
    description: 'Describe the goal and get a deployable app — no copy-pasting between tools.',
    examples: ['One conversation, one workflow', 'Instant preview', 'Deploy when ready'],
  },
] as const;

type AiAgentTab = 'overview' | 'capabilities' | 'examples' | 'comparison';

/**
 * Selects which content sections the AI Agent page renders for the active tab.
 * Returns boolean flags so the tab strip is a real control rather than a no-op.
 */
export function selectAiAgentTabContent(tab: AiAgentTab): {
  showCapabilities: boolean;
  showUseCases: boolean;
  showComparison: boolean;
} {
  switch (tab) {
    case 'capabilities':
      return { showCapabilities: true, showUseCases: false, showComparison: false };
    case 'examples':
      return { showCapabilities: false, showUseCases: true, showComparison: false };
    case 'comparison':
      return { showCapabilities: false, showUseCases: false, showComparison: true };
    case 'overview':
    default:
      return { showCapabilities: true, showUseCases: true, showComparison: false };
  }
}

const aiPlatformHighlights = [
  ['Natural language', 'Describe the app in plain English'],
  ['Full-stack output', 'Frontend, backend and data layer'],
  ['100+ languages', 'TypeScript, Python, Node and more'],
  ['One-click deploy', 'Ship to the cloud from the workspace'],
] as const;

const aiPlatformFeatures = [
  {
    key: 'autonomous',
    title: 'Autonomous Building',
    description: 'Just describe what you want. The AI agent builds complete applications from scratch.',
    icon: Bot,
    details: [
      'Understands natural-language requirements',
      'Generates complete project structures',
      'Creates all files and configuration',
      'Installs dependencies and environment settings',
      'Deploys instantly when the app is ready',
    ],
  },
  {
    key: 'languages',
    title: 'Any Language Support',
    description: 'E-Code understands 100+ programming languages and frameworks.',
    icon: Code2,
    details: ['TypeScript and React', 'Node.js APIs', 'Python services', 'Database-backed applications'],
  },
  {
    key: 'generation',
    title: 'Intelligent Code Generation',
    description: 'Production-ready code with architecture, state, validation and styling handled automatically.',
    icon: Brain,
    details: ['Typed components', 'API routes', 'Data models', 'Responsive layouts', 'Error states'],
  },
  {
    key: 'assistance',
    title: 'Real-time Assistance',
    description: 'The assistant keeps helping while you inspect, run, debug and deploy.',
    icon: MessageSquare,
    details: ['Explains code', 'Fixes errors', 'Reviews performance', 'Suggests next steps'],
  },
] as const;

const aiTools = [
  { name: 'Web Search', icon: Search, description: 'Finds current documentation and examples while building.' },
  { name: 'Visual Editor', icon: Palette, description: 'Tunes layout, theme and component hierarchy.' },
  { name: 'Code Analysis', icon: FileCode2, description: 'Reads project files and identifies implementation gaps.' },
  { name: 'Performance', icon: Gauge, description: 'Surfaces slow paths, bundle weight and runtime bottlenecks.' },
  { name: 'Package Manager', icon: Layers, description: 'Adds dependencies and keeps project setup coherent.' },
  { name: 'Debug Assistant', icon: Activity, description: 'Connects errors to concrete code changes.' },
] as const;

const aiUseCases = [
  ['Complete Beginners', 'Turn an idea into an app without knowing the full stack first.'],
  ['Rapid Prototyping', 'Validate a product flow quickly with real files and a running preview.'],
  ['Learning Projects', 'Study how the generated project is structured while you modify it.'],
  ['Business Solutions', 'Create internal tools, portals and dashboards from operational requirements.'],
] as const;

const featureTabs = ['All', 'Development', 'Collaboration', 'Infrastructure', 'Security', 'Analytics'] as const;

const ecodeFeatures = [
  {
    id: 'ai-agent',
    title: 'AI Agent - Your Personal Developer',
    category: 'Development',
    icon: Bot,
    description: 'Tell E-Code what you want to build and the agent creates the project, files and flow.',
    bullets: ['Natural-language prompts', 'Project generation', 'Build correction'],
  },
  {
    id: 'ide',
    title: 'Friendly Code Editor',
    category: 'Development',
    icon: Code2,
    description: 'A browser IDE with files, editor tabs, previews, terminal and project context in one place.',
    bullets: ['File tree and editor', 'Live preview', 'Terminal output'],
  },
  {
    id: 'command-center',
    title: 'Command Center',
    category: 'Development',
    icon: Command,
    description: 'Run commands, inspect output and keep the development workflow visible.',
    bullets: ['Terminal control', 'Run scripts', 'Inspect logs'],
  },
  {
    id: 'files',
    title: 'Your Project Files',
    category: 'Development',
    icon: FileCode2,
    description: 'Understand and edit generated project files directly in the workspace.',
    bullets: ['Project tree', 'Readable files', 'Patch review'],
  },
  {
    id: 'features',
    title: 'Add Cool Features',
    category: 'Development',
    icon: Sparkles,
    description: 'Ask for changes and E-Code updates the application without losing context.',
    bullets: ['Feature prompts', 'Refinement loops', 'UI changes'],
  },
  {
    id: 'multiplayer',
    title: 'Learn Together',
    category: 'Collaboration',
    icon: Users,
    description: 'Build with teammates through shared presence, reviews and live project context.',
    bullets: ['Shared presence', 'Pair programming', 'Review loops'],
  },
  {
    id: 'save-progress',
    title: 'Save Your Progress',
    category: 'Infrastructure',
    icon: GitBranch,
    description: 'Keep work recoverable with project history, branches and deployable snapshots.',
    bullets: ['Git context', 'Snapshots', 'Recoverable edits'],
  },
  {
    id: 'always-available',
    title: 'Always Available',
    category: 'Infrastructure',
    icon: Cloud,
    description: 'Access projects and previews from the browser without local setup.',
    bullets: ['Cloud workspaces', 'Hosted previews', 'Device handoff'],
  },
  {
    id: 'database',
    title: 'Built-in Database',
    category: 'Infrastructure',
    icon: Database,
    description: 'Generate and connect data-backed applications without leaving the workspace.',
    bullets: ['Schema planning', 'Data operations', 'Database visibility'],
  },
  {
    id: 'deployment',
    title: 'One-Click Deploy',
    category: 'Infrastructure',
    icon: Rocket,
    description: 'Move from working preview to production release with a managed deployment flow.',
    bullets: ['Preview URL', 'Deploy checks', 'Rollback path'],
  },
  {
    id: 'security',
    title: 'Enterprise Security',
    category: 'Security',
    icon: Shield,
    description: 'Protect projects with secure defaults, audit context and governed access.',
    bullets: ['SSO-ready identity', 'Audit trails', 'Access controls'],
  },
  {
    id: 'secrets',
    title: 'Secret Management',
    category: 'Security',
    icon: Lock,
    description: 'Keep environment secrets separated from generated code and shared collaboration.',
    bullets: ['Scoped secrets', 'Runtime injection', 'Permission boundaries'],
  },
  {
    id: 'monitoring',
    title: 'Performance Monitoring',
    category: 'Analytics',
    icon: BarChart3,
    description: 'Inspect runtime feedback and understand how deployed apps are behaving.',
    bullets: ['Runtime metrics', 'Health signals', 'Deployment insights'],
  },
] as const;

const mobileFeatures = [
  {
    id: 'editor',
    title: 'Full-Featured Editor',
    icon: Code2,
    description: 'Edit TypeScript, routes and configuration from phone or tablet.',
  },
  {
    id: 'terminal',
    title: 'Integrated Terminal',
    icon: TerminalSquare,
    description: 'Run commands, tests and deploy scripts from mobile.',
  },
  {
    id: 'ai',
    title: 'AI Assistant',
    icon: Sparkles,
    description: 'Ask the agent to explain, optimize or implement directly from the device.',
  },
  {
    id: 'preview',
    title: 'Live Preview',
    icon: MonitorSmartphone,
    description: 'Inspect responsive previews across phones and tablets.',
  },
  {
    id: 'collab',
    title: 'Real-time Collaboration',
    icon: Users,
    description: 'Presence and reviews stay synced while your team ships.',
  },
  {
    id: 'git',
    title: 'Version Control',
    icon: GitBranch,
    description: 'Review commits, branches and sync status without switching apps.',
  },
] as const;

const mobileFeatureDetails = {
  editor: ['Syntax-highlighted code editor', 'Project file browser', 'Tablet-friendly layout', 'Touch-ready commands'],
  terminal: ['Run npm scripts', 'Inspect logs', 'Deploy from the command line', 'Reset command history'],
  ai: ['Optimize sync queues', 'Draft release notes', 'Explain hooks and state', 'Apply suggestions'],
  preview: ['iPhone 15 Pro', 'Pixel 8', 'iPad Pro 13"', 'Portrait and landscape checks'],
  collab: ['Live presence', 'Code review threads', 'Slack and Teams sync', 'Approvals from mobile'],
  git: ['Commit history', 'Branch context', 'Workspace sync', 'Review before deploy'],
} as const satisfies Record<(typeof mobileFeatures)[number]['id'], readonly string[]>;

const deploymentModes = [
  {
    title: 'Autoscale Apps',
    icon: Rocket,
    description: 'Deploy services that scale with traffic and stay observable from the workspace.',
    bullets: ['Zero-downtime releases', 'Health checks', 'Traffic-aware scaling'],
  },
  {
    title: 'Reserved VMs',
    icon: Cpu,
    description: 'Run predictable workloads with dedicated capacity and strong operational controls.',
    bullets: ['Reserved capacity', 'Stable networking', 'Controlled rollouts'],
  },
  {
    title: 'Static Sites',
    icon: Globe2,
    description: 'Publish frontends, docs and marketing sites with TLS and global routing.',
    bullets: ['Edge cache', 'Custom domains', 'Instant rollbacks'],
  },
] as const;

const deploymentWorkflow = [
  ['Connect repo or start in E-Code', 'Use generated apps, imported repositories or in-browser workspaces.'],
  ['Configure once', 'Set domains, environment variables, branch rules and deployment policy.'],
  ['Deploy with confidence', 'Ship with logs, preview checks, TLS and rollback controls.'],
  ['Monitor and iterate', 'Observe requests, latency, usage and release health after every push.'],
] as const;

const bountyHighlights = [
  ['Outcome-based', 'Pay on accepted, validated delivery'],
  ['Secure sandboxes', 'Isolated review workspaces per bounty'],
  ['Managed payouts', 'Global payments handled for you'],
  ['Governed access', 'SOC 2 aligned review processes'],
] as const;

const bountyCategories = [
  'AI & Agentic apps',
  'Full-stack products',
  'Dev tool integrations',
  'Platform migrations',
  'Education content',
  'Design systems',
] as const;

const teamFeatures = [
  {
    title: 'Real-time Multiplayer',
    icon: Users,
    description: "See teammates' cursors, selections and edits in real time.",
  },
  {
    title: 'Advanced Version Control',
    icon: GitBranch,
    description: 'Built-in Git workflows with branching, review and merge context.',
  },
  {
    title: 'Integrated Communication',
    icon: MessageSquare,
    description: 'Threaded discussions and workspace context live beside the code.',
  },
  {
    title: 'Enterprise Security',
    icon: Shield,
    description: 'SSO, 2FA, audit logs and granular permissions protect team work.',
  },
  {
    title: 'Instant Environments',
    icon: Zap,
    description: 'Spin up consistent development environments for every teammate.',
  },
  {
    title: 'Global Performance',
    icon: Globe2,
    description: 'Low-latency collaboration from anywhere with global routing.',
  },
] as const;

export function makeEcodeProductMeta(key: ProductPageKey): MetaFunction {
  const page = ecodeProductMarketingPages[key];

  return () => [
    { title: `${page.title} - E-Code` },
    { name: 'description', content: page.description },
    ...socialMetaTags({ title: `${page.title} - E-Code`, description: page.description }),
  ];
}

export function makeEcodeCampaignMeta(key: CampaignPageKey): MetaFunction {
  const page = ecodeCampaignMarketingPages[key];

  return () => [
    { title: `${page.title} - E-Code` },
    { name: 'description', content: page.description },
    ...socialMetaTags({ title: `${page.title} - E-Code`, description: page.description }),
  ];
}

export function EcodeAiAgentPage() {
  const [selectedSegment, setSelectedSegment] = useState<(typeof trailerSegments)[number]>(trailerSegments[0]);
  const [activeTab, setActiveTab] = useState<AiAgentTab>('overview');
  const { showCapabilities, showUseCases, showComparison } = selectAiAgentTabContent(activeTab);

  return (
    <PublicShell>
      <MarketingMain>
        <section className="relative overflow-hidden bg-gradient-to-b from-bolt-elements-background-depth-1 to-bolt-elements-background-depth-2 py-16 sm:py-20">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(242,98,7,0.16),transparent_34%),radial-gradient(circle_at_80%_15%,rgba(249,157,37,0.14),transparent_28%)]" />
          <Container className="relative grid gap-12 lg:grid-cols-[0.92fr_1.08fr] lg:items-center">
            <div>
              <Badge icon={Sparkles}>E-CODE AGENT 2.0 POWERED</Badge>
              <h1 className="mt-6 max-w-3xl mkt-h1 text-bolt-elements-textPrimary">
                AI Agent v2{' '}
                <span className="block bg-gradient-to-r from-[var(--ecode-accent)] via-amber-400 to-[#F99D25] bg-clip-text text-transparent">
                  Build Apps with Natural Language
                </span>
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-bolt-elements-textSecondary">
                Describe your idea. Watch it build. Deploy instantly. No coding required - our AI handles everything.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <ActionLink to="/ai-agent/studio">
                  Launch Agent Studio
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </ActionLink>
                <ActionLink to="#agent-demo" variant="outline">
                  <PlayCircle className="h-4 w-4" aria-hidden />
                  Watch Live Demo
                </ActionLink>
              </div>
              <div className="mt-7 flex flex-wrap gap-4 text-sm text-bolt-elements-textSecondary">
                {aiAgentProof.map((proof) => (
                  <span key={proof} className="inline-flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-[var(--ecode-accent)]" aria-hidden />
                    {proof}
                  </span>
                ))}
              </div>
            </div>
            <DemoFrame
              eyebrow="Trailer"
              title="E-Code Agent 2.0 builds a marketplace in minutes"
              description="Witness idea-to-deployment in a single take, captured directly from the live platform."
              metrics={[
                ['1:12', 'total runtime'],
                ['Full stack', 'UI + API'],
              ]}
            />
          </Container>
        </section>

        <Section tone="muted">
          <SectionIntro
            title="Building apps is now as easy as having a conversation"
            description="Just describe what you want. Watch it come to life."
          />
          <div className="grid gap-6 md:grid-cols-3">
            {[
              {
                title: '1. Describe Your Idea',
                description: 'Describe what you want in any language.',
                icon: MessageSquare,
              },
              {
                title: '2. AI Builds Everything',
                description: 'Watch as the AI creates files, writes code and sets up your project.',
                icon: Sparkles,
              },
              {
                title: '3. Your App is Ready',
                description: 'In under a minute, your app is running and ready to share.',
                icon: Rocket,
              },
            ].map((step) => (
              <IconCard key={step.title} icon={step.icon} title={step.title}>
                {step.description}
              </IconCard>
            ))}
          </div>
        </Section>

        <Section id="agent-demo">
          <SectionIntro
            title="Watch AI Agent v2 in Action"
            description="Real-time demonstrations of AI building production-ready applications from natural language."
          />
          <div className="grid gap-8 lg:grid-cols-[1.5fr_0.85fr]">
            <DemoFrame
              compact
              eyebrow={`Segment ${selectedSegment.timestamp}`}
              title={selectedSegment.title}
              description={selectedSegment.description}
              metrics={[
                ['Full project', 'files and routes'],
                ['Typed code', 'frontend and backend'],
                ['Live preview', 'as it builds'],
              ]}
            />
            <div className="space-y-4">
              <Panel>
                <h3 className="text-base font-semibold text-bolt-elements-textPrimary">Featured Demos</h3>
                <div className="mt-4 space-y-3">
                  {trailerSegments.map((segment) => (
                    <button
                      key={segment.id}
                      type="button"
                      onClick={() => setSelectedSegment(segment)}
                      className={classNames(
                        'w-full rounded-lg border p-3 text-left transition-colors',
                        selectedSegment.id === segment.id
                          ? 'border-[var(--ecode-accent)] bg-[var(--ecode-accent)]/10'
                          : 'border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 hover:bg-bolt-elements-background-depth-3',
                      )}
                    >
                      <div className="flex gap-3">
                        <img
                          src={agentAvatar}
                          alt=""
                          className="h-10 w-10 rounded-lg border border-bolt-elements-borderColor"
                        />
                        <div>
                          <div className="text-xs text-bolt-elements-textTertiary">{segment.timestamp}</div>
                          <div className="font-medium text-bolt-elements-textPrimary">{segment.title}</div>
                          <p className="text-sm text-bolt-elements-textSecondary">{segment.description}</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </Panel>
              <Panel>
                <h3 className="flex items-center gap-2 text-base font-semibold text-bolt-elements-textPrimary">
                  <Sparkles className="h-5 w-5 text-[var(--ecode-accent)]" aria-hidden />
                  What the agent does
                </h3>
                <dl className="mt-4 space-y-3 text-sm">
                  {[
                    ['Plans the project', 'Files, routes and structure'],
                    ['Writes the code', 'Typed frontend and backend'],
                    ['Installs dependencies', 'Sets up the environment'],
                    ['Runs a live preview', 'Inspect before you deploy'],
                  ].map(([label, value]) => (
                    <div key={label} className="flex justify-between gap-4">
                      <dt className="text-bolt-elements-textSecondary">{label}</dt>
                      <dd className="font-semibold text-bolt-elements-textPrimary">{value}</dd>
                    </div>
                  ))}
                </dl>
              </Panel>
            </div>
          </div>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {quickReels.map((reel) => {
              const Icon = reel.icon;
              return (
                <Link
                  key={reel.id}
                  to={getReelDemoHref()}
                  aria-label={`Watch the ${reel.title} demo`}
                  className="group rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ecode-accent)]"
                >
                  <Panel className="h-full transition-colors group-hover:border-[var(--ecode-accent)]">
                    <Icon className="h-7 w-7 text-[var(--ecode-accent)]" aria-hidden />
                    <h3 className="mt-3 font-semibold text-bolt-elements-textPrimary">{reel.title}</h3>
                    <p className="mt-2 text-sm text-bolt-elements-textSecondary">Timestamp {reel.timestamp}</p>
                    <span className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[var(--ecode-accent)]">
                      Watch Now
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
                    </span>
                  </Panel>
                </Link>
              );
            })}
          </div>
        </Section>

        <Section tone="muted">
          <SectionIntro
            title="More than just code generation"
            description="A complete development partner that thinks, designs and builds."
          />
          <div className="grid gap-2 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-2 sm:grid-cols-4">
            {(['overview', 'capabilities', 'examples', 'comparison'] as const).map((tab) => (
              <Button
                key={tab}
                type="button"
                variant={activeTab === tab ? 'default' : 'ghost'}
                onClick={() => setActiveTab(tab)}
                className="capitalize"
              >
                {tab === 'comparison' ? 'Why E-Code?' : tab}
              </Button>
            ))}
          </div>
          {showCapabilities ? (
            <div className="mt-6 grid gap-6 md:grid-cols-2">
              {aiAgentCapabilities.map((capability) => (
                <Panel key={capability.title}>
                  <h3 className="flex items-center gap-2 text-lg font-semibold text-bolt-elements-textPrimary">
                    <Sparkles className="h-5 w-5 text-[var(--ecode-accent)]" aria-hidden />
                    {capability.title}
                  </h3>
                  <p className="mt-2 text-sm text-bolt-elements-textSecondary">{capability.description}</p>
                  <CheckList className="mt-4" items={capability.examples} />
                </Panel>
              ))}
            </div>
          ) : null}
          {showUseCases ? (
            <div className="mt-8 grid gap-4 md:grid-cols-4">
              {aiAgentUseCases.map((useCase) => {
                const Icon = useCase.icon;
                return (
                  <Panel key={useCase.category}>
                    <Icon className="h-8 w-8 text-[var(--ecode-accent)]" aria-hidden />
                    <h3 className="mt-3 text-lg font-semibold text-bolt-elements-textPrimary">{useCase.category}</h3>
                    <p className="mt-1 text-sm text-bolt-elements-textTertiary">{useCase.timing}</p>
                    <CheckList className="mt-4" items={useCase.apps} />
                  </Panel>
                );
              })}
            </div>
          ) : null}
          {showComparison ? (
            <div className="mt-6 grid gap-6 md:grid-cols-2">
              {aiAgentComparison.map((item) => (
                <Panel key={item.title}>
                  <h3 className="flex items-center gap-2 text-lg font-semibold text-bolt-elements-textPrimary">
                    <Sparkles className="h-5 w-5 text-[var(--ecode-accent)]" aria-hidden />
                    {item.title}
                  </h3>
                  <p className="mt-2 text-sm text-bolt-elements-textSecondary">{item.description}</p>
                  <CheckList className="mt-4" items={item.examples} />
                </Panel>
              ))}
            </div>
          ) : null}
        </Section>
      </MarketingMain>
    </PublicShell>
  );
}

export function EcodeAiPlatformPage() {
  const [selectedFeature, setSelectedFeature] = useState<(typeof aiPlatformFeatures)[number]>(aiPlatformFeatures[0]);

  return (
    <PublicShell>
      <MarketingMain>
        <section className="relative overflow-hidden py-16 sm:py-24">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(242,98,7,0.12),transparent_35%)]" />
          <Container className="relative grid gap-12 lg:grid-cols-2 lg:items-center">
            <div>
              <Badge icon={Sparkles}>POWERED BY E-CODE.AI</Badge>
              <h1 className="mt-6 mkt-h1 text-bolt-elements-textPrimary">
                Enterprise AI That{' '}
                <span className="block bg-gradient-to-r from-[var(--ecode-accent)] via-amber-400 to-[#F99D25] bg-clip-text text-transparent">
                  Builds Applications
                </span>
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-bolt-elements-textSecondary">
                Transform ideas into production-ready applications in minutes. Our AI understands 100+ languages and
                writes professional code automatically.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <ActionLink to="/ai-agent">
                  Start Building Now
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </ActionLink>
                <ActionLink to="#demo-video" variant="outline">
                  Watch Demo
                </ActionLink>
              </div>
              <div className="mt-10 grid grid-cols-2 gap-5 sm:grid-cols-4">
                {aiPlatformHighlights.map(([value, label]) => (
                  <div key={value}>
                    <div className="text-lg font-bold text-[var(--ecode-accent)]">{value}</div>
                    <div className="mt-1 text-xs font-medium text-bolt-elements-textSecondary">{label}</div>
                  </div>
                ))}
              </div>
            </div>
            <DemoFrame
              eyebrow="Live preview"
              title="AI agent assembling a production-ready dashboard"
              description="Prompt, architecture, code, checks and deployment stay visible in one workflow."
              metrics={[
                ['Multi-step', 'planning'],
                ['Automated', 'code reviews'],
                ['1-click', 'deployment'],
              ]}
            />
          </Container>
        </section>

        <Section id="demo-video" tone="muted">
          <SectionIntro
            title="See AI in Action"
            description="Watch how teams build applications faster with E-Code AI technology."
          />
          <DemoFrame
            compact
            eyebrow="Live Platform Demo"
            title="From prompt to production in under two minutes"
            description="The AI agent scaffolds a SaaS dashboard, configures infrastructure and ships to the cloud."
            metrics={[
              ['E-commerce', 'in 5 minutes'],
              ['SaaS', 'dashboard demo'],
              ['Multilingual', 'app creation'],
            ]}
          />
        </Section>

        <Section>
          <SectionIntro title="AI Agent Capabilities" description="Powerful features that make building effortless." />
          <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="space-y-4">
              {aiPlatformFeatures.map((feature) => {
                const Icon = feature.icon;
                return (
                  <button
                    key={feature.key}
                    type="button"
                    onClick={() => setSelectedFeature(feature)}
                    className={classNames(
                      'w-full rounded-lg border p-4 text-left transition-colors',
                      selectedFeature.key === feature.key
                        ? 'border-[var(--ecode-accent)] bg-[var(--ecode-accent)]/10'
                        : 'border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 hover:bg-bolt-elements-background-depth-2',
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <span className="rounded-lg bg-[var(--ecode-accent)]/10 p-2 text-[var(--ecode-accent)]">
                        <Icon className="h-5 w-5" aria-hidden />
                      </span>
                      <span>
                        <strong className="block text-bolt-elements-textPrimary">{feature.title}</strong>
                        <span className="mt-1 block text-sm text-bolt-elements-textSecondary">
                          {feature.description}
                        </span>
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
            <Panel className="lg:sticky lg:top-20">
              <h3 className="text-2xl font-semibold text-bolt-elements-textPrimary">{selectedFeature.title}</h3>
              <CheckList className="mt-5" items={selectedFeature.details} />
            </Panel>
          </div>
        </Section>

        <Section tone="muted">
          <SectionIntro
            title="AI-Powered Tools"
            description="Advanced capabilities that help AI build better applications."
          />
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {aiTools.map((tool) => (
              <IconCard key={tool.name} icon={tool.icon} title={tool.name}>
                {tool.description}
              </IconCard>
            ))}
          </div>
        </Section>

        <Section>
          <SectionIntro
            title="Who Uses Our AI Agent?"
            description="From complete beginners to experienced developers."
          />
          <div className="grid gap-5 md:grid-cols-2">
            {aiUseCases.map(([title, description]) => (
              <Panel key={title}>
                <h3 className="text-xl font-semibold text-bolt-elements-textPrimary">{title}</h3>
                <p className="mt-3 text-bolt-elements-textSecondary">{description}</p>
              </Panel>
            ))}
          </div>
        </Section>
      </MarketingMain>
    </PublicShell>
  );
}

export function EcodeFeaturesPage() {
  const [activeTab, setActiveTab] = useState<(typeof featureTabs)[number]>('All');

  const visibleFeatures = useMemo(
    () => ecodeFeatures.filter((feature) => activeTab === 'All' || feature.category === activeTab),
    [activeTab],
  );

  useEffect(() => {
    const scrollToHash = () => {
      const id = window.location.hash.slice(1);

      if (!id) {
        return;
      }

      window.requestAnimationFrame(() => {
        document.getElementById(id)?.scrollIntoView({ block: 'start' });
      });
    };

    scrollToHash();
    window.addEventListener('hashchange', scrollToHash);

    return () => window.removeEventListener('hashchange', scrollToHash);
  }, []);

  return (
    <PublicShell>
      <MarketingMain>
        <section className="py-16 sm:py-24">
          <Container className="grid gap-12 lg:grid-cols-[0.92fr_1.08fr] lg:items-center">
            <div>
              <Badge icon={Layers}>Everything you need in one place</Badge>
              <h1 className="mt-6 mkt-h1 text-bolt-elements-textPrimary">Features that empower developers</h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-bolt-elements-textSecondary">
                From writing your first line of code to deploying at scale, E-Code provides all the tools you need in a
                single platform.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <ActionLink to="/signup">
                  Start building
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </ActionLink>
                <ActionLink to="/docs" variant="outline">
                  View documentation
                </ActionLink>
              </div>
            </div>
            <WorkspaceMockup />
          </Container>
        </section>

        <Section tone="muted">
          <div className="flex flex-wrap gap-2">
            {featureTabs.map((tab) => (
              <Button
                key={tab}
                type="button"
                variant={activeTab === tab ? 'default' : 'outline'}
                onClick={() => setActiveTab(tab)}
              >
                {tab}
              </Button>
            ))}
          </div>
          <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {visibleFeatures.map((feature) => (
              <FeatureTile key={feature.id} feature={feature} />
            ))}
          </div>
        </Section>

        <Section id="ide">
          <SectionIntro
            title="Browser IDE"
            description="Panels, terminal, Git, preview, problems and settings built for repeated engineering work."
          />
          <div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-start">
            <WorkspaceMockup large />
            <div className="grid gap-4">
              {[
                ['File tree and editor', 'Edit generated code directly with project context visible.'],
                ['Terminal and preview', 'Run commands and inspect the app without leaving the browser.'],
                ['Agent patch review', 'Review what the AI changed before committing work.'],
                ['Deployment path', 'Move from preview to production with release controls.'],
              ].map(([title, description]) => (
                <Panel key={title}>
                  <h3 className="text-lg font-semibold text-bolt-elements-textPrimary">{title}</h3>
                  <p className="mt-2 text-sm text-bolt-elements-textSecondary">{description}</p>
                </Panel>
              ))}
            </div>
          </div>
        </Section>

        <Section id="multiplayer" tone="dark">
          <SectionIntro
            title="Multiplayer collaboration"
            description="Live collaboration, pair programming and shared presence for teams building together."
            invert
          />
          <div className="grid gap-6 md:grid-cols-3">
            {[
              ['Live presence', 'See teammates, cursors, focus areas and active reviews.'],
              ['Shared project context', 'Files, terminal output, preview state and agent plans stay visible.'],
              ['Review loops', 'Discuss generated changes and deployment readiness in one workflow.'],
            ].map(([title, description]) => (
              <Panel key={title} dark>
                <h3 className="text-xl font-semibold text-white">{title}</h3>
                <p className="mt-3 text-sm text-white/70">{description}</p>
              </Panel>
            ))}
          </div>
        </Section>
      </MarketingMain>
    </PublicShell>
  );
}

export function EcodeMobilePage() {
  const [activeFeature, setActiveFeature] = useState<(typeof mobileFeatures)[number]>(mobileFeatures[0]);

  return (
    <PublicShell>
      <MarketingMain>
        <section className="relative overflow-hidden py-16 sm:py-24">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_75%_20%,rgba(249,157,37,0.16),transparent_32%)]" />
          <Container className="relative grid gap-12 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
            <div>
              <Badge icon={Smartphone}>Build from anywhere</Badge>
              <h1 className="mt-6 mkt-h1 text-bolt-elements-textPrimary">The full E-Code workspace, now mobile</h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-bolt-elements-textSecondary">
                Edit code, run terminals, collaborate, review Git history and deploy production apps from phone or
                tablet.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <ActionLink to="/signup">
                  Start mobile workspace
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </ActionLink>
                <ActionLink to="/mobile-apps" variant="outline">
                  Explore mobile apps
                </ActionLink>
              </div>
            </div>
            <PhoneDemo activeFeature={activeFeature} />
          </Container>
        </section>

        <Section tone="muted">
          <SectionIntro
            title="Mobile tools for real production work"
            description="Feature-complete controls for editor, terminal, AI, preview, collaboration and Git."
          />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {mobileFeatures.map((feature) => {
              const Icon = feature.icon;
              return (
                <button
                  key={feature.id}
                  type="button"
                  onClick={() => setActiveFeature(feature)}
                  className={classNames(
                    'rounded-lg border p-5 text-left transition-colors',
                    activeFeature.id === feature.id
                      ? 'border-[var(--ecode-accent)] bg-[var(--ecode-accent)]/10'
                      : 'border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 hover:bg-bolt-elements-background-depth-2',
                  )}
                >
                  <Icon className="h-8 w-8 text-[var(--ecode-accent)]" aria-hidden />
                  <h3 className="mt-4 text-lg font-semibold text-bolt-elements-textPrimary">{feature.title}</h3>
                  <p className="mt-2 text-sm text-bolt-elements-textSecondary">{feature.description}</p>
                </button>
              );
            })}
          </div>
        </Section>

        <Section>
          <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
            <Panel>
              <h2 className="text-3xl font-bold text-bolt-elements-textPrimary">{activeFeature.title}</h2>
              <p className="mt-3 text-bolt-elements-textSecondary">{activeFeature.description}</p>
              <CheckList className="mt-5" items={mobileFeatureDetails[activeFeature.id]} />
            </Panel>
            <MobileFeatureDemo featureId={activeFeature.id} />
          </div>
        </Section>
      </MarketingMain>
    </PublicShell>
  );
}

export function EcodePricingPage() {
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>('monthly');

  return (
    <PublicShell>
      <MarketingMain>
        <section className="py-16 sm:py-24">
          <Container className="text-center">
            <Badge icon={Star}>Save up to 20% with annual billing</Badge>
            <h1 className="mx-auto mt-6 max-w-4xl mkt-h1 text-bolt-elements-textPrimary">
              Pricing that scales{' '}
              <span className="block bg-gradient-to-r from-[var(--ecode-accent)] to-amber-400 bg-clip-text text-transparent">
                with your growth
              </span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-bolt-elements-textSecondary">
              Start free and upgrade as you grow. No hidden fees, no surprises. Enterprise-grade features at
              startup-friendly prices.
            </p>
            <div className="mx-auto mt-8 inline-flex rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-1">
              {(['monthly', 'yearly'] as const).map((period) => (
                <button
                  key={period}
                  type="button"
                  onClick={() => setBillingPeriod(period)}
                  className={classNames(
                    'rounded-md px-4 py-2 text-sm font-medium capitalize transition-colors',
                    billingPeriod === period
                      ? 'bg-[var(--ecode-accent)] text-white'
                      : 'text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary',
                  )}
                >
                  {period === 'yearly' ? 'Yearly - Save 20%' : 'Monthly'}
                </button>
              ))}
            </div>
          </Container>
        </section>

        <Section className="pt-0">
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {ecodePricingPlans.map((plan) => (
              <Panel
                key={plan.key}
                className={classNames(
                  'relative overflow-visible',
                  plan.popular && 'border-[var(--ecode-accent)] shadow-[0_20px_60px_rgba(242,98,7,0.22)]',
                )}
              >
                {plan.popular ? (
                  <span className="absolute -top-4 left-1/2 inline-flex -translate-x-1/2 items-center gap-1 rounded-full bg-[var(--ecode-accent)] px-4 py-1 text-xs font-semibold text-white">
                    <Star className="h-3 w-3 fill-current" aria-hidden />
                    RECOMMENDED
                  </span>
                ) : null}
                <div className={classNames('inline-flex rounded-xl bg-gradient-to-br p-3 text-white', plan.gradient)}>
                  {plan.icon}
                </div>
                <h2 className="mt-5 text-2xl font-bold text-bolt-elements-textPrimary">{plan.name}</h2>
                <p className="mt-2 min-h-12 text-sm text-bolt-elements-textSecondary">{plan.description}</p>
                <div className="mt-6">
                  {plan.enterprise ? (
                    <>
                      <div className="text-4xl font-bold text-bolt-elements-textPrimary">Custom</div>
                      <p className="mt-1 text-sm text-bolt-elements-textTertiary">Contact for pricing</p>
                    </>
                  ) : (
                    <>
                      <div className="flex items-baseline gap-1">
                        <span className="text-4xl font-bold text-bolt-elements-textPrimary">
                          {formatMonthlyPrice(
                            billingPeriod === 'monthly' ? plan.monthlyCents : plan.annualMonthlyCents,
                          )}
                        </span>
                        <span className="text-bolt-elements-textSecondary">/month</span>
                      </div>
                      {billingPeriod === 'yearly' && plan.monthlyCents > 0 ? (
                        <p className="mt-1 text-sm font-medium text-[var(--ecode-accent)]">
                          billed annually (€{(plan.annualMonthlyCents * 12) / 100}/yr)
                        </p>
                      ) : null}
                    </>
                  )}
                </div>
                <div className="mt-6">
                  <ActionLink
                    to={plan.enterprise ? '/contact-sales' : '/register'}
                    fullWidth
                    variant={plan.popular ? 'default' : 'outline'}
                  >
                    {plan.cta}
                    <ArrowRight className="h-4 w-4" aria-hidden />
                  </ActionLink>
                </div>
                <CheckList className="mt-6 border-t border-bolt-elements-borderColor pt-5" items={plan.features} />
              </Panel>
            ))}
          </div>
        </Section>

        <Section id="section-comparison" tone="muted">
          <SectionIntro title="Compare plans in detail" description="Every feature, every detail, side by side." />
          <div className="overflow-x-auto rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-2">
                <tr>
                  <th className="p-5 text-left font-semibold text-bolt-elements-textPrimary">Features</th>
                  <th className="p-5 text-center font-semibold text-bolt-elements-textPrimary">Starter</th>
                  <th className="p-5 text-center font-semibold text-[var(--ecode-accent)]">Core</th>
                  <th className="p-5 text-center font-semibold text-bolt-elements-textPrimary">Pro</th>
                  <th className="p-5 text-center font-semibold text-bolt-elements-textPrimary">Enterprise</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['Monthly price', 'Free', '€25', '€100', 'Custom'],
                  ['Monthly credits', 'Daily', '€25', '€100', 'Custom'],
                  ['Collaborators', '1', '5', '15', 'Custom'],
                  ['Viewers', '-', '-', '50', 'Custom'],
                  ['Parallel agents', '1', '2', '10', 'Custom'],
                  ['Publish regions', '1 region', 'Any', 'Any', 'Selectable'],
                  ['Remove badge', '-', 'Yes', 'Yes', 'Yes'],
                  ['DB rollbacks', '-', '-', '28 days', 'Custom'],
                  ['Most powerful models', '-', '-', 'Yes', 'Yes'],
                  ['SSO / SAML', '-', '-', '-', 'SAML/OIDC + SCIM'],
                ].map((row) => (
                  <tr key={row[0]} className="border-b border-bolt-elements-borderColor last:border-b-0">
                    {row.map((cell, index) => (
                      <td
                        key={`${row[0]}-col${index}`}
                        className={classNames(
                          'p-5',
                          index === 0
                            ? 'font-medium text-bolt-elements-textPrimary'
                            : 'text-center text-bolt-elements-textSecondary',
                        )}
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* D14 — pricing mini-FAQ (accordion under the comparison table). */}
          <div className="mx-auto mt-8 flex max-w-3xl flex-col gap-3" data-testid="pricing-faq">
            {[
              {
                q: 'How do credits work?',
                a: 'Your plan includes monthly credits that reset at the start of each billing cycle. Credits are spent on Agent effort, publishing, network transfer and database storage. Once you exceed them you continue on pay-as-you-go, billed monthly or as soon as your accrued usage passes your included credits — whichever comes first. You can also buy credit packs, and set a usage limit or a service-shutdown limit to cap spend. On the free plan you get a daily Agent-credit allowance that recharges each day, and any apps you have published stay online.',
              },
              {
                q: 'What happens when I upgrade or downgrade?',
                a: 'Plan changes are prorated. When you upgrade you are charged only for the remaining days of the current period; when you downgrade the unused balance is credited toward your next invoice, so you never pay twice for the same time.',
              },
              {
                q: 'Can I cancel anytime?',
                a: 'Yes. You can cancel anytime from Billing. Your paid plan stays active until the end of the period you have already paid for, then your account returns to the free plan. Your projects and code are kept — cancelling never deletes your work.',
              },
              {
                q: 'Do you offer annual billing?',
                a: 'Yes, and it saves you about 20%. Core is €20/mo billed annually (versus €25 month-to-month) and Pro is €95/mo billed annually (versus €100 month-to-month). You are billed once for the year.',
              },
              {
                q: 'Do prices include VAT, and can I get an invoice?',
                a: 'Prices are shown excluding VAT; any applicable VAT is calculated and added at checkout based on your billing country. Every payment generates a downloadable invoice from your Billing page. Enterprise plans are billed by invoice, managed through Stripe.',
              },
            ].map((item) => (
              <details
                key={item.q}
                className="group rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-5 py-4"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium text-bolt-elements-textPrimary">
                  {item.q}
                  <span className="text-bolt-elements-textSecondary transition-transform duration-200 group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="mt-3 text-sm leading-6 text-bolt-elements-textSecondary">{item.a}</p>
              </details>
            ))}
          </div>
        </Section>

        <Section tone="dark">
          <div className="grid gap-8 lg:grid-cols-2 lg:items-center">
            <div>
              <Badge icon={Building2}>Enterprise Solutions</Badge>
              <h2 className="mt-5 text-4xl font-bold text-white">Built for the world's most demanding teams</h2>
              <p className="mt-4 text-lg leading-8 text-white/75">
                Get dedicated infrastructure, advanced security and custom SLAs. Enterprise scales with organizations of
                any size.
              </p>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {['SOC 2 aligned controls', 'SAML/OIDC SSO', '99.99% uptime planning', 'Premium support'].map(
                  (item) => (
                    <span key={item} className="flex items-center gap-2 text-white/85">
                      <CheckCircle2 className="h-5 w-5 text-[var(--ecode-accent)]" aria-hidden />
                      {item}
                    </span>
                  ),
                )}
              </div>
            </div>
            <Panel dark>
              <h3 className="text-xl font-semibold text-white">Enterprise includes:</h3>
              <CheckList
                className="mt-5"
                invert
                items={[
                  'Custom infrastructure sizing',
                  'Dedicated account manager',
                  'Professional services and training',
                  'Custom integrations',
                  'Advanced audit logging',
                  'Private deployment options',
                ]}
              />
            </Panel>
          </div>
        </Section>

        <Section>
          <SectionIntro title="Frequently asked questions" description="Got questions? We have answers." />
          <div className="grid gap-5 md:grid-cols-2">
            {[
              ['Can I switch plans anytime?', 'Yes. You can upgrade or downgrade as your team and quotas change.'],
              [
                'What payment methods do you accept?',
                'Stripe checkout supports standard card payments. Enterprise can use invoices.',
              ],
              [
                'Is there a free trial for paid plans?',
                'You can start with the Free plan and upgrade when private projects, agents or deploys are needed.',
              ],
              [
                'How does the AI Agent work?',
                'The agent understands natural-language descriptions and builds complete, production-ready applications.',
              ],
            ].map(([question, answer]) => (
              <Panel key={question}>
                <h3 className="text-lg font-semibold text-bolt-elements-textPrimary">{question}</h3>
                <p className="mt-2 text-sm leading-6 text-bolt-elements-textSecondary">{answer}</p>
              </Panel>
            ))}
          </div>
        </Section>

        <Section tone="dark">
          <div className="mx-auto max-w-3xl text-center">
            <Badge icon={Rocket}>Start building today</Badge>
            <h2 className="mt-5 text-4xl font-bold text-white">Start free, upgrade when you need more</h2>
            <p className="mx-auto mt-4 max-w-2xl text-lg leading-8 text-white/75">
              Build with free daily Agent credits, then move to Core or Pro for more collaborators, parallel agents and
              any-region publishing. No credit card required to begin.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <ActionLink to="/register">
                Start for Free
                <ArrowRight className="h-4 w-4" aria-hidden />
              </ActionLink>
              <ActionLink to="/contact-sales" variant="outlineDark">
                Contact Sales
              </ActionLink>
            </div>
          </div>
        </Section>
      </MarketingMain>
    </PublicShell>
  );
}

export function EcodeDeploymentsPage() {
  return (
    <PublicShell>
      <MarketingMain>
        <section className="relative overflow-hidden py-16 sm:py-24">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_78%_20%,rgba(242,98,7,0.14),transparent_32%)]" />
          <Container className="relative grid gap-12 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
            <div>
              <Badge icon={Rocket}>Deploy from idea to internet in one click</Badge>
              <h1 className="mt-6 mkt-h1 text-bolt-elements-textPrimary">
                Launch production-grade apps straight from your workspace
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-bolt-elements-textSecondary">
                E-Code Deployments pairs the simplicity of an in-browser IDE with the rigor of a global cloud platform.
                Ship instantly, observe everything and meet enterprise requirements without bolting together tools.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <ActionLink to="/contact-sales">Talk to an expert</ActionLink>
                <ActionLink to="/docs" variant="outline">
                  Explore deployment docs
                </ActionLink>
              </div>
            </div>
            <DeploymentStatusCard />
          </Container>
        </section>

        <Section tone="muted">
          <SectionIntro
            title="Choose the right deployment mode"
            description="Everything inside the deployment tab, elevated for production teams."
          />
          <div className="grid gap-5 md:grid-cols-3">
            {deploymentModes.map((mode) => (
              <IconCard key={mode.title} icon={mode.icon} title={mode.title}>
                {mode.description}
                <CheckList className="mt-4" items={mode.bullets} />
              </IconCard>
            ))}
          </div>
        </Section>

        <Section>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {[
              [Globe2, 'Global routing', 'Edge cache and custom domains with TLS'],
              [Activity, 'Live observability', 'Requests, latency and errors after release'],
              [Shield, 'Secure by default', 'Secrets, identity and deployment policy'],
              [GitBranch, 'Instant rollbacks', 'Revert to a healthy release in one click'],
            ].map(([icon, title, description]) => (
              <IconCard key={title as string} icon={icon as LucideIcon} title={title as string}>
                {description as string}
              </IconCard>
            ))}
          </div>
        </Section>

        <Section tone="muted">
          <SectionIntro
            title="Deployment workflow"
            description="Move from workspace to production with observable, governed releases."
          />
          <div className="grid gap-5 md:grid-cols-4">
            {deploymentWorkflow.map(([title, description], index) => (
              <Panel key={title}>
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[var(--ecode-accent)] text-sm font-bold text-white">
                  {index + 1}
                </span>
                <h3 className="mt-4 text-lg font-semibold text-bolt-elements-textPrimary">{title}</h3>
                <p className="mt-2 text-sm text-bolt-elements-textSecondary">{description}</p>
              </Panel>
            ))}
          </div>
        </Section>

        <Section tone="dark">
          <SectionIntro
            title="Production control room"
            description="Real-time logs, analytics and one-click rollbacks keep teams shipping without downtime."
            invert
          />
          <div className="grid gap-6 lg:grid-cols-3">
            {[
              ['Secure by default', 'TLS, secrets, identity and deployment policy stay attached to the release.'],
              ['Governed releases', 'Require approvals, enforce protected branches and log every deployment event.'],
              ['24/7 observability', 'Request rates, latency, errors and regions stay visible after release.'],
            ].map(([title, description]) => (
              <Panel key={title} dark>
                <h3 className="text-xl font-semibold text-white">{title}</h3>
                <p className="mt-3 text-sm leading-6 text-white/70">{description}</p>
              </Panel>
            ))}
          </div>
        </Section>
      </MarketingMain>
    </PublicShell>
  );
}

export function EcodeBountiesPage() {
  return (
    <PublicShell>
      <MarketingMain>
        <section className="relative overflow-hidden bg-slate-950 py-16 text-white sm:py-24">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(242,98,7,0.22),transparent_32%),radial-gradient(circle_at_82%_12%,rgba(249,157,37,0.18),transparent_28%)]" />
          <Container className="relative grid gap-12 lg:grid-cols-[1fr_0.9fr] lg:items-center">
            <div>
              <Badge icon={Handshake}>Developer marketplace</Badge>
              <h1 className="mt-6 mkt-h1">Ship features faster with outcome-based bounties</h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-white/75">
                Publish challenges, collaborate with expert builders and pay on delivery. E-Code handles recruiting,
                secure review environments and automated payouts.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <ActionLink to="/bounties">Launch your first bounty</ActionLink>
                <ActionLink to="/contact-sales" variant="outlineDark">
                  Talk to our team
                </ActionLink>
              </div>
              <div className="mt-8 flex flex-wrap gap-3 text-sm text-white/70">
                {['Global payouts managed', 'Review sandboxes included', 'SOC 2 aligned processes'].map((item) => (
                  <span
                    key={item}
                    className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1"
                  >
                    <CheckCircle2 className="h-4 w-4 text-[var(--ecode-accent)]" aria-hidden />
                    {item}
                  </span>
                ))}
              </div>
            </div>
            <Panel dark className="bg-white/10">
              <h2 className="text-xl font-semibold text-white">How E-Code runs bounties</h2>
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                {bountyHighlights.map(([value, label]) => (
                  <div key={value} className="rounded-lg border border-white/10 bg-black/20 p-4">
                    <div className="text-lg font-bold text-white">{value}</div>
                    <p className="mt-1 text-sm text-white/65">{label}</p>
                  </div>
                ))}
              </div>
            </Panel>
          </Container>
        </section>

        <Section>
          <SectionIntro
            title="Designed for product and platform teams"
            description="Empower internal teams with curated external talent while maintaining governance, security and predictable delivery."
          />
          <div className="grid gap-5 md:grid-cols-3">
            {[
              [
                'Launch in minutes',
                'Turn roadmap items, bugs and integration needs into clear outcome-based bounties.',
              ],
              [
                'Verified experts',
                'Match with builders who understand E-Code workflows, reviews and production delivery.',
              ],
              [
                'Performance driven',
                'Pay based on accepted work, validated output and measurable delivery milestones.',
              ],
            ].map(([title, description]) => (
              <Panel key={title}>
                <h3 className="text-xl font-semibold text-bolt-elements-textPrimary">{title}</h3>
                <p className="mt-3 text-sm leading-6 text-bolt-elements-textSecondary">{description}</p>
              </Panel>
            ))}
          </div>
        </Section>

        <Section tone="muted">
          <SectionIntro
            title="How bounties work"
            description="Create the challenge, recruit the right talent, review and ship."
          />
          <div className="grid gap-5 md:grid-cols-3">
            {[
              ['Create a bounty', 'Define acceptance criteria, budget, scope and security requirements.'],
              ['Recruit the right talent', 'E-Code matches verified experts and provides secure workspaces.'],
              ['Review & ship', 'Approve code, validate preview output and release with confidence.'],
            ].map(([title, description], index) => (
              <Panel key={title}>
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[var(--ecode-accent)] font-bold text-white">
                  {index + 1}
                </span>
                <h3 className="mt-4 text-lg font-semibold text-bolt-elements-textPrimary">{title}</h3>
                <p className="mt-2 text-sm text-bolt-elements-textSecondary">{description}</p>
              </Panel>
            ))}
          </div>
        </Section>

        <Section>
          <SectionIntro
            title="Popular bounty categories"
            description="Use bounties for focused work with clear acceptance criteria."
          />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {bountyCategories.map((category) => (
              <Panel key={category}>
                <div className="flex items-center gap-3">
                  <Sparkles className="h-5 w-5 text-[var(--ecode-accent)]" aria-hidden />
                  <h3 className="font-semibold text-bolt-elements-textPrimary">{category}</h3>
                </div>
              </Panel>
            ))}
          </div>
        </Section>
      </MarketingMain>
    </PublicShell>
  );
}

export function EcodeTeamsPage() {
  return (
    <PublicShell>
      <MarketingMain>
        <section className="relative overflow-hidden py-16 sm:py-24">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(242,98,7,0.16),transparent_30%),radial-gradient(circle_at_80%_10%,rgba(249,157,37,0.14),transparent_28%)]" />
          <Container className="relative text-center">
            <Badge icon={Users}>Teams</Badge>
            <h1 className="mx-auto mt-6 max-w-4xl mkt-h1 text-bolt-elements-textPrimary">
              Build Together, Ship Faster
            </h1>
            <p className="mx-auto mt-6 max-w-3xl text-lg leading-8 text-bolt-elements-textSecondary">
              Real-time collaboration that feels like magic. Code, debug and deploy with your team in perfect sync.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <ActionLink to="/register">Start Collaborating Free</ActionLink>
              <ActionLink to="/contact-sales" variant="outline">
                Contact Sales
              </ActionLink>
            </div>
          </Container>
        </section>

        <Section tone="muted">
          <SectionIntro
            title="Everything Your Team Needs"
            description="The public E-Code team page restored inside E-Code."
          />
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {teamFeatures.map((feature) => (
              <IconCard key={feature.title} icon={feature.icon} title={feature.title}>
                {feature.description}
              </IconCard>
            ))}
          </div>
        </Section>

        <Section>
          <SectionIntro
            title="Built for Modern Teams"
            description="Remote teams and educational institutions get shared context without losing controls."
          />
          <div className="grid gap-8 md:grid-cols-2">
            <Panel>
              <h3 className="text-2xl font-semibold text-bolt-elements-textPrimary">Remote Teams</h3>
              <p className="mt-3 text-bolt-elements-textSecondary">
                Bridge the distance with real-time collaboration that makes remote feel local. Share context, pair
                program and ship code together from anywhere.
              </p>
              <CheckList
                className="mt-5"
                items={['Live presence indicators', 'Voice and video-ready workflows', 'Timezone-aware collaboration']}
              />
            </Panel>
            <Panel>
              <h3 className="text-2xl font-semibold text-bolt-elements-textPrimary">Educational Institutions</h3>
              <p className="mt-3 text-bolt-elements-textSecondary">
                Teachers can jump into student projects, provide real-time feedback and track progress through shared
                workspaces.
              </p>
              <CheckList
                className="mt-5"
                items={['Classroom management tools', 'Assignment distribution', 'Progress tracking']}
              />
            </Panel>
          </div>
        </Section>

        <Section tone="muted">
          <SectionIntro
            title="See collaboration in the workspace"
            description="Shared presence, live previews and Git review happen in the same browser IDE — no setup per teammate."
          />
          <ProductFigure
            src="/ecode-static/assets/product/ide-git.png"
            alt="E-Code browser IDE showing Git review and version control inside a shared workspace"
            caption="Branch, review and merge with full project context visible to the whole team."
          />
        </Section>

        <Section tone="dark">
          <div className="grid gap-8 lg:grid-cols-2 lg:items-center">
            <div>
              <Badge icon={Users}>Start your team workspace</Badge>
              <h2 className="mt-5 text-4xl font-bold text-white">Bring your whole team into one workspace</h2>
              <p className="mt-4 text-lg leading-8 text-white/75">
                Invite collaborators, share live project context and ship together from the browser. Upgrade to Core or
                Pro for more seats, parallel agents and any-region publishing.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row lg:justify-end">
              <ActionLink to="/register">
                Start Collaborating Free
                <ArrowRight className="h-4 w-4" aria-hidden />
              </ActionLink>
              <ActionLink to="/contact-sales" variant="outlineDark">
                Contact Sales
              </ActionLink>
            </div>
          </div>
        </Section>
      </MarketingMain>
    </PublicShell>
  );
}

export function EcodeCampaignPage({ slug }: { slug: CampaignPageKey }) {
  if (slug === 'bounties') {
    return <EcodeBountiesPage />;
  }

  if (slug === 'deployments') {
    return <EcodeDeploymentsPage />;
  }

  return <EcodeTeamsPage />;
}

function MarketingMain({ children }: { children: ReactNode }) {
  return <main className="bg-bolt-elements-background-depth-1 text-bolt-elements-textPrimary">{children}</main>;
}

function Container({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={classNames('mx-auto max-w-7xl px-4 sm:px-6', className)}>{children}</div>;
}

function Section({
  children,
  className,
  id,
  tone = 'default',
}: {
  children: ReactNode;
  className?: string;
  id?: string;
  tone?: 'default' | 'muted' | 'dark';
}) {
  return (
    <section
      id={id}
      className={classNames(
        'py-14 sm:py-20',
        tone === 'muted' && 'bg-bolt-elements-background-depth-2',
        tone === 'dark' && 'bg-slate-950 text-white',
        className,
      )}
    >
      <Container>{children}</Container>
    </section>
  );
}

function SectionIntro({
  title,
  description,
  invert = false,
}: {
  title: string;
  description: string;
  invert?: boolean;
}) {
  return (
    <div className="mb-10 text-center">
      <h2
        className={classNames(
          'text-3xl font-bold tracking-normal sm:text-4xl',
          invert ? 'text-white' : 'text-bolt-elements-textPrimary',
        )}
      >
        {title}
      </h2>
      <p
        className={classNames(
          'mx-auto mt-3 max-w-2xl text-base leading-7',
          invert ? 'text-white/70' : 'text-bolt-elements-textSecondary',
        )}
      >
        {description}
      </p>
    </div>
  );
}

function Badge({ children, icon }: { children: ReactNode; icon: LucideIcon }) {
  const IconComponent = icon;

  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-[var(--ecode-accent)] px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-white">
      <IconComponent className="h-4 w-4" aria-hidden />
      {children}
    </span>
  );
}

function ActionLink({
  children,
  fullWidth = false,
  to,
  variant = 'default',
}: {
  children: ReactNode;
  fullWidth?: boolean;
  to: string;
  variant?: 'default' | 'outline' | 'outlineDark';
}) {
  const className = classNames(
    'inline-flex h-11 items-center justify-center gap-2 rounded-md px-5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ecode-accent)]',
    fullWidth && 'w-full',
    variant === 'default' && 'bg-[var(--ecode-accent)] text-white hover:bg-[var(--ecode-accent-hover)]',
    variant === 'outline' &&
      'border border-bolt-elements-borderColor text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-2',
    variant === 'outlineDark' && 'border border-white/25 text-white hover:bg-white/10',
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

function Panel({
  children,
  className,
  dark = false,
  id,
}: {
  children: ReactNode;
  className?: string;
  dark?: boolean;
  id?: string;
}) {
  return (
    <article
      id={id}
      className={classNames(
        'rounded-lg border p-5 shadow-sm',
        dark ? 'border-white/10 bg-white/5' : 'border-bolt-elements-borderColor bg-bolt-elements-background-depth-1',
        className,
      )}
    >
      {children}
    </article>
  );
}

function IconCard({ children, icon, title }: { children: ReactNode; icon: LucideIcon; title: string }) {
  const IconComponent = icon;

  return (
    <Panel>
      <span className="inline-flex rounded-lg bg-[var(--ecode-accent)]/10 p-3 text-[var(--ecode-accent)]">
        <IconComponent className="h-7 w-7" aria-hidden />
      </span>
      <h3 className="mt-4 text-xl font-semibold text-bolt-elements-textPrimary">{title}</h3>
      <div className="mt-3 text-sm leading-6 text-bolt-elements-textSecondary">{children}</div>
    </Panel>
  );
}

function CheckList({
  className,
  invert = false,
  items,
}: {
  className?: string;
  invert?: boolean;
  items: readonly string[];
}) {
  return (
    <ul className={classNames('space-y-2 text-sm', className)}>
      {items.map((item) => (
        <li
          key={item}
          className={classNames(
            'flex items-start gap-2',
            invert ? 'text-white/80' : 'text-bolt-elements-textSecondary',
          )}
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--ecode-accent)]" aria-hidden />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function DemoFrame({
  compact = false,
  description,
  eyebrow,
  metrics,
  title,
}: {
  compact?: boolean;
  description: string;
  eyebrow: string;
  metrics: readonly (readonly [string, string])[];
  title: string;
}) {
  return (
    <div
      className={classNames(
        'relative overflow-hidden rounded-2xl border border-bolt-elements-borderColor bg-slate-950 shadow-2xl',
        compact ? 'min-h-[360px]' : 'min-h-[420px]',
      )}
    >
      <img
        src={heroImage}
        alt=""
        className="absolute inset-0 h-full w-full object-cover opacity-55"
        loading="lazy"
        decoding="async"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/70 to-slate-950/20" />
      <div className="relative flex min-h-[inherit] flex-col justify-end p-5 sm:p-7">
        <span className="inline-flex w-fit items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white backdrop-blur">
          <PlayCircle className="h-4 w-4" aria-hidden />
          {eyebrow}
        </span>
        <h2 className="mt-4 max-w-2xl text-2xl font-semibold text-white sm:text-3xl">{title}</h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-white/75">{description}</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {metrics.map(([value, label]) => (
            <div key={`${value}-${label}`} className="rounded-lg border border-white/10 bg-white/10 p-3 backdrop-blur">
              <div className="text-lg font-bold text-white">{value}</div>
              <div className="text-xs text-white/60">{label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function WorkspaceMockup({ large = false }: { large?: boolean }) {
  return (
    <div
      className={classNames(
        'overflow-hidden rounded-2xl border border-bolt-elements-borderColor bg-slate-950 shadow-2xl',
        large ? 'min-h-[520px]' : 'min-h-[420px]',
      )}
    >
      <div className="flex items-center gap-2 border-b border-white/10 bg-white/5 px-4 py-3">
        <span className="h-3 w-3 rounded-full bg-red-400" />
        <span className="h-3 w-3 rounded-full bg-amber-400" />
        <span className="h-3 w-3 rounded-full bg-emerald-400" />
        <span className="ml-3 text-xs text-white/50">ecode://workspace/customer-portal</span>
      </div>
      <div className="grid min-h-[inherit] grid-cols-[0.32fr_0.68fr]">
        <aside className="border-r border-white/10 bg-white/[0.03] p-4 text-xs text-white/55">
          {['app', 'components', 'routes', 'api', 'deployments'].map((item) => (
            <div key={item} className="mb-3 flex items-center gap-2">
              <Layers className="h-3.5 w-3.5" aria-hidden />
              {item}
            </div>
          ))}
        </aside>
        <div className="p-4">
          <div className="rounded-lg border border-white/10 bg-black/35 p-4 font-mono text-xs leading-6 text-emerald-200">
            <p>import &#123; Dashboard &#125; from "./components";</p>
            <p>export default function App() &#123;</p>
            <p className="pl-4">return &lt;Dashboard data=&#123;metrics&#125; /&gt;;</p>
            <p>&#125;</p>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {['Terminal ready', 'Preview live', 'Agent planning'].map((item) => (
              <span key={item} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/70">
                {item}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ProductFigure({ alt, caption, src }: { alt: string; caption?: string; src: string }) {
  return (
    <figure className="overflow-hidden rounded-2xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 shadow-2xl">
      <img src={src} alt={alt} className="block w-full" loading="lazy" decoding="async" />
      {caption ? (
        <figcaption className="border-t border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-5 py-3 text-sm text-bolt-elements-textSecondary">
          {caption}
        </figcaption>
      ) : null}
    </figure>
  );
}

function FeatureTile({ feature }: { feature: (typeof ecodeFeatures)[number] }) {
  const Icon = feature.icon;

  return (
    <Panel>
      <span className="inline-flex rounded-lg bg-[var(--ecode-accent)]/10 p-3 text-[var(--ecode-accent)]">
        <Icon className="h-6 w-6" aria-hidden />
      </span>
      <h3 className="mt-4 text-xl font-semibold text-bolt-elements-textPrimary">{feature.title}</h3>
      <p className="mt-2 text-sm leading-6 text-bolt-elements-textSecondary">{feature.description}</p>
      <CheckList className="mt-4" items={feature.bullets} />
    </Panel>
  );
}

function PhoneDemo({ activeFeature }: { activeFeature: (typeof mobileFeatures)[number] }) {
  const Icon = activeFeature.icon;

  return (
    <div className="mx-auto w-full max-w-sm">
      <div className="rounded-[2.25rem] border border-bolt-elements-borderColor bg-slate-950 p-3 shadow-2xl">
        <div className="rounded-[1.75rem] border border-white/10 bg-gradient-to-b from-slate-900 to-black p-4 text-white">
          <div className="mx-auto mb-5 h-1.5 w-20 rounded-full bg-white/20" />
          <div className="flex items-center justify-between">
            <span className="text-xs text-white/55">E-Code Mobile</span>
            <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs text-emerald-200">LIVE</span>
          </div>
          <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-5">
            <Icon className="h-10 w-10 text-[var(--ecode-accent)]" aria-hidden />
            <h2 className="mt-4 text-xl font-semibold">{activeFeature.title}</h2>
            <p className="mt-2 text-sm leading-6 text-white/65">{activeFeature.description}</p>
          </div>
          <div className="mt-5 space-y-2">
            {mobileFeatureDetails[activeFeature.id].slice(0, 3).map((item) => (
              <div key={item} className="rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-xs text-white/75">
                {item}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function MobileFeatureDemo({ featureId }: { featureId: (typeof mobileFeatures)[number]['id'] }) {
  if (featureId === 'terminal') {
    return (
      <Panel dark className="bg-slate-950">
        <div className="font-mono text-sm text-emerald-200">
          <p className="text-emerald-400">$ ecode login --sso</p>
          <p>Authenticated with Enterprise SSO</p>
          <p className="mt-3 text-emerald-400">$ npm run test:mobile</p>
          <p>All mobile viewport checks passed</p>
          <p className="mt-3 text-emerald-400">$ ecode deploy mobile-app --target=edge</p>
          <p>Edge deploy ready</p>
        </div>
      </Panel>
    );
  }

  if (featureId === 'preview') {
    return (
      <Panel>
        <h3 className="text-xl font-semibold text-bolt-elements-textPrimary">Device previews</h3>
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          {['iPhone 15 Pro', 'Pixel 8', 'iPad Pro 13"'].map((device) => (
            <div
              key={device}
              className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4 text-center"
            >
              <MonitorSmartphone className="mx-auto h-8 w-8 text-[var(--ecode-accent)]" aria-hidden />
              <p className="mt-3 text-sm font-medium text-bolt-elements-textPrimary">{device}</p>
              <p className="mt-1 text-xs text-bolt-elements-textSecondary">Edge preview</p>
            </div>
          ))}
        </div>
      </Panel>
    );
  }

  return (
    <Panel dark className="bg-slate-950">
      <div className="rounded-lg border border-white/10 bg-black/40 p-4 font-mono text-xs leading-6 text-emerald-200">
        <p>import Workspace from "@ecode/mobile";</p>
        <p>const session = Workspace.resume("inventory-app");</p>
        <p>session.enableAI();</p>
        <p>session.share(&#123; team: "Field Ops" &#125;);</p>
      </div>
    </Panel>
  );
}

function DeploymentStatusCard() {
  return (
    <Panel className="bg-slate-950 text-white">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm text-white/55">marketing-site@main</p>
          <h2 className="text-2xl font-semibold text-white">Live</h2>
        </div>
        <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-sm font-semibold text-emerald-200">Healthy</span>
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {[
          ['Requests/min', '4.2k'],
          ['Latency p95', '112ms'],
          ['Autoscale', 'Enabled'],
          ['TLS', 'Issued'],
          ['Backups', 'Nightly'],
          ['Rollback', 'Ready'],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-white/10 bg-white/5 p-4">
            <p className="text-sm text-white/55">{label}</p>
            <p className="mt-1 text-xl font-semibold text-white">{value}</p>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function formatMonthlyPrice(cents: number) {
  return cents === 0 ? '€0' : `€${Math.round(cents / 100)}`;
}
