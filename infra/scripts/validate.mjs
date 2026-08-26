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

function workspaceHelmTemplate(args = []) {
  return execFileSync(
    'helm',
    ['template', 'workspaces', resolve(root, 'helm/workspaces-runtime'), '--namespace', 'workspaces', ...args],
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
  'kubernetes/podsecurity/namespaces.yaml',
  'kubernetes/admission-policies/workspace-restricted-policies.yaml',
  'kubernetes/examples/workspace-pod.yaml',
  'observability/prometheus/alert-rules.yaml',
  'observability/grafana/vibecore-platform-dashboard.json',
  'observability/synthetics/health-check.json',
]) {
  requiredPath(path);
}

requiredContent(
  'kubernetes/workspaces-runtime/example-workspace-pod.yaml',
  /runtimeClassName:\s*gvisor/,
  'gVisor runtime class',
);
requiredContent('kubernetes/examples/workspace-pod.yaml', /runtimeClassName:\s*gvisor/, 'gVisor runtime class');
requiredContent('terraform/modules/gke-workspaces/main.tf', /sandbox_config/, 'GKE sandbox config');
requiredContent('terraform/modules/cloud-sql/main.tf', /ipv4_enabled\s*=\s*false/, 'Cloud SQL private IP only');
requiredContent('terraform/modules/redis/main.tf', /STANDARD_HA/, 'Redis STANDARD_HA');
requiredContent(
  'kubernetes/workspaces-runtime/networkpolicies.yaml',
  /169\.254\.169\.254\/32/,
  'metadata server egress block',
);

const defaultPlatform = helmTemplate();
/*
 * NetworkPolicies are Helm-owned. The standalone manifests were deliberately
 * removed in 6589338b because applying them after Helm overwrote stricter chart
 * policies. Validate the rendered source of truth instead of requiring those
 * deleted, colliding files (which made `pnpm infra:validate` permanently red).
 */
assertIncludes(defaultPlatform, 'name: deny-all-default', 'platform default-deny policy');
assertIncludes(defaultPlatform, 'name: allow-platform-required-egress', 'platform required-egress policy');
assertIncludes(defaultPlatform, '169.254.169.254/32', 'platform metadata-server egress block');
assertIncludes(defaultPlatform, 'app.kubernetes.io/name: "ingress-nginx"', 'default ingress controller app label');
assertIncludes(
  defaultPlatform,
  'kubernetes.io/metadata.name: "ingress-nginx"',
  'default ingress controller namespace label',
);

const defaultWorkspaces = workspaceHelmTemplate();
assertIncludes(defaultWorkspaces, 'name: workspace-default-deny', 'workspace default-deny policy');
assertIncludes(defaultWorkspaces, 'name: workspace-controlled-egress', 'workspace controlled-egress policy');
assertIncludes(defaultWorkspaces, 'name: workspace-manager-preview-ingress', 'workspace platform-ingress policy');
assertIncludes(defaultWorkspaces, '169.254.169.254/32', 'workspace metadata-server egress block');

const overriddenPlatform = helmTemplate([
  '--set-json',
  'networkPolicy.ingressControllerNamespaceSelector={"kubernetes.io/metadata.name":"edge-nginx","app.kubernetes.io/name":"edge-nginx"}',
]);
assertIncludes(overriddenPlatform, 'app.kubernetes.io/name: "edge-nginx"', 'overridden ingress controller app label');
assertIncludes(
  overriddenPlatform,
  'kubernetes.io/metadata.name: "edge-nginx"',
  'overridden ingress controller namespace label',
);

console.log('infra scaffold valid');
