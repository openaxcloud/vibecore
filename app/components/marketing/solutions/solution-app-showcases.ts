import type { BilingualLanguage, SolutionAppShowcaseSlug } from './solution-copy';

export const SOLUTION_APP_SHOWCASE_SLUGS = [
  'website-builder',
  'game-builder',
  'dashboard-builder',
  'chatbot-builder',
  'internal-ai-builder',
  'enterprise',
  'startups',
  'freelancers',
] as const satisfies readonly SolutionAppShowcaseSlug[];

type LocalizedText = Readonly<Record<BilingualLanguage, string>>;

export type SolutionAppVisual = Readonly<{
  id: string;
  name: string;
  thumbnailSrc: string;
  previewHref: string;
  alt: LocalizedText;
  description: LocalizedText;
  capability: LocalizedText;
}>;

export type SolutionAppShowcase = Readonly<{
  primary: SolutionAppVisual;
  supporting: SolutionAppVisual;
  related: SolutionAppVisual;
}>;

function galleryApp(
  id: string,
  name: string,
  content: Readonly<{
    alt: LocalizedText;
    description: LocalizedText;
    capability: LocalizedText;
  }>,
): SolutionAppVisual {
  return {
    id,
    name,
    thumbnailSrc: `/gallery-apps/${id}/thumbnail.png`,
    previewHref: `/gallery-apps/${id}/preview/`,
    ...content,
  };
}

