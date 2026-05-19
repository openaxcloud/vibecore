import type { MetaFunction } from '@remix-run/cloudflare';
import { Link, useParams } from '@remix-run/react';
import {
  ArrowRight,
  BookOpen,
  BriefcaseBusiness,
  Building2,
  CheckCircle2,
  Code2,
  FileText,
  Globe2,
  Handshake,
  HeartHandshake,
  Layers,
  Megaphone,
  MonitorSmartphone,
  Newspaper,
  PlayCircle,
  Scale,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { LinkButton, PublicShell } from '~/components/dashboard/SaaSLayout';

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

const productProof = ['AI-native builder', 'Preserved Bolt IDE', 'Real runtimes', 'Enterprise governance'] as const;

export const marketingPages = {
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
          'Shipping governed AI agents without losing review loops',
          'Why previews are a release gate, not a demo artifact',
          'Designing a mobile IDE for real production work',
          'Keeping enterprise controls visible in daily coding flows',
        ],
      },
      {
        title: 'Editorial tracks',
        body: 'Content is organized around shipping software safely, faster and with clearer operational feedback.',
        items: ['Build systems', 'Collaboration', 'Security', 'Deployment infrastructure'],
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
    secondaryAction: ['View integrations', '/#partners'],
    highlights: ['OpenAI', 'GitHub', 'Docker', 'Vercel', 'Cloudflare', 'Stripe'],
    sections: [
      {
        title: 'Technology partners',
        body: 'The imported E-Code partner system is now part of Vibecore marketing and footer navigation.',
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
        body: 'The DPA describes processing responsibilities, security commitments and support for compliance workflows.',
        items: ['Controller and processor roles', 'Processing instructions', 'Confidentiality', 'Deletion assistance'],
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
        body: 'Subprocessors are used to operate core application hosting, analytics, support and secure AI workflows.',
        items: ['Hosting', 'Data storage', 'AI inference', 'Support tooling'],
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
  return () => [{ title: `${page.title} - E-Code` }, { name: 'description', content: page.description }];
}

export function MarketingStaticPage({ page }: { page: MarketingPageDefinition }) {
  return (
    <PublicShell>
      <MarketingPageContent page={page} />
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
      <section className="vc-marketing-page">
        <div className="vc-marketing-page-hero">
          <span className="vc-badge">E-Code</span>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        <div className="vc-marketing-card-grid">
          {Object.values(pages).map((page) => {
            const Icon = page.icon;
            return (
              <Link key={page.slug} to={routeForPage(page)} className="vc-marketing-card">
                <span className="vc-marketing-card-icon">
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <strong>{page.title}</strong>
                <small>{page.description}</small>
                <span className="vc-marketing-card-link">
                  View page
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </span>
              </Link>
            );
          })}
        </div>
      </section>
    </PublicShell>
  );
}

function MarketingPageContent({ page }: { page: MarketingPageDefinition }) {
  const Icon = page.icon;

  const compare =
    'logoSrc' in page ? (page as MarketingPageDefinition & { logoSrc: string; competitor: string }) : null;

  return (
    <article className="vc-marketing-page" data-marketing-kind={page.kind}>
      <section className="vc-marketing-page-hero">
        <span className="vc-badge">
          <Icon className="h-3 w-3" aria-hidden />
          {page.eyebrow}
        </span>
        <h1>{page.title}</h1>
        <p>{page.description}</p>
        <div className="vc-marketing-page-actions">
          {page.primaryAction ? <LinkButton to={page.primaryAction[1]}>{page.primaryAction[0]}</LinkButton> : null}
          {page.secondaryAction ? (
            <LinkButton to={page.secondaryAction[1]} variant="outline">
              {page.secondaryAction[0]}
            </LinkButton>
          ) : null}
        </div>
      </section>

      <section className="vc-marketing-proof" aria-label={`${page.title} highlights`}>
        {page.highlights.map((highlight) => (
          <div key={highlight}>
            <CheckCircle2 className="h-4 w-4" aria-hidden />
            <span>{highlight}</span>
          </div>
        ))}
      </section>

      {compare ? (
        <section className="vc-marketing-compare-hero" aria-label={`E-Code compared with ${compare.competitor}`}>
          <img src={compare.logoSrc} alt={`${compare.competitor} logo`} loading="lazy" decoding="async" />
          <div>
            <span>Compared with {compare.competitor}</span>
            <strong>E-Code combines the IDE, AI agent, runtime previews and enterprise release controls.</strong>
          </div>
        </section>
      ) : null}

      <section className="vc-marketing-section-grid">
        {page.sections.map((section) => (
          <div key={section.title} className="vc-marketing-section-card">
            <h2>{section.title}</h2>
            <p>{section.body}</p>
            <ul>
              {section.items.map((item) => (
                <li key={item}>
                  <ArrowRight className="h-4 w-4" aria-hidden />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    </article>
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
