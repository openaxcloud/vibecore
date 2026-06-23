import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ECODE_NOTIFICATION_PREFERENCES,
  normalizeEcodeNotificationPreferences,
  readJsonObject,
} from './ecode-public-shell.server';

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
