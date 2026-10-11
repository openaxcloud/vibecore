import { describe, expect, it } from 'vitest';
import { isIdeShellPath } from './audit-shell-path';
import { getGitProviderConnectCopy } from '../../app/lib/i18n/catalogs/git-provider-connect';
import { findFrenchAuditResidue } from '../../app/lib/i18n/catalogs/live-audit-heuristics';

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
