/**
 * L'auteur de commit que la PLATEFORME écrit pour tout projet qui n'en a pas
 * d'autre : `git config user.name You` (`services/api/src/project-storage.ts`,
 * et le panneau terminal de l'IDE). Ce n'est pas un nom de personne, c'est un
 * pronom en anglais : affiché tel quel, l'historique Git disait « - You » à un
 * client français (audit des traductions, rouge depuis le 22/09).
 *
 * Seul ce nom-là est traduit. Un vrai nom d'auteur (« Ada Lovelace », ou un
 * client qui s'appelle réellement « You ») ne peut pas être distingué par le
 * nom seul — d'où la comparaison stricte avec l'identité de la plateforme, et
 * rien de plus large.
 */
export const PLATFORM_COMMIT_AUTHOR_NAME = 'You';

export function commitAuthorLabel(author: string | undefined, youLabel: string): string | undefined {
  if (!author) {
    return undefined;
  }

  return author.trim() === PLATFORM_COMMIT_AUTHOR_NAME ? youLabel : author;
}
