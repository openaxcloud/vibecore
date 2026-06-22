import { describe, it, expect } from 'vitest';
import { buildFilteredSettingsExport } from '~/lib/hooks/buildFilteredSettingsExport';

/*
 * The full export shape returned by ImportExportService.exportSettings():
 * the version marker lives at `_meta.version`, NOT at a top-level `exportDate`.
 */
const fullExport = {
  core: { theme: 'dark' },
  providers: { provider_settings: '{}', apiKeys: 'x', providers: '{}' },
  ui: { promptId: 'default' },
  _raw: { localStorage: {}, cookies: {} },
  _meta: { version: '2.0', exportDate: '2026-01-01T00:00:00.000Z', appVersion: '1.2.3' },
};

describe('buildFilteredSettingsExport', () => {
  it('includes the v2 _meta.version marker so re-import uses the comprehensive parser', () => {
    const result = buildFilteredSettingsExport(fullExport, ['providers']);

    // This is the crux of the bug: without _meta.version the importer corrupts the providers cookie.
    expect(result._meta?.version).toBe('2.0');
    expect(typeof result._meta?.exportDate).toBe('string');
  });

  it('includes only the selected categories', () => {
    const result = buildFilteredSettingsExport(fullExport, ['core', 'providers']);

    expect(result.core).toEqual(fullExport.core);
    expect(result.providers).toEqual(fullExport.providers);
    expect(result.ui).toBeUndefined();
    expect(result._raw).toBeUndefined();
  });

  it('skips categories absent from the source settings', () => {
    const result = buildFilteredSettingsExport(fullExport, ['core', 'doesNotExist']);

    expect(result.core).toEqual(fullExport.core);
    expect('doesNotExist' in result).toBe(false);
  });

  it('falls back to a default appVersion when the source _meta is missing', () => {
    const result = buildFilteredSettingsExport({ core: { theme: 'light' } }, ['core']);

    expect(result._meta?.version).toBe('2.0');
    expect(result._meta?.appVersion).toBe('unknown');
  });
});
