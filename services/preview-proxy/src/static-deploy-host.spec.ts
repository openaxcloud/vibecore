import { describe, expect, it } from 'vitest';
import { parseServerDeployHost, parseStaticDeployHost } from './app.js';

/*
 * LAUNCH-BLOCKER 2026-08-01: published static apps rendered BLANK because they
 * were served from the API origin, which requires an opaque `CSP: sandbox`
 * (no allow-same-origin) to strip ambient cookie authority — and an opaque
 * origin makes localStorage throw, killing SPA boot. The fix gives each
 * deployment its own origin `s-<id>.<previewDomain>`.
 *
 * These tests pin the host grammar: `s-` hosts are recognised, and they never
 * collide with the existing `d-` (server deploy) or `<ws>-<port>` (IDE preview)
 * shapes — a collision would misroute a live preview or a deployed app.
 */
const DOMAIN = 'preview.e-code.ai';

describe('parseStaticDeployHost', () => {
  it('parses a dedicated static-deploy host', () => {
    expect(parseStaticDeployHost(`s-cmsaqaye5002v0ncds67lsa86.${DOMAIN}`, DOMAIN)).toEqual({
      deploymentId: 'cmsaqaye5002v0ncds67lsa86',
    });
  });

  it('is case- and port-insensitive', () => {
    expect(parseStaticDeployHost(`S-ABC123DEF.${DOMAIN}:443`, DOMAIN)).toEqual({ deploymentId: 'abc123def' });
  });

  it('does NOT match a server-deploy host (d-) — no cross-routing', () => {
    expect(parseStaticDeployHost(`d-cmsaqaye5002v0ncds67lsa86.${DOMAIN}`, DOMAIN)).toBeNull();
  });

  it('does NOT match an IDE preview host (<ws>-<port>)', () => {
    expect(parseStaticDeployHost(`ws-10f68d4026c62927-5173.${DOMAIN}`, DOMAIN)).toBeNull();
  });

  it('rejects nested labels, foreign domains and missing config', () => {
    expect(parseStaticDeployHost(`evil.s-abc123def.${DOMAIN}`, DOMAIN)).toBeNull();
    expect(parseStaticDeployHost('s-abc123def.attacker.test', DOMAIN)).toBeNull();
    expect(parseStaticDeployHost(`s-abc123def.${DOMAIN}`, undefined)).toBeNull();
    expect(parseStaticDeployHost(undefined, DOMAIN)).toBeNull();
  });

  it('rejects too-short ids (grammar guard)', () => {
    expect(parseStaticDeployHost(`s-abc.${DOMAIN}`, DOMAIN)).toBeNull();
  });

  it('the existing server-deploy parser still ignores s- hosts (both directions)', () => {
    expect(parseServerDeployHost(`s-abc123def.${DOMAIN}`, DOMAIN)).toBeNull();
    expect(parseServerDeployHost(`d-abc123def.${DOMAIN}`, DOMAIN)).toEqual({ deploymentId: 'abc123def' });
  });
});
