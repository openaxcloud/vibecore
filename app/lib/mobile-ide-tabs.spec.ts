import { describe, expect, it } from 'vitest';
import {
  ECODE_MOBILE_MORE_ITEMS,
  ECODE_MOBILE_TOOLS,
  MOBILE_TOOL_TO_MANAGEMENT_PANEL,
  MOBILE_TOOLS_HORS_ROUTAGE,
  MOBILE_TOOL_ACTIONS,
} from './mobile-ide-tabs';

/**
 * Management panels that must be reachable from the mobile/tablet IDE. `domains`
 * is intentionally excluded — it is consolidated into the Deploy tab and has no
 * standalone mobile tile.
 */
const MOBILE_MANAGEMENT_PANELS = [
  'overview',

  /*
   * BUG-IDE-013 (volet MOBILE). `problems` manquait à CETTE liste : la suite
   * restait donc verte alors que le panneau était inatteignable à 390 px. Son
   * unique point d'entrée était la pastille de la barre d'état, masquée par
   * `.bolt-project-statusbar-mobile { display: none !important }` sous 1200 px,
   * et il n'existait ni tuile Outils ni entrée Panneaux pour le remplacer.
   * Un panneau non listé ici n'est gardé par rien — c'est le trou qu'il ferme.
   */
  'problems',
  'database',
  'object-storage',
  'packages',
  'skills',
  'studio',
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
  'logs',
  'collaborators',
  'snapshots',
  'settings',
] as const;

const toolIds = new Set(ECODE_MOBILE_TOOLS.map((tool) => tool.id));
const moreIds = new Set(ECODE_MOBILE_MORE_ITEMS);

describe('mobile IDE tab configuration', () => {
  it('opens every management panel through the tool→panel map (regression: Skills/Ports no-op)', () => {
    for (const panel of MOBILE_MANAGEMENT_PANELS) {
      expect(MOBILE_TOOL_TO_MANAGEMENT_PANEL[panel], `tool "${panel}" must resolve to a management panel`).toBe(panel);
    }
  });

  it('maps Skills and Ports specifically — these silently no-opped on mobile', () => {
    expect(MOBILE_TOOL_TO_MANAGEMENT_PANEL.skills).toBe('skills');
    expect(MOBILE_TOOL_TO_MANAGEMENT_PANEL.ports).toBe('ports');
  });

  it('surfaces every management panel in BOTH mobile menus (Tools sheet + More/Panels)', () => {
    for (const panel of MOBILE_MANAGEMENT_PANELS) {
      expect(toolIds.has(panel), `"${panel}" must be in the Tools sheet`).toBe(true);
      expect(moreIds.has(panel), `"${panel}" must be in the More/Panels menu`).toBe(true);
    }
  });

  it('keeps Skills, Ports and Object Storage in both menus (the new tabs)', () => {
    for (const panel of ['skills', 'ports', 'object-storage'] as const) {
      expect(toolIds.has(panel)).toBe(true);
      expect(moreIds.has(panel)).toBe(true);
    }
  });

  it('every More/Panels item that names a management panel can be opened', () => {
    /*
     * Listes consommees depuis le module au lieu d'etre recopiees ici : la copie
     * locale avait derive — `share` y manquait, si bien qu'ajouter `share` au
     * menu « More » faisait rougir ce test a tort. Les ACTIONS viennent de la
     * donnee elle-meme (`kind`), les panneaux a bascule propre de la liste.
     */
    const nonPanelActions = new Set<string>([...MOBILE_TOOL_ACTIONS, ...MOBILE_TOOLS_HORS_ROUTAGE]);

    for (const id of ECODE_MOBILE_MORE_ITEMS) {
      if (nonPanelActions.has(id)) {
        continue;
      }

      expect(MOBILE_TOOL_TO_MANAGEMENT_PANEL[id], `More item "${id}" must resolve to a panel`).toBeTruthy();
    }
  });

  it('has no duplicate ids within a menu', () => {
    expect(toolIds.size).toBe(ECODE_MOBILE_TOOLS.length);
    expect(moreIds.size).toBe(ECODE_MOBILE_MORE_ITEMS.length);
  });
});
