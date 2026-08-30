/**
 * Registre canonique des panneaux de l'IDE — SOURCE DE VÉRITÉ UNIQUE.
 *
 * BUG-IDE-PANEL-RESOLUTION-001. Avant ce module, trois vérités coexistaient :
 *
 *  1. `IDE_URL_PANELS` (liste blanche d'URL) ignorait `agent`/`chat`, si bien
 *     que `?panel=agent` était jeté EN SILENCE ;
 *  2. le contenu mobile retombait en dur sur `'deployments'` pour toute clé non
 *     reconnue — 25 des ~50 clés d'onglets mobiles atterrissaient là, dont
 *     `agent`, l'un des trois onglets mobiles par défaut ;
 *  3. l'en-tête mobile venait de `activeMobileOpenTabId` (état d'onglet, monté
 *     tardivement) alors que le contenu venait de l'URL — d'où l'en-tête
 *     « Agent » au-dessus du contenu « Déploiements », et, à froid,
 *     `?panel=studio` → Vue d'ensemble ou `?panel=debugger` → Git.
 *
 * Règle tenue ici : une clé d'URL est soit canonique, soit un alias connu vers
 * une clé canonique, soit explicitement inconnue. Il n'existe aucun repli muet.
 */

export const IDE_MANAGEMENT_PANELS = [
  'overview',
  'studio',
  'problems',
  'database',
  'object-storage',
  'packages',
  'skills',
  'monitoring',
  'ports',
  'extensions',
  'integrations',
  'workflows',
  'debugger',
  'deployments',
  'security',
  'env',
  'secrets',
  'git',
  'activity',
  'terminal',
  'logs',
  'collaborators',
  'domains',
  'snapshots',
  'settings',
] as const;

export const IDE_RIGHT_PANELS = ['files'] as const;

export const IDE_WORKSPACE_PANELS = [
  'editor',
  'preview',
  'files',
  'search',
  'locks',
  ...IDE_MANAGEMENT_PANELS,
] as const;

/** Le panneau Agent n'est pas un onglet d'espace de travail : c'est le dock de gauche (desktop) / l'onglet Agent (mobile). */
export const IDE_AGENT_PANEL = 'agent';

/**
 * Tout ce qui est réellement affichable ET adressable par `?panel=`.
 * `files` n'est listé qu'une fois (il est à la fois panneau de droite et panneau d'espace de travail).
 */
export const IDE_ADDRESSABLE_PANELS = [IDE_AGENT_PANEL, ...IDE_WORKSPACE_PANELS] as const;

export type IdeManagementPanel = (typeof IDE_MANAGEMENT_PANELS)[number];
export type IdeRightPanel = (typeof IDE_RIGHT_PANELS)[number];
export type IdeWorkspacePanel = (typeof IDE_WORKSPACE_PANELS)[number];
export type IdeAddressablePanel = (typeof IDE_ADDRESSABLE_PANELS)[number];

/**
 * Alias historiques : noms d'onglets mobiles, libellés Replit et anciennes URLs
 * déjà partagées. Ils DOIVENT résoudre vers une clé canonique — sinon ils
 * retombaient sur le repli muet `'deployments'`.
 */
export const IDE_PANEL_ALIASES: Readonly<Record<string, IdeAddressablePanel>> = {
  chat: 'agent',
  actions: 'agent',
  assistant: 'agent',
  deploy: 'deployments',
  publishing: 'deployments',
  debug: 'debugger',
  developer: 'debugger',
  multiplayer: 'collaborators',
  collaboration: 'collaborators',
  collaborate: 'collaborators',
  checkpoints: 'snapshots',
  'kv-store': 'database',
  storage: 'object-storage',
  'app-storage': 'object-storage',
  console: 'terminal',
  shell: 'terminal',
  history: 'activity',
  auth: 'settings',

  // `web` était déclaré dans le méta d'onglets mobiles sans jamais être dispatché : c'est la Webview.
  web: 'preview',
};

/**
 * Clés d'onglets mobiles qui ne sont PAS des panneaux adressables : elles
 * ouvrent une feuille d'outils, pas une surface. Listées explicitement pour que
 * le test de couverture distingue « volontairement non adressable » de « oubli ».
 */
export const IDE_NON_ADDRESSABLE_TAB_KEYS = ['tools'] as const;

/** Surfaces de l'IDE mobile — une clé canonique en désigne exactement une. */
export type IdeMobileSurface = 'chat' | 'files' | 'editor' | 'search' | 'locks' | 'terminal' | 'preview' | 'deploy';

export type IdePanelResolution =
  | { status: 'empty' }
  | { status: 'canonical'; requested: string; panel: IdeAddressablePanel }
  | { status: 'alias'; requested: string; panel: IdeAddressablePanel }
  | { status: 'unknown'; requested: string };

export function isIdeManagementPanel(panel: string): panel is IdeManagementPanel {
  return (IDE_MANAGEMENT_PANELS as readonly string[]).includes(panel);
}

export function isIdeWorkspacePanel(panel: string): panel is IdeWorkspacePanel {
  return (IDE_WORKSPACE_PANELS as readonly string[]).includes(panel);
}

export function isIdeRightPanel(panel: string): panel is IdeRightPanel {
  return (IDE_RIGHT_PANELS as readonly string[]).includes(panel);
}

export function isIdeAddressablePanel(panel: string): panel is IdeAddressablePanel {
  return (IDE_ADDRESSABLE_PANELS as readonly string[]).includes(panel);
}

/**
 * Résout une valeur brute de `?panel=`. Ne devine JAMAIS : une clé non reconnue
 * ressort en `unknown` pour que l'appelant la traite explicitement (URL
 * normalisée + message), au lieu d'afficher un panneau que personne n'a demandé.
 */
export function resolveIdePanelKey(raw: string | null | undefined): IdePanelResolution {
  const requested = typeof raw === 'string' ? raw.trim().toLowerCase() : '';

  if (!requested) {
    return { status: 'empty' };
  }

  if (isIdeAddressablePanel(requested)) {
    return { status: 'canonical', requested, panel: requested };
  }

  const aliased = IDE_PANEL_ALIASES[requested];

  if (aliased) {
    return { status: 'alias', requested, panel: aliased };
  }

  return { status: 'unknown', requested };
}

/**
 * Cible complète d'un panneau canonique : la surface mobile qui l'héberge,
 * l'onglet mobile correspondant et — pour la surface `deploy` — le panneau de
 * service à rendre. En-tête et contenu lisent CE MÊME objet : ils ne peuvent
 * plus diverger, quel que soit l'ordre de montage des onglets.
 */
export function ideMobileTarget(panel: IdeAddressablePanel): {
  panel: IdeAddressablePanel;
  surface: IdeMobileSurface;
  tabId: string;
  servicePanel?: IdeManagementPanel;
} {
  if (panel === IDE_AGENT_PANEL) {
    return { panel, surface: 'chat', tabId: 'agent' };
  }

  if (panel === 'files' || panel === 'editor' || panel === 'search' || panel === 'locks' || panel === 'preview') {
    return { panel, surface: panel, tabId: panel };
  }

  if (panel === 'terminal') {
    return { panel, surface: 'terminal', tabId: 'terminal' };
  }

  return { panel, surface: 'deploy', tabId: panel, servicePanel: panel };
}
