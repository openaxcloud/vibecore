import { describe, expect, it } from 'vitest';

import { action, loader } from './api.projects.$projectId.ai.conversations.$conversationId.transcript';

/*
 * BUG-AGENT-CONV-003 — un GET rendait `{"message":"Unexpected Server Error"}`.
 *
 * Le message ne vient d'aucune ligne du produit : sans `loader`, React Router
 * lève lui-même un 400, et `sanitizeError` du runtime serveur le remplace par
 * cette phrase hors mode développement. Chercher la phrase dans le code ne rend
 * donc rien — c'est ce qui a fait tourner ce point en rond.
 *
 * La garde épingle le SYMPTÔME exact (l'absence de cette phrase) et le
 * comportement voulu (405 + `Allow`), pour que la suppression du `loader`
 * rougisse (règle 15).
 */

const params = { projectId: 'p1', conversationId: 'c1' };
const url = 'https://app.e-code.ai/api/projects/p1/ai/conversations/c1/transcript';

const args = (method: string) => ({ request: new Request(url, { method }), params, context: {} }) as never;

describe('BUG-AGENT-CONV-003 — GET ne rend plus une erreur opaque', () => {
  it('rend 405 avec `Allow: PUT`, jamais « Unexpected Server Error »', async () => {
    const res = (await loader(args('GET'))) as Response;

    expect(res.status).toBe(405);
    expect(res.headers.get('Allow')).toBe('PUT');

    const corps = await res.json();

    expect(corps.code).toBe('METHOD_NOT_ALLOWED');
    expect(corps.ok).toBe(false);

    // Le symptôme exact rapporté : il ne doit plus jamais apparaître.
    expect(JSON.stringify(corps)).not.toContain('Unexpected Server Error');
  });

  it('HEAD suit le même chemin que GET — React Router route les deux vers `loader`', async () => {
    const res = (await loader(args('HEAD'))) as Response;

    expect(res.status).toBe(405);
    expect(res.headers.get('Allow')).toBe('PUT');
  });

  it('un projet ou une conversation manquant reste un 404, pas un 405', async () => {
    const res = (await loader({
      request: new Request(url),
      params: { projectId: 'p1' },
      context: {},
    } as never)) as Response;

    expect(res.status).toBe(404);
  });
});

describe('ce que le correctif ne doit PAS casser', () => {
  /*
   * Sans ce bloc, « corriger » en refusant TOUTES les méthodes passerait au
   * vert : les deux moitiés doivent être couplées (règle 6).
   */
  it('les autres méthodes gardent leur 405 — et gagnent l’en-tête `Allow`', async () => {
    for (const methode of ['POST', 'DELETE', 'PATCH']) {
      const res = (await action(args(methode))) as Response;

      expect(res.status, methode).toBe(405);
      expect(res.headers.get('Allow'), methode).toBe('PUT');
    }
  });

  it('PUT n’est PAS refusé par le nouveau chemin — il ne passe pas par `loader`', async () => {
    /*
     * On ne joue pas le PUT complet (il appellerait le backend) : on vérifie
     * que l'`action` ne le rejette pas sur la garde de méthode, en observant
     * qu'elle va PLUS LOIN que le 405 — ici jusqu'à la lecture du corps.
     */
    const res = await action(args('PUT')).catch((erreur: unknown) => erreur);

    const statut = res instanceof Response ? res.status : undefined;

    expect(statut).not.toBe(405);
  });
});
