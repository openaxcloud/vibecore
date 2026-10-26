import { decryptJson } from '@vibecore/security';
import type { FastifyInstance } from 'fastify';
import type { ApiStore } from '../store.js';
import { githubConnector } from './providers/github.js';
import { connectorPublicErrorMessage } from './providers/public-error-copy.js';
import { ConnectorProviderError } from './providers/types.js';

const LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;
const malformed = () => new ConnectorProviderError({ code: 'PROVIDER_RESPONSE_MALFORMED' });

/** Verify the caller's existing connection; never accepts credentials or a provider URL. */
export function registerGithubVerification(app: FastifyInstance, store: ApiStore): void {
  app.post(
    '/api/integrations/github/verify',
    {
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      reply.header('Cache-Control', 'no-store');

      const fail = (status: number, code: string) =>
        reply.code(status).send({
          code,
          error: connectorPublicErrorMessage({ code: 'PROVIDER_USER_INFO_FAILED', locale: 'en' }),
        });

      if (!request.currentUser) {
        return fail(401, 'AUTH_REQUIRED');
      }

      if (
        request.body !== undefined &&
        (!request.body ||
          typeof request.body !== 'object' ||
          Array.isArray(request.body) ||
          Object.keys(request.body).length !== 0)
      ) {
        return fail(400, 'INVALID_REQUEST');
      }

      const catalog = await store.getConnectorOAuthCatalog('github');

      if (catalog && !catalog.enabled) {
        return fail(403, 'CONNECTOR_DISABLED');
      }

      const connections = await store.listUserConnectionsByUser(request.currentUser.id, { provider: 'github' });
      const connection = connections.find((row) => row.status === 'active');

      if (!connection) {
        return fail(
          401,
          connections.some((row) => row.status === 'needs_reconnect')
            ? 'CONNECTOR_NEEDS_RECONNECT'
            : 'CONNECTOR_NOT_LINKED',
        );
      }

      let accessToken: string;

      try {
        const value = decryptJson<{ value: unknown }>(connection.accessTokenEncrypted ?? '').value;

        if (typeof value !== 'string' || !value.trim()) {
          throw new Error('Invalid token');
        }

        accessToken = value;
      } catch {
        return fail(503, 'CONNECTOR_TOKEN_UNAVAILABLE');
      }

      try {
        // Signal remains active during response-body consumption, not just headers.
        const signal = AbortSignal.timeout(15_000);

        const profile = await githubConnector.fetchUserInfo({
          accessToken,
          fetchImpl: async (input, init) => {
            const response = await fetch(input, { ...init, signal, redirect: 'error' });

            if (response.ok) {
              let payload: unknown;

              try {
                payload = await response.clone().json();
              } catch {
                throw malformed();
              }

              if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
                throw malformed();
              }

              if ('error' in payload || ('ok' in payload && payload.ok !== true)) {
                throw malformed();
              }

              const { id, login } = payload as Record<string, unknown>;

              if (
                typeof id !== 'number' ||
                !Number.isSafeInteger(id) ||
                id <= 0 ||
                typeof login !== 'string' ||
                !LOGIN.test(login) ||
                login.includes('--')
              ) {
                throw malformed();
              }
            }

            return response;
          },
        });

        if (profile.externalAccountId !== connection.externalAccountId) {
          throw malformed();
        }

        return {
          account: {
            login: profile.externalAccountLabel,
            htmlUrl: `https://github.com/${profile.externalAccountLabel}`,
          },
          verifiedAt: new Date().toISOString(),
        };
      } catch (error) {
        if (error instanceof ConnectorProviderError) {
          if (error.httpStatus === 401) {
            await store.markUserConnectionStatus({ id: connection.id, status: 'needs_reconnect' });
            return fail(401, 'CONNECTOR_NEEDS_RECONNECT');
          }

          if (error.httpStatus === 403) {
            return fail(403, 'PROVIDER_FORBIDDEN');
          }

          if (error.code === 'PROVIDER_RESPONSE_MALFORMED') {
            return fail(502, error.code);
          }
        }

        return fail(502, 'PROVIDER_FAILED');
      }
    },
  );
}
