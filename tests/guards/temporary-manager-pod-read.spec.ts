import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

describe('temporary manager diagnostic boundary', () => {
  const workflow = parse(readFileSync('.github/workflows/temporary-manager-pod-read.yml', 'utf8'));
  it('runs only fixed main dispatch, once per run, under production protections', () => {
    expect(workflow.on).toEqual({ workflow_dispatch: null });
    expect(Object.keys(workflow.jobs)).toEqual(['collect']);

    const job = workflow.jobs.collect;
    expect(job.if).toBe(
      "github.repository == 'openaxcloud/vibecore' && github.ref == 'refs/heads/main' && github.event_name == 'workflow_dispatch' && github.run_attempt == 1",
    );
    expect(job.environment).toEqual({ name: 'production' });
    expect(job.permissions).toEqual({ contents: 'read', 'id-token': 'write' });
    expect(job['timeout-minutes']).toBe(5);
    expect(
      job.steps.filter((s: { uses?: string }) => s.uses).every((s: { uses: string }) => /@[a-f0-9]{40}$/.test(s.uses)),
    ).toBe(true);
    expect(job.steps[0].with).toEqual({ ref: '${{ github.sha }}', 'persist-credentials': false });
    expect(job.steps[1].run).toBe('python3 .github/diagnostics/manager-pod-structure.py --preflight');
    expect(job.steps[2].with).toEqual({
      workload_identity_provider: '${{ secrets.GCP_WORKLOAD_IDENTITY_PROVIDER }}',
      service_account: '${{ secrets.GCP_ARTIFACT_WRITER_SERVICE_ACCOUNT }}',
    });
    expect(job.steps[4].run).toContain('memberships get-credentials vibecore-prod-app');
    expect(job.steps[4].run).toContain('--location=europe-west9');
    expect(job.steps[5].run).toBe('python3 .github/diagnostics/manager-pod-structure.py');
    expect(job.steps).toHaveLength(6);
  });
  it('installation and removal paths cannot trigger automatic deployment', () => {
    const deployment = parse(readFileSync('.github/workflows/deploy-main.yml', 'utf8'));
    expect(deployment.on.push['paths-ignore']).toEqual(expect.arrayContaining(['.github/**', 'tests/**', 'docs/**']));
    expect(workflow.on.push).toBeUndefined();
  });
  it('proves sanitized output and exactly one fixed read without cluster access', () => {
    const result = spawnSync('python3', ['tests/guards/temporary_manager_read_test.py'], { encoding: 'utf8' });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stderr).toContain('Ran 7 tests');
    expect(result.stderr).toContain('OK');
  });
});
