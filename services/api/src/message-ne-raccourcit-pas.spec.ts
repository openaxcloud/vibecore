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

  /*
   * Mesuré en production le 2026-10-01 à 12:52 (projets cmupj5bfb…, cmupj5r9b…) :
   * tour coupé, onglet fermé, le serveur va au bout et écrit SA version —
   * 25 459 et 22 221 caractères, sans raisonnement. L'utilisateur rouvre le
   * projet : la page renvoie la copie partielle qu'elle avait gardée — 295 et
   * 1 827 caractères, RAISONNEMENT COMPRIS — et elle remplace la réponse
   * complète. Le préfixe ne la reconnaissait pas : la copie commence par un bloc
   * de raisonnement que la version du serveur n'a pas.
   */
  it('LE CAS MESURÉ — la copie du navigateur, raisonnement compris, ne remplace pas la réponse complète du serveur', () => {
    const serveur = 'Voici ma démarche.\n\n<boltArtifact id="a">… 25 000 caractères …</boltArtifact>';
    const copie = '<div class="__boltThought__">Je planifie la structure.</div>\nVoici ma';

    const decision = decisionEcritureMessage(serveur, copie);

    expect(decision.ecrire).toBe(false);
    expect(decision.raison).toBe('instantane-perime');
  });

  it('coupée EN PLEIN raisonnement, la copie ne remplace pas non plus la réponse du serveur', () => {
    expect(decisionEcritureMessage('Voici ma démarche.', '<div class="__boltThought__">Je planif').ecrire).toBe(false);
  });

  it('TÉMOIN POSITIF — la version complète du navigateur, raisonnement compris, peut s’écrire', () => {
    const serveur = 'Voici ma démarche.';

    expect(decisionEcritureMessage(serveur, `<div class="__boltThought__">Je planifie.</div>\n${serveur}`).ecrire).toBe(
      true,
    );
  });
});
