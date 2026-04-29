#!/usr/bin/env node
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const dir = await mkdtemp(join(tmpdir(), 'vibecore-backup-dry-run-'));

try {
  const source = join(dir, 'project-snapshot.json');
  const restored = join(dir, 'restored-project-snapshot.json');
  const payload = {
    projectId: 'dry-run-project',
    createdAt: new Date().toISOString(),
    files: [
      { path: 'README.md', content: '# VibeCore restore dry run\n' },
      { path: 'src/index.ts', content: 'export const restored = true;\n' },
    ],
  };

  await writeFile(source, JSON.stringify(payload), 'utf8');
  const checksum = sha256(await readFile(source));
  await writeFile(restored, await readFile(source));
  const restoredChecksum = sha256(await readFile(restored));

  if (checksum !== restoredChecksum) {
    throw new Error('Dry-run restore checksum mismatch');
  }

  console.log(JSON.stringify({ ok: true, checksum, restoredFiles: payload.files.length }));
} finally {
  await rm(dir, { recursive: true, force: true });
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}
