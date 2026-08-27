import { resolveMarketingLanguage } from './marketing';

export type ExactProductPageKey =
  | 'ai-agent'
  | 'ide'
  | 'multiplayer'
  | 'mobile-app'
  | 'teams'
  | 'deployments'
  | 'pricing'
  | 'bounties'
  | 'ai-platform';

export type ExactCampaignPageKey = 'bounties' | 'deployments' | 'teams';
export type ExactBuildOptionId = 'design-first' | 'full-app';
export type ExactStaticModelId = 'gpt-5' | 'gemini-2.5-pro' | 'claude-sonnet-4';

type CountCopy = Readonly<{ one: string; other: string }>;

export interface ExactProductPageCopy {
  label: string;
  title: string;
  description: string;
  imageAlt: string;
}

interface MarketingExactProductControlsCopy {
  exactProductRegistry: {
    pages: Readonly<Record<ExactProductPageKey, ExactProductPageCopy>>;
  };
  exactLandingControls: {
    errors: {
      requestFailed: string;
      templateCatalogRequestFailed: string;
      modelCatalogRequestFailed: string;
      modelCatalogUnavailable: string;
    };
    models: {
      descriptions: Readonly<Record<ExactStaticModelId, string>>;
      genericDescription: string;
    };
    modelSelector: {
      compactLabel: string;
      ariaLabel: string;
      automatic: string;
      cardTitle: string;
      loadingDescription: string;
      availableDescription: CountCopy;
      loadingOption: string;
      selectOption: string;
      streaming: string;
      fallbackWarning: string;
      preferenceSaved: string;
    };
    buildMode: {
      title: string;
      approach: string;
      close: string;
      featureListCreated: string;
      featureCount: CountCopy;
      duration: string;
      continuePlanning: string;
      options: readonly {
        id: ExactBuildOptionId;
        title: string;
        description: string;
        badge: string;
        features: readonly string[];
      }[];
    };
  };
}

export type ExactCountCopy = CountCopy;

export const marketingExactProductControlsEn = {
  exactProductRegistry: {
    pages: {
      'ai-agent': {
        label: 'AI Agent',
        title: 'AI Agent v2',
        description: 'Describe your idea, watch E-Code build it and deploy instantly from the public AI Agent page.',
        imageAlt: 'E-Code AI Agent building a production application',
      },
      ide: {
        label: 'IDE',
        title: 'Browser IDE',
        description: 'Explore the E-Code browser IDE with its editor, terminal, files, previews and project workflows.',
        imageAlt: 'E-Code browser IDE with editor, terminal and live preview',
      },
      multiplayer: {
        label: 'Multiplayer',
        title: 'Multiplayer',
        description: 'Collaborate live with pair programming, shared presence and review workflows inside the IDE.',
        imageAlt: 'Developers collaborating in real time inside the E-Code IDE',
      },
      'mobile-app': {
        label: 'Mobile app',
        title: 'Mobile IDE',
        description:
          'Discover the E-Code mobile experience for the editor, terminal, AI, preview, collaboration and Git.',
        imageAlt: 'E-Code mobile IDE running on a phone',
      },
      teams: {
        label: 'Teams',
        title: 'Teams',
        description: 'Bring modern teams real-time collaboration, enterprise controls and governed project access.',
        imageAlt: 'An E-Code team collaborating in a governed workspace',
      },
      deployments: {
        label: 'Deployments',
        title: 'Deployments',
        description: 'Ship to production with global routing, observability, rollbacks and enterprise controls.',
        imageAlt: 'E-Code production deployment controls and observability',
      },
      pricing: {
        label: 'Pricing',
        title: 'Pricing',
        description: 'Compare E-Code plans, included capabilities, enterprise options and frequently asked questions.',
        imageAlt: 'E-Code plan and pricing comparison',
      },
      bounties: {
        label: 'Bounties',
        title: 'Bounties',
        description: 'Run outcome-based developer bounties with secure review sandboxes and managed payouts.',
        imageAlt: 'Developer bounties managed securely with E-Code',
      },
      'ai-platform': {
        label: 'AI platform',
        title: 'AI platform',
        description:
          'Build applications with enterprise AI, natural-language prompts, integrated tools and governance.',
        imageAlt: 'E-Code enterprise AI platform building an application',
      },
    },
  },
  exactLandingControls: {
    errors: {
      requestFailed: 'Request failed (HTTP {status}).',
      templateCatalogRequestFailed: 'The template catalog request failed (HTTP {status}).',
      modelCatalogRequestFailed: 'The model catalog request failed (HTTP {status}).',
      modelCatalogUnavailable: 'The model catalog is temporarily unavailable.',
    },
    models: {
      descriptions: {
        'gpt-5': 'Advanced reasoning model for full-stack application generation.',
        'gemini-2.5-pro': 'Large-context model for planning, code and multimodal application work.',
        'claude-sonnet-4': 'Balanced coding model for long-running implementation tasks.',
      },
      genericDescription: '{name} is available for application generation.',
    },
    modelSelector: {
      compactLabel: 'Model:',
      ariaLabel: 'AI model',
      automatic: 'Auto',
      cardTitle: 'AI model selection',
      loadingDescription: 'Loading available AI models for code generation…',
      availableDescription: {
        one: 'Choose your preferred AI model for code generation ({count} available).',
        other: 'Choose your preferred AI model for code generation ({count} available).',
      },
      loadingOption: 'Loading AI models…',
      selectOption: 'Select an AI model…',
      streaming: 'Streaming',
      fallbackWarning: 'Using the built-in model list while the catalog reconnects.',
      preferenceSaved: 'Model preference saved',
    },
    buildMode: {
      title: 'How would you like to continue?',
      approach: 'Choose your preferred build approach.',
      close: 'Close',
      featureListCreated: 'Feature list created',
      featureCount: { one: '{count} feature', other: '{count} features' },
      duration: 'About {duration}',
      continuePlanning: 'Continue refining the prompt',
      options: [
        {
          id: 'design-first',
          title: 'Start with a design',
          description: 'Review your application design first, then add functionality.',
          badge: 'Visual first',
          features: [
            'Quick clickable prototype',
            'Review the UI before building',
            'Iterate on the design',
            'Add functionality later',
          ],
        },
        {
          id: 'full-app',
          title: 'Build the full app',
          description: 'Generate a complete working application from the start.',
          badge: 'Recommended',
          features: [
            'Full-stack development',
            'Working MVP immediately',
            'Backend and frontend',
            'Database integration',
          ],
        },
      ],
    },
  },
} as const satisfies MarketingExactProductControlsCopy;

