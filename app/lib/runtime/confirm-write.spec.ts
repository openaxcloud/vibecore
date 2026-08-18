import { readFileSync } from 'node:fs';

import { describe, expect, it, vi } from 'vitest';

import { confirmWriteWithinDeadline, WRITE_CONFIRMATION_TIMEOUT_MS } from './confirm-write';

/*
 * BUG-AGENT-HANG-001 — une écriture qui ne se confirme jamais bloquait l'agent.
 *
 * Constaté en production : « Créer src/component… » restait « En cours »
 * pendant HUIT minutes sur un seul fichier, sans nouvelle ligne dans l'arbre,
 * sans erreur, sans fin — pendant que l'aperçu accumulait les erreurs Vite
 * (29 → 66 → 96 → 170).
 *
 * La relecture qui rend « Terminé » honnête n'avait pas de délai à elle : elle
 * héritait du budget de l'adaptateur (4 × 30 s) et pouvait déclencher un
 * re-provisionnement dont l'attente se compte en minutes.
 *
 * L'invariant tenu ici : la confirmation rend TOUJOURS la main, et une lecture
 * qui échoue vite ne doit pas attendre l'échéance pour autant.
 */
describe('confirmation d’écriture bornée', () => {
  it('confirme une lecture qui aboutit', async () => {
    await expect(confirmWriteWithinDeadline(async () => ({ content: 'ok' }))).resolves.toBe('confirmed');
  });

  it('rend « unreadable » IMMÉDIATEMENT quand la lecture échoue', async () => {
    vi.useFakeTimers();

    try {
      const resultat = confirmWriteWithinDeadline(async () => {
        throw new Error('404');
      }, 60_000);

      /*
       * Sans avancer les minuteurs : une erreur franche ne doit pas faire
       * patienter l'utilisateur jusqu'à l'échéance.
       */
      await expect(resultat).resolves.toBe('unreadable');
    } finally {
      vi.useRealTimers();
    }
  });

  it('rend « timeout » au lieu d’attendre une lecture qui ne revient jamais', async () => {
    vi.useFakeTimers();

    try {
      const resultat = confirmWriteWithinDeadline(() => new Promise(() => {}), 15_000);

      await vi.advanceTimersByTimeAsync(15_000);

      await expect(resultat).resolves.toBe('timeout');
    } finally {
      vi.useRealTimers();
    }
  });

  it('ne dépasse pas quelques secondes par défaut', () => {
    /*
     * Une lecture de confirmation sur un pod sain prend moins d'une seconde.
     * Un plafond généreux ramènerait le symptôme : l'attente doit rester
     * perceptiblement courte.
     */
    expect(WRITE_CONFIRMATION_TIMEOUT_MS).toBeGreaterThan(0);
    expect(WRITE_CONFIRMATION_TIMEOUT_MS).toBeLessThanOrEqual(30_000);
  });
});

describe('câblage dans le magasin d’établi', () => {
  /*
   * Leçon de #145 : un helper correct mais jamais appelé ne corrige rien. Le
   * spec d'alors ne testait que la fonction pure, et le défaut est resté en
   * production. On vérifie donc que le chemin d'écriture passe bien par la
   * confirmation bornée, et plus par un `readFile` nu.
   */
  const workbench = readFileSync('app/lib/stores/workbench.ts', 'utf8');

  it('la relecture après écriture passe par la confirmation bornée', () => {
    expect(workbench).toContain('confirmWriteWithinDeadline(() => this.#runtime.readFile(data.action.filePath))');
  });

  it('plus aucune relecture après écriture sans borne', () => {
    expect(workbench).not.toMatch(/await this\.#runtime\.readFile\(data\.action\.filePath\)/u);
  });

  it('un dépassement remonte un message actionnable, pas un échec muet', () => {
    expect(workbench).toContain('workbenchRuntime.write.notConfirmed');
    expect(workbench).toContain('artifact.runner.failAction(data.actionId, message)');
  });
});
