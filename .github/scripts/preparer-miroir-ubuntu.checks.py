"""Offline contracts for command-scoped official Ubuntu package sources."""

import importlib.util, os, subprocess, tempfile, unittest
from pathlib import Path
BASE = Path(__file__).resolve().parent
ROOT = BASE.parents[1]
spec = importlib.util.spec_from_file_location('mirror', ROOT / '.github/scripts/preparer-miroir-ubuntu.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

class Contracts(unittest.TestCase):

    def test_source_copy_keeps_trust_and_host_unchanged(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / 'host'
            temp = Path(directory) / 'temp'
            temp.mkdir()
            apt = root / 'etc/apt'
            (apt / 'sources.list.d').mkdir(parents=True)
            (root / 'etc/os-release').write_text('ID=ubuntu\n')
            data = {'sources.list': 'deb [signed-by=/usr/share/keyrings/ubuntu-archive-keyring.gpg] http://azure.archive.ubuntu.com/ubuntu noble main\n', 'apt-mirrors.txt': 'http://azure.archive.ubuntu.com/ubuntu/\n', 'sources.list.d/ubuntu.sources': 'Types: deb\nURIs: http://azure.archive.ubuntu.com/ubuntu\nSuites: noble noble-updates\nComponents: main universe\nSigned-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg\n\nTypes: deb\nURIs: https://security.ubuntu.com/ubuntu\nSuites: noble-security\nComponents: main\nSigned-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg\n', 'sources.list.d/vendor.list': 'deb https://example.org/packages stable main\n', 'sources.list.d/mirror.list': 'deb mirror+file:/etc/apt/apt-mirrors.txt noble main\n'}
            for name, value in data.items():
                (apt / name).write_text(value)
            config = m.prepare_temporary(root, temp)
            copied = config.parent / 'etc/apt'
            for name, value in data.items():
                self.assertEqual((apt / name).read_text(), value)
            self.assertIn('https://archive.ubuntu.com/ubuntu', (copied / 'sources.list').read_text())
            self.assertEqual((copied / 'sources.list.d/vendor.list').read_text(), data['sources.list.d/vendor.list'])
            sources = (copied / 'sources.list.d/ubuntu.sources').read_text()
            self.assertIn('Signed-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg', sources)
            self.assertIn('https://security.ubuntu.com/ubuntu', sources)
            self.assertEqual(config.parent.stat().st_mode & 511, 493)
            self.assertEqual(config.stat().st_mode & 292, 292)
            self.assertNotIn('mirror+file:', (copied / 'sources.list.d/mirror.list').read_text())
            output = subprocess.check_output(['apt-config', 'dump'], env={**os.environ, 'APT_CONFIG': str(config)}, text=True)
            for expected in ['Acquire::Retries "2"', 'APT::Update::Error-Mode "any"', str(copied / 'sources.list')]:
                self.assertIn(expected, output)
            for generated in [config, config.parent / 'apt-final.conf']:
                self.assertNotRegex(generated.read_text(), '(?i)allowunauthenticated|verify-peer|verify-host|trusted|insecure')

    def test_final_options_override_hosted_fragments_without_losing_system_settings(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / 'host'
            temp = Path(directory) / 'temp'
            temp.mkdir()
            apt = root / 'etc/apt'
            parts = apt / 'apt.conf.d'
            parts.mkdir(parents=True)
            (root / 'etc/os-release').write_text('ID=ubuntu\n')
            hosted = parts / '80-hosted-defaults'
            hosted_content = (
                'Acquire::Retries "1";\n'
                'Acquire::https::Timeout "120";\n'
                'Acquire::http::Timeout "120";\n'
                'APT::Update::Error-Mode "persistent";\n'
                'Dir::Etc::sourceparts "/host/original.parts";\n'
                'Dir::Etc::sourcelist "/host/original.list";\n'
                'Acquire::https::Verify-Peer "true";\n'
            )
            hosted.write_text(hosted_content)
            system_main = apt / 'apt.conf'
            main_content = 'Acquire::Retries "4";\nAcquire::https::Verify-Host "true";\n'
            system_main.write_text(main_content)
            config = m.prepare_temporary(root, temp)
            # Redirect only this fixture's fragment directory. No host file changes.
            fixture_parts = f'Dir::Etc::parts "{parts}";\n'
            config.write_text(config.read_text() + fixture_parts)
            output = subprocess.check_output(
                ['apt-config', 'dump'], env={**os.environ, 'APT_CONFIG': str(config)}, text=True,
            )
            for expected in ['Acquire::Retries "2"', 'Acquire::https::Timeout "30"',
                             'Acquire::http::Timeout "30"', 'APT::Update::Error-Mode "any"',
                             str(config.parent / 'etc/apt/sources.list.d'),
                             'Acquire::https::Verify-Peer "true"',
                             'Acquire::https::Verify-Host "true"',
                             str(config.parent / 'etc/apt/sources.list')]:
                self.assertIn(expected, output)
            self.assertEqual(hosted.read_text(), hosted_content)
            self.assertEqual(system_main.read_text(), main_content)
            # Negative control reproduces the old ordering, without changing any
            # installed APT configuration or running an update/download/install.
            legacy = temp / 'legacy.conf'
            legacy.write_text(fixture_parts + 'Dir::Etc::main "missing.conf";\n'
                              + 'Acquire::Retries "2";\n')
            legacy_output = subprocess.check_output(
                ['apt-config', 'dump'], env={**os.environ, 'APT_CONFIG': str(legacy)}, text=True,
            )
            self.assertIn('Acquire::Retries "1"', legacy_output)

    def test_exact_hosts_only_and_idempotence(self):
        s = 'deb https://azure.archive.ubuntu.com.evil/ubuntu noble main\ndeb http://azure.archive.ubuntu.com/ubuntu noble main\n# azure.archive.ubuntu.com\n'
        changed = m.rewrite(s, 'list')
        self.assertIn('https://azure.archive.ubuntu.com.evil/ubuntu', changed)
        self.assertEqual(changed, m.rewrite(changed, 'list'))

    def test_mirror_file_rewrite_requires_exact_uri(self):
        mapping = {'mirror+file:/etc/apt/apt-mirrors.txt': 'https://archive.ubuntu.com/ubuntu'}
        source = 'deb mirror+file:/etc/apt/apt-mirrors.txt.other noble main\n'
        self.assertEqual(m.rewrite(source, 'list', mapping), source)

    def test_scope_guard_rejects_non_hosted(self):
        r = subprocess.run(['python3', str(ROOT / '.github/scripts/preparer-miroir-ubuntu.py'), '--temporary'], env={**os.environ, 'RUNNER_ENVIRONMENT': 'self-hosted'}, capture_output=True, text=True)
        self.assertNotEqual(r.returncode, 0)
        self.assertIn('GitHub-hosted', r.stderr)
if __name__ == '__main__':
    unittest.main(verbosity=2)
