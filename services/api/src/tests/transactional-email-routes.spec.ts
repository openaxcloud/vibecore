import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApiApp } from '../app.js';
import type { EmailMessage, EmailProvider } from '../email.js';
import { TestApiStore } from './test-api-store.js';

class RecordingEmailProvider implements EmailProvider {
  readonly messages: EmailMessage[] = [];

  async send(message: EmailMessage) {
    this.messages.push(message);
  }
}

async function register(
  app: Awaited<ReturnType<typeof buildApiApp>>,
  input: { email: string; languageHeader?: string; organizationName?: string },
) {
  const response = await app.inject({
    method: 'POST',
    url: '/auth/register',
    headers: input.languageHeader ? { 'accept-language': input.languageHeader } : undefined,
    payload: {
      email: input.email,
      password: 'password123',
      name: 'Locale Tester',
      organizationName: input.organizationName,
    },
  });

  expect(response.statusCode).toBe(201);

  return response.json() as {
    token: string;
    verificationToken: string;
    user: { id: string; email: string };
    organization: { id: string };
  };
}

describe('localized transactional routes', () => {
  const originalOauthSecret = process.env.OAUTH_STATE_SECRET;
  const originalEncryptionSecret = process.env.ENCRYPTION_SECRET;

  beforeEach(() => {
    process.env.OAUTH_STATE_SECRET = 'transactional-email-route-test-secret';
    process.env.ENCRYPTION_SECRET = 'transactional-email-encryption-test-secret';
  });

  afterEach(() => {
    if (originalOauthSecret === undefined) {
      delete process.env.OAUTH_STATE_SECRET;
    } else {
      process.env.OAUTH_STATE_SECRET = originalOauthSecret;
    }

    if (originalEncryptionSecret === undefined) {
      delete process.env.ENCRYPTION_SECRET;
    } else {
      process.env.ENCRYPTION_SECRET = originalEncryptionSecret;
    }
  });

  it('persists the negotiated registration locale and reuses it for reset mail', async () => {
    const store = new TestApiStore();
    const emailProvider = new RecordingEmailProvider();
    const app = await buildApiApp({ store, emailProvider });

    const auth = await register(app, { email: 'french-user@example.com', languageHeader: 'fr-FR, en;q=0.8' });

    expect((await store.findUserByEmail('french-user@example.com'))?.language).toBe('fr');
    expect(emailProvider.messages.at(-1)?.subject).toBe('Vérifiez votre adresse e-mail');
    expect(emailProvider.messages.at(-1)?.html).toContain('lang=fr');

    const reset = await app.inject({
      method: 'POST',
      url: '/auth/password-reset/request',
      // No language header: the persisted recipient preference must still win.
      payload: { email: 'french-user@example.com' },
    });

    expect(reset.statusCode).toBe(200);
    expect(emailProvider.messages.at(-1)?.subject).toBe('Réinitialisez votre mot de passe');

    const updateEmail = await app.inject({
      method: 'PATCH',
      url: '/auth/me',
      headers: { authorization: `Bearer ${auth.token}`, 'accept-language': 'en-US' },
      payload: { email: 'french-user-new@example.com' },
    });

    expect(updateEmail.statusCode).toBe(200);
    expect(emailProvider.messages.at(-1)?.subject).toBe('Vérifiez votre nouvelle adresse e-mail');

    const resendVerification = await app.inject({
      method: 'POST',
      url: '/auth/send-verification',
      headers: { authorization: `Bearer ${auth.token}`, 'accept-language': 'en-US' },
    });

    expect(resendVerification.statusCode).toBe(200);
    expect(emailProvider.messages.at(-1)?.subject).toBe('Vérifiez votre adresse e-mail');

    await app.close();
  });

  it('sends the welcome email once verification succeeds in the persisted locale', async () => {
    const store = new TestApiStore();
    const emailProvider = new RecordingEmailProvider();
    const app = await buildApiApp({ store, emailProvider });
    const auth = await register(app, { email: 'french-welcome@example.com', languageHeader: 'fr-FR' });
    const verification = await app.inject({
      method: 'POST',
      url: '/auth/verify-email',
      payload: { token: auth.verificationToken },
    });

    expect(verification.statusCode).toBe(200);
    expect(emailProvider.messages.at(-1)?.subject).toBe('Bienvenue sur E-Code');
    expect(emailProvider.messages.at(-1)?.html).toContain('/dashboard?lang=fr');

    await app.close();
  });

  it('uses the invite recipient preference before the inviter request language', async () => {
    const store = new TestApiStore();
    const emailProvider = new RecordingEmailProvider();
    const app = await buildApiApp({ store, emailProvider });
    const owner = await register(app, {
      email: 'invite-owner-i18n@example.com',
      languageHeader: 'en-US',
      organizationName: 'Invite locale org',
    });
    await register(app, { email: 'invite-recipient-i18n@example.com', languageHeader: 'fr-FR' });
    await store.upsertSubscription({ organizationId: owner.organization.id, planKey: 'team', status: 'ACTIVE' });

    const invitation = await app.inject({
      method: 'POST',
      url: `/orgs/${owner.organization.id}/invitations`,
      headers: { authorization: `Bearer ${owner.token}`, 'accept-language': 'en-US' },
      payload: { email: 'invite-recipient-i18n@example.com', roleKey: 'member' },
    });

    expect(invitation.statusCode).toBe(201);
    expect(emailProvider.messages.at(-1)?.subject).toBe('Vous avez reçu une invitation');
    expect(emailProvider.messages.at(-1)?.html).toContain('lang=fr');

    const resend = await app.inject({
      method: 'POST',
      url: `/orgs/${owner.organization.id}/invitations/${invitation.json().invitation.id}/resend`,
      headers: { authorization: `Bearer ${owner.token}`, 'accept-language': 'en-US' },
    });

    expect(resend.statusCode).toBe(200);
    expect(emailProvider.messages.at(-1)?.subject).toBe('Votre lien d’invitation');

    await app.close();
  });

  it('localizes public error text while preserving the stable API code', async () => {
    const app = await buildApiApp({ store: new TestApiStore(), emailProvider: new RecordingEmailProvider() });
    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      headers: { 'accept-language': 'fr' },
      payload: { email: 'absent@example.com', password: 'password123' },
    });

    expect(response.statusCode).toBe(401);
    expect(response.headers['content-language']).toBe('fr');
    expect(response.json()).toMatchObject({
      code: 'AUTH_INVALID_CREDENTIALS',
      error: 'Adresse e-mail ou mot de passe incorrect.',
    });

    await app.close();
  });

  it('does not expose raw English validation detail to French API consumers', async () => {
    const app = await buildApiApp({ store: new TestApiStore(), emailProvider: new RecordingEmailProvider() });
    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      headers: { 'accept-language': 'fr-FR' },
      payload: { email: 'not-an-email' },
    });
    const payload = response.json();

    expect(response.statusCode).toBe(400);
    expect(response.headers['content-language']).toBe('fr');
    expect(payload).toMatchObject({
      code: 'VALIDATION_ERROR',
      error: 'La validation a échoué.',
    });
    expect(JSON.stringify(payload)).not.toMatch(/Validation failed|Invalid email|Required/i);

    await app.close();
  });
});
