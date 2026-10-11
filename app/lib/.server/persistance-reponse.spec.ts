import { describe, expect, it } from 'vitest';

import { reponseAPersister } from './persistance-reponse';
import { estLaVersionDuServeur } from '~/lib/chat/rattrapage-reprise';

describe('la réponse complète est écrite par le serveur', () => {
  it('rend la ligne à écrire : même identifiant que le navigateur, contenu complet', () => {
    expect(
      reponseAPersister({ conversationId: 'conv-1', clientId: 'msg-stable', contenu: 'Voici ma démarche.' }),
    ).toEqual({ conversationId: 'conv-1', clientId: 'msg-stable', content: 'Voici ma démarche.' });
  });

  it('LE CAS MESURÉ — le contenu est écrit tel quel, sans troncature', () => {
    const long = 'x'.repeat(19_932);

    expect(reponseAPersister({ conversationId: 'c', clientId: 'm', contenu: long })?.content.length).toBe(19_932);
  });

  it('une réponse vide ne s’écrit pas — elle écraserait la ligne du navigateur', () => {
    expect(reponseAPersister({ conversationId: 'c', clientId: 'm', contenu: '   ' })).toBeNull();
    expect(reponseAPersister({ conversationId: 'c', clientId: 'm', contenu: '' })).toBeNull();
  });

  it('sans conversation ni identifiant, rien à écrire', () => {
    expect(reponseAPersister({ conversationId: undefined, clientId: 'm', contenu: 'a' })).toBeNull();
    expect(reponseAPersister({ conversationId: 'c', clientId: '', contenu: 'a' })).toBeNull();
  });

  /*
   * Le rattrapage du navigateur ne reprend QUE la version du serveur, qu'il
   * reconnaît à l'absence de raisonnement (mesuré le 2026-10-01 : sinon il
   * reprend sa propre copie partielle, avant la fin du tour). Les deux moitiés
   * sont couplées ici : ce que le serveur écrit doit passer le critère du
   * navigateur.
   */
  it('n’écrit jamais de raisonnement — le navigateur reconnaît sa version à cela', () => {
    const reponse = reponseAPersister({
      conversationId: 'c',
      clientId: 'm',
      contenu: '<div class="__boltThought__">Je planifie.</div>\nVoici ma démarche.',
    });

    expect(reponse?.content).toBe('Voici ma démarche.');
    expect(estLaVersionDuServeur(reponse?.content ?? '')).toBe(true);
  });
});
