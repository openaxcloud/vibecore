import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parse } from 'yaml';

/*
 * SEC-9 — la sonde « l'api refuse l'activation en phase 1 » doit POUVOIR
 * s'exécuter depuis l'identité CI, et rendre un verdict juste.
 *
 * Mesuré le 2026-09-04, runs 1436 et 1454 : Helm avait réussi, le rollout était
 * vérifié, puis cette étape sortait en erreur SANS afficher de code HTTP — et
 * la production était rollbackée sur un déploiement sain. `2>/dev/null`
 * masquait la cause ; rendue visible au run 1456, elle tient en une ligne :
 * « violates PodSecurity "restricted:latest" ». Le namespace refuse tout pod
 * sans securityContext, et `kubectl run` nu n'en pose aucun. (Une première
 * réécriture accusait l'attache websocket de `--rm -i` : déduction, pas mesure.)
 *
 * Trois gardes : la forme de l'étape (pas d'attache, pas de stderr masquée),
 * le securityContext que la politique exige, et le VERDICT du script embarqué,
 * exécuté ici contre un vrai serveur HTTP.
 */

const RACINE = join(new URL('.', import.meta.url).pathname, '..', '..');
const WORKFLOW = parse(readFileSync(join(RACINE, '.github/workflows/deploy-main.yml'), 'utf8'));

function etapeSonde() {
  for (const job of Object.values(WORKFLOW.jobs)) {
    for (const etape of job.steps ?? []) {
      if (typeof etape.name === 'string' && etape.name.startsWith('Runtime probe')) {
        return etape;
      }
    }
  }

  throw new Error('étape « Runtime probe » introuvable dans deploy-main.yml');
}

/** Le script que le pod jetable exécute, tel qu'il est écrit dans l'étape. */
function scriptEmbarque() {
  const run = etapeSonde().run;
  const correspondance = run.match(/--command -- sh -c '([\s\S]*?)'\n/);

  expect(correspondance, 'le script embarqué du pod est introuvable').not.toBeNull();

  return correspondance[1];
}

function verdict(url) {
  /*
   * Environnement MINIMAL : le pod jetable n'a pas de proxy, et un HTTP_PROXY
   * hérité de la session enverrait le curl du test ailleurs qu'au serveur
   * local. Et un lancement ASYNCHRONE : `spawnSync` bloquerait la boucle
   * d'événements du worker, donc le serveur HTTP du test n'accepterait jamais
   * la connexion — mesuré : 15 s d'attente puis « 000 » sur un serveur vivant.
   */
  return new Promise((resolve) => {
    const enfant = spawn('sh', ['-c', scriptEmbarque()], {
      env: { PATH: process.env.PATH, PROBE_URL: url, NO_PROXY: '*', no_proxy: '*' },
    });

    let sortie = '';

    enfant.stdout.on('data', (morceau) => {
      sortie += morceau;
    });
    enfant.on('close', (code) => resolve({ code, sortie: sortie.trim() }));
  });
}

describe('SEC-9 — forme de l’étape', () => {
  it('ne s’attache jamais au pod : ni --rm ni -i, et rien vers /dev/null sur kubectl', () => {
    const run = etapeSonde().run;
    const commandeRun = run.match(/kubectl -n "\$\{HELM_NAMESPACE\}" run [\s\S]*?--command/)?.[0] ?? '';

    expect(commandeRun, 'la commande kubectl run est introuvable').not.toBe('');
    expect(commandeRun).not.toMatch(/--rm/);
    expect(commandeRun).not.toMatch(/\s-i\s/);
    expect(run).not.toMatch(/kubectl[^\n]*2>\/dev\/null/);
  });

  it('crée un pod conforme à PodSecurity « restricted » — ce que le namespace exige et refusait', () => {
    /*
     * Mesuré au run 1456, stderr enfin visible : « violates PodSecurity
     * "restricted:latest" » — quatre exigences nommées par l'apiserver. Sans
     * elles, le pod n'existe jamais et la sonde tombe avant la première
     * requête, quel que soit le reste de l'étape.
     */
    const run = etapeSonde().run;
    const printf = run.match(/OVERRIDES="\$\(printf '(\{.*?\})' "\$\{PROBE\}"\)"/)?.[1];

    expect(printf, 'les overrides de securityContext sont introuvables').toBeDefined();

    const overrides = JSON.parse(printf.replace('%s', 'probe'));
    const pod = overrides.spec.securityContext;
    const conteneur = overrides.spec.containers[0].securityContext;

    expect(pod.runAsNonRoot).toBe(true);
    expect(typeof pod.runAsUser).toBe('number');
    expect(pod.seccompProfile.type).toBe('RuntimeDefault');
    expect(conteneur.allowPrivilegeEscalation).toBe(false);
    expect(conteneur.capabilities.drop).toEqual(['ALL']);
    expect(run).toMatch(/--overrides="\$\{OVERRIDES\}"/);
  });

  it('lit le verdict dans l’état terminé du pod, par un GET, et supprime le pod', () => {
    const run = etapeSonde().run;

    expect(run).toMatch(/state\.terminated/);
    expect(run).toMatch(/kubectl -n "\$\{HELM_NAMESPACE\}" delete pod "\$\{PROBE\}"/);
  });
});

describe('SEC-9 — verdict du script embarqué, contre un vrai serveur', () => {
  let serveur;
  let port;

  beforeAll(async () => {
    serveur = createServer((requete, reponse) => {
      const statut = Number(new URL(requete.url, 'http://x').searchParams.get('statut') ?? 200);

      reponse.writeHead(statut);
      reponse.end();
    });
    await new Promise((resolve) => serveur.listen(0, '127.0.0.1', resolve));
    port = serveur.address().port;
  });

  afterAll(async () => {
    await new Promise((resolve) => serveur.close(resolve));
  });

  it('exit 0 quand l’api REFUSE (401) — le cas attendu', async () => {
    expect(await verdict(`http://127.0.0.1:${port}/access?statut=401`)).toEqual({ code: 0, sortie: 'http 401' });
  });

  it('exit 0 aussi sur 503 — l’interlock fermé répond 503', async () => {
    expect((await verdict(`http://127.0.0.1:${port}/access?statut=503`)).code).toBe(0);
  });

  it('exit 20 quand l’api ACCEPTE (2xx) — le défaut que la sonde existe pour attraper', async () => {
    expect(await verdict(`http://127.0.0.1:${port}/access?statut=201`)).toEqual({ code: 20, sortie: 'http 201' });
  });

  it('exit 30 quand l’api est injoignable — curl rend « 000 », qui n’est PAS un refus', async () => {
    /*
     * Mesuré avant ce cas : « 000 » tombait dans la branche « autre chose que
     * 2xx » et une api injoignable passait pour un refus — la sonde armait
     * l'activation sur du vide (fail-open).
     */
    expect(await verdict('http://127.0.0.1:1/access')).toEqual({ code: 30, sortie: 'http 000' });
  });
});
