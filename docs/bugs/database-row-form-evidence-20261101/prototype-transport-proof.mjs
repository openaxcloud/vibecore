import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire('/workspace/vibecore-ui-terminal-handoff/services/api/package.json');
const fastify=require('fastify');
const app=fastify();let handlerCalls=0;
app.post('/isolated-parser-proof',async()=>{handlerCalls++;return {reached:true};});
const cases=[];
try{
 for(const name of ['ordinary','__proto__','constructor']){
  const payload=JSON.stringify({values:Object.fromEntries([[name,{mode:'value',value:'synthetic'}]])});
  const before=handlerCalls;
  const response=await app.inject({method:'POST',url:'/isolated-parser-proof',headers:{'content-type':'application/json'},payload});
  cases.push({name,status:response.statusCode,body:response.json(),handlerReached:handlerCalls!==before});
 }
 assert.equal(cases[0].status,200);assert.equal(cases[1].status,400);assert.equal(cases[1].handlerReached,false);
 await writeFile('/workspace/ui-database-form-20261101/prototype-transport-proof.json',JSON.stringify({scope:'Isolated Fastify same installed version, default parser; no API/database calls',cases},null,2));console.log(JSON.stringify(cases));
}finally{await app.close();}
