/**
 * LIVE Artifact Registry / OCI Distribution adapter (PLAN_PARITE_REPLIT §13.5,
 * UNK-AR-LIVE-PROMOTION). This is the real implementation of the
 * {@link RegistryAdapter} interface that {@link promoteArtifact} drives. It talks
 * the OCI Distribution + OCI referrers protocol over HTTP — the SAME protocol
 * Google Artifact Registry serves — so the promotion state machine
 * (PROMOTION_PREPARED → IMAGE_COPIED_BY_DIGEST → REFERRERS_DISCOVERED →
 * METADATA_COPIED → TARGET_SIGNATURE_VERIFIED → TARGET_POLICY_VERIFIED →
 * PROMOTION_COMMITTED) runs end to end against a real registry.
 *
 * Only AUTH differs between a plain OCI registry and Artifact Registry: pass a
 * {@link RegistryAuth} (a static gcloud access token for AR, none for an
 * anonymous registry). Everything else — copy-by-digest, cross-repo blob mount,
 * referrers discovery with tag-schema fallback, coupled retention delete — is
 * registry-agnostic OCI.
 *
 * Design constraints honoured (§13.5):
 *   - Referrers API PRIMARY with tag-schema FALLBACK (the "fallback ORAS/
 *     referrers" the plan mandates while attachments are Preview/not-GA).
 *   - Coupled retention: deleting the target image ALSO deletes its attachments,
 *     so a rollback never leaves orphaned attestations pointing at nothing.
 *   - Copy is by DIGEST only; a tag is never trusted as the source of truth.
 */

import { createHash } from 'node:crypto';

import type { OciAttachment, RegistryAdapter, RegistryRef } from './artifact-promotion.js';

// ---------------------------------------------------------------------------
// Media types
// ---------------------------------------------------------------------------

const MT = {
  ociManifest: 'application/vnd.oci.image.manifest.v1+json',
  ociIndex: 'application/vnd.oci.image.index.v1+json',
  dockerManifest: 'application/vnd.docker.distribution.manifest.v2+json',
  dockerList: 'application/vnd.docker.distribution.manifest.list.v2+json',
} as const;

/** Accept header covering every manifest shape a registry may return. */
const ACCEPT_MANIFESTS = [MT.ociManifest, MT.ociIndex, MT.dockerManifest, MT.dockerList].join(', ');

const INDEX_TYPES = new Set<string>([MT.ociIndex, MT.dockerList]);

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export type RegistryAction = 'pull' | 'push' | 'delete';

/**
 * Supplies the `Authorization` header for a registry request. For Artifact
 * Registry: return `Bearer <gcloud access token>`. For an anonymous registry:
 * return undefined.
 */
export interface RegistryAuth {
  authorization(input: {
    registry: string;
    repository: string;
    action: RegistryAction;
  }): Promise<string | undefined>;
}

/** Anonymous access — no Authorization header. Used by the local proof. */
export const anonymousAuth: RegistryAuth = {
  async authorization() {
    return undefined;
  },
};

/**
 * Static bearer token, e.g. `staticBearerAuth(await gcloudAccessToken())` for
 * Google Artifact Registry (`oauth2accesstoken`). Short-lived by design — no
 * persistent key material (§13.4 "zéro clé persistante").
 */
