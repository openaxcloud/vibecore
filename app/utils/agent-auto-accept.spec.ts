import { describe, expect, it } from 'vitest';
import {
  collectAgentValidationRuns,
  isGreenAgentValidationRun,
  shouldAutoAcceptAgentProposals,
} from './agent-auto-accept';

describe('agent auto-accept guard', () => {
  it('refuses when the setting is disabled', () => {
    expect(
      shouldAutoAcceptAgentProposals({
        autoAcceptEnabled: false,
        diagnosticsErrors: 0,
        backendState: { workflowsState: { runs: [{ workflowName: 'Run Tests', status: 'succeeded' }] } },
      }),
    ).toMatchObject({ ok: false });
  });

  it('refuses when diagnostics still contain errors', () => {
    expect(
      shouldAutoAcceptAgentProposals({
        autoAcceptEnabled: true,
        diagnosticsErrors: 2,
        backendState: { workflowsState: { runs: [{ workflowName: 'Run Tests', status: 'succeeded' }] } },
      }),
    ).toMatchObject({ ok: false, reason: '2 diagnostic error(s) must be fixed first.' });
  });

  it('refuses when no real test run is available', () => {
    expect(
      shouldAutoAcceptAgentProposals({
        autoAcceptEnabled: true,
        diagnosticsErrors: 0,
        backendState: { workflowsState: { runs: [{ workflowName: 'Run development server', status: 'succeeded' }] } },
      }),
    ).toMatchObject({ ok: false });
  });

  it('collects test runs across workflows, terminal scripts and package runs newest-first', () => {
    const runs = collectAgentValidationRuns({
      workflowsState: {
        runs: [
          { workflowName: 'Run Tests', status: 'succeeded', finishedAt: '2026-01-01T10:00:00.000Z' },
          { workflowName: 'Run development server', status: 'succeeded', finishedAt: '2026-01-01T11:00:00.000Z' },
        ],
      },
      terminalState: {
        scriptRuns: [{ name: 'npm test', status: 'failed', finishedAt: '2026-01-01T12:00:00.000Z' }],
      },
      packagesState: {
        runs: [{ name: 'Install packages', status: 'succeeded', finishedAt: '2026-01-01T13:00:00.000Z' }],
      },
    });

    expect(runs.map((run) => run.status)).toEqual(['failed', 'succeeded']);
  });

  it('accepts only after the latest test run is green', () => {
    expect(isGreenAgentValidationRun({ name: 'npm test', status: 'succeeded' })).toBe(true);
    expect(isGreenAgentValidationRun({ name: 'npm test', status: 'failed' })).toBe(false);
    expect(isGreenAgentValidationRun({ name: 'npm test', exitCode: 0 })).toBe(true);

    expect(
      shouldAutoAcceptAgentProposals({
        autoAcceptEnabled: true,
        diagnosticsErrors: 0,
        backendState: {
          terminalState: {
            scriptRuns: [{ name: 'npm test', status: 'succeeded', finishedAt: '2026-01-01T10:00:00.000Z' }],
          },
        },
        requiredAfter: '2026-01-01T09:59:59.000Z',
      }),
    ).toMatchObject({ ok: true, reason: 'Latest test run passed.' });
  });

  it('requires tests to be newer than the pending AI proposals', () => {
    expect(
      shouldAutoAcceptAgentProposals({
        autoAcceptEnabled: true,
        diagnosticsErrors: 0,
        backendState: {
          terminalState: {
            scriptRuns: [{ name: 'npm test', status: 'succeeded', finishedAt: '2026-01-01T10:00:00.000Z' }],
          },
        },
        requiredAfter: '2026-01-01T10:01:00.000Z',
      }),
    ).toMatchObject({
      ok: false,
      reason: 'Run tests again after the latest AI proposal before auto-accept can continue.',
    });
  });
});
