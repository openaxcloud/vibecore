/**
 * @vitest-environment jsdom
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { formatBaseChatAstNumber } from '~/lib/i18n/catalogs/base-chat-ast';
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
 * Le badge de Supervision doit fournir à la fois le nombre pour le pluriel
 * et sa version locale pour l’interpolation.
 */
describe('étiquette accessible des compteurs de diagnostics', () => {
  // Formulations humanisées au lot UNIF-07 (fin de « project errors » façon jargon).
  const cas = [
    ['fr', { un: '1 erreur dans ce projet', plusieurs: '1\u202f234 erreurs dans ce projet' }],
    ['en', { un: '1 error in this project', plusieurs: '1,234 errors in this project' }],
  ] as const;

  for (const [langue, attendus] of cas) {
    it(`résout le singulier et le pluriel en ${langue}`, () => {
      const i18n = createI18nInstance(langue);
      const t = i18n.t.bind(i18n);

      const label = (count: number) =>
        t('baseChatAst.diagnostics.count', { count, formatted: formatBaseChatAstNumber(langue, count) });

      expect(label(1)).toBe(attendus.un);
      expect(label(1234)).toBe(attendus.plusieurs);
    });
  }

  it('fournit les deux valeurs à l’étiquette de Supervision et la masque sans erreur', () => {
    const source = readFileSync(join(__dirname, 'BaseChat.tsx'), 'utf8');
    const monitoringItem = source.match(/panel: 'monitoring',\s+label:[\s\S]*?tone:/)?.[0];

    expect(monitoringItem).toMatch(
      /badgeLabel:\s*statusbarDiagnostics\.errors > 0\s*\? t\('baseChatAst\.diagnostics\.count', \{\s*count: statusbarDiagnostics\.errors,\s*formatted: formatBaseChatAstNumber\(language, statusbarDiagnostics\.errors\),\s*\}\)\s*:\s*undefined/,
    );
  });

  it('ne retombe pas sur l’étiquette de secours anglaise pour un compte numérique', () => {
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
