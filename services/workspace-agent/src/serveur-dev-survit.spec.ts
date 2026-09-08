import { mkdtempSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { signAgentToken } from '@vibecore/workspace-sdk';
import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { buildWorkspaceAgentApp } from './app.js';

/*
 * LA PREUVE D'ACCEPTATION, DANS LES TERMES OU AVI LA RECONNAITRA.
 *
 *   « Il lance une generation, verrouille son iPhone, revient cinq minutes
 *     plus tard, et sa boutique s'affiche. »
 *
 * Ce n'est PAS « la socket se reattache » ni « le processus survit » — ce sont
 * des moyens. Le test frappe le serveur en HTTP apres l'aller-retour et exige
 * son contenu. Si l'application ne repond pas, le test est rouge, quelle que
 * soit la sante des sockets.
 *
 * CE QU'ON REPRODUIT. Le serveur de dev est lance par `/commands/stream`, dont
 * la socket est portee par le NAVIGATEUR. `socket.onClose` tue aujourd'hui tout
 * le groupe de processus, sans delai de grace et sans reattache. Safari iOS
 * suspend les onglets en arriere-plan et coupe les WebSockets en quelques
 * secondes : le serveur d'Avi meurt donc a chaque fois qu'il quitte la page.
 *
 * LA CONTRE-EPREUVE DE L'AUTRE BORD est dans ce fichier, et elle est aussi
 * obligatoire : passe la fenetre de grace sans retour, le serveur DOIT
 * s'arreter. Sinon on echange un defaut visible contre une fuite invisible —
 * le genre de chose qu'on decouvre sur une facture.
 *
 * La fenetre reelle vaut 10 min (voir `DEV_SERVER_GRACE_MS`), strictement sous
 * les 30 min d'inactivite du workspace lui-meme, donc elle ne prolonge aucun
 * pod. Les tests l'abaissent pour rester rapides.
 */

const MARQUEUR = 'la-boutique-est-la';

const secret = 'dev-workspace-agent-secret';
const workspaceId = 'ws-test-verrouillage';

let fermer: Array<() => Promise<void> | void> = [];

afterEach(async () => {
  for (const f of fermer.reverse()) {
    await f();
  }

  fermer = [];
});

/** Un « serveur de dev » minimal : il ecoute et sert un marqueur, comme vite sert l'app. */
const programmeServeur = (port: number) =>
  `console.log('PID:'+process.pid);require('http').createServer((_q,s)=>{s.writeHead(200,{'content-type':'text/html'});s.end('${MARQUEUR}')}).listen(${port},'127.0.0.1');setInterval(()=>{},1000)`;

/*
 * Un port LIBRE, alloue a chaque test. Un numero fixe rendait la suite
 * dependante de ses propres restes : un serveur survivant d'un test precedent
 * repondait a la place du nouveau, et le test passait en mesurant le mauvais
 * processus. Une mesure qui repond a cote est pire qu'une mesure absente.
 */
async function portLibre(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.on('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const a = s.address();

      if (!a || typeof a === 'string') {
        reject(new Error('pas de port'));

        return;
      }

      const p = a.port;
      s.close(() => resolve(p));
    });
  });
}

async function laBoutiqueRepond(port: number): Promise<boolean> {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(1_000) });

    return r.ok && (await r.text()) === MARQUEUR;
  } catch {
    return false;
  }
}

async function agentEnEcoute(graceMs: number) {
  const root = mkdtempSync(join(tmpdir(), 'ws-verrou-'));

  const app = buildWorkspaceAgentApp({
    workspaceRoot: root,
    tokenSecret: secret,
    workspaceId,
    devServerGraceMs: graceMs,
  } as never);
  await app.listen({ host: '127.0.0.1', port: 0 });
  fermer.push(() => app.close());

  const adresse = app.server.address();

  if (!adresse || typeof adresse === 'string') {
    throw new Error("l'agent n'a pas ouvert de port TCP");
  }

  return { app, port: adresse.port, token: signAgentToken({ workspaceId, expiresAt: Date.now() + 60_000, secret }) };
}

