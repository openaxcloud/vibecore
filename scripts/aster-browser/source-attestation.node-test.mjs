import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {assertRunIdentity,proposedRef,productSha,launchBase,launchPaths} from './source-attestation.mjs';
const sha='a'.repeat(40);
const env={GITHUB_ACTIONS:'true',RUNNER_ENVIRONMENT:'github-hosted',RUNNER_OS:'Linux',GITHUB_EVENT_NAME:'push',GITHUB_RUN_ATTEMPT:'1',GITHUB_REPOSITORY:'openaxcloud/vibecore',GITHUB_REF:proposedRef,GITHUB_WORKFLOW_REF:`openaxcloud/vibecore/.github/workflows/private-runtime-recipe.yml@${proposedRef}`,GITHUB_SHA:sha,GITHUB_WORKFLOW_SHA:sha};
const payload=()=>({ref:proposedRef,before:launchBase,after:sha,head_commit:{id:sha},forced:false,created:false,deleted:false,repository:{id:1229478470,full_name:'openaxcloud/vibecore',private:false}});
test('only immutable one-shot push launch, separate from product SHA',()=>{assert.notEqual(sha,productSha);assertRunIdentity(env,payload());});
for(const [field,value] of [['GITHUB_EVENT_NAME','workflow_dispatch'],['GITHUB_EVENT_NAME','pull_request'],['GITHUB_RUN_ATTEMPT','2'],['GITHUB_RUN_ATTEMPT',undefined],['GITHUB_REF','refs/heads/main'],['GITHUB_WORKFLOW_SHA','b'.repeat(40)],['RUNNER_ENVIRONMENT','self-hosted'],['GITHUB_REPOSITORY','other/vibecore']])test(`reject metadata ${field}=${value}`,()=>assert.throws(()=>assertRunIdentity({...env,[field]:value},payload())));
for(const [field,value] of [['forced',true],['created',true],['deleted',true],['forced',undefined],['before','b'.repeat(40)],['before',sha],['after','b'.repeat(40)],['ref','refs/heads/main'],['head_commit',{id:'b'.repeat(40)}],['repository',{id:1229478470,full_name:'openaxcloud/vibecore',private:true}],['repository',{id:1,full_name:'openaxcloud/vibecore',private:false}],['repository',{id:1229478470,full_name:'other/vibecore',private:false}]])test(`reject payload ${field}=${JSON.stringify(value)}`,()=>assert.throws(()=>assertRunIdentity(env,{...payload(),[field]:value})));
test('actual event file required; missing/malformed cannot pass',()=>{
 const directory=mkdtempSync(join(tmpdir(),'same-pvc-event-test-'));const path=join(directory,'event.json');
 try{assert.throws(()=>assertRunIdentity({...env,GITHUB_EVENT_PATH:undefined}));writeFileSync(path,JSON.stringify(payload()));assertRunIdentity({...env,GITHUB_EVENT_PATH:path});writeFileSync(path,'{');assert.throws(()=>assertRunIdentity({...env,GITHUB_EVENT_PATH:path}));}finally{rmSync(directory,{recursive:true,force:true});}
});
test('historical event gate unchanged and dedicated attestation occurs before launch',()=>{
 const run=readFileSync(new URL('../private-runtime-recipe/run.ts',import.meta.url),'utf8');
 assert.ok(run.includes("if (process.env.PRIVATE_RUNTIME_SAME_PVC !== '1')"));
 assert.ok(run.includes('assertRecipeEvent(process.env.GITHUB_EVENT_NAME, process.env.GITHUB_REF)'));
 const attestation=run.search(/const sourceAttestation = samePvc\s*\? attestSamePvcSources\(/);
 assert.ok(attestation>=0&&attestation<run.indexOf('async function main'));
 assert.deepEqual([...launchPaths].sort(),[".github/workflows/private-runtime-recipe.yml", "scripts/aster-browser/browser-diagnostics.mjs", "scripts/aster-browser/browser-diagnostics.node-test.mjs", "scripts/aster-browser/journey.pw.ts", "scripts/aster-browser/overlay-files.json", "scripts/aster-browser/runtime-start-observation.spec.ts", "scripts/aster-browser/runtime-start-observation.ts", "scripts/aster-browser/source-attestation.mjs", "scripts/aster-browser/source-attestation.node-test.mjs"]);
});


test('one-shot browser diagnostic staging preserves isolated job envelope',()=>{
 const source=readFileSync(process.env.PRIVATE_RUNTIME_QA_SOURCE_ROOT ? join(process.env.PRIVATE_RUNTIME_QA_SOURCE_ROOT,'.github/workflows/private-runtime-recipe.yml') : new URL('../../.github/workflows/private-runtime-recipe.yml',import.meta.url),'utf8');
 const job=source.slice(source.indexOf('  same-pvc-932:'));
 assert.ok(job.includes(`github.event.before == '${launchBase}'`));
 for(const text of ['runs-on: ubuntu-24.04','timeout-minutes: 90','github.run_attempt == 1','github.event.forced == false','github.event.created == false','github.event.deleted == false','github.event.repository.private == false','E2E_PROVIDER_MODE: absent','persist-credentials: false'])assert.ok(job.includes(text));
 assert.ok(!job.includes('upload-artifact'));
 assert.ok(job.includes('ref: '+productSha));
 const preflight=job.indexOf('node --test --test-concurrency=1 scripts/aster-browser/*.node-test.mjs');
 assert.ok(preflight>=0&&preflight<job.indexOf('Real disposable same-PVC browser regression'));
 assert.ok(job.includes('scripts/aster-browser/runtime-start-observation.spec.ts'));
 assert.ok(job.includes('(cd packages/runtime-remote && pnpm exec vitest run src/identifiant-de-projet.spec.ts)'));
 const config=readFileSync(new URL('./playwright.config.ts',import.meta.url),'utf8');
 assert.ok(config.includes('workers: 1')&&config.includes('retries: 0'));
});
