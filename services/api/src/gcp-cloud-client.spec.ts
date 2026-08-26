import { describe, expect, it, vi } from 'vitest';
import { GcpApiError, RestGcpCloudClient } from './gcp-cloud-client.js';

const tokens = { getAccessToken: async () => 'secret-access-token' };

describe('RestGcpCloudClient hardening', () => {
  it('never collapses a GCP 403 into NOT_FOUND', async () => {
    const fetcher = vi.fn(
      async () => new Response(JSON.stringify({ error: { message: 'permission denied' } }), { status: 403 }),
    );
    const client = new RestGcpCloudClient(tokens, fetcher as typeof fetch, { maxAttempts: 1 });

    await expect(client.getProject('tenant-project')).rejects.toMatchObject({ status: 403, isNotFound: false });
  });

  it('returns null only for a real 404 and never leaks the bearer token in errors', async () => {
    const notFound = new RestGcpCloudClient(
      tokens,
      vi.fn(
        async () => new Response(JSON.stringify({ error: { message: 'missing' } }), { status: 404 }),
      ) as typeof fetch,
      { maxAttempts: 1 },
    );
    await expect(notFound.getProject('tenant-project')).resolves.toBeNull();

    const leakingBody = new RestGcpCloudClient(
      tokens,
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: { message: 'Bearer secret-access-token denied' } }), { status: 400 }),
      ) as typeof fetch,
      { maxAttempts: 1 },
    );
    await expect(leakingBody.getProject('tenant-project')).rejects.not.toThrow(/secret-access-token/);
  });

  it('retries idempotent reads and consumes every pagination page', async () => {
    let call = 0;
    const fetcher = vi.fn(async (url: string | URL | Request) => {
      call += 1;
      if (call === 1) return new Response('busy', { status: 429, headers: { 'retry-after': '0' } });
      const href = String(url);
      return href.includes('pageToken=next')
        ? new Response(JSON.stringify({ items: [{ name: 'bucket-b' }] }))
        : new Response(JSON.stringify({ items: [{ name: 'bucket-a' }], nextPageToken: 'next' }));
    });
    const client = new RestGcpCloudClient(tokens, fetcher as typeof fetch, {
      maxAttempts: 2,
      sleep: async () => undefined,
      random: () => 0,
    });

    await expect(client.listBuckets('tenant-project')).resolves.toEqual([{ name: 'bucket-a' }, { name: 'bucket-b' }]);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('caps a remote Retry-After so a request cannot outlive the worker lease', async () => {
    const sleep = vi.fn(async () => undefined);
    let call = 0;
    const fetcher = vi.fn(async () => {
      call += 1;
      return call === 1
        ? new Response('busy', { status: 429, headers: { 'retry-after': '3600' } })
        : new Response(JSON.stringify({ items: [] }));
    });
    const client = new RestGcpCloudClient(tokens, fetcher as typeof fetch, { maxAttempts: 2, sleep });

    await expect(client.listBuckets('tenant-project')).resolves.toEqual([]);
    expect(sleep).toHaveBeenCalledWith(10_000);
  });

  it('requires an ETag for every IAM write', async () => {
    const fetcher = vi.fn();
    const client = new RestGcpCloudClient(tokens, fetcher as typeof fetch);

    expect(() => client.setProjectIamPolicy('tenant-project', { bindings: [] })).toThrow(GcpApiError);
    try {
      client.setProjectIamPolicy('tenant-project', { bindings: [] });
    } catch (error) {
      expect(error).toMatchObject({ status: 412, isPreconditionFailed: true } satisfies Partial<GcpApiError>);
    }
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('revalidates the operation lease before every irreversible object and bucket delete', async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      if (init?.method === 'GET') {
        return new Response(
          JSON.stringify({
            items: [
              { name: 'first/object', generation: '1' },
              { name: 'second/object', generation: '2' },
            ],
          }),
        );
      }
      return new Response(null, { status: 204 });
    });
    const guard = vi.fn(async () => undefined);
    const client = new RestGcpCloudClient(tokens, fetcher as typeof fetch, { maxAttempts: 1 });

    await client.deleteBucket('tenant-bucket', guard);

    expect(guard).toHaveBeenCalledTimes(3);
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
});
