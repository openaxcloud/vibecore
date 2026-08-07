import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { settingsEn, settingsFr } from './settings';

const sourceFiles = [
  'app/components/@settings/tabs/providers/local/SetupGuide.tsx',
  'app/components/@settings/tabs/providers/local/LocalProvidersTab.tsx',
  'app/components/@settings/tabs/providers/local/StatusDashboard.tsx',
  'app/components/@settings/tabs/providers/local/HealthStatusBadge.tsx',
  'app/components/@settings/tabs/providers/local/ErrorBoundary.tsx',
  'app/components/@settings/tabs/providers/local/ModelCard.tsx',
  'app/components/@settings/tabs/providers/local/ProviderCard.tsx',
  'app/components/@settings/tabs/netlify/NetlifyTab.tsx',
  'app/components/@settings/tabs/netlify/components/NetlifyConnection.tsx',
  'app/components/@settings/tabs/supabase/SupabaseTab.tsx',
  'app/components/@settings/tabs/vercel/VercelTab.tsx',
  'app/components/@settings/tabs/vercel/components/VercelConnection.tsx',
  'app/components/@settings/tabs/event-logs/EventLogsTab.tsx',
  'app/components/@settings/tabs/mcp/McpMarketplace.tsx',
  'app/components/@settings/tabs/mcp/McpTab.tsx',
  'app/components/@settings/tabs/mcp/McpStatusBadge.tsx',
  'app/components/@settings/tabs/mcp/McpServerList.tsx',
  'app/components/@settings/tabs/mcp/McpServerListItem.tsx',
] as const;

const interpolationTokens = (value: string) =>
  [...value.matchAll(/\{([a-zA-Z0-9_]+)\}/gu)].map((match) => match[1]).sort();

const approvedFrenchIdentity =
  /^(?:Alias|alias:|API|Buckets:?|Cloud|Communication|Configuration(?: JSON)?|CPU|DevOps|GPU|Groq|Jan\.ai|KoboldAI|Linux|LLM|Local|macOS|Message|ms\)?|ollama\.com\/library|Oobabooga|OpenRouter|RAM|Sites|Source|Tables|Together AI|· v|Version|Windows)$/u;

const stripProtectedTechnicalText = (value: string) =>
  value
    .replace(/`[^`]*`/gu, '')
    .replace(/\bpackage\.json\b/giu, '')
    .replace(/\b(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?[a-z0-9:_-]+\b/giu, '')
    .replace(/\bhttps?:\/\/\S+/giu, '');

describe('Settings EN/FR catalog', () => {
  it('keeps complete keys and interpolation tokens in parity', () => {
    expect(Object.keys(settingsFr).sort()).toEqual(Object.keys(settingsEn).sort());

    for (const key of Object.keys(settingsEn) as Array<keyof typeof settingsEn>) {
      expect(settingsEn[key].trim().length, key).toBeGreaterThan(0);
      expect(settingsFr[key].trim().length, key).toBeGreaterThan(0);
      expect(interpolationTokens(settingsFr[key]), key).toEqual(interpolationTokens(settingsEn[key]));
      expect(settingsFr[key], key).not.toMatch(/^settings\./u);
    }
  });

  it('documents every intentionally identical brand, protocol, unit, or French cognate', () => {
    const unexpected = Object.keys(settingsEn)
      .filter((key) => settingsEn[key as keyof typeof settingsEn] === settingsFr[key as keyof typeof settingsFr])
      .map((key) => settingsEn[key as keyof typeof settingsEn])
      .filter((value) => !approvedFrenchIdentity.test(value));

    expect(unexpected).toEqual([]);
  });

  it('contains every statically referenced key, including plural families', () => {
    const used = new Set<string>();

    for (const file of sourceFiles) {
      const source = readFileSync(file, 'utf8');

      for (const match of source.matchAll(/\bt\(\s*['"](settings\.[^'"]+)['"]/gu)) {
        used.add(match[1]);
      }
    }

    const missing = [...used].filter(
      (key) => !(key in settingsEn) && !(`${key}_one` in settingsEn && `${key}_other` in settingsEn),
    );

    expect(missing).toEqual([]);
  });

  it('has zero scanner findings in every owned settings surface', async () => {
    const { scanSource } = await import('../../../../scripts/i18n/source-scanner.mjs');

    const findings = sourceFiles.flatMap((file) => {
      const result = scanSource(readFileSync(file, 'utf8'), file);

      expect(result.parseErrors, file).toEqual([]);

      return result.findings;
    });

    expect(findings).toEqual([]);
  });

  it('uses reviewed French terminology for integrations and operations', () => {
    expect(settingsFr['settings.copy.deployments_842a4697']).toBe('Déploiements');
    expect(settingsFr['settings.copy.apiToken_c85b0e36']).toBe('Jeton d’API');
    expect(settingsFr['settings.copy.localAiProviders_96f3a73f']).toBe('Fournisseurs d’IA locaux');
    expect(settingsFr['settings.mcp.configuration.save']).toBe('Enregistrer la configuration');
    expect(settingsFr['settings.netlify.action.triggerBuild']).toBe('Déclencher une compilation');
    expect(settingsFr['settings.netlify.build.failed']).toContain('journaux de compilation Netlify');
    expect(settingsFr['settings.copy.marketplace_c608981d']).toBe('Place de marché');
  });

  it('keeps glossary terms out of visible French prose while preserving technical text', () => {
    const visibleFrenchCopy = Object.values(settingsFr).map(stripProtectedTechnicalText).join('\n');

    expect(visibleFrenchCopy).not.toMatch(
      /\b(?:build(?:s|ing)?|logs?|marketplace|preview|snapshots?|packages?|workspaces?|runtime)\b/iu,
    );

    const glossaryPairs = [
      { english: /\bbuild(?:s|ing)?\b/iu, french: /\bcompilation(?:s)?\b/iu },
      { english: /\bmarketplace\b/iu, french: /\bplace de marché/iu },
    ] as const;

    for (const { english, french } of glossaryPairs) {
      for (const key of Object.keys(settingsEn) as Array<keyof typeof settingsEn>) {
        if (english.test(settingsEn[key])) {
          expect(settingsFr[key], key).toMatch(french);
        }
      }
    }
  });
});
