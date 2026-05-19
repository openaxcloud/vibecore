import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmailProvider, HttpEmailProvider, LoggingEmailProvider, SmtpEmailProvider } from '../email.js';

const ENV_KEYS = ['SMTP_HOST', 'EMAIL_HTTP_ENDPOINT', 'EMAIL_PROVIDER', 'NODE_ENV'] as const;

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

  it('prefers SMTP when SMTP_HOST is set', () => {
    process.env.SMTP_HOST = 'smtp.example.com';
    expect(createEmailProvider()).toBeInstanceOf(SmtpEmailProvider);
  });

  it('falls back to HTTP when only EMAIL_HTTP_ENDPOINT is set', () => {
    process.env.EMAIL_HTTP_ENDPOINT = 'https://hooks.example.com/email';
    expect(createEmailProvider()).toBeInstanceOf(HttpEmailProvider);
  });

  it('uses LoggingEmailProvider as the dev fallback', () => {
    process.env.NODE_ENV = 'development';
    expect(createEmailProvider()).toBeInstanceOf(LoggingEmailProvider);
  });

  it('refuses to silently swallow email in production', () => {
    process.env.NODE_ENV = 'production';
    expect(() => createEmailProvider()).toThrow(/SMTP_HOST or EMAIL_HTTP_ENDPOINT is required/);
  });

  it('allows explicit opt-in to the logging fallback in production via EMAIL_PROVIDER=logging', () => {
    process.env.NODE_ENV = 'production';
    process.env.EMAIL_PROVIDER = 'logging';
    expect(createEmailProvider()).toBeInstanceOf(LoggingEmailProvider);
  });

  it('LoggingEmailProvider.send writes to console.warn but never throws', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const provider = new LoggingEmailProvider();

    await expect(
      provider.send({ to: 'user@example.com', subject: 'Hello', text: 'Hi there' }),
    ).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledOnce();
    const message = warn.mock.calls[0]?.[0] as string;
    expect(message).toContain('user@example.com');
    expect(message).toContain('Hello');
    expect(message).toContain('Hi there');
  });
});
