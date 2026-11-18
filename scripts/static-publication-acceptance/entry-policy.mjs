/** Ordinary exact-owned application bootstrap; the driver never edits/publishes. */
export function entryRequestDecision(url,method,body,f){try{
 const u=new URL(url);if(u.origin!==f.web||u.username||u.password)return 'blocked-origin';
 const persistedProposalRead=['GET','HEAD'].includes(method)&&u.pathname===`/api/projects/${f.projectId}/agent-patch-proposals`;
 if(u.pathname.startsWith('/api/')&&/\/deployments(\/|-|$)/.test(u.pathname))return 'blocked-publication';
 if(!persistedProposalRead&&u.pathname.startsWith('/api/')&&/\/(chat|generate|agent|llm|ai|completion|completions)(\/|-|$)/.test(u.pathname))return 'blocked-ai';
 const prefix='/api/runtime/workspaces/';
 if(u.pathname.startsWith(prefix)&&u.pathname.split('/')[4]!==f.workspaceId)return 'blocked-workspace';
 if(['GET','HEAD','OPTIONS'].includes(method))return 'allowed';
 if(method==='POST'&&u.pathname==='/api/runtime/workspaces')return body?.workspaceId===f.workspaceId&&(!body.metadata?.projectId||body.metadata.projectId===f.projectId)&&(!body.metadata?.workspaceId||body.metadata.workspaceId===f.workspaceId)?'allowed':'blocked-workspace';
 if(method==='POST'&&u.pathname==='/api/runtime/runtime/boot')return 'allowed';
 // Cold bootstrap reseed legitimately deletes stale files and imports the saved archive.
 // Scope these ordinary app requests to the exact owned workspace; no driver write is added.
 return u.pathname.startsWith(prefix+f.workspaceId+'/')?'allowed':'blocked-mutation';
}catch{return 'blocked-origin';}}
export function entryRequestAllowed(...args){return entryRequestDecision(...args)==='allowed';}
