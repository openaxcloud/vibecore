import { createHash } from 'node:crypto';

import nodemailer from 'nodemailer';

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

function getSmtpEmailFrom() {
  const from = nonEmpty(process.env.EMAIL_FROM) ?? nonEmpty(process.env.SMTP_FROM);

  if (from) {
    return from;
  }

  if (isProduction()) {
    throw new Error('EMAIL_FROM or SMTP_FROM is required in production when SMTP_HOST is configured.');
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
        'user-agent': 'Vibecore API transactional email',
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

export class SmtpEmailProvider implements EmailProvider {
  private readonly transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth:
      process.env.SMTP_USER && process.env.SMTP_PASSWORD
        ? {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASSWORD,
          }
        : undefined,
  });

  async send(message: EmailMessage) {
    await this.transporter.sendMail({
      from: getSmtpEmailFrom(),
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
  }
}

/*
 * Fallback used when neither SMTP nor an HTTP webhook is configured. The
 * message is not delivered; only redacted metadata is logged for local
 * development. Production deployments must replace this with an SMTP relay or
 * a webhook to Resend / SES.
 */
export class LoggingEmailProvider implements EmailProvider {
  async send(message: EmailMessage) {
    const banner = '─'.repeat(60);
    const textBytes = Buffer.byteLength(message.text, 'utf8');
    const textDigest = createHash('sha256').update(message.text).digest('hex');

    console.warn(
      [
        banner,
        `[email] No SMTP_HOST / EMAIL_HTTP_ENDPOINT configured — logging only.`,
        `[email] To:      ${message.to}`,
        `[email] Subject: ${message.subject}`,
        `[email] Text:    redacted (${textBytes} bytes, sha256=${textDigest})`,
        banner,
      ].join('\n'),
    );
  }
}

export function createEmailProvider(): EmailProvider {
  if (process.env.SMTP_HOST) {
    getSmtpEmailFrom();
    return new SmtpEmailProvider();
  }

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
   * flows depend on real delivery.
   */
  if (isProduction()) {
    throw new Error('SMTP_HOST or EMAIL_HTTP_ENDPOINT is required in production for transactional email.');
  }

  return new LoggingEmailProvider();
}
