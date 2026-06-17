import { createHash } from 'node:crypto';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface EmailProvider {
  send(message: EmailMessage): Promise<void>;
}

function isProduction() {
  return process.env.NODE_ENV === 'production';
}

function nonEmpty(value: string | undefined) {
  return value?.trim() || undefined;
}

function getHttpEmailFrom() {
  const from = nonEmpty(process.env.EMAIL_FROM);

  if (from) {
    return from;
  }

  if (isProduction()) {
    throw new Error('EMAIL_FROM is required in production when EMAIL_HTTP_ENDPOINT is configured.');
  }

  return 'no-reply@vibecore.local';
}

export class HttpEmailProvider implements EmailProvider {
  constructor(
    readonly endpoint = process.env.EMAIL_HTTP_ENDPOINT,
    readonly token = process.env.EMAIL_HTTP_TOKEN,
  ) {}

  async send(message: EmailMessage) {
    const endpoint = nonEmpty(this.endpoint);
    const token = nonEmpty(this.token);

    if (!endpoint) {
      throw new Error('EMAIL_HTTP_ENDPOINT is required for HttpEmailProvider.');
    }

    if (isProduction() && !token) {
      throw new Error('EMAIL_HTTP_TOKEN is required in production when EMAIL_HTTP_ENDPOINT is configured.');
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'user-agent': 'E-Code API transactional email',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        from: getHttpEmailFrom(),
        ...message,
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      throw new Error(`Email provider failed: ${response.status}`);
    }
  }
}

/*
 * Dev-only fallback used when EMAIL_HTTP_ENDPOINT (Resend) is not configured.
 * The message is NOT delivered; only redacted metadata is logged for local
 * development. This is unreachable in production — createEmailProvider() throws
 * if Resend isn't configured (see below), so prod is always Resend or boot-fail.
 */
export class LoggingEmailProvider implements EmailProvider {
  async send(message: EmailMessage) {
    const banner = '─'.repeat(60);
    const textBytes = Buffer.byteLength(message.text, 'utf8');
    const textDigest = createHash('sha256').update(message.text).digest('hex');

    console.warn(
      [
        banner,
        `[email] EMAIL_HTTP_ENDPOINT (Resend) not configured — logging only (dev).`,
        `[email] To:      ${message.to}`,
        `[email] Subject: ${message.subject}`,
        `[email] Text:    redacted (${textBytes} bytes, sha256=${textDigest})`,
        banner,
      ].join('\n'),
    );
  }
}

export function createEmailProvider(): EmailProvider {
  // Resend (HTTP API) is the ONLY supported transactional-email provider.
  // EMAIL_HTTP_ENDPOINT points at https://api.resend.com/emails (see the prod
  // configmap); EMAIL_HTTP_TOKEN is the Resend API key.
  if (process.env.EMAIL_HTTP_ENDPOINT) {
    if (isProduction() && !nonEmpty(process.env.EMAIL_HTTP_TOKEN)) {
      throw new Error('EMAIL_HTTP_TOKEN is required in production when EMAIL_HTTP_ENDPOINT is configured.');
    }

    getHttpEmailFrom();
    return new HttpEmailProvider();
  }

  /*
   * Refuse to silently swallow transactional email in production. The logging
   * fallback is development-only because verification, reset and invitation
   * flows depend on real delivery. (Keeps the boot-fail guard when Resend is
   * unconfigured — there is no SMTP/other fallback.)
   */
  if (isProduction()) {
    throw new Error('EMAIL_HTTP_ENDPOINT (Resend) is required in production for transactional email.');
  }

  return new LoggingEmailProvider();
}
