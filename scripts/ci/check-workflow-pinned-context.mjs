#!/usr/bin/env node
/*
 * Garde statique : aucun appel `helm`/`kubectl` NU dans .github/workflows/.
 *
 * POURQUOI. deploy-main.yml neutralisait les variables `HELM_*` dans son étape de
 * credentials, mais un `unset` ne franchit pas la frontière d'une étape : chaque
 * `run:` est un shell neuf, ré-alimenté par le bloc `env:` du workflow et par
 * l'environnement du runner. Les étapes suivantes — dont `helm upgrade` sur la
 * PRODUCTION — repartaient donc avec les variables intactes. Et `--kube-context`
 * ne les couvre pas : `HELM_KUBEAPISERVER` + `HELM_KUBETOKEN` contournent le
 * kubeconfig entièrement, si bien que le contexte nommé n'est plus consulté.
 *
 * Le correctif est l'enveloppe scripts/ci/cluster.sh, qui neutralise
 * l'environnement DANS LE PROCESSUS qui exécute l'outil, nomme la cible et vérifie
 * son identité. Cette garde interdit de repasser à côté — la propriété est tenue
 * par la CI, pas par la relecture. Même règle, même raison que
 * scripts/audit-env/check-pinned-context.mjs, sur l'autre moitié du parc.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = join(import.meta.dirname, '..', '..', '.github', 'workflows');

/*
 * `kubectl config …` ne touche AUCUN cluster (il lit/écrit le kubeconfig) :
 * l'étape de credentials en a besoin pour nommer le contexte qu'elle vient
 * d'obtenir. `helm repo` est purement local. Le reste doit passer par l'enveloppe.
 */
const ALLOWED = [
  /scripts\/ci\/cluster\.sh/,
  /\bkubectl config\b/,
  /\bhelm repo\b/,
  /\bhelm (lint|template|show)\b/,
  /--kube-context/,
  /--context[= ]/,
];

const CALL = /(?:^|[\s;&|(`$])(helm|kubectl)\s/;

/** Chaînes littérales sans substitution de commande : elles n'exécutent rien. */
const stripLiterals = (code) =>
  code.replace(/'[^']*'|"(?:[^"\\]|\\.)*"/g, (m) => (/\$\(|`/.test(m) ? m : ''));

const offenders = [];

/*
 * Seul le SHELL est inspecté, c'est-à-dire le corps des blocs `run:`. Une valeur
 * YAML comme `name: Build tiers, then helm upgrade` n'exécute rien : la traiter
 * comme du code produisait un faux positif, et un faux positif dans une garde
 * bloquante finit par être désactivé.
 */
for (const file of readdirSync(DIR).filter((f) => /\.ya?ml$/.test(f)).sort()) {
  const lines = readFileSync(join(DIR, file), 'utf8').split('\n');
  /** Indentation du `run:` en cours, sinon null. */
  let runIndent = null;

  lines.forEach((line, i) => {
    const indent = line.length - line.trimStart().length;
    const blockOpen = line.match(/^(\s*)-?\s*run:\s*[|>]/);
    const inline = line.match(/^\s*-?\s*run:\s*(\S.*)$/);

    if (blockOpen) {
      runIndent = blockOpen[1].length;

      return;
    }

    let code = null;

    if (inline) {
      // `run: helm upgrade …` sur une seule ligne.
      runIndent = null;
      code = inline[1];
    } else if (runIndent !== null) {
      if (line.trim() !== '' && indent <= runIndent) {
        runIndent = null; // le bloc est terminé (retour à une clé YAML)

        return;
      }

      // Commentaire shell en début de ligne : rien d'exécutable.
      code = /^\s*#/.test(line) ? '' : line;
    }

    if (code === null) {
      return;
    }

    code = stripLiterals(code);

    if (CALL.test(code) && !ALLOWED.some((re) => re.test(code))) {
      offenders.push(`${file}:${i + 1}: ${line.trim()}`);
    }
  });
}

if (offenders.length > 0) {
  console.error('Appel helm/kubectl SANS cible epinglee dans un workflow (utiliser scripts/ci/cluster.sh) :');
  for (const o of offenders) {
    console.error(`  ${o}`);
  }
  console.error('\nVoir scripts/ci/cluster.sh — un `unset HELM_*` ne survit pas a la fin de son etape.');
  process.exit(1);
}

console.log('.github/workflows: tous les appels helm/kubectl portent une cible epinglee');
