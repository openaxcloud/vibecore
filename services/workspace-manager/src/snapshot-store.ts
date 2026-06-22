import { createReadStream, createWriteStream } from 'node:fs';
import { copyFile, mkdir, rename, rm, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

/**
 * Decouple a workspace's durable filesystem from the compute that runs it.
 *
 * Today a workspace is pinned to a ReadWriteOnce PVC, so it can only run wherever
 * that volume mounts: slow cold-start, no instant fork, rigid scheduling. Replit
 * avoids this by keeping each Repl's filesystem in object storage (GCS, fronted
 * by their "margarine" block cache) so any compute node can pick up any Repl,
 * fork is a cheap copy, and compute is ephemeral.
 *
 * This is the seam that model sits behind. The store holds one OPAQUE archive
 * blob per workspace — it neither knows nor cares that the bytes are a gzipped
 * tar; the workspace-agent's /snapshots/archive endpoints produce and consume
 * that format. The manager streams the agent's archive into `saveStream` on stop
 * and back out via `restoreStream` on start, so the PVC becomes a hot cache
 * rather than the source of truth. `fork` clones one workspace's blob into a new
 * id — the primitive behind "duplicate project" / templates.
 *
 * FilesystemSnapshotStore (below) is the dependency-free reference + same-node
 * impl; GcsSnapshotStore (gcs-snapshot-store.ts) is a drop-in over a bucket.
 */
export interface WorkspaceSnapshotStore {
  /** Persist `archive` as the snapshot blob for `workspaceId` (overwrites). */
  saveStream(workspaceId: string, archive: Readable): Promise<void>;

  /**
   * Open the snapshot blob for `workspaceId`, or undefined when none exists (a
   * brand-new workspace), so the caller can fall back to an empty volume.
   */
  restoreStream(workspaceId: string): Promise<Readable | undefined>;

  /** True when a durable snapshot exists for `workspaceId`. */
  has(workspaceId: string): Promise<boolean>;

  /**
   * Clone `sourceWorkspaceId`'s snapshot to `targetWorkspaceId` — the instant
   * fork primitive. Throws if the source has no snapshot.
   */
  fork(sourceWorkspaceId: string, targetWorkspaceId: string): Promise<void>;

  /** Remove a workspace's snapshot (called on permanent delete). Idempotent. */
  remove(workspaceId: string): Promise<void>;
}

/*
 * Reject ids that could escape the snapshot root via path traversal or absolute
 * paths. Workspace ids are opaque slugs (`ws-<hex>` / `workspace_<n>`), so this
 * allowlist is deliberately strict — anything else is a bug or an attack.
 */
export function assertSafeWorkspaceId(workspaceId: string): void {
  if (!/^[A-Za-z0-9_-]+$/.test(workspaceId)) {
    throw new Error(`Unsafe workspace id for snapshot store: ${JSON.stringify(workspaceId)}`);
  }
}

/**
 * Filesystem-backed snapshot store: each workspace's archive is a single file
 * under `rootDir`. Stands in for object storage in dev/tests and on a single
 * node; GcsSnapshotStore swaps the local file for a bucket object but keeps the
 * exact same semantics (which is what the tests pin).
 */
export class FilesystemSnapshotStore implements WorkspaceSnapshotStore {
  constructor(private readonly rootDir: string) {}

  private pathFor(workspaceId: string): string {
    assertSafeWorkspaceId(workspaceId);

    return join(this.rootDir, `${workspaceId}.tar.gz`);
  }

  async saveStream(workspaceId: string, archive: Readable): Promise<void> {
    const dest = this.pathFor(workspaceId);
    // Write to a temp sibling then rename so a reader never sees a half-written
    // blob and a crash mid-write can't corrupt the previous good snapshot.
    const tmp = `${dest}.tmp-${process.pid}-${Date.now()}`;

    await mkdir(dirname(dest), { recursive: true });

    try {
      await pipeline(archive, createWriteStream(tmp));
      await rename(tmp, dest);
    } catch (error) {
      await rm(tmp, { force: true }).catch(() => undefined);
      throw error;
    }
  }

  async restoreStream(workspaceId: string): Promise<Readable | undefined> {
    if (!(await this.has(workspaceId))) {
      return undefined;
    }

    return createReadStream(this.pathFor(workspaceId));
  }

  async has(workspaceId: string): Promise<boolean> {
    // Validate up front so an unsafe id throws rather than being masked as
    // "no snapshot" by the not-found catch below.
    const blob = this.pathFor(workspaceId);

    try {
      return (await stat(blob)).isFile();
    } catch {
      return false;
    }
  }

  async fork(sourceWorkspaceId: string, targetWorkspaceId: string): Promise<void> {
    if (!(await this.has(sourceWorkspaceId))) {
      throw new Error(`Cannot fork: no snapshot for source workspace ${sourceWorkspaceId}`);
    }

    const dest = this.pathFor(targetWorkspaceId);

    await mkdir(dirname(dest), { recursive: true });
    await copyFile(this.pathFor(sourceWorkspaceId), dest);
  }

  async remove(workspaceId: string): Promise<void> {
    await rm(this.pathFor(workspaceId), { force: true });
  }
}
