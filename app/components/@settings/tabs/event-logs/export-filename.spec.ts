import { describe, expect, it } from 'vitest';
import { buildExportFilename } from './export-filename';

describe('buildExportFilename', () => {
  const date = new Date('2026-06-23T12:34:56.789Z');

  it('uses the E-Code brand prefix, not the upstream codename', () => {
    const name = buildExportFilename('json', date);
    expect(name.startsWith('ecode-event-logs-')).toBe(true);
    expect(name).not.toContain('bolt');
  });

  it('produces a Windows-safe filename with no colons or dots in the timestamp', () => {
    const name = buildExportFilename('csv', date);

    // The only dot allowed is the one before the extension.
    expect(name).toBe('ecode-event-logs-2026-06-23T12-34-56-789Z.csv');
    expect(name).not.toContain(':');

    const timestampPart = name.slice('ecode-event-logs-'.length, name.lastIndexOf('.'));
    expect(timestampPart).not.toContain('.');
  });

  it('appends the requested extension', () => {
    expect(buildExportFilename('pdf', date).endsWith('.pdf')).toBe(true);
    expect(buildExportFilename('txt', date).endsWith('.txt')).toBe(true);
  });
});
