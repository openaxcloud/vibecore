import { describe, expect, it } from 'vitest';
import { formatDatabasePanelBytes } from './DatabasePanel';

describe('formatDatabasePanelBytes', () => {
  it('uses French numbers, non-breaking spacing, and storage units', () => {
    expect(formatDatabasePanelBytes(1.5 * 1024 * 1024, 'fr-FR')).toBe('1,50 Mo');
    expect(formatDatabasePanelBytes(1.5 * 1024 * 1024 * 1024, 'fr-FR')).toBe('1,50 Go');
    expect(formatDatabasePanelBytes(0, 'fr-FR')).toBe('0,00 Mo');
  });

  it('keeps the English fallback formatting', () => {
    expect(formatDatabasePanelBytes(1.5 * 1024 * 1024, 'en-GB')).toBe('1.50MB');
  });
});
