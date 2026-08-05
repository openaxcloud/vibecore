import { resolveMarketingLanguage } from './marketing';

export type CommunityRouteCategoryId = 'all' | 'showcase' | 'help' | 'tutorials' | 'discussion';
export type CommunityRoutePostId =
  | 'agent-memory-routing-production'
  | 'mobile-preview-checklist'
  | 'deployments-rollback-playbook'
  | 'templates-to-real-products'
  | 'team-workspace-governance'
  | 'community-demo-day-recap';
export type CommunityRouteChallengeId = 'agent-with-tools' | 'mobile-first-builder' | 'secure-deployment-runbook';
export type CommunityRouteContributorId = 'maya-ops' | 'nadia-release' | 'ari-builds' | 'sam-teams';
export type CommunityRouteEventId =
  | 'agent-systems-roundtable'
  | 'mobile-qa-workshop'
  | 'deployment-review-clinic'
  | 'template-hardening-day';
export const COMMUNITY_ROUTE_TAG_IDS = [
  'ai-agent',
  'memory',
  'security',
  'audit',
  'mobile',
  'qa',
  'preview',
  'responsive',
  'deployments',
  'rollback',
  'cloud-run',
  'helm',
  'templates',
  'typescript',
  'api',
  'quality',
  'teams',
  'rbac',
  'collaboration',
  'handoff',
  'demo-day',
  'ai-apps',
  'dashboards',
] as const;
export type CommunityRouteTagId = (typeof COMMUNITY_ROUTE_TAG_IDS)[number];

interface MarketingCommunityRouteCopy {
  communityRoute: {
    seo: { title: string; description: string; imageAlt: string };
    categories: readonly { id: CommunityRouteCategoryId; name: string }[];
    tagLabels: Readonly<Record<CommunityRouteTagId, string>>;
    posts: readonly {
      id: CommunityRoutePostId;
      title: string;
      summary: string;
      content: string;
      categoryName: string;
    }[];
    challenges: readonly {
      id: CommunityRouteChallengeId;
      title: string;
      description: string;
    }[];
    contributorBadges: readonly { id: CommunityRouteContributorId; badge: string }[];
    events: readonly {
      id: CommunityRouteEventId;
      title: string;
      description: string;
    }[];
    detail: {
      seoFallbackTitle: string;
      seoTitle: string;
      seoDescription: string;
      seoImageAlt: string;
      backToCommunity: string;
      browseTemplates: string;
      likes_one: string;
      likes_other: string;
      comments_one: string;
      comments_other: string;
      views_one: string;
      views_other: string;
      discussion: string;
      postedBy: string;
      authorSummary: string;
      publicDiscussion: string;
      implementationNotes: string;
      safeSharing: string;
    };
  };
}

