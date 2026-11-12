"""Ownership negatives and a real local pidfd shutdown, without a cluster."""
import importlib.util
import pathlib
import subprocess
import sys
import tempfile

sys.dont_write_bytecode = True
path = pathlib.Path(__file__).with_name('stop-runtime.py')
spec = importlib.util.spec_from_file_location('stop_runtime', path)
runtime = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runtime)
executable = '/var/lib/rancher/k3s/data/' + 'a' * 64 + '/bin/k3s'
kubeconfig = '/tmp/isolated/kubeconfig'
assert runtime.owns([executable, 'server', '--write-kubeconfig', kubeconfig], executable, kubeconfig)
for arguments in [
    [executable, 'agent', '--write-kubeconfig', kubeconfig],
    [executable, 'server', '--write-kubeconfig', kubeconfig + '-other'],
    ['/usr/local/bin/k3s', 'server', '--write-kubeconfig', kubeconfig],
    [executable, 'server', '--write-kubeconfig=' + kubeconfig],
]:
    assert not runtime.owns(arguments, executable, kubeconfig)

# Actual subprocess stop with exact owned argv; no runtime or network.
with tempfile.TemporaryDirectory() as directory:
    script = pathlib.Path(directory) / 'server'
    script.write_text('while :; do :; done\n')
    child = subprocess.Popen(['/bin/sh', 'server', '--write-kubeconfig', kubeconfig], cwd=directory)
    try:
        runtime.stop(kubeconfig, '/bin/sh')
        assert child.wait(timeout=3) == -15
        runtime.stop(kubeconfig, '/bin/sh')
    finally:
        if child.poll() is None:
            child.kill()
            child.wait()
print('Cleanup identity negatives and real owned-process pidfd shutdown passed')
