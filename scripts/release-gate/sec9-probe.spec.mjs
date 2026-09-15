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

/** Le manifeste du pod jetable, tel qu'il est écrit dans l'étape, marqueurs remplacés. */
function manifeste() {
  const run = etapeSonde().run;
  const bloc = run.match(/<<'MANIFEST'[^\n]*\n([\s\S]*?)\n\s*MANIFEST\n/)?.[1];

  expect(bloc, 'le manifeste du pod est introuvable').toBeDefined();

  /*
   * Le bloc `run: |` est déjà désindenté par l'analyse YAML du workflow :
   * le manifeste commence en colonne 0, il ne reste que les marqueurs.
   */
  const texte = bloc.replace(/__PROBE__/g, 'sec9-probe-test').replace(/__PROBE_URL__/g, 'http://api.test/access');

  return parse(texte);
}

/** Le script que le pod jetable exécute. */
function scriptEmbarque() {
  const conteneur = manifeste().spec.containers[0];

  expect(conteneur.command).toEqual(['sh', '-c']);

  return conteneur.args[0];
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
  it('ne s’attache jamais au pod et ne masque rien : création par manifeste, pas de --rm -i, rien vers /dev/null sur kubectl', () => {
    const run = etapeSonde().run;

    expect(run).toMatch(/kubectl -n "\$\{HELM_NAMESPACE\}" create -f -/);
    expect(run).not.toMatch(/kubectl[^\n]*\s--rm\b/);
    expect(run).not.toMatch(/kubectl[^\n]*\s-i\s/);
    expect(run).not.toMatch(/kubectl[^\n]*--overrides/);
    expect(run).not.toMatch(/kubectl[^\n]*2>\/dev\/null/);
  });

  it('décrit un pod COMPLET — image, commande, URL — et conforme à PodSecurity « restricted »', () => {
    /*
     * Deux mesures successives derrière ce test. Run 1456 : « violates
     * PodSecurity "restricted:latest" », quatre exigences nommées par
     * l'apiserver. Run 1457, corrigé par `--overrides` : « spec.containers[0]
     * .image: Required value » — un merge patch REMPLACE la liste des
     * conteneurs, l'image et la commande avaient disparu. D'où un manifeste
     * entier, et un test qui vérifie les deux faces : ce que le pod EST et ce
     * que la politique EXIGE.
     */
    const pod = manifeste();
    const conteneur = pod.spec.containers[0];

    expect(pod.kind).toBe('Pod');
    expect(pod.metadata.name).toBe('sec9-probe-test');
    expect(conteneur.image).toMatch(/^curlimages\/curl:\d/);
    expect(conteneur.command).toEqual(['sh', '-c']);
    expect(conteneur.args).toHaveLength(1);
    expect(conteneur.env).toEqual([{ name: 'PROBE_URL', value: 'http://api.test/access' }]);

    expect(pod.spec.securityContext.runAsNonRoot).toBe(true);
    expect(typeof pod.spec.securityContext.runAsUser).toBe('number');
    expect(pod.spec.securityContext.seccompProfile.type).toBe('RuntimeDefault');
    expect(conteneur.securityContext.allowPrivilegeEscalation).toBe(false);
    expect(conteneur.securityContext.capabilities.drop).toEqual(['ALL']);
    expect(pod.spec.restartPolicy).toBe('Never');
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
