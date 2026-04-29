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
        'content-type': 'application/json',
        ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
      },
      body: JSON.stringify(message),
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

export function createEmailProvider(): EmailProvider {
  if (process.env.SMTP_HOST) {
    return new SmtpEmailProvider();
  }

  if (process.env.EMAIL_HTTP_ENDPOINT) {
    return new HttpEmailProvider();
  }

  throw new Error('SMTP_HOST or EMAIL_HTTP_ENDPOINT is required. The API does not start with an in-memory email provider.');
}
