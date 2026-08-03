/**
 * @vitest-environment node
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { loader } from './api.projects.$projectId.collaboration-ws';
import { toResponse } from '~/lib/test/rr7-data';

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function request(url: string, headers: Record<string, string> = {}) {
  return new Request(url, {
    headers: { cookie: 'vc_session=session-token', ...headers },
  });
}

const ENV_KEYS = [
  'API_BASE_URL',
  'API_HOST',
  'API_PORT',
  'PUBLIC_API_BASE_URL',
  'SAAS_API_URL',
  'VITE_API_URL',
  'VITE_PUBLIC_API_BASE_URL',
] as const;

describe('project collaboration websocket loader', () => {
  let originalEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>;

  beforeEach(() => {
    originalEnv = {};

    for (const key of ENV_KEYS) {
      originalEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      const value = originalEnv[key];

      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }

    vi.unstubAllGlobals();
  });

  it('returns a public wss API URL for the production app domain', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          ticket: 'ticket-1',
          sessionId: 'session-1',
          expiresInSeconds: 60,
          websocketPath: '/projects/project-1/collaboration/ws',
        }),
      ),
    );

    const response = toResponse(
      await loader({
        request: request('http://app.e-code.ai/api/projects/project-1/collaboration-ws?sessionId=session-1', {
          'x-forwarded-proto': 'https',
          'x-forwarded-host': 'app.e-code.ai',
        }),
        params: { projectId: 'project-1' },
        context: {} as Parameters<typeof loader>[0]['context'],
      }),
    );

    const payload = (await response.json()) as { websocketUrl: string };

    expect(payload.websocketUrl).toBe(
      'wss://api.e-code.ai/projects/project-1/collaboration/ws?ticket=ticket-1&sessionId=session-1',
    );
  });

  it('rewrites the bare app domain (e-code.ai) to the api host for the collaboration websocket', async () => {
    /*
     * Regression: e-code.ai serves the app but does NOT start with "app.", so the
     * ticket used to return wss://e-code.ai/... (web service → 404) and live
     * sharing never connected. It must target the API host: api.e-code.ai.
     */
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          ticket: 'ticket-3',
          sessionId: 'session-3',
          expiresInSeconds: 60,
          websocketPath: '/projects/project-3/collaboration/ws',
        }),
      ),
    );

    const response = toResponse(
      await loader({
        request: request('http://e-code.ai/api/projects/project-3/collaboration-ws?sessionId=session-3', {
          'x-forwarded-proto': 'https',
        }),
        params: { projectId: 'project-3' },
        context: {} as Parameters<typeof loader>[0]['context'],
      }),
    );

    const payload = (await response.json()) as { websocketUrl: string };

    expect(payload.websocketUrl).toBe(
      'wss://api.e-code.ai/projects/project-3/collaboration/ws?ticket=ticket-3&sessionId=session-3',
    );
  });

  it('honours the configured PUBLIC_API_BASE_URL (read via globalThis.process.env, not the SSR-shimmed process.env)', async () => {
    process.env.PUBLIC_API_BASE_URL = 'https://api.e-code.ai';

    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          ticket: 'ticket-4',
          sessionId: 'session-4',
          expiresInSeconds: 60,
          websocketPath: '/projects/project-4/collaboration/ws',
        }),
      ),
    );

    const response = toResponse(
      await loader({
        request: request('http://e-code.ai/api/projects/project-4/collaboration-ws?sessionId=session-4', {
          'x-forwarded-proto': 'https',
        }),
        params: { projectId: 'project-4' },
        context: {} as Parameters<typeof loader>[0]['context'],
      }),
    );

    const payload = (await response.json()) as { websocketUrl: string };

    expect(payload.websocketUrl).toBe(
      'wss://api.e-code.ai/projects/project-4/collaboration/ws?ticket=ticket-4&sessionId=session-4',
    );
  });

  it('keeps localhost websocket URLs on the local API base', async () => {
    process.env.API_HOST = '127.0.0.1';
    process.env.API_PORT = '3001';

    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          ticket: 'ticket-2',
          sessionId: 'session-2',
          expiresInSeconds: 60,
          websocketPath: '/projects/project-2/collaboration/ws',
        }),
      ),
    );

    const response = toResponse(
      await loader({
        request: request('http://localhost:5173/api/projects/project-2/collaboration-ws?sessionId=session-2'),
        params: { projectId: 'project-2' },
        context: {} as Parameters<typeof loader>[0]['context'],
      }),
    );

    const payload = (await response.json()) as { websocketUrl: string };

    expect(payload.websocketUrl).toBe(
      'ws://127.0.0.1:3001/projects/project-2/collaboration/ws?ticket=ticket-2&sessionId=session-2',
    );
  });
});
