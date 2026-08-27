import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ECODE_NOTIFICATION_PREFERENCES,
  ecodeNotificationPreferencesAction,
  notificationMutationAction,
  notificationsCollectionAction,
  normalizeEcodeNotificationPreferences,
  readJsonObject,
} from './ecode-public-shell.server';

type RouteData<T> = {
  data: T;
  init: { headers?: HeadersInit; status?: number };
  type: 'DataWithResponseInit';
};

function routeData<T>(value: unknown): RouteData<T> {
  expect((value as RouteData<T>)?.type).toBe('DataWithResponseInit');

  return value as RouteData<T>;
}

describe('readJsonObject', () => {
  it('reads the JSON body when content-length is present', async () => {
    const body = { email: { marketing: true } };

    const request = new Request('https://example.com/prefs', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

    await expect(readJsonObject(request)).resolves.toEqual(body);
  });

  it('reads the JSON body for a chunked request without a content-length header', async () => {
    /*
     * Simulate a chunked-transfer-encoding request: a real JSON body but no
     * content-length header. The previous short-circuit dropped this body and
     * overwrote the user's preferences with defaults.
     */
    const body = { email: { marketing: true }, frequency: 'weekly' };

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(JSON.stringify(body)));
        controller.close();
      },
    });

    const request = new Request('https://example.com/prefs', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: stream,
      duplex: 'half',
    } as RequestInit & { duplex: 'half' });

    expect(request.headers.get('content-length')).toBeNull();
    await expect(readJsonObject(request)).resolves.toEqual(body);
  });

  it('returns an empty object when the body is not valid JSON', async () => {
    const request = new Request('https://example.com/prefs', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: 'not-json',
    });

    await expect(readJsonObject(request)).resolves.toEqual({});
  });

  it('returns an empty object when the body is an array (non-object JSON)', async () => {
    const request = new Request('https://example.com/prefs', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify([1, 2, 3]),
    });

    await expect(readJsonObject(request)).resolves.toEqual({});
  });

  it('preserves the user toggle through normalization for a chunked request', async () => {
    /*
     * End-to-end: a chunked PATCH that disables marketing-via-default and turns
     * OFF a toggle must NOT be normalized back to defaults.
     */
    const body = { email: { security: false } };

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(JSON.stringify(body)));
        controller.close();
      },
    });

    const request = new Request('https://example.com/prefs', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: stream,
      duplex: 'half',
    } as RequestInit & { duplex: 'half' });

    const parsed = await readJsonObject(request);
    const normalized = normalizeEcodeNotificationPreferences(parsed);

    expect(normalized.email.security).toBe(false);

    // sanity: defaults would have left security enabled
    expect(DEFAULT_ECODE_NOTIFICATION_PREFERENCES.email.security).toBe(true);
  });
});

describe('localized notification actions', () => {
  it('localizes method errors from Accept-Language and emits locale headers', async () => {
    const response = routeData<{ error: string }>(
      await notificationsCollectionAction({
        request: new Request('https://example.com/api/notifications', {
          method: 'PUT',
          headers: { 'Accept-Language': 'fr-FR,fr;q=0.9' },
        }),
        params: {},
        context: {},
      }),
    );

    const headers = new Headers(response.init.headers);
    expect(response.init.status).toBe(405);
    expect(headers.get('Content-Language')).toBe('fr');
    expect(headers.get('Vary')).toBe('Cookie, Accept-Language');
    expect(headers.get('Cache-Control')).toBe('no-store');
    expect(response.data).toMatchObject({ error: 'Méthode non autorisée' });
  });

  it('gives the manual English cookie precedence over French browser detection', async () => {
    const response = routeData<{ error: string }>(
      await ecodeNotificationPreferencesAction({
        request: new Request('https://example.com/api/notifications/preferences', {
          method: 'PATCH',
          headers: { Cookie: 'vibecore-lang=en', 'Accept-Language': 'fr-FR' },
        }),
        params: {},
        context: {},
      }),
    );

    expect(response.init.status).toBe(401);
    expect(new Headers(response.init.headers).get('Content-Language')).toBe('en');
    expect(response.data).toMatchObject({ error: 'Authentication required' });
  });

  it('localizes a missing notification identifier without calling the API', async () => {
    const response = routeData<{ error: string }>(
      await notificationMutationAction({
        request: new Request('https://example.com/api/notifications/missing?lang=fr', { method: 'PATCH' }),
        params: {},
        context: {},
      }),
    );

    expect(response.init.status).toBe(400);
    expect(new Headers(response.init.headers).get('Content-Language')).toBe('fr');
    expect(response.data).toMatchObject({ error: 'Identifiant de notification manquant' });
  });
});
