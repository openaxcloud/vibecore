// Only emit fixed fields. Runner-local evidence can contain synthetic filenames and file contents.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { appendFileSync, readFileSync } from 'node:fs';

const sha = process.env.GITHUB_SHA;
assert.match(sha, /^[0-9a-f]{40}$/);
const summary = { commit: sha, result: 'unverified' };
try {
  if (process.env.RECIPE_OUTCOME === 'success') {
    const evidence = JSON.parse(readFileSync('private-runtime-evidence/reimport.json', 'utf8'));
    assert.equal(evidence.commit, sha);
    assert.deepEqual(evidence.before, evidence.after);
    const hash = createHash('sha256');
    for (const field of ['podUid', 'pvcUid', 'pv']) {
      assert.equal(typeof evidence.before[field], 'string');
      assert.ok(evidence.before[field].length > 0);
      hash.update(evidence.before[field]).update('\0');
    }
    assert.equal(evidence.protected.length, 4);
    assert.match(evidence.removed, /^obsolete-[a-f0-9-]{36}\/stale\.ts$/);
    assert.ok(Number.isSafeInteger(evidence.comparedFiles) && evidence.comparedFiles >= 5);
    assert.ok(evidence.archived.includes('README.md'));
    Object.assign(summary, {
      result: 'passed',
      identitySha256: hash.digest('hex'),
      samePodPvcPv: true,
      volumeFilesCompared: evidence.comparedFiles,
      protectedFiles: evidence.protected.length,
      removedLeaves: 1,
      archiveEntriesCompared: evidence.archived.length,
    });
  }
} finally {
  const json = JSON.stringify(summary);
  assert.ok(Buffer.byteLength(json) <= 512);
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, '```json\n' + json + '\n```\n');
}
