import { execFileSync } from 'node:child_process';
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

  it('runs before dependency installation only for the existing x64 WebKit canary input', () => {
    const action = parse(readFileSync(join(root, '.github/actions/preparer-pile-e2e/action.yml'), 'utf8'));
    const steps = action.runs.steps;

    const index = steps.findIndex(
      (step: { name?: string }) => step.name === 'Select Ubuntu archive for WebKit dependencies',
    );
    expect(index).toBeGreaterThan(-1);
    expect(steps[index].if).toBe("inputs.navigateurs == 'chromium,webkit' && runner.arch == 'X64'");
    expect(steps[index].run).toBe('sudo python3 .github/scripts/preparer-miroir-ubuntu.py');
    expect(steps.findIndex((step: { name?: string }) => step.name === 'Install Playwright browsers')).toBeGreaterThan(
      index,
    );
    expect(action.inputs.navigateurs.default).toBe('chromium');
  });
});
