import { afterEach, describe, expect, it } from 'vitest';
import {
  isDedicatedStaticDeployHost,
  staticDeployDedicatedOrigin,
  buildDeploymentUrl,
} from '../deployments.js';

/*
 * LAUNCH-BLOCKER 2026-08-01 — published static apps rendered BLANK for anonymous
 * visitors. Proven in prod on a real deployment: the artifact is served from the
 * API origin, which needs `CSP: sandbox` WITHOUT allow-same-origin to strip the
 * ambient cookie authority; that makes the document an opaque origin where
 * localStorage throws ("The document is sandboxed and lacks the
 * 'allow-same-origin' flag") so the SPA dies before painting.
 *
 * Fix: each deployment gets its own origin `s-<id>.<previewDomain>`, where the
 * host-only session cookie is never sent. These tests pin the security-critical
 * part: the relaxed sandbox is granted ONLY for the dedicated host.
 */
const DEPLOY_ID = 'cmsaqtq5w00320ncd9gcran2t';
const saved = process.env.PREVIEW_DOMAIN;

afterEach(() => {
  if (saved === undefined) {
    delete process.env.PREVIEW_DOMAIN;
  } else {
    process.env.PREVIEW_DOMAIN = saved;
  }
});

describe('staticDeployDedicatedOrigin', () => {
  it('builds the per-deployment origin', () => {
    process.env.PREVIEW_DOMAIN = 'preview.e-code.ai';
    expect(staticDeployDedicatedOrigin(DEPLOY_ID)).toBe(`https://s-${DEPLOY_ID}.preview.e-code.ai`);
  });

  it('returns null without a preview domain (local dev falls back to the legacy URL)', () => {
    delete process.env.PREVIEW_DOMAIN;
    expect(staticDeployDedicatedOrigin(DEPLOY_ID)).toBeNull();
  });

  it('refuses a malformed deployment id (never emits a broken host)', () => {
    process.env.PREVIEW_DOMAIN = 'preview.e-code.ai';
    expect(staticDeployDedicatedOrigin('../evil')).toBeNull();
    expect(staticDeployDedicatedOrigin('abc')).toBeNull();
  });
});

describe('isDedicatedStaticDeployHost — gate for allow-same-origin', () => {
  it('is TRUE only on the dedicated host', () => {
    process.env.PREVIEW_DOMAIN = 'preview.e-code.ai';
    expect(isDedicatedStaticDeployHost(`s-${DEPLOY_ID}.preview.e-code.ai`, DEPLOY_ID)).toBe(true);
    expect(isDedicatedStaticDeployHost(`s-${DEPLOY_ID}.preview.e-code.ai:443`, DEPLOY_ID)).toBe(true);
  });

  it('is FALSE on the API origin — the sandbox stays opaque there', () => {
    process.env.PREVIEW_DOMAIN = 'preview.e-code.ai';
    expect(isDedicatedStaticDeployHost('api.e-code.ai', DEPLOY_ID)).toBe(false);
  });

  it('is FALSE for another deployment id (no cross-deployment relaxation)', () => {
    process.env.PREVIEW_DOMAIN = 'preview.e-code.ai';
    expect(isDedicatedStaticDeployHost('s-someotherdeployment.preview.e-code.ai', DEPLOY_ID)).toBe(false);
  });

  it('honours the proxy-forwarded public host, taking the FIRST value', () => {
    process.env.PREVIEW_DOMAIN = 'preview.e-code.ai';
    expect(
      isDedicatedStaticDeployHost('api-internal.svc', DEPLOY_ID, `s-${DEPLOY_ID}.preview.e-code.ai`),
    ).toBe(true);
    expect(
      isDedicatedStaticDeployHost('api-internal.svc', DEPLOY_ID, `s-${DEPLOY_ID}.preview.e-code.ai, evil.test`),
    ).toBe(true);
    expect(isDedicatedStaticDeployHost('api-internal.svc', DEPLOY_ID, 'evil.test')).toBe(false);
  });
});

describe('buildDeploymentUrl (static)', () => {
  const project = { id: 'p1' } as never;

  it('publishes the dedicated origin when a preview domain exists', () => {
    process.env.PREVIEW_DOMAIN = 'preview.e-code.ai';
    const url = buildDeploymentUrl(project, { id: DEPLOY_ID, provider: 'static' } as never);
    expect(url).toBe(`https://s-${DEPLOY_ID}.preview.e-code.ai/`);
  });

  it('falls back to the legacy same-origin URL without a preview domain', () => {
    delete process.env.PREVIEW_DOMAIN;
    const url = buildDeploymentUrl(project, { id: DEPLOY_ID, provider: 'static' } as never);
    expect(url).toContain(`/static-deployments/${DEPLOY_ID}/`);
  });
});
