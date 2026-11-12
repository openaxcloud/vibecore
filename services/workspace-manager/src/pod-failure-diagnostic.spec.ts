import { describe, expect, it } from 'vitest';
import { podFailureDiagnostic } from './pod-failure-diagnostic.js';

describe('bounded pod failure diagnostics', () => {
  it('retains OOM and prior termination even when the pod phase is already Failed', () => {
    expect(
      podFailureDiagnostic({
        metadata: { deletionTimestamp: '2026-11-09T11:41:53Z' },
        status: {
          phase: 'Failed',
          reason: 'Evicted',
          containerStatuses: [
            {
              restartCount: 2,
              state: { terminated: { reason: 'OOMKilled', exitCode: 137, signal: 9 } },
              lastState: { terminated: { reason: 'Error', exitCode: 143, signal: 15 } },
            },
          ],
        },
      }),
    ).toEqual({
      phase: 'Failed',
      reason: 'Evicted',
      deletionTimestampPresent: true,
      omittedContainers: 0,
      containers: [
        {
          restartCount: 2,
          current: { state: 'terminated', reason: 'OOMKilled', exitCode: 137, signal: 9 },
          previous: { state: 'terminated', reason: 'Error', exitCode: 143, signal: 15 },
        },
      ],
    });
  });

  it.each(['Completed', 'ContainerCannotRun', 'ContainerStatusUnknown', 'StartError'])(
    'preserves the fixed termination reason %s without inferring the initiator',
    (reason) => {
      const result = podFailureDiagnostic({
        status: { containerStatuses: [{ state: { terminated: { reason, exitCode: 0, signal: 0 } } }] },
      });
      expect(result.deletionTimestampPresent).toBe(false);
      expect(result.containers[0].current).toEqual({ state: 'terminated', reason, exitCode: 0, signal: 0 });
      expect(result).not.toHaveProperty('requestedStop');
    },
  );

  it('distinguishes running, waiting and absent states', () => {
    const result = podFailureDiagnostic({
      status: {
        phase: 'Pending',
        containerStatuses: [
          { state: { waiting: { reason: 'CrashLoopBackOff' } }, lastState: { terminated: { reason: 'Error' } } },
          { state: { running: { startedAt: 'PRIVATE' } } },
          null,
        ],
      },
    });
    expect(result.containers.map((container) => container.current.state)).toEqual(['waiting', 'running', 'absent']);
    expect(result.containers[0].current.reason).toBe('CrashLoopBackOff');
    expect(result.containers[0].previous.reason).toBe('Error');
    expect(JSON.stringify(result)).not.toContain('PRIVATE');
  });

  it.each([undefined, null, [], 'PRIVATE', { status: { containerStatuses: 'PRIVATE' } }])(
    'handles absent or malformed pod data without copying it: %j',
    (value) => {
      expect(podFailureDiagnostic(value)).toEqual({
        phase: 'absent',
        reason: 'absent',
        deletionTimestampPresent: false,
        omittedContainers: 0,
        containers: [],
      });
    },
  );

  it.each([NaN, Infinity, -Infinity, 1.5, '137', {}, 2147483648, -2147483649])(
    'rejects invalid termination numbers: %j',
    (value) => {
      const result = podFailureDiagnostic({
        status: {
          containerStatuses: [{ restartCount: value, state: { terminated: { exitCode: value, signal: value } } }],
        },
      });
      expect(result.containers[0].restartCount).toBeNull();
      expect(result.containers[0].current.exitCode).toBeNull();
      expect(result.containers[0].current.signal).toBeNull();
    },
  );

  it('bounds exit codes, signals and restart counts independently', () => {
    const result = podFailureDiagnostic({
      status: {
        containerStatuses: [
          { restartCount: -1, state: { terminated: { exitCode: -2147483648, signal: -1 } } },
          { restartCount: 2147483647, state: { terminated: { exitCode: 2147483647, signal: 64 } } },
          { restartCount: 0, state: { terminated: { exitCode: 0, signal: 65 } } },
        ],
      },
    });
    expect(result.containers.map((container) => container.restartCount)).toEqual([null, 2147483647, 0]);
    expect(result.containers.map((container) => container.current.exitCode)).toEqual([-2147483648, 2147483647, 0]);
    expect(result.containers.map((container) => container.current.signal)).toEqual([null, 64, null]);
  });

  it('never retains IDs, names, arbitrary reasons, messages, environment, specs or logs', () => {
    const result = podFailureDiagnostic({
      metadata: { uid: 'PRIVATE', name: 'PRIVATE', deletionTimestamp: 'PRIVATE', annotations: { token: 'PRIVATE' } },
      spec: { containers: [{ env: [{ value: 'PRIVATE' }] }] },
      logs: 'PRIVATE',
      status: {
        phase: 'PRIVATE',
        reason: 'PRIVATE',
        message: 'PRIVATE',
        containerStatuses: [
          {
            name: 'PRIVATE',
            containerID: 'PRIVATE',
            image: 'PRIVATE',
            state: { terminated: { reason: 'PRIVATE', message: 'PRIVATE', containerID: 'PRIVATE' } },
            lastState: { waiting: { reason: 'PRIVATE', message: 'PRIVATE' } },
          },
        ],
      },
    });
    expect(result.phase).toBe('other');
    expect(result.reason).toBe('other');
    expect(result.containers[0].current.reason).toBe('other');
    expect(result.containers[0].previous.reason).toBe('other');
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE|containerID|annotations|message|spec|env|logs|name|uid/);
  });

  it('caps large input at four containers and the complete log record at 4 KiB', () => {
    const container = {
      restartCount: 2147483647,
      state: { terminated: { reason: 'CreateContainerConfigError', exitCode: -2147483648, signal: 64 } },
      lastState: { terminated: { reason: 'CreateContainerConfigError', exitCode: -2147483648, signal: 64 } },
      message: 'PRIVATE'.repeat(10000),
    };
    const result = podFailureDiagnostic({
      status: {
        phase: 'Succeeded',
        reason: 'UnexpectedAdmissionError',
        containerStatuses: Array(10000).fill(container),
      },
    });
    expect(result.containers).toHaveLength(4);
    expect(result.omittedContainers).toBe(9996);

    const record = {
      level: 'warn',
      service: 'workspace-manager',
      event: 'workspace.pod.terminal_failure',
      timestamp: new Date(0).toISOString(),
      ...result,
    };
    expect(Buffer.byteLength(JSON.stringify(record))).toBeLessThanOrEqual(4096);
    expect(JSON.stringify(record)).not.toContain('PRIVATE');
  });
});
