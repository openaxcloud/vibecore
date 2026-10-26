const {chromium,expect}=require('@playwright/test');
const fs=require('node:fs');
const evidenceDir=process.env.UI_EVIDENCE_DIR||'/tmp/ui-account-browser11699';fs.mkdirSync(evidenceDir,{recursive:true});
const base=process.env.UI_BASE_URL||'http://127.0.0.1:11699';
if(new URL(base).hostname!=='127.0.0.1')throw Error('local only');
const viewports=[[320,740],[390,844],[844,390],[820,1180],[1440,900]];
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 const receipt={base,synthetic:true,browser:browser.version(),matrix:[],interactions:[],errors:[]};
 try {
 for(const language of ['fr','en'])for(const theme of ['light','dark']){
  const context=await browser.newContext({viewport:{width:320,height:740}});
  await context.addCookies([{name:'vc_session',value:'synthetic-ui',url:base},{name:'ecode_theme',value:theme,url:base}]);
  await context.addInitScript(()=>localStorage.setItem('ecode:user-area-tour:v1',JSON.stringify({version:1,status:'dismissed',step:0})));
  await context.route('**/*',r=>r.request().method()==='GET'&&new URL(r.request().url()).origin===new URL(base).origin?r.continue():r.abort());
  const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>receipt.errors.push(e.message));
  await page.goto(`${base}/account-settings/data?lang=${language}`,{waitUntil:'domcontentloaded'});
  const open=page.getByTestId('account-delete-open');await expect(open).toBeVisible();await expect(page.locator('html')).toHaveAttribute('data-theme',theme);
  await open.click();const dialog=page.getByRole('dialog');const input=page.locator('input[name=confirm]');
  await expect(input).toBeFocused();
  const description=await dialog.evaluate(e=>document.getElementById(e.getAttribute('aria-describedby'))?.textContent||'');expect(description.length).toBeGreaterThan(40);
  await input.fill('unfinished synthetic confirmation');
  for(let step=0;step<5;step++){await page.keyboard.press('Tab');expect(await dialog.evaluate(e=>e.contains(document.activeElement))).toBe(true);}
  for(const [width,height]of viewports){
   await page.setViewportSize({width,height});await expect(input).toHaveValue('unfinished synthetic confirmation');
   const confirm=page.getByTestId('account-delete-confirm');
   await expect(confirm).toBeDisabled();
   const bounds=await dialog.evaluate(e=>({width:e.clientWidth,scroll:e.scrollWidth,rect:{left:e.getBoundingClientRect().left,right:e.getBoundingClientRect().right}}));
   expect(bounds.scroll).toBeLessThanOrEqual(bounds.width+1);expect(bounds.rect.left).toBeGreaterThanOrEqual(0);expect(bounds.rect.right).toBeLessThanOrEqual(width+1);
   receipt.matrix.push({page:'data-dialog',language,theme,width,height,bounds,draftPreserved:true});
   if(language==='fr'&&theme==='light'&&[320,844,1440].includes(width))await page.screenshot({path:`${evidenceDir}/after-data-${width}.png`});
  }
  await page.keyboard.press('Escape');await expect(dialog).toBeHidden();await expect(open).toBeFocused();
  await page.setViewportSize({width:640,height:400});await open.click();await expect(input).toHaveValue('');
  await dialog.getByRole('button',{name:language==='fr'?'Annuler':'Cancel',exact:true}).click();await expect(dialog).toBeHidden();await expect(open).toBeFocused();
  receipt.interactions.push({language,theme,keyboardFocusContained:true,escapeRestored:true,cancelRestored:true,reopenCleared:true,layoutZoomEquivalent:'1280/2=640; not native zoom'});
  const accountNav=page.getByRole('navigation',{name:language==='fr'?'Paramètres du compte':'Account settings'});
  await accountNav.locator('a[href="/account-settings/connected"]').click();await expect(page.locator('#connected-accounts-heading')).toBeVisible();
  for(const [width,height]of viewports){
   await page.setViewportSize({width,height});
   const bounds=await page.evaluate(()=>({width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));
   expect(bounds.scroll).toBeLessThanOrEqual(bounds.width+1);
   receipt.matrix.push({page:'connected',language,theme,width,height,bounds});
  }
  await page.goBack();await expect(open).toBeVisible();await expect(dialog).toBeHidden();
  receipt.interactions.push({language,theme,nativeBackToData:true});
  await context.close();
 }
 expect(receipt.errors).toEqual([]);
 }finally{fs.writeFileSync(`${evidenceDir}/receipt.json`,JSON.stringify(receipt,null,2));await browser.close();}
 console.log(`${receipt.matrix.length} viewport observations, ${receipt.interactions.length} interaction groups passed`);
})().catch(e=>{console.error(e);process.exit(1)});
