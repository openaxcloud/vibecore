# File History architecture and operations

File History is a per-file, append-only version ledger for text files in the Project Editor. It is independent from the Git panel: creating, browsing, comparing, playing, or restoring a file version does not create, rewrite, or delete a Git commit.

## Product contract

- The **History** control belongs to the currently open text file.
- Versions can be selected with the timeline slider, previous/next buttons, or the left/right arrow keys while the history surface has focus.
- **Compare Latest** renders an inline diff between the selected version and the latest recorded version.
- **Restore** writes the selected content and appends a new `RESTORE` version. It never updates or deletes an existing version.
- Playback first loads every metadata page, then advances from the true oldest immutable version without writing to the live editor.
- If the watcher reports a restart, dropped journal entry, truncated reconciliation, relay overflow, or capture failure, the timeline remains usable but displays an explicit incompleteness warning.

## Storage model

Version metadata and content are separated:

- immutable, project-scoped blobs are addressed by a SHA-256 content digest and deduplicated inside that project;
- immutable version rows reference a blob and record project, stable workspace key, stable lineage ID, canonical sequence, path, operation, source, actor, previous version, restored-from version, rename origin, tombstone state, operation ID, and timestamp;
- one workspace-scoped continuity row persists watcher session identity, dropped-event counters, truncation flags, reconciliation time, and cumulative incompleteness reasons across API restarts.

The canonical sequence, not a wall-clock timestamp, orders pages and playback. A rename appends a row at the destination path while retaining the same lineage, so browsing or restoring the new filename includes every earlier revision. A delete appends a tombstone containing the last supported text body; it never removes prior rows. Re-creating that path after its tombstone starts a new lineage instead of merging two unrelated files.

A workspace database row may be garbage-collected while its stable workspace key remains part of history isolation. Every read scopes both the version ID and project ID to prevent cross-project IDOR.

No endpoint exposes a bulk list of file bodies. Timeline pagination returns metadata; a selected body is fetched separately. File bodies, diffs, and restored content are never written to logs, traces, audit metadata, or error-reporting payloads.

## Recording and idempotency

Editor and agent writes are serialized per path and carry a stable operation ID across transport retries. The backend captures the baseline before the first mutation and appends the resulting content after a successful write. Repeated non-restore writes with the same latest digest are deduplicated. There is deliberately no client-supplied capture endpoint: durable versions can originate only from a real authorized workspace mutation or an authenticated native watcher event.

Restore requires:

- the immutable source version ID;
- the latest version ID the user compared against;
- a client-generated operation ID reused for retries.

If the latest version changed, restore returns `FILE_HISTORY_CONFLICT` and does not write. Replaying a completed operation ID returns its original result. A successful restore always appends a version, even when the restored digest equals another historical version.

## Limits and unsupported files

History accepts UTF-8 text content up to 2 MiB. Binary, NUL-bearing, internal-path, and oversized content is not persisted as a File History version. A valid runtime write is still performed when only the history policy rejects its body, so the history limit cannot cause editor data loss. The normal workspace-agent read/write limits still apply independently. UI error states include retry and never discard the current editor buffer.

Generated dependency, VCS, cache, and build trees are excluded from background capture: `node_modules`, `.git`, `.vite`, `.next`, `.cache`, `dist`, `.turbo`, `.history`, `.vibecore-workspaces`, and `coverage`. Symlinks are never followed. Paths are normalized and confined to the project before any read, write, or restore.

The workspace-agent owns one process-lifetime Chokidar watcher that starts before it accepts traffic; it does not start and stop with a browser socket. Terminal, Git, extension, formatter, and agent changes therefore continue entering a bounded, ordered journal while every IDE client is disconnected. On connection the agent replays retained events with their original stable event IDs and sequences, sends a bounded reconciliation snapshot, then switches to live events. Defaults are 10,000 journal events / 128 MiB and 10,000 snapshot files / 128 MiB, configurable through `WORKSPACE_FILE_WATCH_JOURNAL_MAX_EVENTS`, `WORKSPACE_FILE_WATCH_JOURNAL_MAX_BYTES`, `WORKSPACE_FILE_WATCH_INITIAL_MAX_FILES`, and `WORKSPACE_FILE_WATCH_INITIAL_MAX_BYTES`.

Every watcher frame carries a process-session ID. The root frame also exposes `journal.truncated`, `journal.droppedEvents`, `journal.connectionTruncated`, and `snapshot.truncated`. These are persisted observability signals: a truncated journal still reconciles the latest file state but cannot reconstruct every intermediate frame. A changed session ID proves that the in-memory journal restarted, so the API marks continuity incomplete instead of presenting reconciliation as a complete historical replay. Native filesystem events are the default, polling can be forced with `WORKSPACE_FILE_WATCH_USE_POLLING=true`, and file-descriptor/inotify exhaustion automatically falls back to polling.

## Security and retention

File history can retain deleted secrets and therefore inherits the project's authorization and deletion controls. Audit events record actor, action, project, path identifier, version ID, operation ID, timestamp, and correlation ID, but never content.

Versions are retained until project/account deletion, which cascades both versions and blobs. Any future policy-driven pruning must remain a maintenance action separate from restore and may garbage-collect only blobs with no remaining version reference.

## Operational checks

- Track append latency, conflict rate, rejected-size count, deduplication rate, restore success/failure, and stored blob bytes without path/content labels.
- Alert on sustained ingestion failure or restore failures; editor writes must surface a recoverable error rather than silently losing history.
- Verify pagination and checksum integrity in scheduled maintenance.
- The browser reconnects to the File History watcher indefinitely with capped exponential delay; it never silently abandons journal reattachment after a fixed attempt count. Every authenticated socket receives journal replay plus reconciliation; stable event IDs and content-hash deduplication prevent reconnects or multiple clients from creating duplicate versions.

## Required validation

Automated coverage includes list/detail pagination, canonical sequence order, complete-timeline playback preparation, unauthorized and cross-tenant reads, path traversal, size/binary rejection, same-digest deduplication, idempotent retry, delete tombstones, rename lineage, persisted watcher continuity, reconnect beyond the generic cap, compare source selection, concurrent restore conflict, and proof that restore increments the version count without modifying earlier rows.

Live validation covers dark and light mode at desktop, tablet, and mobile sizes; keyboard navigation; 44 px touch targets; loading/empty/error/retry states; inline diff; playback controls and reduced-motion behavior; restore followed by reload; and absence of horizontal overflow or a blank editor/preview.
