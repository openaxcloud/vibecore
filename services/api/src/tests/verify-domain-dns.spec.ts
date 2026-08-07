import { describe, expect, it, vi } from 'vitest';
import { PrismaApiStore } from '../prisma-store.js';
import type { DatabaseClient } from '@vibecore/database';

/*
 * verifyDomain performs a real DNS TXT lookup. We inject both a mock Prisma
 * client (only the verifiedDomain delegate is exercised) and a fake resolveTxt
 * so the behaviour can be asserted without a database or live DNS.
 */
function buildStore(options: {
  record: Record<string, unknown> | null;
  resolveTxt: (hostname: string) => Promise<string[][]>;
}) {
  const updates: Array<{ where: unknown; data: Record<string, unknown> }> = [];
  const record = options.record;

  const prisma = {
    verifiedDomain: {
      findUnique: vi.fn(async () => record),
      update: vi.fn(async ({ where, data }: { where: unknown; data: Record<string, unknown> }) => {
        updates.push({ where, data });
        return { ...(record ?? {}), ...data };
      }),
    },
  } as unknown as DatabaseClient;

  return { store: new PrismaApiStore(prisma, options.resolveTxt), updates };
}

const TOKEN = 'domain_testtoken';
const DOMAIN = 'app.example.com';
const EXPECTED = `vibecore-domain-verification=${TOKEN}`;

describe('PrismaApiStore.verifyDomain', () => {
  it('returns undefined when the domain is not registered', async () => {
    const resolveTxt = vi.fn(async () => [[EXPECTED]]);
    const { store } = buildStore({ record: null, resolveTxt });

    await expect(store.verifyDomain({ organizationId: 'org', domain: DOMAIN })).resolves.toBeUndefined();
    expect(resolveTxt).not.toHaveBeenCalled();
  });

  it('marks the domain verified when the TXT record matches', async () => {
    const resolveTxt = vi.fn(async (host: string) => {
      expect(host).toBe(`_vibecore.${DOMAIN}`);
      // DNS may chunk a record into multiple strings — they must be rejoined.
      return [['unrelated=value'], [EXPECTED.slice(0, 10), EXPECTED.slice(10)]];
    });
    const { store, updates } = buildStore({
      record: { id: 'd1', domain: DOMAIN, verificationToken: TOKEN, createdAt: new Date() },
      resolveTxt,
    });

    const result = await store.verifyDomain({ organizationId: 'org', domain: DOMAIN });

    expect(result?.sslStatus).toBe('dns_verified');
    expect(result?.verifiedAt).toBeTruthy();
    expect(updates.at(-1)?.data).toMatchObject({ sslStatus: 'dns_verified' });
  });

  it('throws a verification error and flips ssl status when no record matches', async () => {
    const resolveTxt = vi.fn(async () => [['vibecore-domain-verification=some-other-token']]);
    const { store, updates } = buildStore({
      record: { id: 'd1', domain: DOMAIN, verificationToken: TOKEN, createdAt: new Date() },
      resolveTxt,
    });

    await expect(store.verifyDomain({ organizationId: 'org', domain: DOMAIN })).rejects.toMatchObject({
      statusCode: 422,
      code: 'DOMAIN_VERIFICATION_FAILED',
    });
    expect(updates.at(-1)?.data).toMatchObject({ sslStatus: 'failed' });
  });

  it('surfaces a clear error when the TXT record is missing in DNS', async () => {
    const resolveTxt = vi.fn(async () => {
      throw Object.assign(new Error('queryTxt ENOTFOUND'), { code: 'ENOTFOUND' });
    });
    const { store } = buildStore({
      record: { id: 'd1', domain: DOMAIN, verificationToken: TOKEN, createdAt: new Date() },
      resolveTxt,
    });

    await expect(store.verifyDomain({ organizationId: 'org', domain: DOMAIN })).rejects.toMatchObject({
      statusCode: 422,
      code: 'DOMAIN_VERIFICATION_FAILED',
      message: expect.stringContaining('No TXT record was found'),
    });
  });
});
