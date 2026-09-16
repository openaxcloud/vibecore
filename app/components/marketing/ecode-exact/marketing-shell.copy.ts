import type { SupportedLanguage } from '~/lib/i18n/language';

/**
 * Locale-independent destinations used by the public marketing shell.
 *
 * IDs are deliberately stable: UI copy, React keys, analytics, and tests can
 * reference them without depending on a translated label. A destination may
 * appear in several shell surfaces with different context-specific labels.
 */
export const MARKETING_SHELL_LINKS = {
  home: { href: '/' },
  aiAgent: { href: '/ai-agent' },
  browserIde: { href: '/features' },
  multiplayer: { href: '/features#multiplayer' },
  mobileApp: { href: '/mobile' },
  desktopApp: { href: '/desktop' },
  aiPlatform: { href: '/ai' },
  collaboration: { href: '/collaboration' },
  mcpIntegrations: { href: '/mcp' },
  polyglotBackends: { href: '/polyglot' },
  deployments: { href: '/marketing/deployments' },
  bounties: { href: '/marketing/bounties' },
  teams: { href: '/marketing/teams' },
  appBuilder: { href: '/solutions/app-builder' },
  websiteBuilder: { href: '/solutions/website-builder' },
  gameBuilder: { href: '/solutions/game-builder' },
  dashboardBuilder: { href: '/solutions/dashboard-builder' },
  chatbotBuilder: { href: '/solutions/chatbot-builder' },
  internalAiBuilder: { href: '/solutions/internal-ai-builder' },
  enterprise: { href: '/solutions/enterprise' },
  startups: { href: '/solutions/startups' },
  freelancers: { href: '/solutions/freelancers' },
  documentation: { href: '/docs' },
  aiDocumentation: { href: '/ai-documentation' },
  tutorials: { href: '/tutorials' },
  blog: { href: '/blog' },
  changelog: { href: '/changelog' },
  community: { href: '/community' },
  templates: { href: '/templates' },
  marketplace: { href: '/marketplace' },
  caseStudies: { href: '/case-studies' },
  helpCenter: { href: '/help-center' },
  status: { href: '/status' },
  about: { href: '/about' },
  careers: { href: '/careers' },
  press: { href: '/press' },
  partners: { href: '/partners' },
  contact: { href: '/contact' },
  accessibility: { href: '/accessibility' },
  pricing: { href: '/pricing' },
  teamWorkspace: { href: '/team' },
  languages: { href: '/templates/languages' },
  forum: { href: '/forum' },
  contactSales: { href: '/contact-sales' },
  terms: { href: '/terms' },
  privacy: { href: '/privacy' },
  subprocessors: { href: '/subprocessors' },
  dpa: { href: '/dpa' },
  usStudentDpa: { href: '/student-dpa' },
  security: { href: '/security' },
  trustSafety: { href: '/trust-and-safety' },
  acceptableUse: { href: '/acceptable-use' },
  reportAbuse: { href: '/report-abuse' },
  strikeSystem: { href: '/strike-system' },
  usageLimits: { href: '/usage-limits' },
  supportPolicy: { href: '/support-policy' },
  licensing: { href: '/licensing' },
  accountInactivity: { href: '/account-inactivity' },
  deletingYourData: { href: '/deleting-your-data' },
  compareGithubCodespaces: { href: '/compare/github-codespaces' },
  compareGlitch: { href: '/compare/glitch' },
  compareHeroku: { href: '/compare/heroku' },
  compareCodeSandbox: { href: '/compare/codesandbox' },
  compareAwsCloud9: { href: '/compare/aws-cloud9' },
  login: { href: '/login' },
  register: { href: '/register' },
  newsletterUnsubscribe: { href: '/newsletter/unsubscribe' },
  newsletterConfirmed: { href: '/newsletter-confirmed' },
} as const;

export type MarketingShellLinkId = keyof typeof MARKETING_SHELL_LINKS;

export const MARKETING_SHELL_NAV_SECTIONS = {
  product: [
    'aiAgent',
    'browserIde',
    'multiplayer',
    'mobileApp',
    'desktopApp',
    'aiPlatform',
    'collaboration',
    'mcpIntegrations',
    'polyglotBackends',
    'deployments',
    'bounties',
    'teams',
  ],
  solutions: [
    'appBuilder',
    'websiteBuilder',
    'gameBuilder',
    'dashboardBuilder',
    'chatbotBuilder',
    'internalAiBuilder',
    'enterprise',
    'startups',
    'freelancers',
  ],
  resources: [
    'documentation',
    'aiDocumentation',
    'tutorials',
    'blog',
    'changelog',
    'community',
    'templates',
    'marketplace',
    'caseStudies',
    'helpCenter',
    'status',
  ],
  company: ['about', 'careers', 'press', 'partners', 'contact', 'accessibility'],
} as const satisfies Readonly<Record<string, readonly MarketingShellLinkId[]>>;

export type MarketingShellNavSectionId = keyof typeof MARKETING_SHELL_NAV_SECTIONS;
export type MarketingShellNavItemId = (typeof MARKETING_SHELL_NAV_SECTIONS)[MarketingShellNavSectionId][number];

export const MARKETING_SHELL_FOOTER_SECTIONS = {
  product: [
    'aiAgent',
    'browserIde',
    'multiplayer',
    'mobileApp',
    'desktopApp',
    'collaboration',
    'mcpIntegrations',
    'polyglotBackends',
    'teams',
    'deployments',
    'pricing',
    'bounties',
    'aiPlatform',
  ],
  resources: ['documentation', 'blog', 'community', 'templates', 'marketplace', 'languages', 'status', 'forum'],
  company: ['about', 'careers', 'press', 'partners', 'contactSales'],
  legal: [
    'terms',
    'privacy',
    'subprocessors',
    'dpa',
    'usStudentDpa',
    'security',
    'trustSafety',
    'acceptableUse',
    'reportAbuse',
    'strikeSystem',
    'usageLimits',
    'supportPolicy',
    'licensing',
    'accountInactivity',
    'deletingYourData',
  ],
  compare: ['compareGithubCodespaces', 'compareGlitch', 'compareHeroku', 'compareCodeSandbox', 'compareAwsCloud9'],
} as const satisfies Readonly<Record<string, readonly MarketingShellLinkId[]>>;

export const MARKETING_SHELL_FOOTER_COLUMN_IDS = ['product', 'resources', 'company', 'legal'] as const;

export type MarketingShellFooterSectionId = keyof typeof MARKETING_SHELL_FOOTER_SECTIONS;
export type MarketingShellFooterColumnId = (typeof MARKETING_SHELL_FOOTER_COLUMN_IDS)[number];
export type MarketingShellFooterLinkId =
  (typeof MARKETING_SHELL_FOOTER_SECTIONS)[MarketingShellFooterSectionId][number];

export const MARKETING_SHELL_SOCIAL_LINKS = {
  twitter: { href: 'https://twitter.com/ecode', name: 'X (Twitter)' },
  github: { href: 'https://github.com/openaxcloud/vibecore', name: 'GitHub' },
  linkedin: { href: 'https://linkedin.com/company/ecode', name: 'LinkedIn' },
  instagram: { href: 'https://instagram.com/ecode', name: 'Instagram' },
} as const;

