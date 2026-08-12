#!/usr/bin/env node
/*
 * Preuve du routage du screenshotter avec un VRAI Chromium.
 *
 * CE QUE CE SCRIPT ÉTABLIT, et pourquoi il existe.
 *
 * Le renderer de vignettes ne peut pas joindre l'URL publique d'un preview
 * depuis l'intérieur du cluster (hairpin vers le LB externe), il réécrit donc
 * l'URL vers le Service in-cluster du preview-proxy. La version précédente
 * croyait conserver l'hôte de preview via `headers: { host }` pour que le proxy
 * route par hôte. C'est impossible : `Host` est un en-tête interdit à la
 * modification, recalculé par le navigateur quand l'URL change.
 *
 * Une preuve par `curl`/`http.request` posant `Host` à la main ne vaut RIEN ici :
 * elle valide une forme de requête qu'un navigateur ne produira jamais. D'où ce
 * script — un vrai Chromium, un vrai serveur amont qui ENREGISTRE ce qu'il
 * reçoit, et une vraie capture PNG.
 *
 * Il vérifie trois choses :
 *   1. l'autorité de routage (workspace + port) arrive bien à l'amont ;
 *   2. le jeton tenant arrive sur son en-tête interne ;
 *   3. la capture produit un PNG réel et non vide.
 *
 * Usage :  npx tsx scripts/proofs/screenshotter-routing-chromium.mjs [--out <png>] [--legacy]
 *
 * `--legacy` rejoue la réécriture d'AVANT le correctif (celle qui surchargeait
 * `Host`) : le script doit alors ÉCHOUER, ce qui démontre le défaut plutôt que de
 * l'affirmer. Sans le drapeau, il doit passer. La paire rouge/vert est donc dans
 * un seul artefact, sur le même navigateur réel.
 */
import { createServer } from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { chromium } from '@playwright/test';

import { previewProxyPathUrl } from '../../services/screenshotter/src/preview-proxy-path.ts';

const PREVIEW_DOMAIN = 'preview.e-code.ai';
const WORKSPACE = 'ws-test';
const PORT = '5173';
const PREVIEW_HOST = `${WORKSPACE}-${PORT}.${PREVIEW_DOMAIN}`;
const TENANT_TOKEN = 'jeton-tenant-de-test';
/*
 * Vignette d'une PUBLICATION. L'API planifie aussi ces captures, et leur URL n'a
 * pas de `-<port>` : le routage par chemin doit donc les couvrir aussi, sinon la
 * requête part avec un Host que le proxy ne route pas (la réserve du contre-audit).
 */
const DEPLOY_ID = 'clx9k2m4p';
const DEPLOY_HOST = `d-${DEPLOY_ID}.${PREVIEW_DOMAIN}`;
const INTERNAL_SECRET = 'secret-proxy-de-test';

const outIndex = process.argv.indexOf('--out');
const outPng = outIndex > -1 ? process.argv[outIndex + 1] : null;
/** Rejoue la réécriture fautive (surcharge de `Host`) pour prouver le défaut. */
const legacy = process.argv.includes('--legacy');

/** Requêtes réellement reçues par l'amont. */
const received = [];

/*
 * Tient le rôle du preview-proxy : il enregistre host + url, et ne sert le
 * document QUE si la requête porte l'autorité de routage attendue — comme le vrai
 * proxy, qui 404 quand il ne sait pas router.
 */
const server = createServer((req, res) => {
  received.push({
    host: req.headers.host,
    url: req.url,
    tenant: req.headers['x-vibecore-preview-tenant'],
    internal: req.headers['x-vibecore-preview-internal'],
  });

  const routable =
    req.url?.startsWith(`/p/${WORKSPACE}/${PORT}`) === true || req.url?.startsWith(`/d/${DEPLOY_ID}`) === true;

  if (!routable) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('routage impossible: ni hote ni chemin ne portent la cible');

    return;
  }

  // Le chemin d'une publication n'est ouvert qu'aux appelants internes.
  if (req.url?.startsWith(`/d/`) && req.headers['x-vibecore-preview-internal'] !== INTERNAL_SECRET) {
    res.writeHead(403, { 'content-type': 'text/plain' });
    res.end('chemin de publication reserve aux appelants internes');

    return;
  }

  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(
    `<!doctype html><html><head><meta charset="utf-8"><title>preuve</title>` +
      `<style>body{margin:0;background:#0b1020;color:#e8ecff;font:16px system-ui;` +
      `display:grid;place-items:center;height:100vh}</style></head>` +
      `<body><div><h1>PREUVE ROUTAGE</h1><p>${WORKSPACE}:${PORT}</p></div></body></html>`,
  );
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const proxy = new URL(`http://127.0.0.1:${server.address().port}`);

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1000, height: 600 }, ignoreHTTPSErrors: true });

