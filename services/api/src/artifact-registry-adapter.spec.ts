import { createHash } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import {
  ArtifactRegistryOciAdapter,
  parseArtifactRegistryImageRepository,
  parseArtifactRegistryRepositoryBase,
} from './artifact-registry-adapter.js';

const jsonBytes = (value: unknown) => Buffer.from(JSON.stringify(value), 'utf8');
const digest = (bytes: Buffer) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const SOURCE = 'europe-west9-docker.pkg.dev/source-proj/build-repo/p-project1';
const TARGET = 'europe-west9-docker.pkg.dev/tenant-proj/tenant-repo/p-project1';

interface RegistryState {
  manifests: Map<string, { bytes: Buffer; contentType: string }>;
  blobs: Map<string, Buffer>;
}

function repositoryKey(url: URL): { key: string; suffix: string } {
  const match = /^\/v2\/(.+?)\/(manifests|blobs|referrers)\/(.*)$/u.exec(url.pathname);

  if (!match) {
    const upload = /^\/v2\/(.+?)\/blobs\/uploads\/$/u.exec(url.pathname);

    if (upload?.[1]) {
      return { key: `${url.host}/${decodeURIComponent(upload[1])}`, suffix: 'blobs/uploads/' };
    }

    throw new Error(`unexpected registry URL ${url}`);
  }

  return {
    key: `${url.host}/${match[1]
      .split('/')
      .map((segment) => decodeURIComponent(segment))
      .join('/')}`,
    suffix: `${match[2]}/${decodeURIComponent(match[3] ?? '')}`,
  };
}

