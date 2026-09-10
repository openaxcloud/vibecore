import { encryptJson } from '@vibecore/security';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { deliverSiemAbuseSignal } from '../app.js';
import { TestApiStore } from './test-api-store.js';

/*
 * AUDX-006 — SIEM webhook delivery re-checks its destination.
 *
 * The existing code already refuses to FOLLOW redirects, and its comment states
 * the deeper problem out loud: the URL "is validated only at config time". DNS
 * is not config. A hostname that resolved to a public address when the webhook
 * was saved can resolve to 169.254.169.254 today, and this in-cluster pod would
 * deliver a signed request there — classic rebinding, no redirect needed.
 *
 * These drive the REAL delivery function, not a helper, so the assertion is
 * about whether a request leaves the pod.
 */
const PAYLOAD = {
  organizationId: 'org_1',
  abuseEventId: 'evt_1',
  type: 'usage',
  severity: 'high',
  reason: 'test',
  action: 'flagged',
};

afterEach(() => {
  vi.restoreAllMocks();
});

async function withWebhook(url: string) {
  const store = new TestApiStore();
  await store.createSiemWebhook({
    organizationId: 'org_1',
    url,
    secret: 'shh',
    secretCiphertext: encryptJson({ secret: 'shh' }, 'test-encryption-secret'),
    enabled: true,
  });

  const fetchMock = vi.fn(async () => new Response('', { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);

  return { store, fetchMock, resolveHost: async () => ['93.184.216.34'] };
}

describe('AUDX-006 SIEM webhook delivery guard', () => {
  it('does not deliver to the cloud metadata address', async () => {
    const { store, fetchMock, resolveHost } = await withWebhook('http://169.254.169.254/ingest');

    await deliverSiemAbuseSignal(store, PAYLOAD, { resolveHost });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not deliver to a loopback address', async () => {
    const { store, fetchMock, resolveHost } = await withWebhook('http://127.0.0.1:9200/ingest');

    await deliverSiemAbuseSignal(store, PAYLOAD, { resolveHost });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not deliver to an RFC1918 address', async () => {
    const { store, fetchMock, resolveHost } = await withWebhook('http://10.0.0.5/ingest');

    await deliverSiemAbuseSignal(store, PAYLOAD, { resolveHost });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  /*
   * Rule 19: a customer's real SIEM endpoint must still receive its events. A
   * guard that silently stops all deliveries would be discovered as an outage,
   * not as a fix.
   */
  it('still delivers to an ordinary public endpoint', async () => {
    const { store, fetchMock, resolveHost } = await withWebhook('https://siem.example.com/ingest');

    await deliverSiemAbuseSignal(store, PAYLOAD, { resolveHost });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
