import { describe, expect, it } from 'vitest';
import { buildAgentMemoryExportResponse } from '~/lib/agent-memory-export-response';

describe('buildAgentMemoryExportResponse', () => {
  it('returns a real Response whose body is valid, parseable JSON', async () => {
    const payload = { memories: [{ id: 'a', content: 'hello' }], projectId: 'p1' };
    const res = buildAgentMemoryExportResponse(payload);

    expect(res).toBeInstanceOf(Response);

    const text = await res.text();

    // Must round-trip through JSON.parse without turbo-stream artifacts.
    expect(() => JSON.parse(text)).not.toThrow();
    expect(JSON.parse(text)).toEqual(payload);

    // Pretty-printed with 2-space indentation (matches api.auth.export.ts).
    expect(text).toContain('\n  "memories"');
  });

  it('sets JSON content-type and attachment headers', () => {
    const now = new Date('2026-06-22T12:34:56.000Z');
    const res = buildAgentMemoryExportResponse({ ok: true }, now);

    expect(res.headers.get('content-type')).toBe('application/json; charset=utf-8');
    expect(res.headers.get('content-disposition')).toBe(
      'attachment; filename="agent-memory-2026-06-22T12:34:56.000Z.json"',
    );
  });

  it('sets a byte-accurate content-length for non-ASCII payloads', async () => {
    const payload = { note: 'café — 日本語' };
    const res = buildAgentMemoryExportResponse(payload);

    const body = await res.clone().text();
    const expectedBytes = new TextEncoder().encode(body).byteLength;

    expect(res.headers.get('content-length')).toBe(String(expectedBytes));

    // Multi-byte chars mean byte length exceeds the JS string length.
    expect(expectedBytes).toBeGreaterThan(body.length);
  });
});
