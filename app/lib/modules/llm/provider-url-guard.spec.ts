import { describe, expect, it } from 'vitest';
import { isBlockedProviderBaseUrl } from './provider-url-guard';

describe('isBlockedProviderBaseUrl', () => {
  it('blocks cloud-metadata and link-local even when private is allowed', () => {
    for (const allowPrivate of [false, true]) {
      expect(isBlockedProviderBaseUrl('http://169.254.169.254/latest/meta-data', allowPrivate)).toBe(true);
      expect(isBlockedProviderBaseUrl('https://[fe80::1]/v1', allowPrivate)).toBe(true);
      expect(isBlockedProviderBaseUrl('http://foo.internal/v1', allowPrivate)).toBe(true);
    }
  });

  it('blocks private / RFC1918 / ULA by default', () => {
    expect(isBlockedProviderBaseUrl('http://10.0.0.5/v1')).toBe(true);
    expect(isBlockedProviderBaseUrl('http://192.168.1.10/v1')).toBe(true);
    expect(isBlockedProviderBaseUrl('http://172.16.0.1/v1')).toBe(true);
    expect(isBlockedProviderBaseUrl('http://[::ffff:10.0.0.1]/v1')).toBe(true);
    expect(isBlockedProviderBaseUrl('not a url')).toBe(true);
  });

  it('allows loopback (local providers like Ollama / LM Studio)', () => {
    expect(isBlockedProviderBaseUrl('http://localhost:11434/v1')).toBe(false);
    expect(isBlockedProviderBaseUrl('http://127.0.0.1:1234/v1')).toBe(false);
    expect(isBlockedProviderBaseUrl('http://[::1]:11434/v1')).toBe(false);
  });

  it('blocks the IPv6 unspecified address :: like 0.0.0.0 (not treated as loopback)', () => {
    expect(isBlockedProviderBaseUrl('http://[::]/v1')).toBe(true);
    expect(isBlockedProviderBaseUrl('http://[::]:11434/v1')).toBe(true);

    // mirrors the existing 0.0.0.0 handling: blocked by default
    expect(isBlockedProviderBaseUrl('http://0.0.0.0/v1')).toBe(true);
  });

  it('allows public endpoints', () => {
    expect(isBlockedProviderBaseUrl('https://api.openai.com/v1')).toBe(false);
    expect(isBlockedProviderBaseUrl('https://api.together.xyz')).toBe(false);
  });

  it('allows private hosts only when explicitly opted in (self-host)', () => {
    expect(isBlockedProviderBaseUrl('http://10.0.0.5/v1', true)).toBe(false);
    expect(isBlockedProviderBaseUrl('http://192.168.1.10/v1', true)).toBe(false);
  });
});
