import { describe, expect, it } from 'vitest';
import {
  IMPORT_HUB_CREDENTIAL_IDS,
  IMPORT_HUB_PROVIDERS,
  IMPORT_HUB_READY_IDS,
  getImportHubProvider,
  type ImportHubProviderId,
} from './import-hub';

/**
 * The hub must present exactly the twelve documented Replit-parity sources, in a
 * stable set, with an honest status per provider. These assertions mirror the
 * backend contract (`IMPORT_HUB_PROVIDERS` in import-pipeline.ts) so a drift
 * between the UI and the backend is caught here.
 */
const EXPECTED_IDS: ImportHubProviderId[] = [
  'github',
  'bitbucket',
  'zip',
  'spreadsheet',
  'bolt',
  'lovable',
  'base44',
  'previous-agent-export',
  'empty',
  'vercel',
  'figma',
  'claude',
];

describe('import hub registry', () => {
  it('exposes exactly the twelve documented sources', () => {
    expect(IMPORT_HUB_PROVIDERS).toHaveLength(12);
    expect(new Set(IMPORT_HUB_PROVIDERS.map((provider) => provider.id))).toEqual(new Set(EXPECTED_IDS));
  });

  it('never lists screenshot as a source', () => {
    expect(IMPORT_HUB_PROVIDERS.map((provider) => provider.id)).not.toContain('screenshot');
  });

  it('gives every provider a label, description and in-app destination', () => {
    for (const provider of IMPORT_HUB_PROVIDERS) {
      expect(provider.label.length).toBeGreaterThan(0);
      expect(provider.description.length).toBeGreaterThan(0);
      expect(provider.to.startsWith('/')).toBe(true);
    }
  });

  it('marks only the external-API providers as credential-gated', () => {
    expect(new Set(IMPORT_HUB_CREDENTIAL_IDS)).toEqual(new Set(['vercel', 'figma', 'claude']));

    // Everything else has a real, executing path today.
    expect(IMPORT_HUB_READY_IDS).toContain('github');
    expect(IMPORT_HUB_READY_IDS).toContain('zip');
    expect(IMPORT_HUB_READY_IDS).toContain('empty');
    expect(IMPORT_HUB_READY_IDS).toContain('spreadsheet');
    expect(IMPORT_HUB_READY_IDS.length + IMPORT_HUB_CREDENTIAL_IDS.length).toBe(12);
  });

  it('resolves providers by id', () => {
    expect(getImportHubProvider('github')?.label).toBe('GitHub');
    expect(getImportHubProvider('nope')).toBeUndefined();
  });
});
