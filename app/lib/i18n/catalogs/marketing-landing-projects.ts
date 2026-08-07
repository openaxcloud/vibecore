import { resolveMarketingLanguage } from './marketing';

export const marketingLandingProjectsEn = {
  'marketingLandingProjects.title': 'Built with E-Code Platform',
  'marketingLandingProjects.subtitle': 'Real production applications built by our community in hours, not months',
  'marketingLandingProjects.buildTime.one': 'Built in {count} hour',
  'marketingLandingProjects.buildTime.other': 'Built in {count} hours',
  'marketingLandingProjects.project.techStore.title': 'TechStore Pro',
  'marketingLandingProjects.project.techStore.description':
    'Full-featured e-commerce platform with 50K+ daily transactions',
  'marketingLandingProjects.project.teamSync.title': 'TeamSync Hub',
  'marketingLandingProjects.project.teamSync.description': 'Real-time collaboration platform for remote teams',
  'marketingLandingProjects.project.dataViz.title': 'DataViz Pro',
  'marketingLandingProjects.project.dataViz.description': 'Enterprise analytics dashboard with real-time charts',
  'marketingLandingProjects.technology.react': 'React',
  'marketingLandingProjects.technology.node': 'Node.js',
  'marketingLandingProjects.technology.postgresql': 'PostgreSQL',
  'marketingLandingProjects.technology.websocket': 'WebSocket',
  'marketingLandingProjects.technology.redis': 'Redis',
  'marketingLandingProjects.technology.typescript': 'TypeScript',
  'marketingLandingProjects.technology.recharts': 'Recharts',
  'marketingLandingProjects.technology.d3': 'D3.js',
} as const;

export type MarketingLandingProjectsKey = keyof typeof marketingLandingProjectsEn;
export type MarketingLandingProjectsCopy = Readonly<Record<MarketingLandingProjectsKey, string>>;

export const marketingLandingProjectsFr: MarketingLandingProjectsCopy = {
  'marketingLandingProjects.title': 'Des projets créés avec E-Code Platform',
  'marketingLandingProjects.subtitle':
    'Des applications réellement utilisées en production, créées par notre communauté en quelques heures, pas en plusieurs mois',
  'marketingLandingProjects.buildTime.one': 'Créé en {count} heure',
  'marketingLandingProjects.buildTime.other': 'Créé en {count} heures',
  'marketingLandingProjects.project.techStore.title': 'TechStore Pro',
  'marketingLandingProjects.project.techStore.description':
    'Plateforme e-commerce complète traitant plus de 50 000 transactions par jour',
  'marketingLandingProjects.project.teamSync.title': 'TeamSync Hub',
  'marketingLandingProjects.project.teamSync.description':
    'Plateforme de collaboration en temps réel pour les équipes à distance',
  'marketingLandingProjects.project.dataViz.title': 'DataViz Pro',
  'marketingLandingProjects.project.dataViz.description':
    'Tableau de bord analytique d’entreprise avec graphiques en temps réel',
  'marketingLandingProjects.technology.react': 'React',
  'marketingLandingProjects.technology.node': 'Node.js',
  'marketingLandingProjects.technology.postgresql': 'PostgreSQL',
  'marketingLandingProjects.technology.websocket': 'WebSocket',
  'marketingLandingProjects.technology.redis': 'Redis',
  'marketingLandingProjects.technology.typescript': 'TypeScript',
  'marketingLandingProjects.technology.recharts': 'Recharts',
  'marketingLandingProjects.technology.d3': 'D3.js',
};

type MarketingLandingProjectsInterpolationValue = string | number | bigint;

export function getMarketingLandingProjectsCopy(language?: string | null): MarketingLandingProjectsCopy {
  return resolveMarketingLanguage(language) === 'fr' ? marketingLandingProjectsFr : marketingLandingProjectsEn;
}

export function interpolateMarketingLandingProjectsCopy(
  template: string,
  values: Readonly<Record<string, MarketingLandingProjectsInterpolationValue>>,
): string {
  return template.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/gu, (token, key: string) => {
    const value = values[key];

    return value === undefined ? token : String(value);
  });
}

export function formatMarketingLandingProjectBuildTime(hours: number, language?: string | null): string {
  const resolvedLanguage = resolveMarketingLanguage(language);
  const locale = resolvedLanguage === 'fr' ? 'fr-FR' : 'en-US';
  const copy = getMarketingLandingProjectsCopy(resolvedLanguage);
  const pluralCategory = new Intl.PluralRules(locale).select(hours);

  const template =
    pluralCategory === 'one'
      ? copy['marketingLandingProjects.buildTime.one']
      : copy['marketingLandingProjects.buildTime.other'];

  return interpolateMarketingLandingProjectsCopy(template, {
    count: new Intl.NumberFormat(locale).format(hours),
  });
}
