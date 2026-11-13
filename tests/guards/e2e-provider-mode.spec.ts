import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const action = parse(readFileSync('.github/actions/preparer-pile-e2e/action.yml', 'utf8'));
const workflow = parse(readFileSync('.github/workflows/e2e.yml', 'utf8'));

const validation = action.runs.steps.find(
  (step: { name?: string }) => step.name === 'Validate AI provider mode for E2E',
);

const keys = ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'OPENROUTER_API_KEY', 'GOOGLE_API_KEY'];

function validate(mode: string, credentials: Record<string, string> = {}) {
  return spawnSync('bash', ['-c', validation.run], {
    env: { PATH: process.env.PATH, E2E_PROVIDER_MODE: mode, ...credentials },
    encoding: 'utf8',
  });
}

describe('E2E provider mode is explicit, fail closed and credential-free', () => {
  it('retains required as the default for every unchanged caller', () => {
    expect(action.inputs['provider-mode'].default).toBe('required');
    expect(validation.env.E2E_PROVIDER_MODE).toBe('${{ inputs.provider-mode }}');
    expect(validate('required').status).not.toBe(0);
    expect(validate('required', { ANTHROPIC_API_KEY: 'test-only-not-a-real-key' }).status).toBe(0);
  });

  it('allows absent only when all four provider credentials are absent', () => {
    expect(validate('absent').status).toBe(0);
    expect(validate('absent').stdout).toContain('no live AI generation or moderation proof');
  });

  it.each(keys)('rejects %s without printing its value', (key) => {
    const result = validate('absent', { [key]: 'secret-sentinel-not-a-real-key' });
    expect(result.status).not.toBe(0);
    expect(result.stdout).toContain(key);
    expect(result.stdout + result.stderr).not.toContain('secret-sentinel-not-a-real-key');
  });

  it.each(['', 'optional', 'ABSENT', 'required; echo bypass'])('rejects invalid mode %s', (mode) => {
    expect(validate(mode).status).not.toBe(0);
  });

  it.each(['e2e', 'canari-ios'])('%s selects absent and does not inject provider credentials', (name) => {
    const job = workflow.jobs[name];
    const setup = job.steps.find((step: { uses?: string }) => step.uses === './.github/actions/preparer-pile-e2e');
    expect(setup.with['provider-mode']).toBe('absent');

    for (const key of keys) {
      expect(job.env).not.toHaveProperty(key);
      expect(JSON.stringify(job)).not.toContain('secrets.' + key);
    }
  });

  it('keeps all four shards and the unchanged fail-closed verdict', () => {
    expect(workflow.jobs.e2e.strategy.matrix.shard).toEqual([1, 2, 3, 4]);
    expect(workflow.jobs.verdict.needs).toEqual(['perimetre', 'e2e']);

    const gate = workflow.jobs.verdict.steps.find(
      (step: { name?: string }) => step.name === 'E2E gate (no failure waivers)',
    );
    expect(gate.env.E2E_EXPECTED_REPORTS).toBe('4');
    expect(gate.run).toContain('node scripts/e2e-gate.mjs');
  });
});
