import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync,lstatSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
export const launchBase='aaaf642064b5eeefc8975ccff9b151ff0beb1ec4';
export const reviewedOverlay = ["scripts/private-runtime-recipe/run.ts", "scripts/static-publication-acceptance/README.md", "scripts/static-publication-acceptance/consumer.mjs", "scripts/static-publication-acceptance/diagnostics.d.mts", "scripts/static-publication-acceptance/diagnostics.mjs", "scripts/static-publication-acceptance/diagnostics.node-test.mjs", "scripts/static-publication-acceptance/dispatch.node-test.mjs", "scripts/static-publication-acceptance/gateway.mjs", "scripts/static-publication-acceptance/hook.d.mts", "scripts/static-publication-acceptance/hook.mjs", "scripts/static-publication-acceptance/install-clients.sh", "scripts/static-publication-acceptance/launch.node-test.mjs", "scripts/static-publication-acceptance/managed-form.spec.tsx", "scripts/static-publication-acceptance/overlay-files.json", "scripts/static-publication-acceptance/playwright.config.ts", "scripts/static-publication-acceptance/policy.d.mts", "scripts/static-publication-acceptance/policy.mjs", "scripts/static-publication-acceptance/policy.node-test.mjs", "scripts/static-publication-acceptance/prepare-overlay.mjs", "scripts/static-publication-acceptance/prior-safe-run.fixture.mjs", "scripts/static-publication-acceptance/publication.pw.ts", "scripts/static-publication-acceptance/reporter.ts", "scripts/static-publication-acceptance/safe-run.mjs", "scripts/static-publication-acceptance/seed.mjs", "scripts/static-publication-acceptance/source-attestation.d.mts", "scripts/static-publication-acceptance/source-attestation.mjs", "scripts/static-publication-acceptance/tsconfig.json"];
export const launchPaths=[".github/workflows/static-publication-once.yml",...reviewedOverlay];
export const productSha='aaaf642064b5eeefc8975ccff9b151ff0beb1ec4';
export const proposedRef='refs/heads/codex/qa-static-publication-fix-20261118';
const workflow='openaxcloud/vibecore/.github/workflows/static-publication-once.yml';
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
export function assertSource(env=process.env){
  assertRunIdentity(env);assert.ok(env.PRIVATE_RUNTIME_QA_SOURCE_ROOT);
  const source=resolve(env.PRIVATE_RUNTIME_QA_SOURCE_ROOT);
  assert.equal(git(source,'rev-parse','HEAD'),env.GITHUB_WORKFLOW_SHA);
  assert.deepEqual(git(source,'rev-list','--parents','-n','1','HEAD').split(' '),[env.GITHUB_SHA,launchBase],'LAUNCH_MUST_HAVE_EXACT_SINGLE_PARENT');
  const launchChanges=git(source,'diff','--name-only',launchBase,'HEAD').split('\n').filter(Boolean).sort();
  assert.deepEqual(launchChanges,[...launchPaths].sort(),'UNREVIEWED_LAUNCH_PATH_CHANGE');
  assert.equal(git(source,'status','--porcelain','--untracked-files=no'),'','QA_SOURCE_DIRTY');
  return source;
}
export function attestStaticSources(env=process.env,cwd=process.cwd(),cleanup=false){
  const source=assertSource(env),product=resolve(cwd);assert.notEqual(source,product);
  assert.equal(git(product,'rev-parse','HEAD'),productSha);
  assert.equal(git(product,'rev-parse','--abbrev-ref','HEAD'),'HEAD','PRODUCT_NOT_DETACHED');
  const paths=JSON.parse(git(source,'show','HEAD:scripts/static-publication-acceptance/overlay-files.json'));
  assert.deepEqual(paths,reviewedOverlay,'OVERLAY_PATHS_NOT_REVIEWED');
  for(const path of paths){
    assert.match(path,/^scripts\/(static-publication-acceptance|private-runtime-recipe)\/[a-zA-Z0-9_.-]+$/);
    const file=join(product,path);assert.ok(lstatSync(file).isFile()&&!lstatSync(file).isSymbolicLink());
    const expected=execFileSync('git',['-C',source,'show',`HEAD:${path}`]);
    assert.equal(hash(readFileSync(file)),hash(expected),`QA_OVERLAY_MISMATCH:${path}`);
  }
  const changed=[...git(product,'diff','HEAD','--name-only','-z').split('\0'),...git(product,'ls-files','--others','--exclude-standard','-z').split('\0')].filter(Boolean);
  for(const path of changed){
    const generatedEvidence=cleanup&&(path.startsWith('private-runtime-evidence/'));
    assert.ok(paths.includes(path)||generatedEvidence,`NON_QA_PRODUCT_CHANGE:${path}`);
  }
  return {productSha,workflowSha:env.GITHUB_WORKFLOW_SHA,workflowRef:env.GITHUB_WORKFLOW_REF,harnessManifestHash:hash(JSON.stringify(paths))};
}

