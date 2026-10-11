// Parcours 3 (LOCAL) — runtime indisponible : Save échoue (PUT files/write 5xx). Que voit l'utilisateur ?
// Et sa modification survit-elle à un rechargement ?
import { chromium } from '@playwright/test';
import fs from 'node:fs';
const WEB = process.env.WEB || 'http://127.0.0.1:5183';
const fx = JSON.parse(fs.readFileSync(new URL('./.fixture.json', import.meta.url)));
const OUT = new URL('./artefacts/', import.meta.url).pathname;
const b = await chromium.launch(); const c = await b.newContext({ viewport: { width: 1440, height: 900 } });
await c.addCookies([{ name: 'vc_session', value: fx.token, domain: '127.0.0.1', path: '/', httpOnly: true }]);
const p = await c.newPage(); const ecritures = [];
p.on('response', r => { if (r.request().method() === 'PUT' && r.url().includes('/files/write')) ecritures.push(r.status()); });
await p.goto(`${WEB}/projects/${fx.project1}/ide`); await p.waitForTimeout(10000);
await p.getByText('README.md', { exact: true }).first().click(); await p.waitForTimeout(3000);
await p.locator('.monaco-editor .view-lines').first().click(); await p.keyboard.press('ControlOrMeta+End');
const marque = 'SAUVEGARDE-' + Date.now().toString(36); await p.keyboard.type('\n' + marque);
await p.getByRole('button', { name: /^Save$|^Enregistrer$/ }).first().click();
const messages = new Set();
for (let i = 0; i < 20; i++) { (await p.evaluate(() => [...document.querySelectorAll('[role=alert],[role=status],.Toastify__toast,[data-sonner-toast]')].map(e => e.innerText.trim()).filter(Boolean))).forEach(m => messages.add(m.slice(0, 120))); await p.waitForTimeout(400); }
await p.screenshot({ path: OUT + 'sauvegarde-runtime-mort-apres-save.png' });
const barreEtat = await p.evaluate(() => [...document.querySelectorAll('footer, [role=contentinfo]')].map(e => e.innerText.replace(/\s+/g, ' ')).join(' ').slice(0, 160));
await p.reload(); await p.waitForTimeout(10000);
await p.getByText('README.md', { exact: true }).first().click(); await p.waitForTimeout(3000);
const survit = await p.evaluate(m => document.querySelector('.monaco-editor .view-lines')?.innerText.includes(m), marque);
console.log(JSON.stringify({ statutsEcriture: ecritures, messagesVusApresSave: [...messages], barreEtat, modificationPresenteApresRechargement: survit }, null, 1));
await b.close();
