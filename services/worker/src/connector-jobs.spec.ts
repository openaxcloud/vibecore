import { encryptJson } from '@vibecore/security';
import { describe, expect, it, vi } from 'vitest';
import {
  resolveReconnectAlertOrganizationId,
  runConnectorReconnectionNotifier,
  runConnectorTokenHealthCheck,
} from './connector-jobs.js';

interface RecordedConnection {
  id: string;
  provider: string;
  userId: string;
  status: 'active' | 'needs_reconnect' | 'revoked';
  forAgentUse: boolean;
  accessTokenEncrypted: string | null;
  lastUsedAt: Date | null;
  lastHealthCheckAt?: Date | null;
  externalAccountLabel: string;
  user?: { memberships?: Array<{ organizationId: string }> };
}

interface RecordedAlert {
  id: string;
  userConnectionId: string;
  reason: string;
  detectedAt: Date;
  resolvedAt: Date | null;
  notifiedAt: Date | null;
  userConnection?: RecordedConnection;
}

interface RecordedAuditLog {
  action: string;
  resourceType?: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
}

function buildRecorder(
  initial: {
    connections?: RecordedConnection[];
    alerts?: RecordedAlert[];
  } = {},
) {
  const state = {
    connections: [...(initial.connections ?? [])],
    alerts: [...(initial.alerts ?? [])],
    auditLogs: [] as RecordedAuditLog[],
    notifications: [] as Array<Record<string, unknown>>,
  };

  const prisma = {
    userConnection: {
      findMany: async ({ take, where }: any) => {
        const allowedProviders: string[] = where?.provider?.in ?? [];
        const stalenessCutoff: Date | undefined = where?.OR?.[1]?.lastHealthCheckAt?.lt;

        return state.connections
          .filter((row) => {
            if (where?.status && row.status !== where.status) {
              return false;
            }

            if (where?.forAgentUse !== undefined && row.forAgentUse !== where.forAgentUse) {
              return false;
            }

            if (allowedProviders.length > 0 && !allowedProviders.includes(row.provider)) {
              return false;
            }

            if (stalenessCutoff && row.lastHealthCheckAt && row.lastHealthCheckAt >= stalenessCutoff) {
              return false;
            }

            return true;
          })
          .slice(0, take);
      },
      update: async ({ where, data }: any) => {
        const row = state.connections.find((entry) => entry.id === where.id);

        if (!row) {
          throw new Error(`UserConnection ${where.id} not found`);
        }

        Object.assign(row, data);

        return row;
      },
    },
    reconnectionAlert: {
      findFirst: async ({ where }: any) => {
        return state.alerts.find(
          (alert) =>
            alert.userConnectionId === where.userConnectionId &&
            (where.resolvedAt === null ? alert.resolvedAt === null : true),
        );
      },
      create: async ({ data }: any) => {
        const alert: RecordedAlert = {
          id: `alrt_${state.alerts.length + 1}`,
          userConnectionId: data.userConnectionId,
          reason: data.reason,
          detectedAt: new Date(),
          resolvedAt: null,
          notifiedAt: null,
        };
        state.alerts.push(alert);

        return alert;
      },
      findMany: async ({ where, take }: any) => {
        return state.alerts
          .filter((alert) => {
            if (where?.resolvedAt === null && alert.resolvedAt !== null) {
              return false;
            }

            if (where?.notifiedAt === null && alert.notifiedAt !== null) {
              return false;
            }

            return true;
          })
          .slice(0, take);
      },
      update: async ({ where, data }: any) => {
        const alert = state.alerts.find((entry) => entry.id === where.id);

        if (!alert) {
          throw new Error(`ReconnectionAlert ${where.id} not found`);
        }

        Object.assign(alert, data);

        return alert;
      },
    },
    auditLog: {
      create: async ({ data }: any) => {
        state.auditLogs.push(data);

        return data;
      },
    },
    notification: {
      create: async ({ data }: any) => {
        state.notifications.push(data);

        return data;
      },
    },
  };

  return { prisma, state };
}

