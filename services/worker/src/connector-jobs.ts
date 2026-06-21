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
  userId?: string;
  user?: { memberships: { organizationId: string }[] } | null;
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
        OR: [{ lastHealthCheckAt: null }, { lastHealthCheckAt: { lt: Date } }];
        provider: { in: string[] };
      };
      take: number;
      orderBy: { lastHealthCheckAt: { sort: 'asc'; nulls: 'first' } };
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
      include: { userConnection: { include: { user: { include: { memberships: true } } } } };
    }): Promise<ConnectorJobsReconnectionAlert[]>;
    update(args: { where: { id: string }; data: { notifiedAt: Date } }): Promise<unknown>;
  };
  auditLog: {
    create(args: {
      data: {
        organizationId?: string;
        actorUserId?: string;
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
      // Drive the sweep off a dedicated lastHealthCheckAt cursor, NOT the
      // user-facing lastUsedAt — reusing lastUsedAt overwrote it every 30 min,
      // so "last used" became meaningless and real-usage ordering was lost.
      OR: [{ lastHealthCheckAt: null }, { lastHealthCheckAt: { lt: cutoff } }],
      provider: { in: Object.keys(PROVIDER_PING_TARGETS) },
    },
    take: maxConnections,
    orderBy: { lastHealthCheckAt: { sort: 'asc', nulls: 'first' } },
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
      /*
       * Bump the health-check cursor even on failure. Previously only success
       * advanced lastHealthCheckAt, so during a provider outage the failing
       * connections stayed at the front of the (oldest-first) queue and every
       * tick re-checked the same first `maxConnections`, permanently starving the
       * rest. Advancing on failure rotates them to the back; a degraded provider
       * is retried on the next full sweep cycle instead of blocking everyone.
       */
      await input.prisma.userConnection
        .update({ where: { id: connection.id }, data: { lastHealthCheckAt: now } })
        .catch(() => {});
      unreachable += 1;
      continue;
    }

    // This check only inspects the status code; the body is never read, so drain
    // it once here to release the connection on every branch below instead of
    // leaking a socket per scanned connection.
    const rateLimited =
      response.status === 429 ||
      response.headers.get('x-ratelimit-remaining') === '0' ||
      response.headers.get('retry-after') !== null;

    await response.body?.cancel().catch(() => {});

    /*
     * Only 401 is an unambiguous revoked/expired credential. A 403 frequently
     * means rate-limit (GitHub returns 403 with x-ratelimit-remaining:0), scope,
     * or per-resource policy — NOT a dead token. Flipping a valid connection to
     * needs_reconnect on a 403 would force needless re-auth and noisy alerts, so we
     * deliberately treat ALL 403s as non-credential: rate-limited responses are
     * skipped as transient (below) and any other 403 falls through untouched. Only
     * a 401 marks the connection needs_reconnect.
     */
    if (rateLimited) {
      await input.prisma.userConnection
        .update({ where: { id: connection.id }, data: { lastHealthCheckAt: now } })
        .catch(() => {});
      continue;
    }

    if (response.status === 401) {
      /*
       * Guard the token-revoked DB writes like every other branch in this loop
       * (.catch(() => {})). These were the ONE unguarded set, so a transient DB
       * error on a single connection threw out of the loop and aborted the entire
       * sweep, leaving all later connections unchecked.
       */
      try {
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
      } catch {
        // One connection's DB error must not abort the whole sweep.
      }

      continue;
    }

    /*
     * Bump lastHealthCheckAt on every checked connection (success or transient
     * non-2xx) so the oldest-first cursor advances and the sweep makes progress
     * through ALL connections over successive ticks rather than re-checking the
     * same failing first `maxConnections` forever. lastUsedAt is left untouched —
     * it reflects real user usage only.
     */
    if (!response.ok) {
      unreachable += 1;
    }

    await input.prisma.userConnection
      .update({ where: { id: connection.id }, data: { lastHealthCheckAt: now } })
      .catch(() => {});
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
    include: { userConnection: { include: { user: { include: { memberships: true } } } } },
  });

  let notified = 0;

  for (const alert of alerts) {
    if (!alert.userConnection) {
      /*
       * Nothing to notify against — mark it handled so it isn't re-scanned. Guard
       * the write: an unhandled error here would abort the whole sweep and starve
       * every remaining alert. Leaving notifiedAt null on failure just retries it
       * next sweep.
       */
      try {
        await input.prisma.reconnectionAlert.update({
          where: { id: alert.id },
          data: { notifiedAt: now },
        });
      } catch {
        // Skip this orphan alert; the next sweep will retry it.
      }

      continue;
    }

    /*
     * Write the notification artifact FIRST, then stamp notifiedAt only on
     * success. Previously notifiedAt was set before the audit insert and the
     * failure was swallowed — so a single transient audit-table error
     * permanently dropped that user's reconnect notification (the alert was
     * marked notified but nothing was ever delivered). Leaving notifiedAt null
     * on failure lets the next sweep retry it (idempotent — alert still open).
     */
    /*
     * Stamp the user's organization (and the user as actor) on the audit row.
     * Without organizationId the SIEM webhook delivery query (which is org-scoped)
     * never matches, so reconnect notifications silently never reach SIEM. The
     * connector is user-scoped; use the user's first membership as the owning org.
     */
    const organizationId = alert.userConnection.user?.memberships?.[0]?.organizationId;

    try {
      await input.prisma.auditLog.create({
        data: {
          organizationId,
          actorUserId: alert.userConnection.userId,
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

      await input.prisma.reconnectionAlert.update({
        where: { id: alert.id },
        data: { notifiedAt: now },
      });

      notified += 1;
    } catch {
      // Retry on the next sweep rather than silently losing the notification.
    }
  }

  return {
    scanned: alerts.length,
    notified,
  };
}
