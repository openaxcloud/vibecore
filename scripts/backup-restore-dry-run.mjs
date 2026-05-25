#!/usr/bin/env node
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, normalize, relative } from 'node:path';
import { tmpdir } from 'node:os';
import JSZip from 'jszip';

const args = new Set(process.argv.slice(2));
const strict = args.has('--strict') || process.env.VALIDATE_PRODUCTION === '1' || process.env.NODE_ENV === 'production';
const keep = args.has('--keep');

const explicitBackupDir = process.argv
  .find((arg) => arg.startsWith('--backup-dir='))
  ?.slice('--backup-dir='.length);

const tempRoot = explicitBackupDir ?? (await mkdtemp(join(tmpdir(), 'vibecore-backup-restore-dry-run-')));
const sourceProjectId = `source-${randomUUID()}`;
const restoredProjectId = `restored-${randomUUID()}`;
const sourceRoot = join(tempRoot, 'source-storage', sourceProjectId);
const restoredRoot = join(tempRoot, 'restored-storage', restoredProjectId);
const backupPath = join(tempRoot, 'project-backup.vcbak');

try {
  const encryptionKey = resolveBackupEncryptionKey();

  await writeProjectFixture(sourceRoot);

  const sourceFiles = await listTextFiles(sourceRoot);
  const sourceManifest = buildManifest({ projectId: sourceProjectId, files: sourceFiles });
  const archive = await createProjectArchive(sourceManifest, sourceFiles);
  const encryptedBackup = encryptBackup(archive, encryptionKey.key);

  await mkdir(dirname(backupPath), { recursive: true });
  await writeFile(backupPath, JSON.stringify(encryptedBackup, null, 2), 'utf8');

  const persistedBackup = JSON.parse(await readFile(backupPath, 'utf8'));
  const decryptedArchive = decryptBackup(persistedBackup, encryptionKey.key);
  const restoreResult = await restoreProjectArchive(decryptedArchive, restoredRoot);
  const restoredFiles = await listTextFiles(restoredRoot);
  const restoredManifest = buildManifest({ projectId: sourceProjectId, files: restoredFiles });

  if (sourceManifest.manifestHash !== restoredManifest.manifestHash) {
    throw new Error(
      `Restored manifest mismatch: expected ${sourceManifest.manifestHash}, got ${restoredManifest.manifestHash}`,
    );
  }

  const tamperRejected = await verifyTamperDetection(encryptedBackup, encryptionKey.key);

  console.log(
    JSON.stringify({
      ok: true,
      archiveFormat: 'vibecore.project-backup.v1',
      algorithm: encryptedBackup.algorithm,
      keySource: encryptionKey.source,
      restoredFiles: restoreResult.restoredFiles,
      sourceManifestHash: sourceManifest.manifestHash,
      restoredManifestHash: restoredManifest.manifestHash,
      encryptedBytes: Buffer.byteLength(encryptedBackup.ciphertext, 'base64'),
      tamperRejected,
      retainedPath: keep ? backupPath : undefined,
    }),
  );
} finally {
  if (!keep && !explicitBackupDir) {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

function resolveBackupEncryptionKey() {
  const configuredSecret = process.env.BACKUP_ENCRYPTION_KEY?.trim();

  if (strict && !configuredSecret) {
    throw new Error('BACKUP_ENCRYPTION_KEY is required for strict backup restore validation');
  }

  const source = configuredSecret ? 'BACKUP_ENCRYPTION_KEY' : 'ephemeral-local-dry-run-key';
  const secret = configuredSecret ?? randomBytes(32).toString('hex');

  return { key: createHash('sha256').update(secret).digest(), source };
}

async function writeProjectFixture(root) {
  const files = [
    ['README.md', '# VibeCore backup restore dry run\n\nThis file validates project storage restore.\n'],
    ['src/index.ts', 'export const restored = true;\n'],
    ['src/config/runtime.json', JSON.stringify({ runtime: 'remote-kubernetes', preview: true }, null, 2) + '\n'],
    ['docs/runbook.md', 'Restore requires manifest hash equality before traffic is re-enabled.\n'],
  ];

  for (const [path, content] of files) {
    const target = safeJoin(root, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content, 'utf8');
  }
}

async function listTextFiles(root, current = '') {
  const dir = join(root, current);
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const child = current ? `${current}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      files.push(...(await listTextFiles(root, child)));
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const fullPath = safeJoin(root, child);
    const metadata = await stat(fullPath);
    const content = await readFile(fullPath, 'utf8');
    files.push({ path: child, content, byteLength: Buffer.byteLength(content), updatedAt: metadata.mtime.toISOString() });
  }

  return files.sort((a, b) => a.path.localeCompare(b.path));
}

function buildManifest({ projectId, files }) {
  const entries = files.map((file) => ({
    path: normalizeArchivePath(file.path),
    byteLength: Buffer.byteLength(file.content),
    sha256: sha256(Buffer.from(file.content, 'utf8')),
  }));

  const canonical = entries.map((file) => `${file.path}\0${file.byteLength}\0${file.sha256}`).join('\n');

  return {
    schemaVersion: 1,
    projectId,
    createdAt: new Date().toISOString(),
    fileCount: entries.length,
    files: entries,
    manifestHash: sha256(Buffer.from(canonical, 'utf8')),
  };
}

async function createProjectArchive(manifest, files) {
  const zip = new JSZip();
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));

  for (const file of files) {
    zip.file(`files/${normalizeArchivePath(file.path)}`, file.content);
  }

  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 } });
}

async function restoreProjectArchive(archive, targetRoot) {
  const zip = await JSZip.loadAsync(archive);
  const manifestEntry = zip.file('manifest.json');

  if (!manifestEntry) {
    throw new Error('Backup archive is missing manifest.json');
  }

  const manifest = JSON.parse(await manifestEntry.async('string'));
  validateManifest(manifest);

  const restored = [];

  for (const expected of manifest.files) {
    const path = normalizeArchivePath(expected.path);
    const entry = zip.file(`files/${path}`);

    if (!entry) {
      throw new Error(`Backup archive is missing ${path}`);
    }

    const content = await entry.async('string');
    const actualHash = sha256(Buffer.from(content, 'utf8'));

    if (actualHash !== expected.sha256) {
      throw new Error(`Backup archive hash mismatch for ${path}`);
    }

    const target = safeJoin(targetRoot, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content, 'utf8');
    restored.push(path);
  }

  return { restoredFiles: restored.length };
}

function validateManifest(manifest) {
  if (!manifest || manifest.schemaVersion !== 1 || !Array.isArray(manifest.files)) {
    throw new Error('Backup manifest has an unsupported format');
  }

  if (manifest.fileCount !== manifest.files.length) {
    throw new Error('Backup manifest file count does not match file list');
  }

  const canonical = manifest.files
    .map((file) => `${normalizeArchivePath(file.path)}\0${Number(file.byteLength)}\0${String(file.sha256)}`)
    .join('\n');

  if (sha256(Buffer.from(canonical, 'utf8')) !== manifest.manifestHash) {
    throw new Error(`Backup manifest hash mismatch for ${manifest.projectId ?? '<unknown>'}`);
  }

  for (const file of manifest.files) {
    normalizeArchivePath(file.path);

    if (!/^[a-f0-9]{64}$/.test(String(file.sha256))) {
      throw new Error(`Backup manifest has an invalid sha256 for ${file.path}`);
    }

    if (!Number.isSafeInteger(file.byteLength) || file.byteLength < 0) {
      throw new Error(`Backup manifest has an invalid byte length for ${file.path}`);
    }
  }

  return manifest;
}

function encryptBackup(archive, key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(archive), cipher.final()]);

  return {
    schemaVersion: 1,
    algorithm: 'aes-256-gcm',
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64'),
    createdAt: new Date().toISOString(),
  };
}

function decryptBackup(envelope, key) {
  if (envelope?.schemaVersion !== 1 || envelope.algorithm !== 'aes-256-gcm') {
    throw new Error('Unsupported backup envelope');
  }

  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(envelope.authTag, 'base64'));

  return Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, 'base64')), decipher.final()]);
}

async function verifyTamperDetection(envelope, key) {
  const tamperedCiphertext = Buffer.from(envelope.ciphertext, 'base64');
  tamperedCiphertext[0] = tamperedCiphertext[0] ^ 1;

  try {
    decryptBackup({ ...envelope, ciphertext: tamperedCiphertext.toString('base64') }, key);
    return false;
  } catch {
    return true;
  }
}

function safeJoin(root, filePath) {
  const target = normalize(join(root, normalizeArchivePath(filePath)));
  const relativePath = relative(root, target);

  if (relativePath === '' || relativePath.startsWith('..') || relativePath.includes('..')) {
    throw new Error(`Unsafe path in backup archive: ${filePath}`);
  }

  return target;
}

function normalizeArchivePath(filePath) {
  const normalized = normalize(String(filePath)).replaceAll('\\', '/');

  if (!normalized || normalized.startsWith('/') || normalized === '.' || normalized.startsWith('../') || normalized.includes('/../')) {
    throw new Error(`Unsafe path in backup archive: ${filePath}`);
  }

  return normalized;
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}
