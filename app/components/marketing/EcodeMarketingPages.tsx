import {
  ArrowRight,
  BookOpen,
  BriefcaseBusiness,
  Building2,
  CheckCircle2,
  Code2,
  Compass,
  FileText,
  Globe2,
  Handshake,
  HeartHandshake,
  Layers,
  Megaphone,
  MonitorPlay,
  MonitorSmartphone,
  Palette,
  Newspaper,
  PlayCircle,
  Scale,
  Search,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import type { MetaFunction } from 'react-router';
import { Link, useParams } from 'react-router';
import { PublicShell } from '~/components/dashboard/SaaSLayout';
import { socialMetaTags } from '~/utils/social-meta';

type MarketingPageKind = 'standard' | 'legal' | 'solution' | 'compare' | 'resource';

export interface MarketingPageDefinition {
  slug: string;
  title: string;
  eyebrow: string;
  description: string;
  kind: MarketingPageKind;
  icon: LucideIcon;
  primaryAction?: readonly [label: string, to: string];
  secondaryAction?: readonly [label: string, to: string];
  highlights: readonly string[];
  sections: readonly {
    title: string;
    body: string;
    items: readonly string[];
  }[];
}

const productProof = ['AI-native builder', 'E-Code IDE', 'Real runtimes', 'Enterprise governance'] as const;

const PRODUCT_BASE = '/ecode-static/assets/product';

/**
 * Maps a marketing page slug to a real product capture plus a caption.
 * Only slugs with a genuinely representative screenshot are listed; everything
 * else renders without a figure rather than forcing an unrelated image.
 */
const productFigures: Record<string, { src: string; alt: string; caption: string }> = {
  product: {
    src: `${PRODUCT_BASE}/ide.png`,
    alt: 'E-Code browser IDE with file tree, editor, terminal and live preview',
    caption: 'The E-Code workspace: editor, terminal, preview and agent in one view.',
  },
  features: {
    src: `${PRODUCT_BASE}/ide.png`,
    alt: 'E-Code browser IDE showing the integrated development workspace',
    caption: 'File tree, editor, terminal output and preview stay visible together.',
  },
  demo: {
    src: `${PRODUCT_BASE}/ide.png`,
    alt: 'E-Code IDE during a prompt-to-app build session',
    caption: 'From prompt to running app inside one browser workspace.',
  },
  ai: {
    src: `${PRODUCT_BASE}/ide.png`,
    alt: 'E-Code AI agent working inside the development environment',
    caption: 'Agents reason over real files, terminal output and previews.',
  },
  desktop: {
    src: `${PRODUCT_BASE}/ide.png`,
    alt: 'E-Code desktop workspace with persistent project context',
    caption: 'A focused desktop workspace with readable panels and preview state.',
  },
  mobile: {
    src: `${PRODUCT_BASE}/mobile.png`,
    alt: 'E-Code mobile interface for building and reviewing on a phone',
    caption: 'Prompt, files, preview and release context on smaller viewports.',
  },
  deployments: {
    src: `${PRODUCT_BASE}/ide-deploy.png`,
    alt: 'E-Code deployment panel with release status and runtime logs',
    caption: 'Deploy with logs, domains, runtime health and release checks.',
  },
  'dashboard-builder': {
    src: `${PRODUCT_BASE}/dashboard.png`,
    alt: 'E-Code dashboard view with charts and operational telemetry',
    caption: 'Data-rich dashboards with auth, charts, filters and team access.',
  },
  'app-builder': {
    src: `${PRODUCT_BASE}/ide.png`,
    alt: 'E-Code workspace building a full-stack app from a prompt',
    caption: 'Prompt to full-stack app: editor, terminal, preview and agent together.',
  },
  'website-builder': {
    src: `${PRODUCT_BASE}/ide.png`,
    alt: 'E-Code workspace building a marketing website with live preview',
    caption: 'Design, edit and preview a polished site without local setup.',
  },
  'game-builder': {
    src: `${PRODUCT_BASE}/ide.png`,
    alt: 'E-Code workspace building an interactive game with live preview',
    caption: 'Build and play-test interactive experiences in one workspace.',
  },
  'chatbot-builder': {
    src: `${PRODUCT_BASE}/ide.png`,
    alt: 'E-Code workspace wiring an AI chatbot with the agent panel',
    caption: 'Compose, test and ship conversational assistants end to end.',
  },
  'internal-ai-builder': {
    src: `${PRODUCT_BASE}/ide-git.png`,
    alt: 'E-Code workspace with version control for internal AI tools',
    caption: 'Private AI tools with real version control and team review.',
  },
  enterprise: {
    src: `${PRODUCT_BASE}/ide-deploy.png`,
    alt: 'E-Code enterprise deployment panel with release controls and logs',
    caption: 'SSO, audit logs and governed deploys with runtime health checks.',
  },
  startups: {
    src: `${PRODUCT_BASE}/ide.png`,
    alt: 'E-Code workspace shipping a startup MVP from a prompt',
    caption: 'Ship your MVP fast: build, preview and deploy in one place.',
  },
  freelancers: {
    src: `${PRODUCT_BASE}/ide-git.png`,
    alt: 'E-Code workspace with version control for client project delivery',
    caption: 'Deliver client work faster with built-in version control.',
  },
};

export const marketingPages = {
  product: {
    slug: 'product',
    title: 'E-Code Product',
    eyebrow: 'Product tour',
    description:
      'The imported E-Code product tour covering the editor, AI generation, agent supervision, Cloud Run deployment, mobile workflows and collaboration.',
    kind: 'standard',
    icon: Layers,
    primaryAction: ['Explore features', '/features'],
    secondaryAction: ['View pricing', '/pricing'],
    highlights: ['Editor', 'AI generation', 'Agents', 'Deploy', 'Mobile', 'Collaboration'],
    sections: [
      {
        title: 'Editor',
        body: 'Panels, terminal, Git, preview, problems and settings built for repeated engineering work.',
        items: ['Workbench panels', 'Terminal and preview', 'Git context', 'Project settings'],
      },
      {
        title: 'AI',
        body: 'Streaming multi-model generation with attachments, stack selection and build correction.',
        items: ['Streaming generation', 'Multi-model routing', 'Attachments', 'Build correction'],
      },
      {
        title: 'Agents',
        body: 'Visible plan, tool calls, artifacts, pause, resume and commit handoff.',
        items: ['Visible plan', 'Tool calls', 'Artifacts', 'Pause and resume'],
      },
      {
        title: 'Deploy',
        body: 'Cloud Run releases, rollback, domains, scheduled jobs and Cloud Monitoring metrics.',
        items: ['Cloud Run releases', 'Rollback', 'Custom domains', 'Monitoring metrics'],
      },
      {
        title: 'Mobile',
        body: 'Project browser, editor, terminal, preview and notifications on phone and tablet.',
        items: ['Project browser', 'Editor', 'Terminal and preview', 'Notifications'],
      },
      {
        title: 'Collaboration',
        body: 'Presence, shared editing, public projects, fork flow and moderation.',
        items: ['Presence', 'Shared editing', 'Public projects', 'Fork flow and moderation'],
      },
    ],
  },
  features: {
    slug: 'features',
    title: 'E-Code Features',
    eyebrow: 'Product',
    description:
      'The full E-Code product surface: AI agent, browser IDE, multiplayer collaboration, real runtimes, previews, deployments and enterprise governance.',
    kind: 'standard',
    icon: MonitorPlay,
    primaryAction: ['Start building', '/signup'],
    secondaryAction: ['Compare platforms', '/compare'],
    highlights: ['Browser IDE', 'AI agent', 'Multiplayer review', 'Runtime previews', 'Deployments'],
    sections: [
      {
        title: 'Integrated development workspace',
        body: 'E-Code keeps the browser IDE, generated code, terminal output, preview state and deployment path visible in one production workflow.',
        items: ['File tree and editor', 'Agent patch review', 'Live preview', 'Terminal and logs'],
      },
      {
        title: 'Team-ready by default',
        body: 'The feature set is designed for teams that need shared context, controlled releases and traceability.',
        items: ['Collaborative project access', 'Audit-ready activity', 'Secrets boundaries', 'Release visibility'],
      },
    ],
  },
  about: {
    slug: 'about',
    title: 'About E-Code',
    eyebrow: 'Company',
    description:
      'E-Code is the AI-powered enterprise development platform for teams that need to generate, review, run and deploy real software from one governed workspace.',
    kind: 'standard',
    icon: Building2,
    primaryAction: ['Start building', '/signup'],
    secondaryAction: ['Contact sales', '/contact-sales'],
    highlights: ['AI software delivery', 'Enterprise controls', 'Mobile and desktop workflows', 'Production previews'],
    sections: [
      {
        title: 'Mission',
        body: 'Help teams move from product intent to production software without replacing engineering rigor.',
        items: productProof,
      },
      {
        title: 'Platform principles',
        body: 'E-Code keeps code, tests, runtime visibility, deployment controls and team governance in the same workflow.',
        items: [
          'Typed delivery paths',
          'Preview-first validation',
          'Audit-ready collaboration',
          'Secure project isolation',
        ],
      },
    ],
  },
  careers: {
    slug: 'careers',
    title: 'Careers',
    eyebrow: 'Company',
    description:
      'Join the distributed team building an AI coding platform with real runtime infrastructure, enterprise security and a mobile-ready IDE.',
    kind: 'standard',
    icon: BriefcaseBusiness,
    primaryAction: ['Contact the team', '/contact'],
    secondaryAction: ['Read about E-Code', '/about'],
    highlights: ['Remote-first engineering', 'Product design craft', 'Infrastructure ownership', 'Enterprise support'],
    sections: [
      {
        title: 'Open disciplines',
        body: 'We hire people who can ship complete, reliable product systems and care about the details users feel every day.',
        items: ['Frontend systems', 'Runtime infrastructure', 'AI agent orchestration', 'Security and compliance'],
      },
      {
        title: 'How we work',
        body: 'Small senior teams own complete surfaces from UX through deployment and operational quality.',
        items: ['Production code', 'Measured reliability', 'Direct customer feedback', 'Clear technical writing'],
      },
    ],
  },
  blog: {
    slug: 'blog',
    title: 'E-Code Blog',
    eyebrow: 'Resources',
    description:
      'Engineering notes, product updates and field reports on AI-assisted software delivery at enterprise scale.',
    kind: 'resource',
    icon: Newspaper,
    primaryAction: ['Read changelog', '/changelog'],
    secondaryAction: ['Browse docs', '/docs'],
    highlights: ['AI delivery', 'Runtime operations', 'Mobile IDE', 'Security posture'],
    sections: [
      {
        title: 'Featured articles',
        body: 'Practical product and engineering updates from the E-Code platform roadmap.',
        items: [
          'Why Cloud Run for developer workspaces',
          'Shipping governed AI agents without losing review loops',
          'Why previews are a release gate, not a demo artifact',
          'Designing a mobile IDE for real production work',
        ],
      },
      {
        title: 'Why Cloud Run for developer workspaces',
        body: 'Cloud Run gives stateless services, gVisor isolation, regional deploys and predictable scaling for modern IDE workloads.',
        items: ['Stateless services', 'gVisor isolation', 'Regional deploys', 'Predictable scaling'],
      },
      {
        title: 'Editorial tracks',
        body: 'Content is organized around shipping software safely, faster and with clearer operational feedback.',
        items: ['Build systems', 'Collaboration', 'Security', 'Deployment infrastructure'],
      },
    ],
  },
  docs: {
    slug: 'docs',
    title: 'Documentation',
    eyebrow: 'Resources',
    description:
      'Practical E-Code documentation for creating projects, using the AI agent, running previews, deploying apps and operating teams safely.',
    kind: 'resource',
    icon: BookOpen,
    primaryAction: ['Start building', '/signup'],
    secondaryAction: ['Read AI docs', '/ai-documentation'],
    highlights: ['Getting started', 'AI agent', 'Preview workflows', 'Deployments'],
    sections: [
      {
        title: 'Build workflow',
        body: 'Documentation follows the real production loop: create a project, generate code, inspect changes, run validation and ship through a controlled path.',
        items: ['Project setup', 'Agent prompts', 'File review', 'Preview verification'],
      },
      {
        title: 'Operational guides',
        body: 'Teams can use the docs to understand runtime requirements, environment variables, deployment checks and troubleshooting paths.',
        items: ['Runtime setup', 'Secrets handling', 'Deployment logs', 'Support escalation'],
      },
    ],
  },
  contact: {
    slug: 'contact',
    title: 'Contact E-Code',
    eyebrow: 'Company',
    description:
      'Reach the E-Code team for platform questions, partnerships, media requests and implementation planning.',
    kind: 'standard',
    icon: HeartHandshake,
    primaryAction: ['Contact sales', '/contact-sales'],
    secondaryAction: ['Open support', '/support'],
    highlights: ['Sales engineering', 'Partnerships', 'Support routing', 'Security questions'],
    sections: [
      {
        title: 'Fast routing',
        body: 'Send the request to the right team with project context, compliance needs and deployment timeline.',
        items: ['Enterprise rollout', 'Technical support', 'Press and analyst requests', 'Partner integrations'],
      },
      {
        title: 'What to include',
        body: 'The more operational context you include, the faster we can give useful guidance.',
        items: ['Team size', 'Security requirements', 'Runtime targets', 'Migration source'],
      },
    ],
  },
  partners: {
    slug: 'partners',
    title: 'Partners',
    eyebrow: 'Ecosystem',
    description:
      'E-Code integrates with the cloud, AI, source control, data and payment platforms teams already trust.',
    kind: 'standard',
    icon: Handshake,
    primaryAction: ['Become a partner', '/contact'],
    secondaryAction: ['View integrations', '/partners'],
    highlights: ['OpenAI', 'GitHub', 'Docker', 'Vercel', 'Cloudflare', 'Stripe'],
    sections: [
      {
        title: 'Technology partners',
        body: 'The imported E-Code partner system is now part of E-Code marketing and footer navigation.',
        items: ['AI providers', 'Deployment platforms', 'Database providers', 'Cloud infrastructure'],
      },
      {
        title: 'Solution partners',
        body: 'E-Code supports implementation teams building internal tools, SaaS platforms and AI products for customers.',
        items: ['Migration services', 'Custom templates', 'Enterprise enablement', 'Security advisory'],
      },
    ],
  },
  press: {
    slug: 'press',
    title: 'Press',
    eyebrow: 'Company',
    description:
      'Brand resources, company positioning and announcement material for E-Code.AI and the enterprise development platform.',
    kind: 'standard',
    icon: Megaphone,
    primaryAction: ['Contact press', '/contact'],
    secondaryAction: ['About E-Code', '/about'],
    highlights: ['Media kit', 'Product screenshots', 'Company boilerplate', 'Leadership notes'],
    sections: [
      {
        title: 'Boilerplate',
        body: 'E-Code.AI helps teams build, run and govern production software with AI agents, real runtimes and enterprise controls.',
        items: ['AI-powered IDE', 'Production runtime adapters', 'Mobile-ready workflows', 'Governed collaboration'],
      },
      {
        title: 'Assets',
        body: 'Public logo, favicon, app icons, partner marks and comparison artwork are available from the public asset tree.',
        items: ['SVG logo', 'ICO favicon', 'PWA PNG icons', 'Partner SVGs'],
      },
    ],
  },
  accessibility: {
    slug: 'accessibility',
    title: 'Accessibility',
    eyebrow: 'Company',
    description:
      'E-Code is built so core development, review and deployment workflows remain usable across keyboard, screen size and theme preferences.',
    kind: 'legal',
    icon: Users,
    primaryAction: ['Report an issue', '/contact'],
    secondaryAction: ['View acceptable use', '/acceptable-use'],
    highlights: ['Keyboard workflows', 'Responsive layouts', 'Dark and light themes', 'Readable states'],
    sections: [
      {
        title: 'Commitment',
        body: 'Every public surface and async panel should provide clear loading, error and recovery states.',
        items: ['Keyboard navigation', 'Visible focus', 'Responsive marketing pages', 'Accessible labels'],
      },
      {
        title: 'Continuous review',
        body: 'Accessibility remains part of QA as new IDE panels, marketing routes and mobile surfaces are added.',
        items: ['Contrast checks', 'Screen-size verification', 'Semantic landmarks', 'Reduced ambiguity'],
      },
    ],
  },
  mobile: {
    slug: 'mobile',
    title: 'Mobile IDE',
    eyebrow: 'Product',
    description: 'Build, review, run previews and collaborate from phone or tablet with E-Code mobile-ready workflows.',
    kind: 'standard',
    icon: MonitorSmartphone,
    primaryAction: ['Start building', '/signup'],
    secondaryAction: ['See templates', '/templates'],
    highlights: ['Phone workflows', 'Tablet layouts', 'Preview access', 'Team collaboration'],
    sections: [
      {
        title: 'Mobile development flow',
        body: 'E-Code keeps prompt, files, preview, terminal status and deployment context available across smaller viewports.',
        items: ['Mobile file navigation', 'Responsive previews', 'Agent updates', 'Release visibility'],
      },
      {
        title: 'Native asset coverage',
        body: 'The imported icon system includes PWA and app icon formats used by mobile install surfaces.',
        items: ['72px to 512px PWA icons', 'Apple touch icon', 'SVG favicon', 'ICO favicon'],
      },
    ],
  },
  desktop: {
    slug: 'desktop',
    title: 'Desktop App',
    eyebrow: 'Product',
    description:
      'Use E-Code as a focused desktop development environment with synced projects, previews and secure runtime access.',
    kind: 'standard',
    icon: TerminalSquare,
    primaryAction: ['Start building', '/signup'],
    secondaryAction: ['Read docs', '/docs'],
    highlights: ['Focused workspace', 'Secure sync', 'Local-friendly review', 'Runtime visibility'],
    sections: [
      {
        title: 'Desktop workflow',
        body: 'The desktop surface is designed around persistent workspaces, readable panels and fast access to preview state.',
        items: ['Project context', 'Editor continuity', 'Terminal visibility', 'Deployment checks'],
      },
      {
        title: 'For production teams',
        body: 'Desktop usage keeps enterprise controls and auditability connected to everyday coding.',
        items: ['SSO-ready identity', 'Project secrets', 'Audit context', 'Policy-aware builds'],
      },
    ],
  },
  languages: {
    slug: 'languages',
    title: 'Languages',
    eyebrow: 'Resources',
    description:
      'Start from production templates across TypeScript, React, Remix, Node.js, Python, Go, Rust and database-backed apps.',
    kind: 'resource',
    icon: Code2,
    primaryAction: ['Browse templates', '/templates'],
    secondaryAction: ['Read docs', '/docs'],
    highlights: ['TypeScript', 'React', 'Node.js', 'Python', 'PostgreSQL', 'Docker'],
    sections: [
      {
        title: 'Template coverage',
        body: 'E-Code language environments map prompts to real project structures, dependencies and validation commands.',
        items: ['Frontend apps', 'API services', 'Database-backed products', 'AI tools'],
      },
      {
        title: 'Runtime support',
        body: 'Language templates are useful only when they can run, preview and deploy with clear feedback.',
        items: ['Install dependencies', 'Run previews', 'Validate tests', 'Deploy safely'],
      },
    ],
  },
  tutorials: {
    slug: 'tutorials',
    title: 'Tutorials',
    eyebrow: 'Resources',
    description:
      'Step-by-step guides for building apps with E-Code prompts, templates, previews, deployments and team workflows.',
    kind: 'resource',
    icon: BookOpen,
    primaryAction: ['Open docs', '/docs'],
    secondaryAction: ['Browse templates', '/templates'],
    highlights: ['First app', 'Deployments', 'AI agent', 'Team review'],
    sections: [
      {
        title: 'Learning paths',
        body: 'Tutorials mirror the same flows used in production: prompt, inspect, run, test, preview and release.',
        items: ['Create a SaaS app', 'Add authentication', 'Connect data', 'Ship a preview'],
      },
      {
        title: 'Advanced guides',
        body: 'Go deeper on agent review, runtime debugging and enterprise controls.',
        items: ['Agent patch review', 'Secrets management', 'Audit logging', 'Mobile validation'],
      },
    ],
  },
  'case-studies': {
    slug: 'case-studies',
    title: 'Case Studies',
    eyebrow: 'Resources',
    description:
      'Patterns from teams using E-Code to accelerate internal platforms, customer apps and AI-assisted delivery.',
    kind: 'resource',
    icon: Layers,
    primaryAction: ['Contact sales', '/contact-sales'],
    secondaryAction: ['View partners', '/partners'],
    highlights: ['Internal tools', 'SaaS launch', 'AI migration', 'Platform teams'],
    sections: [
      {
        title: 'Enterprise delivery',
        body: 'Common success patterns include stronger preview discipline, faster template reuse and clearer runtime ownership.',
        items: ['Shorter build cycles', 'Shared project context', 'Governed deployments', 'Reusable starters'],
      },
      {
        title: 'Evaluation criteria',
        body: 'Teams compare E-Code on reliability, security controls, developer speed and auditability.',
        items: ['Time to first preview', 'Policy fit', 'Team onboarding', 'Operational visibility'],
      },
    ],
  },
  customers: {
    slug: 'customers',
    title: 'Customers and showcase',
    eyebrow: 'Customers',
    description:
      'The imported E-Code customer showcase for internal tools, AI products and education teams building with Cloud Run deployment and validated templates.',
    kind: 'resource',
    icon: Users,
    primaryAction: ['Read case studies', '/case-studies'],
    secondaryAction: ['Contact sales', '/contact-sales'],
    highlights: ['Internal tools', 'AI products', 'Education', 'Cloud Run deployment'],
    sections: [
      {
        title: 'Internal tools',
        body: 'Teams build dashboards, automations and back-office apps with Cloud Run deployment.',
        items: ['Dashboards', 'Automations', 'Back-office apps', 'Cloud Run deployment'],
      },
      {
        title: 'AI products',
        body: 'Founders generate, iterate and ship model-powered apps from validated templates.',
        items: ['Model-powered apps', 'Validated templates', 'Iteration loops', 'Preview before release'],
      },
      {
        title: 'Education',
        body: 'Classrooms run safe project environments with reproducible templates.',
        items: ['Safe environments', 'Reproducible templates', 'Student projects', 'Teacher review'],
      },
      {
        title: 'Showcase paths',
        body: 'The imported showcase now routes through real E-Code pages instead of a detached static HTML file.',
        items: ['Templates', 'Marketplace', 'Community', 'Case studies'],
      },
    ],
  },
  'help-center': {
    slug: 'help-center',
    title: 'Help Center',
    eyebrow: 'Support',
    description:
      'Guidance for account setup, project creation, previews, runtime issues, billing, teams and deployment questions.',
    kind: 'resource',
    icon: HeartHandshake,
    primaryAction: ['Open support', '/support'],
    secondaryAction: ['Read docs', '/docs'],
    highlights: ['Troubleshooting', 'Billing', 'Runtime help', 'Team setup'],
    sections: [
      {
        title: 'Common help topics',
        body: 'The help center routes users to the right product and operational documentation quickly.',
        items: ['Login and signup', 'Project imports', 'Preview servers', 'Deployment failures'],
      },
      {
        title: 'Escalation',
        body: 'Enterprise teams can work with support on SSO, compliance, data residency and rollout planning.',
        items: ['Sales engineering', 'Security review', 'Runtime diagnostics', 'Migration planning'],
      },
    ],
  },
  forum: {
    slug: 'forum',
    title: 'Community Forum',
    eyebrow: 'Community',
    description:
      'Discuss templates, workflows, AI agent behavior and production deployment patterns with other E-Code builders.',
    kind: 'resource',
    icon: Users,
    primaryAction: ['Open support', '/support'],
    secondaryAction: ['Browse templates', '/templates'],
    highlights: ['Builder discussions', 'Template feedback', 'Workflow tips', 'Release notes'],
    sections: [
      {
        title: 'Community topics',
        body: 'The forum is organized around practical building and shipping questions.',
        items: ['App architecture', 'Prompt patterns', 'Deployment setup', 'Team collaboration'],
      },
      {
        title: 'Share work',
        body: 'Use community posts to share templates, ask for review and compare implementation approaches.',
        items: ['Template demos', 'Debug threads', 'Feature requests', 'Integration notes'],
      },
    ],
  },
  ai: {
    slug: 'ai',
    title: 'AI Platform',
    eyebrow: 'Product',
    description:
      'Govern AI-assisted software delivery with model routing, tool execution, audit context and preview-aware validation.',
    kind: 'standard',
    icon: Sparkles,
    primaryAction: ['Try AI builder', '/signup'],
    secondaryAction: ['Read AI docs', '/ai-documentation'],
    highlights: ['Agent orchestration', 'Model controls', 'Tool visibility', 'Audit context'],
    sections: [
      {
        title: 'Agent workflow',
        body: 'E-Code agents operate inside the development environment where files, terminal output and previews are visible.',
        items: ['Prompt planning', 'Patch review', 'Test execution', 'Preview verification'],
      },
      {
        title: 'Governance',
        body: 'Enterprise AI usage requires traceability, policy constraints and clear boundaries around tool execution.',
        items: ['Provider settings', 'Usage controls', 'Audit logging', 'Approval gates'],
      },
    ],
  },
  'ai-documentation': {
    slug: 'ai-documentation',
    title: 'AI Documentation',
    eyebrow: 'Resources',
    description:
      'A complete guide to E-Code agent capabilities, model selection, tool execution, safety gates and validation workflows.',
    kind: 'resource',
    icon: BookOpen,
    primaryAction: ['Open docs', '/docs#agent-walkthrough'],
    secondaryAction: ['Start building', '/signup'],
    highlights: ['Agent modes', 'Model routing', 'Tool calls', 'Validation loops'],
    sections: [
      {
        title: 'Core concepts',
        body: 'Understand how agents reason about files, runtime output, previews and deployment constraints.',
        items: ['Workspace context', 'Patch lifecycle', 'Command validation', 'Preview checks'],
      },
      {
        title: 'Production usage',
        body: 'Use AI safely in teams with review, logs, quota limits and explicit release criteria.',
        items: ['Policy controls', 'Team permissions', 'Secrets boundaries', 'Audit trails'],
      },
    ],
  },
  mcp: {
    slug: 'mcp',
    title: 'MCP Integrations',
    eyebrow: 'Product',
    description:
      'Connect E-Code agents to approved tools and context sources through controlled MCP-style integrations.',
    kind: 'standard',
    icon: Globe2,
    primaryAction: ['Read docs', '/docs'],
    secondaryAction: ['Contact sales', '/contact-sales'],
    highlights: ['Tool governance', 'Context sources', 'Connector catalog', 'Audit trails'],
    sections: [
      {
        title: 'Integration model',
        body: 'External tools become safer when access, scope and outcomes are visible in the development workflow.',
        items: ['Source connectors', 'Issue context', 'Knowledge bases', 'Operational tools'],
      },
      {
        title: 'Enterprise controls',
        body: 'Connector use should respect identity, permission boundaries and compliance requirements.',
        items: ['Scoped access', 'Reviewable outputs', 'Tenant isolation', 'Usage logging'],
      },
    ],
  },
  polyglot: {
    slug: 'polyglot',
    title: 'Polyglot Backends',
    eyebrow: 'Product',
    description:
      'Generate and run backend services across common languages while keeping previews, logs and deployment checks visible.',
    kind: 'standard',
    icon: Code2,
    primaryAction: ['Browse templates', '/templates'],
    secondaryAction: ['Read docs', '/docs'],
    highlights: ['Node.js', 'Python', 'Go', 'Rust', 'PostgreSQL'],
    sections: [
      {
        title: 'Backend generation',
        body: 'E-Code helps teams create APIs, workers and data-backed services with real project files and tests.',
        items: ['REST APIs', 'Background jobs', 'Database schemas', 'Auth flows'],
      },
      {
        title: 'Operational loop',
        body: 'A backend is not complete until it can run, expose logs, pass checks and deploy reliably.',
        items: ['Health checks', 'Runtime logs', 'Environment variables', 'Release gates'],
      },
    ],
  },
  dpa: {
    slug: 'dpa',
    title: 'Data Processing Addendum',
    eyebrow: 'Legal',
    description:
      'Contractual data protection terms for organizations evaluating E-Code for regulated or enterprise use.',
    kind: 'legal',
    icon: FileText,
    primaryAction: ['Contact sales', '/contact-sales'],
    secondaryAction: ['Privacy policy', '/privacy'],
    highlights: ['Data processing', 'Security measures', 'Subprocessors', 'Data subject rights'],
    sections: [
      {
        title: 'Scope',
        body: 'Enterprise plans may execute a data processing addendum with processing responsibilities, security commitments and support for compliance workflows.',
        items: ['Controller and processor roles', 'Processing instructions', 'Confidentiality', 'Subprocessor list'],
      },
      {
        title: 'Operational safeguards',
        body: 'E-Code is designed around identity controls, project isolation, secrets protection and audit visibility.',
        items: ['Access controls', 'Encryption', 'Logging', 'Incident response'],
      },
    ],
  },
  'commercial-agreement': {
    slug: 'commercial-agreement',
    title: 'Commercial Agreement',
    eyebrow: 'Legal',
    description:
      'Commercial terms for teams purchasing E-Code subscriptions, enterprise services and deployment support.',
    kind: 'legal',
    icon: Scale,
    primaryAction: ['Contact sales', '/contact-sales'],
    secondaryAction: ['Terms', '/terms'],
    highlights: ['Subscription terms', 'Support commitments', 'Usage limits', 'Renewal process'],
    sections: [
      {
        title: 'Agreement structure',
        body: 'Commercial agreements align plan entitlements, support level, security needs and rollout requirements.',
        items: ['Order forms', 'Plan limits', 'Support tiers', 'Procurement details'],
      },
      {
        title: 'Enterprise add-ons',
        body: 'Enterprise deployments can include SSO, private infrastructure, custom quotas and onboarding services.',
        items: ['SAML/OIDC', 'SCIM', 'Private runtimes', 'Premium support'],
      },
    ],
  },
  'report-abuse': {
    slug: 'report-abuse',
    title: 'Report Abuse',
    eyebrow: 'Trust',
    description: 'Report misuse of E-Code projects, public previews, hosted content or platform workflows.',
    kind: 'legal',
    icon: ShieldCheck,
    primaryAction: ['Contact support', '/support'],
    secondaryAction: ['Acceptable use', '/acceptable-use'],
    highlights: ['Hosted content', 'Security issues', 'Policy violations', 'Responsible disclosure'],
    sections: [
      {
        title: 'What to report',
        body: 'Include the URL, project identifier, observed behavior and any relevant timestamps.',
        items: ['Phishing', 'Malware', 'Illegal content', 'Credential exposure'],
      },
      {
        title: 'Review process',
        body: 'Reports are reviewed for policy violations and security impact before action is taken.',
        items: ['Triage', 'Evidence review', 'Mitigation', 'Follow-up'],
      },
    ],
  },
  subprocessors: {
    slug: 'subprocessors',
    title: 'Subprocessors',
    eyebrow: 'Legal',
    description: 'Infrastructure, security, AI and operational providers that may support E-Code service delivery.',
    kind: 'legal',
    icon: Globe2,
    primaryAction: ['Contact sales', '/contact-sales'],
    secondaryAction: ['DPA', '/dpa'],
    highlights: ['Cloud infrastructure', 'AI providers', 'Observability', 'Payments'],
    sections: [
      {
        title: 'Provider categories',
        body: 'Subprocessors are used to operate core application hosting, payments, email delivery, analytics, support and secure AI workflows.',
        items: ['Google Cloud', 'Stripe', 'Sentry', 'Email delivery and analytics'],
      },
      {
        title: 'Change management',
        body: 'Enterprise customers can review subprocessors as part of procurement and security diligence.',
        items: ['Vendor review', 'Regional controls', 'Security documentation', 'Notification process'],
      },
    ],
  },
  'student-dpa': {
    slug: 'student-dpa',
    title: 'US Student DPA',
    eyebrow: 'Legal',
    description: 'Student data protection terms for education programs and institutions evaluating E-Code.',
    kind: 'legal',
    icon: FileText,
    primaryAction: ['Contact sales', '/contact-sales'],
    secondaryAction: ['Privacy policy', '/privacy'],
    highlights: ['Education use', 'Student privacy', 'Administrative controls', 'Data deletion'],
    sections: [
      {
        title: 'Education controls',
        body: 'Education deployments require careful handling of student data, access and retention.',
        items: ['Role-based access', 'Limited processing', 'Deletion support', 'Audit records'],
      },
      {
        title: 'Institution support',
        body: 'E-Code can work with school and university administrators on rollout, compliance and support paths.',
        items: ['Procurement support', 'Security review', 'Training', 'Support escalation'],
      },
    ],
  },
  marketplace: {
    slug: 'marketplace',
    title: 'Marketplace',
    eyebrow: 'Templates',
    description:
      'Discover E-Code starters, implementation patterns and reusable project foundations for production apps.',
    kind: 'resource',
    icon: Layers,
    primaryAction: ['Browse templates', '/templates'],
    secondaryAction: ['Explore solutions', '/solutions/app-builder'],
    highlights: ['Production starters', 'Reusable patterns', 'Runtime-ready', 'Deployment paths'],
    sections: [
      {
        title: 'What the marketplace contains',
        body: 'Marketplace entries are designed to become real projects, not screenshots. Each starter should map to files, dependencies, validation and preview expectations.',
        items: ['SaaS templates', 'Dashboard starters', 'AI tools', 'Website systems'],
      },
      {
        title: 'How teams use it',
        body: 'Teams can standardize project starts while preserving code ownership and review discipline.',
        items: ['Fork a starter', 'Adapt with the AI agent', 'Run preview checks', 'Deploy through controlled flows'],
      },
    ],
  },
  community: {
    slug: 'community',
    title: 'Community',
    eyebrow: 'Builders',
    description:
      'A public space for E-Code builders to share project patterns, template ideas, workflow notes and launch feedback.',
    kind: 'resource',
    icon: Users,
    primaryAction: ['Open forum', '/forum'],
    secondaryAction: ['Browse marketplace', '/marketplace'],
    highlights: ['Project showcases', 'Template feedback', 'Workflow notes', 'Release discussions'],
    sections: [
      {
        title: 'Builder network',
        body: 'Community content connects practical implementation notes with the templates and product surfaces teams use every day.',
        items: ['Showcase posts', 'Prompt patterns', 'Debug discussions', 'Deployment advice'],
      },
      {
        title: 'Safe collaboration',
        body: 'Public collaboration should never require exposing secrets, private repositories or customer data.',
        items: [
          'Share sanitized examples',
          'Link public previews',
          'Ask focused questions',
          'Escalate sensitive issues to support',
        ],
      },
    ],
  },
  explore: {
    slug: 'explore',
    title: 'Explore E-Code',
    eyebrow: 'Discovery',
    description:
      'Explore solutions, templates, community examples and platform capabilities before starting a project.',
    kind: 'resource',
    icon: Compass,
    primaryAction: ['Browse templates', '/templates'],
    secondaryAction: ['View features', '/features'],
    highlights: ['Solutions', 'Templates', 'Community', 'Comparisons'],
    sections: [
      {
        title: 'Discovery paths',
        body: 'Use Explore to move from a broad product idea to the right starter, guide or comparison page.',
        items: ['Solution pages', 'Template gallery', 'Community posts', 'Platform comparisons'],
      },
      {
        title: 'Next step',
        body: 'Once a path is clear, E-Code turns the selected pattern into a project that can be edited, run and validated.',
        items: ['Create project', 'Generate code', 'Review changes', 'Preview output'],
      },
    ],
  },
  search: {
    slug: 'search',
    title: 'Search',
    eyebrow: 'Discovery',
    description:
      'Search across E-Code docs, templates, projects, marketplace entries and community knowledge from one public entry point.',
    kind: 'resource',
    icon: Search,
    primaryAction: ['Search templates', '/templates'],
    secondaryAction: ['Open docs', '/docs'],
    highlights: ['Docs', 'Templates', 'Projects', 'Community'],
    sections: [
      {
        title: 'Search surfaces',
        body: 'Public search routes people to the most useful source of truth for their task.',
        items: ['Documentation guides', 'Template starters', 'Community examples', 'Product pages'],
      },
      {
        title: 'Signed-in search',
        body: 'Workspace search remains available inside the authenticated dashboard and project IDE.',
        items: ['Command palette', 'Project files', 'Agent context', 'Team resources'],
      },
    ],
  },
  demo: {
    slug: 'demo',
    title: 'Platform Demo',
    eyebrow: 'Demo',
    description:
      'See how E-Code connects prompt, files, preview, terminal feedback, deployment controls and team review in one workflow.',
    kind: 'standard',
    icon: MonitorPlay,
    primaryAction: ['Start building', '/signup'],
    secondaryAction: ['View features', '/features'],
    highlights: ['Prompt to app', 'IDE review', 'Live preview', 'Deployment controls'],
    sections: [
      {
        title: 'Demo flow',
        body: 'The public demo page documents the product flow without relying on the placeholder video asset from the source app.',
        items: ['Describe the app', 'Review generated files', 'Run preview', 'Prepare release'],
      },
      {
        title: 'Why no video file is embedded',
        body: 'The source platform-demo.mp4 is not a media file, so E-Code uses a real rendered product explanation instead of serving a broken video.',
        items: ['No broken media', 'Accessible copy', 'Real routes', 'Production-safe assets'],
      },
    ],
  },
  'theme-validation': {
    slug: 'theme-validation',
    title: 'Theme Validation',
    eyebrow: 'Design system',
    description:
      'Validate E-Code dark mode, light mode, brand colors, focus states and responsive marketing shell behavior.',
    kind: 'resource',
    icon: Palette,
    primaryAction: ['Open accessibility', '/accessibility'],
    secondaryAction: ['View features', '/features'],
    highlights: ['Dark default', 'Light mode available', 'Focus rings', 'Responsive states'],
    sections: [
      {
        title: 'Visual contract',
        body: 'Theme validation keeps the public shell, auth pages and product surfaces aligned with E-Code brand assets.',
        items: ['Logo contrast', 'Readable cards', 'Accessible links', 'Stable responsive spacing'],
      },
      {
        title: 'Operational validation',
        body: 'Design changes are checked through typecheck, lint, build and browser rendering before release.',
        items: ['TypeScript', 'ESLint', 'Production build', 'Playwright crawl'],
      },
    ],
  },
  'runtime-test': {
    slug: 'runtime-test',
    title: 'Runtime Test',
    eyebrow: 'Diagnostics',
    description: 'A public compatibility page for E-Code runtime readiness, preview health and deployment diagnostics.',
    kind: 'resource',
    icon: TerminalSquare,
    primaryAction: ['View status', '/status'],
    secondaryAction: ['Read docs', '/docs'],
    highlights: ['Runtime readiness', 'Preview health', 'Logs', 'Deployment checks'],
    sections: [
      {
        title: 'Runtime readiness',
        body: 'Runtime checks should confirm that projects can install dependencies, start servers, expose ports and render previews.',
        items: ['Install command', 'Dev server', 'Port detection', 'Preview render'],
      },
      {
        title: 'Production diagnostics',
        body: 'Operational routes should remain readable even when a backend dependency is unavailable.',
        items: ['Clear status', 'Recoverable errors', 'Support routing', 'No blank screens'],
      },
    ],
  },
} as const satisfies Record<string, MarketingPageDefinition>;

export const solutionPages = {
  'app-builder': makeSolution(
    'app-builder',
    'App Builder',
    'Rapidly prototype and deploy full-stack applications with AI-guided generation, real files and preview validation.',
    ['SaaS apps', 'Customer portals', 'Admin dashboards', 'API-backed products'],
  ),
  'website-builder': makeSolution(
    'website-builder',
    'Website Builder',
    'Create polished marketing sites, launch pages and content systems with production-ready responsive layouts.',
    ['Landing pages', 'Company sites', 'Docs surfaces', 'Lead capture'],
  ),
  'game-builder': makeSolution(
    'game-builder',
    'Game Builder',
    'Design and launch interactive browser experiences while keeping assets, code and preview feedback in one workspace.',
    ['Canvas games', 'Interactive demos', 'Prototype loops', 'Deployment previews'],
  ),
  'dashboard-builder': makeSolution(
    'dashboard-builder',
    'Dashboard Builder',
    'Build data-rich dashboards with authentication, charts, filters, team access and operational telemetry.',
    ['Analytics views', 'Admin panels', 'KPI tracking', 'Real-time status'],
  ),
  'chatbot-builder': makeSolution(
    'chatbot-builder',
    'Chatbot / AI Agent Builder',
    'Deploy conversational assistants and task agents with reviewable prompts, tools, memory and audit boundaries.',
    ['Support assistants', 'Internal copilots', 'Workflow agents', 'Knowledge bots'],
  ),
  'internal-ai-builder': makeSolution(
    'internal-ai-builder',
    'Internal AI Builder',
    'Bring private AI tools to every team with secure project context, approvals and enterprise observability.',
    ['Operations tools', 'Sales assistants', 'Support automation', 'Knowledge workflows'],
  ),
  enterprise: makeSolution(
    'enterprise',
    'Enterprise',
    'Roll out E-Code with SSO, SCIM, audit logs, security controls, private runtime planning and support.',
    ['SSO and SCIM', 'Audit export', 'Private rollout', 'Premium support'],
  ),
  startups: makeSolution(
    'startups',
    'Startups',
    'Ship products quickly with templates, AI generation, hosted previews and a path from prototype to production.',
    ['MVP launch', 'Investor demos', 'SaaS starters', 'Fast iteration'],
  ),
  freelancers: makeSolution(
    'freelancers',
    'Freelancers',
    'Deliver client projects faster with repeatable templates, preview links and production handoff workflows.',
    ['Client portals', 'Portfolio sites', 'Retainers', 'Handoff docs'],
  ),
} as const satisfies Record<string, MarketingPageDefinition>;

export const comparePages = {
  'github-codespaces': makeCompare(
    'github-codespaces',
    'GitHub Codespaces',
    '/assets/compare/github-codespaces.svg',
    'Repository-native cloud workspaces',
    ['AI product generation', 'Preview-first delivery', 'Enterprise release flow'],
  ),
  glitch: makeCompare('glitch', 'Glitch', '/assets/compare/glitch.svg', 'Creative app prototyping', [
    'Production runtime controls',
    'Team governance',
    'Deployment guardrails',
  ]),
  heroku: makeCompare('heroku', 'Heroku', '/assets/compare/heroku.svg', 'Application hosting', [
    'IDE plus hosting flow',
    'AI agent workflow',
    'Code-to-preview loop',
  ]),
  codesandbox: makeCompare('codesandbox', 'CodeSandbox', '/assets/compare/codesandbox.svg', 'Browser sandboxes', [
    'Persistent enterprise projects',
    'Agent-aware validation',
    'Mobile-ready workflows',
  ]),
  'aws-cloud9': makeCompare('aws-cloud9', 'AWS Cloud9', '/assets/compare/aws-cloud9.svg', 'Cloud IDE infrastructure', [
    'Modern AI builder',
    'Release visibility',
    'Team-ready UX',
  ]),
} as const satisfies Record<string, MarketingPageDefinition & { logoSrc: string; competitor: string }>;

export const marketingCampaignPages = {
  bounties: makeCampaign(
    'bounties',
    'Bounties',
    'Activate an on-demand developer network to accelerate implementation, bug fixing and project completion.',
    ['Scoped tasks', 'Review loops', 'Delivery tracking', 'Quality gates'],
  ),
  deployments: makeCampaign(
    'deployments',
    'Deployments',
    'Move from prompt to preview to release with logs, domains, runtime health and production guardrails.',
    ['Preview URLs', 'Runtime logs', 'Custom domains', 'Release checks'],
  ),
  teams: makeCampaign(
    'teams',
    'Teams',
    'Coordinate enterprise development with members, roles, audit trails, shared billing and governed project access.',
    ['Members and roles', 'Audit logs', 'Shared billing', 'Project governance'],
  ),
} as const satisfies Record<string, MarketingPageDefinition>;

export const newsletterPages = {
  index: {
    slug: 'newsletter',
    title: 'E-Code Newsletter',
    eyebrow: 'Newsletter',
    description:
      'Product updates, engineering notes, template drops and security announcements for teams building with E-Code.',
    kind: 'resource',
    icon: Newspaper,
    primaryAction: ['Confirm preferences', '/newsletter/confirm'],
    secondaryAction: ['Read changelog', '/changelog'],
    highlights: ['Product updates', 'Engineering notes', 'Template drops', 'Security notices'],
    sections: [
      {
        title: 'What ships in the newsletter',
        body: 'Newsletter content focuses on useful release notes, practical workflow guidance and production AI development patterns.',
        items: ['Feature releases', 'Template launches', 'Security notes', 'Operational guidance'],
      },
      {
        title: 'Preference controls',
        body: 'People can confirm preferences, unsubscribe from marketing mail and still receive required transactional security notices.',
        items: ['Confirm subscription', 'Manage preferences', 'Unsubscribe', 'Account security notices'],
      },
    ],
  },
  confirmed: {
    slug: 'confirmed',
    title: 'Newsletter confirmed',
    eyebrow: 'Newsletter',
    description:
      'Your E-Code newsletter subscription is confirmed. Product updates and technical notes will arrive soon.',
    kind: 'resource',
    icon: CheckCircle2,
    primaryAction: ['Read changelog', '/changelog'],
    secondaryAction: ['Start building', '/signup'],
    highlights: ['Product updates', 'Engineering notes', 'Release highlights', 'Template drops'],
    sections: [
      {
        title: 'What to expect',
        body: 'Short, useful updates about the E-Code platform and production AI development workflows.',
        items: ['New features', 'Security updates', 'Workflow guides', 'Customer patterns'],
      },
    ],
  },
  confirm: {
    slug: 'confirm',
    title: 'Confirm newsletter subscription',
    eyebrow: 'Newsletter',
    description: 'Confirm your email preferences to receive E-Code product and engineering updates.',
    kind: 'resource',
    icon: CheckCircle2,
    primaryAction: ['Confirm preferences', '/newsletter-confirmed'],
    secondaryAction: ['Back to home', '/'],
    highlights: ['Product news', 'Technical guides', 'Release notes', 'No noise'],
    sections: [
      {
        title: 'Email preferences',
        body: 'Use this page to confirm that E-Code can send product updates to your inbox.',
        items: ['Changelog', 'Templates', 'Security notes', 'Platform guides'],
      },
    ],
  },
  unsubscribe: {
    slug: 'unsubscribe',
    title: 'Email preferences',
    eyebrow: 'Newsletter',
    description: 'Manage or unsubscribe from E-Code newsletter and product update emails.',
    kind: 'resource',
    icon: FileText,
    primaryAction: ['Keep product updates', '/newsletter-confirmed'],
    secondaryAction: ['Back to home', '/'],
    highlights: ['Newsletter', 'Product updates', 'Security notices', 'Preferences'],
    sections: [
      {
        title: 'Preference management',
        body: 'Transactional and security emails may still be sent when required for account operation.',
        items: ['Newsletter settings', 'Product updates', 'Security notices', 'Account emails'],
      },
    ],
  },
} as const satisfies Record<string, MarketingPageDefinition>;

export function makeMarketingMeta(page: MarketingPageDefinition): MetaFunction {
  return () => [
    { title: `${page.title} - E-Code` },
    { name: 'description', content: page.description },
    ...socialMetaTags({ title: `${page.title} - E-Code`, description: page.description }),
  ];
}

export function MarketingStaticPage({ page }: { page: MarketingPageDefinition }) {
  return (
    <PublicShell>
      <main className="bg-[var(--ecode-background)] text-[var(--ecode-text)]" data-ecode-marketing-page={page.slug}>
        <MarketingPageContent page={page} />
      </main>
    </PublicShell>
  );
}

export function MarketingDynamicPage({
  pages,
  fallbackTitle,
}: {
  pages: Record<string, MarketingPageDefinition>;
  fallbackTitle: string;
}) {
  const params = useParams();
  const slug = params.slug ?? '';
  const page = pages[slug];

  if (!page) {
    throw new Response(`${fallbackTitle} page not found`, { status: 404 });
  }

  return <MarketingStaticPage page={page} />;
}

export function MarketingIndexPage({
  title,
  description,
  pages,
}: {
  title: string;
  description: string;
  pages: Record<string, MarketingPageDefinition>;
}) {
  return (
    <PublicShell>
      <main className="bg-[var(--ecode-background)] text-[var(--ecode-text)]" data-ecode-marketing-page="index">
        <section className="relative overflow-hidden border-b border-[var(--ecode-border)]">
          <div className="absolute inset-0 marketing-gradient opacity-70" aria-hidden />
          <div className="absolute inset-0 marketing-grid opacity-40" aria-hidden />
          <div className="container-responsive relative py-20 sm:py-28">
            <div className="max-w-4xl">
              <span className="inline-flex items-center rounded-full border border-[var(--ecode-border)] bg-[var(--ecode-surface)] px-4 py-2 text-[13px] font-semibold uppercase tracking-[0.24em] text-[var(--ecode-accent)]">
                E-Code
              </span>
              <h1 className="mkt-h1 mt-8 max-w-4xl text-[var(--ecode-text)]">{title}</h1>
              <p className="mkt-lead mt-6 max-w-3xl text-[var(--ecode-text-secondary)]">{description}</p>
            </div>
          </div>
        </section>

        <section className="container-responsive py-16 sm:py-24">
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {Object.values(pages).map((page) => {
              const Icon = page.icon;

              return (
                <Link
                  key={page.slug}
                  to={routeForPage(page)}
                  className="group flex min-h-[15rem] flex-col rounded-lg border border-[var(--ecode-border)] bg-[var(--ecode-surface)] p-6 text-[var(--ecode-text)] no-underline transition hover:-translate-y-1 hover:border-[var(--ecode-accent)] hover:shadow-xl"
                >
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--ecode-surface-secondary)] text-[var(--ecode-accent)]">
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <strong className="mt-5 text-xl font-bold tracking-tight">{page.title}</strong>
                  <small className="mt-3 text-[14px] leading-6 text-[var(--ecode-text-secondary)]">
                    {page.description}
                  </small>
                  <span className="mt-auto inline-flex items-center pt-7 text-[13px] font-semibold text-[var(--ecode-accent)]">
                    View page
                    <ArrowRight className="ml-2 h-4 w-4 transition group-hover:translate-x-1" aria-hidden />
                  </span>
                </Link>
              );
            })}
          </div>
        </section>

        <section className="border-t border-[var(--ecode-border)]" aria-label={`${title} call to action`}>
          <div className="relative overflow-hidden">
            <div className="absolute inset-0 marketing-gradient opacity-70" aria-hidden />
            <div className="container-responsive relative flex flex-col items-start gap-6 py-16 sm:py-20 lg:flex-row lg:items-center lg:justify-between">
              <div className="max-w-2xl">
                <h2 className="text-3xl font-bold leading-tight tracking-tight text-[var(--ecode-text)] sm:text-4xl">
                  Start building with E-Code
                </h2>
                <p className="mt-4 text-[15px] leading-7 text-[var(--ecode-text-secondary)] sm:text-base">
                  Turn a prompt into a typed, reviewable project with a running preview and a governed path to
                  production.
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <EcodeMarketingActionLink to="/signup">Start building</EcodeMarketingActionLink>
                <EcodeMarketingActionLink to="/contact-sales" variant="secondary">
                  Contact sales
                </EcodeMarketingActionLink>
              </div>
            </div>
          </div>
        </section>
      </main>
    </PublicShell>
  );
}

