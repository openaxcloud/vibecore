#!/usr/bin/env python3
"""Validate and stage data only. Never executes the downloaded OCI bundle.

Validation deliberately differs from checking the release launcher ELF: the
pinned official OCI image contains its unpacked runtime. Every bundled file,
mode and symlink below was derived from the SHA256-pinned release ELF's embedded
archive, and compared with the official linux/amd64 OCI image. Source reference:
https://github.com/k3s-io/k3s/blob/f6973cb850e9b245585363d15bde80904ac862fd/cmd/k3s/main.go
The inner cmd/server/main.go explicitly implements the kubectl subcommand.
"""
import hashlib
import json
import os
from pathlib import Path
import shlex
import shutil
import stat
import sys


def validate(source, manifest):
    entries = manifest['entries']
    actual = {p.relative_to(source).as_posix() for p in source.rglob('*')}
    if actual != set(entries):
        raise ValueError('Bundle contains missing or unexpected paths')
    for name, entry in entries.items():
        path = source / name
        if Path(name).is_absolute() or '..' in Path(name).parts:
            raise ValueError('Unsafe manifest path')
        info = path.lstat()
        kind = ('symlink' if stat.S_ISLNK(info.st_mode) else
                'directory' if stat.S_ISDIR(info.st_mode) else
                'file' if stat.S_ISREG(info.st_mode) else 'unsupported')
        if kind != entry['type'] or stat.S_IMODE(info.st_mode) != entry['mode']:
            raise ValueError(f'Bundle type/mode mismatch: {name}')
        if kind == 'symlink' and os.readlink(path) != entry['target']:
            raise ValueError(f'Bundle symlink mismatch: {name}')
        if kind == 'file':
            with path.open('rb') as stream:
                digest = hashlib.file_digest(stream, 'sha256').hexdigest()
            if digest != entry['sha256']:
                raise ValueError(f'Bundle checksum mismatch: {name}')


def stage(source, data, commands, manifest):
    validate(source, manifest)
    # Fresh disposable runner only: never rotate or replace an existing runtime.
    if data.exists():
        raise ValueError('Refusing to replace an existing data directory')
    bundle = data / manifest['assetSha256']
    shutil.copytree(source, bundle, symlinks=True)
    validate(bundle, manifest)
    (data / 'current').symlink_to(bundle)
    cni = data / 'cni'
    cni.mkdir()
    for name, entry in manifest['entries'].items():
        path = Path(name)
        if path.parent == Path('bin') and (path.name == 'cni' or
                (entry['type'] == 'symlink' and entry['target'] == 'cni')):
            (cni / path.name).symlink_to(bundle / 'bin/cni')
    commands.mkdir(parents=True, exist_ok=True)
    # Same default PATH ordering as stageAndRun. This harness does not use
    # --prefer-bundled-bin or alternate --data-dir. Internal multicall symlinks
    # remain intact for containerd/reexec, unlike these explicit host wrappers.
    path_prefix = shlex.quote(f'{cni}:{bundle}/bin:')
    path_suffix = shlex.quote(f':{bundle}/bin/aux')
    for command, args in [('k3s', ''), ('kubectl', 'kubectl ')]:
        wrapper = commands / command
        if wrapper.is_symlink():
            wrapper.unlink()
        wrapper.write_text('#!/bin/sh\n'
                           f'export PATH={path_prefix}"$PATH"{path_suffix}\n'
                           f'exec {shlex.quote(str(bundle / "bin/k3s"))} {args}"$@"\n')
        wrapper.chmod(0o755)


if __name__ == '__main__':
    source, data, commands, manifest_file = map(Path, sys.argv[1:])
    stage(source, data, commands, json.loads(manifest_file.read_text()))
