import { resolveMarketingLanguage, type MarketingLanguage } from './marketing';

export type AiPlatformFeatureId = 'autonomous' | 'languages' | 'generation' | 'assistance';
export type AiToolId = 'search' | 'visual-editor' | 'analysis' | 'performance' | 'packages' | 'debug';
export type ProductFeatureCategoryId =
  | 'all'
  | 'development'
  | 'collaboration'
  | 'infrastructure'
  | 'security'
  | 'analytics';
export type ProductFeatureId =
  | 'ai-agent'
  | 'ide'
  | 'command-center'
  | 'files'
  | 'features'
  | 'multiplayer'
  | 'save-progress'
  | 'always-available'
  | 'database'
  | 'deployment'
  | 'security'
  | 'secrets'
  | 'monitoring';
export type MobileFeatureId = 'editor' | 'terminal' | 'ai' | 'preview' | 'collab' | 'git';
export type DeploymentModeId = 'autoscale' | 'reserved' | 'static';
export type TeamFeatureId = 'multiplayer' | 'git' | 'communication' | 'security' | 'environments' | 'performance';

type TextPair = readonly [string, string];

interface ProductRemainingCopy {
  aiPlatform: {
    badge: string;
    heroTitle: string;
    heroAccent: string;
    heroDescription: string;
    start: string;
    watchDemo: string;
    highlights: readonly TextPair[];
    heroDemo: { eyebrow: string; title: string; description: string; metrics: readonly TextPair[] };
    demoIntro: { title: string; description: string };
    demo: { eyebrow: string; title: string; description: string; metrics: readonly TextPair[] };
    capabilitiesIntro: { title: string; description: string };
    features: readonly {
      key: AiPlatformFeatureId;
      title: string;
      description: string;
      details: readonly string[];
    }[];
    toolsIntro: { title: string; description: string };
    tools: readonly { id: AiToolId; name: string; description: string }[];
    useCasesIntro: { title: string; description: string };
    useCases: readonly TextPair[];
  };
  features: {
    heroBadge: string;
    heroTitle: string;
    heroDescription: string;
    start: string;
    docs: string;
    tabs: readonly { id: ProductFeatureCategoryId; label: string }[];
    items: readonly {
      id: ProductFeatureId;
      title: string;
      category: ProductFeatureCategoryId;
      description: string;
      bullets: readonly string[];
    }[];
    ideIntro: { title: string; description: string };
    ideCards: readonly TextPair[];
    multiplayerIntro: { title: string; description: string };
    multiplayerCards: readonly TextPair[];
  };
  mobile: {
    heroBadge: string;
    heroTitle: string;
    heroDescription: string;
    start: string;
    explore: string;
    intro: { title: string; description: string };
    features: readonly { id: MobileFeatureId; title: string; description: string; details: readonly string[] }[];
    productName: string;
    live: string;
    terminalAuthenticated: string;
    terminalChecksPassed: string;
    terminalDeployReady: string;
    devicePreviews: string;
    edgePreview: string;
    devices: readonly string[];
  };
  deployments: {
    heroBadge: string;
    heroTitle: string;
    heroDescription: string;
    expert: string;
    docs: string;
    modesIntro: { title: string; description: string };
    modes: readonly {
      id: DeploymentModeId;
      title: string;
      description: string;
      bullets: readonly string[];
    }[];
    capabilities: readonly TextPair[];
    workflowIntro: { title: string; description: string };
    workflow: readonly TextPair[];
    controlIntro: { title: string; description: string };
    controls: readonly TextPair[];
    status: { live: string; healthy: string; metrics: readonly TextPair[] };
  };
  bounties: {
    heroBadge: string;
    heroTitle: string;
    heroDescription: string;
    launch: string;
    contact: string;
    proof: readonly string[];
    summaryTitle: string;
    highlights: readonly TextPair[];
    audienceIntro: { title: string; description: string };
    audience: readonly TextPair[];
    workflowIntro: { title: string; description: string };
    workflow: readonly TextPair[];
    categoriesIntro: { title: string; description: string };
    categories: readonly string[];
  };
  teams: {
    heroBadge: string;
    heroTitle: string;
    heroDescription: string;
    start: string;
    contact: string;
    featuresIntro: { title: string; description: string };
    features: readonly { id: TeamFeatureId; title: string; description: string }[];
    audiencesIntro: { title: string; description: string };
    audiences: readonly { title: string; description: string; bullets: readonly string[] }[];
    workspaceIntro: { title: string; description: string };
    workspaceAlt: string;
    workspaceCaption: string;
    ctaBadge: string;
    ctaTitle: string;
    ctaDescription: string;
  };
  workbench: {
    states: readonly string[];
  };
}

