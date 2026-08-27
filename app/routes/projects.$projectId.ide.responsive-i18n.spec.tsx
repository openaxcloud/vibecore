/** @vitest-environment jsdom */

import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

/*
 * La bascule FR/EN a été RETIRÉE de l'IDE (directive produit) : elle occupait en
 * permanence une place de la barre — et, sur mobile, une pastille flottante
 * par-dessus la conversation de l'agent — pour un réglage qu'on touche une fois.
 *
 * À la place : la langue est détectée depuis le navigateur au chargement (voir
 * `detectUserLanguage`) et se règle dans Paramètres → Préférences.
 *
 * Ce fichier vérifiait la position de la pastille mobile. Il garde désormais
 * l'invariant inverse : plus aucune bascule dans l'IDE, ni dans le balisage, ni
 * dans la feuille de style, et plus de réserve d'espace pour un élément qui
 * n'existe plus.
 */

const ROUTE_IDE = 'app/routes/projects.$projectId.ide.tsx';
const FEUILLE = 'app/styles/index.scss';

describe('IDE — plus de bascule de langue', () => {
  const route = readFileSync(ROUTE_IDE, 'utf8');
  const styles = readFileSync(FEUILLE, 'utf8');

  it('la route de l’IDE ne monte plus de bascule de langue', () => {
    expect(route).not.toContain('LanguageSwitch');
    expect(route).not.toContain('MobileIdeLanguageSwitchPortal');
    expect(route).not.toContain('mobile-ide-language-switch-slot');
  });

  it('les styles de la bascule ont disparu avec elle', () => {
    expect(styles).not.toContain('bolt-project-language-switch');
    expect(styles).not.toContain('bolt-project-mobile-language-switch');
  });

  it('la réserve d’espace mobile est retombée à zéro', () => {
    /*
     * La variable est conservée — plusieurs calculs la lisent — mais elle vaut
     * 0. La laisser à 58px aurait gardé une bande vide en haut de chaque
     * panneau mobile, sous plus rien.
     */
    expect(styles).toContain('--vc-mobile-language-switch-reserved-height: 0px;');
    expect(styles).not.toContain('--vc-mobile-language-switch-reserved-height: 58px;');
  });

  it('le réglage vit maintenant dans les Paramètres de l’IDE', () => {
    const baseChat = readFileSync('app/components/chat/BaseChat.tsx', 'utf8');

    expect(baseChat).toContain('LanguageSetting');
    expect(baseChat).toContain("t('settingsPreferences.language')");
  });

  it('l’en-tête mobile figé n’a pas été réordonné au passage', () => {
    expect(styles).not.toMatch(/\.bolt-mobile-ecode-header-side(?:--right)?\s*\{[^}]*order:/u);
    expect(styles).not.toMatch(/\.bolt-mobile-ecode-header-title\s*\{[^}]*order:/u);
  });
});
