import { hashPassword } from '@vibecore/auth';
import { describe, expect, it } from 'vitest';

import { buildApiApp } from '../app.js';
import type { EmailProvider } from '../email.js';
import { TestApiStore } from './test-api-store.js';

class QuietEmailProvider implements EmailProvider {
  async send() {}
}

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

async function setup() {
  const store = new TestApiStore();
  const app = await buildApiApp({ store, emailProvider: new QuietEmailProvider() });

  const owner = await store.createUser({
    email: 'owner@example.com',
    name: 'Owner',
    passwordHash: hashPassword('password123'),
  });
  const org = await store.createOrganization({ name: 'Wallet Org', slug: 'wallet-org', ownerUserId: owner.id });

  const admin = await store.createUser({
    email: 'admin@example.com',
    name: 'Admin',
    passwordHash: hashPassword('password123'),
    platformAdmin: true,
  });
  await store.updateUser({ userId: admin.id, mfaEnabled: true });
  await store.createSession({ userId: admin.id, token: 'admin-token', expiresAt: new Date(Date.now() + 3600_000) });
  await app.inject({
    method: 'POST',
    url: '/auth/reauth',
    headers: auth('admin-token'),
    payload: { password: 'password123' },
  });

  // a non-admin session, to prove the guard
  await store.createSession({ userId: owner.id, token: 'owner-token', expiresAt: new Date(Date.now() + 3600_000) });

  return { app, store, org };
}

