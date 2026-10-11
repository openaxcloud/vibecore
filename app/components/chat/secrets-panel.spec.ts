import { describe, expect, it } from 'vitest';
import {
  cleValide,
  entreesDepuisJson,
  filtrerLesSecrets,
  garderLesValeursRenseignees,
  peutAjouter,
  placerSousLeBouton,
  texteEnvDepuisCles,
  texteJsonDepuisCles,
} from './secrets-panel';

const secrets = [{ key: 'ADMIN_PASSWORD' }, { key: 'STRIPE_SECRET_KEY' }, { key: 'DATABASE_URL' }];

describe('onglet Secrets — filtre et validité', () => {
  it('filtre par nom, sans casse, sur une sous-chaîne', () => {
    expect(filtrerLesSecrets(secrets, 'stripe').map((s) => s.key)).toEqual(['STRIPE_SECRET_KEY']);
    expect(filtrerLesSecrets(secrets, '_').map((s) => s.key)).toHaveLength(3);
    expect(filtrerLesSecrets(secrets, '   ')).toHaveLength(3);
    expect(filtrerLesSecrets(secrets, 'zzz')).toEqual([]);
  });

  it('une clé est un identifiant : lettres, chiffres, soulignés, pas de chiffre en tête', () => {
    expect(cleValide('SLACK_API_KEY')).toBe(true);
    expect(cleValide(' slack ')).toBe(true);
    expect(cleValide('1ABC')).toBe(false);
    expect(cleValide('A-B')).toBe(false);
    expect(cleValide('')).toBe(false);
  });

  it('« Ajouter le secret » attend une clé valide ET une valeur — capture Replit 14:20, bouton grisé', () => {
    expect(peutAjouter('SLACK_API_KEY', '')).toBe(false);
    expect(peutAjouter('', 'x')).toBe(false);
    expect(peutAjouter('SLACK_API_KEY', 'x')).toBe(true);
  });
});

describe('onglet Secrets — éditeurs .env et JSON', () => {
  it('part des clés existantes, valeurs vides : aucune valeur n’est affichée sans révélation', () => {
    expect(texteEnvDepuisCles(['A', 'B'])).toBe('A=\nB=');
    expect(JSON.parse(texteJsonDepuisCles(['A', 'B']))).toEqual({ A: '', B: '' });
  });

  it('relit un objet JSON plat ; les valeurs vides ne sont pas des mises à jour', () => {
    expect(entreesDepuisJson('{"A": "1", "B": ""}')).toEqual({
      entries: [{ key: 'A', value: '1' }],
      erreur: null,
      clesInvalides: [],
    });
  });

  it('refuse ce qui n’est pas un objet de chaînes, et nomme les clés invalides', () => {
    expect(entreesDepuisJson('{').erreur).toBe('json-invalide');
    expect(entreesDepuisJson('[1]').erreur).toBe('pas-un-objet');
    expect(entreesDepuisJson('{"A": 1}').erreur).toBe('valeur-non-textuelle');
    expect(entreesDepuisJson('{"1A": "x", "B": "y"}')).toEqual({
      entries: [{ key: 'B', value: 'y' }],
      erreur: null,
      clesInvalides: ['1A'],
    });
  });

  it('un .env relu ne met à jour que les lignes remplies', () => {
    expect(
      garderLesValeursRenseignees([
        { key: 'A', value: '' },
        { key: 'B', value: 'v' },
      ]),
    ).toEqual([{ key: 'B', value: 'v' }]);
  });
});

describe('onglet Secrets — le menu ⋮ se pose sous son bouton, aligné à droite', () => {
  const ecran = { largeur: 390, hauteur: 844 };
  const menu = { largeur: 220, hauteur: 150 };

  it('sous le bouton, bord droit sur bord droit', () => {
    expect(placerSousLeBouton({ left: 330, right: 374, top: 300, bottom: 344 }, menu, ecran)).toEqual({
      x: 154,
      y: 348,
    });
  });

  it('remonte au-dessus du bouton quand il déborderait en bas', () => {
    const { y } = placerSousLeBouton({ left: 330, right: 374, top: 760, bottom: 804 }, menu, ecran);

    expect(y + menu.hauteur).toBeLessThanOrEqual(760);
  });

  it('ne sort pas de l’écran par la gauche sur un écran étroit', () => {
    expect(
      placerSousLeBouton({ left: 0, right: 44, top: 100, bottom: 144 }, menu, { largeur: 320, hauteur: 568 }).x,
    ).toBe(8);
  });
});
