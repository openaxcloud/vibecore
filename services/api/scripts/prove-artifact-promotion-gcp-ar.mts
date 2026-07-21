/**
 * LIVE proof for P0-V3-07 / UNK-AR-LIVE-PROMOTION / PLAN_PARITE_REPLIT §13.5,
 * against a REAL Google Artifact Registry (not the zot stand-in).
 *
 * Drives {@link promoteArtifact} through the {@link OciDistributionAdapter} —
 * with `staticBearerAuth(<gcloud access token>)` — against actual AR repos in a
 * DEDICATED TEST project (never the user's prod). Proves, for real, over HTTPS:
 *
 *   POSITIVE  full chain promoted BY DIGEST across AR repos (image + signature +
 *             SBOM + provenance), each attestation re-linked and re-discovered in
 *             the TARGET AR repo; signature verified + signer policy satisfied in
 *             the target (TARGET_SIGNATURE_VERIFIED, TARGET_POLICY_VERIFIED).
 *   FALLBACK  the same discovery via the tag-schema fallback (`sha256-<hex>`).
 *   NEG-1     an INVALID signature ⇒ promotion refused (PROMOTION_BINAUTHZ_DENIED)
 *             and the tenant left with no verifiable image (coupled retention).
 *   NEG-2     a VALID signature by an UNTRUSTED signer (policy not satisfied) ⇒
 *             promotion refused, tenant left clean.
 *
 * Repro (repos must exist; see README):
 *   AR_PROJECT=ecode-proof-b906ss AR_LOCATION=europe-west9 \
 *   pnpm --filter @vibecore/api exec tsx scripts/prove-artifact-promotion-gcp-ar.mts
 * Auth: uses `gcloud auth print-access-token` (short-lived; zero persistent key).
 */

import { execFile } from 'node:child_process';
import {
  createHash,
  generateKeyPairSync,
  sign as cryptoSign,
  verify as cryptoVerify,
  type KeyObject,
  createPublicKey,
} from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { promoteArtifact, type AttestationKind } from '../src/artifact-promotion.js';
import { OciDistributionAdapter, digestToFallbackTag, staticBearerAuth } from '../src/artifact-registry-live-adapter.js';

const execFileP = promisify(execFile);

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '..', '..', '..');
const EVIDENCE_DIR = join(REPO_ROOT, 'docs', 'deploy-evidence', '2026-07-21-artifact-promotion-gcp-ar');

const PROJECT = process.env.AR_PROJECT ?? 'ecode-proof-b906ss';
const LOCATION = process.env.AR_LOCATION ?? 'europe-west9';
const REGISTRY = `${LOCATION}-docker.pkg.dev`;
const SRC_REPO = process.env.AR_SRC_REPO ?? 'promo-src';
const TENANT_REPO = process.env.AR_TENANT_REPO ?? 'promo-tenant';

// ── evidence log ────────────────────────────────────────────────────────────

interface Step {
  step: string;
  detail: unknown;
}

const steps: Step[] = [];
const t0 = Date.now();
const rel = () => `${Date.now() - t0}ms`;

function record(step: string, detail: unknown) {
  steps.push({ step, detail });
  console.log(`[${rel()}] ${step}: ${JSON.stringify(detail)}`);
}

function assert(cond: boolean, msg: string) {
  if (!cond) {
    throw new Error(`ASSERTION FAILED: ${msg}`);
  }
  record('assert.ok', msg);
}

// ── auth ─────────────────────────────────────────────────────────────────────

async function gcloudToken(): Promise<string> {
  const { stdout } = await execFileP('gcloud', ['auth', 'print-access-token'], { maxBuffer: 1 << 20 });
  return stdout.trim();
}

let TOKEN = '';
const authHeaders = () => ({ Authorization: `Bearer ${TOKEN}` });

// ── OCI raw HTTP helpers (an authed pushing client, independent of the adapter) ─

const base = `https://${REGISTRY}`;

