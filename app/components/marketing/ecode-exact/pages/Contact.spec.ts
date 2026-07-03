import { describe, expect, it } from 'vitest';
import { buildContactMailto, validateContactField } from '~/components/marketing/ecode-exact/pages/Contact';

function parseMailto(mailto: string) {
  expect(mailto.startsWith('mailto:hello@e-code.ai?')).toBe(true);

  const query = new URLSearchParams(mailto.slice(mailto.indexOf('?') + 1));

  return {
    subject: query.get('subject') ?? '',
    body: query.get('body') ?? '',
  };
}

describe('buildContactMailto', () => {
  it('routes the message to hello@e-code.ai with name in the subject', () => {
    const { subject, body } = parseMailto(
      buildContactMailto({ name: 'Ada Lovelace', email: 'ada@example.com', message: 'Hello there' }),
    );

    expect(subject).toBe('Message from Ada Lovelace');
    expect(body).toContain('Name: Ada Lovelace');
    expect(body).toContain('Email: ada@example.com');
    expect(body).toContain('Hello there');
  });

  it('preserves the message body so it is never silently dropped', () => {
    const message = 'Multi-line\nmessage with & special = characters?';
    const { body } = parseMailto(buildContactMailto({ name: '', email: '', message }));

    // URLSearchParams round-trips the encoded body back to the original text.
    expect(body).toContain(message);
  });

  it('falls back to a generic subject when no name is provided', () => {
    const { subject, body } = parseMailto(buildContactMailto({ name: '   ', email: '', message: 'Need help' }));

    expect(subject).toBe('Message via E-Code contact form');

    // Empty name/email lines are omitted rather than rendered blank.
    expect(body).not.toContain('Name:');
    expect(body).not.toContain('Email:');
    expect(body).toContain('Need help');
  });

  it('trims whitespace from each field', () => {
    const { subject, body } = parseMailto(
      buildContactMailto({ name: '  Grace  ', email: '  grace@example.com  ', message: '  hi  ' }),
    );

    expect(subject).toBe('Message from Grace');
    expect(body).toContain('Name: Grace');
    expect(body).toContain('Email: grace@example.com');
    expect(body).toContain('hi');
  });

  it('carries the routing topic when one is selected', () => {
    const { body } = parseMailto(
      buildContactMailto({ name: 'Ada', email: 'ada@example.com', message: 'Press kit please', topic: 'Press' }),
    );

    expect(body).toContain('Topic: Press');
  });
});

describe('validateContactField', () => {
  it('requires name, email, and message', () => {
    expect(validateContactField('name', '   ')).toBe('Enter your name.');
    expect(validateContactField('email', '')).toBe('Enter your email.');
    expect(validateContactField('message', '')).toBe('Tell us briefly how we can help.');
  });

  it('rejects malformed email addresses and accepts valid ones', () => {
    expect(validateContactField('email', 'not-an-email')).toBe('Enter a valid email address.');
    expect(validateContactField('email', 'ada@example.com')).toBeUndefined();
  });

  it('accepts filled fields', () => {
    expect(validateContactField('name', 'Ada')).toBeUndefined();
    expect(validateContactField('message', 'Hello')).toBeUndefined();
  });
});
