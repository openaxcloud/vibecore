/** Shared by Vitest and the dependency-free runner: node scripts/tiers-a-jour.regressions.mjs. */
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const moduleUrl = process.env.TIERS_MODULE
  ? pathToFileURL(process.env.TIERS_MODULE)
  : new URL('./tiers-a-jour.mjs', import.meta.url);
const tiers = await import(moduleUrl.href);
const digest = `sha256:${'d'.repeat(64)}`;
const source = 'c'.repeat(40);
const image = `registry/repo/workspace-agent@${digest}`;
const run = {
  id: 123,
  repository: { full_name: 'openaxcloud/vibecore' },
  path: '.github/workflows/deploy-main.yml',
  head_branch: 'main',
  status: 'completed',
  conclusion: 'success',
  event: 'push',
};
const manifest = () => ({
  schemaVersion: 1,
  repository: 'openaxcloud/vibecore',
  registry: 'registry/repo',
  workflowRunUrl: 'https://github.com/openaxcloud/vibecore/actions/runs/123',
  services: [
    {
      service: 'workspaceAgent',
      image: 'workspace-agent',
      digest,
      sourceSha: source,
      provenanceKnown: true,
      signature: { verified: true },
    },
  ],
});
const release = (agent = image) => ({
  global: { imageTag: 'a'.repeat(10) },
  platformEnv: { runtime: { workspaceAgentImage: agent } },
});