export const marketingExactProductControlsFr = {
  exactProductRegistry: {
    pages: {
      'ai-agent': {
        label: 'Agent IA',
        title: 'Agent IA v2',
        description:
          'Décrivez votre idée, regardez E-Code la construire, puis déployez-la instantanément depuis la page publique de l’Agent IA.',
        imageAlt: 'Agent IA E-Code créant une application de production',
      },
      ide: {
        label: 'IDE',
        title: 'IDE dans le navigateur',
        description:
          'Découvrez l’IDE E-Code dans le navigateur avec son éditeur, son terminal, ses fichiers, ses aperçus et ses processus de projet.',
        imageAlt: 'IDE E-Code dans le navigateur avec éditeur, terminal et aperçu en direct',
      },
      multiplayer: {
        label: 'Collaboration en temps réel',
        title: 'Collaboration en temps réel',
        description:
          'Collaborez en direct grâce à la programmation en binôme, à la présence partagée et aux processus de revue dans l’IDE.',
        imageAlt: 'Développeurs collaborant en temps réel dans l’IDE E-Code',
      },
      'mobile-app': {
        label: 'Application mobile',
        title: 'IDE mobile',
        description:
          'Découvrez l’expérience mobile E-Code pour l’éditeur, le terminal, l’IA, l’aperçu, la collaboration et Git.',
        imageAlt: 'IDE mobile E-Code ouvert sur un téléphone',
      },
      teams: {
        label: 'Équipes',
        title: 'Équipes',
        description:
          'Offrez aux équipes modernes une collaboration en temps réel, des contrôles d’entreprise et un accès gouverné aux projets.',
        imageAlt: 'Équipe E-Code collaborant dans un espace de travail gouverné',
      },
      deployments: {
        label: 'Déploiements',
        title: 'Déploiements',
        description:
          'Publiez en production avec routage mondial, observabilité, restaurations de version et contrôles d’entreprise.',
        imageAlt: 'Contrôles et observabilité des déploiements de production E-Code',
      },
      pricing: {
        label: 'Tarifs',
        title: 'Tarifs',
        description:
          'Comparez les offres E-Code, les fonctionnalités incluses, les options d’entreprise et les questions fréquentes.',
        imageAlt: 'Comparaison des offres et tarifs E-Code',
      },
      bounties: {
        label: 'Primes',
        title: 'Primes',
        description:
          'Gérez des primes développeurs basées sur les résultats, avec environnements de revue sécurisés et paiements administrés.',
        imageAlt: 'Primes développeurs gérées de façon sécurisée avec E-Code',
      },
      'ai-platform': {
        label: 'Plateforme IA',
        title: 'Plateforme IA',
        description:
          'Créez des applications avec une IA d’entreprise, des prompts en langage naturel, des outils intégrés et une gouvernance complète.',
        imageAlt: 'Plateforme IA d’entreprise E-Code créant une application',
      },
    },
  },
  exactLandingControls: {
    errors: {
      requestFailed: 'La requête a échoué (HTTP {status}).',
      templateCatalogRequestFailed: 'La requête du catalogue de modèles a échoué (HTTP {status}).',
      modelCatalogRequestFailed: 'La requête du catalogue de modèles d’IA a échoué (HTTP {status}).',
      modelCatalogUnavailable: 'Le catalogue de modèles d’IA est temporairement indisponible.',
    },
    models: {
      descriptions: {
        'gpt-5': 'Modèle de raisonnement avancé pour générer des applications complètes.',
        'gemini-2.5-pro': 'Modèle à large contexte pour la planification, le code et les applications multimodales.',
        'claude-sonnet-4': 'Modèle de code équilibré pour les tâches d’implémentation de longue durée.',
      },
      genericDescription: '{name} est disponible pour générer des applications.',
    },
    modelSelector: {
      compactLabel: 'Modèle :',
      ariaLabel: 'Modèle d’IA',
      automatic: 'Auto',
      cardTitle: 'Choix du modèle d’IA',
      loadingDescription: 'Chargement des modèles d’IA disponibles pour générer le code…',
      availableDescription: {
        one: 'Choisissez votre modèle d’IA pour générer le code ({count} disponible).',
        other: 'Choisissez votre modèle d’IA pour générer le code ({count} disponibles).',
      },
      loadingOption: 'Chargement des modèles d’IA…',
      selectOption: 'Sélectionnez un modèle d’IA…',
      streaming: 'Diffusion en continu',
      fallbackWarning: 'La liste intégrée des modèles est utilisée pendant la reconnexion du catalogue.',
      preferenceSaved: 'Préférence de modèle enregistrée',
    },
    buildMode: {
      title: 'Comment souhaitez-vous continuer ?',
      approach: 'Choisissez votre méthode de création préférée.',
      close: 'Fermer',
      featureListCreated: 'Liste de fonctionnalités créée',
      featureCount: { one: '{count} fonctionnalité', other: '{count} fonctionnalités' },
      duration: 'Environ {duration}',
      continuePlanning: 'Continuer à préciser le prompt',
      options: [
        {
          id: 'design-first',
          title: 'Commencer par le design',
          description: 'Examinez d’abord le design de votre application, puis ajoutez les fonctionnalités.',
          badge: 'Visuel en premier',
          features: [
            'Prototype cliquable rapide',
            'Examen de l’interface avant la création',
            'Itérations sur le design',
            'Ajout des fonctionnalités ensuite',
          ],
        },
        {
          id: 'full-app',
          title: 'Créer l’application complète',
          description: 'Générez dès le départ une application complète et fonctionnelle.',
          badge: 'Recommandé',
          features: [
            'Développement d’applications complètes',
            'MVP fonctionnel immédiatement',
            'Service applicatif et interface utilisateur',
            'Intégration de la base de données',
          ],
        },
      ],
    },
  },
} as const satisfies MarketingExactProductControlsCopy;

