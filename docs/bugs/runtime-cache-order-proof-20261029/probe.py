#!/usr/bin/env python3
"""Local cache-order proof with a pre-existing base; no explicit pulls or credential changes."""
import argparse
import json
import os
from pathlib import Path
import re
import subprocess
import uuid


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', required=True, help='New evidence directory (must not exist)')
    options = parser.parse_args()
    output = Path(options.output).resolve()
    output.mkdir(parents=True, exist_ok=False)
    nonce = uuid.uuid4().hex
    docker = ['docker', '--host=unix:///var/run/docker.sock']
    environment = dict(os.environ, DOCKER_BUILDKIT='1', BUILDX_CONFIG=str(output / 'buildx-state'))
    for name in ['DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_TLS', 'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH']:
        environment.pop(name, None)
    # DOCKER_CONFIG, registry credentials and proxy settings are inherited unchanged.
    def invoke(arguments, log):
        result = subprocess.run(arguments, env=environment, text=True, stdout=subprocess.PIPE,
                                stderr=subprocess.STDOUT)
        (output / log).write_text(result.stdout)
        if result.returncode:
            raise RuntimeError(f'Command failed ({result.returncode}); stop without retry. See {log}')
        return result.stdout

    # image inspect does not pull. Abort if this exact local tag is unavailable.
    base = json.loads(invoke(docker + ['image', 'inspect', 'postgres:17-alpine'], 'base-inspect.json'))[0]
    base_id = base['Id']
    if not re.fullmatch(r'sha256:[a-f0-9]{64}', base_id):
        raise RuntimeError('Invalid local base image identity')
    workdir = f'/cache-order-proof-{nonce}'
    # A unique WORKDIR invalidates fixture ancestors from previous runs, without pruning shared cache.
    prefix = f'FROM postgres:17-alpine\nWORKDIR {workdir}\n'
    installation = "RUN mkdir -p system && printf 'identical-system-payload\\n' > system/installed && printf 'unused\\n' > system/remove-me\n"
    cleanup = 'RUN rm -f system/remove-me\n'
    command = 'ARG START_CMD\nENV START_CMD=${START_CMD}\n'
    copy = 'COPY artifact.txt ./artifact.txt\n'
    finish = 'CMD ["sh", "-c", "exec $START_CMD"]\n'
    (output / 'original.Dockerfile').write_text(prefix + command + installation + copy + cleanup + finish)
    (output / 'reordered.Dockerfile').write_text(prefix + installation + cleanup + copy + command + finish)
    (output / '.dockerignore').write_text('*\n!artifact.txt\n!original.Dockerfile\n!reordered.Dockerfile\n')
    runs = []
    cache = {}
    for mode in ['original', 'reordered']:
        for case, start, artifact in [('a', 'printf first', 'artifact-one'),
                                      ('b', 'printf second', 'artifact-one'),
                                      ('c', 'printf second', 'artifact-two')]:
            (output / 'artifact.txt').write_text(artifact + '\n')
            tag = f'cache-order-proof:{nonce}-{mode}-{case}'
            log = f'{mode}-{case}.log'
            current_base = json.loads(invoke(docker + ['image', 'inspect', 'postgres:17-alpine'],
                                            f'{mode}-{case}-base.json'))[0]['Id']
            if current_base != base_id:
                raise RuntimeError('Local base tag changed during experiment; refusing build')
            build = invoke(docker + ['build', '--pull=false', '--network=none', '--progress=plain',
                '--build-arg', f'START_CMD={start}', '-f', str(output / f'{mode}.Dockerfile'),
                '-t', tag, str(output)], log)
            steps, states = {}, {}
            for line in build.splitlines():
                match = re.match(r'(#\d+) \[\d+/\d+\] (.*)', line)
                if match:
                    steps[match[1]] = match[2]
                match = re.match(r'(#\d+) (CACHED|DONE.*)', line)
                if match and match[1] in steps:
                    states[steps[match[1]]] = match[2]
            cache[f'{mode}-{case}'] = states
            image = json.loads(invoke(docker + ['image', 'inspect', tag], f'{mode}-{case}-inspect.json'))[0]
            contents = invoke(docker + ['run', '--rm', '--pull=never', '--network=none',
                '--entrypoint', 'sh', tag, '-c',
                rf'find {workdir} -type f -exec sha256sum {{}} \; | sort'], f'{mode}-{case}-contents.txt')
            runs.append({'mode': mode, 'case': case, 'tag': tag, 'imageId': image['Id'],
                         'config': image['Config'], 'contentChecksums': contents})
            print(f'{mode}-{case}: completed', flush=True)
    (output / 'cache-observations.json').write_text(json.dumps(cache, indent=2))
    for case in ['a', 'b', 'c']:
        first, second = [row for row in runs if row['case'] == case]
        if first['config'] != second['config'] or first['contentChecksums'] != second['contentChecksums']:
            raise RuntimeError(f'Final configuration or fixture content differs for {case}')
    for mode in ['original', 'reordered']:
        for case in ['a', 'b', 'c']:
            for instruction in [installation.strip(), cleanup.strip(), copy.strip()]:
                status = cache[f'{mode}-{case}'].get(instruction, '')
                expected_cached = (mode == 'reordered' and case == 'b') or (
                    case == 'c' and (instruction == installation.strip() or
                                     (mode == 'reordered' and instruction == cleanup.strip())))
                if (expected_cached and status != 'CACHED') or (not expected_cached and not status.startswith('DONE')):
                    raise RuntimeError(f'Unexpected cache state {mode}-{case}: {instruction}: {status}')
    (output / 'receipt.json').write_text(json.dumps({
        'baseImage': base_id, 'nonce': nonce, 'allPairedConfigsEqual': True,
        'allPairedFixtureContentsEqual': True, 'cacheAssertionsPassed': True, 'runs': runs,
    }, indent=2))
    print('PASS: paired configs, fixture files and cache assertions; no production timing claim')


if __name__ == '__main__':
    main()
