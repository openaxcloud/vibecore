# Restore source provenance preflight, 2026-11-12

The read-only `inspectProvenanceBoundCnpgRestoreSource` now resolves the durable
backup intent before reading CNPG resources. Unlike the legacy metadata reader,
it supports the collision-resistant `bkp-v2` name produced by the provisioner.
It requires an already-bound Backup UID, exact source UID, project/org/environment,
instance/binding version and intent annotations (including nonce). A second intent
read rejects observed concurrent context changes. It never adopts or writes a UID.

This is a component, not an enabled restore feature. Neither API routes nor
`server.ts` are changed. The production 503 gate remains. Read-only preflight is
not a distributed lock: the future executor must revalidate identity under its
fence. Metadata does not prove backup bytes, WAL continuity or target readback;
both physical-verification flags remain false.

Still required before production activation: archive/WAL validation, isolated
target attestation, exhaustive consumer drain/fencing and crash-recovery drill.
No production resources or user data were accessed for this change.

Validation: 91 restore tests passed (executor, source, route and integrity suites;
13 new provenance preflight cases). Focused strict TypeScript check of the source
module passed. Restore source/test ESLint and all touched-code Prettier checks
passed. The one-line provisioner export retains existing lint debt in that file
(10 errors, 11 warnings, unrelated to this export); no global lint pass claimed.