export type MarketingShellSocialId = keyof typeof MARKETING_SHELL_SOCIAL_LINKS;

export type MarketingShellNavItemCopy = Readonly<{
  title: string;
  description: string;
}>;

export type MarketingShellCopy = Readonly<{
  announcement: Readonly<{
    badge: string;
    message: string;
    ctaLabel: string;
    ctaAriaLabel: string;
    dismissAriaLabel: string;
  }>;
  a11y: Readonly<{
    skipToContent: string;
    mainNavigation: string;
    home: string;
    openMobileMenu: string;
    closeMobileMenu: string;
    mobileMenuTitle: string;
    mobileMenuDescription: string;
    siteHeader: string;
    siteFooter: string;
    footerNavigation: string;
    platformComparisons: string;
    emailAddress: string;
    socialLinkTemplate: string;
  }>;
  navigation: Readonly<{
    sectionLabels: Readonly<Record<MarketingShellNavSectionId, string>>;
    items: Readonly<Record<MarketingShellNavItemId, MarketingShellNavItemCopy>>;
    pricing: string;
    teams: string;
    logIn: string;
    getStarted: string;
    signIn: string;
  }>;
  theme: Readonly<{
    light: string;
    dark: string;
    switchToLight: string;
    switchToDark: string;
  }>;
  footer: Readonly<{
    eyebrow: string;
    title: string;
    description: string;
    contactSales: string;
    startBuilding: string;
    facts: Readonly<{
      sourceCode: Readonly<{ label: string; value: string }>;
      projectWorkflow: Readonly<{ label: string; value: string }>;
    }>;
    columnLabels: Readonly<Record<MarketingShellFooterColumnId, string>>;
    linkLabels: Readonly<Record<MarketingShellFooterLinkId, string>>;
    compareTitle: string;
    compareDescription: string;
    assurances: readonly [string, string, string];
    copyrightTemplate: string;
    emailPreferences: string;
    newsletter: string;
  }>;
  newsletter: Readonly<{
    title: string;
    success: string;
    emailPlaceholder: string;
    subscribing: string;
    subscribe: string;
    errorFallback: string;
  }>;
}>;

export type MarketingShellInterpolationValue = string | number;

const INTERPOLATION_TOKEN = /\{([A-Za-z][A-Za-z0-9_]*)\}/g;

/**
 * Replaces explicit `{token}` placeholders without evaluating markup or code.
 * Missing values, unused values, malformed braces, empty strings, and non-finite
 * numbers fail loudly so translated accessible names never ship half-rendered.
 */
export function interpolateMarketingShellCopy(
  template: string,
  values: Readonly<Record<string, MarketingShellInterpolationValue>>,
): string {
  const tokens = [...template.matchAll(INTERPOLATION_TOKEN)].map((match) => match[1]);
  const uniqueTokens = [...new Set(tokens)];
  const remainder = template.replace(INTERPOLATION_TOKEN, '');

  if (remainder.includes('{') || remainder.includes('}')) {
    throw new Error('Malformed marketing shell interpolation template.');
  }

  for (const token of uniqueTokens) {
    if (!Object.prototype.hasOwnProperty.call(values, token)) {
      throw new Error(`Missing marketing shell interpolation value: ${token}.`);
    }
  }

  for (const key of Object.keys(values)) {
    if (!uniqueTokens.includes(key)) {
      throw new Error(`Unused marketing shell interpolation value: ${key}.`);
    }

    const value = values[key];

    if (typeof value === 'number' && !Number.isFinite(value)) {
      throw new Error(`Invalid marketing shell interpolation value: ${key}.`);
    }

    if (typeof value === 'string' && value.trim().length === 0) {
      throw new Error(`Empty marketing shell interpolation value: ${key}.`);
    }
  }

  return template.replace(INTERPOLATION_TOKEN, (_match, token: string) => String(values[token]));
}

