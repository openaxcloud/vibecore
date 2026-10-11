// Sonde (LOCAL) : à la RÉOUVERTURE d'un projet dont le fil contient une écriture de fichier,
// l'IDE rejoue-t-il l'action (proposition de patch appliquée, toast « fichier appliqué ») ?
import { chromium } from '@playwright/test';
const WEB = 'http://127.0.0.1:5183', API = 'http://127.0.0.1:3011';
const tag = Date.now().toString(36);
const j = async (m, p, body, token) => { const r = await fetch(API + p, { method: m, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined }); const t = await r.text(); try { return JSON.parse(t); } catch { return t; } };
const reg = await j('POST', '/auth/register', { email: `qa-rejeu-${tag}@example.test`, password: `Qa-${tag}-Local!9`, name: 'QA', organizationName: `QA ${tag}` });
const token = reg.token;
const proj = await j('POST', `/orgs/${reg.organization.id}/projects`, { name: 'QA rejeu', framework: 'react' }, token);
const projectId = (proj.project || proj).id;
const conv = await j('POST', `/projects/${projectId}/ai/conversations`, { title: 'rejeu' }, token);
const conversationId = conv.conversation.id;
await j('PUT', `/projects/${projectId}/ai/conversations/${conversationId}/transcript`, { messages: [
  { clientId: 'u1', role: 'user', content: 'Ajoute une page de contact.' },
  { clientId: 'a1', role: 'assistant', content: 'La page de contact est créée.\n\n<boltArtifact id="contact" title="Page de contact"><boltAction type="file" filePath="src/Contact.tsx">// VERSION-AGENT-ANCIENNE\n</boltAction><boltAction type="shell">echo REJEU-SHELL</boltAction></boltArtifact>' },
] }, token);
// L'utilisateur a MODIFIÉ le fichier après l'agent : c'est cette version que contient le stockage du projet.
const { default: JSZip } = await import('jszip');
const zip = new JSZip(); zip.file('src/Contact.tsx', '// VERSION-UTILISATEUR-RECENTE\n');
const imp = await j('POST', `/projects/${projectId}/files/import/zip`, { zipBase64: await zip.generateAsync({ type: 'base64' }) }, token);
const lireStockage = async () => { const a = await j('GET', `/projects/${projectId}/export/zip`, null, token); const z = await JSZip.loadAsync(Buffer.from(a.archive.base64, 'base64')); const f = Object.keys(z.files).find(n => n.endsWith('src/Contact.tsx')); return f ? (await z.files[f].async('string')).trim() : null; };
console.log('AVANT toute ouverture, stockage =', await lireStockage());
await j('PUT', `/projects/${projectId}/ide-state`, { state: { chat: { metadata: { aiConversationId: conversationId } } } }, token);
const b = await chromium.launch(); const c = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await c.addCookies([{ name: 'vc_session', value: token, domain: '127.0.0.1', path: '/', httpOnly: true }]);
for (const ouverture of [1, 2]) {
  const p = await c.newPage(); const reseau = []; const toasts = new Set();
  p.on('request', r => { const u = new URL(r.url()); if (/agent-patch-proposals/.test(u.pathname) && r.method() !== 'GET') reseau.push(`${r.method()} ${u.pathname.replace(projectId, ':id')}`); });
  await p.goto(`${WEB}/projects/${projectId}/ide`);
  for (let i = 0; i < 30; i++) { (await p.evaluate(() => [...document.querySelectorAll('.Toastify__toast')].map(t => t.innerText.replace(/\s+/g, ' ').slice(0, 90)))).forEach(t => toasts.add(t)); await p.waitForTimeout(700); }
  const archive = await j('GET', `/projects/${projectId}/export/zip`, null, token);
  const z = await JSZip.loadAsync(Buffer.from(archive.archive.base64, 'base64'));
  const f = Object.keys(z.files).find(n => n.endsWith('src/Contact.tsx'));
  const stockage = f ? (await z.files[f].async('string')).trim() : null;
  await p.getByText('Contact.tsx', { exact: true }).first().click().catch(() => {});
  await p.waitForTimeout(1500);
  const editeur = await p.evaluate(() => document.querySelector('.monaco-editor .view-lines')?.innerText.replace(/\s+/g, ' ').trim() ?? null);
  const statuts = await p.evaluate(() => [...document.querySelectorAll('[data-action-status],[data-status]')].map(e => e.getAttribute('data-action-status') || e.getAttribute('data-status')).slice(0, 8));
  console.log(JSON.stringify({ ouverture, ecrituresDePropositions: reseau.length, toasts: [...toasts].map(t => t.slice(0, 40)), stockageDuProjet: stockage, editeur }));
  await p.close();
}
await b.close();
