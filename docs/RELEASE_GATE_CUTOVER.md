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

## `Production E2E` — resolved, and it sets the merge order

This lot originally shipped a **bounded waiver** on `Production E2E`, because the suite
had never passed once: 0 successes in 405 runs since 2026-05-17, 57 failures on `main`
@ `b2ee7c88`.

On 2026-08-13 `fix/e2e-production-green` made it pass — run
[31704457154](https://github.com/openaxcloud/vibecore/actions/runs/31704457154). It does
so with the same shape of control this lot uses: `tests/e2e/e2e-waivers.json`, enforced
by `scripts/e2e-gate.mjs`, 30-day ceiling, hard-coded policy path, and it fails on an
expired waiver, on any failure not on the list, **and** on a waived test that starts
passing. Waived tests still run; nothing is skipped or deleted.

**The gate-level waiver has therefore been removed.** All four pipelines are now
unconditionally required. Keeping it would have suppressed precisely the signal that fix
made available: an E2E failure that is *not* on the inner list is a real regression, and
the outer waiver would have passed the deploy anyway. Two layers of the same waiver mean
the outer one hides the inner one.

### Merge the E2E fix FIRST

The policy is unsatisfiable until **both** land, and they are not interchangeable:

| | on `main` today | supplied by |
|---|---|---|
| E2E **runs** on push to `main` | no — trigger is `[stable, product/saas-platform-production]`; **0** push-to-main runs, verified via the API | **this lot** |
| E2E **passes** | no | **`fix/e2e-production-green`** |

If this lot merges first, the first push-to-main E2E run happens on its own merge commit
and goes red, refusing deploys until the suite fix follows. Merging the suite fix first
costs nothing: without the trigger it simply keeps not running on main pushes, exactly as
today.

Do not "fix" a red E2E by narrowing the `push` trigger this lot added. A required check
that never runs is a check that is vacuously satisfied — that is the original defect.

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

3. **Grant the four prerequisites above.**

4. **Merge `fix/e2e-production-green` — before this lot.** See the section above: this
   lot supplies the push-to-main trigger, that branch supplies a suite that passes, and
   the gate now requires E2E with no waiver. Wrong order = a red first run.

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
