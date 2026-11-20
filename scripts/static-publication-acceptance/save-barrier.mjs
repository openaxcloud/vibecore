const codes=new Set([
 'save-click-rejected','save-post-before-receipt','save-pending-timeout','save-put-not-seen','save-body-invalid','save-body-wrong-file','save-body-content-mismatch',
 'save-receipt-timeout','save-receipt-before-release','save-receipt-non-204','save-receipt-not-manifest','save-response-invalid','save-barrier-unexpected',
]);
export class SaveBarrierFailure extends Error {
 constructor(code){super('PUBLICATION_BARRIER_NOT_VERIFIED');this.code=codes.has(code)?code:'save-barrier-unexpected';}
}
export function saveBarrierFailureCode(error){return error instanceof SaveBarrierFailure&&codes.has(error.code)?error.code:'save-barrier-unexpected';}
const stop=code=>{throw new SaveBarrierFailure(code);};

/** A pre-existing autosave is not proof that the actual Publish handler has started. */
export async function proveHeldPublication({clicked,waitPending,waitSave,saveSeen,saveFailure,earlyPost,postCount}){
 const assertNoEarlyPost=()=>{if(earlyPost())stop('save-post-before-receipt');};
 if(!await clicked.catch(()=>false))stop('save-click-rejected');
 assertNoEarlyPost();
 try{await waitPending();}catch{assertNoEarlyPost();stop('save-pending-timeout');}
 assertNoEarlyPost();
 try{await waitSave();}catch{assertNoEarlyPost();stop(saveFailure());}
 assertNoEarlyPost();
 if(!saveSeen())stop(saveFailure());
 if(postCount()!==0)stop('save-post-before-receipt');
}

export function exactEndpoint(origin,pathname){return url=>url.origin===origin&&url.pathname===pathname&&!url.search&&!url.hash;}

/** True receipt belongs to a PUT that this very driver actually held. No response text is inspected. */
export function observeHeldSave({scope,file,content}){
 const held=new Set();
 let putFailure='save-put-not-seen',receiptFailure='save-receipt-timeout',verified=false,released=false;
 return{
  request(request){
   if(request.method()!=='PUT'||!scope(new URL(request.url())))return false;
   let body;
   try{body=request.postDataJSON();}catch{putFailure='save-body-invalid';return false;}
   if(!body||typeof body.path!=='string'||typeof body.content!=='string'){putFailure='save-body-invalid';return false;}
   if(body.path!==file){putFailure='save-body-wrong-file';return false;}
   if(body.content!==content){putFailure='save-body-content-mismatch';return false;}
   held.add(request);
   return true;
  },
  response(response){
   if(!held.has(response.request()))return;
   if(!released){receiptFailure='save-receipt-before-release';return;}
   if(response.status()!==204){receiptFailure='save-receipt-non-204';return;}
   if(response.headers()['x-vc-file-persistence']!=='manifest'){receiptFailure='save-receipt-not-manifest';return;}
   verified=true;
  },
  allowRelease:()=>{released=true;},
  seen:()=>held.size>0,
  verified:()=>verified,
  putFailure:()=>putFailure,
  receiptFailure:()=>receiptFailure,
 };
}

export async function guardPublicationPost(route,receipt,onEarly){
 if(route.request().method()!=='POST')return route.continue();
 if(!receipt()){onEarly();return route.abort('blockedbyclient');}
 return route.continue();
}