function repositoryFixture(test) {
  const dir = mkdtempSync(join(tmpdir(), 'tiers-main-'));
  const origin = join(dir, 'origin.git');
  const author = join(dir, 'author');
  const stale = join(dir, 'stale');
  const git = (cwd, ...args) =>
    execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const commit = (cwd, message) => {
    git(cwd, 'add', '.');
    git(cwd, '-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-qm', message);
    return git(cwd, 'rev-parse', 'HEAD');
  };
  try {
    git(dir, 'init', '--bare', '--initial-branch=main', origin);
    git(dir, 'clone', origin, author);
    writeFileSync(join(author, 'package.json'), '{}\n');
    const old = commit(author, 'all tiers baseline');
    git(author, 'push', 'origin', 'main');
    git(dir, 'clone', origin, stale);
    mkdirSync(join(author, 'services/workspace-agent'), { recursive: true });
    writeFileSync(join(author, 'services/workspace-agent/index.ts'), '// changed agent\n');
    const current = commit(author, 'new workspace-agent code');
    git(author, 'push', 'origin', 'main');
    const bin = join(dir, 'bin');
    mkdirSync(bin);
    writeFileSync(
      join(bin, 'helm'),
      `#!/usr/bin/env node\nconsole.log(${JSON.stringify(
        JSON.stringify({
          ...release(`registry/workspace-agent:sha-${old.slice(0, 10)}`),
          global: { imageTag: old.slice(0, 10) },
        }),
      )});\n`,
      { mode: 0o755 },
    );
    const invoke = (...args) =>
      spawnSync(process.execPath, [fileURLToPath(moduleUrl), '--json', ...args], {
        cwd: stale,
        encoding: 'utf8',
        env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
      });
    test({ dir, origin, stale, old, current, git, invoke, bin });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function installReleaseProof(bin, r, m) {
  writeFileSync(join(bin, 'helm'), `#!/usr/bin/env node\nconsole.log(${JSON.stringify(JSON.stringify(r))});\n`, {
    mode: 0o755,
  });
  writeFileSync(
    join(bin, 'gh'),
    `#!/usr/bin/env node
const fs = require('node:fs'), path = require('node:path'), args = process.argv.slice(2);
if (args[0] === 'api') {
  console.log(JSON.stringify(args[1].includes('/workflows/') ? { workflow_runs: [{ id: 123 }] } : ${JSON.stringify(run)}));
} else {
  const dir = args[args.indexOf('--dir') + 1];
  fs.mkdirSync(path.join(dir, 'release-manifest-test'));
  fs.writeFileSync(path.join(dir, 'release-manifest-test', 'release-manifest.json'), ${JSON.stringify(JSON.stringify(m))});
}
`,
    { mode: 0o755 },
  );
}

const realHistory = JSON.parse(
  readFileSync(new URL('./fixtures/tiers-a-jour-release-history.json', import.meta.url), 'utf8'),
);
function configuredFromManifest(m) {
  const agent = m.services.find((s) => s.service === 'workspaceAgent');
  return {
    global: { imageRegistry: m.registry },
    services: Object.fromEntries(
      m.services
        .filter((s) => s.service !== 'workspaceAgent')
        .map((s) => [s.service, { image: s.image, imageDigest: s.digest }]),
    ),
    platformEnv: { runtime: { workspaceAgentImage: `${m.registry}/${agent.image}@${agent.digest}` } },
  };
}

function installReleaseHistory(bin, r, history) {
  writeFileSync(join(bin, 'helm'), `#!/usr/bin/env node\nconsole.log(${JSON.stringify(JSON.stringify(r))});\n`, {
    mode: 0o755,
  });
  writeFileSync(
    join(bin, 'gh'),
    `#!/usr/bin/env node
const fs = require('node:fs'), path = require('node:path'), args = process.argv.slice(2);
const history = ${JSON.stringify(history)};
if (args[0] === 'api') {
  if (args[1].includes('/workflows/')) {
    if (!args[1].endsWith('per_page=10')) process.exit(3);
    console.log(JSON.stringify({ workflow_runs: history.map((proof) => proof.run) }));
  } else console.log(JSON.stringify(history.find((proof) => String(proof.run.id) === args[1].split('/').pop()).run));
} else {
  const proof = history.find((proof) => String(proof.run.id) === args[2]);
  const dir = args[args.indexOf('--dir') + 1];
  fs.mkdirSync(path.join(dir, 'release-manifest-test'));
  fs.writeFileSync(path.join(dir, 'release-manifest-test', 'release-manifest.json'), JSON.stringify(proof.manifest));
}
`,
    { mode: 0o755 },
  );
}

export const regressionCases = [
  [
    'actual two deployment artifacts resolve mixed-tier provenance while neither alone suffices',
    () => {
      const configured = configuredFromManifest(realHistory[0].manifest);
      assert.throws(() => tiers.sondesRelease(configured, [realHistory[0]]));
      assert.throws(() => tiers.sondesRelease(configured, [realHistory[1]]));
      const probes = tiers.sondesRelease(configured, realHistory);
      assert.equal(probes.length, 9);
      for (const probe of probes) {
        assert.equal(
          probe.servi,
          probe.service === 'web'
            ? '80f1de14794b134a7073d20b708254d690ff6626'
            : '4f7c07f7a38e47f6e08c4a2a64de46382622af21',
        );
      }
      assert.deepEqual(tiers.sondesRelease(configured, [...realHistory].reverse()), probes);
    },
  ],
  [
    'actual history rejects untrusted, conflicting, duplicate or still-missing source evidence',
    () => {
      const configured = configuredFromManifest(realHistory[0].manifest);
      const untrusted = structuredClone(realHistory);
      untrusted[1].run.head_branch = 'attacker';
      assert.throws(() => tiers.sondesRelease(configured, untrusted));
      const conflict = structuredClone(realHistory);
      const extra = structuredClone(conflict[1]);
      extra.run.id = 456;
      extra.manifest.workflowRunUrl = 'https://github.com/openaxcloud/vibecore/actions/runs/456';
      extra.manifest.services.find((s) => s.service === 'admin').sourceSha = 'a'.repeat(40);
      assert.throws(() => tiers.sondesRelease(configured, [...conflict, extra]), /contradictoire/);
      const missing = structuredClone(realHistory);
      Object.assign(
        missing[1].manifest.services.find((s) => s.service === 'admin'),
        { provenanceKnown: false, sourceSha: null },
      );
      assert.throws(() => tiers.sondesRelease(configured, missing), /absente/);
      assert.throws(() => tiers.sondesRelease(configured, [...realHistory, realHistory[1]]), /incohérent/);
      assert.throws(() => tiers.sondesRelease(configured, Array(11).fill(realHistory[0])), /trop grand/);
    },
  ],
  [
    'CLI combines bounded history and scans later claims even after all sources are known',
    () =>
      repositoryFixture(({ bin, old, current, invoke }) => {
        const r = release();
        r.global = { imageTag: old.slice(0, 10), imageRegistry: 'registry/repo' };
        r.services = { web: { image: 'web', imageDigest: digest } };
        const first = { manifest: manifest(), run: { ...run } };
        first.manifest.services[0].sourceSha = current;
        first.manifest.services.push({
          ...first.manifest.services[0],
          service: 'web',
          image: 'web',
          sourceSha: null,
          provenanceKnown: false,
        });
        const second = structuredClone(first);
        second.run.id = 124;
        second.manifest.workflowRunUrl = 'https://github.com/openaxcloud/vibecore/actions/runs/124';
        second.manifest.services[0].sourceSha = null;
        second.manifest.services[0].provenanceKnown = false;
        second.manifest.services[1].sourceSha = old;
        second.manifest.services[1].provenanceKnown = true;
        installReleaseHistory(bin, r, [first, second]);
        for (const args of [[], ['--release-run', '123', '--release-run', '124']]) {
          const result = invoke('--configured-only', ...args);
          assert.equal(result.status, 0, result.stderr);
          assert.equal(JSON.parse(result.stdout).runtimeVerification, 'not-performed');
        }
        assert.equal(invoke().status, 2);
        const missing = invoke('--configured-only', '--release-run', '123');
        assert.equal(missing.status, 2);
        const tooMany = invoke(...Array.from({ length: 11 }, (_, i) => ['--release-run', String(i + 1)]).flat());
        assert.equal(tooMany.status, 2);
        const duplicate = invoke('--release-run', '123', '--release-run', '123');
        assert.equal(duplicate.status, 2);
        first.manifest.services[1] = structuredClone(second.manifest.services[1]);
        second.manifest.services[0] = { ...first.manifest.services[0], sourceSha: old };
        installReleaseHistory(bin, r, [first, second]);
        const conflict = invoke('--configured-only');
        assert.equal(conflict.status, 2);
        assert.equal(conflict.stdout, '');
      }),
  ],

  [
    'digest pin resolves to the full source SHA from matching trusted release evidence',
    () => {
      const probes = tiers.sondesRelease(release(), { manifest: manifest(), run });
      assert.equal(probes.length, 9);
      assert.equal(probes.find((s) => s.service === 'workspace-agent').servi, source);
      assert.notEqual(source, digest.slice(-40));
    },
  ],
  [
    'digest without proof, malformed digest and unknown provenance fail closed',
    () => {
      assert.throws(() => tiers.sondesRelease(release()));
      for (const malformed of [image.slice(0, -1), 'registry/workspace-agent@sha256:abcdef1234']) {
        assert.throws(() => tiers.sondesRelease(release(malformed), { manifest: manifest(), run }));
      }
      for (const overrides of [
        { sourceSha: null },
        { sourceSha: 'abc1234' },
        { provenanceKnown: false },
        { digest: `sha256:${'e'.repeat(64)}` },
        { image: 'other-agent' },
        { signature: { verified: false } },
      ]) {
        const m = manifest();
        Object.assign(m.services[0], overrides);
        assert.throws(() => tiers.sondesRelease(release(), { manifest: m, run }));
      }
    },
  ],
  [
    'failed, untrusted or mismatched release evidence is rejected',
    () => {
      for (const overrides of [
        { conclusion: 'failure' },
        { status: 'in_progress' },
        { head_branch: 'topic' },
        { repository: { full_name: 'attacker/vibecore' } },
        { event: 'pull_request' },
        { path: '.github/workflows/other.yml' },
        { id: 456 },
      ]) {
        assert.throws(() => tiers.sondesRelease(release(), { manifest: manifest(), run: { ...run, ...overrides } }));
      }
      for (const overrides of [
        { repository: 'other/repo' },
        { schemaVersion: 2 },
        { registry: 'other/registry' },
        { services: [] },
        { services: [...manifest().services, ...manifest().services] },
      ]) {
        assert.throws(() => tiers.sondesRelease(release(), { manifest: { ...manifest(), ...overrides }, run }));
      }
    },
  ],
  [
    'legacy source tags remain accepted without digest evidence',
    () => {
      assert.equal(tiers.sondesRelease(release('registry/workspace-agent:sha-abcdef1234'))[8].servi, 'abcdef1234');
    },
  ],
  [
    'chart digest wins over a current-looking tag and requires exact source evidence',
    () => {
      const r = release();
      r.global.imageRegistry = 'registry/repo';
      r.services = { web: { image: 'web', imageTag: 'a'.repeat(10), imageDigest: digest } };
      assert.throws(() => tiers.sondesRelease(r, { manifest: manifest(), run }));
      const m = manifest();
      m.services.push({ ...m.services[0], service: 'web', image: 'web', sourceSha: 'b'.repeat(40) });
      assert.equal(tiers.sondesRelease(r, { manifest: m, run })[0].servi, 'b'.repeat(40));
      r.services.web.imageDigest = `sha256:${'e'.repeat(64)}`;
      assert.throws(() => tiers.sondesRelease(r, { manifest: m, run }));
    },
  ],
  [
    'global digest fallback is never ignored for empty per-service pins',
    () => {
      const r = release();
      r.global.imageDigest = digest;
      r.global.imageRegistry = 'registry/repo';
      r.services = { web: { image: 'web', imageDigest: '' } };
      assert.throws(() => tiers.sondesRelease(r, { manifest: manifest(), run }));
      const m = manifest();
      for (const service of Object.values(tiers.SERVICES_PAR_TIER).flat()) {
        r.services[service] = { image: service, imageDigest: '' };
        m.services.push({ ...m.services[0], service, image: service });
      }
      assert.equal(
        tiers.sondesRelease(r, { manifest: m, run }).every((s) => s.servi === source),
        true,
      );
    },
  ],
  [
    'CLI obtains chart digest proof even with a legacy-tag workspace agent',
    () =>
      repositoryFixture(({ bin, old, current, invoke }) => {
        const r = release(`registry/workspace-agent:sha-${current.slice(0, 10)}`);
        r.global = { imageTag: old.slice(0, 10), imageRegistry: 'registry/repo' };
        r.services = { web: { image: 'web', imageTag: 'not-a-source-tag', imageDigest: digest } };
        const m = manifest();
        m.services = [{ ...m.services[0], service: 'web', image: 'web', sourceSha: old }];
        installReleaseProof(bin, r, m);
        const result = invoke('--configured-only');
        assert.equal(result.status, 0, result.stderr);
        assert.equal(JSON.parse(result.stdout).services.find((s) => s.service === 'web').servi, old);
      }),
  ],
  [
    'default CLI never claims runtime success; explicit configured-only has narrow exit codes',
    () =>
      repositoryFixture(({ bin, old, current, invoke }) => {
        const r = release();
        r.global.imageTag = old.slice(0, 10);
        const m = manifest();
        m.services[0].sourceSha = current;
        installReleaseProof(bin, r, m);
        const result = invoke();
        assert.equal(result.status, 2, result.stderr);
        const body = JSON.parse(result.stdout);
        assert.equal(body.scope, 'configured-source-references');
        assert.equal(body.runtimeVerification, 'not-performed');
        assert.equal(body.verdict, 'unverified');
        assert.equal(body.configuredSourcesCurrent, true);
        const narrow = invoke('--configured-only');
        assert.equal(narrow.status, 0, narrow.stderr);
        assert.equal(JSON.parse(narrow.stdout).verdict, 'configured-current');
        assert.equal(JSON.parse(narrow.stdout).runtimeVerification, 'not-performed');
      }),
  ],
  [
    'unrelated chart digest cannot inherit a current source tag, even in configured-only mode',
    () =>
      repositoryFixture(({ bin, old, current, invoke }) => {
        const r = release();
        r.global.imageTag = old.slice(0, 10);
        r.global.imageRegistry = 'registry/repo';
        r.services = { web: { image: 'web', imageTag: old.slice(0, 10), imageDigest: `sha256:${'e'.repeat(64)}` } };
        const m = manifest();
        m.services[0].sourceSha = current;
        installReleaseProof(bin, r, m);
        for (const args of [[], ['--configured-only']]) {
          const result = invoke(...args);
          assert.equal(result.status, 2, result.stdout);
          assert.equal(result.stdout, '');
        }
      }),
  ],
  [
    'CLI refreshes stale origin/main and reports the new agent commit as overdue',
    () =>
      repositoryFixture(({ stale, old, current, git, invoke }) => {
        assert.equal(git(stale, 'rev-parse', 'origin/main'), old);
        const result = invoke('--configured-only');
        assert.equal(result.status, 1, result.stderr || result.stdout);
        const rows = JSON.parse(result.stdout).services;
        const agent = rows.find((s) => s.service === 'workspace-agent');
        assert.equal(agent.aJour, false);
        assert.equal(agent.attendu, current.slice(0, 10));
        assert.equal(git(stale, 'rev-parse', 'origin/main'), current);
        assert.equal(rows.filter((s) => !s.aJour).length, 1);
      }),
  ],
  [
    'CLI obtains digest evidence from a verified deploy artifact, including an explicit older run',
    () =>
      repositoryFixture(({ bin, old, invoke }) => {
        writeFileSync(
          join(bin, 'helm'),
          `#!/usr/bin/env node\nconsole.log(${JSON.stringify(
            JSON.stringify({
              ...release(),
              global: { imageTag: old.slice(0, 10) },
            }),
          )});\n`,
          { mode: 0o755 },
        );
        const m = manifest();
        m.services[0].sourceSha = old;
        writeFileSync(
          join(bin, 'gh'),
          `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
if (args[0] === 'api') {
  console.log(JSON.stringify(args[1].includes('/workflows/') ? { workflow_runs: [{ id: 123 }] } : ${JSON.stringify(run)}));
} else if (args[0] === 'run' && args[1] === 'download' && args[2] === '123') {
  const dir = args[args.indexOf('--dir') + 1];
  fs.mkdirSync(path.join(dir, 'release-manifest-test'));
  fs.writeFileSync(path.join(dir, 'release-manifest-test', 'release-manifest.json'), ${JSON.stringify(JSON.stringify(m))});
} else { process.exit(3); }
`,
          { mode: 0o755 },
        );
        for (const args of [[], ['--release-run', '123']]) {
          const result = invoke('--configured-only', ...args);
          assert.equal(result.status, 1, result.stderr);
          const agent = JSON.parse(result.stdout).services.find((s) => s.service === 'workspace-agent');
          assert.equal(agent.servi, old);
          assert.equal(agent.aJour, false);
        }
        const malformed = invoke('--release-run', '../other');
        assert.equal(malformed.status, 2);
        assert.equal(malformed.stdout, '');
      }),
  ],
  [
    'CLI artifact retrieval failure gives no verdict',
    () =>
      repositoryFixture(({ bin, old, invoke }) => {
        writeFileSync(
          join(bin, 'helm'),
          `#!/usr/bin/env node\nconsole.log(${JSON.stringify(
            JSON.stringify({
              ...release(),
              global: { imageTag: old.slice(0, 10) },
            }),
          )});\n`,
          { mode: 0o755 },
        );
        writeFileSync(
          join(bin, 'gh'),
          `#!/usr/bin/env node
if (process.argv[2] === 'api') console.log(${JSON.stringify(JSON.stringify(run))});
else process.exit(1);
`,
          { mode: 0o755 },
        );
        const result = invoke('--release-run', '123');
        assert.equal(result.status, 2);
        assert.equal(result.stdout, '');
      }),
  ],
  [
    'CLI refuses an unavailable remote instead of reporting stale all-current',
    () =>
      repositoryFixture(({ stale, dir, git, invoke }) => {
        git(stale, 'remote', 'set-url', 'origin', join(dir, 'missing.git'));
        const result = invoke();
        assert.equal(result.status, 2);
        assert.equal(result.stdout, '');
        assert.match(result.stderr, /aucun verdict/);
      }),
  ],
];

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  let failed = 0;
  for (const [name, test] of regressionCases) {
    try {
      test();
      console.log(`PASS ${name}`);
    } catch (error) {
      failed += 1;
      console.error(`FAIL ${name}\n${error.stack}`);
    }
  }
  process.exitCode = failed ? 1 : 0;
}