const en = {
  announcement: {
    badge: 'E-CODE',
    message: 'Generated files, runtime feedback, previews, and release controls stay in one workspace.',
    ctaLabel: 'Talk to an expert',
    ctaAriaLabel: 'Talk to an expert about E-Code for your team',
    dismissAriaLabel: 'Dismiss announcement',
  },
  a11y: {
    skipToContent: 'Skip to content',
    mainNavigation: 'Main navigation',
    home: 'E-Code home',
    openMobileMenu: 'Open mobile menu',
    closeMobileMenu: 'Close mobile menu',
    mobileMenuTitle: 'Mobile navigation menu',
    mobileMenuDescription: 'Navigate through E-Code platform sections',
    siteHeader: 'Site header',
    siteFooter: 'Site footer',
    footerNavigation: 'Footer navigation',
    platformComparisons: 'Platform comparisons',
    emailAddress: 'Email address',
    socialLinkTemplate: 'E-Code on {network}',
  },
  navigation: {
    sectionLabels: {
      product: 'Product',
      solutions: 'Solutions',
      resources: 'Resources',
      company: 'Company',
    },
    items: {
      aiAgent: {
        title: 'AI Agent',
        description: 'Build production-ready apps from natural-language prompts.',
      },
      browserIde: {
        title: 'Browser IDE',
        description: 'Develop, run, and review projects with your team in the browser.',
      },
      multiplayer: {
        title: 'Multiplayer',
        description: 'Edit together with live presence, pairing, and shared project context.',
      },
      mobileApp: {
        title: 'Mobile App',
        description: 'Review projects and keep work moving from your phone or tablet.',
      },
      desktopApp: {
        title: 'Desktop App',
        description: 'Work locally with a focused desktop experience and secure device sync.',
      },
      aiPlatform: {
        title: 'AI Platform',
        description: 'Govern, observe, and orchestrate AI workloads from one control plane.',
      },
      collaboration: {
        title: 'Collaboration',
        description: 'Share workspaces, comments, presence, and changes in real time.',
      },
      mcpIntegrations: {
        title: 'MCP Integrations',
        description: 'Connect agents to approved tools and context sources through MCP.',
      },
      polyglotBackends: {
        title: 'Polyglot Backends',
        description: 'Generate and run backend services in common languages with live logs.',
      },
      deployments: {
        title: 'Deployments',
        description: 'Release with domain controls, runtime logs, health checks, and rollbacks.',
      },
      bounties: {
        title: 'Bounties',
        description: 'Bring in an on-demand developer network when a project needs extra hands.',
      },
      teams: {
        title: 'Teams',
        description: 'Manage access, governance, and shared delivery workflows across an organization.',
      },
      appBuilder: {
        title: 'App Builder',
        description: 'Turn a business workflow into a working full-stack application.',
      },
      websiteBuilder: {
        title: 'Website Builder',
        description: 'Create a polished website with its pages, content, forms, and publishing flow.',
      },
      gameBuilder: {
        title: 'Game Builder',
        description: 'Build interactive games with rules, scoring, screens, and multiplayer logic.',
      },
      dashboardBuilder: {
        title: 'Dashboard Builder',
        description: 'Connect data to clear dashboards with charts, filters, and live updates.',
      },
      chatbotBuilder: {
        title: 'Chatbot / AI Agent Builder',
        description: 'Launch assistants that answer, act, and use the knowledge you approve.',
      },
      internalAiBuilder: {
        title: 'Internal AI Builder',
        description: 'Give employees private AI tools grounded in company knowledge and permissions.',
      },
      enterprise: {
        title: 'Enterprise',
        description: 'Ship with SSO, roles, audit trails, and governed release workflows.',
      },
      startups: {
        title: 'Startups',
        description: 'Move from a product idea to a working application in one workspace.',
      },
      freelancers: {
        title: 'Freelancers',
        description: 'Deliver client projects with visible code, live previews, and clean handoff.',
      },
      documentation: {
        title: 'Documentation',
        description: 'Follow practical guides for building, reviewing, and shipping with E-Code.',
      },
      aiDocumentation: {
        title: 'AI Documentation',
        description: 'Understand agent capabilities, controls, context, and operating patterns.',
      },
      tutorials: {
        title: 'Tutorials',
        description: 'Learn complete workflows through guided, step-by-step projects.',
      },
      blog: {
        title: 'Blog',
        description: 'Read product, engineering, and software-delivery stories from E-Code.',
      },
      changelog: {
        title: 'Changelog',
        description: 'Track new features, improvements, and fixes as they ship.',
      },
      community: {
        title: 'Community',
        description: 'Meet other builders, exchange techniques, and share working projects.',
      },
      templates: {
        title: 'Templates',
        description: 'Start from curated foundations for common products and industries.',
      },
      marketplace: {
        title: 'Marketplace',
        description: 'Find reusable starters, implementation patterns, and project foundations.',
      },
      caseStudies: {
        title: 'Case Studies',
        description: 'Explore concrete product examples and the workflows behind them.',
      },
      helpCenter: {
        title: 'Help Center',
        description: 'Find answers, troubleshooting steps, and support paths.',
      },
      status: {
        title: 'Status',
        description: 'Check current platform availability and recent service events.',
      },
      about: {
        title: 'About',
        description: 'Learn about the mission, principles, and team behind E-Code.',
      },
      careers: {
        title: 'Careers',
        description: 'Join a distributed team building practical software creation tools.',
      },
      press: {
        title: 'Press',
        description: 'Access company information, media assets, and recent coverage.',
      },
      partners: {
        title: 'Partners',
        description: 'Work with E-Code through technology and solution partnerships.',
      },
      contact: {
        title: 'Contact',
        description: 'Reach the right E-Code team for your question.',
      },
      accessibility: {
        title: 'Accessibility',
        description: 'Read how E-Code supports inclusive product experiences.',
      },
    },
    pricing: 'Pricing',
    teams: 'Teams',
    logIn: 'Log in',
    getStarted: 'Get started',
    signIn: 'Sign in',
  },
  theme: {
    light: 'Light',
    dark: 'Dark',
    switchToLight: 'Switch to light theme',
    switchToDark: 'Switch to dark theme',
  },
  footer: {
    eyebrow: 'Prompt, code, preview, deploy',
    title: 'Build inspectable software with your team',
    description:
      'E-Code keeps generated files, runtime feedback, preview state, and release controls together from the first prompt to the live application.',
    contactSales: 'Talk to sales',
    startBuilding: 'Start building',
    facts: {
      sourceCode: { label: 'Source code', value: 'Visible and exportable' },
      projectWorkflow: { label: 'Project workflow', value: 'Preview through deployment' },
    },
    columnLabels: {
      product: 'Product',
      resources: 'Resources',
      company: 'Company',
      legal: 'Legal',
    },
    linkLabels: {
      aiAgent: 'AI Agent',
      browserIde: 'IDE',
      multiplayer: 'Multiplayer',
      mobileApp: 'Mobile App',
      desktopApp: 'Desktop App',
      collaboration: 'Collaboration',
      mcpIntegrations: 'MCP Integrations',
      polyglotBackends: 'Polyglot Backends',
      teams: 'Teams',
      deployments: 'Deployments',
      pricing: 'Pricing',
      bounties: 'Bounties',
      aiPlatform: 'AI Platform',
      documentation: 'Docs',
      blog: 'Blog',
      community: 'Community',
      templates: 'Templates',
      marketplace: 'Marketplace',
      languages: 'Languages',
      status: 'Status',
      forum: 'Forum',
      about: 'About',
      careers: 'Careers',
      press: 'Press',
      partners: 'Partners',
      contactSales: 'Contact Sales',
      terms: 'Terms',
      privacy: 'Privacy',
      subprocessors: 'Subprocessors',
      dpa: 'DPA',
      usStudentDpa: 'US Student DPA',
      security: 'Security',
      trustSafety: 'Trust & Safety',
      acceptableUse: 'Acceptable Use',
      reportAbuse: 'Report Abuse',
      strikeSystem: 'Strike System',
      usageLimits: 'Usage & Limits',
      supportPolicy: 'Support Policy',
      licensing: 'Licensing',
      accountInactivity: 'Account Inactivity',
      deletingYourData: 'Deleting Your Data',
      compareGithubCodespaces: 'E-Code vs GitHub Codespaces',
      compareGlitch: 'E-Code vs Glitch',
      compareHeroku: 'E-Code vs Heroku',
      compareCodeSandbox: 'E-Code vs CodeSandbox',
      compareAwsCloud9: 'E-Code vs AWS Cloud9',
    },
    compareTitle: 'Compare platforms',
    compareDescription: 'See how E-Code compares with other development clouds.',
    assurances: [
      'Source files remain visible for review and export.',
      'Preview links and deployment controls share one workspace.',
      'Agent changes stay connected to files and runtime feedback.',
    ],
    copyrightTemplate: '© {year} E-Code.AI (Snatch Group Limited). All rights reserved.',
    emailPreferences: 'Email preferences',
    newsletter: 'Newsletter',
  },
  newsletter: {
    title: 'Newsletter',
    success: "You're subscribed — watch your inbox.",
    emailPlaceholder: 'you@company.com',
    subscribing: 'Subscribing…',
    subscribe: 'Subscribe',
    errorFallback: 'Subscription failed. Please try again.',
  },
} as const satisfies MarketingShellCopy;

