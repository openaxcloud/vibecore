import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { promoteArtifact } from './artifact-promotion.js';
import { OciDistributionAdapter, digestToFallbackTag, parseRepo } from './artifact-registry-live-adapter.js';

// ── a compact in-memory OCI registry served through a fetch() mock ───────────
//
// Faithful to the subset of the OCI Distribution + referrers protocol the
// adapter drives (manifests, blobs, cross-repo mount, referrers API, delete).
// It lets the whole live adapter run — URL construction, control flow, copy,
// relink, coupled delete — with zero Docker.

const SIG = 'application/vnd.dev.cosign.simplesigning.v1+json';
const SBOM = 'application/vnd.cyclonedx+json';
const PROV = 'application/vnd.in-toto+json';
const MT_MANIFEST = 'application/vnd.oci.image.manifest.v1+json';
const MT_INDEX = 'application/vnd.oci.image.index.v1+json';

function digestOf(bytes: Uint8Array): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

interface Stored {
  contentType: string;
  bytes: Uint8Array;
}

class FakeOciRegistry {
  private manifests = new Map<string, Stored>(); // `${repo}#${ref}` (ref = digest OR tag)
  private byDigest = new Map<string, Stored>(); // `${repo}#${digest}`
  private blobs = new Map<string, Uint8Array>(); // `${repo}#${digest}`

  /** When true, the Referrers API returns an unrouted text/plain 404 (forces fallback). */
  referrersApiEnabled = true;

  readonly deleteLog: string[] = [];

  // --- seed helpers (a pushing client) ---

  putBlob(repo: string, bytes: Uint8Array): string {
    const digest = digestOf(bytes);
    this.blobs.set(`${repo}#${digest}`, bytes);
    return digest;
  }

  putManifest(repo: string, obj: unknown, contentType: string, tag?: string): string {
    const bytes = new Uint8Array(Buffer.from(JSON.stringify(obj), 'utf8'));
    const digest = digestOf(bytes);
    const stored = { contentType, bytes };
    this.manifests.set(`${repo}#${digest}`, stored);
    this.byDigest.set(`${repo}#${digest}`, stored);

    if (tag) {
      this.manifests.set(`${repo}#${tag}`, stored);
    }

    return digest;
  }

  private referrersOf(repo: string, subjectDigest: string) {
    const out: Array<Record<string, unknown>> = [];

    for (const [key, stored] of this.byDigest) {
      if (!key.startsWith(`${repo}#`)) {
        continue;
      }

      const m = JSON.parse(Buffer.from(stored.bytes).toString('utf8'));

      if (m.subject?.digest === subjectDigest) {
        out.push({
          mediaType: stored.contentType,
          digest: key.slice(repo.length + 1),
          size: stored.bytes.length,
          artifactType: m.artifactType,
        });
      }
    }

    return out;
  }

  // --- the fetch() mock ---

  fetch = async (url: Parameters<typeof fetch>[0], init: RequestInit = {}): Promise<Response> => {
    const u = new URL(String(url));
    const method = (init.method ?? 'GET').toUpperCase();
    const m = u.pathname.match(/^\/v2\/(.+)\/(manifests|blobs|referrers|blobs\/uploads)\/?(.*)$/);

    if (!m) {
      // blob upload session PUT lands on /v2/<repo>/blobs/uploads/<id>
      const up = u.pathname.match(/^\/v2\/(.+)\/blobs\/uploads\/(.+)$/);

      if (up && method === 'PUT') {
        const repo = up[1];
        const digest = u.searchParams.get('digest')!;
        this.blobs.set(`${repo}#${digest}`, new Uint8Array(init.body as ArrayBuffer));
        return new Response(null, { status: 201 });
      }

      return new Response('404 page not found', { status: 404, headers: { 'content-type': 'text/plain' } });
    }

    const [, repo, kind, ref] = m;

    // POST /v2/<repo>/blobs/uploads/?mount=&from=
    if (u.pathname.endsWith('/blobs/uploads/') && method === 'POST') {
      const mount = u.searchParams.get('mount');
      const from = u.searchParams.get('from');

      if (mount && from && this.blobs.has(`${from}#${mount}`)) {
        this.blobs.set(`${repo}#${mount}`, this.blobs.get(`${from}#${mount}`)!);
        return new Response(null, { status: 201 });
      }

      return new Response(null, { status: 202, headers: { location: `/v2/${repo}/blobs/uploads/${Math.abs(hashStr(u.href))}` } });
    }

    if (kind === 'blobs') {
      const bytes = this.blobs.get(`${repo}#${ref}`);

      if (!bytes) {
        return new Response(null, { status: 404 });
      }

      return method === 'HEAD' ? new Response(null, { status: 200 }) : new Response(Buffer.from(bytes), { status: 200 });
    }

    if (kind === 'referrers') {
      if (!this.referrersApiEnabled) {
        return new Response('404 page not found', { status: 404, headers: { 'content-type': 'text/plain' } });
      }

      const index = { schemaVersion: 2, mediaType: MT_INDEX, manifests: this.referrersOf(repo, ref) };
      return new Response(JSON.stringify(index), { status: 200, headers: { 'content-type': MT_INDEX } });
    }

    if (kind === 'manifests') {
      const key = `${repo}#${ref}`;

      if (method === 'PUT') {
        const bytes = new Uint8Array(init.body as ArrayBuffer);
        const digest = digestOf(bytes);
        const stored = { contentType: (init.headers as Record<string, string>)['Content-Type'], bytes };
        this.manifests.set(key, stored);
        this.manifests.set(`${repo}#${digest}`, stored);
        this.byDigest.set(`${repo}#${digest}`, stored);
        return new Response(null, { status: 201, headers: { 'docker-content-digest': digest } });
      }

      if (method === 'DELETE') {
        this.deleteLog.push(ref);
        this.manifests.delete(key);
        this.byDigest.delete(key);
        return new Response(null, { status: this.manifests.has(key) || key.includes('sha256:') ? 202 : 202 });
      }

      const stored = this.manifests.get(key);

      if (!stored) {
        return new Response(null, { status: 404 });
      }

      if (method === 'HEAD') {
        return new Response(null, { status: 200, headers: { 'content-type': stored.contentType } });
      }

      return new Response(Buffer.from(stored.bytes), { status: 200, headers: { 'content-type': stored.contentType } });
    }

    return new Response(null, { status: 404 });
  };
}

