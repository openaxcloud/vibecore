/**
 * Pure decision helpers for server-side runtime reseed reconciliation.
 *
 * The client (ProjectWorkspaceProvider) seeds a freshly-provisioned pod from the
 * persisted project files, but the runtime pod can diverge from the persisted
 * ide-state in two ways the client never repairs from a background op:
 *
 *   1. A pod reached OUTSIDE a live IDE session is never client-seeded: the remote
 *      adapter re-provisions a GC'd/reaped pod on the first agent 502 to serve a
 *      background terminal / file / preview op, and the new pod comes up EMPTY.
 *   2. Even a warm pod can be MISSING a specific persisted file (observed live: the
 *      runtime carried src/, index.html, configs but NOT package.json, while the
 *      persisted ide-state had all of them) → `npm run dev` → ENOENT package.json,
 *      `sh: vite: not found`, blank Preview.
 *
 * The API reconciles both at start/restart by ADDING every persisted file that is
 * absent from the runtime tree. These helpers keep that diff pure and unit-testable,
 * independent of the Fastify app wiring.
 */

/** A single node from the workspace-agent `/files/tree` listing (recursive). */
export interface RuntimeTreeNode {
  path: string;
  type?: 'file' | 'directory';
  children?: unknown;
}

/** Strip a leading `./` or `/` so runtime and persisted paths compare equal. */
export function normalizeRuntimePath(path: string): string {
  return path.replace(/^\.\//, '').replace(/^\/+/, '');
}

/**
 * Recursively flatten a workspace-agent `/files/tree` listing to the set of FILE
 * paths it contains (directories are walked, not recorded). Each node's `path` is
 * already the full path relative to the workspace root. Defensive against a
 * malformed / non-array response (yields an empty set → every persisted file counts
 * as missing, so the reconcile still restores a genuinely empty/broken pod).
 */
export function flattenRuntimeTreeFilePaths(tree: unknown): Set<string> {
  const out = new Set<string>();

  const walk = (nodes: unknown): void => {
    if (!Array.isArray(nodes)) {
      return;
    }

    for (const node of nodes) {
      const n = node as RuntimeTreeNode;

      if (typeof n?.path !== 'string' || n.path.length === 0) {
        continue;
      }

      if (n.type === 'directory') {
        walk(n.children);
      } else {
        out.add(normalizeRuntimePath(n.path));
      }
    }
  };

  walk(tree);

  return out;
}

/**
 * Given the runtime's current `/files/tree` and the authoritative persisted files,
 * return the persisted paths that are ABSENT from the runtime and must be restored.
 * Purely additive: a runtime file that already exists (possibly a newer edit) is
 * never overwritten, and a runtime-only file is left untouched — so a stale persisted
 * snapshot can only ever ADD a missing file, never clobber live runtime state.
 */
export function runtimeFilesMissingFromPersisted(tree: unknown, persistedPaths: readonly string[]): string[] {
  const present = flattenRuntimeTreeFilePaths(tree);

  return persistedPaths.filter((path) => {
    const normalized = normalizeRuntimePath(path);

    return normalized.length > 0 && !present.has(normalized);
  });
}

/** A file body as either the persisted ProjectFile or the agent `/files/read` reply. */
export interface EncodedFileBody {
  content: string;
  encoding?: string;
}

/**
 * Byte-exact equality between a persisted file body and the runtime's `/files/read`
 * reply, normalising each side's declared encoding (utf8 default, or base64 for
 * binary) to raw bytes before comparing. Used to detect CONTENT divergence — the
 * failure mode observed live where the runtime's package.json was a 200-byte stub
 * (name/scripts only) while the persisted ide-state carried the full dependency set,
 * so `npm install` found nothing to install and `vite` was never present.
 */
export function persistedFileContentMatches(persisted: EncodedFileBody, runtime: EncodedFileBody): boolean {
  const toBuffer = (body: EncodedFileBody) => Buffer.from(body.content, body.encoding === 'base64' ? 'base64' : 'utf8');

  return toBuffer(persisted).equals(toBuffer(runtime));
}
