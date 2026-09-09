import { describe, expect, it } from 'vitest';
import { objectStorageResultOrDisabled } from './api.projects.$projectId.ide-panel.$panel';

/*
 * BUG-STORAGE-001 — le panneau « Stockage d'objets » annonçait une cause
 * FAUSSE : « n'a pas été activé par un administrateur », alors que la
 * fonctionnalité ÉTAIT active et que c'est l'amont qui ne répondait pas
 * (audit du 15/08 : `/object-storage/status` en timeout, `/dashboard` à 200
 * sur le même hôte et le même jeton).
 *
 * La traduction acceptait `payload.code === undefined` : n'importe quel 404
 * sans code devenait « demandez à votre administrateur ». Une panne était
 * donc repeinte en problème de configuration, et l'utilisateur envoyé sur une
 * fausse piste.
 */
const reponse = (corps: unknown, status = 404) =>
  new Response(typeof corps === 'string' ? corps : JSON.stringify(corps), {
    status,
    headers: { 'content-type': 'application/json' },
  });

/*
 * `json()` de React Router rend un objet de données, pas une `Response` : on
 * lit la charge utile telle qu'elle, sans supposer sa forme.
 */
async function resultat(erreur: unknown) {
  const rendu = (await objectStorageResultOrDisabled(erreur)) as unknown as {
    data?: unknown;
    json?: () => Promise<unknown>;
  };

  if (typeof rendu?.json === 'function') {
    return (await rendu.json()) as Record<string, unknown>;
  }

  return (rendu?.data ?? rendu) as Record<string, unknown>;
}

describe('objectStorageResultOrDisabled', () => {
  it('annonce « non activé » UNIQUEMENT quand l’amont le dit', async () => {
    expect(await resultat(reponse({ error: 'Object storage disabled', code: 'FEATURE_NOT_ENABLED' }))).toEqual({
      enabled: false,
      objects: [],
      folders: [],
    });
  });

  it('ne déguise PLUS un 404 sans code en « demandez à votre administrateur »', async () => {
    /*
     * Le 404 par défaut d'un serveur : ni `code`, ni rapport avec le drapeau.
     * C'est exactement la forme qui faisait mentir le panneau.
     */
    const panne = reponse({ message: 'Route GET:/projects/x/object-storage/status not found', statusCode: 404 });

    await expect(objectStorageResultOrDisabled(panne)).rejects.toBe(panne);
  });

  it('ne déguise pas non plus un corps illisible', async () => {
    const panne = reponse('<html>502 Bad Gateway</html>');

    await expect(objectStorageResultOrDisabled(panne)).rejects.toBe(panne);
  });

  it('laisse passer les autres codes du domaine, qui ont leur propre écran', async () => {
    const pasDeSeau = reponse({ error: 'no bucket', code: 'BUCKET_NOT_PROVISIONED' });

    await expect(objectStorageResultOrDisabled(pasDeSeau)).rejects.toBe(pasDeSeau);
  });

  it('ne touche pas aux erreurs qui ne sont pas des 404', async () => {
    const cinqCent = reponse({ code: 'FEATURE_NOT_ENABLED' }, 500);

    await expect(objectStorageResultOrDisabled(cinqCent)).rejects.toBe(cinqCent);

    const brute = new Error('réseau coupé');
    await expect(objectStorageResultOrDisabled(brute)).rejects.toBe(brute);
  });
});
