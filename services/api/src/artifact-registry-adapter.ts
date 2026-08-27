import { createHash } from 'node:crypto';

import { GoogleAuth, type AuthClient } from 'google-auth-library';

import type { AttestationKind, OciAttachment, RegistryAdapter, RegistryRef } from './artifact-promotion.js';

const DIGEST_RE = /^sha256:[a-f0-9]{64}$/u;
const AR_HOST_RE = /^(?<location>[a-z][a-z0-9-]{0,62})-docker\.pkg\.dev$/u;
const SEGMENT_RE = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/u;
const PROJECT_RE = /^[a-z][a-z0-9-]{4,61}[a-z0-9]$/u;
const REPOSITORY_RE = /^[a-z0-9][a-z0-9._-]{0,127}$/u;
const MAX_MANIFEST_BYTES = 10 * 1024 * 1024;
const MAX_REFERRERS_INDEX_BYTES = 5 * 1024 * 1024;
const MAX_REFERRERS = 256;
const MAX_REFERRER_PAGES = 32;
const MAX_EVIDENCE_PAYLOADS = 8;
const MAX_EVIDENCE_BYTES = 25 * 1024 * 1024;
const SIGSTORE_BUNDLE_MEDIA_TYPE = 'application/vnd.dev.sigstore.bundle.v0.3+json';
const COSIGN_SIGNATURE_PREDICATE_TYPE = 'https://sigstore.dev/cosign/sign/v1';
const IN_TOTO_PAYLOAD_TYPE = 'application/vnd.in-toto+json';
const INVALID_JSON_OBJECT = 'invalid-json-object';
const IN_TOTO_STATEMENT_TYPES = new Set(['https://in-toto.io/Statement/v0.1', 'https://in-toto.io/Statement/v1']);

const SPDX_PREDICATE_TYPES = new Set([
  'https://spdx.dev/Document',
  'https://spdx.dev/Document/v2.2',
  'https://spdx.dev/Document/v2.3',
]);
const SLSA_PREDICATE_TYPES = new Set([
  'https://slsa.dev/provenance/v0.1',
  'https://slsa.dev/provenance/v0.2',
  'https://slsa.dev/provenance/v1',
]);

const MANIFEST_ACCEPT = [
  'application/vnd.oci.image.manifest.v1+json',
  'application/vnd.oci.image.index.v1+json',
  'application/vnd.docker.distribution.manifest.v2+json',
  'application/vnd.docker.distribution.manifest.list.v2+json',
  'application/vnd.oci.artifact.manifest.v1+json',
].join(', ');

const TRANSIENT_STATUS = new Set([429, 500, 502, 503, 504]);
const REDIRECT_STATUS = new Set([301, 302, 303, 307, 308]);
const MAX_REDIRECTS = 3;
const RETENTION_TAG_RE = /^active-promo-[a-f0-9]{32}$/u;

export class ArtifactRegistryError extends Error {
  readonly statusCode = 502;

  constructor(
    readonly code: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ArtifactRegistryError';
  }
}

export interface ArtifactRegistryRepository {
  original: string;
  host: string;
  location: string;
  project: string;
  repository: string;
  packagePath: string[];

  /** OCI distribution repository name, encoded one segment at a time. */
  distributionName: string;
}

export interface ArtifactRegistryRepositoryBase {
  original: string;
  host: string;
  location: string;
  project: string;
  repository: string;
}

/** Validate an AR repository root, without a package/image suffix. */
export function parseArtifactRegistryRepositoryBase(value: string): ArtifactRegistryRepositoryBase {
  if (value !== value.trim() || value.includes('://') || value.includes('@') || value.includes(':')) {
    throw new ArtifactRegistryError('REGISTRY_REFERENCE_INVALID', 'Artifact Registry repository is malformed.');
  }

  const segments = value.split('/');

  if (segments.length !== 3) {
    throw new ArtifactRegistryError('REGISTRY_REFERENCE_INVALID', 'Artifact Registry repository root is invalid.');
  }

  const [host, project, repository] = segments;
  const hostMatch = AR_HOST_RE.exec(host ?? '');

  if (!hostMatch?.groups?.location || !PROJECT_RE.test(project ?? '') || !REPOSITORY_RE.test(repository ?? '')) {
    throw new ArtifactRegistryError('REGISTRY_REFERENCE_INVALID', 'Artifact Registry repository root is invalid.');
  }

  return {
    original: value,
    host: host!,
    location: hostMatch.groups.location,
    project: project!,
    repository: repository!,
  };
}

/**
 * Validate a concrete Artifact Registry IMAGE repository (including a package
 * path), for example `europe-west9-docker.pkg.dev/acme-prod/apps/p-project`.
 */
