/**
 * Build a partial ("export selected categories") settings export object.
 *
 * The full export produced by `ImportExportService.exportSettings()` uses the
 * v2 structure, where the format marker lives at `_meta.version === '2.0'` and
 * there is NO top-level `exportDate`. `ImportExportService.importSettings()`
 * routes to its comprehensive parser only when `_meta.version === '2.0'` is
 * present; otherwise it falls back to a legacy parser that JSON-stringifies the
 * whole `providers` object into the `providers` cookie and corrupts it.
 *
 * Therefore a selected export MUST carry the `_meta` marker, or the file it
 * produces is silently un-importable and breaks the providers cookie on import.
 *
 * @param allSettings The full settings object from `exportSettings()`.
 * @param categoryIds The category keys (e.g. 'core', 'providers') to include.
 * @returns A filtered export object that round-trips through the v2 importer.
 */
export function buildFilteredSettingsExport(
  allSettings: Record<string, any>,
  categoryIds: string[],
): Record<string, any> {
  const filteredSettings: Record<string, any> = {
    // Preserve the v2 marker so re-import uses the comprehensive parser.
    _meta: {
      version: '2.0',
      exportDate: new Date().toISOString(),
      appVersion: allSettings?._meta?.appVersion ?? 'unknown',
    },
  };

  for (const category of categoryIds) {
    if (allSettings?.[category] !== undefined) {
      filteredSettings[category] = allSettings[category];
    }
  }

  return filteredSettings;
}
