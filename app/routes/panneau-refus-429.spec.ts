import { describe, expect, it, vi } from 'vitest';

import { panelEnvelopeError } from './api.projects.$projectId.ide-panel.$panel';

/*
 * CE TEST TIENT LE SITE D'APPEL, pas seulement la règle.
 *
 * `causeDu429` a son propre spec ; il prouve que la règle est juste. Il ne prouve
 * PAS qu'elle est appelée. Le défaut d'origine était exactement là : la règle
 * « 429 signifie quota » n'a jamais existé nulle part, c'est le site d'appel qui
 * l'inventait.
 *
 * Il remplace trois contrôles qui lisaient le TEXTE SOURCE de la route à coups
 * d'expressions régulières. Ils passaient au vert sur la forme du code plutôt que
 * sur ce qu'il rend — et le premier d'entre eux serait resté vert si on avait
 * gardé l'étiquette fausse en déplaçant simplement deux lignes.
 */
const refus = (enTetes: Record<string, string> | null) =>
  ({
    status: 429,
    headers: enTetes ? new Headers(enTetes) : undefined,
  }) as unknown;

const enveloppe = (erreur: unknown, langue = 'fr') => {
  // La route journalise chaque échec ; on tait ce bruit sans masquer l'assertion.
  const silence = vi.spyOn(console, 'error').mockImplementation(() => undefined);

  try {
    return panelEnvelopeError('overview', { id: 'p1' }, erreur, langue);
  } finally {
    silence.mockRestore();
  }
};

describe('un 429 ne nomme plus une cause qu’il n’a pas vérifiée', () => {
  it('refus de DÉBIT → on demande d’ATTENDRE, et rien à libérer', () => {
    const { error } = enveloppe(refus({ 'x-ratelimit-limit': '2000', 'x-ratelimit-remaining': '0' }));

    expect(error?.code).toBe('PANEL_RATE_LIMITED');
    expect(error?.message).toMatch(/patientez/i);
    expect(error?.message).not.toMatch(/libérez des ressources/i);
  });

  it('refus de QUOTA → on demande de LIBÉRER de la place', () => {
    const { error } = enveloppe(refus({ 'x-ratelimit-limit': '2000', 'x-ratelimit-remaining': '1998' }));

    expect(error?.code).toBe('PANEL_QUOTA_EXCEEDED');
    expect(error?.message).toMatch(/libérez des ressources/i);
    expect(error?.message).not.toMatch(/patientez quelques instants/i);
  });

  it('les deux causes ne rendent PAS le même message', () => {
    /*
     * L'assertion qui tient les deux moitiés ensemble. Sans elle, deux libellés
     * identiques passeraient les deux cas ci-dessus.
     */
    const debit = enveloppe(refus({ 'x-ratelimit-remaining': '0' }));
    const quota = enveloppe(refus({ 'x-ratelimit-remaining': '5' }));

    expect(debit.error?.message).not.toBe(quota.error?.message);
    expect(debit.error?.code).not.toBe(quota.error?.code);
  });

  it('le libellé de quota n’invite plus à changer d’offre', () => {
    /*
     * Le second point : après le correctif du quota d'instantanés (#477), la
     * limite se rouvre d'elle-même à chaque période. Inviter à changer d'offre
     * devient alors FAUX — on vend un remède à un problème qui se résout seul.
     */
    for (const langue of ['fr', 'en']) {
      const { error } = enveloppe(refus({ 'x-ratelimit-remaining': '9' }), langue);

      expect(error?.message).not.toMatch(/changez d’offre|upgrade/i);
      expect(error?.message).toMatch(/période suivante|next period/i);
    }
  });

  it('les deux causes restent réessayables', () => {
    /*
     * Contre-épreuve à l'envers : distinguer les causes ne devait RIEN retirer.
     * Un 429 reste un échec transitoire dans les deux cas.
     */
    for (const reste of ['0', '1998']) {
      expect(enveloppe(refus({ 'x-ratelimit-remaining': reste })).error?.retryable).toBe(true);
    }
  });

  it('les autres statuts sont intacts', () => {
    expect(enveloppe({ status: 404 }).error?.code).toBe('PANEL_NOT_FOUND');
    expect(enveloppe({ status: 403 }).error?.code).toBe('PANEL_FORBIDDEN');
    expect(enveloppe({ status: 503 }).error?.code).toBe('PANEL_BACKEND_UNAVAILABLE');
  });
});
