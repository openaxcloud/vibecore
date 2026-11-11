import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, it } from 'vitest';

const action = readFileSync(new URL('../../.github/actions/preparer-pile-e2e/action.yml', import.meta.url), 'utf8');
const workflow = readFileSync(new URL('../../.github/workflows/e2e.yml', import.meta.url), 'utf8');
const branch = 'test/ephemeral-runtime-kubernetes-20261108';
const match = action.match(
  /  - name: Validate AI provider secret for E2E\n    shell: bash\n    run: \|\n([\s\S]*?)\n  - name: Start local dependencies/,
);
assert.ok(match, 'The test must execute the real preflight shell from the shared action.');
const preflight = match[1]
  .split('\n')
  .map((line) => line.replace(/^      /, ''))
  .join('\n');

function run(event: string, head: string, ref: string, key = '') {
  return spawnSync('bash', ['--noprofile', '--norc', '-e', '-o', 'pipefail', '-c', preflight + '\necho STACK_CAN_START'], {
    encoding: 'utf8',
    timeout: 5_000,
    // Never inherit developer credentials or shell startup configuration.
    env: {
      PATH: '/usr/bin:/bin',
      GITHUB_EVENT_NAME: event,
      GITHUB_HEAD_REF: head,
      GITHUB_REF: ref,
      ANTHROPIC_API_KEY: key,
    },
  });
}

describe('paid AI preflight stays strict outside the isolated runtime branch', () => {
  for (const [event, head, ref] of [
    ['pull_request', branch, 'refs/pull/893/merge'],
    ['push', '', 'refs/heads/' + branch],
    ['workflow_dispatch', '', 'refs/heads/' + branch],
  ]) {
    it('starts the exact disposable branch without a key on ' + event, () => {
      const result = run(event, head, ref);
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /AI tests and the E2E gate remain unchanged/);
      assert.match(result.stdout, /STACK_CAN_START/);
    });
  }

  for (const [event, head, ref] of [
    ['push', '', 'refs/heads/main'],
    ['workflow_dispatch', '', 'refs/heads/main'],
    ['pull_request', 'main', 'refs/pull/893/merge'],
    ['pull_request', branch + '-other', 'refs/pull/893/merge'],
    ['push', '', 'refs/heads/' + branch + '-other'],
    ['workflow_dispatch', '', 'refs/tags/' + branch],
    ['pull_request', '', 'refs/heads/' + branch],
    ['push', branch, 'refs/heads/main'],
    ['workflow_dispatch', branch, 'refs/heads/main'],
    ['pull_request_target', branch, 'refs/heads/main'],
    ['schedule', branch, 'refs/heads/' + branch],
    ['', '', ''],
  ]) {
    it('rejects a missing key for ' + JSON.stringify([event, head, ref]), () => {
      const result = run(event, head, ref);
      assert.equal(result.status, 1, result.stderr);
      assert.match(result.stdout, /Production E2E requires ANTHROPIC_API_KEY/);
      assert.doesNotMatch(result.stdout, /STACK_CAN_START/);
    });
  }

  it('preserves the existing present-key behavior outside the disposable branch', () => {
    // Presence check only: this inert string is never sent to any provider.
    const result = run('push', '', 'refs/heads/main', 'local-presence-check-only');
    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(result.stdout, /Disposable runtime branch/);
    assert.match(result.stdout, /STACK_CAN_START/);
  });

  it('still blanks every paid provider key in both workflow jobs', () => {
    for (const provider of ['ANTHROPIC', 'OPENAI', 'OPENROUTER', 'GOOGLE']) {
      const expression =
        provider +
        "_API_KEY: ${{ github.head_ref != '" +
        branch +
        "' && github.ref_name != '" +
        branch +
        "' && secrets." +
        provider +
        "_API_KEY || '' }}";
      assert.equal(workflow.split(expression).length - 1, 2, provider + ' must be isolated in both jobs');
    }
  });

  it('retains all current browser selection and the required four-report gate', () => {
    assert.ok(workflow.includes('pnpm exec playwright test "$CIBLE" --project=chromium $DECOUPE'));
    assert.ok(workflow.includes('--grep-invert @runtime --reporter=list,json --output=test-results-tranche'));
    assert.ok(workflow.includes('pnpm exec playwright test tests/e2e --project=webkit-iphone --reporter=list'));
    assert.ok(workflow.includes("E2E_EXPECTED_REPORTS: '4'"));
    assert.ok(workflow.includes('name: Playwright local stack'));
    assert.ok(workflow.includes("run: node scripts/e2e-gate.mjs $(find tranches -name 'playwright-results.json'"));
    assert.doesNotMatch(preflight, /continue-on-error|test\.skip|exit 0/);
  });
});
