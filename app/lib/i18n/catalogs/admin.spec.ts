import { describe, expect, it } from 'vitest';

import { adminCatalog, translateAdmin } from './admin';
import { adminRouteCatalog, translateAdminRoute } from './admin-route';

function interpolationTokens(value: string): string[] {
  return [...value.matchAll(/\{([a-zA-Z0-9_]+)\}/gu)].map((match) => match[1]).sort();
}

function expectCatalogParity(catalog: {
  en: Readonly<Record<string, string>>;
  fr: Readonly<Record<string, string>>;
}): void {
  expect(Object.keys(catalog.fr).sort()).toEqual(Object.keys(catalog.en).sort());

  for (const key of Object.keys(catalog.en)) {
    expect(interpolationTokens(catalog.fr[key]), key).toEqual(interpolationTokens(catalog.en[key]));
    expect(catalog.fr[key].trim(), key).not.toBe('');
  }
}

describe('admin translation catalogs', () => {
  it('keeps standalone and Remix admin keys and interpolation tokens in exact parity', () => {
    expectCatalogParity(adminCatalog);
    expectCatalogParity(adminRouteCatalog);
  });

  it('uses the approved French admin vocabulary consistently', () => {
    expect(adminCatalog.fr['admin.standalone.workspace_4ca0a7']).toBe('Espace de travail');
    expect(adminRouteCatalog.fr['admin.route.workspaces_205b45']).toBe('Espaces de travail');
    expect(adminRouteCatalog.fr['admin.route.deploymentRecordsAcrossProjects_91752a']).toContain('déploiement');
    expect(adminRouteCatalog.fr['admin.route.systemSettings_1b4c8f']).toBe('Paramètres système');
  });

  it('rejects residual English product terminology in the French admin catalogs', () => {
    const residualEnglishTerminology =
      /\b(?:preview|logs?|marketplace|snapshots?|packages?|builds?|workspace|runtime|stack|starter|typecheck|flags?|feature flags?|pool|autoscaling|tags?|tenants?|tokens?|backend|frontend|fork)\b/iu;

    for (const catalog of [adminCatalog.fr, adminRouteCatalog.fr]) {
      for (const [key, copy] of Object.entries(catalog)) {
        const visibleStaticCopy = copy.replace(/\{[A-Za-z_][A-Za-z0-9_]*\}/gu, '');
        expect(visibleStaticCopy, key).not.toMatch(residualEnglishTerminology);
      }
    }
  });

  it('interpolates dynamic French messages without exposing translation keys', () => {
    expect(translateAdminRoute('fr', 'admin.route.actionsFor', { subject: 'avi@example.com' })).toBe(
      'Actions pour avi@example.com',
    );
    expect(translateAdmin('fr', 'admin.standalone.openSecurityEvents_one', { count: 1 })).toBe(
      '1 événement de sécurité ouvert',
    );
  });

  it('falls back to safe localized copy when an invalid runtime key reaches a translator', () => {
    const invalidStandaloneKey = 'admin.standalone.missing' as keyof typeof adminCatalog.en;
    const invalidRouteKey = 'admin.route.missing' as keyof typeof adminRouteCatalog.en;

    expect(translateAdmin('fr', invalidStandaloneKey)).toBe('Contenu indisponible.');
    expect(translateAdminRoute('fr', invalidRouteKey)).toBe('Cette section d’administration n’est pas disponible.');
  });

  it('does not store technical dotted identifiers as translatable copy', () => {
    const dottedIdentifier = /^[a-z][a-z0-9-]*(?:\.[a-z0-9-]+)+$/iu;

    for (const catalog of [adminCatalog, adminRouteCatalog]) {
      for (const language of ['en', 'fr'] as const) {
        for (const [key, value] of Object.entries(catalog[language])) {
          expect(dottedIdentifier.test(value), `${language}:${key}`).toBe(false);
        }
      }
    }
  });
});