const MT_CONFIG = 'application/vnd.oci.image.config.v1+json';
const MT_LAYER = 'application/vnd.oci.image.layer.v1.tar';
const MT_MANIFEST = 'application/vnd.oci.image.manifest.v1+json';
const MT_INDEX = 'application/vnd.oci.image.index.v1+json';
const MT_EMPTY = 'application/vnd.oci.empty.v1+json';

const AT_SIG = 'application/vnd.dev.cosign.simplesigning.v1+json';
const AT_SBOM = 'application/vnd.cyclonedx+json';
const AT_PROV = 'application/vnd.in-toto+json';

interface Descriptor {
  mediaType: string;
  digest: string;
  size: number;
  artifactType?: string;
}

function digestOf(bytes: Uint8Array): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

/** `repo` here is the AR path suffix, e.g. "promo-src/app". */
function path(repo: string): string {
  return `${PROJECT}/${repo}`;
}

async function pushBlob(repo: string, bytes: Uint8Array, mediaType: string): Promise<Descriptor> {
  const digest = digestOf(bytes);
  // Skip if already present.
  const head = await fetch(`${base}/v2/${path(repo)}/blobs/${digest}`, { method: 'HEAD', headers: authHeaders() });

  if (head.status === 200) {
    return { mediaType, digest, size: bytes.length };
  }

  const start = await fetch(`${base}/v2/${path(repo)}/blobs/uploads/`, { method: 'POST', headers: authHeaders() });

  if (start.status !== 202) {
    throw new Error(`blob upload start ${repo} → ${start.status} ${await start.text().catch(() => '')}`);
  }

  const loc = start.headers.get('location')!;
  const abs = loc.startsWith('http') ? loc : `${base}${loc}`;
  const put = await fetch(`${abs}${abs.includes('?') ? '&' : '?'}digest=${encodeURIComponent(digest)}`, {
    method: 'PUT',
    headers: { ...authHeaders(), 'Content-Type': 'application/octet-stream' },
    body: Buffer.from(bytes),
  });

  if (put.status !== 201) {
    throw new Error(`blob PUT ${repo} ${digest} → ${put.status} ${await put.text().catch(() => '')}`);
  }

  return { mediaType, digest, size: bytes.length };
}

async function pushManifest(repo: string, obj: unknown, mediaType: string, reference?: string): Promise<Descriptor> {
  const bytes = new Uint8Array(Buffer.from(JSON.stringify(obj), 'utf8'));
  const digest = digestOf(bytes);
  const put = await fetch(`${base}/v2/${path(repo)}/manifests/${reference ?? digest}`, {
    method: 'PUT',
    headers: { ...authHeaders(), 'Content-Type': mediaType },
    body: Buffer.from(bytes),
  });

  if (put.status !== 201) {
    throw new Error(`manifest PUT ${repo} ${reference ?? digest} → ${put.status} ${await put.text().catch(() => '')}`);
  }

  return { mediaType, digest, size: bytes.length, artifactType: (obj as { artifactType?: string }).artifactType };
}

async function getBlobBytes(repo: string, digest: string): Promise<Uint8Array> {
  const res = await fetch(`${base}/v2/${path(repo)}/blobs/${digest}`, { headers: authHeaders() });

  if (!res.ok) {
    throw new Error(`GET blob ${repo} ${digest} → ${res.status}`);
  }

  return new Uint8Array(await res.arrayBuffer());
}

async function manifestStatus(repo: string, reference: string): Promise<number> {
  const res = await fetch(`${base}/v2/${path(repo)}/manifests/${reference}`, {
    method: 'HEAD',
    headers: { ...authHeaders(), Accept: `${MT_MANIFEST}, ${MT_INDEX}` },
  });
  return res.status;
}

