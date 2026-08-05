import { resolveMarketingLanguage, type MarketingLanguage } from './marketing';

export type ProductMarketingPageKey =
  | 'ai-agent'
  | 'ide'
  | 'multiplayer'
  | 'mobile-app'
  | 'teams'
  | 'deployments'
  | 'pricing'
  | 'bounties'
  | 'ai-platform';

export interface ProductMarketingRouteCopy {
  label: string;
  title: string;
  description: string;
}

export const productMarketingRouteCopy = {
  en: {
    'ai-agent': {
      label: 'AI Agent',
      title: 'AI Agent v2',
      description: 'Describe your idea, watch E-Code build it, and deploy instantly from the public AI Agent page.',
    },
    ide: {
      label: 'IDE',
      title: 'Browser IDE',
      description: 'The E-Code browser IDE page with editor, terminal, files, previews and project workflows.',
    },
    multiplayer: {
      label: 'Multiplayer',
      title: 'Multiplayer',
      description: 'Live collaboration, pair programming, shared presence and review workflows inside the IDE page.',
    },
    'mobile-app': {
      label: 'Mobile App',
      title: 'Mobile IDE',
      description: 'The E-Code mobile app marketing page for editor, terminal, AI, preview, collaboration and Git.',
    },
    teams: {
      label: 'Teams',
      title: 'Teams',
      description: 'Real-time collaboration, enterprise controls and governed project access for modern teams.',
    },
    deployments: {
      label: 'Deployments',
      title: 'Deployments',
      description: 'Production deployments with global routing, observability, rollbacks and enterprise controls.',
    },
    pricing: {
      label: 'Pricing',
      title: 'Pricing',
      description: 'E-Code pricing cards, comparison table, enterprise section and FAQ.',
    },
    bounties: {
      label: 'Bounties',
      title: 'Bounties',
      description: 'Outcome-based developer bounties with secure review sandboxes and managed payouts.',
    },
    'ai-platform': {
      label: 'AI Platform',
      title: 'AI Platform',
      description: 'Enterprise AI that builds applications with natural-language prompts, tools and governance.',
    },
  },
  fr: {
    'ai-agent': {
      label: 'Agent IA',
      title: 'Agent IA v2',
      description:
        'Décrivez votre idée, regardez E-Code la créer, puis déployez-la instantanément depuis la page publique de l’agent IA.',
    },
    ide: {
      label: 'IDE',
      title: 'IDE dans le navigateur',
      description:
        'Découvrez l’IDE E-Code dans le navigateur, avec l’éditeur, le terminal, les fichiers, les aperçus et les flux de projet.',
    },
    multiplayer: {
      label: 'Collaboration',
      title: 'Collaboration en temps réel',
      description: 'Collaboration en direct, pair programming, présence partagée et flux de revue au sein de l’IDE.',
    },
    'mobile-app': {
      label: 'Application mobile',
      title: 'IDE mobile',
      description: 'Découvrez l’application mobile E-Code : éditeur, terminal, IA, aperçu, collaboration et Git.',
    },
    teams: {
      label: 'Équipes',
      title: 'Équipes',
      description:
        'Collaboration en temps réel, contrôles d’entreprise et accès gouverné aux projets pour les équipes modernes.',
    },
    deployments: {
      label: 'Déploiements',
      title: 'Déploiements',
      description:
        'Déploiements de production avec routage mondial, observabilité, retours arrière et contrôles d’entreprise.',
    },
    pricing: {
      label: 'Tarifs',
      title: 'Tarifs',
      description: 'Offres tarifaires E-Code, tableau comparatif, section Enterprise et questions fréquentes.',
    },
    bounties: {
      label: 'Primes',
      title: 'Primes',
      description:
        'Primes développeur fondées sur les résultats, avec environnements de revue sécurisés et paiements gérés.',
    },
    'ai-platform': {
      label: 'Plateforme d’IA',
      title: 'Plateforme d’IA',
      description:
        'Une IA d’entreprise qui crée des applications à partir de prompts en langage naturel, avec outils et gouvernance.',
    },
  },
} as const satisfies Record<MarketingLanguage, Record<ProductMarketingPageKey, ProductMarketingRouteCopy>>;

