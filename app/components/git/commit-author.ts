/**
 * L'auteur de commit que la PLATEFORME écrit pour tout projet qui n'en a pas
 * d'autre : `git config user.name You` (`services/api/src/project-storage.ts`,
 * et le panneau terminal de l'IDE). Ce n'est pas un nom de personne, c'est un
 * pronom en anglais : affiché tel quel, l'historique Git disait « - You » à un
 * client français (audit des traductions, rouge depuis le 22/09).
 *
 * Le 08/10, la ligne a été marquée « contenu utilisateur » (`data-user-content`)
 * pour que l'audit cesse de la signaler : l'audit passait, le client lisait
 * toujours « You ». Un vrai nom d'auteur EST du contenu utilisateur ; le nom de
 * la plateforme, non : il est traduit, et l'audit le contrôle de nouveau.
 *
 * Seul ce nom-là est traduit. Un vrai nom d'auteur (« Ada Lovelace », ou un
 * client qui s'appelle réellement « You ») ne peut pas être distingué par le
 * nom seul — d'où la comparaison stricte avec l'identité de la plateforme, et
 * rien de plus large.
 */
export const PLATFORM_COMMIT_AUTHOR_NAME = 'You';

export function isPlatformCommitAuthor(author: string | undefined): boolean {
  return author?.trim() === PLATFORM_COMMIT_AUTHOR_NAME;
}

export function commitAuthorLabel(author: string | undefined, youLabel: string): string | undefined {
  if (!author) {
    return undefined;
  }

  return isPlatformCommitAuthor(author) ? youLabel : author;
}
