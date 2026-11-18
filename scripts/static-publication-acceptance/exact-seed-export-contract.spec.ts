import {semanticReadback} from '../../scripts/static-publication-acceptance/entry-observation.mjs';
/** Actual API and web bootstrap loaders through loopback gateway; manager/agent are deterministic HTTP controls, not pods. */
import {readFileSync} from 'node:fs';
import {createServer,type Server} from 'node:http';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import JSZip from 'jszip';
import {it,expect,vi} from 'vitest';
import {buildApiApp} from '../../services/api/src/app';
import {LocalProjectStorage} from '../../services/api/src/project-storage';
import {TestApiStore} from '../../services/api/src/tests/test-api-store';
import {sessionCookie} from '../../app/lib/enterprise-api.server';
import {loader as exportJson} from '../../app/routes/api.projects.$projectId.export.zip';
import {loader as exportBinary} from '../../app/routes/api.projects.$projectId.project-action';
import {loader as runtimeTicket} from '../../app/routes/api.runtime-token';
import {loadProjectIdeData} from '../../app/lib/project-ide-loader.server';
import {startStaticGateway} from '../../scripts/static-publication-acceptance/gateway.mjs';
// An HTTP agent with exclusive-create behavior; all persistence uses the actual API.
async function demarrerRuntime() {
  const fichiers = new Map<string, string>();
  const appels: string[] = [];

  const agent = createServer((requete, reponse) => {
    const url = new URL(requete.url ?? '/', 'http://agent.local');
    appels.push(`${requete.method} ${url.pathname}`);

    let brut = '';
    requete.on('data', (morceau) => {
      brut += morceau.toString();
    });
    requete.on('end', () => {
      const charge = brut ? (JSON.parse(brut) as Record<string, string>) : {};
      reponse.setHeader('content-type', 'application/json');

      if (requete.method === 'GET' && url.pathname === '/files/tree') {
        reponse.end(JSON.stringify([...fichiers.keys()].map((path) => ({ path, type: 'file' }))));
      } else if (requete.method === 'GET' && url.pathname === '/files/read') {
        reponse.end(JSON.stringify({ content: fichiers.get(url.searchParams.get('path') ?? '') ?? '' }));
      } else if (requete.method === 'POST' && (url.pathname === '/files/write' || url.pathname === '/files/create')) {
        if (url.pathname === '/files/create' && fichiers.has(charge.path!)) {
          reponse.statusCode = 409;
          reponse.end(JSON.stringify({ code: 'EEXIST', error: 'File already exists' }));

          return;
        }

        if (!charge.directory) {
          fichiers.set(charge.path!, charge.content ?? '');
        }

        reponse.end(JSON.stringify({ ok: true }));
      } else if (requete.method === 'POST' && url.pathname === '/files/delete') {
        for (const cle of [...fichiers.keys()]) {
          if (cle === charge.path || cle.startsWith(`${charge.path}/`)) {
            fichiers.delete(cle);
          }
        }

        reponse.end(JSON.stringify({ ok: true }));
      } else if (requete.method === 'POST' && url.pathname === '/files/rename') {
        fichiers.set(charge.to!, fichiers.get(charge.from!) ?? '');
        fichiers.delete(charge.from!);
        reponse.end(JSON.stringify({ ok: true }));
      } else {
        reponse.end(JSON.stringify({ ok: true }));
      }
    });
  });

  await new Promise<void>((resoudre) => agent.listen(0, '127.0.0.1', () => resoudre()));

  const gestionnaire = createServer((requete, reponse) => {
    const url = new URL(requete.url ?? '/', 'http://manager.local');
    reponse.setHeader('content-type', 'application/json');
    reponse.end(
      JSON.stringify(url.pathname.endsWith('/agent-token') ? { token: 'runtime-token' } : { status: 'RUNNING' }),
    );
  });

  await new Promise<void>((resoudre) => gestionnaire.listen(0, '127.0.0.1', () => resoudre()));

  const portAgent = (agent.address() as { port: number }).port;
  const portGestionnaire = (gestionnaire.address() as { port: number }).port;
  const precedentGestionnaire = process.env.WORKSPACE_MANAGER_URL;
  const precedentAgent = process.env.WORKSPACE_AGENT_URL_TEMPLATE;
  process.env.WORKSPACE_MANAGER_URL = `http://127.0.0.1:${portGestionnaire}`;
  process.env.WORKSPACE_AGENT_URL_TEMPLATE = `http://127.0.0.1:${portAgent}`;

  return {
    fichiers,
    appels,
    async fermer() {
      if (precedentGestionnaire === undefined) {
        delete process.env.WORKSPACE_MANAGER_URL;
      } else {
        process.env.WORKSPACE_MANAGER_URL = precedentGestionnaire;
      }

      if (precedentAgent === undefined) {
        delete process.env.WORKSPACE_AGENT_URL_TEMPLATE;
      } else {
        process.env.WORKSPACE_AGENT_URL_TEMPLATE = precedentAgent;
      }

      await Promise.all(
        [agent, gestionnaire].map(
          (serveur: Server) => new Promise<void>((resoudre) => serveur.close(() => resoudre())),
        ),
      );
    },
  };
}