function hashStr(s: string): number {
  let h = 0;

  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }

  return h;
}

// Seed an image + its 3 attestations into `repo`, plus the fallback tag index.
function seedChain(reg: FakeOciRegistry, repo: string) {
  const config = reg.putBlob(repo, new Uint8Array(Buffer.from('{}', 'utf8')));
  const layer = reg.putBlob(repo, new Uint8Array(Buffer.from(`layer-${repo}`, 'utf8')));
  const imageDigest = reg.putManifest(
    repo,
    { schemaVersion: 2, mediaType: MT_MANIFEST, config: { mediaType: 'application/vnd.oci.empty.v1+json', digest: config, size: 2 }, layers: [{ mediaType: 'application/vnd.oci.image.layer.v1.tar', digest: layer, size: 1 }] },
    MT_MANIFEST,
  );

  const refDesc = (artifactType: string) => {
    const emptyCfg = reg.putBlob(repo, new Uint8Array(Buffer.from('{}', 'utf8')));
    const payload = reg.putBlob(repo, new Uint8Array(Buffer.from(`${artifactType}-payload`, 'utf8')));
    const digest = reg.putManifest(
      repo,
      {
        schemaVersion: 2,
        mediaType: MT_MANIFEST,
        artifactType,
        config: { mediaType: 'application/vnd.oci.empty.v1+json', digest: emptyCfg, size: 2 },
        layers: [{ mediaType: 'application/vnd.oci.image.layer.v1.tar', digest: payload, size: 1 }],
        subject: { mediaType: MT_MANIFEST, digest: imageDigest, size: 100 },
      },
      MT_MANIFEST,
    );
    return { mediaType: MT_MANIFEST, digest, size: 1, artifactType };
  };

  const descs = [refDesc(SIG), refDesc(SBOM), refDesc(PROV)];
  reg.putManifest(repo, { schemaVersion: 2, mediaType: MT_INDEX, manifests: descs }, MT_INDEX, digestToFallbackTag(imageDigest));

  return { imageDigest };
}

describe('parseRepo', () => {
  it('splits host and repository', () => {
    expect(parseRepo('europe-west9-docker.pkg.dev/proj/repo/img')).toEqual({
      registry: 'europe-west9-docker.pkg.dev',
      repository: 'proj/repo/img',
    });
    expect(parseRepo('localhost:5000/a/b')).toEqual({ registry: 'localhost:5000', repository: 'a/b' });
  });

  it('rejects a repo with no host', () => {
    expect(() => parseRepo('nohost')).toThrow();
    expect(() => parseRepo('plainname/img')).toThrow(); // first segment is not a host
  });
});

describe('digestToFallbackTag', () => {
  it('maps sha256:<hex> to sha256-<hex>', () => {
    expect(digestToFallbackTag('sha256:abcd')).toBe('sha256-abcd');
  });
});

