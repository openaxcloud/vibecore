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

export class HttpEmailProvider implements EmailProvider {
  constructor(
    readonly endpoint = process.env.EMAIL_HTTP_ENDPOINT,
    readonly token = process.env.EMAIL_HTTP_TOKEN,
  ) {}

  async send(message: EmailMessage) {
    if (!this.endpoint) {
      return;
    }

    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'user-agent': 'Vibecore API transactional email',
        ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || 'no-reply@e-code.ai',
        ...message,
      }),
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
      from: process.env.EMAIL_FROM ?? process.env.SMTP_FROM ?? 'no-reply@vibecore.local',
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
  }
}

/*
 * Fallback used when neither SMTP nor an HTTP webhook is configured. The
 * registration / password-reset flows still issue tokens, but the message
 * body is written to the server log instead of being delivered. Production
 * deployments must replace this with an SMTP relay or a webhook to Resend /
 * SendGrid / SES — that switch is purely environment-driven and does not
 * require a code change.
 */
export class LoggingEmailProvider implements EmailProvider {
  async send(message: EmailMessage) {
    const banner = '─'.repeat(60);
    console.warn(
      [
        banner,
        `[email] No SMTP_HOST / EMAIL_HTTP_ENDPOINT configured — logging only.`,
        `[email] To:      ${message.to}`,
        `[email] Subject: ${message.subject}`,
        `[email] Body:    ${message.text}`,
        banner,
      ].join('\n'),
    );
  }
}

export function createEmailProvider(): EmailProvider {
  if (process.env.SMTP_HOST) {
    return new SmtpEmailProvider();
  }

  if (process.env.EMAIL_HTTP_ENDPOINT) {
    return new HttpEmailProvider();
  }

  /*
   * Refuse to silently swallow transactional email in production. Operators
   * must explicitly opt in via `EMAIL_PROVIDER=logging` if they want the
   * logging fallback while a real provider is being provisioned.
   */
  if (process.env.NODE_ENV === 'production' && process.env.EMAIL_PROVIDER !== 'logging') {
    throw new Error(
      'SMTP_HOST or EMAIL_HTTP_ENDPOINT is required in production. Set EMAIL_PROVIDER=logging to override during initial rollout.',
    );
  }

  return new LoggingEmailProvider();
}
