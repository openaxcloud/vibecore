/**
 * Helpers for safely copying file content during rename/duplicate in the file
 * tree.
 *
 * In remote-kubernetes mode the file tree is loaded with content stripped
 * (FilesStore#mapRuntimeNodes sets `content: node.content ?? ''`), so any file
 * the user has not individually opened sits in the store with `content === ''`
 * even though it has real bytes on disk. Rename/duplicate create a copy from the
 * store entry and then (for rename) delete the original — so copying the empty
 * placeholder writes an EMPTY file and the delete destroys the only real copy:
 * permanent data loss. These helpers hydrate the true on-disk content from the
 * runtime before the copy, mirroring how Search's Replace All hydrates.
 */

export interface CopyEntry {
  content: string;
  isBinary?: boolean;
}

export interface RuntimeReadResult {
  content: string;
  encoding?: 'utf8' | 'base64';
}

/**
 * Whether a store entry's content can be trusted as the file's real content.
 * An empty string is indistinguishable from a genuinely-empty file but is also
 * exactly what the stripped-tree placeholder looks like, so we treat empty
 * content as "needs hydration" and let the caller read the true bytes from the
 * runtime before copying. A non-empty string (or a binary entry that already
 * carries its base64 payload) is trusted as-is.
 */
export function copyContentNeedsHydration(entry: CopyEntry): boolean {
  return entry.content.length === 0;
}

/**
 * Decode a base64 string into bytes without a Buffer dependency (browser-safe).
 */
export function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

/**
 * Convert a runtime `readFile` result into the value `WorkbenchStore.createFile`
 * expects: a `Uint8Array` for binary files (so createFile re-encodes + writes
 * the bytes losslessly) or the raw string for text. Mirrors `contentForCopy`'s
 * binary handling but sources the binary flag from the runtime `encoding` so a
 * freshly-hydrated, never-opened binary file is still copied as bytes.
 */
export function runtimeReadToCopyContent(result: RuntimeReadResult): string | Uint8Array {
  return result.encoding === 'base64' ? base64ToUint8Array(result.content) : result.content;
}

/**
 * Resolve the content to hand to `createFile` for a rename/duplicate.
 *
 * If the store entry already carries real content it is used directly (binary
 * entries are decoded from base64 back to bytes). If the entry's content is the
 * stripped empty placeholder, `readFile` is invoked to hydrate the true on-disk
 * content first. Throws if hydration fails so the caller can abort the copy
 * (and, critically, NOT delete the original on rename) instead of silently
 * writing an empty file.
 */
export async function resolveCopyContent(
  entry: CopyEntry,
  readFile: () => Promise<RuntimeReadResult>,
): Promise<string | Uint8Array> {
  if (!copyContentNeedsHydration(entry)) {
    return entry.isBinary ? base64ToUint8Array(entry.content) : entry.content;
  }

  const result = await readFile();

  return runtimeReadToCopyContent(result);
}
