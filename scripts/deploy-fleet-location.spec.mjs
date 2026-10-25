import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const workflow = parse(readFileSync('.github/workflows/deploy-main.yml', 'utf8'));
const steps = workflow.jobs['build-and-deploy'].steps.filter(
  (step) => step.name === 'Get cluster credentials via Connect Gateway',
);

function execute(step, unavailable = false) {
  const dir = mkdtempSync(join(tmpdir(), 'fleet-location-'));
  try {
    writeFileSync(
      join(dir, 'gcloud'),
      `#!${process.execPath}\nconst fs = require('node:fs');
const args = process.argv.slice(2);
if (args[0] === 'components') process.exit(0);
fs.appendFileSync(process.env.CALLS, JSON.stringify(args) + '\\n');
if (process.env.UNAVAILABLE === '1') process.exit(42);
if (!args.includes('--location=europe-west9')) { console.error("Locations ['us-central1'] are currently unreachable"); process.exit(1); }
if (!args.includes('--project=synthetic-project') || args[4] !== 'vibecore-prod-app') process.exit(2);
`,
      { mode: 0o755 },
    );
    writeFileSync(
      join(dir, 'kubectl'),
      `#!${process.execPath}\nrequire('node:fs').writeFileSync(process.env.CONTEXT, 'called');\n`,
      { mode: 0o755 },
    );
    const calls = join(dir, 'calls');
    const context = join(dir, 'context');
    const result = spawnSync('bash', ['-c', step.run], {
      encoding: 'utf8',
      env: {
        PATH: `${dir}:${process.env.PATH}`,
        GCP_PROJECT_ID: 'synthetic-project',
        FLEET_MEMBERSHIP: workflow.env.FLEET_MEMBERSHIP,
        FLEET_LOCATION: workflow.env.FLEET_LOCATION ?? '',
        CALLS: calls,
        CONTEXT: context,
        UNAVAILABLE: unavailable ? '1' : '0',
      },
    });
    return {
      status: result.status,
      stderr: result.stderr,
      context: existsSync(context),
      calls: existsSync(calls) ? readFileSync(calls, 'utf8').trim().split('\n').map(JSON.parse) : [],
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('actual deploy shell with isolated command fixtures — no cloud access', () => {
  it('pins the existing membership location consistently with the cluster wrapper', () => {
    expect(steps).toHaveLength(2);
    const wrapper = readFileSync('scripts/ci/cluster.sh', 'utf8');
    const location = wrapper.match(/readonly PROD_LOCATION='([^']+)'/)[1];
    expect(workflow.env.FLEET_LOCATION).toBe(location);
  });
  it.each([0, 1])('step %i avoids unrelated-region discovery and keeps project/membership identity', (index) => {
    const result = execute(steps[index]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.calls).toEqual([
      [
        'container',
        'fleet',
        'memberships',
        'get-credentials',
        'vibecore-prod-app',
        '--project=synthetic-project',
        '--location=europe-west9',
      ],
    ]);
    expect(result.context).toBe(true);
  });
  it.each([0, 1])('step %i preserves a real target failure without fallback or retry', (index) => {
    const result = execute(steps[index], true);
    expect(result.status).toBe(42);
    expect(result.calls).toHaveLength(1);
    expect(result.context).toBe(false);
  });
});