export type AiAgentSegmentId = 'idea' | 'apis' | 'responsive-ui';
export type AiAgentReelId = 'multilingual' | 'database' | 'security' | 'deploy';
export type AiAgentUseCaseId = 'business' | 'personal' | 'education' | 'games';

export interface AiAgentMarketingCopy {
  badge: string;
  heroTitle: string;
  heroAccent: string;
  heroDescription: string;
  launchStudio: string;
  watchLiveDemo: string;
  proof: readonly string[];
  trailer: {
    eyebrow: string;
    title: string;
    description: string;
    metrics: readonly (readonly [string, string])[];
  };
  stepsIntro: { title: string; description: string };
  steps: readonly { title: string; description: string }[];
  demoIntro: { title: string; description: string };
  segments: readonly { id: AiAgentSegmentId; title: string; timestamp: string; description: string }[];
  segmentLabel: (timestamp: string) => string;
  demoMetrics: readonly (readonly [string, string])[];
  featuredDemos: string;
  agentDoes: string;
  agentActions: readonly (readonly [string, string])[];
  reels: readonly { id: AiAgentReelId; title: string; timestamp: string }[];
  watchDemoLabel: (title: string) => string;
  timestampLabel: (timestamp: string) => string;
  watchNow: string;
  moreIntro: { title: string; description: string };
  tabs: Record<'overview' | 'capabilities' | 'examples' | 'comparison', string>;
  capabilities: readonly {
    title: string;
    description: string;
    examples: readonly string[];
  }[];
  useCases: readonly {
    id: AiAgentUseCaseId;
    category: string;
    apps: readonly string[];
    timing: string;
  }[];
  comparison: readonly {
    title: string;
    description: string;
    examples: readonly string[];
  }[];
}

