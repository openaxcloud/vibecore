import { describe, expect, it } from 'vitest';
import { isNetlifySiteForChat } from './NetlifyDeploymentLink.client';

describe('isNetlifySiteForChat', () => {
  it('matches the brand-prefixed site for the chat', () => {
    expect(isNetlifySiteForChat('ecode-123-1700000000000', '123')).toBe(true);
  });

  it('matches the legacy upstream-prefixed site for the chat', () => {
    expect(isNetlifySiteForChat('bolt-diy-123-1700000000000', '123')).toBe(true);
  });

  it('does not match a different chat whose id shares this id as a prefix', () => {
    // Regression: chatId `12` must NOT resolve site for chatId `123`.
    expect(isNetlifySiteForChat('ecode-123-1700000000000', '12')).toBe(false);
    expect(isNetlifySiteForChat('bolt-diy-123-1700000000000', '12')).toBe(false);
  });

  it('does not match a different chat whose id has this id as a substring elsewhere', () => {
    expect(isNetlifySiteForChat('ecode-9123-1700000000000', '123')).toBe(false);
  });

  it('matches an exact base name with no timestamp suffix', () => {
    expect(isNetlifySiteForChat('ecode-123', '123')).toBe(true);
  });

  it('returns false for an empty chatId', () => {
    expect(isNetlifySiteForChat('ecode-123-1700000000000', '')).toBe(false);
  });

  it('does not match an unrelated site name', () => {
    expect(isNetlifySiteForChat('my-portfolio-site', '123')).toBe(false);
  });
});
