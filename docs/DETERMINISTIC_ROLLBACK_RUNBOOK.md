# Deterministic release rollback

Server-image releases written after migration `0100_release_manifest_deterministic_rollback`
carry two immutable JSON envelopes in `ReleaseManifest`: `runtimeSpec` and
`promotionEvidence`. The columns remain nullable solely so pre-0100 rows can be
read. A new server release without both valid v1 envelopes is refused in the
same database transaction that would otherwise mark the Deployment `READY`.
Rollback treats a null, unknown-version, malformed, mismatched or tampered
envelope as an explicit HTTP 409 before creating the rollback Deployment or
calling the workspace manager.

The runtime envelope pins tenant/project/project-manifest identity, billing plan
and entitlement digest, access-policy version, machine key and rate-card
version, CPU/memory, port, health path, encrypted environment overrides, secret
policy and the complete production migration-ledger digest. Rollback never
substitutes a current rate card, machine default, `PORT`, health path or
environment override. `CURRENT` is the only write policy enabled initially:
current project secrets are resolved before the effect. A `PINNED` manifest is
fail-closed until a separately retained immutable secret snapshot exists.

Promotion evidence is self-hashed and binds the committed Binary Authorization
result to the same tenant, project, artifact repository and digest. It is stored
in the READY/manifest transaction and is sufficient after the source Deployment
and its `AdminAuditLog` promotion event have been pruned.

## Encryption key rollout and rotation

No new production secret is required for the initial rollout. The writer uses
`ROLLBACK_MANIFEST_ENCRYPTION_KEY` when explicitly configured and otherwise
uses the existing mandatory, rotatable `CONFIG_ENCRYPTION_KEY`. Production
rejects a missing, development-default or shorter-than-32-character current
secret. The production chart already maps `CONFIG_ENCRYPTION_KEY` to Secret
Manager secret `vibecore-prod-encryption-key` in
`infra/helm/platform/values-prod.yaml`; the production deploy workflow and
startup validation already provision that value.

Each envelope stores a key id. If no explicit
`ROLLBACK_MANIFEST_ENCRYPTION_KEY_ID` is supplied, the id is derived from the
current secret (`config-` plus the first 20 hexadecimal SHA-256 characters), so
a rotation cannot accidentally claim the old identity.

Before rotating the current key:

1. Read the existing derived/explicit key id from a retained manifest and add
   the old secret to `ROLLBACK_MANIFEST_DECRYPTION_KEYS_JSON` as a JSON object
   entry keyed by that id. Store this JSON only in Secret Manager/Kubernetes
   Secret, never in Git.
2. Roll out the decrypt-only keyring while the old key is still current and
   verify a rollback-manifest parse on every API replica.
3. Rotate `CONFIG_ENCRYPTION_KEY` (or the dedicated writer key), roll the API,
   publish a canary release and verify both the canary and a pre-rotation
   manifest can be parsed.
4. Retain each old decrypt key for at least as long as any ReleaseManifest that
   references it. Removing it earlier intentionally makes those rollbacks fail
   closed with `ROLLBACK_RUNTIME_SPEC_KEY_UNAVAILABLE`.

An invalid optional keyring fails only the server publish/rollback path that
constructs or reads an envelope; it does not introduce a new boot dependency for
unrelated API traffic. Never configure the development fallback in production.

## Database and static artifact checks

Production releases with migrations pin the digest of the complete
`_ecode_schema_migrations` ledger under the same PostgreSQL advisory lock used
by migration application. Missing, malformed, changed, advanced or unavailable
ledgers all return 409 before a rollback effect. Releases without a database
plan pin `mode: none` and must not carry an outer `dbMigrationPoint`.

Static releases retain bytes at
`static-artifacts/sha256/<artifact-digest>`. Rollback verifies that retained
directory before materialising a new deployment and copies the same
content-addressed `artifactRef` into the new manifest. Garbage collection must
call `ApiStore.isReleaseArtifactRetained` immediately before deletion; any
ReleaseManifest reference protects the artifact independently of Deployment
retention. Legacy path-prefixed HTML is never rewritten during restore. A
cross-replica, bounded routing-alias chain maps the embedded old deployment id
to the newest rollback Deployment; serving always prefers that alias even if a
mutable source row/snapshot remains, and re-applies the final target's access
policy, project lifetime and `READY` gates. Corrupt/cyclic aliases and aliases
whose target is not `READY` fail closed. A failed or crash-recovered rollback
removes only the alias it owns before acknowledging cleanup.

## Reserved VM CHANGE/recovery limitation

Migration 0100 does not retrofit deterministic rollback into the Reserved VM
`CHANGE` saga. A CHANGE completion or recovery can leave historic, legacy
ReleaseManifest rows without v1 runtime/promotion envelopes; neither that saga
nor its recovery response upgrades those rows into rollback authority. Both
rollback endpoints therefore reject a Reserved VM before creating a
RollbackOperation/Deployment or invoking the manager. A later normal
publication or redeploy that appends a new server ReleaseManifest must still
record the exact 0100 envelopes for the runtime state it actually applied. Keep
this fail-closed boundary until Reserved CHANGE itself has a transactional,
immutable release-envelope contract.

## Forward-port after reserved migration 0099

Migration 0100 deliberately does not edit reserved migration 0099. When 0099's
`ReleaseManifest.planEntitlements` and `projectManifestDigest` land, forward-port
the following integration points without adding duplicate pins inside a second
envelope:

- `packages/database/prisma/schema.prisma` and migration 0099 remain the source
  of the two outer columns; keep 0100 limited to `runtimeSpec` and
  `promotionEvidence`.
- `services/api/src/store.ts`: add the outer fields to `ReleaseManifestRecord`
  and release commit inputs. Treat them as required for new server releases.
- `services/api/src/prisma-store.ts` and the test store: write all four values in
  the READY transaction, copy all four during Reserved VM in-place publish and
  rollback, and copy the historical outer pins when an access-policy-only
  release rebinds `runtimeSpec.accessPolicyVersion`. Require the outer
  `projectManifestDigest` and canonical `planEntitlements` digest to equal the
  values bound by `runtimeSpec`.
- `services/api/src/app.ts`: pass 0099's canonical plan-entitlement snapshot and
  project-manifest digest to normal publish. On rollback validate the outer pins
  first, validate the v1 envelope against them, and copy the exact outer values
  to the new manifest. Never recompute one copy while retaining the other.

The forward-port is complete only when mutation tests prove that changing the
current plan/defaults cannot substitute values and that tampering either the
outer 0099 pins or their v1 bindings returns 409 before any manager call.
