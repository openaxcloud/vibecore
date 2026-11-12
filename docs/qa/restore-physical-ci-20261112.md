# Blocking physical PostgreSQL recovery fixture

Production CI now invokes the existing PostgreSQL 16 physical fixture inside its
already-provisioned, digest-pinned disposable PostgreSQL service. The runner
refuses non-CI execution, malformed container IDs and a mismatching service image
before sending the recipe. No additional image pull, container, volume, cloud
resource or production connection is requested.

The recipe creates independent source and target PGDATA directories under its
own `mktemp` directory and listens only on private Unix sockets. It never uses
the service's live PGDATA. It creates synthetic rows, takes a real physical
backup and uses `pg_verifybackup`, proves rejection after backup tampering,
replays archived WAL to a timestamp, checks inclusion/exclusion of the intended
rows and matching system identifier, then restarts the target and checks again.
The recipe's own clusters/directories are cleaned up; the disposable service is
also torn down by GitHub Actions. An in-container timeout bounds the recipe even
if the outer docker client disappears. TERM/INT trigger shell cleanup.

The wrapper requires command success plus a strict machine receipt with every
proof field, PostgreSQL 16 version, SHA256 manifest digest and no network
listeners. It emits only selected receipt fields, explicitly `production:false`.
Raw Docker/PostgreSQL error output is not published. Unit tests test these
admission/receipt/command contracts; **only the actual CI step proves physical
execution**. No skipped or mocked result is accepted by that step.

This is a local synthetic PostgreSQL replay proof, not a cloud restore adapter.
It does not assert that the GCS archive contents, generation-pinned materializer,
production backup scheduling, distributed fencing or application cutover have
been validated together. `server.ts`, restore endpoints and their 503 gate are
unchanged. A successful fixture is not permission to activate production restore.
