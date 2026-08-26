import { describe, expect, it, vi } from 'vitest';

import { BinaryAuthorizationClient, validateBinaryAuthorizationPolicy } from './binary-authorization-client.js';

const POLICY = {
  resourceName: 'projects/policy-proj/platforms/gke/policies/release-policy',
  etag: 'policy-etag-0001',
};
const TARGET = {
  repo: 'europe-west9-docker.pkg.dev/tenant-proj/tenant-repo/p-project1',
  digest: `sha256:${'a'.repeat(64)}`,
};

const evaluationBody = (
  verdict: 'CONFORMANT' | 'NON_CONFORMANT' | 'ERROR',
  imageUri = `${TARGET.repo}@${TARGET.digest}`,
) => ({
  verdict,
  results: [
    {
      podName: 'ecode-promotion-evaluation',
      kubernetesNamespace: 'default',
      kubernetesServiceAccount: 'default',
      verdict,
      imageResults: [
        {
          imageUri,
          verdict,
          checkSetResult: {
            checkResults: {
              results: [{ evaluationResult: { verdict } }],
            },
          },
        },
      ],
    },
  ],
});

const binaryAuthFetch = (body: unknown, evaluationStatus = 200): typeof fetch =>
  (async (_url, init) =>
    init?.method === 'POST'
      ? new Response(JSON.stringify(body), { status: evaluationStatus })
      : new Response(JSON.stringify({ name: POLICY.resourceName, etag: POLICY.etag }), {
          status: 200,
        })) as typeof fetch;

describe('BinaryAuthorizationClient', () => {
  it('uses ADC and admits only an explicit CONFORMANT verdict for the digest-pinned target', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer adc-token');

      if (init?.method !== 'POST') {
        return new Response(JSON.stringify({ name: POLICY.resourceName, etag: POLICY.etag }), { status: 200 });
      }

      const body = JSON.parse(String(init?.body)) as { resource: { spec: { containers: Array<{ image: string }> } } };
      expect(body.resource.spec.containers[0]?.image).toBe(`${TARGET.repo}@${TARGET.digest}`);

      return new Response(JSON.stringify(evaluationBody('CONFORMANT')), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as unknown as typeof fetch;
    const client = new BinaryAuthorizationClient({
      fetchImpl,
      tokenProvider: { getAccessToken: async () => 'adc-token' },
    });
    await expect(client.evaluate(POLICY, TARGET)).resolves.toEqual({
      admitted: true,
      verdict: 'CONFORMANT',
      policyEtag: POLICY.etag,
    });
  });

  it.each(['NON_CONFORMANT', 'ERROR'] as const)('fails closed on %s', async (verdict) => {
    const client = new BinaryAuthorizationClient({
      fetchImpl: binaryAuthFetch(evaluationBody(verdict)),
      tokenProvider: { getAccessToken: async () => 'adc-token' },
    });
    await expect(client.evaluate(POLICY, TARGET)).resolves.toEqual({
      admitted: false,
      verdict,
      policyEtag: POLICY.etag,
    });
  });

  it('fails closed on HTTP/malformed results and does not echo a token-bearing body', async () => {
    const client = new BinaryAuthorizationClient({
      fetchImpl: async (_url, init) =>
        init?.method === 'POST'
          ? new Response('Bearer secret-token', { status: 503 })
          : new Response(JSON.stringify({ name: POLICY.resourceName, etag: POLICY.etag }), { status: 200 }),
      tokenProvider: { getAccessToken: async () => 'secret-token' },
    });
    await expect(client.evaluate(POLICY, TARGET)).rejects.toMatchObject({ code: 'BINAUTHZ_EVALUATION_FAILED' });
    await expect(client.evaluate(POLICY, TARGET)).rejects.not.toThrow(/secret-token/u);
  });

  it.each([
    { verdict: 'CONFORMANT', results: [] },
    evaluationBody('CONFORMANT', `${TARGET.repo}@sha256:${'b'.repeat(64)}`),
    {
      ...evaluationBody('CONFORMANT'),
      results: [{ ...evaluationBody('CONFORMANT').results[0], verdict: 'ERROR' }],
    },
    {
      ...evaluationBody('CONFORMANT'),
      results: [
        {
          ...evaluationBody('CONFORMANT').results[0],
          imageResults: [
            {
              imageUri: `${TARGET.repo}@${TARGET.digest}`,
              verdict: 'CONFORMANT',
              checkSetResult: { checkResults: { results: [] } },
            },
          ],
        },
      ],
    },
    {
      ...evaluationBody('CONFORMANT'),
      results: [
        {
          ...evaluationBody('CONFORMANT').results[0],
          imageResults: [
            {
              imageUri: `${TARGET.repo}@${TARGET.digest}`,
              verdict: 'CONFORMANT',
              checkSetResult: { checkResults: { results: [{ allowlistResult: { pattern: '*' } }] } },
            },
          ],
        },
      ],
    },
  ])('rejects a CONFORMANT envelope whose Pod/image evidence is missing or mismatched', async (body) => {
    const client = new BinaryAuthorizationClient({
      fetchImpl: binaryAuthFetch(body),
      tokenProvider: { getAccessToken: async () => 'adc-token' },
    });
    await expect(client.evaluate(POLICY, TARGET)).rejects.toMatchObject({ code: 'BINAUTHZ_RESPONSE_INVALID' });
  });

  it('strictly validates policy resource, namespace and service account', () => {
    expect(() => validateBinaryAuthorizationPolicy(POLICY)).not.toThrow();
    expect(() =>
      validateBinaryAuthorizationPolicy({ resourceName: 'projects/policy-proj/policy', etag: POLICY.etag }),
    ).toThrow();
    expect(() => validateBinaryAuthorizationPolicy({ ...POLICY, namespace: '../escape' })).toThrow();
    expect(() => validateBinaryAuthorizationPolicy({ ...POLICY, etag: '*' })).toThrow();
  });

  it('refuses evaluation when the live policy etag differs from the configured revision', async () => {
    const client = new BinaryAuthorizationClient({
      fetchImpl: async () =>
        new Response(JSON.stringify({ name: POLICY.resourceName, etag: 'policy-etag-0002' }), { status: 200 }),
      tokenProvider: { getAccessToken: async () => 'adc-token' },
    });
    await expect(client.evaluate(POLICY, TARGET)).rejects.toMatchObject({
      code: 'BINAUTHZ_POLICY_REVISION_MISMATCH',
    });
  });
});