const APPS = {
  landingPage: galleryApp('landing-page', 'Kindred', {
    alt: {
      en: 'Kindred wellness website with a large editorial booking hero and a Book a visit action.',
      fr: 'Site bien-être Kindred avec un grand héros éditorial de réservation et l’action Book a visit.',
    },
    description: {
      en: 'A responsive service website with an editorial identity and a clear booking journey.',
      fr: 'Un site de services responsive avec une identité éditoriale et un parcours de réservation clair.',
    },
    capability: { en: 'Responsive website', fr: 'Site responsive' },
  }),
  storefront: galleryApp('storefront', 'Meridian Supply Co.', {
    alt: {
      en: 'Meridian Supply Co. ecommerce storefront showing a product grid, inventory states, and shopping cart.',
      fr: 'Boutique e-commerce Meridian Supply Co. avec grille de produits, états de stock et panier.',
    },
    description: {
      en: 'A working storefront with product inventory, cart interactions, and Stripe test-mode checkout.',
      fr: 'Une boutique fonctionnelle avec stock, interactions panier et paiement Stripe en mode test.',
    },
    capability: { en: 'Commerce flow', fr: 'Parcours e-commerce' },
  }),
  neonTrivia: galleryApp('neon-trivia-arena', 'Neon Trivia Arena', {
    alt: {
      en: 'Neon Trivia Arena arcade quiz with a question, answer grid, combo multiplier, score, and leaderboard.',
      fr: 'Quiz arcade Neon Trivia Arena avec question, grille de réponses, multiplicateur de combo, score et classement.',
    },
    description: {
      en: 'A real six-round quiz with streak bonuses, live scoring, a 50:50 lifeline, and a locally saved high score.',
      fr: 'Un vrai quiz en six manches avec bonus de série, score en direct, joker 50:50 et meilleur score sauvegardé localement.',
    },
    capability: { en: 'Interactive game', fr: 'Jeu interactif' },
  }),
  warehouse: galleryApp('warehouse-layout-planner', 'Warehouse Layout Planner', {
    alt: {
      en: 'Interactive 3D warehouse layout planner showing pallet racks, aisle clearance, and capacity controls.',
      fr: 'Planificateur 3D interactif d’entrepôt avec rayonnages, largeur d’allées et contrôles de capacité.',
    },
    description: {
      en: 'A certified WebGL experience with direct manipulation, live constraints, and a resilient 2D fallback.',
      fr: 'Une expérience WebGL certifiée avec manipulation directe, contraintes en direct et repli 2D robuste.',
    },
    capability: { en: 'Real-time 3D interaction', fr: 'Interaction 3D temps réel' },
  }),
  revenue: galleryApp('revenue-cohort-explorer', 'Revenue Cohort Explorer', {
    alt: {
      en: 'Revenue Cohort Explorer dashboard with retention KPIs, plan filters, and an interactive cohort heatmap.',
      fr: 'Tableau de bord Revenue Cohort Explorer avec KPI de rétention, filtres de forfait et carte de cohortes interactive.',
    },
    description: {
      en: 'A certified analytics app with filters, computed KPIs, cohort drill-down, and customer detail.',
      fr: 'Une app analytique certifiée avec filtres, KPI calculés, détail par cohorte et fiche client.',
    },
    capability: { en: 'Interactive analytics', fr: 'Analyse interactive' },
  }),
  operations: galleryApp('next-dashboard', 'Northstar Command Center', {
    alt: {
      en: 'Northstar operations command center with availability, latency, request volume, and open incidents.',
      fr: 'Centre de commande Northstar avec disponibilité, latence, volume de requêtes et incidents ouverts.',
    },
    description: {
      en: 'A production operations dashboard with service health, incident ownership, and deployment status.',
      fr: 'Un tableau de bord d’exploitation avec santé des services, responsabilité des incidents et état des déploiements.',
    },
    capability: { en: 'Operations dashboard', fr: 'Tableau de bord opérations' },
  }),
  docsCopilot: galleryApp('docs-copilot', 'Docs Copilot', {
    alt: {
      en: 'Docs Copilot support workspace with a documentation question, grounded answer, source citations, and knowledge collections.',
      fr: 'Espace de support Docs Copilot avec question documentaire, réponse sourcée, citations et collections de connaissances.',
    },
    description: {
      en: 'A working documentation-grounded assistant with free-form questions, ranked retrieval, citations, and source controls.',
      fr: 'Un assistant documentaire fonctionnel avec questions libres, recherche classée, citations et contrôle des sources.',
    },
    capability: { en: 'Grounded support assistant', fr: 'Assistant de support sourcé' },
  }),
  aiAgent: galleryApp('ai-agent', 'Launchline', {
    alt: {
      en: 'Launchline AI task workspace showing launch readiness, critical tasks, owners, and completion states.',
      fr: 'Espace de travail IA Launchline avec préparation du lancement, tâches critiques, responsables et états.',
    },
    description: {
      en: 'A focused AI-assisted workspace that turns a complex launch into clear, actionable steps.',
      fr: 'Un espace assisté par IA qui transforme un lancement complexe en étapes claires et actionnables.',
    },
    capability: { en: 'AI-assisted workflow', fr: 'Workflow assisté par IA' },
  }),
  incident: galleryApp('incident-postmortem-explainer', 'Incident Postmortem Explainer', {
    alt: {
      en: 'Animated payments API incident explainer with service graph, latency timeline, metrics, and response log.',
      fr: 'Explication animée d’un incident API de paiement avec graphe de services, chronologie, métriques et journal.',
    },
    description: {
      en: 'A certified internal knowledge app that turns operational evidence into an interactive incident narrative.',
      fr: 'Une app de connaissance interne certifiée qui transforme les preuves opérationnelles en récit d’incident interactif.',
    },
    capability: { en: 'Knowledge assistant', fr: 'Assistant de connaissance' },
  }),
  vendorRisk: galleryApp('vendor-risk-review', 'Vendor Risk Review', {
    alt: {
      en: 'Vendor Risk Review sign-in and role-aware workflow for scoring and approving third-party vendors.',
      fr: 'Connexion Vendor Risk Review et workflow par rôle pour noter et approuver les fournisseurs tiers.',
    },
    description: {
      en: 'A certified full-stack workflow with authentication, approvals, weighted risk scoring, and an audit trail.',
      fr: 'Un workflow full-stack certifié avec authentification, approbations, score de risque pondéré et journal d’audit.',
    },
    capability: { en: 'Governed workflow', fr: 'Workflow gouverné' },
  }),
  qbr: galleryApp('qbr-generator', 'QBR Generator', {
    alt: {
      en: 'QBR Generator showing a board-ready quarterly review with computed revenue and retention figures.',
      fr: 'QBR Generator présentant une revue trimestrielle prête pour le comité avec revenus et rétention calculés.',
    },
    description: {
      en: 'A certified executive reporting app with a live backend, slide deck, and shared data appendix.',
      fr: 'Une app de reporting exécutif certifiée avec backend réel, présentation et annexe de données partagée.',
    },
    capability: { en: 'Executive reporting', fr: 'Reporting exécutif' },
  }),
  reactSaas: galleryApp('react-saas', 'Orbit', {
    alt: {
      en: 'Orbit SaaS sales workspace with pipeline value, won revenue, follow-ups, and active opportunities.',
      fr: 'Espace commercial SaaS Orbit avec valeur du pipeline, revenus gagnés, relances et opportunités actives.',
    },
    description: {
      en: 'A polished SaaS workspace that covers contacts, pipeline stages, tasks, and next actions.',
      fr: 'Un espace SaaS soigné qui couvre contacts, étapes du pipeline, tâches et prochaines actions.',
    },
    capability: { en: 'SaaS product', fr: 'Produit SaaS' },
  }),
  pipeline: galleryApp('pipeline-crm', 'Pipeline CRM', {
    alt: {
      en: 'Pipeline CRM kanban with prospecting, qualification, proposal, and negotiation columns.',
      fr: 'Kanban Pipeline CRM avec colonnes prospection, qualification, proposition et négociation.',
    },
    description: {
      en: 'A certified sales application with movable opportunities, live totals, search, and forecasting.',
      fr: 'Une app commerciale certifiée avec opportunités déplaçables, totaux en direct, recherche et prévisions.',
    },
    capability: { en: 'Sales workflow', fr: 'Workflow commercial' },
  }),
  fieldService: galleryApp('field-service-inspector', 'Field Service Inspector', {
    alt: {
      en: 'Field Service Inspector with an offline-ready route, work order details, and inspection checklist.',
      fr: 'Field Service Inspector avec tournée hors ligne, détail d’intervention et liste de contrôle.',
    },
    description: {
      en: 'A certified offline-first field app with inspection state, notes, photos, and explicit synchronisation.',
      fr: 'Une app terrain certifiée hors ligne avec contrôles, notes, photos et synchronisation explicite.',
    },
    capability: { en: 'Offline-first field app', fr: 'App terrain hors ligne' },
  }),
} as const;

