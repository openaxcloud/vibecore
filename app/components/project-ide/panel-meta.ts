/*
 * UNIF-05 (lot 3 de docs/UX_UNIFORMIZATION_AUDIT.md, audit T1–T3) — registre
 * d'icônes UNIQUE des panneaux IDE.
 *
 * Avant : trois tables divergentes dessinaient le MÊME outil avec des icônes
 * différentes selon la surface — `panelIcon()` (onglets desktop), la liste de
 * la palette « + », et `ECODE_MOBILE_TAB_META_BASE` (tuiles mobile). Cas
 * vécus : Packages cube/paquet, Object Storage disques/paquet, git et
 * workflows sur la même branche, secrets et locks sur le même cadenas.
 *
 * Désormais les trois surfaces (plus le rail gauche) consomment CE registre.
 *
 * Choix d'icônes tranchés ici (défauts sensés, à valider par Avi en live) :
 * - packages        → `i-ph:package` (le paquet ; `cube` abandonné)
 * - object-storage  → `i-ph:hard-drives` (des disques, pas un paquet)
 * - workflows       → `i-ph:flow-arrow` (git garde `git-branch` pour lui seul)
 * - secrets         → `i-ph:key` (locks garde `lock` pour lui seul)
 * - preview/webview → `i-ph:monitor` (aligné sur la barre mobile de référence ;
 *   le desktop affichait `browser`)
 * - files           → `i-ph:files` (la tuile mobile affichait `folder-open`)
 */

export const GENERIC_PANEL_ICON = 'i-ph:squares-four';

export const PANEL_ICONS: Record<string, string> = {
  studio: 'i-ph:robot',
  editor: 'i-ph:code',
  preview: 'i-ph:monitor',
  webview: 'i-ph:monitor',
  console: 'i-ph:terminal-window',
  network: 'i-ph:activity',
  database: 'i-ph:database',
  'object-storage': 'i-ph:hard-drives',
  packages: 'i-ph:package',
  skills: 'i-ph:sparkle',
  ports: 'i-ph:plugs',
  monitoring: 'i-ph:chart-line',
  extensions: 'i-ph:puzzle-piece',
  integrations: 'i-ph:plugs-connected',
  workflows: 'i-ph:flow-arrow',
  debugger: 'i-ph:bug',
  files: 'i-ph:files',
  search: 'i-ph:magnifying-glass',
  locks: 'i-ph:lock',
  overview: 'i-ph:gauge',
  problems: 'i-ph:warning-circle',
  deployments: 'i-ph:rocket-launch',
  security: 'i-ph:shield-check',
  env: 'i-ph:brackets-curly',
  secrets: 'i-ph:key',
  git: 'i-ph:git-branch',
  activity: 'i-ph:activity',
  terminal: 'i-ph:terminal-window',
  logs: 'i-ph:list-magnifying-glass',
  collaborators: 'i-ph:users',
  domains: 'i-ph:globe',
  snapshots: 'i-ph:stack',
  settings: 'i-ph:gear',
};

/**
 * Icône d'un panneau, avec repli générique pour un id inconnu (jamais pour un
 * panneau déclaré — verrouillé par panel-meta.spec.ts et
 * panel-uniformization.spec.ts).
 */
export function panelIcon(panel: string): string {
  return PANEL_ICONS[panel] ?? GENERIC_PANEL_ICON;
}
