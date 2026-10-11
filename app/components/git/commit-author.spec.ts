import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { commitAuthorLabel } from './commit-author';
import { idePanelsEn, idePanelsFr } from '~/lib/i18n/catalogs/ide-panels';

/*
 * Audit des traductions françaises (`tests/e2e/i18n-french-live.spec.ts`), rouge
 * depuis le 22/09 : l'historique Git de l'IDE affichait « - You » en français.
 */
describe('auteur de commit écrit par la plateforme', () => {
  it('« You » (identité de la plateforme) se lit « Vous » en français', () => {
    expect(commitAuthorLabel('You', 'Vous')).toBe('Vous');
  });

  it('un vrai nom reste intact', () => {
    expect(commitAuthorLabel('Ada Lovelace', 'Vous')).toBe('Ada Lovelace');
    expect(commitAuthorLabel(undefined, 'Vous')).toBeUndefined();
  });

  it('le catalogue a la clé dans les deux langues', () => {
    expect(idePanelsFr['idePanels.git.authorYou']).toBe('Vous');
    expect(idePanelsEn['idePanels.git.authorYou']).toBe('You');
  });

  it('la liste des commits du panneau Git passe par cette traduction', () => {
    const source = readFileSync(new URL('./GitTab.tsx', import.meta.url), 'utf8');

    expect(source).toContain("commitAuthorLabel(commit.author, t('idePanels.git.authorYou'))");
    expect(source).not.toContain('` - ${commit.author}`');

    // Le nom de la plateforme n'est PAS du contenu utilisateur : l'audit doit pouvoir le lire.
    expect(source).toContain('data-user-content={isPlatformCommitAuthor(commit.author) ? undefined : true}');
  });
});
