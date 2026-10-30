import { act, StrictMode, useEffect, useLayoutEffect, useState } from 'react';
import { cleanup, render } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { hydrateRoot } from 'react-dom/client';
import { afterEach, expect, it } from 'vitest';
import { useHydrated } from 'remix-utils/use-hydrated';
import { MobileOverlayFocusProvider, useMobileOverlayFocus } from '/workspace/vibecore-ui-terminal-handoff/app/components/chat/MobileOverlayFocus';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
afterEach(cleanup);
function useCurrent() {const [ready,setReady]=useState(false);useEffect(()=>setReady(true),[]);return ready;}
type Commit = {ready:boolean; present:boolean; focused:boolean};
function Shell({useReady,record}:{useReady:()=>boolean;record:(c:Commit)=>void}) {
 const ready=useReady();
 const {rootRef}=useMobileOverlayFocus(ready,true);
 useLayoutEffect(()=>{record({ready,present:!!rootRef.current?.querySelector('button'),focused:document.activeElement?.getAttribute('data-testid')==='button-more-tabs'});});
 return <div ref={rootRef}>{ready&&<nav data-testid="mobile-bottom-navigation"><button data-testid="button-more-tabs">Panels</button></nav>}</div>;
}
function tree(key:string,useReady:()=>boolean,record:(c:Commit)=>void,project='isolated') {
 return <StrictMode><MobileOverlayFocusProvider projectId={project} windowId="main"><Shell key={key} useReady={useReady} record={record}/></MobileOverlayFocusProvider></StrictMode>;
}
it.each([['old',useCurrent,false],['proposed',useHydrated,true]] as const)('%s first replacement commit and restored focus',(name,useReady,expected)=>{
 const commits:Commit[]=[];
 const record=(c:Commit)=>commits.push(c);
 const view=render(tree('before',useReady,record));
 view.getByRole('button').focus();
 commits.length=0;
 view.rerender(tree('after',useReady,record));
 expect(commits[0]).toEqual({ready:expected,present:expected,focused:expected});
 expect(document.activeElement).toBe(view.getByRole('button'));
 console.log(name,JSON.stringify(commits));
});
it('proposed readiness does not restore a previous project control',()=>{
 const record=()=>{};
 const view=render(tree('before',useHydrated,record));
 view.getByRole('button').focus();
 view.rerender(tree('after',useHydrated,record,'different'));
 expect(document.activeElement).toBe(document.body);
});
it('retains server/client initial parity then exposes chrome; no hydration recovery',async()=>{
 const record=()=>{};
 const element=tree('initial',useHydrated,record);
 const html=renderToString(element);
 expect(html).not.toContain('<button');
 const host=document.createElement('div');document.body.append(host);host.innerHTML=html;
 const errors:unknown[]=[];
 let root:ReturnType<typeof hydrateRoot>;
 await act(async()=>{root=hydrateRoot(host,element,{onRecoverableError:e=>errors.push(e)});});
 expect(errors).toEqual([]);
 expect(host.querySelector('button')?.textContent).toBe('Panels');
 await act(async()=>root!.unmount());host.remove();
});
