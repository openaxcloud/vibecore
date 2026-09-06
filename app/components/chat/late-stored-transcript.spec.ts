import { describe, expect, it } from 'vitest';
import { fautIlAdopterLaTranscriptionRestauree } from './late-stored-transcript';

describe('transcription restaurée après le montage', () => {
  it('adopte une transcription arrivée tard dans un fil vide', () => {
    /*
     * Le cas mesuré : la mémoire de projet livre ses messages après le premier
     * rendu, `chatStarted` reste faux, et le panneau affiche « Agent prêt »
     * alors que la conversation existe.
     */
    expect(fautIlAdopterLaTranscriptionRestauree({ modeProjet: true, messagesRestaures: 6, messagesAffiches: 0 })).toBe(
      true,
    );
  });

  it('ne remplace PAS ce qui est déjà à l’écran', () => {
    /*
     * Une hydratation qui a abouti, ou un message que l'utilisateur vient
     * d'envoyer, sont plus récents. Les écraser serait le même défaut à
     * l'envers — celui qu'on corrige partout aujourd'hui.
     */
    expect(fautIlAdopterLaTranscriptionRestauree({ modeProjet: true, messagesRestaures: 6, messagesAffiches: 2 })).toBe(
      false,
    );
  });

  it('ne fait rien quand il n’y a rien à adopter', () => {
    expect(fautIlAdopterLaTranscriptionRestauree({ modeProjet: true, messagesRestaures: 0, messagesAffiches: 0 })).toBe(
      false,
    );
  });

  it('reste borné au mode IDE de projet', () => {
    expect(
      fautIlAdopterLaTranscriptionRestauree({ modeProjet: false, messagesRestaures: 6, messagesAffiches: 0 }),
    ).toBe(false);
  });

  it('n’adopte pas deux fois la même transcription : « Effacer l’historique » doit laisser le fil vide', () => {
    /*
     * Mesuré le 06/09 : après confirmation, le fil repassait à zéro message et
     * l'effet réadoptait la transcription restaurée — l'historique « effacé »
     * revenait, puis se re-persistait dans une conversation neuve.
     */
    expect(
      fautIlAdopterLaTranscriptionRestauree({
        modeProjet: true,
        messagesRestaures: 4,
        messagesAffiches: 0,
        dejaAdoptee: true,
      }),
    ).toBe(false);
  });
});
