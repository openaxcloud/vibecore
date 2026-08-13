# Exact-SHA release gate — evidence

One page mapping each requirement to the thing that proves it. Every claim here is
either a link to a run, a command you can re-run, or a test that fails if the claim
stops being true.

Branch `feat/deploy-exact-sha-gate` · PR #132 · cutover procedure in
[`RELEASE_GATE_CUTOVER.md`](RELEASE_GATE_CUTOVER.md).

## The defect, reproduced

Queried from the GitHub API on 2026-08-12, not read off the code:

| commit | Production CI | Code Quality | Production E2E | reached production |
|---|---|---|---|---|
| `113c17e8` | **failure** | success | **never ran** | yes |
| `9fc8a243` | **failure** | success | **never ran** | yes |
| `3a53b439` | **cancelled** | **cancelled** | **never ran** | yes |

```bash
for sha in 113c17e8 9fc8a243 3a53b439; do
  gh api "repos/openaxcloud/vibecore/actions/runs?head_sha=$(git rev-parse $sha)" \
    --jq '.workflow_runs[] | "\(.name)\t\(.conclusion)"'
done
```

A fourth hole, not in the original report: `e2e.yml` had no `push: [main]` trigger, so
`Production E2E` had never run on **any** main commit. "E2E is green" was true only
because nothing ever asked. Requiring E2E was therefore unsatisfiable until this lot
added the trigger.

## Requirements → proof

