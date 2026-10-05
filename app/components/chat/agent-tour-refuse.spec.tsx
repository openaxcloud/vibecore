/** @vitest-environment jsdom */

import { cleanup, render, screen } from '@testing-library/react';
import { createInstance } from 'i18next';
import type { ReactNode } from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { afterEach, describe, expect, it } from 'vitest';
import ProgressCompilation, { deriveProgressState } from './ProgressCompilation';
import type { ProgressAnnotation } from '~/types/context';

/**
 * UN TOUR REFUSÉ AVANT TOUT TRAVAIL N'EST PAS « INTERROMPU À 100 % ».
 *
 * Signalé par la QA le 01/10 : quota d'IA épuisé, l'en-tête de l'Agent affichait
 * « Interrompu · 100 % » avec la barre pleine, pour un tour qui n'a jamais
 * commencé. Le reste du message (l'alerte de quota) était juste.
 *
 * Cause : sur un refus de quota, `api.chat.ts` n'écrit qu'UNE annotation,
 * `quota-exceeded`, au statut `complete` — elle porte le message de refus, pas du
 * travail. Le pourcentage compte les étapes `complete` : 1 sur 1, donc 100 %, et
 * l'alerte d'erreur fait passer l'état à « interrompu ».
 */

function renderLocalized(node: ReactNode, language: 'en' | 'fr') {
  const i18n = createInstance();

  void i18n.use(initReactI18next).init({
    lng: language,
    fallbackLng: 'en',
    supportedLngs: ['en', 'fr'],
    resources: { en: { translation: {} }, fr: { translation: {} } },
    initImmediate: false,
  });

  return render(<I18nextProvider i18n={i18n}>{node}</I18nextProvider>);
}

// Exactement ce que le serveur écrit quand le quota bloque la demande.
const refusDeQuota: ProgressAnnotation[] = [
  {
    type: 'progress',
    label: 'quota-exceeded',
    status: 'complete',
    order: 0,
    message: 'Limite d’utilisation de l’IA atteinte pour ce mois.',
  },
];

afterEach(cleanup);

describe('tour refusé avant tout travail (quota épuisé)', () => {
  for (const [language, interrompu, nonDemarre] of [
    ['fr', 'Interrompu', 'Non démarré'],
    ['en', 'Interrupted', 'Not started'],
  ] as const) {
    it(`${language} : l'en-tête dit « ${nonDemarre} », sans pourcentage ni barre pleine`, () => {
      renderLocalized(<ProgressCompilation data={refusDeQuota} streaming={false} failed />, language);

      const ligne = screen.getByRole('status');

      expect(ligne.textContent).toContain(nonDemarre);
      expect(ligne.textContent).not.toContain(interrompu);
      expect(ligne.textContent).not.toMatch(/100/);
      expect(ligne.getAttribute('aria-label')).not.toMatch(/100/);
      expect(ligne.getAttribute('data-progress-state')).toBe('not-started');

      const barre = ligne.querySelector<HTMLElement>('[style*="width"]');
      expect(barre?.style.width).toBe('0%');
    });
  }

  it('un vrai tour interrompu en route reste « interrompu » avec son pourcentage', () => {
    expect(deriveProgressState({ completedCount: 1, totalCount: 3, hasActiveWork: false, failed: true })).toBe(
      'interrupted',
    );
  });

  it('un refus ne compte jamais comme une étape faite', () => {
    expect(
      deriveProgressState({ completedCount: 0, totalCount: 0, hasActiveWork: false, failed: true, refused: true }),
    ).toBe('not-started');
  });
});
