#!/usr/bin/env node
/*
 * Garde statique : aucun appel `helm`/`kubectl`/`terraform` NU dans
 * scripts/audit-env/.
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
 *
 * `terraform` est soumis à la MÊME règle, pour la même raison : il lit sa cible
 * dans `TF_CLI_ARGS_destroy` / `TF_DATA_DIR` / `TF_WORKSPACE` avant ses arguments,
 * si bien que `down.sh` pouvait vérifier la liaison sur le vrai état puis
 * `destroy` un état substitué. L'enveloppe `audit_terraform` refuse de s'exécuter
 * tant qu'une de ces variables est définie.
 *
 * Les corps de heredoc sont ignorés : ces scripts en émettent (fiche d'accès,
 * Secret de la plateforme) et le texte qu'ils IMPRIMENT n'exécute rien.
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
/*
 * `--context` / `--kube-context` ne figurent PLUS ici. Un appel nu qui porte le
 * drapeau reste un appel nu : le drapeau nomme une cible sans rien prouver de son
 * identité, et il ne protège pas de `HELM_KUBEAPISERVER`, qui court-circuite le
 * kubeconfig. Seules les enveloppes — qui neutralisent l'environnement PUIS
 * vérifient l'identité — sont acceptées. `command helm|kubectl|terraform`
 * n'apparaît que DANS ces enveloppes.
 */
const ALLOWED = [
  /\baudit_helm\b/,
  /\baudit_kubectl\b/,
  /\baudit_terraform\b/,
  /\bhelm repo\b/,
  /\bcommand (helm|kubectl|terraform)\b/,
  /\bcommand -v (helm|kubectl|terraform)\b/,
  // Enveloppe dediee au CONTROLE D'INTEGRITE de la prod : lecture seule, cible
  // figee, sous-commandes mutantes refusees (voir lib.sh).
  /\baudit_helm_prod_readonly\b/,
  /\bkubectl config\b/,
];

const CALL = /(?:^|[\s;&|(`$])(helm|kubectl|terraform)\s/;
/**
 * Retire les chaînes littérales SANS substitution de commande : le mot
 * « terraform » dans un `echo` n'exécute rien. Une chaîne contenant `$(` ou une
 * backquote est conservée telle quelle — c'est justement là que se cache un appel
 * réel (`"$(terraform output …)"`).
 */
const stripLiterals = (code) =>
  code.replace(/'[^']*'|"(?:[^"\\]|\\.)*"/g, (m) => (/\$\(|`/.test(m) ? m : ''));

/** Ouverture de heredoc : `<<EOF`, `<<-'EOF'`, `<< "EOF"`. */
const HEREDOC_OPEN = /<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1/;

const offenders = [];

for (const file of readdirSync(DIR).filter((f) => f.endsWith('.sh')).sort()) {
  const lines = readFileSync(join(DIR, file), 'utf8').split('\n');
  /** Délimiteur du heredoc en cours, sinon null. */
  let heredoc = null;

  lines.forEach((line, i) => {
    if (heredoc !== null) {
      if (line.trim() === heredoc) {
        heredoc = null;
      }

      return;
    }

    const code = stripLiterals(line.replace(/#.*$/, ''));
    const opened = code.match(HEREDOC_OPEN);

    if (CALL.test(code) && !ALLOWED.some((re) => re.test(code))) {
      offenders.push(`${file}:${i + 1}: ${line.trim()}`);
    }

    if (opened) {
      heredoc = opened[2];
    }
  });
}

if (offenders.length > 0) {
  console.error(
    'Appel helm/kubectl/terraform SANS cible epinglee (utiliser audit_helm / audit_kubectl / audit_terraform) :',
  );
  for (const o of offenders) {
    console.error(`  ${o}`);
  }
  console.error('\nVoir scripts/audit-env/lib.sh — la cible validee doit etre la cible utilisee.');
  process.exit(1);
}

console.log('scripts/audit-env: tous les appels helm/kubectl/terraform portent une cible epinglee');