export const aiAgentMarketingCopy = {
  en: {
    badge: 'E-CODE AGENT 2.0 POWERED',
    heroTitle: 'AI Agent v2',
    heroAccent: 'Build Apps with Natural Language',
    heroDescription:
      'Describe your idea. Watch it build. Deploy instantly. No coding required - our AI handles everything.',
    launchStudio: 'Launch Agent Studio',
    watchLiveDemo: 'Watch Live Demo',
    proof: ['No credit card required', '100+ languages supported', 'Deploy in one click'],
    trailer: {
      eyebrow: 'Trailer',
      title: 'E-Code Agent 2.0 builds a marketplace in minutes',
      description: 'Witness idea-to-deployment in a single take, captured directly from the live platform.',
      metrics: [
        ['1:12', 'total runtime'],
        ['Full stack', 'UI + API'],
      ],
    },
    stepsIntro: {
      title: 'Building apps is now as easy as having a conversation',
      description: 'Just describe what you want. Watch it come to life.',
    },
    steps: [
      { title: '1. Describe Your Idea', description: 'Describe what you want in any language.' },
      {
        title: '2. AI Builds Everything',
        description: 'Watch as the AI creates files, writes code and sets up your project.',
      },
      {
        title: '3. Your App is Ready',
        description: 'In under a minute, your app is running and ready to share.',
      },
    ],
    demoIntro: {
      title: 'Watch AI Agent v2 in Action',
      description: 'Real-time demonstrations of AI building production-ready applications from natural language.',
    },
    segments: [
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
    ],
    segmentLabel: (timestamp: string) => `Segment ${timestamp}`,
    demoMetrics: [
      ['Full project', 'files and routes'],
      ['Typed code', 'frontend and backend'],
      ['Live preview', 'as it builds'],
    ],
    featuredDemos: 'Featured Demos',
    agentDoes: 'What the agent does',
    agentActions: [
      ['Plans the project', 'Files, routes and structure'],
      ['Writes the code', 'Typed frontend and backend'],
      ['Installs dependencies', 'Sets up the environment'],
      ['Runs a live preview', 'Inspect before you deploy'],
    ],
    reels: [
      { id: 'multilingual', title: 'Multilingual Demo', timestamp: '0:24' },
      { id: 'database', title: 'Database Integration', timestamp: '0:31' },
      { id: 'security', title: 'Auth & Security', timestamp: '0:29' },
      { id: 'deploy', title: 'Instant Deploy', timestamp: '0:18' },
    ],
    watchDemoLabel: (title: string) => `Watch the ${title} demo`,
    timestampLabel: (timestamp: string) => `Timestamp ${timestamp}`,
    watchNow: 'Watch Now',
    moreIntro: {
      title: 'More than just code generation',
      description: 'A complete development partner that thinks, designs and builds.',
    },
    tabs: {
      overview: 'Overview',
      capabilities: 'Capabilities',
      examples: 'Examples',
      comparison: 'Why E-Code?',
    },
    capabilities: [
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
    ],
    useCases: [
      {
        id: 'business',
        category: 'Business',
        apps: ['CRM dashboard', 'Inventory tracker', 'Customer portal'],
        timing: 'Live in under 2 minutes',
      },
      {
        id: 'personal',
        category: 'Personal',
        apps: ['Habit tracker', 'Recipe app', 'Portfolio site'],
        timing: 'Prototype in 60 seconds',
      },
      {
        id: 'education',
        category: 'Education',
        apps: ['Quiz generator', 'Course portal', 'Study planner'],
        timing: 'Classroom ready',
      },
      {
        id: 'games',
        category: 'Games',
        apps: ['Puzzle game', 'Scoreboard', 'Mini arcade'],
        timing: 'Playable instantly',
      },
    ],
    comparison: [
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
    ],
  },
  fr: {
    badge: 'PROPULSÉ PAR E-CODE AGENT 2.0',
    heroTitle: 'Agent IA v2',
    heroAccent: 'Créez des applications en langage naturel',
    heroDescription:
      'Décrivez votre idée. Regardez-la prendre vie. Déployez-la instantanément. Aucun code requis : notre IA s’occupe de tout.',
    launchStudio: 'Ouvrir le studio de l’agent',
    watchLiveDemo: 'Voir la démonstration en direct',
    proof: ['Aucune carte bancaire requise', 'Plus de 100 langages pris en charge', 'Déploiement en un clic'],
    trailer: {
      eyebrow: 'Présentation',
      title: 'E-Code Agent 2.0 crée une marketplace en quelques minutes',
      description:
        'Découvrez le parcours complet de l’idée au déploiement, en une seule prise capturée directement sur la plateforme en production.',
      metrics: [
        ['1:12', 'durée totale'],
        ['Application complète', 'Interface utilisateur + API'],
      ],
    },
    stepsIntro: {
      title: 'Créer une application devient aussi simple que tenir une conversation',
      description: 'Décrivez simplement ce que vous souhaitez. Regardez votre idée prendre vie.',
    },
    steps: [
      { title: '1. Décrivez votre idée', description: 'Décrivez ce que vous souhaitez, dans n’importe quelle langue.' },
      {
        title: '2. L’IA construit tout',
        description: 'Regardez l’IA créer les fichiers, écrire le code et configurer votre projet.',
      },
      {
        title: '3. Votre application est prête',
        description: 'En moins d’une minute, votre application fonctionne et peut être partagée.',
      },
    ],
    demoIntro: {
      title: 'Découvrez l’agent IA v2 à l’œuvre',
      description:
        'Des démonstrations en temps réel où l’IA crée des applications prêtes pour la production à partir du langage naturel.',
    },
    segments: [
      {
        id: 'idea',
        title: 'De l’idée à l’application en 60 secondes',
        timestamp: '00:12',
        description: 'Découvrez comment un simple prompt devient une application complète.',
      },
      {
        id: 'apis',
        title: 'Intégrations API instantanées',
        timestamp: '00:38',
        description:
          'Regardez l’agent connecter l’authentification, les modèles de données et les endpoints de service.',
      },
      {
        id: 'responsive-ui',
        title: 'Conception automatique d’une interface utilisateur adaptative',
        timestamp: '00:55',
        description: 'L’agent transforme les exigences en mises en page soignées pour chaque taille d’écran.',
      },
    ],
    segmentLabel: (timestamp: string) => `Séquence ${timestamp}`,
    demoMetrics: [
      ['Projet complet', 'fichiers et routes'],
      ['Code typé', 'interface utilisateur et service applicatif'],
      ['Aperçu en direct', 'pendant la création'],
    ],
    featuredDemos: 'Démonstrations à la une',
    agentDoes: 'Ce que fait l’agent',
    agentActions: [
      ['Planifie le projet', 'Fichiers, routes et structure'],
      ['Écrit le code', 'Interface utilisateur et service applicatif typés'],
      ['Installe les dépendances', 'Configure l’environnement'],
      ['Lance un aperçu en direct', 'Vérifiez avant de déployer'],
    ],
    reels: [
      { id: 'multilingual', title: 'Démonstration multilingue', timestamp: '0:24' },
      { id: 'database', title: 'Intégration d’une base de données', timestamp: '0:31' },
      { id: 'security', title: 'Authentification et sécurité', timestamp: '0:29' },
      { id: 'deploy', title: 'Déploiement instantané', timestamp: '0:18' },
    ],
    watchDemoLabel: (title: string) => `Voir la démonstration ${title}`,
    timestampLabel: (timestamp: string) => `Horodatage ${timestamp}`,
    watchNow: 'Voir maintenant',
    moreIntro: {
      title: 'Bien plus que de la génération de code',
      description: 'Un partenaire de développement complet qui réfléchit, conçoit et crée.',
    },
    tabs: {
      overview: 'Vue d’ensemble',
      capabilities: 'Capacités',
      examples: 'Exemples',
      comparison: 'Pourquoi E-Code ?',
    },
    capabilities: [
      {
        title: 'Compréhension du langage naturel',
        description: 'Décrivez précisément ce dont vous avez besoin avec vos propres mots.',
        examples: [
          'Créer une application de tâches avec un mode sombre',
          'Créer un système de réservation de restaurant',
          'Créer un tableau de bord analytique avec des graphiques',
        ],
      },
      {
        title: 'Génération de projets complets',
        description: 'E-Code crée les fichiers, routes, composants, configurations et dépendances.',
        examples: [
          'Génère la structure du projet',
          'Écrit l’interface utilisateur et le service applicatif typés',
          'Installe les dépendances',
        ],
      },
      {
        title: 'Décisions de code intelligentes',
        description:
          'L’agent choisit les frameworks, le flux de données et les mises en page selon l’objectif produit.',
        examples: [
          'Choisit les bons composants',
          'Ajoute la validation et les états',
          'Maintient l’application adaptative',
        ],
      },
      {
        title: 'Amélioration continue',
        description: 'Demandez des changements : l’agent met à jour le projet tout en préservant son contexte.',
        examples: [
          'Itère à partir des retours',
          'Corrige les erreurs de compilation',
          'Ajoute des fonctionnalités sans recommencer',
        ],
      },
    ],
    useCases: [
      {
        id: 'business',
        category: 'Entreprise',
        apps: ['Tableau de bord CRM', 'Suivi des stocks', 'Portail client'],
        timing: 'En ligne en moins de 2 minutes',
      },
      {
        id: 'personal',
        category: 'Personnel',
        apps: ['Suivi d’habitudes', 'Application de recettes', 'Site portfolio'],
        timing: 'Prototype en 60 secondes',
      },
      {
        id: 'education',
        category: 'Éducation',
        apps: ['Générateur de quiz', 'Portail de cours', 'Planificateur d’étude'],
        timing: 'Prêt pour la classe',
      },
      {
        id: 'games',
        category: 'Jeux',
        apps: ['Jeu de réflexion', 'Tableau des scores', 'Mini-jeu arcade'],
        timing: 'Jouable instantanément',
      },
    ],
    comparison: [
      {
        title: 'Aucune configuration ni boilerplate',
        description:
          'Oubliez le scaffolding, les fichiers de configuration et la gestion des dépendances : l’agent s’occupe de tout.',
        examples: [
          'Aucun outillage local requis',
          'Structure de projet générée pour vous',
          'Dépendances installées automatiquement',
        ],
      },
      {
        title: 'Des applications complètes, pas de simples extraits',
        description:
          'Les autres assistants suggèrent des fragments de code. E-Code livre une application complète et exécutable.',
        examples: [
          'Interface utilisateur, service applicatif et couche de données',
          'Routes et composants connectés',
          'Paramètres adaptés à la production',
        ],
      },
      {
        title: 'Des itérations qui conservent le contexte',
        description:
          'L’ensemble du projet reste en mémoire afin que les changements suivants restent cohérents sans tout recommencer.',
        examples: [
          'Mémorise les décisions précédentes',
          'Corrige ses propres erreurs de compilation',
          'Ajoute des fonctionnalités sans régression',
        ],
      },
      {
        title: 'De l’idée à la mise en ligne en quelques minutes',
        description:
          'Décrivez l’objectif et obtenez une application déployable, sans copier-coller entre plusieurs outils.',
        examples: ['Une conversation, un seul flux', 'Aperçu instantané', 'Déploiement dès que vous êtes prêt'],
      },
    ],
  },
} as const satisfies Record<MarketingLanguage, AiAgentMarketingCopy>;

