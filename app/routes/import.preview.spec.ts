import { describe, expect, it, vi } from 'vitest';

/*
 * L'écran d'aperçu lisait `import.stagedFiles` alors que l'API place l'aperçu
 * dans un sous-objet `import.preview`. Les tests d'API suivaient la bonne
 * forme ; la route UI n'en avait aucun, donc rien n'a signalé l'écart — et
 * l'écran plantait en production de test sur `.length` d'un `undefined`,
 * derrière la boundary « L'application a rencontré une erreur » (constaté le
 * 2026-08-13 dans un vrai navigateur).
 *
 * Ces tests exercent le loader contre la forme RÉELLE de la réponse.
 */

const apiRequest = vi.fn();
const firstOrganizationOrNull = vi.fn();

vi.mock('~/lib/enterprise-api.server', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
  firstOrganizationOrNull: (...args: unknown[]) => firstOrganizationOrNull(...args),
  firstOrganization: (...args: unknown[]) => firstOrganizationOrNull(...args),
  formObject: (form: FormData) => Object.fromEntries(form.entries()),
  json: (data: unknown, init?: ResponseInit) => ({ data, init }),
  redirect: (to: string) => ({ redirectTo: to }),
}));

vi.mock('~/lib/i18n/request-locale', () => ({
  resolveRequestLocale: () => ({ language: 'fr' }),
  localeResponseHeaders: () => ({}),
}));

const { loader, consentFromForm, consentFieldName } = await import('./import.preview.$importJobId');

function apiResponse(preview: unknown) {
  return {
    import: {
      id: 'import_1',
      state: 'AWAITING_USER_ACTION',
      provider: 'zip',
      sourceRef: 'bolt-export.zip',
      preview,
    },
  };
}

describe("écran d'aperçu d'import — forme du payload", () => {
  it("lit l'aperçu dans `import.preview`, pas à plat sur `import`", async () => {
    firstOrganizationOrNull.mockResolvedValue({ id: 'org_1', slug: 'org' });
    apiRequest.mockResolvedValue(
      apiResponse({
        stagedFileCount: 3,
        stagedFiles: [
          { path: '.env', sizeBytes: 67 },
          { path: 'README.md', sizeBytes: 11 },
        ],
        findings: [{ path: '.env', line: 2, kind: 'env-secret', preview: 'API_SECRET=fadf…9aa' }],
        requiresConsent: true,
      }),
    );

    const result = (await loader({
      request: new Request('https://app.test/import/preview/import_1'),
      params: { importJobId: 'import_1' },
      context: {},
    } as never)) as { data: { preview: { stagedFiles: unknown[]; findings: unknown[] }; sourceRef: string } };

    // C'est précisément ce qui manquait : sans ces champs, l'écran fait `.length` sur undefined.
    expect(result.data.preview.stagedFiles).toHaveLength(2);
    expect(result.data.preview.findings).toHaveLength(1);
    expect(result.data.sourceRef).toBe('bolt-export.zip');
  });

  it('renvoie au hub quand la copie jetable est disposée, au lieu de rendre un import vide', async () => {
    firstOrganizationOrNull.mockResolvedValue({ id: 'org_1', slug: 'org' });
    apiRequest.mockResolvedValue(apiResponse(null));

    const result = (await loader({
      request: new Request('https://app.test/import/preview/import_1'),
      params: { importJobId: 'import_1' },
      context: {},
    } as never)) as { redirectTo?: string };

    expect(result.redirectTo).toBe('/import?staging=gone');
  });
});

describe('consentement du formulaire', () => {
  it('reconstruit la carte `path:line` attendue par la porte de commit', () => {
    const field = consentFieldName({ path: 'src/a.ts', line: 12 });

    expect(consentFromForm({ [field]: 'redact', autre: 'x' })).toEqual({ 'src/a.ts:12': 'redact' });
  });

  it('ignore toute valeur qui n’est pas une décision explicite — un choix manquant doit continuer à bloquer', () => {
    expect(consentFromForm({ 'consent:src/a.ts:1': 'peut-être' })).toEqual({});
  });
});
