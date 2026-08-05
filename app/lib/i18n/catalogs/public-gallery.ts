import { resolveMarketingLanguage } from './marketing';

export const publicGalleryEn = {
  'publicGallery.explore.seoTitle': 'Explore - E-Code',
  'publicGallery.explore.seoDescription':
    'Discover real, production-ready projects the E-Code community is building. Fork one to start instantly.',
  'publicGallery.explore.socialDescription':
    'Discover real, production-ready projects the E-Code community is building.',
  'publicGallery.explore.badge': 'Explore',
  'publicGallery.explore.title': 'Discover what the E-Code community is building',
  'publicGallery.explore.description':
    'Browse real, production-ready E-Code projects. Fork one to open the preserved IDE with typed code, preview and deployment workflows already wired up.',
  'publicGallery.explore.metric.publicProjects': 'Public projects',
  'publicGallery.explore.metric.categories': 'Categories',
  'publicGallery.explore.metric.forkReady': 'Fork-ready',
  'publicGallery.explore.searchLabel': 'Search projects',
  'publicGallery.explore.searchPlaceholder': 'Search projects, stacks or tags...',
  'publicGallery.explore.clearSearch': 'Clear search',
  'publicGallery.explore.categoryFilter': 'Filter projects by category',
  'publicGallery.explore.all': 'All',
  'publicGallery.explore.emptyQuery': 'No projects match “{query}”',
  'publicGallery.explore.emptyCategory': 'No projects in this category yet',
  'publicGallery.explore.emptyDescription':
    'Try a different search or category, or clear the filters to browse every project.',
  'publicGallery.explore.clearFilters': 'Clear filters',
  'publicGallery.explore.matches_one': '{count} project matches your filters.',
  'publicGallery.explore.matches_other': '{count} projects match your filters.',
  'publicGallery.gallery.seoTitle': 'Gallery - E-Code',
  'publicGallery.gallery.seoDescription':
    'Browse apps the E-Code community has published. Open one, or remix it into your own workspace in a click.',
  'publicGallery.gallery.socialDescription':
    'Browse apps the E-Code community has published. Remix one to start instantly.',
  'publicGallery.gallery.previewAlt': 'Preview of {title}',
  'publicGallery.gallery.featured': 'Featured',
  'publicGallery.gallery.badge': 'Gallery',
  'publicGallery.gallery.title': 'Apps the community built — remix one to start',
  'publicGallery.gallery.description':
    'Browse published projects, open the live app, or remix it into your own workspace in a click. New apps are added through a curated review.',
  'publicGallery.gallery.searchPlaceholder': 'Search apps, authors, tags…',
  'publicGallery.gallery.searchAria': 'Search the gallery',
  'publicGallery.gallery.searchButton': 'Search',
  'publicGallery.gallery.categoriesAria': 'Categories',
  'publicGallery.gallery.all': 'All',
  'publicGallery.gallery.emptyTitle': 'No apps match your search',
  'publicGallery.gallery.emptyDescription': 'Try another category or a different search term.',
  'publicGallery.detail.meta.title': '{title} — Gallery — E-Code',
  'publicGallery.detail.meta.fallbackTitle': 'Gallery — E-Code',
  'publicGallery.detail.meta.fallbackDescription': 'An app published to the E-Code Gallery.',
  'publicGallery.detail.error.notFound': 'This gallery app could not be found.',
  'publicGallery.detail.error.unavailable': 'This gallery app is unavailable right now. Try again shortly.',
  'publicGallery.detail.error.remixFailed': 'This app could not be remixed. Check your consent and try again.',
  'publicGallery.detail.back': 'Back to gallery',
  'publicGallery.detail.author': 'by {author}',
  'publicGallery.detail.previewAlt': 'Preview of {title}',
  'publicGallery.detail.views': 'Views',
  'publicGallery.detail.used_one': '{count} time',
  'publicGallery.detail.used_other': '{count} times',
  'publicGallery.detail.usedLabel': 'Used',
  'publicGallery.detail.license': 'License',
  'publicGallery.detail.licenseMissing': 'No license specified by the author',
  'publicGallery.detail.licenseRead': 'Read the license text',
  'publicGallery.detail.piiMasked':
    'Personal data (emails, phone numbers, and payment identifiers) found in the source files is masked in your copy.',
  'publicGallery.detail.piiConsent': 'The author explicitly consented to share the app data as-is (consent {version}).',
  'publicGallery.detail.acceptLicense':
    'I accept the license terms above and the data-handling policy (consent {version}).',
  'publicGallery.detail.remixing': 'Remixing…',
  'publicGallery.detail.remix': 'Remix this app',
  'publicGallery.detail.remixDisabled': 'The author has not allowed this app to be remixed.',
  'publicGallery.detail.viewApp': 'View app',
  'publicGallery.detail.copyDisclosure':
    'Remixing creates a private copy in your workspace. Secrets from the original are never copied, and personal data is masked unless the author consented to share it.',
  'publicGallery.detail.report': 'Report this app',
  'publicGallery.card.author': 'by {author}',
  'publicGallery.stat.stars_one': 'star',
  'publicGallery.stat.stars_other': 'stars',
  'publicGallery.stat.forks_one': 'fork',
  'publicGallery.stat.forks_other': 'forks',
  'publicGallery.stat.runs_one': 'run',
  'publicGallery.stat.runs_other': 'runs',
  'publicGallery.stat.views_one': 'view',
  'publicGallery.stat.views_other': 'views',
  'publicGallery.stat.remixes_one': 'remix',
  'publicGallery.stat.remixes_other': 'remixes',
  'publicGallery.category.api': 'APIs & Backend',
  'publicGallery.category.mobile': 'Mobile',
  'publicGallery.category.mlAi': 'AI & ML',
  'publicGallery.category.starter': 'Starter Kits',
  'publicGallery.category.web': 'Web Apps',
  'publicGallery.workspace.reactSaas.name': 'React SaaS',
  'publicGallery.workspace.reactSaas.description':
    'Production SaaS starter with React, Vite, TypeScript, authenticated dashboard surfaces and deploy-ready structure.',
  'publicGallery.workspace.nextDashboard.name': 'Next dashboard',
  'publicGallery.workspace.nextDashboard.description':
    'Full-stack dashboard starter with Next.js, Prisma, Tailwind CSS and database-backed operational screens.',
  'publicGallery.workspace.fastifyApi.name': 'Fastify API',
  'publicGallery.workspace.fastifyApi.description':
    'Backend service starter with Node.js, Fastify, PostgreSQL-style persistence boundaries and production API conventions.',
  'publicGallery.workspace.aiAgent.name': 'AI agent',
  'publicGallery.workspace.aiAgent.description':
    'Agent runtime starter with tool orchestration, streaming events, provider routing and IDE integration points.',
  'publicGallery.workspace.landingPage.name': 'Landing page',
  'publicGallery.workspace.landingPage.description':
    'Responsive marketing starter for conversion pages, polished content sections and production-ready routing.',
  'publicGallery.workspace.mobileStarter.name': 'Mobile starter',
  'publicGallery.workspace.mobileStarter.description':
    'Mobile app starter with Expo, React and TypeScript for shared frontend packages and device-first flows.',
} as const;

