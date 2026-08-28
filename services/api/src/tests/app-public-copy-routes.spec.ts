import { hashPassword } from '@vibecore/auth';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApiApp } from '../app.js';
import type { EmailProvider } from '../email.js';
import { TestApiStore } from './test-api-store.js';

class QuietEmailProvider implements EmailProvider {
  async send() {}
}

describe('localized backend route families', () => {
  let app: Awaited<ReturnType<typeof buildApiApp>>;
  let store: TestApiStore;
  let organizationId: string;
  let userId: string;
  const token = 'app-copy-token';

  beforeEach(async () => {
    store = new TestApiStore();
    app = await buildApiApp({ store, emailProvider: new QuietEmailProvider() });

    const user = await store.createUser({
      email: 'app-copy@example.com',
      name: 'App Copy User',
      passwordHash: hashPassword('password123'),
    });
    userId = user.id;
    const organization = await store.createOrganization({
      name: 'App Copy Org',
      slug: 'app-copy-org',
      ownerUserId: user.id,
    });
    organizationId = organization.id;
    await store.createSession({ userId: user.id, token, expiresAt: new Date(Date.now() + 3_600_000) });
  });

  afterEach(async () => {
    await app.close();
  });

  const frenchHeaders = (authenticated = false) => ({
    'accept-language': 'fr-FR,fr;q=0.9,en;q=0.5',
    ...(authenticated ? { authorization: `Bearer ${token}` } : {}),
  });

  it('localizes authentication errors while preserving their stable code', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/orgs/${organizationId}/usage/breakdown`,
      headers: frenchHeaders(),
    });

    expect(response.statusCode).toBe(401);
    expect(response.headers['content-language']).toBe('fr');
    expect(response.headers.vary).toContain('Cookie');
    expect(response.headers.vary).toContain('Accept-Language');
    expect(response.json()).toMatchObject({ code: 'AUTH_REQUIRED', error: 'Vous devez vous authentifier.' });
  });

  it('localizes custom validation issues instead of returning Zod English', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/contact-sales',
      headers: frenchHeaders(),
      payload: { email: 'prospect@example.com', requirements: 'Besoin d’une plateforme complète.' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.headers['content-language']).toBe('fr');
    expect(response.json()).toMatchObject({
      code: 'VALIDATION_ERROR',
      error: 'La validation a échoué.',
      issues: [
        {
          path: ['company'],
          message: 'Indiquez une entreprise (ventes) ou un sujet (contact général).',
        },
      ],
    });
  });

  it('localizes nested public share-link errors', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/chat-shares/not-a-valid-signed-token',
      headers: frenchHeaders(),
    });

    expect(response.statusCode).toBe(404);
    expect(response.headers['content-language']).toBe('fr');
    expect(response.json()).toEqual({
      error: {
        code: 'CHAT_SHARE_INVALID',
        message: 'Le lien de partage est invalide ou a été altéré.',
      },
    });
  });

  it('localizes billing errors and keeps URLs/codes untouched', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/orgs/${organizationId}/billing/checkout`,
      headers: frenchHeaders(true),
      payload: {
        planKey: 'free',
        interval: 'monthly',
        successUrl: 'https://app.example.test/success',
        cancelUrl: 'https://app.example.test/cancel',
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      code: 'STRIPE_FREE_NO_CHECKOUT',
      error:
        'Le forfait Gratuit ne comporte pas de paiement. Annulez tout abonnement payant via /orgs/:orgId/billing/portal pour revenir au forfait Gratuit.',
    });
  });

  it('localizes disabled database and object-storage panel responses', async () => {
    const database = await app.inject({
      method: 'GET',
      url: '/projects/project-copy/database',
      headers: frenchHeaders(true),
    });
    expect(database.statusCode).toBe(404);
    expect(database.json()).toEqual({
      code: 'FEATURE_NOT_ENABLED',
      error: 'La restauration de la base de données n’est pas activée.',
    });

    const objectStorage = await app.inject({
      method: 'GET',
      url: '/projects/project-copy/object-storage/status',
      headers: frenchHeaders(true),
    });
    expect(objectStorage.statusCode).toBe(404);
    expect(objectStorage.json()).toEqual({
      code: 'FEATURE_NOT_ENABLED',
      error: 'Le stockage d’objets n’est pas activé.',
    });
  });

  it('localizes successful usage labels and units from Accept-Language', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/orgs/${organizationId}/usage/breakdown`,
      headers: frenchHeaders(true),
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-language']).toBe('fr');
    expect(response.headers.vary).toContain('Accept-Language');
    const categories = Object.fromEntries(
      response.json().categories.map((category: { key: string }) => [category.key, category]),
    );
    expect(categories.compute).toMatchObject({ label: 'Calcul de l’espace de travail', unit: 'unités de calcul' });
    expect(categories.deployments).toMatchObject({ label: 'Déploiements', unit: 'déploiements' });
    expect(categories.objectStorage).toMatchObject({ label: 'Stockage d’objets', unit: 'Gio-mois' });
    expect(categories.database).toMatchObject({ label: 'Base de données', unit: 'Gio-mois' });
  });

  it('retains the exact English fallback for English clients', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/orgs/${organizationId}/usage/breakdown`,
      headers: { 'accept-language': 'en-US' },
    });

    expect(response.statusCode).toBe(401);
    expect(response.headers['content-language']).toBe('en');
    expect(response.json()).toMatchObject({ code: 'AUTH_REQUIRED', error: 'Unauthorized' });
  });

  it('localizes authentication, connector, and invitation contracts with stable codes', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      headers: frenchHeaders(),
      payload: { email: 'app-copy@example.com', password: 'incorrect-password' },
    });
    expect(login.statusCode).toBe(401);
    expect(login.json()).toEqual({
      code: 'AUTH_INVALID_CREDENTIALS',
      error: 'Adresse e-mail ou mot de passe incorrect.',
    });

    const connector = await app.inject({
      method: 'POST',
      url: '/api/integrations/oauth/unsupported-provider/connect',
      headers: frenchHeaders(true),
      payload: {},
    });
    expect(connector.statusCode).toBe(400);
    expect(connector.json()).toEqual({
      code: 'CONNECTOR_UNKNOWN_PROVIDER',
      error: 'Fournisseur de connecteur non pris en charge : unsupported-provider',
    });

    const invitation = await app.inject({
      method: 'POST',
      url: `/orgs/${organizationId}/invitations/missing-invite/resend`,
      headers: frenchHeaders(true),
    });
    expect(invitation.statusCode).toBe(404);
    expect(invitation.json()).toEqual({ code: 'INVITE_NOT_FOUND', error: 'Invitation introuvable.' });
  });

  it('localizes cron preview validation without serializing parser diagnostics', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/scheduled-tasks/preview',
      headers: frenchHeaders(true),
      payload: { cron: '* * *', timezone: 'Europe/Paris' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      valid: false,
      code: 'SCHEDULE_INVALID_CRON',
      error: 'L’expression cron est invalide.',
    });
    expect(response.body).not.toContain('exactly 5 fields');
  });

  it('localizes Stripe health and never serializes the raw provider error field', async () => {
    await store.updateUser({ userId, platformAdmin: true, mfaEnabled: true });

    const response = await app.inject({
      method: 'GET',
      url: '/admin/stripe-health',
      headers: frenchHeaders(true),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      configured: false,
      ok: false,
      detailCode: 'STRIPE_NOT_CONFIGURED',
      detail: 'STRIPE_SECRET_KEY n’est pas configurée.',
    });
    expect(response.body).not.toContain('result.error');
  });

  it('localizes billing package quota and published-project entitlement errors at their HTTP boundaries', async () => {
    await store.createQuotaOverride({
      organizationId,
      key: 'projects.count',
      limit: 3,
      reason: 'Exercise the localized quota boundary independently of catalog plan limits.',
      createdByUserId: userId,
    });

    for (let index = 0; index < 3; index += 1) {
      await store.createProject({
        organizationId,
        name: `Quota Project ${index + 1}`,
        slug: `quota-project-${index + 1}`,
      });
    }

    const quota = await app.inject({
      method: 'POST',
      url: `/orgs/${organizationId}/projects`,
      headers: frenchHeaders(true),
      payload: { name: 'Projet au-delà du quota' },
    });
    expect(quota.statusCode).toBe(429);
    expect(quota.json()).toEqual({
      code: 'QUOTA_EXCEEDED',
      error: 'Le quota projects.count est dépassé.',
    });

    const publishedProject = await store.createProject({
      organizationId,
      name: 'Projet déjà publié',
      slug: 'projet-deja-publie',
    });
    await store.createDeployment({
      projectId: publishedProject.id,
      expectedOrganizationId: publishedProject.organizationId,
      provider: 'static',
      environment: 'production',
      status: 'READY',
      url: 'https://published.example.test',
    });

    const sourceProject = await store.createProject({
      organizationId,
      name: 'Deuxième projet',
      slug: 'deuxieme-projet',
    });
    const sourceDeployment = await store.createDeployment({
      projectId: sourceProject.id,
      expectedOrganizationId: sourceProject.organizationId,
      provider: 'static',
      environment: 'preview',
      status: 'READY',
      url: 'https://preview.example.test',
    });
    const appLimit = await app.inject({
      method: 'POST',
      url: `/projects/${sourceProject.id}/deployments/${sourceDeployment.id}/publish`,
      headers: frenchHeaders(true),
    });

    expect(appLimit.statusCode).toBe(402);
    expect(appLimit.headers['content-language']).toBe('fr');
    expect(appLimit.json()).toEqual({
      code: 'PLAN_ACTIVE_PUBLISHED_PROJECT_LIMIT',
      error:
        'Votre forfait permet de publier un seul projet à la fois. Passez à un forfait supérieur pour publier d’autres projets.',
      plan: 'starter',
      cap: 1,
      activeOtherProjects: 1,
      upgradeRequired: true,
    });
  });

  it('localizes Stripe signature failures from the billing package', async () => {
    const previousWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_app_copy';

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/billing/stripe/webhook',
        headers: { ...frenchHeaders(), 'content-type': 'application/json' },
        payload: { id: 'evt_missing_signature', type: 'invoice.paid', data: { object: {} } },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({
        code: 'STRIPE_SIGNATURE_MISSING',
        error: 'La signature Stripe est absente.',
      });
    } finally {
      if (previousWebhookSecret === undefined) {
        delete process.env.STRIPE_WEBHOOK_SECRET;
      } else {
        process.env.STRIPE_WEBHOOK_SECRET = previousWebhookSecret;
      }
    }
  });

  it('localizes stored and replayed Stripe webhook failures without returning raw technical errors', async () => {
    await store.updateUser({ userId, platformAdmin: true, mfaEnabled: true });
    await store.recordStripeWebhookFailure({
      eventId: 'evt_failed_copy',
      type: 'invoice.paid',
      payload: { id: 'evt_failed_copy', type: 'invoice.paid', data: { object: {} } },
      error: 'Stripe request failed: 502',
    });

    const failures = await app.inject({
      method: 'GET',
      url: '/admin/stripe/webhook-failures',
      headers: frenchHeaders(true),
    });
    expect(failures.statusCode).toBe(200);
    expect(failures.json().failures[0]).toMatchObject({
      eventId: 'evt_failed_copy',
      lastErrorCode: 'STRIPE_WEBHOOK_PROCESSING_FAILED',
      lastError: 'La requête Stripe a échoué (statut 502).',
    });
    expect(failures.body).not.toContain('Stripe request failed');

    const recordEventSpy = vi
      .spyOn(store, 'recordStripeEvent')
      .mockRejectedValueOnce(new Error('ECONNRESET from 10.0.0.12'));

    try {
      const replay = await app.inject({
        method: 'POST',
        url: '/admin/stripe/webhook-failures/evt_failed_copy/replay',
        headers: frenchHeaders(true),
      });

      expect(replay.statusCode).toBe(200);
      expect(replay.json().result).toMatchObject({
        eventId: 'evt_failed_copy',
        ok: false,
        errorCode: 'STRIPE_WEBHOOK_PROCESSING_FAILED',
        error: 'Le traitement du webhook Stripe a échoué. Consultez les journaux serveur pour obtenir le diagnostic.',
      });
      expect(replay.body).not.toContain('ECONNRESET');
      expect(replay.body).not.toContain('10.0.0.12');
    } finally {
      recordEventSpy.mockRestore();
    }
  });

  it('localizes successful cluster-capacity alerts and adds stable alert codes', async () => {
    await store.updateUser({ userId, platformAdmin: true, mfaEnabled: true });
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          runningWorkspaces: 2,
          totalWorkspacePods: 3,
          workspacesByOrg: [],
          nodes: [],
          nodePool: {
            name: 'pool-a',
            nodeCount: 4,
            allocatableCpuMillicores: 4_000,
            allocatableMemoryBytes: 8_000,
            requestedCpuMillicores: 3_840,
            requestedMemoryBytes: 4_000,
            usedCpuMillicores: 2_000,
            usedMemoryBytes: 3_000,
            reservedCpuRatio: 0.96,
            reservedMemoryRatio: 0.5,
            usedCpuRatio: 0.5,
          },
          autoscaling: {
            nodePool: 'pool-a',
            minNodes: 1,
            maxNodes: 4,
            currentNodes: 4,
            healthy: true,
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/admin/capacity',
        headers: frenchHeaders(true),
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-language']).toBe('fr');
      expect(response.json().alerts).toEqual([
        {
          level: 'critical',
          kind: 'node-count',
          code: 'CAPACITY_NODE_COUNT_CRITICAL',
          message:
            'Le pool de nœuds « pool-a » utilise 4/4 nœuds (100 % du maximum d’autoscaling). Il ne peut plus s’étendre ; augmentez le nombre maximal de nœuds.',
        },
        {
          level: 'critical',
          kind: 'reserved-cpu',
          code: 'CAPACITY_RESERVED_CPU_PRESSURE',
          message:
            'Le CPU réservé sur « pool-a » atteint 96 % de la capacité allouable ; la planification de nouveaux espaces de travail risque d’échouer. Libérez les espaces de travail inactifs ou augmentez le maximum d’autoscaling.',
        },
      ]);
      expect(response.body).not.toContain('Node pool');
      expect(response.body).not.toContain('Reserved CPU on');
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
