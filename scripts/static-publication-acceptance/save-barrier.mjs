import assert from 'node:assert/strict';
/** A pre-existing autosave is not proof that the actual Publish handler has started. */
export async function proveHeldPublication({clicked,waitPending,waitSave,saveSeen,earlyPost,postCount}){
 assert.equal(await clicked,true,'PUBLISH_CLICK_FAILED');
 assert.equal(earlyPost(),false,'POST_BEFORE_SAVE_RECEIPT');
 await waitPending();
 assert.equal(earlyPost(),false,'POST_BEFORE_SAVE_RECEIPT');
 await waitSave();
 assert.equal(earlyPost(),false,'POST_BEFORE_SAVE_RECEIPT');
 assert.equal(saveSeen(),true,'EXPECTED_SAVE_NOT_SEEN');
 assert.equal(postCount(),0,'POST_BEFORE_SAVE_RECEIPT');
}
export async function guardPublicationPost(route,receipt,onEarly){
 if(route.request().method()!=='POST')return route.continue();
 if(!receipt()){onEarly();return route.abort('blockedbyclient');}
 return route.continue();
}
