export const EXPECTED='<!doctype html><main id="proof">STATIC-SEED-NOT-PUBLISHED</main>';
const stages=new Set(['request-policy','api-archive','web-archive','web-binary','runtime-ticket','runtime-list','runtime-read','document','ui-initial','ui-final','terminal']);
for(const phase of ['ui-initial','ui-final'])for(const key of ['boundary','pane','files','tree','row'])stages.add(phase+'-'+key);
const results=new Set(['blocked-origin','blocked-publication','blocked-ai','blocked-workspace','blocked-mutation','visible','absent','begin','verified','http-failed','invalid','missing-index','wrong-marker','network-failed','wrong-document','boundary-visible','pane-absent','files-absent','tree-absent','row-absent','editor-ready','browser-failed']);
export function observation(x){
 if(!x||typeof x!=='object'||Object.keys(x).sort().join(',')!=='kind,result,stage')return null;
 return x.kind==='entry-observation'&&stages.has(x.stage)&&results.has(x.result)?{kind:x.kind,stage:x.stage,result:x.result}:null;
}
export function emit(stage,result){const x=observation({kind:'entry-observation',stage,result});if(!x)throw Error('INVALID_OBSERVATION');console.log(JSON.stringify(x));}
export function relay(write=x=>console.log(JSON.stringify(x))){let line='',discard=false,count=0;return chunk=>{for(const c of chunk.toString()){if(c==='\n'){if(!discard){try{const x=observation(JSON.parse(line));if(x&&count++<48)write(x);}catch{}}line='';discard=false;}else if(!discard){line+=c;if(line.length>256){discard=true;line='';}}}};}
export async function archiveResult(bytes){try{const {default:JSZip}=await import('jszip');if(bytes.byteLength>2_000_000)return 'invalid';const zip=await JSZip.loadAsync(bytes);const file=zip.file('index.html');if(!file)return 'missing-index';const content=await file.async('string');return content===EXPECTED?'verified':'wrong-marker';}catch{return 'invalid';}}
export function listResult(value){return Array.isArray(value)?value.some(x=>x?.type==='file'&&(x.path==='index.html'||x.path==='/home/project/index.html'))?'verified':'missing-index':'invalid';}
export function readResult(value){return typeof value?.content!=='string'?'invalid':value.encoding&&value.encoding!=='utf8'?'invalid':value.content===EXPECTED?'verified':'wrong-marker';}
export function uiResult(x){if(x.boundary)return 'boundary-visible';for(const key of ['pane','files','tree','row'])if(!x[key])return key+'-absent';return 'verified';}
export async function semanticReadback(f,fetcher=fetch,report=emit){
 const check=async(stage,url,headers,validate)=>{report(stage,'begin');let result;try{const r=await fetcher(url,{headers,redirect:'manual',signal:AbortSignal.timeout(15_000)});if(r.status!==200)result='http-failed';else{try{result=await validate(r);}catch{result='invalid';}}}catch{result='network-failed';}report(stage,result);if(result!=='verified')throw Error('ENTRY_CHECK_FAILED');};
 const auth={authorization:`Bearer ${f.token}`},cookie={cookie:`vc_session=${f.token}`};
 const jsonZip=async r=>{try{const x=await r.json();if(typeof x?.archive?.base64!=='string'||x.archive.base64.length>2_700_000)return 'invalid';return archiveResult(Buffer.from(x.archive.base64,'base64'));}catch{return 'invalid';}};
 await check('api-archive',`${f.api}/projects/${f.projectId}/export/zip`,auth,jsonZip);
 await check('web-archive',`${f.web}/api/projects/${f.projectId}/export/zip`,cookie,jsonZip);
 await check('web-binary',`${f.web}/api/projects/${f.projectId}/project-action?intent=export`,cookie,async r=>archiveResult(await r.arrayBuffer()));
 let token;
 await check('runtime-ticket',`${f.web}/api/runtime-token?projectId=${f.projectId}`,cookie,async r=>{const x=await r.json();if(typeof x.token!=='string'||!x.token)return 'invalid';token=x.token;return 'verified';});
 const scoped={authorization:`Bearer ${token}`};
 await check('runtime-list',`${f.web}/api/runtime/workspaces/${f.workspaceId}/files?path=.`,scoped,async r=>listResult(await r.json()));
 await check('runtime-read',`${f.web}/api/runtime/workspaces/${f.workspaceId}/files/read?path=index.html`,scoped,async r=>readResult(await r.json()));
}