describe('admin wallet adjust', () => {
  it('credits then debits a wallet, updating the materialized balance', async () => {
    const { app, org } = await setup();

    const credit = await app.inject({
      method: 'POST',
      url: `/admin/wallets/${org.id}/adjust`,
      headers: auth('admin-token'),
      payload: { deltaCents: 5000, reason: 'goodwill credit' },
    });
    expect(credit.statusCode).toBe(200);
    expect(credit.json().wallet).toMatchObject({ organizationId: org.id, balanceCents: 5000 });
    expect(credit.json().entry).toMatchObject({ kind: 'ADJUSTMENT', deltaCents: 5000 });

    const debit = await app.inject({
      method: 'POST',
      url: `/admin/wallets/${org.id}/adjust`,
      headers: auth('admin-token'),
      payload: { deltaCents: -2000, reason: 'correction' },
    });
    expect(debit.statusCode).toBe(200);
    expect(debit.json().wallet.balanceCents).toBe(3000);
  });

  it('rejects a zero delta (400)', async () => {
    const { app, org } = await setup();

    const res = await app.inject({
      method: 'POST',
      url: `/admin/wallets/${org.id}/adjust`,
      headers: auth('admin-token'),
      payload: { deltaCents: 0, reason: 'noop' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('requires a reason — missing (400 WALLET_ADJUST_REASON_REQUIRED)', async () => {
    const { app, org } = await setup();

    const res = await app.inject({
      method: 'POST',
      url: `/admin/wallets/${org.id}/adjust`,
      headers: auth('admin-token'),
      payload: { deltaCents: 100 },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('WALLET_ADJUST_REASON_REQUIRED');
  });

  it('rejects a whitespace-only reason (400 WALLET_ADJUST_REASON_REQUIRED)', async () => {
    const { app, org } = await setup();

    const res = await app.inject({
      method: 'POST',
      url: `/admin/wallets/${org.id}/adjust`,
      headers: auth('admin-token'),
      payload: { deltaCents: 100, reason: '   ' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('WALLET_ADJUST_REASON_REQUIRED');
  });

  it('succeeds with a reason and persists the trimmed reason in the ledger', async () => {
    const { app, org } = await setup();

    const res = await app.inject({
      method: 'POST',
      url: `/admin/wallets/${org.id}/adjust`,
      headers: auth('admin-token'),
      payload: { deltaCents: 100, reason: '  goodwill credit  ' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().entry).toMatchObject({ kind: 'ADJUSTMENT', reason: 'goodwill credit' });

    const ledger = await app.inject({
      method: 'GET',
      url: `/admin/wallets/${org.id}/ledger`,
      headers: auth('admin-token'),
    });
    const entries = ledger.json().ledger as Array<{ reason: string }>;
    expect(entries.map((entry) => entry.reason)).toContain('goodwill credit');
  });

  it('rejects a non-platform-admin caller (403)', async () => {
    const { app, org } = await setup();

    const res = await app.inject({
      method: 'POST',
      url: `/admin/wallets/${org.id}/adjust`,
      headers: auth('owner-token'),
      payload: { deltaCents: 100, reason: 'nope' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('F20: exposes the movement history (ledger) for the admin wallet panel', async () => {
    const { app, org } = await setup();

    await app.inject({
      method: 'POST',
      url: `/admin/wallets/${org.id}/adjust`,
      headers: auth('admin-token'),
      payload: { deltaCents: 5000, reason: 'goodwill credit' },
    });
    await app.inject({
      method: 'POST',
      url: `/admin/wallets/${org.id}/adjust`,
      headers: auth('admin-token'),
      payload: { deltaCents: -2000, reason: 'correction' },
    });

    const ledger = await app.inject({
      method: 'GET',
      url: `/admin/wallets/${org.id}/ledger`,
      headers: auth('admin-token'),
    });
    expect(ledger.statusCode).toBe(200);
    const entries = ledger.json().ledger as Array<{ deltaCents: number; kind: string; reason: string }>;
    expect(entries.length).toBeGreaterThanOrEqual(2);
    expect(entries.every((entry) => entry.kind === 'ADJUSTMENT')).toBe(true);
    expect(entries.map((entry) => entry.reason)).toEqual(expect.arrayContaining(['goodwill credit', 'correction']));

    // guard: a non-admin caller cannot read the ledger
    const denied = await app.inject({
      method: 'GET',
      url: `/admin/wallets/${org.id}/ledger`,
      headers: auth('owner-token'),
    });
    expect(denied.statusCode).toBe(403);
  });

  it('localizes platform ledger reasons in French while preserving operator content and identifiers', async () => {
    const { app, store, org } = await setup();
    const platformEntries = [
      { kind: 'CONSUMPTION' as const, reason: 'workspace compute' },
      { kind: 'CONSUMPTION' as const, reason: 'object storage' },
      { kind: 'CONSUMPTION' as const, reason: 'database compute' },
      { kind: 'CONSUMPTION' as const, reason: 'database storage' },
      { kind: 'CONSUMPTION' as const, reason: 'deployment reserved-vm' },
      { kind: 'CONSUMPTION' as const, reason: 'agent checkpoint' },
      { kind: 'CONSUMPTION' as const, reason: 'agent checkpoint (overdraw reversal)' },
      { kind: 'EXPIRY' as const, reason: 'rollover cap exceeded' },
      { kind: 'EXPIRY' as const, reason: 'prior grant expired (no rollover)' },
      { kind: 'GRANT' as const, reason: 'pro monthly grant' },
      { kind: 'GRANT' as const, reason: 'starter daily grant' },
      { kind: 'PAYG_CHARGE' as const, reason: 'PAYG overage (billed to Stripe metered usage)' },
    ];

    for (const entry of platformEntries) {
      await store.recordCreditEntry({
        organizationId: org.id,
        deltaCents: entry.kind === 'GRANT' ? 100 : -1,
        kind: entry.kind,
        reason: entry.reason,
      });
    }

    await store.recordCreditEntry({
      organizationId: org.id,
      deltaCents: 25,
      kind: 'ADJUSTMENT',
      reason: 'workspace compute',
    });
    await store.recordCreditEntry({
      organizationId: org.id,
      deltaCents: 25,
      kind: 'ADJUSTMENT',
      reason: 'Customer goodwill for London workspace',
    });

    const french = await app.inject({
      method: 'GET',
      url: `/admin/wallets/${org.id}/ledger`,
      headers: { ...auth('admin-token'), 'accept-language': 'fr-FR,fr;q=0.9,en;q=0.7' },
    });

    expect(french.statusCode).toBe(200);
    expect(french.headers['content-language']).toBe('fr');

    const frenchLedger = french.json().ledger as Array<{ kind: string; reason: string }>;
    const frenchReasons = frenchLedger.map((entry) => entry.reason);
    expect(frenchReasons).toEqual(
      expect.arrayContaining([
        'Calcul de l’espace de travail',
        'Stockage d’objets',
        'Calcul de la base de données',
        'Stockage de la base de données',
        'Déploiement reserved-vm',
        'Point de contrôle de l’agent',
        'Point de contrôle de l’agent (contrepassation du dépassement de solde)',
        'Plafond de report dépassé',
        'Attribution précédente expirée (sans report)',
        'Attribution mensuelle du forfait pro',
        'Attribution quotidienne du forfait starter',
        'Dépassement PAYG (facturé via l’usage mesuré par Stripe)',
        'workspace compute',
        'Customer goodwill for London workspace',
      ]),
    );

    const frenchSystemReasons = frenchLedger
      .filter((entry) => entry.kind !== 'ADJUSTMENT')
      .map((entry) => entry.reason);

    for (const englishPlatformReason of platformEntries.map((entry) => entry.reason)) {
      expect(frenchSystemReasons).not.toContain(englishPlatformReason);
    }

    const english = await app.inject({
      method: 'GET',
      url: `/admin/wallets/${org.id}/ledger`,
      headers: { ...auth('admin-token'), 'accept-language': 'en-US,en;q=0.9' },
    });
    const englishReasons = (english.json().ledger as Array<{ reason: string }>).map((entry) => entry.reason);

    expect(english.headers['content-language']).toBe('en');
    expect(englishReasons).toEqual(
      expect.arrayContaining([
        'Workspace compute',
        'Deployment reserved-vm',
        'Agent checkpoint (overdraw reversal)',
        'Monthly grant for the pro plan',
        'PAYG overage (billed through Stripe metered usage)',
        'workspace compute',
        'Customer goodwill for London workspace',
      ]),
    );
  });
});
