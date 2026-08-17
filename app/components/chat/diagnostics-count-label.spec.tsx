/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import { createI18nInstance } from '~/lib/i18n/runtime';

/*
 * Défaut relevé en réel sur l'IDE de l'env de test : les pastilles de la barre
 * d'état annonçaient « Unavailable » — en anglais, dans une interface
 * française — au lieu de « 0 erreurs » / « 4 avertissements ».
 *
 * La clé n'existe qu'en formes plurielles (`_one` / `_other`) et le site
 * d'appel passait `count` DÉJÀ MIS EN FORME, donc une chaîne. i18next choisit
 * la forme à partir de `count` ; avec une chaîne il ne trouve aucune des deux
 * et retombe sur la valeur de secours.
 *
 * Ce test fige les deux moitiés de l'invariant : un nombre résout, et une
 * chaîne ne doit jamais produire l'étiquette de secours anglaise.
 */
describe('étiquette accessible des compteurs de diagnostics', () => {
  const cas = [
    ['fr', { un: '1 erreur du projet', plusieurs: '4 erreurs du projet' }],
    ['en', { un: '1 project error', plusieurs: '4 project errors' }],
  ] as const;

  for (const [langue, attendus] of cas) {
    it(`résout le singulier et le pluriel en ${langue}`, () => {
      const i18n = createI18nInstance(langue);
      const t = i18n.t.bind(i18n);

      expect(t('baseChatAst.diagnostics.count', { count: 1, formatted: '1' })).toBe(attendus.un);
      expect(t('baseChatAst.diagnostics.count', { count: 4, formatted: '4' })).toBe(attendus.plusieurs);
    });
  }

  it('ne retombe jamais sur l’étiquette de secours anglaise, même avec un compte non numérique', () => {
    const i18n = createI18nInstance('fr');
    const t = i18n.t.bind(i18n);
    const secours = String(t('common.unavailable'));

    for (const compte of [0, 1, 2, 12]) {
      const rendu = String(t('baseChatAst.diagnostics.count', { count: compte, formatted: String(compte) }));

      expect(rendu).not.toBe(secours);
      expect(rendu).not.toContain('Unavailable');
      expect(rendu).toContain(String(compte));
    }
  });
});
