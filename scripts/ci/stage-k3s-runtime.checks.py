"""Data-only staging tests; no Kubernetes, downloaded code or browser execution."""
import hashlib
import importlib.util
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('stage', Path(__file__).with_name('stage-k3s-runtime.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class BundleTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.source = self.root / 'source'
        (self.source / 'bin').mkdir(parents=True)
        (self.source / 'etc').mkdir()
        for name in ['k3s', 'cni']:
            (self.source / 'bin' / name).write_bytes(b'synthetic data, not executable')
            (self.source / 'bin' / name).chmod(0o755)
        (self.source / 'bin/bridge').symlink_to('cni')
        entries = {}
        for path in self.source.rglob('*'):
            entry = {'mode': path.lstat().st_mode & 0o7777}
            if path.is_symlink():
                entry.update(type='symlink', target='cni')
            elif path.is_dir():
                entry.update(type='directory')
            else:
                entry.update(type='file', sha256=hashlib.sha256(path.read_bytes()).hexdigest())
            entries[path.relative_to(self.source).as_posix()] = entry
        self.manifest = {'assetSha256': 'test-asset', 'entries': entries}

    def test_stage_and_explicit_dispatch(self):
        data, commands = self.root / 'data', self.root / 'commands'
        module.stage(self.source, data, commands, self.manifest)
        module.validate(data / 'test-asset', self.manifest)
        self.assertEqual((data / 'current').resolve(), data / 'test-asset')
        self.assertEqual((data / 'cni/bridge').resolve(), data / 'test-asset/bin/cni')
        wrapper = (commands / 'kubectl').read_text()
        self.assertIn('kubectl "$@"', wrapper)
        self.assertIn(f'{data}/cni:{data}/test-asset/bin:', wrapper)
        self.assertIn('"$PATH"', wrapper)
        self.assertIn(f':{data}/test-asset/bin/aux', wrapper)
        with self.assertRaises(ValueError):
            module.stage(self.source, data, commands, self.manifest)

    def test_bad_hash(self):
        (self.source / 'bin/k3s').write_bytes(b'wrong')
        with self.assertRaisesRegex(ValueError, 'checksum'):
            module.validate(self.source, self.manifest)

    def test_missing_file(self):
        (self.source / 'bin/k3s').unlink()
        with self.assertRaisesRegex(ValueError, 'missing'):
            module.validate(self.source, self.manifest)

    def test_extra_file(self):
        (self.source / 'bin/extra').touch()
        with self.assertRaisesRegex(ValueError, 'unexpected'):
            module.validate(self.source, self.manifest)

    def test_bad_link(self):
        (self.source / 'bin/bridge').unlink()
        (self.source / 'bin/bridge').symlink_to('k3s')
        with self.assertRaisesRegex(ValueError, 'symlink'):
            module.validate(self.source, self.manifest)

    def test_bad_mode(self):
        (self.source / 'bin/k3s').chmod(0o644)
        with self.assertRaisesRegex(ValueError, 'mode'):
            module.validate(self.source, self.manifest)


if __name__ == '__main__':
    unittest.main()
