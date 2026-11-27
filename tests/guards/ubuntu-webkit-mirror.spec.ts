import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const root = join(__dirname, '../..');
const script = join(root, '.github/scripts/preparer-miroir-ubuntu.py');

function runFixture(path: string, input: string, os = 'ubuntu', architecture = 'x86_64') {
  const directory = mkdtempSync(join(tmpdir(), 'webkit-apt-'));
  const file = join(directory, 'etc/apt', path);

  try {
    mkdirSync(join(directory, 'etc/apt/sources.list.d'), { recursive: true });
    writeFileSync(join(directory, 'etc/os-release'), `ID=${os}\nVERSION_ID="24.04"\n`);
    writeFileSync(file, input);

    const run = () =>
      execFileSync('python3', [
        '-c',
        `
import importlib.util
import sys
sys.dont_write_bytecode = True
from pathlib import Path
from unittest.mock import patch
spec = importlib.util.spec_from_file_location('mirror', sys.argv[1])
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
with patch.object(module.platform, 'machine', return_value=sys.argv[3]):
    module.prepare(Path(sys.argv[2]))
`,
        script,
        directory,
        architecture,
      ]);
    run();

    const first = readFileSync(file, 'utf8');
    run();
    expect(readFileSync(file, 'utf8')).toBe(first);

    return first;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

describe('canonical Ubuntu mirror scoped to WebKit preparation', () => {
  it.each(['http', 'https'])('rewrites only exact %s archive URIs in mirrorlists', (scheme) => {
    const source = `${scheme}://azure.archive.ubuntu.com/ubuntu/\nhttps://security.ubuntu.com/ubuntu\n`;
    expect(runFixture('apt-mirrors.txt', source)).toBe(
      'https://archive.ubuntu.com/ubuntu/\nhttps://security.ubuntu.com/ubuntu\n',
    );
  });

  it('preserves deb822 suites, components, signing keys and secondary URIs', () => {
    const source =
      'Types: deb\nURIs: http://azure.archive.ubuntu.com/ubuntu\n https://security.ubuntu.com/ubuntu\nSuites: noble noble-updates noble-security\nComponents: main universe\nSigned-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg\n';
    expect(runFixture('sources.list.d/ubuntu.sources', source)).toBe(
      source.replace('http://azure.archive.ubuntu.com/ubuntu', 'https://archive.ubuntu.com/ubuntu'),
    );
  });

  it('preserves legacy source options and comments', () => {
    const source =
      '# http://azure.archive.ubuntu.com/ubuntu\ndeb [arch=amd64 signed-by=/keys/ubuntu.gpg] http://azure.archive.ubuntu.com/ubuntu noble main # http://azure.archive.ubuntu.com/ubuntu\n';
    expect(runFixture('sources.list', source)).toBe(
      source.replace('] http://azure.archive.ubuntu.com', '] https://archive.ubuntu.com'),
    );
  });

  it('does not rewrite host suffixes, paths, query strings or third-party repositories', () => {
    const source = [
      'http://azure.archive.ubuntu.com.evil/ubuntu',
      'http://azure.archive.ubuntu.com/ubuntu/pool',
      'http://azure.archive.ubuntu.com/ubuntu?x=1',
      'https://packages.microsoft.com/ubuntu/24.04/prod',
      '# http://azure.archive.ubuntu.com/ubuntu',
    ].join('\n');
    expect(runFixture('apt-mirrors.txt', source)).toBe(source);
  });

  it('leaves non-Ubuntu runners unchanged', () => {
    const source = 'http://azure.archive.ubuntu.com/ubuntu\n';
    expect(runFixture('apt-mirrors.txt', source, 'debian')).toBe(source);
  });

  it('leaves ARM runners unchanged without relying on the test host architecture', () => {
    const source = 'http://azure.archive.ubuntu.com/ubuntu\n';
    expect(runFixture('apt-mirrors.txt', source, 'ubuntu', 'aarch64')).toBe(source);
  });

  it('runs before dependency installation for both valid x64 browser inputs', () => {
    const action = parse(readFileSync(join(root, '.github/actions/preparer-pile-e2e/action.yml'), 'utf8'));
    const steps = action.runs.steps;

    const index = steps.findIndex(
      (step: { name?: string }) => step.name === 'Select Ubuntu archive for browser dependencies',
    );
    expect(index).toBeGreaterThan(-1);
    expect(steps[index].if).toBe(
      "runner.arch == 'X64' && (inputs.navigateurs == 'chromium' || inputs.navigateurs == 'chromium,webkit')",
    );
    expect(steps[index].run).toContain('sudo python3 .github/scripts/preparer-miroir-ubuntu.py');
    expect(steps.findIndex((step: { name?: string }) => step.name === 'Install Playwright browsers')).toBeGreaterThan(
      index,
    );
    expect(action.inputs.navigateurs.default).toBe('chromium');
  });
});

it.each([
  ['.github/actions/preparer-pile-e2e/action.yml', 'Install Playwright browsers'],
  ['.github/workflows/i18n-live-audit.yml', 'Install Playwright Chromium'],
])('%s scopes apt to Ubuntu and restores its sources', (file, installer) => {
  const workflow = parse(readFileSync(join(root, file), 'utf8'));
  const steps = workflow.runs?.steps ?? workflow.jobs['live-audit'].steps;
  const prepare = steps.findIndex((step: { id?: string }) => step.id === 'browser_apt');
  expect(steps[prepare + 1].name).toBe(installer);
  expect(steps[prepare].if).toContain("runner.arch == 'X64'");

  const cleanup = steps[prepare + 2];
  expect(cleanup.if).toBe("always() && steps.browser_apt.outputs.config != ''");

  const directory = mkdtempSync(join(tmpdir(), 'browser-apt-'));
  const apt = join(directory, 'etc/apt');
  const out = join(directory, 'outputs');

  try {
    for (const path of ['apt.conf.d', 'sources.list.d']) {
      mkdirSync(join(apt, path), { recursive: true });
    }
    writeFileSync(join(directory, 'os-release'), 'ID=ubuntu\nVERSION_CODENAME=noble\n');
    writeFileSync(join(directory, 'keyring'), 'fixture');
    writeFileSync(
      join(apt, 'sources.list.d/vendor.list'),
      'deb https://packages.microsoft.com/ubuntu/24.04/prod noble main\n',
    );

    const config = join(directory, 'apt.conf');
    writeFileSync(config, `Dir::Etc "${apt}";\nDir::State::lists "${directory}/lists";\n`);
    mkdirSync(join(directory, 'lists/partial'), { recursive: true });

    const shell = (script: string, env: Record<string, string> = {}) =>
      execFileSync('bash', ['-e', '-o', 'pipefail', '-c', 'sudo() { "$@"; }\n' + script], {
        cwd: root,
        env: { ...process.env, GITHUB_OUTPUT: out, ...env },
      });
    const update = () => {
      /*
       * APT selects the real index URIs without downloading them. The fixture
       * transport fails only when the Microsoft index would actually be requested.
       */
      const result = spawnSync('apt-get', ['--print-uris', 'update'], {
        encoding: 'utf8',
        env: { ...process.env, APT_CONFIG: config },
      });
      expect(result.status, result.stderr).toBe(0);

      return { status: result.stdout.includes('packages.microsoft.com') ? 403 : 200, uris: result.stdout };
    };
    expect(update().status).toBe(403);

    const script = '.github/scripts/select-browser-noble-apt.sh';
    expect(steps[prepare].run).toContain('bash ' + script);
    shell(
      steps[prepare].run
        .replace('bash ' + script, readFileSync(join(root, script), 'utf8'))
        .replaceAll('/etc/os-release', join(directory, 'os-release'))
        .replaceAll('/etc/apt/', apt + '/')
        .replaceAll('/usr/share/keyrings/ubuntu-archive-keyring.gpg', join(directory, 'keyring')),
      { BROWSER_APT_RETRY_STALLS: '', ...steps[prepare].env },
    );

    const paths = Object.fromEntries(
      readFileSync(out, 'utf8')
        .trim()
        .split('\n')
        .map((line) => line.split('=')),
    );

    const aptSettings = execFileSync('apt-config', ['dump'], {
      env: { ...process.env, APT_CONFIG: config },
      encoding: 'utf8',
    });

    if (installer === 'Install Playwright browsers') {
      expect(aptSettings).toContain('Acquire::https::Timeout "30";');
      expect(aptSettings).toContain('Acquire::Retries "1";');
    } else {
      expect(readFileSync(paths.config, 'utf8')).not.toContain('Acquire::');
    }

    const during = update();
    expect(during.status).toBe(200);
    expect([...new Set([...during.uris.matchAll(/'https:\/\/([^/]+)/g)].map((m) => m[1]))].sort()).toEqual([
      'archive.ubuntu.com',
      'security.ubuntu.com',
    ]);

    for (const suite of ['noble', 'noble-updates', 'noble-security']) {
      expect(during.uris).toContain('/dists/' + suite + '/InRelease');
    }

    const sources = readFileSync(paths.sources, 'utf8').trim().split('\n');
    expect(sources).toHaveLength(3);

    for (const line of sources) {
      expect(line).toMatch(
        /^deb \[arch=amd64 signed-by=\/usr\/share\/keyrings\/ubuntu-archive-keyring\.gpg\] https:\/\/[^ ]+ noble(?:-updates|-security)? main universe$/,
      );
    }
    shell(cleanup.run, { BROWSER_APT_CONFIG: paths.config, BROWSER_APT_SOURCES: paths.sources });
    expect(update().status).toBe(403);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
