import { resolveMarketingLanguage, type MarketingLanguage } from './marketing';

export type MarketingSurfaceCategory =
  | 'builder'
  | 'runtime'
  | 'data'
  | 'security'
  | 'team'
  | 'learning'
  | 'marketplace'
  | 'admin'
  | 'integration'
  | 'ai';

type SurfaceAction = readonly [label: string, to: string];

export interface MarketingSurfaceCategoryCopy {
  eyebrow: string;
  primaryAction: SurfaceAction;
  secondaryAction: SurfaceAction;
  stats: readonly { label: string; value: string }[];
  controls: readonly string[];
  relatedRoutes: readonly { label: string; to: string; description: string }[];
}

export interface MarketingSurfaceUiCopy {
  routeDetails: (title: string) => string;
  importedCapabilities: (title: string) => string;
  relatedRoutes: (title: string) => string;
  importedConfirmation: string;
  connectedRoutes: string;
  connectedTitle: string;
  open: string;
  productionControls: string;
  productionBody: string;
  workflowTitle: (title: string) => string;
  workflowBody: (title: string) => string;
  notFound: string;
  advancedNotFound: string;
}

export const marketingSurfaceCategoryEn = {
  surfaceCategories: {
    builder: {
      eyebrow: 'Builder surface',
      primaryAction: ['Create project', '/projects/new'],
      secondaryAction: ['Browse templates', '/templates'],
      stats: [
        { label: 'Route status', value: 'Live page' },
        { label: 'Source', value: 'E-Code import' },
        { label: 'Flow', value: 'Prompt to preview' },
      ],
      controls: ['Typed project files', 'Preview verification', 'Agent patch review', 'Deployment handoff'],
      relatedRoutes: [
        { label: 'New project', to: '/projects/new', description: 'Start a governed E-Code workspace.' },
        { label: 'Templates', to: '/templates', description: 'Use production starters as a foundation.' },
        { label: 'Features', to: '/features', description: 'Review the imported E-Code product surface.' },
      ],
    },
    runtime: {
      eyebrow: 'Runtime surface',
      primaryAction: ['Open diagnostics', '/runtime-diagnostics'],
      secondaryAction: ['View status', '/status'],
      stats: [
        { label: 'Runtime loop', value: 'Run, log, preview' },
        { label: 'Adapters', value: 'Connected' },
        { label: 'Failure mode', value: 'Recoverable' },
      ],
      controls: ['Port detection', 'Log visibility', 'Preview health', 'Deployment readiness'],
      relatedRoutes: [
        {
          label: 'Runtime diagnostics',
          to: '/runtime-diagnostics',
          description: 'Inspect runtime readiness and errors.',
        },
        { label: 'Preview', to: '/preview', description: 'Validate rendered application output.' },
        { label: 'Status', to: '/status', description: 'Check platform operational state.' },
      ],
    },
    data: {
      eyebrow: 'Data surface',
      primaryAction: ['Open database', '/database'],
      secondaryAction: ['Read docs', '/docs'],
      stats: [
        { label: 'Data layer', value: 'Modeled' },
        { label: 'Secrets', value: 'Isolated' },
        { label: 'Preview', value: 'Seedable' },
      ],
      controls: ['Schema planning', 'Environment boundaries', 'Seed data', 'Rollback path'],
      relatedRoutes: [
        { label: 'Database', to: '/database', description: 'Model app data and persistence.' },
        { label: 'Object storage', to: '/object-storage', description: 'Attach files and media to projects.' },
        { label: 'Secrets', to: '/secrets', description: 'Keep credentials outside generated code.' },
      ],
    },
    security: {
      eyebrow: 'Security surface',
      primaryAction: ['Review security', '/security'],
      secondaryAction: ['Contact sales', '/contact-sales'],
      stats: [
        { label: 'Identity', value: 'Governed' },
        { label: 'Policy', value: 'Visible' },
        { label: 'Audit', value: 'Traceable' },
      ],
      controls: ['SSO planning', 'Role boundaries', 'Secrets hygiene', 'Audit evidence'],
      relatedRoutes: [
        { label: 'Security', to: '/security', description: 'Review public trust and security posture.' },
        { label: 'Authentication', to: '/authentication', description: 'Plan identity flows for generated apps.' },
        { label: 'Custom roles', to: '/custom-roles', description: 'Map access to team responsibility.' },
      ],
    },
    team: {
      eyebrow: 'Team surface',
      primaryAction: ['Open teams', '/teams'],
      secondaryAction: ['Contact sales', '/contact-sales'],
      stats: [
        { label: 'Collaboration', value: 'Shared' },
        { label: 'Access', value: 'Role-based' },
        { label: 'Review', value: 'Auditable' },
      ],
      controls: ['Member invites', 'Project access', 'Billing ownership', 'Release review'],
      relatedRoutes: [
        { label: 'Teams', to: '/teams', description: 'Coordinate members, billing and project access.' },
        { label: 'Collaboration', to: '/collaboration', description: 'Review multiplayer development workflows.' },
        { label: 'Marketing teams', to: '/marketing/teams', description: 'See enterprise team positioning.' },
      ],
    },
    learning: {
      eyebrow: 'Learning surface',
      primaryAction: ['Start learning', '/learn'],
      secondaryAction: ['Open docs', '/docs'],
      stats: [
        { label: 'Guides', value: 'Practical' },
        { label: 'Examples', value: 'Routable' },
        { label: 'Depth', value: 'Beginner to advanced' },
      ],
      controls: ['Guided tutorials', 'Reference docs', 'Template examples', 'Troubleshooting paths'],
      relatedRoutes: [
        { label: 'Learn', to: '/learn', description: 'Follow structured E-Code learning paths.' },
        { label: 'Tutorials', to: '/tutorials', description: 'Build real projects step by step.' },
        { label: 'Docs', to: '/docs', description: 'Use the primary product reference.' },
      ],
    },
    marketplace: {
      eyebrow: 'Marketplace surface',
      primaryAction: ['Explore apps', '/apps'],
      secondaryAction: ['Browse marketplace', '/marketplace'],
      stats: [
        { label: 'Catalog', value: 'Curated' },
        { label: 'Launch path', value: 'Template to app' },
        { label: 'Reuse', value: 'Team-ready' },
      ],
      controls: ['Reusable starters', 'Extension points', 'App templates', 'Review before release'],
      relatedRoutes: [
        { label: 'Apps', to: '/apps', description: 'Browse imported app and product surfaces.' },
        { label: 'Marketplace', to: '/marketplace', description: 'Discover reusable starters and patterns.' },
        { label: 'Extensions', to: '/extensions', description: 'Extend workspaces with approved tools.' },
      ],
    },
    admin: {
      eyebrow: 'Operations surface',
      primaryAction: ['Open analytics', '/analytics'],
      secondaryAction: ['Review account', '/account'],
      stats: [
        { label: 'Visibility', value: 'Operational' },
        { label: 'Controls', value: 'Account-aware' },
        { label: 'Signals', value: 'Actionable' },
      ],
      controls: ['Usage tracking', 'Plan visibility', 'Account settings', 'Operational alerts'],
      relatedRoutes: [
        { label: 'Analytics', to: '/analytics', description: 'Understand usage and delivery signals.' },
        { label: 'Account', to: '/account', description: 'Manage account-level product access.' },
        { label: 'Usage alerts', to: '/usage-alerts', description: 'Keep teams inside clear limits.' },
      ],
    },
    integration: {
      eyebrow: 'Integration surface',
      primaryAction: ['Connect GitHub', '/import-github'],
      secondaryAction: ['View integrations', '/integrations'],
      stats: [
        { label: 'Source', value: 'Importable' },
        { label: 'Adapters', value: 'Mapped' },
        { label: 'Tools', value: 'Governed' },
      ],
      controls: ['Repository import', 'Provider adapters', 'API contracts', 'Connection health'],
      relatedRoutes: [
        { label: 'GitHub import', to: '/import-github', description: 'Import repositories into E-Code.' },
        { label: 'Integrations', to: '/integrations', description: 'Connect approved product tools.' },
        { label: 'API SDK', to: '/api-sdk', description: 'Build against typed platform interfaces.' },
      ],
    },
    ai: {
      eyebrow: 'AI surface',
      primaryAction: ['Open AI studio', '/ai-agent/studio'],
      secondaryAction: ['Read AI docs', '/ai-documentation'],
      stats: [
        { label: 'Agent loop', value: 'Reviewable' },
        { label: 'Context', value: 'Workspace-aware' },
        { label: 'Output', value: 'Validated' },
      ],
      controls: ['Prompt planning', 'Patch review', 'Tool boundaries', 'Preview-aware checks'],
      relatedRoutes: [
        { label: 'AI Agent Studio', to: '/ai-agent/studio', description: 'Plan and inspect agent work.' },
        { label: 'Assistant', to: '/assistant', description: 'Use the everyday coding copilot.' },
        { label: 'AI documentation', to: '/ai-documentation', description: 'Understand model and tool behavior.' },
      ],
    },
  },
} as const satisfies { surfaceCategories: Record<MarketingSurfaceCategory, MarketingSurfaceCategoryCopy> };

