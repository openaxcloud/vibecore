import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync } from 'node:fs';
export const PRODUCT_SHA = 'aaaf642064b5eeefc8975ccff9b151ff0beb1ec4';
export function loopback(value, protocol='http:') {
  const url=new URL(value); assert.equal(url.protocol,protocol); assert.equal(url.hostname,'127.0.0.1');
  assert.ok(url.port); assert.ok(!url.username&&!url.password); assert.ok(protocol==='redis:' ? ['', '/'].includes(url.pathname) : url.pathname==='/');
  assert.ok(!url.search&&!url.hash); return url.origin;
}
export function optIn(env=process.env) {
  assert.equal(env.VC_STATIC_ACCEPTANCE,'1'); assert.equal(env.E2E_PROVIDER_MODE,'absent');
  for(const [key,value] of Object.entries(env)) if(value && /^(OPENAI|ANTHROPIC|GEMINI|GOOGLE_GENERATIVE|ASTER|VERCEL|NETLIFY|CLOUDFLARE|STRIPE|RESEND)_(.*KEY|.*TOKEN|.*SECRET|DEPLOY_HOOK)/i.test(key)) assert.fail('PROVIDER_CREDENTIAL_REFUSED');
}
export function exactProduct(cwd=process.cwd()) {
  assert.equal(execFileSync('git',['rev-parse','HEAD'],{cwd,encoding:'utf8'}).trim(),PRODUCT_SHA);
  assert.equal(execFileSync('git',['diff','HEAD','--name-only','--','app','services','packages','pnpm-lock.yaml'],{cwd,encoding:'utf8'}).trim(),'');
}
export function readFixture(path) {
  const st=lstatSync(path); assert.ok(st.isFile()&&!st.isSymbolicLink()&&st.nlink===1&&st.size<8192&&(st.mode&0o077)===0);
  const d=JSON.parse(readFileSync(path,'utf8')); assert.equal(d.productSha,PRODUCT_SHA);
  loopback(d.api);loopback(d.web); for(const key of ['projectId','workspaceId','userId','token']) assert.equal(typeof d[key],'string');
  assert.ok(d.projectId&&d.workspaceId&&d.projectId!==d.workspaceId&&d.userId&&d.token); return d;
}
export function staticSurface(path) {
  const url=new URL(path,'http://127.0.0.1');assert.ok(path.startsWith('/')&&!path.startsWith('//')&&!/[\\\r\n%]/.test(path));
  assert.ok(!/^\/api\/(chat|generate|agent|llm|ai|completion|completions)(\/|-|$)/.test(url.pathname));
  return url.pathname==='/api/runtime'||url.pathname.startsWith('/api/runtime/')||/^\/static-deployments\/[a-zA-Z0-9_-]+(?:\/|$)/.test(url.pathname)?'api':'web';
}
export function ownedRecipe(name, web, env=process.env) {
  assert.match(name??'',/^vc-private-[a-f0-9]{16}$/);assert.ok(env.KUBECONFIG);
  const args=['--kubeconfig',env.KUBECONFIG,'--context',`kind-${name}`];
  const run=(tail)=>execFileSync('kubectl',[...args,...tail],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
  const server=new URL(run(['config','view','--minify','-o','jsonpath={.clusters[0].cluster.server}']));
  assert.equal(server.protocol,'https:');assert.equal(server.hostname,'127.0.0.1');
  const ns=JSON.parse(run(['get','namespace',name,'-o','json']));assert.equal(ns.metadata.labels['recipe.vibecore/id'],name);
  const api=JSON.parse(run(['-n',name,'get','deployment','api','-o','json']));
  assert.equal(api.spec.template.spec.containers[0].image,`vc-private-platform:${name}`);
  const vars=Object.fromEntries(api.spec.template.spec.containers[0].env.map(x=>[x.name,x.value]));
  assert.equal(vars.PRIVATE_RUNTIME_RECIPE_ID,name);loopback(web);
  assert.equal(vars.STATIC_DEPLOY_STORAGE_DIR,undefined);assert.equal(vars.STATIC_DEPLOY_BASE_URL,undefined);
}
