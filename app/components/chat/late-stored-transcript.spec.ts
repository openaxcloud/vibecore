import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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

  it('un fil VIDÉ PAR L’UTILISATEUR n’adopte plus rien, même une transcription à l’identité neuve', () => {
    /*
     * Mesuré le 14/09 (run E2E 1969 sur `main`, runner chargé, rouge 3/3) : le
     * repli serveur posait sa transcription APRÈS l'effacement. Son identité
     * n'était pas celle que `dejaAdoptee` connaissait — la garde passait, et
     * les deux messages « effacés » revenaient. `dejaAdoptee` seule est donc
     * insuffisante : c'est le cas que ce test tient.
     */
    expect(
      fautIlAdopterLaTranscriptionRestauree({
        modeProjet: true,
        messagesRestaures: 2,
        messagesAffiches: 0,
        dejaAdoptee: false,
        filVideParLUtilisateur: true,
      }),
    ).toBe(false);
  });
});

/**
 * LES SITES D'APPEL. La règle peut être parfaite et n'être câblée nulle part
 * (règle 15) : ce bloc lit `Chat.client.tsx` et exige les trois branchements
 * que le correctif du 14/09 a posés — chacun a été mesuré nécessaire.
 */
describe('Chat.client — « Effacer l’historique » coupe TOUS les retours tardifs', () => {
  const source = readFileSync(join(process.cwd(), 'app/components/chat/Chat.client.tsx'), 'utf8');

  it('l’effacement marque le fil comme vidé par l’utilisateur, et l’adoption le lit', () => {
    expect(source).toContain('filVideParLUtilisateurRef.current = true;');
    expect(source).toContain('filVideParLUtilisateur: filVideParLUtilisateurRef.current,');
  });

  it('l’hydratation de la transcription connaît la génération du fil', () => {
    expect(source).toContain('generationDuFil: () => generationDuFilRef.current,');
  });

  it('la synchronisation refuse une génération passée AVANT de demander une conversation', () => {
    const debut = source.indexOf('const syncProjectAiTranscript = useCallback(');
    const fin = source.indexOf('[astCopy, ensureProjectAiConversation, projectId, projectIdeMode],', debut);

    expect(debut).toBeGreaterThan(-1);
    expect(fin).toBeGreaterThan(debut);

    const bloc = source.slice(debut, fin);
    const garde = bloc.indexOf('if (generation !== generationDuFilRef.current) {');
    const creation = bloc.indexOf('await ensureProjectAiConversation()');

    expect(garde, 'la garde de génération doit exister dans la synchronisation').toBeGreaterThan(-1);
    expect(creation).toBeGreaterThan(-1);
    expect(garde, 'la garde doit précéder la création de conversation').toBeLessThan(creation);
  });

  it('une seule création de conversation à la fois', () => {
    expect(source).toContain("import { partagerLaCreation } from './creation-partagee';");
    expect(source).toContain('return partagerLaCreation(creationDeConversationRef, async () => {');
  });
});
