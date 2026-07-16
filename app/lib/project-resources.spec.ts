import { describe, expect, it } from 'vitest';
import { formatProjectResourceBytes, projectResourcesUrl, resolveProjectResources } from './project-resources';

describe('project resources', () => {
  it('builds the existing monitoring endpoint with an encoded workspace selection', () => {
    expect(projectResourcesUrl('project/one', 'workspace two')).toBe(
      '/api/projects/project%2Fone/ide-panel/monitoring?workspaceId=workspace%20two',
    );
  });

  it('derives storage only from measured file sizes and leaves missing telemetry unavailable', () => {
    const snapshot = resolveProjectResources({
      panel: 'monitoring',
      status: 'ok',
      data: {
        selectedWorkspaceId: 'workspace_1',
        runtimeStatus: { id: 'workspace_1', status: 'running' },
        files: [
          { path: 'src/App.tsx', sizeBytes: 1024 },
          { path: 'package.json', sizeBytes: 512 },
        ],
      },
    });

    expect(snapshot.runtimeStatus).toBe('Running');
    expect(snapshot.workspaceId).toBe('workspace_1');
    expect(snapshot.metrics[0]).toMatchObject({ label: 'CPU', availability: 'unavailable', value: 'Unavailable' });
    expect(snapshot.metrics[1]).toMatchObject({ label: 'RAM', availability: 'unavailable', value: 'Unavailable' });
    expect(snapshot.metrics[2]).toMatchObject({
      label: 'Storage',
      availability: 'available',
      value: '1.5 KB',
      measuredBytes: 1536,
    });
    expect(snapshot.metrics[2].detail).toContain('2 indexed project files');
    expect(snapshot.metrics[2].detail).toContain('capacity is not exposed');
  });

  it('uses explicit live runtime telemetry for CPU, RAM, storage and their reported limits', () => {
    const snapshot = resolveProjectResources({
      panel: 'monitoring',
      status: 'ok',
      data: {
        runtimeStatus: {
          id: 'workspace_live',
          status: 'running',
          metadata: {
            managerWorkspace: {
              metrics: {
                cpu: { usageMillicores: '375', limitCores: 1 },
                memory: { workingSetBytes: '268435456', limitBytes: 1024 ** 3 },
                storage: { usedBytes: 1.5 * 1024 ** 3, capacityBytes: 10 * 1024 ** 3 },
              },
            },
          },
        },
        files: [{ path: 'smaller-fallback.txt', sizeBytes: 12 }],
      },
    });

    expect(snapshot.metrics[0]).toMatchObject({
      availability: 'available',
      value: '375 mCPU',
      measuredMillicores: 375,
    });
    expect(snapshot.metrics[0].detail).toContain('Runtime-reported limit: 1 CPU');
    expect(snapshot.metrics[1]).toMatchObject({
      availability: 'available',
      value: '256 MB / 1 GB',
      measuredBytes: 256 * 1024 ** 2,
    });
    expect(snapshot.metrics[1].detail).toBe('25% of the runtime-reported RAM limit.');
    expect(snapshot.metrics[2]).toMatchObject({
      availability: 'available',
      value: '1.5 GB / 10 GB',
      measuredBytes: 1.5 * 1024 ** 3,
    });
    expect(snapshot.metrics[2].detail).toBe('15% of the runtime-reported Storage limit.');
  });

  it('accepts explicit percentage telemetry without inventing byte or core values', () => {
    const snapshot = resolveProjectResources({
      panel: 'monitoring',
      status: 'ok',
      data: {
        resourceUsage: {
          cpuUsagePercent: '42.25%',
          memoryUsagePercent: '31.5',
          storageUsagePercent: 8,
        },
      },
    });

    expect(snapshot.metrics[0]).toMatchObject({
      availability: 'available',
      value: '42.3%',
      measuredPercentage: 42.25,
    });
    expect(snapshot.metrics[1]).toMatchObject({
      availability: 'available',
      value: '31.5%',
      measuredPercentage: 31.5,
    });
    expect(snapshot.metrics[2]).toMatchObject({
      availability: 'available',
      value: '8%',
      measuredPercentage: 8,
    });
  });

  it('parses explicit IEC byte units while retaining the measured byte count', () => {
    const snapshot = resolveProjectResources({
      panel: 'monitoring',
      status: 'ok',
      data: {
        telemetry: {
          memory: { usageBytes: '1.5 MiB', capacityBytes: '2 GiB' },
          disk: { usageBytes: '750 MiB' },
        },
      },
    });

    expect(snapshot.metrics[1]).toMatchObject({
      availability: 'available',
      value: '1.5 MB / 2 GB',
      measuredBytes: 1.5 * 1024 ** 2,
    });
    expect(snapshot.metrics[2]).toMatchObject({
      availability: 'available',
      value: '750 MB',
      measuredBytes: 750 * 1024 ** 2,
    });
  });

  it('parses scoped runtime quantity fields without confusing limits for usage', () => {
    const snapshot = resolveProjectResources({
      panel: 'monitoring',
      status: 'ok',
      data: {
        runtimeStatus: {
          status: 'running',
          metrics: {
            cpu: { usage: '250m', limit: '2 CPU' },
            memory: { usage: '512Mi', limit: '1Gi' },
            filesystem: { used: '2.5Gi', capacity: '20Gi' },
          },
        },
      },
    });

    expect(snapshot.metrics[0]).toMatchObject({
      availability: 'available',
      value: '250 mCPU',
      measuredMillicores: 250,
    });
    expect(snapshot.metrics[0].detail).toContain('Runtime-reported limit: 2 CPUs');
    expect(snapshot.metrics[1]).toMatchObject({
      availability: 'available',
      value: '512 MB / 1 GB',
      measuredBytes: 512 * 1024 ** 2,
    });
    expect(snapshot.metrics[2]).toMatchObject({
      availability: 'available',
      value: '2.5 GB / 20 GB',
      measuredBytes: 2.5 * 1024 ** 3,
    });
  });

  it('preserves decimal versus binary byte units and does not round tiny CPU use down to zero', () => {
    const snapshot = resolveProjectResources({
      panel: 'monitoring',
      status: 'ok',
      data: {
        metrics: {
          cpu: { usageNanoCores: 1 },
          memory: { usage: '1MB' },
          storage: { usage: '1MiB' },
        },
      },
    });

    expect(snapshot.metrics[0]).toMatchObject({
      availability: 'available',
      value: '<0.01 mCPU',
      measuredMillicores: 0.000001,
    });
    expect(snapshot.metrics[1]).toMatchObject({
      availability: 'available',
      measuredBytes: 1_000_000,
    });
    expect(snapshot.metrics[2]).toMatchObject({
      availability: 'available',
      measuredBytes: 1_048_576,
    });
  });

  it('never treats configured limits, plan resources or unscoped values as live usage', () => {
    const snapshot = resolveProjectResources({
      panel: 'monitoring',
      status: 'ok',
      data: {
        plan: 'enterprise',
        resources: {
          cpu: { limitCores: 8 },
          memory: { limitBytes: 32 * 1024 ** 3 },
          storage: { capacityBytes: 1024 ** 4 },
          usedBytes: 1024,
          usagePercent: 50,
        },
      },
    });

    expect(snapshot.metrics).toEqual([
      expect.objectContaining({ key: 'cpu', availability: 'unavailable', value: 'Unavailable' }),
      expect.objectContaining({ key: 'memory', availability: 'unavailable', value: 'Unavailable' }),
      expect.objectContaining({ key: 'storage', availability: 'unavailable', value: 'Unavailable' }),
    ]);
  });

  it('rejects invalid percentages and unsafe quantities instead of clamping or estimating them', () => {
    const snapshot = resolveProjectResources({
      panel: 'monitoring',
      status: 'ok',
      data: {
        metrics: {
          cpu: { usagePercent: 101 },
          memory: { usedBytes: '9007199254740992 B' },
          storage: { usedBytes: '-1 GiB' },
        },
      },
    });

    expect(snapshot.metrics).toEqual([
      expect.objectContaining({ key: 'cpu', availability: 'unavailable', value: 'Unavailable' }),
      expect.objectContaining({ key: 'memory', availability: 'unavailable', value: 'Unavailable' }),
      expect.objectContaining({ key: 'storage', availability: 'unavailable', value: 'Unavailable' }),
    ]);
  });

  it('does not present a partial storage total when one file has no trustworthy size', () => {
    const snapshot = resolveProjectResources({
      panel: 'monitoring',
      status: 'ok',
      data: { files: [{ path: 'known', sizeBytes: 2048 }, { path: 'unknown' }] },
    });

    expect(snapshot.metrics[2]).toMatchObject({ availability: 'unavailable', value: 'Unavailable' });
  });

  it('surfaces the monitoring envelope error and rejects malformed data', () => {
    expect(() =>
      resolveProjectResources({
        panel: 'monitoring',
        status: 'error',
        data: null,
        error: { message: 'Monitoring backend unavailable' },
      }),
    ).toThrow('Monitoring backend unavailable');
    expect(() => resolveProjectResources({ panel: 'monitoring', status: 'ok', data: null })).toThrow(
      'did not include resource data',
    );
  });

  it('formats measured byte counts without manufacturing precision', () => {
    expect(formatProjectResourceBytes(0)).toBe('0 B');
    expect(formatProjectResourceBytes(1024)).toBe('1 KB');
    expect(formatProjectResourceBytes(10 * 1024 * 1024)).toBe('10 MB');
    expect(() => formatProjectResourceBytes(-1)).toThrow();
  });
});
