/** Closed vocabulary only. Never serialize exceptions, HTTP bodies, URLs, IDs or commands. */
export const stages=Object.freeze(["recipe-preflight", "create-local-cluster", "build-local-images", "start-local-dependencies", "migrate-local-postgres", "start-real-api-and-manager", "ide-bootstrap-probe", "cleanup", "hook-preflight", "web-ready", "web-build", "compiled-asset-preflight", "fixture-seed", "gateway-ready", "browser-run", "seed-preflight", "seed-register", "seed-project", "seed-workspace", "seed-runtime", "seed-files", "browser-preflight"]);
const statuses = new Set(['begin','complete','failed']);
const failures = new Set(['none','assertion','timeout','child-exit','http-rejected','receipt-missing','unexpected']);
export function diagnostic(value) {
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 if(Object.keys(value).sort().join(',')!=='failure,kind,stage,status')return null;
 if(value.kind!=='ide-probe-diagnostic'||!stages.includes(value.stage)||!statuses.has(value.status)||!failures.has(value.failure))return null;
 if((value.status==='failed')===(value.failure==='none'))return null;
 return {kind:'ide-probe-diagnostic',stage:value.stage,status:value.status,failure:value.failure};
}
export function emitDiagnostic(stage,status,failure='none') {
 const value=diagnostic({kind:'ide-probe-diagnostic',stage,status,failure});
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