export function getProductMarketingRouteCopy(
  key: ProductMarketingPageKey,
  language?: string | null,
): ProductMarketingRouteCopy {
  return productMarketingRouteCopy[resolveMarketingLanguage(language)][key];
}

export function getAiAgentMarketingCopy(language?: string | null): AiAgentMarketingCopy {
  return aiAgentMarketingCopy[resolveMarketingLanguage(language)];
}

export type PricingPlanCopyKey = 'free' | 'core' | 'pro' | 'enterprise';

export interface PricingPlanCopy {
  name: string;
  description: string;
  cta: string;
  features: readonly string[];
}

export interface PricingMarketingCopy {
  badge: string;
  heroTitle: string;
  heroAccent: string;
  heroDescription: string;
  billingPeriodLabel: string;
  monthly: string;
  monthlyAria: string;
  yearly: string;
  yearlyAria: string;
  recommended: string;
  custom: string;
  contactForPricing: string;
  perMonth: string;
  billedAnnually: (annualPrice: string) => string;
  comparisonTitle: string;
  comparisonDescription: string;
  comparisonTableLabel: string;
  featuresLabel: string;
  comparisonRows: readonly (readonly string[])[];
  billingFaq: readonly { question: string; answer: string }[];
  enterpriseBadge: string;
  enterpriseTitle: string;
  enterpriseDescription: string;
  enterpriseHighlights: readonly string[];
  enterpriseIncludes: string;
  enterpriseFeatures: readonly string[];
  faqTitle: string;
  faqDescription: string;
  faq: readonly (readonly [string, string])[];
  ctaBadge: string;
  ctaTitle: string;
  ctaDescription: string;
  startFree: string;
  contactSales: string;
}

