import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const workflow = parse(readFileSync('.github/workflows/e2e-runtime.yml', 'utf8'));
const job = workflow.jobs['e2e-runtime'];
const steps = job.steps as Array<{ name?: string; id?: string; run?: string; if?: string }>;

describe('runtime CI verdict must reflect actual coverage', () => {
  it('does not turn failed runtime assertions into a successful workflow', () => {
    expect(job['continue-on-error']).toBeUndefined();
    expect(steps.find((step) => step.id === 'runtime-suite')?.run).toBe(
      'pnpm exec playwright test tests/e2e --project=chromium --grep @runtime --retries=0 --max-failures=0',
    );
  });
  it('still attempts the real IDE audit after a failed runtime suite', () => {
    const audit = steps.find((step) => step.name === 'IDE panel live audit');
    expect(audit?.if).toBe(
      "${{ !cancelled() && (steps.runtime-suite.outcome == 'success' || steps.runtime-suite.outcome == 'failure') }}",
    );
    expect(audit?.run).toContain('pnpm run ide:panel-audit');
    expect(audit?.run).toContain('pnpm run ide:panel-audit:validate');
  });
  it('does not expose paid provider credentials to nightly tests', () => {
    for (const key of ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'OPENROUTER_API_KEY', 'GOOGLE_API_KEY']) {
      expect(job.env[key]).toBeUndefined();
    }
  });
});

describe('ephemeral real runtime boundaries', () => {
  it('keeps the test run read-only toward GitHub and never obtains cloud credentials', () => {
    expect(workflow.permissions).toEqual({ contents: 'read' });

    const source = readFileSync('.github/workflows/e2e-runtime.yml', 'utf8');
    expect(source).not.toMatch(/secrets\.|id-token:|google-github-actions|environment: (production|staging)/);
    expect(source).not.toContain('WORKSPACE_DISABLE_SANDBOX_SCHEDULING');
    expect(source).toContain('bash scripts/ci/probe-runtime-gvisor.sh');
    expect(source).toContain('retention-days: 1');
  });
  it('preserves all original runtime scenarios without short-circuiting failures', () => {
    const runtime = steps.find((step) => step.id === 'runtime-suite');
    expect(runtime?.run).toContain('--grep @runtime');
    expect(runtime?.run).toContain('--max-failures=0');
    expect(runtime?.run).toContain('--retries=0');
    expect(runtime?.if).toContain("steps.web.outcome == 'success'");
  });
  it('never hands production provider credentials to this test branch through regular PR E2E', () => {
    const source = readFileSync('.github/workflows/e2e.yml', 'utf8');

    for (const key of ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'OPENROUTER_API_KEY', 'GOOGLE_API_KEY']) {
      const lines = source.split('\n').filter((line) => line.includes(`${key}:`));
      expect(lines.length).toBe(2);

      for (const line of lines) {
        expect(line).toContain("github.head_ref != 'test/ephemeral-runtime-kubernetes-20261108'");
        expect(line).toContain("github.ref_name != 'test/ephemeral-runtime-kubernetes-20261108'");
        expect(line).toContain("|| ''");
      }
    }
  });
});