export function getMarketingExactProductControlsCopy(language?: string | null): MarketingExactProductControlsCopy {
  return resolveMarketingLanguage(language) === 'fr'
    ? marketingExactProductControlsFr
    : marketingExactProductControlsEn;
}

function localeFor(language?: string | null): string {
  return resolveMarketingLanguage(language) === 'fr' ? 'fr-FR' : 'en-US';
}

function interpolate(template: string, values: Readonly<Record<string, string>>): string {
  return template.replace(/\{(\w+)\}/g, (_match, key: string) => values[key] ?? '');
}

export function interpolateExactProductControlCopy(
  template: string,
  values: Readonly<Record<string, string | number>>,
): string {
  return interpolate(template, Object.fromEntries(Object.entries(values).map(([key, value]) => [key, String(value)])));
}

export function formatExactControlCount(count: number, forms: ExactCountCopy, language?: string | null): string {
  const locale = localeFor(language);
  const template = new Intl.PluralRules(locale).select(count) === 'one' ? forms.one : forms.other;
  const formattedCount = new Intl.NumberFormat(locale).format(count);

  return interpolate(template, { count: formattedCount });
}

export function formatExactBuildDuration(minutes: number, template: string, language?: string | null): string {
  const duration = new Intl.NumberFormat(localeFor(language), {
    style: 'unit',
    unit: 'minute',
    unitDisplay: 'long',
  }).format(minutes);

  return interpolate(template, { duration });
}

export function formatExactRequestFailure(template: string, status: number, language?: string | null): string {
  return interpolate(template, {
    status: new Intl.NumberFormat(localeFor(language), { useGrouping: false }).format(status),
  });
}
