import {expect,type Page} from '@playwright/test';
/** Read only: follows the installed-product focus-handoff E2E's loaded Monaco getter. */
export async function editorState(page:Page,expected:string){
 return page.evaluate(async(expected)=>{
  const url=performance.getEntriesByType('resource').map(e=>e.name).find(name=>/\/assets\/vendor-monaco-core-[^/]+\.js$/.test(name));
  if(!url)return {model:false,focus:false,visual:false};
  const asset=new URL(url);if(asset.origin!==location.origin||asset.protocol!=='http:'||asset.hostname!=='127.0.0.1'||asset.search||asset.hash)return {model:false,focus:false,visual:false};
  const bundle=await import(/* @vite-ignore */ url);
  type Editor={getDomNode():HTMLElement|null;getValue():string;hasTextFocus():boolean;getModel():{uri:{path:string}}|null};
  const monaco=[bundle,...Object.values(bundle)].find((v:any)=>typeof v?.editor?.getEditors==='function') as {editor:{getEditors():Editor[]}}|undefined;
  const editors=monaco?.editor.getEditors().filter(e=>e.getDomNode()?.getClientRects().length)||[];
  // Exact product FilesStore workbench root + EditorAdapter file:/// convention.
  const matches=editors.filter(e=>e.getModel()?.uri.path==='/home/project/index.html');
  const editor=matches.length===1?matches[0]:undefined;
  const text=editor?.getDomNode()?.querySelector('.view-lines')?.textContent?.replace(/\u00a0/g,' ');
  return {model:editor?.getValue()===expected,focus:editor?.hasTextFocus()===true,visual:text===expected};
 },expected);
}
export async function editIndexThroughVisibleMonaco(page:Page,html:string){
 const view=page.locator('.monaco-editor .view-lines').filter({visible:true});await expect(view).toHaveCount(1);
 const tab=page.getByRole('tab').filter({hasText:'index.html'}).filter({visible:true});await expect(tab).toHaveCount(1);
 const transition=await tab.evaluateHandle(tab=>{
  const state={observed:false,disconnect:()=>observer.disconnect()};
  const observer=new MutationObserver(records=>{state.observed ||= tab.getAttribute('data-dirty')==='true'||records.some(r=>r.oldValue==='true');});
  observer.observe(tab,{attributes:true,attributeFilter:['data-dirty'],attributeOldValue:true});return state;
 });
 try{
  await view.click();await page.keyboard.press('ControlOrMeta+a');await page.keyboard.insertText(html);
  await expect.poll(()=>transition.evaluate(s=>s.observed),{timeout:10000}).toBe(true);
  await expect.poll(()=>editorState(page,html),{timeout:10000}).toEqual({model:true,focus:true,visual:true});
 }finally{await transition.evaluate(s=>s.disconnect()).catch(()=>undefined);await transition.dispose().catch(()=>undefined);}
}
