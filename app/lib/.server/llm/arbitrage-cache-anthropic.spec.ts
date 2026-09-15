import { describe, expect, it } from 'vitest';

import { arbitrerCacheAnthropic } from './arbitrage-cache-anthropic';

const RIEN = { cachedPromptTokens: 0, cacheWriteTokens: 0 };

describe('ce qui est facturé : les métadonnées, ou le fil', () => {
  it('MÉTADONNÉES PRÉSENTES — le relevé du fil est IGNORÉ', () => {
    /*
     * Le sens qui protège la facture après la montée à `@ai-sdk/anthropic@1.2.12`.
     * Les deux sources parlent ; additionner doublerait ce qui est facturé.
     */
    const total = arbitrerCacheAnthropic(
      { cachedPromptTokens: 1200, cacheWriteTokens: 300 },
      { read: 1200, write: 300 },
    );

    expect(total).toEqual({ cachedPromptTokens: 1200, cacheWriteTokens: 300 });
  });

  it('MÉTADONNÉES MUETTES — le fil sert, et il REMPLACE', () => {
    /*
     * L'autre sens, et c'est pour lui que le relevé du fil existe : sur
     * `0.0.39` les métadonnées étaient vides (mesuré : `providerMetadata` = 0
     * occurrence dans le bundle). Le retirer « puisque le SDK rapporte
     * maintenant » casserait ce cas sans que rien ne l'annonce.
     */
    expect(arbitrerCacheAnthropic(RIEN, { read: 900, write: 120 })).toEqual({
      cachedPromptTokens: 900,
      cacheWriteTokens: 120,
    });
  });

  it('UNE SEULE des deux métadonnées suffit à faire taire le fil', () => {
    /*
     * Un `cacheWriteTokens` à zéro est une VALEUR (rien n'a été écrit au cache),
     * pas un silence. Exiger que les deux soient nuls ferait ressurgir le fil sur
     * un tour parfaitement rapporté.
     */
    expect(arbitrerCacheAnthropic({ cachedPromptTokens: 800, cacheWriteTokens: 0 }, { read: 5, write: 5 })).toEqual({
      cachedPromptTokens: 800,
      cacheWriteTokens: 0,
    });
    expect(arbitrerCacheAnthropic({ cachedPromptTokens: 0, cacheWriteTokens: 640 }, { read: 5, write: 5 })).toEqual({
      cachedPromptTokens: 0,
      cacheWriteTokens: 640,
    });
  });

  it('les deux muets — on ne fabrique rien', () => {
    expect(arbitrerCacheAnthropic(RIEN, { read: 0, write: 0 })).toEqual(RIEN);
    expect(arbitrerCacheAnthropic(RIEN, undefined)).toEqual(RIEN);
  });

  it("JAMAIS D'ADDITION — le résultat est TOUJOURS l'une des deux sources", () => {
    /*
     * La garde qui vaut de l'argent, et elle se formule comme une IDENTITÉ, pas
     * comme une borne : le résultat est exactement l'un des deux relevés. Une
     * borne « ≤ le plus grand » laisserait passer une moyenne, une pondération,
     * ou une addition dont un terme est nul.
     */
    const cas = [
      [
        { cachedPromptTokens: 1000, cacheWriteTokens: 200 },
        { read: 900, write: 100 },
      ],
      [
        { cachedPromptTokens: 0, cacheWriteTokens: 0 },
        { read: 1000, write: 200 },
      ],
      [
        { cachedPromptTokens: 7, cacheWriteTokens: 0 },
        { read: 1000, write: 200 },
      ],
      [
        { cachedPromptTokens: 0, cacheWriteTokens: 3 },
        { read: 1000, write: 200 },
      ],
    ] as const;

    for (const [metadonnees, fil] of cas) {
      const total = arbitrerCacheAnthropic(metadonnees, fil);
      const depuisLeFil = { cachedPromptTokens: fil.read, cacheWriteTokens: fil.write };

      expect(
        JSON.stringify(total) === JSON.stringify(metadonnees) || JSON.stringify(total) === JSON.stringify(depuisLeFil),
        `résultat hybride : ${JSON.stringify(total)}`,
      ).toBe(true);
    }
  });

  it('TÉMOIN — les deux issues sont réellement atteignables', () => {
    // Sans lui, une fonction qui rendrait toujours `metadonnees` passerait la moitié des cas.
    expect(arbitrerCacheAnthropic(RIEN, { read: 1, write: 1 })).not.toEqual(RIEN);
    expect(arbitrerCacheAnthropic({ cachedPromptTokens: 1, cacheWriteTokens: 1 }, { read: 9, write: 9 })).toEqual({
      cachedPromptTokens: 1,
      cacheWriteTokens: 1,
    });
  });
});
