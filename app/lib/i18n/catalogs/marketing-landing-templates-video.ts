import { resolveMarketingLanguage } from './marketing';

export const marketingLandingTemplatesEn = {
  'marketingLandingTemplates.title': 'Start with templates',
  'marketingLandingTemplates.subtitle': 'Production-ready templates to accelerate your development',
  'marketingLandingTemplates.loading': 'Loading templates…',
  'marketingLandingTemplates.viewAll': 'View all templates',
  'marketingLandingTemplates.open': 'Open template',
  'marketingLandingTemplates.openNamed': 'Open the {name} template',
  'marketingLandingTemplates.fallback.saas.name': 'SaaS starter kit',
  'marketingLandingTemplates.fallback.saas.description':
    'Complete SaaS application with authentication, billing, and a dashboard',
  'marketingLandingTemplates.fallback.saas.category': 'Business',
  'marketingLandingTemplates.fallback.ecommerce.name': 'E-commerce',
  'marketingLandingTemplates.fallback.ecommerce.description':
    'Complete online store with a cart, checkout, and inventory management',
  'marketingLandingTemplates.fallback.ecommerce.category': 'Commerce',
  'marketingLandingTemplates.fallback.analytics.name': 'Analytics dashboard',
  'marketingLandingTemplates.fallback.analytics.description': 'Real-time charts and data visualization',
  'marketingLandingTemplates.fallback.analytics.category': 'Analytics',
  'marketingLandingTemplates.fallback.chat.name': 'Chat application',
  'marketingLandingTemplates.fallback.chat.description': 'Real-time messaging with WebSocket',
  'marketingLandingTemplates.fallback.chat.category': 'Communication',
  'marketingLandingTemplates.fallback.documentation.name': 'Documentation',
  'marketingLandingTemplates.fallback.documentation.description':
    'Polished documentation with search and version management',
  'marketingLandingTemplates.fallback.documentation.category': 'Content',
  'marketingLandingTemplates.fallback.admin.name': 'Admin panel',
  'marketingLandingTemplates.fallback.admin.description': 'Complete administration dashboard with CRUD operations',
  'marketingLandingTemplates.fallback.admin.category': 'Business',
} as const;

export type MarketingLandingTemplatesKey = keyof typeof marketingLandingTemplatesEn;
export type MarketingLandingTemplatesCopy = Readonly<Record<MarketingLandingTemplatesKey, string>>;

export const marketingLandingTemplatesFr: MarketingLandingTemplatesCopy = {
  'marketingLandingTemplates.title': 'Commencez avec un modèle',
  'marketingLandingTemplates.subtitle': 'Des modèles prêts pour la production afin d’accélérer votre développement',
  'marketingLandingTemplates.loading': 'Chargement des modèles…',
  'marketingLandingTemplates.viewAll': 'Voir tous les modèles',
  'marketingLandingTemplates.open': 'Ouvrir le modèle',
  'marketingLandingTemplates.openNamed': 'Ouvrir le modèle {name}',
  'marketingLandingTemplates.fallback.saas.name': 'Kit de démarrage SaaS',
  'marketingLandingTemplates.fallback.saas.description':
    'Application SaaS complète avec authentification, facturation et tableau de bord',
  'marketingLandingTemplates.fallback.saas.category': 'Entreprise',
  'marketingLandingTemplates.fallback.ecommerce.name': 'E-commerce',
  'marketingLandingTemplates.fallback.ecommerce.description':
    'Boutique en ligne complète avec panier, paiement et gestion des stocks',
  'marketingLandingTemplates.fallback.ecommerce.category': 'Commerce',
  'marketingLandingTemplates.fallback.analytics.name': 'Tableau de bord analytique',
  'marketingLandingTemplates.fallback.analytics.description': 'Graphiques en temps réel et visualisation des données',
  'marketingLandingTemplates.fallback.analytics.category': 'Analytique',
  'marketingLandingTemplates.fallback.chat.name': 'Application de messagerie',
  'marketingLandingTemplates.fallback.chat.description': 'Messagerie en temps réel avec WebSocket',
  'marketingLandingTemplates.fallback.chat.category': 'Communication',
  'marketingLandingTemplates.fallback.documentation.name': 'Documentation',
  'marketingLandingTemplates.fallback.documentation.description':
    'Documentation soignée avec recherche et gestion des versions',
  'marketingLandingTemplates.fallback.documentation.category': 'Contenu',
  'marketingLandingTemplates.fallback.admin.name': 'Panneau d’administration',
  'marketingLandingTemplates.fallback.admin.description':
    'Tableau de bord d’administration complet avec opérations CRUD',
  'marketingLandingTemplates.fallback.admin.category': 'Entreprise',
};

