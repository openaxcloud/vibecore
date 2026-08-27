import { describe, expect, it, vi } from 'vitest';

import { buildPreviewProxyApp } from './app.js';
import { deploymentAccessCookieName } from './deployment-access-gate.js';

const DOMAIN = 'preview.e-code.test';
const DEPLOYMENT_ID = 'cmdeploymentaccess001';
const SECRET = 'proxy-shared-secret';
const APP_BYTES = 'PRIVATE APPLICATION BYTES';

type Mode = 'PUBLIC' | 'PASSWORD_PROTECTED' | 'WORKSPACE_ONLY' | 'INVITE_ONLY';

function harness(
  initialMode: Mode,
  options: { failVerdict?: boolean; malformedAllow?: boolean; allowProof?: string } = {},
) {
  let mode = initialMode;

  const applicationRequests: Array<{ url: string; headers: Headers }> = [];
  const verdictRequests: Array<{ url: string; headers: Headers }> = [];
  const mutationRequests: Array<{ url: string; body: string }> = [];

  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const headers = new Headers(init?.headers);

    if (url.endsWith('/access/verdict')) {
      verdictRequests.push({ url, headers });

      if (options.failVerdict) {
        throw new Error('control plane unavailable');
      }

      const proof = headers.get('x-vibecore-deployment-access-cookie');

      if (options.malformedAllow) {
        return Response.json({
          decision: 'allow',
          mode: 'CORRUPT_POLICY',
          cookieName: deploymentAccessCookieName(DEPLOYMENT_ID),
        });
      }

      if (mode === 'PUBLIC') {
        return Response.json({ decision: 'allow', mode, cookieName: deploymentAccessCookieName(DEPLOYMENT_ID) });
      }

      if (proof && proof === options.allowProof) {
        return Response.json({ decision: 'allow', mode, cookieName: deploymentAccessCookieName(DEPLOYMENT_ID) });
      }

      if (mode === 'PASSWORD_PROTECTED') {
        return Response.json({
          decision: 'password-required',
          mode,
          cookieName: deploymentAccessCookieName(DEPLOYMENT_ID),
        });
      }

      return Response.json({
        decision: 'sign-in-required',
        mode,
        cookieName: deploymentAccessCookieName(DEPLOYMENT_ID),
        signInUrl: `https://app.e-code.test/deployment-access/${DEPLOYMENT_ID}`,
      });
    }

    if (url.endsWith('/access/password') || url.endsWith('/access/exchange')) {
      mutationRequests.push({ url, body: String(init?.body ?? '') });
      return new Response(null, {
        status: 204,
        headers: {
          'set-cookie': `${deploymentAccessCookieName(DEPLOYMENT_ID)}=${options.allowProof ?? 'valid-proof'}; Path=/; HttpOnly; SameSite=Lax`,
        },
      });
    }

    if (url.endsWith('/serving-state')) {
      return Response.json({
        state: 'live',
        planEntitlements: { version: '2026-08-27.1', badgeRequired: false },
      });
    }

    applicationRequests.push({ url, headers });

    return new Response(APP_BYTES, {
      status: 200,
      headers: { 'content-type': 'text/plain', 'cache-control': 'public' },
    });
  }) as unknown as typeof fetch;

  return {
    fetchImpl,
    applicationRequests,
    verdictRequests,
    mutationRequests,
    setMode(next: Mode) {
      mode = next;
    },
  };
}

async function proxy(fetchImpl: typeof fetch) {
  return buildPreviewProxyApp({
    previewDomain: DOMAIN,
    apiBaseUrl: 'http://api.internal',
    proxySharedSecret: SECRET,
    enforceDeploymentAccess: true,
    fetchImpl,
    serverDeployUpstreamTemplate: 'http://app-{deploymentId}.workspaces.svc.cluster.local',
  });
}

