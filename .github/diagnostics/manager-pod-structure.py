"""Temporary fixed-target read. No raw response, provider messages or retries."""
import datetime
import json
import os
import re
import subprocess
import sys

EXPIRY = datetime.datetime(2026, 11, 5, 23, 59, tzinfo=datetime.timezone.utc)
COMMAND = [
    'kubectl', '-n', 'vibecore', 'get', 'pods',
    '-l', 'app.kubernetes.io/name=workspace-manager,app.kubernetes.io/instance=vibecore',
    '--request-timeout=20s', '-o', 'json',
]


def preflight():
    if (os.getenv('GITHUB_REPOSITORY') != 'openaxcloud/vibecore'
            or os.getenv('GITHUB_REF') != 'refs/heads/main'
            or os.getenv('GITHUB_EVENT_NAME') != 'workflow_dispatch'
            or os.getenv('GITHUB_RUN_ATTEMPT') != '1'
            or datetime.datetime.now(datetime.timezone.utc) >= EXPIRY
            or not re.fullmatch(r'[a-z][a-z0-9-]{4,61}[a-z0-9]', os.getenv('GCP_PROJECT_ID', ''))):
        raise ValueError('preflight')


def identity(value):
    return value if isinstance(value, str) and re.fullmatch(r'[a-z0-9][a-z0-9.-]{0,252}', value) else None


def container_states(status, field):
    values = status.get(field)
    if values is None:
        return {'shape': 'absent'}
    if not isinstance(values, list):
        return {'shape': 'invalid'}
    rows = []
    for value in values[:16]:
        item = value if isinstance(value, dict) else {}
        state = item.get('state')
        state = state if isinstance(state, dict) else {}
        stopped = state.get('terminated')
        rows.append({
            'ready': item.get('ready') if type(item.get('ready')) is bool else None,
            'running': state.get('running') is not None,
            'waiting': state.get('waiting') is not None,
            'terminated': isinstance(stopped, dict),
            'integerExitCode': isinstance(stopped, dict) and type(stopped.get('exitCode')) is int,
        })
    return {'shape': 'array', 'count': len(values), 'truncated': len(values) > 16, 'states': rows}


def sanitize(data):
    pods = data['items']
    if not isinstance(pods, list):
        raise ValueError('items')
    rows = []
    for pod in pods[:32]:
        status = pod.get('status') or {}
        meta = pod.get('metadata') or {}
        conditions = status.get('conditions')
        ready = [c.get('status') if c.get('status') in ('True', 'False', 'Unknown') else 'Other'
                 for c in (conditions if isinstance(conditions, list) else [])
                 if isinstance(c, dict) and c.get('type') == 'Ready']
        owners = meta.get('ownerReferences') or []
        rows.append({
            'name': identity(meta.get('name')),
            'owners': [identity(o.get('name')) for o in owners[:2] if o.get('kind') == 'ReplicaSet'],
            'phase': status.get('phase') if status.get('phase') in ('Pending', 'Running', 'Succeeded', 'Failed', 'Unknown') else 'Other',
            'deleting': bool(meta.get('deletionTimestamp')),
            'specContainerCount': len(pod.get('spec', {}).get('containers', [])),
            'conditionsShape': 'absent' if conditions is None else 'array' if isinstance(conditions, list) else 'invalid',
            'ready': ready[:4],
            **{field: container_states(status, field) for field in
               ('containerStatuses', 'initContainerStatuses', 'ephemeralContainerStatuses')},
        })
    return {'total': len(pods), 'truncated': len(pods) > 32, 'pods': rows}


def collect():
    # Capture both streams. Never forward provider failures or raw API JSON.
    result = subprocess.run(COMMAND, capture_output=True, timeout=25, check=False)
    if result.returncode != 0:
        raise ValueError('command')
    if len(result.stdout) > 8 * 1024 * 1024:
        raise ValueError('size')
    report = sanitize(json.loads(result.stdout))
    print(json.dumps(report, separators=(',', ':')))


def main():
    try:
        preflight()
        if sys.argv[1:] == ['--preflight']:
            print('MANAGER_DIAGNOSTIC_PREFLIGHT_OK')
            return 0
        if sys.argv[1:]:
            raise ValueError('arguments')
        collect()
        return 0
    except Exception:
        print('MANAGER_DIAGNOSTIC_FAILED', file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
