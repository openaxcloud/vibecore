import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildDeploymentUrl } from './deployments.js';
import {
  accessConfigFromMetadata,
  accessCookieName,
  computeAccessToken,
  isAccessTokenValid,
} from './deployment-access.js';

describe('buildDeploymentUrl (P104 gated → API origin, public → dedicated)', () => {
  const prev = process.env.PREVIEW_DOMAIN;
  const prevBase = process.env.STATIC_DEPLOY_BASE_URL;
  beforeEach(() => {
    process.env.PREVIEW_DOMAIN = 'preview.e-code.test';
    process.env.STATIC_DEPLOY_BASE_URL = 'https://api.e-code.test';
  });
  afterEach(() => {
    if (prev === undefined) delete process.env.PREVIEW_DOMAIN;
    else process.env.PREVIEW_DOMAIN = prev;
    if (prevBase === undefined) delete process.env.STATIC_DEPLOY_BASE_URL;
    else process.env.STATIC_DEPLOY_BASE_URL = prevBase;
  });

  const project = { id: 'p1', slug: 'p1', organizationId: 'o1' } as any;
  const dep = (metadata: unknown) =>
    ({ id: 'abcdef123456', provider: 'static', environment: 'preview', status: 'READY', metadata } as any);

  it('public static → dedicated s-<id> origin', () => {
    expect(buildDeploymentUrl(project, dep({}))).toBe('https://s-abcdef123456.preview.e-code.test/');
  });

  it('password-protected static → API-origin canonical URL', () => {
    const url = buildDeploymentUrl(project, dep({ access: { mode: 'password', passwordHash: 'h' } }));
    expect(url).toBe('https://api.e-code.test/static-deployments/abcdef123456/');
  });
});

describe('accessConfigFromMetadata', () => {
  it('defaults to public for empty/missing metadata', () => {
    expect(accessConfigFromMetadata(undefined).mode).toBe('public');
    expect(accessConfigFromMetadata({}).mode).toBe('public');
    expect(accessConfigFromMetadata({ access: null }).mode).toBe('public');
  });

  it('reads a password config', () => {
    const cfg = accessConfigFromMetadata({ access: { mode: 'password', passwordHash: 'h' } });
    expect(cfg).toEqual({ mode: 'password', passwordHash: 'h' });
  });

  it('degrades a malformed password config (no hash) to public — never locks everyone out', () => {
    expect(accessConfigFromMetadata({ access: { mode: 'password' } }).mode).toBe('public');
    expect(accessConfigFromMetadata({ access: { mode: 'password', passwordHash: '' } }).mode).toBe('public');
  });
});

describe('computeAccessToken', () => {
  it('is deterministic per (secret, deploymentId, passwordHash)', () => {
    const a = computeAccessToken('s', 'd1', 'hash');
    const b = computeAccessToken('s', 'd1', 'hash');
    expect(a).toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('differs per deployment, per hash, and per secret (no cross-unlock)', () => {
    const base = computeAccessToken('s', 'd1', 'hash');
    expect(computeAccessToken('s', 'd2', 'hash')).not.toBe(base); // other deployment
    expect(computeAccessToken('s', 'd1', 'hash2')).not.toBe(base); // rotated password
    expect(computeAccessToken('s2', 'd1', 'hash')).not.toBe(base); // other secret
  });
});

describe('isAccessTokenValid (constant-time)', () => {
  const tok = computeAccessToken('s', 'd1', 'hash');

  it('accepts the exact token', () => {
    expect(isAccessTokenValid(tok, tok)).toBe(true);
  });

  it('rejects absent / wrong / length-mismatched tokens', () => {
    expect(isAccessTokenValid(undefined, tok)).toBe(false);
    expect(isAccessTokenValid('', tok)).toBe(false);
    expect(isAccessTokenValid(`${tok}x`, tok)).toBe(false);
    expect(isAccessTokenValid(computeAccessToken('s', 'd1', 'other'), tok)).toBe(false);
  });
});

describe('accessCookieName', () => {
  it('is per-deployment', () => {
    expect(accessCookieName('abc')).toBe('vc_dep_abc');
    expect(accessCookieName('abc')).not.toBe(accessCookieName('abd'));
  });
});
