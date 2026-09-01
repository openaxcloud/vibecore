import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Une base EN COURS de provisionnement doit être VISIBLE dans le panneau.
 *
 * `GET /projects/:id/databases` ne renvoyait que `connections`, dérivées des
 * secrets. Une instance en cours de création n'a pas encore de secret : elle ne
 * produisait donc AUCUNE connexion, et le panneau affichait « Aucune base de
 * données pour le moment » à un projet qui en a une. Vu de l'utilisateur : on
 * appuie sur « Créer », et rien ne se passe — le symptôme de BUG-DB-002, par un
 * autre chemin.
 *
 * ⚠️ J'avais AFFIRMÉ dans la PR #317 que le correctif client rendait déjà cet
 * état visible. C'était FAUX : le statut de l'instance n'atteignait jamais le
 * panneau, faute d'être renvoyé par l'API. Le correctif client était nécessaire
 * mais pas suffisant — c'est le second mécanisme, et il vit ici.
 *
 * Ce test lit le CODE sans ses commentaires : la prose autour de cette route
 * cite `databases` et `PROVISIONING`, donc une sonde lisant le fichier brut
 * passerait même si la donnée n'était plus renvoyée.
 */

const SOURCE = readFileSync(join(__dirname, 'app.ts'), 'utf8');
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

/** Le corps de la route `GET /projects/:projectId/databases`, commentaires retirés. */
const ROUTE = (() => {
  const debut = CODE.indexOf("app.get('/projects/:projectId/databases'");
  const fin = CODE.indexOf("app.get('/projects/:projectId/databases/schema'");

  return CODE.slice(debut, fin);
})();

describe('base en cours de provisionnement — visible dans le panneau', () => {
  it('la sonde a bien isolé la route, et les commentaires en sont retirés', () => {
    expect(ROUTE.length, 'corps de route lu').toBeGreaterThan(400);
    expect(ROUTE, 'les commentaires doivent être retirés').not.toContain('Vu de l’utilisateur');
  });

  it('la route renvoie l’instance en cours quand aucune connexion n’existe', () => {
    expect(ROUTE).toMatch(/connections\.length === 0\s*\?\s*await store\.getDatabaseInstanceByProject\(/);
    expect(ROUTE, 'la clé `databases` doit figurer dans la réponse').toMatch(/^\s*databases,\s*$/m);
  });

  it('elle ne l’expose que tant que l’instance n’est pas ACTIVE', () => {
    /*
     * Dès que le secret est semé, la connexion réelle décrit mieux la base :
     * exposer les deux ferait apparaître la même base en double.
     */
    expect(ROUTE).toMatch(/instanceEnCours\.status !== 'ACTIVE'/);
  });

  it('elle porte le statut, sinon le panneau ne peut pas le montrer', () => {
    expect(ROUTE).toMatch(/status:\s*instanceEnCours\.status/);
  });

  it('la clé suit l’environnement — une base de prod ne se présente pas comme celle de dev', () => {
    expect(ROUTE).toMatch(/'PROD_DATABASE_URL'/);
    expect(ROUTE).toMatch(/'DATABASE_URL'/);
  });
});
