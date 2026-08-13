# Cutover — enabling the exact-SHA release gate

One-time procedure. Everything here is reversible except step 6, and step 6 is
reversible by `git revert` + one `helm upgrade`.

Background and day-to-day usage live in [`DEPLOY_RUNBOOK.md`](DEPLOY_RUNBOOK.md).
This file is only the ordered switch-on.

## What is being changed

`deploy-main.yml` built and rolled out **every** push to `main` with no relationship
to that commit's test results. Verified against the GitHub API on 2026-08-12:

| commit | Production CI | Code Quality | Production E2E | reached prod |
|---|---|---|---|---|
| `113c17e8` | **failure** | success | never ran | yes |
| `9fc8a243` | **failure** | success | never ran | yes |
| `3a53b439` | **cancelled** | **cancelled** | never ran | yes |

`Production E2E` had never run on any of them because `e2e.yml` did not trigger on
push to `main` at all — "E2E is green" was true only because nothing ever asked.

After cutover: a commit deploys only if **its own** CI / E2E / Security / Quality runs
are green, and it deploys **by image digest**, verified against what the pods report.

## Prerequisites (cannot be done from CI — they need repo/GCP admin)

Verified against the live project and repo on 2026-08-13. Each is fail-closed: getting
one wrong blocks deploys rather than weakening the gate.

1. **`roles/cloudkms.publicKeyViewer`** on
   `projects/vibecore-495216/locations/europe-west9/keyRings/**ecode-supply-chain**/cryptoKeys/cosign-images`,
   granted to the deploy service account (`GCP_ARTIFACT_WRITER_SERVICE_ACCOUNT`).
   Verification needs only the public key — grant **no** signing role.
   *(The workflows previously named `vibecore-supply-chain`, a keyring that does not
   exist: `gcloud kms keyrings list` returns only `ecode-supply-chain`. Fixed here.)*
2. **Two GitHub environments**, `production-break-glass-1` and
   `production-break-glass-2`, each with required reviewers, deployment branches
   limited to `main`. Two environments — not one with two reviewers — because GitHub
   requires **one** of N reviewers to approve. The restore job additionally reads the
   run's real approvals and refuses unless **two different people** approved.
3. **`production` environment protection.** As of 2026-08-13 it has
   `protection_rules: []` and `deployment_branch_policy: null` — i.e. **no protection
   at all**. Set required reviewers and restrict deployment branches to `main`. Until
   this is done, the only thing preventing a production deploy from a side branch is
   the in-workflow `GITHUB_WORKFLOW_REF` assertion added by this lot.
4. **WIF subject condition.** Restrict the Workload Identity provider to
   `assertion.workflow_ref == "openaxcloud/vibecore/.github/workflows/deploy-main.yml@refs/heads/main"`
   (plus the break-glass workflow), so a side-branch workflow cannot mint a prod token
   even if the in-workflow guard is edited away.

## Decision to make before merging: `Production E2E`

As of 2026-08-12 the E2E suite is red on **every** branch — 0 successes in the last 25
runs, **265 failing tests across 19 spec files**, with heterogeneous causes (absent UI,
count mismatches, design-token assertions, the responsive/mobile matrix). Requiring it
as-is means refusing every deploy, permanently. Pick one:

- **A — fix E2E first.** Full gate, matches the requirement exactly. The numbers above
  make this a multi-area effort, not a single fixture or missing secret; the
  release-integrity defect stays open for its whole duration.
- **B — waive E2E, with a date and a ticket** *(recommended)*. The gate enforces
  CI + Security + Quality immediately. Proven against the real API: all three commits
  above are **still refused** under the waiver, and an all-green commit passes with
  `⚠️ WAIVERS IN EFFECT` printed on the run and in the verdict artifact. The waiver
  expires and fails closed — it cannot become permanent by being forgotten.
- **C — do not merge.** Status quo: `main` stays ungated.

For B, edit the `Production E2E` entry in
`scripts/release-gate/required-checks.json`:

```jsonc
"waivedUntil": "YYYY-MM-DD",     // ≤ 30 days
"waiverReason": "…at least 20 characters saying WHY…",
"waiverTicket": "<ticket that removes the waiver>"
```

A waiver with no reason, no ticket, or a malformed date is a **refusal**, not an
ignored field.

**Under B, E2E still runs on every push to `main`, and still goes red.** That is
intended — do not "fix" it by removing the `push: [main]` trigger this lot added to
`e2e.yml`. Removing it is what created the original hole: a required check that never
runs is a check that is vacuously satisfied. The waiver ignores E2E's *result*; the
run itself is how you see it go green and can then delete the waiver with evidence.