function MarketingPageContent({ page }: { page: MarketingPageDefinition }) {
  const Icon = page.icon;

  const compare =
    'logoSrc' in page ? (page as MarketingPageDefinition & { logoSrc: string; competitor: string }) : null;

  const figure = productFigures[page.slug];

  return (
    <>
      <section className="relative overflow-hidden border-b border-[var(--ecode-border)]">
        <div className="absolute inset-0 marketing-gradient opacity-70" aria-hidden />
        <div className="absolute inset-0 marketing-grid opacity-40" aria-hidden />
        <div className="container-responsive relative py-20 sm:py-28">
          <div className="max-w-4xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-[var(--ecode-border)] bg-[var(--ecode-surface)] px-4 py-2 text-[13px] font-semibold uppercase tracking-[0.24em] text-[var(--ecode-accent)]">
              <Icon className="h-4 w-4" aria-hidden />
              {page.eyebrow}
            </span>
            <h1 className="mkt-h1 mt-8 max-w-4xl text-[var(--ecode-text)]">{page.title}</h1>
            <p className="mkt-lead mt-6 max-w-3xl text-[var(--ecode-text-secondary)]">{page.description}</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              {page.primaryAction ? (
                <EcodeMarketingActionLink to={page.primaryAction[1]}>{page.primaryAction[0]}</EcodeMarketingActionLink>
              ) : null}
              {page.secondaryAction ? (
                <EcodeMarketingActionLink to={page.secondaryAction[1]} variant="secondary">
                  {page.secondaryAction[0]}
                </EcodeMarketingActionLink>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <section className="container-responsive py-16 sm:py-24" aria-label={`${page.title} highlights`}>
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

      {compare ? (
        <section className="container-responsive pb-6" aria-label={`E-Code compared with ${compare.competitor}`}>
          <div className="grid gap-5 rounded-lg border border-[var(--ecode-border)] bg-[var(--ecode-surface)] p-6 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
            <img
              src={compare.logoSrc}
              alt={`${compare.competitor} logo`}
              className="h-16 w-16 object-contain"
              loading="lazy"
              decoding="async"
            />
            <div>
              <span className="text-[12px] font-semibold uppercase tracking-[0.22em] text-[var(--ecode-text-muted)]">
                Compared with {compare.competitor}
              </span>
              <strong className="mt-2 block text-xl font-bold leading-8 text-[var(--ecode-text)]">
                E-Code combines the IDE, AI agent, runtime previews and enterprise release controls.
              </strong>
            </div>
          </div>
        </section>
      ) : null}

      {figure ? (
        <section className="container-responsive pb-16 sm:pb-24" aria-label={`${page.title} product preview`}>
          <figure className="overflow-hidden rounded-xl border border-[var(--ecode-border)] bg-[var(--ecode-surface)] shadow-2xl">
            <div className="flex items-center gap-2 border-b border-[var(--ecode-border)] bg-[var(--ecode-surface-secondary)] px-4 py-3">
              <span className="h-3 w-3 rounded-full bg-[var(--ecode-accent)]" aria-hidden />
              <span className="h-3 w-3 rounded-full bg-[var(--ecode-border)]" aria-hidden />
              <span className="h-3 w-3 rounded-full bg-[var(--ecode-border)]" aria-hidden />
            </div>
            <img
              src={figure.src}
              alt={figure.alt}
              className="block h-auto w-full object-cover"
              loading="lazy"
              decoding="async"
            />
            <figcaption className="border-t border-[var(--ecode-border)] px-5 py-4 text-[13px] leading-6 text-[var(--ecode-text-secondary)]">
              {figure.caption}
            </figcaption>
          </figure>
        </section>
      ) : null}

      <section className="container-responsive grid gap-5 pb-20 sm:pb-28 lg:grid-cols-2">
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

      <section className="border-t border-[var(--ecode-border)]" aria-label={`${page.title} call to action`}>
        <div className="relative overflow-hidden">
          <div className="absolute inset-0 marketing-gradient opacity-70" aria-hidden />
          <div className="container-responsive relative flex flex-col items-start gap-6 py-16 sm:py-20 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <h2 className="text-3xl font-bold leading-tight tracking-tight text-[var(--ecode-text)] sm:text-4xl">
                Build, run and ship with E-Code
              </h2>
              <p className="mt-4 text-[15px] leading-7 text-[var(--ecode-text-secondary)] sm:text-base">
                Generate real, reviewable code, run it on production runtimes and deploy through governed release flows
                from one workspace.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <EcodeMarketingActionLink to={page.primaryAction?.[1] ?? '/signup'}>
                {page.primaryAction?.[0] ?? 'Start building'}
              </EcodeMarketingActionLink>
              <EcodeMarketingActionLink to={page.secondaryAction?.[1] ?? '/contact-sales'} variant="secondary">
                {page.secondaryAction?.[0] ?? 'Contact sales'}
              </EcodeMarketingActionLink>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

function EcodeMarketingActionLink({
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

function routeForPage(page: MarketingPageDefinition) {
  if (page.kind === 'solution') {
    return `/solutions/${page.slug}`;
  }

  if (page.kind === 'compare') {
    return `/compare/${page.slug}`;
  }

  return `/${page.slug}`;
}

function makeSolution(
  slug: string,
  title: string,
  description: string,
  highlights: readonly string[],
): MarketingPageDefinition {
  return {
    slug,
    title,
    eyebrow: 'Solutions',
    description,
    kind: 'solution',
    icon: PlayCircle,
    primaryAction: ['Start building', '/signup'],
    secondaryAction: ['Contact sales', '/contact-sales'],
    highlights,
    sections: [
      {
        title: 'What you can build',
        body: `${title} gives teams a faster path from idea to a typed, reviewable project with a running preview.`,
        items: highlights,
      },
      {
        title: 'Production workflow',
        body: 'Every generated project should be inspectable, testable and ready for deployment planning.',
        items: ['Prompt to project', 'Code review', 'Runtime preview', 'Deployment path'],
      },
    ],
  };
}

function makeCompare(
  slug: string,
  competitor: string,
  logoSrc: string,
  competitorPositioning: string,
  ecodeAdvantages: readonly string[],
): MarketingPageDefinition & { logoSrc: string; competitor: string } {
  return {
    slug,
    title: `E-Code vs ${competitor}`,
    eyebrow: 'Compare',
    description: `${competitorPositioning} compared with E-Code's AI-powered IDE, governed runtimes, previews and enterprise delivery workflow.`,
    kind: 'compare',
    icon: Scale,
    logoSrc,
    competitor,
    primaryAction: ['Try E-Code', '/signup'],
    secondaryAction: ['Compare all', '/compare'],
    highlights: ecodeAdvantages,
    sections: [
      {
        title: 'Where E-Code is different',
        body: 'E-Code is designed for the full loop: prompt, edit, run, validate, preview and deploy with team controls.',
        items: ecodeAdvantages,
      },
      {
        title: 'Best fit',
        body: 'Choose E-Code when the team needs production intent, governance and AI assistance in the same workspace.',
        items: ['Enterprise teams', 'AI product builds', 'Internal platforms', 'Mobile-ready development'],
      },
    ],
  };
}

function makeCampaign(
  slug: string,
  title: string,
  description: string,
  highlights: readonly string[],
): MarketingPageDefinition {
  return {
    slug,
    title,
    eyebrow: 'Marketing',
    description,
    kind: 'standard',
    icon: Sparkles,
    primaryAction: ['Start building', '/signup'],
    secondaryAction: ['Contact sales', '/contact-sales'],
    highlights,
    sections: [
      {
        title: `${title} workflow`,
        body: description,
        items: highlights,
      },
      {
        title: 'Governed delivery',
        body: 'The same E-Code controls apply across generation, collaboration, preview and release workflows.',
        items: ['Team access', 'Audit visibility', 'Runtime feedback', 'Release checks'],
      },
    ],
  };
}
