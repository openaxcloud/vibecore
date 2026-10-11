import { describe, expect, it } from 'vitest';
import { defaultOrganizationName } from './default-organization-name.js';

/** UIB-05 — le nom d'organisation par défaut suit la langue du compte. */
describe('defaultOrganizationName', () => {
  it('en français, sans aucun mot anglais', () => {
    expect(defaultOrganizationName('Parcours UI bureau', 'fr')).toBe('Organisation de Parcours UI bureau');
    expect(defaultOrganizationName('Parcours UI bureau', 'fr')).not.toMatch(/Organization|'s /);
  });

  it('élide devant une voyelle ou un h', () => {
    expect(defaultOrganizationName('Ada Lovelace', 'fr')).toBe('Organisation d’Ada Lovelace');
    expect(defaultOrganizationName('Hélène', 'fr')).toBe('Organisation d’Hélène');
    expect(defaultOrganizationName('ui-bureau@local.test', 'fr')).toBe('Organisation d’ui-bureau@local.test');
  });

  it('garde la forme anglaise en anglais', () => {
    expect(defaultOrganizationName('Ada', 'en')).toBe("Ada's Organization");
  });
});
