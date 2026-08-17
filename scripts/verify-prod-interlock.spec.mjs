/*
 * P104 / SEC-9 — RED/GREEN proof that cutover detection reads the PRODUCTION
 * bundle and not the test sources.
 *
 * The expert's finding: `grep -rq 'DEPLOYMENT_ACCESS_ACTIVATION_ENABLED'
 * services/api/src` also matches deployment-password.spec.ts, so removing the
 * interlock from the production route while leaving the spec in place still
 * reported "control present" → false-positive cutover → activation armed against
 * an api that has no interlock.
 *
 * The decisive test here is `regression fixture`: one synthetic repo where the
 * token exists ONLY in a spec file, on which
 *   - the OLD grep exits 0  (would have passed — the bug), and
 *   - the NEW verifier fails (the fix).
 * Both are executed for real, in the same test, against the same fixture.
 *
 * Run: pnpm vitest --run scripts/verify-prod-interlock.spec.mjs
 */
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { INTERLOCK_TOKEN, productionModuleGraph, verifyInterlock } from './verify-prod-interlock.mjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = 'services/api/src';

const created = [];

afterEach(() => {
  while (created.length) {
    rmSync(created.pop(), { recursive: true, force: true });
  }
});

/**
 * Build a miniature repo with the same shape as the real one.
 *
 * @param {object} o
 * @param {boolean} o.interlockInProd  token present in the shipping route
 * @param {boolean} o.interlockInSpec  token present in the (non-shipping) spec
 * @param {number}  [o.fillerModules]  extra reachable modules
 * @param {boolean} [o.specReachable]  make the spec importable from prod code
 * @param {'none'|'comment'|'string'|'read'|'nonBlockingIf'|'detachedFailureResponse'} [o.prodDecoy]
 *   place a non-enforcing token reference in the production access route
 * @param {'app'|'decoyRouter'} [o.routeReceiver] object receiving `.post`
 */
function fixture({
  interlockInProd,
  interlockInSpec,
  fillerModules = 3,
  specReachable = false,
  prodDecoy = 'none',
  routeReceiver = 'app',
}) {
  const root = mkdtempSync(join(tmpdir(), 'sec9-fixture-'));
  created.push(root);
  mkdirSync(join(root, SRC, 'tests'), { recursive: true });

  const fillerImports = Array.from({ length: fillerModules }, (_, i) => `import './m${i}.js';`).join('\n');

  for (let i = 0; i < fillerModules; i += 1) {
    writeFileSync(join(root, SRC, `m${i}.ts`), `export const m${i} = ${i};\n`);
  }

  writeFileSync(join(root, SRC, 'server.ts'), "import { buildApiApp } from './app.js';\nbuildApiApp();\n");

  const decoySource = {
    none: '',
    comment: `    // ${INTERLOCK_TOKEN}`,
    string: `    const interlockLabel = '${INTERLOCK_TOKEN}';`,
    read: `    void process.env.${INTERLOCK_TOKEN};`,
    nonBlockingIf: `    if (body.mode === 'password' && process.env.${INTERLOCK_TOKEN} !== '1') { diagnostics.push('disabled'); }`,
    detachedFailureResponse: [
      `    if (body.mode === 'password' && process.env.${INTERLOCK_TOKEN} !== '1') {`,
      `      return [reply.code(503), { code: 'DEPLOYMENT_ACCESS_ACTIVATION_DISABLED' }];`,
      '    }',
    ].join('\n'),
  }[prodDecoy];

  writeFileSync(
    join(root, SRC, 'app.ts'),
    [
      fillerImports,
      specReachable ? "import './tests/deployment-password.spec.js';" : '',
      'export function buildApiApp() {',
      `  ${routeReceiver}.post('/projects/:projectId/deployments/:deploymentId/access', async (request, reply) => {`,
      '    const body = request.body;',
      decoySource,
      interlockInProd
        ? `    if (body.mode === 'password' && process.env.${INTERLOCK_TOKEN} !== '1') {`
        : '    // interlock DELETED from production code',
      interlockInProd ? `      return reply.code(503).send({ code: 'DEPLOYMENT_ACCESS_ACTIVATION_DISABLED' });` : '',
      interlockInProd ? '    }' : '',
      '    return store.updateDeployment();',
      '  });',
      '  return app;',
      '}',
    ]
      .filter(Boolean)
      .join('\n'),
  );

  writeFileSync(
    join(root, SRC, 'tests', 'deployment-password.spec.ts'),
    interlockInSpec
      ? `it('interlock', () => { process.env.${INTERLOCK_TOKEN} = '1'; });\n`
      : "it('noop', () => {});\n",
  );

  return root;
}

