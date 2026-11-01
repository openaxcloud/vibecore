import { describe, expect, it } from 'vitest';
import { evaluateLocalLoadEvidence } from './sustained-load-evidence.js';

function completeFixture() {
  const phases = ['warmup', 'steady', 'pressure', 'recovery'];
  return {
    functionalCompleted: true,
    failures: [] as string[],
    fixtureRowsRemoved: true,
    sourceStable: true,
    routes: phases.flatMap((phase) =>
      [
        'project.read',
        'state.read',
        'state.write',
        'files.write',
        'usage.read',
        'git.status',
        'project.export',
        'quota.denial',
        'tenant.denial',
      ].map((route) => ({ phase, route, count: 20, unexpected: 0, p95Ms: 25 })),
    ),
    metricsByReplica: [
      phases.map((phase) => ({ phase, eventLoopP99Ms: 20 })),
      phases.map((phase) => ({ phase, eventLoopP99Ms: 30 })),
    ],
  };
}
describe('local sustained load evidence verdict', () => {
  it('accepts covered expected refusals alongside successful requests', () => {
    expect(evaluateLocalLoadEvidence(completeFixture())).toMatchObject({
      correctnessPassed: true,
      allProposedObjectivesMet: true,
    });
  });
  it('keeps latency objective failure separate from functional correctness', () => {
    const fixture = completeFixture();
    fixture.routes.find((x) => x.phase === 'pressure' && x.route === 'project.export')!.p95Ms = 1500;
    expect(evaluateLocalLoadEvidence(fixture)).toMatchObject({
      correctnessPassed: true,
      allProposedObjectivesMet: false,
    });
  });
  it.each(['fixtureRowsRemoved', 'sourceStable'] as const)(
    'rejects an incomplete %s after the workload passed',
    (key) => {
      const fixture = completeFixture();
      fixture[key] = false;
      expect(evaluateLocalLoadEvidence(fixture)).toMatchObject({
        correctnessPassed: false,
        allProposedObjectivesMet: false,
      });
    },
  );
  it('rejects a final sampling failure appended after workload completion', () => {
    const fixture = completeFixture();
    fixture.failures.push('INFRASTRUCTURE_SAMPLE_FAILED');
    expect(evaluateLocalLoadEvidence(fixture)).toMatchObject({
      correctnessPassed: false,
      allProposedObjectivesMet: false,
    });
  });
  it('does not certify missing route or replica observations', () => {
    const fixture = completeFixture();
    fixture.routes = fixture.routes.filter((x) => x.route !== 'files.write');
    fixture.metricsByReplica.pop();
    expect(evaluateLocalLoadEvidence(fixture)).toMatchObject({
      correctnessPassed: false,
      allProposedObjectivesMet: false,
    });
  });
  it('rejects unexpected statuses even if the caller forgot to add a failure', () => {
    const fixture = completeFixture();
    fixture.routes[0].unexpected = 1;
    expect(evaluateLocalLoadEvidence(fixture)).toMatchObject({
      correctnessPassed: false,
      allProposedObjectivesMet: false,
    });
  });
});