function registryFixture(
  options: {
    signatureContent?: string;
    signatureFormat?: 'dsse-envelope' | 'message-signature';
    signatureStatementDigest?: string;
    sbomPredicateType?: string;
    sbomStatementDigest?: string;
  } = {},
) {
  const states = new Map<string, RegistryState>();
  const uploads = new Map<string, string>();
  const sourceState: RegistryState = { manifests: new Map(), blobs: new Map() };
  const targetState: RegistryState = { manifests: new Map(), blobs: new Map() };
  states.set(SOURCE, sourceState);
  states.set(TARGET, targetState);

  const config = Buffer.from('config');
  const layer = Buffer.from('layer');
  const configDigest = digest(config);
  const layerDigest = digest(layer);
  sourceState.blobs.set(configDigest, config);
  sourceState.blobs.set(layerDigest, layer);

  const imageBytes = jsonBytes({
    schemaVersion: 2,
    mediaType: 'application/vnd.oci.image.manifest.v1+json',
    config: { mediaType: 'application/vnd.oci.image.config.v1+json', digest: configDigest },
    layers: [{ mediaType: 'application/vnd.oci.image.layer.v1.tar', digest: layerDigest }],
  });

  const imageDigest = digest(imageBytes);
  sourceState.manifests.set(imageDigest, {
    bytes: imageBytes,
    contentType: 'application/vnd.oci.image.manifest.v1+json',
  });

  const statement = (predicateType: string, predicate: Record<string, unknown>, statementDigest = imageDigest) => ({
    payloadType: 'application/vnd.in-toto+json',
    payload: Buffer.from(
      JSON.stringify({
        _type: 'https://in-toto.io/Statement/v1',
        subject: [{ name: SOURCE, digest: { sha256: statementDigest.slice('sha256:'.length) } }],
        predicateType,
        predicate,
      }),
      'utf8',
    ).toString('base64'),
    signatures: [{ sig: Buffer.from('unit-signature', 'utf8').toString('base64') }],
  });

  const bundleType = 'application/vnd.dev.sigstore.bundle.v0.3+json';
  const emptyConfig = Buffer.from('{}', 'utf8');
  const emptyConfigDigest = digest(emptyConfig);
  sourceState.blobs.set(emptyConfigDigest, emptyConfig);

  const signatureFormat = options.signatureFormat ?? 'dsse-envelope';

  const signaturePayload =
    signatureFormat === 'message-signature'
      ? {
          mediaType: bundleType,
          verificationMaterial: {},
          messageSignature: {
            messageDigest: {
              algorithm: 'SHA2_256',
              digest: Buffer.from(imageDigest.slice('sha256:'.length), 'hex').toString('base64'),
            },
            signature: Buffer.from('unit-signature', 'utf8').toString('base64'),
          },
        }
      : {
          mediaType: bundleType,
          verificationMaterial: {},
          dsseEnvelope: statement('https://sigstore.dev/cosign/sign/v1', {}, options.signatureStatementDigest),
        };

  const evidence = [
    {
      artifactType: bundleType,
      payload: signaturePayload,
      annotations: {
        'dev.sigstore.bundle.content': options.signatureContent ?? signatureFormat,
        ...(signatureFormat === 'dsse-envelope'
          ? { 'dev.sigstore.bundle.predicateType': 'https://sigstore.dev/cosign/sign/v1' }
          : {}),
      },
    },
    {
      artifactType: bundleType,
      payload: {
        mediaType: bundleType,
        verificationMaterial: {},
        dsseEnvelope: statement(
          options.sbomPredicateType ?? 'https://spdx.dev/Document',
          { spdxVersion: 'SPDX-2.3', packages: [] },
          options.sbomStatementDigest,
        ),
      },
      annotations: {
        'dev.sigstore.bundle.content': 'dsse-envelope',
        'dev.sigstore.bundle.predicateType': options.sbomPredicateType ?? 'https://spdx.dev/Document',
      },
    },
    {
      artifactType: 'application/vnd.in-toto.provenance+dsse',
      payload: statement('https://slsa.dev/provenance/v1', { buildDefinition: {}, runDetails: {} }),
      annotations: { 'artifactregistry.attachment_namespace': 'cloudbuild.googleapis.com' },
    },
  ];

  const artifactBlobDigests: string[] = [];

  const referrerDigests = evidence.map(({ artifactType, payload, annotations }) => {
    const artifactBlob = jsonBytes(payload);
    const artifactBlobDigest = digest(artifactBlob);
    artifactBlobDigests.push(artifactBlobDigest);
    sourceState.blobs.set(artifactBlobDigest, artifactBlob);

    const bytes = jsonBytes({
      schemaVersion: 2,
      mediaType: 'application/vnd.oci.image.manifest.v1+json',
      artifactType,
      annotations,
      subject: { mediaType: 'application/vnd.oci.image.manifest.v1+json', digest: imageDigest },
      config: {
        mediaType: 'application/vnd.oci.empty.v1+json',
        digest: emptyConfigDigest,
        size: 2,
      },
      layers: [{ mediaType: artifactType, digest: artifactBlobDigest }],
    });

    const value = digest(bytes);
    sourceState.manifests.set(value, { bytes, contentType: 'application/vnd.oci.image.manifest.v1+json' });

    return value;
  });

  const fetchImpl = vi.fn(async (rawUrl: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(typeof rawUrl === 'string' || rawUrl instanceof URL ? rawUrl : rawUrl.url);
    const { key, suffix } = repositoryKey(url);
    const state = states.get(key);

    if (!state) {
      return new Response('', { status: 404 });
    }

    expect(new Headers(init.headers).get('authorization')).toBe('Bearer unit-secret');

    const method = init.method ?? 'GET';

    if (suffix.startsWith('manifests/')) {
      const value = suffix.slice('manifests/'.length);
      const found = state.manifests.get(value);

      if (method === 'HEAD') {
        return new Response(null, { status: found ? 200 : 404 });
      }

      if (method === 'GET') {
        return found
          ? new Response(found.bytes, { status: 200, headers: { 'content-type': found.contentType } })
          : new Response('', { status: 404 });
      }

      if (method === 'PUT') {
        const bytes = Buffer.from(await new Response(init.body).arrayBuffer());

        if (value.startsWith('sha256:')) {
          expect(digest(bytes)).toBe(value);
        }

        state.manifests.set(value, {
          bytes,
          contentType: new Headers(init.headers).get('content-type') ?? 'application/octet-stream',
        });

        return new Response('', { status: 201 });
      }

      if (method === 'DELETE') {
        state.manifests.delete(value);
        return new Response('', { status: 202 });
      }
    }

    if (suffix.startsWith('referrers/')) {
      const subject = suffix.slice('referrers/'.length);

      const manifests = [...state.manifests.entries()].flatMap(([manifestDigest, document]) => {
        const value = JSON.parse(document.bytes.toString('utf8')) as {
          artifactType?: string;
          subject?: { digest?: string };
        };
        return value.subject?.digest === subject ? [{ digest: manifestDigest, artifactType: value.artifactType }] : [];
      });

      return new Response(JSON.stringify({ schemaVersion: 2, manifests }), {
        status: 200,
        headers: { 'content-type': 'application/vnd.oci.image.index.v1+json' },
      });
    }

    if (suffix === 'blobs/uploads/' && method === 'POST') {
      const id = `upload-${uploads.size + 1}`;
      uploads.set(id, key);

      return new Response('', {
        status: 202,
        headers: { location: `https://${url.host}${url.pathname}${id}` },
      });
    }

    if (suffix.startsWith('blobs/uploads/') && method === 'PUT') {
      const value = url.searchParams.get('digest') ?? '';
      const bytes = Buffer.from(await new Response(init.body).arrayBuffer());
      expect(digest(bytes)).toBe(value);
      state.blobs.set(value, bytes);

      return new Response('', { status: 201 });
    }

    if (suffix.startsWith('blobs/')) {
      const value = suffix.slice('blobs/'.length);
      const found = state.blobs.get(value);

      if (method === 'HEAD') {
        return new Response(null, { status: found ? 200 : 404 });
      }

      return found ? new Response(found, { status: 200 }) : new Response('', { status: 404 });
    }

    return new Response('', { status: 405 });
  }) as unknown as typeof fetch;

  return { fetchImpl, sourceState, targetState, imageDigest, referrerDigests, artifactBlobDigests };
}