export const marketingProductRemainingEn = {
  aiPlatform: {
    badge: 'POWERED BY E-CODE.AI',
    heroTitle: 'Enterprise AI That',
    heroAccent: 'Builds Applications',
    heroDescription:
      'Transform ideas into production-ready applications in minutes. Our AI understands 100+ languages and writes professional code automatically.',
    start: 'Start Building Now',
    watchDemo: 'Watch Demo',
    highlights: [
      ['Natural language', 'Describe the app in plain English'],
      ['Full-stack output', 'Frontend, backend and data layer'],
      ['100+ languages', 'TypeScript, Python, Node and more'],
      ['One-click deploy', 'Ship to the cloud from the workspace'],
    ],
    heroDemo: {
      eyebrow: 'Live preview',
      title: 'AI agent assembling a production-ready dashboard',
      description: 'Prompt, architecture, code, checks and deployment stay visible in one workflow.',
      metrics: [
        ['Multi-step', 'planning'],
        ['Automated', 'code reviews'],
        ['1-click', 'deployment'],
      ],
    },
    demoIntro: {
      title: 'See AI in Action',
      description: 'Watch how teams build applications faster with E-Code AI technology.',
    },
    demo: {
      eyebrow: 'Live Platform Demo',
      title: 'From prompt to production in under two minutes',
      description: 'The AI agent scaffolds a SaaS dashboard, configures infrastructure and ships to the cloud.',
      metrics: [
        ['E-commerce', 'in 5 minutes'],
        ['SaaS', 'dashboard demo'],
        ['Multilingual', 'app creation'],
      ],
    },
    capabilitiesIntro: {
      title: 'AI Agent Capabilities',
      description: 'Powerful features that make building effortless.',
    },
    features: [
      {
        key: 'autonomous',
        title: 'Autonomous Building',
        description: 'Just describe what you want. The AI agent builds complete applications from scratch.',
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
        details: ['TypeScript and React', 'Node.js APIs', 'Python services', 'Database-backed applications'],
      },
      {
        key: 'generation',
        title: 'Intelligent Code Generation',
        description: 'Production-ready code with architecture, state, validation and styling handled automatically.',
        details: ['Typed components', 'API routes', 'Data models', 'Responsive layouts', 'Error states'],
      },
      {
        key: 'assistance',
        title: 'Real-time Assistance',
        description: 'The assistant keeps helping while you inspect, run, debug and deploy.',
        details: ['Explains code', 'Fixes errors', 'Reviews performance', 'Suggests next steps'],
      },
    ],
    toolsIntro: {
      title: 'AI-Powered Tools',
      description: 'Advanced capabilities that help AI build better applications.',
    },
    tools: [
      { id: 'search', name: 'Web Search', description: 'Finds current documentation and examples while building.' },
      { id: 'visual-editor', name: 'Visual Editor', description: 'Tunes layout, theme and component hierarchy.' },
      { id: 'analysis', name: 'Code Analysis', description: 'Reads project files and identifies implementation gaps.' },
      {
        id: 'performance',
        name: 'Performance',
        description: 'Surfaces slow paths, bundle weight and runtime bottlenecks.',
      },
      { id: 'packages', name: 'Package Manager', description: 'Adds dependencies and keeps project setup coherent.' },
      { id: 'debug', name: 'Debug Assistant', description: 'Connects errors to concrete code changes.' },
    ],
    useCasesIntro: {
      title: 'Who Uses Our AI Agent?',
      description: 'From complete beginners to experienced developers.',
    },
    useCases: [
      ['Complete Beginners', 'Turn an idea into an app without knowing the full stack first.'],
      ['Rapid Prototyping', 'Validate a product flow quickly with real files and a running preview.'],
      ['Learning Projects', 'Study how the generated project is structured while you modify it.'],
      ['Business Solutions', 'Create internal tools, portals and dashboards from operational requirements.'],
    ],
  },
  features: {
    heroBadge: 'Everything you need in one place',
    heroTitle: 'Features that empower developers',
    heroDescription:
      'From writing your first line of code to deploying at scale, E-Code provides all the tools you need in a single platform.',
    start: 'Start building',
    docs: 'View documentation',
    tabs: [
      { id: 'all', label: 'All' },
      { id: 'development', label: 'Development' },
      { id: 'collaboration', label: 'Collaboration' },
      { id: 'infrastructure', label: 'Infrastructure' },
      { id: 'security', label: 'Security' },
      { id: 'analytics', label: 'Analytics' },
    ],
    items: [
      {
        id: 'ai-agent',
        title: 'AI Agent — Your Personal Developer',
        category: 'development',
        description: 'Tell E-Code what you want to build and the agent creates the project, files and flow.',
        bullets: ['Natural-language prompts', 'Project generation', 'Build correction'],
      },
      {
        id: 'ide',
        title: 'Friendly Code Editor',
        category: 'development',
        description: 'A browser IDE with files, editor tabs, previews, terminal and project context in one place.',
        bullets: ['File tree and editor', 'Live preview', 'Terminal output'],
      },
      {
        id: 'command-center',
        title: 'Command Center',
        category: 'development',
        description: 'Run commands, inspect output and keep the development workflow visible.',
        bullets: ['Terminal control', 'Run scripts', 'Inspect logs'],
      },
      {
        id: 'files',
        title: 'Your Project Files',
        category: 'development',
        description: 'Understand and edit generated project files directly in the workspace.',
        bullets: ['Project tree', 'Readable files', 'Patch review'],
      },
      {
        id: 'features',
        title: 'Add Cool Features',
        category: 'development',
        description: 'Ask for changes and E-Code updates the application without losing context.',
        bullets: ['Feature prompts', 'Refinement loops', 'UI changes'],
      },
      {
        id: 'multiplayer',
        title: 'Learn Together',
        category: 'collaboration',
        description: 'Build with teammates through shared presence, reviews and live project context.',
        bullets: ['Shared presence', 'Pair programming', 'Review loops'],
      },
      {
        id: 'save-progress',
        title: 'Save Your Progress',
        category: 'infrastructure',
        description: 'Keep work recoverable with project history, branches and deployable snapshots.',
        bullets: ['Git context', 'Snapshots', 'Recoverable edits'],
      },
      {
        id: 'always-available',
        title: 'Always Available',
        category: 'infrastructure',
        description: 'Access projects and previews from the browser without local setup.',
        bullets: ['Cloud workspaces', 'Hosted previews', 'Device handoff'],
      },
      {
        id: 'database',
        title: 'Built-in Database',
        category: 'infrastructure',
        description: 'Generate and connect data-backed applications without leaving the workspace.',
        bullets: ['Schema planning', 'Data operations', 'Database visibility'],
      },
      {
        id: 'deployment',
        title: 'One-Click Deploy',
        category: 'infrastructure',
        description: 'Move from working preview to production release with a managed deployment flow.',
        bullets: ['Preview URL', 'Deploy checks', 'Rollback path'],
      },
      {
        id: 'security',
        title: 'Enterprise Security',
        category: 'security',
        description: 'Protect projects with secure defaults, audit context and governed access.',
        bullets: ['SSO-ready identity', 'Audit trails', 'Access controls'],
      },
      {
        id: 'secrets',
        title: 'Secret Management',
        category: 'security',
        description: 'Keep environment secrets separated from generated code and shared collaboration.',
        bullets: ['Scoped secrets', 'Runtime injection', 'Permission boundaries'],
      },
      {
        id: 'monitoring',
        title: 'Performance Monitoring',
        category: 'analytics',
        description: 'Inspect runtime feedback and understand how deployed apps are behaving.',
        bullets: ['Runtime metrics', 'Health signals', 'Deployment insights'],
      },
    ],
    ideIntro: {
      title: 'Browser IDE',
      description: 'Panels, terminal, Git, preview, problems and settings built for repeated engineering work.',
    },
    ideCards: [
      ['File tree and editor', 'Edit generated code directly with project context visible.'],
      ['Terminal and preview', 'Run commands and inspect the app without leaving the browser.'],
      ['Agent patch review', 'Review what the AI changed before committing work.'],
      ['Deployment path', 'Move from preview to production with release controls.'],
    ],
    multiplayerIntro: {
      title: 'Multiplayer collaboration',
      description: 'Live collaboration, pair programming and shared presence for teams building together.',
    },
    multiplayerCards: [
      ['Live presence', 'See teammates, cursors, focus areas and active reviews.'],
      ['Shared project context', 'Files, terminal output, preview state and agent plans stay visible.'],
      ['Review loops', 'Discuss generated changes and deployment readiness in one workflow.'],
    ],
  },
  mobile: {
    heroBadge: 'Build from anywhere',
    heroTitle: 'The full E-Code workspace, now mobile',
    heroDescription:
      'Edit code, run terminals, collaborate, review Git history and deploy production apps from phone or tablet.',
    start: 'Start mobile workspace',
    explore: 'Explore mobile apps',
    intro: {
      title: 'Mobile tools for real production work',
      description: 'Feature-complete controls for editor, terminal, AI, preview, collaboration and Git.',
    },
    features: [
      {
        id: 'editor',
        title: 'Full-Featured Editor',
        description: 'Edit TypeScript, routes and configuration from phone or tablet.',
        details: [
          'Syntax-highlighted code editor',
          'Project file browser',
          'Tablet-friendly layout',
          'Touch-ready commands',
        ],
      },
      {
        id: 'terminal',
        title: 'Integrated Terminal',
        description: 'Run commands, tests and deploy scripts from mobile.',
        details: ['Run npm scripts', 'Inspect logs', 'Deploy from the command line', 'Reset command history'],
      },
      {
        id: 'ai',
        title: 'AI Assistant',
        description: 'Ask the agent to explain, optimize or implement directly from the device.',
        details: ['Optimize sync queues', 'Draft release notes', 'Explain hooks and state', 'Apply suggestions'],
      },
      {
        id: 'preview',
        title: 'Live Preview',
        description: 'Inspect responsive previews across phones and tablets.',
        details: ['iPhone 15 Pro', 'Pixel 8', 'iPad Pro 13"', 'Portrait and landscape checks'],
      },
      {
        id: 'collab',
        title: 'Real-time Collaboration',
        description: 'Presence and reviews stay synced while your team ships.',
        details: ['Live presence', 'Code review threads', 'Slack and Teams sync', 'Approvals from mobile'],
      },
      {
        id: 'git',
        title: 'Version Control',
        description: 'Review commits, branches and sync status without switching apps.',
        details: ['Commit history', 'Branch context', 'Workspace sync', 'Review before deploy'],
      },
    ],
    productName: 'E-Code Mobile',
    live: 'LIVE',
    terminalAuthenticated: 'Authenticated with Enterprise SSO',
    terminalChecksPassed: 'All mobile viewport checks passed',
    terminalDeployReady: 'Edge deploy ready',
    devicePreviews: 'Device previews',
    edgePreview: 'Edge preview',
    devices: ['iPhone 15 Pro', 'Pixel 8', 'iPad Pro 13"'],
  },
  deployments: {
    heroBadge: 'Deploy from idea to internet in one click',
    heroTitle: 'Launch production-grade apps straight from your workspace',
    heroDescription:
      'E-Code Deployments pairs the simplicity of an in-browser IDE with the rigor of a global cloud platform. Ship instantly, observe everything and meet enterprise requirements without bolting together tools.',
    expert: 'Talk to an expert',
    docs: 'Explore deployment docs',
    modesIntro: {
      title: 'Choose the right deployment mode',
      description: 'Everything inside the deployment tab, elevated for production teams.',
    },
    modes: [
      {
        id: 'autoscale',
        title: 'Autoscale Apps',
        description: 'Deploy services that scale with traffic and stay observable from the workspace.',
        bullets: ['Zero-downtime releases', 'Health checks', 'Traffic-aware scaling'],
      },
      {
        id: 'reserved',
        title: 'Reserved VMs',
        description: 'Run predictable workloads with dedicated capacity and strong operational controls.',
        bullets: ['Reserved capacity', 'Stable networking', 'Controlled rollouts'],
      },
      {
        id: 'static',
        title: 'Static Sites',
        description: 'Publish frontends, docs and marketing sites with TLS and global routing.',
        bullets: ['Edge cache', 'Custom domains', 'Instant rollbacks'],
      },
    ],
    capabilities: [
      ['Global routing', 'Edge cache and custom domains with TLS'],
      ['Live observability', 'Requests, latency and errors after release'],
      ['Secure by default', 'Secrets, identity and deployment policy'],
      ['Instant rollbacks', 'Revert to a healthy release in one click'],
    ],
    workflowIntro: {
      title: 'Deployment workflow',
      description: 'Move from workspace to production with observable, governed releases.',
    },
    workflow: [
      ['Connect repo or start in E-Code', 'Use generated apps, imported repositories or in-browser workspaces.'],
      ['Configure once', 'Set domains, environment variables, branch rules and deployment policy.'],
      ['Deploy with confidence', 'Ship with logs, preview checks, TLS and rollback controls.'],
      ['Monitor and iterate', 'Observe requests, latency, usage and release health after every push.'],
    ],
    controlIntro: {
      title: 'Production control room',
      description: 'Real-time logs, analytics and one-click rollbacks keep teams shipping without downtime.',
    },
    controls: [
      ['Secure by default', 'TLS, secrets, identity and deployment policy stay attached to the release.'],
      ['Governed releases', 'Require approvals, enforce protected branches and log every deployment event.'],
      ['24/7 observability', 'Request rates, latency, errors and regions stay visible after release.'],
    ],
    status: {
      live: 'Live',
      healthy: 'Healthy',
      metrics: [
        ['Requests/min', '4.2k'],
        ['Latency p95', '112ms'],
        ['Autoscale', 'Enabled'],
        ['TLS', 'Issued'],
        ['Backups', 'Nightly'],
        ['Rollback', 'Ready'],
      ],
    },
  },
  bounties: {
    heroBadge: 'Developer marketplace',
    heroTitle: 'Ship features faster with outcome-based bounties',
    heroDescription:
      'Publish challenges, collaborate with expert builders and pay on delivery. E-Code handles recruiting, secure review environments and automated payouts.',
    launch: 'Launch your first bounty',
    contact: 'Talk to our team',
    proof: ['Global payouts managed', 'Review sandboxes included', 'SOC 2 aligned processes'],
    summaryTitle: 'How E-Code runs bounties',
    highlights: [
      ['Outcome-based', 'Pay on accepted, validated delivery'],
      ['Secure sandboxes', 'Isolated review workspaces per bounty'],
      ['Managed payouts', 'Global payments handled for you'],
      ['Governed access', 'SOC 2 aligned review processes'],
    ],
    audienceIntro: {
      title: 'Designed for product and platform teams',
      description:
        'Empower internal teams with curated external talent while maintaining governance, security and predictable delivery.',
    },
    audience: [
      ['Launch in minutes', 'Turn roadmap items, bugs and integration needs into clear outcome-based bounties.'],
      ['Verified experts', 'Match with builders who understand E-Code workflows, reviews and production delivery.'],
      ['Performance driven', 'Pay based on accepted work, validated output and measurable delivery milestones.'],
    ],
    workflowIntro: {
      title: 'How bounties work',
      description: 'Create the challenge, recruit the right talent, review and ship.',
    },
    workflow: [
      ['Create a bounty', 'Define acceptance criteria, budget, scope and security requirements.'],
      ['Recruit the right talent', 'E-Code matches verified experts and provides secure workspaces.'],
      ['Review & ship', 'Approve code, validate preview output and release with confidence.'],
    ],
    categoriesIntro: {
      title: 'Popular bounty categories',
      description: 'Use bounties for focused work with clear acceptance criteria.',
    },
    categories: [
      'AI & Agentic apps',
      'Full-stack products',
      'Dev tool integrations',
      'Platform migrations',
      'Education content',
      'Design systems',
    ],
  },
  teams: {
    heroBadge: 'Teams',
    heroTitle: 'Build Together, Ship Faster',
    heroDescription:
      'Real-time collaboration that feels like magic. Code, debug and deploy with your team in perfect sync.',
    start: 'Start Collaborating Free',
    contact: 'Contact Sales',
    featuresIntro: {
      title: 'Everything Your Team Needs',
      description: 'The public E-Code team page restored inside E-Code.',
    },
    features: [
      {
        id: 'multiplayer',
        title: 'Real-time Multiplayer',
        description: "See teammates' cursors, selections and edits in real time.",
      },
      {
        id: 'git',
        title: 'Advanced Version Control',
        description: 'Built-in Git workflows with branching, review and merge context.',
      },
      {
        id: 'communication',
        title: 'Integrated Communication',
        description: 'Threaded discussions and workspace context live beside the code.',
      },
      {
        id: 'security',
        title: 'Enterprise Security',
        description: 'SSO, 2FA, audit logs and granular permissions protect team work.',
      },
      {
        id: 'environments',
        title: 'Instant Environments',
        description: 'Spin up consistent development environments for every teammate.',
      },
      {
        id: 'performance',
        title: 'Global Performance',
        description: 'Low-latency collaboration from anywhere with global routing.',
      },
    ],
    audiencesIntro: {
      title: 'Built for Modern Teams',
      description: 'Remote teams and educational institutions get shared context without losing controls.',
    },
    audiences: [
      {
        title: 'Remote Teams',
        description:
          'Bridge the distance with real-time collaboration that makes remote feel local. Share context, pair program and ship code together from anywhere.',
        bullets: ['Live presence indicators', 'Voice and video-ready workflows', 'Timezone-aware collaboration'],
      },
      {
        title: 'Educational Institutions',
        description:
          'Teachers can jump into student projects, provide real-time feedback and track progress through shared workspaces.',
        bullets: ['Classroom management tools', 'Assignment distribution', 'Progress tracking'],
      },
    ],
    workspaceIntro: {
      title: 'See collaboration in the workspace',
      description:
        'Shared presence, live previews and Git review happen in the same browser IDE — no setup per teammate.',
    },
    workspaceAlt: 'E-Code browser IDE showing Git review and version control inside a shared workspace',
    workspaceCaption: 'Branch, review and merge with full project context visible to the whole team.',
    ctaBadge: 'Start your team workspace',
    ctaTitle: 'Bring your whole team into one workspace',
    ctaDescription:
      'Invite collaborators, share live project context and ship together from the browser. Upgrade to Core or Pro for more seats, parallel agents and any-region publishing.',
  },
  workbench: { states: ['Terminal ready', 'Preview live', 'Agent planning'] },
} as const satisfies ProductRemainingCopy;

