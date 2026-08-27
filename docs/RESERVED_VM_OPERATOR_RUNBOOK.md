# Reserved VM operator runbook

Reserved VM is an always-on server deployment lifecycle. It reuses the existing
server image build, promotion, release-manifest, Service and public URL pipeline;
it does not create a second deploy path. The feature is fail-closed and remains
invisible as an available choice until the workspace manager proves both storage
and node capacity from the Kubernetes API.

## Commercial and runtime contract

| Tier          | Kubernetes CPU | Kubernetes memory | Monthly price |
| ------------- | -------------: | ----------------: | ------------: |
| `shared-0.5`  |         `500m` |             `2Gi` |           $20 |
| `dedicated-1` |            `1` |             `4Gi` |           $40 |
| `dedicated-2` |            `2` |             `8Gi` |           $80 |
| `dedicated-4` |            `4` |            `16Gi` |          $160 |

Requests equal limits for every Reserved VM tier. The Deployment stays at one
replica and is excluded from the Autoscale idle reaper and Autoscale usage
meter. A monthly ledger reservation is settled once by the fenced operation;
an upgrade reserves only the positive price difference. A downgrade does not
issue an automatic refund and its lower tariff starts with the next billing
period.

The API requires an `ACTIVE` or `TRIALING` paid subscription, a 16–128 character
`Idempotency-Key`, and explicit acceptance of the rate-card terms returned to the
client. A change also requires `expectedRuntimeVersion`; a stale value fails with
a conflict instead of overwriting a collaborator's change.

## Activation gate

Do not set `RESERVED_VM_RUNTIME_ENABLED=true` until all of these values describe
resources that already exist:

```text
RESERVED_VM_RUNTIME_ENABLED=true
RESERVED_VM_STORAGE_CLASS=<rwo-storage-class>
RESERVED_VM_STORAGE_GB=<integer-1-through-1024>
RESERVED_VM_NODE_SELECTOR_KEY=<operator-owned-label-key>
RESERVED_VM_NODE_SELECTOR_VALUE=<operator-owned-label-value>
RESERVED_VM_TAINT_KEY=<operator-owned-taint-key>
RESERVED_VM_TAINT_VALUE=<operator-owned-taint-value>
```

The selected node must carry the configured label and the configured
`NoSchedule` taint. Workloads also use the `gvisor` RuntimeClass and tolerate its
runtime taint. The manager's `GET /runtime-capabilities` endpoint returns enabled
only when it can read the StorageClass and at least one matching labelled,
tainted node. Missing configuration, RBAC denial, API failure, absent storage or
absent capacity all keep the product disabled.

## Persistent data and in-place changes

The first Reserved VM transition creates one `ReadWriteOnce` claim named
`reserved-data-<deploymentId>` and mounts it at `/var/lib/ecode`. Tier changes and
Reserved VM → Autoscale changes mutate the existing Kubernetes Deployment and
retain:

- deployment id, image, command, environment and Secret references;
- Service, host and public URL;
- the same PVC and its data.

The general server-deployment stop path removes runtime manifests but never the
Reserved VM PVC. Do not delete `reserved-data-*` claims as part of a rollout,
rollback, retry or type change. Data deletion requires a separate, explicit
retention/purge procedure outside this feature.

## Recovery and rollback

`ReservedVmOperation` is the durable source of truth. Its lease uses PostgreSQL
`clock_timestamp()` and a fencing token; a replacement worker may resume only
after lease expiry. Always retry the original request with the same
`Idempotency-Key`. A new key represents a new commercial intent.

For an in-place change, the manager keeps the exact previous Deployment manifest.
If the new rollout cannot become ready, it reapplies that manifest and reports
`rolledBack: true`; only then may the API release the billing hold. If the manager
cannot prove rollback or cleanup, the operation deliberately stays recoverable
and its reservation must not be released manually. Investigate Kubernetes state,
restore the previous manifest if necessary, then resume the fenced operation.

For creation, an image/build failure before Kubernetes apply is safe to fail and
release. After apply, cleanup must be confirmed by the manager before release.
The PVC is retained even when runtime cleanup succeeds.

## Monthly renewal and past-due recovery

Every paid calendar month has one `ReservedVmBillingPeriod`, uniquely identified
by `(deploymentId, periodStart)`. `reservedVmNextChargeAt`, period creation,
leases, grace deadlines and stop-request timestamps all originate from PostgreSQL
time. A renewal worker must use the `ReservedVmBillingStore` claim/commit/fail
contract; it must never post ledger entries directly.

The claim creates or recovers the canonical `LedgerReservation`, and the commit
settles it in the same transaction that marks the period paid and advances
`reservedVmNextChargeAt`. A crashed worker can be replaced after lease expiry;
the fencing token rejects its stale completion. If a hold itself expires before
completion, the store releases it and creates a new fenced reservation generation
for the same unique period. Only one generation can settle.

On a declined renewal, call `failReservedVmBillingPeriod` with the configured
grace duration. A retry never extends the original `graceEndsAt`. Once the grace
deadline passes, `listReservedVmStopSignals` durably promotes the deployment to
`STOP_REQUIRED` and releases the uncommitted hold. That signal means **stop
compute only**: its `deletePersistentStorage` field is always `false`, and the
`persistentStorageClaim` must remain attached to the retained data lifecycle.
Do not clear the stop state or advance the period manually; repair billing and
resume through an audited operator recovery flow.

## Current operator limits

- Storage is one RWO claim and the runtime contract is one replica. This is not a
  multi-replica or multi-zone HA database primitive.
- Existing claims are never resized by a tier change. Storage expansion is an
  operator-owned procedure and requires a compatible StorageClass.
- Backups, restore testing, regional disaster recovery and final data retention
  remain operator responsibilities.
- Enabling the flag does not provision a node pool or StorageClass. Capacity must
  be created and verified separately before activation.
- This implementation was validated against manifest/unit tests and disposable
  PostgreSQL multi-client tests without provisioning or spending cloud resources;
  cluster activation still requires the normal controlled rollout and live
  operator verification.
