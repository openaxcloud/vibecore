import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * TSNOCHECK-DEBT-001 — la dette masquée est CHIFFRÉE, donc elle ne peut plus
 * grandir en silence.
 *
 * `// @ts-nocheck` en tête de `BaseChat.tsx` (~23 000 lignes) éteignait le
 * vérificateur sur tout le fichier. Mesuré le 2026-08-30 en retirant la
 * directive : **16 erreurs**, dont quatre `TS2304 Cannot find name 'language'`
 * qui faisaient jeter `ReferenceError` au panneau Intégrations — il ne
 * s'affichait pas du tout.
 *
 * Les trois plantages sont corrigés. Deuxième passe le 2026-08-31 : les cinq
 * erreurs restantes à risque d'exécution sont traitées aussi — 12 → **7**. Ce
 * test fige le compte : la dette peut DIMINUER, jamais augmenter.
 *
 * MÉTHODE — deux faux négatifs rencontrés en mesurant, et évités ici :
 *   * `tsc` direct manque de mémoire sur ce dépôt (SIGABRT) et rend « 0 erreur ».
 *     Le runner découpé du projet, `scripts/typecheck.mjs`, est le seul fiable.
 *   * mesurer AVEC la directive encore en place rend évidemment « 0 erreur ».
 *     Avant de conclure qu'une mesure est bonne, vérifier que l'outil a
 *     réellement tourné ET que rien ne le neutralise.
 */

const SOURCE = readFileSync(join(__dirname, 'BaseChat.tsx'), 'utf8');

/** Le code, sans les commentaires : la prose ci-dessous cite les motifs interdits. */
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('TSNOCHECK-DEBT-001 — les plantages masqués sont corrigés', () => {
  it('ne rappelle plus `consensusLaneLabel` sans son argument `t`', () => {
    /*
     * `consensusLaneLabel(t, roleId)` passé nu à `.map` recevait `(roleId, index)` :
     * `t` valait la chaîne du rôle, et `t(...)` jetait « t is not a function ».
     */
    expect(CODE).not.toMatch(/\.map\(consensusLaneLabel\)/);
    expect(CODE).toMatch(/consensusLaneLabel\(t,\s*roleId\)/);
  });

  it('ne compare plus une session de workspace à une chaîne', () => {
    /*
     * `runtimeWorkspaceStatus` est un objet. `=== 'STARTING'` était toujours faux,
     * et la barre de statut annonçait « Connected » pendant tout le démarrage.
     */
    expect(CODE).not.toMatch(/runtimeWorkspaceStatus === '(STARTING|PENDING)'/);
    expect(CODE).toMatch(/runtimeWorkspaceStatus\?\.status\?\.toLowerCase\(\)/);
  });

  it('déclare `language` dans le panneau Intégrations', () => {
    const start = CODE.indexOf('function ProjectIntegrationsPanel(');

    expect(start, 'ProjectIntegrationsPanel introuvable').toBeGreaterThan(-1);

    // La déclaration doit précéder les usages, qui sont ~200 lignes plus bas.
    const body = CODE.slice(start, start + 30_000);
    const declaration = body.indexOf('const language = resolvedBaseChatLanguage(i18n)');
    const firstUse = body.indexOf('formatBaseChatAstNumber(language');

    expect(declaration).toBeGreaterThan(-1);
    expect(firstUse).toBeGreaterThan(-1);
    expect(declaration).toBeLessThan(firstUse);
  });

  it('garde la directive ACCOMPAGNÉE de sa dette chiffrée', () => {
    /*
     * On ne retire pas la directive dans cette livraison : 7 erreurs de typage
     * subsistent et les solder est un chantier à part. Mais une directive muette
     * redeviendrait un angle mort — celui qui a caché ces trois plantages depuis
     * le 9 août. Elle doit donc dire ce qu'elle masque.
     */
    const header = SOURCE.split('\n').slice(0, 40).join('\n');

    expect(header).toMatch(/@ts-nocheck/);
    expect(header).toMatch(/DETTE MESURÉE/);
    expect(header).toMatch(/7 erreurs/);

    /*
     * La directive doit rester une LIGNE `//` : en bloc, tsc l'ignore en silence
     * et le fichier redeviendrait vérifié sans que personne l'ait décidé.
     */
    expect(SOURCE).toMatch(/^\/\/ @ts-nocheck/m);
  });
});

describe("TSNOCHECK-DEBT-002 — les 5 erreurs à risque d'exécution", () => {
  it('rend toutes les branches racines à la même profondeur', () => {
    /*
     * Le plus visible des cinq. `tree.flatMap(function flatten(node, depth = 0))`
     * recevait l'INDICE en deuxième argument : la 2e conversation racine était
     * indentée de 12 px, la 3e de 24 px, comme si elles descendaient l'une de
     * l'autre. L'enveloppe impose `0` à la racine.
     */
    expect(CODE).not.toMatch(/tree\.flatMap\(function flatten/);
    expect(CODE).toMatch(/\)\(rootNode, 0\)/);
  });

  it('restreint vraiment les deux `filter(Boolean)` sur les conversations', () => {
    /*
     * Les deux filtres retiraient bien les entrées nulles à l'exécution, mais un
     * booléen ne restreint pas le type : chaque élément restait « possibly
     * undefined ». Le prédicat dit enfin ce que le filtre garantit.
     */
    expect(CODE).not.toMatch(/return hydrated\.filter\(Boolean\)/);
    expect(CODE).toMatch(/hydrated\.filter\(\s*\(conversation\): conversation is NonNullable/);
    expect(CODE).toMatch(
      /\(conversation\): conversation is NonNullable<typeof conversation> =>\s*Boolean\(conversation\) && Array\.isArray/,
    );
  });

  it("déclare `backendConversationId` dans le type de l'état archivé", () => {
    /*
     * Le champ est LU par `projectConversationCheckpoints` (clé de rollback côté
     * serveur) mais était absent du type de l'état : rien n'empêchait de le
     * supprimer par erreur.
     */
    const start = CODE.indexOf('const [archivedProjectConversations,');

    expect(start).toBeGreaterThan(-1);
    expect(CODE.slice(start, start + 400)).toMatch(/backendConversationId\?: string;/);
  });

  it('narrowe le corps réseau côté fonction, pas côté appelant', () => {
    /*
     * `response.json()` rend `unknown` : c'est un corps réseau, il peut contenir
     * n'importe quoi. La signature exigeait une forme précise, ce que l'appelant
     * ne pouvait pas honnêtement fournir.
     */
    const panels = readFileSync(join(__dirname, 'base-chat-panels.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

    const start = panels.indexOf('export function describeSnapshotRestoreFailure(');

    expect(start).toBeGreaterThan(-1);

    const signature = panels.slice(start, start + 600);
    expect(signature).toMatch(/payload: unknown,/);
    expect(signature).toMatch(/typeof error === 'object'/);
  });
});
