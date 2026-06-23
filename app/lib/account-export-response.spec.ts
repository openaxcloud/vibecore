import { describe, expect, it } from 'vitest';
import { buildAccountExportResponse } from './account-export-response';

describe('buildAccountExportResponse', () => {
  it('uses a brand-neutral E-Code filename and does not leak the internal codename', async () => {
    const now = new Date('2026-06-23T12:34:56.000Z');
    const response = buildAccountExportResponse({ user: { id: 'u1' } }, now);

    const disposition = response.headers.get('content-disposition') ?? '';
    expect(disposition).toBe('attachment; filename="ecode-account-export-2026-06-23T12:34:56.000Z.json"');
    expect(disposition).not.toContain('vibecore');
  });

  it('streams a genuine parseable JSON body with matching headers', async () => {
    const payload = { user: { id: 'u1', email: 'a@b.co' }, projects: [] };
    const response = buildAccountExportResponse(payload, new Date('2026-01-01T00:00:00.000Z'));

    expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8');

    const text = await response.text();
    expect(JSON.parse(text)).toEqual(payload);
    expect(response.headers.get('content-length')).toBe(String(new TextEncoder().encode(text).byteLength));
  });
});
