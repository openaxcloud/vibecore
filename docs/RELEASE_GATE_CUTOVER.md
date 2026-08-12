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

1. **`roles/cloudkms.publicKeyViewer`** on the `cosign-images` KMS key, granted to the
   deploy service account (`GCP_ARTIFACT_WRITER_SERVICE_ACCOUNT`).
   Verification only needs the public key — no signing rights are granted.
   **If this is missing, `cosign verify` fails closed and NOTHING deploys.** Check it
   first, not after merging.
2. **GitHub environment `production-break-glass`**: at least **two** required
   reviewers, deployment branches limited to `main`. The break-glass job reads the
   protection rules through the API and refuses if it cannot prove two reviewers.

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

1. **Merge the lint fix first** (PR #133). Two `@blitz/lines-around-comment` errors in
   `app/root.tsx` and `EcodeExactShell.tsx` are what currently keep `main`'s CI red;
   until they are gone the gate correctly refuses every push. Nothing else in that PR.

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

   **The one thing to watch on the first run** is step `Resolve immutable image
   digests` for the tiers this run did *not* rebuild. It reads what the release
   currently stores; if a service has no real pinned tag it fails closed and prints
   exactly what it found plus the command to pin it explicitly. That is the most
   likely first-run stop, and it is safe — nothing has been rolled out at that point.

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