export function staticBearerAuth(token: string): RegistryAuth {
  return {
    async authorization() {
      return `Bearer ${token}`;
    },
  };
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface OciDistributionOptions {
  auth?: RegistryAuth;

  /** Use http:// (localhost / in-cluster test registries). Default https. */
  insecure?: boolean;

  /**
   * Force the tag-schema referrers fallback and skip the Referrers API. Used to
   * PROVE the fallback path (§13.5) against a registry that also supports the
   * native API. Default false.
   */
  forceTagFallback?: boolean;

  /** Injectable fetch (tests). Defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

// ---------------------------------------------------------------------------
// Ref parsing
// ---------------------------------------------------------------------------

interface ParsedRepo {
  registry: string;
  repository: string;
}

/**
 * Split `host[:port]/path/name` into registry host and repository path. The
 * first path segment is the registry iff it looks like a host (contains `.` or
 * `:`, or is localhost) — matching Docker/OCI reference rules.
 */
export function parseRepo(repo: string): ParsedRepo {
  const slash = repo.indexOf('/');

  if (slash === -1) {
    throw new Error(`Invalid registry repo (no host): ${repo}`);
  }

  const maybeHost = repo.slice(0, slash);
  const isHost = maybeHost.includes('.') || maybeHost.includes(':') || maybeHost === 'localhost';

  if (!isHost) {
    throw new Error(`Invalid registry repo (first segment is not a host): ${repo}`);
  }

  return { registry: maybeHost, repository: repo.slice(slash + 1) };
}

// ---------------------------------------------------------------------------
// Descriptor / manifest shapes (only the fields we touch)
// ---------------------------------------------------------------------------

interface Descriptor {
  mediaType: string;
  digest: string;
  size: number;
  artifactType?: string;
  annotations?: Record<string, string>;
}

interface Manifest {
  mediaType?: string;
  artifactType?: string;
  config?: Descriptor;
  layers?: Descriptor[];
  manifests?: Descriptor[]; // index
  subject?: Descriptor;
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** `sha256:<hex>` → tag-schema fallback tag `sha256-<hex>` (OCI referrers fallback). */
export function digestToFallbackTag(digest: string): string {
  const [algo, hex] = digest.split(':');
  return `${algo}-${hex}`;
}

// ---------------------------------------------------------------------------
// The adapter
// ---------------------------------------------------------------------------

export class OciDistributionAdapter implements RegistryAdapter {
  private readonly auth: RegistryAuth;
  private readonly scheme: string;
  private readonly forceTagFallback: boolean;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: OciDistributionOptions = {}) {
    this.auth = opts.auth ?? anonymousAuth;
    this.scheme = opts.insecure ? 'http' : 'https';
    this.forceTagFallback = opts.forceTagFallback ?? false;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  // ---- low-level HTTP -----------------------------------------------------

  private base(registry: string): string {
    return `${this.scheme}://${registry}`;
  }

  private async req(
    action: RegistryAction,
    parsed: ParsedRepo,
    url: string,
    init: Omit<RequestInit, 'headers'> & { headers?: Record<string, string> } = {},
  ): Promise<Response> {
    const headers: Record<string, string> = { ...(init.headers ?? {}) };
    const authz = await this.auth.authorization({
      registry: parsed.registry,
      repository: parsed.repository,
      action,
    });

    if (authz) {
      headers.Authorization = authz;
    }

    return this.fetchImpl(url, { ...init, headers });
  }

  // ---- RegistryAdapter: existence ----------------------------------------

  async imageExists(repo: string, digest: string): Promise<boolean> {
    const parsed = parseRepo(repo);
    const url = `${this.base(parsed.registry)}/v2/${parsed.repository}/manifests/${digest}`;
    const res = await this.req('pull', parsed, url, {
      method: 'HEAD',
      headers: { Accept: ACCEPT_MANIFESTS },
    });

    return res.status === 200;
  }

  // ---- RegistryAdapter: referrers discovery (API + tag fallback) ----------

  async listReferrers(repo: string, digest: string): Promise<OciAttachment[]> {
    const parsed = parseRepo(repo);

    if (!this.forceTagFallback) {
      const viaApi = await this.referrersViaApi(parsed, digest);

      if (viaApi) {
        return viaApi;
      }
    }

    return this.referrersViaTag(parsed, digest);
  }

  /** OCI Referrers API. Returns null when the registry does not support it. */
  private async referrersViaApi(parsed: ParsedRepo, digest: string): Promise<OciAttachment[] | null> {
    const url = `${this.base(parsed.registry)}/v2/${parsed.repository}/referrers/${digest}`;
    const res = await this.req('pull', parsed, url, {
      method: 'GET',
      headers: { Accept: MT.ociIndex },
    });

    // 404/400 (and any non-index body) ⇒ API unsupported → signal fallback.
    if (res.status === 404 || res.status === 400) {
      return null;
    }

    if (!res.ok) {
      throw new Error(`Referrers API failed ${res.status} for ${parsed.repository}@${digest}`);
    }

    const ct = res.headers.get('content-type') ?? '';

    if (!ct.includes('json')) {
      return null; // e.g. text/plain "404 page not found" from an unrouted endpoint
    }

    const index = (await res.json()) as Manifest;

    return this.descriptorsToAttachments(parsed, digest, index.manifests ?? []);
  }

  /** Tag-schema fallback: `sha256-<hex>` tag points at an index of referrers. */
  private async referrersViaTag(parsed: ParsedRepo, digest: string): Promise<OciAttachment[]> {
    const tag = digestToFallbackTag(digest);
    const url = `${this.base(parsed.registry)}/v2/${parsed.repository}/manifests/${tag}`;
    const res = await this.req('pull', parsed, url, {
      method: 'GET',
      headers: { Accept: MT.ociIndex },
    });

    if (res.status === 404) {
      return [];
    }

    if (!res.ok) {
      throw new Error(`Referrers tag fallback failed ${res.status} for ${parsed.repository}:${tag}`);
    }

    const index = (await res.json()) as Manifest;

    return this.descriptorsToAttachments(parsed, digest, index.manifests ?? []);
  }

  /**
   * Turn referrer descriptors into {@link OciAttachment}. `artifactType` may be
   * absent on the descriptor (older push tooling) — then we read it from the
   * referrer manifest itself (artifactType or config.mediaType).
   */
  private async descriptorsToAttachments(
    parsed: ParsedRepo,
    subjectDigest: string,
    descriptors: Descriptor[],
  ): Promise<OciAttachment[]> {
    const out: OciAttachment[] = [];

    for (const d of descriptors) {
      let artifactType = d.artifactType ?? '';

      if (!artifactType) {
        const { manifest } = await this.getManifest(parsed, d.digest);
        artifactType = manifest.artifactType ?? manifest.config?.mediaType ?? '';
      }

      out.push({ digest: d.digest, artifactType, subjectDigest });
    }

    return out;
  }

  // ---- manifest / blob primitives ----------------------------------------

  private async getManifest(
    parsed: ParsedRepo,
    reference: string,
  ): Promise<{ bytes: Uint8Array; contentType: string; manifest: Manifest }> {
    const url = `${this.base(parsed.registry)}/v2/${parsed.repository}/manifests/${reference}`;
    const res = await this.req('pull', parsed, url, {
      method: 'GET',
      headers: { Accept: ACCEPT_MANIFESTS },
    });

    if (!res.ok) {
      throw new Error(`GET manifest ${parsed.repository}@${reference} → ${res.status}`);
    }

    const bytes = new Uint8Array(await res.arrayBuffer());
    const contentType = res.headers.get('content-type') ?? MT.ociManifest;
    const manifest = JSON.parse(Buffer.from(bytes).toString('utf8')) as Manifest;

    return { bytes, contentType, manifest };
  }

  private async blobExists(parsed: ParsedRepo, digest: string): Promise<boolean> {
    const url = `${this.base(parsed.registry)}/v2/${parsed.repository}/blobs/${digest}`;
    const res = await this.req('pull', parsed, url, { method: 'HEAD' });
    return res.status === 200;
  }

  /**
   * Ensure `digest` blob is present in `target`, preferring a cross-repo MOUNT
   * (same registry, zero bytes moved) and falling back to a streamed copy.
   */
  private async ensureBlob(target: ParsedRepo, source: ParsedRepo, digest: string): Promise<void> {
    if (await this.blobExists(target, digest)) {
      return;
    }

    // Cross-repo mount (only valid within one registry).
    if (source.registry === target.registry) {
      const mountUrl =
        `${this.base(target.registry)}/v2/${target.repository}/blobs/uploads/` +
        `?mount=${encodeURIComponent(digest)}&from=${encodeURIComponent(source.repository)}`;
      const mount = await this.req('push', target, mountUrl, { method: 'POST' });

      if (mount.status === 201) {
        return; // mounted
      }

      // 202 ⇒ mount declined; we hold an upload session → monolithic PUT below.
      if (mount.status === 202) {
        const location = mount.headers.get('location');

        if (location) {
          await this.uploadBlob(target, location, source, digest);
          return;
        }
      }
    }

    // Different registry, or mount unavailable: open a fresh upload + stream.
    const startUrl = `${this.base(target.registry)}/v2/${target.repository}/blobs/uploads/`;
    const start = await this.req('push', target, startUrl, { method: 'POST' });

    if (start.status !== 202) {
      throw new Error(`Blob upload start for ${digest} → ${start.status}`);
    }

    const location = start.headers.get('location');

    if (!location) {
      throw new Error(`Blob upload start returned no Location for ${digest}`);
    }

    await this.uploadBlob(target, location, source, digest);
  }

  private async uploadBlob(target: ParsedRepo, location: string, source: ParsedRepo, digest: string): Promise<void> {
    const blobUrl = `${this.base(source.registry)}/v2/${source.repository}/blobs/${digest}`;
    const blobRes = await this.req('pull', source, blobUrl, { method: 'GET' });

    if (!blobRes.ok) {
      throw new Error(`GET source blob ${digest} → ${blobRes.status}`);
    }

    const body = Buffer.from(await blobRes.arrayBuffer());

    // Location may be absolute or path-relative; resolve against the registry.
    const absolute = location.startsWith('http') ? location : `${this.base(target.registry)}${location}`;
    const putUrl = `${absolute}${absolute.includes('?') ? '&' : '?'}digest=${encodeURIComponent(digest)}`;
    const put = await this.req('push', target, putUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/octet-stream' },
      body,
    });

    if (put.status !== 201) {
      throw new Error(`PUT blob ${digest} → ${put.status}`);
    }
  }

  private async putManifest(
    parsed: ParsedRepo,
    reference: string,
    bytes: Uint8Array,
    contentType: string,
  ): Promise<void> {
    const url = `${this.base(parsed.registry)}/v2/${parsed.repository}/manifests/${reference}`;
    const res = await this.req('push', parsed, url, {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      body: Buffer.from(bytes),
    });

    if (res.status !== 201) {
      const text = await res.text().catch(() => '');
      throw new Error(`PUT manifest ${parsed.repository}@${reference} → ${res.status} ${text}`);
    }
  }

  /** Copy an image (or index, recursively) and its blobs by digest. */
  private async copyManifestByDigest(source: ParsedRepo, target: ParsedRepo, digest: string): Promise<void> {
    const { bytes, contentType, manifest } = await this.getManifest(source, digest);

    if (INDEX_TYPES.has(contentType) || (manifest.manifests && manifest.manifests.length > 0)) {
      // Multi-arch: copy every child manifest (and its blobs) first.
      for (const child of manifest.manifests ?? []) {
        await this.copyManifestByDigest(source, target, child.digest);
      }
    } else {
      const blobs: Descriptor[] = [];

      if (manifest.config) {
        blobs.push(manifest.config);
      }

      for (const layer of manifest.layers ?? []) {
        blobs.push(layer);
      }

      for (const blob of blobs) {
        await this.ensureBlob(target, source, blob.digest);
      }
    }

    await this.putManifest(target, digest, bytes, contentType);
  }

  // ---- RegistryAdapter: copy image ---------------------------------------

  async copyImage(source: RegistryRef, targetRepo: string): Promise<void> {
    const src = parseRepo(source.repo);
    const tgt = parseRepo(targetRepo);
    await this.copyManifestByDigest(src, tgt, source.digest);
  }

  // ---- RegistryAdapter: copy + re-link an attachment ---------------------

  async copyAndRelinkReferrer(
    source: { repo: string; attachment: OciAttachment },
    targetRepo: string,
    newSubjectDigest: string,
  ): Promise<void> {
    const src = parseRepo(source.repo);
    const tgt = parseRepo(targetRepo);

    const { bytes, contentType, manifest } = await this.getManifest(src, source.attachment.digest);

    // Copy the attachment's own blobs (signature/SBOM/provenance payload + config).
    const blobs: Descriptor[] = [];

    if (manifest.config) {
      blobs.push(manifest.config);
    }

    for (const layer of manifest.layers ?? []) {
      blobs.push(layer);
    }

    for (const blob of blobs) {
      await this.ensureBlob(tgt, src, blob.digest);
    }

    const artifactType = manifest.artifactType ?? source.attachment.artifactType;
    const currentSubject = manifest.subject?.digest;

    if (currentSubject && currentSubject !== newSubjectDigest) {
      // Cross-registry re-tag changed the image digest: rewrite subject and
      // push under the newly-computed manifest digest.
      const rewritten: Manifest = { ...manifest, subject: { ...manifest.subject!, digest: newSubjectDigest } };
      const newBytes = new Uint8Array(Buffer.from(JSON.stringify(rewritten), 'utf8'));
      const newDigest = `sha256:${sha256Hex(newBytes)}`;
      await this.putManifest(tgt, newDigest, newBytes, contentType);
      await this.maintainFallbackTag(tgt, newSubjectDigest, {
        mediaType: contentType,
        digest: newDigest,
        size: newBytes.length,
        artifactType,
      });
      return;
    }

    // Same registry / same image digest: the attachment bytes are identical, so
    // pushing them under their own digest re-links referrers in the target repo.
    await this.putManifest(tgt, source.attachment.digest, bytes, contentType);
    await this.maintainFallbackTag(tgt, newSubjectDigest, {
      mediaType: contentType,
      digest: source.attachment.digest,
      size: bytes.length,
      artifactType,
    });
  }

  /**
   * Read-modify-write the tag-schema fallback index (`sha256-<hex>`) at the
   * target so attachments stay discoverable even on a registry whose Referrers
   * API is unavailable/Preview (§13.5 fallback + exit strategy). Idempotent:
   * a descriptor already present (by digest) is not duplicated.
   */
  private async maintainFallbackTag(target: ParsedRepo, subjectDigest: string, descriptor: Descriptor): Promise<void> {
    const tag = digestToFallbackTag(subjectDigest);
    const url = `${this.base(target.registry)}/v2/${target.repository}/manifests/${tag}`;

    const existing = await this.req('pull', target, url, { method: 'GET', headers: { Accept: MT.ociIndex } });
    let manifests: Descriptor[] = [];

    if (existing.status === 200) {
      const index = (await existing.json()) as Manifest;
      manifests = index.manifests ?? [];
    }

    if (manifests.some((d) => d.digest === descriptor.digest)) {
      return;
    }

    manifests.push(descriptor);
    const indexBytes = new Uint8Array(
      Buffer.from(JSON.stringify({ schemaVersion: 2, mediaType: MT.ociIndex, manifests }), 'utf8'),
    );
    await this.putManifest(target, tag, indexBytes, MT.ociIndex);
  }

  // ---- RegistryAdapter: coupled retention delete -------------------------

  /**
   * Delete the image AND its attachments (coupled retention, §13.5) so a
   * rollback never orphans an attestation — nor leaves a pullable-but-unverified
   * image. Best-effort — a missing target is a no-op.
   *
   * Registries enforce referential integrity in BOTH directions and refuse a
   * delete whose target is still referenced:
   *   - zot returns 405/DENIED for a manifest referenced by a tagged index;
   *   - Artifact Registry returns 400 GOOGLE_MANIFEST_DANGLING_PARENT_IMAGE /
   *     GOOGLE_MANIFEST_REFERRING_MANIFEST — it treats each referrer as a
   *     "parent" of the subject image, so the image cannot be deleted until its
   *     referrers are gone, and a referrer cannot be deleted until the indexes
   *     referencing it are gone.
   *
   * So we delete to a FIXPOINT: repeatedly sweep {tag-schema index, referrers,
   * image}, dropping whatever now deletes (202) or is already absent (404), until
   * a full pass makes no progress. Each removed reference unblocks the next
   * layer — the tag index frees the referrers, the referrers free the image.
   */
  async deleteImageAndReferrers(repo: string, digest: string): Promise<void> {
    const parsed = parseRepo(repo);
    const referrers = await this.listReferrers(repo, digest).catch(() => [] as OciAttachment[]);

    // Artifact Registry enforces coupled retention so strictly that piecemeal
    // OCI DELETE cannot untangle it (each referrer is "parented" by AR-internal
    // index manifests that are not OCI-addressable). AR's own primitive —
    // versions.delete?force=true — removes a version together with its tags and
    // referrers atomically. Use it (same Bearer token, HTTPS) on AR.
    if (this.isArtifactRegistry(parsed.registry)) {
      // AR enforces coupled retention server-side: it treats each referrer as a
      // "PARENT" of the subject image and refuses any piecemeal delete (even
      // OCI DELETE, and version-level force-delete only completes eventually).
      // The reliable, atomic primitive is a PACKAGE delete, which cascades the
      // image + every referrer + AR's internal referrers-index manifests + tags
      // in one operation — precisely "image and metadata retained/removed
      // together" (§12.4/§13.5). A promotion targets a per-(tenant,app) package,
      // so removing that package rolls back exactly what the promotion produced.
      await this.arDeletePackage(parsed, referrers.length);
      return;
    }

    // Order matters only as a hint; the fixpoint corrects any wrong guess.
    const pending = new Set<string>([
      digestToFallbackTag(digest),
      ...referrers.map((r) => r.digest),
      digest,
    ]);

    // At most one pass per element is ever needed (each pass frees ≥1 layer),
    // plus a guard to never loop unboundedly.
    for (let pass = 0; pass < pending.size + 2 && pending.size > 0; pass++) {
      let progressed = false;

      for (const ref of [...pending]) {
        const status = await this.deleteManifest(parsed, ref);

        if (status === 202 || status === 200 || status === 404) {
          pending.delete(ref);
          progressed = true;
        }
      }

      if (!progressed) {
        break; // nothing deletable this pass — remaining are blocked by a non-OCI reference
      }
    }
  }

  /** True for a Google Artifact Registry host (`*-docker.pkg.dev`). */
  private isArtifactRegistry(registry: string): boolean {
    return registry.endsWith('-docker.pkg.dev');
  }

  /**
   * Cascade-delete the whole AR package (image name) that this ref points at, via
   * the Artifact Registry REST API — the atomic, coupled-retention-safe way to
   * remove an image together with all its referrers, AR-internal referrers
   * indexes and tags. Uses the same Bearer token as the docker endpoint (one
   * gcloud OAuth scope covers both). Waits until the package is actually gone.
   */
  private async arDeletePackage(parsed: ParsedRepo, referrerCount: number): Promise<void> {
    const location = parsed.registry.replace(/-docker\.pkg\.dev$/, '');
    const parts = parsed.repository.split('/');
    const [project, repository, ...pkgParts] = parts;
    const pkg = pkgParts.join('/');

    if (!project || !repository || !pkg) {
      throw new Error(`Cannot derive AR package name from ${parsed.registry}/${parsed.repository}`);
    }

    const name = `projects/${project}/locations/${location}/repositories/${repository}/packages/${encodeURIComponent(pkg)}`;
    const url = `https://artifactregistry.googleapis.com/v1/${name}`;

    const authz = await this.auth.authorization({ registry: parsed.registry, repository: parsed.repository, action: 'delete' });
    const headers: Record<string, string> = {};

    if (authz) {
      headers.Authorization = authz;
    }

    const res = await this.fetchImpl(url, { method: 'DELETE', headers });

    if (process.env.PROMOTION_DEBUG) {
      const body = res.status >= 400 ? await res.text().catch(() => '') : '';
      console.error(`[ar-delete-package] ${pkg} (image + ${referrerCount} referrers) → ${res.status} ${body}`);
    }

    // The delete is a long-running operation; wait until the package is gone.
    const versionsUrl = `${url}/versions?pageSize=1`;

    for (let i = 0; i < 20; i++) {
      const check = await this.fetchImpl(versionsUrl, { headers });

      if (check.status === 404) {
        return; // package removed
      }

      if (check.status === 200) {
        const body = (await check.json()) as { versions?: unknown[] };

        if (!body.versions || body.versions.length === 0) {
          return; // all versions gone
        }
      }

      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  /** DELETE a manifest by digest or tag; returns the HTTP status. */
  private async deleteManifest(parsed: ParsedRepo, digest: string): Promise<number> {
    const url = `${this.base(parsed.registry)}/v2/${parsed.repository}/manifests/${digest}`;
    const res = await this.req('delete', parsed, url, { method: 'DELETE' });

    if (process.env.PROMOTION_DEBUG) {
      const body = res.status >= 400 ? await res.text().catch(() => '') : '';
      console.error(`[delete] ${parsed.repository}@${digest} → ${res.status} ${body}`);
    }

    return res.status;
  }
}
