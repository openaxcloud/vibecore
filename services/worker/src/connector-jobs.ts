import { decryptJson } from '@vibecore/security';

/*
 * Periodic workers for connector connections.
 *
 * runConnectorTokenHealthCheck:
 *   Walks every active UserConnection that has not been pinged within
 *   the staleness window and calls a lightweight provider endpoint
 *   (e.g. https://api.github.com/user) with the decrypted token. A 401
 *   or 403 flips the connection to needs_reconnect and inserts a
 *   ReconnectionAlert so the chat banner appears the next time the
 *   builder loads the panel. The worker is bounded by maxConnections
 *   so a sweep cannot exceed the worker's tick budget; the unscanned
 *   tail picks up next time.
 *
 * runConnectorReconnectionNotifier:
 *   Walks open ReconnectionAlert rows (resolvedAt null, notifiedAt
 *   null) and stamps notifiedAt, writes an AuditLog row with action
 *   connector.oauth.<provider>.needs_reconnect.notify so the existing
 *   SiemWebhook delivery pipeline can fan it out to enterprise
 *   customers. In-app surfacing is the responsibility of the chat
 *   client; the worker only flips the alert state and emits the
 *   audit record.
 */

interface ProviderPingTarget {
  url: string;
  authHeader: (token: string) => string;
}

interface ConnectorJobsUserConnection {
  id: string;
  provider: string;
  accessTokenEncrypted: string | null;
  externalAccountLabel: string | null;
}

interface ConnectorJobsReconnectionAlert {
  id: string;
  reason: string;
  detectedAt: Date;
  userConnection: ConnectorJobsUserConnection | null;
}

interface ConnectorJobsDatabase {
  userConnection: {
    findMany(args: {
      where: {
        status: 'active';
        forAgentUse: true;
        OR: [{ lastUsedAt: null }, { lastUsedAt: { lt: Date } }];
        provider: { in: string[] };
      };
      take: number;
      orderBy: { lastUsedAt: { sort: 'asc'; nulls: 'first' } };
    }): Promise<ConnectorJobsUserConnection[]>;
    update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<unknown>;
  };
  reconnectionAlert: {
    findFirst(args: { where: { userConnectionId: string; resolvedAt: null } }): Promise<unknown | null>;
    create(args: { data: { userConnectionId: string; reason: 'token_revoked' } }): Promise<unknown>;
    findMany(args: {
      where: { resolvedAt: null; notifiedAt: null };
      take: number;
      orderBy: { detectedAt: 'asc' };
      include: { userConnection: true };
    }): Promise<ConnectorJobsReconnectionAlert[]>;
    update(args: { where: { id: string }; data: { notifiedAt: Date } }): Promise<unknown>;
  };
  auditLog: {
    create(args: {
      data: {
        action: string;
        resourceType: 'UserConnection';
        resourceId: string;
        metadata: {
          reason: string;
          detectedAt: string;
          accountLabel: string | null;
        };
      };
    }): Promise<unknown>;
  };
}

const PROVIDER_PING_TARGETS: Record<string, ProviderPingTarget> = {
  github: {
    url: 'https://api.github.com/user',
    authHeader: (token) => `token ${token}`,
  },
};

export const DEFAULT_HEALTH_CHECK_STALENESS_MS = 30 * 60 * 1000;
export const DEFAULT_HEALTH_CHECK_MAX_CONNECTIONS = 50;

export interface ConnectorTokenHealthCheckInput {
  prisma: ConnectorJobsDatabase;
  now?: Date;
  stalenessMs?: number;
  maxConnections?: number;
  fetchImpl?: typeof fetch;
}

export interface ConnectorTokenHealthCheckResult {
  scanned: number;
  flaggedReconnect: number;
  unreachable: number;
  skipped: number;
}

