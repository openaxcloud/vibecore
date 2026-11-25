import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const root = mkdtempSync(join(tmpdir(), 'vibecore-drill-'));
const path = (name: string) => join(root, name);
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const elapsed = (start: number) => Number((performance.now() - start).toFixed(3));

function append(id: number) {
  const key = `trace-${id}.bin`;
  const data = Buffer.from([0, id, 255]);
  const db = new DatabaseSync(path('live/traces.db'));
  try {
    db.exec('CREATE TABLE IF NOT EXISTS traces (id INTEGER PRIMARY KEY, key TEXT UNIQUE, digest TEXT)');
    writeFileSync(path('live/objects/' + key), data);
    db.prepare('INSERT INTO traces VALUES (?, ?, ?)').run(id, key, hash(data));
  } finally {
    db.close();
  }
}

function inspect(name: string) {
  const dir = path(name);
  const db = new DatabaseSync(join(dir, 'traces.db'), { readOnly: true });
  try {
    assert.equal(db.prepare('PRAGMA integrity_check').get()?.integrity_check, 'ok');
    const rows = db.prepare('SELECT id, key, digest FROM traces ORDER BY id').all();
    assert.deepEqual(readdirSync(join(dir, 'objects')).sort(), rows.map(row => row.key).sort());
    for (const row of rows) {
      assert.equal(hash(readFileSync(join(dir, 'objects', String(row.key)))), row.digest, 'object digest mismatch');
    }
    return rows;
  } finally {
    db.close();
  }
}

function activate(target: string) {
  symlinkSync(target, path('next'));
  renameSync(path('next'), path('active'));
}

try {
  mkdirSync(path('live/objects'), { recursive: true });
  activate('live');
  append(1);
  append(2);
  const checkpoint = inspect('active');
  const backupStart = performance.now();
  cpSync(path('live'), path('backup'), { recursive: true });
  assert.deepEqual(inspect('backup'), checkpoint);
  const backupMs = elapsed(backupStart);
  append(3);
  const before = inspect('active');
  assert.deepEqual(before.map(row => row.id), [1, 2, 3]);

  cpSync(path('backup'), path('damaged'), { recursive: true });
  writeFileSync(path('damaged/objects/trace-2.bin'), Buffer.from([0]));
  assert.throws(() => inspect('damaged'), /object digest mismatch/);
  assert.deepEqual(inspect('active'), before);

  const restoreStart = performance.now();
  cpSync(path('backup'), path('candidate'), { recursive: true });
  assert.deepEqual(inspect('candidate'), checkpoint);
  activate('candidate');
  const restored = inspect('active');
  assert.deepEqual(restored.map(row => row.id), [1, 2]);
  assert.deepEqual(restored, checkpoint);
  const restoreMs = elapsed(restoreStart);

  const rollbackStart = performance.now();
  activate('live');
  assert.deepEqual(inspect('active'), before);
  console.log(JSON.stringify({
    scope: 'synthetic SQLite and filesystem', node: process.version,
    backupMs, restoreMs, rollbackMs: elapsed(rollbackStart),
    restored, excludedAfterCheckpoint: 3, rollbackIds: before.map(row => row.id),
    damagedObjectRejected: true,
  }, null, 2));
} finally {
  rmSync(root, { recursive: true, force: true });
}
