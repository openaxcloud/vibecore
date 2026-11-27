// The receipt is written only after the anonymous browser verifies both responses.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const dir = 'private-runtime-evidence';
const receipt = path.join(dir, 'dynamic-publication.json');
const status = path.join(dir, 'dynamic-publication-status.json');
const commit = process.env.GITHUB_SHA;
function record(state, code) {
  fs.writeFileSync(status + '.tmp', JSON.stringify({ commit, state, code }));
  fs.renameSync(status + '.tmp', status);
}
if (!/^[a-f0-9]{40}$/.test(commit ?? '')) throw Error('Missing recipe commit');
if (process.argv[2] === 'init') {
  fs.mkdirSync(dir, { recursive: true });
  fs.rmSync(receipt, { force: true });
  record('not_started', null);
} else if (process.argv[2] === 'run') {
  fs.rmSync(receipt, { force: true });
  record('running', null);
  const result = spawnSync(
    'timeout',
    [
      '--kill-after=5s',
      '330s',
      'pnpm',
      'exec',
      'playwright',
      'test',
      '--config=tests/private-runtime-dynamic/playwright.config.ts',
    ],
    { stdio: 'inherit' },
  );
  let code = result.status ?? 1;
  let state = [124, 137].includes(code) ? 'timeout_or_killed' : 'failed';
  if (code === 0) {
    let proof;
    try {
      proof = JSON.parse(fs.readFileSync(receipt, 'utf8'));
    } catch {}
    if (
      proof?.commit === commit &&
      proof.savedVersion === true &&
      proof.podEndpointReady === true &&
      proof.anonymousResponses === 2 &&
      proof.httpStatus === 200 &&
      proof.exactCalculation === true &&
      proof.network === 'local'
    ) {
      state = 'passed';
    } else {
      state = 'missing_or_invalid_proof';
      code = 1;
    }
  }
  if (code !== 0) fs.rmSync(receipt, { force: true });
  record(state, code);
  process.exitCode = code;
} else {
  throw Error('Expected init or run');
}
