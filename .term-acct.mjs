const API='https://api.e-code.ai'; const suf=`${Date.now()}-${Math.floor(Math.random()*1e6)}`;
const email=`term-ui-${suf}@local.test`; const password=`Ecode-${Buffer.from(String(Math.random())).toString('base64').replace(/[^a-z0-9]/gi,'')}-9a!`;
const J=async(m,p,t,b)=>{const r=await fetch(API+p,{method:m,headers:{'content-type':'application/json',...(t?{authorization:`Bearer ${t}`}:{})},body:b?JSON.stringify(b):undefined});const x=await r.text();let d;try{d=JSON.parse(x)}catch{d=x}return{s:r.status,d}};
const reg=await J('POST','/auth/register',null,{email,password,name:'T',organizationName:`T ${suf}`});
const token=reg.d.token, orgId=reg.d.organization.id, userId=reg.d.user.id;
const pr=await J('POST',`/orgs/${orgId}/projects`,token,{name:`term-ui-${suf}`}); const projectId=pr.d.project.id;
await J('POST','/api/runtime/workspaces',token,{projectId});
console.log('TOKEN='+token);console.log('PROJECT='+projectId);console.log('USER='+userId);console.log('ORG='+orgId);console.log('EMAIL='+email);