export function parseArtifactRegistryImageRepository(value: string): ArtifactRegistryRepository {
  if (value !== value.trim() || value.includes('://') || value.includes('@') || value.includes(':')) {
    throw new ArtifactRegistryError('REGISTRY_REFERENCE_INVALID', 'Artifact Registry repository is malformed.');
  }

  const segments = value.split('/');

  if (segments.length < 4 || segments.some((segment) => !segment)) {
    throw new ArtifactRegistryError('REGISTRY_REFERENCE_INVALID', 'Artifact Registry image path is incomplete.');
  }

  const [host, project, repository, ...packagePath] = segments;
  const hostMatch = AR_HOST_RE.exec(host ?? '');

  if (
    !hostMatch?.groups?.location ||
    !PROJECT_RE.test(project ?? '') ||
    !REPOSITORY_RE.test(repository ?? '') ||
    packagePath.length === 0 ||
    packagePath.some((segment) => !SEGMENT_RE.test(segment))
  ) {
    throw new ArtifactRegistryError('REGISTRY_REFERENCE_INVALID', 'Artifact Registry image path is invalid.');
  }

  return {
    original: value,
    host: host!,
    location: hostMatch.groups.location,
    project: project!,
    repository: repository!,
    packagePath,
    distributionName: [project!, repository!, ...packagePath].map(encodeURIComponent).join('/'),
  };
}

export function assertSha256Digest(value: string): string {
  if (!DIGEST_RE.test(value)) {
    throw new ArtifactRegistryError('REGISTRY_DIGEST_INVALID', 'Artifact digest must be a lowercase sha256 digest.');
  }

  return value;
}

export interface AccessTokenProvider {
  getAccessToken(): Promise<string>;
}

/** ADC supports local Application Default Credentials, GKE Workload Identity and WIF. */
export class GoogleAdcAccessTokenProvider implements AccessTokenProvider {
  readonly #client: Promise<AuthClient>;

  constructor(auth: GoogleAuth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] })) {
    this.#client = auth.getClient();
  }

  async getAccessToken(): Promise<string> {
    const response = await (await this.#client).getAccessToken();
    const token = typeof response === 'string' ? response : response?.token;

    if (!token) {
      throw new ArtifactRegistryError(
        'REGISTRY_AUTH_UNAVAILABLE',
        'Application Default Credentials returned no token.',
      );
    }

    return token;
  }
}

interface OciDescriptor {
  mediaType?: string;
  digest?: string;
  artifactType?: string;
  size?: number;
  annotations?: Record<string, string>;
}

interface OciManifest {
  mediaType?: string;
  artifactType?: string;
  subject?: OciDescriptor;
  config?: OciDescriptor;
  layers?: OciDescriptor[];

  /** OCI 1.1 artifact manifests use `blobs`, rather than image `layers`. */
  blobs?: OciDescriptor[];
  manifests?: OciDescriptor[];
  annotations?: Record<string, string>;
}

interface ManifestDocument {
  bytes: Buffer;
  contentType: string;
  value: OciManifest;
}

interface InTotoStatement {
  _type?: unknown;
  predicateType?: unknown;
  subject?: unknown;
  predicate?: unknown;
}

interface ParsedEvidence {
  verifiedKind?: AttestationKind;
  predicateType?: string;
  evidenceFormat?: OciAttachment['evidenceFormat'];
}

function parseJsonObject(bytes: Buffer, code: string, message: string): Record<string, unknown> {
  try {
    const value = JSON.parse(bytes.toString('utf8')) as unknown;

    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(INVALID_JSON_OBJECT);
    }

    return value as Record<string, unknown>;
  } catch (error) {
    throw new ArtifactRegistryError(code, message, { cause: error });
  }
}

function decodeBase64(value: unknown, code: string): Buffer {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > Math.ceil((MAX_EVIDENCE_BYTES * 4) / 3) + 4 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value)
  ) {
    throw new ArtifactRegistryError(code, 'Attestation contains malformed base64 data.');
  }

  const bytes = Buffer.from(value, 'base64');

  if (bytes.byteLength === 0 || bytes.byteLength > MAX_EVIDENCE_BYTES) {
    throw new ArtifactRegistryError(code, 'Attestation payload exceeds the safety limit.');
  }

  return bytes;
}

function hasNonEmptyDsseSignatures(value: unknown): boolean {
  if (!Array.isArray(value) || value.length === 0) {
    return false;
  }

  return value.every((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return false;
    }

    try {
      return decodeBase64((entry as Record<string, unknown>).sig, 'REGISTRY_ATTESTATION_INVALID').byteLength > 0;
    } catch {
      return false;
    }
  });
}