const fr = {
  announcement: {
    badge: 'E-CODE',
    message:
      'Les fichiers générés, les retours d’exécution, les aperçus et les contrôles de mise en ligne restent réunis dans un même espace.',
    ctaLabel: 'Parler à un expert',
    ctaAriaLabel: 'Parler à un expert d’E-Code pour votre équipe',
    dismissAriaLabel: 'Fermer l’annonce',
  },
  a11y: {
    skipToContent: 'Aller au contenu',
    mainNavigation: 'Navigation principale',
    home: 'Accueil E-Code',
    openMobileMenu: 'Ouvrir le menu mobile',
    closeMobileMenu: 'Fermer le menu mobile',
    mobileMenuTitle: 'Menu de navigation mobile',
    mobileMenuDescription: 'Parcourir les rubriques de la plateforme E-Code',
    siteHeader: 'En-tête du site',
    siteFooter: 'Pied de page du site',
    footerNavigation: 'Navigation du pied de page',
    platformComparisons: 'Comparaisons de plateformes',
    emailAddress: 'Adresse e-mail',
    socialLinkTemplate: 'E-Code sur {network}',
  },
  navigation: {
    sectionLabels: {
      product: 'Produit',
      solutions: 'Solutions',
      resources: 'Ressources',
      company: 'Entreprise',
    },
    items: {
      aiAgent: {
        title: 'Agent IA',
        description: 'Créez des applications prêtes pour la production à partir de prompts en langage naturel.',
      },
      browserIde: {
        title: 'IDE dans le navigateur',
        description: 'Développez, exécutez et révisez vos projets en équipe depuis le navigateur.',
      },
      multiplayer: {
        title: 'Multijoueur',
        description: 'Modifiez ensemble avec présence en direct, programmation en binôme et contexte partagé.',
      },
      mobileApp: {
        title: 'Application mobile',
        description: 'Révisez vos projets et faites avancer le travail depuis un téléphone ou une tablette.',
      },
      desktopApp: {
        title: 'Application de bureau',
        description: 'Travaillez en local dans une interface dédiée avec synchronisation sécurisée des appareils.',
      },
      aiPlatform: {
        title: 'Plateforme IA',
        description: 'Gouvernez, observez et orchestrez les charges IA depuis un même centre de contrôle.',
      },
      collaboration: {
        title: 'Collaboration',
        description: 'Partagez vos espaces, commentaires, présence et modifications en temps réel.',
      },
      mcpIntegrations: {
        title: 'Intégrations MCP',
        description: 'Reliez les agents aux outils et sources de contexte approuvés via MCP.',
      },
      polyglotBackends: {
        title: 'Services applicatifs polyglottes',
        description:
          'Générez et exécutez des services applicatifs dans les langages courants avec des journaux en direct.',
      },
      deployments: {
        title: 'Déploiements',
        description: 'Mettez en ligne avec gestion des domaines, journaux, contrôles d’état et retours arrière.',
      },
      bounties: {
        title: 'Missions',
        description: 'Faites appel à un réseau de développeurs à la demande lorsqu’un projet exige du renfort.',
      },
      teams: {
        title: 'Équipes',
        description: 'Gérez les accès, la gouvernance et les cycles de livraison partagés dans toute l’organisation.',
      },
      appBuilder: {
        title: 'Créateur d’applications',
        description: 'Transformez un processus métier en application complète et opérationnelle.',
      },
      websiteBuilder: {
        title: 'Créateur de sites web',
        description: 'Créez un site soigné avec ses pages, ses contenus, ses formulaires et sa publication.',
      },
      gameBuilder: {
        title: 'Créateur de jeux',
        description: 'Construisez des jeux interactifs avec règles, scores, écrans et logique multijoueur.',
      },
      dashboardBuilder: {
        title: 'Créateur de tableaux de bord',
        description: 'Reliez vos données à des tableaux clairs avec graphiques, filtres et mises à jour en direct.',
      },
      chatbotBuilder: {
        title: 'Créateur de chatbots et d’agents IA',
        description: 'Lancez des assistants qui répondent, agissent et utilisent les connaissances que vous validez.',
      },
      internalAiBuilder: {
        title: 'Créateur d’IA interne',
        description: 'Donnez aux équipes des outils IA privés fondés sur vos connaissances et vos autorisations.',
      },
      enterprise: {
        title: 'Grandes entreprises',
        description: 'Livrez avec SSO, rôles, journaux d’audit et circuits de mise en ligne gouvernés.',
      },
      startups: {
        title: 'Startups',
        description: 'Passez d’une idée produit à une application fonctionnelle dans un même espace.',
      },
      freelancers: {
        title: 'Freelances',
        description: 'Livrez les projets clients avec code visible, aperçus en direct et transfert propre.',
      },
      documentation: {
        title: 'Documentation',
        description: 'Suivez des guides pratiques pour créer, réviser et livrer avec E-Code.',
      },
      aiDocumentation: {
        title: 'Documentation IA',
        description: 'Découvrez les capacités, contrôles, contextes et modes de fonctionnement des agents.',
      },
      tutorials: {
        title: 'Tutoriels',
        description: 'Apprenez des processus complets grâce à des projets guidés pas à pas.',
      },
      blog: {
        title: 'Blog',
        description: 'Lisez les articles produit, ingénierie et livraison logicielle d’E-Code.',
      },
      changelog: {
        title: 'Journal des nouveautés',
        description: 'Suivez les fonctionnalités, améliorations et correctifs dès leur publication.',
      },
      community: {
        title: 'Communauté',
        description: 'Rencontrez d’autres créateurs, échangez des méthodes et partagez des projets réels.',
      },
      templates: {
        title: 'Modèles',
        description: 'Démarrez avec des fondations sélectionnées pour des produits et secteurs courants.',
      },
      marketplace: {
        title: 'Place de marché',
        description: 'Trouvez des bases, méthodes d’implémentation et fondations de projet réutilisables.',
      },
      caseStudies: {
        title: 'Études de cas',
        description: 'Explorez des exemples concrets de produits et les processus qui les rendent possibles.',
      },
      helpCenter: {
        title: 'Centre d’aide',
        description: 'Trouvez des réponses, des étapes de dépannage et les bons canaux d’assistance.',
      },
      status: {
        title: 'État des services',
        description: 'Consultez la disponibilité actuelle de la plateforme et les incidents récents.',
      },
      about: {
        title: 'À propos',
        description: 'Découvrez la mission, les principes et l’équipe derrière E-Code.',
      },
      careers: {
        title: 'Carrières',
        description: 'Rejoignez une équipe distribuée qui construit des outils concrets de création logicielle.',
      },
      press: {
        title: 'Presse',
        description: 'Accédez aux informations de l’entreprise, aux ressources média et aux parutions récentes.',
      },
      partners: {
        title: 'Partenaires',
        description: 'Collaborez avec E-Code dans le cadre de partenariats technologiques et métiers.',
      },
      contact: {
        title: 'Contact',
        description: 'Adressez votre question à la bonne équipe E-Code.',
      },
      accessibility: {
        title: 'Accessibilité',
        description: 'Découvrez comment E-Code favorise des expériences produit inclusives.',
      },
    },
    pricing: 'Tarifs',
    teams: 'Équipes',
    logIn: 'Se connecter',
    getStarted: 'Commencer',
    signIn: 'Se connecter',
  },
  theme: {
    light: 'Clair',
    dark: 'Sombre',
    switchToLight: 'Passer au thème clair',
    switchToDark: 'Passer au thème sombre',
  },
  footer: {
    eyebrow: 'Prompt, code, aperçu, mise en ligne',
    title: 'Créez des logiciels inspectables avec votre équipe',
    description:
      'E-Code réunit les fichiers générés, les retours d’exécution, l’état de l’aperçu et les contrôles de mise en ligne, du premier prompt à l’application en production.',
    contactSales: 'Contacter l’équipe commerciale',
    startBuilding: 'Commencer à créer',
    facts: {
      sourceCode: { label: 'Code source', value: 'Visible et exportable' },
      projectWorkflow: { label: 'Cycle du projet', value: 'De l’aperçu au déploiement' },
    },
    columnLabels: {
      product: 'Produit',
      resources: 'Ressources',
      company: 'Entreprise',
      legal: 'Mentions légales',
    },
    linkLabels: {
      aiAgent: 'Agent IA',
      browserIde: 'IDE',
      multiplayer: 'Multijoueur',
      mobileApp: 'Application mobile',
      desktopApp: 'Application de bureau',
      collaboration: 'Collaboration',
      mcpIntegrations: 'Intégrations MCP',
      polyglotBackends: 'Services applicatifs polyglottes',
      teams: 'Équipes',
      deployments: 'Déploiements',
      pricing: 'Tarifs',
      bounties: 'Missions',
      aiPlatform: 'Plateforme IA',
      documentation: 'Documentation',
      blog: 'Blog',
      community: 'Communauté',
      templates: 'Modèles',
      marketplace: 'Place de marché',
      languages: 'Langages',
      status: 'État des services',
      forum: 'Forum',
      about: 'À propos',
      careers: 'Carrières',
      press: 'Presse',
      partners: 'Partenaires',
      contactSales: 'Contacter l’équipe commerciale',
      terms: 'Conditions d’utilisation',
      privacy: 'Confidentialité',
      subprocessors: 'Sous-traitants',
      dpa: 'DPA',
      usStudentDpa: 'DPA pour les étudiants aux États-Unis',
      security: 'Sécurité',
      trustSafety: 'Confiance et sécurité',
      acceptableUse: 'Utilisation acceptable',
      reportAbuse: 'Signaler un abus',
      strikeSystem: 'Système d’avertissements',
      usageLimits: 'Utilisation et limites',
      supportPolicy: 'Politique d’assistance',
      licensing: 'Licences',
      accountInactivity: 'Inactivité du compte',
      deletingYourData: 'Suppression de vos données',
      compareGithubCodespaces: 'E-Code face à GitHub Codespaces',
      compareGlitch: 'E-Code face à Glitch',
      compareHeroku: 'E-Code face à Heroku',
      compareCodeSandbox: 'E-Code face à CodeSandbox',
      compareAwsCloud9: 'E-Code face à AWS Cloud9',
    },
    compareTitle: 'Comparer les plateformes',
    compareDescription: 'Découvrez comment E-Code se compare aux autres clouds de développement.',
    assurances: [
      'Les fichiers source restent visibles pour être révisés et exportés.',
      'Les liens d’aperçu et les contrôles de déploiement partagent le même espace.',
      'Les modifications de l’agent restent reliées aux fichiers et aux retours d’exécution.',
    ],
    copyrightTemplate: '© {year} E-Code.AI (Snatch Group Limited). Tous droits réservés.',
    emailPreferences: 'Préférences e-mail',
    newsletter: 'Newsletter',
  },
  newsletter: {
    title: 'Newsletter',
    success: 'Votre inscription est confirmée — surveillez votre boîte de réception.',
    emailPlaceholder: 'vous@entreprise.fr',
    subscribing: 'Inscription en cours…',
    subscribe: 'S’inscrire',
    errorFallback: 'L’inscription a échoué. Réessayez.',
  },
} as const satisfies MarketingShellCopy;

