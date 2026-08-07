import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  apiKeysWorkspaceSettingsEn,
  apiKeysWorkspaceSettingsFr,
  formatApiKeyCount,
  formatApiKeyDate,
  formatApiKeysWorkspaceSettingsNumber,
  formatWorkspaceSpaces,
  getApiKeysCopy,
  getThemePreferenceCopy,
  getWorkspaceSettingsCopy,
  interpolateApiKeysWorkspaceSettingsCopy,
  resolveApiKeyActionErrorCode,
} from './api-keys-workspace-settings';

const sourceFiles = [
  'app/routes/api-keys.tsx',
  'app/routes/workspace-settings.tsx',
  'app/components/settings/WorkspaceSettings.tsx',
  'app/components/ui/ThemePreferenceControl.tsx',
] as const;

function leafPaths(value: unknown, prefix = ''): string[] {
  if (typeof value === 'string') {
    return [prefix];
  }

  if (!value || typeof value !== 'object') {
    return [];
  }

  return Object.entries(value).flatMap(([key, nested]) => leafPaths(nested, prefix ? `${prefix}.${key}` : key));
}

function stringLeaves(value: unknown): string[] {
  if (typeof value === 'string') {
    return [value];
  }

  if (!value || typeof value !== 'object') {
    return [];
  }

  return Object.values(value).flatMap(stringLeaves);
}

function interpolationTokens(value: string): string[] {
  return [...value.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/gu)].map((match) => match[1]).sort();
}

describe('API keys and workspace settings EN/FR catalog', () => {
  it('keeps complete leaf and interpolation-token parity', () => {
    expect(leafPaths(apiKeysWorkspaceSettingsFr).sort()).toEqual(leafPaths(apiKeysWorkspaceSettingsEn).sort());

    const english = stringLeaves(apiKeysWorkspaceSettingsEn);
    const french = stringLeaves(apiKeysWorkspaceSettingsFr);

    expect(french).toHaveLength(english.length);

    for (const [index, value] of english.entries()) {
      expect(interpolationTokens(french[index] ?? ''), value).toEqual(interpolationTokens(value));
      expect(french[index]?.trim().length, value).toBeGreaterThan(0);
    }
  });

  it('falls back to English for every unsupported locale', () => {
    expect(getApiKeysCopy('de').shell.title).toBe('API keys');
    expect(getWorkspaceSettingsCopy('es').editor.wordWrap).toBe('Word wrap');
    expect(getThemePreferenceCopy('ar').system).toBe('System');
  });

  it('uses reviewed French terminology across API keys, workspaces and themes', () => {
    expect(getApiKeysCopy('fr').fields.scopes).toBe('Autorisations');
    expect(getApiKeysCopy('fr').scopes.write.label).toBe('Écriture');
    expect(getWorkspaceSettingsCopy('fr').header.title).toBe('Paramètres de l’espace de travail');
    expect(getWorkspaceSettingsCopy('fr').editor.vimMode).toBe('Mode Vim');
    expect(getThemePreferenceCopy('fr')).toEqual({
      ariaLabel: 'Thème',
      light: 'Clair',
      dark: 'Sombre',
      system: 'Système',
    });
  });

  it('formats French plurals, numbers and dates with locale punctuation', () => {
    expect(formatApiKeyCount('fr', 1)).toBe('1 clé');
    expect(formatApiKeyCount('fr', 1234)).toBe('1 234 clés');
    expect(formatApiKeyCount('en', 2)).toBe('2 keys');
    expect(formatWorkspaceSpaces('fr', 1)).toBe('1 espace');
    expect(formatWorkspaceSpaces('fr', 8)).toBe('8 espaces');
    expect(formatApiKeysWorkspaceSettingsNumber(1234567.5, 'fr')).toBe('1 234 567,5');
    expect(formatApiKeyDate('2026-07-14T18:05:00.000Z', 'fr')).toBe('14 juil. 2026');
  });

  it('interpolates user data without translating or mutating it', () => {
    expect(
      interpolateApiKeysWorkspaceSettingsCopy(getApiKeysCopy('fr').revoke.title, {
        name: 'CI_RELEASER_01',
      }),
    ).toBe('Révoquer la clé « CI_RELEASER_01 » ?');
  });

  it('maps API statuses to safe catalog codes instead of response bodies', () => {
    expect(resolveApiKeyActionErrorCode(403)).toBe('requestRejected');
    expect(resolveApiKeyActionErrorCode(404)).toBe('notFound');
    expect(resolveApiKeyActionErrorCode(409)).toBe('conflict');
    expect(resolveApiKeyActionErrorCode(429)).toBe('rateLimited');
    expect(resolveApiKeyActionErrorCode(400)).toBe('requestFailed');
  });

  it('has zero source-scanner findings in every owned rendered surface', async () => {
    const { scanSource } = await import('../../../../scripts/i18n/source-scanner.mjs');

    const findings = sourceFiles.flatMap((file) => {
      const result = scanSource(readFileSync(file, 'utf8'), file);

      expect(result.parseErrors, file).toEqual([]);

      return result.findings;
    });

    expect(findings).toEqual([]);
  });
});
