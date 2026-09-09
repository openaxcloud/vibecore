import { SHELL_TERMINAL_LABEL } from './mobile-ide-tabs';
import { PANEL_ICONS } from '~/components/project-ide/panel-meta';

/*
 * LES LIBELLES DES PANNEAUX, DEFINIS UNE SEULE FOIS.
 *
 * Ce bloc vivait DANS `BaseChat.tsx`, donc hors de la source unique — et c'est
 * une cause directe des divergences : les libelles n'etaient consommables que
 * par le composant qui les portait, si bien que chaque autre surface se
 * debrouillait avec une conversion locale.
 *
 * Sorti ici, il devient consommable par toutes les surfaces ET par les tests.
 */

/*
 * UNIF-05 : les icônes viennent du registre unique PANEL_ICONS (panel-meta) —
 * la même icône pour le même outil sur les tuiles mobile, les onglets desktop,
 * le rail et la palette « + ». Deux exceptions volontaires, en littéral :
 * - `agent` (marque, rendue à part) ;
 * - `terminal`/`console`/`shell` : l'onglet Terminal mobile est GELÉ sur la
 *   référence d'Avi (IMG_9149) — son glyphe ne doit jamais dériver via le
 *   registre (même si la valeur actuelle y est identique).
 */
export const ECODE_MOBILE_TAB_META_BASE: Record<string, { id: string; name: string; icon: string }> = {
  preview: { id: 'preview', name: 'Webview', icon: PANEL_ICONS.preview },
  agent: { id: 'agent', name: 'Agent', icon: 'agent' },

  /*
   * « Publish », pas « Deployments » : demande explicite d'Avi (« Deploy ou
   * Publish au lieu de deployments »). Le catalogue i18n portait déjà
   * `Publish`/`Publier` pendant que ce méta disait `Deployments` — une
   * divergence À L'INTÉRIEUR du lot qui prétend unifier les libellés, donc le
   * pire endroit où la laisser.
   */
  deployments: { id: 'deployments', name: 'Publish', icon: PANEL_ICONS.deployments },
  files: { id: 'files', name: 'Library', icon: PANEL_ICONS.files },
  editor: { id: 'editor', name: 'Editor', icon: PANEL_ICONS.editor },
  search: { id: 'search', name: 'Search', icon: PANEL_ICONS.search },
  locks: { id: 'locks', name: 'Locks', icon: PANEL_ICONS.locks },
  terminal: { id: 'terminal', name: SHELL_TERMINAL_LABEL, icon: 'i-ph:terminal-window' },
  database: { id: 'database', name: 'Database', icon: PANEL_ICONS.database },
  problems: { id: 'problems', name: 'Problems', icon: PANEL_ICONS.problems },
  debugger: { id: 'debugger', name: 'Debugger', icon: PANEL_ICONS.debugger },
  git: { id: 'git', name: 'Git', icon: PANEL_ICONS.git },
  activity: { id: 'activity', name: 'Activity', icon: PANEL_ICONS.activity },
  integrations: { id: 'integrations', name: 'Integrations', icon: PANEL_ICONS.integrations },
  collaborators: { id: 'collaborators', name: 'Collaborators', icon: PANEL_ICONS.collaborators },
  packages: { id: 'packages', name: 'Packages', icon: PANEL_ICONS.packages },
  skills: { id: 'skills', name: 'Skills', icon: PANEL_ICONS.skills },
  secrets: { id: 'secrets', name: 'Secrets', icon: PANEL_ICONS.secrets },
  settings: { id: 'settings', name: 'Settings', icon: PANEL_ICONS.settings },
  workflows: { id: 'workflows', name: 'Workflows', icon: PANEL_ICONS.workflows },
  snapshots: { id: 'snapshots', name: 'Snapshots', icon: PANEL_ICONS.snapshots },
  extensions: { id: 'extensions', name: 'Extensions', icon: PANEL_ICONS.extensions },
  security: { id: 'security', name: 'Security', icon: PANEL_ICONS.security },
  'object-storage': { id: 'object-storage', name: 'Object Storage', icon: PANEL_ICONS['object-storage'] },
  env: { id: 'env', name: 'Environment variables', icon: PANEL_ICONS.env },
  logs: { id: 'logs', name: 'Logs', icon: PANEL_ICONS.logs },
  monitoring: { id: 'monitoring', name: 'Monitoring', icon: PANEL_ICONS.monitoring },
  ports: { id: 'ports', name: 'Ports', icon: PANEL_ICONS.ports },
  domains: { id: 'domains', name: 'Domains', icon: PANEL_ICONS.domains },
  overview: { id: 'overview', name: 'Overview', icon: PANEL_ICONS.overview },
  studio: { id: 'studio', name: 'Agent Studio', icon: PANEL_ICONS.studio },

  /*
   * LES DEUX ACTIONS. Elles ne sont PAS des panneaux — d'ou l'icone en litteral,
   * `PANEL_ICONS` ne les porte pas et ne doit pas les porter.
   *
   * Elles ont besoin d'un libelle pour la meme raison que les panneaux : la
   * feuille d'outils lit le catalogue i18n, mais l'en-tete mobile, le selecteur
   * d'onglets et l'acces rapide lisent CETTE table. `commands` etait rendu,
   * fonctionnait, et n'avait pas de libelle ici : la seule surface qui le
   * nommait le nommait « commands ».
   */
  commands: { id: 'commands', name: 'Commands', icon: 'i-ph:command' },
  share: { id: 'share', name: 'Share', icon: 'i-ph:share-network' },
};

/*
 * LES ALIAS, RASSEMBLES ICI ET NULLE PART AILLEURS.
 *
 * Ces cles etaient des ENTREES de `ECODE_MOBILE_TAB_META_BASE` : des libelles
 * differents pour un meme panneau, melanges aux panneaux reels. Rien ne
 * distinguait `deploy` (alias) de `deployments` (panneau), et toute surface qui
 * parcourait la table croyait voir 47 entrees la ou il y a 32 panneaux.
 *
 * Les separer rend la liste VRAIE et la resolution EXPLICITE : un seul endroit
 * traduit, au lieu de conversions dispersees au point d'usage.
 */
export const MOBILE_TOOL_ALIASES: Record<string, string> = {
  actions: 'agent',
  'app-storage': 'object-storage',
  assistant: 'agent',
  auth: 'settings',
  checkpoints: 'snapshots',
  collaborate: 'collaborators',
  collaboration: 'collaborators',
  console: 'terminal',
  debug: 'debugger',
  deploy: 'deployments',
  developer: 'debugger',
  history: 'activity',
  'kv-store': 'database',
  multiplayer: 'collaborators',
  publishing: 'deployments',
  shell: 'terminal',
  storage: 'object-storage',
  tools: 'agent',
  web: 'preview',
};

/** Resout un alias vers son panneau canonique ; identite pour un panneau reel. */
export function outilCanonique(id: string): string {
  return MOBILE_TOOL_ALIASES[id] ?? id;
}

/** Metadonnees d'un outil, alias resolus. LE seul chemin de lecture. */
export function metaDeLOutil(id: string) {
  return ECODE_MOBILE_TAB_META_BASE[outilCanonique(id)];
}
