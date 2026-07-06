/**
 * Decode the per-file blobs returned by `gitClone` into text entries suitable
 * for a boltArtifact import.
 *
 * Each entry in `data` is `{ data, encoding }` where:
 *   - `encoding === 'utf8'`  → `data` is already a UTF-8 string.
 *   - otherwise              → `data` is the raw bytes as a `Uint8Array`.
 *
 * A previous version of this code mapped every entry to a string (falling back
 * to `''`) and then ran `.filter((f) => f.content)`. That truthiness filter
 * silently dropped two legitimate kinds of file:
 *   1. Genuinely empty text files (an empty `__init__.py`, `.gitkeep`,
 *      placeholder files) whose decoded content is `''`.
 *   2. Files we never had text for at all.
 * Both vanished from the imported workspace, silently changing the project
 * structure.
 *
 * This helper instead returns `content: null` for entries it could not decode
 * to text (no data at all), and keeps every entry that produced a string —
 * including the empty string. Callers filter on `typeof content === 'string'`
 * so empty-but-real text files survive the import.
 */
import { isBinaryContent } from '~/utils/fileUtils';

export interface ClonedFileBlob {
  data: unknown;
  encoding?: string;
}

export interface DecodedClonedFile {
  path: string;
  content: string;
}

export function decodeClonedFiles(filePaths: string[], data: Record<string, ClonedFileBlob>): DecodedClonedFile[] {
  const textDecoder = new TextDecoder('utf-8');

  return filePaths
    .map((filePath) => {
      const entry = data[filePath];

      if (!entry) {
        return { path: filePath, content: null as string | null };
      }

      const { data: content, encoding } = entry;

      let decoded: string | null;

      if (encoding === 'utf8') {
        decoded = typeof content === 'string' ? content : null;
      } else if (content instanceof Uint8Array) {
        /*
         * Skip genuinely-binary blobs by content sniff (never by extension, so
         * .py/.go/.rs/.sql source is kept); decode the rest as UTF-8 text.
         */
        decoded = isBinaryContent(content) ? null : textDecoder.decode(content);
      } else if (typeof content === 'string') {
        // No declared encoding but the blob is already a string — keep it.
        decoded = content;
      } else {
        // Binary / undecodable blob we have no text for; skip it.
        decoded = null;
      }

      return { path: filePath, content: decoded };
    })
    .filter((f): f is DecodedClonedFile => typeof f.content === 'string');
}
