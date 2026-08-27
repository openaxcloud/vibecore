import { resolveMarketingLanguage } from './marketing';

export type LandingFeatureId = 'infrastructure' | 'ai' | 'security' | 'collaboration' | 'speed' | 'edge';

interface MarketingExactLandingFeaturesCopy {
  exactLandingFeatures: {
    heading: string;
    description: string;
    features: readonly {
      id: LandingFeatureId;
      title: string;
      description: string;
    }[];
  };
}

export const marketingExactLandingFeaturesEn = {
  exactLandingFeatures: {
    heading: 'Enterprise Features, Startup Speed',
    description: 'Everything you need to build, deploy, and scale production applications.',
    features: [
      {
        id: 'infrastructure',
        title: 'Enterprise-Grade Infrastructure',
        description:
          'Built on Fortune 500 standards with a {uptime} uptime SLA, auto-scaling, and global CDN distribution.',
      },
      {
        id: 'ai',
        title: 'AI-Powered Development',
        description: 'Advanced AI agents that understand context, write production code, and deploy automatically.',
      },
      {
        id: 'security',
        title: 'Bank-Level Security',
        description: 'SOC 2 Type II certified with end-to-end encryption, RBAC, and continuous security monitoring.',
      },
      {
        id: 'collaboration',
        title: 'Real-Time Collaboration',
        description: 'Multiple developers can code simultaneously with instant sync and conflict resolution.',
      },
      {
        id: 'speed',
        title: '10x Faster Development',
        description: 'Ship features in minutes instead of months with our optimized development pipeline.',
      },
      {
        id: 'edge',
        title: 'Global Edge Deployment',
        description: 'Deploy to {locations}+ edge locations worldwide with automatic SSL and DDoS protection.',
      },
    ],
  },
} as const satisfies MarketingExactLandingFeaturesCopy;

export const marketingExactLandingFeaturesFr = {
  exactLandingFeatures: {
    heading: 'Des fonctionnalités de niveau entreprise, avec l’agilité d’une start-up',
    description: 'Tout ce qu’il vous faut pour créer, déployer et faire évoluer des applications de production.',
    features: [
      {
        id: 'infrastructure',
        title: 'Infrastructure de niveau entreprise',
        description:
          'Conçue selon les standards Fortune 500, avec un SLA de disponibilité de {uptime}, une mise à l’échelle automatique et une distribution mondiale via CDN.',
      },
      {
        id: 'ai',
        title: 'Développement optimisé par l’IA',
        description:
          'Des agents IA avancés comprennent le contexte, écrivent du code prêt pour la production et déploient automatiquement.',
      },
      {
        id: 'security',
        title: 'Sécurité de niveau bancaire',
        description:
          'Certification SOC 2 Type II, chiffrement de bout en bout, RBAC et surveillance continue de la sécurité.',
      },
      {
        id: 'collaboration',
        title: 'Collaboration en temps réel',
        description:
          'Plusieurs développeurs peuvent coder simultanément avec une synchronisation instantanée et une résolution des conflits.',
      },
      {
        id: 'speed',
        title: 'Développement 10 fois plus rapide',
        description:
          'Livrez des fonctionnalités en quelques minutes plutôt qu’en plusieurs mois grâce à notre chaîne de développement optimisée.',
      },
      {
        id: 'edge',
        title: 'Déploiement mondial sur le réseau edge',
        description:
          'Déployez sur plus de {locations} points de présence edge dans le monde, avec SSL automatique et protection DDoS.',
      },
    ],
  },
} as const satisfies MarketingExactLandingFeaturesCopy;

export function getMarketingExactLandingFeaturesCopy(language?: string | null): MarketingExactLandingFeaturesCopy {
  return resolveMarketingLanguage(language) === 'fr'
    ? marketingExactLandingFeaturesFr
    : marketingExactLandingFeaturesEn;
}

export function interpolateMarketingExactLandingFeaturesCopy(
  template: string,
  values: Readonly<Record<string, string | number | bigint>>,
): string {
  return template.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/gu, (token, key: string) => {
    const value = values[key];

    return value === undefined ? token : String(value);
  });
}

export function formatMarketingExactLandingFeaturesPercent(value: number, language?: string | null): string {
  return new Intl.NumberFormat(resolveMarketingLanguage(language) === 'fr' ? 'fr-FR' : 'en-US', {
    style: 'percent',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatMarketingExactLandingFeaturesInteger(value: number, language?: string | null): string {
  return new Intl.NumberFormat(resolveMarketingLanguage(language) === 'fr' ? 'fr-FR' : 'en-US', {
    maximumFractionDigits: 0,
  }).format(value);
}
