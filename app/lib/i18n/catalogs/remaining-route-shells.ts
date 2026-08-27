import { normalizeSupportedLanguage } from '~/lib/i18n/language';

export const remainingRouteShellsEn = {
  'remainingRoutes.projectIde.fallbackTitle': 'Project - E-Code IDE',
  'remainingRoutes.projectIde.description': 'Authenticated E-Code project IDE with a readable account and project URL.',
  'remainingRoutes.git.title': 'Import from Git - E-Code',
  'remainingRoutes.git.description': 'Import a Git repository and build it with E-Code, your AI app builder.',
  'remainingRoutes.deployments.title': 'Deployments - E-Code',
  'remainingRoutes.deployments.description':
    'Ship production-grade apps from your E-Code workspace with one-click deployments, live logs and status.',
  'remainingRoutes.profileNotFound.title': 'Profile not found - E-Code',
  'remainingRoutes.profileNotFound.description': 'The requested public E-Code profile does not exist.',
  'remainingRoutes.projectNotFound.title': 'Project not found - E-Code',
  'remainingRoutes.projectNotFound.description': 'The requested public E-Code project does not exist.',
  'remainingRoutes.settings.title': 'Settings - E-Code',
  'remainingRoutes.settings.description':
    'Manage your E-Code profile, integrations, providers and workspace preferences.',
  'remainingRoutes.projectShare.title': 'Project share - E-Code',
  'remainingRoutes.projectShare.description': 'Open an authenticated E-Code project share invitation.',
  'remainingRoutes.blog.fallbackTitle': 'Blog - E-Code',
  'remainingRoutes.blog.description': 'Read E-Code product updates, engineering articles and AI development guides.',
  'remainingRoutes.blog.notFound': 'This blog post could not be found.',
  'remainingRoutes.compare.fallbackTitle': 'Compare - E-Code',
  'remainingRoutes.compare.suffix': 'Comparison',
  'remainingRoutes.compare.description': 'See how E-Code compares with other AI development platforms.',
  'remainingRoutes.compare.fallbackLabel': 'Compare',
} as const;

export type RemainingRouteShellsKey = keyof typeof remainingRouteShellsEn;
export type RemainingRouteShellsCopy = Readonly<Record<RemainingRouteShellsKey, string>>;

export const remainingRouteShellsFr: RemainingRouteShellsCopy = {
  'remainingRoutes.projectIde.fallbackTitle': 'Projet - IDE E-Code',
  'remainingRoutes.projectIde.description':
    'IDE de projet E-Code authentifié, accessible par une URL lisible de compte et de projet.',
  'remainingRoutes.git.title': 'Importer depuis Git - E-Code',
  'remainingRoutes.git.description':
    'Importez un dépôt Git et créez votre application avec E-Code, votre outil de création assisté par l’IA.',
  'remainingRoutes.deployments.title': 'Déploiements - E-Code',
  'remainingRoutes.deployments.description':
    'Livrez des applications prêtes pour la production depuis votre espace de travail E-Code grâce au déploiement en un clic, aux journaux en direct et au suivi de l’état.',
  'remainingRoutes.profileNotFound.title': 'Profil introuvable - E-Code',
  'remainingRoutes.profileNotFound.description': 'Le profil public E-Code demandé n’existe pas.',
  'remainingRoutes.projectNotFound.title': 'Projet introuvable - E-Code',
  'remainingRoutes.projectNotFound.description': 'Le projet public E-Code demandé n’existe pas.',
  'remainingRoutes.settings.title': 'Paramètres - E-Code',
  'remainingRoutes.settings.description':
    'Gérez votre profil E-Code, vos intégrations, vos fournisseurs et les préférences de votre espace de travail.',
  'remainingRoutes.projectShare.title': 'Partage de projet - E-Code',
  'remainingRoutes.projectShare.description': 'Ouvrez une invitation authentifiée de partage de projet E-Code.',
  'remainingRoutes.blog.fallbackTitle': 'Blog - E-Code',
  'remainingRoutes.blog.description':
    'Lisez les actualités produit, les articles d’ingénierie et les guides de développement avec l’IA d’E-Code.',
  'remainingRoutes.blog.notFound': 'Cet article de blog est introuvable.',
  'remainingRoutes.compare.fallbackTitle': 'Comparer - E-Code',
  'remainingRoutes.compare.suffix': 'Comparatif',
  'remainingRoutes.compare.description':
    'Découvrez comment E-Code se compare aux autres plateformes de développement assisté par l’IA.',
  'remainingRoutes.compare.fallbackLabel': 'Comparer',
};

export function getRemainingRouteShellsCopy(language?: string | null): RemainingRouteShellsCopy {
  return normalizeSupportedLanguage(language) === 'fr' ? remainingRouteShellsFr : remainingRouteShellsEn;
}

export function buildRemainingRouteMeta({
  title,
  description,
  path,
  language,
  noindex = false,
}: {
  title: string;
  description: string;
  path: string;
  language?: string | null;
  noindex?: boolean;
}) {
  const canonical = `https://e-code.ai${path.startsWith('/') ? path : `/${path}`}`;
  const french = normalizeSupportedLanguage(language) === 'fr';

  return [
    { title },
    { name: 'description', content: description },
    { property: 'og:title', content: title },
    { property: 'og:description', content: description },
    { property: 'og:type', content: 'website' },
    { property: 'og:url', content: canonical },
    { property: 'og:locale', content: french ? 'fr_FR' : 'en_US' },
    { property: 'og:locale:alternate', content: french ? 'en_US' : 'fr_FR' },
    { name: 'twitter:title', content: title },
    { name: 'twitter:description', content: description },
    { tagName: 'link', rel: 'canonical', href: canonical },
    { tagName: 'link', rel: 'alternate', hrefLang: 'en', href: `${canonical}?lang=en` },
    { tagName: 'link', rel: 'alternate', hrefLang: 'fr', href: `${canonical}?lang=fr` },
    { tagName: 'link', rel: 'alternate', hrefLang: 'x-default', href: canonical },
    ...(noindex ? [{ name: 'robots', content: 'noindex, nofollow' }] : []),
  ];
}
