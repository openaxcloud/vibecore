import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const root = join(__dirname, '../..');
const action = parse(readFileSync(join(root, '.github/actions/preparer-pile-e2e/action.yml'), 'utf8'));
const install = action.runs.steps.find((step: { name?: string }) => step.name === 'Install Playwright browsers');

/*
 * Execute the actual action shell. Only external installers are replaced: no apt,
 * downloads, sudo or sleep run, and the action's branching/retry logic stays real.
 */
function runInstaller(browsers: string, failures = 0, failWebkit = false, temporarySources = false, selectedInstall = install) {
  const directory = mkdtempSync(join(tmpdir(), 'vibecore-browser-deps-'));
  const calls = join(directory, 'calls');
  const counter = join(directory, 'counter');

  try {
    const stub = `#!/usr/bin/env bash
if [ "$(basename "$0")" = sudo ] && [ "$1" = env ]; then
  shift
  exec env "$@"
fi
{ printf '%s' "$(basename "$0")"; printf ' <%s>' "$@"; printf '\\n'; } >> "$QA_CALLS"
if [ "$(basename "$0")" = pnpm ]; then
  if [ "$3" = install-deps ]; then
    if [ "$QA_TEMPORARY" = 1 ] && [ "\${APT_CONFIG:-}" != "$QA_EXPECTED_CONFIG" ]; then exit 99; fi
    count=$(cat "$QA_COUNTER" 2>/dev/null || echo 0)
    count=$((count + 1))
    echo "$count" > "$QA_COUNTER"
    if [ "$count" -le "$QA_FAILURES" ]; then exit 1; fi
  elif [ "$3" = install ] && [ "$4" = webkit ] && [ "$QA_FAIL_WEBKIT" = 1 ]; then
    exit 1
  fi
fi
`;

    for (const command of ['pnpm', 'sudo', 'sleep']) {
      writeFileSync(join(directory, command), stub, { mode: 0o755 });
    }
    writeFileSync(calls, '');

    const env: Record<string, string | undefined> = {
      ...process.env,
      PATH: `${directory}:${process.env.PATH}`,
      QA_CALLS: calls,
      QA_TEMPORARY: temporarySources ? '1' : '0',
      QA_EXPECTED_CONFIG: join(directory, 'apt.conf'),
      QA_COUNTER: counter,
      QA_FAILURES: String(failures),
      QA_FAIL_WEBKIT: failWebkit ? '1' : '0',
    };

    for (const [key, value] of Object.entries(selectedInstall.env ?? {})) {
      env[key] = String(value).replaceAll('${{ inputs.navigateurs }}', browsers);
    }

    env.CI_APT_CONFIG = temporarySources ? env.QA_EXPECTED_CONFIG : '';

    const script = String(selectedInstall.run)
      .replaceAll('${{ inputs.navigateurs }}', browsers)
      .replace(/\$\{\{ steps\.cache_navigateurs\.outputs\.[^}]+\}\}/g, 'cache-hit-fixture');
    const result = spawnSync('bash', ['--noprofile', '--norc', '-e', '-o', 'pipefail', '-c', script], {
      cwd: root,
      env,
      encoding: 'utf8',
      timeout: 5_000,
    });

    if (result.error) {
      throw result.error;
    }

    return {
      status: result.status,
      calls: readFileSync(calls, 'utf8').trim().split('\n').filter(Boolean),
      output: result.stdout + result.stderr,
    };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

describe('system dependencies follow the browsers actually tested', () => {
  it('installs only Chromium dependencies and still repairs binaries on a cache hit', () => {
    const result = runInstaller('chromium');
    expect(result.status).toBe(0);
    expect(result.calls).toEqual([
      'pnpm <exec> <playwright> <install-deps> <chromium>',
      'pnpm <exec> <playwright> <install> <chromium>',
    ]);
  });

  it('passes temporary APT configuration through the root installer wrapper', () => {
    const result = runInstaller('chromium', 0, false, true);
    expect(result.status).toBe(0);
    expect(result.calls[0]).toBe('pnpm <exec> <playwright> <install-deps> <chromium>');
  });

  it('keeps both dependency sets and both browsers for the iOS canary', () => {
    const result = runInstaller('chromium,webkit');
    expect(result.status).toBe(0);
    expect(result.calls).toEqual([
      'pnpm <exec> <playwright> <install-deps> <chromium> <webkit>',
      'pnpm <exec> <playwright> <install> <chromium>',
      'pnpm <exec> <playwright> <install> <webkit>',
    ]);
  });

  it.each(['', 'firefox', 'chromium; exit 0'])('rejects unsupported input %j before any installer', (input) => {
    const result = runInstaller(input);
    expect(result.status).toBe(1);
    expect(result.calls).toEqual([]);
  });

  it('retries only the selected system dependencies, then installs the browser', () => {
    const result = runInstaller('chromium', 1);
    expect(result.status).toBe(0);
    expect(result.calls.filter((call) => call.includes('<install-deps>'))).toEqual([
      'pnpm <exec> <playwright> <install-deps> <chromium>',
      'pnpm <exec> <playwright> <install-deps> <chromium>',
    ]);
    expect(result.calls).toContain('sleep <10>');
    const cleanupCalls = result.calls.filter((call) => call.startsWith('sudo <timeout> <--kill-after=5s> <10s> <rm> <-rf>'));
    expect(cleanupCalls).toHaveLength(1);
    expect(cleanupCalls[0]).toContain('</var/lib/apt/lists/');
    expect(result.calls.some((call) => call.includes('<apt-get> <update>'))).toBe(false);
    expect(result.calls.at(-1)).toBe('pnpm <exec> <playwright> <install> <chromium>');
  });

  it('still fails after three apt failures without continuing to browser installation', () => {
    const result = runInstaller('chromium,webkit', 3);
    expect(result.status).toBe(1);
    expect(result.calls.filter((call) => call.includes('<install-deps>'))).toHaveLength(3);
    expect(result.calls.filter((call) => call.startsWith('sudo <timeout> <--kill-after=5s> <10s> <rm> <-rf>'))).toHaveLength(2);
    expect(result.calls.at(-1)).toBe('pnpm <exec> <playwright> <install-deps> <chromium> <webkit>');
    expect(result.calls.some((call) => call.includes('<install>'))).toBe(false);
  });

  it('preserves the existing advisory handling of a WebKit binary download failure', () => {
    const result = runInstaller('chromium,webkit', 0, true);
    expect(result.status).toBe(0);
    expect(result.output).toContain('::warning::installation de WebKit');
  });
});


describe('French audit keeps the same bounded Chromium dependency installation', () => {
  const workflow = parse(readFileSync(join(root, '.github/workflows/i18n-live-audit.yml'), 'utf8'));
  const job = workflow.jobs['live-audit'];
  const preparation = job.steps.findIndex((step: { id?: string }) => step.id === 'ubuntu_sources');
  const index = job.steps.findIndex((step: { name?: string }) => step.name === 'Install Playwright Chromium');
  const chromiumInstall = job.steps[index];

  it('prepares temporary sources before Chromium for hosted Linux X64 only', () => {
    expect(preparation).toBeGreaterThan(-1);
    expect(index).toBeGreaterThan(preparation);
    expect(job.steps[preparation].if).toBe("runner.environment == 'github-hosted' && runner.os == 'Linux' && runner.arch == 'X64'");
    expect(chromiumInstall['timeout-minutes']).toBe(29);
    expect(job.strategy.matrix.project).toEqual(['desktop-1440', 'desktop-1024', 'tablet-768', 'mobile-390']);
    expect(job.env.I18N_EXPECTED_AUDIT_JSON).toBe('280');
    expect(job.env.I18N_EXPECTED_SCREENSHOTS).toBe('560');
  });

  it('retries through temporary configuration then installs Chromium', () => {
    const result = runInstaller('chromium', 1, false, true, chromiumInstall);
    expect(result.status).toBe(0);
    expect(result.calls.filter((call) => call.includes('<install-deps>'))).toHaveLength(2);
    expect(result.calls.filter((call) => call.includes('<rm> <-rf>'))).toHaveLength(1);
    expect(result.calls.at(-1)).toBe('pnpm <exec> <playwright> <install> <chromium>');
  });

  it('retains dependency failures without a fourth attempt or binary install', () => {
    const result = runInstaller('chromium', 3, false, true, chromiumInstall);
    expect(result.status).toBe(1);
    expect(result.calls.filter((call) => call.includes('<install-deps>'))).toHaveLength(3);
    expect(result.calls.filter((call) => call.includes('<rm> <-rf>'))).toHaveLength(2);
    expect(result.calls.some((call) => call.includes('<install>'))).toBe(false);
  });
});
