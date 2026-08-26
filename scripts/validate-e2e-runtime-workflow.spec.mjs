import { describe, expect, it } from 'vitest';

import { validateRuntimeWorkflow } from './validate-e2e-runtime-workflow.mjs';

const validWorkflow = `
name: E2E Runtime
on:
  pull_request:
  push:
  workflow_dispatch:
permissions:
  contents: read
jobs:
  e2e-runtime:
    name: Playwright runtime (blocking)
    runs-on: ubuntu-latest
    env:
      VITE_RUNTIME_MODE: remote-kubernetes
      VITE_RUNTIME_API_BASE_URL: http://127.0.0.1:3001/api/runtime
      COMPOSE_PROJECT_NAME: vibecore-e2e-runtime-test
      E2E_RUNTIME_CLUSTER_NAME: vibecore-e2e-runtime-\${{ github.run_id }}-\${{ github.run_attempt }}
      E2E_RUNTIME_KUBECONFIG: /tmp/vibecore-e2e-runtime-\${{ github.run_id }}-\${{ github.run_attempt }}.kubeconfig
      KUBECONFIG: /tmp/vibecore-e2e-runtime-\${{ github.run_id }}-\${{ github.run_attempt }}.kubeconfig
      E2E_RUNTIME_AGENT_IMAGE: vibecore/workspace-agent:e2e-\${{ github.sha }}
      WORKSPACE_AGENT_IMAGE: vibecore/workspace-agent:e2e-\${{ github.sha }}
    steps:
      - name: up
        run: |
          scripts/e2e-runtime-cluster.spec.sh
          scripts/run-e2e-runtime-playwright.spec.sh
          scripts/e2e-runtime-cluster.sh up
      - name: services
        run: |
          pnpm exec tsx scripts/runtime-e2e-agent-bridge.ts
          pnpm exec tsx services/workspace-manager/src/server.ts
          pnpm exec tsx services/preview-proxy/src/server.ts
          pnpm run runtime:validate:api-kubernetes
      - name: tests
        run: scripts/run-e2e-runtime-playwright.sh
      - name: evidence
        run: scripts/e2e-runtime-cluster.sh evidence
      - name: artifact
        if: always()
        uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02
      - name: teardown
        if: always()
        run: |
          status=0
          scripts/e2e-runtime-cluster.sh down || status=1
          scripts/e2e-runtime-cluster.sh assert-down || status=1
          exit "\${status}"
`;

describe('E2E runtime workflow validator', () => {
  it('accepts a blocking, pinned and fully torn-down runtime workflow', () => {
    expect(validateRuntimeWorkflow(validWorkflow)).toEqual([]);
  });

  it.each([
    ['continue-on-error: true', '    continue-on-error: true\n', 'e2e-runtime job must be blocking'],
    ['suppressed step failure', '      - name: tests\n', 'runtime workflow steps must not suppress failures'],
    [
      'missing kind setup',
      'scripts/e2e-runtime-cluster.sh up',
      'workflow is missing required runtime action: scripts/e2e-runtime-cluster.sh up',
    ],
    ['teardown not always', 'remove teardown always', 'cluster teardown must run with if: always()'],
    [
      'provider secret',
      '    env:\n      VITE_RUNTIME_MODE: remote-kubernetes',
      'runtime gate must not consume repository/environment secrets',
    ],
    [
      'mutable runtime image',
      'vibecore/workspace-agent:e2e-${{ github.sha }}',
      'both runtime image consumers must be bound to github.sha',
    ],
    [
      'unpinned external action',
      '      - name: up\n',
      'external action must be pinned to an immutable commit SHA: actions/checkout@v4',
    ],
    ['permission escalation', 'permissions:\n  contents: read', 'workflow permissions must be exactly contents: read'],
    [
      'split kubeconfig identity',
      '      KUBECONFIG: /tmp/vibecore-e2e-runtime-${{ github.run_id }}-${{ github.run_attempt }}.kubeconfig',
      'kubeconfig must use one absolute run-scoped path for every client',
    ],
    [
      'non-propagating teardown',
      '          status=0\n',
      'teardown must attempt every cleanup and propagate any failure',
    ],
  ])('rejects %s', (_label, mutation, expected) => {
    let source;

    if (mutation === '    continue-on-error: true\n') {
      source = validWorkflow.replace('    runs-on: ubuntu-latest\n', `    runs-on: ubuntu-latest\n${mutation}`);
    } else if (mutation === '      - name: tests\n') {
      source = validWorkflow.replace(mutation, `${mutation}        continue-on-error: true\n`);
    } else if (mutation === 'scripts/e2e-runtime-cluster.sh up') {
      source = validWorkflow.replace(mutation, 'true');
    } else if (mutation === 'remove teardown always') {
      source = validWorkflow.replace('      - name: teardown\n        if: always()\n', '      - name: teardown\n');
    } else if (mutation === '      - name: up\n') {
      source = validWorkflow.replace(mutation, `      - uses: actions/checkout@v4\n${mutation}`);
    } else if (mutation === 'vibecore/workspace-agent:e2e-${{ github.sha }}') {
      source = validWorkflow.replace(mutation, 'vibecore/workspace-agent:e2e-latest');
    } else if (mutation === 'permissions:\n  contents: read') {
      source = validWorkflow.replace(mutation, `${mutation}\n  id-token: write`);
    } else if (mutation.startsWith('      KUBECONFIG: /tmp/vibecore-e2e-runtime-')) {
      source = validWorkflow.replace(mutation, '      KUBECONFIG: relative.kubeconfig');
    } else if (mutation === '          status=0\n') {
      source = validWorkflow.replace(mutation, '');
    } else {
      source = validWorkflow.replace(
        mutation,
        `${mutation}\n      ANTHROPIC_API_KEY: \${{ secrets.ANTHROPIC_API_KEY }}`,
      );
    }

    expect(validateRuntimeWorkflow(source)).toContain(expected);
  });
});
