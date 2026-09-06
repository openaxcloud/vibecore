/*
 * PARITÉ D'EN-TÊTES ENTRE `@react-router/serve` ET `server.mjs`.
 *
 * Le mode de défaillance qui commande cette vérification : c'est
 * `@react-router/serve` qui pose le `immutable` des assets. Un remplacement qui
 * l'oublie DÉMARRE PARFAITEMENT — aucune erreur, aucun test rouge — et
 * transforme chaque visite en première visite. La perte est silencieuse et
 * généralisée.
 *
 * On ne compare donc pas une intention, on compare les DEUX serveurs lancés sur
 * la MÊME construction, asset par asset, en-tête par en-tête. Un seul écart
 * bloque la livraison.
 *
 * Lancer : node scripts/parite-serveur-assets.mjs
 * Prérequis : `npx react-router build` (ce script ne construit pas, exprès —
 * comparer deux serveurs sur deux constructions différentes ne prouverait rien).
 */
import { spawn } from 'node:child_process';
import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const RACINE_ASSETS = 'build/client/assets';

/* Les en-têtes qui décident du cache. `date` et `etag` varient par nature. */
const EN_TETES_COMPARES = ['cache-control', 'content-type', 'content-length', 'vary', 'accept-ranges'];

if (!existsSync(RACINE_ASSETS)) {
  console.error(`ABSENT: ${RACINE_ASSETS} — lancer d'abord \`npx react-router build\``);
  process.exit(1);
}

const assets = readdirSync(RACINE_ASSETS).filter((n) => /\.(js|css|map|woff2?|svg|png)$/.test(n));

if (assets.length === 0) {
  console.error('AUCUN asset trouvé — la mesure ne mesurerait rien');
  process.exit(1);
}

console.log(`assets à comparer : ${assets.length}`);

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

async function demarrer(commande, args, port) {
  const proc = spawn(commande, args, {
    env: { ...process.env, PORT: String(port), NODE_ENV: 'production' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  for (let i = 0; i < 60; i += 1) {
    await attendre(500);

    try {
      await fetch(`http://127.0.0.1:${port}/assets/${assets[0]}`);
      return proc;
    } catch {
      /* pas encore prêt */
    }
  }

  proc.kill('SIGKILL');
  throw new Error(`le serveur sur ${port} n'a jamais répondu`);
}

async function releverLesEnTetes(port) {
  const releve = {};

  for (const nom of assets) {
    const r = await fetch(`http://127.0.0.1:${port}/assets/${nom}`);
    releve[nom] = { statut: r.status };

    for (const h of EN_TETES_COMPARES) {
      releve[nom][h] = r.headers.get(h);
    }
  }

  /* Une route API, pour la moitié « après » de la vérification. */
  const api = await fetch(`http://127.0.0.1:${port}/api/health`);
  releve['@api/health'] = { statut: api.status, 'cache-control': api.headers.get('cache-control') };

  return releve;
}

const serveurs = [
  [
    'AVANT (@react-router/serve)',
    'node',
    ['./node_modules/@react-router/serve/dist/cli.js', './build/server/index.js'],
    3311,
  ],
  ['APRÈS (server.mjs)', 'node', ['./.parite/server.mjs'], 3312],
];

const releves = {};

for (const [nom, cmd, args, port] of serveurs) {
  const proc = await demarrer(cmd, args, port);

  try {
    releves[nom] = await releverLesEnTetes(port);
    console.log(`${nom} : relevé de ${Object.keys(releves[nom]).length} entrées`);
  } finally {
    proc.kill('SIGTERM');
    await attendre(400);
    proc.kill('SIGKILL');
  }
}

const [avant, apres] = Object.values(releves);

/* --- 1. les assets doivent être IDENTIQUES, en-tête par en-tête --------- */
const ecarts = [];

for (const nom of assets) {
  for (const h of ['statut', ...EN_TETES_COMPARES]) {
    if (String(avant[nom][h]) !== String(apres[nom][h])) {
      ecarts.push(`${nom} · ${h} : « ${avant[nom][h]} » -> « ${apres[nom][h]} »`);
    }
  }
}

/* --- 2. le immutable doit être là, pas seulement identique -------------- */
const sansImmutable = assets.filter((n) => !String(apres[n]['cache-control']).includes('immutable'));

/* --- 3. et /api/* doit avoir CHANGÉ, sinon le correctif ne fait rien ---- */
const apiAvant = avant['@api/health']['cache-control'];
const apiApres = apres['@api/health']['cache-control'];

console.log('');
console.log(`assets comparés          : ${assets.length}`);
console.log(`écarts d'en-tête         : ${ecarts.length}`);
console.log(`assets sans « immutable »: ${sansImmutable.length}`);
console.log(`/api/health avant        : ${apiAvant ?? '(aucun)'}`);
console.log(`/api/health après        : ${apiApres ?? '(aucun)'}`);

for (const e of ecarts.slice(0, 20)) {
  console.log(`  ÉCART ${e}`);
}

let echec = false;

if (ecarts.length > 0) {
  console.log('ÉCHEC: les en-têtes des assets ne sont pas identiques');
  echec = true;
}

if (sansImmutable.length > 0) {
  console.log(`ÉCHEC: ${sansImmutable.length} asset(s) sans « immutable » — le mode de défaillance visé`);
  echec = true;
}

if (apiApres !== 'no-store') {
  console.log('ÉCHEC: /api/health ne rend pas « no-store » — le correctif ne fait rien');
  echec = true;
}

console.log(echec ? 'VERDICT: BLOQUÉ' : 'VERDICT: PARITÉ COMPLÈTE + /api/* corrigé');
process.exit(echec ? 1 : 0);