describe('ArtifactRegistryOciAdapter', () => {
  it('copies image config/layers and discovers, copies and relinks all OCI referrers', async () => {
    const fixture = registryFixture();

    const adapter = new ArtifactRegistryOciAdapter({
      fetchImpl: fixture.fetchImpl,
      tokenProvider: { getAccessToken: async () => 'unit-secret' },
      sleep: async () => undefined,
    });

    const sourceReferrers = await adapter.listReferrers(SOURCE, fixture.imageDigest);
    expect(sourceReferrers).toHaveLength(3);
    expect(sourceReferrers.map((item) => item.verifiedKind).sort()).toEqual(['provenance', 'sbom', 'signature']);
    expect(await adapter.copyImage({ repo: SOURCE, digest: fixture.imageDigest }, TARGET)).toEqual({ created: true });

    for (const attachment of sourceReferrers) {
      const receipt = await adapter.copyAndRelinkReferrer({ repo: SOURCE, attachment }, TARGET, fixture.imageDigest);
      expect(receipt.created).toBe(true);
    }

    expect(await adapter.imageExists(TARGET, fixture.imageDigest)).toBe(true);
    expect((await adapter.listReferrers(TARGET, fixture.imageDigest)).map((item) => item.digest).sort()).toEqual(
      fixture.referrerDigests.sort(),
    );
    expect(fixture.targetState.blobs.size).toBe(6);
    expect(fixture.artifactBlobDigests.every((value) => fixture.targetState.blobs.has(value))).toBe(true);

    const retentionTag = `active-promo-${'a'.repeat(32)}`;
    expect(await adapter.pinImage(TARGET, fixture.imageDigest, retentionTag)).toEqual({ created: true });
    expect(await adapter.pinImage(TARGET, fixture.imageDigest, retentionTag)).toEqual({ created: false });
  });

  it('refreshes ADC after a 401 and never exposes the bearer token in errors', async () => {
    const fixture = registryFixture();

    let calls = 0;

    const fetchImpl: typeof fetch = async (url, init) => {
      calls += 1;

      if (calls === 1) {
        return new Response('Bearer token-one', { status: 401 });
      }

      return fixture.fetchImpl(url, {
        ...init,
        headers: { ...init?.headers, authorization: 'Bearer unit-secret' },
      });
    };

    let tokens = 0;

    const adapter = new ArtifactRegistryOciAdapter({
      fetchImpl,
      tokenProvider: { getAccessToken: async () => (tokens++ === 0 ? 'token-one' : 'unit-secret') },
      sleep: async () => undefined,
    });
    expect(await adapter.imageExists(SOURCE, fixture.imageDigest)).toBe(true);
    expect(tokens).toBeGreaterThanOrEqual(2);

    const denied = new ArtifactRegistryOciAdapter({
      fetchImpl: async () => new Response('Bearer super-secret', { status: 403 }),
      tokenProvider: { getAccessToken: async () => 'super-secret' },
      sleep: async () => undefined,
      maxAttempts: 1,
    });
    await expect(denied.imageExists(SOURCE, fixture.imageDigest)).rejects.not.toThrow(/super-secret/u);
  });

  it('accepts the digest-bound Sigstore message-signature bundle variant', async () => {
    const fixture = registryFixture({ signatureFormat: 'message-signature' });

    const adapter = new ArtifactRegistryOciAdapter({
      fetchImpl: fixture.fetchImpl,
      tokenProvider: { getAccessToken: async () => 'unit-secret' },
    });

    await expect(adapter.listReferrers(SOURCE, fixture.imageDigest)).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ verifiedKind: 'signature' })]),
    );
  });

  it('rejects schemes, tags, missing package paths and non-sha256 digests', async () => {
    expect(() => parseArtifactRegistryRepositoryBase('https://europe-west9-docker.pkg.dev/proj/repo')).toThrow();
    expect(() => parseArtifactRegistryImageRepository('europe-west9-docker.pkg.dev/project/repo')).toThrow();
    expect(() => parseArtifactRegistryImageRepository(`${SOURCE}:latest`)).toThrow();

    const adapter = new ArtifactRegistryOciAdapter({
      fetchImpl: vi.fn() as unknown as typeof fetch,
      tokenProvider: { getAccessToken: async () => 'unused' },
    });
    await expect(adapter.imageExists(SOURCE, 'sha256:not-a-digest')).rejects.toMatchObject({
      code: 'REGISTRY_DIGEST_INVALID',
    });
  });

  it('never follows an off-origin redirect with an ADC bearer token', async () => {
    const fetchSpy = vi.fn(
      async (_url: unknown, _init?: RequestInit) =>
        new Response('', { status: 307, headers: { location: 'https://attacker.invalid/steal' } }),
    );

    const fetchImpl = fetchSpy as unknown as typeof fetch;

    const adapter = new ArtifactRegistryOciAdapter({
      fetchImpl,
      tokenProvider: { getAccessToken: async () => 'redirect-secret' },
      maxAttempts: 1,
    });

    await expect(adapter.imageExists(SOURCE, `sha256:${'a'.repeat(64)}`)).rejects.not.toThrow(/redirect-secret/u);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect((fetchSpy.mock.calls[0]?.[1] as RequestInit | undefined)?.redirect).toBe('manual');
  });

  it('follows Artifact Registry same-origin blob redirects without dropping verification', async () => {
    const fixture = registryFixture();

    let redirectedDigest: string | undefined;

    const fetchImpl: typeof fetch = async (rawUrl, init) => {
      const url = new URL(typeof rawUrl === 'string' || rawUrl instanceof URL ? rawUrl : rawUrl.url);

      if (!redirectedDigest && init?.method !== 'HEAD' && url.pathname.includes('/blobs/sha256:')) {
        redirectedDigest = decodeURIComponent(url.pathname.split('/').at(-1) ?? '');
        return new Response('', {
          status: 302,
          headers: { location: `/artifacts-downloads/${encodeURIComponent(redirectedDigest)}` },
        });
      }

      if (url.pathname.startsWith('/artifacts-downloads/')) {
        expect(new Headers(init?.headers).get('authorization')).toBe('Bearer unit-secret');

        const bytes = fixture.sourceState.blobs.get(redirectedDigest!);

        return bytes ? new Response(bytes, { status: 200 }) : new Response('', { status: 404 });
      }

      return fixture.fetchImpl(rawUrl, init);
    };
    const adapter = new ArtifactRegistryOciAdapter({
      fetchImpl,
      tokenProvider: { getAccessToken: async () => 'unit-secret' },
      sleep: async () => undefined,
    });

    await expect(adapter.copyImage({ repo: SOURCE, digest: fixture.imageDigest }, TARGET)).resolves.toEqual({
      created: true,
    });
    expect(redirectedDigest).toMatch(/^sha256:/u);
  });

  it('rejects an oversized chunked manifest before buffering the complete response', async () => {
    const chunk = new Uint8Array(6 * 1024 * 1024);

    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(chunk);
        controller.enqueue(chunk);
        controller.close();
      },
    });
    const adapter = new ArtifactRegistryOciAdapter({
      fetchImpl: async () => new Response(body, { status: 200 }),
      tokenProvider: { getAccessToken: async () => 'unit-secret' },
      maxAttempts: 1,
    });

    await expect(
      adapter.pinImage(TARGET, `sha256:${'a'.repeat(64)}`, `active-promo-${'b'.repeat(32)}`),
    ).rejects.toMatchObject({ code: 'REGISTRY_MANIFEST_TOO_LARGE' });
  });

  it('rejects spoofed bundle content, a non-SPDX predicate, and an in-toto subject bound to another digest', async () => {
    const cases = [
      registryFixture({ signatureContent: 'message-signature' }),
      registryFixture({ signatureStatementDigest: `sha256:${'e'.repeat(64)}` }),
      registryFixture({ sbomPredicateType: 'https://example.invalid/not-an-sbom' }),
      registryFixture({ sbomStatementDigest: `sha256:${'f'.repeat(64)}` }),
    ];

    for (const fixture of cases) {
      const adapter = new ArtifactRegistryOciAdapter({
        fetchImpl: fixture.fetchImpl,
        tokenProvider: { getAccessToken: async () => 'unit-secret' },
        sleep: async () => undefined,
      });
      await expect(adapter.listReferrers(SOURCE, fixture.imageDigest)).rejects.toMatchObject({
        code: expect.stringMatching(/^REGISTRY_ATTESTATION_/u),
      });
    }
  });

  it('exhaustively snapshots and idempotently deletes real Package, Tag and Version control-plane resources', async () => {
    const packagePath = '/v1/projects/source-proj/locations/europe-west9/repositories/build-repo/packages/p-project1';
    const first = `sha256:${'1'.repeat(64)}`;
    const second = `sha256:${'2'.repeat(64)}`;
    const versions = new Set([first, second]);
    const tags = new Map([['active-promo-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', first]]);

    let packageExists = true;

    const fetchImpl = vi.fn(async (rawUrl: string | URL | Request, init: RequestInit = {}) => {
      const url = new URL(typeof rawUrl === 'string' || rawUrl instanceof URL ? rawUrl : rawUrl.url);
      expect(url.origin).toBe('https://artifactregistry.googleapis.com');
      expect(new Headers(init.headers).get('authorization')).toBe('Bearer control-plane-token');

      const method = (init.method ?? 'GET').toUpperCase();

      if (url.pathname === packagePath && method === 'GET') {
        return packageExists
          ? new Response(JSON.stringify({ name: packagePath.slice('/v1/'.length) }), { status: 200 })
          : new Response('', { status: 404 });
      }

      const tagPrefix = `${packagePath}/tags/`;

      if (url.pathname.startsWith(tagPrefix) && method === 'GET') {
        const tag = decodeURIComponent(url.pathname.slice(tagPrefix.length));

        return tags.has(tag)
          ? new Response(JSON.stringify({ name: `${packagePath.slice('/v1/'.length)}/tags/${tag}` }), {
              status: 200,
            })
          : new Response('', { status: 404 });
      }

      if (url.pathname === `${packagePath}/versions` && method === 'GET') {
        const pageToken = url.searchParams.get('pageToken');
        const selected = pageToken ? [second] : [first];

        return new Response(
          JSON.stringify({
            versions: selected
              .filter((value) => versions.has(value))
              .map((value) => ({ name: `${packagePath.slice('/v1/'.length)}/versions/${encodeURIComponent(value)}` })),
            ...(pageToken ? {} : { nextPageToken: 'second-page' }),
          }),
          { status: 200 },
        );
      }

      if (url.pathname === `${packagePath}/tags` && method === 'GET') {
        return new Response(
          JSON.stringify({
            tags: [...tags].map(([name, version]) => ({
              name: `${packagePath.slice('/v1/'.length)}/tags/${name}`,
              version: `${packagePath.slice('/v1/'.length)}/versions/${encodeURIComponent(version)}`,
            })),
          }),
          { status: 200 },
        );
      }

      if (url.pathname.startsWith(tagPrefix) && method === 'DELETE') {
        tags.delete(decodeURIComponent(url.pathname.slice(tagPrefix.length)));
        return new Response(null, { status: 200 });
      }

      const versionPrefix = `${packagePath}/versions/`;

      if (url.pathname.startsWith(versionPrefix) && method === 'DELETE') {
        versions.delete(decodeURIComponent(url.pathname.slice(versionPrefix.length)));
        return new Response(
          JSON.stringify({
            name: 'projects/source-proj/locations/europe-west9/operations/delete-version-1',
            done: true,
          }),
          { status: 200 },
        );
      }

      if (url.pathname === packagePath && method === 'DELETE') {
        packageExists = false;
        versions.clear();
        tags.clear();

        return new Response(
          JSON.stringify({
            name: 'projects/source-proj/locations/europe-west9/operations/delete-package-1',
            done: true,
          }),
          { status: 200 },
        );
      }

      return new Response('', { status: 404 });
    }) as unknown as typeof fetch;

    const adapter = new ArtifactRegistryOciAdapter({
      fetchImpl,
      tokenProvider: { getAccessToken: async () => 'control-plane-token' },
      sleep: async () => undefined,
    });

    await expect(adapter.packageExists(SOURCE)).resolves.toBe(true);
    await expect(adapter.tagExists(SOURCE, 'active-promo-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')).resolves.toBe(true);

    await expect(adapter.snapshotPackage(SOURCE)).resolves.toEqual({
      repository: SOURCE,
      exists: true,
      versions: [first, second],
      tags: [{ name: 'active-promo-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', digest: first }],
    });

    await adapter.deleteTag(SOURCE, 'active-promo-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    await expect(adapter.tagExists(SOURCE, 'active-promo-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')).resolves.toBe(false);
    await adapter.deleteVersion(SOURCE, first);
    await adapter.deletePackage(SOURCE);
    await expect(adapter.packageExists(SOURCE)).resolves.toBe(false);
    await expect(adapter.snapshotPackage(SOURCE)).resolves.toEqual({
      repository: SOURCE,
      exists: false,
      versions: [],
      tags: [],
    });

    await expect(adapter.deletePackage(SOURCE)).resolves.toBeUndefined();
  });
});
