/** @vitest-environment jsdom */
import React from 'react';
import {createServer,type Server} from 'node:http';
import {afterEach,expect,it,vi} from 'vitest';
import {render,cleanup,waitFor} from '@testing-library/react';
import {I18nextProvider} from 'react-i18next';
import {isRouteErrorResponse,createMemoryRouter,RouterProvider,Outlet,createRequestHandler,UNSAFE_getTurboStreamSingleFetchDataStrategy,UNSAFE_getPatchRoutesOnNavigationFunction,type ServerBuild} from 'react-router';
import {loader} from '../../app/routes/api.impersonation';
import {ImpersonationBanner} from '../../app/components/dashboard/ImpersonationBanner';
import {createI18nInstance} from '../../app/lib/i18n/runtime';
import {startStaticGateway} from './prior-discovery-gateway.fixture.mjs';
const id='routes/api.impersonation';
const close=async(s:Server)=>{s.closeAllConnections();await new Promise<void>(r=>s.close(()=>r()));};
const listen=async(s:Server)=>{await new Promise<void>(r=>s.listen(0,'127.0.0.1',r));return `http://127.0.0.1:${(s.address()as{port:number}).port}`;};
afterEach(()=>{cleanup();vi.unstubAllEnvs();vi.unstubAllGlobals();vi.restoreAllMocks();});
it('production lazy discovery fails through current gateway before session data; actual router and Banner preserve child through direct handler',async()=>{
 const api=createServer((q,r)=>{r.setHeader('content-type','application/json');r.end(JSON.stringify({user:{email:'fixture@local.test'},impersonatedBy:null}));});const apiOrigin=await listen(api);vi.stubEnv('SAAS_API_URL',apiOrigin);
 const root={id:'root',path:'',module:'/assets/root.js',hasLoader:false,hasAction:false,hasErrorBoundary:true};
 const ide={id:'ide',parentId:'root',path:'projects/:projectId/ide',module:'/assets/ide.js',hasLoader:false,hasAction:false,hasErrorBoundary:false};
 const session={id,parentId:'root',path:'api/impersonation',module:'/assets/session.js',hasLoader:true,hasAction:true,hasErrorBoundary:false};
 const handler=createRequestHandler({entry:{module:{default:()=>new Response('<main>control</main>'),handleError(){}}},routes:{root:{id:'root',path:'',module:{default:()=>null}},ide:{id:'ide',parentId:'root',path:'projects/:projectId/ide',module:{default:()=>null}},[id]:{id,parentId:'root',path:'api/impersonation',module:{loader}}},assets:{version:'control',entry:{module:'',imports:[]},routes:{root,ide,[id]:session}},basename:'/',publicPath:'/assets/',assetsBuildDirectory:'build/client',future:{},ssr:true,isSpaMode:false,prerender:[],routeDiscovery:{mode:'lazy',manifestPath:'/__manifest'}}as unknown as ServerBuild,'production');
 const web=createServer(async(q,r)=>{try{const response=await handler(new Request(`http://${q.headers.host}${q.url}`,{headers:q.headers as Record<string,string>,method:q.method}));r.writeHead(response.status,Object.fromEntries(response.headers));r.end(Buffer.from(await response.arrayBuffer()));}catch{r.writeHead(500).end();}});const origin=await listen(web);const gateway=await startStaticGateway(origin,apiOrigin,{VC_STATIC_ACCEPTANCE:'1',E2E_PROVIDER_MODE:'absent'},0,{projectId:'owned',workspaceId:'space'});const realFetch=globalThis.fetch;
 try {
  for(const [target,shouldFail]of [[gateway.origin,true],[origin,false]]as const){
   const requested:string[]=[];vi.stubGlobal('fetch',async(input:RequestInfo|URL,init?:RequestInit)=>{const u=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);if(u.pathname==='/__manifest'||u.pathname==='/api/impersonation.data'){requested.push(u.pathname+u.search);return realFetch(target+u.pathname+u.search,{...init,headers:{cookie:'vc_session=local-control'}});}return realFetch(input,init);});
   const manifest={version:'control',entry:{module:'',imports:[]},routes:{root,ide}};let router:ReturnType<typeof createMemoryRouter>;
   const strategy=UNSAFE_getTurboStreamSingleFetchDataStrategy(()=>router,manifest as never,{},true,'/',false);
   const patches=UNSAFE_getPatchRoutesOnNavigationFunction(()=>router,manifest as never,{[id]:{}}as never,true,{mode:'lazy',manifestPath:'/__manifest'},false,'/');
   router=createMemoryRouter([{id:'root',path:'/',element:<><ImpersonationBanner/><Outlet/></>,errorElement:<main id="root-error-heading"/>,children:[{id:'ide',path:'projects/:projectId/ide',element:<main className="bolt-project-ide-shell"/>}]}],{initialEntries:['/projects/owned/ide?workspace=space&panel=files'],hydrationData:{loaderData:{root:null,ide:null}},dataStrategy:strategy,patchRoutesOnNavigation:async(args)=>{if(router)await patches?.(args);}});
   const view=render(<I18nextProvider i18n={createI18nInstance('en')}><RouterProvider router={router}/></I18nextProvider>);
   try{
    await waitFor(()=>expect(requested[0]).toBe('/__manifest?paths=%2Fapi%2C%2Fapi%2Fimpersonation&version=control'));
    if(shouldFail){await waitFor(()=>expect(view.container.querySelector('#root-error-heading')).not.toBeNull());expect(view.container.querySelector('.bolt-project-ide-shell')).toBeNull();expect(requested).toHaveLength(1);expect(router.state.errors?.root).toBeInstanceOf(Error);expect(isRouteErrorResponse(router.state.errors?.root)).toBe(false);}
    else {await waitFor(()=>expect(requested).toContain('/api/impersonation.data?_routes=routes%2Fapi.impersonation'));await waitFor(()=>expect(view.container.querySelector('[data-testid="impersonation-banner-loading"]')).toBeNull());expect(view.container.querySelector('.bolt-project-ide-shell')).not.toBeNull();expect(router.state.errors).toBeNull();}
   }finally{view.unmount();router.dispose();vi.stubGlobal('fetch',realFetch);}
  }
 }finally{vi.stubGlobal('fetch',realFetch);await close(gateway.server);await close(web);await close(api);}
},30000);
