import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * UNIF-IDE lot 1 — gardes de non-régression SOURCE sur BaseChat.tsx.
 *
 * BaseChat.tsx est un module de 23k lignes dont les panneaux ne sont pas
 * exportés ; comme les autres specs « AST » du dossier (qa-i18n-counts), on
 * verrouille donc les invariants d'uniformisation au niveau du source :
 *
 * 1. Chaque panneau déclaré (IDE_WORKSPACE_PANELS = workspace + management)
 *    doit avoir une entrée dans le registre d'icônes `panelIcon` — sinon son
 *    onglet retombe sur l'icône générique `i-ph:squares-four` alors que le
 *    rail et la palette « + » dessinent la vraie icône (cas vécus : skills,
 *    ports).
 * 2. Les familles d'états vides ad hoc retirées (bolt-project-snapshots-empty,
 *    bolt-project-domain-empty) ne doivent pas réapparaître : l'état vide
 *    canonique est PanelEmptyState (ui/EmptyState).
 * 3. Les primitives PanelButton/PanelInput ne doivent pas être re-forkées en
 *    privé dans BaseChat : la source partagée est
 *    app/components/project-ide/PanelPrimitives.tsx.
 */

const baseChatSource = readFileSync(join(__dirname, 'BaseChat.tsx'), 'utf8');

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

function extractPanelIconKeys(): string[] {
  /*
   * UNIF-05 (lot 3) : le registre ne vit plus dans BaseChat — la source unique
   * est app/components/project-ide/panel-meta.ts (PANEL_ICONS), consommée par
   * onglets, rail, palette « + » et tuiles mobile.
   */
  const panelMetaCode = codeOnly(readFileSync(join(__dirname, '..', 'project-ide', 'panel-meta.ts'), 'utf8'));
  const match = panelMetaCode.match(/export const PANEL_ICONS: Record<string, string> = \{([\s\S]*?)\};/);

  if (!match) {
    throw new Error('Unable to locate the PANEL_ICONS registry in panel-meta.ts');
  }

  return [...match[1].matchAll(/(?:'([a-z0-9-]+)'|([a-zA-Z0-9]+)):\s*'i-ph:/g)].map((entry) => entry[1] ?? entry[2]);
}

describe('UNIF-IDE — registre d’icônes des panneaux', () => {
  it('couvre chaque panneau workspace + management déclaré (aucun repli i-ph:squares-four)', () => {
    const managementPanels = extractStringArray('IDE_MANAGEMENT_PANELS');
    const workspaceBase = ['editor', 'preview', 'files', 'search', 'locks'];
    const iconKeys = new Set(extractPanelIconKeys());

    expect(managementPanels.length).toBeGreaterThanOrEqual(20);

    const missing = [...workspaceBase, ...managementPanels].filter((panel) => !iconKeys.has(panel));

    expect(missing, `panels without a panelIcon entry: ${missing.join(', ')}`).toEqual([]);
  });

  it('garde notamment skills et ports (les deux trous historiques)', () => {
    const iconKeys = new Set(extractPanelIconKeys());
    expect(iconKeys.has('skills')).toBe(true);
    expect(iconKeys.has('ports')).toBe(true);
  });
});

describe('UNIF-IDE — états vides canoniques', () => {
  it('les familles ad hoc retirées ne réapparaissent pas dans BaseChat', () => {
    expect(baseChatCode).not.toContain('bolt-project-snapshots-empty');
    expect(baseChatCode).not.toContain('bolt-project-domain-empty');
  });

  it('BaseChat consomme PanelEmptyState depuis les primitives partagées', () => {
    expect(baseChatCode).toContain("from '~/components/project-ide/PanelPrimitives'");
    expect(baseChatCode).toContain('<PanelEmptyState');
  });
});

describe('UNIF-IDE — primitives partagées non re-forkées', () => {
  it('PanelButton / PanelInput ne sont plus définis en privé dans BaseChat', () => {
    expect(baseChatCode).not.toMatch(/function PanelButton\s*\(/);
    expect(baseChatCode).not.toMatch(/function PanelInput\s*\(/);
  });

  it('la primitive partagée respecte un type explicite (défaut submit préservé)', () => {
    const primitivesSource = codeOnly(
      readFileSync(join(__dirname, '..', 'project-ide', 'PanelPrimitives.tsx'), 'utf8'),
    );

    expect(primitivesSource).toContain("type={type ?? 'submit'}");

    // L'ancien bug : un `type="submit"` littéral placé après le spread des props.
    expect(primitivesSource).not.toMatch(/\{\.\.\.props\}\s*type="submit"/);
  });
});
