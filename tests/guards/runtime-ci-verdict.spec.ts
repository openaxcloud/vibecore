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
  it('keeps additional mobile diagnostics under the same redaction and byte budgets', () => {
    const collector = readFileSync('scripts/ci/collect-runtime-evidence.mjs', 'utf8');
    expect(collector).toContain("entry.name === 'mobile-layout-evidence.json'");
    expect(collector).toContain('await save(`mobile-layout-${manifest.length}.json`');
    expect(collector).toContain('Buffer.from(redactRuntimeEvidence(data, credentials))');
    expect(collector).toContain('const maxFile = 256 * 1024');
    expect(collector).toContain('const maxTotal = 10 * 1024 * 1024');
    expect(collector).toContain('maxTotal - 64 * 1024');
  });
  it('keeps the test run read-only toward GitHub and never obtains cloud credentials', () => {
    expect(workflow.permissions).toEqual({ contents: 'read' });

    const source = readFileSync('.github/workflows/e2e-runtime.yml', 'utf8');
    expect(source).not.toMatch(/secrets\.|id-token:|google-github-actions|environment: (production|staging)/);
    expect(source).not.toContain('WORKSPACE_DISABLE_SANDBOX_SCHEDULING');
    expect(source).toContain('bash scripts/ci/probe-runtime-gvisor.sh');
    expect(source).toContain('retention-days: 1');
    expect(job.env.KUBECONFIG).toBeUndefined();
    expect(job.env.VITE_RUNTIME_MODE).toBe('remote-kubernetes');
    expect(job.env.RUNTIME_MODE).toBe('remote-kubernetes');
    expect(job.env.VITE_RUNTIME_API_BASE_URL).toBe('http://127.0.0.1:3001/api/runtime');
    expect(job.env.API_CORS_ORIGINS).toBe('http://127.0.0.1:5173');
    expect(job.env.PREVIEW_URL_TEMPLATE).toBe('http://{workspaceId}-{port}.localhost:3020/');
    expect(source).toContain('pnpm --filter @vibecore/preview-proxy exec tsx src/server.ts');
    expect(source).toContain('KUBECONFIG=$RUNNER_TEMP/vibecore-runtime/kubeconfig');
    expect(readFileSync('scripts/ci/provision-runtime-kubernetes.sh', 'utf8')).toContain('kubectl get nodes -o name');
    expect(readFileSync('scripts/ci/provision-runtime-kubernetes.sh', 'utf8')).toContain(
      'sudo install -m 0755 gvisor/gvisor-bin/* /usr/local/bin/gvisor-bin/',
    );
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
