/**
 * Décompose le temps mural d'un chargement à froid : file d'attente, attente
 * serveur, exécution. Ne mesure PAS un poids -- le poids a déjà été mesuré et
 * ne valait rien (registre, entrée 29).
 *
 * LIMITE ASSUMÉE : WebKit tourne ici sur le CPU du Mac. Le coût d'EXÉCUTION
 * mesuré est un PLANCHER, pas celui du téléphone d'Avi. La file d'attente et
 * l'attente serveur, elles, sont fidèles.
 */
import { webkit, chromium, devices } from '@playwright/test';

const URL_CIBLE = process.env.CIBLE;
const MOTEUR = process.env.MOTEUR || 'webkit';
const iphone = devices['iPhone 15 Pro'];

const lance = async () => {
  const nav = MOTEUR === 'webkit' ? webkit : chromium;
  const b = await nav.launch();
  const ctx = await b.newContext(MOTEUR === 'webkit' ? iphone : { viewport: { width: 1440, height: 900 } });
  if (process.env.QA_TOKEN) {
    const origine = new URL(URL_CIBLE).origin;
    await ctx.addCookies([{ name: 'vc_session', value: process.env.QA_TOKEN, url: origine, httpOnly: true, sameSite: 'Lax' }]);
  }
  const p = await ctx.newPage();

  const reqs = [];
  p.on('requestfinished', async (r) => {
    try {
      const t = r.timing();
      const resp = await r.response();
      reqs.push({
        url: r.url(),
        type: r.resourceType(),
        t0: t.startTime,
        connect: t.connectEnd - t.connectStart,
        ttfb: t.responseStart - t.requestStart,
        dl: t.responseEnd - t.responseStart,
        fin: t.responseEnd,
        status: resp ? resp.status() : 0,
      });
    } catch {}
  });

  const depart = Date.now();
  await p.goto(URL_CIBLE, { waitUntil: process.env.ATTENTE || 'load', timeout: 90000 });
  const tLoad = Date.now() - depart;

  const perf = await p.evaluate(() => {
    /*
     * WebKit rend `getEntriesByType('navigation')` VIDE ici : domInteractive
     * valait 0 et loadEventEnd NaN. On retombe sur performance.timing, qui est
     * obsolète mais rempli, et on le RECALE sur navigationStart. Le témoin est
     * `sourceTiming` : si aucune des deux sources ne donne un domInteractive
     * strictement positif, on le dit au lieu d'afficher un zéro trompeur.
     */
    const nav0 = performance.getEntriesByType('navigation')[0];
    const T = performance.timing || {};
    const base = T.navigationStart || 0;
    const rec = (k) => (T[k] ? T[k] - base : 0);
    const n = nav0 && nav0.domInteractive > 0
      ? { src: 'navigation', domInteractive: nav0.domInteractive, domContentLoadedEventEnd: nav0.domContentLoadedEventEnd, loadEventEnd: nav0.loadEventEnd, responseEnd: nav0.responseEnd }
      : { src: 'timing', domInteractive: rec('domInteractive'), domContentLoadedEventEnd: rec('domContentLoadedEventEnd'), loadEventEnd: rec('loadEventEnd'), responseEnd: rec('responseEnd') };
    const r = performance.getEntriesByType('resource');
    return {
      // TÉMOIN : si nbRessources vaut 0, l'API n'a rien vu et tout le reste est nul
      nbRessources: r.length,
      sourceTiming: n.src,
      domInteractive: n.domInteractive,
      domContentLoaded: n.domContentLoadedEventEnd,
      loadEventEnd: n.loadEventEnd,
      responseEnd: n.responseEnd,
      // temps passé DANS le script : DCL - fin du HTML, hors réseau des assets
      dernierAssetFini: r.length ? Math.max(...r.map((x) => x.responseEnd)) : 0,
      cumulReseau: r.reduce((a, x) => a + (x.responseEnd - x.startTime), 0),
    };
  });

  await b.close();
  return { reqs, tLoad, perf };
};

const { reqs, tLoad, perf } = await lance();

console.log(`== ${MOTEUR} == ${URL_CIBLE}`);
console.log(`TÉMOIN requêtes capturées : ${reqs.length}  |  ressources vues par l'API page : ${perf.nbRessources}`);
if (reqs.length === 0) { console.log('AUCUNE REQUÊTE — mesure invalide, on ne conclut rien'); process.exit(1); }

const t0min = Math.min(...reqs.map((r) => r.t0));
const norm = reqs.map((r) => ({ ...r, deb: r.t0 - t0min, end: r.t0 - t0min + r.fin })).sort((a, b) => a.deb - b.deb);
const tmur = Math.max(...norm.map((r) => r.end));

// parallélisme réel : nombre en vol échantillonné tous les 25 ms
let maxPar = 0, sommePar = 0, ech = 0;
for (let t = 0; t <= tmur; t += 25) {
  const n = norm.filter((r) => r.deb <= t && r.end >= t).length;
  maxPar = Math.max(maxPar, n); sommePar += n; ech++;
}

// vagues : un nouveau départ après >150 ms sans départ ouvre une vague
let vagues = 1, prec = norm[0].deb;
const debutsVague = [norm[0].deb];
for (const r of norm.slice(1)) { if (r.deb - prec > 150) { vagues++; debutsVague.push(r.deb); } prec = Math.max(prec, r.deb); }

const cumulDL = norm.reduce((a, r) => a + r.fin, 0);
const ttfbs = norm.map((r) => r.ttfb).sort((a, b) => a - b);
const med = ttfbs[Math.floor(ttfbs.length / 2)];

