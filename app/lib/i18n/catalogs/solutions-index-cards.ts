/**
 * Public `/solutions` card copy. The detailed page catalogues live beside their
 * renderers; this small catalogue keeps the index itself on the same EN/FR
 * contract and is merged into the existing marketing Solutions namespace.
 */
export const solutionsIndexCardCatalog = {
  en: {
    'marketingSolutions.cards.app-builder.title': 'App Builder',
    'marketingSolutions.cards.app-builder.description':
      'Describe a business workflow and turn it into responsive screens, typed application logic, structured data, and a deployable codebase.',
    'marketingSolutions.cards.website-builder.title': 'Website Builder',
    'marketingSolutions.cards.website-builder.description':
      'Create polished marketing sites, launch pages, and content systems with production-ready responsive layouts.',
    'marketingSolutions.cards.game-builder.title': 'Game Builder',
    'marketingSolutions.cards.game-builder.description':
      'Design interactive browser experiences while keeping assets, code, and preview feedback in one workspace.',
    'marketingSolutions.cards.dashboard-builder.title': 'Dashboard Builder',
    'marketingSolutions.cards.dashboard-builder.description':
      'Build data-rich dashboards with charts, filters, access controls, and operational context.',
    'marketingSolutions.cards.chatbot-builder.title': 'Chatbot Builder',
    'marketingSolutions.cards.chatbot-builder.description':
      'Build conversational assistants with reviewable prompts, tools, local knowledge flows, and clear operating boundaries.',
    'marketingSolutions.cards.internal-ai-builder.title': 'Internal AI Builder',
    'marketingSolutions.cards.internal-ai-builder.description':
      'Create private-team AI workflows with project context, approvals, and observable delivery paths.',
    'marketingSolutions.cards.enterprise.title': 'Enterprise',
    'marketingSolutions.cards.enterprise.description':
      'Plan governed E-Code rollouts with SSO, SCIM, audit controls, private runtimes, and support.',
    'marketingSolutions.cards.startups.title': 'Startups',
    'marketingSolutions.cards.startups.description':
      'Move from product idea to a reviewable build, hosted preview, and production plan in one workspace.',
    'marketingSolutions.cards.freelancers.title': 'Freelancers',
    'marketingSolutions.cards.freelancers.description':
      'Deliver client projects with repeatable workflows, reviewable previews, and a clear production handoff.',
  },
  fr: {
    'marketingSolutions.cards.app-builder.title': 'App Builder',
    'marketingSolutions.cards.app-builder.description':
      'Décrivez un flux métier et transformez-le en écrans adaptatifs, logique applicative typée, données structurées et codebase déployable.',
    'marketingSolutions.cards.website-builder.title': 'Website Builder',
    'marketingSolutions.cards.website-builder.description':
      'Créez des sites marketing, des pages de lancement et des systèmes de contenu soignés, avec des mises en page adaptatives prêtes pour la production.',
    'marketingSolutions.cards.game-builder.title': 'Game Builder',
    'marketingSolutions.cards.game-builder.description':
      'Concevez des expériences interactives dans le navigateur en réunissant ressources, code et retours de l’aperçu dans un même espace.',
    'marketingSolutions.cards.dashboard-builder.title': 'Dashboard Builder',
    'marketingSolutions.cards.dashboard-builder.description':
      'Créez des tableaux de bord riches en données avec graphiques, filtres, contrôles d’accès et contexte opérationnel.',
    'marketingSolutions.cards.chatbot-builder.title': 'Chatbot Builder',
    'marketingSolutions.cards.chatbot-builder.description':
      'Créez des assistants conversationnels avec des prompts vérifiables, des outils, des parcours de connaissance locaux et des limites d’usage claires.',
    'marketingSolutions.cards.internal-ai-builder.title': 'Internal AI Builder',
    'marketingSolutions.cards.internal-ai-builder.description':
      'Créez des flux IA pour vos équipes avec contexte projet, approbations et parcours de livraison observables.',
    'marketingSolutions.cards.enterprise.title': 'Enterprise',
    'marketingSolutions.cards.enterprise.description':
      'Planifiez un déploiement gouverné d’E-Code avec SSO, SCIM, contrôles d’audit, runtimes privés et support.',
    'marketingSolutions.cards.startups.title': 'Startups',
    'marketingSolutions.cards.startups.description':
      'Passez de l’idée produit à une version vérifiable, un aperçu hébergé et un plan de production dans un même espace.',
    'marketingSolutions.cards.freelancers.title': 'Freelancers',
    'marketingSolutions.cards.freelancers.description':
      'Livrez vos projets client avec des flux reproductibles, des aperçus vérifiables et un transfert en production clair.',
  },
} as const;

export const solutionsIndexCardsEn = solutionsIndexCardCatalog.en;
export const solutionsIndexCardsFr: Readonly<Record<keyof typeof solutionsIndexCardsEn, string>> =
  solutionsIndexCardCatalog.fr;
