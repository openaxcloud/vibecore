import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // No real agent Service exists in unit tests, so disable the start-time
    // agent-reachability probe (manager.waitForAgentReachable) — otherwise every
    // startWorkspace() would block on a real fetch that can only time out.
    env: {
      WORKSPACE_AGENT_REACHABLE_TIMEOUT_MS: '0',
    },
  },
});
