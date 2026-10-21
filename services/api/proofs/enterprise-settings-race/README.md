# Concurrent initial enterprise settings reads

Product scope: `PrismaApiStore.getEnterpriseSettings` only. Base:
`fc8a687e715e6052668ade83474da4aef5f27df9`. No IP, MFA, SSO,
membership or permission checks changed. No production access or data used.

The empty-update Prisma upsert races on the organization's primary key. Two
actual HTTP GETs (`/projects/:id` and `/projects/:id/snapshots`) reach two
PostgreSQL INSERTs while a real SHARE table lock holds them. Releasing that
lock gives 500/200 on the original implementation. The correction reads an
existing row, or inserts defaults using `ON CONFLICT DO NOTHING` before
re-reading. It never updates an existing policy or its `updatedAt`.

`red/` and `green/` contain complete raw test reports, logs, detailed per-case
status/duration summaries, SQL observations (placeholders only), and hashes.
They were run before committing: `dirty=true` is intentional. The original
store file matches the base exactly; the test and runner hashes are identical
between red and green. These are source-exact proofs, not clean-commit proofs.

| Check | Expected | Original | Corrected |
| --- | --- | --- | --- |
| Two authorized initial GETs | 200/200 | 500/200 | 200/200, three fresh organizations |
| Existing customized policy | Every field and updatedAt identical | Pass | Pass after concurrent reads and new connection |
| Foreign GETs, fresh owner organization | 404/404, no project or snapshots returned | One 500 | 404/404 |
| Foreign GETs, configured owner | 404/404 and unchanged settings | Pass | Pass |
| Missing organization | Real P2003, no settings persisted | Pass | Pass |

The initial draft incorrectly assumed foreign GETs never create settings.
The existing enterprise prehandler runs before membership authorization, so a
first read may initialize defaults even when the final response is 404. That
new assertion was corrected, not an existing gate weakened. Both the fresh
organization counterproof and a separate immutable-settings case are retained.

Run against a migrated, isolated local database named `panel_proof`:

```sh
NODE_ENV=test DATABASE_URL=<isolated-local-database-url> \
  sh services/api/scripts/verify-enterprise-settings-postgres.sh /tmp/enterprise-proof
```

The runner enables the existing `PANEL_POSTGRES_PROOF` switch and requires all
five PostgreSQL tests, zero skips/todo and exit zero. It saves detailed failure
results before rejecting a failed run. Tests clean up only their own synthetic
users, organizations and projects. The SHARE lock is for deterministic test
ordering; no provider substitute, mocked Prisma method or artificial sleep is
used. Pending HTTP calls are drained after releasing the lock.

`checks.json` distinguishes real PostgreSQL proof from memory-backed contract
regressions. API typecheck/build and new-test lint pass. Whole-file store lint
still has the same 98 errors and one warning as the exact base (same rule,
message and severity multiset); global lint is not claimed green. No lint rule,
hook, scanner or exemption was disabled. The dedicated
`.github/workflows/enterprise-settings-postgres.yml` runs this proof against a
disposable PostgreSQL service, requires all five cases without skips, checks
the exact SHA and clean tree, and uploads the reports and SQL observations.
Only that job's successful receipt proves CI execution of these opt-in tests;
ordinary CI success alone does not.

No claim is made about all administrative-update/deletion races, production
validation, frontend completeness, or the unrelated archive latency.
