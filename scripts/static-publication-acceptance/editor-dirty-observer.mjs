/** Playwright-side observer. Reads only dirty state of this exact desktop tab identity. */
export function observeOwnedFileTab(tab) {
 const tabId=tab.getAttribute('data-tab-id');
 const matches=node=>node.nodeType===1&&node.getAttribute('role')==='tab'&&node.getAttribute('data-tab-id')===tabId;
 const state={valid:Boolean(tabId)&&matches(tab)&&tab.isConnected&&tab.getAttribute('data-dirty')!=='true',observed:false,replaced:()=>!tab.isConnected,disconnect:()=>{}};
 if(!state.valid)return state;
 const isDirty=node=>matches(node)&&node.getAttribute('data-dirty')==='true';
 const observer=new MutationObserver(records=>{
  for(const record of records){
   if(record.type==='attributes'&&matches(record.target)){
    state.observed ||= record.oldValue==='true'||isDirty(record.target);
   }else if(record.type==='childList'){
    for(const node of record.addedNodes){
     state.observed ||= isDirty(node)||node.nodeType===1&&Array.from(node.querySelectorAll('[role=tab][data-tab-id][data-dirty=true]')).some(isDirty);
    }
   }
  }
 });
 observer.observe(tab.ownerDocument.body,{subtree:true,childList:true,attributes:true,attributeFilter:['data-dirty'],attributeOldValue:true});
 state.disconnect=()=>observer.disconnect();
 return state;
}
