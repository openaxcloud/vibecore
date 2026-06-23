/**
 * Pure helpers for WorkbenchStore.syncFiles ("Sync files to folder" /
 * showDirectoryPicker export). Kept side-effect free so the binary-vs-text
 * decoding can be unit-tested without the File System Access API.
 */

export interface SyncableDirent {
  type: string;
  content: string;
  isBinary?: boolean;
}

/**
 * Decode a base64 string into bytes without a Buffer dependency (browser-safe),
 * falling back to Buffer in non-browser (SSR/test) contexts where `atob` is
 * absent. Mirrors FileTree's base64ToUint8Array reader.
 */
export function base64ToUint8Array(base64: string): Uint8Array {
  const binary = typeof atob === 'function' ? atob(base64) : Buffer.from(base64, 'base64').toString('binary');
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

/**
 * Resolve the payload to hand to `FileSystemWritableFileStream.write` for a
 * dirent. Binary files are stored base64-encoded, so they must be decoded into a
 * Uint8Array before writing — otherwise the literal base64 text would be written
 * (or, with the old `!isBinary` filter, the file was dropped entirely and the
 * caller still reported success). Text files write their string content as-is.
 */
export function syncWriteContent(dirent: SyncableDirent): string | Uint8Array {
  return dirent.isBinary ? base64ToUint8Array(dirent.content) : dirent.content;
}