/** Ouvre le flux de commande, lance le serveur, et rend une fonction pour « verrouiller le telephone ». */
async function lancerLeServeurDeDev(port: number, token: string, portBoutique: number) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/commands/stream?token=${encodeURIComponent(token)}`);
  await new Promise<void>((resolve, reject) => {
    socket.addEventListener('open', () => resolve(), { once: true });
    socket.addEventListener('error', () => reject(new Error('flux de commande non ouvert')), { once: true });
  });

  let pid: number | undefined;
  socket.addEventListener('message', (event) => {
    const trame = JSON.parse(String(event.data)) as { type?: string; data?: string };
    const m = trame.type === 'stdout' ? /PID:(\d+)/.exec(trame.data ?? '') : null;

    if (m) {
      pid = Number(m[1]);
    }
  });
  socket.send(
    JSON.stringify({
      type: 'hello',
      payload: { command: process.execPath, args: ['-e', programmeServeur(portBoutique)] },
    }),
  );

  await expect.poll(() => laBoutiqueRepond(portBoutique), { timeout: 10_000, interval: 100 }).toBe(true);

  // Nettoyage certain : quoi qu'il arrive au test, ce processus ne survit pas a la suite.
  fermer.push(() => {
    if (pid === undefined) {
      return;
    }

    try {
      process.kill(-pid, 'SIGKILL');
    } catch {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {
        // deja mort — c'est le cas attendu du second test
      }
    }
  });

  return () => socket.close();
}

describe('le serveur de dev survit au verrouillage du telephone', () => {
  it("l'utilisateur revient et REGARDE : le serveur ne doit pas etre moissonne sous ses yeux", async () => {
    /*
     * LE PIEGE DU DECOUPLAGE, ET IL EST REEL.
     *
     * L'adoption des orphelins etait accrochee a « un nouveau flux de commande
     * s'ouvre ». Or un utilisateur qui revient sur un serveur DEJA VIVANT n'en
     * ouvre aucun — precisement parce que le client detecte correctement qu'il
     * tourne et court-circuite le relancement.
     *
     * Consequence : plus la detection est juste, plus surement le serveur est
     * moissonne SOUS LES YEUX de son utilisateur. Les deux correctifs se
     * contredisaient.
     *
     * Ce que fait vraiment un client qui revient, c'est interroger `/ports`, en
     * boucle. C'est ce signal qui prouve qu'on regarde, et c'est donc lui qui
     * doit annuler la moisson. Il a la bonne propriete : c'est du HTTP, il ne
     * passe PAS par la WebSocket qu'on vient de decoupler — la sonde de
     * vivacite ne depend pas de ce qu'elle mesure.
     */
    const portBoutique = await portLibre();
    const { app, port, token } = await agentEnEcoute(1_500);
    const verrouillerLeTelephone = await lancerLeServeurDeDev(port, token, portBoutique);

    verrouillerLeTelephone();

    const regarder = setInterval(() => {
      void app.inject({ method: 'GET', url: '/ports', headers: { authorization: `Bearer ${token}` } });
    }, 300);
    fermer.push(() => clearInterval(regarder));

    await new Promise((r) => setTimeout(r, 4_500)); // trois fois la fenetre de grace

    await expect(laBoutiqueRepond(portBoutique)).resolves.toBe(true);
  }, 30_000);

  it("Avi verrouille son iPhone, revient — SA BOUTIQUE S'AFFICHE", async () => {
    const portBoutique = await portLibre();
    const { port, token } = await agentEnEcoute(60_000);
    const verrouillerLeTelephone = await lancerLeServeurDeDev(port, token, portBoutique);

    // L'ecran se verrouille : Safari iOS suspend l'onglet, la WebSocket tombe.
    verrouillerLeTelephone();

    // Il revient. Bien au-dela du SIGTERM immediat + SIGKILL a 5 s d'aujourd'hui.
    await new Promise((r) => setTimeout(r, 6_000));

    // LA SEULE ASSERTION QUI COMPTE : l'application repond.
    await expect(laBoutiqueRepond(portBoutique)).resolves.toBe(true);
  }, 30_000);

  it("il regarde, puis s'en va pour de bon : le serveur finit par s'arreter quand meme", async () => {
    /*
     * LA FENETRE GLISSANTE NE DOIT PAS DEVENIR UN SURSIS PERPETUEL.
     *
     * `/ports` re-arme la moisson ; si un seul coup d'oeil la repoussait pour
     * toujours, on aurait rétabli la fuite qu'on venait de fermer. La fenetre
     * doit signifier « dix minutes sans que PERSONNE ne regarde », donc repartir
     * du DERNIER regard — et expirer quand ils cessent.
     */
    const portBoutique = await portLibre();
    const { app, port, token } = await agentEnEcoute(1_500);
    const verrouillerLeTelephone = await lancerLeServeurDeDev(port, token, portBoutique);

    verrouillerLeTelephone();

    // Il regarde un moment...
    for (let i = 0; i < 5; i += 1) {
      await app.inject({ method: 'GET', url: '/ports', headers: { authorization: `Bearer ${token}` } });
      await new Promise((r) => setTimeout(r, 300));
    }

    await expect(laBoutiqueRepond(portBoutique)).resolves.toBe(true);

    // ...puis il s'en va. Plus aucun regard : la fenetre doit expirer.
    await expect
      .poll(async () => !(await laBoutiqueRepond(portBoutique)), { timeout: 15_000, interval: 250 })
      .toBe(true);
  }, 30_000);

  it("mais passe la fenetre de grace sans retour, il s'arrete — pas de fuite", async () => {
    const portBoutique = await portLibre();
    const { port, token } = await agentEnEcoute(1_500);
    const verrouillerLeTelephone = await lancerLeServeurDeDev(port, token, portBoutique);

    verrouillerLeTelephone();

    // Personne ne revient. Le serveur doit finir par s'eteindre.
    await expect
      .poll(async () => !(await laBoutiqueRepond(portBoutique)), { timeout: 15_000, interval: 250 })
      .toBe(true);
  }, 30_000);
});
