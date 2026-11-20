/** Fixed outcome only, never emit worker error text or returned deployment fields. */
export function workerCallFailure(error){const text=typeof error?.message==='string'?error.message:'';return /^deploy\.build upstream failed: 4\d\d$/.test(text)?'worker-http-4xx':/^deploy\.build upstream failed: 5\d\d$/.test(text)?'worker-http-5xx':'worker-call-failed';}
const workspaceFailures={NO_USER_CONTEXT:'worker-no-user-context',NO_WEBSOCKET_RUNTIME:'worker-no-websocket-runtime',AGENT_TOKEN_UNAVAILABLE:'worker-agent-token-unavailable',WORKSPACE_UNREACHABLE:'worker-workspace-unreachable',WORKSPACE_QUOTA:'worker-workspace-quota',WORKSPACE_QUOTA_BUSY:'worker-workspace-quota-busy',BUILD_INVOCATION_THREW:'worker-build-invocation-threw'};
export function workerResultFailure(result,id){
 const deployment=result?.deployment;
 if(deployment?.id!==id)return 'worker-result-mismatch';
 if(deployment.status==='READY')return undefined;
 if(deployment.status!=='FAILED')return 'worker-not-ready';
 const logs=Array.isArray(deployment.logs)?deployment.logs.slice(-200):[];
 let lastPhase;
 for(const row of logs){
  const message=typeof row?.message==='string'?row.message.slice(0,8192):'';
  if(row?.level==='error')for(const [code,family]of Object.entries(workspaceFailures))if(message.includes(`[${code}]`))return family;
  const phase=/^\[(prepare|install|build)\]/.exec(message)?.[1];if(phase)lastPhase=phase;
 }
 return lastPhase?`worker-failed-after-${lastPhase}-output`:'worker-result-failed';
}
