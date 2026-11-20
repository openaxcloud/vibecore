/** @vitest-environment jsdom */
import React from 'react';
import {createServer,type Server} from 'node:http';
import {afterEach,expect,it,vi} from 'vitest';
import {render,cleanup,waitFor} from '@testing-library/react';
import {I18nextProvider} from 'react-i18next';
import {Link,UNSAFE_useFogOFWarDiscovery,isRouteErrorResponse,createMemoryRouter,RouterProvider,Outlet,createRequestHandler,UNSAFE_getTurboStreamSingleFetchDataStrategy,UNSAFE_getPatchRoutesOnNavigationFunction,type ServerBuild} from 'react-router';
import {loader} from '../../app/routes/api.impersonation';
import {ImpersonationBanner} from '../../app/components/dashboard/ImpersonationBanner';
import {createI18nInstance} from '../../app/lib/i18n/runtime';
import {fixtureCanonicalPath,isOwnedDiscovery} from '../../scripts/static-publication-acceptance/discovery-policy.mjs';
import {projectIdePath} from '../../app/utils/project-url';
import {staticSurface} from '../../scripts/static-publication-acceptance/policy.mjs';
import {startStaticGateway as beforeGateway} from './prior-discovery-gateway.fixture.mjs';
import {startStaticGateway} from '../../scripts/static-publication-acceptance/gateway.mjs';
const id='routes/api.impersonation';
const close=async(s:Server)=>{s.closeAllConnections();await new Promise<void>(r=>s.close(()=>r()));};
const listen=async(s:Server)=>{await new Promise<void>(r=>s.listen(0,'127.0.0.1',r));return `http://127.0.0.1:${(s.address()as{port:number}).port}`;};
afterEach(()=>{cleanup();vi.unstubAllEnvs();vi.unstubAllGlobals();vi.restoreAllMocks();});
it('actual lazy discovery and session data pass repaired gateway; real Link discovery batches stay scoped',async()=>{
 const api=createServer((q,r)=>{r.setHeader('content-type','application/json');r.end(JSON.stringify({user:{email:'fixture@local.test'},impersonatedBy:null}));});const apiOrigin=await listen(api);vi.stubEnv('SAAS_API_URL',apiOrigin);
 const root={id:'root',path:'',module:'/assets/root.js',hasLoader:false,hasAction:false,hasErrorBoundary:true};
 const ide={id:'ide',parentId:'root',path:'projects/:projectId/ide',module:'/assets/ide.js',hasLoader:false,hasAction:false,hasErrorBoundary:false};
 const session={id,parentId:'root',path:'api/impersonation',module:'/assets/session.js',hasLoader:true,hasAction:true,hasErrorBoundary:false};
 const handler=createRequestHandler({entry:{module:{default:()=>new Response('<main>control</main>'),handleError(){}}},routes:{root:{id:'root',path:'',module:{default:()=>null}},ide:{id:'ide',parentId:'root',path:'projects/:projectId/ide',module:{default:()=>null}},[id]:{id,parentId:'root',path:'api/impersonation',module:{loader}}},assets:{version:'deadbeef',entry:{module:'',imports:[]},routes:{root,ide,[id]:session}},basename:'/',publicPath:'/assets/',assetsBuildDirectory:'build/client',future:{},ssr:true,isSpaMode:false,prerender:[],routeDiscovery:{mode:'lazy',manifestPath:'/__manifest'}}as unknown as ServerBuild,'production');
 const web=createServer(async(q,r)=>{try{const response=await handler(new Request(`http://${q.headers.host}${q.url}`,{headers:q.headers as Record<string,string>,method:q.method}));r.writeHead(response.status,Object.fromEntries(response.headers));r.end(Buffer.from(await response.arrayBuffer()));}catch{r.writeHead(500).end();}});const origin=await listen(web);const before=await beforeGateway(origin,apiOrigin,{VC_STATIC_ACCEPTANCE:'1',E2E_PROVIDER_MODE:'absent'},0,{projectId:'owned',workspaceId:'space',canonicalProjectPath:'/@owned-org/owned-project'});const gateway=await startStaticGateway(origin,apiOrigin,{VC_STATIC_ACCEPTANCE:'1',E2E_PROVIDER_MODE:'absent'},0,{projectId:'owned',workspaceId:'space',canonicalProjectPath:'/@owned-org/owned-project'});const realFetch=globalThis.fetch;
 try {
  for(const [target,shouldFail]of [[before.origin,true],[gateway.origin,false]]as const){
   const manifestResponse=await realFetch(origin+'/__manifest?paths=%2Fapi%2C%2Fapi%2Fimpersonation&version=deadbeef');expect(manifestResponse.status).toBe(200);expect(await manifestResponse.json()).toHaveProperty(id);
   const mismatch=await realFetch(origin+'/__manifest?paths=%2Fapi%2C%2Fapi%2Fimpersonation&version=ffffffff');expect(mismatch.status).toBe(204);expect(mismatch.headers.get('X-Remix-Reload-Document')).toBe('true');
   const requested:string[]=[];vi.stubGlobal('fetch',async(input:RequestInfo|URL,init?:RequestInit)=>{const u=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);if(u.pathname==='/__manifest'||u.pathname==='/api/impersonation.data'){requested.push(u.pathname+u.search);return realFetch(target+u.pathname+u.search,{...init,headers:{cookie:'vc_session=local-control'}});}return realFetch(input,init);});
   const manifest={version:'deadbeef',entry:{module:'',imports:[]},routes:{root,ide}};let router:ReturnType<typeof createMemoryRouter>;
   const strategy=UNSAFE_getTurboStreamSingleFetchDataStrategy(()=>router,manifest as never,{},true,'/',false);
   const patches=UNSAFE_getPatchRoutesOnNavigationFunction(()=>router,manifest as never,{[id]:{}}as never,true,{mode:'lazy',manifestPath:'/__manifest'},false,'/');
   router=createMemoryRouter([{id:'root',path:'/',element:<><ImpersonationBanner/><Outlet/></>,errorElement:<main id="root-error-heading"/>,children:[{id:'ide',path:'projects/:projectId/ide',element:<main className="bolt-project-ide-shell"/>}]}],{initialEntries:['/projects/owned/ide?workspace=space&panel=files'],hydrationData:{loaderData:{root:null,ide:null}},dataStrategy:strategy,patchRoutesOnNavigation:async(args)=>{if(router)await patches?.(args);}});
   const view=render(<I18nextProvider i18n={createI18nInstance('en')}><RouterProvider router={router}/></I18nextProvider>);
   try{
    await waitFor(()=>expect(requested[0]).toBe('/__manifest?paths=%2Fapi%2C%2Fapi%2Fimpersonation&version=deadbeef'));
    if(shouldFail){await waitFor(()=>expect(view.container.querySelector('#root-error-heading')).not.toBeNull());expect(view.container.querySelector('.bolt-project-ide-shell')).toBeNull();expect(requested).toHaveLength(1);expect(router.state.errors?.root).toBeInstanceOf(Error);expect(isRouteErrorResponse(router.state.errors?.root)).toBe(false);}
    else {await waitFor(()=>expect(requested).toContain('/api/impersonation.data?_routes=routes%2Fapi.impersonation'));await waitFor(()=>expect(view.container.querySelector('[data-testid="impersonation-banner-loading"]')).toBeNull());expect(view.container.querySelector('.bolt-project-ide-shell')).not.toBeNull();expect(router.state.errors).toBeNull();}
   }finally{view.unmount();router.dispose();vi.stubGlobal('fetch',realFetch);}
  }
  // Actual eager discovery hook and real Link elements from the product's IDE topbar paths.
  const batches:string[]=[];const completed:number[]=[];vi.stubGlobal('fetch',async(input:RequestInfo|URL,init?:RequestInit)=>{const u=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);if(u.pathname==='/__manifest'){batches.push(u.pathname+u.search);const response=await realFetch(gateway.origin+u.pathname+u.search,init);await response.clone().arrayBuffer();completed.push(response.status);return response;}return realFetch(input,init);});
  const links=['/dashboard','/projects','/projects/owned/ide?panel=deployments','/projects/owned/deployments','/@owned-org/owned-project?panel=git','/support','/account-settings'];
  const eagerManifest={version:'deadbeef',entry:{module:'',imports:[]},routes:{root,ide}};let eagerRouter:ReturnType<typeof createMemoryRouter>;
  function Eager(){UNSAFE_useFogOFWarDiscovery(eagerRouter,eagerManifest as never,{} as never,true,{mode:'lazy',manifestPath:'/__manifest'},false);return <>{links.map(to=><Link key={to} to={to}>{to}</Link>)}</>;}
  eagerRouter=createMemoryRouter([{id:'root',path:'/',element:<Eager/>}],{initialEntries:['/']});
  const eager=render(<RouterProvider router={eagerRouter}/>);
  try{await waitFor(()=>expect(completed).toEqual([200]));const params=new URLSearchParams(batches[0].split('?')[1]);expect(params.get('paths')?.split(',')).toEqual(['/@owned-org','/@owned-org/owned-project','/account-settings','/dashboard','/projects','/projects/owned','/projects/owned/deployments','/projects/owned/ide','/support']);}finally{eager.unmount();eagerRouter.dispose();vi.stubGlobal('fetch',realFetch);}
 }finally{vi.stubGlobal('fetch',realFetch);await close(before.server);await close(gateway.server);await close(web);await close(api);}
},30000);