const es = {
  announcement: {
    badge: 'E-CODE',
    message:
      'Los archivos generados, la información de ejecución, las vistas previas y los controles de publicación permanecen en un solo espacio.',
    ctaLabel: 'Hablar con un experto',
    ctaAriaLabel: 'Hablar con un experto sobre E-Code para tu equipo',
    dismissAriaLabel: 'Cerrar el anuncio',
  },
  a11y: {
    skipToContent: 'Ir al contenido',
    mainNavigation: 'Navegación principal',
    home: 'Inicio de E-Code',
    openMobileMenu: 'Abrir el menú móvil',
    closeMobileMenu: 'Cerrar el menú móvil',
    mobileMenuTitle: 'Menú de navegación móvil',
    mobileMenuDescription: 'Recorre las secciones de la plataforma E-Code',
    siteHeader: 'Encabezado del sitio',
    siteFooter: 'Pie de página del sitio',
    footerNavigation: 'Navegación del pie de página',
    platformComparisons: 'Comparaciones de plataformas',
    emailAddress: 'Correo electrónico',
    socialLinkTemplate: 'E-Code en {network}',
  },
  navigation: {
    sectionLabels: {
      product: 'Producto',
      solutions: 'Soluciones',
      resources: 'Recursos',
      company: 'Empresa',
    },
    items: {
      aiAgent: {
        title: 'Agente de IA',
        description: 'Crea aplicaciones listas para producción a partir de instrucciones en lenguaje natural.',
      },
      browserIde: {
        title: 'IDE en el navegador',
        description: 'Desarrolla, ejecuta y revisa proyectos con tu equipo desde el navegador.',
      },
      multiplayer: {
        title: 'Multijugador',
        description: 'Edita en equipo con presencia en vivo, programación conjunta y contexto compartido.',
      },
      mobileApp: {
        title: 'Aplicación móvil',
        description: 'Revisa proyectos y mantén el trabajo en marcha desde el teléfono o la tableta.',
      },
      desktopApp: {
        title: 'Aplicación de escritorio',
        description: 'Trabaja en local con una experiencia enfocada y sincronización segura de dispositivos.',
      },
      aiPlatform: {
        title: 'Plataforma de IA',
        description: 'Gobierna, observa y orquesta cargas de IA desde un único centro de control.',
      },
      collaboration: {
        title: 'Colaboración',
        description: 'Comparte espacios, comentarios, presencia y cambios en tiempo real.',
      },
      mcpIntegrations: {
        title: 'Integraciones MCP',
        description: 'Conecta agentes con herramientas y fuentes de contexto aprobadas mediante MCP.',
      },
      polyglotBackends: {
        title: 'Backends políglotas',
        description: 'Genera y ejecuta servicios backend en lenguajes habituales con registros en vivo.',
      },
      deployments: {
        title: 'Despliegues',
        description: 'Publica con control de dominios, registros, comprobaciones de estado y reversiones.',
      },
      bounties: {
        title: 'Encargos',
        description: 'Suma una red de desarrolladores bajo demanda cuando el proyecto necesita refuerzo.',
      },
      teams: {
        title: 'Equipos',
        description: 'Gestiona accesos, gobierno y flujos de entrega compartidos en toda la organización.',
      },
      appBuilder: {
        title: 'Creador de aplicaciones',
        description: 'Convierte un proceso de negocio en una aplicación full-stack funcional.',
      },
      websiteBuilder: {
        title: 'Creador de sitios web',
        description: 'Crea un sitio cuidado con sus páginas, contenidos, formularios y publicación.',
      },
      gameBuilder: {
        title: 'Creador de juegos',
        description: 'Construye juegos interactivos con reglas, puntuación, pantallas y lógica multijugador.',
      },
      dashboardBuilder: {
        title: 'Creador de paneles',
        description: 'Conecta datos a paneles claros con gráficos, filtros y actualizaciones en vivo.',
      },
      chatbotBuilder: {
        title: 'Creador de chatbots y agentes de IA',
        description: 'Lanza asistentes que responden, actúan y usan el conocimiento que tú autorizas.',
      },
      internalAiBuilder: {
        title: 'Creador de IA interna',
        description: 'Ofrece al personal herramientas privadas de IA basadas en conocimiento y permisos internos.',
      },
      enterprise: {
        title: 'Grandes empresas',
        description: 'Entrega con SSO, roles, registros de auditoría y flujos de publicación gobernados.',
      },
      startups: {
        title: 'Startups',
        description: 'Pasa de una idea de producto a una aplicación funcional en un solo espacio.',
      },
      freelancers: {
        title: 'Profesionales independientes',
        description: 'Entrega proyectos a clientes con código visible, vistas previas y un traspaso ordenado.',
      },
      documentation: {
        title: 'Documentación',
        description: 'Sigue guías prácticas para crear, revisar y publicar con E-Code.',
      },
      aiDocumentation: {
        title: 'Documentación de IA',
        description: 'Conoce las capacidades, los controles, el contexto y los patrones de uso de los agentes.',
      },
      tutorials: {
        title: 'Tutoriales',
        description: 'Aprende flujos completos con proyectos guiados paso a paso.',
      },
      blog: {
        title: 'Blog',
        description: 'Lee historias de producto, ingeniería y entrega de software de E-Code.',
      },
      changelog: {
        title: 'Registro de cambios',
        description: 'Sigue las nuevas funciones, mejoras y correcciones cuando se publican.',
      },
      community: {
        title: 'Comunidad',
        description: 'Conoce a otros creadores, intercambia técnicas y comparte proyectos reales.',
      },
      templates: {
        title: 'Plantillas',
        description: 'Empieza con bases seleccionadas para productos y sectores habituales.',
      },
      marketplace: {
        title: 'Marketplace',
        description: 'Encuentra bases, patrones de implementación y estructuras de proyecto reutilizables.',
      },
      caseStudies: {
        title: 'Casos de estudio',
        description: 'Explora ejemplos concretos de productos y los flujos que hay detrás.',
      },
      helpCenter: {
        title: 'Centro de ayuda',
        description: 'Encuentra respuestas, pasos de diagnóstico y vías de soporte.',
      },
      status: {
        title: 'Estado',
        description: 'Consulta la disponibilidad actual de la plataforma y los incidentes recientes.',
      },
      about: {
        title: 'Quiénes somos',
        description: 'Conoce la misión, los principios y el equipo detrás de E-Code.',
      },
      careers: {
        title: 'Empleo',
        description: 'Únete a un equipo distribuido que crea herramientas prácticas para desarrollar software.',
      },
      press: {
        title: 'Prensa',
        description: 'Accede a información corporativa, recursos de prensa y cobertura reciente.',
      },
      partners: {
        title: 'Socios',
        description: 'Colabora con E-Code mediante alianzas tecnológicas y de soluciones.',
      },
      contact: {
        title: 'Contacto',
        description: 'Haz llegar tu consulta al equipo adecuado de E-Code.',
      },
      accessibility: {
        title: 'Accesibilidad',
        description: 'Descubre cómo E-Code impulsa experiencias de producto inclusivas.',
      },
    },
    pricing: 'Precios',
    teams: 'Equipos',
    logIn: 'Iniciar sesión',
    getStarted: 'Empezar',
    signIn: 'Iniciar sesión',
  },
  theme: {
    light: 'Claro',
    dark: 'Oscuro',
    switchToLight: 'Cambiar al tema claro',
    switchToDark: 'Cambiar al tema oscuro',
  },
  footer: {
    eyebrow: 'Instrucción, código, vista previa, publicación',
    title: 'Crea software inspeccionable con tu equipo',
    description:
      'E-Code reúne los archivos generados, la información de ejecución, el estado de la vista previa y los controles de publicación desde la primera instrucción hasta la aplicación en vivo.',
    contactSales: 'Hablar con ventas',
    startBuilding: 'Empezar a crear',
    facts: {
      sourceCode: { label: 'Código fuente', value: 'Visible y exportable' },
      projectWorkflow: { label: 'Flujo del proyecto', value: 'De la vista previa al despliegue' },
    },
    columnLabels: {
      product: 'Producto',
      resources: 'Recursos',
      company: 'Empresa',
      legal: 'Legal',
    },
    linkLabels: {
      aiAgent: 'Agente de IA',
      browserIde: 'IDE',
      multiplayer: 'Multijugador',
      mobileApp: 'Aplicación móvil',
      desktopApp: 'Aplicación de escritorio',
      collaboration: 'Colaboración',
      mcpIntegrations: 'Integraciones MCP',
      polyglotBackends: 'Backends políglotas',
      teams: 'Equipos',
      deployments: 'Despliegues',
      pricing: 'Precios',
      bounties: 'Encargos',
      aiPlatform: 'Plataforma de IA',
      documentation: 'Documentación',
      blog: 'Blog',
      community: 'Comunidad',
      templates: 'Plantillas',
      marketplace: 'Marketplace',
      languages: 'Lenguajes',
      status: 'Estado',
      forum: 'Foro',
      about: 'Quiénes somos',
      careers: 'Empleo',
      press: 'Prensa',
      partners: 'Socios',
      contactSales: 'Contactar con ventas',
      terms: 'Términos',
      privacy: 'Privacidad',
      subprocessors: 'Subencargados del tratamiento',
      dpa: 'DPA',
      usStudentDpa: 'DPA para estudiantes de EE. UU.',
      security: 'Seguridad',
      trustSafety: 'Confianza y seguridad',
      acceptableUse: 'Uso aceptable',
      reportAbuse: 'Denunciar abuso',
      strikeSystem: 'Sistema de avisos',
      usageLimits: 'Uso y límites',
      supportPolicy: 'Política de soporte',
      licensing: 'Licencias',
      accountInactivity: 'Inactividad de la cuenta',
      deletingYourData: 'Eliminación de tus datos',
      compareGithubCodespaces: 'E-Code frente a GitHub Codespaces',
      compareGlitch: 'E-Code frente a Glitch',
      compareHeroku: 'E-Code frente a Heroku',
      compareCodeSandbox: 'E-Code frente a CodeSandbox',
      compareAwsCloud9: 'E-Code frente a AWS Cloud9',
    },
    compareTitle: 'Compara plataformas',
    compareDescription: 'Descubre cómo se compara E-Code con otras nubes de desarrollo.',
    assurances: [
      'Los archivos fuente permanecen visibles para revisarlos y exportarlos.',
      'Los enlaces de vista previa y los controles de despliegue comparten un espacio.',
      'Los cambios del agente siguen conectados a los archivos y a la información de ejecución.',
    ],
    copyrightTemplate: '© {year} E-Code.AI (Snatch Group Limited). Todos los derechos reservados.',
    emailPreferences: 'Preferencias de correo',
    newsletter: 'Boletín',
  },
  newsletter: {
    title: 'Boletín',
    success: 'Tu suscripción está confirmada. Revisa tu bandeja de entrada.',
    emailPlaceholder: 'tu@empresa.com',
    subscribing: 'Suscribiendo…',
    subscribe: 'Suscribirse',
    errorFallback: 'No se pudo completar la suscripción. Inténtalo de nuevo.',
  },
} as const satisfies MarketingShellCopy;

