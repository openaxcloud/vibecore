import { DEFAULT_THEME, kTheme, type Theme } from './theme';
import { readThemeCookie } from './theme-cookie';

/**
 * Thème effectif de l'IDE, et si ce thème vient d'un choix RÉEL de l'utilisateur.
 *
 * `explicite: false` signale une valeur de repli : personne n'a rien choisi, on
 * affiche le défaut. La distinction commande la persistance — voir
 * `applyProjectThemePreference` dans BaseChat.
 */
export type ResolutionThemeProjet = { theme: Theme; explicite: boolean };

export function resolveProjectThemePreference(preference: unknown): ResolutionThemeProjet {
  if (preference === 'dark' || preference === 'light') {
    return { theme: preference, explicite: true };
  }

  /*
   * 'system' / non renseigné → on cherche un choix EXPLICITE avant de retomber
   * sur le défaut.
   *
   *   1. le cookie partagé `ecode_theme`, qui porte le choix fait sur n'importe
   *      quelle surface E-Code (site public, tableau de bord, Paramètres) ;
   *   2. la bascule persistée par origine (`bolt_theme`).
   *
   * L'oubli du point 1 était un vrai défaut, mesuré en live : avec
   * `ecode_theme=dark`, l'accueil, le tableau de bord et les Paramètres passaient
   * bien en sombre, mais l'IDE seul restait en clair — puis écrasait `bolt_theme`
   * avec ce clair, si bien qu'un simple passage dans l'IDE finissait par épingler
   * TOUTE l'application en clair.
   *
   * On ne suit toujours PAS `prefers-color-scheme` : c'est ce qui rendait l'IDE
   * sombre sur une machine en thème sombre et propageait ce sombre partout. Un
   * cookie à `system` n'est donc pas un choix et retombe sur le défaut.
   */
  const partage = readThemeCookie();

  if (partage === 'dark' || partage === 'light') {
    return { theme: partage, explicite: true };
  }

  if (typeof localStorage !== 'undefined') {
    const persisted = localStorage.getItem(kTheme);

    if (persisted === 'dark' || persisted === 'light') {
      return { theme: persisted, explicite: true };
    }
  }

  return { theme: DEFAULT_THEME, explicite: false };
}