describe('dedicated deployment origin access gate', () => {
  it.each(['s', 'd'] as const)('%s-* serves zero app bytes before the password gate', async (prefix) => {
    const test = harness('PASSWORD_PROTECTED', { allowProof: 'valid-proof' });
    const app = await proxy(test.fetchImpl);

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/private/route?x=1',
        headers: { host: `${prefix}-${DEPLOYMENT_ID}.${DOMAIN}`, 'accept-language': 'en' },
      });
      expect(response.statusCode).toBe(401);
      expect(response.body).toContain('This deployment is private');
      expect(response.body).not.toContain(APP_BYTES);
      expect(test.applicationRequests).toHaveLength(0);
      expect(response.headers['cache-control']).toContain('no-store');
    } finally {
      await app.close();
    }
  });

  it('supports password POST/Set-Cookie and filters the proof from both upstream classes', async () => {
    const test = harness('PASSWORD_PROTECTED', { allowProof: 'valid-proof' });
    const app = await proxy(test.fetchImpl);
    const cookieName = deploymentAccessCookieName(DEPLOYMENT_ID);

    try {
      const submitted = await app.inject({
        method: 'POST',
        url: '/__vibecore/access/password',
        headers: {
          host: `s-${DEPLOYMENT_ID}.${DOMAIN}`,
          'content-type': 'application/x-www-form-urlencoded',
        },
        payload: 'password=correct-horse&returnTo=%2Fdashboard%3Ftab%3D1',
      });
      expect(submitted.statusCode).toBe(303);
      expect(submitted.headers.location).toBe('/dashboard?tab=1');
      expect(String(submitted.headers['set-cookie'])).toContain(`${cookieName}=valid-proof`);
      expect(test.mutationRequests[0].url).not.toContain('correct-horse');
      expect(test.mutationRequests[0].body).toContain('correct-horse');

      for (const prefix of ['s', 'd'] as const) {
        test.applicationRequests.length = 0;

        const response = await app.inject({
          method: 'GET',
          url: '/dashboard',
          headers: {
            host: `${prefix}-${DEPLOYMENT_ID}.${DOMAIN}`,
            cookie: `${cookieName}=valid-proof; app_session=application-cookie`,
          },
        });
        expect(response.statusCode).toBe(200);
        expect(response.body).toBe(APP_BYTES);
        expect(response.headers['cache-control']).toContain('no-store');

        const upstream = test.applicationRequests[0];

        if (prefix === 's') {
          expect(upstream.headers.get('cookie')).toBeNull();
          expect(upstream.headers.get('authorization')).toBe(`Bearer ${SECRET}`);
        } else {
          expect(upstream.headers.get('cookie')).toBe('app_session=application-cookie');
        }

        const verdict = test.verdictRequests.at(-1)!;
        expect(verdict.headers.get('x-vibecore-deployment-access-cookie')).toBe('valid-proof');
        expect(verdict.headers.get('x-vibecore-access-client-key')).toMatch(/^[a-f0-9]{64}$/);
        expect(verdict.headers.get('cookie')).toBeNull();
      }
    } finally {
      await app.close();
    }
  });

  it('keeps exchange tickets in the POST body and blocks replay/invalid verdict paths from workloads', async () => {
    const test = harness('INVITE_ONLY', { allowProof: 'user-proof' });
    const app = await proxy(test.fetchImpl);

    try {
      const blocked = await app.inject({
        method: 'GET',
        url: '/',
        headers: { host: `d-${DEPLOYMENT_ID}.${DOMAIN}`, 'accept-language': 'fr' },
      });
      expect(blocked.statusCode).toBe(401);
      expect(blocked.body).toContain('Connexion requise');
      expect(test.applicationRequests).toHaveLength(0);

      const exchange = await app.inject({
        method: 'POST',
        url: '/__vibecore/access/exchange',
        headers: {
          host: `d-${DEPLOYMENT_ID}.${DOMAIN}`,
          'content-type': 'application/x-www-form-urlencoded',
        },
        payload: 'ticket=dep_access_one_shot_secret&returnTo=%2Fprivate',
      });
      expect(exchange.statusCode).toBe(303);
      expect(test.mutationRequests[0].url).not.toContain('dep_access_one_shot_secret');
      expect(test.mutationRequests[0].body).toContain('dep_access_one_shot_secret');
      expect(test.applicationRequests).toHaveLength(0);
    } finally {
      await app.close();
    }
  });

  it('does not cache access verdicts: rotation and API uncertainty fail closed immediately', async () => {
    const test = harness('PUBLIC');
    const app = await proxy(test.fetchImpl);

    try {
      const first = await app.inject({ method: 'GET', url: '/', headers: { host: `s-${DEPLOYMENT_ID}.${DOMAIN}` } });
      expect(first.statusCode).toBe(200);
      test.setMode('INVITE_ONLY');

      const second = await app.inject({ method: 'GET', url: '/', headers: { host: `s-${DEPLOYMENT_ID}.${DOMAIN}` } });
      expect(second.statusCode).toBe(401);
      expect(test.verdictRequests).toHaveLength(2);
      expect(test.applicationRequests).toHaveLength(1);
    } finally {
      await app.close();
    }

    const unavailable = harness('PUBLIC', { failVerdict: true });
    const locked = await proxy(unavailable.fetchImpl);

    try {
      const response = await locked.inject({
        method: 'GET',
        url: '/asset.js',
        headers: { host: `d-${DEPLOYMENT_ID}.${DOMAIN}` },
      });
      expect(response.statusCode).toBe(503);
      expect(response.body).not.toContain(APP_BYTES);
      expect(unavailable.applicationRequests).toHaveLength(0);
    } finally {
      await locked.close();
    }
  });

  it('rejects a proof cookie belonging to another deployment (tenant/capability isolation)', async () => {
    const test = harness('PASSWORD_PROTECTED', { allowProof: 'valid-proof' });
    const app = await proxy(test.fetchImpl);

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/',
        headers: {
          host: `s-${DEPLOYMENT_ID}.${DOMAIN}`,
          cookie: `${deploymentAccessCookieName('anotherdeployment999')}=valid-proof`,
        },
      });
      expect(response.statusCode).toBe(401);
      expect(test.verdictRequests[0].headers.get('x-vibecore-deployment-access-cookie')).toBeNull();
      expect(test.applicationRequests).toHaveLength(0);
    } finally {
      await app.close();
    }
  });

  it('fails a malformed allow verdict closed before fetching either workload', async () => {
    const test = harness('PUBLIC', { malformedAllow: true });
    const app = await proxy(test.fetchImpl);

    try {
      for (const prefix of ['s', 'd'] as const) {
        const response = await app.inject({
          method: 'GET',
          url: '/should-never-load',
          headers: { host: `${prefix}-${DEPLOYMENT_ID}.${DOMAIN}` },
        });
        expect(response.statusCode).toBe(503);
        expect(response.body).not.toContain(APP_BYTES);
      }

      expect(test.applicationRequests).toHaveLength(0);
    } finally {
      await app.close();
    }
  });
});
