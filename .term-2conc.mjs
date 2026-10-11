const API='https://api.e-code.ai'; const suf=`${Date.now()}-${Math.floor(Math.random()*1e6)}`;
const J=async(m,p,t,b)=>{const r=await fetch(API+p,{method:m,headers:{'content-type':'application/json',...(t?{authorization:`Bearer ${t}`}:{})},body:b?JSON.stringify(b):undefined});const x=await r.text();let d;try{d=JSON.parse(x)}catch{d=x}return{s:r.status,d}};
const reg=await J('POST','/auth/register',null,{email:`t2-${suf}@local.test`,password:`Ecode-${suf}-9a!X`,name:'T',organizationName:`T ${suf}`});
const token=reg.d.token, orgId=reg.d.organization.id;
const pr=await J('POST',`/orgs/${orgId}/projects`,token,{name:`t2-${suf}`}); const projectId=pr.d.project.id;
await J('POST','/api/runtime/workspaces',token,{projectId});
console.log('ACCOUNT', JSON.stringify({email:`t2-${suf}@local.test`, orgId, projectId}));
const mkUrl=(sid)=>`${API.replace('https:','wss:')}/api/runtime/workspaces/${projectId}/terminal?sessionId=${sid}&cols=80&rows=24&token=${encodeURIComponent(token)}`;
function openTerm(name,sid){return new Promise((resolve)=>{const ev=[];const ws=new WebSocket(mkUrl(sid));let closed=false;
  ws.addEventListener('open',()=>ev.push('open'));
  ws.addEventListener('message',(m)=>{const s=String(m.data);if(/error|quota|429|not.?started|concurrent|limit/i.test(s))ev.push('RECV '+s.slice(0,140));});
  ws.addEventListener('close',(e)=>{closed=true;ev.push('close code='+e.code+' reason='+(e.reason||''));});
  ws.addEventListener('error',()=>ev.push('error'));
  setTimeout(()=>{resolve({name,sid,closed,ev,ws});},9000);});}
// Open terminal A, wait until it's clearly established, then open B concurrently.
console.log('opening A…');
const A=await openTerm('A','sessA-'+suf);
console.log('A after 9s:', JSON.stringify(A.ev));
console.log('opening B while A open…');
const B=await openTerm('B','sessB-'+suf);
console.log('B after 9s:', JSON.stringify(B.ev));
console.log('A still open?', !A.closed, '| B closed?', B.closed);
try{A.ws.close()}catch{}; try{B.ws.close()}catch{};
console.log('CLEANUP', JSON.stringify({orgId, projectId}));
process.exit(0);