export type PublicGalleryKey = keyof typeof publicGalleryEn;
export type PublicGalleryCopy = Readonly<Record<PublicGalleryKey, string>>;

export const publicGalleryFr: PublicGalleryCopy = {
  'publicGallery.explore.seoTitle': 'Explorer - E-Code',
  'publicGallery.explore.seoDescription':
    'Découvrez les projets réels et prêts pour la production créés par la communauté E-Code. Dupliquez-en un pour commencer immédiatement.',
  'publicGallery.explore.socialDescription':
    'Découvrez les projets réels et prêts pour la production créés par la communauté E-Code.',
  'publicGallery.explore.badge': 'Explorer',
  'publicGallery.explore.title': 'Découvrez ce que crée la communauté E-Code',
  'publicGallery.explore.description':
    'Parcourez de véritables projets E-Code prêts pour la production. Dupliquez-en un pour ouvrir l’IDE préservé avec du code typé et des flux d’aperçu et de déploiement déjà configurés.',
  'publicGallery.explore.metric.publicProjects': 'Projets publics',
  'publicGallery.explore.metric.categories': 'Catégories',
  'publicGallery.explore.metric.forkReady': 'Prêts à dupliquer',
  'publicGallery.explore.searchLabel': 'Rechercher des projets',
  'publicGallery.explore.searchPlaceholder': 'Rechercher des projets, piles techniques ou étiquettes…',
  'publicGallery.explore.clearSearch': 'Effacer la recherche',
  'publicGallery.explore.categoryFilter': 'Filtrer les projets par catégorie',
  'publicGallery.explore.all': 'Tous',
  'publicGallery.explore.emptyQuery': 'Aucun projet ne correspond à « {query} »',
  'publicGallery.explore.emptyCategory': 'Aucun projet dans cette catégorie pour le moment',
  'publicGallery.explore.emptyDescription':
    'Essayez une autre recherche ou catégorie, ou effacez les filtres pour parcourir tous les projets.',
  'publicGallery.explore.clearFilters': 'Effacer les filtres',
  'publicGallery.explore.matches_one': '{count} projet correspond à vos filtres.',
  'publicGallery.explore.matches_other': '{count} projets correspondent à vos filtres.',
  'publicGallery.gallery.seoTitle': 'Galerie - E-Code',
  'publicGallery.gallery.seoDescription':
    'Parcourez les applications publiées par la communauté E-Code. Ouvrez-en une ou remixez-la dans votre espace de travail en un clic.',
  'publicGallery.gallery.socialDescription':
    'Parcourez les applications publiées par la communauté E-Code. Remixez-en une pour commencer immédiatement.',
  'publicGallery.gallery.previewAlt': 'Aperçu de {title}',
  'publicGallery.gallery.featured': 'À la une',
  'publicGallery.gallery.badge': 'Galerie',
  'publicGallery.gallery.title': 'Les applications de la communauté — remixez-en une pour commencer',
  'publicGallery.gallery.description':
    'Parcourez les projets publiés, ouvrez l’application en ligne ou remixez-la dans votre espace de travail en un clic. Les nouvelles applications sont ajoutées après une sélection éditoriale.',
  'publicGallery.gallery.searchPlaceholder': 'Rechercher des applications, auteurs ou étiquettes…',
  'publicGallery.gallery.searchAria': 'Rechercher dans la galerie',
  'publicGallery.gallery.searchButton': 'Rechercher',
  'publicGallery.gallery.categoriesAria': 'Catégories',
  'publicGallery.gallery.all': 'Toutes',
  'publicGallery.gallery.emptyTitle': 'Aucune application ne correspond à votre recherche',
  'publicGallery.gallery.emptyDescription': 'Essayez une autre catégorie ou un autre terme de recherche.',
  'publicGallery.detail.meta.title': '{title} — Galerie — E-Code',
  'publicGallery.detail.meta.fallbackTitle': 'Galerie — E-Code',
  'publicGallery.detail.meta.fallbackDescription': 'Une application publiée dans la galerie E-Code.',
  'publicGallery.detail.error.notFound': 'Cette application est introuvable dans la galerie.',
  'publicGallery.detail.error.unavailable':
    'Cette application de la galerie est indisponible pour le moment. Réessayez dans quelques instants.',
  'publicGallery.detail.error.remixFailed':
    'Impossible de remixer cette application. Vérifiez votre consentement, puis réessayez.',
  'publicGallery.detail.back': 'Retour à la galerie',
  'publicGallery.detail.author': 'par {author}',
  'publicGallery.detail.previewAlt': 'Aperçu de {title}',
  'publicGallery.detail.views': 'Vues',
  'publicGallery.detail.used_one': '{count} fois',
  'publicGallery.detail.used_other': '{count} fois',
  'publicGallery.detail.usedLabel': 'Utilisée',
  'publicGallery.detail.license': 'Licence',
  'publicGallery.detail.licenseMissing': 'Aucune licence indiquée par l’auteur',
  'publicGallery.detail.licenseRead': 'Lire le texte de la licence',
  'publicGallery.detail.piiMasked':
    'Les données personnelles détectées dans les fichiers sources — adresses e-mail, numéros de téléphone et identifiants de paiement — sont masquées dans votre copie.',
  'publicGallery.detail.piiConsent':
    'L’auteur a explicitement consenti au partage des données de l’application en l’état (consentement {version}).',
  'publicGallery.detail.acceptLicense':
    'J’accepte les conditions de licence ci-dessus et la politique de traitement des données (consentement {version}).',
  'publicGallery.detail.remixing': 'Remix en cours…',
  'publicGallery.detail.remix': 'Remixer cette application',
  'publicGallery.detail.remixDisabled': 'L’auteur n’autorise pas le remix de cette application.',
  'publicGallery.detail.viewApp': 'Ouvrir l’application',
  'publicGallery.detail.copyDisclosure':
    'Le remix crée une copie privée dans votre espace de travail. Les secrets de l’original ne sont jamais copiés et les données personnelles sont masquées, sauf si l’auteur a consenti à leur partage.',
  'publicGallery.detail.report': 'Signaler cette application',
  'publicGallery.card.author': 'par {author}',
  'publicGallery.stat.stars_one': 'étoile',
  'publicGallery.stat.stars_other': 'étoiles',
  'publicGallery.stat.forks_one': 'copie',
  'publicGallery.stat.forks_other': 'copies',
  'publicGallery.stat.runs_one': 'exécution',
  'publicGallery.stat.runs_other': 'exécutions',
  'publicGallery.stat.views_one': 'vue',
  'publicGallery.stat.views_other': 'vues',
  'publicGallery.stat.remixes_one': 'remix',
  'publicGallery.stat.remixes_other': 'remix',
  'publicGallery.category.api': 'API et services applicatifs',
  'publicGallery.category.mobile': 'Mobile',
  'publicGallery.category.mlAi': 'IA et machine learning',
  'publicGallery.category.starter': 'Kits de démarrage',
  'publicGallery.category.web': 'Applications web',
  'publicGallery.workspace.reactSaas.name': 'SaaS React',
  'publicGallery.workspace.reactSaas.description':
    'Modèle SaaS de production avec React, Vite, TypeScript, un tableau de bord authentifié et une structure prête au déploiement.',
  'publicGallery.workspace.nextDashboard.name': 'Tableau de bord Next.js',
  'publicGallery.workspace.nextDashboard.description':
    'Modèle d’application complète avec tableau de bord, Next.js, Prisma, Tailwind CSS et des écrans opérationnels connectés à une base de données.',
  'publicGallery.workspace.fastifyApi.name': 'API Fastify',
  'publicGallery.workspace.fastifyApi.description':
    'Modèle de service applicatif avec Node.js, Fastify, une persistance PostgreSQL et les conventions d’une API de production.',
  'publicGallery.workspace.aiAgent.name': 'Agent IA',
  'publicGallery.workspace.aiAgent.description':
    'Modèle d’environnement d’exécution pour agent avec orchestration d’outils, événements diffusés en continu, routage des fournisseurs et points d’intégration à l’IDE.',
  'publicGallery.workspace.landingPage.name': 'Page d’atterrissage',
  'publicGallery.workspace.landingPage.description':
    'Modèle marketing adaptatif pour les pages de conversion, avec des sections éditoriales soignées et un routage prêt pour la production.',
  'publicGallery.workspace.mobileStarter.name': 'Kit de démarrage mobile',
  'publicGallery.workspace.mobileStarter.description':
    'Modèle d’application mobile avec Expo, React et TypeScript pour des paquets d’interface utilisateur partagés et des parcours pensés pour les appareils mobiles.',
};

