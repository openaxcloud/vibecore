import {expect,type Page} from '@playwright/test';
import {emitDiagnostic} from './diagnostics.mjs';
import {observeOwnedFileTab} from './editor-dirty-observer.mjs';

/** Read only: follows the installed-product focus-handoff E2E's loaded Monaco getter. */
type MarkerRange={start:number;end:number};
export async function editorState(page:Page,expected:string,markerRange?:MarkerRange){
 return page.evaluate(async({expected,markerRange})=>{
  const absent={present:false,model:false,focus:false,visual:false,selectedMarker:false};
  const url=performance.getEntriesByType('resource').map(e=>e.name).find(name=>/\/assets\/vendor-monaco-core-[^/]+\.js$/.test(name));
  if(!url)return absent;
  const asset=new URL(url);if(asset.origin!==location.origin||asset.protocol!=='http:'||asset.hostname!=='127.0.0.1'||asset.search||asset.hash)return absent;
  const bundle=await import(/* @vite-ignore */ url);
  type Range={startLineNumber:number;startColumn:number;endLineNumber:number;endColumn:number};
  type Editor={getDomNode():HTMLElement|null;getValue():string;hasTextFocus():boolean;getSelection():Range|null;getModel():{uri:{path:string};getOffsetAt(position:{lineNumber:number;column:number}):number}|null};
  const monaco=[bundle,...Object.values(bundle)].find((v:any)=>typeof v?.editor?.getEditors==='function') as {editor:{getEditors():Editor[]}}|undefined;
  const editors=monaco?.editor.getEditors().filter(e=>e.getDomNode()?.getClientRects().length)||[];
  // Exact product FilesStore workbench root + EditorAdapter file:/// convention.
  const matches=editors.filter(e=>e.getModel()?.uri.path==='/home/project/index.html');
  const editor=matches.length===1?matches[0]:undefined;
  const text=editor?.getDomNode()?.querySelector('.view-lines')?.textContent?.replace(/\u00a0/g,' ');
  const selection=editor?.getSelection(),model=editor?.getModel();
  const selectedMarker=Boolean(selection&&model&&markerRange&&model.getOffsetAt({lineNumber:selection.startLineNumber,column:selection.startColumn})===markerRange.start&&model.getOffsetAt({lineNumber:selection.endLineNumber,column:selection.endColumn})===markerRange.end);
  return {present:Boolean(editor),model:editor?.getValue()===expected,focus:editor?.hasTextFocus()===true,visual:text===expected,selectedMarker};
 },{expected,markerRange});
}

const markerFrame=/^<!doctype html><main id="proof">([A-Za-z][A-Za-z0-9-]{0,78})<\/main>$/;
const markerPrefix='<!doctype html><main id="proof">';
const markerSuffix='</main>';

export function planMarkerEdit(priorHtml:string,html:string){
 const before=markerFrame.exec(priorHtml),after=markerFrame.exec(html);
 if(!before||!after||before[0]!==priorHtml||after[0]!==html||before[1]===after[1])return undefined;
 const start=markerPrefix.length;
 if(priorHtml.indexOf(before[1])!==start||priorHtml.lastIndexOf(before[1])!==start||
    html.indexOf(after[1])!==start||html.lastIndexOf(after[1])!==start)return undefined;
 return {range:{start,end:start+before[1].length},suffixLength:markerSuffix.length,oldLength:before[1].length,text:after[1]};
}

export async function editIndexThroughVisibleMonaco(page:Page,html:string,priorHtml:string,stage:string){
 const fail=(code:string):never=>{emitDiagnostic(stage,'failed',code);throw new Error('EDITOR_EDIT_NOT_VERIFIED');};
 const planned=planMarkerEdit(priorHtml,html);
 if(!planned)return fail('edit-fixture-marker');
 const view=page.locator('.monaco-editor .view-lines').filter({visible:true});await expect(view).toHaveCount(1);
 const tab=page.getByRole('tab').filter({hasText:'index.html'}).filter({visible:true});await expect(tab).toHaveCount(1);
 const transition=await tab.evaluateHandle(observeOwnedFileTab);
 try{
  if(!await transition.evaluate(s=>s.valid))fail('edit-tab-not-clean');
  await view.click();
  // Keep the HTML scaffold intact. Monaco treats a leading "<" as surround-selection
  // even for multi-character Input.insertText when the HTML language is active.
  await page.keyboard.press('ControlOrMeta+End');
  for(let i=0;i<planned.suffixLength;i++)await page.keyboard.press('ArrowLeft');
  for(let i=0;i<planned.oldLength;i++)await page.keyboard.press('Shift+ArrowLeft');
  const selected=await editorState(page,priorHtml,planned.range);
  if(!selected.present||!selected.model)fail('edit-model-before');
  if(!selected.focus)fail('edit-focus-before');
  if(!selected.selectedMarker)fail('edit-selection');
  await page.keyboard.insertText(planned.text);
  let observed=false;
  try {
   await expect.poll(async()=>{
    const current=await editorState(page,html);
    observed ||= await transition.evaluate(s=>s.observed);
    return current.model&&current.focus&&current.visual&&observed;
   },{timeout:10000}).toBe(true);
  }catch{
   const current=await editorState(page,html);
   if(!current.present)fail('edit-model-missing');
   if(!current.model)fail((await editorState(page,priorHtml)).model?'edit-model-still-original':'edit-model-unexpected');
   if(!observed&&!await transition.evaluate(s=>s.observed))fail(await transition.evaluate(s=>s.replaced())?'edit-dirty-unseen-replaced':'edit-dirty-unseen');
   if(!current.focus)fail('edit-focus-after');
   if(!current.visual)fail('edit-view-diverged');
   fail('edit-not-settled');
  }
 }finally{await transition.evaluate(s=>s.disconnect()).catch(()=>undefined);await transition.dispose().catch(()=>undefined);}
}
