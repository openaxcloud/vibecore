/**
 * BUG-PERF-I18N-SURFACE-001 — le catalogue par LANGUE ne suffisait pas.
 *
 * #535 a sorti les 150 catalogues du graphe client et n'envoie plus que la
 * langue du document. Mesuré le 2026-09-15 sur le JSON réellement servi par
 * la production (`/assets/catalogue-en-c7b46c795f.json`) : 718 Ko bruts /
 * 178,8 Ko brotli, 10 548 clés — dont `chat` 95 Ko, `settings` 40,8 Ko,
 * `baseChatAst` 38,1 Ko et `idePanels` 27 Ko, téléchargés par un visiteur de
 * la page d'accueil qui n'ouvrira jamais l'IDE.
 *
 * Le catalogue est donc découpé une seconde fois, par SURFACE :
 *   - `public`  — les préfixes cités depuis le chemin public (153,2 Ko bruts) ;
 *   - `app`     — tout le reste (547,9 Ko bruts), soit 78,1 % du poids.
 *
 * LE PIÈGE, ET CE QUI LE FERME. Échanger onze secondes de chargement contre un
 * éclair de clés brutes à l'ouverture d'un panneau serait un mauvais marché.
 * Trois verrous, du plus fort au plus faible :
 *
 *   1. `surfacesRequises` est FERMÉE PAR DÉFAUT : seule une liste explicite de
 *      chemins publics obtient le régime allégé ; toute autre URL — /ide,
 *      /chat, /projects, /admin, une route inconnue — charge les DEUX tranches
 *      avant l'hydratation. Une erreur de classement coûte du poids sur une
 *      page, jamais un libellé manquant.
 *   2. Sur un chemin public, la tranche `app` est préchargée dès que le
 *      navigateur est au repos : une navigation client vers l'IDE la trouve
 *      déjà dans le registre.
 *   3. Si malgré tout une clé manque, `runtime.ts` déclenche le chargement de
 *      la tranche absente au lieu de figer « Unavailable » (chargeur de
 *      secours, câblé par `catalogues-client.ts`).
 *
 * LA CLASSIFICATION N'EST PAS RECOPIÉE À LA MAIN. `surfaces.spec.ts` la
 * recalcule depuis les sources — fermeture d'imports des racines publiques,
 * citations littérales hors commentaires, plus la règle qui a manqué deux fois
 * pendant la mise au point : un fichier de catalogue importé par un module
 * public rend publics TOUS ses préfixes, parce que les clés construites par
 * `t(\`\${prefix}.title\`)` n'ont de littéral nulle part ailleurs.
 */

export const SURFACES = ['public', 'app'] as const;

export type Surface = (typeof SURFACES)[number];

/**
 * Les préfixes de clé (le segment avant le premier point) qu'un document
 * public doit avoir sous la main. Établi par `surfaces.spec.ts`, qui rougit
 * si le code diverge de cette liste — dans les deux sens.
 */
export const PREFIXES_PUBLICS: readonly string[] = [
  'actionRunner',
  'auth',
  'branches',
  'chatAlert',
  'chatHistory',
  'clientAst',
  'clientErrors',
  'clientRuntime',
  'clientServices',
  'clientStores',
  'commandPalette',
  'common',
  'dashboard',
  'enterpriseSso',
  'errors',
  'impersonationBanner',
  'legacyMarketing',
  'loadingOverlay',
  'locale',
  'marketingBlog',
  'marketingBrand',
  'marketingLanding',
  'marketingLandingProjects',
  'marketingLandingTemplates',
  'marketingLandingVideo',
  'marketingLandingWorkflow',
  'marketingPricing',
  'marketingSolutions',
  'mentions',
  'panelBoundary',
  'patchReview',
  'persistence',
  'plan',
  'presence',
  'productTour',
  'projectCardMenu',
  'projectCommands',
  'projects',
  'publicGallery',
  'publicRouteSeo',
  'publicTemplateTag',
  'recentProjects',
  'remainingRoutes',
  'root',
  'share',
  'shareButton',
  'slashCommands',
  'starterTemplates',
  'surfaceDynamic',
  'userArea',
  'workbenchRuntime',
  'workspaceTemplates',
];

const ENSEMBLE_PUBLIC = new Set(PREFIXES_PUBLICS);

export function prefixeDeLaCle(cle: string): string {
  const point = cle.indexOf('.');

  return point === -1 ? cle : cle.slice(0, point);
}

export function surfaceDeLaCle(cle: string): Surface {
  return ENSEMBLE_PUBLIC.has(prefixeDeLaCle(cle)) ? 'public' : 'app';
}

/** Découpe un catalogue plat en une tranche par surface. */
export function repartirParSurface(catalogue: Record<string, string>): Record<Surface, Record<string, string>> {
  const tranches = { public: {}, app: {} } as Record<Surface, Record<string, string>>;

  for (const [cle, valeur] of Object.entries(catalogue)) {
    tranches[surfaceDeLaCle(cle)][cle] = valeur;
  }

  return tranches;
}

/**
 * Les premiers segments d'URL qui se contentent de la tranche `public`.
 * Tout le reste — y compris une route inconnue — charge les deux (verrou 1).
 */
export const SEGMENTS_PUBLICS: readonly string[] = [
  'about',
  'auth',
  'blog',
  'careers',
  'changelog',
  'community',
  'contact',
  'contact-sales',
  'docs',
  'enterprise',
  'features',
  'gallery',
  'help',
  'help-center',
  'languages',
  'legal',
  'login',
  'marketing',
  'pricing',
  'privacy',
  'register',
  'signup',
  'solutions',
  'status',
  'terms',
];

const SEGMENTS = new Set(SEGMENTS_PUBLICS);

export function estCheminPublic(pathname: string): boolean {
  const segment = pathname.replace(/^\/+/, '').split(/[/?#]/)[0];

  return segment === '' || SEGMENTS.has(segment);
}

export function surfacesRequises(pathname: string): Surface[] {
  return estCheminPublic(pathname) ? ['public'] : ['public', 'app'];
}
