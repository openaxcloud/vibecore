#!/usr/bin/env node
/*
 * Banc mobile sur VRAI Safari iOS (simulateur Xcode) — ce que Chromium ne sait
 * pas reproduire : le clavier logiciel qui réduit la fenêtre VISUELLE, et le
 * zoom automatique au focus d'un champ sous 16 px.
 *
 *   node tests/ios-sim/banc.mjs [--parcours zoom,clavier] [--url https://app.e-code.ai]
 *
 * Variables : VC_SESSION (jeton de session QA, requis pour les parcours IDE),
 * VC_PROJET (identifiant de projet), SORTIE (dossier des artefacts).
 *
 * Pré-requis UNIQUE sur le Mac, avec mot de passe administrateur :
 *   safaridriver --enable
 *
 * Le banc travaille sur SON appareil (`vc-banc-ios-390`, iPhone 17e, 390 pt),
 * jamais sur un simulateur partagé avec une autre session.
 */
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { SafariIos } from './webdriver.mjs';

const NOM_APPAREIL = 'vc-banc-ios-390';
const TYPE = 'com.apple.CoreSimulator.SimDeviceType.iPhone-17e';
const RUNTIME = 'com.apple.CoreSimulator.SimRuntime.iOS-26-4';
const PORT = 4723;

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []),
);

const URL_BASE = args.url ?? 'https://app.e-code.ai';
const PARCOURS = (args.parcours ?? 'zoom,clavier').split(',');
const SORTIE = process.env.SORTIE ?? path.resolve('test-results/ios-sim');
fs.mkdirSync(SORTIE, { recursive: true });

const simctl = (...a) => execFileSync('xcrun', ['simctl', ...a], { encoding: 'utf8' }).trim();
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

export function preparerAppareil() {
  const liste = JSON.parse(simctl('list', 'devices', '-j'));

  let udid = Object.values(liste.devices)
    .flat()
    .find((d) => d.name === NOM_APPAREIL)?.udid;

  if (!udid) {
    udid = simctl('create', NOM_APPAREIL, TYPE, RUNTIME);
  }

  const demarrer = () => {
    const etat = Object.values(JSON.parse(simctl('list', 'devices', '-j')).devices)
      .flat()
      .find((d) => d.udid === udid)?.state;

    if (etat !== 'Booted') {
      simctl('boot', udid);
    }

    simctl('bootstatus', udid, '-b');
  };

  /*
   * Clavier matériel coupé pour CET appareil seul : sinon le clavier logiciel
   * n'apparaît jamais et le parcours « clavier » mesurerait une fenêtre intacte.
   */
  execFileSync('defaults', [
    'write',
    'com.apple.iphonesimulator',
    'DevicePreferences',
    '-dict-add',
    udid,
    '<dict><key>ConnectHardwareKeyboard</key><false/></dict>',
  ]);

  /*
   * `simctl spawn` exige un appareil démarré : on démarre, on écrit, on redémarre
   * pour que le démon d'inspection relise ses réglages.
   */
  demarrer();

  // Réglages de l'APPAREIL (pas du Mac) : inspecteur et automatisation à distance.
  for (const domaine of ['com.apple.WebInspector', 'com.apple.mobilesafari']) {
    for (const cle of ['RemoteInspectorEnabled', 'RemoteAutomationEnabled']) {
      simctl('spawn', udid, 'defaults', 'write', domaine, cle, '-bool', 'true');
    }
  }

  simctl('shutdown', udid);
  demarrer();

  return udid;
}

async function demarrerPilote() {
  const pilote = spawn('safaridriver', ['-p', String(PORT)], { stdio: 'ignore' });
  await attendre(1500);

  return pilote;
}

/* ---------------- mesures lues dans la page ---------------- */

const LIRE_FENETRES = `
  const vv = window.visualViewport;
  return { innerHeight: window.innerHeight, vvHeight: vv.height, vvTop: vv.offsetTop, scale: vv.scale };
`;

/* ---------------- parcours ---------------- */

/**
 * ZOOM — Safari zoome sur un champ focalisé dont la police calculée est < 16 px.
 * Contrôle positif d'abord : un témoin à 12 px DOIT faire zoomer. Sans ce zoom,
 * le banc ne voit pas le phénomène et ses « 0 zoom » ne valent rien.
 */
