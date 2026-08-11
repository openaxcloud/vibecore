#!/usr/bin/env node
/*
 * Garde statique : aucun appel `helm`/`kubectl` NU dans scripts/audit-env/.
 *
 * POURQUOI. Ces scripts validaient le contexte kubectl courant puis appelaient
 * helm sans `--kube-context`. Or Helm résout sa cible via ses variables
 * d'environnement AVANT le contexte courant : `HELM_KUBECONTEXT=<prod>` suffisait
 * à faire passer la garde sur l'audit et à exécuter les `helm upgrade` contre la
 * PRODUCTION. La cible validée n'était pas la cible utilisée.
 *
 * Le correctif (scripts/audit-env/lib.sh) impose les enveloppes `audit_helm` /
 * `audit_kubectl`, qui passent `--kube-context` / `--context` explicitement. Mais
 * rien n'empêche d'écrire à nouveau un appel nu : c'est une invariante d'une
 * ligne, facile à casser, et le prix de l'erreur est une mutation de production.
 * D'où cette vérification, branchée sur Gate 1 (infra/scripts/validate.mjs) —
 * l'invariante est tenue par la CI, pas par la vigilance du relecteur.
 *
 * Le plus dangereux appel nu du lot était sur une LIGNE DE CONTINUATION
 * (`… | kubectl apply -f -`, celui qui écrit le Secret de la plateforme), donc
 * cette garde inspecte la ligne entière, pas seulement son début.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = join(import.meta.dirname, '.');

/*
 * `helm repo …` est purement local (il écrit ~/.config/helm), il ne touche aucun
 * cluster — l'exempter est délibéré et sûr. `command helm` / `command kubectl` ne
 * paraissent QUE dans les enveloppes elles-mêmes. `--kube-context` / `--context`
 * explicites sont acceptés : c'est exactement la propriété recherchée.
 */
const ALLOWED = [
  /\baudit_helm\b/,
  /\baudit_kubectl\b/,
  /\bhelm repo\b/,
  /\bcommand (helm|kubectl)\b/,
  /--kube-context/,
  /--context[= ]/,
  /\bcommand -v (helm|kubectl)\b/,
  /kubectl config get-contexts/,
];

const CALL = /(?:^|[\s;&|(`$])(helm|kubectl)\s/;

const offenders = [];

for (const file of readdirSync(DIR).filter((f) => f.endsWith('.sh')).sort()) {
  const lines = readFileSync(join(DIR, file), 'utf8').split('\n');

  lines.forEach((line, i) => {
    const code = line.replace(/#.*$/, '');

    if (!CALL.test(code)) {
      return;
    }

    if (ALLOWED.some((re) => re.test(code))) {
      return;
    }

    offenders.push(`${file}:${i + 1}: ${line.trim()}`);
  });
}

if (offenders.length > 0) {
  console.error('Appel helm/kubectl SANS contexte epingle (utiliser audit_helm / audit_kubectl) :');
  for (const o of offenders) {
    console.error(`  ${o}`);
  }
  console.error('\nVoir scripts/audit-env/lib.sh — la cible validee doit etre la cible utilisee.');
  process.exit(1);
}

console.log('scripts/audit-env: tous les appels helm/kubectl portent un contexte epingle');
