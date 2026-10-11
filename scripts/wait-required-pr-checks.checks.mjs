import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { REQUIRED_PR_CHECKS, requiredCheckState, waitRequiredPrChecks } from './wait-required-pr-checks.mjs';

const successful = () => REQUIRED_PR_CHECKS.map((name, id) => ({ name, id, status: 'completed', conclusion: 'success' }));

test('waits for check registration, running CI and both CodeQL matrix jobs', async () => {
  const snapshots = [[], [successful()[0]], successful().map((check) => ({ ...check, status: 'in_progress', conclusion: null })), successful()];
  let polls = 0;
  let elapsed = 0;
  await waitRequiredPrChecks({ listChecks: async () => snapshots[polls++], now: () => elapsed, sleep: async (ms) => { elapsed += ms; }, timeoutMs: 100, intervalMs: 10 });
  assert.equal(polls, 4);
  assert.equal(elapsed, 30);
});

test('fails closed when a required check never registers', async () => {
  let elapsed = 0;
  await assert.rejects(waitRequiredPrChecks({ listChecks: async () => [], now: () => elapsed, sleep: async (ms) => { elapsed += ms; }, timeoutMs: 25, intervalMs: 10 }), /Timed out.*Install, test, build, scan/);
  assert.equal(elapsed, 25);
});

test('rejects failed, cancelled, skipped and missing conclusions', async () => {
  for (const conclusion of ['failure', 'cancelled', 'skipped', null]) {
    const checks = successful();
    checks[1].conclusion = conclusion;
    await assert.rejects(waitRequiredPrChecks({ listChecks: async () => checks }), /Required checks failed: CodeQL Analysis \(javascript\)/);
  }
});

test('uses the newest attempt and ignores unrelated optional checks', () => {
  const checks = successful();
  checks.push({ ...checks[0], id: 10, status: 'in_progress', conclusion: null });
  checks.push({ name: 'Quality Analysis', id: 20, status: 'completed', conclusion: 'failure' });
  assert.deepEqual(requiredCheckState(checks), { failed: [], pending: [REQUIRED_PR_CHECKS[0]] });
  checks.push({ ...checks[0], id: 30 });
  assert.deepEqual(requiredCheckState(checks), { failed: [], pending: [] });
});

test('propagates API errors without treating missing data as success', async () => {
  await assert.rejects(waitRequiredPrChecks({ listChecks: async () => { throw new Error('API unavailable'); } }), /API unavailable/);
});

test('the mandatory workflow actually calls the gate on the PR head without ignoring errors', () => {
  const workflow = readFileSync(new URL('../.github/workflows/pr-release-validation.yaml', import.meta.url), 'utf8');
  const qualityGate = workflow.split('  validate-release:')[0];
  assert.match(qualityGate, /await waitRequiredPrChecks\(/);
  assert.match(qualityGate, /ref: context\.payload\.pull_request\.head\.sha/);
  assert.match(qualityGate, /github\.paginate\(github\.rest\.checks\.listForRef/);
  assert.match(qualityGate, /timeout-minutes: 65/);
  assert.doesNotMatch(qualityGate, /continue-on-error:\s*true/);
  assert.match(qualityGate, /node --test scripts\/wait-required-pr-checks\.checks\.mjs/);
  assert.doesNotMatch(qualityGate, /\bimport\s*\(|\brequire\s*\(/);
  assert.doesNotMatch(workflow, /(?:checks|pull-requests):\s*write/);
  const inline = qualityGate.split('          script: |\n')[1].split('            await waitRequiredPrChecks({')[0];
  const module = readFileSync(new URL('./wait-required-pr-checks.mjs', import.meta.url), 'utf8');
  const normalize = (source) => source.replace(/^\s*\/\/.*$/gm, '').replace(/\bexport\s+/g, '').replace(/\s+/g, ' ').trim();
  assert.equal(normalize(inline), normalize(module), 'CI enforcement must match the behavior tested here');
});
