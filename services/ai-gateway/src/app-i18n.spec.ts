import { afterEach, describe, expect, it } from 'vitest';

import { buildAiGatewayApp } from './app.js';

const apps: Array<Awaited<ReturnType<typeof buildAiGatewayApp>>> = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe('AI gateway locale boundary', () => {
  it('localizes JSON validation errors and declares Content-Language', async () => {
    const app = await buildAiGatewayApp({
      env: { NODE_ENV: 'test' },
      logger: false,
      agentRunPersistence: null,
    });
    apps.push(app);

    const response = await app.inject({
      method: 'POST',
      url: '/chat/completions',
      headers: { 'accept-language': 'fr-FR, en;q=0.8' },
      payload: {},
    });

    expect(response.statusCode).toBe(400);
    expect(response.headers['content-language']).toBe('fr');
    expect(response.headers.vary).toContain('Accept-Language');
    expect(response.json()).toMatchObject({ error: 'Le champ messages est requis.', code: 'AI_MESSAGES_REQUIRED' });
  });

  it('localizes agent-run request validation', async () => {
    const app = await buildAiGatewayApp({
      env: { NODE_ENV: 'test' },
      logger: false,
      agentRunPersistence: null,
    });
    apps.push(app);

    const response = await app.inject({
      method: 'POST',
      url: '/v1/agent-runs',
      headers: { 'accept-language': 'fr' },
      payload: [],
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe('Le corps de la requête doit être un objet.');
  });
});
