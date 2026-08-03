# B6 / B7 — supply-chain hardening (2026-08-03)

**B7** — sign container images with cosign in the build pipeline, and verify
signatures at admission so only signed images run.
**B6** — blocking policy / secret / vulnerability gates before a deploy.

Status is deliberately split into *done and proven* vs *done but not yet
proven*. Nothing below is claimed as live-verified unless there is a raw log in
this directory backing it.

---

## What is actually in place

| Piece | State |
|---|---|
| Cloud KMS signing key + IAM (least privilege) | **live** |
| 40 in-flight prod image digests signed + verified offline | **live, proven** |
| Kyverno 1.18.2 installed, scoped to ns `vibecore` | **live** |
| Signature policy on ns `vibecore` | **live in AUDIT** (not Enforce — see below) |
| Enforcement behaviour (signed passes / unsigned refused) | **proven in a canary namespace** |
| AR cleanup policy protecting signatures | **live** |
| cosign signing steps in the 3 Cloud Build configs | **committed, NOT yet proven by a green build** |
| B6 gates in `deploy-main.yml` | **committed, proven locally, NOT yet run in CI** |

### Why the policy is still on Audit

Enforce is *not* enabled on ns `vibecore`, on purpose. The build pipeline does
not yet produce signed images in a run that has actually gone green. Turning on
Enforce first would mean the next push to `main` builds an unsigned image and
then has every pod refused at admission — a self-inflicted outage.

Order that must be respected:

1. pipeline signing proven by a real build (**pending**)
2. → flip `failureAction: Audit` → `Enforce` and `mutateDigest: false` → `true`
3. → flip `webhookConfiguration.failurePolicy: Ignore` → `Fail`

---

## Proofs in this directory

| File | What it shows |
|---|---|
| `01-canary-enforce-proof.txt` | Under a real `Enforce` policy: signed image **admitted**, unsigned image **refused** (`no signatures found`). Run in throwaway ns `vibecore-sigtest`, never on the platform namespace. |
| `02-policy-gate-proof.txt` | Policy gate passes on a clean tree, **fails** when the signing step is deleted, **fails** when it is softened to `allowFailure: true`, passes again once restored. |
| `03-secret-gate-proof.txt` | Secret gate: clean tree exit 0, injected private key exit 1 (deploy blocked). Run with gitleaks **8.21.2**, the version CI pins. |

---

## Two latent problems found on the way

Both would have caused an outage weeks later rather than at deploy time.

### 1. AR cleanup would have deleted the signatures

`vibecore-prod-containers` carries a `delete-older-than-7d` cleanup policy, with
only `keep-recent-20-per-image` and the `running-`/`helm-active-` tag prefixes
protecting anything. Cosign stores each signature as an *extra version in the
same repo*, tagged `sha256-<digest>.sig`. Those versions would have competed for
the 20 recent slots and then been deleted — silently breaking verification for
older images, so a `helm rollback` would have been refused at admission long
after anyone connected it to this change.

Fixed by adding a `keep-cosign-artifacts` KEEP policy on the `sha256-` tag
prefix (all cosign-generated tags share it). See
`infra/supply-chain/ar-cleanup-policies.json`. The three pre-existing policies
were preserved verbatim.

### 2. Kyverno could not read Artifact Registry — and `failurePolicy: Ignore` does not cover that

Kyverno has to **pull** the signature objects out of AR to check them. With no
GCP identity it got `artifactregistry.repositories.downloadArtifacts denied` and
responded by **denying the pod**. That is a returned deny, not a webhook call
failure, so `failurePolicy: Ignore` does *not* protect against it. The signed
image failed too — enforcing in this state would have denied **every** platform
pod.

This was caught because enforcement was first proven in a throwaway namespace
instead of on ns `vibecore`. Fixed with a least-privilege Workload Identity
binding: GSA `vibecore-kyverno-ar`, `roles/artifactregistry.reader` on that one
repository, bound to the `kyverno-admission-controller` KSA.

---

## Correction to an earlier assumption about scanning

The `scan-images` steps in the Cloud Build configs call
`gcloud artifacts docker images scan`. Artifact Registry scanning is **disabled**
on this project — `containerscanning.googleapis.com` is not enabled, which the
repository reports as `vulnerabilityScanningConfig: SCANNING_DISABLED`. Those
steps have therefore been returning nothing for as long as they have existed,
and `allowFailure: true` hid it. B6's vulnerability gate is Trivy in
`deploy-main.yml`, not those steps; they are left in place as informational only.

---

## Blast-radius containment (why this cannot break user workspaces)

The Kyverno webhook is pinned by `namespaceSelector` to ns `vibecore` alone, so
the **API server itself** never sends it pods from `workspaces` (user app pods,
built per-publish and never signed by this key), `project-databases` (CNPG),
`ingress-nginx`, `cert-manager` or any `gke-managed-*` namespace. That holds even
if every Kyverno pod is down and the policy is set to `Fail`. Verified live:

```
namespaceSelector={"matchExpressions":[
  {"key":"kubernetes.io/metadata.name","operator":"In","values":["vibecore"]},
  {"key":"kubernetes.io/metadata.name","operator":"NotIn","values":["kyverno"]}]}
```

## Rollback

| To undo | Command |
|---|---|
| Stop enforcing (keep reporting) | set `failureAction: Audit` + `mutateDigest: false` in the ClusterPolicy |
| Remove signature checking entirely | `kubectl delete clusterpolicy verify-platform-image-signatures` (drops the generated webhook rules) |
| Remove Kyverno | `helm uninstall kyverno -n kyverno` |
| Stop signing | revert the `fetch-cosign` / `push-*` / `sign-*` steps in `infra/cloudbuild/*.yaml` |

Signatures already pushed to AR are inert once the policy is gone — nothing
reads them.

## Known follow-up

11 old `worker` image tags referenced by stale ReplicaSets could not be signed:
their images were **already deleted** by the 7-day AR cleanup, so a rollback to
those revisions would already fail at image pull. Not caused by, and not made
worse by, this change.

Gitleaks is pinned to 8.21.2. Under 8.30.1 the same tree yields 12 findings, all
false positives in captured third-party DOM snapshots and a vendored xterm
bundle. They must be allowlisted in `.gitleaks.toml` **before** anyone bumps the
pinned version, or the blocking deploy gate will refuse every deploy.