describe('OciDistributionAdapter — against an in-memory OCI registry', () => {
  const SRC = 'reg.test/source/app';
  const TENANT = 'reg.test/tenant/app';

  it('discovers referrers via the Referrers API', async () => {
    const reg = new FakeOciRegistry();
    const { imageDigest } = seedChain(reg, 'source/app');
    const adapter = new OciDistributionAdapter({ fetchImpl: reg.fetch });

    const referrers = await adapter.listReferrers(SRC, imageDigest);
    expect(referrers.map((r) => r.artifactType).sort()).toEqual([SBOM, PROV, SIG].sort());
    expect(referrers.every((r) => r.subjectDigest === imageDigest)).toBe(true);
  });

  it('falls back to the tag-schema when the Referrers API is unrouted', async () => {
    const reg = new FakeOciRegistry();
    reg.referrersApiEnabled = false; // simulate a registry without the API
    const { imageDigest } = seedChain(reg, 'source/app');
    const adapter = new OciDistributionAdapter({ fetchImpl: reg.fetch });

    const referrers = await adapter.listReferrers(SRC, imageDigest);
    expect(referrers).toHaveLength(3);
  });

  it('promotes the image + full attestation chain by digest, verified in the target', async () => {
    const reg = new FakeOciRegistry();
    const { imageDigest } = seedChain(reg, 'source/app');
    const adapter = new OciDistributionAdapter({ fetchImpl: reg.fetch });

    const result = await promoteArtifact({ source: { repo: SRC, digest: imageDigest }, targetRepo: TENANT, adapter });
    expect(result.ok).toBe(true);

    expect(await adapter.imageExists(TENANT, imageDigest)).toBe(true);
    const tenantReferrers = await adapter.listReferrers(TENANT, imageDigest);
    expect(tenantReferrers.map((r) => r.artifactType).sort()).toEqual([SBOM, PROV, SIG].sort());
    expect(tenantReferrers.every((r) => r.subjectDigest === imageDigest)).toBe(true);
  });

  it('maintains a tag-schema fallback index at the target for non-API registries', async () => {
    const reg = new FakeOciRegistry();
    const { imageDigest } = seedChain(reg, 'source/app');
    const adapter = new OciDistributionAdapter({ fetchImpl: reg.fetch });
    await promoteArtifact({ source: { repo: SRC, digest: imageDigest }, targetRepo: TENANT, adapter });

    const fallbackAdapter = new OciDistributionAdapter({ fetchImpl: reg.fetch, forceTagFallback: true });
    const viaTag = await fallbackAdapter.listReferrers(TENANT, imageDigest);
    expect(viaTag).toHaveLength(3);
  });

  it('coupled retention: deleteImageAndReferrers removes fallback index, attachments, then image', async () => {
    const reg = new FakeOciRegistry();
    const { imageDigest } = seedChain(reg, 'source/app');
    const adapter = new OciDistributionAdapter({ fetchImpl: reg.fetch });
    await promoteArtifact({ source: { repo: SRC, digest: imageDigest }, targetRepo: TENANT, adapter });

    await adapter.deleteImageAndReferrers(TENANT, imageDigest);

    // Fallback index deleted FIRST (by tag), image LAST.
    expect(reg.deleteLog[0]).toBe(digestToFallbackTag(imageDigest));
    expect(reg.deleteLog[reg.deleteLog.length - 1]).toBe(imageDigest);
    expect(await adapter.imageExists(TENANT, imageDigest)).toBe(false);
    expect(await adapter.listReferrers(TENANT, imageDigest)).toHaveLength(0);
  });

  it('blocks promotion (and rolls back) when the source is missing an attestation', async () => {
    const reg = new FakeOciRegistry();
    // Seed an image with ONLY a signature (no SBOM/provenance).
    const config = reg.putBlob('source/app', new Uint8Array(Buffer.from('{}', 'utf8')));
    const imageDigest = reg.putManifest(
      'source/app',
      { schemaVersion: 2, mediaType: MT_MANIFEST, config: { mediaType: 'application/vnd.oci.empty.v1+json', digest: config, size: 2 }, layers: [] },
      MT_MANIFEST,
    );
    const emptyCfg = reg.putBlob('source/app', new Uint8Array(Buffer.from('{}', 'utf8')));
    const payload = reg.putBlob('source/app', new Uint8Array(Buffer.from('sig', 'utf8')));
    reg.putManifest(
      'source/app',
      { schemaVersion: 2, mediaType: MT_MANIFEST, artifactType: SIG, config: { mediaType: 'application/vnd.oci.empty.v1+json', digest: emptyCfg, size: 2 }, layers: [{ mediaType: 'application/vnd.oci.image.layer.v1.tar', digest: payload, size: 1 }], subject: { mediaType: MT_MANIFEST, digest: imageDigest, size: 100 } },
      MT_MANIFEST,
    );
    const adapter = new OciDistributionAdapter({ fetchImpl: reg.fetch });

    await expect(
      promoteArtifact({ source: { repo: SRC, digest: imageDigest }, targetRepo: TENANT, adapter }),
    ).rejects.toMatchObject({ code: 'PROMOTION_SOURCE_INCOMPLETE' });

    // Tenant untouched — nothing landed.
    expect(await adapter.imageExists(TENANT, imageDigest)).toBe(false);
  });
});
