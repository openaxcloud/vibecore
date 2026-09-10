import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);

function requiredPath(path) {
  const fullPath = resolve(root, path);

  if (!existsSync(fullPath)) {
    throw new Error(`Missing required infra path: ${path}`);
  }
}

function requiredContent(path, pattern, description) {
  const fullPath = resolve(root, path);
  const content = readFileSync(fullPath, 'utf8');

  if (!pattern.test(content)) {
    throw new Error(`Missing ${description} in ${path}`);
  }
}

function helmTemplate(args = []) {
  return execFileSync(
    'helm',
    ['template', 'vibecore', resolve(root, 'helm/platform'), '--namespace', 'vibecore', ...args],
    { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 },
  );
}

/*
 * Retrouve UN document rendu par son kind et son nom EXACT.
 *
 * Une simple recherche de sous-chaîne ne suffit pas, et je m'y suis fait
 * prendre en écrivant ce fichier : ma contre-épreuve renommait la politique en
 * `deny-all-default-RENOMMEE`, et `includes('name: deny-all-default')` la
 * trouvait quand même. L'assertion passait au vert sur une politique disparue.
 * On découpe donc les documents et on compare le nom en entier.
 */
function findNetworkPolicy(rendered, name) {
  for (const doc of rendered.split(/^---$/m)) {
    if (!/kind:\s*NetworkPolicy/.test(doc)) {
      continue;
    }

    const found = /^\s{2}name:\s*(\S+)\s*$/m.exec(doc);

    if (found && found[1] === name) {
      return doc;
    }
  }

  return null;
}

function assertIncludes(content, needle, description) {
  if (!content.includes(needle)) {
    throw new Error(`Missing ${description}: ${needle}`);
  }
}

for (const path of [
  '../apps',
  '../services',
  '../packages',
  'helm/workspaces-runtime/Chart.yaml',
  'helm/platform/Chart.yaml',
  'terraform/envs/staging/main.tf',
  'terraform/envs/prod/main.tf',
  'terraform/modules/gke-workspaces/main.tf',
  'terraform/modules/cloud-sql/main.tf',
  'terraform/modules/redis/main.tf',
  'gcp/bootstrap.sh',
  'kubernetes/workspaces-runtime/networkpolicies.yaml',
  /*
   * LES DEUX MANIFESTES AUTONOMES `kubernetes/networkpolicies/*-deny-default.yaml`
   * ONT ÉTÉ RETIRÉS D'ICI, ET C'EST VOULU.
   *
   * `6589338b8` les a supprimés : ils portaient les MÊMES NOMS que les
   * NetworkPolicies gérées par Helm (`deny-all-default`,
   * `workspace-default-deny`, `workspace-controlled-egress`), et la
   * documentation disait de les appliquer APRÈS Helm — ce qui écrasait
   * l'egress plus strict du graphe, jusqu'à ROUVRIR le port 80 depuis les bacs
   * à sable.
   *
   * Ce validateur, lui, n'a jamais été mis à jour : il exigeait ces deux
   * chemins, jetait sur le premier, et TOUT ce qui suit n'a plus jamais été
   * exécuté — gVisor, blocage du serveur de métadonnées, Cloud SQL en IP
   * privée, Redis en haute disponibilité, et les quatre assertions sur le
   * rendu du graphe. Une garde qui ne peut pas s'exécuter ne garde rien.
   *
   * La propriété n'a pas disparu pour autant : elle a MIGRÉ dans le graphe.
   * Elle est donc vérifiée plus bas, sur le rendu, là où elle vit vraiment.
   */
  'kubernetes/podsecurity/namespaces.yaml',
  'kubernetes/admission-policies/workspace-restricted-policies.yaml',
  'kubernetes/examples/workspace-pod.yaml',
  'observability/prometheus/alert-rules.yaml',
  'observability/grafana/vibecore-platform-dashboard.json',
  'observability/synthetics/health-check.json',
]) {
  requiredPath(path);
}

requiredContent('kubernetes/workspaces-runtime/example-workspace-pod.yaml', /runtimeClassName:\s*gvisor/, 'gVisor runtime class');
requiredContent('kubernetes/examples/workspace-pod.yaml', /runtimeClassName:\s*gvisor/, 'gVisor runtime class');
requiredContent('terraform/modules/gke-workspaces/main.tf', /sandbox_config/, 'GKE sandbox config');
requiredContent('terraform/modules/cloud-sql/main.tf', /ipv4_enabled\s*=\s*false/, 'Cloud SQL private IP only');
requiredContent('terraform/modules/redis/main.tf', /STANDARD_HA/, 'Redis STANDARD_HA');
requiredContent('kubernetes/workspaces-runtime/networkpolicies.yaml', /169\.254\.169\.254\/32/, 'metadata server egress block');


const defaultPlatform = helmTemplate();

/*
 * TÉMOIN POSITIF, EN PREMIER. Sans lui, toutes les assertions qui suivent
 * passeraient au vert sur un rendu VIDE : `assertIncludes` ne distingue pas
 * « la propriété est absente » de « il n'y a rien à examiner ». C'est
 * exactement la faute qui a rendu ce validateur inoffensif pendant des mois.
 */
if (defaultPlatform.length < 1000 || !defaultPlatform.includes('kind: ConfigMap')) {
  throw new Error('Helm render looks empty — every assertion below would pass vacuously');
}

/*
 * La politique de refus par défaut vit désormais DANS le graphe (voir la note
 * plus haut sur `6589338b8`). On l'exige donc sur le rendu, avec ses deux
 * moitiés : elle existe, et elle ferme bien les DEUX sens.
 */
const denyAllDefault = findNetworkPolicy(defaultPlatform, 'deny-all-default');

if (!denyAllDefault) {
  throw new Error('Missing Helm-managed NetworkPolicy named exactly deny-all-default');
}

if (!/policyTypes:\s*\[\s*"Ingress"\s*,\s*"Egress"\s*\]/.test(denyAllDefault)) {
  throw new Error('deny-all-default must close BOTH directions (policyTypes Ingress + Egress)');
}

assertIncludes(defaultPlatform, 'app.kubernetes.io/name: "ingress-nginx"', 'default ingress controller app label');
assertIncludes(defaultPlatform, 'kubernetes.io/metadata.name: "ingress-nginx"', 'default ingress controller namespace label');

const overriddenPlatform = helmTemplate([
  '--set-json',
  'networkPolicy.ingressControllerNamespaceSelector={"kubernetes.io/metadata.name":"edge-nginx","app.kubernetes.io/name":"edge-nginx"}',
]);
assertIncludes(overriddenPlatform, 'app.kubernetes.io/name: "edge-nginx"', 'overridden ingress controller app label');
assertIncludes(overriddenPlatform, 'kubernetes.io/metadata.name: "edge-nginx"', 'overridden ingress controller namespace label');

console.log('infra scaffold valid');
