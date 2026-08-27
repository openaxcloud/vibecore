import { resolveMarketingLanguage, type MarketingLanguage } from './marketing';

export const templatesLanguagesRouteEn = {
  'templatesLanguages.seo.title': 'Templates by language — E-Code',
  'templatesLanguages.seo.description':
    'Browse E-Code starter templates by programming language, including TypeScript, Python, Go, and more.',
  'templatesLanguages.seo.imageAlt': 'E-Code starter templates grouped by programming language',
  'templatesLanguages.hero.eyebrow': 'Templates',
  'templatesLanguages.hero.title': 'Browse templates by language',
  'templatesLanguages.summary.one.one':
    '{templateCount} production-ready starter template across {languageCount} language. Open the full gallery to explore every template and start building in the IDE.',
  'templatesLanguages.summary.one.other':
    '{templateCount} production-ready starter template across {languageCount} languages. Open the full gallery to explore every template and start building in the IDE.',
  'templatesLanguages.summary.other.one':
    '{templateCount} production-ready starter templates across {languageCount} language. Open the full gallery to explore every template and start building in the IDE.',
  'templatesLanguages.summary.other.other':
    '{templateCount} production-ready starter templates across {languageCount} languages. Open the full gallery to explore every template and start building in the IDE.',
  'templatesLanguages.list.aria': 'Template count by programming language',
  'templatesLanguages.count.one': '{count} template',
  'templatesLanguages.count.other': '{count} templates',
  'templatesLanguages.language.other': 'Other',
  'templatesLanguages.loading': 'Loading template languages…',
  'templatesLanguages.empty.title': 'No template languages are available',
  'templatesLanguages.empty.description':
    'The starter-template catalog is currently empty. Browse the gallery to discover templates as they become available.',
  'templatesLanguages.error.title': 'Template languages could not be loaded',
  'templatesLanguages.error.description':
    'The template catalog is temporarily unavailable. Check your connection and try again.',
  'templatesLanguages.error.retry': 'Try again',
  'templatesLanguages.error.reload': 'Reload page',
  'templatesLanguages.cta.viewAll': 'View all templates',
} as const;

export type TemplatesLanguagesRouteKey = keyof typeof templatesLanguagesRouteEn;
export type TemplatesLanguagesRouteCopy = Readonly<Record<TemplatesLanguagesRouteKey, string>>;

export const templatesLanguagesRouteFr: TemplatesLanguagesRouteCopy = {
  'templatesLanguages.seo.title': 'Modèles par langage — E-Code',
  'templatesLanguages.seo.description':
    'Parcourez les modèles de démarrage E-Code par langage de programmation, notamment TypeScript, Python et Go.',
  'templatesLanguages.seo.imageAlt': 'Modèles de démarrage E-Code regroupés par langage de programmation',
  'templatesLanguages.hero.eyebrow': 'Modèles',
  'templatesLanguages.hero.title': 'Parcourir les modèles par langage',
  'templatesLanguages.summary.one.one':
    '{templateCount} modèle de démarrage prêt pour la production dans {languageCount} langage. Ouvrez la galerie complète pour explorer chaque modèle et commencer à créer dans l’IDE.',
  'templatesLanguages.summary.one.other':
    '{templateCount} modèle de démarrage prêt pour la production dans {languageCount} langages. Ouvrez la galerie complète pour explorer chaque modèle et commencer à créer dans l’IDE.',
  'templatesLanguages.summary.other.one':
    '{templateCount} modèles de démarrage prêts pour la production dans {languageCount} langage. Ouvrez la galerie complète pour explorer chaque modèle et commencer à créer dans l’IDE.',
  'templatesLanguages.summary.other.other':
    '{templateCount} modèles de démarrage prêts pour la production dans {languageCount} langages. Ouvrez la galerie complète pour explorer chaque modèle et commencer à créer dans l’IDE.',
  'templatesLanguages.list.aria': 'Nombre de modèles par langage de programmation',
  'templatesLanguages.count.one': '{count} modèle',
  'templatesLanguages.count.other': '{count} modèles',
  'templatesLanguages.language.other': 'Autre',
  'templatesLanguages.loading': 'Chargement des langages des modèles…',
  'templatesLanguages.empty.title': 'Aucun langage de modèle disponible',
  'templatesLanguages.empty.description':
    'Le catalogue de modèles de démarrage est vide pour le moment. Parcourez la galerie pour découvrir les modèles dès leur publication.',
  'templatesLanguages.error.title': 'Impossible de charger les langages des modèles',
  'templatesLanguages.error.description':
    'Le catalogue de modèles est temporairement indisponible. Vérifiez votre connexion, puis réessayez.',
  'templatesLanguages.error.retry': 'Réessayer',
  'templatesLanguages.error.reload': 'Recharger la page',
  'templatesLanguages.cta.viewAll': 'Voir tous les modèles',
};

type TemplatesLanguagesInterpolationValue = string | number | bigint;

export function resolveTemplatesLanguagesRouteLanguage(language?: string | null): MarketingLanguage {
  return resolveMarketingLanguage(language);
}

export function getTemplatesLanguagesRouteCopy(language?: string | null): TemplatesLanguagesRouteCopy {
  return resolveTemplatesLanguagesRouteLanguage(language) === 'fr'
    ? templatesLanguagesRouteFr
    : templatesLanguagesRouteEn;
}

export function interpolateTemplatesLanguagesRouteCopy(
  template: string,
  values: Readonly<Record<string, TemplatesLanguagesInterpolationValue>>,
): string {
  return template.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/gu, (token, key: string) => {
    const value = values[key];

    return value === undefined ? token : String(value);
  });
}

export function formatTemplatesLanguagesRouteNumber(value: number | bigint, language?: string | null): string {
  return new Intl.NumberFormat(resolveTemplatesLanguagesRouteLanguage(language) === 'fr' ? 'fr-FR' : 'en-US').format(
    value,
  );
}

export function formatTemplatesLanguagesRouteSummary(
  templateCount: number,
  languageCount: number,
  language?: string | null,
): string {
  const copy = getTemplatesLanguagesRouteCopy(language);
  const templatePlural = templateCount === 1 ? 'one' : 'other';
  const languagePlural = languageCount === 1 ? 'one' : 'other';
  const key = `templatesLanguages.summary.${templatePlural}.${languagePlural}` as TemplatesLanguagesRouteKey;

  return interpolateTemplatesLanguagesRouteCopy(copy[key], {
    templateCount: formatTemplatesLanguagesRouteNumber(templateCount, language),
    languageCount: formatTemplatesLanguagesRouteNumber(languageCount, language),
  });
}

export function formatTemplatesLanguagesRouteCount(count: number, language?: string | null): string {
  const copy = getTemplatesLanguagesRouteCopy(language);
  const template = count === 1 ? copy['templatesLanguages.count.one'] : copy['templatesLanguages.count.other'];

  return interpolateTemplatesLanguagesRouteCopy(template, {
    count: formatTemplatesLanguagesRouteNumber(count, language),
  });
}

/** Never expose catalog implementation details or upstream exception messages to visitors. */
export function getTemplatesLanguagesRouteSafeError(language?: string | null, _error?: unknown): string {
  return getTemplatesLanguagesRouteCopy(language)['templatesLanguages.error.description'];
}
