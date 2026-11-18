/** Closed vocabulary only. Never serialize exceptions, HTTP bodies, URLs, IDs or commands. */
export const stages = Object.freeze([
 'recipe-preflight','create-local-cluster','build-local-images','start-local-dependencies','migrate-local-postgres','start-real-api-and-manager','static-publication-acceptance','cleanup',
 'web-build','compiled-asset-preflight','worker-queue','worker-build','hook-preflight','web-ready','fixture-seed','gateway-ready','worker-ready','browser-run','worker-completion',
 'seed-preflight','seed-register','seed-project','seed-workspace','seed-runtime','seed-files',
 'browser-preflight','editor-v1','editor-v2','edit-v1','edit-v2','form-v1','form-v2','save-v1','save-v2','post-v1','post-v2','deployment-v1','deployment-v2','anonymous-v1','anonymous-v2',
]);
const statuses = new Set(['begin','complete','failed']);
const failures = new Set(['none','assertion','timeout','child-exit','http-rejected','receipt-missing','route-error','worker-http-4xx','worker-http-5xx','worker-call-failed','worker-result-mismatch','worker-result-failed','worker-not-ready','worker-no-user-context','worker-no-websocket-runtime','worker-agent-token-unavailable','worker-workspace-unreachable','worker-workspace-quota','worker-workspace-quota-busy','worker-build-invocation-threw','worker-failed-after-prepare-output','worker-failed-after-install-output','worker-failed-after-build-output','unexpected']);
export function diagnostic(value) {
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 if(Object.keys(value).sort().join(',')!=='failure,kind,stage,status')return null;
 if(value.kind!=='static-diagnostic'||!stages.includes(value.stage)||!statuses.has(value.status)||!failures.has(value.failure))return null;
 if((value.status==='failed')===(value.failure==='none'))return null;
 return {kind:'static-diagnostic',stage:value.stage,status:value.status,failure:value.failure};
}
export function emitDiagnostic(stage,status,failure='none') {
 const value=diagnostic({kind:'static-diagnostic',stage,status,failure});
 if(value)console.log(JSON.stringify(value));
}
export function failureCode(error) {
 return error?.name==='TimeoutError'||error?.name==='AbortError'?'timeout':error?.name==='AssertionError'?'assertion':'unexpected';
}
export function relayDiagnostics(write=value=>console.log(JSON.stringify(value))) {
 let line='',discard=false,count=0;
 return chunk=>{for(const char of chunk.toString()){
  if(char==='\n'){
   if(!discard){try{const value=diagnostic(JSON.parse(line));if(value&&count++<128)write(value);}catch{}}
   line='';discard=false;
  }else if(!discard){line+=char;if(line.length>512){line='';discard=true;}}
 }};
}
