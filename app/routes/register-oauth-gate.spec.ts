import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * BUG-QA-OAUTH-REGISTER-NON-GATE-001 — `/register` proposait « S'inscrire avec
 * GitHub » et « S'inscrire avec Google » alors que ces fournisseurs ne sont pas
 * configurés.
 *
 * Parcours reproduit de bout en bout : clic sur `/register` → **302 vers
 * `/login?oauth=google&error=not_configured`**. Double peine — l'inscription
 * n'aboutit pas, ET le visiteur change de page : il voulait CRÉER un compte, il
 * atterrit sur la page de CONNEXION, porteur d'une erreur.
 *
 * ASYMÉTRIE, qui est le vrai défaut : `/login` interrogeait déjà
 * `/auth/oauth/providers` et masquait un bouton non prêt. `/register` (qui
 * ré-exporte `signup.tsx`) avait bien un `loader`, mais qui ne rendait que la
 * langue — il ne pouvait donc RIEN savoir de la disponibilité, et rendait les
 * deux boutons inconditionnellement. Le composant partagé `AuthOauthButton`
 * n'expose aucune notion de disponibilité : le filtrage est laissé à
 * l'appelant, et un seul des deux appelants le faisait.
 *
 * ⚠️ Les deux sondes lisent le code SANS ses commentaires : la prose de ces
 * fichiers cite `providers` et `ready`, donc une sonde lisant le brut passerait
 * même si le filtrage avait disparu.
 */

const sansCommentaires = (chemin: string) =>
  readFileSync(join(__dirname, chemin), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const SIGNUP = sansCommentaires('signup.tsx');
const LOGIN = sansCommentaires('login.tsx');

describe('BUG-QA-OAUTH-REGISTER-NON-GATE-001 — /register ne propose que des fournisseurs prêts', () => {
  it('les sondes lisent bien du code, commentaires retirés', () => {
    expect(SIGNUP.length, 'signup.tsx lu').toBeGreaterThan(5000);
    expect(SIGNUP, 'les commentaires doivent être retirés').not.toContain('Double peine');
  });

  it('MÉCANISME 1 — le loader de /register interroge la disponibilité', () => {
    expect(SIGNUP, "l'endpoint de disponibilité doit être appelé").toContain("'/auth/oauth/providers'");
    expect(SIGNUP, 'et la réponse renvoyée au composant').toMatch(/return json\(\{[^}]*providers[^}]*\}\)/);
  });

  it('MÉCANISME 2 — les deux boutons sont filtrés sur cette disponibilité', () => {
    expect(SIGNUP).toMatch(/providerReady\('github'\)\s*\?/);
    expect(SIGNUP).toMatch(/providerReady\('google'\)\s*\?/);
  });

  it('le repli est OUVERT — un fournisseur qui marche n’est jamais masqué par un hoquet d’API', () => {
    /*
     * Contre-garde. Durcir en `=== true` masquerait les deux boutons dès que
     * l'appel échoue, ce qui casserait l'inscription sociale sur un
     * environnement sain. `/login` a exactement la même règle.
     */
    expect(SIGNUP).toMatch(/\?\.ready !== false/);
    expect(SIGNUP, 'un repli fermé serait pire que le défaut').not.toMatch(/\?\.ready === true/);
  });

  it('PARITÉ — /register applique la MÊME règle que /login', () => {
    /*
     * C'est l'asymétrie qui a produit le défaut : la règle existait d'un seul
     * côté. Ce test la vérifie des deux, pour qu'elle ne puisse plus diverger.
     */
    for (const [nom, source] of [
      ['login', LOGIN],
      ['signup', SIGNUP],
    ] as const) {
      expect(source, `${nom} interroge la disponibilité`).toContain("'/auth/oauth/providers'");
      expect(source, `${nom} filtre sur cette disponibilité`).toMatch(/\?\.ready !== false/);
    }
  });
});