export function getPublicGalleryCopy(language?: string | null): PublicGalleryCopy {
  return resolveMarketingLanguage(language) === 'fr' ? publicGalleryFr : publicGalleryEn;
}

export function formatPublicGalleryCopy(
  template: string,
  values: Readonly<Record<string, string | number>> = {},
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match,
  );
}

export function formatPublicGalleryNumber(language: string | null | undefined, value: number, compact = false): string {
  return new Intl.NumberFormat(resolveMarketingLanguage(language) === 'fr' ? 'fr-FR' : 'en-US', {
    notation: compact ? 'compact' : 'standard',
    maximumFractionDigits: compact ? 1 : 0,
  }).format(value);
}

export function formatPublicGalleryPercent(language: string | null | undefined, value: number): string {
  return new Intl.NumberFormat(resolveMarketingLanguage(language) === 'fr' ? 'fr-FR' : 'en-US', {
    style: 'percent',
    maximumFractionDigits: 0,
  }).format(value);
}

export function selectPublicGalleryPlural(language: string | null | undefined, count: number): 'one' | 'other' {
  const locale = resolveMarketingLanguage(language) === 'fr' ? 'fr-FR' : 'en-US';
  return new Intl.PluralRules(locale).select(count) === 'one' ? 'one' : 'other';
}
