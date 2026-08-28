/*
 * SEC-9 — preuve rejouable de la SONDE d'exécution du workflow de déploiement.
 *
 * Le défaut constaté : la sonde « Runtime probe — deployed api refuses
 * activation in phase 1 » n'avait jamais atteint l'API, sur aucun déploiement.
 * Deux politiques du cluster la bloquaient, chacune suffisante :
 *
 *   1. Le namespace applique Pod Security `restricted`. Un pod jetable sans
 *      securityContext est refusé à l'admission ; `kubectl run` échoue en une
 *      fraction de seconde, l'affectation `CODE=$(...)` échoue sous
 *      `set -o pipefail`, et l'étape meurt AVANT d'imprimer son verdict.
 *   2. `deny-all-default` + `allow-intra-namespace-platform` ne laissent
 *      dialoguer avec l'API que les pods portant `app.kubernetes.io/part-of=
 *      vibecore`. Sans le label, curl expire, `CODE` est vide, et la branche
 *      fail-closed refuse d'armer l'activation.
 *
 * Le déploiement échouait donc systématiquement APRÈS un rollout réussi, en
 * affichant un arrêt de sécurité qui n'avait rien mesuré. Vérifié en réel
 * contre la production une fois les deux conditions satisfaites : l'API
 * déployée répond HTTP 401 — l'interlock est bien fermé.
 *
 * Comme deploy-activation-sequencing.spec.mjs, ce fichier EXÉCUTE le `run:`
 * réellement présent dans .github/workflows/deploy-main.yml à ce commit,
 * contre un faux `kubectl`. Les assertions sont donc liées au workflow livré :
 * modifier l'étape déplace ces tests ou les fait tomber.
 *
 * Run: pnpm vitest --run scripts/deploy-sec9-probe.spec.mjs
 */
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WORKFLOW_PATH = join(REPO_ROOT, '.github/workflows/deploy-main.yml');
const PROBE_STEP = 'Runtime probe — deployed api refuses activation in phase 1 (SEC-9)';

const workflow = parseYaml(readFileSync(WORKFLOW_PATH, 'utf8'));
const probeStep = workflow.jobs['build-and-deploy'].steps.find((s) => s.name === PROBE_STEP);

/**
 * Exécute le `run:` réel de la sonde contre un faux kubectl.
 *
 * @param {string} httpCode ce que curl « renverrait » : '401', '200', ou '' (timeout).
 * @returns {{status:number, stdout:string, runArgs:string}}
 */
function runProbe(httpCode) {
  const dir = mkdtempSync(join(tmpdir(), 'sec9-probe-'));

  try {
    const bin = join(dir, 'bin');
    mkdirSync(bin, { recursive: true });

    // Faux kubectl : sert un pod pour `get pods`, journalise les arguments de
    // `run` puis restitue le code HTTP demandé.
    const fake = [
      '#!/bin/sh',
      `printf '%s\\n' "$*" >> ${JSON.stringify(join(dir, 'kubectl-args.log'))}`,
      'case " $* " in',
      '  *" get pods "*) printf "api-pod-abc"; exit 0 ;;',
      `  *" run "*) printf '%s' ${JSON.stringify(httpCode)}; exit 0 ;;`,
      'esac',
      'exit 0',
      '',
    ].join('\n');

    writeFileSync(join(bin, 'kubectl'), fake);
    chmodSync(join(bin, 'kubectl'), 0o755);

    const script = join(dir, 'step.sh');
    const githubOutput = join(dir, 'github-output');
    writeFileSync(githubOutput, '');
    writeFileSync(script, probeStep.run);

    let status = 0;
    let stdout = '';

    try {
      stdout = execFileSync('bash', [script], {
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH}`,
          HELM_NAMESPACE: 'vibecore',
          HELM_RELEASE: 'vibecore',
          GITHUB_RUN_ID: '424242',
          GITHUB_RUN_ATTEMPT: '1',
          GITHUB_OUTPUT: githubOutput,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      status = error.status ?? 1;
      stdout = `${error.stdout ?? ''}${error.stderr ?? ''}`;
    }

    let runArgs = '';

    try {
      runArgs = readFileSync(join(dir, 'kubectl-args.log'), 'utf8');
    } catch {
      runArgs = '';
    }

    return { status, stdout, runArgs };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('SEC-9 · sonde d’exécution du déploiement', () => {
  it("l'étape existe et porte encore son garde-fou de cutover", () => {
    expect(probeStep).toBeDefined();
    expect(probeStep.if).toContain('barrier');
  });

  it('le pod jetable satisfait Pod Security `restricted` — sinon il est refusé à l’admission', () => {
    const { runArgs } = runProbe('401');

    expect(runArgs, 'securityContext du conteneur').toContain('"allowPrivilegeEscalation":false');
    expect(runArgs, 'capabilities drop ALL').toContain('"drop":["ALL"]');
    expect(runArgs, 'runAsNonRoot').toContain('"runAsNonRoot":true');
    expect(runArgs, 'seccompProfile').toContain('"seccompProfile":{"type":"RuntimeDefault"}');
  });

  it('le pod jetable porte le label réseau — sinon curl expire sur la NetworkPolicy', () => {
    const { runArgs } = runProbe('401');

    expect(runArgs).toContain('app.kubernetes.io/part-of=vibecore');
  });

  it('un 401 de l’API déployée vaut interlock fermé — la sonde passe', () => {
    const { status, stdout } = runProbe('401');

    expect(stdout).toContain('refused activation with HTTP 401');
    expect(status).toBe(0);
  });

  it('un 2xx signale un interlock OUVERT — la sonde refuse d’armer', () => {
    const { status, stdout } = runProbe('200');

    expect(stdout).toContain('PHASE-1 PROBE FAILED');
    expect(status).not.toBe(0);
  });

  it('une absence de réponse reste fail-closed — jamais un laissez-passer', () => {
    const { status, stdout } = runProbe('');

    expect(stdout).toContain('PHASE-1 PROBE INCONCLUSIVE');
    expect(stdout).toContain('activation remains closed');
    expect(status).toBe(0);
  });
});
