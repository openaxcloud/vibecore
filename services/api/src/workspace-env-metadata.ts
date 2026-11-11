/**
 * Platform panel records stored in the env-vars table for historical reasons.
 * They remain available to panel APIs, but are not application environment.
 * Keep this an exact list: user-defined VIBECORE_* variables are not metadata.
 */
const IDE_METADATA_ENV_KEYS = new Set([
  'VIBECORE_IDE_SETTINGS_STATE',
  'VIBECORE_INTEGRATIONS_STATE',
  'VIBECORE_TERMINAL_STATE',
  'VIBECORE_PACKAGES_STATE',
  'VIBECORE_DEBUGGER_STATE',
  'VIBECORE_EXTENSIONS_STATE',
  'VIBECORE_PORTS_STATE',
  'VIBECORE_WORKFLOWS_STATE',
  'VIBECORE_SECURITY_STATE',
]);

export function isIdeMetadataEnvKey(key: string): boolean {
  return IDE_METADATA_ENV_KEYS.has(key);
}
