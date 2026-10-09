import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const workflow = readFileSync(new URL('../.github/workflows/deploy-main.yml', import.meta.url), 'utf8');
const ci = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
const marker = '      - name: Vulnerability gate + SBOM on the exact digests (blocking)';
const start = workflow.indexOf('        run: |\n', workflow.indexOf(marker)) + '        run: |\n'.length;
const end = workflow.indexOf('          # Record each SBOM', start);
assert.ok(workflow.includes(marker) && end > start, 'extract the real mandatory scan step');
const scan = workflow.slice(start, end).replace(/^          /gm, '');

// Execute the real workflow shell; only the scanner is a controlled test double.
// The fake obeys --exit-code, so removing that production flag breaks the test.
const fakeTrivy = `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
const option = name => args[args.indexOf(name) + 1];
fs.appendFileSync(process.env.CALLS, JSON.stringify(args) + '\\n');
const ref = args.at(-1);
if (option('--severity') === 'HIGH') process.exit(0);
if (option('--format') === 'cyclonedx') {
  fs.writeFileSync(option('--output'), JSON.stringify({components: []}));
  process.exit(0);
}
if (process.env.ISSUE === 'scanner-error') process.exit(2);
const vulnerable = process.env.ISSUE === 'critical' && ref.includes('/api@');
if (args.includes('--output')) fs.writeFileSync(option('--output'), JSON.stringify({
  Results: [{Target: ref, Vulnerabilities: vulnerable ? [{VulnerabilityID: 'CVE-TEST-001',
    PkgName: 'test-package', InstalledVersion: '1.0.0', FixedVersion: '1.0.1'}] : []}]
}));
process.exit(vulnerable && args.includes('--exit-code') ? Number(option('--exit-code')) : 0);
`;

function exercise(issue) {
  const dir = mkdtempSync(join(tmpdir(), 'vibecore-scan-evidence-'));
  try {
    mkdirSync(join(dir, 'bin'));
    const fake = join(dir, 'bin', 'trivy');
    writeFileSync(fake, fakeTrivy);
    chmodSync(fake, 0o755);
    const services = join(dir, 'services.json');
    writeFileSync(
      services,
      JSON.stringify(
        ['api', 'web'].map((service) => ({
          service,
          image: service,
          digest: 'sha256:' + (service === 'api' ? 'a' : 'b').repeat(64),
        })),
      ),
    );
    const calls = join(dir, 'calls.jsonl');
    const result = spawnSync('bash', ['-c', scan.replaceAll('/tmp/services.json', services)], {
      cwd: dir,
      encoding: 'utf8',
      env: {
        ...process.env,
        ISSUE: issue,
        CALLS: calls,
        REG: 'example.test/images',
        PATH: join(dir, 'bin') + ':' + process.env.PATH,
      },
    });
    const reports = {};
    for (const service of ['api', 'web']) {
      const path = join(dir, 'sbom', service + '.critical.json');
      if (existsSync(path)) reports[service] = JSON.parse(readFileSync(path, 'utf8'));
    }
    return {
      ...result,
      reports,
      sboms: ['api', 'web'].map((service) => existsSync(join(dir, 'sbom', service + '.cdx.json'))),
      calls: readFileSync(calls, 'utf8')
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line)),
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('clean scan succeeds and retains the exact digest verdict for each service', () => {
  const r = exercise('clean');
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(r.sboms, [true, true]);
  for (const service of ['api', 'web']) {
    assert.match(r.reports[service].Results[0].Target, /@sha256:[ab]{64}$/);
    assert.deepEqual(r.reports[service].Results[0].Vulnerabilities, []);
  }
});

test('a fixable critical blocks deployment but preserves the CVE and both inventories', () => {
  const r = exercise('critical');
  assert.equal(r.status, 1);
  assert.deepEqual(r.sboms, [true, true]);
  assert.equal(r.reports.api.Results[0].Vulnerabilities[0].VulnerabilityID, 'CVE-TEST-001');
  assert.equal(r.reports.api.Results[0].Vulnerabilities[0].FixedVersion, '1.0.1');
  assert.match(r.stdout, /CVE-TEST-001\ttest-package\t1.0.0\t1.0.1/);
  assert.match(r.stdout, /Vulnerability gate FAILED/);
});

test('scanner infrastructure errors remain fail-closed, not clean verdicts', () => {
  const r = exercise('scanner-error');
  assert.notEqual(r.status, 0);
  assert.deepEqual(r.reports, {});
});

test('the blocking command retains severity, fixability and nonzero exit enforcement', () => {
  const r = exercise('clean');
  const commands = r.calls.filter((args) => args.includes('CRITICAL'));
  assert.equal(commands.length, 2);
  for (const args of commands) {
    for (const flag of ['--ignore-unfixed', '--scanners', '--ignorefile', '--exit-code', '--format', '--output']) {
      assert.ok(args.includes(flag), flag);
    }
    assert.equal(args[args.indexOf('--exit-code') + 1], '1');
    assert.equal(args[args.indexOf('--format') + 1], 'json');
  }
});

test('failure artifacts and regression tests remain mandatory in the actual workflows', () => {
  assert.match(workflow, /name: Upload release manifest and SBOMs\n\s+if: always\(\)[\s\S]*?path: sbom\//);
  assert.match(
    ci,
    /name: Blocking vulnerability evidence regression tests\n\s+run: node --test scripts\/security-scan-evidence\.checks\.mjs/,
  );
  assert.ok(!scan.includes('continue-on-error'));
});
