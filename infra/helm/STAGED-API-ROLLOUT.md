# Migration, manager, API

When the runtime tier rebuilds the API, deploy-main uses the existing gated,
scanned and signature-verified release manifest for a preparatory Helm upgrade.
The initial deployed revision is recorded before this upgrade, not between stages.

1. The hook runs with `migrations.imageDigest` set to the new API digest. Its
   existing pre-upgrade ServiceAccount and Job apply all additive migrations.
2. Only the manager image/provenance and migration Job image may change. The
   complete chart is previewed with `helm upgrade --reuse-values --dry-run=server
   -o json`, using the same arguments and overrides as the actual upgrade.
   This preserves the previous release's coalesced defaults; a separate
   `helm template` with only user values would instead introduce new defaults.
   The JSON release's manifest and every hook manifest are compared; all other resources,
   including Secrets, ConfigMaps and RBAC, must match the stored manifest/hooks.
   The current API stays pinned; existing live images must match the stored
   release. Drift or a missing initial revision stops before mutation. Helm waits
   for the manager, then its desired replica count, readiness and running imageIDs
   are checked against the verified manager digest.
   Before the manager attestation, the retained migration Job must have a UID,
   `Complete=True`, `succeeded=1` and the expected new API image. The uploaded
   `manager-stage.json` records these bounded facts; it does not claim to inspect
   the database migration ledger or prove cloud backup recovery.
3. The existing full upgrade deploys the target services. It clears the temporary
   migration image override, restoring the hook's normal API-image selection.
   Existing activation barriers and final digest checks remain in force.

If either upgrade or a subsequent check fails, the workflow restores the revision
captured before step 1. The final upgrade's `--atomic` alone is insufficient: it
can return to the intermediate manager release. Additive migrations and provenance
are retained; rollback never removes tables or rewrites migration history.

This sequence uses the existing Helm identity, service accounts, RBAC and secrets.
The stage has a 55-minute limit: a 25-minute Helm upgrade may also spend 25 minutes
in its atomic rollback. On success, the post-Helm rollout wait allows22minutes
(25+22=47); an atomic failure does not proceed to that wait (25+25=50).
The job budget is185minutes (original130 plus55), retaining the original rollback
allowance. No backup, budget extension or AI request is activated by this sequence.
Production restoration remains disabled. Tests use synthetic command boundaries;
they do not establish cloud recovery or a completed production rollout.

The preservation check deliberately refuses chart changes that would also alter
another resource during the preparatory stage. Such changes require a separately
reviewed rollout plan; the check must not be bypassed to force the upgrade.

On unrelated drift the error reports bounded resource identities and field paths,
never values. Secret data and dynamic annotation/label keys are redacted. At most
16 resources and 32 paths per resource are reported; truncation remains an error.
Do not publish stored Helm values or raw rendered manifests for diagnosis.

If the post-migration manager readiness wait fails, `manager-stage.json` records
`phase: manager-readiness-failed` and `managerReadinessFailure`. This contains only
internally constructed reason codes and bounded diagnostics, never provider error
text, stderr, labels, full specs or pod/owner identities. Unknown thrown values receive the fixed
`UNEXPECTED_FAILURE` reason. The original error is rethrown, even if writing the
failure receipt fails; a missing final receipt is not proof of manager readiness.
This diagnostic capture changes no timeout, retry, rollout or rollback policy.
