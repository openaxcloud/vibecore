/*
 * BUG-IDE-PANEL-REPROVISION-RELOAD-001 — « ouvrir certains panneaux recharge
 * tout l'IDE » (mobile/tablette).
 *
 * Cause mesurée dans BaseChat : la coque mobile rendait le Workbench (éditeur,
 * Webview, Shell, fichiers, recherche) dans une chaîne ternaire où les panneaux
 * `chat` (Agent), `deploy` (panneaux de gestion : base de données, logs,
 * déploiements…) et `locks` occupaient LA MÊME position d'enfant React. Chaque
 * passage Agent → Webview (ou gestion → Shell, etc.) DÉMONTAIT puis REMONTAIT
 * LazyWorkbench en entier : fallback Suspense plein écran (« Loading the
 * workspace panels… »), état de l'éditeur/du terminal perdu, et la Preview
 * fraîchement remontée relançait sa boucle de démarrage — sur un pod froid cela
 * déclenchait un re-provisionnement avec l'overlay « Webview startup /
 * Connecting to workspace » sur toute la zone de contenu. Vécu utilisateur :
 * « ouvrir un panneau recharge tout l'IDE ».
 *
 * Correctif : une fois le Workbench mobile ouvert une première fois, il reste
 * MONTÉ pour toute la session de page (keep-alive) et il est seulement masqué
 * (visibility) quand un panneau non-workbench est actif. Ouvrir un panneau
 * redevient un simple changement d'état client ; le réveil éventuel du pod ne
 * concerne que le panneau qui en dépend.
 */

/** Panneaux mobiles rendus PAR le Workbench (LazyWorkbench). */
export const MOBILE_WORKBENCH_PANELS = ['files', 'editor', 'search', 'terminal', 'preview'] as const;

export type MobileWorkbenchPanelId = (typeof MOBILE_WORKBENCH_PANELS)[number];

export function isMobileWorkbenchPanel(panel: string): panel is MobileWorkbenchPanelId {
  return (MOBILE_WORKBENCH_PANELS as readonly string[]).includes(panel);
}

/**
 * Whether the Workbench should be MOUNTED right now.
 *
 * - Desktop / non-mobile layouts: always mounted (unchanged behaviour).
 * - Mobile: mounted when a workbench panel is active, and KEPT mounted (hidden
 *   via CSS, see `.bolt-workbench-mobile-keepalive[data-active='false']`) once
 *   it has been opened during this page session, so switching back from
 *   Agent/management panels never rebuilds the whole IDE surface nor re-kicks
 *   the preview/pod boot sequence.
 * - Mobile before the first workbench panel: not mounted, so the initial
 *   mobile load stays exactly as light as before this fix.
 */
export function shouldMountMobileWorkbench(input: {
  useMobileIde: boolean;
  mobilePanel: string;
  workbenchKeepAlive: boolean;
}): boolean {
  if (!input.useMobileIde) {
    return true;
  }

  return isMobileWorkbenchPanel(input.mobilePanel) || input.workbenchKeepAlive;
}

/**
 * The panel the (possibly hidden) Workbench should display. While hidden it
 * stays on the LAST workbench panel instead of snapping back to `editor`, so
 * nothing re-renders behind the scenes and the user finds the exact same panel
 * on return.
 */
export function resolveMobileWorkbenchPanel(input: {
  mobilePanel: string;
  lastWorkbenchPanel: MobileWorkbenchPanelId | undefined;
}): MobileWorkbenchPanelId {
  if (isMobileWorkbenchPanel(input.mobilePanel)) {
    return input.mobilePanel;
  }

  return input.lastWorkbenchPanel ?? 'editor';
}
