import { resolveMarketingLanguage } from './marketing';

export type HelpCenterTopicId = 'gettingStarted' | 'workspaces' | 'deployments' | 'billing' | 'agent' | 'integrations';

interface MarketingExactHelpCenterCopy {
  exactHelpCenter: {
    seo: { title: string; description: string; imageAlt: string };
    hero: { title: string; description: string };
    search: {
      label: string;
      placeholder: string;
      noResults: string;
      topicsDefault: string;
      topicsMatching: string;
      articlesDefault: string;
      articlesMatching: string;
    };
    topics: readonly { id: HelpCenterTopicId; title: string; description: string }[];
    popularArticles: readonly string[];
    workspace: {
      title: string;
      description: string;
      action: string;
      windowLabel: string;
      imageAlt: string;
      caption: string;
    };
    support: { title: string; description: string; contact: string; documentation: string };
  };
}

export const marketingExactHelpCenterEn = {
  exactHelpCenter: {
    seo: {
      title: 'Help Center — E-Code',
      description: 'Find E-Code guides for workspaces, deployments, billing, integrations and the AI agent.',
      imageAlt: 'E-Code Help Center guides and workspace documentation',
    },
    hero: {
      title: 'How can we help?',
      description: 'Search our guides or browse by topic to get the most out of E-Code.',
    },
    search: {
      label: 'Search the Help Center',
      placeholder: 'Search the Help Center…',
      noResults: 'No results found for “{query}”. Try a different search or browse the topics below.',
      topicsDefault: 'Browse by topic',
      topicsMatching: 'Matching topics',
      articlesDefault: 'Popular articles',
      articlesMatching: 'Matching articles',
    },
    topics: [
      {
        id: 'gettingStarted',
        title: 'Getting started',
        description: 'Set up your account, create your first project, and ship in minutes.',
      },
      {
        id: 'workspaces',
        title: 'Workspaces',
        description: 'Manage files, terminals, ports, and live previews in the E-Code IDE.',
      },
      {
        id: 'deployments',
        title: 'Deployments',
        description: 'Publish static sites and full-stack apps with custom domains.',
      },
      {
        id: 'billing',
        title: 'Billing',
        description: 'Plans, invoices, usage limits, and how to upgrade or cancel.',
      },
      {
        id: 'agent',
        title: 'AI agent',
        description: 'Prompt the agent, review proposed edits, and iterate on your code.',
      },
      {
        id: 'integrations',
        title: 'Integrations',
        description: 'Connect GitHub, MCP servers, and third-party services to your projects.',
      },
    ],
    popularArticles: [
      'How do I create a new project from a prompt?',
      'Connecting a GitHub repository to your workspace',
      'Adding a custom domain to a deployment',
      'Understanding usage limits on the Free plan',
      'Why is my preview stuck on “Starting”?',
      'Accepting and reverting AI agent edits',
      'Inviting teammates to an organization',
      'Configuring an MCP integration',
    ],
    workspace: {
      title: 'Get oriented in the workspace',
      description:
        'Most questions answer themselves once you know where things live. The E-Code IDE puts the AI agent, code editor, file tree and live preview together in a single workspace — exactly what you see below.',
      action: 'Explore the AI agent',
      windowLabel: 'E-Code Workspace',
      imageAlt:
        'The E-Code IDE showing the AI agent panel, code editor, file tree and live preview together in one workspace',
      caption: 'The E-Code IDE: agent, editor, files and live preview in one workspace.',
    },
    support: {
      title: 'Still need help?',
      description: "Can't find what you're looking for? Our support team is here to help you get unblocked.",
      contact: 'Contact Support',
      documentation: 'Read the docs',
    },
  },
} as const satisfies MarketingExactHelpCenterCopy;

