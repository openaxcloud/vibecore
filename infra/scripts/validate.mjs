import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
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
  // NOTE: `kubernetes/networkpolicies/{workspaces,platform}-deny-default.yaml`
  // used to be required here. They were DELETED on purpose in 6589338b: the
  // standalone manifests duplicated the names of the Helm-managed policies
  // (deny-all-default, workspace-default-deny, workspace-controlled-egress) and
  // the docs told operators to apply them AFTER helm, which overwrote the
  // chart's stricter egress and re-opened port 80 from the sandboxes. This gate
  // kept requiring the deleted paths, so `node infra/scripts/validate.mjs`
  // threw before running a single assertion — Gate 1 has been red ever since,
  // and recreating the files to appease it would restore the very hole that
  // commit closed. The deny-default coverage is asserted below where the
  // policies actually live: the platform's in the Helm chart, the workspaces'
  // in kubernetes/workspaces-runtime/networkpolicies.yaml.
  'kubernetes/podsecurity/namespaces.yaml',
  'kubernetes/ingress-nginx/namespace.yaml',
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
// Workspaces deny-default, asserted where it lives now (see the note above).
requiredContent(
  'kubernetes/workspaces-runtime/networkpolicies.yaml',
  /name:\s*workspace-default-deny/,
  'workspaces default-deny NetworkPolicy',
);

// The ingress-nginx namespace manifest must actually carry every label the
// chart's selector matches on. These two are applied by different things (the
// manifest by CD / the audit script, the selector by the chart), and when they
// drifted apart the whole platform answered 504 with no certificate. Assert the
// invariant instead of trusting two files to stay in step.
for (const label of ['kubernetes.io/metadata.name: ingress-nginx', 'app.kubernetes.io/name: ingress-nginx']) {
  requiredContent(
    'kubernetes/ingress-nginx/namespace.yaml',
    new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    `ingress-nginx namespace label "${label}"`,
  );
}

const defaultPlatform = helmTemplate();
// Platform deny-default + the ingress namespace-name selector, asserted on the
// rendered chart rather than on the deleted standalone manifest.
assertIncludes(defaultPlatform, 'name: deny-all-default', 'platform default-deny NetworkPolicy');
assertIncludes(defaultPlatform, 'app.kubernetes.io/name: "ingress-nginx"', 'default ingress controller app label');
assertIncludes(defaultPlatform, 'kubernetes.io/metadata.name: "ingress-nginx"', 'default ingress controller namespace label');

const overriddenPlatform = helmTemplate([
  '--set-json',
  'networkPolicy.ingressControllerNamespaceSelector={"kubernetes.io/metadata.name":"edge-nginx","app.kubernetes.io/name":"edge-nginx"}',
]);
assertIncludes(overriddenPlatform, 'app.kubernetes.io/name: "edge-nginx"', 'overridden ingress controller app label');
assertIncludes(overriddenPlatform, 'kubernetes.io/metadata.name: "edge-nginx"', 'overridden ingress controller namespace label');

/** Scripts shell couverts par shellcheck (glob resolu ici, pas dans un shell). */
const SHELL_SCRIPTS = [
  ...readdirSync(resolve(root, '../scripts/audit-env')).filter((f) => f.endsWith('.sh')).map((f) => `../scripts/audit-env/${f}`),
  ...readdirSync(resolve(root, '../scripts/ci')).filter((f) => f.endsWith('.sh')).map((f) => `../scripts/ci/${f}`),
];

/*
 * Les scripts audit-env doivent passer un contexte cluster EXPLICITE à chaque
 * appel helm/kubectl. Sans ça, `HELM_KUBECONTEXT=<prod>` fait valider l'audit et
 * muter la production — la cible validée n'est pas la cible utilisée.
 */
execFileSync(process.execPath, [resolve(root, '../scripts/audit-env/check-pinned-context.mjs')], {
  stdio: 'inherit',
});

/*
 * Même invariante sur l'autre moitié du parc : les workflows GitHub. Un
 * `unset HELM_*` posé dans une étape ne survit pas à la fin de cette étape, donc
 * tout appel helm/kubectl passe par scripts/ci/cluster.sh, qui neutralise
 * l'environnement dans le processus qui exécute l'outil.
 */
execFileSync(process.execPath, [resolve(root, '../scripts/ci/check-workflow-pinned-context.mjs')], {
  stdio: 'inherit',
});

/*
 * Les deux gardes ci-dessus sont STATIQUES. Ces tests-là sont dynamiques et
 * hermétiques (faux binaires, aucun cluster, aucun réseau) : ils vérifient la
 * cible que l'outil reçoit RÉELLEMENT sous environnement hostile. Chacun contient
 * son cas témoin, donc un « tout refuser » ne peut pas les faire passer.
 */
for (const script of ['../scripts/ci/test-cluster-wrapper.sh', '../scripts/audit-env/test-teardown-verification.sh']) {
  execFileSync('bash', [resolve(root, script)], { stdio: 'inherit' });
}

/*
 * shellcheck sur ces mêmes scripts. Ce n'est pas du style pour du style : le
 * défaut trouvé dans mint-secrets.sh était une paire de BACKTICKS dans un heredoc
 * à délimiteur non quoté — bash exécutait donc `vc_preview` et le nom disparaissait
 * du fichier généré. shellcheck le voyait (SC2006) et personne ne le lançait.
 * Absent de la machine -> on le dit, on ne fait pas semblant d'avoir vérifié.
 */
try {
  execFileSync('shellcheck', ['--version'], { stdio: 'ignore' });
  execFileSync('shellcheck', ['-x', ...SHELL_SCRIPTS.map((s) => resolve(root, s))], { stdio: 'inherit' });
  console.log('shellcheck: scripts audit-env + ci propres');
} catch (error) {
  if (error.code === 'ENOENT') {
    console.log('shellcheck ABSENT — verification NON EFFECTUEE (ce n est pas un succes)');
  } else {
    throw error;
  }
}

console.log('infra scaffold valid');
