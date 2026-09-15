import { describe, expect, it } from 'vitest';
import { fusionner } from './secrets-unifies';

/*
 * LA FUSION EST VISUELLE, PAS SÉCURITAIRE.
 *
 * Mesuré avant d'écrire, le 2026-09-08 : `ProjectSecret` porte `valueHash`
 * (obligatoire) + `valueEncrypted` (optionnel) — jamais de clair — et révéler
 * une valeur exige `security:manage` ET une demande explicite par clé
 * (`?reveal=true&key=…`). `ProjectEnvVar` porte `value` EN CLAIR, rendu sous
 * `projects:read` sans aucune barrière.
 *
 * Une fusion naïve créerait donc soit une ÉLÉVATION DE PRIVILÈGE (un secret
 * lisible sous `projects:read`), soit la perte de la lecture directe d'une
 * variable. Les deux sont interdites.
 *
 * Troisième point, défaut autonome : `ProjectEnvVar` est aussi le magasin
 * d'état de la plateforme — dix clés `VIBECORE_*` rendues au navigateur sans
 * filtre. Dans une liste éditable, elles deviennent supprimables.
 */

const secrets = [{ key: 'STRIPE_SECRET_KEY' }, { key: 'OPENAI_API_KEY' }];

const variables = [
  { key: 'DATABASE_URL', value: 'postgres://exemple' },
  { key: 'PUBLIC_BASE_URL', value: 'https://exemple.test', scope: 'production' },
  { key: 'VIBECORE_IDE_SETTINGS_STATE', value: '{"a":1}' },
  { key: 'VIBECORE_TERMINAL_STATE', value: '{"b":2}' },
];

describe('la fusion ne déplace aucune permission', () => {
  it('ÉLÉVATION DE PRIVILÈGE — un secret ne porte JAMAIS sa valeur dans la liste', () => {
    const lignes = fusionner(secrets, variables);
    const fautifs = lignes.filter((l) => l.nature === 'secret' && (l.valeur !== undefined || !l.masquee));

    expect(
      fautifs.map((l) => l.cle),
      'un secret lisible sous projects:read est une élévation de privilège',
    ).toEqual([]);
  });

  it('RIEN NE DISPARAÎT — chaque variable reste présente et sa valeur lisible', () => {
    const lignes = fusionner(secrets, variables);

    for (const v of variables.filter((x) => !x.key.startsWith('VIBECORE_'))) {
      const ligne = lignes.find((l) => l.cle === v.key);
      expect(ligne, `variable disparue : ${v.key}`).toBeDefined();
      expect(ligne?.nature).toBe('variable');
      expect(ligne?.valeur, `valeur de ${v.key} devenue illisible`).toBe(v.value);
      expect(ligne?.masquee, `${v.key} ne doit pas passer derrière la barrière`).toBe(false);
    }
  });

  it("les clés internes VIBECORE_* n'apparaissent pas dans la liste", () => {
    const lignes = fusionner(secrets, variables);
    const internes = lignes.filter((l) => l.cle.startsWith('VIBECORE_'));

    expect(
      internes.map((l) => l.cle),
      'état interne de plateforme exposé',
    ).toEqual([]);
  });

  it('TÉMOIN — la fusion rend bien les deux natures', () => {
    const lignes = fusionner(secrets, variables);
    expect(lignes.filter((l) => l.nature === 'secret')).toHaveLength(2);
    expect(lignes.filter((l) => l.nature === 'variable')).toHaveLength(2);
  });
});
