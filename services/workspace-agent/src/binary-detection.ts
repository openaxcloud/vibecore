/**
 * Git-style binary detection: a buffer is treated as binary if a NUL byte
 * appears in its first ~8KB. This is the same heuristic git uses to decide
 * whether a blob is binary, and it is intentionally cheap and conservative —
 * legitimate UTF-8 text (including multi-byte sequences) never contains a NUL
 * byte, while images/fonts/wasm/compiled artifacts reliably do.
 */
const BINARY_SNIFF_BYTES = 8 * 1024;

export function isBinaryBuffer(buffer: Buffer): boolean {
  const limit = Math.min(buffer.length, BINARY_SNIFF_BYTES);

  for (let index = 0; index < limit; index += 1) {
    if (buffer[index] === 0) {
      return true;
    }
  }

  return false;
}