it('scoped manifest parser tolerates generated batch order and version variation, not unrelated routes or mutations',()=>{
 const scope={projectId:'owned',workspaceId:'space',canonicalProjectPath:fixtureCanonicalPath({slug:'owned-org'},{slug:'owned-project'})};
 expect(scope.canonicalProjectPath).toBe(projectIdePath({id:'owned',slug:'owned-project',organizationSlug:'owned-org'}));
 const request=(paths:string,version='1234abcd')=>'/__manifest?'+new URLSearchParams({paths,version});
 for(const paths of ['/api,/api/impersonation','/projects,/projects/owned,/projects/owned/deployments','/dashboard,/projects','/projects,/dashboard','/@owned-org,/@owned-org/owned-project']){
  const target=request(paths);expect(isOwnedDiscovery(target,'GET',scope)).toBe(true);expect(staticSurface(target,'GET',scope)).toBe('web');
  const reversed='/__manifest?'+new URLSearchParams({version:'ffffffff',paths});expect(isOwnedDiscovery(reversed,'GET',scope)).toBe(true);
  for(const method of ['POST','PUT','PATCH','DELETE','HEAD'])expect(isOwnedDiscovery(target,method,scope)).toBe(false);
 }
 for(const paths of ['/admin','/projects/other','/projects/owned/../other','//foreign.test','/api/chat','/api/runtime/workspaces/space','/projects/owned?x=y','/projects/owned%2f../other','/dashboard,/dashboard','/@other/owned-project',''])expect(isOwnedDiscovery(request(paths),'GET',scope)).toBe(false);
 const good=request('/api,/api/impersonation');for(const value of [good+'&paths=%2Fadmin',good+'&x=1',good+'#fragment','http://foreign.test'+good,'//foreign.test'+good,good.replace('/__manifest','/%5f_manifest'),request('/api','bad-version'),good.replace('%2F','%252F')])expect(isOwnedDiscovery(value,'GET',scope)).toBe(false);
 for(const value of ['/__manifest','/__manifest?x=1','/__manifest?paths=/admin&version=1234abcd'])expect(()=>staticSurface(value,'GET',scope)).toThrow();
 expect(isOwnedDiscovery(good,'GET',undefined)).toBe(false);expect(isOwnedDiscovery(request('/projects/owned'),'GET',{projectId:'other'})).toBe(false);
 expect(fixtureCanonicalPath({slug:'../other'},{slug:'owned'})).toBeUndefined();
});
