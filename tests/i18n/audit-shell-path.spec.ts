import { describe, expect, it } from 'vitest';
import { getGitProviderConnectCopy } from '../../app/lib/i18n/catalogs/git-provider-connect';
import { findFrenchAuditResidue } from '../../app/lib/i18n/catalogs/live-audit-heuristics';
import { isIdeShellPath } from './audit-shell-path';

describe('Contrat de l’audit français', () => {
  it.each(['ide', 'git', 'preview'])('la route %s rend la coque IDE', (route) => {
    expect(isIdeShellPath(`/projects/project-123/${route}`)).toBe(true);
  });

  it.each(['/projects/project-123', '/projects/project-123/database', '/preview', '/projects/new'])(
    'la route %s garde les exigences de la coque globale',
    (route) => {
      expect(isIdeShellPath(route)).toBe(false);
    },
  );

  it.each([
    ['https://audit.test/projects/p/ide?panel=domains', true],
    ['https://audit.test/@organization/project?panel=deployments', true],
    ['https://audit.test/%40organization/project?panel=domains', true],
    ['https://audit.test/@organization/project/ide', true],
    ['https://audit.test/projects/p/domains', false],
    ['https://audit.test/projects/p/deployments', false],
    ['https://audit.test/projects/p/activity', false],
    ['https://audit.test/login?redirect=/projects/p/ide', false],
    ['https://audit.test/@organization/project/settings', false],
  ])('classifies the effective destination %s', (destination, expected) => {
    expect(isIdeShellPath(destination)).toBe(expected);
  });

  it('les descriptions françaises des fournisseurs Git respectent le glossaire', () => {
    const en = getGitProviderConnectCopy('en');
    const fr = getGitProviderConnectCopy('fr');

    const entries = (copy: typeof en) =>
      Object.entries(copy)
        .filter(([key]) => key.endsWith('.description'))
        .map(([key, text]) => ({ kind: 'text', text, locator: key, semanticKey: key }));

    expect(findFrenchAuditResidue(entries(en), entries(fr))).toEqual([]);
  });
});