export const marketingCommunityRouteEn = {
  communityRoute: {
    seo: {
      title: 'Community — E-Code',
      description:
        'Explore the public E-Code builder community, including discussions, challenges, contributors and upcoming events.',
      imageAlt: 'E-Code builder community discussions and events',
    },
    categories: [
      { id: 'all', name: 'All' },
      { id: 'showcase', name: 'Showcase' },
      { id: 'help', name: 'Help' },
      { id: 'tutorials', name: 'Tutorials' },
      { id: 'discussion', name: 'Discussion' },
    ],
    tagLabels: {
      'ai-agent': 'ai-agent',
      memory: 'memory',
      security: 'security',
      audit: 'audit',
      mobile: 'mobile',
      qa: 'qa',
      preview: 'preview',
      responsive: 'responsive',
      deployments: 'deployments',
      rollback: 'rollback',
      'cloud-run': 'cloud-run',
      helm: 'helm',
      templates: 'templates',
      typescript: 'typescript',
      api: 'api',
      quality: 'quality',
      teams: 'teams',
      rbac: 'rbac',
      collaboration: 'collaboration',
      handoff: 'handoff',
      'demo-day': 'demo-day',
      'ai-apps': 'ai-apps',
      dashboards: 'dashboards',
    },
    posts: [
      {
        id: 'agent-memory-routing-production',
        title: 'How are teams routing agent memory safely in production?',
        summary:
          'Builders compare consent, retention, deletion and audit patterns for agent memory before rolling it out to customer-facing workspaces.',
        content:
          'The thread covers memory scopes, deletion flows, audit events and the operational checks teams run before enabling long-lived agent context.',
        categoryName: 'Help',
      },
      {
        id: 'mobile-preview-checklist',
        title: 'Mobile preview checklist before sending a build to QA',
        summary:
          'A practical list for testing safe-area spacing, navigation drawers, touch targets, auth redirects and preview health on real mobile viewports.',
        content:
          'Community members are refining a repeatable mobile QA checklist that catches layout and navigation regressions before release.',
        categoryName: 'Showcase',
      },
      {
        id: 'deployments-rollback-playbook',
        title: 'Production deployment rollback playbook for small teams',
        summary:
          'A public runbook for pairing automated rollout checks with human review when a web, runtime or workspace-agent image is promoted.',
        content:
          'The discussion focuses on deployment gates, rollout verification, rollback ownership and the signals teams should capture during release.',
        categoryName: 'Tutorials',
      },
      {
        id: 'templates-to-real-products',
        title: 'Turning starters into real products without losing code quality',
        summary:
          'Community guidance on replacing generated defaults with typed APIs, loading states, error recovery and production data contracts.',
        content: 'Builders share the checkpoints they use when a starter becomes a customer-facing product surface.',
        categoryName: 'Discussion',
      },
      {
        id: 'team-workspace-governance',
        title: 'Workspace governance patterns for teams and agencies',
        summary:
          'A discussion about roles, project ownership, shared previews, client handoff and audit-friendly collaboration inside E-Code workspaces.',
        content: 'The thread collects team operating models and permission patterns for production app delivery.',
        categoryName: 'Discussion',
      },
      {
        id: 'community-demo-day-recap',
        title: 'Community demo day recap: AI apps, dashboards and mobile builds',
        summary:
          'Highlights from builders who shipped full-stack apps, internal dashboards and mobile prototypes with public lessons from each launch.',
        content: 'This recap links the public lessons from demo day back to practical workflows builders can repeat.',
        categoryName: 'Showcase',
      },
    ],
    challenges: [
      {
        id: 'agent-with-tools',
        title: 'Ship an agent with tool orchestration',
        description:
          'Build an agent flow with streaming progress, tool calls, audit logs and a production fallback path.',
      },
      {
        id: 'mobile-first-builder',
        title: 'Mobile-first builder workflow',
        description: 'Design a responsive app flow that works cleanly across phone, tablet and desktop previews.',
      },
      {
        id: 'secure-deployment-runbook',
        title: 'Secure deployment runbook',
        description: 'Publish a deployment checklist with rollback, secrets, monitoring and post-release validation.',
      },
    ],
    contributorBadges: [
      { id: 'maya-ops', badge: 'Mentor' },
      { id: 'nadia-release', badge: 'Release' },
      { id: 'ari-builds', badge: 'Builder' },
      { id: 'sam-teams', badge: 'Teams' },
    ],
    events: [
      {
        id: 'agent-systems-roundtable',
        title: 'Agent systems roundtable',
        description: 'A public conversation on memory, tools, routing, evaluation and production incident handling.',
      },
      {
        id: 'mobile-qa-workshop',
        title: 'Mobile QA workshop',
        description: 'A hands-on session for responsive layouts, preview validation and real device release checks.',
      },
      {
        id: 'deployment-review-clinic',
        title: 'Deployment review clinic',
        description: 'Bring a deployment flow and get community feedback on rollout safety and observability.',
      },
      {
        id: 'template-hardening-day',
        title: 'Template hardening day',
        description: 'Convert starters into production-ready foundations with types, tests and recovery states.',
      },
    ],
    detail: {
      seoFallbackTitle: 'Community discussion',
      seoTitle: '{title} — E-Code Community',
      seoDescription:
        'Public E-Code community discussion presented with the marketing navigation, footer and active theme.',
      seoImageAlt: 'E-Code community discussion: {title}',
      backToCommunity: 'Back to community',
      browseTemplates: 'Browse templates',
      likes_one: '{count} like',
      likes_other: '{count} likes',
      comments_one: '{count} comment',
      comments_other: '{count} comments',
      views_one: '{count} view',
      views_other: '{count} views',
      discussion: 'Discussion',
      postedBy: 'Posted by {name}',
      authorSummary: '@{handle} · {reputation} reputation · Updated {date}',
      publicDiscussion: 'Public discussion',
      implementationNotes: 'Implementation notes',
      safeSharing: 'Safe sharing',
    },
  },
} as const satisfies MarketingCommunityRouteCopy;

