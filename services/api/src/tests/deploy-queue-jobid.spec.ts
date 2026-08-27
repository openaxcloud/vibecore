import { describe, expect, it } from 'vitest';

import { DEPLOY_BUILD_JOB, deployBuildJobId } from '../deploy-queue.js';

/*
 * Regression guard for the "Could not queue the build" prod incident: BullMQ
 * rejects a custom jobId containing ':' ("Custom Id cannot contain :"), and the
 * enqueue path used `deploy.build:<deploymentId>` — so every static deploy failed
 * to enqueue. The api tests inject a spy for enqueueDeployJob, so the real jobId
 * was never validated against BullMQ; this test locks the invariant directly.
 */
describe('deployBuildJobId', () => {
  it('never contains a colon (BullMQ custom-id rule)', () => {
    for (const id of ['cmrcxkn0r000r0mdbcdda7eca', 'abc123', 'x'.repeat(40)]) {
      expect(deployBuildJobId(id)).not.toContain(':');
    }
  });

  it('is deterministic and keyed on the deployment id (dedup for retried POSTs)', () => {
    expect(deployBuildJobId('dep-1')).toBe(deployBuildJobId('dep-1'));
    expect(deployBuildJobId('dep-1')).not.toBe(deployBuildJobId('dep-2'));
    expect(deployBuildJobId('dep-1')).toBe(`${DEPLOY_BUILD_JOB}-dep-1`);
  });

  it('embeds the deployment id so the reaper/worker can trace it back', () => {
    expect(deployBuildJobId('cmrcxkn0r000r0mdbcdda7eca')).toContain('cmrcxkn0r000r0mdbcdda7eca');
  });

  it('gives REDEPLOY a stable id distinct from a retained CREATE job for the same deployment', () => {
    const createJob = deployBuildJobId('dep-reserved');
    const firstRedeploy = deployBuildJobId('dep-reserved', 'reserved:redeploy.operation-0001');
    const replay = deployBuildJobId('dep-reserved', 'reserved:redeploy.operation-0001');
    const nextRedeploy = deployBuildJobId('dep-reserved', 'reserved:redeploy.operation-0002');

    expect(firstRedeploy).toBe(replay);
    expect(firstRedeploy).not.toBe(createJob);
    expect(nextRedeploy).not.toBe(firstRedeploy);
    expect(firstRedeploy).not.toContain(':');
  });
});