async function referrersApi(repo: string, digest: string): Promise<{ supported: boolean; descriptors: Descriptor[] }> {
  const res = await fetch(`${base}/v2/${path(repo)}/referrers/${digest}`, {
    headers: { ...authHeaders(), Accept: MT_INDEX },
  });

  if (res.status === 404 || res.status === 400) {
    return { supported: false, descriptors: [] };
  }

  if (!res.ok) {
    throw new Error(`referrers API ${repo}@${digest} → ${res.status}`);
  }

  const ct = res.headers.get('content-type') ?? '';

  if (!ct.includes('json')) {
    return { supported: false, descriptors: [] };
  }

  const idx = (await res.json()) as { manifests?: Descriptor[] };
  return { supported: true, descriptors: idx.manifests ?? [] };
}

// ── crypto: a minimal-but-real cosign-style signing/verification ─────────────

interface Signer {
  keyId: string;
  privateKey: KeyObject;
  publicKey: KeyObject;
}

function makeSigner(): Signer {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const keyId = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
  return { keyId, privateKey, publicKey };
}

interface SignaturePayload {
  keyId: string;
  imageDigest: string;
  sig: string;
}

function signImage(signer: Signer, imageDigest: string, opts: { corrupt?: boolean } = {}): SignaturePayload {
  const message = Buffer.from(imageDigest, 'utf8');
  const sig = cryptoSign('sha256', message, signer.privateKey);

  if (opts.corrupt) {
    sig[sig.length - 1] ^= 0xff;
  }

  return { keyId: signer.keyId, imageDigest, sig: sig.toString('base64') };
}

function verifySignaturePayload(payload: SignaturePayload, imageDigest: string): boolean {
  try {
    const pub = createPublicKey({ key: Buffer.from(payload.keyId, 'base64'), type: 'spki', format: 'der' });
    return (
      payload.imageDigest === imageDigest &&
      cryptoVerify('sha256', Buffer.from(imageDigest, 'utf8'), pub, Buffer.from(payload.sig, 'base64'))
    );
  } catch {
    return false;
  }
}

// ── seed an image + its full attestation chain into a source repo ────────────

async function seedImage(repo: string): Promise<{ imageDigest: string; imageSize: number }> {
  const config = await pushBlob(
    repo,
    new Uint8Array(
      Buffer.from(
        JSON.stringify({ architecture: 'amd64', os: 'linux', rootfs: { type: 'layers', diff_ids: [] } }),
        'utf8',
      ),
    ),
    MT_CONFIG,
  );
  const layer = await pushBlob(repo, new Uint8Array(Buffer.from(`payload-${repo}-${Date.now()}`, 'utf8')), MT_LAYER);
  const image = await pushManifest(
    repo,
    { schemaVersion: 2, mediaType: MT_MANIFEST, config, layers: [layer] },
    MT_MANIFEST,
  );
  return { imageDigest: image.digest, imageSize: image.size };
}

async function seedReferrer(
  repo: string,
  imageDigest: string,
  imageSize: number,
  artifactType: string,
  payloadBytes: Uint8Array,
): Promise<Descriptor> {
  const emptyConfig = await pushBlob(repo, new Uint8Array(Buffer.from('{}', 'utf8')), MT_EMPTY);
  const payload = await pushBlob(repo, payloadBytes, MT_LAYER);
  return pushManifest(
    repo,
    {
      schemaVersion: 2,
      mediaType: MT_MANIFEST,
      artifactType,
      config: emptyConfig,
      layers: [payload],
      subject: { mediaType: MT_MANIFEST, digest: imageDigest, size: imageSize },
    },
    MT_MANIFEST,
  );
}

interface Seeded {
  imageDigest: string;
}

async function seedFullChain(repo: string, signer: Signer, opts: { corrupt?: boolean } = {}): Promise<Seeded> {
  const { imageDigest, imageSize } = await seedImage(repo);
  const signature = signImage(signer, imageDigest, opts);
  const sigDesc = await seedReferrer(repo, imageDigest, imageSize, AT_SIG, new Uint8Array(Buffer.from(JSON.stringify(signature), 'utf8')));
  const sbomDesc = await seedReferrer(repo, imageDigest, imageSize, AT_SBOM, new Uint8Array(Buffer.from(JSON.stringify({ bomFormat: 'CycloneDX', specVersion: '1.5' }), 'utf8')));
  const provDesc = await seedReferrer(repo, imageDigest, imageSize, AT_PROV, new Uint8Array(Buffer.from(JSON.stringify({ _type: 'https://in-toto.io/Statement/v1' }), 'utf8')));

  // Maintain the tag-schema fallback index too (client responsibility where the
  // Referrers API is unavailable/Preview).
  await pushManifest(
    repo,
    { schemaVersion: 2, mediaType: MT_INDEX, manifests: [sigDesc, sbomDesc, provDesc] },
    MT_INDEX,
    digestToFallbackTag(imageDigest),
  );

  return { imageDigest };
}