const ar = {
  announcement: {
    badge: 'E-CODE',
    message:
      'تبقى الملفات المُنشأة وملاحظات وقت التشغيل والمعاينات وعناصر التحكم في الإصدار مجتمعة في مساحة عمل واحدة.',
    ctaLabel: 'تحدث إلى خبير',
    ctaAriaLabel: 'تحدث إلى خبير حول استخدام E-Code مع فريقك',
    dismissAriaLabel: 'إغلاق الإعلان',
  },
  a11y: {
    skipToContent: 'الانتقال إلى المحتوى',
    mainNavigation: 'التنقل الرئيسي',
    home: 'الصفحة الرئيسية لـ E-Code',
    openMobileMenu: 'فتح قائمة الهاتف',
    closeMobileMenu: 'إغلاق قائمة الهاتف',
    mobileMenuTitle: 'قائمة التنقل على الهاتف',
    mobileMenuDescription: 'التنقل بين أقسام منصة E-Code',
    siteHeader: 'ترويسة الموقع',
    siteFooter: 'تذييل الموقع',
    footerNavigation: 'التنقل في تذييل الصفحة',
    platformComparisons: 'مقارنات المنصات',
    emailAddress: 'عنوان البريد الإلكتروني',
    socialLinkTemplate: 'E-Code على {network}',
  },
  navigation: {
    sectionLabels: {
      product: 'المنتج',
      solutions: 'الحلول',
      resources: 'الموارد',
      company: 'الشركة',
    },
    items: {
      aiAgent: {
        title: 'وكيل الذكاء الاصطناعي',
        description: 'أنشئ تطبيقات جاهزة للإنتاج انطلاقًا من تعليمات مكتوبة بلغة طبيعية.',
      },
      browserIde: {
        title: 'بيئة تطوير في المتصفح',
        description: 'طوّر المشاريع وشغّلها وراجعها مع فريقك مباشرة من المتصفح.',
      },
      multiplayer: {
        title: 'تعاون متعدد المستخدمين',
        description: 'حرّر مع فريقك بحضور مباشر وبرمجة ثنائية وسياق مشروع مشترك.',
      },
      mobileApp: {
        title: 'تطبيق الهاتف',
        description: 'راجع المشاريع وواصل العمل من هاتفك أو جهازك اللوحي.',
      },
      desktopApp: {
        title: 'تطبيق سطح المكتب',
        description: 'اعمل محليًا في تجربة مركزة مع مزامنة آمنة بين الأجهزة.',
      },
      aiPlatform: {
        title: 'منصة الذكاء الاصطناعي',
        description: 'أدر أحمال الذكاء الاصطناعي وراقبها ونسّقها من مركز تحكم واحد.',
      },
      collaboration: {
        title: 'التعاون',
        description: 'شارك مساحات العمل والتعليقات والحضور والتغييرات في الوقت الفعلي.',
      },
      mcpIntegrations: {
        title: 'تكاملات MCP',
        description: 'اربط الوكلاء بالأدوات ومصادر السياق المعتمدة عبر MCP.',
      },
      polyglotBackends: {
        title: 'خدمات خلفية متعددة اللغات',
        description: 'أنشئ خدمات خلفية وشغّلها بلغات شائعة مع سجلات مباشرة.',
      },
      deployments: {
        title: 'عمليات النشر',
        description: 'انشر مع إدارة النطاقات والسجلات وفحوصات سلامة الخدمة وإمكانية التراجع.',
      },
      bounties: {
        title: 'المهام المدفوعة',
        description: 'استعن بشبكة مطورين عند الطلب عندما يحتاج المشروع إلى دعم إضافي.',
      },
      teams: {
        title: 'الفرق',
        description: 'أدر الوصول والحوكمة ومسارات التسليم المشتركة على مستوى المؤسسة.',
      },
      appBuilder: {
        title: 'منشئ التطبيقات',
        description: 'حوّل سير عمل تجاري إلى تطبيق متكامل يعمل فعليًا.',
      },
      websiteBuilder: {
        title: 'منشئ المواقع',
        description: 'أنشئ موقعًا متقنًا بصفحاته ومحتواه ونماذجه ومسار نشره.',
      },
      gameBuilder: {
        title: 'منشئ الألعاب',
        description: 'ابنِ ألعابًا تفاعلية بقواعد ونقاط وشاشات ومنطق متعدد اللاعبين.',
      },
      dashboardBuilder: {
        title: 'منشئ لوحات المعلومات',
        description: 'اربط البيانات بلوحات واضحة تضم رسومًا ومرشحات وتحديثات مباشرة.',
      },
      chatbotBuilder: {
        title: 'منشئ روبوتات المحادثة ووكلاء الذكاء الاصطناعي',
        description: 'أطلق مساعدين يجيبون وينفذون المهام ويستخدمون المعرفة التي تعتمدها.',
      },
      internalAiBuilder: {
        title: 'منشئ الذكاء الاصطناعي الداخلي',
        description: 'امنح الموظفين أدوات ذكاء اصطناعي خاصة تستند إلى معرفة الشركة وصلاحياتها.',
      },
      enterprise: {
        title: 'المؤسسات',
        description: 'سلّم البرمجيات مع SSO وأدوار وسجلات تدقيق ومسارات إصدار محكومة.',
      },
      startups: {
        title: 'الشركات الناشئة',
        description: 'انتقل من فكرة منتج إلى تطبيق يعمل داخل مساحة واحدة.',
      },
      freelancers: {
        title: 'المستقلون',
        description: 'سلّم مشاريع العملاء بكود ظاهر ومعاينات مباشرة وتسليم منظم.',
      },
      documentation: {
        title: 'التوثيق',
        description: 'اتبع أدلة عملية للبناء والمراجعة والنشر باستخدام E-Code.',
      },
      aiDocumentation: {
        title: 'توثيق الذكاء الاصطناعي',
        description: 'تعرّف إلى قدرات الوكلاء وضوابطهم وسياقهم وأنماط تشغيلهم.',
      },
      tutorials: {
        title: 'الدروس التعليمية',
        description: 'تعلّم مسارات عمل كاملة من خلال مشاريع إرشادية خطوة بخطوة.',
      },
      blog: {
        title: 'المدونة',
        description: 'اقرأ موضوعات E-Code حول المنتج والهندسة وتسليم البرمجيات.',
      },
      changelog: {
        title: 'سجل التغييرات',
        description: 'تابع الميزات والتحسينات والإصلاحات الجديدة عند إصدارها.',
      },
      community: {
        title: 'المجتمع',
        description: 'تواصل مع منشئين آخرين وتبادل الأساليب وشارك المشاريع العملية.',
      },
      templates: {
        title: 'القوالب',
        description: 'ابدأ من أسس منتقاة لمنتجات وقطاعات شائعة.',
      },
      marketplace: {
        title: 'السوق',
        description: 'اعثر على بدايات وأنماط تنفيذ وأسس مشاريع قابلة لإعادة الاستخدام.',
      },
      caseStudies: {
        title: 'دراسات الحالة',
        description: 'استكشف أمثلة عملية للمنتجات ومسارات العمل التي تقف خلفها.',
      },
      helpCenter: {
        title: 'مركز المساعدة',
        description: 'اعثر على الإجابات وخطوات استكشاف الأخطاء وقنوات الدعم.',
      },
      status: {
        title: 'حالة الخدمة',
        description: 'تحقق من توفر المنصة حاليًا ومن أحداث الخدمة الأخيرة.',
      },
      about: {
        title: 'من نحن',
        description: 'تعرّف إلى الرسالة والمبادئ والفريق الذي يقف خلف E-Code.',
      },
      careers: {
        title: 'الوظائف',
        description: 'انضم إلى فريق موزع يبني أدوات عملية لإنشاء البرمجيات.',
      },
      press: {
        title: 'الصحافة',
        description: 'اطّلع على معلومات الشركة ومواد الإعلام والتغطيات الأخيرة.',
      },
      partners: {
        title: 'الشركاء',
        description: 'تعاون مع E-Code عبر شراكات تقنية وشراكات حلول.',
      },
      contact: {
        title: 'اتصل بنا',
        description: 'أرسل سؤالك إلى الفريق المناسب في E-Code.',
      },
      accessibility: {
        title: 'إمكانية الوصول',
        description: 'اطّلع على نهج E-Code في تقديم تجارب منتجات شاملة للجميع.',
      },
    },
    pricing: 'الأسعار',
    teams: 'الفرق',
    logIn: 'تسجيل الدخول',
    getStarted: 'ابدأ الآن',
    signIn: 'تسجيل الدخول',
  },
  theme: {
    light: 'فاتح',
    dark: 'داكن',
    switchToLight: 'التبديل إلى المظهر الفاتح',
    switchToDark: 'التبديل إلى المظهر الداكن',
  },
  footer: {
    eyebrow: 'تعليمات، كود، معاينة، نشر',
    title: 'أنشئ برمجيات قابلة للفحص مع فريقك',
    description:
      'يجمع E-Code الملفات المُنشأة وملاحظات وقت التشغيل وحالة المعاينة وعناصر التحكم في الإصدار، من أول تعليمات إلى التطبيق المباشر.',
    contactSales: 'تحدث إلى المبيعات',
    startBuilding: 'ابدأ البناء',
    facts: {
      sourceCode: { label: 'الكود المصدري', value: 'ظاهر وقابل للتصدير' },
      projectWorkflow: { label: 'سير عمل المشروع', value: 'من المعاينة إلى النشر' },
    },
    columnLabels: {
      product: 'المنتج',
      resources: 'الموارد',
      company: 'الشركة',
      legal: 'الشؤون القانونية',
    },
    linkLabels: {
      aiAgent: 'وكيل الذكاء الاصطناعي',
      browserIde: 'بيئة التطوير',
      multiplayer: 'تعاون متعدد المستخدمين',
      mobileApp: 'تطبيق الهاتف',
      desktopApp: 'تطبيق سطح المكتب',
      collaboration: 'التعاون',
      mcpIntegrations: 'تكاملات MCP',
      polyglotBackends: 'خدمات خلفية متعددة اللغات',
      teams: 'الفرق',
      deployments: 'عمليات النشر',
      pricing: 'الأسعار',
      bounties: 'المهام المدفوعة',
      aiPlatform: 'منصة الذكاء الاصطناعي',
      documentation: 'التوثيق',
      blog: 'المدونة',
      community: 'المجتمع',
      templates: 'القوالب',
      marketplace: 'السوق',
      languages: 'اللغات',
      status: 'حالة الخدمة',
      forum: 'المنتدى',
      about: 'من نحن',
      careers: 'الوظائف',
      press: 'الصحافة',
      partners: 'الشركاء',
      contactSales: 'تواصل مع المبيعات',
      terms: 'الشروط',
      privacy: 'الخصوصية',
      subprocessors: 'المعالِجون الفرعيون',
      dpa: 'اتفاقية معالجة البيانات',
      usStudentDpa: 'اتفاقية معالجة بيانات الطلاب في الولايات المتحدة',
      security: 'الأمان',
      trustSafety: 'الثقة والسلامة',
      acceptableUse: 'الاستخدام المقبول',
      reportAbuse: 'الإبلاغ عن إساءة',
      strikeSystem: 'نظام الإنذارات',
      usageLimits: 'الاستخدام والحدود',
      supportPolicy: 'سياسة الدعم',
      licensing: 'التراخيص',
      accountInactivity: 'عدم نشاط الحساب',
      deletingYourData: 'حذف بياناتك',
      compareGithubCodespaces: 'مقارنة E-Code مع GitHub Codespaces',
      compareGlitch: 'مقارنة E-Code مع Glitch',
      compareHeroku: 'مقارنة E-Code مع Heroku',
      compareCodeSandbox: 'مقارنة E-Code مع CodeSandbox',
      compareAwsCloud9: 'مقارنة E-Code مع AWS Cloud9',
    },
    compareTitle: 'قارن بين المنصات',
    compareDescription: 'تعرّف إلى الفروق بين E-Code وسُحب التطوير الأخرى.',
    assurances: [
      'تبقى ملفات المصدر ظاهرة للمراجعة والتصدير.',
      'تجتمع روابط المعاينة وعناصر التحكم في النشر داخل مساحة عمل واحدة.',
      'تبقى تغييرات الوكيل مرتبطة بالملفات وملاحظات وقت التشغيل.',
    ],
    copyrightTemplate: '© {year} E-Code.AI (Snatch Group Limited). جميع الحقوق محفوظة.',
    emailPreferences: 'تفضيلات البريد الإلكتروني',
    newsletter: 'النشرة البريدية',
  },
  newsletter: {
    title: 'النشرة البريدية',
    success: 'تم تأكيد اشتراكك. راقب بريدك الوارد.',
    emailPlaceholder: 'name@company.com',
    subscribing: 'جارٍ الاشتراك…',
    subscribe: 'اشترك',
    errorFallback: 'تعذر إكمال الاشتراك. حاول مرة أخرى.',
  },
} as const satisfies MarketingShellCopy;

export const MARKETING_SHELL_COPY = {
  en,
  fr,
  es,
  ar,
} as const satisfies Record<SupportedLanguage, MarketingShellCopy>;
