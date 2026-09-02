/*
 * Les domaines d'un projet relèvent de l'organisation DU PROJET.
 *
 * Le défaut : loader et action prenaient `organizations[0]` — la première
 * organisation de l'utilisateur. Tant qu'un utilisateur n'appartient qu'à une
 * organisation, les deux coïncident : 295 utilisateurs sur 295 en production le
 * 2026-09-02, ce qui rendait le défaut invisible.
 *
 * ⚠️ Ce n'est PAS un défaut d'isolation : `organizations[0]` reste une
 * organisation dont l'utilisateur est membre, donc aucune fuite entre
 * locataires. C'est un défaut de PORTÉE — vérifié avant de le classer.
 *
 * Le piège était en ÉCRITURE : un domaine ajouté depuis un projet de
 * l'organisation B serait allé dans A, sans erreur ni message.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const apiRequestMock = vi.hoisted(() => vi.fn());

vi.mock('~/lib/enterprise-api.server', () => ({
  apiRequest: (...args: unknown[]) => apiRequestMock(...args),
  json: (data: unknown, init?: ResponseInit) => Response.json(data as never, init),
  firstOrganization: () => {
    throw new Error('firstOrganization ne doit plus etre appelee : elle ignore le projet');
  },
  firstOrganizationOrNull: () => {
    throw new Error('firstOrganizationOrNull ne doit plus etre appelee : elle ignore le projet');
  },
  formObject: (f: FormData) => Object.fromEntries(f),
  redirect: (url: string) => Response.redirect(new URL(url, 'https://app.e-code.ai'), 302),
}));

vi.mock('~/lib/route-reauth', () => ({ isReauthRedirect: () => false }));

const PROJET = 'p-de-l-organisation-B';
const ORG_DU_PROJET = 'org-B';
const PREMIERE_ORG = 'org-A';

/*
 * Routeur TOLERANT : il ne juge pas, il sert. Les assertions portent sur les
 * appels enregistres — une premiere version levait sur tout chemin inconnu et
 * echouait sur un appel parasite sans argument, alors que les appels reels
 * etaient justes.
 */
function router(chemins: Record<string, unknown>) {
  return (...args: unknown[]) => Promise.resolve(chemins[String(args[1])] ?? {});
}

/** Chemins effectivement demandes a l'API, dans l'ordre. */
function cheminsDemandes(): string[] {
  return apiRequestMock.mock.calls.map((c) => String(c[1])).filter((c) => c !== 'undefined');
}

describe('domaines d’un projet — portée', () => {
  beforeEach(() => apiRequestMock.mockReset());

  it('1. le loader interroge l’organisation DU PROJET', async () => {
    apiRequestMock.mockImplementation(
      router({
        [`/projects/${PROJET}`]: { project: { id: PROJET, name: 'B', organizationId: ORG_DU_PROJET } },
        [`/orgs/${ORG_DU_PROJET}`]: { organization: { id: ORG_DU_PROJET, name: 'Organisation B' } },
        [`/orgs/${ORG_DU_PROJET}/domains`]: { domains: [] },
      }),
    );

    const { loader } = await import('./projects.$projectId.domains');

    const rep = await loader({
      request: new Request('https://app.e-code.ai/projects/p/domains'),
      params: { projectId: PROJET },
    } as never);

    expect(rep).toBeTruthy();

    const chemins = cheminsDemandes();

    expect(chemins).toContain(`/orgs/${ORG_DU_PROJET}/domains`);
    expect(chemins.some((c) => c.includes(PREMIERE_ORG))).toBe(false);
  });

  it('2. l’action ÉCRIT dans l’organisation du projet — le cœur du piège', async () => {
    apiRequestMock.mockImplementation(
      router({
        [`/projects/${PROJET}`]: { project: { id: PROJET, name: 'B', organizationId: ORG_DU_PROJET } },
        [`/orgs/${ORG_DU_PROJET}/domains`]: { ok: true },
      }),
    );

    const form = new FormData();
    form.set('intent', 'add');
    form.set('domain', 'exemple.test');

    const { action } = await import('./projects.$projectId.domains');
    await action({
      request: new Request('https://app.e-code.ai/projects/p/domains', { method: 'POST', body: form }),
      params: { projectId: PROJET },
    } as never);

    const ecritures = cheminsDemandes().filter((c) => c.endsWith('/domains'));

    expect(ecritures.length).toBeGreaterThan(0);
    expect(ecritures.every((c) => c.includes(ORG_DU_PROJET))).toBe(true);
    expect(ecritures.some((c) => c.includes(PREMIERE_ORG))).toBe(false);
  });
});
