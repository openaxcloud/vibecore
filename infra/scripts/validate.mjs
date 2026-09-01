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
  'helm/platform/templates/networkpolicy.yaml',
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

/*
 * The two standalone manifests this validator used to require —
 * kubernetes/networkpolicies/{workspaces,platform}-deny-default.yaml — were
 * deliberately deleted in 6589338b8 ("remove colliding standalone
 * NetworkPolicies"). They carried the SAME object names as the Helm-managed
 * policies and the docs told operators to apply them AFTER helm, so they
 * OVERWROTE the chart's stricter egress — the standalone workspace policy
 * allowed port 80 out of the sandbox, which the chart does not. Requiring them
 * back would re-introduce that regression, so this validator asserts the same
 * guarantees against the sources that actually ship: the standalone workspaces
 * runtime manifest and the platform chart template.
 */
requiredContent(
  'kubernetes/workspaces-runtime/networkpolicies.yaml',
  /name:\s*workspace-default-deny[\s\S]*?podSelector:\s*\{\}/,
  'workspaces default-deny NetworkPolicy',
);
requiredContent(
  'helm/platform/templates/networkpolicy.yaml',
  /name:\s*deny-all-default[\s\S]*?podSelector:\s*\{\}/,
  'platform default-deny NetworkPolicy',
);
requiredContent(
  'helm/platform/templates/networkpolicy.yaml',
  /kubernetes\.io\/metadata\.name:/,
  'platform ingress namespace-name selector',
);

/*
 * Regression guard for the deleted manifest's actual defect: the sandbox must
 * never get plaintext port 80 egress. Assert that the only TCP ports the
 * workspace runtime opens outbound are 53 (DNS), 443 (TLS) and 5432 (the
 * project's own CNPG database) — a re-added `port: 80` fails here.
 */
{
  const workspaceNetpol = readFileSync(resolve(root, 'kubernetes/workspaces-runtime/networkpolicies.yaml'), 'utf8');

  /*
   * Scope to the single YAML document that declares the egress policy; the file
   * also holds an INGRESS policy whose :8080 ports are legitimate.
   */
  const egressDoc = workspaceNetpol.split(/^---$/m).find((doc) => doc.includes('workspace-controlled-egress'));

  if (!egressDoc) {
    throw new Error(
      'workspace-controlled-egress NetworkPolicy not found in kubernetes/workspaces-runtime/networkpolicies.yaml',
    );
  }

  const ports = [...egressDoc.matchAll(/port:\s*(\d+)/g)].map((match) => Number(match[1]));

  if (ports.length === 0) {
    throw new Error('No egress ports found in workspace-controlled-egress; the guard would pass vacuously');
  }

  const allowedEgressPorts = new Set([53, 443, 5432]);
  const unexpected = ports.filter((port) => !allowedEgressPorts.has(port));

  if (unexpected.length > 0) {
    throw new Error(
      `Unexpected workspace egress port(s) ${unexpected.join(', ')} in kubernetes/workspaces-runtime/networkpolicies.yaml; ` +
        'sandbox egress is restricted to DNS (53), TLS (443) and the project database (5432)',
    );
  }
}

const defaultPlatform = helmTemplate();
assertIncludes(defaultPlatform, 'app.kubernetes.io/name: "ingress-nginx"', 'default ingress controller app label');
assertIncludes(defaultPlatform, 'kubernetes.io/metadata.name: "ingress-nginx"', 'default ingress controller namespace label');

const overriddenPlatform = helmTemplate([
  '--set-json',
  'networkPolicy.ingressControllerNamespaceSelector={"kubernetes.io/metadata.name":"edge-nginx","app.kubernetes.io/name":"edge-nginx"}',
]);
assertIncludes(overriddenPlatform, 'app.kubernetes.io/name: "edge-nginx"', 'overridden ingress controller app label');
assertIncludes(overriddenPlatform, 'kubernetes.io/metadata.name: "edge-nginx"', 'overridden ingress controller namespace label');

console.log('infra scaffold valid');
