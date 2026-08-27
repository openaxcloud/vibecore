/**
 * @vitest-environment jsdom
 */

/*
 * UNIF lot 7 (docs/UX_UNIFORMIZATION_AUDIT.md) — Object Storage + toolbars de
 * BaseChat sur les primitives partagées :
 *
 * 1. Toolbar / actions / onglets Object Storage → PanelButton, PanelInput,
 *    PanelToolTabs (Refresh, Upload files/folder, Create folder, Ensure
 *    bucket, Up, Download/Move/Delete, bascule Objects | Settings).
 * 2. Lignes fichier : icône Phosphor `i-ph:file` + taille en `ui/Badge` ;
 *    croix « × » typographique du chip dossier → icône `i-ph:x`.
 * 3. Inputs des toolbars (prefix, filtres Packages/Extensions/Env) →
 *    PanelInput sm.
 * 4. Boutons ad hoc restants des toolbars (Agent Studio Refresh, Monitoring
 *    Refresh metrics, Env « New variable ») → PanelButton ; sélecteurs
 *    à état (fenêtre 15m/1h/24h, domaines Extensions) → FilterChip commun.
 * 5. Styles SCSS nus retirés : `.bolt-project-panel-toolbar input/button`,
 *    `.bolt-project-extension-categories button` (desktop) — le mobile garde
 *    ses planchers tactiles via les mêmes classes conteneur.
 *
 * BaseChat.tsx (23k lignes) n'est pas rendable en jsdom : comme pour les lots
 * précédents, les points BaseChat/SCSS sont vérifiés au niveau source, les
 * primitives au niveau DOM (PanelPrimitives.spec.tsx — <PanelToolTabs />).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const read = (...segments: string[]) => readFileSync(join(__dirname, ...segments), 'utf8');

const baseChatSource = read('..', 'chat', 'BaseChat.tsx');
const indexScssSource = read('..', '..', 'styles', 'index.scss');
const panelPrimitivesSource = read('.', 'PanelPrimitives.tsx');

const countOccurrences = (haystack: string, needle: string) => haystack.split(needle).length - 1;

const sliceBetween = (source: string, startMarker: string, endMarker: string) => {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  expect(start, `marker introuvable: ${startMarker}`).toBeGreaterThan(-1);
  expect(end, `marker introuvable: ${endMarker}`).toBeGreaterThan(start);

  return source.slice(start, end);
};

describe('UNIF lot 7 — point 1 : toolbar Object Storage sur PanelButton/PanelInput', () => {
  const toolbar = sliceBetween(
    baseChatSource,
    "t('chat.copy.prefixFolder_db73cfed')",
    "t('chat.copy.tipDragDropFilesAnywhereIn_330e97ac')",
  );

  it('les 5 actions (Refresh, Upload files, Upload folder, Create folder, Ensure bucket) sont des PanelButton sm', () => {
    expect(countOccurrences(toolbar, '<PanelButton')).toBe(5);
    expect(countOccurrences(toolbar, 'size="sm"')).toBeGreaterThanOrEqual(5);

    // Plus aucun bouton nu stylé par la feuille SCSS dans la toolbar.
    expect(toolbar).not.toContain('<button');
  });

  it('le champ Prefix passe au PanelInput sm (plus d’input nu)', () => {
    const prefixField = sliceBetween(toolbar, "t('chat.copy.prefixFolder_db73cfed')", '</label>');
    expect(prefixField).toContain('<PanelInput');
    expect(prefixField).not.toContain('<input');
  });
});

describe('UNIF lot 7 — point 1 : actions par objet et fil d’Ariane', () => {
  it('Download / Move / Delete sont 3 PanelButton (outline, outline, danger)', () => {
    const actions = sliceBetween(baseChatSource, 'bolt-project-object-actions', 'baseChatAst.storage.objectDeleted');
    expect(countOccurrences(actions, '<PanelButton')).toBe(3);
    expect(countOccurrences(actions, 'variant="outline"')).toBe(2);
    expect(countOccurrences(actions, 'variant="danger"')).toBe(1);
    expect(actions).not.toContain('<button');
  });

  it('le bouton « Up » n’est plus un lien souligné ad hoc mais un PanelButton outline', () => {
    const upRow = sliceBetween(baseChatSource, "t('chat.copy.up_12493f7d')", '</PanelButton>');
    expect(baseChatSource).toContain('i-ph:arrow-elbow-left-up');
    expect(upRow).not.toContain('underline');
  });

  it('la bascule Objects | Settings passe par la primitive PanelToolTabs', () => {
    expect(panelPrimitivesSource).toContain('export function PanelToolTabs');

    /*
     * Les barres d'onglets d'outil partagent la primitive : Storage, Security,
     * Deployments (lot 7) + les scopes Env (UNIF-14, lot 8)…
     */
    expect(countOccurrences(baseChatSource, '<PanelToolTabs')).toBe(4);

    // …et plus personne ne re-mappe le markup à la main dans BaseChat.
    expect(baseChatSource).not.toContain('className="bolt-project-tool-tabs"');
  });
});