console.log(`
--- 1. FILE D'ATTENTE ---
  temps mural réseau      : ${Math.round(tmur)} ms
  temps mural jusqu'à load: ${tLoad} ms
  cumul des téléchargements: ${Math.round(cumulDL)} ms   (facteur ${(cumulDL / tmur).toFixed(1)}x)
  parallélisme MAX        : ${maxPar} requêtes simultanées
  parallélisme MOYEN      : ${(sommePar / ech).toFixed(1)}
  vagues successives      : ${vagues}   départs à ${debutsVague.map((x) => Math.round(x)).join(', ')} ms

--- 2. ATTENTE SERVEUR (TTFB) ---
  TTFB médian : ${Math.round(med)} ms
  TTFB min/max: ${Math.round(ttfbs[0])} / ${Math.round(ttfbs[ttfbs.length - 1])} ms
  somme TTFB  : ${Math.round(ttfbs.reduce((a, b) => a + b, 0))} ms sur ${ttfbs.length} requêtes

--- 3. EXÉCUTION (source: ${perf.sourceTiming}; plancher CPU Mac, PAS l'iPhone) ---
  dernier asset terminé   : ${Math.round(perf.dernierAssetFini)} ms
  domInteractive          : ${Math.round(perf.domInteractive)} ms
  domContentLoaded        : ${Math.round(perf.domContentLoaded)} ms
  loadEventEnd            : ${Math.round(perf.loadEventEnd)} ms
  >>> après le dernier octet, il reste ${Math.round(perf.loadEventEnd - perf.dernierAssetFini)} ms de travail CPU

--- RÉPARTITION PAR NATURE (statique servi par l'origine vs appel applicatif) ---`);
{
  const cat = (u) => (/\/assets\/|\.css$|\.webmanifest$|\.woff2?$/.test(u) ? 'statique'
    : /\/api\/|__manifest|\/auth\//.test(u) ? 'API' : 'autre');
  const g = {};
  for (const r of norm) { const c = cat(r.url); (g[c] ||= []).push(r); }
  for (const [c, L] of Object.entries(g)) {
    const t = L.map((r) => r.ttfb).sort((a, b) => a - b);
    console.log(`  ${c.padEnd(9)} : ${String(L.length).padStart(3)} requêtes | TTFB médian ${String(Math.round(t[Math.floor(t.length / 2)])).padStart(4)} ms | somme TTFB ${String(Math.round(t.reduce((a, b) => a + b, 0))).padStart(6)} ms | octets tél. ${Math.round(L.reduce((a, r) => a + r.dl, 0))} ms`);
  }
}
console.log(`
--- LE SILENCE RÉSEAU : temps où AUCUNE requête n'est en vol ---`);
{
  const ev = [];
  for (const r of norm) { ev.push([r.deb, 1]); ev.push([r.end, -1]); }
  ev.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let n = 0, prev = 0, oisif = 0;
  const trous = [];
  for (const [t, d] of ev) {
    if (n === 0 && t > prev) { oisif += t - prev; if (t - prev > 80) trous.push([prev, t]); }
    n += d; prev = t;
  }
  console.log(`  temps mural            : ${Math.round(tmur)} ms`);
  console.log(`  RÉSEAU OISIF (0 en vol): ${Math.round(oisif)} ms  =  ${(100 * oisif / tmur).toFixed(0)} % du temps mural`);
  console.log(`  réseau actif           : ${Math.round(tmur - oisif)} ms`);
  console.log(`  trous > 80 ms (CPU ou dépendance logique, pas du réseau) :`);
  for (const [a, b] of trous) console.log(`     ${String(Math.round(a)).padStart(5)} → ${String(Math.round(b)).padStart(5)} ms   (${Math.round(b - a)} ms)`);
}
console.log(`
--- VAGUES, et ce qui occupe chaque intervalle ---`);
const bornes = [...debutsVague, tmur];
for (let i = 0; i < debutsVague.length; i++) {
  const d = debutsVague[i], f = bornes[i + 1];
  const dedans = norm.filter((r) => r.deb >= d - 1 && r.deb < f);
  const enVolFin = norm.filter((r) => r.deb < d && r.end > d);
  console.log(`\n  vague ${i + 1} @ ${Math.round(d)} ms : ${dedans.length} requêtes` +
    (i > 0 ? `  (silence de ${Math.round(d - Math.max(...norm.filter((r) => r.deb < d).map((r) => r.deb)))} ms depuis le dernier départ)` : ''));
  if (enVolFin.length) console.log(`     ${enVolFin.length} requêtes encore EN VOL à cet instant (la vague n'attendait pas le réseau)`);
  else console.log(`     0 requête en vol : le réseau était OISIF, c'est du CPU ou une dépendance logique`);
  for (const r of dedans.slice(0, 5)) console.log(`       ${String(Math.round(r.deb)).padStart(5)}→${String(Math.round(r.end)).padStart(5)} ms  ${r.url.split('/').pop().slice(0, 52)}`);
  if (dedans.length > 5) console.log(`       … et ${dedans.length - 5} autres`);
}
console.log(`
--- les 8 requêtes qui finissent le plus tard ---`);
for (const r of [...norm].sort((a, b) => b.end - a.end).slice(0, 8)) {
  console.log(`  fin ${String(Math.round(r.end)).padStart(5)} ms | deb ${String(Math.round(r.deb)).padStart(5)} | ttfb ${String(Math.round(r.ttfb)).padStart(4)} | dl ${String(Math.round(r.dl)).padStart(4)} | ${r.url.split('/').pop().slice(0, 46)}`);
}
