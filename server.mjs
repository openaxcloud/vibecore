/*
 * SERVEUR DE PRODUCTION — miroir fidèle de `@react-router/serve`, plus une chose.
 *
 * POURQUOI REMPLACER UN SERVEUR POUR UN EN-TÊTE.
 *
 * `GET https://e-code.ai/api/health` répond 200, en JSON, **pose un cookie de
 * session** (`vc_upstream=…; Max-Age=3600`) et n'a **aucun `cache-control`**.
 * C'est le défaut exact que #484 vient de fermer sur les documents — mais les
 * routes `/api/*` sont des routes de RESSOURCE : elles ne passent pas par
 * `entry.server.tsx`, qui n'exporte que `handleRequest`.
 *
 * Il n'existe aucun point de passage commun côté routes : sur 174 fichiers
 * `api.*.ts`, 114 utilisent `json(`, 20 `Response.json`, 16 un autre chemin.
 * Corriger route par route, c'est 174 endroits où se tromper et zéro couverture
 * pour la 175e. Le serveur est le seul endroit qui les couvre toutes, y compris
 * celles qui n'existent pas encore.
 *
 * LE DANGER DE CE REMPLACEMENT, et pourquoi ce fichier est si littéral.
 *
 * C'est `@react-router/serve` qui pose le `immutable` des assets. Un
 * remplacement qui l'oublie DÉMARRE PARFAITEMENT et transforme chaque visite en
 * première visite : rien ne casse, rien n'alerte, et le site devient lent pour
 * tout le monde. Les quatre couches statiques ci-dessous sont donc recopiées
 * une à une depuis `node_modules/@react-router/serve/dist/cli.js` (v7.18.0),
 * dans le même ordre et avec les mêmes options — y compris la deuxième, qui n'a
 * volontairement AUCUN `maxAge`, et la troisième à `1h`.
 *
 * La preuve n'est pas dans ce commentaire : `scripts/parite-serveur-assets.mjs`
 * lance les DEUX serveurs sur la MÊME construction et compare les en-têtes de
 * chaque asset. Un seul écart bloque.
 */
import path from 'node:path';
import { createRequestHandler } from '@react-router/express';
import compression from 'compression';
import express from 'express';
import morgan from 'morgan';

const BUILD_PATH = process.env.BUILD_PATH ?? './build/server/index.js';
const build = await import(path.resolve(BUILD_PATH));

const port = Number(process.env.PORT ?? 3000);

const app = express();
app.disable('x-powered-by');

app.use(compression());

/*
 * Couche 1 — les assets empreintés. `immutable` + 1 an : c'est CE réglage qui
 * fait qu'un visiteur qui revient ne retélécharge rien.
 */
app.use(
  path.posix.join(build.publicPath, 'assets'),
  express.static(path.join(build.assetsBuildDirectory, 'assets'), {
    immutable: true,
    maxAge: '1y',
  }),
);

/* Couche 2 — le reste du répertoire de build. Sans `maxAge`, comme l'original. */
app.use(build.publicPath, express.static(build.assetsBuildDirectory));

/* Couche 3 — `public/`, une heure. */
app.use(express.static('public', { maxAge: '1h' }));

app.use(morgan('tiny'));

/*
 * `no-store` sur `/api/*`, posé au moment de l'écriture des en-têtes.
 *
 * Pas avant le gestionnaire : l'adaptateur React Router écrit les en-têtes de la
 * `Response` par-dessus, et un `setHeader` posé trop tôt serait effacé sans
 * bruit. On intercepte donc `writeHead`, dernier point avant le réseau.
 *
 * Placé APRÈS les couches statiques : une requête d'asset n'arrive jamais ici,
 * et le préfixe `/api/` ne peut de toute façon pas les atteindre. Les deux
 * protections sont volontairement redondantes — c'est le `immutable` qu'on
 * protège, et il ne se voit pas quand on le perd.
 */
app.use((request, response, next) => {
  if (request.path === '/api' || request.path.startsWith('/api/')) {
    const writeHeadOriginal = response.writeHead.bind(response);

    response.writeHead = (...args) => {
      response.setHeader('Cache-Control', 'no-store');
      return writeHeadOriginal(...args);
    };
  }

  next();
});

app.all(
  '*',
  createRequestHandler({
    build,
    mode: process.env.NODE_ENV,
  }),
);

const server = app.listen(port, () => {
  console.log(`[vibecore-serve] http://localhost:${port}`);
});

/*
 * ARRÊT PROPRE : ATTENDRE LES TOURS, PAS SEULEMENT LES CONNEXIONS.
 *
 * Mesuré en production le 2026-09-30 à 18:19 : un tour de génération démarré sur
 * un pod que le déploiement remplaçait est mort à 18:20:28, sans aucune fin côté
 * serveur. `server.close()` n'attend que les CONNEXIONS : un utilisateur qui a
 * quitté la page a fermé la sienne alors que son tour continue — et doit aller
 * au bout pour que sa réponse soit écrite (#609) et rattrapée (#622).
 *
 * On refuse donc les nouvelles connexions, on ferme celles qui sont inactives,
 * puis on attend que le registre des tours soit vide (app/lib/.server/
 * tours-en-cours.ts), avec une borne. La borne doit rester SOUS la période de
 * grâce de Kubernetes (portée à ~10 min par la chaîne de livraison), sinon le
 * pod est tué avant d'avoir pu le dire.
 */
const ATTENTE_MAX_MS = Number(process.env.ARRET_ATTENTE_MAX_MS ?? 540_000);

let arretEnCours = false;

async function arreter(signal) {
  if (arretEnCours) {
    return;
  }

  arretEnCours = true;
  console.log(JSON.stringify({ event: 'arret.signal', signal, attenteMaxMs: ATTENTE_MAX_MS }));
  server?.close((erreur) => erreur && console.error(erreur));
  server?.closeIdleConnections?.();

  const attendreLesTours = globalThis[Symbol.for('vibecore.attendreLesTours')];

  if (typeof attendreLesTours === 'function') {
    const { restants, attenteMs } = await attendreLesTours({ maxMs: ATTENTE_MAX_MS });
    console.log(JSON.stringify({ event: 'arret.fin', restants, attenteMs }));
  } else {
    // Le module des tours n'a jamais été chargé : aucun tour de chat n'a pu démarrer ici.
    console.log(JSON.stringify({ event: 'arret.fin', restants: 0, attenteMs: 0, registre: 'jamais-charge' }));
  }

  process.exit(0);
}

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.once(signal, () => void arreter(signal));
}