describe('runConnectorTokenHealthCheck', () => {
  it('marks a connection as needs_reconnect and creates an alert on 401 from the provider', async () => {
    const encrypted = encryptJson({ value: 'revoked-token' });

    const { prisma, state } = buildRecorder({
      connections: [
        {
          id: 'uconn_1',
          provider: 'github',
          userId: 'user_1',
          status: 'active',
          forAgentUse: true,
          accessTokenEncrypted: encrypted,
          lastUsedAt: null,
          externalAccountLabel: 'octocat',
        },
      ],
    });

    const fetchImpl = vi.fn(async () => new Response('unauthorized', { status: 401 })) as unknown as typeof fetch;

    process.env.ENCRYPTION_SECRET = process.env.ENCRYPTION_SECRET ?? 'connector-jobs-spec-secret';

    const result = await runConnectorTokenHealthCheck({
      prisma: prisma as any,
      fetchImpl,
      now: new Date('2030-01-01T00:00:00Z'),
    });

    expect(result.scanned).toBe(1);
    expect(result.flaggedReconnect).toBe(1);
    expect(state.connections[0].status).toBe('needs_reconnect');
    expect(state.alerts).toHaveLength(1);
    expect(state.alerts[0].reason).toBe('token_revoked');
    expect(state.notifications).toHaveLength(1);
    expect(state.notifications[0]).toMatchObject({
      messageKey: 'notifications.connectionReconnectRequired',
      messageParams: { provider: 'github', accountLabel: 'octocat' },
      title: 'Reconnect github',
    });
  });

  it('updates lastHealthCheckAt (not lastUsedAt) and leaves status alone on a 200 response', async () => {
    const encrypted = encryptJson({ value: 'live-token' });

    const { prisma, state } = buildRecorder({
      connections: [
        {
          id: 'uconn_2',
          provider: 'github',
          userId: 'user_1',
          status: 'active',
          forAgentUse: true,
          accessTokenEncrypted: encrypted,
          lastUsedAt: null,
          externalAccountLabel: 'octocat',
        },
      ],
    });

    const now = new Date('2030-01-02T12:00:00Z');

    const fetchImpl = vi.fn(
      async () =>
        new Response('{}', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    ) as unknown as typeof fetch;

    process.env.ENCRYPTION_SECRET = process.env.ENCRYPTION_SECRET ?? 'connector-jobs-spec-secret';

    const result = await runConnectorTokenHealthCheck({ prisma: prisma as any, fetchImpl, now });

    expect(result.flaggedReconnect).toBe(0);
    expect(state.connections[0].status).toBe('active');

    // The health-check sweep now writes its own cursor, leaving user-facing lastUsedAt untouched.
    expect(state.connections[0].lastHealthCheckAt).toEqual(now);
    expect(state.connections[0].lastUsedAt).toBeNull();
  });

  it('counts unreachable when the upstream fetch throws', async () => {
    const encrypted = encryptJson({ value: 'transient-token' });

    const { prisma } = buildRecorder({
      connections: [
        {
          id: 'uconn_3',
          provider: 'github',
          userId: 'user_1',
          status: 'active',
          forAgentUse: true,
          accessTokenEncrypted: encrypted,
          lastUsedAt: null,
          externalAccountLabel: 'octocat',
        },
      ],
    });

    const fetchImpl = vi.fn(async () => {
      throw new Error('ECONNRESET');
    }) as unknown as typeof fetch;

    process.env.ENCRYPTION_SECRET = process.env.ENCRYPTION_SECRET ?? 'connector-jobs-spec-secret';

    const result = await runConnectorTokenHealthCheck({ prisma: prisma as any, fetchImpl });

    expect(result.unreachable).toBe(1);
    expect(result.flaggedReconnect).toBe(0);
  });

  it('skips connections with no encrypted token and no provider target', async () => {
    const { prisma } = buildRecorder({
      connections: [
        {
          id: 'uconn_4',
          provider: 'github',
          userId: 'user_1',
          status: 'active',
          forAgentUse: true,
          accessTokenEncrypted: null,
          lastUsedAt: null,
          externalAccountLabel: 'octocat',
        },
      ],
    });

    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 })) as unknown as typeof fetch;
    const result = await runConnectorTokenHealthCheck({ prisma: prisma as any, fetchImpl });

    expect(result.skipped).toBe(1);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('does not create a duplicate alert when one is already open for the connection', async () => {
    const encrypted = encryptJson({ value: 'dup-token' });

    const { prisma, state } = buildRecorder({
      connections: [
        {
          id: 'uconn_5',
          provider: 'github',
          userId: 'user_1',
          status: 'active',
          forAgentUse: true,
          accessTokenEncrypted: encrypted,
          lastUsedAt: null,
          externalAccountLabel: 'octocat',
        },
      ],
      alerts: [
        {
          id: 'alrt_pre',
          userConnectionId: 'uconn_5',
          reason: 'token_revoked',
          detectedAt: new Date('2030-01-01T00:00:00Z'),
          resolvedAt: null,
          notifiedAt: null,
        },
      ],
    });

    const fetchImpl = vi.fn(async () => new Response('unauthorized', { status: 401 })) as unknown as typeof fetch;
    process.env.ENCRYPTION_SECRET = process.env.ENCRYPTION_SECRET ?? 'connector-jobs-spec-secret';

    await runConnectorTokenHealthCheck({ prisma: prisma as any, fetchImpl });

    expect(state.alerts).toHaveLength(1);
  });
});