## Steps

0. **Note:** `deploy-prod.yml` has been **deleted** by this lot. It was a second,
   ungated production path: a free-form `image_tag`, `helm upgrade --install` without
   `--reuse-values`, and `--set global.imageTag` — running it would have dropped every
   per-service digest and put the platform back on one mutable tag, from a different
   concurrency group. The sanctioned manual path is `deploy-main.yml`'s `target_sha`
   dispatch, which is gated exactly like a push.

1. ~~Merge the lint fix first (PR #133).~~ **Done by another route.** The two
   `@blitz/lines-around-comment` errors that kept `main` red are fixed on `main`
   (`eslint app` → 0 errors); PR #133 was closed as superseded rather than merged,
   since it applied a different fix to the same lines.

2. **Confirm `main` is green** after that merge — `Production CI`, `Security Analysis`
   and `Code Quality` on the merge commit. This is the state the gate needs.

3. **Grant the two prerequisites above.**

4. **Decide A / B / C** and, for B, commit the waiver.

5. **Dry-run the gate against the current head of `main`, deploying nothing:**

   ```bash
   GITHUB_TOKEN="$(gh auth token)" \
     node scripts/release-gate/verify-required-checks.mjs --no-wait \
       --sha "$(git rev-parse origin/main)"
   # exit 0 = would deploy · exit 2 = would be refused (prints why, per workflow)
   ```

   Do not merge the gate until this exits 0. If it exits 2, the gate is telling you
   the truth about `main` — fix that first.

6. **Merge the gate** (PR #132). The next push to `main` goes through it.

7. **Watch the first gated deploy.** In order, the run should show:
   `Resolve target commit` → `Release gate` (all required checks green for that exact
   sha) → `Preflight gates` → build → `Resolve immutable image digests` → scan + SBOM +
   `cosign verify` on those digests → `Build release manifest` → `helm upgrade` with
   `services.<svc>.imageDigest=…` → `Verify rollout` → `Verify running imageIDs match
   the release manifest`.

   **What to watch on the first run** is step `Resolve immutable image digests` for the
   tiers this run did *not* rebuild. It reads what each service is **currently running**
   from its live Deployment and carries that forward — a digest as-is, a tag resolved
   against the registry. If a service has no Deployment it is treated as disabled and
   skipped; if its reference cannot be resolved it fails closed and prints what it found
   plus the command to pin it explicitly. Nothing has been rolled out at that point.

   *(An earlier draft of this document warned instead about the `REQUIRED_OVERRIDE_AT_DEPLOY`
   placeholder in the stored Helm values. Reading the real release showed that is not the
   risk: every service carries a real tag, but `helm get values -o json` on it emits
   invalid JSON — one value holds a raw newline — so parsing it would have blocked every
   deploy. The step no longer reads the stored values at all.)*

8. **Download the run's `release-manifest-<shortsha>` artifact** and keep it. It is the
   input the break-glass path restores from.

## Rollback

- **The gate refuses a commit you believe is fine** → run the dry-run in step 5 against
  that sha; it names the workflow and the reason. Do not widen the policy to make a
  single commit pass.
- **The deploy fails mid-rollout** → `helm upgrade` is `--atomic`, so it has already
  rolled back. `helm -n vibecore history vibecore` to confirm.
- **You need to ship while the gate cannot pass** → `deploy-break-glass.yml`. It cannot
  build or ship new code: it restores the digests of a previous successful gated
  deploy, re-verifies each signature, and needs two approvals.
- **Undo the cutover entirely** → revert PR #132. The chart still accepts tags, so the
  previous tag-based path works unchanged.

## Evidence

Consolidated, requirement-by-requirement: [`RELEASE_GATE_EVIDENCE.md`](RELEASE_GATE_EVIDENCE.md).

- Gate refuses red commits / authorises green ones — GitHub Actions run
  [31593821375](https://github.com/openaxcloud/vibecore/actions/runs/31593821375),
  in a job holding **no `id-token` permission**, i.e. before any Google credential exists.
- Deploy-by-digest and imageID concordance, plus a negative control that a wrong digest
  is detected — `bash scripts/release-gate/proof-digest-rollout.sh` (~6 min, needs
  docker + kind; builds seven distinct images so a cross-service digest mix-up would
  show).
- The wiring itself cannot be quietly removed —
  `node scripts/release-gate/validate-deploy-gate-wired.mjs --self-test` proves it
  detects each way the gate could be unwired before trusting its "all clear".
