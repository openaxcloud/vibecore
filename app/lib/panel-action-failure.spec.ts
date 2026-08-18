import { describe, expect, it } from 'vitest';

import { panelActionFailureMessage } from './panel-action-failure';

/*
 * BUG-DB-PANEL-001 — « ERREUR 503 — Une erreur inattendue » à la création d'une
 * base de données.
 *
 * Le serveur préservait déjà la cause nommée (#145 : `DATABASE_PROVISION_UNAVAILABLE`
 * + `reason: SHARED_TENANT_UNAVAILABLE`), mais le client LISAIT `result.error`
 * uniquement pour le journaliser, puis affichait « Échec de l'action du panneau
 * (HTTP 503) ». Le correctif serveur était donc intégralement annulé côté
 * navigateur — et le spec de #145 ne pouvait pas le voir : il ne testait que le
 * helper serveur, jamais ce que l'utilisateur finit par lire.
 */
const GENERIQUE = 'Échec de l’action du panneau (HTTP 503).';

describe('message d’échec d’une action de panneau', () => {
  it('préfère la cause nommée par le serveur au générique de statut', () => {
    const { message, code } = panelActionFailureMessage(
      {
        ok: false,
        error: 'La base de données managée n’a pas pu être provisionnée.',
        code: 'DATABASE_PROVISION_UNAVAILABLE',
        reason: 'SHARED_TENANT_UNAVAILABLE',
      },
      GENERIQUE,
    );

    expect(message).toContain('n’a pas pu être provisionnée');
    expect(message).toContain('SHARED_TENANT_UNAVAILABLE');
    expect(message).not.toContain('HTTP 503');
    expect(code).toBe('DATABASE_PROVISION_UNAVAILABLE');
  });

  it('n’invente pas de parenthèse quand le serveur ne nomme pas de raison', () => {
    const { message } = panelActionFailureMessage(
      { error: 'Fonction désactivée.', code: 'FEATURE_NOT_ENABLED' },
      GENERIQUE,
    );

    expect(message).toBe('Fonction désactivée.');
  });

  it('retombe sur le générique quand le serveur n’a rien dit d’affichable', () => {
    expect(panelActionFailureMessage({}, GENERIQUE).message).toBe(GENERIQUE);
    expect(panelActionFailureMessage({ error: '   ' }, GENERIQUE).message).toBe(GENERIQUE);
    expect(panelActionFailureMessage(undefined, GENERIQUE).message).toBe(GENERIQUE);
    expect(panelActionFailureMessage('pas un objet', GENERIQUE).message).toBe(GENERIQUE);
  });

  it('remonte le code même sans message, pour le diagnostic', () => {
    expect(panelActionFailureMessage({ code: 'PANEL_REQUEST_FAILED' }, GENERIQUE).code).toBe('PANEL_REQUEST_FAILED');
  });
});