async function parcoursZoom(safari, udid) {
  const resultats = [];

  const cibles = [
    { nom: 'témoin 12 px (contrôle positif)', temoin: true, page: `${URL_BASE}/login` },
    {
      nom: 'connexion : champ e-mail',
      selecteur: 'input[type="email"], input[name="email"]',
      page: `${URL_BASE}/login`,
    },
    ...(process.env.VC_PROJET
      ? [
          {
            nom: 'IDE : zone de saisie de l’agent',
            selecteur: 'textarea',
            page: `${URL_BASE}/projects/${process.env.VC_PROJET}/ide`,
          },
        ]
      : []),
  ];

  for (const cible of cibles) {
    await safari.aller(cible.page);
    await attendre(6000);

    if (cible.temoin) {
      await safari.executer(`
        const i = document.createElement('input');
        i.id = 'temoin-zoom'; i.setAttribute('style', 'position:fixed;top:120px;left:20px;width:200px;font-size:12px !important');
        document.body.appendChild(i);
      `);
    }

    const id = await safari.trouver(cible.temoin ? '#temoin-zoom' : cible.selecteur);

    const police = await safari.executer(`return getComputedStyle(arguments[0]).fontSize`, [
      { 'element-6066-11e4-a52e-4f735466cecf': id },
    ]);

    const avant = await safari.executer(LIRE_FENETRES);
    await safari.toucher(id);
    await attendre(1500);

    const apres = await safari.executer(LIRE_FENETRES);
    const fichier = path.join(SORTIE, `zoom-${resultats.length}.png`);
    simctl('io', udid, 'screenshot', fichier);
    resultats.push({ ...cible, police, avant, apres, zoome: apres.scale > avant.scale + 0.01, capture: fichier });
  }

  const temoin = resultats[0];

  return {
    parcours: 'zoom',
    valide: temoin.zoome,
    verdict: temoin.zoome
      ? resultats.slice(1).map((r) => `${r.nom} : ${r.zoome ? 'ZOOME' : 'ne zoome pas'} (police ${r.police})`)
      : 'BANC AVEUGLE : le témoin à 12 px n’a pas fait zoomer — aucune conclusion possible',
    resultats,
  };
}

/**
 * CLAVIER — la zone de saisie de l'agent doit rester dans la fenêtre VISUELLE
 * une fois le clavier ouvert. Contrôle positif : le clavier doit avoir réduit
 * la fenêtre visuelle d'au moins 150 px, sinon rien n'a été mesuré.
 */
async function parcoursClavier(safari, udid) {
  if (!process.env.VC_SESSION || !process.env.VC_PROJET) {
    return {
      parcours: 'clavier',
      valide: false,
      verdict: 'NON JOUÉ : VC_SESSION et VC_PROJET requis (IDE derrière connexion)',
    };
  }

  await safari.aller(URL_BASE);
  await safari.ajouterCookie({
    name: 'vc_session',
    value: process.env.VC_SESSION,
    domain: '.e-code.ai',
    path: '/',
    secure: true,
    httpOnly: true,
  });
  await safari.aller(`${URL_BASE}/projects/${process.env.VC_PROJET}/ide`);
  await attendre(15000);

  const id = await safari.trouver('textarea');
  const avant = await safari.executer(LIRE_FENETRES);
  await safari.toucher(id);
  await attendre(2000);

  const apres = await safari.executer(LIRE_FENETRES);

  const champ = await safari.executer(
    `const r = arguments[0].getBoundingClientRect(); return { haut: r.top, bas: r.bottom };`,
    [{ 'element-6066-11e4-a52e-4f735466cecf': id }],
  );

  const fichier = path.join(SORTIE, 'clavier.png');
  simctl('io', udid, 'screenshot', fichier);

  const clavierOuvert = avant.vvHeight - apres.vvHeight >= 150;
  const basVisible = apres.vvTop + apres.vvHeight;

  return {
    parcours: 'clavier',
    valide: clavierOuvert,
    verdict: !clavierOuvert
      ? 'CLAVIER NON OUVERT : fenêtre visuelle inchangée — aucune conclusion possible'
      : champ.bas <= basVisible
        ? `zone de saisie visible (bas ${Math.round(champ.bas)} ≤ ${Math.round(basVisible)})`
        : `ZONE DE SAISIE SOUS LE CLAVIER (bas ${Math.round(champ.bas)} > ${Math.round(basVisible)})`,
    avant,
    apres,
    champ,
    capture: fichier,
  };
}

/* ---------------- lanceur ---------------- */

if (import.meta.url === `file://${process.argv[1]}`) {
  const udid = preparerAppareil();
  const pilote = await demarrerPilote();

  let safari;

  const rapport = { appareil: `${NOM_APPAREIL} (${udid})`, url: URL_BASE, parcours: [] };

  try {
    safari = await SafariIos.ouvrir({ base: `http://localhost:${PORT}`, udid });

    for (const p of PARCOURS) {
      rapport.parcours.push(p === 'zoom' ? await parcoursZoom(safari, udid) : await parcoursClavier(safari, udid));
    }
  } catch (error) {
    rapport.erreur = String(error.message ?? error);
  } finally {
    await safari?.fermer().catch(() => {});
    pilote.kill();
  }

  fs.writeFileSync(path.join(SORTIE, 'rapport.json'), JSON.stringify(rapport, null, 2));
  console.log(JSON.stringify(rapport, null, 2));
  process.exitCode = rapport.erreur || rapport.parcours.some((p) => !p.valide) ? 1 : 0;
}
