import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const gateSource = resolve(here, 'e2e-gate.mjs');

function isoOffset(days) {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function report(status = 'expected', title = 'passes') {
  return {
    suites: [
      {
        title: 'root',
        file: 'tests/e2e/sample.spec.ts',
        specs: [
          {
            title,
            file: 'tests/e2e/sample.spec.ts',
            tests: [{ status }],
          },
        ],
      },
    ],
  };
}

function waiver(test = 'sample.spec.ts › fails') {
  return {
    test,
    reason: 'Temporary non-critical browser instability under investigation.',
    ticket: 'BUG-E2E-TEST',
    owner: 'qa@example.test',
    criticality: 'non-critical',
  };
}

function runGate(policy, playwrightReport) {
  const root = mkdtempSync(resolve(tmpdir(), 'vibecore-e2e-gate-'));
  try {
    mkdirSync(resolve(root, 'scripts'), { recursive: true });
    mkdirSync(resolve(root, 'tests/e2e'), { recursive: true });
    cpSync(gateSource, resolve(root, 'scripts/e2e-gate.mjs'));
    writeFileSync(resolve(root, 'tests/e2e/e2e-waivers.json'), JSON.stringify(policy));
    writeFileSync(resolve(root, 'report.json'), JSON.stringify(playwrightReport));

    return spawnSync(process.execPath, ['scripts/e2e-gate.mjs', 'report.json'], {
      cwd: root,
      encoding: 'utf8',
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe('bounded E2E waiver policy', () => {
  it('passes forever without a waiver, even when legacy dates are stale', () => {
    const result = runGate({ created: '2020-01-01', expires: '2020-01-02', waived: [] }, report());
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('no active waiver');
  });

  it('accepts one failing non-critical test inside a seven-day window', () => {
    const result = runGate(
      { created: isoOffset(0), expires: isoOffset(7), waived: [waiver()] },
      report('unexpected', 'fails'),
    );
    expect(result.status, result.stderr).toBe(0);
  });

  it('rejects an unwaived failure', () => {
    const result = runGate({ created: null, expires: null, waived: [] }, report('unexpected', 'fails'));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('NOT waived');
  });

  it('rejects windows longer than seven calendar days', () => {
    const result = runGate(
      { created: isoOffset(0), expires: isoOffset(8), waived: [waiver()] },
      report('unexpected', 'fails'),
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('maximum is 7');
  });

  it('rejects impossible calendar dates instead of normalising them', () => {
    const result = runGate(
      { created: isoOffset(0), expires: '2026-02-31', waived: [waiver()] },
      report('unexpected', 'fails'),
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('not a real calendar date');
  });

  it('rejects stale waivers whose test now passes', () => {
    const result = runGate(
      { created: isoOffset(0), expires: isoOffset(7), waived: [waiver('sample.spec.ts › passes')] },
      report(),
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('waived but PASSED');
  });

  it('rejects waivers that no longer identify a reported test', () => {
    const result = runGate(
      { created: isoOffset(0), expires: isoOffset(7), waived: [waiver('renamed.spec.ts › missing')] },
      report('unexpected', 'fails'),
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('must exist in this exact report');
  });

  it('rejects critical-path waivers', () => {
    const critical = { ...waiver(), criticality: 'critical' };
    const result = runGate(
      { created: isoOffset(0), expires: isoOffset(7), waived: [critical] },
      report('unexpected', 'fails'),
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('critical paths cannot be waived');
  });
});
