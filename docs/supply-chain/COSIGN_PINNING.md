# Cosign toolchain pinning, KMS rights, and break-glass (B7)

This document backs the two hardening fixes the expert counter-audit required
before the Cosign/Kyverno chain (PR #81) can be considered reproducible and
pinned. **The policy stays in AUDIT / `failurePolicy: Ignore`** — Enforce is a
separate, later step gated on expert re-signing.

---

## 1. Cosign is pinned by immutable OCI digest, not a mutable tag

The three build configs (`infra/cloudbuild/runtime-tier.yaml`,
`single-web.yaml`, `workspace-agent.yaml`) previously fetched the Cosign binary
with `docker pull ghcr.io/sigstore/cosign/cosign:v2.4.3`. A tag is mutable: a
compromised or re-pushed `v2.4.3` would silently change the tool that signs
every platform image. Now each config pins:

```
cosign_image="ghcr.io/sigstore/cosign/cosign:v2.4.3@sha256:c77247c92f4dfea851c70555738226498393e34e2f9ca83cb959e51c230e4ad7"
cosign_bin_sha256="37db5533587f87c2f9225c5896b39e1ee238205e3a71ba9ff9f0c84a2fd14474"
```

**Two independent provenance bindings, both verified before the binary runs:**

1. **OCI digest.** `docker pull` refuses any content whose sha256 ≠ the pinned
   digest. The digest is the sha256 of the `v2.4.3` **multi-arch index**; Docker
   resolves it to `linux/amd64` and content-verifies on pull.
2. **Binary checksum (offline, hermetic).** The `/ko-app/cosign` binary lifted
   out of the image is checked with `sha256sum -c -` against the pinned value.
   This does not trust the registry: even a mis-copied digest, or a registry
   that served different bytes, cannot hand the pipeline an executable other
   than the one we vetted.

### How the pinned values were derived and verified (reproducible)

```bash
# (a) Resolve + cryptographically verify the v2.4.3 index digest.
TOKEN=$(curl -s "https://ghcr.io/token?scope=repository:sigstore/cosign/cosign:pull" \
        | jq -r .token)
curl -s -H "Authorization: Bearer $TOKEN" \
     -H "Accept: application/vnd.oci.image.index.v1+json" \
     https://ghcr.io/v2/sigstore/cosign/cosign/manifests/v2.4.3 -o idx.json
shasum -a 256 idx.json
# => c77247c92f4dfea851c70555738226498393e34e2f9ca83cb959e51c230e4ad7
#    (equal to the registry's Docker-Content-Digest header for v2.4.3)

# (b) Pick the linux/amd64 manifest, pull its final (binary) layer, verify the
#     layer digest, extract /ko-app/cosign and hash it.
#     amd64 manifest: sha256:203f193bc86591bbc1a3a39ad3532590652477d1775ccb91221e8d14cfe5c000
#     binary layer:   sha256:5d4c1e8070d661a624549558ef126914f373e5765c713360fd9dd43d20a32f32
curl -sL -H "Authorization: Bearer $TOKEN" \
  https://ghcr.io/v2/sigstore/cosign/cosign/blobs/sha256:5d4c1e8070d661a624549558ef126914f373e5765c713360fd9dd43d20a32f32 \
  -o layer.tgz
shasum -a 256 layer.tgz   # must equal 5d4c1e80...
tar -xzf layer.tgz ko-app/cosign
shasum -a 256 ko-app/cosign
# => 37db5533587f87c2f9225c5896b39e1ee238205e3a71ba9ff9f0c84a2fd14474
```

Chain of custody: index digest → amd64 manifest digest → layer digest → binary
sha256, each link content-addressed. To bump the Cosign version, repeat (a)+(b)
for the new tag and replace both pinned values in all three configs.

---

## 2. The signing-policy gate is hermetic (no PyYAML)

`scripts/validate-image-signing-wired.py` used to `import yaml`. PyYAML happened
to be preinstalled on the GitHub runner, but the workflow never guaranteed or
pinned it — a reproducibility hole in a supply-chain control. The validator was
rewritten to use **only the Python 3 standard library**: it splits the Cloud
Build `steps:` sequence structurally (2-space step boundaries) and checks that
each signing step exists, is not `allowFailure: true`, and does not `waitFor
['-']`. `deploy-main.yml` runs `--self-test` (4 synthetic pass/fail fixtures)
before trusting the parser. No external dependency remains, so the gate is
identical on any machine.

---

## 3. Verification is against the deployed DIGEST, never a tag

`scripts/cosign-sign-images.sh` resolves every reference to `repo@sha256:...`
before signing, so signatures are bound to immutable content. Admission
verification matches: the signature object Kyverno pulls is keyed by the image
digest. `docs/deploy-evidence/2026-08-04-b6-b7-hardening/` includes a
`cosign verify --key cosign-images.pub <repo>@sha256:<digest>` run proving a
by-digest verification passes for a genuinely-signed digest and that a tampered
digest fails.

---

## 4. Minimal KMS rights (least privilege)

**Signing side (Cloud Build).** The Cloud Build service account
`267592214411-compute@developer.gserviceaccount.com` holds exactly two roles,
**scoped to the single key** `ecode-supply-chain/cosign-images` — not the
keyring, not the project:

| Role | Why it is required | Why nothing more |
| --- | --- | --- |
| `roles/cloudkms.signerVerifier` | use a key **version** to produce the signature | no create/destroy/encrypt |
| `roles/cloudkms.viewer` | cosign reads the key's default hash (`cloudkms.cryptoKeys.get` on the key) before signing | read-only metadata; no admin |

`signerVerifier` alone fails with `Permission 'cloudkms.cryptoKeys.get' denied`.
The private key material never leaves KMS.

**Verification side (Kyverno).** Admission verification is **fully offline**
against the static public key embedded in the policy (`ignoreTlog: true`), so
Kyverno needs **zero KMS permissions**. Its only cloud grant is
`roles/artifactregistry.reader` on the single `vibecore-prod-containers`
repository (to pull the signature objects), via Workload Identity:

```
GSA  vibecore-kyverno-ar@vibecore-495216.iam.gserviceaccount.com
KSA  vibecore-495216.svc.id.goog[kyverno/kyverno-admission-controller]
```

Grant commands (idempotent):

```bash
gcloud kms keys add-iam-policy-binding cosign-images \
  --location europe-west9 --keyring ecode-supply-chain \
  --member "serviceAccount:267592214411-compute@developer.gserviceaccount.com" \
  --role roles/cloudkms.signerVerifier
gcloud kms keys add-iam-policy-binding cosign-images \
  --location europe-west9 --keyring ecode-supply-chain \
  --member "serviceAccount:267592214411-compute@developer.gserviceaccount.com" \
  --role roles/cloudkms.viewer
gcloud artifacts repositories add-iam-policy-binding vibecore-prod-containers \
  --location europe-west9 \
  --member "serviceAccount:vibecore-kyverno-ar@vibecore-495216.iam.gserviceaccount.com" \
  --role roles/artifactregistry.reader
```

---

## 5. failurePolicy is explicit

`kyverno-policy-verify-images.yaml` sets `webhookConfiguration.failurePolicy:
Ignore` explicitly (Phase 1). Combined with `config.webhooks.namespaceSelector:
{vibecore}` in `kyverno-values.yaml`, the API server only ever sends `ns/vibecore`
pods to the webhook, and a Kyverno outage cannot block pod creation. `Ignore →
Fail` flips only **after** Enforce, once Audit PolicyReports prove the webhook
is genuinely reached.

---

## 6. Break-glass (audited)

If a legitimate, unsigned image **must** be admitted to `ns/vibecore` during an
incident (e.g. an emergency third-party sidecar, or the signing path is broken
and a rollback image predates signing), use the smallest, most reversible,
fully-audited escape hatch that fits — in order of preference:

1. **Stay in Audit (default today).** Nothing is blocked; the image is admitted
   and merely reported. No action needed. This is why Phase 1 is safe.

2. **Retro-sign the image (preferred once enforcing).** Do not weaken the
   policy — make the image compliant:
   ```bash
   COSIGN_KMS_KEY=gcpkms://projects/vibecore-495216/locations/europe-west9/keyRings/ecode-supply-chain/cryptoKeys/cosign-images \
     scripts/cosign-sign-images.sh europe-west9-docker.pkg.dev/vibecore-495216/vibecore-prod-containers/<img>:<tag>
   ```
   Signing is by digest and idempotent. The KMS operation is logged in Cloud
   Audit Logs (`cloudkms.googleapis.com`, `AsymmetricSign`), giving a durable
   record of who signed what and when.

3. **Time-boxed policy exception (last resort, once enforcing).** Flip
   `failureAction: Audit` (or add a narrow `imageReferences` exclusion) via a
   normal PR + `helm upgrade`, **never** by `kubectl edit`. Requirements:
   - Opened as a PR so the change is reviewed and in git history.
   - Includes an expiry (target: ≤ 24 h) and a follow-up issue to re-enforce.
   - The `helm upgrade` and the operator identity are captured; GKE admin
     activity is in Cloud Audit Logs, and the Helm release history
     (`helm -n vibecore history vibecore`) records the revision + who ran it.
   - Revert with `helm -n vibecore rollback vibecore <REV>` the moment the
     incident closes.

**Never** delete the ClusterPolicy or set `failurePolicy: Ignore`
cluster-wide as a break-glass — that silently disables verification for every
future pod with no expiry. Prefer per-image retro-signing (option 2), which
leaves the guarantee intact.

Every break-glass action is auditable after the fact via: Cloud KMS audit logs
(signing), GKE/Kubernetes audit logs (admission decisions + `kubectl` identity),
and `helm history` (any policy change). Kyverno PolicyReports
(`kubectl get polr -n vibecore`) show exactly which images passed/failed at
admission during the window.