export const marketingCommunityRouteFr = {
  communityRoute: {
    seo: {
      title: 'Communauté — E-Code',
      description:
        'Explorez la communauté publique des créateurs E-Code : discussions, défis, contributeurs et événements à venir.',
      imageAlt: 'Discussions et événements de la communauté des créateurs E-Code',
    },
    categories: [
      { id: 'all', name: 'Tout' },
      { id: 'showcase', name: 'Vitrines' },
      { id: 'help', name: 'Aide' },
      { id: 'tutorials', name: 'Tutoriels' },
      { id: 'discussion', name: 'Discussions' },
    ],
    tagLabels: {
      'ai-agent': 'Agent IA',
      memory: 'Mémoire',
      security: 'Sécurité',
      audit: 'Audit',
      mobile: 'Mobile',
      qa: 'Assurance qualité',
      preview: 'Aperçu',
      responsive: 'Adaptatif',
      deployments: 'Déploiements',
      rollback: 'Retour arrière',
      'cloud-run': 'Cloud Run',
      helm: 'Helm',
      templates: 'Modèles',
      typescript: 'TypeScript',
      api: 'API',
      quality: 'Qualité',
      teams: 'Équipes',
      rbac: 'RBAC',
      collaboration: 'Collaboration',
      handoff: 'Transmission',
      'demo-day': 'Journée de démonstration',
      'ai-apps': 'Applications IA',
      dashboards: 'Tableaux de bord',
    },
    posts: [
      {
        id: 'agent-memory-routing-production',
        title: 'Comment les équipes acheminent-elles la mémoire des agents en toute sécurité en production ?',
        summary:
          'Les créateurs comparent les pratiques de consentement, de conservation, de suppression et d’audit avant d’activer la mémoire des agents dans les espaces de travail destinés aux clients.',
        content:
          'La discussion aborde les périmètres de mémoire, les parcours de suppression, les événements d’audit et les contrôles opérationnels réalisés avant d’activer un contexte d’agent durable.',
        categoryName: 'Aide',
      },
      {
        id: 'mobile-preview-checklist',
        title: 'Liste de contrôle de l’aperçu mobile avant l’envoi en assurance qualité',
        summary:
          'Une liste pratique pour vérifier les zones de sécurité, les menus de navigation, les cibles tactiles, les redirections d’authentification et la fiabilité de l’aperçu sur de vrais formats mobiles.',
        content:
          'Les membres de la communauté affinent une liste de contrôle reproductible d’assurance qualité mobile qui détecte les régressions de mise en page et de navigation avant la mise en production.',
        categoryName: 'Vitrine',
      },
      {
        id: 'deployments-rollback-playbook',
        title: 'Guide de retour arrière d’un déploiement de production pour les petites équipes',
        summary:
          'Un guide public pour associer les contrôles automatisés de mise en production à une revue humaine lors de la promotion d’une image web, d’environnement d’exécution ou d’agent d’espace de travail.',
        content:
          'La discussion porte sur les jalons de déploiement, la vérification de la mise en production, la responsabilité du retour arrière et les signaux à collecter pendant la livraison.',
        categoryName: 'Tutoriels',
      },
      {
        id: 'templates-to-real-products',
        title: 'Transformer des bases de départ en produits réels sans sacrifier la qualité du code',
        summary:
          'La communauté explique comment remplacer les réglages générés par des API typées, des états de chargement, une récupération après erreur et des contrats de données adaptés à la production.',
        content:
          'Les créateurs partagent les contrôles qu’ils appliquent lorsqu’une base de départ devient une surface produit destinée aux clients.',
        categoryName: 'Discussions',
      },
      {
        id: 'team-workspace-governance',
        title: 'Modèles de gouvernance des espaces de travail pour les équipes et les agences',
        summary:
          'Une discussion sur les rôles, la propriété des projets, les aperçus partagés, la transmission aux clients et une collaboration compatible avec l’audit dans les espaces de travail E-Code.',
        content:
          'La discussion rassemble des modèles de fonctionnement d’équipe et des schémas d’autorisation pour livrer des applications en production.',
        categoryName: 'Discussions',
      },
      {
        id: 'community-demo-day-recap',
        title: 'Retour sur la journée de démonstration : applications IA, tableaux de bord et compilations mobiles',
        summary:
          'Les temps forts de créateurs ayant livré des applications complètes, des tableaux de bord internes et des prototypes mobiles, avec les enseignements publics de chaque lancement.',
        content:
          'Ce récapitulatif relie les enseignements publics de la journée de démonstration à des processus concrets que les créateurs peuvent reproduire.',
        categoryName: 'Vitrine',
      },
    ],
    challenges: [
      {
        id: 'agent-with-tools',
        title: 'Publier un agent avec une orchestration d’outils',
        description:
          'Créez un parcours d’agent avec progression diffusée en continu, appels d’outils, journaux d’audit et solution de repli pour la production.',
      },
      {
        id: 'mobile-first-builder',
        title: 'Processus de création pensé d’abord pour le mobile',
        description:
          'Concevez un parcours d’application adaptatif qui fonctionne parfaitement dans les aperçus sur mobile, tablette et ordinateur.',
      },
      {
        id: 'secure-deployment-runbook',
        title: 'Guide de déploiement sécurisé',
        description:
          'Publiez une liste de contrôle du déploiement couvrant le retour arrière, les secrets, la supervision et la validation après mise en production.',
      },
    ],
    contributorBadges: [
      { id: 'maya-ops', badge: 'Mentor' },
      { id: 'nadia-release', badge: 'Livraison' },
      { id: 'ari-builds', badge: 'Créateur' },
      { id: 'sam-teams', badge: 'Équipes' },
    ],
    events: [
      {
        id: 'agent-systems-roundtable',
        title: 'Table ronde sur les systèmes d’agents',
        description:
          'Une discussion publique sur la mémoire, les outils, l’acheminement, l’évaluation et la gestion des incidents en production.',
      },
      {
        id: 'mobile-qa-workshop',
        title: 'Atelier d’assurance qualité mobile',
        description:
          'Une session pratique consacrée aux mises en page adaptatives, à la validation des aperçus et aux contrôles de livraison sur de vrais appareils.',
      },
      {
        id: 'deployment-review-clinic',
        title: 'Permanence de revue des déploiements',
        description:
          'Présentez un parcours de déploiement et recueillez les retours de la communauté sur la sécurité de la mise en production et l’observabilité.',
      },
      {
        id: 'template-hardening-day',
        title: 'Journée de renforcement des modèles',
        description:
          'Transformez des bases de départ en fondations prêtes pour la production grâce aux types, aux tests et aux états de récupération.',
      },
    ],
    detail: {
      seoFallbackTitle: 'Discussion de la communauté',
      seoTitle: '{title} — Communauté E-Code',
      seoDescription:
        'Discussion publique de la communauté E-Code présentée avec la navigation marketing, le pied de page et le thème actif.',
      seoImageAlt: 'Discussion de la communauté E-Code : {title}',
      backToCommunity: 'Retour à la communauté',
      browseTemplates: 'Parcourir les modèles',
      likes_one: '{count} mention J’aime',
      likes_other: '{count} mentions J’aime',
      comments_one: '{count} commentaire',
      comments_other: '{count} commentaires',
      views_one: '{count} vue',
      views_other: '{count} vues',
      discussion: 'Fil de discussion',
      postedBy: 'Publié par {name}',
      authorSummary: '@{handle} · réputation : {reputation} · Mis à jour le {date}',
      publicDiscussion: 'Discussion publique',
      implementationNotes: 'Notes de mise en œuvre',
      safeSharing: 'Partage sécurisé',
    },
  },
} as const satisfies MarketingCommunityRouteCopy;

export const marketingCommunityRouteCatalog = {
  en: marketingCommunityRouteEn,
  fr: marketingCommunityRouteFr,
} as const satisfies Record<'en' | 'fr', MarketingCommunityRouteCopy>;

export function getMarketingCommunityRouteCopy(language?: string | null): MarketingCommunityRouteCopy {
  return resolveMarketingLanguage(language) === 'fr' ? marketingCommunityRouteFr : marketingCommunityRouteEn;
}

export function formatMarketingCommunityRouteCopy(
  template: string,
  values: Readonly<Record<string, string | number>>,
): string {
  return template.replace(/\{(\w+)\}/gu, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match,
  );
}
