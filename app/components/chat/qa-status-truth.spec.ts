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

  it('les signaux réels sont bien câblés depuis BaseChat', () => {
    expect(baseChat).toMatch(/<ProgressCompilation[\s\S]{0,160}streaming=\{isStreaming\}/);
    expect(baseChat).toMatch(/<ProgressCompilation[\s\S]{0,160}failed=\{Boolean\(llmErrorAlert\)\}/);
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

describe('BUG-QA-PANEL-429-MASKED-001 — un quota atteint est nommé', () => {
  it('429 a sa propre branche, avant le fourre-tout', () => {
    expect(panelRoute).toMatch(/status === 429[\s\S]{0,40}PANEL_QUOTA_EXCEEDED/);
    expect(panelRoute).toMatch(/apiRuntime\.panel\.quotaExceeded/);
  });

  it('les DEUX chemins d_erreur du panneau traitent le 429', () => {
    const occurrences = panelRoute.match(/quotaExceeded/g) ?? [];
    expect(occurrences.length).toBeGreaterThanOrEqual(2);
  });

  it('le message de quota existe en anglais ET en français', () => {
    const catalog = readFileSync(join(APP, 'lib', 'i18n', 'catalogs', 'api-runtime-routes.ts'), 'utf8');
    const occurrences = catalog.match(/'apiRuntime\.panel\.quotaExceeded'/g) ?? [];

    expect(occurrences).toHaveLength(2);
    expect(catalog).toMatch(/quota was reached/i);
    expect(catalog).toMatch(/quota est atteint/i);
  });
});