export async function runConnectorTokenHealthCheck(
  input: ConnectorTokenHealthCheckInput,
): Promise<ConnectorTokenHealthCheckResult> {
  const now = input.now ?? new Date();
  const stalenessMs = input.stalenessMs ?? DEFAULT_HEALTH_CHECK_STALENESS_MS;
  const maxConnections = input.maxConnections ?? DEFAULT_HEALTH_CHECK_MAX_CONNECTIONS;
  const fetchImpl = input.fetchImpl ?? fetch;
  const cutoff = new Date(now.getTime() - stalenessMs);

  const candidates = await input.prisma.userConnection.findMany({
    where: {
      status: 'active',
      forAgentUse: true,
      OR: [{ lastUsedAt: null }, { lastUsedAt: { lt: cutoff } }],
      provider: { in: Object.keys(PROVIDER_PING_TARGETS) },
    },
    take: maxConnections,
    orderBy: { lastUsedAt: { sort: 'asc', nulls: 'first' } },
  });

  let flaggedReconnect = 0;
  let unreachable = 0;
  let skipped = 0;

  for (const connection of candidates) {
    const target = PROVIDER_PING_TARGETS[connection.provider];

    if (!target) {
      skipped += 1;
      continue;
    }

    if (!connection.accessTokenEncrypted) {
      skipped += 1;
      continue;
    }

    let token: string;

    try {
      token = decryptJson<{ value: string }>(connection.accessTokenEncrypted).value;
    } catch {
      skipped += 1;
      continue;
    }

    let response: Response;

    try {
      response = await fetchImpl(target.url, {
        method: 'GET',
        headers: {
          authorization: target.authHeader(token),
          'user-agent': 'e-code-token-health-check',
          accept: 'application/vnd.github+json',
          'x-github-api-version': '2022-11-28',
        },
        // The candidates are checked serially; without a timeout a single hung
        // provider connection stalls the whole sweep (and the worker tick)
        // indefinitely. Treat a slow/hung call as unreachable and move on.
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      unreachable += 1;
      continue;
    }

    // This check only inspects the status code; the body is never read, so drain
    // it once here to release the connection on every branch below instead of
    // leaking a socket per scanned connection.
    await response.body?.cancel().catch(() => {});

    if (response.status === 401 || response.status === 403) {
      await input.prisma.userConnection.update({
        where: { id: connection.id },
        data: { status: 'needs_reconnect' },
      });

      /*
       * Skip when an unresolved alert already exists so the notifier
       * does not double-fire on the same connection.
       */
      const existing = await input.prisma.reconnectionAlert.findFirst({
        where: { userConnectionId: connection.id, resolvedAt: null },
      });

      if (!existing) {
        await input.prisma.reconnectionAlert.create({
          data: {
            userConnectionId: connection.id,
            reason: 'token_revoked',
          },
        });
      }

      flaggedReconnect += 1;
      continue;
    }

    /*
     * Any other non-2xx is treated as a transient upstream blip; the
     * sweep retries on the next tick. lastUsedAt is bumped only on
     * success so a degraded provider stays at the front of the queue.
     */
    if (response.ok) {
      await input.prisma.userConnection.update({
        where: { id: connection.id },
        data: { lastUsedAt: now },
      });
    } else {
      unreachable += 1;
    }
  }

  return {
    scanned: candidates.length,
    flaggedReconnect,
    unreachable,
    skipped,
  };
}

export interface ConnectorReconnectionNotifierInput {
  prisma: ConnectorJobsDatabase;
  now?: Date;
  maxAlerts?: number;
}

export interface ConnectorReconnectionNotifierResult {
  scanned: number;
  notified: number;
}

export const DEFAULT_NOTIFIER_MAX_ALERTS = 100;

export async function runConnectorReconnectionNotifier(
  input: ConnectorReconnectionNotifierInput,
): Promise<ConnectorReconnectionNotifierResult> {
  const now = input.now ?? new Date();
  const maxAlerts = input.maxAlerts ?? DEFAULT_NOTIFIER_MAX_ALERTS;

  const alerts = await input.prisma.reconnectionAlert.findMany({
    where: { resolvedAt: null, notifiedAt: null },
    take: maxAlerts,
    orderBy: { detectedAt: 'asc' },
    include: { userConnection: true },
  });

  let notified = 0;

  for (const alert of alerts) {
    await input.prisma.reconnectionAlert.update({
      where: { id: alert.id },
      data: { notifiedAt: now },
    });

    if (!alert.userConnection) {
      continue;
    }

    /*
     * Best-effort audit log entry; the existing SIEM webhook delivery
     * worker picks the row up on its next sweep.
     */
    try {
      await input.prisma.auditLog.create({
        data: {
          action: `connector.oauth.${alert.userConnection.provider}.needs_reconnect.notify`,
          resourceType: 'UserConnection',
          resourceId: alert.userConnection.id,
          metadata: {
            reason: alert.reason,
            detectedAt: alert.detectedAt.toISOString(),
            accountLabel: alert.userConnection.externalAccountLabel,
          },
        },
      });
    } catch {
      /*
       * Even when the audit insert fails (table contention, FK race) we
       * do not roll back notifiedAt; the notification still ran.
       */
    }

    notified += 1;
  }

  return {
    scanned: alerts.length,
    notified,
  };
}
