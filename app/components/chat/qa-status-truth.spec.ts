import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { deriveProgressState } from './ProgressCompilation';

/*
 * Fil rouge du balayage QA : « un statut de succès qui ne vérifie pas ce qu'il
 * annonce ». Le garde-fou transverse est toujours le même — **dériver l'état
 * affiché des signaux disponibles**, et ne jamais déduire un succès de
 * l'ABSENCE d'un signal d'échec.
 */

const APP = join(__dirname, '..', '..');
const baseChat = readFileSync(join(__dirname, 'BaseChat.tsx'), 'utf8');

const panelRoute = readFileSync(join(APP, 'routes', 'api.projects.$projectId.ide-panel.$panel.ts'), 'utf8');

describe('BUG-QA-AGENT-PROGRESS-001 — la progression ne ment plus après une erreur', () => {
  /*
   * Scénario QA : erreur terminale à 2 étapes terminées sur 3. Plus rien n'est
   * `in-progress`, donc l'ancien code concluait « pas de travail actif = terminé »
   * et affichait la coche verte avec la barre figée à 67 %.
   */
  const afterTerminalError = { completedCount: 2, totalCount: 3, hasActiveWork: false };

  it('AVANT : « aucun travail actif » était interprété comme un succès', () => {
    // Reproduction de l'ancienne règle, telle qu'elle était écrite.
    const ancienEtat = afterTerminalError.hasActiveWork ? 'working' : 'done';
    expect(ancienEtat).toBe('done');
  });

  it('APRÈS : une erreur terminale donne « interrompu », jamais « terminé »', () => {
    expect(deriveProgressState({ ...afterTerminalError, failed: true })).toBe('interrupted');
  });

  it('APRÈS : une fin sans erreur mais incomplète est AUSSI « interrompu »', () => {
    // 67 % et plus personne au travail : ce n'est pas un succès.
    expect(deriveProgressState(afterTerminalError)).toBe('interrupted');
  });

  it('APRÈS : « terminé » exige que TOUT soit réellement complet', () => {
    expect(deriveProgressState({ completedCount: 3, totalCount: 3, hasActiveWork: false })).toBe('done');
  });

  it('APRÈS : le streaming en cours reste « en cours », même sans étape active', () => {
    expect(deriveProgressState({ ...afterTerminalError, streaming: true })).toBe('working');
  });

  it("APRÈS : une erreur l'emporte sur le streaming (l'échec prime)", () => {
    expect(deriveProgressState({ ...afterTerminalError, streaming: true, failed: true })).toBe('interrupted');
  });

  it('APRÈS : aucune étape connue ne peut pas être un succès', () => {
    expect(deriveProgressState({ completedCount: 0, totalCount: 0, hasActiveWork: false })).toBe('interrupted');
  });

  it("APRÈS (BUG-UX-AGENT-DONE-FALSE) : 100 % d'actions + projet dégradé = « terminé avec erreurs », pas la coche verte", () => {
    /*
     * Le cas observé en live : toutes les actions de fichiers ont réussi (100 %)
     * mais 51 erreurs dans Problèmes / consensus à 20 % / aperçu en erreur.
     * L'ancien code n'avait pas le signal : il affichait « Terminé » vert.
     */
    const fullyCompleted = { completedCount: 3, totalCount: 3, hasActiveWork: false };

    expect(deriveProgressState({ ...fullyCompleted, degraded: true })).toBe('done-with-issues');
  });

  it('BUG-UX-AGENT-DONE-FALSE : la dégradation ne requalifie pas un échec ni un run en cours', () => {
    const fullyCompleted = { completedCount: 3, totalCount: 3, hasActiveWork: false };

    // L'échec franc prime : « interrompu », pas « terminé avec erreurs ».
    expect(deriveProgressState({ ...fullyCompleted, degraded: true, failed: true })).toBe('interrupted');

    // Tant que ça travaille, on montre le vrai avancement, pas un verdict.
    expect(deriveProgressState({ ...fullyCompleted, degraded: true, streaming: true })).toBe('working');

    // Et un run incomplet dégradé reste « interrompu » avec son vrai %.
    expect(deriveProgressState({ completedCount: 1, totalCount: 3, hasActiveWork: false, degraded: true })).toBe(
      'interrupted',
    );
  });

  it('BUG-UX-AGENT-DONE-FALSE : sans signal dégradé, « terminé » reste « terminé »', () => {
    expect(deriveProgressState({ completedCount: 3, totalCount: 3, hasActiveWork: false, degraded: false })).toBe(
      'done',
    );
  });

  /*
   * ─────────────────────────────────────────────────────────────────────────
   * LE SITE D'APPEL — et pourquoi il est mesuré par CONTENANCE.
   *
   * Tout ce qui précède exécute `deriveProgressState` : c'est du comportement,
   * et c'est solide. Ce qui suit ne peut pas l'être ici — il faudrait rendre
   * BaseChat.tsx (23 000 lignes, 124 imports) pour observer les props passées.
   * Le rendu de composants existe pourtant dans ce dépôt (241 specs importent
   * `@testing-library/react`), donc l'obstacle est la TAILLE de ce composant,
   * pas l'outillage. Le vrai remède serait d'extraire le calcul des props dans
   * un module pur — comme `panel-payload-cache.ts` l'a été — et de le tester.
   * Ce n'est pas fait ici : BaseChat.tsx est modifié par plusieurs sessions
   * chaque jour, et un refactor de production n'a pas sa place dans un
   * correctif de garde.
   *
   * En attendant : on ISOLE l'élément JSX, puis on vérifie que les props sont
   * SUR CET ÉLÉMENT. La version précédente affirmait « `<ProgressCompilation`
   * suivi, à moins de cent-soixante caractères, de `streaming={isStreaming}` » :
   * une distance, que la lecture de texte ne peut pas honnêtement affirmer.
   * Elle rougissait si l'on insérait une prop devant, et acceptait un
   * `streaming={isStreaming}` posé sur un composant VOISIN.
   */
  const elementProgress = (() => {
    const debut = baseChat.indexOf('<ProgressCompilation');

    if (debut === -1) {
      return '';
    }

    let profondeur = 0;

    for (let i = debut; i < baseChat.length; i++) {
      if (baseChat[i] === '{') {
        profondeur++;
      } else if (baseChat[i] === '}') {
        profondeur--;
      } else if (profondeur === 0 && baseChat.startsWith('/>', i)) {
        return baseChat.slice(debut, i + 2);
      }
    }

    return '';
  })();

  it("l'élément JSX a bien été isolé, et il est unique", () => {
    /*
     * Règle 14 — un « 0 résultat » n'informe que si la recherche a fonctionné.
     * Sans ce contrôle, un renommage du composant viderait l'extrait et toutes
     * les contenances ci-dessous passeraient pour de mauvaises raisons.
     */
    expect(elementProgress, '<ProgressCompilation …/> introuvable').not.toBe('');
    expect(elementProgress.length, 'extrait trop court pour porter quatre props').toBeGreaterThan(120);
    expect(baseChat.match(/<ProgressCompilation/g) ?? [], 'un seul site d’appel attendu').toHaveLength(1);
  });

  it('CONTENANCE — les quatre signaux sont portés par CE composant', () => {
    expect(elementProgress, 'le streaming').toMatch(/streaming=\{isStreaming\}/);

    // BUG-AGENT-003 : `failed` porte DEUX signaux, pas seulement l'erreur LLM.
    expect(elementProgress, 'l’échec, LLM ou run').toMatch(
      /failed=\{Boolean\(llmErrorAlert\)\s*\|\|\s*agentRunFailed\}/,
    );

    /*
     * BUG-UX-AGENT-DONE-FALSE : `degraded` porte les TROIS signaux de santé —
     * orchestration dégradée, compteur d'erreurs Problèmes, alerte d'aperçu.
     * Chacun est vérifié SÉPARÉMENT : en retirer un seul doit faire rougir,
     * ce qu'une expression régulière d'un bloc entier ne garantissait pas.
     */
    expect(elementProgress, 'la dégradation d’orchestration').toContain('agentRunDegraded');
    expect(elementProgress, 'les erreurs du panneau Problèmes').toContain('diagnosticErrorCount > 0');
    expect(elementProgress, 'l’alerte d’aperçu').toContain("actionAlert.source === 'preview'");
  });

  it('les deux signaux d’exécution sont bien alimentés depuis le flux', () => {
    /* Une prop câblée sur un état que rien ne met à jour ne vaut rien. */
    expect(baseChat).toContain('setAgentRunFailed(isAgentRunFailed(data))');
    expect(baseChat).toContain('setAgentRunDegraded(isAgentRunDegraded(data))');
  });
});