describe('runConnectorReconnectionNotifier', () => {
  it('stamps notifiedAt and writes an audit log row per alert', async () => {
    const connection: RecordedConnection = {
      id: 'uconn_notify',
      provider: 'github',
      userId: 'user_1',
      status: 'needs_reconnect',
      forAgentUse: true,
      accessTokenEncrypted: null,
      lastUsedAt: null,
      externalAccountLabel: 'octocat',
      user: { memberships: [{ organizationId: 'org_1' }] },
    };
    const { prisma, state } = buildRecorder({
      alerts: [
        {
          id: 'alrt_open',
          userConnectionId: connection.id,
          reason: 'token_revoked',
          detectedAt: new Date('2030-01-01T00:00:00Z'),
          resolvedAt: null,
          notifiedAt: null,
          userConnection: connection,
        },
      ],
    });

    const now = new Date('2030-01-02T00:00:00Z');
    const result = await runConnectorReconnectionNotifier({ prisma: prisma as any, now });

    expect(result.notified).toBe(1);
    expect(state.alerts[0].notifiedAt).toEqual(now);
    expect(state.auditLogs).toHaveLength(1);
    expect(state.auditLogs[0].action).toBe('connector.oauth.github.needs_reconnect.notify');
    expect(state.auditLogs[0].resourceId).toBe(connection.id);
    expect((state.auditLogs[0] as { organizationId?: string }).organizationId).toBe('org_1');
  });

  it('skips an alert (leaving notifiedAt null, no audit row) when the user has no org membership', async () => {
    const connection: RecordedConnection = {
      id: 'uconn_no_org',
      provider: 'github',
      userId: 'user_no_org',
      status: 'needs_reconnect',
      forAgentUse: true,
      accessTokenEncrypted: null,
      lastUsedAt: null,
      externalAccountLabel: 'octocat',
      user: { memberships: [] },
    };
    const { prisma, state } = buildRecorder({
      alerts: [
        {
          id: 'alrt_no_org',
          userConnectionId: connection.id,
          reason: 'token_revoked',
          detectedAt: new Date('2030-01-01T00:00:00Z'),
          resolvedAt: null,
          notifiedAt: null,
          userConnection: connection,
        },
      ],
    });

    const now = new Date('2030-01-02T00:00:00Z');
    const result = await runConnectorReconnectionNotifier({ prisma: prisma as any, now });

    expect(result.notified).toBe(0);
    expect(result.skipped).toBe(1);

    // No unmatchable audit row was written.
    expect(state.auditLogs).toHaveLength(0);

    // Left open so a later sweep retries once the user regains a membership.
    expect(state.alerts[0].notifiedAt).toBeNull();
  });

  it('returns 0 when there is no open unnotified alert', async () => {
    const { prisma } = buildRecorder();
    const result = await runConnectorReconnectionNotifier({ prisma: prisma as any });
    expect(result.notified).toBe(0);
  });
});

describe('resolveReconnectAlertOrganizationId', () => {
  it('returns the first membership organizationId', () => {
    expect(resolveReconnectAlertOrganizationId([{ organizationId: 'org_a' }, { organizationId: 'org_b' }])).toBe(
      'org_a',
    );
  });

  it('returns null for an empty membership list', () => {
    expect(resolveReconnectAlertOrganizationId([])).toBeNull();
  });

  it('returns null when memberships is undefined or null', () => {
    expect(resolveReconnectAlertOrganizationId(undefined)).toBeNull();
    expect(resolveReconnectAlertOrganizationId(null)).toBeNull();
  });
});
