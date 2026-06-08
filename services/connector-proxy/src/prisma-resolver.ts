import { createDatabaseClient, type DatabaseClient } from '@vibecore/database';
import { decryptJson } from '@vibecore/security';
import type { ConnectionResolverInput, ConnectionResolution, ConnectionStatusUpdate } from './app.js';

/**
 * Production resolver used by services/connector-proxy/src/server.ts.
 *
 * Enforces the ACL chain documented in
 * docs/INTEGRATIONS_MASTER_PLAN.md section 5.2 against the live Postgres
 * schema:
 *   1. Workspace ↔ project binding (the connector-sdk access token already
 *      carries projectId; we trust it because the API signed it)
 *   2. UserConnection exists, is active, and the user in the token owns it
 *   3. ProjectConnectionLink exists for (projectId, userConnectionId) and
 *      has not been unlinked
 *   4. OrganizationConnectorPolicy permits the provider for this org (and
 *      does not restrict to a role set the user is missing — role-keys are
 *      compared as a coarse-grained ACL until per-user role-keys ship)
 *   5. UserConnection.forAgentUse is true (Git Providers like the OAuth
 *      flow used for git sync are filtered out)
 *
 * On 401/403 from the provider the reportConnectionFailure helper is
 * called to flip UserConnection.status to needs_reconnect and insert a
 * ReconnectionAlert row.
 */

export interface PrismaResolverDeps {
  prisma?: DatabaseClient;
}

export function createPrismaConnectionResolver(deps: PrismaResolverDeps = {}) {
  const prisma = deps.prisma ?? createDatabaseClient();

  return async function resolve(input: ConnectionResolverInput): Promise<ConnectionResolution> {
    const connection = await prisma.userConnection.findUnique({
      where: { id: input.userConnectionId },
    });

    if (!connection) {
      return {
        ok: false,
        status: 404,
        code: 'CONNECTOR_LINK_MISSING',
        error: 'No connection found for the supplied userConnectionId.',
      };
    }

    if (connection.userId !== input.userId) {
      return {
        ok: false,
        status: 403,
        code: 'CONNECTOR_LINK_MISSING',
        error: 'The connection does not belong to the workspace user.',
      };
    }

    if (connection.status !== 'active') {
      return {
        ok: false,
        status: 401,
        code: 'CONNECTOR_NEEDS_RECONNECT',
        error: `Connection status is ${connection.status}; reconnection required.`,
      };
    }

    if (!connection.forAgentUse) {
      return {
        ok: false,
        status: 403,
        code: 'CONNECTOR_POLICY_DENIED',
        error: 'This connection is reserved for direct user operations and is not exposed to the agent.',
      };
    }

    const link = await prisma.projectConnectionLink.findUnique({
      where: {
        projectId_userConnectionId: {
          projectId: input.projectId,
          userConnectionId: input.userConnectionId,
        },
      },
    });

    if (!link || link.unlinkedAt) {
      return {
        ok: false,
        status: 403,
        code: 'CONNECTOR_LINK_MISSING',
        error: 'This project is not linked to the supplied connection.',
      };
    }

    /*
     * Defense in depth: the connection owner must still be a member of the
     * organization. Member removal unlinks their project links, but verify
     * membership here too so a stale link can never leak the ex-member's tokens.
     */
    const membership = await prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId: input.organizationId,
          userId: connection.userId,
        },
      },
    });

    if (!membership) {
      return {
        ok: false,
        status: 403,
        code: 'CONNECTOR_LINK_MISSING',
        error: 'The connection owner is no longer a member of the organization.',
      };
    }

    const policy = await prisma.organizationConnectorPolicy.findUnique({
      where: {
        organizationId_provider: {
          organizationId: input.organizationId,
          provider: connection.provider,
        },
      },
    });

    if (policy && !policy.enabled) {
      return {
        ok: false,
        status: 403,
        code: 'CONNECTOR_POLICY_DENIED',
        error: `${connection.provider} is disabled by an administrator for this organization.`,
      };
    }

    if (!connection.accessTokenEncrypted) {
      return {
        ok: false,
        status: 503,
        code: 'CONNECTOR_PROVIDER_AUTH_FAILED',
        error: 'No access token is stored for this connection.',
      };
    }

    let accessToken: string;

    try {
      accessToken = decryptJson<{ value: string }>(connection.accessTokenEncrypted).value;
    } catch {
      return {
        ok: false,
        status: 503,
        code: 'CONNECTOR_PROVIDER_AUTH_FAILED',
        error: 'Stored access token could not be decrypted with the current ENCRYPTION_SECRET.',
      };
    }

    await prisma.userConnection.update({
      where: { id: connection.id },
      data: { lastUsedAt: new Date() },
    });

    return {
      ok: true,
      provider: connection.provider,
      accessToken,
    };
  };
}

export function createPrismaConnectionFailureReporter(deps: PrismaResolverDeps = {}) {
  const prisma = deps.prisma ?? createDatabaseClient();

  return async function report(update: ConnectionStatusUpdate): Promise<void> {
    try {
      await prisma.userConnection.update({
        where: { id: update.userConnectionId },
        data: { status: 'needs_reconnect' },
      });
    } catch {
      // Connection was deleted concurrently; the alert below is the only
      // signal we still want to emit if its parent row still exists.
      return;
    }

    try {
      await prisma.reconnectionAlert.create({
        data: {
          userConnectionId: update.userConnectionId,
          reason: 'token_revoked',
        },
      });
    } catch {
      // Best-effort; the API service will also detect 401s on the
      // /api/github-user route and create the alert there.
    }
  };
}
