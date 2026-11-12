# Read-only WAL metadata inventory

`database-restore-wal-inventory.ts` adds an exact-object GCS metadata reader and a
bounded PostgreSQL WAL range planner. The caller must supply trusted configured
bucket, provenance/source identity and a recovery range derived from a verified
manifest/plan. No user-facing route accepts these arguments.

The existing Barman gzip layout is addressed as
`db/<project>/<source-cluster>/wals/<first-16-hex>/<24-hex-segment>.gz`.
The planner handles log rollover for PostgreSQL power-of-two segment sizes
between 1 MiB and 1 GiB. It rejects timeline changes (history verification is not
implemented), reversed/out-of-range segments and batches above 256 objects before
any cloud call. Missing, deleted, mismatched, empty or malformed object metadata
fails closed. Generations stay decimal strings, avoiding numeric precision loss.

The SDK adapter uses only `bucket().file().getMetadata()` on an already-authorized
client. It neither lists unrelated objects, downloads bytes, changes credentials
or permissions, nor mutates cloud data. Tests use controlled metadata, not GCS.

**Not a restore attestation:** object presence and provider CRC32C are not physical
WAL verification. Both `archiveVerified` and `walContinuityVerified` stay false.
The future physical verifier must read these exact immutable generations,
decompress and verify PostgreSQL records, system identity and recovery target.
Source metadata must be revalidated under the executor's distributed fence.
Current metadata may change during inspection; no atomic bucket snapshot is
claimed. Source backup validation, history-chain transitions and fencing remain
outstanding. No production coordinator or restoration endpoint is enabled.
