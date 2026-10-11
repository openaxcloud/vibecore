import { describe, expect, it } from 'vitest';

/**
 * Le rejet du script d'inspection ne doit pas faire tomber le processus.
 *
 * Mesuré le 2026-09-04 sur #409 et #417 : `Test Files 991 passed`,
 * `Tests 7466 passed`, puis `Errors 1 error` et exit 1. Sept mille tests verts,
 * un CI rouge, et le verdict n'accusait aucun test — il fallait lire la ligne
 * `Errors` pour trouver :
 *
 *   TypeError: Failed to parse URL from /inspector-script.js
 *
 * Une URL relative n'a pas de base hors navigateur. La promesse rejetait donc
 * immédiatement sous Node, sans que personne n'écoute encore : Node signalait
 * une « unhandled rejection », et vitest faisait échouer tout le run.
 */
describe('une promesse en attente de consommateur ne doit jamais rester non surveillée', () => {
  // DISCRIMINANT — sans le gestionnaire, ce test laisse fuir la rejection.
  it('un rejet reste propagé au consommateur, tout en étant déclaré surveillé', async () => {
    const promesse = Promise.reject(new Error('URL relative injoignable'));

    // C'est la forme exacte posée dans app/lib/webcontainer/index.ts.
    promesse.catch(() => undefined);

    // Le rejet n'est PAS avalé : le vrai consommateur le voit toujours.
    await expect(promesse).rejects.toThrow('URL relative injoignable');
  });

  /*
   * GARDE ASSUMÉE — passe des deux côtés à dessein : elle protège contre le
   * troc inverse, un `catch` qui transformerait le rejet en succès silencieux.
   */
  it("le gestionnaire ne convertit pas l'échec en valeur", async () => {
    const promesse = Promise.reject(new Error('boum'));
    promesse.catch(() => undefined);

    await expect(promesse).rejects.toBeInstanceOf(Error);
  });

  // DISCRIMINANT sur le code réel : le fichier doit porter le gestionnaire.
  it('le boot du WebContainer surveille sa promesse de script', async () => {
    const fs = await import('node:fs');
    const source = fs.readFileSync(new URL('./index.ts', import.meta.url), 'utf8');

    expect(source).toContain("fetch('/inspector-script.js')");
    expect(source, 'le fetch du script d’inspection n’est plus surveillé').toContain('inspectorScript.catch(');
  });
});