export const marketingSurfaceCategoryFr = {
  surfaceCategories: {
    builder: {
      eyebrow: 'Surface de création',
      primaryAction: ['Créer un projet', '/projects/new'],
      secondaryAction: ['Parcourir les modèles', '/templates'],
      stats: [
        { label: 'État de la route', value: 'Page en ligne' },
        { label: 'Source', value: 'Import E-Code' },
        { label: 'Flux', value: 'Du prompt à l’aperçu' },
      ],
      controls: [
        'Fichiers de projet typés',
        'Vérification de l’aperçu',
        'Revue des patchs de l’agent',
        'Passage au déploiement',
      ],
      relatedRoutes: [
        { label: 'Nouveau projet', to: '/projects/new', description: 'Démarrez un espace de travail E-Code gouverné.' },
        { label: 'Modèles', to: '/templates', description: 'Utilisez des bases de production comme point de départ.' },
        { label: 'Fonctionnalités', to: '/features', description: 'Découvrez la surface produit E-Code importée.' },
      ],
    },
    runtime: {
      eyebrow: 'Surface d’exécution',
      primaryAction: ['Ouvrir les diagnostics', '/runtime-diagnostics'],
      secondaryAction: ['Voir l’état', '/status'],
      stats: [
        { label: 'Cycle d’exécution', value: 'Exécuter, journaliser, prévisualiser' },
        { label: 'Adaptateurs', value: 'Connectés' },
        { label: 'Mode d’échec', value: 'Récupérable' },
      ],
      controls: ['Détection des ports', 'Visibilité des journaux', 'Santé de l’aperçu', 'Préparation au déploiement'],
      relatedRoutes: [
        {
          label: 'Diagnostics d’exécution',
          to: '/runtime-diagnostics',
          description: 'Inspectez la préparation et les erreurs d’exécution.',
        },
        { label: 'Aperçu', to: '/preview', description: 'Validez le rendu de l’application.' },
        { label: 'État', to: '/status', description: 'Vérifiez l’état opérationnel de la plateforme.' },
      ],
    },
    data: {
      eyebrow: 'Surface de données',
      primaryAction: ['Ouvrir la base de données', '/database'],
      secondaryAction: ['Lire la documentation', '/docs'],
      stats: [
        { label: 'Couche de données', value: 'Modélisée' },
        { label: 'Secrets', value: 'Isolés' },
        { label: 'Aperçu', value: 'Données initiales disponibles' },
      ],
      controls: ['Conception du schéma', 'Limites d’environnement', 'Données initiales', 'Parcours de retour arrière'],
      relatedRoutes: [
        { label: 'Base de données', to: '/database', description: 'Modélisez les données et leur persistance.' },
        { label: 'Stockage objet', to: '/object-storage', description: 'Associez des fichiers et médias aux projets.' },
        { label: 'Secrets', to: '/secrets', description: 'Gardez les identifiants hors du code généré.' },
      ],
    },
    security: {
      eyebrow: 'Surface de sécurité',
      primaryAction: ['Examiner la sécurité', '/security'],
      secondaryAction: ['Contacter l’équipe commerciale', '/contact-sales'],
      stats: [
        { label: 'Identité', value: 'Gouvernée' },
        { label: 'Politique', value: 'Visible' },
        { label: 'Audit', value: 'Traçable' },
      ],
      controls: ['Planification du SSO', 'Limites des rôles', 'Hygiène des secrets', 'Preuves d’audit'],
      relatedRoutes: [
        {
          label: 'Sécurité',
          to: '/security',
          description: 'Consultez notre posture publique de confiance et de sécurité.',
        },
        {
          label: 'Authentification',
          to: '/authentication',
          description: 'Concevez les parcours d’identité des applications générées.',
        },
        {
          label: 'Rôles personnalisés',
          to: '/custom-roles',
          description: 'Alignez les accès sur les responsabilités de l’équipe.',
        },
      ],
    },
    team: {
      eyebrow: 'Surface d’équipe',
      primaryAction: ['Ouvrir les équipes', '/teams'],
      secondaryAction: ['Contacter l’équipe commerciale', '/contact-sales'],
      stats: [
        { label: 'Collaboration', value: 'Partagée' },
        { label: 'Accès', value: 'Selon les rôles' },
        { label: 'Revue', value: 'Auditable' },
      ],
      controls: [
        'Invitations des membres',
        'Accès aux projets',
        'Responsabilité de facturation',
        'Revue des mises en ligne',
      ],
      relatedRoutes: [
        {
          label: 'Équipes',
          to: '/teams',
          description: 'Coordonnez les membres, la facturation et les accès aux projets.',
        },
        {
          label: 'Collaboration',
          to: '/collaboration',
          description: 'Découvrez les flux de développement collaboratifs.',
        },
        {
          label: 'Équipes Enterprise',
          to: '/marketing/teams',
          description: 'Découvrez l’offre destinée aux équipes d’entreprise.',
        },
      ],
    },
    learning: {
      eyebrow: 'Surface d’apprentissage',
      primaryAction: ['Commencer à apprendre', '/learn'],
      secondaryAction: ['Ouvrir la documentation', '/docs'],
      stats: [
        { label: 'Guides', value: 'Pratiques' },
        { label: 'Exemples', value: 'Accessibles par route' },
        { label: 'Niveau', value: 'Débutant à avancé' },
      ],
      controls: ['Tutoriels guidés', 'Documentation de référence', 'Exemples de modèles', 'Parcours de dépannage'],
      relatedRoutes: [
        { label: 'Apprendre', to: '/learn', description: 'Suivez des parcours d’apprentissage E-Code structurés.' },
        { label: 'Tutoriels', to: '/tutorials', description: 'Créez de vrais projets étape par étape.' },
        { label: 'Documentation', to: '/docs', description: 'Consultez la référence principale du produit.' },
      ],
    },
    marketplace: {
      eyebrow: 'Surface de la place de marché',
      primaryAction: ['Explorer les applications', '/apps'],
      secondaryAction: ['Parcourir la place de marché', '/marketplace'],
      stats: [
        { label: 'Catalogue', value: 'Sélectionné' },
        { label: 'Parcours de lancement', value: 'Du modèle à l’application' },
        { label: 'Réutilisation', value: 'Prête pour les équipes' },
      ],
      controls: ['Bases réutilisables', 'Points d’extension', 'Modèles d’application', 'Revue avant publication'],
      relatedRoutes: [
        {
          label: 'Applications',
          to: '/apps',
          description: 'Parcourez les surfaces d’application et de produit importées.',
        },
        {
          label: 'Place de marché',
          to: '/marketplace',
          description: 'Découvrez des bases et pratiques réutilisables.',
        },
        { label: 'Extensions', to: '/extensions', description: 'Étendez les espaces avec des outils approuvés.' },
      ],
    },
    admin: {
      eyebrow: 'Surface d’exploitation',
      primaryAction: ['Ouvrir les analyses', '/analytics'],
      secondaryAction: ['Examiner le compte', '/account'],
      stats: [
        { label: 'Visibilité', value: 'Opérationnelle' },
        { label: 'Contrôles', value: 'Adaptés au compte' },
        { label: 'Signaux', value: 'Exploitables' },
      ],
      controls: ['Suivi de l’usage', 'Visibilité de l’offre', 'Paramètres du compte', 'Alertes opérationnelles'],
      relatedRoutes: [
        { label: 'Analyses', to: '/analytics', description: 'Comprenez les signaux d’usage et de livraison.' },
        { label: 'Compte', to: '/account', description: 'Gérez l’accès au produit au niveau du compte.' },
        {
          label: 'Alertes d’usage',
          to: '/usage-alerts',
          description: 'Maintenez les équipes dans des limites claires.',
        },
      ],
    },
    integration: {
      eyebrow: 'Surface d’intégration',
      primaryAction: ['Connecter GitHub', '/import-github'],
      secondaryAction: ['Voir les intégrations', '/integrations'],
      stats: [
        { label: 'Source', value: 'Importable' },
        { label: 'Adaptateurs', value: 'Mappés' },
        { label: 'Outils', value: 'Gouvernés' },
      ],
      controls: ['Import de dépôts', 'Adaptateurs de fournisseurs', 'Contrats API', 'Santé des connexions'],
      relatedRoutes: [
        { label: 'Import GitHub', to: '/import-github', description: 'Importez des dépôts dans E-Code.' },
        { label: 'Intégrations', to: '/integrations', description: 'Connectez des outils approuvés.' },
        { label: 'SDK API', to: '/api-sdk', description: 'Développez avec des interfaces de plateforme typées.' },
      ],
    },
    ai: {
      eyebrow: 'Surface d’IA',
      primaryAction: ['Ouvrir le studio IA', '/ai-agent/studio'],
      secondaryAction: ['Lire la documentation IA', '/ai-documentation'],
      stats: [
        { label: 'Cycle de l’agent', value: 'Révisable' },
        { label: 'Contexte', value: 'Conscient de l’espace' },
        { label: 'Résultat', value: 'Validé' },
      ],
      controls: [
        'Planification du prompt',
        'Revue des patchs',
        'Limites des outils',
        'Contrôles conscients de l’aperçu',
      ],
      relatedRoutes: [
        {
          label: 'Studio de l’agent IA',
          to: '/ai-agent/studio',
          description: 'Planifiez et inspectez le travail de l’agent.',
        },
        { label: 'Assistant', to: '/assistant', description: 'Utilisez le copilote de développement quotidien.' },
        {
          label: 'Documentation IA',
          to: '/ai-documentation',
          description: 'Comprenez le comportement des modèles et outils.',
        },
      ],
    },
  },
} as const satisfies { surfaceCategories: Record<MarketingSurfaceCategory, MarketingSurfaceCategoryCopy> };