describe('UNIF lot 7 — point 2 : chips/lignes Object Storage', () => {
  it('la ligne fichier porte l’icône Phosphor i-ph:file et la taille en Badge subtle', () => {
    const row = sliceBetween(baseChatSource, 'visibleObjects.map', 'bolt-project-object-actions');
    expect(row).toContain('i-ph:file');
    expect(row).toContain('<Badge variant="subtle" size="sm">');
    expect(row).toContain('formatObjectStorageSize');
  });

  it('la croix typographique « × » du chip dossier est remplacée par l’icône i-ph:x', () => {
    const folderChips = sliceBetween(baseChatSource, 'visibleFolders.map', 'visibleObjects.length');
    expect(folderChips).toContain('i-ph:x');
    expect(folderChips).not.toContain('×');
  });
});

describe('UNIF lot 7 — points 3/4 : toolbars restantes de BaseChat sur les primitives', () => {
  it('filtre Packages, recherche Extensions et recherche Env passent au PanelInput sm', () => {
    for (const placeholderKey of [
      'chat.copy.searchNameVersionManifestScope_c42b6712',
      'chat.copy.nameAuthorTagOrCapability_a6726d8f',
      'chat.copy.viteDatabaseApi_c73cb9ac',
    ]) {
      /*
       * Le placeholder vit dans les props de son champ : le « < » précédent
       * est l'ouverture de l'élément. Il doit être un <PanelInput, plus un
       * <input nu stylé par la feuille SCSS.
       */
      const placeholderAt = baseChatSource.indexOf(placeholderKey);
      expect(placeholderAt, `placeholder introuvable: ${placeholderKey}`).toBeGreaterThan(-1);

      const openingTag = baseChatSource.slice(baseChatSource.lastIndexOf('<', placeholderAt), placeholderAt);
      expect(openingTag.startsWith('<PanelInput'), `champ nu pour ${placeholderKey}: ${openingTag.slice(0, 40)}`).toBe(
        true,
      );
    }
  });

  it('Refresh (Agent Studio), Refresh metrics (Monitoring) et New variable (Env) sont des PanelButton', () => {
    const agentStudio = sliceBetween(baseChatSource, "t('chat.copy.agentStudioSupervisor_fc1ab50e')", '</PanelButton>');
    expect(agentStudio).toContain('<PanelButton');

    const monitoring = sliceBetween(baseChatSource, "t('chat.copy.refreshMetrics_d4cc03bc')", '</PanelButton>');
    expect(monitoring).not.toContain('<button');

    const envToolbar = sliceBetween(baseChatSource, "t('chat.copy.viteDatabaseApi_c73cb9ac')", '</PanelButton>');
    expect(envToolbar).toContain("t('chat.copy.newVariable_7adfa76b')");
    expect(envToolbar).not.toContain('<button');
  });

  it('le sélecteur de fenêtre 15m/1h/24h et les domaines Extensions passent au FilterChip commun', () => {
    const windowSelector = sliceBetween(baseChatSource, "(['15m', '1h', '24h'] as const)", '</PanelButton>');
    expect(windowSelector).toContain('<FilterChip');
    expect(windowSelector).not.toContain("className={windowSize === item ? 'selected'");

    const domains = sliceBetween(baseChatSource, "t('chat.copy.extensionDomains_abc98b01')", '</div>');
    expect(domains).toContain('<FilterChip');
    expect(domains).not.toContain('<button');
  });
});

describe('UNIF lot 7 — point 5 : styles SCSS nus retirés', () => {
  it('plus de gabarit bouton/input desktop sous .bolt-project-panel-toolbar (les primitives portent le style)', () => {
    expect(indexScssSource).not.toContain('.bolt-project-panel-toolbar input {');
    expect(indexScssSource).not.toContain('.bolt-project-panel-toolbar button {');
    expect(indexScssSource).not.toContain('.bolt-project-panel-toolbar button.selected');
    expect(indexScssSource).not.toContain('.bolt-project-panel-toolbar button:hover');

    // Le conteneur flex et le label gardent leur mise en page partagée.
    expect(indexScssSource).toContain('.bolt-project-panel-toolbar {');
    expect(indexScssSource).toContain('.bolt-project-panel-toolbar label {');
  });

  it('plus de pilule ad hoc .bolt-project-extension-categories button (FilterChip commun)', () => {
    /*
     * Ancrage en début de ligne : la règle mobile
     * `.bolt-responsive-ide-mobile … .bolt-project-extension-categories button`
     * (plancher tactile 40px) reste légitime et contient le même suffixe.
     */
    expect(indexScssSource).not.toMatch(/^\.bolt-project-extension-categories button \{/m);
    expect(indexScssSource).not.toContain('.bolt-project-extension-categories button.selected');

    // Le conteneur (wrap desktop + scroll mobile) reste.
    expect(indexScssSource).toContain('.bolt-project-extension-categories {');
  });

  it('les planchers tactiles mobiles restent en place (elles ciblent le conteneur, pas le gabarit)', () => {
    expect(indexScssSource).toContain('.bolt-responsive-ide-mobile .bolt-project-object-actions button');
    expect(indexScssSource).toContain('.bolt-project-panel-toolbar button,');
  });
});
