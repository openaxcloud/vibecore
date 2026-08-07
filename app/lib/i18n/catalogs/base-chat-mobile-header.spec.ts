import { describe, expect, it } from 'vitest';

import { baseChatMobileHeaderEn, baseChatMobileHeaderFr } from './base-chat-mobile-header';
import { createI18nInstance } from '~/lib/i18n/runtime';

function tokens(value: string): string[] {
  return [...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
}

describe('base-chat-mobile-header catalog', () => {
  it('keeps EN/FR key parity with matching interpolation tokens', () => {
    expect(Object.keys(baseChatMobileHeaderFr).sort()).toEqual(Object.keys(baseChatMobileHeaderEn).sort());

    for (const key of Object.keys(baseChatMobileHeaderEn) as Array<keyof typeof baseChatMobileHeaderEn>) {
      expect(baseChatMobileHeaderFr[key].trim().length, key).toBeGreaterThan(0);
      expect(tokens(baseChatMobileHeaderFr[key]), key).toEqual(tokens(baseChatMobileHeaderEn[key]));
    }
  });

  it('resolves French copy through the runtime, including interpolation, without leaking keys', () => {
    const fr = createI18nInstance('fr');
    expect(fr.t('baseChatMobileHeader.back')).toBe('Retour au tableau de bord');
    expect(fr.t('baseChatMobileHeader.agentReady')).toBe('Prêt pour la prochaine modification');
    expect(fr.t('baseChatMobileHeader.switchToTab', { name: 'Éditeur' })).toBe('Passer à l’onglet Éditeur');
    expect(fr.t('baseChatMobileHeader.moreTabs', { count: 3 })).toBe('Afficher 3 onglets de plus');

    // 'Prompt' is an intentionally identical product term (kept like Git / Webview).
    expect(fr.t('baseChatMobileHeader.promptButton')).toBe('Prompt');
  });

  it('leaves English untouched when the language is English', () => {
    const en = createI18nInstance('en');
    expect(en.t('baseChatMobileHeader.back')).toBe('Back to dashboard');
    expect(en.t('baseChatMobileHeader.switchToTab', { name: 'Editor' })).toBe('Switch to Editor tab');
  });
});
