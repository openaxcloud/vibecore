import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from 'yaml';
import { afterEach, expect, it } from 'vitest';

const steps = parse(readFileSync('.github/workflows/ar-protect-images.yml', 'utf8')).jobs.protect.steps;
const repo = 'example.invalid/fixture/platform';
const apps = 'example.invalid/fixture/apps';
const image = (letter) => repo + '/worker@sha256:' + letter.repeat(64);
const app = apps + '/p-one@sha256:' + 'e'.repeat(64);
let dir;
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function fixture() {
  dir = mkdtempSync(join(tmpdir(), 'retention-'));
  const put = (name, content) => writeFileSync(join(dir, name), content);
  for (const [name, body] of Object.entries({
    kubectl: `case " $* " in
      *" get pods "*) if [ -f "$FX/seen" ] && [ -f "$FX/refresh" ]; then cat "$FX/refresh"; else cat "$FX/pods"; fi; touch "$FX/seen";;
      *" get deployments "*) cat "$FX/templates";;
      *" get configmap "*) cat "$FX/agent";;
      *" get deploy app-one "*) cat "$FX/current";;
      *" get deploy "*) cat "$FX/apps";;
      *) exit 80;; esac`,
    helm: 'cat "$FX/release"',
    gcloud: `case "$1 $2 $3 $4" in
      "artifacts docker tags list") cat "$FX/slots";;
      "artifacts docker tags add")
        echo "$5 $6" >>"$FX/writes"
        if [ "$5" = "$MISSING" ]; then echo "FAILED_PRECONDITION: the referenced version does not exist" >&2; exit 1; fi;;
      *) exit 81;; esac`,
  })) {
    put(name, '#!/bin/bash\nset -eu\n' + body);
    chmodSync(join(dir, name), 0o755);
  }
  function pod(phase, kind, img) {
    return { metadata: { ownerReferences: [{ kind }] }, status: { phase }, spec: { containers: [{ name: 'worker', image: img }] } };
  }
  const active = pod('Running', 'ReplicaSet', image('a'));
  active.status.containerStatuses = [{ name: 'worker', imageID: 'docker-pullable://' + image('a') }];
  put('pods', JSON.stringify({ items: [active, pod('Pending', 'Job', image('b')), pod('Succeeded', 'Job', image('c')), pod('Failed', 'ReplicaSet', image('c'))] }));
  put('templates', JSON.stringify({ items: [{ spec: { replicas: 0, template: { spec: { containers: [{ image: image('d') }] } } } }] }));
  put('agent', JSON.stringify({ data: { WORKSPACE_AGENT_IMAGE: repo + '/workspace-agent:v1' } }));
  put('release', JSON.stringify({ global: {}, services: { worker: { enabled: true, image: 'worker', imageTag: 'old', imageDigest: 'sha256:' + 'd'.repeat(64) } } }));
  put('slots', 'running-worker-slot-3\nhelm-active-worker-slot-3\nunrelated\n');
  put('apps', 'app-one\t' + app + '\n');
  put('current', app);
  put('writes', '');
  function run(id, env = {}) {
    const step = steps.find((s) => s.id === id || s.name === id);
    return spawnSync('bash', ['-c', step.run], { encoding: 'utf8', env: {
      PATH: dir + ':' + process.env.PATH, FX: dir, REPO_CONTAINERS: repo, REPO_APPS: apps, NAMESPACE: 'fixture', ...env,
    } });
  }
  return { run, put, writes: () => readFileSync(join(dir, 'writes'), 'utf8') };
}

it('protects concurrent versions in keep slots and releases obsolete slot digests', () => {
  const f = fixture();
  expect(f.run('running', { MISSING: image('c') }).status).toBe(0);
  expect(f.writes()).toContain(image('a') + ' ' + repo + '/worker:running-worker\n');
  expect(f.writes()).toContain(image('b') + ' ' + repo + '/worker:running-worker-slot-2\n');
  expect(f.writes()).toContain(image('a') + ' ' + repo + '/worker:running-worker-slot-3\n');
  expect(f.writes()).not.toContain(image('c'));
  expect(f.writes()).not.toContain('helm-active');
  for (const path of ['infra/artifact-registry/cleanup-prod-containers.json', 'infra/supply-chain/ar-cleanup-policies.json']) {
    const keep = JSON.parse(readFileSync(path)).find((rule) => rule.name === 'keep-running-or-helm-active');
    expect(keep.action.type).toBe('Keep');
    expect(keep.condition.tagPrefixes.sort()).toEqual(['helm-active-', 'running-']);
  }
});

it('attempts independent passes and explicitly fails a missing active or desired version', () => {
  const f = fixture();
  for (const id of ['helm_active', 'apps']) {
    expect(steps.find((s) => s.id === id).if).toBe("${{ !cancelled() && steps.cluster.outcome == 'success' }}");
  }
  expect(f.run('running', { MISSING: image('a') }).status).toBe(1);
  expect(f.run('helm_active', { MISSING: image('d') }).status).toBe(1);
  expect(f.writes()).toContain('/workspace-agent:helm-active-workspace-agent');
  expect(f.writes()).not.toContain('/worker:old');
  expect(f.run('apps', { MISSING: app }).status).toBe(1);
  f.put('current', '');
  expect(f.run('apps', { MISSING: app }).status).toBe(0);
  expect(f.run('Verify all retention passes', { RUNNING: 'failure', HELM_ACTIVE: 'success', APPS: 'success' }).status).toBe(1);
  expect(f.run('Verify all retention passes', { RUNNING: 'success', HELM_ACTIVE: 'success', APPS: 'success' }).status).toBe(0);
});

it('accepts an absent running version only after a successful re-list shows it gone', () => {
  const f = fixture();
  f.put('refresh', JSON.stringify({ items: [] }));
  expect(f.run('running', { MISSING: image('a') }).status).toBe(0);
  expect(f.writes()).toContain(image('b'));
});
