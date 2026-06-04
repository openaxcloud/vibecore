import { describe, expect, it } from 'vitest';
import { isAllowedUrl, isPrivateIp, isValidUrl } from './url';

describe('isValidUrl', () => {
  it('accepts http and https', () => {
    expect(isValidUrl('http://example.com')).toBe(true);
    expect(isValidUrl('https://example.com/path?q=1')).toBe(true);
  });

  it('rejects non-http(s) schemes and garbage', () => {
    expect(isValidUrl('ftp://example.com')).toBe(false);
    expect(isValidUrl('file:///etc/passwd')).toBe(false);
    expect(isValidUrl('not a url')).toBe(false);
  });
});

describe('isAllowedUrl', () => {
  it('allows public hostnames', () => {
    expect(isAllowedUrl('https://example.com')).toBe(true);
    expect(isAllowedUrl('https://1.1.1.1')).toBe(true);
  });

  it('blocks localhost and loopback/private literals', () => {
    expect(isAllowedUrl('http://localhost')).toBe(false);
    expect(isAllowedUrl('http://127.0.0.1')).toBe(false);
    expect(isAllowedUrl('http://10.0.0.5')).toBe(false);
    expect(isAllowedUrl('http://172.16.0.1')).toBe(false);
    expect(isAllowedUrl('http://192.168.1.1')).toBe(false);
    expect(isAllowedUrl('http://169.254.169.254')).toBe(false); // cloud metadata
    expect(isAllowedUrl('http://0.0.0.0')).toBe(false);
  });
});

describe('isPrivateIp', () => {
  it('flags IPv4 private / loopback / link-local ranges', () => {
    expect(isPrivateIp('127.0.0.1')).toBe(true);
    expect(isPrivateIp('10.1.2.3')).toBe(true);
    expect(isPrivateIp('172.31.255.255')).toBe(true);
    expect(isPrivateIp('192.168.0.1')).toBe(true);
    expect(isPrivateIp('169.254.169.254')).toBe(true);
  });

  it('flags IPv6 loopback / unique-local / link-local', () => {
    expect(isPrivateIp('::1')).toBe(true);
    expect(isPrivateIp('::')).toBe(true);
    expect(isPrivateIp('fc00::1')).toBe(true);
    expect(isPrivateIp('fd12:3456::1')).toBe(true);
    expect(isPrivateIp('fe80::1')).toBe(true);
  });

  it('flags IPv4-mapped IPv6 pointing at internal addresses', () => {
    expect(isPrivateIp('::ffff:169.254.169.254')).toBe(true);
    expect(isPrivateIp('::ffff:10.0.0.1')).toBe(true);
  });

  it('allows public addresses', () => {
    expect(isPrivateIp('8.8.8.8')).toBe(false);
    expect(isPrivateIp('1.1.1.1')).toBe(false);
    expect(isPrivateIp('2606:4700:4700::1111')).toBe(false);
  });
});