export const marketingLandingVideoEn = {
  'marketingLandingVideo.title': 'See E-Code Platform in action',
  'marketingLandingVideo.subtitle':
    'Watch a real demo: build and deploy a complete frontend and backend application in under 2 minutes using AI agents',
  'marketingLandingVideo.mediaLabel': 'E-Code Platform product demonstration',
  'marketingLandingVideo.mediaFallback': 'Your browser does not support HTML video.',
  'marketingLandingVideo.trackLabel': 'English',
  'marketingLandingVideo.controlsLabel': 'Video controls',
  'marketingLandingVideo.play': 'Play demo video',
  'marketingLandingVideo.pause': 'Pause demo video',
  'marketingLandingVideo.unmute': 'Unmute demo video',
  'marketingLandingVideo.mute': 'Mute demo video',
  'marketingLandingVideo.showCaptions': 'Show captions',
  'marketingLandingVideo.hideCaptions': 'Hide captions',
  'marketingLandingVideo.fullscreen': 'Enter fullscreen',
  'marketingLandingVideo.playbackError': 'The demo video could not be played. Please try again.',
  'marketingLandingVideo.fullscreenError': 'Fullscreen mode is unavailable in this browser.',
  'marketingLandingVideo.demoTitle': 'Live platform demo',
  'marketingLandingVideo.demoDescription':
    'Watch the E-Code Platform AI agent build a complete frontend and backend application',
  'marketingLandingVideo.badge.codeGeneration': 'AI code generation',
  'marketingLandingVideo.badge.preview': 'Real-time preview',
  'marketingLandingVideo.badge.deployment': 'Instant deployment',
} as const;

export type MarketingLandingVideoKey = keyof typeof marketingLandingVideoEn;
export type MarketingLandingVideoCopy = Readonly<Record<MarketingLandingVideoKey, string>>;

export const marketingLandingVideoFr: MarketingLandingVideoCopy = {
  'marketingLandingVideo.title': 'Découvrez E-Code Platform en action',
  'marketingLandingVideo.subtitle':
    'Découvrez une démonstration réelle : créez et déployez une application complète, côté client comme côté serveur, en moins de 2 minutes grâce à des agents IA',
  'marketingLandingVideo.mediaLabel': 'Démonstration produit d’E-Code Platform',
  'marketingLandingVideo.mediaFallback': 'Votre navigateur ne prend pas en charge la vidéo HTML.',
  'marketingLandingVideo.trackLabel': 'Français',
  'marketingLandingVideo.controlsLabel': 'Commandes de la vidéo',
  'marketingLandingVideo.play': 'Lire la vidéo de démonstration',
  'marketingLandingVideo.pause': 'Mettre la vidéo de démonstration en pause',
  'marketingLandingVideo.unmute': 'Activer le son de la vidéo de démonstration',
  'marketingLandingVideo.mute': 'Couper le son de la vidéo de démonstration',
  'marketingLandingVideo.showCaptions': 'Afficher les sous-titres',
  'marketingLandingVideo.hideCaptions': 'Masquer les sous-titres',
  'marketingLandingVideo.fullscreen': 'Passer en plein écran',
  'marketingLandingVideo.playbackError': 'Impossible de lire la vidéo de démonstration. Veuillez réessayer.',
  'marketingLandingVideo.fullscreenError': 'Le mode plein écran n’est pas disponible dans ce navigateur.',
  'marketingLandingVideo.demoTitle': 'Démonstration en direct de la plateforme',
  'marketingLandingVideo.demoDescription':
    'Découvrez comment l’agent IA d’E-Code Platform crée une application complète, côté client comme côté serveur',
  'marketingLandingVideo.badge.codeGeneration': 'Génération de code par IA',
  'marketingLandingVideo.badge.preview': 'Aperçu en temps réel',
  'marketingLandingVideo.badge.deployment': 'Déploiement instantané',
};

type MarketingLandingInterpolationValue = string | number | bigint;

function interpolateMarketingLandingCopy(
  template: string,
  values: Readonly<Record<string, MarketingLandingInterpolationValue>>,
): string {
  return template.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/gu, (token, key: string) => {
    const value = values[key];

    return value === undefined ? token : String(value);
  });
}

export function getMarketingLandingTemplatesCopy(language?: string | null): MarketingLandingTemplatesCopy {
  return resolveMarketingLanguage(language) === 'fr' ? marketingLandingTemplatesFr : marketingLandingTemplatesEn;
}

export function formatMarketingLandingTemplateLinkLabel(name: string | undefined, language?: string | null): string {
  const copy = getMarketingLandingTemplatesCopy(language);
  const normalizedName = name?.trim();

  if (!normalizedName) {
    return copy['marketingLandingTemplates.open'];
  }

  return interpolateMarketingLandingCopy(copy['marketingLandingTemplates.openNamed'], { name: normalizedName });
}

export function getMarketingLandingVideoCopy(language?: string | null): MarketingLandingVideoCopy {
  return resolveMarketingLanguage(language) === 'fr' ? marketingLandingVideoFr : marketingLandingVideoEn;
}
