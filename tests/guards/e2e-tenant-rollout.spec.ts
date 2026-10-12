import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

describe('UI test stack mirrors the chart tenant rollout', () => {
  it('sets the API observe-only mode explicitly while the chart remains observe-only', () => {
    const action = parse(readFileSync(resolve('.github/actions/preparer-pile-e2e/action.yml'), 'utf8'));
    const starts = action.runs.steps.filter((step: { name?: string }) => step.name === 'Start API');
    expect(starts).toHaveLength(1);

    const chart = readFileSync(resolve('infra/helm/platform/templates/configmap.yaml'), 'utf8');
    const mode = chart.match(/^  TENANT_GUARDRAILS_ENABLED: "([^\"]+)"$/m)?.[1];
    expect(mode).toBe('false');
    expect(starts[0].env.TENANT_GUARDRAILS_ENABLED).toBe(mode);
  });
});
