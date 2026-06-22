import { cp, mkdir, rm, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';

/**
 * Decouple a workspace's durable filesystem from the compute that runs it.
 *
 * Today a workspace is pinned to a ReadWriteOnce PVC, so the workspace can only
 * run wherever that volume mounts: slow cold-start, no instant fork, rigid
 * scheduling. Replit avoids this by keeping each Repl's filesystem in object
 * storage (GCS, fronted by their "margarine" block cache) so any compute node
 * can pick up any Repl, fork is a cheap copy, and compute is ephemeral.
 *
 * This is the seam that model sits behind. The manager snapshots `/workspace`
 * to a snapshot store on stop and restores it on start, so the PVC becomes a hot
 * cache rather than the source of truth. `fork` makes a second workspace from an
 * existing snapshot — the primitive behind "duplicate this project" / templates.
 *
 * The interface is storage-agnostic: FilesystemSnapshotStore (below) is the
 * dependency-free reference + test double; a GcsSnapshotStore that tars +
 * uploads to a bucket is a drop-in implementation of the same contract.
 */
export interface WorkspaceSnapshotStore {
  /** Persist the contents of `sourceDir` as the snapshot for `workspaceId`. */
  save(workspaceId: string, sourceDir: string): Promise<void>;

  /**
   * Restore `workspaceId`'s snapshot into `targetDir`. Returns false when no
   * snapshot exists (a brand-new workspace), so the caller can fall back to
   * provisioning an empty volume. Restoring is idempotent.
   */
  restore(workspaceId: string, targetDir: string): Promise<boolean>;

  /** True when a durable snapshot exists for `workspaceId`. */
  has(workspaceId: string): Promise<boolean>;

  /**
   * Create `targetWorkspaceId`'s snapshot from `sourceWorkspaceId`'s — the
   * instant-fork primitive. Throws if the source has no snapshot.
   */
  fork(sourceWorkspaceId: string, targetWorkspaceId: string): Promise<void>;

  /** Remove a workspace's snapshot (called on permanent delete). */
  remove(workspaceId: string): Promise<void>;
}

/*
 * Reject ids that could escape the snapshot root via path traversal or absolute
 * paths. Workspace ids are opaque slugs (`ws-<hex>` / `workspace_<n>`), so this
 * allowlist is deliberately strict — anything else is a bug or an attack.
 */
function assertSafeId(workspaceId: string): void {
  if (!/^[A-Za-z0-9_-]+$/.test(workspaceId)) {
    throw new Error(`Unsafe workspace id for snapshot store: ${JSON.stringify(workspaceId)}`);
  }
}

/**
 * Filesystem-backed snapshot store. Each workspace's snapshot is a directory
 * under `rootDir`. This stands in for object storage in dev/tests and on a
 * single node; the GCS implementation swaps the copy for tar+upload but keeps
 * the exact same semantics (which is what the tests below pin).
 */
export class FilesystemSnapshotStore implements WorkspaceSnapshotStore {
  constructor(private readonly rootDir: string) {}

  private pathFor(workspaceId: string): string {
    assertSafeId(workspaceId);

    return join(this.rootDir, workspaceId);
  }

  async save(workspaceId: string, sourceDir: string): Promise<void> {
    const dest = this.pathFor(workspaceId);
    // Replace atomically-ish: write to a sibling temp dir, then swap in.
    const tmp = `${dest}.tmp-${Date.now()}`;

    await mkdir(dirname(dest), { recursive: true });
    await rm(tmp, { recursive: true, force: true });
    await cp(sourceDir, tmp, { recursive: true });
    await rm(dest, { recursive: true, force: true });
    // cp instead of rename so this works across filesystem boundaries too.
    await cp(tmp, dest, { recursive: true });
    await rm(tmp, { recursive: true, force: true });
  }

  async restore(workspaceId: string, targetDir: string): Promise<boolean> {
    if (!(await this.has(workspaceId))) {
      return false;
    }

    await mkdir(targetDir, { recursive: true });
    await cp(this.pathFor(workspaceId), targetDir, { recursive: true });

    return true;
  }

  async has(workspaceId: string): Promise<boolean> {
    // Validate the id up front so an unsafe id throws rather than being masked
    // as "no snapshot" by the not-found catch below.
    const dir = this.pathFor(workspaceId);

    try {
      const info = await stat(dir);

      return info.isDirectory();
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
    await rm(dest, { recursive: true, force: true });
    await cp(this.pathFor(sourceWorkspaceId), dest, { recursive: true });
  }

  async remove(workspaceId: string): Promise<void> {
    await rm(this.pathFor(workspaceId), { recursive: true, force: true });
  }
}
