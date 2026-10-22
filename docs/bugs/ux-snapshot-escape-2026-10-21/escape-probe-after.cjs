const {chromium,expect}=require('@playwright/test');
const fs=require('fs');
(async()=>{
const out='/workspace/ux-artifacts/snapshot-escape/after-native';fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true});
const context=await browser.newContext({viewport:{width:1280,height:720}});
const suffix=Date.now();let auth;
const registration=await context.request.post('http://127.0.0.1:3016/auth/register',{data:{email:`escape-${suffix}@local.test`,password:'Password123!',name:'Synthetic escape probe',organizationName:`Escape ${suffix}`}});expect(registration.ok()).toBe(true);auth=await registration.json();
const response=await context.request.post(`http://127.0.0.1:3016/orgs/${auth.organization.id}/projects`,{headers:{authorization:`Bearer ${auth.token}`},data:{name:'Escape probe'}});expect(response.ok()).toBe(true);const project=(await response.json()).project;
await context.addCookies([{name:'vc_session',value:auth.token,url:'http://127.0.0.1:5210',httpOnly:true,sameSite:'Lax'},{name:'vibecore-lang',value:'fr',url:'http://127.0.0.1:5210'}]);
const page=await context.newPage();const restores=[];page.on('request',r=>{if(r.method()==='POST'&&/intent=restore/.test(r.postData()||''))restores.push(r.url());});
const results=[];
try{
await page.goto(`http://127.0.0.1:5210/projects/${project.id}/snapshots?lang=fr`);const label=`Escape ${suffix}`;await page.locator('#snapshot-label').fill(label);await page.getByRole('button',{name:'Créer l’instantané',exact:true}).click();const opener=page.getByRole('button',{name:`Restaurer ${label}`,exact:true});await expect(opener).toBeVisible();await page.reload();await expect(opener).toBeVisible();const dialog=page.getByRole('dialog',{name:new RegExp(label)});
for(let i=0;i<100;i++){
 await opener.focus();await page.keyboard.press('Enter');await expect(dialog).toBeVisible();
 await page.keyboard.press('Escape');
 try{await expect(dialog).toBeHidden();await expect(opener).toBeFocused();results.push({iteration:i,passed:true});}
 catch(error){results.push({iteration:i,passed:false,error:String(error)});await page.screenshot({path:`${out}/failed-${i}.png`});fs.writeFileSync(`${out}/events-${i}.json`,JSON.stringify(await page.evaluate(()=>({active:document.activeElement?.outerHTML,dialogs:[...document.querySelectorAll("[role=dialog]")].map(x=>({state:x.dataset.state,id:x.id}))})),null,2));throw error;}
}
expect(restores).toEqual([]);await page.screenshot({path:`${out}/after-closed.png`});
}catch(error){process.exitCode=1;fs.writeFileSync(`${out}/failure.txt`,String(error));}
finally{fs.writeFileSync(`${out}/results.json`,JSON.stringify({results,restoreRequests:restores},null,2));console.log(JSON.stringify({passed:results.filter(x=>x.passed).length,failed:results.filter(x=>!x.passed).length}));await browser.close();}
})();
