import { describe, expect, it } from 'vitest';
import { buildVercelProjectName, sanitizeVercelNameFragment } from './vercel-project-name';

describe('sanitizeVercelNameFragment', () => {
  it('lowercases and keeps alphanumerics', () => {
    expect(sanitizeVercelNameFragment('AbC123')).toBe('abc123');
  });

  it('replaces disallowed characters with a single hyphen', () => {
    expect(sanitizeVercelNameFragment('my chat/id!')).toBe('my-chat-id');
  });

  it('trims leading and trailing separators', () => {
    expect(sanitizeVercelNameFragment('__weird__')).toBe('weird');
  });
});

describe('buildVercelProjectName', () => {
  it('uses the brand-correct ecode prefix, not the upstream codename', () => {
    const name = buildVercelProjectName('abc', 1700000000000);
    expect(name).toBe('ecode-abc-1700000000000');
    expect(name).not.toContain('bolt');
  });

  it('sanitizes the chat id into the allowed Vercel charset', () => {
    const name = buildVercelProjectName('Chat ID/42', 1700000000000);
    expect(name).toBe('ecode-chat-id-42-1700000000000');
    expect(name).toMatch(/^[a-z0-9._-]+$/);
  });

  it('falls back gracefully when the chat id sanitizes to nothing', () => {
    const name = buildVercelProjectName('///', 1700000000000);
    expect(name).toBe('ecode-1700000000000');
  });

  it('never exceeds the Vercel 100-char limit and has no trailing separator', () => {
    const name = buildVercelProjectName('x'.repeat(200), 1700000000000);
    expect(name.length).toBeLessThanOrEqual(100);
    expect(name).not.toMatch(/-$/);
  });
});
