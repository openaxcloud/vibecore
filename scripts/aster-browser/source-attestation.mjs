import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync,lstatSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
export const productSha='5d352aaf354b6098b0a2ad4283b4ba48d76f9ad7';
export const proposedRef='refs/heads/qa/vibecore-same-pvc-932';
const workflow='openaxcloud/vibecore/.github/workflows/private-runtime-recipe.yml';
const git=(cwd,...args)=>execFileSync('git',['-C',cwd,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trimEnd();
const hash=(value)=>createHash('sha256').update(value).digest('hex');
export function assertRunIdentity(env){
  assert.equal(env.GITHUB_ACTIONS,'true');assert.equal(env.RUNNER_ENVIRONMENT,'github-hosted');assert.equal(env.RUNNER_OS,'Linux');
  assert.equal(env.GITHUB_EVENT_NAME,'workflow_dispatch');assert.equal(env.GITHUB_REPOSITORY,'openaxcloud/vibecore');
  assert.equal(env.GITHUB_REF,proposedRef);assert.equal(env.GITHUB_WORKFLOW_REF,`${workflow}@${proposedRef}`);
  assert.match(env.GITHUB_SHA??'',/^[a-f0-9]{40}$/);assert.equal(env.GITHUB_WORKFLOW_SHA,env.GITHUB_SHA);
}
export function attestSamePvcSources(env=process.env,cwd=process.cwd(),cleanup=false){
  assertRunIdentity(env);assert.ok(env.PRIVATE_RUNTIME_QA_SOURCE_ROOT);
  const source=resolve(env.PRIVATE_RUNTIME_QA_SOURCE_ROOT),product=resolve(cwd);assert.notEqual(source,product);
  assert.equal(git(source,'rev-parse','HEAD'),env.GITHUB_WORKFLOW_SHA);
  assert.equal(git(source,'status','--porcelain','--untracked-files=no'),'','QA_SOURCE_DIRTY');
  assert.equal(git(product,'rev-parse','HEAD'),productSha);
  assert.equal(git(product,'rev-parse','--abbrev-ref','HEAD'),'HEAD','PRODUCT_NOT_DETACHED');
  const paths=JSON.parse(git(source,'show','HEAD:scripts/aster-browser/overlay-files.json'));
  assert.ok(Array.isArray(paths)&&paths.length>0);assert.equal(new Set(paths).size,paths.length);
  for(const path of paths){
    assert.match(path,/^scripts\/(aster-browser|private-runtime-recipe)\/[a-zA-Z0-9_.-]+$/);
    const file=join(product,path);assert.ok(lstatSync(file).isFile()&&!lstatSync(file).isSymbolicLink());
    const expected=execFileSync('git',['-C',source,'show',`HEAD:${path}`]);
    assert.equal(hash(readFileSync(file)),hash(expected),`QA_OVERLAY_MISMATCH:${path}`);
  }
  const changed=[...git(product,'diff','HEAD','--name-only','-z').split('\0'),...git(product,'ls-files','--others','--exclude-standard','-z').split('\0')].filter(Boolean);
  for(const path of changed){
    const generatedEvidence=cleanup&&(path.startsWith('private-runtime-evidence/')||path.startsWith('scripts/aster-browser/aster-browser-results/'));
    assert.ok(paths.includes(path)||generatedEvidence,`NON_QA_PRODUCT_CHANGE:${path}`);
  }
  return {productSha,workflowSha:env.GITHUB_WORKFLOW_SHA,workflowRef:env.GITHUB_WORKFLOW_REF,harnessManifestHash:hash(JSON.stringify(paths))};
}
