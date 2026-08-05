import { describe, expect, it } from 'vitest';

import { CONNECTOR_CATALOG_SEEDS, getConnectorCatalogSeeds } from './seed-connector-catalog.js';

describe('localized connector seed catalog', () => {
  it('keeps English as the persistence-compatible default', () => {
    expect(getConnectorCatalogSeeds()).toBe(CONNECTOR_CATALOG_SEEDS);
    expect(CONNECTOR_CATALOG_SEEDS.find((entry) => entry.provider === 'vercel')?.description).toContain('Manage');
  });

  it('localizes user-facing copy without translating technical identifiers', () => {
    const english = getConnectorCatalogSeeds('en-US').find((entry) => entry.provider === 'github');
    const french = getConnectorCatalogSeeds('fr-FR').find((entry) => entry.provider === 'github');

    expect(french?.description).toContain('Accédez aux dépôts');
    expect(french?.provider).toBe(english?.provider);
    expect(french?.defaultScopes).toEqual(english?.defaultScopes);
    expect(french?.triggersSupported).toEqual(english?.triggersSupported);
    expect(french?.triggerDescriptions?.commit_created).toBe('Commit créé');
  });

  it('falls back to English for unsupported locales and keeps API field names stable', () => {
    const fallback = getConnectorCatalogSeeds('de-DE').find((entry) => entry.provider === 'supabase');
    const french = getConnectorCatalogSeeds('fr').find((entry) => entry.provider === 'supabase');

    expect(fallback?.description).toContain('Access Supabase');
    expect(french?.apiKeyFields?.[0]).toMatchObject({
      name: 'accessToken',
      label: 'Jeton d’accès',
      type: 'password',
      required: true,
    });
  });
});
