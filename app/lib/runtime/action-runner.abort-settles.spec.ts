import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

/*
 * BUG-AGENT-HANG-001 — « Arrêter » rendait le blocage DÉFINITIF.
 *
 * Constaté en production : une tâche « En cours » pendant 68 minutes sur un
 * seul fichier, aucun nouveau fichier dans l'arbre, aucune erreur, et le
 * compteur qui continue de monter APRÈS l'appui sur Arrêter.
 *
 * Deux défauts au même endroit, dans `#withTimeout` et son `catch` :
 *
 *  1. le délai refusait de rejeter dès que l'action était annulée, en supposant
 *     que « la promesse sous-jacente se dénoue d'elle-même ». C'est faux :
 *     `#runtime.writeFile` ne reçoit aucun signal d'annulation, il poursuit ses
 *     quatre tentatives de 30 s et peut relancer un provisionnement. La course
 *     `Promise.race` perdait donc son seul moyen de se dénouer ;
 *
 *  2. le `catch` sortait en silence sur annulation, laissant le statut à
 *     « running ».
 *
 * Comme `#currentExecutionPromise` SÉRIALISE toutes les actions, une course qui
 * ne se dénoue jamais gèle aussi toutes les suivantes — d'où l'arbre qui cesse
 * de se remplir.
 *
 * Ces gardes lisent la source : le comportement dépend d'un `AbortSignal` et
 * d'une course de promesses internes à une classe privée, que l'on ne peut pas
 * instancier ici sans un runtime complet.
 */

const RUNNER = 'app/lib/runtime/action-runner.ts';

function corpsDe(source: string, signature: string): string {
  const debut = source.indexOf(signature);

  expect(debut, `${signature} doit exister`).toBeGreaterThan(-1);

  return source.slice(debut, debut + 1800);
}

describe('une action annulée se dénoue toujours', () => {
  const source = readFileSync(RUNNER, 'utf8');

  it('l’annulation participe à la course, elle ne la neutralise plus', () => {
    const corps = corpsDe(source, 'async #withTimeout<T>');

    expect(corps).toContain('Promise.race([promise, timeout, aborted])');
    expect(corps).toContain("action.abortSignal.addEventListener('abort'");
  });

  it('le délai rejette dans TOUS les cas', () => {
    const corps = corpsDe(source, 'async #withTimeout<T>');

    /*
     * L'ancien code contenait `if (action.abortSignal.aborted) { return; }` DANS
     * le callback du minuteur : c'est précisément ce qui empêchait la course de
     * se dénouer une fois l'arrêt demandé.
     */
    const callbackMinuteur = corps.slice(corps.indexOf('setTimeout('), corps.indexOf('const aborted'));

    expect(callbackMinuteur).not.toContain('aborted');
    expect(callbackMinuteur).toContain('reject(new ToolTimeoutError');
  });

  it('une annulation déjà posée rejette immédiatement, sans attendre', () => {
    const corps = corpsDe(source, 'async #withTimeout<T>');

    expect(corps).toMatch(/if \(action\.abortSignal\.aborted\)\s*\{\s*rejeter\(\);/u);
  });

  it('les écouteurs sont retirés, même en cas d’échec', () => {
    const corps = corpsDe(source, 'async #withTimeout<T>');

    expect(corps).toContain('removeEventListener');
    expect(corps).toContain('clearTimeout(timeoutId)');
  });

  it('une action annulée ne reste jamais affichée « En cours »', () => {
    expect(source).toMatch(
      /if \(action\.abortSignal\.aborted\)\s*\{\s*this\.#updateAction\(actionId, \{ status: 'aborted' \}\);/u,
    );
  });

  it('la reprise s’arrête net sur une annulation, au lieu de réessayer', () => {
    const corps = corpsDe(source, 'async #runActionWithRetry');

    expect(corps).toMatch(/if \(action\.abortSignal\.aborted\)\s*\{\s*return;/u);
  });
});
