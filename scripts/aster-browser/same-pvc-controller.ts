import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { promisify } from 'node:util';
import { assertRecipeClusterName, assertRecipeKubeconfig } from '../private-runtime-recipe/checks.js';
import { positiveTreeFence } from './positive-fence.mjs';
const exec = promisify(execFile);
const productSha = '5d352aaf354b6098b0a2ad4283b4ba48d76f9ad7';
/** Node-side only; descriptor from the owned-cluster launcher, never page content. No PVC mutations. */
export async function samePvcController(descriptorPath: string) {
  const d = JSON.parse(readFileSync(descriptorPath, 'utf8'));
  assert.equal(d.productSha, productSha);
  assertRecipeClusterName(d.name);
  assert.equal(d.context, `kind-${d.name}`);
  const kubectl = async (args: string[]) => (await exec('kubectl',
    ['--kubeconfig', d.kubeconfig, '--context', d.context, ...args],
    { timeout: 140_000, maxBuffer: 2 * 1024 * 1024 })).stdout;
  assertRecipeKubeconfig(JSON.parse(await kubectl(['config', 'view', '--raw', '-o', 'json'])), d.name);
  const id = (value: string) => { assert.match(value, /^[a-zA-Z0-9_-]{1,100}$/); return value; };
  const inspect = async (workspaceId: string, proof: string) => {
    const podName = `workspace-${id(workspaceId)}`;
    const pod = JSON.parse(await kubectl(['-n', d.name, 'get', `pod/${podName}`, '-o', 'json']));
    const claim = pod.spec.volumes.find((v: any) => v.persistentVolumeClaim)?.persistentVolumeClaim.claimName;
    assert.ok(claim);
    const pvc = JSON.parse(await kubectl(['-n', d.name, 'get', `pvc/${id(claim)}`, '-o', 'json']));
    const marker = await kubectl(['-n', d.name, 'exec', podName, '-c', 'workspace-agent', '--',
      'node', '-e', "process.stdout.write(require('fs').readFileSync((process.env.WORKSPACE_ROOT||'/workspace')+'/aster-marker.txt'))"]);
    assert.equal(marker, proof);
    return { podUid: pod.metadata.uid, pvcUid: pvc.metadata.uid, claim, workspaceId };
  };
  const snapshot = async () => {
    const list = JSON.parse(await kubectl(['-n', d.name, 'get', 'pods', '-l', 'app=api', '-o', 'json']));
    assert.equal(list.items.length, 1, 'INCONCLUSIVE_MULTIPLE_API_PODS');
    const api = list.items[0];
    assert.equal(api.status.phase, 'Running');
    assert.equal(api.status.containerStatuses.length, 1);
    const container = api.status.containerStatuses[0];
    assert.equal(container.ready, true);
    const process = { uid: api.metadata.uid, restartCount: container.restartCount, containerId: container.containerID };
    assert.ok(process.uid && process.containerId);
    const logs = await kubectl(['-n', d.name, 'logs', api.metadata.name, '-c', container.name]);
    return { process, logs };
  };
  const removeMarker = async (workspaceId: string, proof: string) => {
    const result = await kubectl(['-n', d.name, 'exec', `workspace-${id(workspaceId)}`,
      '-c', 'workspace-agent', '--', 'node', '-e',
      "const f=require('fs');const p=(process.env.WORKSPACE_ROOT||'/workspace')+'/aster-marker.txt';if(f.readFileSync(p,'utf8')!==process.argv[1])throw Error('FIXTURE_NONCE_MISMATCH');f.unlinkSync(p);if(f.existsSync(p))throw Error('MARKER_NOT_REMOVED');process.stdout.write('removed');", proof]);
    assert.equal(result, 'removed');
  };
  const witnessPaths = ['aster-marker.txt', 'orphan/package-lock.json', 'orphan/node_modules/sentinel', 'orphan/.git/sentinel', 'orphan/stale.txt'];
  const readWitnesses = async (workspaceId: string) => JSON.parse(await kubectl(['-n', d.name,
    'exec', `workspace-${id(workspaceId)}`, '-c', 'workspace-agent', '--', 'node', '-e',
    "const f=require('fs'),c=require('crypto'),r=process.env.WORKSPACE_ROOT||'/workspace';const out={};for(const p of JSON.parse(process.argv[1])){try{out[p]=c.createHash('sha256').update(f.readFileSync(r+'/'+p)).digest('hex')}catch(e){if(e.code!=='ENOENT')throw e;out[p]=null}}process.stdout.write(JSON.stringify(out));", JSON.stringify(witnessPaths)]));
  const seedWitnesses = async (workspaceId: string, proof: string) => {
    await inspect(workspaceId, proof);
    await kubectl(['-n', d.name, 'exec', `workspace-${id(workspaceId)}`, '-c', 'workspace-agent', '--', 'node', '-e',
      "const f=require('fs'),p=require('path'),r=process.env.WORKSPACE_ROOT||'/workspace';try{f.lstatSync(r+'/orphan');throw Error('ORPHAN_ALREADY_EXISTS')}catch(e){if(e.code!=='ENOENT')throw e}for(const n of JSON.parse(process.argv[1])){f.mkdirSync(p.dirname(r+'/'+n),{recursive:true});f.writeFileSync(r+'/'+n,process.argv[2]+':'+n,{flag:'wx'})}", JSON.stringify(witnessPaths.slice(1)), proof]);
    return readWitnesses(workspaceId);
  };
  return {
    inspect, readWitnesses, seedWitnesses,
    positiveFence: (identity: { workspaceId: string; projectId: string }, proof: string,
      expected: Awaited<ReturnType<typeof inspect>>, fetchTree: () => Promise<void>) =>
      positiveTreeFence({ inspect, removeMarker, snapshot, identity, proof, expected, fetchTree }),
    waitDeleted: (workspaceId: string) => kubectl(['-n', d.name, 'wait', '--for=delete', `pod/workspace-${id(workspaceId)}`, '--timeout=120s']),
    assertSameVolume(before: Awaited<ReturnType<typeof inspect>>, after: Awaited<ReturnType<typeof inspect>>) {
      assert.notEqual(before.podUid, after.podUid);
      assert.equal(before.workspaceId, after.workspaceId);
      assert.equal(before.pvcUid, after.pvcUid);
      assert.equal(before.claim, after.claim);
    },
  };
}