export const marketingExactHelpCenterFr = {
  exactHelpCenter: {
    seo: {
      title: 'Centre d’aide — E-Code',
      description:
        'Consultez les guides E-Code sur les espaces de travail, les déploiements, la facturation, les intégrations et l’agent IA.',
      imageAlt: 'Guides et documentation de l’espace de travail dans le Centre d’aide E-Code',
    },
    hero: {
      title: 'Comment pouvons-nous vous aider ?',
      description: 'Recherchez un guide ou parcourez les rubriques pour tirer le meilleur parti d’E-Code.',
    },
    search: {
      label: 'Rechercher dans le Centre d’aide',
      placeholder: 'Rechercher dans le Centre d’aide…',
      noResults: 'Aucun résultat pour « {query} ». Essayez une autre recherche ou parcourez les rubriques ci-dessous.',
      topicsDefault: 'Parcourir les rubriques',
      topicsMatching: 'Rubriques correspondantes',
      articlesDefault: 'Articles populaires',
      articlesMatching: 'Articles correspondants',
    },
    topics: [
      {
        id: 'gettingStarted',
        title: 'Premiers pas',
        description: 'Configurez votre compte, créez votre premier projet et publiez-le en quelques minutes.',
      },
      {
        id: 'workspaces',
        title: 'Espaces de travail',
        description: 'Gérez les fichiers, les terminaux, les ports et les aperçus en direct dans l’IDE E-Code.',
      },
      {
        id: 'deployments',
        title: 'Déploiements',
        description: 'Publiez des sites statiques et des applications complètes avec des domaines personnalisés.',
      },
      {
        id: 'billing',
        title: 'Facturation',
        description: 'Forfaits, factures, limites d’utilisation, changement d’offre et résiliation.',
      },
      {
        id: 'agent',
        title: 'Agent IA',
        description: 'Donnez vos instructions à l’agent, révisez ses modifications et faites évoluer votre code.',
      },
      {
        id: 'integrations',
        title: 'Intégrations',
        description: 'Connectez GitHub, des serveurs MCP et des services tiers à vos projets.',
      },
    ],
    popularArticles: [
      'Comment créer un projet à partir d’un prompt ?',
      'Connecter un dépôt GitHub à votre espace de travail',
      'Ajouter un domaine personnalisé à un déploiement',
      'Comprendre les limites d’utilisation du forfait Free',
      'Pourquoi mon aperçu reste-t-il bloqué sur « Démarrage » ?',
      'Accepter et annuler les modifications de l’agent IA',
      'Inviter des coéquipiers dans une organisation',
      'Configurer une intégration MCP',
    ],
    workspace: {
      title: 'Repérez-vous dans l’espace de travail',
      description:
        'De nombreuses questions trouvent leur réponse dès que vous savez où se trouvent les outils. L’IDE E-Code réunit l’agent IA, l’éditeur de code, l’arborescence des fichiers et l’aperçu en direct dans un même espace de travail, exactement comme ci-dessous.',
      action: 'Découvrir l’agent IA',
      windowLabel: 'Espace de travail E-Code',
      imageAlt:
        'IDE E-Code réunissant l’agent IA, l’éditeur de code, l’arborescence des fichiers et l’aperçu en direct dans un même espace de travail',
      caption: 'IDE E-Code : agent, éditeur, fichiers et aperçu en direct dans un même espace de travail.',
    },
    support: {
      title: 'Besoin d’aide supplémentaire ?',
      description:
        'Vous ne trouvez pas ce que vous cherchez ? Notre équipe d’assistance est là pour vous aider à avancer.',
      contact: 'Contacter l’assistance',
      documentation: 'Lire la documentation',
    },
  },
} as const satisfies MarketingExactHelpCenterCopy;

export function getMarketingExactHelpCenterCopy(language?: string | null): MarketingExactHelpCenterCopy {
  return resolveMarketingLanguage(language) === 'fr' ? marketingExactHelpCenterFr : marketingExactHelpCenterEn;
}

export function interpolateMarketingExactHelpCenterCopy(
  template: string,
  values: Readonly<Record<string, string | number | bigint>>,
): string {
  return template.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/gu, (token, key: string) => {
    const value = values[key];

    return value === undefined ? token : String(value);
  });
}
