#!/usr/bin/env python3
"""Exercise a disposable Git repository on two existing, authorized API pods."""
import argparse
import json
import re
import subprocess
import sys

SEED = """
git init -q --bare -b main "$1/remote.git"
git init -q -b main "$1/project"
cd "$1/project"
echo first > proof.txt
git add proof.txt
git -c user.name=Fixture -c user.email=qa@example.invalid commit -qm first
git remote add origin "$1/remote.git"
git push -q origin main
git rev-parse HEAD
"""
ADVANCE = """
cd "$1/project"
test "$(git rev-parse HEAD)" = "$2"
test "$(git remote get-url origin)" = "$1/remote.git"
test "$(cat proof.txt)" = first
echo second >> proof.txt
git add proof.txt
git -c user.name=Fixture -c user.email=qa@example.invalid commit -qm second
git push -q origin main
git rev-parse HEAD
"""
VERIFY = """
cd "$1/project"
test "$(git rev-parse HEAD^)" = "$2"
test "$(git rev-parse HEAD)" = "$3"
test "$(git --git-dir="$1/remote.git" rev-parse refs/heads/main)" = "$3"
test "$(git show HEAD:proof.txt | tail -1)" = second
"""


def run(*args):
    return subprocess.check_output(args, text=True, timeout=90).strip()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for key in ('context', 'namespace', 'claim', 'pod_a', 'pod_b'):
        parser.add_argument(key)
    args = parser.parse_args()
    kubectl = ['kubectl', '--context', args.context, '--namespace', args.namespace]

    def get(kind, name):
        return json.loads(run(*kubectl, 'get', kind, name, '-o', 'json'))

    def replica(name):
        pod = get('pod', name)
        spec = pod['spec']
        api = next(c for c in spec['containers'] if c['name'] == 'api')
        mount = next(m for m in api['volumeMounts'] if m['mountPath'] == '/data/vibecore')
        volume = next(v for v in spec['volumes'] if v['name'] == mount['name'])
        owner = next(o for o in pod['metadata']['ownerReferences'] if o.get('controller') and o['kind'] == 'ReplicaSet')
        ready = any(c['type'] == 'Ready' and c['status'] == 'True' for c in pod['status']['conditions'])
        if (volume['persistentVolumeClaim']['claimName'] != args.claim or not ready
                or mount.get('readOnly') or mount.get('subPath') or mount.get('subPathExpr')):
            raise ValueError('Expected ready API with declared writable project volume')
        return pod['metadata']['uid'], owner['uid']

    a, b = replica(args.pod_a), replica(args.pod_b)
    claim = get('pvc', args.claim)
    if (a[0] == b[0] or a[1] != b[1] or claim['status']['phase'] != 'Bound'
            or 'ReadWriteMany' not in claim['status'].get('accessModes', [])):
        raise ValueError('Expected two distinct replicas and one bound RWX claim')

    def execute(pod, script, *values):
        return run(*kubectl, 'exec', pod, '-c', 'api', '--', 'sh', '-ec',
                   'test "$PROJECT_STORAGE_DIR" = /data/vibecore/projects\n'
                   'export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1 GIT_ALLOW_PROTOCOL=file '
                   'GIT_TERMINAL_PROMPT=0 GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=core.hooksPath '
                   'GIT_CONFIG_VALUE_0=/dev/null\n' + script, 'fixture', *values)

    root = execute(args.pod_a, 'mktemp -d "$PROJECT_STORAGE_DIR/.qa-pvc-XXXXXXXXXX"')
    if not re.fullmatch(r'/data/vibecore/projects/\.qa-pvc-[a-zA-Z0-9]{10}', root):
        raise ValueError('Unexpected temporary directory')
    try:
        first = execute(args.pod_a, SEED, root)
        second = execute(args.pod_b, ADVANCE, root, first)
        execute(args.pod_a, VERIFY, root, first, second)
        if replica(args.pod_a) != a or replica(args.pod_b) != b:
            raise ValueError('Pod identity changed during probe')
    finally:
        execute(args.pod_a, 'rm -rf -- "$1"', root)
    print('PASS', *[a[0], b[0], claim['metadata']['uid'], first, second])


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        sys.exit('FAIL ' + str(exc))
