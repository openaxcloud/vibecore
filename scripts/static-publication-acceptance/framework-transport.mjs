const families=['discovery','session-data','deployment-data'];
const outcomes=['started','2xx','3xx','4xx','5xx','version-mismatch','network-failed','other'];
export function safeFrameworkTransport(v){return v&&Object.keys(v).sort().join(',')==='family,kind,outcome'&&v.kind==='framework-transport'&&families.includes(v.family)&&outcomes.includes(v.outcome)?{kind:v.kind,family:v.family,outcome:v.outcome}:null;}
export function frameworkFamily(value,origin,projectId){try{const u=new URL(value);if(u.origin!==origin)return null;return u.pathname==='/__manifest'?'discovery':u.pathname==='/api/impersonation.data'?'session-data':u.pathname===`/projects/${projectId}/deployments.data`?'deployment-data':null;}catch{return null;}}
export function attachFrameworkTransport(page,origin,projectId,emit){
 let count=0;const send=(family,outcome)=>{const v=safeFrameworkTransport({kind:'framework-transport',family,outcome});if(v&&count++<24)emit(v);};
 const start=r=>send(frameworkFamily(r.url(),origin,projectId),'started');
 const failed=r=>send(frameworkFamily(r.url(),origin,projectId),'network-failed');
 const response=r=>{const family=frameworkFamily(r.url(),origin,projectId),status=r.status();send(family,family==='discovery'&&status===204&&r.headers()['x-remix-reload-document']==='true'?'version-mismatch':status>=200&&status<600?`${Math.floor(status/100)}xx`:'other');};
 page.on('request',start);page.on('requestfailed',failed);page.on('response',response);
 return{detach(){page.off('request',start);page.off('requestfailed',failed);page.off('response',response);}};
}
export function relayFrameworkTransport(write=v=>console.log(JSON.stringify(v))){let line='',discard=false,count=0;return chunk=>{for(const c of chunk.toString()){if(c==='\n'){if(!discard&&count<24){try{const v=safeFrameworkTransport(JSON.parse(line));if(v){count++;write(v);}}catch{}}line='';discard=false;}else if(!discard){line+=c;if(line.length>256){line='';discard=true;}}}};}
