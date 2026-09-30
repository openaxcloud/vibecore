// Repro : l'inconnu tape une idée sur l'accueil, clique « Build now ». Aucun compte créé.
// Mesure : délai avant interactivité, destination, conservation du prompt.
import { webkit, chromium, devices } from '@playwright/test';
const OUT = new URL('./artefacts/', import.meta.url).pathname;
const PROMPT = 'QA-HANDOFF-7731 une liste de courses partagée avec des catégories';
for (const [name, engine, ctx] of [['webkit-390', webkit, devices['iPhone 13']], ['chromium-1440', chromium, { viewport: { width: 1440, height: 900 } }]]) {
  const b = await engine.launch(); const c = await b.newContext(ctx); const p = await c.newPage();
  const t0 = Date.now();
  await p.goto('https://app.e-code.ai/', { waitUntil: 'commit' });
  const input = p.getByPlaceholder(/Describe your app idea|Décrivez/i).first();
  await input.waitFor({ state: 'visible', timeout: 30000 });
  const tVisible = Date.now() - t0;
  // Interactif = le texte tapé reste dans le champ (hydraté)
  let tInteractive = null;
  for (let i = 0; i < 60; i++) {
    await input.fill('x').catch(() => {});
    if ((await input.inputValue().catch(() => '')) === 'x') { tInteractive = Date.now() - t0; break; }
    await p.waitForTimeout(250);
  }
  const loadingText = await p.evaluate(() => document.body.innerText.includes('Loading E-Code'));
  await input.fill(PROMPT);
  await p.screenshot({ path: `${OUT}handoff-${name}-1-typed.png` });
  await p.getByRole('button', { name: /Build now|Créer maintenant/i }).first().click();
  const dlg = p.getByRole('dialog');
  await dlg.waitFor({ timeout: 10000 });
  const focusedInDialog = await p.evaluate(() => document.activeElement?.innerText?.slice(0, 40));
  const borders = await dlg.locator('button').evaluateAll(bs => bs.map(b => b.innerText.split('\n')[0].slice(0,30) + ' border=' + getComputedStyle(b).borderColor));
  console.log(JSON.stringify({ name, focusedInDialog, borders }));
  await p.screenshot({ path: `${OUT}handoff-${name}-2-modal.png` });
  await dlg.getByRole('button', { name: /Build the full app|Créer l’application complète|Créer l'application complète/i }).first().click();
  await p.waitForURL(u => !u.toString().endsWith('app.e-code.ai/'), { timeout: 20000 }).catch(() => {});
  await p.waitForTimeout(3000);
  const url = p.url();
  const ss = await p.evaluate(() => JSON.stringify(Object.fromEntries(Object.entries(sessionStorage)))).catch(() => '{}');
  const ls = await p.evaluate(() => JSON.stringify(Object.keys(localStorage))).catch(() => '[]');
  const bodyHasPrompt = await p.evaluate(t => document.body.innerText.includes(t) || [...document.querySelectorAll('input,textarea')].some(i => i.value.includes(t)), 'QA-HANDOFF-7731');
  const lsHas = await p.evaluate(t => Object.values(localStorage).some(v => v.includes(t)), 'QA-HANDOFF-7731');
  const notice = await p.evaluate(() => [...document.querySelectorAll('[role=status],[role=alert],p')].map(e => e.innerText).filter(t => /idée|idea|prompt|projet|project/i.test(t)).slice(0,3));
  const headline = await p.evaluate(() => document.querySelector('h1,h2')?.innerText);
  await p.screenshot({ path: `${OUT}handoff-${name}-3-after-choice.png` });
  console.log(JSON.stringify({ name, tVisible, tInteractive, loadingTextStillThere: loadingText, url, promptInSessionStorage: ss.includes('QA-HANDOFF-7731'), sessionKeys: Object.keys(JSON.parse(ss)), lsKeys: ls, bodyShowsPrompt: bodyHasPrompt, lsHasPrompt: lsHas, notice, headline }));
  await b.close();
}
