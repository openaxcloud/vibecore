/** direct document-declared JS/CSS transport proof, not hydration or full graph proof. */
import assert from 'node:assert/strict';
export function declaredAssets(html){
 assert.ok(!html.includes('/@vite/')&&!html.includes('/@id/__x00__')&&!html.includes('__vite_plugin_react_preamble_installed__'),'DEV_DOCUMENT');
 const assets=new Set();
 for(const match of html.matchAll(/(?:src|href)=["'](\/assets\/[^"'<>]+\.(?:js|css))["']/g))assets.add(match[1]);
 for(const match of html.matchAll(/\b(?:import\s*(?:[^;<>]*?\sfrom\s*)?|import\s*\()\s*["'](\/assets\/[^"'<>]+\.js)["']/g))assets.add(match[1]);
 assert.ok(assets.size>0&&assets.size<=64&&[...assets].some(x=>x.endsWith('.js')),'MODULE_ASSETS_MISSING');
 for(const asset of assets){
  assert.match(asset,/^\/assets\/[a-zA-Z0-9_./-]+\.(js|css)$/);
  assert.ok(!asset.split('/').some(segment=>segment==='.'||segment==='..'),'DOT_SEGMENT');
  assert.equal(new URL(asset,'http://127.0.0.1').pathname,asset,'NORMALIZED_ASSET_CHANGED');
 }
 return [...assets];
}
export async function verifyCompiledDocument(origin){
 const url=new URL(origin);assert.equal(url.protocol,'http:');assert.equal(url.hostname,'127.0.0.1');assert.equal(url.origin,origin);assert.ok(url.port);
 const response=await fetch(origin+'/login',{redirect:'manual',signal:AbortSignal.timeout(30_000)});
 assert.equal(response.status,200,'DOCUMENT_NOT_200');assert.match(response.headers.get('content-type')??'',/^text\/html\b/);
 const html=await response.text();assert.ok(Buffer.byteLength(html)<4*1024*1024,'DOCUMENT_TOO_LARGE');
 for(const path of declaredAssets(html)){
  const r=await fetch(origin+path,{redirect:'manual',signal:AbortSignal.timeout(10_000)});
  assert.equal(r.status,200,'ASSET_NOT_200');assert.match(r.headers.get('content-type')??'',path.endsWith('.css')?/^text\/css\b/:/(?:javascript|ecmascript)/);
  assert.ok((await r.arrayBuffer()).byteLength<=8*1024*1024,'ASSET_TOO_LARGE');
 }
 return {stage:'compiled-document-assets',status:'verified'};
}
if(process.argv.includes('--check'))verifyCompiledDocument(process.env.VC_IDE_UPSTREAM_WEB).then(v=>console.log(JSON.stringify(v))).catch(()=>{console.log('{"stage":"compiled-document-assets","status":"failed"}');process.exitCode=1;});
