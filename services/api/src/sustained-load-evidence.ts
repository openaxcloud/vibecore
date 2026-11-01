/** Pure receipt checks for the isolated load harness, not production admission policy. */
export interface LocalLoadRouteSummary {
  phase: string;
  route: string;
  count: number;
  unexpected: number;
  p95Ms: number | null;
}
export interface LocalLoadMetric {
  phase: string;
  eventLoopP99Ms: number;
}
export function evaluateLocalLoadEvidence(input: {
  functionalCompleted: boolean;
  failures: readonly string[];
  fixtureRowsRemoved: boolean;
  sourceStable: boolean;
  routes: readonly LocalLoadRouteSummary[];
  metricsByReplica: readonly (readonly LocalLoadMetric[])[];
}) {
  const requiredRoutes = [
    'project.read',
    'state.read',
    'state.write',
    'files.write',
    'usage.read',
    'git.status',
    'project.export',
    'quota.denial',
    'tenant.denial',
  ];
  const phases = ['warmup', 'steady', 'pressure', 'recovery'].map((phase) => {
    const rows = input.routes.filter((row) => row.phase === phase);
    const missingRoutes = requiredRoutes.filter((route) => !rows.some((row) => row.route === route && row.count > 0));
    const replicaMetrics = input.metricsByReplica.map((metrics) => metrics.filter((row) => row.phase === phase));

    const complete =
      missingRoutes.length === 0 && replicaMetrics.length === 2 && replicaMetrics.every((rows) => rows.length > 0);
    const routeObjectives = rows.map((row) => {
      const targetMs = ['git.status', 'project.export'].includes(row.route) ? 1500 : 500;
      return {
        route: row.route,
        p95Ms: row.p95Ms,
        targetMs,
        met: row.p95Ms !== null && Number.isFinite(row.p95Ms) && row.p95Ms >= 0 && row.p95Ms < targetMs,
      };
    });

    const eventLoopP99MaxMs = Math.max(...replicaMetrics.flat().map((row) => row.eventLoopP99Ms));
    const eventLoopMet = Number.isFinite(eventLoopP99MaxMs) && eventLoopP99MaxMs >= 0 && eventLoopP99MaxMs < 100;

    return {
      phase,
      complete,
      missingRoutes,
      routeObjectives,
      eventLoopP99MaxMs: Number.isFinite(eventLoopP99MaxMs) ? eventLoopP99MaxMs : null,
      eventLoopTargetMs: 100,
      eventLoopMet,
      met: complete && routeObjectives.every((row) => row.met) && eventLoopMet,
    };
  });

  const correctnessPassed =
    input.functionalCompleted &&
    input.failures.length === 0 &&
    input.fixtureRowsRemoved &&
    input.sourceStable &&
    input.routes.every((row) => row.unexpected === 0) &&
    phases.every((phase) => phase.complete);

  return {
    correctnessPassed,
    allProposedObjectivesMet: correctnessPassed && phases.every((phase) => phase.met),
    phaseObjectives: phases,
  };
}
