import test from 'node:test';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {readFileSync} from 'node:fs';
import {assertRunIdentity,productSha,proposedRef,reviewedOverlay,launchPaths} from './source-attestation.mjs';
const sha='f'.repeat(40);
const env={GITHUB_ACTIONS:'true',RUNNER_ENVIRONMENT:'github-hosted',RUNNER_OS:'Linux',GITHUB_EVENT_NAME:'push',GITHUB_RUN_ATTEMPT:'1',GITHUB_REPOSITORY:'openaxcloud/vibecore',GITHUB_REF:proposedRef,GITHUB_WORKFLOW_REF:`openaxcloud/vibecore/.github/workflows/ide-bootstrap-once.yml@${proposedRef}`,GITHUB_SHA:sha,GITHUB_WORKFLOW_SHA:sha};
const event={ref:proposedRef,before:productSha,after:sha,head_commit:{id:sha},forced:false,created:false,deleted:false,repository:{full_name:'openaxcloud/vibecore',id:1229478470,private:false}};
test('only exact public first fast-forward push is eligible; creation rerun dispatch and force fail',()=>{
 assertRunIdentity(env,event);
 for(const extra of [{GITHUB_EVENT_NAME:'workflow_dispatch'},{GITHUB_RUN_ATTEMPT:'2'},{GITHUB_REF:'refs/heads/main'},{RUNNER_ENVIRONMENT:'self-hosted'},{GITHUB_WORKFLOW_SHA:productSha}])assert.throws(()=>assertRunIdentity({...env,...extra},event));
 for(const extra of [{created:true},{forced:true},{deleted:true},{before:'0'.repeat(40)},{before:'e'.repeat(40)},{repository:{...event.repository,private:true}},{repository:{...event.repository,id:1}}])assert.throws(()=>assertRunIdentity(env,{...event,...extra}));
});
test('reviewed manifest is unique and workflow uses bounded standard runner without dispatch or upload',()=>{
 assert.deepEqual(JSON.parse(readFileSync(new URL('./overlay-files.json',import.meta.url))),reviewedOverlay);assert.equal(new Set(launchPaths).size,launchPaths.length);
 // Read immutable QA checkout in dual mode, otherwise local candidate source.
 const root=process.env.PRIVATE_RUNTIME_QA_SOURCE_ROOT??process.cwd();const workflow=readFileSync(root+'/.github/workflows/ide-bootstrap-once.yml','utf8');
 assert.match(workflow,/runs-on: ubuntu-24\.04/);assert.match(workflow,/timeout-minutes: 90/);assert.match(workflow,/github\.event\.created == false/);assert.match(workflow,/github\.run_attempt == 1/);
 assert.doesNotMatch(workflow,/workflow_dispatch:|upload-artifact|secrets\.|contents: write|pull_request_target|self-hosted/);
 assert.match(workflow,/--expect-observation/);assert.match(workflow,/if: always\(\)/);
});
test('safe wrapper never forwards raw stdout/stderr and requires proof plus clean exit',()=>{
 const wrapper=new URL('./safe-run.mjs',import.meta.url).pathname;
 const proof=JSON.stringify({stage:'ide-entry-probe',status:'observed'});
 for(const [body,ok]of [["console.log('PRIVATE-RAW');console.error('PRIVATE-RAW')",false],[`console.log(${JSON.stringify(proof)});console.log('PRIVATE-RAW')`,true],[`console.log(${JSON.stringify(proof)});process.exit(1)`,false]]){
  const r=spawnSync(process.execPath,[wrapper,'--expect-observation',process.execPath,'-e',body],{encoding:'utf8'});assert.equal(r.status,ok?0:1);assert.ok(!r.stdout.includes('PRIVATE-RAW'));assert.ok(!r.stderr.includes('PRIVATE-RAW'));assert.equal(JSON.parse(r.stdout.trim()).status,ok?'observed':'failed');
 }
});
