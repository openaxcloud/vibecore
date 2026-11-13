import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import JSZip from 'jszip';

export async function verifyArchiveBytes(
  object: { contentBase64: string; byteLength: number; contentHash: string },
  path: string,
  expectedHash: string,
) {
  const bytes = Buffer.from(object.contentBase64, 'base64');
  const archiveHash = createHash('sha256').update(bytes).digest('hex');
  assert.equal(archiveHash, object.contentHash, 'Stored archive checksum mismatch');
  assert.equal(bytes.length, object.byteLength);

  const zip = await JSZip.loadAsync(bytes);
  const file = zip.file(path);
  assert.ok(file, 'Runtime-written proof file is missing from the stored project archive');

  const fileHash = createHash('sha256')
    .update(await file.async('nodebuffer'))
    .digest('hex');
  assert.equal(fileHash, expectedHash, 'Project archive does not contain the runtime-written bytes');

  return { check: 'postgres-project-archive-readback', archiveHash, fileHash, byteLength: bytes.length };
}
