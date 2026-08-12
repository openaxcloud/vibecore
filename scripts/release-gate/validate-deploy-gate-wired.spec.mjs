/**
 * Runs the gate-wiring policy on the REAL workflow files, on every PR.
 *
 * The same check also runs as a blocking step on the deploy path itself; having it
 * here too means a PR that unwires the gate goes red in review, rather than at the
 * moment someone is trying to ship.
 */
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  BREAK_GLASS_WORKFLOW,
  DEPLOY_WORKFLOW,
  POLICY_FILE,
  checkGateWiring,
  parseNeeds,
  parseWorkflowRegions,
  stripComments,
} from './validate-deploy-gate-wired.mjs';

function realFiles() {
  return {
    deployWorkflow: fs.readFileSync(DEPLOY_WORKFLOW, 'utf8'),
    breakGlassWorkflow: fs.readFileSync(BREAK_GLASS_WORKFLOW, 'utf8'),
    policy: JSON.parse(fs.readFileSync(POLICY_FILE, 'utf8')),
  };
}

describe('deploy gate wiring', () => {
  it('is intact on the current workflow files', () => {
    expect(checkGateWiring(realFiles())).toEqual([]);
  });

  it('catches a deploy job that no longer waits for the gate', () => {
    const files = realFiles();
    files.deployWorkflow = files.deployWorkflow.replace(
      'needs: [resolve-target, release-gate, preflight-gates]',
      'needs: [resolve-target, preflight-gates]',
    );
    expect(checkGateWiring(files).join('\n')).toMatch(/must declare 'needs: release-gate'/);
  });

  it('catches id-token being granted workflow-wide, which would arm the gate job with WIF', () => {
    const files = realFiles();
    files.deployWorkflow = files.deployWorkflow.replace(
      'permissions:\n  contents: read',
      'permissions:\n  contents: read\n  id-token: write',
    );
    expect(checkGateWiring(files).join('\n')).toMatch(/granted at the WORKFLOW level/);
  });

  it('catches a reintroduced free-form short_sha input', () => {
    const files = realFiles();
    files.deployWorkflow = files.deployWorkflow.replace(
      '      target_sha:\n        description:',
      '      short_sha:\n        description: anything\n      target_sha:\n        description:',
    );
    expect(checkGateWiring(files).join('\n')).toMatch(/free-form 'short_sha'/);
  });

  it('catches a rollout that goes back to mutable tags', () => {
    const files = realFiles();
    files.deployWorkflow = files.deployWorkflow.replace(
      /--set-string "services\.\$\{service\}\.imageDigest=\$\{digest\}"/,
      '--set "services.api.imageTag=${SHORT_SHA}"',
    );
    const problems = checkGateWiring(files).join('\n');
    expect(problems).toMatch(/imageDigest for every service|mutable tag alone/);
  });

  it('catches any required pipeline being dropped from the policy', () => {
    for (const name of ['Production CI', 'Production E2E', 'Security Analysis', 'Code Quality']) {
      const files = realFiles();
      files.policy = {
        ...files.policy,
        requiredWorkflows: files.policy.requiredWorkflows.filter((w) => w.displayName !== name),
      };
      expect(checkGateWiring(files).join('\n'), `dropping ${name}`).toMatch(/no longer a required check/);
    }
  });

  it('catches a break-glass path that could build and ship new code', () => {
    const files = realFiles();
    files.breakGlassWorkflow += '\n          gcloud builds submit .\n';
    expect(checkGateWiring(files).join('\n')).toMatch(/must not build images/);
  });
});

describe('workflow parsing helpers', () => {
  it('separates the top level from each job', () => {
    const { topLevel, jobs } = parseWorkflowRegions(
      ['name: x', 'permissions:', '  contents: read', 'jobs:', '  a:', '    needs: [b]', '  b:', '    runs-on: x'].join('\n'),
    );
    expect(topLevel).toContain('permissions:');
    expect([...jobs.keys()]).toEqual(['a', 'b']);
    expect(parseNeeds(jobs.get('a'))).toEqual(['b']);
  });

  it('reads block-style needs lists', () => {
    expect(parseNeeds(['    needs:', '      - one', '      - two', ''].join('\n'))).toEqual(['one', 'two']);
  });

  it('ignores prose so a comment about a permission is never mistaken for the permission', () => {
    const text = ['# id-token: write is deliberately not granted', 'permissions:', '  contents: read'].join('\n');
    expect(stripComments(text)).not.toMatch(/id-token/);
    expect(stripComments('          echo "# not a comment"')).toMatch(/echo/);
  });
});
