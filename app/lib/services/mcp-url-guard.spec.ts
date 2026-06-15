import { describe, expect, it } from 'vitest';
import { isBlockedMcpUrl } from './mcp-url-guard';

describe('MCP URL SSRF guard', () => {
  it('allows public HTTPS MCP server URLs', () => {
    expect(isBlockedMcpUrl('https://mcp.example.com/sse')).toBe(false);
    expect(isBlockedMcpUrl('https://subdomain.example.org/v1/mcp')).toBe(false);
  });

  it('blocks non-HTTPS and unparseable URLs', () => {
    expect(isBlockedMcpUrl('http://mcp.example.com/sse')).toBe(true);
    expect(isBlockedMcpUrl('not a url')).toBe(true);
  });

  it('blocks loopback, private, metadata and service-discovery hosts', () => {
    expect(isBlockedMcpUrl('https://localhost/sse')).toBe(true);
    expect(isBlockedMcpUrl('https://127.0.0.1:3000/sse')).toBe(true);
    expect(isBlockedMcpUrl('https://10.0.0.5/sse')).toBe(true);
    expect(isBlockedMcpUrl('https://172.16.4.5/sse')).toBe(true);
    expect(isBlockedMcpUrl('https://192.168.1.10/sse')).toBe(true);
    expect(isBlockedMcpUrl('https://169.254.169.254/latest/meta-data')).toBe(true);
    expect(isBlockedMcpUrl('https://metadata.google.internal/computeMetadata/v1')).toBe(true);
    expect(isBlockedMcpUrl('https://service.namespace.local/sse')).toBe(true);
  });

  it('blocks IPv4-compatible and transition IPv6 encodings', () => {
    expect(isBlockedMcpUrl('https://[::ffff:127.0.0.1]/sse')).toBe(true);
    expect(isBlockedMcpUrl('https://[::ffff:7f00:0001]/sse')).toBe(true);
    expect(isBlockedMcpUrl('https://[64:ff9b::7f00:1]/sse')).toBe(true);
    expect(isBlockedMcpUrl('https://[2002:0a00:0001::]/sse')).toBe(true);
  });
});
