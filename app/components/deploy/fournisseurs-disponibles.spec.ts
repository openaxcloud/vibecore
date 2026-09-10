import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fournisseurParDefaut, fournisseursOffrables } from './fournisseurs-disponibles';

/*
 * BUG-DEPLOY-PROVIDERS-UI-001 — « les fournisseurs ne fonctionnent pas »
 * (Avi, 09/09). Ils ne pouvaient pas : l'assistant proposait les sept, six
 * demandaient des identifiants absents, et on l'apprenait par un 503 après
 * avoir rempli le formulaire.
 */
const CATALOGUE = [
  { id: 'static', name: 'Static hosting' },
  { id: 'vercel', name: 'Vercel' },
  { id: 'netlify', name: 'Netlify' },
] as const;

describe('fournisseursOffrables', () => {
  it('marque inutilisable un fournisseur sans ses identifiants, et dit lesquels', () => {
    const offrables = fournisseursOffrables(CATALOGUE, [
      { provider: 'static', configured: true, missingEnv: [] },
      { provider: 'vercel', configured: false, missingEnv: ['VERCEL_DEPLOY_HOOK_URL'] },
      { provider: 'netlify', configured: true, missingEnv: [] },
    ]);

    expect(offrables.map((e) => [e.fournisseur.id, e.utilisable])).toEqual([
      ['static', true],
      ['vercel', false],
      ['netlify', true],
    ]);
    expect(offrables[1].manquantes).toEqual(['VERCEL_DEPLOY_HOOK_URL']);
  });

  it('ne masque RIEN quand le relevé manque — un fournisseur qui marche caché serait pire', () => {
    for (const releve of [undefined, null, [], 'boom', {}]) {
      const offrables = fournisseursOffrables(CATALOGUE, releve);
      expect(offrables.every((e) => e.utilisable)).toBe(true);
    }
  });

  it('ignore ce qui n’est pas un nom de variable dans le relevé', () => {
    const offrables = fournisseursOffrables(CATALOGUE, [
      { provider: 'vercel', configured: false, missingEnv: ['VERCEL_DEPLOY_HOOK_URL', 42, null] },
    ]);
    expect(offrables[1].manquantes).toEqual(['VERCEL_DEPLOY_HOOK_URL']);
  });
});

describe('fournisseurParDefaut', () => {
  it('ouvre sur « static », qui n’exige rien', () => {
    const offrables = fournisseursOffrables(CATALOGUE, [{ provider: 'vercel', configured: false, missingEnv: ['X'] }]);
    expect(fournisseurParDefaut(offrables)).toBe('static');
  });

  it('ouvre sur un choix vivant plutôt que sur un mur si « static » est hors jeu', () => {
    const offrables = fournisseursOffrables(CATALOGUE, [
      { provider: 'static', configured: false, missingEnv: ['X'] },
      { provider: 'vercel', configured: false, missingEnv: ['Y'] },
      { provider: 'netlify', configured: true, missingEnv: [] },
    ]);
    expect(fournisseurParDefaut(offrables)).toBe('netlify');
  });
});

describe("l'assistant applique la règle", () => {
  const source = readFileSync(join(process.cwd(), 'app/components/chat/BaseChat.tsx'), 'utf8');

  it('la liste des fournisseurs vient du relevé, et désactive ce qui ne peut pas aboutir', () => {
    const bloc = /<select name="provider"[\s\S]*?<\/select>/u.exec(source);
    expect(bloc, 'le sélecteur de fournisseur a disparu').not.toBeNull();

    const texte = bloc![0];
    expect(texte).toContain('defaultValue={fournisseurInitial}');
    expect(texte).toContain('fournisseurs.map');
    expect(texte).toContain('disabled={!utilisable}');

    // La liste brute ne doit plus être parcourue directement : elle ment.
    expect(texte).not.toContain('BOLT_DEPLOY_PROVIDERS.map');
  });

  it('le relevé est bien celui du chargeur de panneau', () => {
    expect(source).toContain('fournisseursOffrables(BOLT_DEPLOY_PROVIDERS, (data as any).providerAvailability)');
  });
});
