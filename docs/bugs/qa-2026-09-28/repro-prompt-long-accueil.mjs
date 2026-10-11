// Parcours 4 — prompt très long saisi sur l'accueil de PROD (aucun compte créé).
// Mesure : longueur acceptée par le champ, longueur relayée en sessionStorage, avertissement éventuel.
import { chromium } from '@playwright/test';
const WEB = process.env.WEB || 'https://app.e-code.ai';
const N = 12000;
const texte = ('QA-LONG ' + 'Une application de gestion de stock avec rôles, historique et exports. ').repeat(200).slice(0, N - 8) + ' FIN-QA';
const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1440, height: 900 }, locale: 'fr-FR' })).newPage();
await p.goto(WEB + '/'); const champ = p.getByPlaceholder(/Décrivez votre idée|Describe your app idea/i).first();
await champ.waitFor(); await p.waitForTimeout(4000);
await champ.fill(texte);
const accepte = (await champ.inputValue()).length;
const maxLength = await champ.getAttribute('maxlength');
await p.getByRole('button', { name: /Créer maintenant|Build now/i }).first().click();
const dlg = p.getByRole('dialog'); await dlg.waitFor();
const avertissement = await p.evaluate(() => /8[\s ,.]?000|trop long|too long|tronqu|truncat|caractères max|characters max/i.test(document.body.innerText));
await dlg.getByRole('button', { name: /Créer l.application complète|Build the full app/i }).click();
await p.waitForURL(/login/); 
const relaye = await p.evaluate(() => sessionStorage.getItem('pendingAppDescription')?.length);
console.log(JSON.stringify({ saisi: N, accepteParLeChamp: accepte, maxLength, relayeEnSessionStorage: relaye, avertissementAvantEnvoi: avertissement, limiteAppliqueeEnSuiteParProjectsNew: 8000 }));
await b.close();
