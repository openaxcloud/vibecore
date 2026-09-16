import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    /*
     * Two suites now hit the SAME real WorkspaceRuntime table when DATABASE_URL is set
     * (prisma-store.spec.ts and purge-fence-cas.integration.spec.ts). prisma-store's
     * list() test derives "the rows I just inserted" by diffing the whole table around
     * its own inserts, so a second file inserting concurrently gets counted as its own
     * and the assertion fails. Run spec files one at a time rather than loosening
     * either test — the whole suite is well under a second.
     */
    fileParallelism: false,
    // No real agent Service exists in unit tests, so disable the start-time
    // agent-reachability probe (manager.waitForAgentReachable) — otherwise every
    // startWorkspace() would block on a real fetch that can only time out.
    env: {
      WORKSPACE_AGENT_REACHABLE_TIMEOUT_MS: '0',
      // Likewise disable the GC busy-probe's real fetch (manager.isAgentBusy):
      // there is no agent Service in unit tests, so <=0 short-circuits it to
      // "not busy". Tests that exercise the busy gate spy isAgentBusy directly.
      WORKSPACE_AGENT_BUSY_PROBE_TIMEOUT_MS: '0',
    },
  },
});
