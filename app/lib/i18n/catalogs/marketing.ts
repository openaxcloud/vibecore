export type MarketingLanguage = 'en' | 'fr';

export interface MarketingPageCopy {
  title: string;
  eyebrow: string;
  description: string;
  primaryActionLabel?: string;
  secondaryActionLabel?: string;
  highlights: readonly string[];
  sections: readonly { title: string; body: string; items: readonly string[] }[];
}

export const marketingPageCopyEn = {
  product: {
    title: 'E-Code Product',
    eyebrow: 'Product tour',
    description:
      'The imported E-Code product tour covering the editor, AI generation, agent supervision, Cloud Run deployment, mobile workflows and collaboration.',
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
    primaryActionLabel: 'Explore features',
    secondaryActionLabel: 'View pricing',
  },
  features: {
    title: 'E-Code Features',
    eyebrow: 'Product',
    description:
      'The full E-Code product surface: AI agent, browser IDE, multiplayer collaboration, real runtimes, previews, deployments and enterprise governance.',
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
    primaryActionLabel: 'Start building',
    secondaryActionLabel: 'Compare platforms',
  },
  about: {
    title: 'About E-Code',
    eyebrow: 'Company',
    description:
      'E-Code is the AI-powered enterprise development platform for teams that need to generate, review, run and deploy real software from one governed workspace.',
    highlights: ['AI software delivery', 'Enterprise controls', 'Mobile and desktop workflows', 'Production previews'],
    sections: [
      {
        title: 'Mission',
        body: 'Help teams move from product intent to production software without replacing engineering rigor.',
        items: ['AI-native builder', 'E-Code IDE', 'Real runtimes', 'Enterprise governance'],
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
    primaryActionLabel: 'Start building',
    secondaryActionLabel: 'Contact sales',
  },
  careers: {
    title: 'Careers',
    eyebrow: 'Company',
    description:
      'Join the distributed team building an AI coding platform with real runtime infrastructure, enterprise security and a mobile-ready IDE.',
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
    primaryActionLabel: 'Contact the team',
    secondaryActionLabel: 'Read about E-Code',
  },
  blog: {
    title: 'E-Code Blog',
    eyebrow: 'Resources',
    description:
      'Engineering notes, product updates and field reports on AI-assisted software delivery at enterprise scale.',
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
    primaryActionLabel: 'Read changelog',
    secondaryActionLabel: 'Browse docs',
  },
  docs: {
    title: 'Documentation',
    eyebrow: 'Resources',
    description:
      'Practical E-Code documentation for creating projects, using the AI agent, running previews, deploying apps and operating teams safely.',
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
    primaryActionLabel: 'Start building',
    secondaryActionLabel: 'Read AI docs',
  },
  contact: {
    title: 'Contact E-Code',
    eyebrow: 'Company',
    description:
      'Reach the E-Code team for platform questions, partnerships, media requests and implementation planning.',
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
    primaryActionLabel: 'Contact sales',
    secondaryActionLabel: 'Open support',
  },
  partners: {
    title: 'Partners',
    eyebrow: 'Ecosystem',
    description:
      'E-Code integrates with the cloud, AI, source control, data and payment platforms teams already trust.',
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
    primaryActionLabel: 'Become a partner',
    secondaryActionLabel: 'View integrations',
  },
  press: {
    title: 'Press',
    eyebrow: 'Company',
    description:
      'Brand resources, company positioning and announcement material for E-Code.AI and the enterprise development platform.',
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
    primaryActionLabel: 'Contact press',
    secondaryActionLabel: 'About E-Code',
  },
  accessibility: {
    title: 'Accessibility',
    eyebrow: 'Company',
    description:
      'E-Code is built so core development, review and deployment workflows remain usable across keyboard, screen size and theme preferences.',
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
    primaryActionLabel: 'Report an issue',
    secondaryActionLabel: 'View acceptable use',
  },
  mobile: {
    title: 'Mobile IDE',
    eyebrow: 'Product',
    description: 'Build, review, run previews and collaborate from phone or tablet with E-Code mobile-ready workflows.',
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
    primaryActionLabel: 'Start building',
    secondaryActionLabel: 'See templates',
  },
  desktop: {
    title: 'Desktop App',
    eyebrow: 'Product',
    description:
      'Use E-Code as a focused desktop development environment with synced projects, previews and secure runtime access.',
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
    primaryActionLabel: 'Start building',
    secondaryActionLabel: 'Read docs',
  },
  languages: {
    title: 'Languages',
    eyebrow: 'Resources',
    description:
      'Start from production templates across TypeScript, React, Remix, Node.js, Python, Go, Rust and database-backed apps.',
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
    primaryActionLabel: 'Browse templates',
    secondaryActionLabel: 'Read docs',
  },
  tutorials: {
    title: 'Tutorials',
    eyebrow: 'Resources',
    description:
      'Step-by-step guides for building apps with E-Code prompts, templates, previews, deployments and team workflows.',
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
    primaryActionLabel: 'Open docs',
    secondaryActionLabel: 'Browse templates',
  },
  'case-studies': {
    title: 'Case Studies',
    eyebrow: 'Resources',
    description:
      'Patterns from teams using E-Code to accelerate internal platforms, customer apps and AI-assisted delivery.',
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
    primaryActionLabel: 'Contact sales',
    secondaryActionLabel: 'View partners',
  },
  customers: {
    title: 'Customers and showcase',
    eyebrow: 'Customers',
    description:
      'The imported E-Code customer showcase for internal tools, AI products and education teams building with Cloud Run deployment and validated templates.',
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
    primaryActionLabel: 'Read case studies',
    secondaryActionLabel: 'Contact sales',
  },
  'help-center': {
    title: 'Help Center',
    eyebrow: 'Support',
    description:
      'Guidance for account setup, project creation, previews, runtime issues, billing, teams and deployment questions.',
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
    primaryActionLabel: 'Open support',
    secondaryActionLabel: 'Read docs',
  },
  forum: {
    title: 'Community Forum',
    eyebrow: 'Community',
    description:
      'Discuss templates, workflows, AI agent behavior and production deployment patterns with other E-Code builders.',
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
    primaryActionLabel: 'Open support',
    secondaryActionLabel: 'Browse templates',
  },
  ai: {
    title: 'AI Platform',
    eyebrow: 'Product',
    description:
      'Govern AI-assisted software delivery with model routing, tool execution, audit context and preview-aware validation.',
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
    primaryActionLabel: 'Try AI builder',
    secondaryActionLabel: 'Read AI docs',
  },
  'ai-documentation': {
    title: 'AI Documentation',
    eyebrow: 'Resources',
    description:
      'A complete guide to E-Code agent capabilities, model selection, tool execution, safety gates and validation workflows.',
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
    primaryActionLabel: 'Open docs',
    secondaryActionLabel: 'Start building',
  },
  mcp: {
    title: 'MCP Integrations',
    eyebrow: 'Product',
    description:
      'Connect E-Code agents to approved tools and context sources through controlled MCP-style integrations.',
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
    primaryActionLabel: 'Read docs',
    secondaryActionLabel: 'Contact sales',
  },
  polyglot: {
    title: 'Polyglot Backends',
    eyebrow: 'Product',
    description:
      'Generate and run backend services across common languages while keeping previews, logs and deployment checks visible.',
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
    primaryActionLabel: 'Browse templates',
    secondaryActionLabel: 'Read docs',
  },
  dpa: {
    title: 'Data Processing Addendum',
    eyebrow: 'Legal',
    description:
      'Contractual data protection terms for organizations evaluating E-Code for regulated or enterprise use.',
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
    primaryActionLabel: 'Contact sales',
    secondaryActionLabel: 'Privacy policy',
  },
  'commercial-agreement': {
    title: 'Commercial Agreement',
    eyebrow: 'Legal',
    description:
      'Commercial terms for teams purchasing E-Code subscriptions, enterprise services and deployment support.',
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
    primaryActionLabel: 'Contact sales',
    secondaryActionLabel: 'Terms',
  },
  'report-abuse': {
    title: 'Report Abuse',
    eyebrow: 'Trust',
    description: 'Report misuse of E-Code projects, public previews, hosted content or platform workflows.',
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
    primaryActionLabel: 'Contact support',
    secondaryActionLabel: 'Acceptable use',
  },
  subprocessors: {
    title: 'Subprocessors',
    eyebrow: 'Legal',
    description: 'Infrastructure, security, AI and operational providers that may support E-Code service delivery.',
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
    primaryActionLabel: 'Contact sales',
    secondaryActionLabel: 'DPA',
  },
  'student-dpa': {
    title: 'US Student DPA',
    eyebrow: 'Legal',
    description: 'Student data protection terms for education programs and institutions evaluating E-Code.',
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
    primaryActionLabel: 'Contact sales',
    secondaryActionLabel: 'Privacy policy',
  },
  marketplace: {
    title: 'Marketplace',
    eyebrow: 'Templates',
    description:
      'Discover E-Code starters, implementation patterns and reusable project foundations for production apps.',
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
    primaryActionLabel: 'Browse templates',
    secondaryActionLabel: 'Explore solutions',
  },
  community: {
    title: 'Community',
    eyebrow: 'Builders',
    description:
      'A public space for E-Code builders to share project patterns, template ideas, workflow notes and launch feedback.',
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
    primaryActionLabel: 'Open forum',
    secondaryActionLabel: 'Browse marketplace',
  },
  explore: {
    title: 'Explore E-Code',
    eyebrow: 'Discovery',
    description:
      'Explore solutions, templates, community examples and platform capabilities before starting a project.',
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
    primaryActionLabel: 'Browse templates',
    secondaryActionLabel: 'View features',
  },
  search: {
    title: 'Search',
    eyebrow: 'Discovery',
    description:
      'Search across E-Code docs, templates, projects, marketplace entries and community knowledge from one public entry point.',
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
    primaryActionLabel: 'Search templates',
    secondaryActionLabel: 'Open docs',
  },
  demo: {
    title: 'Platform Demo',
    eyebrow: 'Demo',
    description:
      'See how E-Code connects prompt, files, preview, terminal feedback, deployment controls and team review in one workflow.',
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
    primaryActionLabel: 'Start building',
    secondaryActionLabel: 'View features',
  },
  'theme-validation': {
    title: 'Theme Validation',
    eyebrow: 'Design system',
    description:
      'Validate E-Code dark mode, light mode, brand colors, focus states and responsive marketing shell behavior.',
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
    primaryActionLabel: 'Open accessibility',
    secondaryActionLabel: 'View features',
  },
  'runtime-test': {
    title: 'Runtime Test',
    eyebrow: 'Diagnostics',
    description: 'A public compatibility page for E-Code runtime readiness, preview health and deployment diagnostics.',
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
    primaryActionLabel: 'View status',
    secondaryActionLabel: 'Read docs',
  },

  /*
   * Solution page /enterprise. The EN copy MUST mirror makeSolution('enterprise', …)
   * in EcodeMarketingPages so switching to English renders identically; the FR
   * copy below is what localizeMarketingPage() applies for the French audit.
   */
  enterprise: {
    title: 'Enterprise',
    eyebrow: 'Solutions',
    description: 'Roll out E-Code with SSO, SCIM, audit logs, security controls, private runtime planning and support.',
    highlights: ['SSO and SCIM', 'Audit export', 'Private rollout', 'Premium support'],
    sections: [
      {
        title: 'What you can build',
        body: 'Enterprise gives teams a faster path from idea to a typed, reviewable project with a running preview.',
        items: ['SSO and SCIM', 'Audit export', 'Private rollout', 'Premium support'],
      },
      {
        title: 'Production workflow',
        body: 'Every generated project should be inspectable, testable and ready for deployment planning.',
        items: ['Prompt to project', 'Code review', 'Runtime preview', 'Deployment path'],
      },
    ],
    primaryActionLabel: 'Start building',
    secondaryActionLabel: 'Contact sales',
  },
} as const satisfies Record<string, MarketingPageCopy>;

export const marketingFigureCopy = {
  en: {
    product: {
      alt: 'E-Code browser IDE with file tree, editor, terminal and live preview',
      caption: 'The E-Code workspace: editor, terminal, preview and agent in one view.',
    },
    features: {
      alt: 'E-Code browser IDE showing the integrated development workspace',
      caption: 'File tree, editor, terminal output and preview stay visible together.',
    },
    demo: {
      alt: 'E-Code IDE during a prompt-to-app build session',
      caption: 'From prompt to running app inside one browser workspace.',
    },
    ai: {
      alt: 'E-Code AI agent working inside the development environment',
      caption: 'Agents reason over real files, terminal output and previews.',
    },
    desktop: {
      alt: 'E-Code desktop workspace with persistent project context',
      caption: 'A focused desktop workspace with readable panels and preview state.',
    },
    mobile: {
      alt: 'E-Code mobile interface for building and reviewing on a phone',
      caption: 'Prompt, files, preview and release context on smaller viewports.',
    },
    deployments: {
      alt: 'E-Code deployment panel with release status and runtime logs',
      caption: 'Deploy with logs, domains, runtime health and release checks.',
    },
    'dashboard-builder': {
      alt: 'E-Code dashboard view with charts and operational telemetry',
      caption: 'Data-rich dashboards with auth, charts, filters and team access.',
    },
    'app-builder': {
      alt: 'E-Code workspace building a full-stack app from a prompt',
      caption: 'Prompt to full-stack app: editor, terminal, preview and agent together.',
    },
    'website-builder': {
      alt: 'E-Code workspace building a marketing website with live preview',
      caption: 'Design, edit and preview a polished site without local setup.',
    },
    'game-builder': {
      alt: 'E-Code workspace building an interactive game with live preview',
      caption: 'Build and play-test interactive experiences in one workspace.',
    },
    'chatbot-builder': {
      alt: 'E-Code workspace wiring an AI chatbot with the agent panel',
      caption: 'Compose, test and ship conversational assistants end to end.',
    },
    'internal-ai-builder': {
      alt: 'E-Code workspace with version control for internal AI tools',
      caption: 'Private AI tools with real version control and team review.',
    },
    enterprise: {
      alt: 'E-Code enterprise deployment panel with release controls and logs',
      caption: 'SSO, audit logs and governed deploys with runtime health checks.',
    },
    startups: {
      alt: 'E-Code workspace shipping a startup MVP from a prompt',
      caption: 'Ship your MVP fast: build, preview and deploy in one place.',
    },
    freelancers: {
      alt: 'E-Code workspace with version control for client project delivery',
      caption: 'Deliver client work faster with built-in version control.',
    },
  },
  fr: {
    product: {
      alt: 'IDE E-Code dans le navigateur avec arborescence, éditeur, terminal et aperçu en direct',
      caption: 'L’espace de travail E-Code : éditeur, terminal, aperçu et agent dans une même vue.',
    },
    features: {
      alt: 'IDE E-Code dans le navigateur affichant l’espace de développement intégré',
      caption: 'L’arborescence, l’éditeur, la sortie du terminal et l’aperçu restent visibles ensemble.',
    },
    demo: {
      alt: 'IDE E-Code pendant la création d’une application à partir d’un prompt',
      caption: 'Du prompt à l’application en cours d’exécution dans un même espace de travail du navigateur.',
    },
    ai: {
      alt: 'Agent IA E-Code à l’œuvre dans l’environnement de développement',
      caption: 'Les agents raisonnent sur de vrais fichiers, les sorties du terminal et les aperçus.',
    },
    desktop: {
      alt: 'Espace de travail desktop E-Code avec contexte de projet persistant',
      caption: 'Un espace de travail desktop dédié, avec des panneaux lisibles et l’état de l’aperçu.',
    },
    mobile: {
      alt: 'Interface mobile E-Code pour créer et effectuer des revues depuis un téléphone',
      caption: 'Prompt, fichiers, aperçu et contexte de mise en production sur les écrans plus petits.',
    },
    deployments: {
      alt: 'Panneau de déploiement E-Code avec statut de mise en production et journaux d’exécution',
      caption:
        'Déployez avec les journaux, les domaines, l’état de l’environnement d’exécution et les contrôles de mise en production.',
    },
    'dashboard-builder': {
      alt: 'Tableau de bord E-Code avec graphiques et télémétrie opérationnelle',
      caption: 'Des tableaux de bord riches en données avec authentification, graphiques, filtres et accès d’équipe.',
    },
    'app-builder': {
      alt: 'Espace de travail E-Code créant une application complète à partir d’un prompt',
      caption: 'Du prompt à l’application complète : éditeur, terminal, aperçu et agent réunis.',
    },
    'website-builder': {
      alt: 'Espace de travail E-Code créant un site marketing avec aperçu en direct',
      caption: 'Concevez, modifiez et prévisualisez un site soigné sans configuration locale.',
    },
    'game-builder': {
      alt: 'Espace de travail E-Code créant un jeu interactif avec aperçu en direct',
      caption: 'Créez et testez des expériences interactives dans un même espace de travail.',
    },
    'chatbot-builder': {
      alt: 'Espace de travail E-Code configurant un chatbot IA avec le panneau de l’agent',
      caption: 'Concevez, testez et livrez des assistants conversationnels de bout en bout.',
    },
    'internal-ai-builder': {
      alt: 'Espace de travail E-Code avec gestion de versions pour les outils d’IA internes',
      caption: 'Des outils d’IA privés avec une véritable gestion de versions et une revue d’équipe.',
    },
    enterprise: {
      alt: 'Panneau de déploiement Enterprise E-Code avec contrôles de mise en production et journaux',
      caption:
        'SSO, journaux d’audit et déploiements gouvernés avec contrôles de santé de l’environnement d’exécution.',
    },
    startups: {
      alt: 'Espace de travail E-Code livrant le MVP d’une startup à partir d’un prompt',
      caption: 'Livrez rapidement votre MVP : créez, prévisualisez et déployez au même endroit.',
    },
    freelancers: {
      alt: 'Espace de travail E-Code avec gestion de versions pour la livraison de projets client',
      caption: 'Livrez plus vite les projets client grâce à la gestion de versions intégrée.',
    },
  },
} as const;

export const marketingUiCopy = {
  en: {
    viewPage: 'View page',
    startBuilding: 'Start building',
    contactSales: 'Contact sales',
    indexCtaTitle: 'Start building with E-Code',
    indexCtaBody:
      'Turn a prompt into a typed, reviewable project with a running preview and a governed path to production.',
    pageCtaTitle: 'Build, run and ship with E-Code',
    pageCtaBody:
      'Generate real, reviewable code, run it on production runtimes and deploy through governed release flows from one workspace.',
    comparePitch: 'E-Code combines the IDE, AI agent, runtime previews and enterprise release controls.',
    pageNotFound: (section: string) => `${section} page not found`,
    pageHighlightsLabel: (title: string) => `${title} highlights`,
    pageCtaLabel: (title: string) => `${title} call to action`,
    comparedWithLabel: (competitor: string) => `Compared with ${competitor}`,
    compareLabel: (competitor: string) => `E-Code compared with ${competitor}`,
    competitorLogoAlt: (competitor: string) => `${competitor} logo`,
    productPreviewLabel: (title: string) => `${title} product preview`,
  },
  fr: {
    viewPage: 'Voir la page',
    startBuilding: 'Commencer à créer',
    contactSales: 'Contacter l’équipe commerciale',
    indexCtaTitle: 'Commencez à créer avec E-Code',
    indexCtaBody:
      'Transformez un prompt en projet typé et vérifiable, avec un aperçu en cours d’exécution et un parcours gouverné vers la production.',
    pageCtaTitle: 'Créez, exécutez et livrez avec E-Code',
    pageCtaBody:
      'Générez du code réel et vérifiable, exécutez-le dans des environnements de production et déployez-le au moyen de flux de mise en production gouvernés, depuis un même espace de travail.',
    comparePitch:
      'E-Code réunit l’IDE, l’agent IA, les aperçus d’exécution et les contrôles de mise en production de l’entreprise.',
    pageNotFound: (section: string) => `Page ${section} introuvable`,
    pageHighlightsLabel: (title: string) => `Points forts de ${title}`,
    pageCtaLabel: (title: string) => `Commencer avec ${title}`,
    comparedWithLabel: (competitor: string) => `Comparé à ${competitor}`,
    compareLabel: (competitor: string) => `Comparaison entre E-Code et ${competitor}`,
    competitorLogoAlt: (competitor: string) => `Logo ${competitor}`,
    productPreviewLabel: (title: string) => `Aperçu du produit ${title}`,
  },
} as const;

/**
 * Terms whose English and French forms are intentionally identical. This list
 * keeps the residual-language audit explicit: brands, protocols, language names
 * and established product vocabulary must not be "translated" into misleading
 * alternatives.
 */
export const marketingFrIdentityTerms = [
  'Agents',
  'Cloudflare',
  'Collaboration',
  'Docker',
  'Documentation',
  'ESLint',
  'Enterprise',
  'GitHub',
  'Go',
  'Google Cloud',
  'Mission',
  'Mobile',
  'Node.js',
  'Notifications',
  'OpenAI',
  'PostgreSQL',
  'Python',
  'React',
  'Rust',
  'SAML/OIDC',
  'SCIM',
  'Sentry',
  'Solutions',
  'Stripe',
  'Support',
  'Triage',
  'TypeScript',
  'Vercel',
] as const;

export function resolveMarketingLanguage(language?: string | null): MarketingLanguage {
  return language?.toLowerCase().startsWith('fr') ? 'fr' : 'en';
}

/** Keep the localized page title and the invariant E-Code brand in one catalog-owned formatter. */
export function formatMarketingDocumentTitle(pageTitle: string): string {
  return `${pageTitle} - E-Code`;
}

/**
 * Copie FR des CARTES de /solutions.
 *
 * BUG-I18N-001 : en locale FR, 8 des 9 cartes de /solutions s'affichaient en
 * anglais ; seule `enterprise` était traduite. Les cartes viennent de
 * `solutionPages` (EcodeMarketingPages), que `localizeMarketingPage` fait passer
 * par `getMarketingPageCopy` — laquelle ne trouvait rien pour ces 8 slugs et
 * renvoyait donc la définition anglaise telle quelle.
 *
 * Pourquoi un catalogue SÉPARÉ plutôt que 8 entrées dans `marketingPageCopyFr` :
 * ce dernier est `satisfies Record<keyof typeof marketingPageCopyEn, ...>`, donc
 * y ajouter une clé absente de la version anglaise est une erreur de type. Et
 * ajouter ces 8 slugs à `marketingPageCopyEn` obligerait à créer autant
 * d'entrées dans le `marketingPageChrome` d'`EcodeMarketingPages`
 * (`Record<Exclude<keyof typeof marketingPageCopyEn, 'enterprise'>, ...>`) — une
 * cascade hors sujet, pour un texte anglais qui existe déjà dans `solutionPages`.
 *
 * Ce catalogue est donc FR-seulement et consulté en premier quand la locale est
 * `fr` : l'anglais continue de retomber sur `solutionPages`, inchangé.
 *
 * La copie n'est PAS une retraduction : elle est reprise des pages de détail
 * `app/components/marketing/solutions/<slug>.copy.ts`, déjà 100 % FR et en
 * production — `description` vient de `fr.seo.description`, `highlights` des
 * titres de `fr.features.items`. Les titres de carte reprennent la terminologie
 * FR de ces mêmes pages (`fr.hero.eyebrow` : « Générateur de site », « Générateur
 * de jeu »…), `app-builder` gardant son nom tel quel comme le fait déjà la page.
 * Les deux sections reprennent le gabarit de `makeSolution`, dans la forme FR
 * déjà employée par `enterprise`.
 */
export const marketingSolutionCardCopyFr = {
  'app-builder': {
    title: 'App Builder',
    eyebrow: 'Solutions',
    description:
      'Décrivez votre processus, vos utilisateurs, vos données et vos règles. E-Code les transforme en fichiers source modifiables, écrans reliés, aperçu actif, export et publication des builds statiques pris en charge.',
    highlights: [
      'Écrans et routes reliés',
      'Modèles de données inspectables',
      'Secrets de projet protégés',
      'Import, versionnement et export',
    ],
    sections: [
      {
        title: 'Ce que vous pouvez créer',
        body: 'App Builder offre aux équipes un chemin plus rapide de l’idée à un projet typé et vérifiable, avec un aperçu en cours d’exécution.',
        items: [
          'Écrans et routes reliés',
          'Modèles de données inspectables',
          'Secrets de projet protégés',
          'Import, versionnement et export',
        ],
      },
      {
        title: 'Flux de production',
        body: 'Chaque projet généré doit pouvoir être inspecté et testé, et prêt pour la planification du déploiement.',
        items: [
          'Du prompt au projet',
          'Revue du code',
          'Aperçu de l’environnement d’exécution',
          'Parcours de déploiement',
        ],
      },
    ],
    primaryActionLabel: 'Commencer à créer',
    secondaryActionLabel: 'Contacter l’équipe commerciale',
  },
  'website-builder': {
    title: 'Générateur de site',
    eyebrow: 'Solutions',
    description:
      'Décrivez les pages, les sections et le contenu de votre site. E-Code les transforme en un site responsive dans des fichiers source modifiables, avec un aperçu actif, l’export du projet et la publication des builds statiques pris en charge.',
    highlights: [
      'Portfolio et études de cas',
      'Un contenu modifiable',
      'Formulaires et demandes',
      'SEO et métadonnées sociales',
    ],
    sections: [
      {
        title: 'Ce que vous pouvez créer',
        body: 'Générateur de site offre aux équipes un chemin plus rapide de l’idée à un projet typé et vérifiable, avec un aperçu en cours d’exécution.',
        items: [
          'Portfolio et études de cas',
          'Un contenu modifiable',
          'Formulaires et demandes',
          'SEO et métadonnées sociales',
        ],
      },
      {
        title: 'Flux de production',
        body: 'Chaque projet généré doit pouvoir être inspecté et testé, et prêt pour la planification du déploiement.',
        items: [
          'Du prompt au projet',
          'Revue du code',
          'Aperçu de l’environnement d’exécution',
          'Parcours de déploiement',
        ],
      },
    ],
    primaryActionLabel: 'Commencer à créer',
    secondaryActionLabel: 'Contacter l’équipe commerciale',
  },
  'game-builder': {
    title: 'Générateur de jeu',
    eyebrow: 'Solutions',
    description:
      'Décrivez le jeu web que vous voulez tester. E-Code le transforme en boucle de jeu, interface multijoueur et modèle d’état modifiables, avec un aperçu actif, l’export du projet et des points de branchement clairs pour un service temps réel.',
    highlights: [
      'Canvas et boucle de jeu',
      'Multijoueur prêt à connecter',
      'Score et manches',
      'Test en jeu dans l’aperçu',
    ],
    sections: [
      {
        title: 'Ce que vous pouvez créer',
        body: 'Générateur de jeu offre aux équipes un chemin plus rapide de l’idée à un projet typé et vérifiable, avec un aperçu en cours d’exécution.',
        items: [
          'Canvas et boucle de jeu',
          'Multijoueur prêt à connecter',
          'Score et manches',
          'Test en jeu dans l’aperçu',
        ],
      },
      {
        title: 'Flux de production',
        body: 'Chaque projet généré doit pouvoir être inspecté et testé, et prêt pour la planification du déploiement.',
        items: [
          'Du prompt au projet',
          'Revue du code',
          'Aperçu de l’environnement d’exécution',
          'Parcours de déploiement',
        ],
      },
    ],
    primaryActionLabel: 'Commencer à créer',
    secondaryActionLabel: 'Contacter l’équipe commerciale',
  },
  'dashboard-builder': {
    title: 'Générateur de tableau de bord',
    eyebrow: 'Solutions',
    description:
      'Décrivez les indicateurs, tableaux et filtres dont votre équipe a besoin. E-Code les transforme en un tableau de bord riche en données dans des fichiers source modifiables, avec un aperçu actif, l’export du projet et du code que vous étendez pour connecter vos propres données et l’authentification.',
    highlights: [
      'Indicateurs et graphiques',
      'Filtres et segments',
      'Tableaux de pipeline et d’enregistrements',
      'Authentification et rôles',
    ],
    sections: [
      {
        title: 'Ce que vous pouvez créer',
        body: 'Générateur de tableau de bord offre aux équipes un chemin plus rapide de l’idée à un projet typé et vérifiable, avec un aperçu en cours d’exécution.',
        items: [
          'Indicateurs et graphiques',
          'Filtres et segments',
          'Tableaux de pipeline et d’enregistrements',
          'Authentification et rôles',
        ],
      },
      {
        title: 'Flux de production',
        body: 'Chaque projet généré doit pouvoir être inspecté et testé, et prêt pour la planification du déploiement.',
        items: [
          'Du prompt au projet',
          'Revue du code',
          'Aperçu de l’environnement d’exécution',
          'Parcours de déploiement',
        ],
      },
    ],
    primaryActionLabel: 'Commencer à créer',
    secondaryActionLabel: 'Contacter l’équipe commerciale',
  },
  'chatbot-builder': {
    title: 'Générateur de chatbot et d’agent IA',
    eyebrow: 'Solutions',
    description:
      'Décrivez l’assistant de support recherché. E-Code crée un projet d’agent modifiable avec prompts, limites d’outils, adaptateurs de sources et logique de transfert relisibles. Connectez puis testez votre modèle, votre documentation et votre destination de support avant le lancement.',
    highlights: ['Réponses depuis vos docs', 'Prompts relisibles', 'Outils déclarés', 'Mémoire inspectable'],
    sections: [
      {
        title: 'Ce que vous pouvez créer',
        body: 'Générateur de chatbot et d’agent IA offre aux équipes un chemin plus rapide de l’idée à un projet typé et vérifiable, avec un aperçu en cours d’exécution.',
        items: ['Réponses depuis vos docs', 'Prompts relisibles', 'Outils déclarés', 'Mémoire inspectable'],
      },
      {
        title: 'Flux de production',
        body: 'Chaque projet généré doit pouvoir être inspecté et testé, et prêt pour la planification du déploiement.',
        items: [
          'Du prompt au projet',
          'Revue du code',
          'Aperçu de l’environnement d’exécution',
          'Parcours de déploiement',
        ],
      },
    ],
    primaryActionLabel: 'Commencer à créer',
    secondaryActionLabel: 'Contacter l’équipe commerciale',
  },
  'internal-ai-builder': {
    title: 'Générateur d’IA interne',
    eyebrow: 'Solutions',
    description:
      'Décrivez l’assistant interne attendu. E-Code crée un projet modifiable qui modélise les sources de procédures, les états d’approbation, les règles d’accès et les événements d’audit. Connectez l’identité et les données privées, puis terminez les tests de sécurité avant déploiement.',
    highlights: [
      'Réponses ancrées aux procédures',
      'Acheminement des approbations',
      'Structure des règles d’accès',
      'Structure des événements d’audit',
    ],
    sections: [
      {
        title: 'Ce que vous pouvez créer',
        body: 'Générateur d’IA interne offre aux équipes un chemin plus rapide de l’idée à un projet typé et vérifiable, avec un aperçu en cours d’exécution.',
        items: [
          'Réponses ancrées aux procédures',
          'Acheminement des approbations',
          'Structure des règles d’accès',
          'Structure des événements d’audit',
        ],
      },
      {
        title: 'Flux de production',
        body: 'Chaque projet généré doit pouvoir être inspecté et testé, et prêt pour la planification du déploiement.',
        items: [
          'Du prompt au projet',
          'Revue du code',
          'Aperçu de l’environnement d’exécution',
          'Parcours de déploiement',
        ],
      },
    ],
    primaryActionLabel: 'Commencer à créer',
    secondaryActionLabel: 'Contacter l’équipe commerciale',
  },
  startups: {
    title: 'Startups',
    eyebrow: 'Solutions',
    description:
      'Décrivez le MVP que votre startup doit démontrer. E-Code le transforme en fichiers source modifiables avec un aperçu hébergé, un lien de revue partageable, l’export du projet et la publication guidée pour les builds pris en charge.',
    highlights: [
      'Templates et génération IA',
      'Aperçus hébergés',
      'Démos investisseurs partageables',
      'Authentification et tableaux de bord',
    ],
    sections: [
      {
        title: 'Ce que vous pouvez créer',
        body: 'Startups offre aux équipes un chemin plus rapide de l’idée à un projet typé et vérifiable, avec un aperçu en cours d’exécution.',
        items: [
          'Templates et génération IA',
          'Aperçus hébergés',
          'Démos investisseurs partageables',
          'Authentification et tableaux de bord',
        ],
      },
      {
        title: 'Flux de production',
        body: 'Chaque projet généré doit pouvoir être inspecté et testé, et prêt pour la planification du déploiement.',
        items: [
          'Du prompt au projet',
          'Revue du code',
          'Aperçu de l’environnement d’exécution',
          'Parcours de déploiement',
        ],
      },
    ],
    primaryActionLabel: 'Commencer à créer',
    secondaryActionLabel: 'Contacter l’équipe commerciale',
  },
  freelancers: {
    title: 'Freelances',
    eyebrow: 'Solutions',
    description:
      'Démarrez chaque projet client depuis des modèles réutilisables, partagez des liens d’aperçu pour la revue et transmettez un code source modifiable. E-Code transforme un brief en une application fonctionnelle dans de vrais fichiers, avec un aperçu actif, l’export du projet et la publication des builds pris en charge.',
    highlights: [
      'Modèles réutilisables',
      'Liens d’aperçu pour la revue',
      'Transfert du code source',
      'Itérer avec l’Agent',
    ],
    sections: [
      {
        title: 'Ce que vous pouvez créer',
        body: 'Freelances offre aux équipes un chemin plus rapide de l’idée à un projet typé et vérifiable, avec un aperçu en cours d’exécution.',
        items: [
          'Modèles réutilisables',
          'Liens d’aperçu pour la revue',
          'Transfert du code source',
          'Itérer avec l’Agent',
        ],
      },
      {
        title: 'Flux de production',
        body: 'Chaque projet généré doit pouvoir être inspecté et testé, et prêt pour la planification du déploiement.',
        items: [
          'Du prompt au projet',
          'Revue du code',
          'Aperçu de l’environnement d’exécution',
          'Parcours de déploiement',
        ],
      },
    ],
    primaryActionLabel: 'Commencer à créer',
    secondaryActionLabel: 'Contacter l’équipe commerciale',
  },
} as const satisfies Record<string, MarketingPageCopy>;

export function getMarketingPageCopy(slug: string, language?: string | null): MarketingPageCopy | null {
  const locale = resolveMarketingLanguage(language);

  /*
   * Les cartes de /solutions n'existent que côté anglais dans `solutionPages` ;
   * leur traduction vit dans un catalogue FR dédié (voir plus haut). On le
   * consulte AVANT les catalogues bilingues, sans quoi ces slugs n'entreraient
   * dans aucune branche et repartiraient en anglais.
   */
  if (locale === 'fr' && slug in marketingSolutionCardCopyFr) {
    return marketingSolutionCardCopyFr[slug as keyof typeof marketingSolutionCardCopyFr];
  }

  if (slug in marketingPageCopyEn) {
    const key = slug as keyof typeof marketingPageCopyEn;

    return locale === 'fr' ? marketingPageCopyFr[key] : marketingPageCopyEn[key];
  }

  if (slug in marketingAuxiliaryPageCopyEn) {
    const key = slug as keyof typeof marketingAuxiliaryPageCopyEn;

    return locale === 'fr' ? marketingAuxiliaryPageCopyFr[key] : marketingAuxiliaryPageCopyEn[key];
  }

  return null;
}

export function getMarketingFigureCopy(
  slug: string,
  language?: string | null,
): { alt: string; caption: string } | null {
  const locale = resolveMarketingLanguage(language);
  const catalog = marketingFigureCopy[locale];

  return slug in catalog ? catalog[slug as keyof typeof catalog] : null;
}

export function getMarketingUiCopy(language?: string | null) {
  return marketingUiCopy[resolveMarketingLanguage(language)];
}

export const marketingPageCopyFr = {
  product: {
    title: 'Produit E-Code',
    eyebrow: 'Visite du produit',
    description:
      'Découvrez le produit E-Code : éditeur, génération par IA, supervision des agents, déploiement Cloud Run, usages mobiles et collaboration.',
    primaryActionLabel: 'Découvrir les fonctionnalités',
    secondaryActionLabel: 'Voir les tarifs',
    highlights: ['Éditeur', 'Génération par IA', 'Agents', 'Déploiement', 'Mobile', 'Collaboration'],
    sections: [
      {
        title: 'Éditeur',
        body: 'Panneaux, terminal, Git, aperçu, problèmes et paramètres pensés pour un travail d’ingénierie régulier.',
        items: ['Panneaux de l’espace de travail', 'Terminal et aperçu', 'Contexte Git', 'Paramètres du projet'],
      },
      {
        title: 'IA',
        body: 'Génération multi-modèle diffusée en continu, avec pièces jointes, sélection de la pile technologique et correction de la compilation.',
        items: [
          'Génération diffusée en continu',
          'Routage multi-modèle',
          'Pièces jointes',
          'Correction de la compilation',
        ],
      },
      {
        title: 'Agents',
        body: 'Plan visible, appels d’outils, artefacts, pause, reprise et passage de relais par commit.',
        items: ['Plan visible', 'Appels d’outils', 'Artefacts', 'Pause et reprise'],
      },
      {
        title: 'Déploiement',
        body: 'Mises en production Cloud Run, rétablissement, domaines, tâches planifiées et métriques Cloud Monitoring.',
        items: [
          'Mises en production Cloud Run',
          'Rétablissement',
          'Domaines personnalisés',
          'Métriques de supervision',
        ],
      },
      {
        title: 'Mobile',
        body: 'Navigateur de projets, éditeur, terminal, aperçu et notifications sur téléphone et tablette.',
        items: ['Navigateur de projets', 'Éditeur', 'Terminal et aperçu', 'Notifications'],
      },
      {
        title: 'Collaboration',
        body: 'Présence, édition partagée, projets publics, duplication et modération.',
        items: ['Présence', 'Édition partagée', 'Projets publics', 'Duplication et modération'],
      },
    ],
  },
  features: {
    title: 'Fonctionnalités E-Code',
    eyebrow: 'Produit',
    description:
      'Toute la plateforme E-Code : agent IA, IDE dans le navigateur, collaboration multijoueur, environnements d’exécution réels, aperçus, déploiements et gouvernance d’entreprise.',
    primaryActionLabel: 'Commencer à créer',
    secondaryActionLabel: 'Comparer les plateformes',
    highlights: ['IDE dans le navigateur', 'Agent IA', 'Revue collaborative', 'Aperçus d’exécution', 'Déploiements'],
    sections: [
      {
        title: 'Espace de développement intégré',
        body: 'E-Code réunit l’IDE dans le navigateur, le code généré, la sortie du terminal, l’état de l’aperçu et le parcours de déploiement dans un même flux de production.',
        items: [
          'Arborescence et éditeur',
          'Revue des correctifs de l’agent',
          'Aperçu en direct',
          'Terminal et journaux',
        ],
      },
      {
        title: 'Prêt pour les équipes par défaut',
        body: 'Les fonctionnalités sont conçues pour les équipes qui exigent un contexte partagé, des mises en production contrôlées et une traçabilité complète.',
        items: [
          'Accès collaboratif aux projets',
          'Activité prête pour l’audit',
          'Cloisonnement des secrets',
          'Visibilité des mises en production',
        ],
      },
    ],
  },
  about: {
    title: 'À propos d’E-Code',
    eyebrow: 'Entreprise',
    description:
      'E-Code est la plateforme de développement d’entreprise propulsée par l’IA, conçue pour les équipes qui doivent générer, revoir, exécuter et déployer de vrais logiciels depuis un espace de travail gouverné.',
    primaryActionLabel: 'Commencer à créer',
    secondaryActionLabel: 'Contacter l’équipe commerciale',
    highlights: [
      'Livraison logicielle assistée par IA',
      'Contrôles d’entreprise',
      'Flux de travail mobiles et desktop',
      'Aperçus de production',
    ],
    sections: [
      {
        title: 'Mission',
        body: 'Aider les équipes à transformer une intention produit en logiciel de production sans sacrifier la rigueur d’ingénierie.',
        items: ['Builder natif IA', 'IDE E-Code', 'Environnements d’exécution réels', 'Gouvernance d’entreprise'],
      },
      {
        title: 'Principes de la plateforme',
        body: 'E-Code rassemble le code, les tests, la visibilité d’exécution, les contrôles de déploiement et la gouvernance d’équipe dans un même flux de travail.',
        items: [
          'Parcours de livraison typés',
          'Validation centrée sur l’aperçu',
          'Collaboration prête pour l’audit',
          'Isolation sécurisée des projets',
        ],
      },
    ],
  },
  careers: {
    title: 'Carrières',
    eyebrow: 'Entreprise',
    description:
      'Rejoignez l’équipe distribuée qui construit une plateforme de code assistée par IA, avec une véritable infrastructure d’exécution, une sécurité d’entreprise et un IDE adapté au mobile.',
    primaryActionLabel: 'Contacter l’équipe',
    secondaryActionLabel: 'En savoir plus sur E-Code',
    highlights: [
      'Ingénierie remote-first',
      'Excellence du design produit',
      'Responsabilité de l’infrastructure',
      'Accompagnement des entreprises',
    ],
    sections: [
      {
        title: 'Disciplines recherchées',
        body: 'Nous recrutons des personnes capables de livrer des systèmes produit complets et fiables, attentives aux détails que les utilisateurs ressentent chaque jour.',
        items: [
          'Interfaces utilisateur',
          'Infrastructure d’exécution',
          'Orchestration d’agents IA',
          'Sécurité et conformité',
        ],
      },
      {
        title: 'Notre manière de travailler',
        body: 'De petites équipes expérimentées prennent en charge des surfaces complètes, de l’UX au déploiement et à la qualité opérationnelle.',
        items: ['Code de production', 'Fiabilité mesurée', 'Retours directs des clients', 'Rédaction technique claire'],
      },
    ],
  },
  blog: {
    title: 'Blog E-Code',
    eyebrow: 'Ressources',
    description:
      'Notes d’ingénierie, actualités produit et retours de terrain sur la livraison logicielle assistée par IA à l’échelle de l’entreprise.',
    primaryActionLabel: 'Lire le journal des modifications',
    secondaryActionLabel: 'Parcourir la documentation',
    highlights: ['Livraison assistée par IA', 'Opérations d’exécution', 'IDE mobile', 'Posture de sécurité'],
    sections: [
      {
        title: 'Articles à la une',
        body: 'Des actualités produit et ingénierie concrètes issues de la feuille de route de la plateforme E-Code.',
        items: [
          'Pourquoi Cloud Run pour les espaces de travail de développement',
          'Déployer des agents IA gouvernés sans perdre les boucles de revue',
          'Pourquoi les aperçus constituent une condition de mise en production, et non un simple support de démonstration',
          'Concevoir un IDE mobile pour un véritable travail de production',
        ],
      },
      {
        title: 'Pourquoi Cloud Run pour les espaces de travail de développement',
        body: 'Cloud Run apporte des services sans état, l’isolation gVisor, des déploiements régionaux et une mise à l’échelle prévisible pour les charges de travail d’un IDE moderne.',
        items: ['Services sans état', 'Isolation gVisor', 'Déploiements régionaux', 'Mise à l’échelle prévisible'],
      },
      {
        title: 'Thématiques éditoriales',
        body: 'Les contenus s’articulent autour d’une livraison logicielle plus sûre, plus rapide et dotée de retours opérationnels plus clairs.',
        items: ['Systèmes de compilation', 'Collaboration', 'Sécurité', 'Infrastructure de déploiement'],
      },
    ],
  },
  docs: {
    title: 'Documentation',
    eyebrow: 'Ressources',
    description:
      'Documentation pratique d’E-Code pour créer des projets, utiliser l’agent IA, lancer des aperçus, déployer des applications et administrer les équipes en toute sécurité.',
    primaryActionLabel: 'Commencer à créer',
    secondaryActionLabel: 'Lire la documentation sur l’IA',
    highlights: ['Bien démarrer', 'Agent IA', 'Flux d’aperçu', 'Déploiements'],
    sections: [
      {
        title: 'Flux de création',
        body: 'La documentation suit le véritable cycle de production : créer un projet, générer le code, examiner les changements, lancer les validations et livrer par un parcours contrôlé.',
        items: ['Configuration du projet', 'Prompts d’agent', 'Revue des fichiers', 'Vérification de l’aperçu'],
      },
      {
        title: 'Guides d’exploitation',
        body: 'Les équipes peuvent s’appuyer sur la documentation pour comprendre les exigences d’exécution, les variables d’environnement, les contrôles de déploiement et les procédures de dépannage.',
        items: [
          'Configuration de l’environnement d’exécution',
          'Gestion des secrets',
          'Journaux de déploiement',
          'Escalade vers le support',
        ],
      },
    ],
  },
  contact: {
    title: 'Contacter E-Code',
    eyebrow: 'Entreprise',
    description:
      'Contactez l’équipe E-Code pour toute question sur la plateforme, les partenariats, les demandes presse et la planification de votre mise en œuvre.',
    primaryActionLabel: 'Contacter l’équipe commerciale',
    secondaryActionLabel: 'Ouvrir le support',
    highlights: ['Ingénierie commerciale', 'Partenariats', 'Orientation vers le support', 'Questions de sécurité'],
    sections: [
      {
        title: 'Orientation rapide',
        body: 'Transmettez votre demande à la bonne équipe en précisant le contexte du projet, vos besoins de conformité et le calendrier de déploiement.',
        items: [
          'Déploiement à l’échelle de l’entreprise',
          'Support technique',
          'Demandes presse et analystes',
          'Intégrations partenaires',
        ],
      },
      {
        title: 'Informations à fournir',
        body: 'Plus vous fournissez de contexte opérationnel, plus nous pouvons vous apporter rapidement des conseils utiles.',
        items: ['Taille de l’équipe', 'Exigences de sécurité', 'Cibles d’exécution', 'Source de migration'],
      },
    ],
  },
  partners: {
    title: 'Partenaires',
    eyebrow: 'Écosystème',
    description:
      'E-Code s’intègre aux plateformes cloud, d’IA, de gestion du code source, de données et de paiement auxquelles les équipes font déjà confiance.',
    primaryActionLabel: 'Devenir partenaire',
    secondaryActionLabel: 'Voir les intégrations',
    highlights: ['OpenAI', 'GitHub', 'Docker', 'Vercel', 'Cloudflare', 'Stripe'],
    sections: [
      {
        title: 'Partenaires technologiques',
        body: 'L’écosystème de partenaires importé d’E-Code fait désormais partie de ses pages marketing et de la navigation du pied de page.',
        items: [
          'Fournisseurs d’IA',
          'Plateformes de déploiement',
          'Fournisseurs de bases de données',
          'Infrastructure cloud',
        ],
      },
      {
        title: 'Partenaires solutions',
        body: 'E-Code accompagne les équipes d’implémentation qui créent des outils internes, des plateformes SaaS et des produits d’IA pour leurs clients.',
        items: [
          'Services de migration',
          'Modèles personnalisés',
          'Accompagnement de l’entreprise',
          'Conseil en sécurité',
        ],
      },
    ],
  },
  press: {
    title: 'Presse',
    eyebrow: 'Entreprise',
    description:
      'Ressources de marque, positionnement de l’entreprise et supports d’annonce pour E-Code.AI et sa plateforme de développement d’entreprise.',
    primaryActionLabel: 'Contacter la presse',
    secondaryActionLabel: 'À propos d’E-Code',
    highlights: ['Kit média', 'Captures du produit', 'Présentation de l’entreprise', 'Notes de la direction'],
    sections: [
      {
        title: 'Présentation',
        body: 'E-Code.AI aide les équipes à créer, exécuter et gouverner des logiciels de production avec des agents IA, de vrais environnements d’exécution et des contrôles d’entreprise.',
        items: [
          'IDE propulsé par IA',
          'Adaptateurs d’exécution de production',
          'Flux de travail adaptés au mobile',
          'Collaboration gouvernée',
        ],
      },
      {
        title: 'Ressources',
        body: 'Le logo public, le favicon, les icônes de l’application, les marques partenaires et les visuels de comparaison sont disponibles dans l’arborescence publique des ressources.',
        items: ['Logo SVG', 'Favicon ICO', 'Icônes PWA au format PNG', 'SVG des partenaires'],
      },
    ],
  },
  accessibility: {
    title: 'Accessibilité',
    eyebrow: 'Entreprise',
    description:
      'E-Code est conçu pour que les principaux flux de développement, de revue et de déploiement restent utilisables quels que soient le clavier, la taille d’écran et le thème choisis.',
    primaryActionLabel: 'Signaler un problème',
    secondaryActionLabel: 'Voir les règles d’utilisation acceptable',
    highlights: ['Navigation au clavier', 'Mises en page adaptatives', 'Thèmes sombre et clair', 'États lisibles'],
    sections: [
      {
        title: 'Engagement',
        body: 'Chaque surface publique et chaque panneau asynchrone doivent proposer des états de chargement, d’erreur et de récupération clairs.',
        items: ['Navigation au clavier', 'Focus visible', 'Pages marketing adaptatives', 'Libellés accessibles'],
      },
      {
        title: 'Évaluation continue',
        body: 'L’accessibilité reste intégrée à l’assurance qualité à mesure que de nouveaux panneaux d’IDE, de nouvelles routes marketing et de nouvelles surfaces mobiles sont ajoutés.',
        items: [
          'Contrôles du contraste',
          'Vérification des tailles d’écran',
          'Repères sémantiques',
          'Ambiguïté réduite',
        ],
      },
    ],
  },
  mobile: {
    title: 'IDE mobile',
    eyebrow: 'Produit',
    description:
      'Créez, révisez, lancez des aperçus et collaborez depuis un téléphone ou une tablette grâce aux flux E-Code adaptés au mobile.',
    primaryActionLabel: 'Commencer à créer',
    secondaryActionLabel: 'Voir les modèles',
    highlights: ['Flux sur téléphone', 'Mises en page tablette', 'Accès à l’aperçu', 'Collaboration d’équipe'],
    sections: [
      {
        title: 'Flux de développement mobile',
        body: 'E-Code conserve le prompt, les fichiers, l’aperçu, l’état du terminal et le contexte de déploiement accessibles sur les écrans plus petits.',
        items: [
          'Navigation mobile dans les fichiers',
          'Aperçus adaptatifs',
          'Actualités de l’agent',
          'Visibilité des mises en production',
        ],
      },
      {
        title: 'Couverture des ressources natives',
        body: 'Le système d’icônes importé comprend les formats PWA et les icônes d’application utilisés sur les surfaces d’installation mobile.',
        items: ['Icônes PWA de 72 px à 512 px', 'Icône Apple Touch', 'Favicon SVG', 'Favicon ICO'],
      },
    ],
  },
  desktop: {
    title: 'Application desktop',
    eyebrow: 'Produit',
    description:
      'Utilisez E-Code comme environnement de développement desktop dédié, avec des projets synchronisés, des aperçus et un accès sécurisé aux environnements d’exécution.',
    primaryActionLabel: 'Commencer à créer',
    secondaryActionLabel: 'Lire la documentation',
    highlights: [
      'Espace de travail dédié',
      'Synchronisation sécurisée',
      'Revue adaptée au local',
      'Visibilité d’exécution',
    ],
    sections: [
      {
        title: 'Flux de travail desktop',
        body: 'La surface desktop s’articule autour d’espaces de travail persistants, de panneaux lisibles et d’un accès rapide à l’état de l’aperçu.',
        items: ['Contexte du projet', 'Continuité de l’éditeur', 'Visibilité du terminal', 'Contrôles de déploiement'],
      },
      {
        title: 'Pour les équipes de production',
        body: 'L’usage desktop relie les contrôles d’entreprise et l’auditabilité au travail de développement quotidien.',
        items: [
          'Identité compatible SSO',
          'Secrets du projet',
          'Contexte d’audit',
          'Compilations conformes aux politiques',
        ],
      },
    ],
  },
  languages: {
    title: 'Langages',
    eyebrow: 'Ressources',
    description:
      'Démarrez à partir de modèles de production en TypeScript, React, Remix, Node.js, Python, Go, Rust ou pour des applications adossées à une base de données.',
    primaryActionLabel: 'Parcourir les modèles',
    secondaryActionLabel: 'Lire la documentation',
    highlights: ['TypeScript', 'React', 'Node.js', 'Python', 'PostgreSQL', 'Docker'],
    sections: [
      {
        title: 'Couverture des modèles',
        body: 'Les environnements de langage E-Code transforment les prompts en véritables structures de projet, dépendances et commandes de validation.',
        items: ['Interfaces applicatives', 'Services API', 'Produits adossés à une base de données', 'Outils d’IA'],
      },
      {
        title: 'Prise en charge de l’exécution',
        body: 'Les modèles de langage ne sont utiles que s’ils peuvent s’exécuter, afficher un aperçu et être déployés avec des retours clairs.',
        items: ['Installer les dépendances', 'Lancer les aperçus', 'Valider les tests', 'Déployer en toute sécurité'],
      },
    ],
  },
  tutorials: {
    title: 'Tutoriels',
    eyebrow: 'Ressources',
    description:
      'Des guides pas à pas pour créer des applications avec les prompts, modèles, aperçus, déploiements et flux d’équipe d’E-Code.',
    primaryActionLabel: 'Ouvrir la documentation',
    secondaryActionLabel: 'Parcourir les modèles',
    highlights: ['Première application', 'Déploiements', 'Agent IA', 'Revue d’équipe'],
    sections: [
      {
        title: 'Parcours d’apprentissage',
        body: 'Les tutoriels reprennent les mêmes flux qu’en production : prompt, inspection, exécution, test, aperçu et mise en production.',
        items: [
          'Créer une application SaaS',
          'Ajouter l’authentification',
          'Connecter les données',
          'Publier un aperçu',
        ],
      },
      {
        title: 'Guides avancés',
        body: 'Approfondissez la revue des agents, le débogage de l’exécution et les contrôles d’entreprise.',
        items: ['Revue des patchs de l’agent', 'Gestion des secrets', 'Journalisation d’audit', 'Validation mobile'],
      },
    ],
  },
  'case-studies': {
    title: 'Études de cas',
    eyebrow: 'Ressources',
    description:
      'Découvrez comment des équipes utilisent E-Code pour accélérer leurs plateformes internes, leurs applications client et leurs livraisons assistées par IA.',
    primaryActionLabel: 'Contacter l’équipe commerciale',
    secondaryActionLabel: 'Voir les partenaires',
    highlights: ['Outils internes', 'Lancement SaaS', 'Migration vers l’IA', 'Équipes plateforme'],
    sections: [
      {
        title: 'Livraison à l’échelle de l’entreprise',
        body: 'Les réussites partagent souvent une discipline accrue autour des aperçus, une réutilisation plus rapide des modèles et une responsabilité d’exécution plus claire.',
        items: [
          'Cycles de compilation raccourcis',
          'Contexte de projet partagé',
          'Déploiements gouvernés',
          'Kits de démarrage réutilisables',
        ],
      },
      {
        title: 'Critères d’évaluation',
        body: 'Les équipes comparent E-Code selon sa fiabilité, ses contrôles de sécurité, la vitesse de développement et l’auditabilité.',
        items: [
          'Délai jusqu’au premier aperçu',
          'Adéquation aux politiques',
          'Onboarding de l’équipe',
          'Visibilité opérationnelle',
        ],
      },
    ],
  },
  customers: {
    title: 'Clients et réalisations',
    eyebrow: 'Clients',
    description:
      'Découvrez les clients E-Code qui créent des outils internes, des produits d’IA et des solutions éducatives avec des déploiements Cloud Run et des modèles validés.',
    primaryActionLabel: 'Lire les études de cas',
    secondaryActionLabel: 'Contacter l’équipe commerciale',
    highlights: ['Outils internes', 'Produits d’IA', 'Éducation', 'Déploiement Cloud Run'],
    sections: [
      {
        title: 'Outils internes',
        body: 'Les équipes créent des tableaux de bord, des automatisations et des applications back-office déployées sur Cloud Run.',
        items: ['Tableaux de bord', 'Automatisations', 'Applications back-office', 'Déploiement Cloud Run'],
      },
      {
        title: 'Produits d’IA',
        body: 'Les fondateurs génèrent, font évoluer et livrent des applications propulsées par des modèles à partir de modèles de projet validés.',
        items: [
          'Applications propulsées par des modèles',
          'Modèles de projet validés',
          'Boucles d’itération',
          'Aperçu avant mise en production',
        ],
      },
      {
        title: 'Éducation',
        body: 'Les classes utilisent des environnements de projet sûrs avec des modèles reproductibles.',
        items: ['Environnements sûrs', 'Modèles reproductibles', 'Projets d’élèves', 'Revue par les enseignants'],
      },
      {
        title: 'Parcours de découverte',
        body: 'La vitrine importée passe désormais par de véritables pages E-Code, et non par un fichier HTML statique isolé.',
        items: ['Modèles', 'Place de marché', 'Communauté', 'Études de cas'],
      },
    ],
  },
  'help-center': {
    title: 'Centre d’aide',
    eyebrow: 'Support',
    description:
      'Conseils sur la configuration du compte, la création de projets, les aperçus, les problèmes d’exécution, la facturation, les équipes et les déploiements.',
    primaryActionLabel: 'Ouvrir le support',
    secondaryActionLabel: 'Lire la documentation',
    highlights: ['Dépannage', 'Facturation', 'Aide à l’exécution', 'Configuration de l’équipe'],
    sections: [
      {
        title: 'Sujets d’aide courants',
        body: 'Le centre d’aide oriente rapidement les utilisateurs vers la documentation produit et opérationnelle appropriée.',
        items: ['Connexion et inscription', 'Importation de projets', 'Serveurs d’aperçu', 'Échecs de déploiement'],
      },
      {
        title: 'Escalade',
        body: 'Les équipes d’entreprise peuvent collaborer avec le support sur le SSO, la conformité, la résidence des données et la planification du déploiement.',
        items: [
          'Ingénierie commerciale',
          'Revue de sécurité',
          'Diagnostic d’exécution',
          'Planification de la migration',
        ],
      },
    ],
  },
  forum: {
    title: 'Forum de la communauté',
    eyebrow: 'Communauté',
    description:
      'Échangez avec d’autres builders E-Code sur les modèles, les flux de travail, le comportement des agents IA et les pratiques de déploiement en production.',
    primaryActionLabel: 'Ouvrir le support',
    secondaryActionLabel: 'Parcourir les modèles',
    highlights: ['Discussions entre builders', 'Retours sur les modèles', 'Conseils pratiques', 'Notes de version'],
    sections: [
      {
        title: 'Sujets de la communauté',
        body: 'Le forum s’organise autour de questions concrètes de création et de mise en production.',
        items: [
          'Architecture d’application',
          'Structures de prompts',
          'Configuration du déploiement',
          'Collaboration d’équipe',
        ],
      },
      {
        title: 'Partager votre travail',
        body: 'Utilisez les publications de la communauté pour partager des modèles, demander une revue et comparer les approches d’implémentation.',
        items: ['Démonstrations de modèles', 'Fils de débogage', 'Demandes de fonctionnalités', 'Notes d’intégration'],
      },
    ],
  },
  ai: {
    title: 'Plateforme d’IA',
    eyebrow: 'Produit',
    description:
      'Gouvernez la livraison logicielle assistée par IA grâce au routage des modèles, à l’exécution des outils, au contexte d’audit et à une validation tenant compte des aperçus.',
    primaryActionLabel: 'Essayer le builder IA',
    secondaryActionLabel: 'Lire la documentation sur l’IA',
    highlights: ['Orchestration d’agents', 'Contrôle des modèles', 'Visibilité des outils', 'Contexte d’audit'],
    sections: [
      {
        title: 'Flux de travail de l’agent',
        body: 'Les agents E-Code opèrent dans l’environnement de développement, où les fichiers, la sortie du terminal et les aperçus restent visibles.',
        items: ['Planification du prompt', 'Revue des patchs', 'Exécution des tests', 'Vérification de l’aperçu'],
      },
      {
        title: 'Gouvernance',
        body: 'L’usage de l’IA en entreprise exige de la traçabilité, des contraintes de politique et des limites claires autour de l’exécution des outils.',
        items: [
          'Paramètres des fournisseurs',
          'Contrôles d’utilisation',
          'Journalisation d’audit',
          'Étapes d’approbation',
        ],
      },
    ],
  },
  'ai-documentation': {
    title: 'Documentation sur l’IA',
    eyebrow: 'Ressources',
    description:
      'Un guide complet des capacités des agents E-Code, de la sélection des modèles, de l’exécution des outils, des garde-fous de sécurité et des flux de validation.',
    primaryActionLabel: 'Ouvrir la documentation',
    secondaryActionLabel: 'Commencer à créer',
    highlights: ['Modes de l’agent', 'Routage des modèles', 'Appels d’outils', 'Boucles de validation'],
    sections: [
      {
        title: 'Concepts fondamentaux',
        body: 'Comprenez comment les agents raisonnent sur les fichiers, la sortie d’exécution, les aperçus et les contraintes de déploiement.',
        items: [
          'Contexte de l’espace de travail',
          'Cycle de vie des patchs',
          'Validation des commandes',
          'Contrôles d’aperçu',
        ],
      },
      {
        title: 'Utilisation en production',
        body: 'Utilisez l’IA en équipe en toute sécurité grâce aux revues, aux journaux, aux limites de quota et à des critères explicites de mise en production.',
        items: ['Contrôles de politique', 'Autorisations d’équipe', 'Cloisonnement des secrets', 'Pistes d’audit'],
      },
    ],
  },
  mcp: {
    title: 'Intégrations MCP',
    eyebrow: 'Produit',
    description:
      'Connectez les agents E-Code à des outils et sources de contexte approuvés au moyen d’intégrations MCP contrôlées.',
    primaryActionLabel: 'Lire la documentation',
    secondaryActionLabel: 'Contacter l’équipe commerciale',
    highlights: ['Gouvernance des outils', 'Sources de contexte', 'Catalogue de connecteurs', 'Pistes d’audit'],
    sections: [
      {
        title: 'Modèle d’intégration',
        body: 'Les outils externes deviennent plus sûrs lorsque l’accès, le périmètre et les résultats sont visibles dans le flux de développement.',
        items: ['Connecteurs de sources', 'Contexte des tickets', 'Bases de connaissances', 'Outils opérationnels'],
      },
      {
        title: 'Contrôles d’entreprise',
        body: 'L’utilisation des connecteurs doit respecter l’identité, les limites d’autorisation et les exigences de conformité.',
        items: [
          'Accès limité au périmètre',
          'Résultats vérifiables',
          'Isolation des organisations clientes',
          'Journalisation de l’utilisation',
        ],
      },
    ],
  },
  polyglot: {
    title: 'Services applicatifs polyglottes',
    eyebrow: 'Produit',
    description:
      'Générez et exécutez des services applicatifs dans les langages courants, tout en gardant les aperçus, les journaux et les contrôles de déploiement visibles.',
    primaryActionLabel: 'Parcourir les modèles',
    secondaryActionLabel: 'Lire la documentation',
    highlights: ['Node.js', 'Python', 'Go', 'Rust', 'PostgreSQL'],
    sections: [
      {
        title: 'Génération des services applicatifs',
        body: 'E-Code aide les équipes à créer des API, des workers et des services adossés aux données avec de vrais fichiers de projet et de vrais tests.',
        items: ['API REST', 'Tâches en arrière-plan', 'Schémas de base de données', 'Flux d’authentification'],
      },
      {
        title: 'Boucle opérationnelle',
        body: 'Un service applicatif n’est pas terminé tant qu’il ne peut pas s’exécuter, exposer des journaux, réussir les contrôles et se déployer de manière fiable.',
        items: [
          'Contrôles de santé',
          'Journaux d’exécution',
          'Variables d’environnement',
          'Conditions de mise en production',
        ],
      },
    ],
  },
  dpa: {
    title: 'Avenant relatif au traitement des données',
    eyebrow: 'Juridique',
    description:
      'Conditions contractuelles de protection des données destinées aux organisations qui évaluent E-Code dans un contexte réglementé ou d’entreprise.',
    primaryActionLabel: 'Contacter l’équipe commerciale',
    secondaryActionLabel: 'Politique de confidentialité',
    highlights: [
      'Traitement des données',
      'Mesures de sécurité',
      'Sous-traitants ultérieurs',
      'Droits des personnes concernées',
    ],
    sections: [
      {
        title: 'Champ d’application',
        body: 'Les offres Enterprise peuvent inclure un avenant relatif au traitement des données définissant les responsabilités de traitement, les engagements de sécurité et l’accompagnement des démarches de conformité.',
        items: [
          'Rôles du responsable du traitement et du sous-traitant',
          'Instructions de traitement',
          'Confidentialité',
          'Liste des sous-traitants ultérieurs',
        ],
      },
      {
        title: 'Mesures de protection opérationnelles',
        body: 'E-Code repose sur des contrôles d’identité, l’isolation des projets, la protection des secrets et la visibilité nécessaire aux audits.',
        items: ['Contrôles d’accès', 'Chiffrement', 'Journalisation', 'Réponse aux incidents'],
      },
    ],
  },
  'commercial-agreement': {
    title: 'Contrat commercial',
    eyebrow: 'Juridique',
    description:
      'Conditions commerciales applicables aux équipes qui souscrivent à E-Code, à ses services d’entreprise et à son accompagnement au déploiement.',
    primaryActionLabel: 'Contacter l’équipe commerciale',
    secondaryActionLabel: 'Conditions d’utilisation',
    highlights: [
      'Conditions d’abonnement',
      'Engagements de support',
      'Limites d’utilisation',
      'Processus de renouvellement',
    ],
    sections: [
      {
        title: 'Structure du contrat',
        body: 'Les contrats commerciaux harmonisent les droits associés à l’offre, le niveau de support, les besoins de sécurité et les exigences de déploiement.',
        items: ['Bons de commande', 'Limites de l’offre', 'Niveaux de support', 'Informations d’achat'],
      },
      {
        title: 'Options d’entreprise',
        body: 'Les déploiements Enterprise peuvent inclure le SSO, une infrastructure privée, des quotas personnalisés et des services d’onboarding.',
        items: ['SAML/OIDC', 'SCIM', 'Environnements d’exécution privés', 'Support Premium'],
      },
    ],
  },
  'report-abuse': {
    title: 'Signaler un abus',
    eyebrow: 'Confiance',
    description:
      'Signalez tout usage abusif des projets E-Code, des aperçus publics, des contenus hébergés ou des flux de la plateforme.',
    primaryActionLabel: 'Contacter le support',
    secondaryActionLabel: 'Règles d’utilisation acceptable',
    highlights: ['Contenu hébergé', 'Problèmes de sécurité', 'Violations des politiques', 'Divulgation responsable'],
    sections: [
      {
        title: 'Éléments à signaler',
        body: 'Indiquez l’URL, l’identifiant du projet, le comportement observé et tout horodatage pertinent.',
        items: ['Hameçonnage', 'Logiciel malveillant', 'Contenu illégal', 'Exposition d’identifiants'],
      },
      {
        title: 'Processus d’examen',
        body: 'Les signalements sont examinés sous l’angle des violations de politique et de leur impact sur la sécurité avant toute action.',
        items: ['Triage', 'Examen des preuves', 'Atténuation', 'Suivi'],
      },
    ],
  },
  subprocessors: {
    title: 'Sous-traitants ultérieurs',
    eyebrow: 'Juridique',
    description:
      'Fournisseurs d’infrastructure, de sécurité, d’IA et d’opérations susceptibles de contribuer à la fourniture du service E-Code.',
    primaryActionLabel: 'Contacter l’équipe commerciale',
    secondaryActionLabel: 'Avenant relatif au traitement des données',
    highlights: ['Infrastructure cloud', 'Fournisseurs d’IA', 'Observabilité', 'Paiements'],
    sections: [
      {
        title: 'Catégories de fournisseurs',
        body: 'Les sous-traitants ultérieurs contribuent à l’hébergement principal de l’application, aux paiements, à l’envoi des e-mails, à l’analytique, au support et aux flux d’IA sécurisés.',
        items: ['Google Cloud', 'Stripe', 'Sentry', 'Envoi d’e-mails et analytique'],
      },
      {
        title: 'Gestion des changements',
        body: 'Les clients Enterprise peuvent examiner les sous-traitants ultérieurs dans le cadre de leurs processus d’achat et d’évaluation de la sécurité.',
        items: [
          'Évaluation des fournisseurs',
          'Contrôles régionaux',
          'Documentation de sécurité',
          'Processus de notification',
        ],
      },
    ],
  },
  'student-dpa': {
    title: 'Avenant américain sur les données des élèves',
    eyebrow: 'Juridique',
    description:
      'Conditions de protection des données des élèves destinées aux programmes et établissements d’enseignement qui évaluent E-Code.',
    primaryActionLabel: 'Contacter l’équipe commerciale',
    secondaryActionLabel: 'Politique de confidentialité',
    highlights: ['Usage éducatif', 'Confidentialité des élèves', 'Contrôles administratifs', 'Suppression des données'],
    sections: [
      {
        title: 'Contrôles pour l’éducation',
        body: 'Les déploiements éducatifs exigent une gestion rigoureuse des données des élèves, des accès et de la conservation.',
        items: ['Accès fondé sur les rôles', 'Traitement limité', 'Assistance à la suppression', 'Registres d’audit'],
      },
      {
        title: 'Accompagnement des établissements',
        body: 'E-Code peut collaborer avec les administrateurs des écoles et universités sur le déploiement, la conformité et les parcours de support.',
        items: ['Accompagnement à l’achat', 'Revue de sécurité', 'Formation', 'Escalade vers le support'],
      },
    ],
  },
  marketplace: {
    title: 'Place de marché',
    eyebrow: 'Modèles',
    description:
      'Découvrez les kits de démarrage E-Code, les modèles d’implémentation et les fondations de projet réutilisables pour vos applications de production.',
    primaryActionLabel: 'Parcourir les modèles',
    secondaryActionLabel: 'Explorer les solutions',
    highlights: [
      'Kits de démarrage pour la production',
      'Modèles réutilisables',
      'Prêts pour l’exécution',
      'Parcours de déploiement',
    ],
    sections: [
      {
        title: 'Contenu de la place de marché',
        body: 'Les éléments de la place de marché sont conçus pour devenir de vrais projets, pas de simples captures. Chaque modèle de démarrage doit correspondre à des fichiers, des dépendances, des validations et des attentes d’aperçu.',
        items: ['Modèles SaaS', 'Modèles de tableaux de bord', 'Outils d’IA', 'Systèmes de sites web'],
      },
      {
        title: 'Utilisation par les équipes',
        body: 'Les équipes peuvent standardiser leurs débuts de projet tout en conservant la maîtrise du code et une discipline de revue.',
        items: [
          'Copie d’un modèle de démarrage',
          'Adaptation avec l’agent IA',
          'Contrôles de l’aperçu',
          'Déploiement par des flux contrôlés',
        ],
      },
    ],
  },
  community: {
    title: 'Communauté',
    eyebrow: 'Créateurs',
    description:
      'Un espace public où les créateurs E-Code peuvent partager des modèles de projet, des idées de modèles, des pratiques et leurs retours de lancement.',
    primaryActionLabel: 'Ouvrir le forum',
    secondaryActionLabel: 'Parcourir la place de marché',
    highlights: [
      'Réalisations de projets',
      'Retours sur les modèles',
      'Notes pratiques',
      'Discussions sur les versions',
    ],
    sections: [
      {
        title: 'Réseau de builders',
        body: 'Les contenus de la communauté relient les retours d’implémentation concrets aux modèles et aux surfaces produit utilisés quotidiennement par les équipes.',
        items: [
          'Publications de réalisations',
          'Structures de prompts',
          'Discussions de débogage',
          'Conseils de déploiement',
        ],
      },
      {
        title: 'Collaboration sûre',
        body: 'La collaboration publique ne doit jamais imposer d’exposer des secrets, des dépôts privés ou des données client.',
        items: [
          'Partager des exemples assainis',
          'Créer des liens vers des aperçus publics',
          'Poser des questions ciblées',
          'Transmettre les sujets sensibles au support',
        ],
      },
    ],
  },
  explore: {
    title: 'Explorer E-Code',
    eyebrow: 'Découverte',
    description:
      'Explorez les solutions, les modèles, les exemples de la communauté et les capacités de la plateforme avant de démarrer un projet.',
    primaryActionLabel: 'Parcourir les modèles',
    secondaryActionLabel: 'Voir les fonctionnalités',
    highlights: ['Solutions', 'Modèles', 'Communauté', 'Comparatifs'],
    sections: [
      {
        title: 'Parcours de découverte',
        body: 'Utilisez Explorer pour passer d’une idée produit générale au modèle de démarrage, au guide ou au comparatif approprié.',
        items: [
          'Pages de solutions',
          'Galerie de modèles',
          'Publications de la communauté',
          'Comparatifs de plateformes',
        ],
      },
      {
        title: 'Étape suivante',
        body: 'Une fois le parcours défini, E-Code transforme le modèle choisi en projet modifiable, exécutable et vérifiable.',
        items: ['Créer le projet', 'Générer le code', 'Examiner les changements', 'Afficher le résultat'],
      },
    ],
  },
  search: {
    title: 'Recherche',
    eyebrow: 'Découverte',
    description:
      'Recherchez dans la documentation E-Code, les modèles, les projets, la place de marché et les connaissances de la communauté depuis un point d’entrée public unique.',
    primaryActionLabel: 'Rechercher des modèles',
    secondaryActionLabel: 'Ouvrir la documentation',
    highlights: ['Documentation', 'Modèles', 'Projets', 'Communauté'],
    sections: [
      {
        title: 'Sources de recherche',
        body: 'La recherche publique oriente chacun vers la source de référence la plus utile à sa tâche.',
        items: ['Guides de documentation', 'Kits de démarrage', 'Exemples de la communauté', 'Pages produit'],
      },
      {
        title: 'Recherche en mode connecté',
        body: 'La recherche dans l’espace de travail reste disponible depuis le tableau de bord authentifié et l’IDE du projet.',
        items: ['Palette de commandes', 'Fichiers du projet', 'Contexte de l’agent', 'Ressources de l’équipe'],
      },
    ],
  },
  demo: {
    title: 'Démonstration de la plateforme',
    eyebrow: 'Démonstration',
    description:
      'Découvrez comment E-Code réunit le prompt, les fichiers, l’aperçu, les retours du terminal, les contrôles de déploiement et la revue d’équipe dans un même flux.',
    primaryActionLabel: 'Commencer à créer',
    secondaryActionLabel: 'Voir les fonctionnalités',
    highlights: ['Du prompt à l’application', 'Revue dans l’IDE', 'Aperçu en direct', 'Contrôles de déploiement'],
    sections: [
      {
        title: 'Parcours de démonstration',
        body: 'La page de démonstration publique décrit le parcours produit sans dépendre de la ressource vidéo factice de l’application source.',
        items: [
          'Décrire l’application',
          'Examiner les fichiers générés',
          'Lancer l’aperçu',
          'Préparer la mise en production',
        ],
      },
      {
        title: 'Pourquoi aucune vidéo n’est intégrée',
        body: 'Le fichier source platform-demo.mp4 n’est pas un média. E-Code affiche donc une véritable présentation rendue du produit au lieu de proposer une vidéo défectueuse.',
        items: [
          'Aucun média défectueux',
          'Contenu accessible',
          'Routes réelles',
          'Ressources sûres pour la production',
        ],
      },
    ],
  },
  'theme-validation': {
    title: 'Validation des thèmes',
    eyebrow: 'Système de design',
    description:
      'Validez les modes sombre et clair d’E-Code, les couleurs de marque, les états de focus et le comportement adaptatif de la structure marketing.',
    primaryActionLabel: 'Ouvrir la page d’accessibilité',
    secondaryActionLabel: 'Voir les fonctionnalités',
    highlights: ['Mode sombre par défaut', 'Mode clair disponible', 'Anneaux de focus', 'États adaptatifs'],
    sections: [
      {
        title: 'Contrat visuel',
        body: 'La validation des thèmes maintient la structure publique, les pages d’authentification et les surfaces produit alignées sur les ressources de marque E-Code.',
        items: ['Contraste du logo', 'Cartes lisibles', 'Liens accessibles', 'Espacement adaptatif stable'],
      },
      {
        title: 'Validation opérationnelle',
        body: 'Les changements de design sont vérifiés par la vérification des types, le lint, la compilation et le rendu dans le navigateur avant publication.',
        items: ['TypeScript', 'ESLint', 'Compilation de production', 'Parcours Playwright'],
      },
    ],
  },
  'runtime-test': {
    title: 'Test de l’environnement d’exécution',
    eyebrow: 'Diagnostic',
    description:
      'Une page publique de compatibilité consacrée à l’état de préparation de l’environnement d’exécution E-Code, à la santé des aperçus et aux diagnostics de déploiement.',
    primaryActionLabel: 'Voir le statut',
    secondaryActionLabel: 'Lire la documentation',
    highlights: ['État de préparation de l’exécution', 'Santé de l’aperçu', 'Journaux', 'Contrôles de déploiement'],
    sections: [
      {
        title: 'État de préparation de l’exécution',
        body: 'Les contrôles d’exécution doivent confirmer que les projets peuvent installer leurs dépendances, démarrer les serveurs, exposer les ports et afficher les aperçus.',
        items: ['Commande d’installation', 'Serveur de développement', 'Détection du port', 'Rendu de l’aperçu'],
      },
      {
        title: 'Diagnostics de production',
        body: 'Les routes opérationnelles doivent rester lisibles même lorsqu’une dépendance applicative est indisponible.',
        items: ['Statut clair', 'Erreurs récupérables', 'Orientation vers le support', 'Aucun écran blanc'],
      },
    ],
  },

  /*
   * /enterprise en français. « Enterprise » (nom d’offre) et « Solutions »
   * restent identiques — déclarés dans marketingFrIdentityTerms. Glossaire :
   * Deployment→Déploiement, runtime→environnement d’exécution, preview→aperçu,
   * review→revue.
   */
  enterprise: {
    title: 'Enterprise',
    eyebrow: 'Solutions',
    description:
      'Déployez E-Code avec le SSO, SCIM, les journaux d’audit, des contrôles de sécurité, une planification d’environnement d’exécution privé et le support.',
    highlights: ['SSO et SCIM', 'Export d’audit', 'Déploiement privé', 'Support premium'],
    sections: [
      {
        title: 'Ce que vous pouvez créer',
        body: 'Enterprise offre aux équipes un chemin plus rapide de l’idée à un projet typé et vérifiable, avec un aperçu en cours d’exécution.',
        items: ['SSO et SCIM', 'Export d’audit', 'Déploiement privé', 'Support premium'],
      },
      {
        title: 'Flux de production',
        body: 'Chaque projet généré doit pouvoir être inspecté et testé, et prêt pour la planification du déploiement.',
        items: [
          'Du prompt au projet',
          'Revue du code',
          'Aperçu de l’environnement d’exécution',
          'Parcours de déploiement',
        ],
      },
    ],
    primaryActionLabel: 'Commencer à créer',
    secondaryActionLabel: 'Contacter l’équipe commerciale',
  },
} as const satisfies Record<keyof typeof marketingPageCopyEn, MarketingPageCopy>;

export const marketingAuxiliaryPageCopyEn = {
  'github-codespaces': {
    title: 'E-Code vs GitHub Codespaces',
    eyebrow: 'Compare',
    description:
      "Repository-native cloud workspaces compared with E-Code's AI-powered IDE, governed runtimes, previews and enterprise delivery workflow.",
    primaryActionLabel: 'Try E-Code',
    secondaryActionLabel: 'Compare all',
    highlights: ['AI product generation', 'Preview-first delivery', 'Enterprise release flow'],
    sections: [
      {
        title: 'Where E-Code is different',
        body: 'E-Code is designed for the full loop: prompt, edit, run, validate, preview and deploy with team controls.',
        items: ['AI product generation', 'Preview-first delivery', 'Enterprise release flow'],
      },
      {
        title: 'Best fit',
        body: 'Choose E-Code when the team needs production intent, governance and AI assistance in the same workspace.',
        items: ['Enterprise teams', 'AI product builds', 'Internal platforms', 'Mobile-ready development'],
      },
    ],
  },
  glitch: {
    title: 'E-Code vs Glitch',
    eyebrow: 'Compare',
    description:
      "Creative app prototyping compared with E-Code's AI-powered IDE, governed runtimes, previews and enterprise delivery workflow.",
    primaryActionLabel: 'Try E-Code',
    secondaryActionLabel: 'Compare all',
    highlights: ['Production runtime controls', 'Team governance', 'Deployment guardrails'],
    sections: [
      {
        title: 'Where E-Code is different',
        body: 'E-Code is designed for the full loop: prompt, edit, run, validate, preview and deploy with team controls.',
        items: ['Production runtime controls', 'Team governance', 'Deployment guardrails'],
      },
      {
        title: 'Best fit',
        body: 'Choose E-Code when the team needs production intent, governance and AI assistance in the same workspace.',
        items: ['Enterprise teams', 'AI product builds', 'Internal platforms', 'Mobile-ready development'],
      },
    ],
  },
  heroku: {
    title: 'E-Code vs Heroku',
    eyebrow: 'Compare',
    description:
      "Application hosting compared with E-Code's AI-powered IDE, governed runtimes, previews and enterprise delivery workflow.",
    primaryActionLabel: 'Try E-Code',
    secondaryActionLabel: 'Compare all',
    highlights: ['IDE plus hosting flow', 'AI agent workflow', 'Code-to-preview loop'],
    sections: [
      {
        title: 'Where E-Code is different',
        body: 'E-Code is designed for the full loop: prompt, edit, run, validate, preview and deploy with team controls.',
        items: ['IDE plus hosting flow', 'AI agent workflow', 'Code-to-preview loop'],
      },
      {
        title: 'Best fit',
        body: 'Choose E-Code when the team needs production intent, governance and AI assistance in the same workspace.',
        items: ['Enterprise teams', 'AI product builds', 'Internal platforms', 'Mobile-ready development'],
      },
    ],
  },
  codesandbox: {
    title: 'E-Code vs CodeSandbox',
    eyebrow: 'Compare',
    description:
      "Browser sandboxes compared with E-Code's AI-powered IDE, governed runtimes, previews and enterprise delivery workflow.",
    primaryActionLabel: 'Try E-Code',
    secondaryActionLabel: 'Compare all',
    highlights: ['Persistent enterprise projects', 'Agent-aware validation', 'Mobile-ready workflows'],
    sections: [
      {
        title: 'Where E-Code is different',
        body: 'E-Code is designed for the full loop: prompt, edit, run, validate, preview and deploy with team controls.',
        items: ['Persistent enterprise projects', 'Agent-aware validation', 'Mobile-ready workflows'],
      },
      {
        title: 'Best fit',
        body: 'Choose E-Code when the team needs production intent, governance and AI assistance in the same workspace.',
        items: ['Enterprise teams', 'AI product builds', 'Internal platforms', 'Mobile-ready development'],
      },
    ],
  },
  'aws-cloud9': {
    title: 'E-Code vs AWS Cloud9',
    eyebrow: 'Compare',
    description:
      "Cloud IDE infrastructure compared with E-Code's AI-powered IDE, governed runtimes, previews and enterprise delivery workflow.",
    primaryActionLabel: 'Try E-Code',
    secondaryActionLabel: 'Compare all',
    highlights: ['Modern AI builder', 'Release visibility', 'Team-ready UX'],
    sections: [
      {
        title: 'Where E-Code is different',
        body: 'E-Code is designed for the full loop: prompt, edit, run, validate, preview and deploy with team controls.',
        items: ['Modern AI builder', 'Release visibility', 'Team-ready UX'],
      },
      {
        title: 'Best fit',
        body: 'Choose E-Code when the team needs production intent, governance and AI assistance in the same workspace.',
        items: ['Enterprise teams', 'AI product builds', 'Internal platforms', 'Mobile-ready development'],
      },
    ],
  },
  bounties: {
    title: 'Bounties',
    eyebrow: 'Marketing',
    description:
      'Activate an on-demand developer network to accelerate implementation, bug fixing and project completion.',
    primaryActionLabel: 'Start building',
    secondaryActionLabel: 'Contact sales',
    highlights: ['Scoped tasks', 'Review loops', 'Delivery tracking', 'Quality gates'],
    sections: [
      {
        title: 'Bounties workflow',
        body: 'Activate an on-demand developer network to accelerate implementation, bug fixing and project completion.',
        items: ['Scoped tasks', 'Review loops', 'Delivery tracking', 'Quality gates'],
      },
      {
        title: 'Governed delivery',
        body: 'The same E-Code controls apply across generation, collaboration, preview and release workflows.',
        items: ['Team access', 'Audit visibility', 'Runtime feedback', 'Release checks'],
      },
    ],
  },
  deployments: {
    title: 'Deployments',
    eyebrow: 'Marketing',
    description: 'Move from prompt to preview to release with logs, domains, runtime health and production guardrails.',
    primaryActionLabel: 'Start building',
    secondaryActionLabel: 'Contact sales',
    highlights: ['Preview URLs', 'Runtime logs', 'Custom domains', 'Release checks'],
    sections: [
      {
        title: 'Deployments workflow',
        body: 'Move from prompt to preview to release with logs, domains, runtime health and production guardrails.',
        items: ['Preview URLs', 'Runtime logs', 'Custom domains', 'Release checks'],
      },
      {
        title: 'Governed delivery',
        body: 'The same E-Code controls apply across generation, collaboration, preview and release workflows.',
        items: ['Team access', 'Audit visibility', 'Runtime feedback', 'Release checks'],
      },
    ],
  },
  teams: {
    title: 'Teams',
    eyebrow: 'Marketing',
    description:
      'Coordinate enterprise development with members, roles, audit trails, shared billing and governed project access.',
    primaryActionLabel: 'Start building',
    secondaryActionLabel: 'Contact sales',
    highlights: ['Members and roles', 'Audit logs', 'Shared billing', 'Project governance'],
    sections: [
      {
        title: 'Teams workflow',
        body: 'Coordinate enterprise development with members, roles, audit trails, shared billing and governed project access.',
        items: ['Members and roles', 'Audit logs', 'Shared billing', 'Project governance'],
      },
      {
        title: 'Governed delivery',
        body: 'The same E-Code controls apply across generation, collaboration, preview and release workflows.',
        items: ['Team access', 'Audit visibility', 'Runtime feedback', 'Release checks'],
      },
    ],
  },
  newsletter: {
    title: 'E-Code Newsletter',
    eyebrow: 'Newsletter',
    description:
      'Product updates, engineering notes, template drops and security announcements for teams building with E-Code.',
    primaryActionLabel: 'Confirm preferences',
    secondaryActionLabel: 'Read changelog',
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
    title: 'Newsletter confirmed',
    eyebrow: 'Newsletter',
    description:
      'Your E-Code newsletter subscription is confirmed. Product updates and technical notes will arrive soon.',
    primaryActionLabel: 'Read changelog',
    secondaryActionLabel: 'Start building',
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
    title: 'Confirm newsletter subscription',
    eyebrow: 'Newsletter',
    description: 'Confirm your email preferences to receive E-Code product and engineering updates.',
    primaryActionLabel: 'Confirm preferences',
    secondaryActionLabel: 'Back to home',
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
    title: 'Email preferences',
    eyebrow: 'Newsletter',
    description: 'Manage or unsubscribe from E-Code newsletter and product update emails.',
    primaryActionLabel: 'Keep product updates',
    secondaryActionLabel: 'Back to home',
    highlights: ['Newsletter', 'Product updates', 'Security notices', 'Preferences'],
    sections: [
      {
        title: 'Preference management',
        body: 'Transactional and security emails may still be sent when required for account operation.',
        items: ['Newsletter settings', 'Product updates', 'Security notices', 'Account emails'],
      },
    ],
  },
} as const satisfies Record<string, MarketingPageCopy>;

export const marketingAuxiliaryPageCopyFr = {
  'github-codespaces': {
    title: 'E-Code face à GitHub Codespaces',
    eyebrow: 'Comparatif',
    description:
      'Les espaces de travail cloud centrés sur les dépôts face à l’IDE propulsé par IA d’E-Code, ses environnements d’exécution gouvernés, ses aperçus et son flux de livraison d’entreprise.',
    primaryActionLabel: 'Essayer E-Code',
    secondaryActionLabel: 'Voir tous les comparatifs',
    highlights: [
      'Génération de produits par IA',
      'Livraison centrée sur l’aperçu',
      'Flux de mise en production d’entreprise',
    ],
    sections: [
      {
        title: 'Ce qui distingue E-Code',
        body: 'E-Code est conçu pour couvrir tout le cycle : prompt, édition, exécution, validation, aperçu et déploiement avec des contrôles d’équipe.',
        items: [
          'Génération de produits par IA',
          'Livraison centrée sur l’aperçu',
          'Flux de mise en production d’entreprise',
        ],
      },
      {
        title: 'Pour quels besoins ?',
        body: 'Choisissez E-Code lorsque l’équipe a besoin d’une vision production, de gouvernance et d’une assistance IA dans un même espace de travail.',
        items: [
          'Équipes d’entreprise',
          'Création de produits d’IA',
          'Plateformes internes',
          'Développement adapté au mobile',
        ],
      },
    ],
  },
  glitch: {
    title: 'E-Code face à Glitch',
    eyebrow: 'Comparatif',
    description:
      'Le prototypage créatif d’applications face à l’IDE propulsé par IA d’E-Code, ses environnements d’exécution gouvernés, ses aperçus et son flux de livraison d’entreprise.',
    primaryActionLabel: 'Essayer E-Code',
    secondaryActionLabel: 'Voir tous les comparatifs',
    highlights: ['Contrôles d’exécution de production', 'Gouvernance d’équipe', 'Garde-fous de déploiement'],
    sections: [
      {
        title: 'Ce qui distingue E-Code',
        body: 'E-Code est conçu pour couvrir tout le cycle : prompt, édition, exécution, validation, aperçu et déploiement avec des contrôles d’équipe.',
        items: ['Contrôles d’exécution de production', 'Gouvernance d’équipe', 'Garde-fous de déploiement'],
      },
      {
        title: 'Pour quels besoins ?',
        body: 'Choisissez E-Code lorsque l’équipe a besoin d’une vision production, de gouvernance et d’une assistance IA dans un même espace de travail.',
        items: [
          'Équipes d’entreprise',
          'Création de produits d’IA',
          'Plateformes internes',
          'Développement adapté au mobile',
        ],
      },
    ],
  },
  heroku: {
    title: 'E-Code face à Heroku',
    eyebrow: 'Comparatif',
    description:
      'L’hébergement d’applications face à l’IDE propulsé par IA d’E-Code, ses environnements d’exécution gouvernés, ses aperçus et son flux de livraison d’entreprise.',
    primaryActionLabel: 'Essayer E-Code',
    secondaryActionLabel: 'Voir tous les comparatifs',
    highlights: ['IDE et hébergement intégrés', 'Flux de travail avec l’agent IA', 'Boucle du code à l’aperçu'],
    sections: [
      {
        title: 'Ce qui distingue E-Code',
        body: 'E-Code est conçu pour couvrir tout le cycle : prompt, édition, exécution, validation, aperçu et déploiement avec des contrôles d’équipe.',
        items: ['IDE et hébergement intégrés', 'Flux de travail avec l’agent IA', 'Boucle du code à l’aperçu'],
      },
      {
        title: 'Pour quels besoins ?',
        body: 'Choisissez E-Code lorsque l’équipe a besoin d’une vision production, de gouvernance et d’une assistance IA dans un même espace de travail.',
        items: [
          'Équipes d’entreprise',
          'Création de produits d’IA',
          'Plateformes internes',
          'Développement adapté au mobile',
        ],
      },
    ],
  },
  codesandbox: {
    title: 'E-Code face à CodeSandbox',
    eyebrow: 'Comparatif',
    description:
      'Les sandboxes dans le navigateur face à l’IDE propulsé par IA d’E-Code, ses environnements d’exécution gouvernés, ses aperçus et son flux de livraison d’entreprise.',
    primaryActionLabel: 'Essayer E-Code',
    secondaryActionLabel: 'Voir tous les comparatifs',
    highlights: [
      'Projets d’entreprise persistants',
      'Validation tenant compte de l’agent',
      'Flux de travail adaptés au mobile',
    ],
    sections: [
      {
        title: 'Ce qui distingue E-Code',
        body: 'E-Code est conçu pour couvrir tout le cycle : prompt, édition, exécution, validation, aperçu et déploiement avec des contrôles d’équipe.',
        items: [
          'Projets d’entreprise persistants',
          'Validation tenant compte de l’agent',
          'Flux de travail adaptés au mobile',
        ],
      },
      {
        title: 'Pour quels besoins ?',
        body: 'Choisissez E-Code lorsque l’équipe a besoin d’une vision production, de gouvernance et d’une assistance IA dans un même espace de travail.',
        items: [
          'Équipes d’entreprise',
          'Création de produits d’IA',
          'Plateformes internes',
          'Développement adapté au mobile',
        ],
      },
    ],
  },
  'aws-cloud9': {
    title: 'E-Code face à AWS Cloud9',
    eyebrow: 'Comparatif',
    description:
      'L’infrastructure d’IDE cloud face à l’IDE propulsé par IA d’E-Code, ses environnements d’exécution gouvernés, ses aperçus et son flux de livraison d’entreprise.',
    primaryActionLabel: 'Essayer E-Code',
    secondaryActionLabel: 'Voir tous les comparatifs',
    highlights: ['Builder IA moderne', 'Visibilité des mises en production', 'UX prête pour les équipes'],
    sections: [
      {
        title: 'Ce qui distingue E-Code',
        body: 'E-Code est conçu pour couvrir tout le cycle : prompt, édition, exécution, validation, aperçu et déploiement avec des contrôles d’équipe.',
        items: ['Builder IA moderne', 'Visibilité des mises en production', 'UX prête pour les équipes'],
      },
      {
        title: 'Pour quels besoins ?',
        body: 'Choisissez E-Code lorsque l’équipe a besoin d’une vision production, de gouvernance et d’une assistance IA dans un même espace de travail.',
        items: [
          'Équipes d’entreprise',
          'Création de produits d’IA',
          'Plateformes internes',
          'Développement adapté au mobile',
        ],
      },
    ],
  },
  bounties: {
    title: 'Primes',
    eyebrow: 'Marketing',
    description:
      'Activez un réseau de développeurs à la demande pour accélérer l’implémentation, la correction des bugs et l’achèvement des projets.',
    primaryActionLabel: 'Commencer à créer',
    secondaryActionLabel: 'Contacter l’équipe commerciale',
    highlights: ['Tâches délimitées', 'Boucles de revue', 'Suivi des livraisons', 'Seuils de qualité'],
    sections: [
      {
        title: 'Flux de gestion des primes',
        body: 'Activez un réseau de développeurs à la demande pour accélérer l’implémentation, la correction des bugs et l’achèvement des projets.',
        items: ['Tâches délimitées', 'Boucles de revue', 'Suivi des livraisons', 'Seuils de qualité'],
      },
      {
        title: 'Livraison gouvernée',
        body: 'Les mêmes contrôles E-Code s’appliquent à la génération, à la collaboration, aux aperçus et aux mises en production.',
        items: [
          'Accès de l’équipe',
          'Visibilité pour l’audit',
          'Retours d’exécution',
          'Contrôles de mise en production',
        ],
      },
    ],
  },
  deployments: {
    title: 'Déploiements',
    eyebrow: 'Marketing',
    description:
      'Passez du prompt à l’aperçu puis à la mise en production, avec journaux, domaines, état d’exécution et garde-fous de production.',
    primaryActionLabel: 'Commencer à créer',
    secondaryActionLabel: 'Contacter l’équipe commerciale',
    highlights: ['URL d’aperçu', 'Journaux d’exécution', 'Domaines personnalisés', 'Contrôles de mise en production'],
    sections: [
      {
        title: 'Flux de déploiement',
        body: 'Passez du prompt à l’aperçu puis à la mise en production, avec journaux, domaines, état d’exécution et garde-fous de production.',
        items: ['URL d’aperçu', 'Journaux d’exécution', 'Domaines personnalisés', 'Contrôles de mise en production'],
      },
      {
        title: 'Livraison gouvernée',
        body: 'Les mêmes contrôles E-Code s’appliquent à la génération, à la collaboration, aux aperçus et aux mises en production.',
        items: [
          'Accès de l’équipe',
          'Visibilité pour l’audit',
          'Retours d’exécution',
          'Contrôles de mise en production',
        ],
      },
    ],
  },
  teams: {
    title: 'Équipes',
    eyebrow: 'Marketing',
    description:
      'Coordonnez le développement d’entreprise avec les membres, les rôles, les pistes d’audit, la facturation partagée et un accès gouverné aux projets.',
    primaryActionLabel: 'Commencer à créer',
    secondaryActionLabel: 'Contacter l’équipe commerciale',
    highlights: ['Membres et rôles', 'Journaux d’audit', 'Facturation partagée', 'Gouvernance des projets'],
    sections: [
      {
        title: 'Flux de travail d’équipe',
        body: 'Coordonnez le développement d’entreprise avec les membres, les rôles, les pistes d’audit, la facturation partagée et un accès gouverné aux projets.',
        items: ['Membres et rôles', 'Journaux d’audit', 'Facturation partagée', 'Gouvernance des projets'],
      },
      {
        title: 'Livraison gouvernée',
        body: 'Les mêmes contrôles E-Code s’appliquent à la génération, à la collaboration, aux aperçus et aux mises en production.',
        items: [
          'Accès de l’équipe',
          'Visibilité pour l’audit',
          'Retours d’exécution',
          'Contrôles de mise en production',
        ],
      },
    ],
  },
  newsletter: {
    title: 'Newsletter E-Code',
    eyebrow: 'Newsletter',
    description:
      'Actualités produit, notes d’ingénierie, nouveaux modèles et annonces de sécurité pour les équipes qui créent avec E-Code.',
    primaryActionLabel: 'Confirmer les préférences',
    secondaryActionLabel: 'Lire le journal des modifications',
    highlights: ['Actualités produit', 'Notes d’ingénierie', 'Nouveaux modèles', 'Avis de sécurité'],
    sections: [
      {
        title: 'Au programme de la newsletter',
        body: 'La newsletter privilégie les notes de version utiles, les conseils pratiques et les bonnes pratiques de développement d’IA en production.',
        items: ['Nouvelles fonctionnalités', 'Nouveaux modèles', 'Notes de sécurité', 'Conseils opérationnels'],
      },
      {
        title: 'Gestion des préférences',
        body: 'Vous pouvez confirmer vos préférences ou vous désabonner des e-mails marketing tout en continuant à recevoir les avis transactionnels et de sécurité obligatoires.',
        items: ['Confirmer l’abonnement', 'Gérer les préférences', 'Se désabonner', 'Avis de sécurité du compte'],
      },
    ],
  },
  confirmed: {
    title: 'Newsletter confirmée',
    eyebrow: 'Newsletter',
    description:
      'Votre abonnement à la newsletter E-Code est confirmé. Vous recevrez bientôt les actualités produit et les notes techniques.',
    primaryActionLabel: 'Lire le journal des modifications',
    secondaryActionLabel: 'Commencer à créer',
    highlights: ['Actualités produit', 'Notes d’ingénierie', 'Temps forts des versions', 'Nouveaux modèles'],
    sections: [
      {
        title: 'À quoi vous attendre',
        body: 'Des actualités courtes et utiles sur la plateforme E-Code et les flux de développement d’IA en production.',
        items: ['Nouvelles fonctionnalités', 'Mises à jour de sécurité', 'Guides pratiques', 'Retours de clients'],
      },
    ],
  },
  confirm: {
    title: 'Confirmer l’abonnement à la newsletter',
    eyebrow: 'Newsletter',
    description: 'Confirmez vos préférences d’e-mail pour recevoir les actualités produit et ingénierie d’E-Code.',
    primaryActionLabel: 'Confirmer les préférences',
    secondaryActionLabel: 'Retour à l’accueil',
    highlights: ['Actualités produit', 'Guides techniques', 'Notes de version', 'Aucun contenu superflu'],
    sections: [
      {
        title: 'Préférences d’e-mail',
        body: 'Utilisez cette page pour confirmer qu’E-Code peut vous envoyer ses actualités produit.',
        items: ['Journal des modifications', 'Modèles', 'Notes de sécurité', 'Guides de la plateforme'],
      },
    ],
  },
  unsubscribe: {
    title: 'Préférences d’e-mail',
    eyebrow: 'Newsletter',
    description: 'Gérez les e-mails de la newsletter et des actualités produit E-Code, ou désabonnez-vous.',
    primaryActionLabel: 'Conserver les actualités produit',
    secondaryActionLabel: 'Retour à l’accueil',
    highlights: ['Newsletter', 'Actualités produit', 'Avis de sécurité', 'Préférences'],
    sections: [
      {
        title: 'Gestion des préférences',
        body: 'Les e-mails transactionnels et de sécurité peuvent toujours être envoyés lorsqu’ils sont nécessaires au fonctionnement du compte.',
        items: ['Paramètres de la newsletter', 'Actualités produit', 'Avis de sécurité', 'E-mails du compte'],
      },
    ],
  },
} as const satisfies Record<keyof typeof marketingAuxiliaryPageCopyEn, MarketingPageCopy>;