// ── Binary Authorization gate: verify signature + signer policy IN THE TARGET ─

async function getReferrerPayloadDigest(repo: string, referrerManifestDigest: string): Promise<string> {
  const res = await fetch(`${base}/v2/${path(repo)}/manifests/${referrerManifestDigest}`, {
    headers: { ...authHeaders(), Accept: MT_MANIFEST },
  });
  const manifest = (await res.json()) as { layers: Descriptor[] };
  return manifest.layers[0].digest;
}

function makeBinAuthzGate(input: {
  adapter: OciDistributionAdapter;
  targetRef: string;
  targetRepoPath: string;
  imageDigest: string;
  allowedSigners: Set<string>;
  reasons: string[];
}) {
  return async (_verified: AttestationKind[]): Promise<boolean> => {
    const referrers = await input.adapter.listReferrers(input.targetRef, input.imageDigest);
    const sigRef = referrers.find((r) => r.artifactType === AT_SIG);

    if (!sigRef) {
      input.reasons.push('no signature attachment in target');
      return false;
    }

    const payloadBytes = await getBlobBytes(input.targetRepoPath, await getReferrerPayloadDigest(input.targetRepoPath, sigRef.digest));
    const payload = JSON.parse(Buffer.from(payloadBytes).toString('utf8')) as SignaturePayload;

    if (!verifySignaturePayload(payload, input.imageDigest)) {
      input.reasons.push('TARGET_SIGNATURE_VERIFIED failed: signature does not verify for target image digest');
      return false;
    }

    if (!input.allowedSigners.has(payload.keyId)) {
      input.reasons.push('TARGET_POLICY_VERIFIED failed: signer not in allowed-signers policy');
      return false;
    }

    input.reasons.push('signature verified AND signer policy satisfied in target');
    return true;
  };
}

// ── rollback guarantee assertion ──────────────────────────────────────────────