export const marketingProductRemainingFr = {
  aiPlatform: {
    badge: 'PROPULSÉ PAR E-CODE.AI',
    heroTitle: 'L’IA d’entreprise qui',
    heroAccent: 'crée des applications',
    heroDescription:
      'Transformez vos idées en applications prêtes pour la production en quelques minutes. Notre IA comprend plus de 100 langages et produit automatiquement du code professionnel.',
    start: 'Commencer à créer',
    watchDemo: 'Voir la démo',
    highlights: [
      ['Langage naturel', 'Décrivez l’application en français courant'],
      ['Application complète', 'Interface utilisateur, service applicatif et couche de données'],
      ['Plus de 100 langages', 'TypeScript, Python, Node et bien plus'],
      ['Déploiement en un clic', 'Publiez dans le cloud depuis l’espace de travail'],
    ],
    heroDemo: {
      eyebrow: 'Aperçu en direct',
      title: 'L’agent IA assemble un tableau de bord prêt pour la production',
      description:
        'Le prompt, l’architecture, le code, les contrôles et le déploiement restent visibles dans un même flux.',
      metrics: [
        ['Multi-étapes', 'planification'],
        ['Automatisées', 'revues de code'],
        ['1 clic', 'déploiement'],
      ],
    },
    demoIntro: {
      title: 'Découvrez l’IA en action',
      description: 'Voyez comment les équipes créent plus vite des applications avec la technologie d’IA E-Code.',
    },
    demo: {
      eyebrow: 'Démo de la plateforme en direct',
      title: 'Du prompt à la production en moins de deux minutes',
      description:
        'L’agent IA structure un tableau de bord SaaS, configure l’infrastructure et le publie dans le cloud.',
      metrics: [
        ['E-commerce', 'en 5 minutes'],
        ['SaaS', 'démo de tableau de bord'],
        ['Multilingue', 'création d’application'],
      ],
    },
    capabilitiesIntro: {
      title: 'Capacités de l’agent IA',
      description: 'Des fonctionnalités puissantes pour créer sans effort.',
    },
    features: [
      {
        key: 'autonomous',
        title: 'Création autonome',
        description: 'Décrivez simplement votre besoin : l’agent IA crée une application complète de zéro.',
        details: [
          'Comprend les besoins exprimés en langage naturel',
          'Génère des structures de projet complètes',
          'Crée tous les fichiers et la configuration',
          'Installe les dépendances et configure l’environnement',
          'Déploie instantanément lorsque l’application est prête',
        ],
      },
      {
        key: 'languages',
        title: 'Prise en charge de tous les langages',
        description: 'E-Code comprend plus de 100 langages de programmation et frameworks.',
        details: ['TypeScript et React', 'API Node.js', 'Services Python', 'Applications avec base de données'],
      },
      {
        key: 'generation',
        title: 'Génération de code intelligente',
        description:
          'Un code prêt pour la production, avec architecture, état, validation et style gérés automatiquement.',
        details: [
          'Composants typés',
          'Routes API',
          'Modèles de données',
          'Mises en page adaptatives',
          'États d’erreur',
        ],
      },
      {
        key: 'assistance',
        title: 'Assistance en temps réel',
        description: 'L’assistant reste à vos côtés pour inspecter, exécuter, déboguer et déployer.',
        details: [
          'Explique le code',
          'Corrige les erreurs',
          'Analyse les performances',
          'Suggère les prochaines étapes',
        ],
      },
    ],
    toolsIntro: {
      title: 'Outils propulsés par l’IA',
      description: 'Des capacités avancées qui aident l’IA à créer de meilleures applications.',
    },
    tools: [
      {
        id: 'search',
        name: 'Recherche web',
        description: 'Trouve la documentation et les exemples à jour pendant la création.',
      },
      {
        id: 'visual-editor',
        name: 'Éditeur visuel',
        description: 'Ajuste la mise en page, le thème et la hiérarchie des composants.',
      },
      {
        id: 'analysis',
        name: 'Analyse du code',
        description: 'Lit les fichiers du projet et identifie les éléments manquants.',
      },
      {
        id: 'performance',
        name: 'Performances',
        description: 'Repère les lenteurs, le poids des bundles et les goulots d’étranglement.',
      },
      {
        id: 'packages',
        name: 'Gestionnaire de paquets',
        description: 'Ajoute les dépendances et préserve la cohérence du projet.',
      },
      {
        id: 'debug',
        name: 'Assistant de débogage',
        description: 'Relie chaque erreur à une modification de code concrète.',
      },
    ],
    useCasesIntro: {
      title: 'À qui s’adresse notre agent IA ?',
      description: 'Des personnes qui débutent aux développeurs expérimentés.',
    },
    useCases: [
      [
        'Personnes qui débutent',
        'Transformez une idée en application sans devoir maîtriser toute la pile technologique au préalable.',
      ],
      ['Prototypage rapide', 'Validez rapidement un parcours produit avec de vrais fichiers et un aperçu fonctionnel.'],
      ['Projets pédagogiques', 'Étudiez la structure du projet généré tout en le modifiant.'],
      [
        'Solutions métier',
        'Créez des outils internes, portails et tableaux de bord à partir de besoins opérationnels.',
      ],
    ],
  },
  features: {
    heroBadge: 'Tout ce dont vous avez besoin, au même endroit',
    heroTitle: 'Des fonctionnalités qui donnent plus de pouvoir aux développeurs',
    heroDescription:
      'De votre première ligne de code au déploiement à grande échelle, E-Code réunit tous les outils nécessaires dans une seule plateforme.',
    start: 'Commencer à créer',
    docs: 'Voir la documentation',
    tabs: [
      { id: 'all', label: 'Tout' },
      { id: 'development', label: 'Développement' },
      { id: 'collaboration', label: 'Collaboration' },
      { id: 'infrastructure', label: 'Infrastructure' },
      { id: 'security', label: 'Sécurité' },
      { id: 'analytics', label: 'Analyses' },
    ],
    items: [
      {
        id: 'ai-agent',
        title: 'Agent IA — Votre développeur personnel',
        category: 'development',
        description:
          'Expliquez à E-Code ce que vous souhaitez créer : l’agent génère le projet, ses fichiers et son parcours.',
        bullets: ['Prompts en langage naturel', 'Génération de projet', 'Correction de la compilation'],
      },
      {
        id: 'ide',
        title: 'Éditeur de code intuitif',
        category: 'development',
        description: 'Un IDE dans le navigateur avec fichiers, onglets, aperçus, terminal et contexte du projet.',
        bullets: ['Arborescence et éditeur', 'Aperçu en direct', 'Sortie du terminal'],
      },
      {
        id: 'command-center',
        title: 'Centre de commandes',
        category: 'development',
        description: 'Exécutez des commandes, inspectez leur sortie et gardez tout le flux de développement visible.',
        bullets: ['Contrôle du terminal', 'Exécution de scripts', 'Inspection des journaux'],
      },
      {
        id: 'files',
        title: 'Vos fichiers de projet',
        category: 'development',
        description: 'Comprenez et modifiez directement les fichiers générés dans l’espace de travail.',
        bullets: ['Arborescence du projet', 'Fichiers lisibles', 'Revue des patchs'],
      },
      {
        id: 'features',
        title: 'Ajoutez de nouvelles fonctionnalités',
        category: 'development',
        description: 'Demandez une évolution : E-Code met l’application à jour sans perdre le contexte.',
        bullets: ['Prompts de fonctionnalité', 'Cycles d’amélioration', 'Évolutions de l’interface'],
      },
      {
        id: 'multiplayer',
        title: 'Apprenez ensemble',
        category: 'collaboration',
        description: 'Créez avec vos collègues grâce à la présence partagée, aux revues et au contexte en direct.',
        bullets: ['Présence partagée', 'Pair programming', 'Cycles de revue'],
      },
      {
        id: 'save-progress',
        title: 'Conservez votre progression',
        category: 'infrastructure',
        description: 'Gardez un travail récupérable grâce à l’historique, aux branches et aux instantanés déployables.',
        bullets: ['Contexte Git', 'Instantanés', 'Modifications récupérables'],
      },
      {
        id: 'always-available',
        title: 'Toujours disponible',
        category: 'infrastructure',
        description: 'Accédez aux projets et aux aperçus depuis le navigateur, sans configuration locale.',
        bullets: ['Espaces de travail cloud', 'Aperçus hébergés', 'Passage d’un appareil à l’autre'],
      },
      {
        id: 'database',
        title: 'Base de données intégrée',
        category: 'infrastructure',
        description: 'Générez et connectez des applications adossées à des données sans quitter l’espace de travail.',
        bullets: ['Conception du schéma', 'Opérations sur les données', 'Visibilité de la base'],
      },
      {
        id: 'deployment',
        title: 'Déploiement en un clic',
        category: 'infrastructure',
        description: 'Passez d’un aperçu fonctionnel à la production avec un flux de déploiement géré.',
        bullets: ['URL d’aperçu', 'Contrôles de déploiement', 'Chemin de retour arrière'],
      },
      {
        id: 'security',
        title: 'Sécurité d’entreprise',
        category: 'security',
        description: 'Protégez les projets avec des réglages sûrs, un contexte d’audit et des accès gouvernés.',
        bullets: ['Identité compatible SSO', 'Pistes d’audit', 'Contrôles d’accès'],
      },
      {
        id: 'secrets',
        title: 'Gestion des secrets',
        category: 'security',
        description: 'Séparez les secrets d’environnement du code généré et des espaces de collaboration.',
        bullets: ['Secrets à portée limitée', 'Injection à l’exécution', 'Limites d’autorisation'],
      },
      {
        id: 'monitoring',
        title: 'Suivi des performances',
        category: 'analytics',
        description: 'Inspectez les retours d’exécution et comprenez le comportement des applications déployées.',
        bullets: ['Métriques d’exécution', 'Signaux de santé', 'Informations de déploiement'],
      },
    ],
    ideIntro: {
      title: 'IDE dans le navigateur',
      description:
        'Panneaux, terminal, Git, aperçu, problèmes et paramètres conçus pour un travail d’ingénierie continu.',
    },
    ideCards: [
      ['Arborescence et éditeur', 'Modifiez le code généré avec tout le contexte du projet visible.'],
      ['Terminal et aperçu', 'Exécutez des commandes et inspectez l’application sans quitter le navigateur.'],
      ['Revue des patchs de l’agent', 'Vérifiez les changements de l’IA avant de créer un commit.'],
      ['Parcours de déploiement', 'Passez de l’aperçu à la production avec des contrôles de mise en ligne.'],
    ],
    multiplayerIntro: {
      title: 'Collaboration en temps réel',
      description: 'Collaboration en direct, pair programming et présence partagée pour créer en équipe.',
    },
    multiplayerCards: [
      ['Présence en direct', 'Voyez les collègues, leurs curseurs, leurs zones de travail et les revues actives.'],
      [
        'Contexte de projet partagé',
        'Les fichiers, la sortie du terminal, l’aperçu et les plans de l’agent restent visibles.',
      ],
      ['Cycles de revue', 'Discutez des changements générés et de la préparation au déploiement dans un seul flux.'],
    ],
  },
  mobile: {
    heroBadge: 'Créez où que vous soyez',
    heroTitle: 'Tout l’espace de travail E-Code, désormais sur mobile',
    heroDescription:
      'Modifiez le code, utilisez les terminaux, collaborez, consultez l’historique Git et déployez des applications de production depuis un téléphone ou une tablette.',
    start: 'Ouvrir l’espace mobile',
    explore: 'Découvrir les applications mobiles',
    intro: {
      title: 'Des outils mobiles pour un vrai travail de production',
      description: 'Des contrôles complets pour l’éditeur, le terminal, l’IA, l’aperçu, la collaboration et Git.',
    },
    features: [
      {
        id: 'editor',
        title: 'Éditeur complet',
        description: 'Modifiez TypeScript, les routes et la configuration depuis un téléphone ou une tablette.',
        details: [
          'Éditeur avec coloration syntaxique',
          'Navigateur de fichiers du projet',
          'Mise en page adaptée aux tablettes',
          'Commandes tactiles',
        ],
      },
      {
        id: 'terminal',
        title: 'Terminal intégré',
        description: 'Exécutez des commandes, des tests et des scripts de déploiement depuis un mobile.',
        details: [
          'Exécuter des scripts npm',
          'Inspecter les journaux',
          'Déployer en ligne de commande',
          'Réinitialiser l’historique des commandes',
        ],
      },
      {
        id: 'ai',
        title: 'Assistant IA',
        description: 'Demandez à l’agent d’expliquer, d’optimiser ou d’implémenter directement depuis l’appareil.',
        details: [
          'Optimiser les files de synchronisation',
          'Rédiger les notes de version',
          'Expliquer les hooks et l’état',
          'Appliquer les suggestions',
        ],
      },
      {
        id: 'preview',
        title: 'Aperçu en direct',
        description: 'Inspectez les aperçus adaptatifs sur téléphone et tablette.',
        details: ['iPhone 15 Pro', 'Pixel 8', 'iPad Pro 13"', 'Contrôles portrait et paysage'],
      },
      {
        id: 'collab',
        title: 'Collaboration en temps réel',
        description: 'La présence et les revues restent synchronisées pendant que votre équipe publie.',
        details: [
          'Présence en direct',
          'Fils de revue de code',
          'Synchronisation Slack et Teams',
          'Approbations depuis un mobile',
        ],
      },
      {
        id: 'git',
        title: 'Gestion de versions',
        description: 'Consultez les commits, les branches et la synchronisation sans changer d’application.',
        details: [
          'Historique des commits',
          'Contexte de branche',
          'Synchronisation de l’espace',
          'Revue avant déploiement',
        ],
      },
    ],
    productName: 'E-Code Mobile',
    live: 'EN DIRECT',
    terminalAuthenticated: 'Authentification réussie avec le SSO Enterprise',
    terminalChecksPassed: 'Tous les contrôles d’affichage mobile sont passés',
    terminalDeployReady: 'Déploiement Edge prêt',
    devicePreviews: 'Aperçus par appareil',
    edgePreview: 'Aperçu Edge',
    devices: ['iPhone 15 Pro', 'Pixel 8', 'iPad Pro 13"'],
  },
  deployments: {
    heroBadge: 'De l’idée à Internet en un clic',
    heroTitle: 'Publiez des applications de production depuis votre espace de travail',
    heroDescription:
      'Les déploiements E-Code associent la simplicité d’un IDE dans le navigateur à la rigueur d’une plateforme cloud mondiale. Publiez instantanément, observez chaque signal et répondez aux exigences d’entreprise sans assembler une multitude d’outils.',
    expert: 'Parler à un expert',
    docs: 'Découvrir la documentation de déploiement',
    modesIntro: {
      title: 'Choisissez le bon mode de déploiement',
      description: 'Tout ce dont les équipes de production ont besoin, directement dans l’onglet Déploiement.',
    },
    modes: [
      {
        id: 'autoscale',
        title: 'Applications à mise à l’échelle automatique',
        description:
          'Déployez des services qui s’adaptent au trafic et restent observables depuis l’espace de travail.',
        bullets: ['Mises en ligne sans interruption', 'Contrôles de santé', 'Mise à l’échelle selon le trafic'],
      },
      {
        id: 'reserved',
        title: 'Machines virtuelles réservées',
        description:
          'Exécutez des charges prévisibles avec une capacité dédiée et des contrôles opérationnels robustes.',
        bullets: ['Capacité réservée', 'Réseau stable', 'Déploiements progressifs contrôlés'],
      },
      {
        id: 'static',
        title: 'Sites statiques',
        description:
          'Publiez des interfaces utilisateur, de la documentation et des sites marketing avec TLS et un routage mondial.',
        bullets: ['Cache Edge', 'Domaines personnalisés', 'Retours arrière instantanés'],
      },
    ],
    capabilities: [
      ['Routage mondial', 'Cache Edge et domaines personnalisés avec TLS'],
      ['Observabilité en direct', 'Requêtes, latence et erreurs après la mise en ligne'],
      ['Sécurisé par défaut', 'Secrets, identité et politique de déploiement'],
      ['Retours arrière instantanés', 'Revenez à une version saine en un clic'],
    ],
    workflowIntro: {
      title: 'Flux de déploiement',
      description: 'Passez de l’espace de travail à la production avec des mises en ligne observables et gouvernées.',
    },
    workflow: [
      [
        'Connecter un dépôt ou commencer dans E-Code',
        'Utilisez une application générée, un dépôt importé ou un espace dans le navigateur.',
      ],
      [
        'Configurer une seule fois',
        'Définissez les domaines, variables d’environnement, règles de branche et politiques de déploiement.',
      ],
      [
        'Déployer en confiance',
        'Publiez avec les journaux, les contrôles d’aperçu, TLS et les outils de retour arrière.',
      ],
      [
        'Observer et améliorer',
        'Suivez les requêtes, la latence, l’usage et la santé de chaque version après sa publication.',
      ],
    ],
    controlIntro: {
      title: 'Centre de contrôle de la production',
      description:
        'Les journaux en temps réel, les analyses et les retours arrière en un clic permettent de publier sans interruption.',
    },
    controls: [
      ['Sécurisé par défaut', 'TLS, secrets, identité et politique de déploiement restent attachés à la version.'],
      [
        'Mises en ligne gouvernées',
        'Exigez des approbations, protégez les branches et journalisez chaque déploiement.',
      ],
      [
        'Observabilité 24 h/24',
        'Le débit, la latence, les erreurs et les régions restent visibles après la mise en ligne.',
      ],
    ],
    status: {
      live: 'En ligne',
      healthy: 'Opérationnel',
      metrics: [
        ['Requêtes/min', '4,2 k'],
        ['Latence p95', '112 ms'],
        ['Mise à l’échelle', 'Activée'],
        ['TLS', 'Émis'],
        ['Sauvegardes', 'Chaque nuit'],
        ['Retour arrière', 'Prêt'],
      ],
    },
  },
  bounties: {
    heroBadge: 'Place de marché des développeurs',
    heroTitle: 'Livrez plus vite grâce à des primes axées sur les résultats',
    heroDescription:
      'Publiez des défis, collaborez avec des spécialistes et payez à la livraison. E-Code gère le recrutement, les environnements de revue sécurisés et les paiements automatisés.',
    launch: 'Lancer votre première prime',
    contact: 'Parler à notre équipe',
    proof: ['Paiements internationaux gérés', 'Environnements de revue inclus', 'Processus alignés sur SOC 2'],
    summaryTitle: 'Comment E-Code gère les primes',
    highlights: [
      ['Axé sur les résultats', 'Payez après acceptation d’une livraison validée'],
      ['Environnements sécurisés', 'Un espace de revue isolé pour chaque prime'],
      ['Paiements gérés', 'Nous gérons les paiements internationaux'],
      ['Accès gouvernés', 'Processus de revue alignés sur SOC 2'],
    ],
    audienceIntro: {
      title: 'Pensé pour les équipes produit et plateforme',
      description:
        'Renforcez vos équipes internes avec des spécialistes externes sélectionnés, sans compromettre la gouvernance, la sécurité ni la prévisibilité des livraisons.',
    },
    audience: [
      [
        'Lancement en quelques minutes',
        'Transformez les éléments de roadmap, bugs et intégrations en primes clairement définies.',
      ],
      [
        'Spécialistes vérifiés',
        'Trouvez des profils qui maîtrisent les flux E-Code, les revues et la livraison en production.',
      ],
      [
        'Performance mesurable',
        'Payez selon le travail accepté, le résultat validé et des jalons de livraison mesurables.',
      ],
    ],
    workflowIntro: {
      title: 'Fonctionnement des primes',
      description: 'Créez le défi, recrutez le bon profil, révisez puis publiez.',
    },
    workflow: [
      [
        'Créer une prime',
        'Définissez les critères d’acceptation, le budget, le périmètre et les exigences de sécurité.',
      ],
      ['Recruter le bon profil', 'E-Code sélectionne des spécialistes vérifiés et fournit des espaces sécurisés.'],
      ['Réviser et publier', 'Approuvez le code, validez l’aperçu puis publiez en toute confiance.'],
    ],
    categoriesIntro: {
      title: 'Catégories de primes populaires',
      description: 'Utilisez les primes pour des missions ciblées avec des critères d’acceptation clairs.',
    },
    categories: [
      'Applications IA et agentiques',
      'Applications complètes',
      'Intégrations d’outils de développement',
      'Migrations de plateforme',
      'Contenus pédagogiques',
      'Design systems',
    ],
  },
  teams: {
    heroBadge: 'Équipes',
    heroTitle: 'Créez ensemble, publiez plus vite',
    heroDescription:
      'Une collaboration en temps réel fluide. Codez, déboguez et déployez avec votre équipe, parfaitement synchronisée.',
    start: 'Commencer à collaborer gratuitement',
    contact: 'Contacter l’équipe commerciale',
    featuresIntro: {
      title: 'Tout ce dont votre équipe a besoin',
      description: 'La page publique Équipes d’E-Code, intégrée à E-Code.',
    },
    features: [
      {
        id: 'multiplayer',
        title: 'Collaboration en temps réel',
        description: 'Voyez les curseurs, sélections et modifications de vos collègues en direct.',
      },
      {
        id: 'git',
        title: 'Gestion de versions avancée',
        description: 'Des flux Git intégrés avec contexte de branche, de revue et de merge.',
      },
      {
        id: 'communication',
        title: 'Communication intégrée',
        description: 'Les discussions et le contexte de l’espace restent à côté du code.',
      },
      {
        id: 'security',
        title: 'Sécurité d’entreprise',
        description: 'Le SSO, la 2FA, les journaux d’audit et les autorisations granulaires protègent le travail.',
      },
      {
        id: 'environments',
        title: 'Environnements instantanés',
        description: 'Lancez un environnement de développement cohérent pour chaque membre.',
      },
      {
        id: 'performance',
        title: 'Performances mondiales',
        description: 'Collaborez avec une faible latence partout dans le monde grâce au routage mondial.',
      },
    ],
    audiencesIntro: {
      title: 'Conçu pour les équipes modernes',
      description:
        'Les équipes à distance et les établissements d’enseignement partagent le même contexte sans perdre le contrôle.',
    },
    audiences: [
      {
        title: 'Équipes à distance',
        description:
          'Réduisez les distances grâce à une collaboration en temps réel qui rapproche les équipes. Partagez le contexte, programmez en binôme et publiez ensemble, où que vous soyez.',
        bullets: [
          'Indicateurs de présence en direct',
          'Flux compatibles avec la voix et la vidéo',
          'Collaboration adaptée aux fuseaux horaires',
        ],
      },
      {
        title: 'Établissements d’enseignement',
        description:
          'Les enseignants rejoignent les projets de leurs élèves, donnent des retours en temps réel et suivent leur progression dans des espaces partagés.',
        bullets: ['Outils de gestion de classe', 'Distribution des devoirs', 'Suivi de la progression'],
      },
    ],
    workspaceIntro: {
      title: 'Découvrez la collaboration dans l’espace de travail',
      description:
        'Présence partagée, aperçus en direct et revue Git réunis dans le même IDE — sans configuration par membre.',
    },
    workspaceAlt: 'IDE E-Code dans le navigateur affichant la revue Git dans un espace de travail partagé',
    workspaceCaption:
      'Créez des branches, révisez et mergez en gardant tout le contexte du projet visible pour l’équipe.',
    ctaBadge: 'Ouvrir l’espace de votre équipe',
    ctaTitle: 'Réunissez toute votre équipe dans un même espace',
    ctaDescription:
      'Invitez des collaborateurs, partagez le contexte en direct et publiez ensemble depuis le navigateur. Passez à Core ou Pro pour davantage de membres, d’agents parallèles et la publication dans toutes les régions.',
  },
  workbench: { states: ['Terminal prêt', 'Aperçu en direct', 'Planification de l’agent'] },
} as const satisfies ProductRemainingCopy;

export function getMarketingProductRemainingCopy(language?: string | null): ProductRemainingCopy {
  return resolveMarketingLanguage(language) === 'fr' ? marketingProductRemainingFr : marketingProductRemainingEn;
}

export const marketingProductRemainingCatalog = {
  en: marketingProductRemainingEn,
  fr: marketingProductRemainingFr,
} as const satisfies Record<MarketingLanguage, ProductRemainingCopy>;
