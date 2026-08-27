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

function renderedResource(content, name) {
  const resource = content.split(/^---\s*$/m).find((document) => document.includes(`name: ${name}\n`));

  if (!resource) {
    throw new Error(`Missing rendered resource: ${name}`);
  }

  return resource;
}

function assertDnsClusterIpPolicy(content, name, cidr, description) {
  const policy = renderedResource(content, name);
  assertIncludes(policy, cidr, `${description} CIDR`);
  assertIncludes(policy, 'protocol: UDP\n          port: 53', `${description} UDP/53`);
  assertIncludes(policy, 'protocol: TCP\n          port: 53', `${description} TCP/53`);

  if (/port:\s*(?!53\b)\d+/.test(policy)) {
    throw new Error(`${description} opens a non-DNS port`);
  }
}

function assertApiMetadataPolicy(content) {
  const policy = renderedResource(content, 'allow-api-metadata-egress');
  assertIncludes(policy, 'app.kubernetes.io/name: api', 'metadata policy API pod selector');
  assertIncludes(policy, 'cidr: 169.254.169.254/32', 'metadata policy single-host CIDR');
  assertIncludes(policy, 'protocol: TCP\n          port: 80', 'metadata policy HTTP port');
  assertIncludes(policy, 'protocol: TCP\n          port: 988', 'metadata policy GKE proxy port');

  const ports = [...policy.matchAll(/port:\s*(\d+)/g)].map((match) => Number(match[1]));

  if (ports.length !== 2 || ports.some((port) => port !== 80 && port !== 988)) {
    throw new Error(`Metadata policy must expose only TCP/80 and TCP/988; rendered ports: ${ports.join(', ')}`);
  }

  if (policy.includes('namespaceSelector:') || policy.includes('cidr: 0.0.0.0/0')) {
    throw new Error('Metadata policy scope widened beyond the API pod and metadata host');
  }
}

function renderedConfigValue(content, key) {
  const configMap = renderedResource(content, 'vibecore-vibecore-platform-platform-env');
  const match = configMap.match(new RegExp(`^  ${key}: ["']?([^"'\\n]+)["']?$`, 'm'));

  if (!match) {
    throw new Error(`Missing rendered platform config value: ${key}`);
  }

  return match[1];
}

function assertStrictCorsOrigins(content, expected, description) {
  const rendered = renderedConfigValue(content, 'API_CORS_ORIGINS');

  if (rendered !== expected) {
    throw new Error(`${description} mismatch: expected ${expected}, rendered ${rendered}`);
  }

  const origins = rendered.split(',');

  if (origins.length === 0 || origins.some((origin) => !/^https:\/\/[a-z0-9.-]+$/i.test(origin))) {
    throw new Error(`${description} must contain only explicit HTTPS origins: ${rendered}`);
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
  'terraform/modules/gke-app/main.tf',
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
requiredContent(
  'terraform/modules/gke-app/main.tf',
  /name_prefix\s*=\s*"system-std-"/,
  'replaceable GKE system node-pool name prefix',
);
requiredContent(
  'terraform/modules/gke-app/main.tf',
  /create_before_destroy\s*=\s*true/,
  'zero-capacity-gap GKE system node-pool replacement',
);
requiredContent(
  'terraform/modules/gke-app/main.tf',
  /max_unavailable\s*=\s*0/,
  'zero-unavailable GKE system node-pool upgrades',
);
requiredContent('terraform/modules/gke-app/main.tf', /disk_size_gb\s*=\s*200/, '200 GiB GKE system boot disk');
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
assertIncludes(defaultPlatform, 'name: allow-dns-clusterip', 'platform DNS ClusterIP policy');
assertDnsClusterIpPolicy(defaultPlatform, 'allow-dns-clusterip', '10.30.0.10/32', 'platform DNS policy');
assertIncludes(defaultPlatform, 'name: allow-platform-required-egress', 'platform required-egress policy');
assertIncludes(defaultPlatform, '169.254.169.254/32', 'platform metadata-server egress block');
assertApiMetadataPolicy(defaultPlatform);
assertStrictCorsOrigins(defaultPlatform, 'https://staging.example.com', 'default API CORS allowlist');
assertIncludes(defaultPlatform, 'app.kubernetes.io/name: "ingress-nginx"', 'default ingress controller app label');
assertIncludes(
  defaultPlatform,
  'kubernetes.io/metadata.name: "ingress-nginx"',
  'default ingress controller namespace label',
);

const defaultWorkspaces = workspaceHelmTemplate();
assertIncludes(defaultWorkspaces, 'name: workspace-default-deny', 'workspace default-deny policy');
assertIncludes(defaultWorkspaces, 'name: allow-dns-clusterip', 'workspace DNS ClusterIP policy');
assertDnsClusterIpPolicy(defaultWorkspaces, 'allow-dns-clusterip', '10.52.0.10/32', 'workspace DNS policy');
assertIncludes(defaultWorkspaces, 'name: workspace-controlled-egress', 'workspace controlled-egress policy');
assertIncludes(defaultWorkspaces, 'name: workspace-manager-preview-ingress', 'workspace platform-ingress policy');
assertIncludes(defaultWorkspaces, '169.254.169.254/32', 'workspace metadata-server egress block');

const overriddenDnsPlatform = helmTemplate(['--set', 'networkPolicy.dnsServiceCidr=10.99.0.53/32']);
assertIncludes(overriddenDnsPlatform, '10.99.0.53/32', 'overridden platform DNS ClusterIP allow-list');

const overriddenDnsWorkspaces = workspaceHelmTemplate(['--set', 'network.dnsServiceCidr=10.98.0.53/32']);
assertIncludes(overriddenDnsWorkspaces, '10.98.0.53/32', 'overridden workspace DNS ClusterIP allow-list');

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

const prodPlatform = helmTemplate(['--values', resolve(root, 'helm/platform/values-prod.yaml')]);
assertStrictCorsOrigins(
  prodPlatform,
  'https://app.e-code.ai,https://e-code.ai,https://www.e-code.ai',
  'production API CORS allowlist',
);
const prodIngress = renderedResource(prodPlatform, 'vibecore-vibecore-platform-app');
assertIncludes(
  prodIngress,
  'nginx.ingress.kubernetes.io/from-to-www-redirect: "true"',
  'production canonical www redirect',
);
assertIncludes(prodIngress, '- "www.e-code.ai"', 'production www TLS host');

const derivedWwwCorsPlatform = helmTemplate([
  '--set',
  'global.appDomain=app.example.com',
  '--set',
  'global.marketingDomain=example.com',
  '--set',
  'global.marketingWwwRedirect=true',
]);
assertStrictCorsOrigins(
  derivedWwwCorsPlatform,
  'https://app.example.com,https://example.com,https://www.example.com',
  'derived www API CORS allowlist',
);

console.log('infra scaffold valid');