| # | Requirement | Where it lives | Proof |
|---|---|---|---|
| 1 | Target is the full `GITHUB_SHA`; no free dispatch input | `resolve-target` job. `short_sha` deleted; `target_sha` must be 40-hex **and** an ancestor of `origin/main`; the image tag is *derived* (`sha[0:10]`) | `validate-deploy-gate-wired` fails if `short_sha` returns; spec `catches a reintroduced free-form short_sha input` |
| 2 | `checkout HEAD == TARGET_SHA` before build/deploy | asserted in `resolve-target`, `release-gate`, `preflight-gates`, `build-and-deploy` | wiring validator asserts the assertion exists in each job |
| 3 | Official checks green, by workflow **ID** | `required-checks.json` pins **id + file path + job names** | 79 vitest cases; pinning by name alone cannot pass |
| 4 | missing/pending/skipped/cancelled/failure/wrong-sha/usurped ⇒ refuse **before WIF** | `release-gate` job has `contents: read, actions: read` and **no `id-token`**; `id-token: write` is granted to `build-and-deploy` alone | run [31597733139](https://github.com/openaxcloud/vibecore/actions/runs/31597733139), **7/7 green**: the 3 red SHAs refused, 2 of them still refused under an E2E waiver, and the all-green SHA authorised — all in jobs that cannot exchange a WIF token. Wiring validator fails if `id-token` moves to workflow level |
| 5 | Manifest: service → source SHA → build id → digest → signature/SBOM | `release-manifest.mjs build` — refuses to emit an unverifiable manifest | 22 spec cases — no digest, malformed digest, rebuilt without a build id, built from another commit, unverified signature, **null `sourceSha`, missing SBOM, duplicate or missing service, empty gate verdict** all throw. Build ids are captured from each `gcloud builds submit` directly, not matched afterwards by SHA prefix. A digest-pinned service has no tag left to infer a commit from, so provenance is stamped as a pod-template annotation and read back from the live Deployment |
| 6 | Deploy **by digest**, verify `imageID` after rollout | chart renders `@sha256:` and **fails the render** on a malformed or absent pin; what each non-rebuilt service currently runs is read from the **live Deployment** (authoritative, and unlike `helm get values` always valid JSON); post-rollout check compares kubelet `imageID` for the Deployment's **current revision** ReplicaSet. `screenshotter` is pinned but deliberately not imageID-checked — this path has never waited on its rollout and it is not enabled everywhere | `proof-digest-rollout.sh` on a real cluster, **9/9**: 7 distinct digests, 17 containers, 7/7 imageIDs match, a wrong digest is rejected, a partial `--reuse-values` upgrade leaves every other service pinned, a last-known-good manifest restores them, and **a post-check failure is rolled back to the last verified revision** |
| 7 | Manual path bound to the same SHA/image | same jobs, same gate, same digests; dispatch names a commit already on `main` | wiring validator + spec |
| 8 | Break-glass only to a signed last-known-good, double approval | `deploy-break-glass.yml`: no build step, restores a previous **successful gated** run's manifest, cosign-verifies every digest, and passes through TWO sequential environments (`production-break-glass-1` then `-2`) whose real approvals must come from two DISTINCT people | wiring validator fails if break-glass gains a build step, loses its signature check, or loses either approval environment. **The restore mechanism is executed** in `proof-digest-rollout.sh` step 8 — same `jq` filter, same `--set-string services.<key>.imageDigest`, same `--reuse-values --atomic` — and the cluster returns to every digest the manifest names. Only the cosign step needs the production KMS key and cannot run outside prod |

## Re-runnable proofs

```bash
# 1. Would this commit deploy? (no deploy, no credentials)
GITHUB_TOKEN="$(gh auth token)" \
  node scripts/release-gate/verify-required-checks.mjs --no-wait --sha <40-hex>
#    exit 0 = authorised · exit 2 = refused, with the reason per workflow

# 2. Deploy-by-digest end to end on a real cluster (~12 min): distinct digests,
#    imageID concordance, a negative control, the --reuse-values round trip, a
#    break-glass restore, and an EXERCISED rollback after a post-check failure
bash scripts/release-gate/proof-digest-rollout.sh

# 3. The gate's own wiring — proves it can FAIL before trusting its all-clear
node scripts/release-gate/validate-deploy-gate-wired.mjs --self-test
node scripts/release-gate/validate-deploy-gate-wired.mjs

# 4. The decision engine, dependency-free (works with no node_modules)
node scripts/release-gate/verify-required-checks.mjs --self-test

# 5. Full suite
pnpm vitest --run scripts/release-gate      # 79 tests
```

## Expert review round 1 (CHANGES_REQUESTED on 3320cde9) — what changed

The engine was accepted as proven; the deploy PATH and its activation were not. Eight
P0s, all fixed here:

| # | Finding | Fix |
|---|---|---|
| 1 | `deploy-prod.yml` was a **second, ungated** production path — free `image_tag`, `--install` without `--reuse-values`, `--set global.imageTag`, different concurrency group. Running it would have unpinned every digest. | **Deleted.** `validate-ci-cd-assets.mjs` required it to exist; it now forbids it from returning. |
| 2 | A dispatch from a side branch runs THAT branch's workflow graph — every assertion checked the code at `target_sha`, none could see which YAML was executing. | `GITHUB_WORKFLOW_REF` must equal `<repo>/.github/workflows/deploy-main.yml@refs/heads/main`. Durable controls (env branch policy, WIF subject) are admin actions — the `production` environment currently has **no protection at all**. |
| 3 | Workflows verified against `keyRings/vibecore-supply-chain`, which **does not exist** (`gcloud kms keyrings list` → only `ecode-supply-chain`). | Corrected, and the validator now compares the verification keyring against the one that **signs** in `infra/cloudbuild`. |
| 4 | A GitHub environment with N reviewers requires **one**. "Two reviewers" bought a second name, not a second approval. | Two sequential environments, plus a runtime check of the run's real approvals requiring **two distinct people**. |
| 5 | Four races: ordering by run id elected a stale attempt; no coherent re-read after fetching jobs; an in-flight run did not block a verdict; ancestry checked only on explicit dispatch. | All four fixed; a verdict is re-taken immediately before `helm upgrade`. |
| 6 | `validateWaiver` accepted `2099-12-31` (26,804 days) and silently rolled `2026-02-31` over. | Real calendar dates only (component round-trip) and a ceiling measured against the clock. |
| 7 | `workspace-agent` stayed on a mutable tag when not rebuilt — the one image running inside customer workspaces was the one nobody pinned. Manifest accepted null `sourceSha`, missing SBOM, missing/duplicate services, empty verdict. Build id matched by SHA prefix. Cosign/Trivy downloaded unverified. | All strict. Provenance is stamped as a pod annotation so a digest-pinned service can still name its commit. Build ids captured at submission. Binary checksums pinned from the projects' published checksum files. |
| 8 | The **committed** policy had no waiver, so the "green" commit was refused — the PASS used a policy edited at runtime. | A real, bounded, **committed** waiver (2026-08-27, BUG-E2E-001). The committed policy now authorises the green commit and still refuses all three red ones. |
| 1b | *Found while closing #1:* `deploy-staging.yml` is a **latent third production path** — it runs `helm upgrade --install vibecore --namespace vibecore` (the production release name AND namespace) inside the production GCP project, separated from production only by `vars.STAGING_APP_CLUSTER`, which is defined **nowhere**. It fails today by accident, not by design. | A guard that fails closed on both an unset variable and on the production cluster name, asserted by the wiring validator. |
| 1c | *Found while closing #1:* Artifact Registry retention DELETES images older than 7 days unless tagged `running-*`/`helm-active-*`, and `ar-protect-images.yml` applies those tags. Its parsing used `${pkg%%:*}` — which turns `api@sha256:…` into `api@sha256`, so **no tag is applied**. Pinning production by digest makes that EVERY running image: retention would have collected images production is actively running. Its `helm-active-*` step also derived the protected set from `helm get values -o json` (invalid JSON on the real release — broken today, silently) and selected on `imageTag` rather than the deployed digest. | Digest-safe parsing, protected set read from the live Deployments, all three asserted by the wiring validator. |
| 9 | Rollback was printed, never captured or exercised. | Previous revision captured; rollback runs when a **post-Helm** check fails, and is exercised end-to-end in the harness. |

## What is NOT proven

**A real production rollout.** Everything above runs against the real GitHub API or a
real Kubernetes cluster, but the production `helm upgrade` by digest has not been
executed — it cannot be, without deploying to production. That is the one item
awaiting a go-ahead.

Four prerequisites need repo/GCP admin. All fail **closed** — getting one wrong blocks
deploys rather than weakening the gate — except (3) and (4), whose absence is what the
in-workflow `GITHUB_WORKFLOW_REF` guard currently substitutes for:

1. `roles/cloudkms.publicKeyViewer` on
   `keyRings/`**`ecode-supply-chain`**`/cryptoKeys/cosign-images` for the deploy service
   account. No signing role.
2. GitHub environments `production-break-glass-1` **and** `-2`, reviewers required,
   branches limited to `main`. Two environments, because one with N reviewers requires
   one approval.
3. Protection on the `production` environment — as of 2026-08-13 it has
   `protection_rules: []` and `deployment_branch_policy: null`, i.e. none.
4. A WIF subject condition pinning
   `assertion.workflow_ref == "openaxcloud/vibecore/.github/workflows/deploy-main.yml@refs/heads/main"`.

## Defects found by these proofs

Listed because they are the argument for having run the proofs at all — none of them
was visible by reading the code:

1. `kubectl get -o name` prints `deployment.apps/<name>`, not `deploy/<name>`. Stripping
   `deploy/` left the group prefix, the ownerReferences match never fired, and the
   ReplicaSet lookup came back empty — **every deploy would have failed** at the
   imageID check, for a reason unrelated to images.
2. GitHub runs each `run:` block as `bash -e`, which `set -uo pipefail` does not clear —
   assertions died before they could assert.
3. Restricting the manifest to chart services silently dropped `screenshotter` and
   `workspace-agent` from vulnerability + signature coverage that the previous gate had.
4. Two `jq` filters used a bare truthiness test where the verifier uses `!== false` —
   a service could be demanded but never collected, failing a deploy spuriously.
5. `gh run download` exits 1 **and does not create the target directory** when nothing
   matches, so the break-glass path died before printing its own actionable error —
   on the one path that only ever runs during an incident.
6. `helm get values -o json` on the REAL production release emits **invalid JSON** —
   one stored value (the Nix registry blob) contains a raw newline inside a string,
   which `jq` rejects. The digest-resolution step parsed that blob, so under `set -e`
   it would have died there and **every deploy would have been blocked**, before ever
   reading a tag. It now reads the live Deployments instead, which are authoritative
   and always valid. Found only by querying the production release read-only.
7. The production release carries `screenshotter.enabled: true` — set once via `--set`
   and frozen by `--reuse-values` — while both `values.yaml` and `values-prod.yaml` say
   false. The matrix, and the drift check that guarded it, were both written against
   chart defaults, so a genuinely running service would have been the only one left on
   a mutable tag while everything else was digest-pinned. Enablement is now discovered
   from the cluster, and the drift check compares against every service the chart
   DEFINES rather than the ones it enables.
8. The active ReplicaSet was picked as "newest by `creationTimestamp`". Kubernetes
   **reuses** an existing ReplicaSet when a rollout returns to a pod template it has
   seen before, so after a break-glass restore — or any return to an earlier digest —
   the newest ReplicaSet is the one just scaled to ZERO. Every restore would have
   failed with "no running pod" for services that were running perfectly, in exactly
   the incident where a false failure is most costly. Now selected by the Deployment's
   `deployment.kubernetes.io/revision`. Found by step 8 the first time it ran.
9. The dry-run job reported **green when the gate had errored**. The gate has exactly
   two verdicts (0 = PASS, 2 = REFUSE); `report` mode swallowed every other code and
   `refuse` mode accepted any non-zero one, so a transport error read as "correctly
   refused". Found by watching a real run, in the tool whose entire job is to give a
   trustworthy verdict.
