import test from 'node:test';import assert from 'node:assert/strict';import{EventEmitter}from'node:events';
import{readFileSync}from'node:fs';import{safeFrameworkTransport,frameworkFamily,attachFrameworkTransport,relayFrameworkTransport}from'./framework-transport.mjs';
test('only closed same-origin framework family outcomes leave all three existing relays',()=>{
 const page=new EventEmitter(),rows=[];const observer=attachFrameworkTransport(page,'http://127.0.0.1:4317','owned',v=>rows.push(v));
 const request={url:()=> 'http://127.0.0.1:4317/__manifest?PRIVATE=SECRET'};
 page.emit('request',request);page.emit('response',{...request,status:()=>403,headers:()=>({})});page.emit('response',{...request,status:()=>204,headers:()=>({'x-remix-reload-document':'true'})});page.emit('requestfailed',request);
 assert.deepEqual(rows.map(v=>v.outcome),['started','4xx','version-mismatch','network-failed']);
 assert.equal(frameworkFamily('http://foreign.test/__manifest','http://127.0.0.1:4317','owned'),null);assert.equal(frameworkFamily('http://127.0.0.1:4317/projects/other/deployments.data','http://127.0.0.1:4317','owned'),null);
 const output=[];const relay=relayFrameworkTransport(v=>output.push(v));relay('PRIVATE RAW\n'+JSON.stringify({...rows[0],url:'SECRET'})+'\n'+JSON.stringify(rows[0]).slice(0,10));relay(JSON.stringify(rows[0]).slice(10)+'\n');assert.deepEqual(output,[rows[0]]);assert.ok(!JSON.stringify(output).includes('PRIVATE'));
 assert.equal(safeFrameworkTransport({...rows[0],outcome:'PRIVATE'}),null);observer.detach();assert.equal(page.listenerCount('request'),0);
 for(const f of ['reporter.ts','hook.mjs','safe-run.mjs'])assert.match(readFileSync(new URL(f,import.meta.url),'utf8'),/relayFrameworkTransport/);
});

test('three-hop relay remains bounded and strips arbitrary noise at each hop',()=>{
 const out=[],third=relayFrameworkTransport(v=>out.push(v)),second=relayFrameworkTransport(v=>third(JSON.stringify(v)+'\n')),first=relayFrameworkTransport(v=>second('PRIVATE\n'+JSON.stringify(v)+'\n'));
 const line=JSON.stringify({kind:'framework-transport',family:'session-data',outcome:'2xx'})+'\n';
 for(let i=0;i<40;i++){first(line.slice(0,12));first(line.slice(12));}assert.equal(out.length,24);assert.ok(out.every(v=>v.family==='session-data'&&v.outcome==='2xx'));
});
