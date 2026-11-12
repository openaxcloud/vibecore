import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { declencherCorrectifLivraison } from './declencher-correctif-livraison.mjs';

const workflowPath = resolve('.github/workflows/deploy-main.yml');
const workflow = parse(readFileSync(workflowPath, 'utf8'));
const gateSteps = workflow.jobs['release-gate'].steps;
const buildSteps = workflow.jobs['build-and-deploy'].steps;

const names = [
  'Reject obsolete automatic deployment before cloud access',
  'Reject obsolete automatic deployment before first production mutation',
];

const guards = [gateSteps.find((step) => step.name === names[0]), buildSteps.find((step) => step.name === names[1])];
const oldSha = 'a'.repeat(40);
const newSha = 'b'.repeat(40);

/*
 * The actual workflow shell and real Git graph/diff run locally. The GitHub
 * fetch transport alone is redirected to the test repository; no network is used.
 */
function executeGuard(guard, options = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'deployment-freshness-'));

  const git = (...args) =>
    execFileSync('/usr/bin/git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

  try {
    git('init', '-b', 'main');
    git('config', 'user.name', 'Local contract test');
    git('config', 'user.email', 'contract@example.invalid');

    const put = (path, text = 'changed\n') => {
      mkdirSync(dirname(join(dir, path)), { recursive: true });
      writeFileSync(join(dir, path), text);
    };

    for (const path of ['app/delete.ts', 'docs/remove.md', 'docs/rename.md', 'app/rename.ts']) {
      put(path, 'base\n');
    }
    git('add', '.');
    git('commit', '-m', 'common');

    const common = git('rev-parse', 'HEAD');
    put('app/main.ts', 'runtime target\n');
    git('add', '.');
    git('commit', '-m', 'runtime target');

    const target = git('rev-parse', 'HEAD');

    if (options.offMain) {
      git('checkout', '--detach', common);
    }

    for (const path of options.changedPaths ?? []) {
      put(path);
    }

    for (const path of options.deletedPaths ?? []) {
      rmSync(join(dir, path));
    }

    for (const [from, to] of options.renamedPaths ?? []) {
      mkdirSync(dirname(join(dir, to)), { recursive: true });
      renameSync(join(dir, from), join(dir, to));
    }

    if (options.offMain) {
      put('app/off-main.ts');
    }

    git('add', '.');

    if (git('status', '--porcelain')) {
      git('commit', '-m', 'new main snapshot');
    }

    const head = git('rev-parse', 'HEAD');
    git('branch', '-f', 'observed-main', head);
    git('checkout', '--detach', target);

    let runner = dir;

    if (options.shallow) {
      git('branch', 'fixture-target', target);
      runner = join(dir, 'shallow-checkout');
      execFileSync('/usr/bin/git', ['clone', '--depth', '1', '--branch', 'fixture-target', 'file://' + dir, runner], {
        stdio: 'pipe',
      });
    }

    const bin = join(dir, 'bin');
    mkdirSync(bin);

    const capture = join(dir, 'calls.json');
    writeFileSync(capture, '[]');

    const script = [
      '#!' + process.execPath,
      "const fs = require('node:fs'); const cp = require('node:child_process');",
      'const args = process.argv.slice(2);',
      "const calls = JSON.parse(fs.readFileSync(process.env.CAPTURE, 'utf8'));",
      "calls.push({args, scopedCredential: process.env.GIT_CONFIG_KEY_1 === 'http.https://github.com/.extraheader' && process.env.GIT_CONFIG_VALUE_0 === '',",
      "  promptDisabled: process.env.GIT_TERMINAL_PROMPT === '0'});",
      'fs.writeFileSync(process.env.CAPTURE, JSON.stringify(calls));',
      "if (args[0] === 'fetch') {",
      "  if (process.env.FETCH_STATUS !== '0') { fs.writeFileSync('.git/FETCH_HEAD', process.env.OLD_SHA + '\\n'); process.exit(Number(process.env.FETCH_STATUS)); }",
      "  const index = args.indexOf('https://github.com/openaxcloud/vibecore.git');",
      "  if (index < 0 || args[index + 1] !== 'refs/heads/main') process.exit(97);",
      "  args[index] = process.env.LOCAL_REPO; args[index + 1] = 'refs/heads/observed-main';",
      '}',
      "if (args[0] === 'rev-parse' && args.includes('FETCH_HEAD^{commit}') && process.env.HEAD_OUTPUT_OVERRIDE === '1') {",
      '  process.stdout.write(process.env.HEAD_OUTPUT); process.exit(0);',
      '}',
      "if (args[0] === 'diff' && process.env.DIFF_STATUS !== '0') { process.stdout.write('docs/partial.md\\0'); process.exit(Number(process.env.DIFF_STATUS)); }",
      "const result = cp.spawnSync('/usr/bin/git', args, {stdio: 'inherit'}); process.exit(result.status ?? 98);",
    ].join('\n');
    writeFileSync(join(bin, 'git'), script, { mode: 0o755 });

    const normalize = (sha) => (sha === oldSha ? target : sha === newSha ? head : sha);

    const result = spawnSync('bash', ['-c', guard?.run ?? 'echo missing guard >&2; exit 99'], {
      cwd: runner,
      encoding: 'utf8',
      env: {
        PATH: bin + ':' + process.env.PATH,
        HOME: dir,
        GH_TOKEN: options.missingToken ? '' : 'CANARY_READ_TOKEN_NEVER_LOGGED',
        GITHUB_REPOSITORY: 'openaxcloud/vibecore',
        TARGET_SHA: normalize(options.targetSha ?? oldSha),
        EVENT_NAME: options.eventName ?? 'push',
        EXPLICIT_TARGET: normalize(options.explicitTarget ?? ''),
        ALLOW_HISTORICAL_TARGET: options.allowHistoricalTarget ?? '',
        CAPTURE: capture,
        LOCAL_REPO: dir,
        OLD_SHA: target,
        FETCH_STATUS: String(options.fetchStatus ?? 0),
        DIFF_STATUS: String(options.diffStatus ?? 0),
        HEAD_OUTPUT_OVERRIDE: options.headOutput !== undefined ? '1' : '0',
        HEAD_OUTPUT: options.headOutput ?? '',
      },
    });

    return {
      ...result,
      calls: JSON.parse(readFileSync(capture, 'utf8')),
      gitConfig: readFileSync(join(runner, '.git/config'), 'utf8'),
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('obsolete automatic deployment guard wiring', () => {
  it('runs after all release policy checks and before the job holding cloud credentials', () => {
    expect(guards[0]).toBeDefined();
    expect(gateSteps.at(-1)).toBe(guards[0]);
    expect(gateSteps.findIndex((step) => step.name?.startsWith('Preflight policies'))).toBeLessThan(
      gateSteps.length - 1,
    );
    expect(workflow.jobs['release-gate'].permissions['id-token']).toBeUndefined();
    expect(workflow.jobs['build-and-deploy'].needs).toEqual(['resolve-target', 'release-gate']);
    expect(workflow.jobs['build-and-deploy'].permissions['id-token']).toBe('write');
  });

  it('checks again immediately before staging, not between staging and rollback', () => {
    expect(guards[1]).toBeDefined();

    const index = buildSteps.indexOf(guards[1]);
    expect(buildSteps[index + 1].name).toBe('Migrate and prepare manager before API');
    expect(buildSteps[index + 1].run).toBe('node infra/helm/stage-manager-before-api.bundle.mjs');

    const rollback = buildSteps.find((step) => step.name === 'Roll back to the previous revision (post-check failure)');
    expect(rollback.if).toBe(
      "failure() && (env.UPGRADE_APPLIED == '1' || env.STAGED_UPGRADE_STARTED == '1') && steps.prevrev.outputs.revision != ''",
    );

    for (const guard of guards) {
      expect(guard.run).not.toMatch(/STAGED_UPGRADE_STARTED|UPGRADE_APPLIED|helm |kubectl /);
    }
  });

  it('keeps both guards identical, independent of files at an old explicit target', () => {
    expect(guards[0]?.run).toBe(guards[1]?.run);
    expect(guards[0]?.run).toContain('git fetch --no-tags --filter=blob:none');
    expect(guards[0]?.run).not.toMatch(/node scripts|\.\/scripts|\bgit checkout\b/);

    for (const guard of guards) {
      expect(guard.env).toEqual({
        GH_TOKEN: '${{ secrets.GITHUB_TOKEN }}',
        EVENT_NAME: '${{ github.event_name }}',
        EXPLICIT_TARGET: '${{ inputs.target_sha }}',
        ALLOW_HISTORICAL_TARGET: '${{ toJSON(inputs.allow_historical_target) }}',
        TARGET_SHA: '${{ needs.resolve-target.outputs.target_sha }}',
      });
    }
  });

  it('preserves exact target ancestry, required checks and non-cancelling serialization', () => {
    const resolver = workflow.jobs['resolve-target'].steps.find((step) => step.id === 'target').run;
    expect(resolver).toContain('git cat-file -e "${TARGET_SHA}^{commit}"');
    expect(resolver).toContain('git merge-base --is-ancestor "${TARGET_SHA}" origin/main');
    expect(workflow.concurrency).toEqual({ group: 'deploy-production-continuous', 'cancel-in-progress': false });
    expect(
      gateSteps.find((step) => step.name === 'Verify required checks are green for this exact commit').run,
    ).toContain('--sha "${TARGET_SHA}"');
    expect(buildSteps.find((step) => step.name?.startsWith('Re-verify required checks')).run).toContain(
      '--sha "${TARGET_SHA}" --repo "${GITHUB_REPOSITORY}" --no-wait',
    );
  });
});

describe.each(names.map((name, index) => ({ name, index })))('$name', ({ index }) => {
  const guard = guards[index];
  it('accepts a current push and fetches only main with ephemeral auth', () => {
    const result = executeGuard(guard);
    expect(result.status).toBe(0);
    expect(result.calls.find((call) => call.args[0] === 'fetch')).toEqual({
      args: [
        'fetch',
        '--no-tags',
        '--filter=blob:none',
        'https://github.com/openaxcloud/vibecore.git',
        'refs/heads/main',
      ],
      scopedCredential: true,
      promptDisabled: true,
    });
    expect(result.gitConfig).not.toMatch(/CANARY_READ_TOKEN|AUTHORIZATION|extraheader/);
    expect(result.stdout + result.stderr).not.toContain('CANARY_READ_TOKEN_NEVER_LOGGED');
    expect(result.stdout + result.stderr).not.toContain(
      Buffer.from('x-access-token:CANARY_READ_TOKEN_NEVER_LOGGED').toString('base64'),
    );
  });
  it('works from the release gate shallow checkout without dropping ancestry', () => {
    expect(executeGuard(guard, { shallow: true, changedPaths: ['docs/note.md'] }).status).toBe(0);
    expect(executeGuard(guard, { shallow: true, changedPaths: ['app/newer.ts'] }).status).toBe(1);
  });
  it('blocks an older push when main has newer deployable code', () => {
    const result = executeGuard(guard, { changedPaths: ['app/newer.ts'] });
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('newer deployable changes');
  });
  it('does not abandon a runtime push followed by docs-only without a new deploy', () => {
    const result = executeGuard(guard, { changedPaths: ['README.md', 'docs/runbook.txt', 'notes/operations.md'] });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('no newer deployable changes');
  });
  it('uses the complete diff beyond 300 changed files', () => {
    const docs = Array.from({ length: 350 }, (_, i) => 'docs/page-' + String(i).padStart(3, '0') + '.md');
    expect(executeGuard(guard, { changedPaths: docs }).status).toBe(0);
    expect(executeGuard(guard, { changedPaths: [...docs, 'zz-runtime.ts'] }).status).toBe(1);
  });
  it.each([
    'README.md',
    'nested/deep/guide.md',
    'docs/anything.ts',
    '.github/workflows/ci.yml',
    'tests/anything.ts',
    'root.spec.ts',
    'nested/file.spec.tsx',
    'nested/file.spec.mjs',
    'nested/file.spec.js',
    'playwright.config.ts',
    'playwright-mobile.config.ts',
  ])('permits the official ignored path: %s', (path) => {
    expect(executeGuard(guard, { changedPaths: [path] }).status).toBe(0);
  });
  it.each([
    'app/runtime.ts',
    'package.json',
    'pnpm-lock.yaml',
    'infra/helm/platform/values-prod.yaml',
    'nested/playwright.config.ts',
    'docs-not-a-directory.ts',
    'README.MD',
    'app/new\nruntime.ts',
  ])('refuses deployable paths and boundary cases: %s', (path) => {
    expect(executeGuard(guard, { changedPaths: [path] }).status).toBe(1);
  });
  it('classifies deletions and both sides of renames', () => {
    expect(executeGuard(guard, { deletedPaths: ['docs/remove.md'] }).status).toBe(0);
    expect(executeGuard(guard, { deletedPaths: ['app/delete.ts'] }).status).toBe(1);
    expect(executeGuard(guard, { renamedPaths: [['app/rename.ts', 'docs/old-runtime.md']] }).status).toBe(1);
    expect(executeGuard(guard, { renamedPaths: [['docs/rename.md', 'app/new-runtime.ts']] }).status).toBe(1);
  });
  it('applies material freshness to default dispatches', () => {
    expect(executeGuard(guard, { eventName: 'workflow_dispatch', changedPaths: ['app/newer.ts'] }).status).toBe(1);
    expect(executeGuard(guard, { eventName: 'workflow_dispatch', changedPaths: ['docs/note.md'] }).status).toBe(0);
  });
  it.each(['', 'null', '""', 'false'])(
    'protects targeted automatic and legacy dispatches without opt-in: %s',
    (allowHistoricalTarget) => {
      for (const [path, expected] of [
        ['app/newer.ts', 1],
        ['docs/note.md', 0],
      ]) {
        const result = executeGuard(guard, {
          eventName: 'workflow_dispatch',
          explicitTarget: oldSha,
          allowHistoricalTarget,
          changedPaths: [path],
        });
        expect(result.status).toBe(expected);
        expect(result.calls.some((call) => call.args[0] === 'diff')).toBe(true);
      }
    },
  );
  it.each(['TRUE', '1', 'yes', '"true"', '"false"', ' true', 'true\n', '{}', '[]'])(
    'rejects malformed or nonboolean opt-in: %s',
    (allowHistoricalTarget) => {
      const result = executeGuard(guard, {
        eventName: 'workflow_dispatch',
        explicitTarget: oldSha,
        allowHistoricalTarget,
      });
      expect(result.status).toBe(1);
      expect(result.calls).toEqual([]);
    },
  );
  it.each([
    { eventName: 'workflow_dispatch' },
    { eventName: 'workflow_dispatch', explicitTarget: 'main' },
    { eventName: 'workflow_dispatch', explicitTarget: oldSha, targetSha: '' },
    { eventName: 'push' },
  ])('refuses historical opt-in without a valid explicit dispatch target: %j', (options) => {
    const result = executeGuard(guard, { ...options, allowHistoricalTarget: 'true' });
    expect(result.status).toBe(1);
    expect(result.calls).toEqual([]);
  });
  it('preserves an explicitly selected older dispatch under existing gates', () => {
    const result = executeGuard(guard, {
      eventName: 'workflow_dispatch',
      explicitTarget: oldSha,
      allowHistoricalTarget: 'true',
      changedPaths: ['app/newer.ts'],
    });
    expect(result.status).toBe(0);
    expect(result.calls.some((call) => call.args[0] === 'fetch')).toBe(true);
    expect(result.calls.some((call) => call.args[0] === 'merge-base')).toBe(true);
    expect(result.calls.some((call) => call.args[0] === 'diff')).toBe(false);
    expect(result.stdout).toContain('Explicit exact-SHA');
  });
  it.each([
    ['force-push removes target from main', { offMain: true }],
    ['transport failure', { fetchStatus: 1 }],
    ['missing read-only token', { missingToken: true }],
  ])('explicit dispatch still refuses %s at this guard', (_name, options) => {
    const result = executeGuard(guard, {
      eventName: 'workflow_dispatch',
      explicitTarget: oldSha,
      allowHistoricalTarget: 'true',
      ...options,
    });
    expect(result.status).not.toBe(0);
  });
  it.each([
    ['push cannot override', { explicitTarget: oldSha }],
    ['dispatch cannot mismatch', { eventName: 'workflow_dispatch', explicitTarget: 'c'.repeat(40) }],
    ['unsupported event', { eventName: 'pull_request' }],
    ['malformed target', { targetSha: 'main' }],
    ['multiline target', { targetSha: oldSha + '\n' + oldSha }],
    ['missing token', { missingToken: true }],
  ])('rejects invalid context: %s', (_name, options) => {
    const result = executeGuard(guard, options);
    expect(result.status).toBe(1);
    expect(result.calls).toEqual([]);
  });
  it.each([
    ['transport failure with cached FETCH_HEAD', { fetchStatus: 1 }],
    ['diff failure with partial docs-only output', { diffStatus: 1 }],
    ['empty fetched head', { headOutput: '' }],
    ['malformed fetched head', { headOutput: 'main\n' }],
    ['multiline fetched head', { headOutput: oldSha + '\n' + oldSha + '\n' }],
    ['main no longer descends from target', { offMain: true }],
  ])('fails closed on incomplete evidence: %s', (_name, options) => {
    expect(executeGuard(guard, options).status).not.toBe(0);
  });
});
it('pins the material path mapping to the actual deployment trigger', () => {
  expect(workflow.on.push['paths-ignore']).toEqual([
    '**/*.md',
    'docs/**',
    '.github/**',
    'tests/**',
    '**/*.spec.ts',
    '**/*.spec.tsx',
    '**/*.spec.mjs',
    '**/*.spec.js',
    'playwright*.config.ts',
  ]);

  for (const guard of guards) {
    expect(guard.run).toContain('*.md|docs/*|.github/*|tests/*|*.spec.ts|*.spec.tsx|*.spec.mjs|*.spec.js');
    expect(guard.run).toContain('"\${changed}" != */* && "\${changed}" == playwright*.config.ts');
    expect(guard.run).toContain('git diff --no-renames --name-only -z');
    expect(guard.run).toContain('git merge-base --is-ancestor "\${TARGET_SHA}" "\${CURRENT_MAIN}"');
  }
});

it('still rejects a real off-main explicit target before the guard can allow a redeploy', () => {
  const dir = mkdtempSync(join(tmpdir(), 'deployment-ancestry-'));

  try {
    const git = (...args) =>
      execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    git('init', '-b', 'main');
    git('config', 'user.name', 'Local contract test');
    git('config', 'user.email', 'contract@example.invalid');
    git('commit', '--allow-empty', '-m', 'base');

    const base = git('rev-parse', 'HEAD');
    git('checkout', '-b', 'off-main');
    git('commit', '--allow-empty', '-m', 'not on main');

    const offMain = git('rev-parse', 'HEAD');
    git('checkout', 'main');
    git('commit', '--allow-empty', '-m', 'current main');
    git('remote', 'add', 'origin', dir);

    const resolver = workflow.jobs['resolve-target'].steps.find((step) => step.id === 'target').run;
    const resolvedScript = resolver.replaceAll('${{ github.event_name }}', 'workflow_dispatch');

    const run = (target) =>
      spawnSync('bash', ['-c', resolvedScript], {
        cwd: dir,
        encoding: 'utf8',
        env: {
          ...process.env,
          TARGET_SHA_INPUT: target,
          PUSH_SHA: git('rev-parse', 'HEAD'),
          GITHUB_OUTPUT: join(dir, 'outputs'),
          GITHUB_STEP_SUMMARY: join(dir, 'summary'),
        },
      });
    expect(run(base).status).toBe(0);
    expect(run(offMain).status).toBe(1);
    expect(run('0'.repeat(40)).status).toBe(1);
    expect(run('main').status).toBe(1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

it.each(guards.map((guard, index) => ({ guard, index })))(
  'resets persisted Authorization for the real HTTP fetch at guard $index',
  async ({ guard }) => {
    const dir = mkdtempSync(join(tmpdir(), 'deployment-fetch-auth-'));
    const requests = [];

    const server = createServer((request, response) => {
      requests.push(request.rawHeaders);
      response.writeHead(404, { 'Content-Type': 'text/plain' });
      response.end('local test repository is deliberately unavailable');
    });

    try {
      await new Promise((resolveListen, rejectListen) => {
        server.once('error', rejectListen);
        server.listen(0, '127.0.0.1', resolveListen);
      });

      const origin = 'http://127.0.0.1:' + server.address().port;
      const key = 'http.' + origin + '/.extraheader';
      execFileSync('/usr/bin/git', ['init', '-b', 'main'], { cwd: dir, stdio: 'pipe' });
      execFileSync('/usr/bin/git', ['config', '--add', key, 'AUTHORIZATION: basic SAVED_CANARY'], {
        cwd: dir,
        stdio: 'pipe',
      });

      /*
       * Only the remote origin is redirected. Real git/curl applies the exact
       * command-scoped config from the workflow to a real HTTP request.
       */
      const script = guard.run
        .replaceAll('http.https://github.com/.extraheader', key)
        .replaceAll('https://github.com/\${GITHUB_REPOSITORY}.git', origin + '/repo.git');
      const child = spawn('bash', ['-c', script], {
        cwd: dir,
        env: {
          PATH: process.env.PATH,
          HOME: dir,
          GH_TOKEN: 'SCOPED_CANARY',
          EVENT_NAME: 'push',
          TARGET_SHA: oldSha,
          EXPLICIT_TARGET: '',
          GITHUB_REPOSITORY: 'openaxcloud/vibecore',
        },
      });

      let output = '';
      child.stdout.on('data', (chunk) => {
        output += chunk;
      });
      child.stderr.on('data', (chunk) => {
        output += chunk;
      });

      const status = await new Promise((resolveExit, rejectExit) => {
        child.once('error', rejectExit);
        child.once('close', resolveExit);
      });
      expect(status).not.toBe(0);
      expect(requests.length).toBeGreaterThan(0);

      const expected = 'basic ' + Buffer.from('x-access-token:SCOPED_CANARY').toString('base64');

      for (const headers of requests) {
        const authorization = [];

        for (let i = 0; i < headers.length; i += 2) {
          if (headers[i].toLowerCase() === 'authorization') {
            authorization.push(headers[i + 1]);
          }
        }
        expect(authorization).toEqual([expected]);
      }
      expect(execFileSync('/usr/bin/git', ['config', '--get-all', key], { cwd: dir, encoding: 'utf8' }).trim()).toBe(
        'AUTHORIZATION: basic SAVED_CANARY',
      );
      expect(output).not.toContain('SCOPED_CANARY');
      expect(output).not.toContain(expected);
    } finally {
      await new Promise((resolveClose) => server.close(resolveClose));
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

it('declares a safe boolean historical opt-in default', () => {
  expect(workflow.on.workflow_dispatch.inputs.allow_historical_target).toMatchObject({
    type: 'boolean',
    default: false,
    required: false,
  });
});
it('keeps the actual automatic delivery-chain dispatch protected at both guards', async () => {
  const calls = [];

  const result = await declencherCorrectifLivraison({
    depot: 'openaxcloud/vibecore',
    sha: oldSha,
    token: 'LOCAL_CANARY',
    requete: async (url, options) => {
      calls.push({ url, options });
      return { ok: true, status: 204, json: async () => ({ workflow_runs: [] }) };
    },
  });
  expect(result).toBe('demande');
  expect(calls).toHaveLength(2);

  const dispatch = calls[1];
  expect(dispatch.url).toBe(
    'https://api.github.com/repos/openaxcloud/vibecore/actions/workflows/deploy-main.yml/dispatches',
  );
  expect(dispatch.options.method).toBe('POST');

  const payload = JSON.parse(dispatch.options.body);
  expect(payload).toEqual({ ref: 'main', inputs: { target_sha: oldSha } });
  expect(Object.keys(dispatch.options.headers).filter((key) => key.toLowerCase() === 'authorization')).toHaveLength(1);

  const chain = parse(readFileSync('.github/workflows/deploy-chain-change.yml', 'utf8'));
  expect(JSON.stringify(chain)).toContain('node scripts/release-gate/declencher-correctif-livraison.mjs');
  expect(JSON.stringify(chain)).not.toContain('allow_historical_target');

  for (const guard of guards) {
    for (const [path, status] of [
      ['app/newer.ts', 1],
      ['docs/newer.md', 0],
    ]) {
      expect(
        executeGuard(guard, {
          eventName: 'workflow_dispatch',
          explicitTarget: payload.inputs.target_sha,
          allowHistoricalTarget: JSON.stringify(payload.inputs.allow_historical_target ?? false),
          changedPaths: [path],
        }).status,
      ).toBe(status);
    }
  }
});
