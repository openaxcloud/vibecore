import { describe, expect, it } from 'vitest';

import { buildManifest, verifyImageIds } from './release-manifest.mjs';

const SHA = '2c104f24b7d6c52a5e41b394036a0eba37f39a2a';
const OTHER_SHA = 'a3f40f6a040af143382a97192880401901580c80';
const DIGEST = `sha256:${'1'.repeat(64)}`;
const DIGEST2 = `sha256:${'2'.repeat(64)}`;
const REGISTRY = 'europe-west9-docker.pkg.dev/vibecore-495216/vibecore-prod-containers';

function svc(overrides = {}) {
  return {
    service: 'api',
    digest: DIGEST,
    rebuilt: true,
    cloudBuildId: 'build-1234',
    sourceSha: SHA,
    tag: SHA.slice(0, 10),
    signature: { verified: true, key: 'gcpkms://projects/p/locations/l/keyRings/k/cryptoKeys/cosign-images' },
    sbom: { format: 'cyclonedx-json', sha256: 'a'.repeat(64) },
    ...overrides,
  };
}

function input(services = [svc()]) {
  return { targetSha: SHA, repository: 'openaxcloud/vibecore', registry: REGISTRY, services };
}

describe('release manifest — build', () => {
  it('records service -> source sha -> build id -> digest -> signature -> SBOM', () => {
    const m = buildManifest(input());
    expect(m.targetSha).toBe(SHA);
    expect(m.shortSha).toBe(SHA.slice(0, 10));
    expect(m.services[0]).toMatchObject({
      service: 'api',
      sourceSha: SHA,
      cloudBuildId: 'build-1234',
      digest: DIGEST,
      rebuilt: true,
    });
    expect(m.services[0].signature.verified).toBe(true);
    expect(m.services[0].sbom.format).toBe('cyclonedx-json');
  });

  it('refuses a service with no digest — a tag-only entry proves nothing', () => {
    expect(() => buildManifest(input([svc({ digest: undefined })]))).toThrow(/digest must be sha256/);
  });

  it('refuses a malformed digest', () => {
    expect(() => buildManifest(input([svc({ digest: 'sha256:nope' })]))).toThrow(/digest must be sha256/);
  });

  it('refuses a rebuilt service with no Cloud Build id', () => {
    expect(() => buildManifest(input([svc({ cloudBuildId: null })]))).toThrow(/no cloudBuildId/);
  });

  it('refuses an image built from a different commit than the release targets', () => {
    expect(() => buildManifest(input([svc({ sourceSha: OTHER_SHA })]))).toThrow(/but the release targets/);
  });

  it('refuses an image whose signature was not verified', () => {
    expect(() => buildManifest(input([svc({ signature: { verified: false } })]))).toThrow(/signature not verified/);
    expect(() => buildManifest(input([svc({ signature: undefined })]))).toThrow(/signature not verified/);
  });

  it('refuses a short or missing target sha', () => {
    expect(() => buildManifest({ ...input(), targetSha: '2c104f24' })).toThrow(/full 40-hex/);
  });

  it('carries a non-rebuilt service forward with its own source sha, never restamped', () => {
    const m = buildManifest(
      input([svc(), svc({ service: 'web', digest: DIGEST2, rebuilt: false, cloudBuildId: null, sourceSha: OTHER_SHA })]),
    );
    const web = m.services.find((s) => s.service === 'web');
    expect(web.sourceSha).toBe(OTHER_SHA);
    expect(web.rebuilt).toBe(false);
  });
});

describe('release manifest — verify-imageids', () => {
  const manifest = buildManifest(input([svc(), svc({ service: 'web', digest: DIGEST2 })]));

  it('passes when every running container matches its manifest digest', () => {
    const result = verifyImageIds(manifest, {
      api: [`${REGISTRY}/api@${DIGEST}`, `${REGISTRY}/api@${DIGEST}`],
      web: [`${REGISTRY}/web@${DIGEST2}`],
    });
    expect(result.ok).toBe(true);
    expect(result.checked).toBe(3);
  });

  it('tolerates the docker-pullable:// prefix some nodes report', () => {
    const result = verifyImageIds(manifest, {
      api: [`docker-pullable://${REGISTRY}/api@${DIGEST}`],
      web: [`${REGISTRY}/web@${DIGEST2}`],
    });
    expect(result.ok).toBe(true);
  });

  it('fails when a pod runs a different digest than the manifest', () => {
    const result = verifyImageIds(manifest, {
      api: [`${REGISTRY}/api@${DIGEST2}`],
      web: [`${REGISTRY}/web@${DIGEST2}`],
    });
    expect(result.ok).toBe(false);
    expect(result.mismatches[0]).toMatch(/api: pod runs/);
  });

  it('fails when a service reports no running pod — "could not look" is not "matches"', () => {
    const result = verifyImageIds(manifest, { api: [`${REGISTRY}/api@${DIGEST}`], web: [] });
    expect(result.ok).toBe(false);
    expect(result.mismatches[0]).toMatch(/web: no running pod/);
  });

  it('fails when even one replica out of many is on the wrong digest', () => {
    const result = verifyImageIds(manifest, {
      api: [`${REGISTRY}/api@${DIGEST}`, `${REGISTRY}/api@${DIGEST}`, `${REGISTRY}/api@${DIGEST2}`],
      web: [`${REGISTRY}/web@${DIGEST2}`],
    });
    expect(result.ok).toBe(false);
    expect(result.mismatches).toHaveLength(1);
  });
});