function parseInTotoEnvelope(value: Record<string, unknown>, subjectDigest: string): ParsedEvidence {
  if (value.payloadType !== IN_TOTO_PAYLOAD_TYPE || !hasNonEmptyDsseSignatures(value.signatures)) {
    throw new ArtifactRegistryError(
      'REGISTRY_ATTESTATION_INVALID',
      'DSSE evidence is unsigned or has an unsupported payload type.',
    );
  }

  const statement = parseJsonObject(
    decodeBase64(value.payload, 'REGISTRY_ATTESTATION_INVALID'),
    'REGISTRY_ATTESTATION_INVALID',
    'DSSE payload is not a valid in-toto statement.',
  ) as InTotoStatement;

  if (typeof statement._type !== 'string' || !IN_TOTO_STATEMENT_TYPES.has(statement._type)) {
    throw new ArtifactRegistryError('REGISTRY_ATTESTATION_INVALID', 'in-toto statement type is unsupported.');
  }

  if (!Array.isArray(statement.subject)) {
    throw new ArtifactRegistryError('REGISTRY_ATTESTATION_INVALID', 'in-toto statement has no subject.');
  }

  const digestHex = subjectDigest.slice('sha256:'.length);

  const subjectMatches = statement.subject.some((subject) => {
    if (!subject || typeof subject !== 'object' || Array.isArray(subject)) {
      return false;
    }

    const digest = (subject as { digest?: unknown }).digest;

    return (
      Boolean(digest) &&
      typeof digest === 'object' &&
      !Array.isArray(digest) &&
      (digest as Record<string, unknown>).sha256 === digestHex
    );
  });

  if (!subjectMatches) {
    throw new ArtifactRegistryError(
      'REGISTRY_ATTESTATION_SUBJECT_MISMATCH',
      'in-toto statement does not bind the promoted image digest.',
    );
  }

  if (typeof statement.predicateType !== 'string') {
    throw new ArtifactRegistryError('REGISTRY_ATTESTATION_INVALID', 'in-toto predicate type is missing.');
  }

  if (statement.predicateType === COSIGN_SIGNATURE_PREDICATE_TYPE) {
    if (!statement.predicate || typeof statement.predicate !== 'object' || Array.isArray(statement.predicate)) {
      throw new ArtifactRegistryError('REGISTRY_ATTESTATION_INVALID', 'Cosign signature predicate is malformed.');
    }

    return { verifiedKind: 'signature', predicateType: statement.predicateType };
  }

  if (SPDX_PREDICATE_TYPES.has(statement.predicateType)) {
    const predicate = statement.predicate;

    if (
      !predicate ||
      typeof predicate !== 'object' ||
      Array.isArray(predicate) ||
      typeof (predicate as Record<string, unknown>).spdxVersion !== 'string' ||
      !String((predicate as Record<string, unknown>).spdxVersion).startsWith('SPDX-')
    ) {
      throw new ArtifactRegistryError('REGISTRY_ATTESTATION_INVALID', 'SPDX predicate payload is malformed.');
    }

    return { verifiedKind: 'sbom', predicateType: statement.predicateType };
  }

  if (SLSA_PREDICATE_TYPES.has(statement.predicateType)) {
    if (!statement.predicate || typeof statement.predicate !== 'object' || Array.isArray(statement.predicate)) {
      throw new ArtifactRegistryError('REGISTRY_ATTESTATION_INVALID', 'SLSA predicate payload is malformed.');
    }

    return { verifiedKind: 'provenance', predicateType: statement.predicateType };
  }

  throw new ArtifactRegistryError(
    'REGISTRY_ATTESTATION_PREDICATE_UNSUPPORTED',
    'Attestation predicate is unsupported.',
  );
}

function inspectEvidence(input: {
  artifactType: string;
  manifest: OciManifest;
  payloads: Buffer[];
  subjectDigest: string;
}): ParsedEvidence {
  const { artifactType, manifest, payloads, subjectDigest } = input;

  if (artifactType === SIGSTORE_BUNDLE_MEDIA_TYPE) {
    if (payloads.length !== 1) {
      throw new ArtifactRegistryError('REGISTRY_ATTESTATION_INVALID', 'Sigstore bundle must have one payload.');
    }

    const bundle = parseJsonObject(
      payloads[0]!,
      'REGISTRY_ATTESTATION_INVALID',
      'Sigstore bundle payload is malformed.',
    );

    if (bundle.mediaType !== SIGSTORE_BUNDLE_MEDIA_TYPE) {
      throw new ArtifactRegistryError('REGISTRY_ATTESTATION_INVALID', 'Sigstore bundle media type is mismatched.');
    }

    const content = manifest.annotations?.['dev.sigstore.bundle.content'];
    const annotatedPredicate = manifest.annotations?.['dev.sigstore.bundle.predicateType'];

    if (content === 'message-signature') {
      const signature = bundle.messageSignature;

      if (!signature || typeof signature !== 'object' || Array.isArray(signature)) {
        throw new ArtifactRegistryError('REGISTRY_ATTESTATION_INVALID', 'Sigstore message signature is missing.');
      }

      const record = signature as Record<string, unknown>;
      const messageDigest = record.messageDigest;

      if (!messageDigest || typeof messageDigest !== 'object' || Array.isArray(messageDigest)) {
        throw new ArtifactRegistryError('REGISTRY_ATTESTATION_INVALID', 'Sigstore message digest is missing.');
      }

      const digestBytes = decodeBase64(
        (messageDigest as Record<string, unknown>).digest,
        'REGISTRY_ATTESTATION_INVALID',
      );

      const signatureBytes = decodeBase64(record.signature, 'REGISTRY_ATTESTATION_INVALID');
      const algorithm = (messageDigest as Record<string, unknown>).algorithm;
      const signedDigest = `sha256:${digestBytes.toString('hex')}`;

      if (
        algorithm !== 'SHA2_256' ||
        digestBytes.byteLength !== 32 ||
        signedDigest !== subjectDigest ||
        signatureBytes.byteLength === 0 ||
        annotatedPredicate
      ) {
        throw new ArtifactRegistryError('REGISTRY_ATTESTATION_INVALID', 'Sigstore message signature is malformed.');
      }

      return {
        verifiedKind: 'signature',
        evidenceFormat: 'sigstore-bundle-message-signature',
      };
    }

    if (content === 'dsse-envelope') {
      const envelope = bundle.dsseEnvelope;

      if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) {
        throw new ArtifactRegistryError('REGISTRY_ATTESTATION_INVALID', 'Sigstore DSSE envelope is missing.');
      }

      const parsed = parseInTotoEnvelope(envelope as Record<string, unknown>, subjectDigest);

      if (!annotatedPredicate || annotatedPredicate !== parsed.predicateType) {
        throw new ArtifactRegistryError(
          'REGISTRY_ATTESTATION_INVALID',
          'Sigstore predicate annotation does not match its signed payload.',
        );
      }

      return { ...parsed, evidenceFormat: 'sigstore-bundle-dsse' };
    }

    throw new ArtifactRegistryError('REGISTRY_ATTESTATION_INVALID', 'Sigstore bundle content is unsupported.');
  }

  if (artifactType === 'application/vnd.in-toto.provenance+dsse') {
    if (payloads.length !== 1) {
      throw new ArtifactRegistryError('REGISTRY_ATTESTATION_INVALID', 'Cloud Build provenance must have one payload.');
    }

    const parsed = parseInTotoEnvelope(
      parseJsonObject(payloads[0]!, 'REGISTRY_ATTESTATION_INVALID', 'Cloud Build provenance envelope is malformed.'),
      subjectDigest,
    );

    if (parsed.verifiedKind !== 'provenance') {
      throw new ArtifactRegistryError(
        'REGISTRY_ATTESTATION_PREDICATE_UNSUPPORTED',
        'Cloud Build provenance carries a non-SLSA predicate.',
      );
    }

    return { ...parsed, evidenceFormat: 'cloud-build-dsse' };
  }

  return {};
}

