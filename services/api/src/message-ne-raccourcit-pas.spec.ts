import { describe, expect, it } from 'vitest';

import { decisionEcritureMessage } from './message-ne-raccourcit-pas.js';

describe('une écriture ne raccourcit jamais un message déjà persisté', () => {
  it('refuse un instantané périmé du même message et compte ce qu’il aurait effacé', () => {
    const decision = decisionEcritureMessage('bonjour tout le monde', 'bonjour');

    expect(decision.ecrire).toBe(false);
    expect(decision.raison).toBe('instantane-perime');
    expect(decision.perdus).toBe(14);
  });

  it('TÉMOIN POSITIF — une suite du même message passe', () => {
    expect(decisionEcritureMessage('bonjour', 'bonjour tout le monde').ecrire).toBe(true);
  });

  it('une régénération plus COURTE mais différente passe — ce n’est pas un préfixe', () => {
    expect(decisionEcritureMessage('bonjour tout le monde', 'salut').ecrire).toBe(true);
  });

  it('un premier message s’écrit toujours', () => {
    expect(decisionEcritureMessage(null, 'bonjour').ecrire).toBe(true);
    expect(decisionEcritureMessage('', 'bonjour').ecrire).toBe(true);
  });

  it('une réécriture identique passe — elle n’efface rien', () => {
    expect(decisionEcritureMessage('bonjour', 'bonjour').ecrire).toBe(true);
  });

  it('le cas réel du 2026-09-08 : 37 611 caractères ne remplacent pas 83 703', () => {
    const complet = 'x'.repeat(83_703);
    const tronque = complet.slice(0, 37_611);
    const decision = decisionEcritureMessage(complet, tronque);

    expect(decision.ecrire).toBe(false);
    expect(decision.perdus).toBe(46_092);
  });

  it('un message vidé ne peut pas effacer un message plein', () => {
    expect(decisionEcritureMessage('bonjour tout le monde', '').ecrire).toBe(false);
  });
});
