import { describe, expect, it } from 'vitest';

import { checkOutboundUrl, isBlockedOutboundAddress } from './index.js';

/*
 * AUDX-006 — SSRF / DNS-rebinding guard.
 *
 * Two distinct failures, deliberately tested apart because they need different
 * mechanisms and either one alone leaves the service exploitable:
 *
 *  1. A literal address that must never be dialled (169.254.169.254 is the
 *     cloud-metadata credential endpoint).
 *  2. An ALLOWED NAME that RESOLVES somewhere forbidden — invisible to any
 *     string check on the hostname.
 */
const ALLOW = ['preview.e-code.ai'];
const PUBLIC_ADDRESS = ['93.184.216.34'];

describe('isBlockedOutboundAddress', () => {
  it('blocks cloud metadata, loopback and RFC1918', () => {
    expect(isBlockedOutboundAddress('169.254.169.254')).toBe(true);
    expect(isBlockedOutboundAddress('127.0.0.1')).toBe(true);
    expect(isBlockedOutboundAddress('10.4.5.6')).toBe(true);
    expect(isBlockedOutboundAddress('172.16.0.1')).toBe(true);
    expect(isBlockedOutboundAddress('192.168.1.1')).toBe(true);
  });

  it('blocks IPv6 loopback, unique-local and link-local', () => {
    expect(isBlockedOutboundAddress('::1')).toBe(true);
    expect(isBlockedOutboundAddress('fd00::1')).toBe(true);
    expect(isBlockedOutboundAddress('fe80::1')).toBe(true);
  });

  /*
   * IPv4-mapped IPv6 is the classic bypass: ::ffff:169.254.169.254 is the
   * metadata address wearing a different notation.
   */
  it('blocks an IPv4-mapped IPv6 metadata address', () => {
    expect(isBlockedOutboundAddress('::ffff:169.254.169.254')).toBe(true);
  });

  it('allows an ordinary public address', () => {
    expect(isBlockedOutboundAddress('93.184.216.34')).toBe(false);
    expect(isBlockedOutboundAddress('2606:2800:220:1::1')).toBe(false);
  });
});

describe('checkOutboundUrl', () => {
  /*
   * THE defect this replaces: an empty allowlist used to mean "skip the check".
   * A configuration error must fail closed, not open.
   */
  it('refuses everything when the allowlist is empty', async () => {
    await expect(checkOutboundUrl('https://anything.example/', { allowedHostSuffixes: [] })).resolves.toBe(
      'ALLOWLIST_EMPTY',
    );
  });

  it('refuses a literal metadata address even with an allowlist set', async () => {
    await expect(
      checkOutboundUrl('http://169.254.169.254/latest/meta-data/', { allowedHostSuffixes: ALLOW }),
    ).resolves.toBe('BLOCKED_ADDRESS');
  });

  it('refuses a host outside the allowlist', async () => {
    await expect(
      checkOutboundUrl('https://evil.example/', {
        allowedHostSuffixes: ALLOW,
        resolveHost: async () => PUBLIC_ADDRESS,
      }),
    ).resolves.toBe('HOST_NOT_ALLOWED');
  });

  it('refuses a non-http protocol', async () => {
    await expect(checkOutboundUrl('file:///etc/passwd', { allowedHostSuffixes: ALLOW })).resolves.toBe(
      'UNSUPPORTED_PROTOCOL',
    );
  });

  /*
   * The rebinding case. The hostname is a legitimate subdomain of an allowed
   * suffix — a string check passes it — but it resolves to cloud metadata.
   */
  it('refuses an ALLOWED hostname that resolves to a blocked address', async () => {
    await expect(
      checkOutboundUrl('https://tenant.preview.e-code.ai/', {
        allowedHostSuffixes: ALLOW,
        resolveHost: async () => ['169.254.169.254'],
      }),
    ).resolves.toBe('BLOCKED_ADDRESS');
  });

  /* One blocked address among several is still a refusal. */
  it('refuses when only ONE of several resolved addresses is blocked', async () => {
    await expect(
      checkOutboundUrl('https://tenant.preview.e-code.ai/', {
        allowedHostSuffixes: ALLOW,
        resolveHost: async () => ['93.184.216.34', '10.0.0.5'],
      }),
    ).resolves.toBe('BLOCKED_ADDRESS');
  });

  it('refuses a hostname that cannot be resolved', async () => {
    await expect(
      checkOutboundUrl('https://tenant.preview.e-code.ai/', {
        allowedHostSuffixes: ALLOW,
        resolveHost: async () => {
          throw new Error('NXDOMAIN');
        },
      }),
    ).resolves.toBe('RESOLUTION_FAILED');
  });

  /*
   * allowAnyPublicHost — for callers whose destination set is "the internet"
   * (git clone from any forge, a customer's SIEM webhook). It waives the host
   * ALLOWLIST and nothing else: waiving the address checks too would make it a
   * bypass rather than a mode.
   */
  it('still refuses private and metadata addresses under allowAnyPublicHost', async () => {
    await expect(
      checkOutboundUrl('http://169.254.169.254/latest/meta-data/', {
        allowedHostSuffixes: [],
        allowAnyPublicHost: true,
      }),
    ).resolves.toBe('BLOCKED_ADDRESS');

    await expect(
      checkOutboundUrl('https://internal.corp/', {
        allowedHostSuffixes: [],
        allowAnyPublicHost: true,
        resolveHost: async () => ['10.1.2.3'],
      }),
    ).resolves.toBe('BLOCKED_ADDRESS');
  });

  it('refuses a non-http scheme under allowAnyPublicHost (file:// is a local read)', async () => {
    await expect(
      checkOutboundUrl('file:///etc/passwd', { allowedHostSuffixes: [], allowAnyPublicHost: true }),
    ).resolves.toBe('UNSUPPORTED_PROTOCOL');
  });

  it('allows an arbitrary public forge under allowAnyPublicHost', async () => {
    await expect(
      checkOutboundUrl('https://gitlab.example.org/team/repo.git', {
        allowedHostSuffixes: [],
        allowAnyPublicHost: true,
        resolveHost: async () => ['93.184.216.34'],
      }),
    ).resolves.toBeUndefined();
  });

  /* An empty allowlist WITHOUT the opt-in must still fail closed. */
  it('does not let allowAnyPublicHost be reached by forgetting the allowlist', async () => {
    await expect(checkOutboundUrl('https://anything.example/', { allowedHostSuffixes: [] })).resolves.toBe(
      'ALLOWLIST_EMPTY',
    );
  });

  /*
   * Rule 19: the guard must let ordinary work through, or it gets reverted
   * rather than fixed.
   */
  it('allows a legitimate preview host resolving to a public address', async () => {
    await expect(
      checkOutboundUrl('https://ws-1-5173.preview.e-code.ai/', {
        allowedHostSuffixes: ALLOW,
        resolveHost: async () => PUBLIC_ADDRESS,
      }),
    ).resolves.toBeUndefined();
  });
});