it('exact five-file seed materializes manifest into both real web export views without a second snapshot write',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'vc-static-bootstrap-'));vi.stubEnv('PROJECT_STORAGE_DIR',directory);
 const runtime=await demarrerRuntime();const store=new TestApiStore();const storage=new LocalProjectStorage();const app=await buildApiApp({store,projectStorage:storage,emailProvider:{async send(){}}});
 let projectId='',workspaceId='';
 const web=createServer(async(req,res)=>{
  try{
   const request=new Request(`http://${req.headers.host}${req.url}`,{headers:req.headers as Record<string,string>});
   const path=new URL(request.url).pathname;
   const result=path==='/api/runtime-token'?await runtimeTicket({request}):path.endsWith('/export/zip')?await exportJson({request,params:{projectId}} as never):await exportBinary({request,params:{projectId}} as never);
   if(result instanceof Response){res.writeHead(result.status,Object.fromEntries(result.headers));res.end(Buffer.from(await result.arrayBuffer()));}
   else{res.writeHead(result.init?.status??200,{'content-type':'application/json'});res.end(JSON.stringify(result.data));}
  }catch{res.writeHead(500);res.end();}
 });
 let gateway:Awaited<ReturnType<typeof startStaticGateway>>|undefined;
 try{
  const api=await app.listen({host:'127.0.0.1',port:0});vi.stubEnv('SAAS_API_URL',api);vi.stubEnv('API_BASE_URL',api);
  await new Promise<void>(r=>web.listen(0,'127.0.0.1',r));const webOrigin=`http://127.0.0.1:${(web.address()as{port:number}).port}`;
  gateway=await startStaticGateway(webOrigin,api,{VC_STATIC_ACCEPTANCE:'1',E2E_PROVIDER_MODE:'absent'},0);
  const authResponse=await app.inject({method:'POST',url:'/auth/register',payload:{email:'static-bootstrap@local.test',password:'Local-fixture-123!',name:'Static acceptance',organizationName:'Static acceptance'}});expect(authResponse.statusCode).toBe(201);const auth=authResponse.json();
  const headers={authorization:`Bearer ${auth.token}`};const browserHeaders={cookie:sessionCookie(auth.token).split(';')[0]};
  const created=await app.inject({method:'POST',url:`/orgs/${auth.organization.id}/projects`,headers,payload:{name:'Owned static acceptance'}});expect(created.statusCode).toBe(201);projectId=created.json().project.id;
  const workspace=await app.inject({method:'POST',url:`/projects/${projectId}/workspaces`,headers,payload:{name:'Static target',runtimeMode:'remote-kubernetes'}});expect(workspace.statusCode).toBe(201);workspaceId=workspace.json().workspace.id;
  const start=await app.inject({method:'POST',url:'/api/runtime/workspaces',headers,payload:{workspaceId,metadata:{projectId,workspaceId}}});expect(start.statusCode).toBe(200);
  // Valid success envelope before seed is not semantic file proof.
  const emptyExport=await app.inject({method:'GET',url:`/projects/${projectId}/export/zip`,headers});expect(emptyExport.statusCode).toBe(200);
  const beforeSeedZip=await JSZip.loadAsync(emptyExport.json().archive.base64,{base64:true});expect(beforeSeedZip.file('index.html')).not.toBeNull();expect(await beforeSeedZip.file('index.html')!.async('string')).not.toContain('STATIC-SEED-NOT-PUBLISHED');
  const marker='STATIC-SEED-NOT-PUBLISHED';const html=`<!doctype html><main id="proof">${marker}</main>`;
  // Read the exact trusted QA fixture literal without invoking its seeder or network.
  const source=readFileSync('scripts/static-publication-acceptance/seed.mjs','utf8');
  const literal=source.slice(source.indexOf('const files=')+'const files='.length,source.indexOf("\nsetStage('seed-files')"));
  const files=Function('return ('+literal.trim().replace(/;$/,'')+')')() as Record<string,string>;
  expect(files['index.html']).toBe(html);expect(Object.keys(files)).toHaveLength(5);
  for(const [path,content]of Object.entries(files)){
   const save=await app.inject({method:'PUT',url:`/api/runtime/workspaces/${workspaceId}/files/write`,headers,payload:{path,content}});expect(save.statusCode).toBe(204);expect(save.headers['x-vc-file-persistence']).toBe('manifest');
  }
  const durable=await store.getProjectIdeState(projectId);expect(JSON.stringify(durable)).toContain(marker);
  // Runtime acknowledgement updates the manifest, not an independent pre-export filesystem snapshot.
  expect((await storage.listFiles(projectId)).find(f=>f.path==='index.html')?.content).not.toBe(html);
  const jsonResponse=await fetch(gateway.origin+`/api/projects/${projectId}/export/zip`,{headers:browserHeaders});expect(jsonResponse.status).toBe(200);const jsonPayload=await jsonResponse.json();
  const zipJson=await JSZip.loadAsync(jsonPayload.archive.base64,{base64:true});expect(await zipJson.file('index.html')!.async('string')).toBe(html);
  for(const [path,content]of Object.entries(files))expect(await zipJson.file(path)!.async('string')).toBe(content);
  expect((await new LocalProjectStorage().listFiles(projectId)).find(f=>f.path==='index.html')?.content).toBe(html);
  const binary=await fetch(gateway.origin+`/api/projects/${projectId}/project-action?intent=export`,{headers:browserHeaders});expect(binary.status).toBe(200);expect(binary.headers.get('content-type')).toBe('application/zip');const zipBinary=await JSZip.loadAsync(await binary.arrayBuffer());expect(await zipBinary.file('index.html')!.async('string')).toBe(html);
  const ticket=await fetch(gateway.origin+`/api/runtime-token?projectId=${projectId}`,{headers:browserHeaders});expect(ticket.status).toBe(200);const token=(await ticket.json()).token;expect(typeof token).toBe('string');
  const listing=await fetch(gateway.origin+`/api/runtime/workspaces/${workspaceId}/files?path=.`,{headers:{authorization:`Bearer ${token}`}});expect(listing.status).toBe(200);expect(JSON.stringify(await listing.json())).toContain('index.html');
  const observations: Array<{stage:string;result:string}>=[];
  await semanticReadback({api,web:gateway.origin,projectId,workspaceId,token:auth.token},fetch,(stage:string,result:string)=>observations.push({stage,result}));
  expect(observations.filter(x=>x.result==='verified')).toHaveLength(6);
  const ide=await loadProjectIdeData(new Request(gateway.origin+`/projects/${projectId}/ide?workspace=${workspaceId}&panel=files`,{headers:browserHeaders}),projectId,{} as never);expect(ide.data.projectApiError).toBeUndefined();expect(ide.data.currentWorkspaceId).toBe(workspaceId);
 }finally{gateway?.server.closeAllConnections();await new Promise<void>(r=>gateway?gateway.server.close(()=>r()):r());web.closeAllConnections();await new Promise<void>(r=>web.close(()=>r()));await app.close();await runtime.fermer();vi.unstubAllEnvs();await rm(directory,{recursive:true,force:true});}
},60000);