/** The exact shell test deploy-main.yml used to run. Exit 0 = "control present". */
function oldGrepSaysPresent(root) {
  try {
    execFileSync('grep', ['-rq', INTERLOCK_TOKEN, SRC], { cwd: root });
    return true;
  } catch {
    return false;
  }
}

const verify = (root) => verifyInterlock(root, { minGraphSize: 1 });

describe('SEC-9 — cutover detection reads the production bundle', () => {
  it('GREEN on the real repository: the interlock ships in app.ts, no test file in the graph', () => {
    const result = verifyInterlock(REPO_ROOT);

    expect(result.failures).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.attestation.carriers).toContain('services/api/src/app.ts');
    expect(result.attestation.testFilesInGraph).toEqual([]);
    expect(result.attestation.verdict).toBe('INTERLOCK_IN_PRODUCTION_BUNDLE');
  });

  it('REGRESSION FIXTURE: old grep PASSES, new verifier FAILS (the reported defect)', () => {
    // Interlock deleted from production code, spec file left untouched.
    const root = fixture({ interlockInProd: false, interlockInSpec: true });

    // RED with the old detection: the spec alone makes it report "present".
    expect(oldGrepSaysPresent(root)).toBe(true);

    // GREEN with the fix: only shipping code counts, so this is caught.
    const result = verify(root);

    expect(result.ok).toBe(false);
    expect(result.failures.join('\n')).toMatch(/NOT present anywhere in the production module graph/);
    expect(result.attestation.carriers).toEqual([]);
  });

  it('passes when the interlock IS in production code (spec present or not)', () => {
    for (const interlockInSpec of [true, false]) {
      const result = verify(fixture({ interlockInProd: true, interlockInSpec }));

      expect(result.ok).toBe(true);
      expect(result.attestation.carriers).toEqual([`${SRC}/app.ts`]);
    }
  });

  it('fails when BOTH are missing (sanity: the check can actually fail)', () => {
    const result = verify(fixture({ interlockInProd: false, interlockInSpec: false }));

    expect(result.ok).toBe(false);
    expect(oldGrepSaysPresent(fixture({ interlockInProd: false, interlockInSpec: false }))).toBe(false);
  });

  it.each([
    ['comment', 'comment'],
    ['string literal', 'string'],
    ['simple environment read', 'read'],
    ['non-blocking if statement', 'nonBlockingIf'],
    ['detached status and payload', 'detachedFailureResponse'],
  ])('refuses a %s decoy in the production route', (_label, prodDecoy) => {
    const result = verify(
      fixture({
        interlockInProd: false,
        interlockInSpec: false,
        prodDecoy,
      }),
    );

    expect(result.ok).toBe(false);
    expect(result.attestation.tokenCarriers).toContain(`${SRC}/app.ts`);
    expect(result.attestation.carriers).toEqual([]);
    expect(result.attestation.verdict).toBe('FAILED');
  });

  it('refuses a fully shaped interlock registered on a decoy router', () => {
    const result = verify(
      fixture({
        interlockInProd: true,
        interlockInSpec: false,
        routeReceiver: 'decoyRouter',
      }),
    );

    expect(result.ok).toBe(false);
    expect(result.attestation.tokenCarriers).toContain(`${SRC}/app.ts`);
    expect(result.attestation.carriers).toEqual([]);
  });

  it('never lets a spec file into the graph — and fails loudly if one becomes reachable', () => {
    const clean = verify(fixture({ interlockInProd: true, interlockInSpec: true }));
    expect(clean.attestation.testFilesInGraph).toEqual([]);

    const reachable = verify(fixture({ interlockInProd: true, interlockInSpec: true, specReachable: true }));
    expect(reachable.ok).toBe(false);
    expect(reachable.failures.join('\n')).toMatch(/test file\(s\) reachable from the production entrypoint/);
    expect(reachable.attestation.testFilesInGraph).toContain(`${SRC}/tests/deployment-password.spec.ts`);
  });

  it('refuses to certify when the walker itself is broken (implausibly small graph)', () => {
    // Real default floor, tiny fixture -> must fail on the floor, not silently pass.
    const result = verifyInterlock(fixture({ interlockInProd: true, interlockInSpec: false }));

    expect(result.ok).toBe(false);
    expect(result.failures.join('\n')).toMatch(/walker is broken, refusing to certify anything/);
  });

  it('produces a platform-stable graph (no case-insensitive phantom resolution)', () => {
    /*
     * app.ts embeds a generated Vite app in a template literal containing
     * `import App from './App'`. On macOS a naive resolver matches app.ts and the
     * graph (and its digest) differ from Linux. Assert the graph carries exactly
     * one spelling of app.ts.
     */
    const { files } = productionModuleGraph(REPO_ROOT);
    const appSpellings = files.filter((f) => /\/[Aa]pp\.ts$/.test(f));

    expect(appSpellings).toEqual(['services/api/src/app.ts']);
  });

  /*
   * The whole claim of this script is "these are the files that ship". The
   * authority on that is the compiler, so cross-check the walker's graph against
   * what `tsc` actually emits from the same entrypoint. Guarded because a full
   * api build takes minutes — too slow for every CI run, but it must stay
   * replayable on demand and is documented in docs/DEPLOY_RUNBOOK.md:
   *
   *   SEC9_CROSSCHECK_TSC=1 pnpm vitest --run scripts/verify-prod-interlock.spec.mjs
   */
  it.runIf(process.env.SEC9_CROSSCHECK_TSC === '1')(
    'graph matches the real tsc production graph exactly',
    () => {
      const out = mkdtempSync(join(tmpdir(), 'sec9-tsc-'));
      created.push(out);

      // Resolve the compiler through Node's own resolution rather than a hard
      // path under REPO_ROOT: in a git worktree, node_modules is often a symlink
      // farm pointing at the primary checkout, so the literal path may not exist.
      const tscBin = join(
        dirname(createRequire(import.meta.url).resolve('typescript/package.json')),
        'bin/tsc',
      );

      execFileSync(
        'node',
        [
          tscBin,
          '--outDir', out,
          '--rootDir', 'src',
          '--module', 'NodeNext',
          '--moduleResolution', 'NodeNext',
          '--target', 'ES2022',
          '--lib', 'ES2022',
          '--types', 'node',
          '--skipLibCheck', 'true',
          '--esModuleInterop', 'true',
          '--strict', 'true',
          '--resolveJsonModule', 'true',
          'src/server.ts',
        ],
        { cwd: join(REPO_ROOT, 'services/api'), stdio: 'inherit' },
      );

      const emitted = execFileSync('find', [out, '-name', '*.js'], { encoding: 'utf8' })
        .split('\n')
        .filter(Boolean)
        .map((f) => `services/api/src/${f.replace(`${out}/`, '').replace(/\.js$/, '.ts')}`)
        .sort();

      const walked = productionModuleGraph(REPO_ROOT).files.filter((f) => f.endsWith('.ts')).sort();

      expect(walked).toEqual(emitted);
    },
    600_000,
  );

  it('is deterministic: same tree -> same digest', () => {
    expect(verifyInterlock(REPO_ROOT).attestation.graphDigest).toBe(verifyInterlock(REPO_ROOT).attestation.graphDigest);
  });
});

describe('SEC-9 — exact-SHA gate (CLI)', () => {
  const runCli = (args) => {
    try {
      const stdout = execFileSync('node', ['scripts/verify-prod-interlock.mjs', ...args], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      return { code: 0, out: stdout };
    } catch (error) {
      return { code: error.status ?? 1, out: `${error.stdout ?? ''}${error.stderr ?? ''}` };
    }
  };

  const headSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();

  it('accepts the SHA actually being deployed (full and short form)', () => {
    expect(runCli(['--expect-sha', headSha]).code).toBe(0);
    expect(runCli(['--expect-sha', headSha.slice(0, 10)]).code).toBe(0);
  });

  it('REFUSES a verdict computed for a different commit', () => {
    const other = 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef';
    const { code, out } = runCli(['--expect-sha', other]);

    expect(code).toBe(1);
    expect(out).toMatch(/exact-SHA gate FAILED/);
  });
});
