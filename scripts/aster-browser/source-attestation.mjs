import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync,lstatSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
export const launchBase='d9ffba6a2ca608328ffaabc1ac82a975fa195cd4';
export const launchPaths=[".github/workflows/private-runtime-recipe.yml", "scripts/aster-browser/browser-diagnostics.d.mts", "scripts/aster-browser/browser-diagnostics.mjs", "scripts/aster-browser/browser-diagnostics.node-test.mjs", "scripts/aster-browser/browser-reporter.ts", "scripts/aster-browser/diagnostics.node-test.mjs", "scripts/aster-browser/journey.pw.ts", "scripts/aster-browser/overlay-files.json", "scripts/aster-browser/playwright.config.ts", "scripts/aster-browser/source-attestation.mjs", "scripts/aster-browser/source-attestation.node-test.mjs", "scripts/private-runtime-recipe/diagnostics.mjs", "scripts/private-runtime-recipe/run.ts"];
export const productSha='5d352aaf354b6098b0a2ad4283b4ba48d76f9ad7';
export const proposedRef='refs/heads/qa/vibecore-same-pvc-932';
const workflow='openaxcloud/vibecore/.github/workflows/private-runtime-recipe.yml';
const git=(cwd,...args)=>execFileSync('git',['-C',cwd,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trimEnd();
const hash=(value)=>createHash('sha256').update(value).digest('hex');
function readPushEvent(env){
  assert.ok(env.GITHUB_EVENT_PATH, 'PUSH_EVENT_PATH_REQUIRED');
  const stat=lstatSync(env.GITHUB_EVENT_PATH);
  assert.ok(stat.isFile()&&!stat.isSymbolicLink()&&stat.size<=1024*1024, 'INVALID_PUSH_EVENT_FILE');
  return JSON.parse(readFileSync(env.GITHUB_EVENT_PATH,'utf8'));
}
export function assertRunIdentity(env,event=readPushEvent(env)){
  assert.equal(env.GITHUB_ACTIONS,'true');assert.equal(env.RUNNER_ENVIRONMENT,'github-hosted');assert.equal(env.RUNNER_OS,'Linux');
  assert.equal(env.GITHUB_EVENT_NAME,'push');assert.equal(env.GITHUB_RUN_ATTEMPT,'1');assert.equal(env.GITHUB_REPOSITORY,'openaxcloud/vibecore');
  assert.equal(env.GITHUB_REF,proposedRef);assert.equal(env.GITHUB_WORKFLOW_REF,`${workflow}@${proposedRef}`);
  assert.match(env.GITHUB_SHA??'',/^[a-f0-9]{40}$/);assert.equal(env.GITHUB_WORKFLOW_SHA,env.GITHUB_SHA);
  assert.equal(event.ref,proposedRef);assert.equal(event.before,launchBase);
  assert.equal(event.after,env.GITHUB_SHA);assert.notEqual(event.after,event.before);
  assert.equal(event.head_commit?.id,event.after);
  assert.equal(event.forced,false);assert.equal(event.created,false);assert.equal(event.deleted,false);
  assert.equal(event.repository?.full_name,'openaxcloud/vibecore');
  assert.equal(event.repository?.id,1229478470);assert.equal(event.repository?.private,false);
}
export function attestSamePvcSources(env=process.env,cwd=process.cwd(),cleanup=false){
  assertRunIdentity(env);assert.ok(env.PRIVATE_RUNTIME_QA_SOURCE_ROOT);
  const source=resolve(env.PRIVATE_RUNTIME_QA_SOURCE_ROOT),product=resolve(cwd);assert.notEqual(source,product);
  assert.equal(git(source,'rev-parse','HEAD'),env.GITHUB_WORKFLOW_SHA);
  assert.deepEqual(git(source,'rev-list','--parents','-n','1','HEAD').split(' '),[env.GITHUB_SHA,launchBase],'LAUNCH_MUST_HAVE_EXACT_SINGLE_PARENT');
  const launchChanges=git(source,'diff','--name-only',launchBase,'HEAD').split('\n').filter(Boolean).sort();
  assert.deepEqual(launchChanges,[...launchPaths].sort(),'UNREVIEWED_LAUNCH_PATH_CHANGE');
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

