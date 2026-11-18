/** LOCAL-ONLY observation proposal. No page text/body/headers/URLs are returned or logged. */
const identityValues=new Set(['expected-project-workspace','login','error-route','wrong-workspace','missing-workspace','other-route','off-origin','http-error','unknown']);
const outcomes=new Set(['2xx','3xx','4xx','5xx','other','network-failed']);
const resources=new Set(['archive-json','archive-binary','runtime-ticket','runtime-status','runtime-files','runtime-read']);
export function statusFamily(status){return Number.isInteger(status)&&status>=200&&status<600?`${Math.floor(status/100)}xx`:'other';}
export function classifyDocument(value,status,fixture){
 let sameOrigin=false,identity='unknown';
 try{const url=new URL(value);sameOrigin=url.origin===fixture.web;
  if(url.username||url.password)identity='unknown';
  else if(!sameOrigin)identity='off-origin';
  else if(url.pathname==='/login')identity='login';
  else if(['/error','/403','/404','/500'].includes(url.pathname))identity='error-route';
  else if(status>=400)identity='http-error';
  else if(url.pathname===`/projects/${fixture.projectId}/ide`){
   const workspace=url.searchParams.get('workspace')??url.searchParams.get('workspaceId');
   identity=workspace===fixture.workspaceId?'expected-project-workspace':workspace?'wrong-workspace':'missing-workspace';
  }else identity='other-route';
 }catch{}
 return {kind:'ide-entry-document',sameOrigin,identity,status:statusFamily(status)};
}
function queryKeys(url,allowed){return [...url.searchParams.keys()].every(k=>allowed.includes(k))&&new Set(url.searchParams.keys()).size===[...url.searchParams.keys()].length;}
export function resourceOf(value,method,fixture){
 if(method!=='GET')return null;
 try{const u=new URL(value);if(u.origin!==fixture.web||u.username||u.password||u.hash)return null;
  if(u.pathname===`/api/projects/${fixture.projectId}/export/zip`&&!u.search)return 'archive-json';
  if(u.pathname===`/api/projects/${fixture.projectId}/project-action`&&queryKeys(u,['intent'])&&u.searchParams.get('intent')==='export')return 'archive-binary';
  if(u.pathname==='/api/runtime-token'&&queryKeys(u,['projectId'])&&u.searchParams.get('projectId')===fixture.projectId)return 'runtime-ticket';
  const base=`/api/runtime/workspaces/${fixture.workspaceId}`;
  if(u.pathname===base+'/status'&&!u.search)return 'runtime-status';
  if(u.pathname===base+'/files'&&queryKeys(u,['path','reparer'])&&['.','/home/project'].includes(u.searchParams.get('path')??'.')&&[null,'1'].includes(u.searchParams.get('reparer')))return 'runtime-files';
  if(u.pathname===base+'/files/read'&&queryKeys(u,['path'])&&['index.html','README.md','/home/project/index.html','/home/project/README.md'].includes(u.searchParams.get('path')))return 'runtime-read';
 }catch{}return null;
}
export function safeObservation(value){
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const keys=Object.keys(value).sort().join(',');
 if(value.kind==='ide-entry-document'&&keys==='identity,kind,sameOrigin,status'&&typeof value.sameOrigin==='boolean'&&identityValues.has(value.identity)&&outcomes.has(value.status))return {kind:value.kind,sameOrigin:value.sameOrigin,identity:value.identity,status:value.status};
 if(value.kind==='ide-entry-network'&&keys==='kind,outcome,resource'&&resources.has(value.resource)&&outcomes.has(value.outcome))return {kind:value.kind,resource:value.resource,outcome:value.outcome};
 if(value.kind==='ide-entry-dom'&&keys==='alert,checkpoint,kind,monaco,row,shell,tree'&&['after-document','file-wait-end','after-file-open'].includes(value.checkpoint)&&['alert','monaco','row','shell','tree'].every(k=>typeof value[k]==='boolean'))return {kind:value.kind,checkpoint:value.checkpoint,shell:value.shell,tree:value.tree,row:value.row,monaco:value.monaco,alert:value.alert};
 return null;
}
export function attachIdeEntryObserver(page,fixture,write){
 let firstIssue=null,count=0;const seen=new Set();
 const send=value=>{const safe=safeObservation(value);if(!safe)return;const key=JSON.stringify(safe);if(!seen.has(key)&&count++<40){seen.add(key);write(safe);}};
 const fail=reason=>{firstIssue??=reason;};
 const response=r=>{if(firstIssue)return;const resource=resourceOf(r.url(),r.request().method(),fixture);if(!resource)return;const outcome=statusFamily(r.status());send({kind:'ide-entry-network',resource,outcome});if(['4xx','5xx'].includes(outcome))fail('bootstrap-http-error');};
 const failed=request=>{if(firstIssue)return;const resource=resourceOf(request.url(),request.method(),fixture);if(resource){send({kind:'ide-entry-network',resource,outcome:'network-failed'});fail('bootstrap-network-failed');}};
 page.on('response',response);page.on('requestfailed',failed);
 const stop=()=>{if(firstIssue)throw new Error(firstIssue);};
 return {
  document(response){stop();const result=classifyDocument(page.url(),response?.status(),fixture);send(result);if(result.identity!=='expected-project-workspace')fail('document-identity-unverified');else if(result.status!=='2xx')fail('document-response-unverified');stop();return result;},
  async checkpoint(checkpoint){stop();
   const visible=async locator=>(await locator.filter({visible:true}).count())>0;
   const result={kind:'ide-entry-dom',checkpoint,
    shell:await visible(page.locator('.bolt-project-ide-shell')),
    tree:await visible(page.locator('.bolt-project-files-tool .bolt-project-file-tree')),
    row:await visible(page.getByText('index.html',{exact:true}).and(page.locator('.bolt-file-tree-name'))),
    monaco:await visible(page.locator('.monaco-editor textarea.inputarea')),
    alert:await visible(page.locator('.bolt-project-ide-shell section[role="alert"]'))};
   send(result);if(checkpoint==='file-wait-end'&&!result.row)fail('file-row-unavailable');if(checkpoint==='after-file-open'&&!result.monaco)fail('editor-unavailable');stop();return result;
  },
  assertNoProvenIssue:stop,
  detach(){page.off('response',response);page.off('requestfailed',failed);},
 };
}
