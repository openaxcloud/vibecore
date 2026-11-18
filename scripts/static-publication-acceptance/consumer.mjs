/** Optional fresh-publish worker only. Never calls redeploy or fabricates deployment rows. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { optIn, exactProduct, readFixture, loopback, assertOwnedJob, ownedRecipe } from './policy.mjs';
import { triggerDeployBuild } from '../../services/worker/src/deploy-jobs.ts';
async function main() {
optIn();exactProduct(); const fixture=readFixture(process.env.VC_STATIC_FIXTURE);
ownedRecipe(fixture.recipe,fixture.web);
loopback(process.env.REDIS_URL,'redis:');
assert.ok(process.env.INTERNAL_API_SHARED_SECRET);
// Never let production helper precedence pick a different destination.
process.env.API_INTERNAL_URL=fixture.api;
const require=createRequire(new URL('../../services/worker/package.json',import.meta.url));
const {Worker,Queue,UnrecoverableError}=require('bullmq');const Redis=require('ioredis');
const connection=new Redis(process.env.REDIS_URL,{maxRetriesPerRequest:null});
const queue=new Queue('deploy-jobs',{connection});
const counts=await queue.getJobCounts('waiting','active','delayed','completed','failed','paused');
assert.ok(Object.values(counts).every(v=>v===0),'DEDICATED_EMPTY_QUEUE_REQUIRED');
let consumed=0;let failed=false;
const worker=new Worker('deploy-jobs',async job=>{
  try {assert.equal(consumed,0);assertOwnedJob(job,fixture);}catch{failed=true;throw new UnrecoverableError('OWNED_STATIC_JOB_REQUIRED');}
  consumed++; job.discard(); // Disable production queue retries for this one-shot acceptance.
  const result=await triggerDeployBuild(job.data);
  assert.equal(result.deployment?.id,job.data.deploymentId);assert.equal(result.deployment?.status,'READY');
  return {status:'ready'};
},{connection,concurrency:1});
const finish=async(code)=>{await worker.close(true);await queue.close();await connection.quit();process.exit(code);};
worker.on('completed',()=>{console.log(JSON.stringify({stage:'fresh-static-worker',status:'completed'}));void finish(0);});
worker.on('failed',()=>{failed=true;console.log(JSON.stringify({stage:'fresh-static-worker',status:'failed'}));void finish(1);});
worker.on('error',()=>{failed=true;void finish(1);});
setTimeout(()=>void finish(1),15*60_000).unref();
process.on('SIGTERM',()=>void finish(failed?1:2));
console.log(JSON.stringify({stage:'fresh-static-worker',status:'waiting'}));

}
main().catch(()=>{console.error(JSON.stringify({stage:'fresh-static-worker',status:'failed'}));process.exit(1);});