export const SOLUTION_APP_SHOWCASES = {
  'website-builder': { primary: APPS.landingPage, supporting: APPS.storefront, related: APPS.reactSaas },
  'game-builder': { primary: APPS.neonTrivia, supporting: APPS.warehouse, related: APPS.incident },
  'dashboard-builder': { primary: APPS.revenue, supporting: APPS.operations, related: APPS.pipeline },
  'chatbot-builder': { primary: APPS.docsCopilot, supporting: APPS.aiAgent, related: APPS.incident },
  'internal-ai-builder': { primary: APPS.incident, supporting: APPS.vendorRisk, related: APPS.qbr },
  enterprise: { primary: APPS.vendorRisk, supporting: APPS.operations, related: APPS.qbr },
  startups: { primary: APPS.reactSaas, supporting: APPS.pipeline, related: APPS.aiAgent },
  freelancers: { primary: APPS.fieldService, supporting: APPS.qbr, related: APPS.landingPage },
} as const satisfies Record<SolutionAppShowcaseSlug, SolutionAppShowcase>;

export const SOLUTION_SHOWCASE_UI = {
  en: {
    realApp: 'Real application',
    workingDemo: 'Working E-Code demo app',
    openPreview: 'Open live preview',
    openPreviewAria: 'Open the working app preview in a new tab',
    sectionEyebrow: 'REAL APPS · OPEN THE PREVIEW',
    sectionTitle: 'Working products, not decorative mockups.',
    sectionBody:
      'Every image below is a capture of an executable E-Code demo application. Open the preview to test the interface yourself.',
    sectionLabel: 'Working applications related to this solution',
  },
  fr: {
    realApp: 'Application réelle',
    workingDemo: 'Application de démonstration E-Code fonctionnelle',
    openPreview: 'Ouvrir l’aperçu',
    openPreviewAria: 'Ouvrir l’aperçu fonctionnel de l’application dans un nouvel onglet',
    sectionEyebrow: 'APPS RÉELLES · APERÇUS OUVERTS',
    sectionTitle: 'Des produits fonctionnels, pas des maquettes décoratives.',
    sectionBody:
      'Chaque image ci-dessous est la capture d’une application de démonstration E-Code exécutable. Ouvrez l’aperçu pour tester vous-même l’interface.',
    sectionLabel: 'Applications fonctionnelles liées à cette solution',
  },
} as const satisfies Record<BilingualLanguage, Readonly<Record<string, string>>>;

export function getSolutionAppShowcase(slug: SolutionAppShowcaseSlug): SolutionAppShowcase {
  return SOLUTION_APP_SHOWCASES[slug];
}
