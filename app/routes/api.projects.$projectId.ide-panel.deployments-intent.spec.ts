import { afterEach, describe, expect, it, vi } from 'vitest';

/*
 * BUG-PUBLISH-ONSUBMIT-FORMDATA-001, l'autre bout du fil.
 *
 * `gestes-publication.spec.ts` prouve que le FormData sort bien du panneau.
 * Celui-ci prouve qu'il ARRIVE : on pilote le VRAI `action` de la route avec
 * exactement le corps que « Gérer votre application » poste — { intent,
 * deploymentId } — et on mesure l'appel backend produit.
 *
 * Les deux moitiés sont nécessaires (règle 6) : un bouton peut envoyer dans le
 * vide, et une route peut n'être appelée par personne. Aucune des deux ne le
 * dit seule.
 */
const apiRequest = vi.fn();

vi.mock('~/lib/enterprise-api.server', async () => {
  const actual = await vi.importActual<typeof import('~/lib/enterprise-api.server')>('~/lib/enterprise-api.server');
  return { ...actual, apiRequest: (...args: unknown[]) => apiRequest(...args) };
});

function actionArgs(fields: Record<string, string>, projectId = 'proj-42') {
  const form = new FormData();

  for (const [k, v] of Object.entries(fields)) {
    form.append(k, v);
  }

  return {
    request: new Request(`https://app.test/api/projects/${projectId}/ide-panel/deployments`, {
      method: 'POST',
      body: form,
    }),
    params: { projectId, panel: 'deployments' },
  } as any;
}

function readJson(result: any): any {
  return result && typeof result === 'object' && 'data' in result ? result.data : result;
}

describe('les gestes « Gérer votre application » atteignent la route', () => {
  afterEach(() => apiRequest.mockReset());

  for (const intent of ['rollback', 'redeploy', 'cancel']) {
    it(`${intent} POSTe la route backend et rend ok:true`, async () => {
      apiRequest.mockResolvedValueOnce({});

      const { action } = await import('./api.projects.$projectId.ide-panel.$panel');
      const body = readJson(await action(actionArgs({ intent, deploymentId: 'dep_9' })));

      expect(apiRequest).toHaveBeenCalledTimes(1);

      const [, url, init] = apiRequest.mock.calls[0];

      expect(url).toBe(`/projects/proj-42/deployments/dep_9/${intent}`);
      expect(init.method).toBe('POST');
      expect(body).toEqual({ ok: true });
    });
  }

  it('un deploymentId vide est refusé 400 AVANT tout appel backend', async () => {
    const { action } = await import('./api.projects.$projectId.ide-panel.$panel');

    const thrown = await action(actionArgs({ intent: 'rollback', deploymentId: '  ' })).then(
      () => null,
      (e: unknown) => e,
    );
    expect((thrown as any)?.init?.status).toBe(400);
    expect(apiRequest).not.toHaveBeenCalled();
  });
});
