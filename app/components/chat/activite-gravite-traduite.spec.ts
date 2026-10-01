import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { baseChatAstEn, baseChatAstFr } from '~/lib/i18n/catalogs/base-chat-ast';

/*
 * Panneau Activité — chaque gravité que le classement PEUT produire a sa
 * traduction, en anglais comme en français.
 *
 * Mesuré en prod le 30/09 à 390 px : un badge « UNAVAILABLE », en anglais, au
 * milieu d'une interface française. `classifyProjectActivity` rend quatre
 * gravités (critical, important, routine, normal), le catalogue n'en traduisait
 * que trois — et pas les mêmes (routine, important, warning). Une clé absente
 * retombe sur `en['common.unavailable']`, d'où « Unavailable ».
 *
 * La garde lit les gravités dans le CODE du classement, pas dans une liste
 * recopiée ici : une gravité ajoutée demain sans traduction fera rougir ce test.
 */
const SOURCE = readFileSync(new URL('./BaseChat.tsx', import.meta.url), 'utf8');

function gravitesDuClassement(): string[] {
  const debut = SOURCE.indexOf('function classifyProjectActivity(');

  expect(debut, 'classifyProjectActivity introuvable — ce test ne mesurerait rien').toBeGreaterThan(-1);

  const corps = SOURCE.slice(debut, SOURCE.indexOf('\n}\n', debut));

  return [...new Set([...corps.matchAll(/return '([a-z-]+)';/g)].map((m) => m[1]))];
}

describe('Activité — gravités traduites', () => {
  it('le classement produit bien plusieurs gravités (contrôle positif)', () => {
    expect(gravitesDuClassement().length).toBeGreaterThanOrEqual(3);
  });

  for (const [langue, catalogue] of [
    ['en', baseChatAstEn],
    ['fr', baseChatAstFr],
  ] as const) {
    it(`chaque gravité produite a sa traduction (${langue})`, () => {
      const manquantes = gravitesDuClassement().filter(
        (g) => !Object.hasOwn(catalogue, `baseChatAst.activity.severity.${g}`),
      );

      expect(manquantes, `gravités sans traduction (${langue}) : ${manquantes.join(', ')}`).toEqual([]);
    });
  }
});