export interface ArtifactRegistryAdapterOptions {
  tokenProvider?: AccessTokenProvider;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  maxAttempts?: number;
  requestTimeoutMs?: number;
}

/**
 * Live OCI Distribution 1.1 adapter for Artifact Registry. It intentionally
 * uses HTTP rather than `gcloud`, so production identity is ADC/WI and no
 * persistent credential or subprocess is involved.
 */
export class ArtifactRegistryOciAdapter implements RegistryAdapter {
  readonly #tokenProvider: AccessTokenProvider;
  readonly #fetch: typeof fetch;
  readonly #sleep: (ms: number) => Promise<void>;
  readonly #maxAttempts: number;
  readonly #requestTimeoutMs: number;

  constructor(options: ArtifactRegistryAdapterOptions = {}) {
    this.#tokenProvider = options.tokenProvider ?? new GoogleAdcAccessTokenProvider();
    this.#fetch = options.fetchImpl ?? fetch;
    this.#sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.#maxAttempts = Math.max(1, Math.min(options.maxAttempts ?? 4, 6));
    this.#requestTimeoutMs = Math.max(1_000, Math.min(options.requestTimeoutMs ?? 30_000, 120_000));
  }

  async imageExists(repo: string, digest: string): Promise<boolean> {
    const parsed = parseArtifactRegistryImageRepository(repo);

    const response = await this.#request(this.#url(parsed, `manifests/${assertSha256Digest(digest)}`), {
      method: 'HEAD',
      headers: { accept: MANIFEST_ACCEPT },
    });

    if (response.status === 404) {
      return false;
    }

    this.#assertOk(response, 'REGISTRY_MANIFEST_LOOKUP_FAILED');

    return true;
  }

  async listReferrers(repo: string, digest: string): Promise<OciAttachment[]> {
    const parsed = parseArtifactRegistryImageRepository(repo);
    const subjectDigest = assertSha256Digest(digest);
    const descriptors: OciDescriptor[] = [];
    const pages = new Set<string>();

    let next: URL | undefined = this.#url(parsed, `referrers/${subjectDigest}`);

    while (next) {
      if (pages.size >= MAX_REFERRER_PAGES || pages.has(next.href)) {
        throw new ArtifactRegistryError(
          'REGISTRY_REFERRERS_INVALID',
          'OCI referrers pagination is cyclic or excessive.',
        );
      }

      pages.add(next.href);

      const response = await this.#request(next, { headers: { accept: 'application/vnd.oci.image.index.v1+json' } });

      if (response.status === 404) {
        return [];
      }

      this.#assertOk(response, 'REGISTRY_REFERRERS_LOOKUP_FAILED');

      const body = parseJsonObject(
        await this.#readBoundedResponseBytes(
          response,
          MAX_REFERRERS_INDEX_BYTES,
          'REGISTRY_REFERRERS_INVALID',
          'OCI referrers response exceeds the safety limit.',
        ),
        'REGISTRY_REFERRERS_INVALID',
        'OCI referrers response is malformed.',
      ) as { manifests?: OciDescriptor[] };

      if (!Array.isArray(body.manifests)) {
        throw new ArtifactRegistryError('REGISTRY_REFERRERS_INVALID', 'OCI referrers response is malformed.');
      }

      descriptors.push(...body.manifests);

      if (descriptors.length > MAX_REFERRERS) {
        throw new ArtifactRegistryError('REGISTRY_REFERRERS_INVALID', 'OCI referrers set exceeds the safety limit.');
      }

      next = this.#nextLink(response.headers.get('link'), next, parsed);
    }

    const attachments: OciAttachment[] = [];
    const seen = new Set<string>();

    for (const descriptor of descriptors) {
      const attachmentDigest = assertSha256Digest(descriptor.digest ?? '');

      if (seen.has(attachmentDigest)) {
        continue;
      }

      seen.add(attachmentDigest);

      const manifest = await this.#readManifest(parsed, attachmentDigest);
      const actualSubject = assertSha256Digest(manifest.value.subject?.digest ?? '');
      const artifactType = descriptor.artifactType ?? manifest.value.artifactType;

      if (!artifactType || typeof artifactType !== 'string' || artifactType.length > 255) {
        throw new ArtifactRegistryError(
          'REGISTRY_REFERRER_INVALID',
          'OCI referrer does not declare a valid artifact type.',
        );
      }

      const payloadDigests = [...(manifest.value.layers ?? []), ...(manifest.value.blobs ?? [])].map((payload) =>
        assertSha256Digest(payload.digest ?? ''),
      );

      if (payloadDigests.length === 0 || payloadDigests.length > MAX_EVIDENCE_PAYLOADS) {
        throw new ArtifactRegistryError('REGISTRY_REFERRER_PAYLOAD_MISSING', 'OCI referrer has no evidence payload.');
      }

      const payloads: Buffer[] = [];

      let remainingEvidenceBytes = MAX_EVIDENCE_BYTES;

      for (const payloadDigest of payloadDigests) {
        const payload = await this.#readBlobBytes(parsed, payloadDigest, remainingEvidenceBytes);
        payloads.push(payload);
        remainingEvidenceBytes -= payload.byteLength;
      }

      const evidence = inspectEvidence({
        artifactType,
        manifest: manifest.value,
        payloads,
        subjectDigest: actualSubject,
      });

      attachments.push({
        digest: attachmentDigest,
        artifactType,
        subjectDigest: actualSubject,
        payloadDigests,
        payloadVerified: true,
        ...evidence,
      });
    }

    return attachments;
  }

  async copyImage(source: RegistryRef, targetRepo: string): Promise<{ created: boolean }> {
    const sourceRepo = parseArtifactRegistryImageRepository(source.repo);
    const target = parseArtifactRegistryImageRepository(targetRepo);
    const digest = assertSha256Digest(source.digest);
    const existed = await this.imageExists(targetRepo, digest);

    if (!existed) {
      await this.#copyManifestGraph(sourceRepo, target, digest, new Set());
    }

    /*
     * Verify after PUT; a 2xx response is not sufficient evidence that the
     * target can be pulled in the target repository context.
     */
    if (!(await this.imageExists(targetRepo, digest))) {
      throw new ArtifactRegistryError('REGISTRY_IMAGE_COPY_UNVERIFIED', 'Copied OCI image is not readable at target.');
    }

    return { created: !existed };
  }

  async copyAndRelinkReferrer(
    source: { repo: string; attachment: OciAttachment },
    targetRepo: string,
    newSubjectDigest: string,
  ): Promise<{ attachment: OciAttachment; created: boolean }> {
    const sourceRepo = parseArtifactRegistryImageRepository(source.repo);
    const target = parseArtifactRegistryImageRepository(targetRepo);
    const attachmentDigest = assertSha256Digest(source.attachment.digest);
    const subjectDigest = assertSha256Digest(newSubjectDigest);
    const document = await this.#readManifest(sourceRepo, attachmentDigest);
    const sourceSubject = assertSha256Digest(document.value.subject?.digest ?? '');

    /*
     * OCI subject digests are content identities, so a byte-identical image has
     * the same digest in source and target. Re-linking means writing the signed
     * attachment manifest into the TARGET repository; mutating `subject` would
     * change its digest and invalidate a signature/provenance envelope.
     */
    if (sourceSubject !== source.attachment.subjectDigest || sourceSubject !== subjectDigest) {
      throw new ArtifactRegistryError(
        'REGISTRY_REFERRER_SUBJECT_MISMATCH',
        'OCI referrer subject does not match the promoted image digest.',
      );
    }

    const existed = await this.#manifestExists(target, attachmentDigest);

    if (!existed) {
      await this.#copyManifestGraph(sourceRepo, target, attachmentDigest, new Set());
    }

    const verified = (await this.listReferrers(targetRepo, subjectDigest)).find(
      (attachment) => attachment.digest === attachmentDigest && attachment.subjectDigest === subjectDigest,
    );

    if (!verified) {
      throw new ArtifactRegistryError(
        'REGISTRY_REFERRER_COPY_UNVERIFIED',
        'Copied OCI referrer is not linked to the target image.',
      );
    }

    return { attachment: verified, created: !existed };
  }

  async deleteReferrer(repo: string, digest: string): Promise<void> {
    await this.#deleteManifest(parseArtifactRegistryImageRepository(repo), assertSha256Digest(digest));
  }

  async deleteImage(repo: string, digest: string): Promise<void> {
    await this.#deleteManifest(parseArtifactRegistryImageRepository(repo), assertSha256Digest(digest));
  }

  async pinImage(repo: string, digest: string, tag: string): Promise<{ created: boolean }> {
    const target = parseArtifactRegistryImageRepository(repo);
    const expectedDigest = assertSha256Digest(digest);

    if (!RETENTION_TAG_RE.test(tag)) {
      throw new ArtifactRegistryError('REGISTRY_RETENTION_TAG_INVALID', 'Artifact retention tag is invalid.');
    }

    const tagUrl = this.#url(target, `manifests/${tag}`);
    const existing = await this.#request(tagUrl, { headers: { accept: MANIFEST_ACCEPT } });

    if (existing.ok) {
      const existingBytes = await this.#readBoundedResponseBytes(
        existing,
        MAX_MANIFEST_BYTES,
        'REGISTRY_MANIFEST_TOO_LARGE',
        'OCI manifest exceeds the safety limit.',
      );

      const existingDigest = `sha256:${createHash('sha256').update(existingBytes).digest('hex')}`;

      if (existingDigest !== expectedDigest) {
        throw new ArtifactRegistryError(
          'REGISTRY_RETENTION_TAG_CONFLICT',
          'Artifact retention tag already points at another digest.',
        );
      }

      return { created: false };
    }

    if (existing.status !== 404) {
      this.#assertOk(existing, 'REGISTRY_RETENTION_TAG_LOOKUP_FAILED');
    }

    const document = await this.#readManifest(target, expectedDigest);

    const pinned = await this.#request(tagUrl, {
      method: 'PUT',
      headers: { 'content-type': document.contentType },
      body: document.bytes,
    });
    this.#assertOk(pinned, 'REGISTRY_RETENTION_TAG_WRITE_FAILED');

    const verified = await this.#request(tagUrl, { headers: { accept: MANIFEST_ACCEPT } });
    this.#assertOk(verified, 'REGISTRY_RETENTION_TAG_UNVERIFIED');

    const verifiedBytes = await this.#readBoundedResponseBytes(
      verified,
      MAX_MANIFEST_BYTES,
      'REGISTRY_MANIFEST_TOO_LARGE',
      'OCI manifest exceeds the safety limit.',
    );

    const verifiedDigest = `sha256:${createHash('sha256').update(verifiedBytes).digest('hex')}`;

    if (verifiedDigest !== expectedDigest) {
      throw new ArtifactRegistryError('REGISTRY_RETENTION_TAG_UNVERIFIED', 'Artifact retention tag was not pinned.');
    }

    return { created: true };
  }

  async #deleteManifest(repo: ArtifactRegistryRepository, digest: string): Promise<void> {
    const response = await this.#request(this.#url(repo, `manifests/${digest}`), { method: 'DELETE' });

    if (response.status === 404) {
      return;
    }

    this.#assertOk(response, 'REGISTRY_ROLLBACK_DELETE_FAILED');
  }

  async #copyManifestGraph(
    source: ArtifactRegistryRepository,
    target: ArtifactRegistryRepository,
    digest: string,
    visited: Set<string>,
  ): Promise<void> {
    if (visited.has(digest)) {
      return;
    }

    visited.add(digest);

    if (await this.#manifestExists(target, digest)) {
      return;
    }

    const document = await this.#readManifest(source, digest);

    const blobDescriptors = [
      document.value.config,
      ...(document.value.layers ?? []),
      ...(document.value.blobs ?? []),
    ].filter((descriptor): descriptor is OciDescriptor => Boolean(descriptor?.digest));

    for (const descriptor of blobDescriptors) {
      await this.#copyBlob(source, target, assertSha256Digest(descriptor.digest ?? ''));
    }

    for (const child of document.value.manifests ?? []) {
      await this.#copyManifestGraph(source, target, assertSha256Digest(child.digest ?? ''), visited);
    }

    const response = await this.#request(this.#url(target, `manifests/${digest}`), {
      method: 'PUT',
      headers: { 'content-type': document.contentType },
      body: document.bytes,
    });
    this.#assertOk(response, 'REGISTRY_MANIFEST_COPY_FAILED');
  }

  async #copyBlob(
    source: ArtifactRegistryRepository,
    target: ArtifactRegistryRepository,
    digest: string,
  ): Promise<void> {
    const targetUrl = this.#url(target, `blobs/${digest}`);
    const exists = await this.#request(targetUrl, { method: 'HEAD' });

    if (exists.ok) {
      return;
    }

    if (exists.status !== 404) {
      this.#assertOk(exists, 'REGISTRY_BLOB_LOOKUP_FAILED');
    }

    const begun = await this.#request(this.#url(target, 'blobs/uploads/'), { method: 'POST' });
    this.#assertOk(begun, 'REGISTRY_BLOB_UPLOAD_START_FAILED');

    const location = begun.headers.get('location');

    if (!location) {
      throw new ArtifactRegistryError('REGISTRY_BLOB_UPLOAD_INVALID', 'OCI upload response has no location.');
    }

    const upload = new URL(location, begun.url || this.#url(target, 'blobs/uploads/'));
    const expectedOrigin = `https://${target.host}`;
    const expectedPrefix = `/v2/${target.distributionName}/blobs/uploads/`;

    if (upload.origin !== expectedOrigin || !upload.pathname.startsWith(expectedPrefix)) {
      /*
       * Never forward the ADC bearer token to a registry-controlled off-origin
       * Location header.
       */
      throw new ArtifactRegistryError('REGISTRY_UPLOAD_LOCATION_INVALID', 'OCI upload location was rejected.');
    }

    upload.searchParams.set('digest', digest);

    const sourceResponse = await this.#request(this.#url(source, `blobs/${digest}`));
    this.#assertOk(sourceResponse, 'REGISTRY_BLOB_READ_FAILED');

    if (!sourceResponse.body) {
      throw new ArtifactRegistryError('REGISTRY_BLOB_READ_FAILED', 'Source OCI blob returned no body.');
    }

    /*
     * Stream layers end-to-end. Container layers can be many GiB, so buffering
     * `arrayBuffer()` here would let a legitimate build exhaust the API pod.
     * The hashing transform validates every byte while applying fetch
     * backpressure; the target registry independently enforces the digest too.
     */
    const hash = createHash('sha256');

    let actualDigest: string | undefined;

    const monitoredBody = sourceResponse.body.pipeThrough(
      new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          hash.update(chunk);
          controller.enqueue(chunk);
        },
        flush() {
          actualDigest = `sha256:${hash.digest('hex')}`;
        },
      }),
    );
    const completed = await this.#request(
      upload,
      {
        method: 'PUT',
        headers: { 'content-type': 'application/octet-stream' },
        body: monitoredBody,

        // Required by Node's fetch implementation for a streaming request body.
        duplex: 'half',
      } as RequestInit & { duplex: 'half' },
      1,
    );
    this.#assertOk(completed, 'REGISTRY_BLOB_UPLOAD_FAILED');

    if (actualDigest !== digest) {
      throw new ArtifactRegistryError('REGISTRY_BLOB_DIGEST_MISMATCH', 'Source OCI blob failed digest verification.');
    }
  }

  async #readManifest(repo: ArtifactRegistryRepository, digest: string): Promise<ManifestDocument> {
    const response = await this.#request(this.#url(repo, `manifests/${assertSha256Digest(digest)}`), {
      headers: { accept: MANIFEST_ACCEPT },
    });
    this.#assertOk(response, 'REGISTRY_MANIFEST_READ_FAILED');

    const bytes = await this.#readBoundedResponseBytes(
      response,
      MAX_MANIFEST_BYTES,
      'REGISTRY_MANIFEST_TOO_LARGE',
      'OCI manifest exceeds the safety limit.',
    );

    const actualDigest = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

    if (actualDigest !== digest) {
      throw new ArtifactRegistryError(
        'REGISTRY_MANIFEST_DIGEST_MISMATCH',
        'Source OCI manifest failed digest verification.',
      );
    }

    let value: OciManifest;

    try {
      value = JSON.parse(bytes.toString('utf8')) as OciManifest;
    } catch (error) {
      throw new ArtifactRegistryError('REGISTRY_MANIFEST_INVALID', 'OCI manifest is not valid JSON.', { cause: error });
    }

    return {
      bytes,
      value,
      contentType:
        response.headers.get('content-type')?.split(';', 1)[0] || value.mediaType || MANIFEST_ACCEPT.split(',')[0]!,
    };
  }

  async #manifestExists(repo: ArtifactRegistryRepository, digest: string): Promise<boolean> {
    const response = await this.#request(this.#url(repo, `manifests/${digest}`), {
      method: 'HEAD',
      headers: { accept: MANIFEST_ACCEPT },
    });

    if (response.status === 404) {
      return false;
    }

    this.#assertOk(response, 'REGISTRY_MANIFEST_LOOKUP_FAILED');

    return true;
  }

  async #readBlobBytes(repo: ArtifactRegistryRepository, digest: string, maxBytes: number): Promise<Buffer> {
    const response = await this.#request(this.#url(repo, `blobs/${assertSha256Digest(digest)}`));
    this.#assertOk(response, 'REGISTRY_REFERRER_PAYLOAD_MISSING');

    const bytes = await this.#readBoundedResponseBytes(
      response,
      maxBytes,
      'REGISTRY_REFERRER_PAYLOAD_TOO_LARGE',
      'OCI evidence exceeds the safety limit.',
    );

    const actualDigest = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

    if (actualDigest !== digest) {
      throw new ArtifactRegistryError(
        'REGISTRY_REFERRER_PAYLOAD_DIGEST_MISMATCH',
        'OCI evidence payload failed digest verification.',
      );
    }

    return bytes;
  }

  async #readBoundedResponseBytes(
    response: Response,
    maxBytes: number,
    code: string,
    message: string,
  ): Promise<Buffer> {
    const contentLengthHeader = response.headers.get('content-length');
    const contentLength = contentLengthHeader === null ? undefined : Number(contentLengthHeader);

    if (contentLength !== undefined && Number.isFinite(contentLength) && contentLength > maxBytes) {
      await response.body?.cancel().catch(() => undefined);
      throw new ArtifactRegistryError(code, message);
    }

    if (!response.body) {
      throw new ArtifactRegistryError(code, message);
    }

    const reader = response.body.getReader();
    const chunks: Buffer[] = [];

    let totalBytes = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        totalBytes += value.byteLength;

        if (totalBytes > maxBytes) {
          await reader.cancel().catch(() => undefined);
          throw new ArtifactRegistryError(code, message);
        }

        chunks.push(Buffer.from(value));
      }
    } finally {
      reader.releaseLock();
    }

    if (totalBytes === 0) {
      throw new ArtifactRegistryError(code, message);
    }

    return Buffer.concat(chunks, totalBytes);
  }

  #url(repo: ArtifactRegistryRepository, suffix: string): URL {
    return new URL(`https://${repo.host}/v2/${repo.distributionName}/${suffix}`);
  }

  #nextLink(header: string | null, current: URL, repo: ArtifactRegistryRepository): URL | undefined {
    if (!header) {
      return undefined;
    }

    const match = /<([^>]+)>;\s*rel="?next"?/iu.exec(header);

    if (!match?.[1]) {
      return undefined;
    }

    const next = new URL(match[1], current);
    const expectedPrefix = `/v2/${repo.distributionName}/referrers/`;

    if (next.origin !== current.origin || !next.pathname.startsWith(expectedPrefix)) {
      throw new ArtifactRegistryError('REGISTRY_PAGINATION_LINK_INVALID', 'OCI pagination link was rejected.');
    }

    return next;
  }

  async #request(url: URL, init: RequestInit = {}, maxAttempts = this.#maxAttempts): Promise<Response> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.#requestTimeoutMs);
      timeout.unref();

      let responseReturned = false;

      try {
        const token = await this.#tokenProvider.getAccessToken();
        const headers = new Headers(init.headers);
        headers.set('authorization', `Bearer ${token}`);

        const method = (init.method ?? 'GET').toUpperCase();

        let currentUrl = url;
        let response: Response | undefined;

        for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
          response = await this.#fetch(currentUrl, {
            ...init,

            /*
             * Artifact Registry redirects blob downloads to an internal path.
             * Follow manually so the ADC token can never cross origins.
             */
            redirect: 'manual',
            signal: controller.signal,
            headers,
          });

          if (!REDIRECT_STATUS.has(response.status)) {
            break;
          }

          if (!['GET', 'HEAD'].includes(method) || redirects === MAX_REDIRECTS) {
            throw new ArtifactRegistryError('REGISTRY_REDIRECT_INVALID', 'Artifact Registry redirect was rejected.');
          }

          const location = response.headers.get('location');

          if (!location) {
            throw new ArtifactRegistryError('REGISTRY_REDIRECT_INVALID', 'Artifact Registry redirect has no location.');
          }

          const next = new URL(location, currentUrl);

          if (next.origin !== url.origin) {
            /*
             * Never forward the ADC bearer token to a registry-controlled
             * off-origin redirect, including a purported signed download URL.
             */
            throw new ArtifactRegistryError('REGISTRY_REDIRECT_INVALID', 'Artifact Registry redirect left its origin.');
          }

          await response.arrayBuffer().catch(() => undefined);
          currentUrl = next;
        }

        if (!response) {
          throw new ArtifactRegistryError('REGISTRY_REQUEST_FAILED', 'Artifact Registry returned no response.');
        }

        if ((response.status === 401 || TRANSIENT_STATUS.has(response.status)) && attempt < maxAttempts) {
          await response.arrayBuffer().catch(() => undefined);
          await this.#sleep(Math.min(100 * 2 ** (attempt - 1), 1_000));
          continue;
        }

        responseReturned = true;

        return response;
      } catch (error) {
        lastError = error;

        if (attempt >= maxAttempts) {
          break;
        }

        await this.#sleep(Math.min(100 * 2 ** (attempt - 1), 1_000));
      } finally {
        /*
         * Keep the abort deadline alive while the caller consumes a response
         * body. This bounds slow/hung blob and manifest bodies, not just the
         * time-to-first-header. The timer is unref'd so completed HEAD requests
         * never delay process shutdown.
         */
        if (!responseReturned) {
          clearTimeout(timeout);
        }
      }
    }

    throw new ArtifactRegistryError('REGISTRY_REQUEST_FAILED', 'Artifact Registry request failed.', {
      cause: lastError,
    });
  }

  #assertOk(response: Response, code: string): void {
    if (!response.ok) {
      /*
       * Deliberately omit response bodies and Authorization headers: registry
       * failures are catalogued by code, never by token-bearing diagnostics.
       */
      throw new ArtifactRegistryError(code, `Artifact Registry request failed with HTTP ${response.status}.`);
    }
  }
}