describe('BUG-QA-I18N-COUNT-001/002 — compteurs collés et faux pluriels', () => {
  const codeOnly = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const code = codeOnly(baseChat);

  it('plus aucun compteur JSX adjacent à un libellé traduit', () => {
    /*
     * `{fileCount}` suivi de `{t(...)}` sont deux expressions ADJACENTES : React
     * les concatène sans séparateur, d'où « 8fichiers » et « Projet4 ».
     */
    expect(code).not.toMatch(/\{\w*(?:[Cc]ount|[Ll]ength)\}\s*\n\s*\{t\(/);
  });

  it('le compteur de fichiers passe par la clé plurielle', () => {
    expect(code).toMatch(/t\('baseChatAst\.files\.count', \{ count: fileCount \}\)/);
  });

  it("le pluriel n'est plus fabriqué en collant un « s » anglais", () => {
    expect(code).not.toMatch(/hiddenRoutineCount === 1 \? '' : 's'/);
    expect(code).toMatch(/t\('baseChatAst\.monitoring\.hiddenRoutine', \{ count: hiddenRoutineCount \}\)/);
  });

  it('le message « fichier(s) » est remplacé par un vrai pluriel', () => {
    const chatCatalog = readFileSync(join(APP, 'lib', 'i18n', 'catalogs', 'chat.ts'), 'utf8');

    expect(chatCatalog).not.toMatch(/fichier\(s\) de verrouillage/);
    expect(chatCatalog).toMatch(/value0LockfileSDetected_e2f1f51c_one/);
    expect(chatCatalog).toMatch(/value0LockfileSDetected_e2f1f51c_other/);
  });

  it('les clés plurielles existent dans les DEUX langues', () => {
    const ast = readFileSync(join(APP, 'lib', 'i18n', 'catalogs', 'base-chat-ast.ts'), 'utf8');
    const occurrences = ast.match(/baseChatAst\.monitoring\.hiddenRoutine_(one|other)/g) ?? [];

    // 2 clés × 2 langues.
    expect(occurrences).toHaveLength(4);
  });
});

describe('BUG-QA-PANEL-429-MASKED-001 — le 429 a sa propre branche', () => {
  /*
   * CE QUE CES TROIS CONTRÔLES SONT DEVENUS.
   *
   * Ils lisaient le TEXTE SOURCE de la route à coups d'expressions régulières :
   * « `status === 429` suivi, à moins de quarante caractères, de
   * `PANEL_QUOTA_EXCEEDED` ». C'était de la prose, pas du comportement — et deux
   * d'entre eux ont rougi sur un changement qui AMÉLIORE la route, tandis que le
   * défaut qu'ils visaient serait passé intact sous un simple réordonnancement.
   *
   * Le fond était juste : le 429 mérite sa branche. Il est désormais tenu sur le
   * rendu, dans `app/routes/panneau-refus-429.spec.ts`, qui vérifie en plus ce
   * que ces contrôles ne pouvaient pas voir — que l'étiquette ne nomme pas une
   * cause qu'elle n'a pas vérifiée.
   */
  it('les deux chemins d_erreur du panneau traitent le 429', () => {
    const occurrences = panelRoute.match(/status === 429/g) ?? [];
    expect(occurrences.length).toBeGreaterThanOrEqual(2);
  });

  it('les deux messages du 429 existent en anglais ET en français', () => {
    const catalog = readFileSync(join(APP, 'lib', 'i18n', 'catalogs', 'api-runtime-routes.ts'), 'utf8');

    expect(catalog.match(/'apiRuntime\.panel\.quotaExceeded'/g) ?? []).toHaveLength(2);
    expect(catalog.match(/'apiRuntime\.panel\.rateLimited'/g) ?? []).toHaveLength(2);
  });
});
