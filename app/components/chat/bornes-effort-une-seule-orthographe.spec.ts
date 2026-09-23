/*
 * Les bornes du curseur d'effort s'écrivent « Min » et « Max », partout.
 *
 * La leçon vient d'ailleurs : la porte des déploiements a longtemps porté TROIS
 * orthographes pour une seule chose, et chaque surface en affichait une autre.
 * Un libellé qui diverge par langue ou par écran coûte plus cher à démêler
 * qu'à tenir.
 *
 * Décision d'Avi le 2026-09-23 : « Min » / « Max », le MÊME mot dans les deux
 * langues — ni « Minimal / Maximal », ni « Low / Max ». Court, et ça tient sur
 * une ligne sans se battre avec la mention de recommandation à droite.
 *
 * La garde lit le catalogue lui-même, jamais une copie.
 */
import { describe, expect, it } from 'vitest';

import { getChatControlsCopy } from '~/lib/i18n/catalogs/chat-controls';

const LANGUES = ['en', 'fr'] as const;

describe('les bornes du curseur d’effort', () => {
  it('s’écrivent « Min » et « Max » dans chaque langue', () => {
    for (const langue of LANGUES) {
      const copy = getChatControlsCopy(langue);

      expect(copy['chatControls.sheet.effortLow'], `borne basse en ${langue}`).toBe('Min');
      expect(copy['chatControls.sheet.effortMax'], `borne haute en ${langue}`).toBe('Max');
    }
  });

  /*
   * L'autre moitié : le même mot des DEUX côtés. Une garde qui vérifierait
   * seulement « Min » en français laisserait l'anglais diverger sans rougir.
   */
  it('portent le même mot d’une langue à l’autre', () => {
    const [en, fr] = LANGUES.map((l) => getChatControlsCopy(l));

    expect(fr['chatControls.sheet.effortLow']).toBe(en['chatControls.sheet.effortLow']);
    expect(fr['chatControls.sheet.effortMax']).toBe(en['chatControls.sheet.effortMax']);
  });

  it('ne retombent dans aucune des orthographes écartées', () => {
    const ecartees = ['Minimal', 'Maximal', 'Low', 'Élevé', 'Elevé', 'High'];

    for (const langue of LANGUES) {
      const copy = getChatControlsCopy(langue);

      for (const cle of ['chatControls.sheet.effortLow', 'chatControls.sheet.effortMax'] as const) {
        expect(ecartees, `${cle} en ${langue} : « ${copy[cle]} »`).not.toContain(copy[cle]);
      }
    }
  });
});
