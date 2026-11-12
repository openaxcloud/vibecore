#!/usr/bin/env python3
"""Stop only the staged k3s server for this disposable run, using pidfd identity."""
import os
from pathlib import Path
import select
import signal
import sys


def owns(arguments, executable, kubeconfig):
    return (len(arguments) >= 4 and arguments[0] == executable
            and arguments[1] == 'server'
            and any(arguments[i:i + 2] == ['--write-kubeconfig', kubeconfig]
                    for i in range(2, len(arguments) - 1)))


def stop(kubeconfig, executable):
    for entry in Path('/proc').iterdir():
        if not entry.name.isdigit():
            continue
        try:
            fd = os.pidfd_open(int(entry.name))
        except ProcessLookupError:
            continue
        try:
            poll = select.poll()
            poll.register(fd, select.POLLIN)
            if poll.poll(0):
                continue
            try:
                arguments = (entry / 'cmdline').read_bytes().decode().strip('\0').split('\0')
            except FileNotFoundError:
                continue
            if not owns(arguments, executable, kubeconfig) or poll.poll(0):
                continue
            signal.pidfd_send_signal(fd, signal.SIGTERM)
            if not poll.poll(10000):
                signal.pidfd_send_signal(fd, signal.SIGKILL)
                if not poll.poll(2000):
                    raise RuntimeError('Runtime stop unconfirmed')
        except ProcessLookupError:
            pass
        finally:
            os.close(fd)


if __name__ == '__main__':
    kubeconfig, manifest = sys.argv[1:]
    import json
    digest = json.loads(Path(manifest).read_text())['assetSha256']
    if len(digest) != 64 or any(c not in '0123456789abcdef' for c in digest):
        raise ValueError('Invalid pinned runtime digest')
    stop(kubeconfig, f'/var/lib/rancher/k3s/data/{digest}/bin/k3s')
