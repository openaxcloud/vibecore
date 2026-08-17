/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest';

import { readFileSync } from 'node:fs';
import { cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

/*
 * Le sélecteur FR/EN a été RETIRÉ de l'IDE : il occupait la barre du haut en
 * permanence pour un réglage qu'on change une fois. À la place, la langue est
 * détectée depuis le navigateur au chargement (`resolveUserLanguage` :
 * cookie > localStorage > navigator.language > 'en') et se règle dans les
 * Paramètres, atteignables depuis le menu de l'IDE.
 *
 * Ces tests gardent les trois propriétés qui pourraient régresser en silence :
 * le toggle ne revient pas dans l'IDE, il reste sur les surfaces publiques, et
 * la hauteur qu'il réservait sur mobile n'est pas réintroduite.
 */

const IDE_ROUTE = 'app/routes/projects.$projectId.ide.tsx';

describe("le sélecteur de langue est retiré de l'IDE", () => {
  it("n'apparaît plus dans la route de l'IDE, ni en desktop ni en mobile", () => {
    const source = readFileSync(IDE_ROUTE, 'utf8');

    expect(source).not.toContain('LanguageSwitch');
    expect(source).not.toContain('MobileIdeLanguageSwitchPortal');
    expect(source).not.toContain('bolt-project-action-group--language');
  });

  it('offre à la place un accès aux Paramètres, sinon la langue deviendrait irréglable depuis l’IDE', () => {
    const source = readFileSync(IDE_ROUTE, 'utf8');

    /*
     * C'est la contrepartie indispensable du retrait : avant ce lien, le menu de
     * l'IDE ne menait qu'à /support, /account-settings et aux collaborateurs —
     * aucun d'eux ne porte le réglage de langue, qui vit dans le ControlPanel
     * servi par /settings.
     */
    expect(source).toContain('to="/settings"');
    expect(source).toContain('projectIde.preferences');
  });

  it('ne réserve plus de hauteur sous l’en-tête mobile pour un contrôle disparu', () => {
    const styles = readFileSync('app/styles/index.scss', 'utf8');

    expect(styles).toContain('--vc-mobile-language-switch-reserved-height: 0px;');
    expect(styles).not.toContain('--vc-mobile-language-switch-reserved-height: 58px;');
  });

  it('reste présent sur les surfaces publiques — le retrait ne concerne que l’IDE', () => {
    for (const file of [
      'app/components/marketing/ecode-exact/EcodeExactShell.tsx',
      'app/components/dashboard/SaaSLayout.tsx',
      'app/components/auth/AuthScreen.tsx',
    ]) {
      expect(readFileSync(file, 'utf8')).toContain('LanguageSwitch');
    }
  });

  it('reste réglable dans les Paramètres, avec son libellé traduit', () => {
    expect(readFileSync('app/components/@settings/tabs/settings/SettingsTab.tsx', 'utf8')).toContain('LanguageSwitch');

    const catalog = readFileSync('app/lib/i18n/catalogs/settings-preferences.ts', 'utf8');
    expect(catalog).toContain("'settingsPreferences.language': 'Language'");
    expect(catalog).toContain("'settingsPreferences.language': 'Langue'");
  });
});
