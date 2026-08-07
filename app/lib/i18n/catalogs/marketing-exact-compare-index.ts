import { resolveMarketingLanguage } from './marketing';

export type CompareIndexCompetitorId = 'github-codespaces' | 'glitch' | 'heroku' | 'codesandbox' | 'aws-cloud9';

export type CompareIndexReasonId = 'production' | 'ai' | 'collaboration' | 'enterprise';

interface MarketingExactCompareIndexCopy {
  exactCompareIndex: {
    seo: {
      title: string;
      description: string;
      imageAlt: string;
    };
    hero: {
      badge: string;
      title: string;
      description: string;
    };
    comparisons: {
      title: string;
      action: string;
      actionAria: string;
      items: readonly {
        id: CompareIndexCompetitorId;
        title: string;
        description: string;
      }[];
    };
    reasons: {
      title: string;
      items: readonly {
        id: CompareIndexReasonId;
        title: string;
        description: string;
      }[];
    };
    cta: {
      label: string;
    };
  };
}

export const marketingExactCompareIndexEn = {
  exactCompareIndex: {
    seo: {
      title: 'Compare AI Development Platforms — E-Code',
      description:
        'Compare E-Code with GitHub Codespaces, Glitch, Heroku, CodeSandbox and AWS Cloud9 for AI development, collaboration and deployment.',
      imageAlt: 'Comparison of E-Code with leading AI development platforms',
    },
    hero: {
      badge: 'Comparisons',
      title: 'How E-Code compares',
      description: 'See how E-Code stacks up against other AI development platforms — from prompt to production.',
    },
    comparisons: {
      title: 'Platform comparisons',
      action: 'See comparison',
      actionAria: 'See the {comparison} comparison',
      items: [
        {
          id: 'github-codespaces',
          title: 'E-Code vs GitHub Codespaces',
          description:
            "Repository-native cloud workspaces compared with E-Code's AI-powered IDE, governed runtimes, previews and enterprise delivery workflow.",
        },
        {
          id: 'glitch',
          title: 'E-Code vs Glitch',
          description:
            "Creative app prototyping compared with E-Code's AI-powered IDE, governed runtimes, previews and enterprise delivery workflow.",
        },
        {
          id: 'heroku',
          title: 'E-Code vs Heroku',
          description:
            "Application hosting compared with E-Code's AI-powered IDE, governed runtimes, previews and enterprise delivery workflow.",
        },
        {
          id: 'codesandbox',
          title: 'E-Code vs CodeSandbox',
          description:
            "Browser sandboxes compared with E-Code's AI-powered IDE, governed runtimes, previews and enterprise delivery workflow.",
        },
        {
          id: 'aws-cloud9',
          title: 'E-Code vs AWS Cloud9',
          description:
            "Cloud IDE infrastructure compared with E-Code's AI-powered IDE, governed runtimes, previews and enterprise delivery workflow.",
        },
      ],
    },
    reasons: {
      title: 'Why teams choose E-Code',
      items: [
        {
          id: 'production',
          title: 'Prompt to production',
          description: 'Generate, preview and deploy a full-stack app in minutes — no setup.',
        },
        {
          id: 'ai',
          title: 'Managed AI',
          description: 'Admin-provided models and effort-based credits — users just build.',
        },
        {
          id: 'collaboration',
          title: 'Real-time collaboration',
          description: 'Multiplayer editing, comments, presence and shared workspaces.',
        },
        {
          id: 'enterprise',
          title: 'Enterprise ready',
          description: 'SSO/SAML, single-tenant, VPC peering, audit logs and static egress IPs.',
        },
      ],
    },
    cta: {
      label: 'Start building free',
    },
  },
} as const satisfies MarketingExactCompareIndexCopy;

export const marketingExactCompareIndexFr = {
  exactCompareIndex: {
    seo: {
      title: 'Comparer les plateformes de développement assisté par IA — E-Code',
      description:
        'Comparez E-Code à GitHub Codespaces, Glitch, Heroku, CodeSandbox et AWS Cloud9 pour le développement assisté par IA, la collaboration et le déploiement.',
      imageAlt: 'Comparaison d’E-Code avec les principales plateformes de développement assisté par IA',
    },
    hero: {
      badge: 'Comparatifs',
      title: 'Comparez E-Code aux autres plateformes',
      description:
        'Découvrez comment E-Code se distingue des autres plateformes de développement assisté par IA, du prompt à la production.',
    },
    comparisons: {
      title: 'Comparatifs par plateforme',
      action: 'Voir le comparatif',
      actionAria: 'Consulter le comparatif {comparison}',
      items: [
        {
          id: 'github-codespaces',
          title: 'E-Code face à GitHub Codespaces',
          description:
            'Comparez les espaces de travail cloud centrés sur les dépôts à l’IDE propulsé par l’IA d’E-Code, avec environnements d’exécution gouvernés, aperçus et processus de livraison d’entreprise.',
        },
        {
          id: 'glitch',
          title: 'E-Code face à Glitch',
          description:
            'Comparez le prototypage créatif d’applications à l’IDE propulsé par l’IA d’E-Code, avec environnements d’exécution gouvernés, aperçus et processus de livraison d’entreprise.',
        },
        {
          id: 'heroku',
          title: 'E-Code face à Heroku',
          description:
            'Comparez l’hébergement d’applications à l’IDE propulsé par l’IA d’E-Code, avec environnements d’exécution gouvernés, aperçus et processus de livraison d’entreprise.',
        },
        {
          id: 'codesandbox',
          title: 'E-Code face à CodeSandbox',
          description:
            'Comparez les environnements isolés dans le navigateur à l’IDE propulsé par l’IA d’E-Code, avec environnements d’exécution gouvernés, aperçus et processus de livraison d’entreprise.',
        },
        {
          id: 'aws-cloud9',
          title: 'E-Code face à AWS Cloud9',
          description:
            'Comparez l’infrastructure d’IDE cloud à l’IDE propulsé par l’IA d’E-Code, avec environnements d’exécution gouvernés, aperçus et processus de livraison d’entreprise.',
        },
      ],
    },
    reasons: {
      title: 'Pourquoi les équipes choisissent E-Code',
      items: [
        {
          id: 'production',
          title: 'Du prompt à la production',
          description:
            'Générez, prévisualisez et déployez une application complète en quelques minutes, sans configuration.',
        },
        {
          id: 'ai',
          title: 'IA administrée',
          description:
            'Modèles fournis par l’administrateur et crédits calculés selon l’effort : vos équipes se concentrent sur la création.',
        },
        {
          id: 'collaboration',
          title: 'Collaboration en temps réel',
          description: 'Édition collaborative, commentaires, présence et espaces de travail partagés.',
        },
        {
          id: 'enterprise',
          title: 'Prêt pour l’entreprise',
          description:
            'SSO/SAML, environnement à locataire unique, peering VPC, journaux d’audit et adresses IP sortantes statiques.',
        },
      ],
    },
    cta: {
      label: 'Commencer gratuitement',
    },
  },
} as const satisfies MarketingExactCompareIndexCopy;

export function getMarketingExactCompareIndexCopy(language?: string | null): MarketingExactCompareIndexCopy {
  return resolveMarketingLanguage(language) === 'fr' ? marketingExactCompareIndexFr : marketingExactCompareIndexEn;
}

export function interpolateMarketingExactCompareIndexCopy(
  template: string,
  values: Readonly<Record<string, string | number | bigint>>,
): string {
  return template.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/gu, (token, key: string) => {
    const value = values[key];

    return value === undefined ? token : String(value);
  });
}
