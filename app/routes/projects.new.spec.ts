/**
 * @vitest-environment node
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { action } from './projects.new';

const ORIGINAL_ENV = {
  SAAS_API_URL: process.env.SAAS_API_URL,
  API_BASE_URL: process.env.API_BASE_URL,
  NODE_ENV: process.env.NODE_ENV,
};

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function buildActionArgs(fields: Record<string, string>): Parameters<typeof action>[0] {
  const body = new URLSearchParams(fields).toString();

  return {
    request: new Request('https://app.e-code.ai/projects/new', {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        cookie: 'vc_session=session-token',
      },
      body,
    }),
    params: {},
    context: { cloudflare: { env: {}, cf: {}, ctx: {}, caches: {} } } as unknown as Parameters<
      typeof action
    >[0]['context'],
  };
}

type QueuedPromptBody = {
  state: {
    chat: {
      pendingPrompt: {
        id: string;
        prompt: string;
        model: string;
        provider: string;
        createdAt: string;
      };
    };
  };
};

describe('projects/new action', () => {
  beforeEach(() => {
    process.env.SAAS_API_URL = 'https://api.example.com';
    delete process.env.API_BASE_URL;
    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(ORIGINAL_ENV) as Array<[string, string | undefined]>) {
      if (value === undefined) {
        delete (process.env as Record<string, string | undefined>)[key];
      } else {
        (process.env as Record<string, string>)[key] = value;
      }
    }

    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('queues the initial project prompt in IDE state and redirects with a short URL', async () => {
    let fromAiBody: Record<string, unknown> | undefined;
    let ideStateBody: QueuedPromptBody | undefined;

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);

        if (url === 'https://api.example.com/orgs') {
          return jsonResponse({ organizations: [{ id: 'org_1' }] });
        }

        if (url === 'https://api.example.com/orgs/org_1/projects/from-ai') {
          fromAiBody = JSON.parse(String(init?.body)) as Record<string, unknown>;

          return jsonResponse({ project: { id: 'project_1' } }, 201);
        }

        if (url === 'https://api.example.com/projects/project_1/ide-state') {
          ideStateBody = JSON.parse(String(init?.body)) as QueuedPromptBody;

          return jsonResponse({ ideState: { state: ideStateBody.state, version: 1 } });
        }

        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    const response = (await action(
      buildActionArgs({
        prompt: 'Build a production analytics dashboard',
        artifactType: 'web',
        provider: 'OpenAI',
        model: 'gpt-4o',
      }),
    )) as Response;

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/projects/project_1/ide');
    expect(response.headers.get('location')).not.toContain('prompt=');
    expect(response.headers.get('location')).not.toContain('model=');
    expect(response.headers.get('location')).not.toContain('provider=');

    expect(fromAiBody?.prompt).toEqual(expect.stringContaining('Production quality bar:'));
    expect(fromAiBody?.prompt).toEqual(expect.stringContaining('Build a production analytics dashboard'));

    const pendingPrompt = ideStateBody?.state?.chat?.pendingPrompt;
    expect(pendingPrompt).toMatchObject({
      prompt: fromAiBody?.prompt,
      model: 'gpt-4o',
      provider: 'OpenAI',
    });
    expect(pendingPrompt.id).toEqual(expect.any(String));
    expect(pendingPrompt.createdAt).toEqual(expect.any(String));
  });

  it('keeps long prompts out of the redirect Location header', async () => {
    const longPrompt = `Build a production scheduling workspace ${'with calendar approvals '.repeat(250)}`.slice(
      0,
      7_900,
    );

    let queuedPromptLength = 0;

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);

        if (url === 'https://api.example.com/orgs') {
          return jsonResponse({ organizations: [{ id: 'org_1' }] });
        }

        if (url === 'https://api.example.com/orgs/org_1/projects/from-ai') {
          return jsonResponse({ project: { id: 'project_long' } }, 201);
        }

        if (url === 'https://api.example.com/projects/project_long/ide-state') {
          const body = JSON.parse(String(init?.body)) as QueuedPromptBody;
          queuedPromptLength = body.state.chat.pendingPrompt.prompt.length;

          return jsonResponse({ ideState: { state: body.state, version: 1 } });
        }

        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    const response = (await action(
      buildActionArgs({
        prompt: longPrompt,
        artifactType: 'web',
        provider: 'OpenAI',
        model: 'gpt-4o',
      }),
    )) as Response;

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/projects/project_long/ide');
    expect(response.headers.get('location')!.length).toBeLessThan(128);
    expect(queuedPromptLength).toBeGreaterThan(longPrompt.length);
  });

  it('returns an inline error when AI project creation hits the project quota', async () => {
    let attemptedFallbackCreate = false;

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);

        if (url === 'https://api.example.com/orgs') {
          return jsonResponse({ organizations: [{ id: 'org_1' }] });
        }

        if (url === 'https://api.example.com/orgs/org_1/projects/from-ai') {
          return jsonResponse({ error: 'Quota exceeded for projects.count', code: 'QUOTA_EXCEEDED' }, 429);
        }

        if (url === 'https://api.example.com/orgs/org_1/projects') {
          attemptedFallbackCreate = true;
          return jsonResponse({ project: { id: 'project_fallback' } }, 201);
        }

        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    const response = (await action(
      buildActionArgs({
        prompt: 'Build a production analytics dashboard',
        artifactType: 'web',
        provider: 'OpenAI',
        model: 'gpt-4o',
      }),
    )) as { error?: string };

    expect(response.error).toMatch(/project limit/i);
    expect(attemptedFallbackCreate).toBe(false);
  });

  it('returns an inline error when blank project creation hits the project quota', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);

        if (url === 'https://api.example.com/orgs') {
          return jsonResponse({ organizations: [{ id: 'org_1' }] });
        }

        if (url === 'https://api.example.com/orgs/org_1/projects') {
          return jsonResponse({ error: 'Quota exceeded for projects.count', code: 'QUOTA_EXCEEDED' }, 429);
        }

        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    const response = (await action(
      buildActionArgs({
        name: 'Manual project',
        artifactType: 'web',
        provider: 'OpenAI',
        model: 'gpt-4o',
      }),
    )) as { error?: string };

    expect(response.error).toMatch(/project limit/i);
  });
});
