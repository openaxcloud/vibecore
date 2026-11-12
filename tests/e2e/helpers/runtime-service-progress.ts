/** Fixed labels only: never retain locators, URLs, error messages, or user data. */
export const SERVICE_PHASES = [
  'setup',
  'snapshots',
  'publish',
  'library',
  'logs',
  'database',
  'create-secret',
  'activity',
  'secrets-panel',
  'git',
  'service-panels',
  'settings',
  'environment',
  'edit-secret-open-panel',
  'edit-secret-open-menu',
  'edit-secret-select-edit',
  'edit-secret-fill',
  'edit-secret-save',
  'edit-secret-reload',
  'edit-secret-reveal',
  'database-refresh',
  'export',
  'complete',
] as const;
export type ServicePhase = (typeof SERVICE_PHASES)[number];

const LIMIT = 32;

export function createServiceProgress(start: number, budget: () => number, now = Date.now) {
  const events: Array<{ phase: ServicePhase; elapsedMs: number; remainingBudgetEstimateMs: number }> = [];

  let omitted = 0;

  return {
    mark(phase: ServicePhase) {
      // Runtime allowlist also protects callers that do not use TypeScript.
      if (!SERVICE_PHASES.includes(phase)) {
        return;
      }

      if (events.length >= LIMIT) {
        omitted++;
        return;
      }

      const elapsedMs = Math.max(0, Math.round(now() - start));
      events.push({ phase, elapsedMs, remainingBudgetEstimateMs: Math.max(0, Math.round(budget() - elapsedMs)) });
    },
    snapshot() {
      return { events: events.map((event) => ({ ...event })), omitted };
    },
  };
}