const marketingSurfaceUiEnglish: MarketingSurfaceUiCopy = {
  routeDetails: (title) => `${title} route details`,
  importedCapabilities: (title) => `${title} imported capabilities`,
  relatedRoutes: (title) => `${title} related routes`,
  importedConfirmation: 'Imported from E-Code and rendered through E-Code public navigation.',
  connectedRoutes: 'Connected routes',
  connectedTitle: 'Keep moving through real pages.',
  open: 'Open',
  productionControls: 'Production controls',
  productionBody:
    'The route is wired through the public shell, navigation-safe links and responsive content instead of an empty compatibility page.',
  workflowTitle: (title) => `${title} workflow`,
  workflowBody: (title) =>
    `${title} is now a real E-Code route backed by the imported E-Code product map. It keeps the user moving from intent to a visible, recoverable product workflow.`,
  notFound: 'E-Code surface page not found',
  advancedNotFound: 'Advanced E-Code surface page not found',
};

const marketingSurfaceUiFrench: MarketingSurfaceUiCopy = {
  routeDetails: (title) => `Détails de la route ${title}`,
  importedCapabilities: (title) => `Capacités importées de ${title}`,
  relatedRoutes: (title) => `Routes associées à ${title}`,
  importedConfirmation: 'Importé depuis E-Code et affiché dans la navigation publique E-Code.',
  connectedRoutes: 'Routes associées',
  connectedTitle: 'Poursuivez votre parcours dans de vraies pages.',
  open: 'Ouvrir',
  productionControls: 'Contrôles de production',
  productionBody:
    'La route utilise la structure publique, des liens de navigation sûrs et un contenu adaptatif à la place d’une page de compatibilité vide.',
  workflowTitle: (title) => `Flux ${title}`,
  workflowBody: (title) =>
    `${title} est désormais une véritable route E-Code adossée au plan produit importé. Elle vous guide de l’intention à un flux visible et récupérable.`,
  notFound: 'Page de surface E-Code introuvable',
  advancedNotFound: 'Page de surface E-Code avancée introuvable',
};

const marketingSurfaceCatalog = {
  en: { categories: marketingSurfaceCategoryEn.surfaceCategories, ui: marketingSurfaceUiEnglish },
  fr: { categories: marketingSurfaceCategoryFr.surfaceCategories, ui: marketingSurfaceUiFrench },
} as const satisfies Record<
  MarketingLanguage,
  { categories: Record<MarketingSurfaceCategory, MarketingSurfaceCategoryCopy>; ui: MarketingSurfaceUiCopy }
>;

export function getMarketingSurfaceCopy(language?: string | null) {
  return marketingSurfaceCatalog[resolveMarketingLanguage(language)];
}
