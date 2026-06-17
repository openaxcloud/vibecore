import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmailProvider, HttpEmailProvider, LoggingEmailProvider } from '../email.js';

const ENV_KEYS = ['EMAIL_HTTP_ENDPOINT', 'EMAIL_HTTP_TOKEN', 'EMAIL_FROM', 'EMAIL_PROVIDER', 'NODE_ENV'] as const;

describe('createEmailProvider', () => {
  let original: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>;

  beforeEach(() => {
    original = {};

    for (const key of ENV_KEYS) {
      original[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      const value = original[key];

      if (value === undefined) {
        delete (process.env as Record<string, string | undefined>)[key];
      } else {
        (process.env as Record<string, string>)[key] = value;
      }
    }

    vi.restoreAllMocks();
  });

  it('uses the HTTP (Resend) provider when EMAIL_HTTP_ENDPOINT is set', () => {
    process.env.EMAIL_HTTP_ENDPOINT = 'https://api.resend.com/emails';
    expect(createEmailProvider()).toBeInstanceOf(HttpEmailProvider);
  });

  it('uses LoggingEmailProvider as the dev fallback', () => {
    process.env.NODE_ENV = 'development';
    expect(createEmailProvider()).toBeInstanceOf(LoggingEmailProvider);
  });

  it('refuses to silently swallow email in production', () => {
    process.env.NODE_ENV = 'production';
    expect(() => createEmailProvider()).toThrow(/EMAIL_HTTP_ENDPOINT \(Resend\) is required/);
  });

  it('does not allow the logging fallback in production via EMAIL_PROVIDER=logging', () => {
    process.env.NODE_ENV = 'production';
    process.env.EMAIL_PROVIDER = 'logging';
    expect(() => createEmailProvider()).toThrow(/EMAIL_HTTP_ENDPOINT \(Resend\) is required/);
  });

  it('validates HTTP email credentials before booting in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.EMAIL_HTTP_ENDPOINT = 'https://api.resend.com/emails';

    expect(() => createEmailProvider()).toThrow(/EMAIL_HTTP_TOKEN is required/);

    process.env.EMAIL_HTTP_TOKEN = 'resend-token';
    expect(() => createEmailProvider()).toThrow(/EMAIL_FROM is required/);

    process.env.EMAIL_FROM = 'Vibecore <no-reply@e-code.ai>';
    expect(createEmailProvider()).toBeInstanceOf(HttpEmailProvider);
  });

  it('LoggingEmailProvider.send writes redacted metadata to console.warn but never throws', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const provider = new LoggingEmailProvider();

    await expect(
      provider.send({ to: 'user@example.com', subject: 'Hello', text: 'secret-reset-token' }),
    ).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledOnce();
    const message = warn.mock.calls[0]?.[0] as string;
    expect(message).toContain('user@example.com');
    expect(message).toContain('Hello');
    expect(message).toContain('redacted');
    expect(message).toContain('sha256=');
    expect(message).not.toContain('secret-reset-token');
  });

  it('HttpEmailProvider refuses to send without an endpoint', async () => {
    const provider = new HttpEmailProvider(undefined, 'token');

    await expect(provider.send({ to: 'user@example.com', subject: 'Verify', text: 'Use this code' })).rejects.toThrow(
      /EMAIL_HTTP_ENDPOINT is required/,
    );
  });

  it('HttpEmailProvider sends Resend-compatible JSON with bearer auth and user-agent', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ id: 'email_1' }), { status: 200 }));
    process.env.EMAIL_FROM = 'Vibecore <no-reply@e-code.ai>';

    const provider = new HttpEmailProvider('https://api.resend.com/emails', 'resend-token');
    await provider.send({ to: 'user@example.com', subject: 'Verify', text: 'Use this code', html: '<p>Use this code</p>' });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.resend.com/emails');
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
      headers: expect.objectContaining({
        accept: 'application/json',
        authorization: 'Bearer resend-token',
        'content-type': 'application/json',
        'user-agent': 'Vibecore API transactional email',
      }),
    });
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      from: 'Vibecore <no-reply@e-code.ai>',
      to: 'user@example.com',
      subject: 'Verify',
      text: 'Use this code',
      html: '<p>Use this code</p>',
    });
  });
});