// Exactement la logique de services/screenshotter/src/browser.ts.
await context.route('**/*', async (route) => {
  const requestUrl = new URL(route.request().url());

  if (!requestUrl.hostname.toLowerCase().endsWith(`.${PREVIEW_DOMAIN}`)) {
    await route.continue();

    return;
  }

  if (legacy) {
    /*
     * Version d'AVANT : on réécrit l'URL vers le proxy en croyant conserver le
     * `Host` de preview. Le navigateur le recalcule, donc l'autorité de routage
     * est perdue — c'est exactement le défaut que ce mode démontre.
     */
    await route.continue({
      url: `${proxy.protocol}//${proxy.host}${requestUrl.pathname}${requestUrl.search}`,
      headers: {
        ...route.request().headers(),
        host: requestUrl.host,
        'x-vibecore-preview-tenant': TENANT_TOKEN,
      },
    });

    return;
  }

  const target = previewProxyPathUrl(proxy, requestUrl, [PREVIEW_DOMAIN]);

  if (!target) {
    await route.continue();

    return;
  }

  await route.continue({
    url: target,
    headers: {
      ...route.request().headers(),
      'x-vibecore-preview-tenant': TENANT_TOKEN,
      'x-vibecore-preview-internal': INTERNAL_SECRET,
    },
  });
});

const page = await context.newPage();
let navError = null;
let status = null;

try {
  const response = await page.goto(`http://${PREVIEW_HOST}/`, { waitUntil: 'load', timeout: 20_000 });
  status = response?.status() ?? null;
} catch (error) {
  navError = error instanceof Error ? error.message.split('\n')[0] : String(error);
}

let png = Buffer.alloc(0);

try {
  png = await page.screenshot({ type: 'png' });
} catch (error) {
  navError = navError ?? (error instanceof Error ? error.message.split('\n')[0] : String(error));
}

/*
 * Deuxième trajet, dans le MÊME navigateur : la vignette d'une publication. En
 * mode legacy elle échoue pour la même raison que la première (Host recalculé) ;
 * avec le correctif elle doit passer par `/d/<id>`.
 */
const deployFrom = received.length;
let deployStatus = null;

try {
  const response = await page.goto(`http://${DEPLOY_HOST}/`, { waitUntil: 'load', timeout: 20_000 });
  deployStatus = response?.status() ?? null;
} catch (error) {
  deployStatus = error instanceof Error ? error.message.split('\n')[0] : String(error);
}

const deployFirst = received[deployFrom];

await browser.close();
await new Promise((resolve) => server.close(resolve));

// ---------------------------------------------------------------------------
const first = received[0];
let failures = 0;
const check = (label, ok, detail) => {
  console.log(`  ${ok ? 'OK  ' : 'ECHEC'} ${label}${detail ? ` — ${detail}` : ''}`);

  if (!ok) {
    failures += 1;
  }
};

console.log(`=== ce que l amont a REELLEMENT recu (vrai Chromium${legacy ? ', mode LEGACY' : ''}) ===`);

if (!first) {
  console.log('  (aucune requete)');
  process.exit(1);
}

for (const r of received.slice(0, 3)) {
  console.log(`  Host: ${r.host}   url: ${r.url}   tenant: ${r.tenant ? 'present' : 'absent'}`);
}

console.log('\n=== verifications ===');
// Le Host EST bien celui du proxy : c'est le comportement attendu du navigateur,
// et la raison pour laquelle le routage ne peut pas s'appuyer dessus.
check(
  'Host recu = celui du proxy (le navigateur le recalcule, donc inutilisable pour router)',
  first.host === proxy.host,
  `Host=${first.host}`,
);
check(
  'autorite de routage presente dans le CHEMIN',
  first.url?.startsWith(`/p/${WORKSPACE}/${PORT}`) === true,
  `url=${first.url}`,
);
check('jeton tenant recu sur l en-tete interne', first.tenant === TENANT_TOKEN);
check('le document est servi (200, donc le proxy a pu router)', status === 200, `status=${status}`);
check('capture PNG reelle et non vide', png.length > 1000 && png.subarray(1, 4).toString() === 'PNG', `${png.length} octets`);

// --- vignette d'une PUBLICATION (reserve du contre-audit) -------------------
console.log('\n=== vignette d une publication d-<id> ===');

if (!deployFirst) {
  check('la requete de publication est arrivee', false, 'aucune requete');
} else {
  console.log(`  Host: ${deployFirst.host}   url: ${deployFirst.url}   interne: ${deployFirst.internal ? 'present' : 'absent'}`);
  check(
    'la publication est routee par le CHEMIN /d/<id>',
    deployFirst.url?.startsWith(`/d/${DEPLOY_ID}`) === true,
    `url=${deployFirst.url}`,
  );
  check("en-tete d appel interne present (le chemin n'est pas public)", deployFirst.internal === INTERNAL_SECRET);
  check('la publication est servie (200)', deployStatus === 200, `status=${deployStatus}`);
}

if (navError) {
  console.log(`  note: ${navError}`);
}

if (outPng && png.length > 0) {
  mkdirSync(dirname(outPng), { recursive: true });
  writeFileSync(outPng, png);
  console.log(`\ncapture ecrite: ${outPng} (${png.length} octets)`);
}

console.log(failures === 0 ? '\nROUTAGE PROUVE' : `\n${failures} verification(s) en echec`);
process.exit(failures === 0 ? 0 : 1);
