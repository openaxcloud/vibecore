import { describe, expect, it } from 'vitest';
import { legacyGitImportLocation, loader } from './git';
import { gitImportPrefillFromUrl } from './import-github';

describe('legacy /git import route', () => {
  it('routes the ownerless workspace surface to the real org-scoped importer', () => {
    expect(legacyGitImportLocation('https://e-code.ai/git')).toBe('/import-github');
  });

  it('preserves legacy repository, branch, project-name and locale parameters', () => {
    const location = legacyGitImportLocation(
      'https://e-code.ai/git?url=https%3A%2F%2Fgithub.com%2Facme%2Fapp.git&branch=release%2Fv2&name=Acme+App&lang=fr',
    );

    expect(location).toBe(
      '/import-github?repositoryUrl=https%3A%2F%2Fgithub.com%2Facme%2Fapp.git&branch=release%2Fv2&name=Acme+App&lang=fr',
    );
  });

  it('returns a permanent redirect and never starts an anonymous workspace', async () => {
    const result = await loader({ request: new Request('https://e-code.ai/git?lang=fr'), params: {} } as never);

    expect(result).toBeInstanceOf(Response);
    expect(result.status).toBe(301);
    expect(result.headers.get('location')).toBe('/import-github?lang=fr');
  });

  it('prefills bounded legacy values on the canonical import form', () => {
    const prefill = gitImportPrefillFromUrl(
      `https://e-code.ai/import-github?repositoryUrl=${encodeURIComponent('  https://github.com/acme/app.git  ')}&branch=${'x'.repeat(300)}&name=Acme`,
    );

    expect(prefill.repositoryUrl).toBe('https://github.com/acme/app.git');
    expect(prefill.branch).toHaveLength(255);
    expect(prefill.name).toBe('Acme');
  });
});
