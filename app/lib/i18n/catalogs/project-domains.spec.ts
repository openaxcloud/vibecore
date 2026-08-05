import { describe, expect, it } from 'vitest';

import { formatProjectDomainsCopy, getProjectDomainsCopy, projectDomainsEn, projectDomainsFr } from './project-domains';

function interpolationTokens(value: string): string[] {
  return [...value.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/gu)].map((match) => match[1]).sort();
}

describe('project domains i18n', () => {
  it('keeps complete EN/FR catalogs with matching interpolation', () => {
    expect(Object.keys(projectDomainsFr).sort()).toEqual(Object.keys(projectDomainsEn).sort());

    for (const key of Object.keys(projectDomainsEn) as Array<keyof typeof projectDomainsEn>) {
      expect(projectDomainsEn[key].trim().length, key).toBeGreaterThan(0);
      expect(projectDomainsFr[key].trim().length, key).toBeGreaterThan(0);
      expect(interpolationTokens(projectDomainsFr[key]), key).toEqual(interpolationTokens(projectDomainsEn[key]));
    }
  });

  it('uses professional French and preserves domain and DNS values during interpolation', () => {
    const copy = getProjectDomainsCopy('fr-CA');

    expect(copy['projectDomains.page.title']).toBe('Domaines personnalisés');
    expect(copy['projectDomains.verify.submit']).toBe('Revérifier le DNS');
    expect(formatProjectDomainsCopy(copy['projectDomains.dns.title'], { domain: 'app.customer.example' })).toBe(
      'Ajouter l’enregistrement DNS de app.customer.example',
    );
  });

  it('falls back to English for unsupported languages without exposing a key', () => {
    const copy = getProjectDomainsCopy('de-DE');

    expect(copy['projectDomains.page.title']).toBe('Custom domains');
    expect(copy['projectDomains.error.serviceUnavailable']).not.toContain('projectDomains.');
  });
});
