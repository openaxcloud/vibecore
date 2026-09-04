# Provider deployment-hook saga runbook

Each non-static deployment hook is a single-attempt durable saga. Before a POST,
the API binds the configured provider target to exactly one Vibecore project and
records a `PREPARED` ledger row. It records `DISPATCHING` and attempt one before
network I/O. A timed-out, throttled, conflicting, 5xx, or lost response is never
resubmitted.

## Required target binding

Enable one provider only after configuring its normal dispatch credentials and
the matching `*_DEPLOY_TARGET_DEDICATED=true` and
`*_DEPLOY_TARGET_VIBECORE_PROJECT_ID=<project-id>` pair. Target configuration
drift prevents both dispatch and recovery GETs. The database additionally makes
the provider target set-once and serializes non-terminal operations on it.

## Operations and recovery

`PREPARED` may issue exactly one POST. `DISPATCHING`, `IDENTIFIED`, and
`MANUAL_RECOVERY` never issue another POST. Provider IDs and response evidence
are stored independently from the project release fence; a new release owner
reconciles a `QUEUED` or `BUILDING` local deployment using an exact target-bound
GET. A stale manifest terminalizes the local row as failed under current release
authority and never publishes the stale provider URL.

For `MANUAL_RECOVERY`, a platform administrator must have MFA and recent
reauthentication, then call `POST /admin/provider-deploy-hooks/:operationId/recovery`
with the candidate provider build ID. The API performs the live exact GET itself
and appends an immutable AuditLog-backed proof. There is no force/resubmit route.
Timestamp-window deletion is intentionally unavailable: it could delete another
operation's deployment. If a provider cannot prove exact ID and target identity,
leave the row manual and escalate to the provider account owner.

## Deletion and transfer

Project transfer and permanent deletion take provider-hook latches and reject
while a non-terminal hook exists. Hard-delete rechecks terminal proof in its
final transaction before cascading the ledger. Do not manually delete ledger
rows to bypass this gate.
