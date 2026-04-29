import fs from 'node:fs';
import path from 'node:path';

const requiredWorkflows = [
  '.github/workflows/ci.yml',
  '.github/workflows/e2e.yml',
  '.github/workflows/docker.yml',
  '.github/workflows/terraform.yml',
  '.github/workflows/deploy-staging.yml',
  '.github/workflows/deploy-prod.yml',
  '.github/workflows/desktop-release.yml',
  '.github/workflows/mobile-release.yml',
];

const requiredLoadTests = [
  'tests/load/api-load.js',
  'tests/load/workspace-lifecycle-load.js',
  'tests/load/preview-load.js',
  'tests/load/ai-simulated-load.js',
  'tests/load/billing-webhook-load.js',
];

const requiredDocs = ['docs/CI_CD.md', 'docs/RELEASE_PROCESS.md', 'docs/ROLLBACK.md', 'docs/LOAD_TESTING.md'];

for (const file of [...requiredWorkflows, ...requiredLoadTests, ...requiredDocs]) {
  if (!fs.existsSync(file)) {
    throw new Error(`Missing required CI/CD asset: ${file}`);
  }
}

const prodWorkflow = fs.readFileSync('.github/workflows/deploy-prod.yml', 'utf8');
if (!prodWorkflow.includes('environment:') || !prodWorkflow.includes('production')) {
  throw new Error('deploy-prod.yml must use the production GitHub Environment for manual approval gates.');
}
if (!prodWorkflow.includes('helm rollback')) {
  throw new Error('deploy-prod.yml must print rollback instructions.');
}

const dockerWorkflow = fs.readFileSync('.github/workflows/docker.yml', 'utf8');
for (const image of ['web', 'admin', 'api', 'worker', 'ai-gateway', 'workspace-manager', 'workspace-agent', 'preview-proxy']) {
  if (!dockerWorkflow.includes(`image: ${image}`)) {
    throw new Error(`docker.yml does not build image ${image}`);
  }
}
for (const keyword of ['sbom', 'trivy', 'Artifact Registry']) {
  if (!dockerWorkflow.toLowerCase().includes(keyword.toLowerCase())) {
    throw new Error(`docker.yml missing ${keyword}`);
  }
}

console.log(JSON.stringify({ ok: true, workflows: requiredWorkflows.length, loadTests: requiredLoadTests.length }));
