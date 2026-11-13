# Recover release evidence after a suppressed push

Verified on 2026-11-13 against `32d15c77b2439d774abd7bba24d76de9db026360`.
This procedure does not change the deployment gate or grant an exception.

## Observed incident

The squash commit for PR 925 preserved CI-suppression markers from its component
commit messages. Those markers apply to the final commit body, not only its title.
The push-triggered checks for that exact main commit were therefore absent.

Manual Production CI [43455270312](https://github.com/openaxcloud/vibecore/actions/runs/43455270312)
and Production E2E [43455277456](https://github.com/openaxcloud/vibecore/actions/runs/43455277456)
passed. Nevertheless, deployment [43460901633](https://github.com/openaxcloud/vibecore/actions/runs/43460901633)
correctly refused the commit before cloud credentials, image builds or rollout:

- CI and E2E had event `workflow_dispatch`, which the release policy does not accept.
- Security Analysis and Code Quality had no runs for that exact commit.

The earlier deployment [43453096918](https://github.com/openaxcloud/vibecore/actions/runs/43453096918)
for PR 922 was separately refused because main had newer deployable changes.
Neither refusal is a deployed release or a failed application health check.

## Sources of truth

- [`required-checks.json`](../scripts/release-gate/required-checks.json) currently
  requires `push`, branch `main`, exact SHA, workflow ID/path and named successful
  jobs. Four workflows are required: Production CI, Production E2E,
  Security Analysis and Code Quality.
- [`ci.yml`](../.github/workflows/ci.yml), [`e2e.yml`](../.github/workflows/e2e.yml),
  [`security.yaml`](../.github/workflows/security.yaml), and
  [`quality.yaml`](../.github/workflows/quality.yaml) all subscribe to main pushes.
  Their manual/scheduled availability is not an exemption from the release policy.
- [`deploy-main.yml`](../.github/workflows/deploy-main.yml) excludes documentation
  changes from automatic deployment. Its manual dispatch still applies the same
  release gate; it is a deployment trigger, not substitute test evidence.

## Prevention before merging a squash PR

1. Recheck the final PR head, required PR checks and unresolved reviews.
2. Inspect the complete proposed squash title **and body**. Do not inherit
   component commit messages blindly. Supply an explicit clean title and body
   without CI-suppression directives or trailers. Keep necessary provenance but
   do not copy control markers into the final commit message.
3. Merge through the protected PR path. Never force main or bypass checks.
4. Read the resulting main commit message and SHA back from GitHub. Confirm the
   four required push workflows actually started for that SHA; PR green alone
   does not prove the new squash commit was tested.

## Recovery without weakening protections

1. Do not keep redispatching the refused historical SHA. Do not broaden
   `allowedEvents`, waive missing checks, or reuse an ancestor's green result.
2. Prepare a useful, minimal follow-up through a protected PR, such as this
   operational incident record, and merge with an explicitly clean message.
3. Wait for all four required **push** workflows and their required jobs to pass
   for the resulting main SHA. Verify latest attempts, not an older green run.
4. Recheck main and existing deployment runs. If an equivalent deployment is
   active, follow it rather than creating a duplicate. If the diff is docs-only,
   automatic deployment is intentionally skipped: dispatch `deploy-main.yml`
   once for the current main SHA after the push evidence is green. Do not opt in
   to a historical target.
5. Verify the accepted target, release gate, image digests, rollout and public
   health before reporting delivery. A successful merge is not deployment.

Keep one release coordinator while the chain completes. If main advances again,
re-evaluate the new SHA rather than forcing a stale rollout. This recovery does
not enable database restoration, change its 503 guard, or validate the complete
customer journey.
