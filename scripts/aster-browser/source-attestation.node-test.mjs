import test from 'node:test';import assert from 'node:assert/strict';
import {assertRunIdentity,proposedRef,productSha} from './source-attestation.mjs';
const env={GITHUB_ACTIONS:'true',RUNNER_ENVIRONMENT:'github-hosted',RUNNER_OS:'Linux',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_REPOSITORY:'openaxcloud/vibecore',GITHUB_REF:proposedRef,GITHUB_WORKFLOW_REF:`openaxcloud/vibecore/.github/workflows/private-runtime-recipe.yml@${proposedRef}`,GITHUB_SHA:'a'.repeat(40),GITHUB_WORKFLOW_SHA:'a'.repeat(40)};
test('independent CI commit need not equal product commit',()=>{assert.notEqual(env.GITHUB_SHA,productSha);assertRunIdentity(env);});
for(const [field,value] of [['GITHUB_EVENT_NAME','push'],['GITHUB_REF','refs/heads/main'],['GITHUB_WORKFLOW_SHA','b'.repeat(40)],['RUNNER_ENVIRONMENT','self-hosted'],['GITHUB_REPOSITORY','other/vibecore']])test(`reject changed ${field}`,()=>assert.throws(()=>assertRunIdentity({...env,[field]:value})));
