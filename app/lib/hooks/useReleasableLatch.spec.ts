/*
 * FAMILLE C — un test par mécanisme.
 *
 * Espèces annoncées : les tests 2 et 3 DISCRIMINENT (ils virent au rouge sans le
 * correctif). Les tests 1, 4 et 5 sont des GARDES ASSUMÉES contre la régression
 * inverse — celle qui consisterait à ne plus verrouiller du tout, et à laisser
 * deux exécutions concurrentes refaire le même travail.
 */
import { describe, expect, it, vi } from 'vitest';

import { executerSousLoquet } from './useReleasableLatch';

describe('loquet rendu en cas d’échec', () => {
  it('1. empêche une seconde exécution concurrente [garde]', async () => {
    const loquet = { current: false };
    const appels: number[] = [];

    const premier = executerSousLoquet(loquet, async () => {
      appels.push(1);
      await new Promise((r) => setTimeout(r, 20));
    });
    const second = await executerSousLoquet(loquet, async () => {
      appels.push(2);
    });

    await premier;

    expect(second).toBe(false);
    expect(appels).toEqual([1]);
  });

  it('2. REND le loquet quand l’opération échoue [discriminant]', async () => {
    const loquet = { current: false };
    const surEchec = vi.fn();

    const lance = await executerSousLoquet(
      loquet,
      async () => {
        throw new Error('réseau indisponible');
      },
      surEchec,
    );

    expect(lance).toBe(false);
    expect(loquet.current).toBe(false); // <- sans cette ligne, plus jamais de nouvelle tentative
    expect(surEchec).toHaveBeenCalledOnce();
  });

  it('3. un nouvel essai passe après un échec [discriminant]', async () => {
    const loquet = { current: false };
    await executerSousLoquet(loquet, async () => {
      throw new Error('échec passager');
    });

    const reussi = await executerSousLoquet(loquet, async () => {});

    expect(reussi).toBe(true);
    expect(loquet.current).toBe(true);
  });

  it('4. garde le loquet après un succès — on ne refait pas le travail [garde]', async () => {
    const loquet = { current: false };
    await executerSousLoquet(loquet, async () => {});

    expect(await executerSousLoquet(loquet, async () => {})).toBe(false);
  });

  it('5. `abandonner()` rend le loquet sans traiter le cas comme un échec [garde]', async () => {
    const loquet = { current: false };
    const surEchec = vi.fn();

    const lance = await executerSousLoquet(loquet, async (abandonner) => abandonner(), surEchec);

    expect(lance).toBe(true);
    expect(loquet.current).toBe(false);
    expect(surEchec).not.toHaveBeenCalled();
  });
});
