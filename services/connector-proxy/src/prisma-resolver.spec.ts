import { describe, expect, it, vi } from 'vitest';
import { createPrismaConnectionFailureReporter } from './prisma-resolver.js';

describe('Prisma connection failure notification descriptor', () => {
  it('stores a stable i18n key and params beside the English compatibility fallback', async () => {
    const notificationCreate = vi.fn(async ({ data }: { data: Record<string, unknown> }) => data);
    const prisma = {
      userConnection: {
        update: vi.fn(async () => ({ id: 'connection_1' })),
        findUnique: vi.fn(async () => ({
          userId: 'user_1',
          provider: 'github',
          externalAccountLabel: 'octocat',
        })),
      },
      reconnectionAlert: {
        findFirst: vi.fn(async () => null),
        create: vi.fn(async () => ({ id: 'alert_1' })),
      },
      notification: { create: notificationCreate },
    };
    const report = createPrismaConnectionFailureReporter({ prisma: prisma as never });

    await report({
      userConnectionId: 'connection_1',
      status: 'needs_reconnect',
      reason: 'token_expired_or_revoked',
      upstreamStatus: 401,
    });

    expect(notificationCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        title: 'Reconnect github',
        messageKey: 'notifications.connectionReconnectRequired',
        messageParams: { provider: 'github', accountLabel: 'octocat' },
      }),
    });
  });
});
