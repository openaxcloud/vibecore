import { afterEach, describe, expect, it } from 'vitest';

import { buildApiApp } from '../app.js';
import { TestApiStore } from './test-api-store.js';

/**
 * BUG-QA0928-IDEE-PERDUE-INSCRIPTION — le relais de l'idée entre `e-code.ai` et
 * `app.e-code.ai`. L'idée reste côté serveur ; seul un identifiant opaque
 * traverse. Dépôt anonyme, retrait authentifié et UNIQUE.
 */

let fermer: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(fermer.map((f) => f()));
  fermer = [];
});

async function preparer() {
  const precedent = process.env.REDIS_URL;

  // Sans Redis : la table locale, comme pour les tickets runtime.
  delete process.env.REDIS_URL;

  const app = await buildApiApp({ store: new TestApiStore() });

  fermer.push(async () => {
    await app.close();

    if (precedent !== undefined) {
      process.env.REDIS_URL = precedent;
    }
  });

  const inscription = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: {
      email: `relais-${Math.random().toString(36).slice(2, 10)}@example.com`,
      password: 'password123',
      name: 'Relais',
      organizationName: 'Relais Org',
    },
  });

  expect(inscription.statusCode).toBe(201);

  const deposer = (payload: Record<string, unknown>) => app.inject({ method: 'POST', url: '/idea-relays', payload });

  const retirer = (id: string, token?: string) =>
    app.inject({
      method: 'POST',
      url: '/idea-relays/consume',
      payload: { id },
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });

  return { deposer, retirer, token: inscription.json().token as string };
}

describe('relais de l’idée entre les deux domaines', () => {
  it('un visiteur SANS compte dépose son idée et reçoit un identifiant opaque', async () => {
    const { deposer } = await preparer();

    const reponse = await deposer({ idea: 'Herbier avec rappels d’arrosage', mode: 'full-app' });

    expect(reponse.statusCode, reponse.body).toBe(201);
    expect(reponse.json().id).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(reponse.body, 'l’identifiant ne contient pas l’idée').not.toContain('Herbier');
  });

  it('le retrait exige un utilisateur connecté', async () => {
    const { deposer, retirer } = await preparer();
    const { id } = (await deposer({ idea: 'Une idée' })).json();

    expect((await retirer(id)).statusCode).toBe(401);
  });

  it('l’idée est rendue UNE SEULE FOIS — un second retrait ne la trouve plus', async () => {
    const { deposer, retirer, token } = await preparer();
    const { id } = (
      await deposer({ idea: 'Herbier', mode: 'design-first', model: 'claude-x', provider: 'Anthropic' })
    ).json();

    const premier = await retirer(id, token);

    expect(premier.statusCode, premier.body).toBe(200);
    expect(premier.json()).toEqual({ idea: 'Herbier', mode: 'design-first', model: 'claude-x', provider: 'Anthropic' });

    const second = await retirer(id, token);

    expect(second.statusCode).toBe(404);
    expect(second.json().code).toBe('IDEA_RELAY_NOT_FOUND');
  });

  it('refuse un identifiant mal formé et une idée démesurée', async () => {
    const { deposer, retirer, token } = await preparer();

    expect((await retirer('../../etc', token)).statusCode).toBe(400);
    expect((await deposer({ idea: 'x'.repeat(20_001) })).statusCode).toBe(400);
    expect((await deposer({ idea: '   ' })).statusCode).toBe(400);
  });
});
