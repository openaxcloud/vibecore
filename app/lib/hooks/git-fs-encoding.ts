/**
 * Lossless encoding for the runtime-backed isomorphic-git filesystem write path.
 *
 * isomorphic-git checks out working-tree files by calling fs.writeFile with
 * either a utf8 string (text blobs) or a raw Uint8Array (binary blobs: images,
 * fonts, .pdf, packfiles, anything with non-utf8 bytes). The RuntimeAdapter
 * contract only accepts a string, so binary data has to be carried as a string.
 *
 * The previous implementation used `new TextDecoder().decode(data)`, which is
 * lossy: TextDecoder (non-fatal by default) replaces every invalid or truncated
 * multi-byte sequence with U+FFFD before the bytes are ever persisted, so any
 * cloned binary asset landed in the workspace corrupted. This is the write-side
 * twin of the read-side base64 corruption fixed across ws-agent/api/runtime.
 *
 * `latin1` (a.k.a. `binary`) maps every one of the 256 possible byte values to
 * the code point of the same numeric value (0x00..0xFF) and back with no
 * substitution, so the byte identity survives the string round-trip — unlike
 * TextDecoder, which discards it irrecoverably. Text strings are returned
 * unchanged so the utf8 path is byte-for-byte identical to before.
 */
export function encodeGitWriteContent(data: unknown): string {
  if (data instanceof Uint8Array) {
    return Buffer.from(data).toString('latin1');
  }

  if (typeof data === 'string') {
    return data;
  }

  return String(data);
}
