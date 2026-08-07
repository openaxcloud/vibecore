import { describe, expect, it } from 'vitest';

import { mobileIdeTabsEn, mobileIdeTabsFr } from './i18n/catalogs/mobile-ide-tabs';
import { createI18nInstance } from './i18n/runtime';
import { ECODE_MOBILE_TOOLS, SHELL_TERMINAL_LABEL } from './mobile-ide-tabs';

/*
 * Faithful to i18next t(): a known key resolves to its translation; the frozen
 * Shell (Terminal) tab label is not a catalog key and resolves to itself.
 */
function resolveTitle(t: (key: string) => string, key: string): string {
  return key === SHELL_TERMINAL_LABEL ? SHELL_TERMINAL_LABEL : t(key);
}

describe('mobile IDE tabs i18n wiring', () => {
  it('keeps EN/FR catalog parity and never leaves a data key without a catalog entry', () => {
    expect(Object.keys(mobileIdeTabsFr).sort()).toEqual(Object.keys(mobileIdeTabsEn).sort());

    for (const tool of ECODE_MOBILE_TOOLS) {
      const knownTitle = tool.titleKey === SHELL_TERMINAL_LABEL || tool.titleKey in mobileIdeTabsEn;
      expect(knownTitle, `title key for ${tool.id}`).toBe(true);
      expect(tool.descriptionKey in mobileIdeTabsEn, `description key for ${tool.id}`).toBe(true);
    }
  });

  it('resolves every tool to real French copy with no raw catalog key leaking to the UI', () => {
    const fr = createI18nInstance('fr');
    const t = (key: string) => fr.t(key);

    for (const tool of ECODE_MOBILE_TOOLS) {
      const title = resolveTitle(t, tool.titleKey);
      const description = t(tool.descriptionKey);

      expect(title.trim().length, `FR title for ${tool.id}`).toBeGreaterThan(0);
      expect(description.trim().length, `FR description for ${tool.id}`).toBeGreaterThan(0);
      expect(title.startsWith('mobileIdeTabs.'), `FR title leak for ${tool.id}`).toBe(false);
      expect(description.startsWith('mobileIdeTabs.'), `FR description leak for ${tool.id}`).toBe(false);
    }

    // Spot-check the normative glossary and the frozen technical labels.
    expect(t('mobileIdeTabs.search.title')).toBe('Recherche');
    expect(t('mobileIdeTabs.deployments.title')).toBe('Déploiements');
    expect(t('mobileIdeTabs.database.title')).toBe('Base de données');
    expect(t('mobileIdeTabs.env.title')).toBe('Variables d’environnement');
    expect(t('mobileIdeTabs.git.title')).toBe('Git');
    expect(t('mobileIdeTabs.preview.title')).toBe('Webview');
  });

  it('leaves English untouched when the language is English', () => {
    const en = createI18nInstance('en');
    expect(en.t('mobileIdeTabs.search.title')).toBe('Search');
    expect(en.t('mobileIdeTabs.deployments.title')).toBe('Deployments');
    expect(en.t('mobileIdeTabs.env.title')).toBe('Environment variables');
  });
});
