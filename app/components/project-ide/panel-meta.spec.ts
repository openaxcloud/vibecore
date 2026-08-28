/*
 * UNIF-05 (lot 3 de docs/UX_UNIFORMIZATION_AUDIT.md, audit T1–T3) — registre
 * d'icônes UNIQUE :
 *
 * T1  les trois surfaces (onglets desktop, rail, palette « + », tuiles mobile)
 *     consomment PANEL_ICONS — plus de tables divergentes ;
 * T2  la palette nomme l'éditeur comme l'onglet (panelTitle, plus de « Code ») ;
 * T3  plus de paires ambiguës : workflows ≠ git, secrets ≠ locks, et chaque
 *     panneau déclaré garde une icône DISTINCTE.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { GENERIC_PANEL_ICON, PANEL_ICONS, panelIcon } from './panel-meta';

const baseChatSource = readFileSync(join(__dirname, '..', 'chat', 'BaseChat.tsx'), 'utf8');

/** Neutralise commentaires (blocs et lignes) pour ne matcher que du code. */
const codeOnly = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' ')).replace(/\/\/.*$/gm, '');

const baseChatCode = codeOnly(baseChatSource);

function extractStringArray(name: string): string[] {
  const match = baseChatCode.match(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\] as const;`));

  if (!match) {
    throw new Error(`Unable to locate const ${name} in BaseChat.tsx`);
  }

  return [...match[1].matchAll(/'([a-z0-9-]+)'/g)].map((entry) => entry[1]);
}

function extractBlock(startMarker: string, endMarker: string): string {
  const start = baseChatCode.indexOf(startMarker);

  if (start === -1) {
    throw new Error(`Unable to locate "${startMarker}" in BaseChat.tsx`);
  }

  const end = baseChatCode.indexOf(endMarker, start);

  if (end === -1) {
    throw new Error(`Unable to locate "${endMarker}" after "${startMarker}" in BaseChat.tsx`);
  }

  return baseChatCode.slice(start, end);
}

const declaredPanels = [
  'editor',
  'preview',
  'files',
  'search',
  'locks',
  ...extractStringArray('IDE_MANAGEMENT_PANELS'),
];

describe('UNIF-05 — registre unique PANEL_ICONS', () => {
  it('couvre chaque panneau déclaré, sans repli générique', () => {
    const missing = declaredPanels.filter((panel) => panelIcon(panel) === GENERIC_PANEL_ICON);
    expect(missing, `panels falling back to the generic icon: ${missing.join(', ')}`).toEqual([]);
  });

  it('chaque panneau déclaré a une icône DISTINCTE (fin des paires git/workflows et secrets/locks)', () => {
    const byIcon = new Map<string, string[]>();

    for (const panel of declaredPanels) {
      const icon = panelIcon(panel);
      byIcon.set(icon, [...(byIcon.get(icon) ?? []), panel]);
    }

    const duplicates = [...byIcon.entries()].filter(([, panels]) => panels.length > 1);

    expect(
      duplicates,
      `shared icons: ${duplicates.map(([icon, panels]) => `${icon}=${panels.join('+')}`).join(' ; ')}`,
    ).toEqual([]);
  });

  it('tranche les divergences relevées par l’audit (T1/T3)', () => {
    expect(PANEL_ICONS.packages).toBe('i-ph:package');
    expect(PANEL_ICONS['object-storage']).toBe('i-ph:hard-drives');
    expect(PANEL_ICONS.workflows).toBe('i-ph:flow-arrow');
    expect(PANEL_ICONS.secrets).toBe('i-ph:key');
    expect(PANEL_ICONS.git).toBe('i-ph:git-branch');
    expect(PANEL_ICONS.locks).toBe('i-ph:lock');
  });
});

describe('UNIF-05 — les surfaces consomment le registre', () => {
  it('BaseChat ne définit plus son propre registre panelIcon', () => {
    expect(baseChatCode).not.toMatch(/function panelIcon\s*\(/);
    expect(baseChatCode).toContain("from '~/components/project-ide/panel-meta'");
  });

  /*
   * RPL-IDE-001.5 a déplacé la source : la palette ne porte plus ses entrées en
   * dur, elle les dérive de `project-editor-tool-catalog.ts`. L'intention
   * d'UNIF-05 est inchangée — une seule source pour les icônes de panneaux — et
   * c'est donc le catalogue qu'on vérifie désormais. La règle n'est pas
   * assouplie : le catalogue redéclarait 29 icônes littérales, dont 5
   * DIVERGEAIENT du registre (preview, object-storage, packages, workflows,
   * secrets), soit exactement la dérive que cette porte existe pour empêcher.
   */
  it('le catalogue des outils tire ses icônes de panelIcon() — aucun littéral i-ph', () => {
    const catalog = readFileSync(join(__dirname, '..', 'chat', 'project-editor-tool-catalog.ts'), 'utf8');

    expect(catalog).not.toContain("'i-ph:");
    expect((catalog.match(/icon: panelIcon\('/g) ?? []).length).toBeGreaterThanOrEqual(25);
  });

  it('la palette « + » ne réintroduit aucun littéral i-ph', () => {
    const tools = extractBlock('const tools: Array<[IdeWorkspacePanel | IdeRightPanel', '];');
    expect(tools).not.toContain("'i-ph:");
  });

  it('le rail gauche tire ses icônes de panelIcon() — aucun littéral i-ph', () => {
    const rail = extractBlock('const ideRailToolItems = [', '] as const;');
    expect(rail).not.toContain("icon: 'i-ph:");
    expect((rail.match(/icon: panelIcon\('/g) ?? []).length).toBe(9);
  });

  it('les tuiles mobile référencent PANEL_ICONS (exceptions : agent + Terminal gelé)', () => {
    const meta = extractBlock('const ECODE_MOBILE_TAB_META_BASE', '};');
    const literalIcons = [...meta.matchAll(/icon: '([^']+)'/g)].map((entry) => entry[1]);

    /*
     * Seules exceptions littérales : la marque `agent` et le glyphe du
     * Terminal mobile GELÉ (référence IMG_9149 d'Avi — il ne doit jamais
     * dériver via le registre), plus la tuile utilitaire `tools`.
     */
    expect(new Set(literalIcons)).toEqual(new Set(['agent', 'i-ph:terminal-window', 'i-ph:stack']));
    expect((meta.match(/PANEL_ICONS[.[]/g) ?? []).length).toBeGreaterThanOrEqual(35);
  });

  it('la palette nomme l’éditeur comme l’onglet (T2 — plus de « Code »)', () => {
    /*
     * L'appel passe désormais par `toolDisplayTitle`, qui délègue à
     * `panelTitle` — SAUF pour le terminal, dont le libellé de marque est gelé.
     * Ce qui compte n'a pas changé : aucune exception ne doit renvoyer « Code »
     * pour l'éditeur, sans quoi la palette et l'onglet nomment différemment le
     * même panneau.
     */
    expect(baseChatCode).toContain('toolDisplayTitle(tool.id, t)');
    expect(baseChatCode).not.toMatch(/tool === 'editor'[\s\S]{0,120}baseChatAst\.common\.code/);
    expect(baseChatCode).toMatch(/function toolDisplayTitle[\s\S]{0,600}return panelTitle\(tool, t\)/);
  });
});