export const pricingPlanCopy = {
  en: {
    free: {
      name: 'Starter',
      description: 'Free Agent credits every day to learn and ship',
      cta: 'Start for Free',
      features: [
        'Free Agent credits, refreshed every day',
        'Full-stack database included',
        'Build slide decks, videos and animations',
        'One published project at a time',
        'Private or password-protected deployments',
      ],
    },
    core: {
      name: 'Core',
      description: '€25/mo of credits, collaborators and any-region publishing',
      cta: 'Get Core',
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
    pro: {
      name: 'Pro',
      description: 'The most powerful models, more agents, premium support',
      cta: 'Get Pro',
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
    enterprise: {
      name: 'Enterprise',
      description: 'For large teams, compliance needs and custom infrastructure',
      cta: 'Contact Sales',
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
  },
  fr: {
    free: {
      name: 'Starter',
      description: 'Des crédits Agent gratuits chaque jour pour apprendre et concrétiser vos projets',
      cta: 'Commencer gratuitement',
      features: [
        'Crédits Agent gratuits, renouvelés chaque jour',
        'Base de données intégrée pour une application complète',
        'Création de présentations, de vidéos et d’animations',
        'Un projet publié à la fois',
        'Déploiements privés ou protégés par mot de passe',
      ],
    },
    core: {
      name: 'Core',
      description: '25 € de crédits par mois, collaborateurs et publication dans toutes les régions',
      cta: 'Choisir Core',
      features: [
        '25 € de crédits par mois',
        'Jusqu’à 5 collaborateurs',
        'Jusqu’à 2 agents en parallèle',
        'Espaces de travail illimités',
        'Publication dans toutes les régions',
        'Suppression du badge « Made with »',
        'Intégrations IA',
      ],
    },
    pro: {
      name: 'Pro',
      description: 'Les modèles les plus puissants, davantage d’agents et un support Premium',
      cta: 'Choisir Pro',
      features: [
        '100 € de crédits par mois',
        'Jusqu’à 15 collaborateurs',
        'Jusqu’à 50 lecteurs',
        'Jusqu’à 10 agents en parallèle',
        'Modèles les plus puissants',
        'Retours arrière de base de données sur 28 jours',
        'Support Premium',
      ],
    },
    enterprise: {
      name: 'Enterprise',
      description: 'Pour les grandes équipes, les exigences de conformité et les infrastructures personnalisées',
      cta: 'Contacter l’équipe commerciale',
      features: [
        'SSO SAML/OIDC',
        'Provisionnement SCIM',
        'Quotas personnalisés',
        'Export des audits',
        'Liste d’adresses IP autorisées',
        'Support Premium',
        'Options de déploiement privé',
      ],
    },
  },
} as const satisfies Record<MarketingLanguage, Record<PricingPlanCopyKey, PricingPlanCopy>>;

export const pricingMarketingCopy = {
  en: {
    badge: 'Save up to 20% with annual billing',
    heroTitle: 'Pricing that scales',
    heroAccent: 'with your growth',
    heroDescription:
      'Start free and upgrade as you grow. No hidden fees, no surprises. Enterprise-grade features at startup-friendly prices.',
    billingPeriodLabel: 'Billing period',
    monthly: 'Monthly',
    monthlyAria: 'Show monthly pricing',
    yearly: 'Yearly - Save 20%',
    yearlyAria: 'Show annual pricing',
    recommended: 'RECOMMENDED',
    custom: 'Custom',
    contactForPricing: 'Contact for pricing',
    perMonth: '/month',
    billedAnnually: (annualPrice: string) => `billed annually (${annualPrice}/yr)`,
    comparisonTitle: 'Compare plans in detail',
    comparisonDescription: 'Every feature, every detail, side by side.',
    comparisonTableLabel: 'Detailed comparison of E-Code pricing plans',
    featuresLabel: 'Features',
    comparisonRows: [
      ['Monthly price', 'Free', '€25', '€100', 'Custom'],
      ['Monthly credits', 'Daily', '€25', '€100', 'Custom'],
      ['Published projects at a time', '1', 'Unlimited', 'Unlimited', 'Unlimited'],
      ['Collaborators', '1', '5', '15', 'Custom'],
      ['Viewers', '-', '-', '50', 'Custom'],
      ['Parallel agents', '1', '2', '10', 'Custom'],
      ['Publish regions', '1 region', 'Any', 'Any', 'Selectable'],
      ['Remove badge', '-', 'Yes', 'Yes', 'Yes'],
      ['DB rollbacks', '-', '-', '28 days', 'Custom'],
      ['Most powerful models', '-', '-', 'Yes', 'Yes'],
      ['SSO / SAML', '-', '-', '-', 'SAML/OIDC + SCIM'],
    ],
    billingFaq: [
      {
        question: 'How do credits work?',
        answer:
          'Your plan includes monthly credits that reset at the start of each billing cycle. Credits are spent on Agent effort, publishing, network transfer and database storage. Once you exceed them you continue on pay-as-you-go, billed monthly or as soon as your accrued usage passes your included credits — whichever comes first. You can also buy credit packs, and set a usage limit or a service-shutdown limit to cap spend. On the free plan you get a daily Agent-credit allowance that recharges each day, and any apps you have published stay online.',
      },
      {
        question: 'What happens when I upgrade or downgrade?',
        answer:
          'Plan changes are prorated. When you upgrade you are charged only for the remaining days of the current period; when you downgrade the unused balance is credited toward your next invoice, so you never pay twice for the same time.',
      },
      {
        question: 'Can I cancel anytime?',
        answer:
          'Yes. You can cancel anytime from Billing. Your paid plan stays active until the end of the period you have already paid for, then your account returns to the free plan. Your projects and code are kept — cancelling never deletes your work.',
      },
      {
        question: 'Do you offer annual billing?',
        answer:
          'Yes, and it saves you about 20%. Core is €20/mo billed annually (versus €25 month-to-month) and Pro is €95/mo billed annually (versus €100 month-to-month). You are billed once for the year.',
      },
      {
        question: 'Do prices include VAT, and can I get an invoice?',
        answer:
          'Prices are shown excluding VAT; any applicable VAT is calculated and added at checkout based on your billing country. Every payment generates a downloadable invoice from your Billing page. Enterprise plans are billed by invoice, managed through Stripe.',
      },
    ],
    enterpriseBadge: 'Enterprise Solutions',
    enterpriseTitle: "Built for the world's most demanding teams",
    enterpriseDescription:
      'Get dedicated infrastructure, advanced security and custom SLAs. Enterprise scales with organizations of any size.',
    enterpriseHighlights: ['SOC 2 aligned controls', 'SAML/OIDC SSO', '99.99% uptime planning', 'Premium support'],
    enterpriseIncludes: 'Enterprise includes:',
    enterpriseFeatures: [
      'Custom infrastructure sizing',
      'Dedicated account manager',
      'Professional services and training',
      'Custom integrations',
      'Advanced audit logging',
      'Private deployment options',
    ],
    faqTitle: 'Frequently asked questions',
    faqDescription: 'Got questions? We have answers.',
    faq: [
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
    ],
    ctaBadge: 'Start building today',
    ctaTitle: 'Start free, upgrade when you need more',
    ctaDescription:
      'Build with free daily Agent credits, then move to Core or Pro for more collaborators, parallel agents and any-region publishing. No credit card required to begin.',
    startFree: 'Start for Free',
    contactSales: 'Contact Sales',
  },
  fr: {
    badge: 'Économisez jusqu’à 20 % avec la facturation annuelle',
    heroTitle: 'Des tarifs qui évoluent',
    heroAccent: 'avec votre croissance',
    heroDescription:
      'Commencez gratuitement et changez d’offre à mesure que vous grandissez. Aucun frais caché ni mauvaise surprise. Des fonctionnalités d’entreprise à des prix adaptés aux startups.',
    billingPeriodLabel: 'Période de facturation',
    monthly: 'Mensuel',
    monthlyAria: 'Afficher les tarifs mensuels',
    yearly: 'Annuel – économisez 20 %',
    yearlyAria: 'Afficher les tarifs annuels',
    recommended: 'RECOMMANDÉ',
    custom: 'Sur mesure',
    contactForPricing: 'Contactez-nous pour un tarif',
    perMonth: '/mois',
    billedAnnually: (annualPrice: string) => `facturé annuellement (${annualPrice}/an)`,
    comparisonTitle: 'Comparer les offres en détail',
    comparisonDescription: 'Toutes les fonctionnalités et tous les détails, côte à côte.',
    comparisonTableLabel: 'Comparaison détaillée des offres tarifaires E-Code',
    featuresLabel: 'Fonctionnalités',
    comparisonRows: [
      ['Prix mensuel', 'Gratuit', '25 €', '100 €', 'Sur mesure'],
      ['Crédits mensuels', 'Quotidiens', '25 €', '100 €', 'Sur mesure'],
      ['Projets publiés simultanément', '1', 'Illimités', 'Illimités', 'Illimités'],
      ['Collaborateurs', '1', '5', '15', 'Sur mesure'],
      ['Lecteurs', '–', '–', '50', 'Sur mesure'],
      ['Agents en parallèle', '1', '2', '10', 'Sur mesure'],
      ['Régions de publication', '1 région', 'Toutes', 'Toutes', 'Au choix'],
      ['Suppression du badge', '–', 'Oui', 'Oui', 'Oui'],
      ['Retours arrière de la base', '–', '–', '28 jours', 'Sur mesure'],
      ['Modèles les plus puissants', '–', '–', 'Oui', 'Oui'],
      ['SSO / SAML', '–', '–', '–', 'SAML/OIDC + SCIM'],
    ],
    billingFaq: [
      {
        question: 'Comment fonctionnent les crédits ?',
        answer:
          'Votre offre inclut des crédits mensuels réinitialisés au début de chaque cycle de facturation. Ils couvrent le travail de l’Agent, la publication, le transfert réseau et le stockage de la base de données. Au-delà du montant inclus, vous passez à la consommation, facturée chaque mois ou dès que l’usage accumulé dépasse vos crédits inclus — selon la première échéance. Vous pouvez aussi acheter des packs de crédits et définir une limite d’usage ou d’arrêt du service pour maîtriser vos dépenses. L’offre gratuite comprend une allocation quotidienne de crédits Agent renouvelée chaque jour ; les applications déjà publiées restent en ligne.',
      },
      {
        question: 'Que se passe-t-il lorsque je change d’offre ?',
        answer:
          'Les changements d’offre sont calculés au prorata. Lors d’une montée en gamme, seuls les jours restants de la période en cours sont facturés. Lors d’une baisse, le solde inutilisé est déduit de votre prochaine facture : vous ne payez jamais deux fois la même période.',
      },
      {
        question: 'Puis-je résilier à tout moment ?',
        answer:
          'Oui. Vous pouvez résilier à tout moment depuis la page Facturation. Votre offre payante reste active jusqu’à la fin de la période déjà réglée, puis votre compte repasse à l’offre gratuite. Vos projets et votre code sont conservés : une résiliation ne supprime jamais votre travail.',
      },
      {
        question: 'Proposez-vous une facturation annuelle ?',
        answer:
          'Oui, avec environ 20 % d’économie. Core revient à 20 € par mois en facturation annuelle, contre 25 € au mois, et Pro à 95 € par mois, contre 100 € au mois. Le montant annuel est prélevé en une seule fois.',
      },
      {
        question: 'Les prix incluent-ils la TVA et puis-je obtenir une facture ?',
        answer:
          'Les prix sont affichés hors TVA. La TVA applicable est calculée et ajoutée lors du paiement selon votre pays de facturation. Chaque paiement génère une facture téléchargeable depuis la page Facturation. Les offres Enterprise sont facturées sur facture via Stripe.',
      },
    ],
    enterpriseBadge: 'Solutions Enterprise',
    enterpriseTitle: 'Conçu pour les équipes les plus exigeantes',
    enterpriseDescription:
      'Bénéficiez d’une infrastructure dédiée, d’une sécurité avancée et de SLA personnalisés. L’offre Enterprise s’adapte aux organisations de toute taille.',
    enterpriseHighlights: [
      'Contrôles alignés sur SOC 2',
      'SSO SAML/OIDC',
      'Objectif de disponibilité de 99,99 %',
      'Support Premium',
    ],
    enterpriseIncludes: 'L’offre Enterprise comprend :',
    enterpriseFeatures: [
      'Dimensionnement personnalisé de l’infrastructure',
      'Responsable de compte dédié',
      'Services professionnels et formation',
      'Intégrations personnalisées',
      'Journalisation d’audit avancée',
      'Options de déploiement privé',
    ],
    faqTitle: 'Questions fréquentes',
    faqDescription: 'Vous avez des questions ? Nous avons les réponses.',
    faq: [
      [
        'Puis-je changer d’offre à tout moment ?',
        'Oui. Vous pouvez passer à une offre supérieure ou inférieure à mesure que votre équipe et vos quotas évoluent.',
      ],
      [
        'Quels moyens de paiement acceptez-vous ?',
        'Le paiement Stripe accepte les cartes bancaires courantes. Les clients Enterprise peuvent régler sur facture.',
      ],
      [
        'Existe-t-il un essai gratuit pour les offres payantes ?',
        'Vous pouvez commencer avec l’offre gratuite et évoluer lorsque vous avez besoin de projets privés, de davantage d’agents ou de déploiements.',
      ],
      [
        'Comment fonctionne l’agent IA ?',
        'L’agent comprend les descriptions en langage naturel et crée des applications complètes, prêtes pour la production.',
      ],
    ],
    ctaBadge: 'Commencez à créer dès aujourd’hui',
    ctaTitle: 'Commencez gratuitement, évoluez selon vos besoins',
    ctaDescription:
      'Créez avec des crédits Agent quotidiens gratuits, puis passez à Core ou Pro pour obtenir davantage de collaborateurs, d’agents parallèles et publier dans toutes les régions. Aucune carte bancaire n’est requise pour commencer.',
    startFree: 'Commencer gratuitement',
    contactSales: 'Contacter l’équipe commerciale',
  },
} as const satisfies Record<MarketingLanguage, PricingMarketingCopy>;

export function getPricingPlanCopy(language?: string | null) {
  return pricingPlanCopy[resolveMarketingLanguage(language)];
}

export function getPricingMarketingCopy(language?: string | null): PricingMarketingCopy {
  return pricingMarketingCopy[resolveMarketingLanguage(language)];
}
