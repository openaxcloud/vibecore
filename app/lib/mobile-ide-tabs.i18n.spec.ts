import { describe, expect, it } from 'vitest';

import { mobileIdeTabsEn, mobileIdeTabsFr } from './i18n/catalogs/mobile-ide-tabs';
import { createI18nInstance } from './i18n/runtime';
import { ECODE_MOBILE_TOOLS, SHELL_TERMINAL_LABEL } from './mobile-ide-tabs';

/*
 * This helper used to special-case the Terminal tab on the belief that the frozen
 * `Shell (Terminal)` label "is not a catalog key and resolves to itself". That
 * belief was wrong, and it is exactly why this suite stayed green while the
 * mobile Tools sheet showed the tab titled "Unavailable" on Avi's iPhone: the
 * runtime's `parseMissingKeyHandler` returns `common.unavailable` (the ENGLISH
 * "Unavailable") for any unknown key, not the key itself. Every title now goes
 * through the real `t()`, with no exception — the frozen label lives in the
 * catalog under `mobileIdeTabs.terminal.title` with the SAME value in EN and FR.
 */
const MISSING_KEY_FALLBACK = 'Unavailable';

describe('mobile IDE tabs i18n wiring', () => {
  it('keeps EN/FR catalog parity and never leaves a data key without a catalog entry', () => {
    expect(Object.keys(mobileIdeTabsFr).sort()).toEqual(Object.keys(mobileIdeTabsEn).sort());

    for (const tool of ECODE_MOBILE_TOOLS) {
      expect(tool.titleKey in mobileIdeTabsEn, `title key for ${tool.id}`).toBe(true);
      expect(tool.descriptionKey in mobileIdeTabsEn, `description key for ${tool.id}`).toBe(true);
    }
  });

  it('resolves every tool to real French copy with no raw catalog key leaking to the UI', () => {
    const fr = createI18nInstance('fr');
    const t = (key: string) => fr.t(key);

    for (const tool of ECODE_MOBILE_TOOLS) {
      const title = t(tool.titleKey);
      const description = t(tool.descriptionKey);

      expect(title.trim().length, `FR title for ${tool.id}`).toBeGreaterThan(0);
      expect(description.trim().length, `FR description for ${tool.id}`).toBeGreaterThan(0);
      expect(title.startsWith('mobileIdeTabs.'), `FR title leak for ${tool.id}`).toBe(false);
      expect(description.startsWith('mobileIdeTabs.'), `FR description leak for ${tool.id}`).toBe(false);

      /*
       * The exact symptom reported from an iPhone: the Terminal tab was titled
       * "Unavailable" because its key was missing. No tab may ever show it.
       */
      expect(title, `missing-key fallback for ${tool.id}`).not.toBe(MISSING_KEY_FALLBACK);
      expect(description, `missing-key fallback for ${tool.id}`).not.toBe(MISSING_KEY_FALLBACK);
    }

    // Spot-check the normative glossary and the frozen technical labels.
    expect(t('mobileIdeTabs.search.title')).toBe('Recherche');
    expect(t('mobileIdeTabs.deployments.title')).toBe('Déploiements');
    expect(t('mobileIdeTabs.database.title')).toBe('Base de données');
    expect(t('mobileIdeTabs.env.title')).toBe('Variables d’environnement');
    expect(t('mobileIdeTabs.git.title')).toBe('Git');
    expect(t('mobileIdeTabs.preview.title')).toBe('Webview');

    // Frozen label, identical in both languages — and resolvable, not a raw literal.
    expect(t('mobileIdeTabs.terminal.title')).toBe(SHELL_TERMINAL_LABEL);
  });

  it('leaves English untouched when the language is English', () => {
    const en = createI18nInstance('en');
    expect(en.t('mobileIdeTabs.search.title')).toBe('Search');
    expect(en.t('mobileIdeTabs.deployments.title')).toBe('Deployments');
    expect(en.t('mobileIdeTabs.env.title')).toBe('Environment variables');
    expect(en.t('mobileIdeTabs.terminal.title')).toBe(SHELL_TERMINAL_LABEL);
  });
});
