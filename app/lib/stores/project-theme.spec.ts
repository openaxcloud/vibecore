/** @vitest-environment jsdom */

import { afterEach, describe, expect, it } from 'vitest';

import { resolveProjectThemePreference } from './project-theme';

/*
 * Mesuré live le 19/08 sur l'env de test : avec `ecode_theme=dark`, l'accueil, le
 * tableau de bord et les Paramètres passaient bien en sombre, mais l'IDE seul
 * restait en clair — et y écrivait `bolt_theme=light`, épinglant ensuite toute
 * l'application en clair. La cause : ce résolveur ne consultait jamais le cookie
 * partagé, alors que c'est LUI qui porte le choix fait sur les autres surfaces.
 */

function poserCookie(valeur: string | null) {
  document.cookie = 'ecode_theme=; Path=/; Max-Age=0';

  if (valeur) {
    document.cookie = `ecode_theme=${valeur}; Path=/`;
  }
}

afterEach(() => {
  poserCookie(null);
  localStorage.clear();
});

describe('thème de l’IDE — résolution', () => {
  it('un choix porté par le projet gagne sur tout le reste', () => {
    poserCookie('light');
    expect(resolveProjectThemePreference('dark')).toEqual({ theme: 'dark', explicite: true });
  });

  it('sans choix de projet, le cookie partagé décide (le défaut ne s’impose plus)', () => {
    poserCookie('dark');
    expect(resolveProjectThemePreference('system')).toEqual({ theme: 'dark', explicite: true });
    expect(resolveProjectThemePreference(undefined)).toEqual({ theme: 'dark', explicite: true });
  });

  it('le cookie partagé passe avant la bascule par origine', () => {
    poserCookie('dark');
    localStorage.setItem('bolt_theme', 'light');
    expect(resolveProjectThemePreference('system').theme).toBe('dark');
  });

  it('sans cookie, la bascule par origine reste respectée', () => {
    localStorage.setItem('bolt_theme', 'dark');
    expect(resolveProjectThemePreference('system')).toEqual({ theme: 'dark', explicite: true });
  });

  it('un cookie à `system` n’est pas un choix : on ne suit pas l’OS', () => {
    poserCookie('system');
    expect(resolveProjectThemePreference('system')).toEqual({ theme: 'light', explicite: false });
  });

  it('sans aucun signal, le défaut s’applique mais n’est PAS marqué explicite', () => {
    /*
     * `explicite: false` est ce qui empêche d'écrire `bolt_theme` : persister ce
     * défaut fabriquait une préférence jamais exprimée, que le démarrage recopiait
     * ensuite dans le cookie partagé.
     */
    expect(resolveProjectThemePreference('system')).toEqual({ theme: 'light', explicite: false });
  });
});
