import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
// eslint-disable-next-line no-restricted-imports -- Repository deployment guard imports its executable verifier.
import { verifyWorkspaceAdmissionPhase } from '../../scripts/release-gate/verify-workspace-admission-phase.mjs';

const root = new URL('../../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), 'utf8');

describe('workspace admission staged rollout', () => {
  it('reasserts both production switches despite Helm reuse-values and verifies the live ConfigMap', () => {
    const values = parse(read('infra/helm/platform/values-prod.yaml'));
    const workflow = read('.github/workflows/deploy-main.yml');
    const configmap = read('infra/helm/platform/templates/configmap.yaml');

    for (const [property, name, expected] of [
      ['workspaceAdmissionV2QuotaEnabled', 'WORKSPACE_ADMISSION_V2_QUOTA_ENABLED', 'true'],
      ['workspaceAdmissionV2Enabled', 'WORKSPACE_ADMISSION_V2_ENABLED', 'false'],
    ]) {
      expect(String(values.platformEnv.runtime[property])).toBe(expected);
      expect(workflow).toContain(`--set-string "platformEnv.runtime.${property}=${expected}"`);
      expect(configmap).toContain(`${name}: {{ .Values.platformEnv.runtime.${property}`);
    }

    const steps = Object.values(parse(workflow).jobs).flatMap((job: any) => job.steps ?? []);
    expect(
      steps.some(
        (step: any) =>
          step.name === 'Verify rollout' &&
          step.run.includes(
            'node scripts/release-gate/verify-workspace-admission-phase.mjs /tmp/protections-configmap.json',
          ),
      ),
    ).toBe(true);
  });

  it.each([
    {},
    { data: { WORKSPACE_ADMISSION_V2_QUOTA_ENABLED: 'false', WORKSPACE_ADMISSION_V2_ENABLED: 'false' } },
    { data: { WORKSPACE_ADMISSION_V2_QUOTA_ENABLED: 'true', WORKSPACE_ADMISSION_V2_ENABLED: 'true' } },
  ])('rejects a missing reader or premature reservation activation', (configmap) => {
    expect(() => verifyWorkspaceAdmissionPhase(configmap)).toThrow();
  });

  it('accepts exactly the first rollout phase', () => {
    expect(() =>
      verifyWorkspaceAdmissionPhase({
        data: {
          WORKSPACE_ADMISSION_V2_QUOTA_ENABLED: 'true',
          WORKSPACE_ADMISSION_V2_ENABLED: 'false',
        },
      }),
    ).not.toThrow();
  });
});
