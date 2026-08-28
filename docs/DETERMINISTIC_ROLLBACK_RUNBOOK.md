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
policy and the complete effective environment database migration-ledger digest. Rollback never
substitutes a current rate card, machine default, `PORT`, health path or
environment override. `CURRENT` is the only write policy enabled initially:
current project secrets are resolved before the effect. A `PINNED` manifest is
fail-closed until a separately retained immutable secret snapshot exists.

For server releases, promotion evidence is self-hashed and binds the committed
Binary Authorization result to the same tenant, project, artifact repository
and digest. Static rollback targets use the same column for a tagged,
self-hashed `static-rollback-routing` edge proof. Both forms are written in the
READY/manifest transaction and remain authoritative after source Deployment and
`AdminAuditLog` rows are pruned.

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

The API validates the current writer key and every historical decrypt key at
production boot. A missing, weak or malformed keyring deliberately blocks the
whole API replica before any route or worker can cause an external release
effect. Never configure the development fallback in production.

## Database and static artifact checks

Every server release pins the exact `DATABASE_URL` already assembled for and
sent to the manager. The shared assembler maps the current secret
(`PROD_DATABASE_URL` for production, `DATABASE_URL` for preview/staging), then
applies the immutable release overrides last; an override `DATABASE_URL`
therefore wins. A persisted `ProjectEnvVar` is not pinning authority because the
server runtime does not inject that row. Secrets are resolved once per effect:
inspection, lease and manager all consume that captured value, so a later secret
rotation cannot mix two database targets. Rollback decrypts its historic
overrides, resolves `CURRENT` secrets once, and applies the same rule. A
PostgreSQL database pins the complete `_ecode_schema_migrations` ledger even
when the release has no new migration plan. The release/rollback critical
section holds a session advisory lock on the same key used by migration
transactions, from the final pre-effect check through the manifest commit; the
ledger read itself is autocommit, so `idle_in_transaction_session_timeout`
cannot silently release the fence during manager IO. Explicit advisory unlock
is followed by session close as the fail-safe. The same backend re-proves lock
ownership and the exact ledger immediately before READY/manifest commit.
Missing, malformed, changed, advanced or unavailable ledgers fail during
preflight; if the session is lost after manager IO, the release is refused
before READY and the runtime cleanup/recovery path runs. `mode: none` is valid
only while the environment has no database connection and no `DatabaseInstance`
in `PROVISIONING` or `ACTIVE`. Environment/secret and database-provisioning
mutations share the project release barrier, so they cannot appear between this
pin and commit. An access-policy-only release does not restart the runtime and
therefore preserves the source manifest's database pin exactly; the Store
rejects any caller that tries to substitute a newly resolved database pin.

Static releases retain bytes at
`static-artifacts/sha256/<artifact-digest>`. Rollback verifies that retained
directory before materialising a new deployment and copies the same
content-addressed `artifactRef` into the new manifest. Garbage collection must
call `ApiStore.isReleaseArtifactRetained` immediately before deletion; any
ReleaseManifest reference protects the artifact independently of Deployment
retention. The production reaper claims bounded GC batches through a durable
`SystemSetting` keyset cursor serialized across replicas, then rechecks
retention under the per-digest filesystem lock before deletion; process restart
or a retained lexical prefix cannot starve later orphan artifacts. Legacy
path-prefixed HTML is never rewritten during restore. A
cross-replica, bounded routing-alias chain maps the embedded old deployment id
to the newest rollback Deployment. Every committed edge is proved by its
self-hashed target manifest, including when an intermediate Deployment row was
pruned; a terminal target with missing or divergent evidence is a 404, never a
source fallback. During the narrow crash-before-commit window, a non-terminal
target may fall back only to an independently valid original READY
manifest/snapshot. Serving re-applies the selected target's access policy,
project lifetime and `READY` gates without re-hashing the whole artifact tree on
every request. Corrupt/cyclic/cross-tenant aliases fail closed. A failed or
crash-recovered rollback removes only the alias it owns before acknowledging
cleanup.

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

## Integrated 0099/0100 manifest contract

Migration 0099 is the source of the outer `planEntitlements` and
`projectManifestDigest` columns; migration 0100 adds only `runtimeSpec`,
`promotionEvidence`, project-lifetime FK and append-only enforcement. Every new
server release requires all four values. The runtime plan digest is the
canonical hash of the exact outer 0099 entitlement object (including version,
plan, badge and region fields), and its project-manifest digest must equal the
outer value. Normal publish, Reserved VM in-place publish/redeploy, rollback,
reconcile and access-policy-only releases write/copy the exact pins in the same
READY transaction. Mutation tests cover every outer entitlement field,
project-manifest mismatch and current-plan/default drift; none may substitute a
historical value.
