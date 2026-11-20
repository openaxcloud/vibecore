/** @vitest-environment jsdom */
import React from 'react';
import {flatRoutes} from '@react-router/fs-routes';
import {resolve} from 'node:path';
import {createServer,type Server} from 'node:http';
import {afterEach,expect,it,vi} from 'vitest';
import {render,cleanup,waitFor} from '@testing-library/react';
import {I18nextProvider} from 'react-i18next';
import {createMemoryRouter,RouterProvider,Outlet,createRequestHandler,UNSAFE_getTurboStreamSingleFetchDataStrategy,UNSAFE_decodeViaTurboStream,type ServerBuild} from 'react-router';
vi.mock('~/components/dashboard/SaaSLayout',()=>({AppShell:()=>null}));
import {loader} from '../../app/routes/api.impersonation';
import {loader as deploymentLoader} from '../../app/routes/projects.$projectId.deployments';
import {DeployPublishCard} from '../../app/components/deploy/DeployPublishCard';
import {ImpersonationBanner} from '../../app/components/dashboard/ImpersonationBanner';
import {createI18nInstance} from '../../app/lib/i18n/runtime';
import {startStaticGateway as beforeGateway} from './prior-singlefetch-gateway.fixture.mjs';
import {startStaticGateway} from '../../scripts/static-publication-acceptance/gateway.mjs';
import {staticSurface} from '../../scripts/static-publication-acceptance/policy.mjs';
const deployId='routes/projects.$projectId.deployments';
const scope={projectId:'owned',workspaceId:'space'};
const metadataPaths=['/projects/owned/deployments.data?'+new URLSearchParams({detect:'1',workspace:'space',_routes:deployId}),'/projects/owned/deployments.data?'+new URLSearchParams({rateCard:'1',_routes:deployId})];
const id='routes/api.impersonation',encoded='/api/impersonation.data?_routes=routes%2Fapi.impersonation';
const close=async(s:Server)=>{s.closeAllConnections();await new Promise<void>(r=>s.close(()=>r()));};
const listen=async(s:Server)=>{await new Promise<void>(r=>s.listen(0,'127.0.0.1',r));return `http://127.0.0.1:${(s.address()as{port:number}).port}`;};
afterEach(()=>{cleanup();vi.unstubAllEnvs();vi.unstubAllGlobals();vi.restoreAllMocks();});
it('actual root-mounted session fetcher fails through old gateway and preserves IDE through narrow corrected transport',async()=>{
 vi.stubGlobal('__reactRouterAppDirectory',resolve('app'));
 const flatten=(items:any[]):any[]=>items.flatMap(item=>[item,...flatten(item.children??[])]);
 const configured=flatten(await flatRoutes({ignoredRouteFiles:['**/*.spec.ts','**/*.spec.tsx']}));expect(configured.find(route=>route.file==='routes/api.impersonation.tsx')?.id).toBe(id);expect(configured.find(route=>route.file==='routes/projects.$projectId.deployments.tsx')?.id).toBe(deployId);
 const calls:string[]=[];const api=createServer((q,r)=>{calls.push(q.method+' '+q.url);r.setHeader('content-type','application/json');r.end(JSON.stringify(q.url?.includes('/deployments/detect')?{mode:'static',framework:'plain',reason:'fixture'}:q.url?.endsWith('/rate-card')?null:{user:{email:'fixture@local.test'},impersonatedBy:null}));});
 const apiOrigin=await listen(api);vi.stubEnv('SAAS_API_URL',apiOrigin);vi.stubEnv('API_BASE_URL',apiOrigin);
 const handler=createRequestHandler({entry:{module:{default:()=>new Response('<!doctype html><main>control document</main>'),handleError(){}}},routes:{root:{id:'root',path:'',module:{default:()=>null}},[id]:{id,parentId:'root',path:'api/impersonation',module:{loader}},[deployId]:{id:deployId,parentId:'root',path:'projects/:projectId/deployments',module:{loader:deploymentLoader}}},assets:{version:'control',entry:{module:'',imports:[]},routes:{}},basename:'/',publicPath:'/assets/',assetsBuildDirectory:'build/client',future:{},ssr:true,isSpaMode:false,prerender:[],routeDiscovery:{mode:'initial',manifestPath:'/__manifest'}}as unknown as ServerBuild,'production');
 const web=createServer(async(q,r)=>{try{const response=await handler(new Request(`http://${q.headers.host}${q.url}`,{headers:q.headers as Record<string,string>,method:q.method}));r.writeHead(response.status,Object.fromEntries(response.headers));r.end(Buffer.from(await response.arrayBuffer()));}catch{r.writeHead(500).end();}});
 const origin=await listen(web),env={VC_STATIC_ACCEPTANCE:'1',E2E_PROVIDER_MODE:'absent'};const before=await beforeGateway(origin,apiOrigin,env,0),fixed=await startStaticGateway(origin,apiOrigin,env,0,scope);const realFetch=globalThis.fetch;
 try{
  const direct=await realFetch(origin+encoded,{headers:{cookie:'vc_session=local-control'}});expect(direct.status).toBe(200);expect((await UNSAFE_decodeViaTurboStream(direct.body!,globalThis)).value).toMatchObject({[id]:{data:{impersonatedBy:null}}});
  const rejected=await realFetch(before.origin+encoded);expect(rejected.status).toBe(403);
  const accepted=await realFetch(fixed.origin+encoded,{headers:{cookie:'vc_session=local-control'}});expect(accepted.status).toBe(200);expect((await UNSAFE_decodeViaTurboStream(accepted.body!,globalThis)).value).toMatchObject({[id]:{data:{impersonatedBy:null}}});
  // Actual useFetcher + framework single-fetch strategy + router error boundary, no browser/SSR bundle mock pass.
  for(const [target,shouldFail]of [[before.origin,true],[fixed.origin,false]]as const){
   const requested:string[]=[];vi.stubGlobal('fetch',async(input:RequestInfo|URL,init?:RequestInit)=>{const u=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);if(u.pathname==='/api/impersonation.data'){requested.push(u.pathname+u.search);return realFetch(target+u.pathname+u.search,{...init,headers:{...Object.fromEntries(new Headers(init?.headers)),cookie:'vc_session=local-control'}});}return realFetch(input,init);});
   let router:ReturnType<typeof createMemoryRouter>;
   const strategy=UNSAFE_getTurboStreamSingleFetchDataStrategy(()=>router,{routes:{root:{hasLoader:false},ide:{hasLoader:false},[id]:{hasLoader:true,hasClientLoader:false}}}as never,{},true,'/',false);
   router=createMemoryRouter([{id:'root',path:'/',element:<><ImpersonationBanner/><Outlet/></>,errorElement:<main id="root-error-heading">root route error</main>,children:[{id:'ide',path:'projects/:projectId/ide',element:<main className="bolt-project-ide-shell">IDE remains</main>},{id,path:'api/impersonation',loader:((_args:unknown,serverLoader:()=>Promise<unknown>)=>serverLoader())as never}]}],{initialEntries:['/projects/owned/ide?workspace=owned&panel=files'],dataStrategy:strategy});
   const view=render(<I18nextProvider i18n={createI18nInstance('en')}><RouterProvider router={router}/></I18nextProvider>);
   try{await waitFor(()=>expect(requested).toEqual([encoded]));if(shouldFail){await waitFor(()=>expect(view.container.querySelector('#root-error-heading')).not.toBeNull());expect(view.container.querySelector('.bolt-project-ide-shell')).toBeNull();expect(router.state.errors?.root).toMatchObject({status:403});}else{await waitFor(()=>expect(view.container.querySelector('[data-testid="impersonation-banner-loading"]')).toBeNull());expect(view.container.querySelector('.bolt-project-ide-shell')).not.toBeNull();expect(router.state.errors).toBeNull();}}
   finally{view.unmount();router.dispose();vi.stubGlobal('fetch',realFetch);}
  }
  for(const path of metadataPaths){
   const direct=await realFetch(origin+path,{headers:{cookie:'vc_session=local-control'}});expect(direct.status).toBe(200);
   const denied=await realFetch(before.origin+path,{headers:{cookie:'vc_session=local-control'}});expect(denied.status).toBe(403);
   const ok=await realFetch(fixed.origin+path,{headers:{cookie:'vc_session=local-control'}});expect(ok.status).toBe(200);expect((await UNSAFE_decodeViaTurboStream(ok.body!,globalThis)).value).toHaveProperty(deployId);
  }
  const cardRequests:string[]=[];vi.stubGlobal('fetch',async(input:RequestInfo|URL,init?:RequestInit)=>{const u=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);if(u.pathname==='/projects/owned/deployments.data'){cardRequests.push(u.pathname+u.search);return realFetch(fixed.origin+u.pathname+u.search,{...init,headers:{...Object.fromEntries(new Headers(init?.headers)),cookie:'vc_session=local-control'}});}return realFetch(input,init);});
  let cardRouter:ReturnType<typeof createMemoryRouter>;
  const cardStrategy=UNSAFE_getTurboStreamSingleFetchDataStrategy(()=>cardRouter,{routes:{root:{hasLoader:false},ide:{hasLoader:false},[deployId]:{hasLoader:true,hasClientLoader:false}}}as never,{},true,'/',false);
  cardRouter=createMemoryRouter([{id:'root',path:'/',element:<Outlet/>,errorElement:<main id="root-error-heading"/>,children:[{id:'ide',path:'projects/:projectId/ide',element:<DeployPublishCard projectId="owned" workspaceId="space" busy={false} building={false} onSubmit={()=>{throw Error('NO_PUBLICATION_IN_CONTROL');}}/>},{id:deployId,path:'projects/:projectId/deployments',loader:((_args:unknown,serverLoader:()=>Promise<unknown>)=>serverLoader())as never}]}],{initialEntries:['/projects/owned/ide?workspace=space&panel=files'],dataStrategy:cardStrategy});
  const card=render(<I18nextProvider i18n={createI18nInstance('en')}><RouterProvider router={cardRouter}/></I18nextProvider>);
  try{await waitFor(()=>expect(cardRequests.sort()).toEqual([...metadataPaths].sort()));await waitFor(()=>expect(card.container.querySelector('button[type="submit"]')?.hasAttribute('disabled')).toBe(false));expect(cardRouter.state.errors).toBeNull();}
  finally{card.unmount();cardRouter.dispose();vi.stubGlobal('fetch',realFetch);}
  expect(calls.length).toBeGreaterThan(0);expect(calls.every(x=>['GET /auth/me','GET /projects/owned/deployments/detect?workspaceId=space','GET /projects/owned/deployments/rate-card'].includes(x))).toBe(true);
 }finally{vi.stubGlobal('fetch',realFetch);await close(before.server);await close(fixed.server);await close(web);await close(api);}
},30000);
it('only exact read-only framework query is newly admitted; path escapes, mixed queries, foreign targets and writes remain refused',()=>{
 expect(staticSurface(encoded,'GET')).toBe('web');
 for(const path of metadataPaths){expect(staticSurface(path,'GET',scope)).toBe('web');for(const invalid of [undefined,{projectId:'other',workspaceId:'space'},{projectId:'owned',workspaceId:'other'}]){if(invalid?.projectId==='owned'&&path.includes('rateCard'))continue;expect(()=>staticSurface(path,'GET',invalid)).toThrow();}expect(()=>staticSurface(path+'&x=1','GET',scope)).toThrow();for(const method of ['POST','PUT','DELETE'])expect(()=>staticSurface(path,method,scope)).toThrow();}
 for(const path of ['/api%2Fimpersonation.data?_routes=routes%2Fapi.impersonation','/api/impersonation.data?_routes=routes%252Fapi.impersonation',encoded+'&x=1',encoded+'&_routes=root','/api/impersonation.data?_routes=routes%2Fapi.other','//foreign.test'+encoded,'https://foreign.test'+encoded,'/static-deployments/x/%2e%2e/private','/api/runtime/workspaces/x/files?path=%2F'])expect(()=>staticSurface(path,'GET')).toThrow();
 for(const method of ['POST','PUT','DELETE','HEAD'])expect(()=>staticSurface(encoded,method)).toThrow();
 expect(staticSurface('/static-deployments/owned/index.html','GET')).toBe('api');expect(staticSurface('/api/runtime/workspaces/owned/files?path=.','GET')).toBe('api');
});
