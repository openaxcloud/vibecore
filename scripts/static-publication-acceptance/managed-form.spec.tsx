/** @vitest-environment jsdom */
import React from "react";
import {cleanup,fireEvent,render,waitFor} from '@testing-library/react';
import {Request as FetchRequest} from 'node-fetch';
import {createMemoryRouter,RouterProvider} from 'react-router';
import {afterEach,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {DeployPublishCard,deploymentDrafts} from '../../app/components/deploy/DeployPublishCard';
import {createDeploymentSchema} from '../../services/api/src/deployments';
import {assertOwnedJob} from './policy.mjs';
vi.mock('react-i18next',()=>({useTranslation:()=>({i18n:{language:'en'},t:(key:string)=>key})}));
afterEach(()=>{cleanup();deploymentDrafts.clear();vi.unstubAllGlobals();});
it('real managed form has static override, not legacy build inputs; defaults satisfy owned worker guard',async()=>{
 vi.stubGlobal('Request',FetchRequest);let sent:FormData|undefined;
 const router=createMemoryRouter([
 {path:'/',element:<DeployPublishCard projectId="p" workspaceId="w" busy={false} building={false} onSubmit={async data=>{sent=data;}}/>},
 {path:'/projects/p/deployments',loader:({request})=>new URL(request.url).searchParams.has('rateCard')?{rateCard:null}:{detected:{mode:'static',framework:'node',reason:''}}},
 ]);
 try{
  const view=render(<RouterProvider router={router}/>);
  await waitFor(()=>expect(view.container.querySelector('form.vc-managed-publish-form')).not.toBeNull());
  const form=view.container.querySelector('form.vc-managed-publish-form')!;
  expect(form.querySelector('input[name="buildCommand"]')).toBeNull();expect(form.querySelector('input[name="outputDirectory"]')).toBeNull();
  fireEvent.click(form.querySelector('input[name="deployModeOverride"][value="static"]')!);
  await waitFor(()=>expect((form.querySelector('button[type="submit"]') as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(form.querySelector('button[type="submit"]')!);await waitFor(()=>expect(sent).toBeDefined());
  expect(sent!.get('workspaceId')).toBe('w');expect(sent!.get('provider')).toBe('static');expect(sent!.get('deployModeOverride')).toBe('static');
  expect(sent!.get('buildCommand')).toBeNull();expect(sent!.get('outputDirectory')).toBeNull();
  const build=createDeploymentSchema.parse({provider:sent!.get('provider'),workspaceId:sent!.get('workspaceId')});
  expect(build).toMatchObject({buildCommand:'npm run build',outputDirectory:'dist',timeoutSeconds:600,envVars:{}});
  assertOwnedJob({name:'deploy.build',attemptsMade:0,data:{projectId:'p',userId:'u',deploymentId:'d',buildInput:build}}, {projectId:'p',workspaceId:'w',userId:'u'} as never);
  const route=readFileSync('app/routes/api.projects.$projectId.ide-panel.$panel.ts','utf8');
  expect(route).toContain("buildCommand: body.buildCommand || 'npm run build'");expect(route).toContain("outputDirectory: body.outputDirectory || 'dist'");
  const browser=readFileSync('scripts/static-publication-acceptance/publication.pw.ts','utf8');
  expect(browser).toContain("host.locator('form.vc-managed-publish-form')");expect(browser).not.toContain("managed.locator('input[name=\"buildCommand\"]')");
 }finally{router.dispose();}
});
