#!/bin/bash
# Independent synthetic PG16 recipe, executed inside the existing dedicated
# container as postgres. Never uses its live PGDATA or opens a TCP listener.
# No image download, container/volume creation, or cloud operation.
set -euo pipefail
[ "${VIBECORE_SYNTHETIC_PHYSICAL_RESTORE:-}" = 1 ] || { echo 'Explicit synthetic recipe opt-in required' >&2; exit 90; }
B=/usr/lib/postgresql/16/bin
ROOT=$(mktemp -d /tmp/vibecore-restore-physical.XXXXXXXX)
cleanup() {
  "$B/pg_ctl" -D "$ROOT/target" -m fast stop >/dev/null 2>&1 || true
  "$B/pg_ctl" -D "$ROOT/source" -m fast stop >/dev/null 2>&1 || true
  case "$ROOT" in /tmp/vibecore-restore-physical.*) rm -rf -- "$ROOT";; *) exit 92;; esac
}
trap cleanup EXIT
trap 'exit 143' TERM
trap 'exit 130' INT
mkdir "$ROOT/archive" "$ROOT/socket-source" "$ROOT/socket-target"
"$B/initdb" -D "$ROOT/source" --auth-local=trust --auth-host=reject --no-instructions > "$ROOT/init.log"
"$B/pg_ctl" -D "$ROOT/source" -l "$ROOT/source.log" -o "-c listen_addresses='' -k $ROOT/socket-source -p 55444 -c wal_level=replica -c archive_mode=on -c archive_command='test ! -f $ROOT/archive/%f && cp %p $ROOT/archive/%f'" -w start >/dev/null
SQL=("$B/psql" -h "$ROOT/socket-source" -p 55444 -d postgres -X -v ON_ERROR_STOP=1 -At)
"${SQL[@]}" -c "CREATE TABLE restore_probe (id text PRIMARY KEY, value text NOT NULL); INSERT INTO restore_probe VALUES ('base','before backup')" >/dev/null
SYSTEM=$("${SQL[@]}" -c "SELECT system_identifier::text FROM pg_control_system()")
"$B/pg_basebackup" -h "$ROOT/socket-source" -p 55444 -D "$ROOT/backup" -Fp -X stream --checkpoint=fast --manifest-checksums=SHA256
"$B/pg_verifybackup" "$ROOT/backup" > "$ROOT/verify.log"
MANIFEST=$(sha256sum "$ROOT/backup/backup_manifest" | cut -d' ' -f1)
WAL_START=$("${SQL[@]}" -c "SELECT pg_current_wal_insert_lsn()::text")
WAL_SEGMENT=$("${SQL[@]}" -c "SELECT pg_walfile_name('$WAL_START'::pg_lsn + 1)")
"${SQL[@]}" -c "INSERT INTO restore_probe VALUES ('target','included')" >/dev/null
TARGET=$("${SQL[@]}" -c "SELECT clock_timestamp()::text")
"${SQL[@]}" -c "INSERT INTO restore_probe VALUES ('post','must be excluded')" >/dev/null
WAL_END=$("${SQL[@]}" -c "SELECT pg_current_wal_insert_lsn()::text")
"${SQL[@]}" -c "SELECT pg_switch_wal()" >/dev/null
for attempt in $(seq 1 150); do
  PENDING=$("${SQL[@]}" -c "SELECT count(*) FROM pg_ls_dir('pg_wal/archive_status') f WHERE f LIKE '%.ready'")
  [ "$PENDING" = 0 ] && break
  sleep 0.1
done
[ "$PENDING" = 0 ]
# Native record parsing/CRC checks over a closed range in the actual archive.
# All negative tests mutate independent owned copies, never the recovery archive.
[[ "$WAL_SEGMENT" =~ ^[0-9A-F]{24}$ ]]
"$B/pg_waldump" --path="$ROOT/archive" --start="$WAL_START" --end="$WAL_END" > "$ROOT/waldump.log"
[ -s "$ROOT/waldump.log" ]
cp -a "$ROOT/archive" "$ROOT/archive-corrupt"
dd if=/dev/zero of="$ROOT/archive-corrupt/$WAL_SEGMENT" bs=8192 count=1 conv=notrunc status=none
if "$B/pg_waldump" --path="$ROOT/archive-corrupt" --start="$WAL_START" --end="$WAL_END" > "$ROOT/corrupt-wal.log" 2>&1; then exit 94; fi
cp -a "$ROOT/archive" "$ROOT/archive-missing"
rm -- "$ROOT/archive-missing/$WAL_SEGMENT"
if "$B/pg_waldump" --path="$ROOT/archive-missing" --start="$WAL_START" --end="$WAL_END" > "$ROOT/missing-wal.log" 2>&1; then exit 95; fi
# A damaged base backup must be rejected, then restore the owned fixture bytes.
printf '00\n' > "$ROOT/backup/PG_VERSION"
if "$B/pg_verifybackup" "$ROOT/backup" > "$ROOT/tamper.log" 2>&1; then exit 93; fi
printf '16\n' > "$ROOT/backup/PG_VERSION"
"$B/pg_verifybackup" "$ROOT/backup" > "$ROOT/reverify.log"
cp -a "$ROOT/backup" "$ROOT/target"
touch "$ROOT/target/recovery.signal"
cat >> "$ROOT/target/postgresql.auto.conf" <<CONFIG
restore_command = 'cp $ROOT/archive/%f %p'
recovery_target_time = '$TARGET'
recovery_target_action = 'promote'
CONFIG
"$B/pg_ctl" -D "$ROOT/target" -l "$ROOT/target.log" -o "-c listen_addresses='' -k $ROOT/socket-target -p 55445 -c archive_mode=off" -w start >/dev/null
READ=("$B/psql" -h "$ROOT/socket-target" -p 55445 -d postgres -X -v ON_ERROR_STOP=1 -At)
for attempt in $(seq 1 150); do
  RECOVERY=$("${READ[@]}" -c "SELECT pg_is_in_recovery()")
  [ "$RECOVERY" = f ] && break
  sleep 0.1
done
[ "$RECOVERY" = f ]
OBSERVED=$("${READ[@]}" -c "SELECT string_agg(id,',' ORDER BY id) FROM restore_probe")
[ "$OBSERVED" = 'base,target' ]
[ "$("${READ[@]}" -c "SELECT system_identifier::text FROM pg_control_system()")" = "$SYSTEM" ]
"$B/pg_ctl" -D "$ROOT/target" -m fast -w restart > "$ROOT/restart.log"
[ "$("${READ[@]}" -c "SELECT string_agg(id,',' ORDER BY id) FROM restore_probe")" = 'base,target' ]
printf '{"physicalBackupVerified":true,"tamperedBackupRejected":true,"walRecoveryVerified":true,"archivedWalRecordsVerified":true,"corruptArchivedWalRejected":true,"missingArchivedWalRejected":true,"postTargetWriteExcluded":true,"targetRestartVerified":true,"networkListeners":false,"postgresVersion":"%s","manifestSha256":"%s"}\n' "$("${READ[@]}" -c 'SHOW server_version_num')" "$MANIFEST"