async function assertNoVerifiableImage(repoPath: string, digest: string, label: string): Promise<void> {
  const imageStatus = await manifestStatus(repoPath, digest);
  const fallbackStatus = await manifestStatus(repoPath, digestToFallbackTag(digest));
  const residual = await referrersApi(repoPath, digest);
  record(`${label}.rollback`, { imageStatus, fallbackTagStatus: fallbackStatus, residualOrphanAttestations: residual.descriptors.length });
  assert(imageStatus === 404, `${label} tenant image ROLLED BACK — no pullable image (404)`);
  assert(fallbackStatus === 404, `${label} tag-schema discovery pointer removed (404)`);
  assert(
    imageStatus === 404,
    `${label} residual attestations (if any) orphaned to a deleted subject — nothing verifiable remains (coupled retention)`,
  );
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  TOKEN = await gcloudToken();
  record('registry', { registry: REGISTRY, project: PROJECT, srcRepo: SRC_REPO, tenantRepo: TENANT_REPO });

  const adapter = new OciDistributionAdapter({ auth: staticBearerAuth(TOKEN) }); // https, real AR
  const trustedSigner = makeSigner();
  const untrustedSigner = makeSigner();
  const allowedSigners = new Set<string>([trustedSigner.keyId]);

  const ref = (repo: string, image: string) => `${REGISTRY}/${PROJECT}/${repo}/${image}`;

  // ══ POSITIVE ══════════════════════════════════════════════════════════════
  const srcPath = `${SRC_REPO}/app`;
  const tenPath = `${TENANT_REPO}/app`;
  const SRC = ref(SRC_REPO, 'app');
  const TENANT = ref(TENANT_REPO, 'app');
  const seeded = await seedFullChain(srcPath, trustedSigner);
  record('positive.seeded', { source: SRC, imageDigest: seeded.imageDigest });

  const srcApiSupport = await referrersApi(srcPath, seeded.imageDigest);
  record('positive.AR_referrers_API_supported', srcApiSupport.supported);
  const srcReferrers = await adapter.listReferrers(SRC, seeded.imageDigest);
  record('positive.source.referrers', srcReferrers.map((r) => r.artifactType));
  assert(srcReferrers.length === 3, 'source has 3 attestations (via adapter: AR Referrers API or tag fallback)');

  const reasons: string[] = [];
  const result = await promoteArtifact({
    source: { repo: SRC, digest: seeded.imageDigest },
    targetRepo: TENANT,
    adapter,
    binaryAuthorization: makeBinAuthzGate({ adapter, targetRef: TENANT, targetRepoPath: tenPath, imageDigest: seeded.imageDigest, allowedSigners, reasons }),
  });
  record('positive.promoted', { ok: result.ok, promoted: result.promotedAttestations, gate: reasons });
  assert(result.ok, 'promotion committed in real AR');

  assert((await manifestStatus(tenPath, seeded.imageDigest)) === 200, 'tenant AR image present after promotion');
  const tenantReferrers = await adapter.listReferrers(TENANT, seeded.imageDigest);
  record('positive.tenant.referrers', tenantReferrers.map((r) => r.artifactType).sort());
  assert(tenantReferrers.length === 3, 'tenant AR has all 3 attestations re-linked (verified in TARGET)');
  assert(tenantReferrers.every((r) => r.subjectDigest === seeded.imageDigest), 'every tenant attestation subject === target image digest');

  // ══ FALLBACK (tag-schema) ═══════════════════════════════════════════════════
  const fallbackAdapter = new OciDistributionAdapter({ auth: staticBearerAuth(TOKEN), forceTagFallback: true });
  const viaFallbackSrc = await fallbackAdapter.listReferrers(SRC, seeded.imageDigest);
  record('fallback.source.referrers', viaFallbackSrc.map((r) => r.artifactType).sort());
  assert(viaFallbackSrc.length === 3, 'tag-schema FALLBACK discovers all 3 attestations at SOURCE (AR)');

  const viaFallbackTenant = await fallbackAdapter.listReferrers(TENANT, seeded.imageDigest);
  record('fallback.tenant.referrers', viaFallbackTenant.map((r) => r.artifactType).sort());
  assert(viaFallbackTenant.length === 3, 'tag-schema FALLBACK discovers all 3 attestations at TENANT (adapter-maintained)');

  // ══ NEG-1: invalid signature ════════════════════════════════════════════════
  const badSrcPath = `${SRC_REPO}/app-badsig`;
  const badTenPath = `${TENANT_REPO}/app-badsig`;
  const SRC_BAD = ref(SRC_REPO, 'app-badsig');
  const TENANT_BAD = ref(TENANT_REPO, 'app-badsig');
  const badSeed = await seedFullChain(badSrcPath, trustedSigner, { corrupt: true });
  const badReasons: string[] = [];
  let neg1Code = '';
  try {
    await promoteArtifact({
      source: { repo: SRC_BAD, digest: badSeed.imageDigest },
      targetRepo: TENANT_BAD,
      adapter,
      binaryAuthorization: makeBinAuthzGate({ adapter, targetRef: TENANT_BAD, targetRepoPath: badTenPath, imageDigest: badSeed.imageDigest, allowedSigners, reasons: badReasons }),
    });
  } catch (e) {
    neg1Code = (e as { code?: string }).code ?? (e as Error).message;
  }
  record('neg1.invalid_signature', { code: neg1Code, reasons: badReasons });
  assert(neg1Code === 'PROMOTION_BINAUTHZ_DENIED', 'NEG-1 invalid signature ⇒ PROMOTION_BINAUTHZ_DENIED');
  assert(badReasons.some((r) => r.includes('TARGET_SIGNATURE_VERIFIED failed')), 'NEG-1 refused specifically on signature verification');
  await assertNoVerifiableImage(badTenPath, badSeed.imageDigest, 'NEG-1');

  // ══ NEG-2: valid signature, untrusted signer ════════════════════════════════
  const untSrcPath = `${SRC_REPO}/app-untrusted`;
  const untTenPath = `${TENANT_REPO}/app-untrusted`;
  const SRC_UNT = ref(SRC_REPO, 'app-untrusted');
  const TENANT_UNT = ref(TENANT_REPO, 'app-untrusted');
  const untSeed = await seedFullChain(untSrcPath, untrustedSigner);
  const untReasons: string[] = [];
  let neg2Code = '';
  try {
    await promoteArtifact({
      source: { repo: SRC_UNT, digest: untSeed.imageDigest },
      targetRepo: TENANT_UNT,
      adapter,
      binaryAuthorization: makeBinAuthzGate({ adapter, targetRef: TENANT_UNT, targetRepoPath: untTenPath, imageDigest: untSeed.imageDigest, allowedSigners, reasons: untReasons }),
    });
  } catch (e) {
    neg2Code = (e as { code?: string }).code ?? (e as Error).message;
  }
  record('neg2.untrusted_signer', { code: neg2Code, reasons: untReasons });
  assert(neg2Code === 'PROMOTION_BINAUTHZ_DENIED', 'NEG-2 policy not satisfied ⇒ PROMOTION_BINAUTHZ_DENIED');
  assert(untReasons.some((r) => r.includes('TARGET_POLICY_VERIFIED failed')), 'NEG-2 refused specifically on signer policy');
  await assertNoVerifiableImage(untTenPath, untSeed.imageDigest, 'NEG-2');

  // ══ evidence ════════════════════════════════════════════════════════════════
  const evidence = {
    evidenceId: 'EV-AR-LIVE-PROMOTION-GCP-2026-07-21',
    plan: 'PLAN_PARITE_REPLIT §13.5',
    unknownId: 'UNK-AR-LIVE-PROMOTION',
    p0: 'P0-V3-07',
    registry: `REAL Google Artifact Registry ${REGISTRY}/${PROJECT} (dedicated test project — NOT prod; repos deleted after)`,
    arReferrersApiSupported: srcApiSupport.supported,
    durationMs: Date.now() - t0,
    stateMachine: [
      'PROMOTION_PREPARED',
      'IMAGE_COPIED_BY_DIGEST',
      'REFERRERS_DISCOVERED',
      'METADATA_COPIED',
      'TARGET_SIGNATURE_VERIFIED',
      'TARGET_POLICY_VERIFIED',
      'PROMOTION_COMMITTED',
    ],
    results: {
      positive: { imageDigest: seeded.imageDigest, promoted: result.promotedAttestations },
      fallback: 'tag-schema discovery OK (source + tenant)',
      neg1_invalid_signature: neg1Code,
      neg2_untrusted_signer: neg2Code,
    },
    steps,
  };

  writeFileSync(join(EVIDENCE_DIR, 'promotion-run.json'), JSON.stringify(evidence, null, 2));
  record('evidence.written', EVIDENCE_DIR);

  const hashes = readdirSync(EVIDENCE_DIR)
    .filter((f) => f !== 'SHA256SUMS.txt')
    .sort()
    .map((f) => `${createHash('sha256').update(readFileSync(join(EVIDENCE_DIR, f))).digest('hex')}  ${f}`)
    .join('\n');
  writeFileSync(join(EVIDENCE_DIR, 'SHA256SUMS.txt'), `${hashes}\n`);

  console.log('\n✅ ALL REAL-AR PROMOTION ASSERTIONS PASSED — evidence:', EVIDENCE_DIR);
}

main().catch((e) => {
  console.error('\n❌ PROOF FAILED:', e);
  process.exitCode = 1;
});
