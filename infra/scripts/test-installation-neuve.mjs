import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse, parseAllDocuments } from 'yaml';

const helm = process.env.TEST_HELM_BIN || 'helm';

test('la CI exécute cette garde après installation de Helm', () => {
  const workflow = parse(readFileSync('.github/workflows/ci.yml', 'utf8'));
  const chemin = relative(process.cwd(), fileURLToPath(import.meta.url));
  const job = Object.values(workflow.jobs).find((job) => job.steps?.some((step) => step.run?.includes(chemin)));
  assert.ok(job, 'la garde doit être exécutée par la CI');

  const execution = job.steps.findIndex((step) => step.run?.includes(chemin));
  assert.ok(job.steps.slice(0, execution).some((step) => step.uses?.startsWith('azure/setup-helm@')));
});

function rendre(...options) {
  const sortie = execFileSync(
    helm,
    ['template', 'vibecore', 'infra/helm/platform', '-f', 'infra/helm/platform/values-prod.yaml', ...options],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );

  const documents = parseAllDocuments(sortie);
  assert.ok(documents.length > 10, 'des ressources doivent réellement être rendues');

  return documents
    .map((document) => {
      assert.equal(document.errors.length, 0);
      return document.toJS();
    })
    .filter(Boolean);
}

test('le compte du hook existe avant le Job de migration à la première installation', () => {
  const ressources = rendre();

  const jobs = ressources.filter(
    (r) => r.kind === 'Job' && r.metadata.annotations?.['helm.sh/hook']?.includes('pre-install'),
  );
  assert.equal(jobs.length, 1);

  const job = jobs[0];

  const compte = ressources.find(
    (r) => r.kind === 'ServiceAccount' && r.metadata.name === job.spec.template.spec.serviceAccountName,
  );
  assert.ok(compte);
  assert.ok(compte.metadata.annotations?.['helm.sh/hook']?.includes('pre-install'));
  assert.ok(
    Number(compte.metadata.annotations['helm.sh/hook-weight']) <
      Number(job.metadata.annotations['helm.sh/hook-weight']),
  );
  assert.equal(job.spec.template.spec.automountServiceAccountToken, false);
});

test('CORS dérive des hôtes rendus et respecte une surcharge explicite', () => {
  const cors = (options) =>
    rendre(...options).find((r) => r.kind === 'ConfigMap' && r.data?.API_CORS_ORIGINS)?.data.API_CORS_ORIGINS;
  assert.equal(cors([]), 'https://app.e-code.ai,https://e-code.ai,https://www.e-code.ai');
  assert.equal(
    cors(['--set', 'global.appDomain=studio.example.com', '--set', 'global.marketingDomain=example.com']),
    'https://studio.example.com,https://example.com,https://www.example.com',
  );
  assert.equal(
    cors(['--set', 'platformEnv.apiCorsOrigins=https://extranet.example.com']),
    'https://extranet.example.com',
  );
});

test('la règle DNS ne permet que le serveur configuré et le port DNS', () => {
  const ressources = rendre('--set', 'networkPolicy.dnsServiceIp=10.20.0.10');
  const dns = ressources.find((r) => r.kind === 'NetworkPolicy' && r.metadata.name === 'allow-dns-clusterip');
  assert.ok(dns);
  assert.deepEqual(dns.spec.egress[0].to, [{ ipBlock: { cidr: '10.20.0.10/32' } }]);
  assert.deepEqual(dns.spec.egress[0].ports, [
    { protocol: 'UDP', port: 53 },
    { protocol: 'TCP', port: 53 },
  ]);
  assert.equal(
    rendre('--set', 'networkPolicy.dnsServiceIp=').some((r) => r.metadata.name === 'allow-dns-clusterip'),
    false,
  );
});

test('ACME vise les pods solveurs et peut être explicitement désactivé', () => {
  const acme = rendre().find((r) => r.kind === 'NetworkPolicy' && r.metadata.name === 'allow-acme-solver-ingress');
  assert.ok(acme);
  assert.deepEqual(acme.spec.podSelector.matchLabels, { 'acme.cert-manager.io/http01-solver': 'true' });
  assert.equal(
    rendre('--set', 'networkPolicy.acmeHttp01Solver=false').some(
      (r) => r.metadata.name === 'allow-acme-solver-ingress',
    ),
    false,
  );
});

test('l’issuer du certificat wildcard peut différer de celui des pages publiques', () => {
  const ingresses = rendre(
    '--set',
    'ingress.issuerName=issuer-http',
    '--set',
    'ingress.previewIssuerName=issuer-dns',
  ).filter((r) => r.kind === 'Ingress');

  const preview = ingresses.find((r) => r.spec.tls?.some((t) => t.hosts?.some((host) => host.startsWith('*.'))));
  assert.ok(preview);
  assert.equal(preview.metadata.annotations['cert-manager.io/cluster-issuer'], 'issuer-dns');

  const publics = ingresses.filter((r) => r !== preview);
  assert.ok(publics.length > 0);

  for (const ingress of publics) {
    assert.equal(ingress.metadata.annotations['cert-manager.io/cluster-issuer'], 'issuer-http');
  }
});

for (const fichier of [
  'scripts/audit-env/test-pinned-context.sh',
  'scripts/audit-env/test-teardown-verification.sh',
  'scripts/ci/test-cluster-wrapper.sh',
]) {
  test(`les commandes simulées protègent la cible : ${fichier}`, () => {
    execFileSync('bash', [fichier], { stdio: ['ignore', 'pipe', 'pipe'] });
  });
}
