import { describe, expect, it } from 'vitest';
import { buildApiApp } from '../app.js';
import { TestApiStore } from './test-api-store.js';

/*
 * BUG-QA1006-LECTEUR-CREE-DES-INSTANTANES — balayage des rôles du 2026-10-06 :
 * sur les 91 routes d'écriture d'un projet, un membre en LECTURE SEULE
 * (`viewer`) est refusé partout, sauf par l'outil `create_snapshot` de
 * `POST /projects/:id/ai/tools/:toolName`. Les 8 autres outils qui écrivent
 * exigent `workspaces:write` ; celui-ci manquait à la liste, et un lecteur
 * pouvait créer des instantanés (du stockage, compté au projet).
 */

async function banc() {
  const store = new TestApiStore();
  const app = await buildApiApp({ store });

  const inscrire = async (email: string, organizationName: string) => {
    const reponse = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email, password: 'password123', name: email, organizationName },
    });

    expect(reponse.statusCode, reponse.body).toBe(201);

    return reponse.json() as { token: string; organization: { id: string } };
  };

  const proprio = await inscrire(`proprio-${Date.now()}@example.com`, 'Atelier');
  await store.upsertSubscription({ organizationId: proprio.organization.id, planKey: 'team', status: 'ACTIVE' });

  const projet = await app.inject({
    method: 'POST',
    url: `/orgs/${proprio.organization.id}/projects`,
    headers: { authorization: `Bearer ${proprio.token}` },
    payload: { name: 'Projet' },
  });

  expect(projet.statusCode, projet.body).toBe(201);

  const projectId = projet.json().project.id as string;

  const membre = async (roleKey: string) => {
    const email = `${roleKey}-${Date.now()}@example.com`;
    const invitation = await app.inject({
      method: 'POST',
      url: `/orgs/${proprio.organization.id}/invitations`,
      headers: { authorization: `Bearer ${proprio.token}` },
      payload: { email, roleKey },
    });

    expect(invitation.statusCode, invitation.body).toBe(201);

    const compte = await inscrire(email, `Perso ${roleKey}`);
    const acceptation = await app.inject({
      method: 'POST',
      url: '/invitations/accept',
      headers: { authorization: `Bearer ${compte.token}` },
      payload: { token: invitation.json().token },
    });

    expect(acceptation.statusCode, acceptation.body).toBe(200);

    return compte.token;
  };

  const outil = (jeton: string, nom: string) =>
    app.inject({
      method: 'POST',
      url: `/projects/${projectId}/ai/tools/${nom}`,
      headers: { authorization: `Bearer ${jeton}` },
      payload: {},
    });

  return { app, membre, outil };
}

describe('outils de l’agent — un membre en lecture seule ne crée pas d’instantané', () => {
  it('lecteur : create_snapshot est refusé, comme les autres outils qui écrivent', async () => {
    const { app, membre, outil } = await banc();
    const lecteur = await membre('viewer');

    const reponse = await outil(lecteur, 'create_snapshot');

    // Mesuré AVANT correctif : la garde laissait passer (502 du gestionnaire d'espaces, absent du banc).
    expect(reponse.statusCode, reponse.body).toBe(403);
    expect(reponse.json().code).toBe('RBAC_FORBIDDEN');

    // Témoin : la même garde refusait déjà write_file.
    expect((await outil(lecteur, 'write_file')).statusCode).toBe(403);

    await app.close();
  });

  it('contre-épreuve — le lecteur garde ses outils de LECTURE, et un éditeur crée toujours ses instantanés', async () => {
    const { app, membre, outil } = await banc();

    expect((await outil(await membre('viewer'), 'list_files')).statusCode).not.toBe(403);
    expect((await outil(await membre('editor'), 'create_snapshot')).statusCode).not.toBe(403);

    await app.close();
  });
});
