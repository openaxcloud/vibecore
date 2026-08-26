import fs from 'node:fs';
import process from 'node:process';
import YAML from 'yaml';

const WORKFLOW_PATH = '.github/workflows/e2e-runtime.yml';

export function validateRuntimeWorkflow(source) {
  const failures = [];
  let workflow;

  try {
    workflow = YAML.parse(source);
  } catch (error) {
    return [`workflow YAML does not parse: ${error instanceof Error ? error.message : String(error)}`];
  }

  const triggers = workflow?.on;
  const job = workflow?.jobs?.['e2e-runtime'];
  const steps = Array.isArray(job?.steps) ? job.steps : [];
  const stepSource = steps.map((step) => `${step?.name ?? ''}\n${step?.run ?? ''}`).join('\n');

  requireCondition(failures, hasTrigger(triggers, 'pull_request'), 'workflow must run on pull_request');
  requireCondition(failures, hasTrigger(triggers, 'push'), 'workflow must run on push');
  requireCondition(failures, hasTrigger(triggers, 'workflow_dispatch'), 'workflow must retain workflow_dispatch');
  requireCondition(failures, Boolean(job), 'e2e-runtime job is missing');
  requireCondition(failures, job?.['continue-on-error'] !== true, 'e2e-runtime job must be blocking');
  requireCondition(
    failures,
    steps.every((step) => step?.['continue-on-error'] !== true),
    'runtime workflow steps must not suppress failures',
  );
  requireCondition(failures, /blocking/i.test(String(job?.name ?? '')), 'job name must state that it is blocking');
  requireCondition(
    failures,
    isContentsReadOnly(workflow?.permissions),
    'workflow permissions must be exactly contents: read',
  );
  requireCondition(
    failures,
    job?.permissions === undefined,
    'job must not override the read-only workflow permissions',
  );
  requireCondition(
    failures,
    job?.env?.VITE_RUNTIME_MODE === 'remote-kubernetes',
    'web build must select remote-kubernetes runtime',
  );
  requireCondition(
    failures,
    String(job?.env?.VITE_RUNTIME_API_BASE_URL ?? '').endsWith('/api/runtime'),
    'web build must inline an explicit runtime API base URL',
  );
  requireCondition(
    failures,
    !source.includes('secrets.'),
    'runtime gate must not consume repository/environment secrets',
  );
  requireCondition(
    failures,
    String(job?.env?.COMPOSE_PROJECT_NAME ?? '').startsWith('vibecore-e2e-runtime-'),
    'compose resources must use an explicit ephemeral project name',
  );

  for (const step of steps) {
    const uses = String(step?.uses ?? '');

    if (uses && !uses.startsWith('./')) {
      requireCondition(
        failures,
        /^[^@]+@[a-f0-9]{40}$/.test(uses),
        `external action must be pinned to an immutable commit SHA: ${uses}`,
      );
    }
  }

  for (const required of [
    'scripts/e2e-runtime-cluster.sh up',
    'scripts/e2e-runtime-cluster.spec.sh',
    'scripts/run-e2e-runtime-playwright.spec.sh',
    'scripts/runtime-e2e-agent-bridge.ts',
    'services/workspace-manager/src/server.ts',
    'services/preview-proxy/src/server.ts',
    'runtime:validate:api-kubernetes',
    'scripts/run-e2e-runtime-playwright.sh',
    'scripts/e2e-runtime-cluster.sh evidence',
    'scripts/e2e-runtime-cluster.sh down',
    'scripts/e2e-runtime-cluster.sh assert-down',
  ]) {
    requireCondition(
      failures,
      stepSource.includes(required),
      `workflow is missing required runtime action: ${required}`,
    );
  }

  requireCondition(
    failures,
    job?.env?.E2E_RUNTIME_AGENT_IMAGE === 'vibecore/workspace-agent:e2e-${{ github.sha }}' &&
      job?.env?.WORKSPACE_AGENT_IMAGE === 'vibecore/workspace-agent:e2e-${{ github.sha }}',
    'both runtime image consumers must be bound to github.sha',
  );
  requireCondition(
    failures,
    String(job?.env?.E2E_RUNTIME_CLUSTER_NAME ?? '').startsWith('vibecore-e2e-runtime-${{ github.run_id }}-'),
    'kind cluster identity must be scoped to the current GitHub run',
  );
  requireCondition(
    failures,
    String(job?.env?.E2E_RUNTIME_KUBECONFIG ?? '').startsWith(
      '/tmp/vibecore-e2e-runtime-${{ github.run_id }}-${{ github.run_attempt }}',
    ) && job?.env?.KUBECONFIG === job?.env?.E2E_RUNTIME_KUBECONFIG,
    'kubeconfig must use one absolute run-scoped path for every client',
  );

  const upIndex = stepSource.indexOf('scripts/e2e-runtime-cluster.sh up');
  const managerIndex = stepSource.indexOf('services/workspace-manager/src/server.ts');
  const testIndex = stepSource.indexOf('scripts/run-e2e-runtime-playwright.sh');
  const downIndex = stepSource.indexOf('scripts/e2e-runtime-cluster.sh down');
  requireCondition(
    failures,
    upIndex >= 0 && managerIndex > upIndex && testIndex > managerIndex && downIndex > testIndex,
    'runtime setup, services, tests and teardown must be ordered',
  );

  const teardown = steps.find((step) => String(step?.run ?? '').includes('scripts/e2e-runtime-cluster.sh down'));
  requireCondition(failures, teardown?.if === 'always()', 'cluster teardown must run with if: always()');
  requireCondition(
    failures,
    String(teardown?.run ?? '').includes('status=0') && String(teardown?.run ?? '').includes('exit "${status}"'),
    'teardown must attempt every cleanup and propagate any failure',
  );

  const artifact = steps.find((step) => String(step?.uses ?? '').startsWith('actions/upload-artifact@'));
  requireCondition(failures, artifact?.if === 'always()', 'runtime evidence upload must run with if: always()');
  return failures;
}

function requireCondition(failures, condition, message) {
  if (!condition) {
    failures.push(message);
  }
}

function hasTrigger(triggers, name) {
  return Boolean(triggers && typeof triggers === 'object' && Object.prototype.hasOwnProperty.call(triggers, name));
}

function isContentsReadOnly(permissions) {
  return (
    permissions &&
    typeof permissions === 'object' &&
    !Array.isArray(permissions) &&
    Object.keys(permissions).length === 1 &&
    permissions.contents === 'read'
  );
}

function main() {
  const source = fs.readFileSync(WORKFLOW_PATH, 'utf8');
  const failures = validateRuntimeWorkflow(source);

  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(`E2E_RUNTIME_WORKFLOW_INVALID: ${failure}`);
    }

    process.exitCode = 1;
    return;
  }

  console.log('E2E runtime workflow validation passed');
}

if (process.argv[1]?.endsWith('validate-e2e-runtime-workflow.mjs')) {
  main();
}
