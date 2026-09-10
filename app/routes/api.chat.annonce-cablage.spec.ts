import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/*
 * LE CÂBLAGE, PAS SEULEMENT LA DÉCISION.
 *
 * `annonce-sans-artefact.ts` peut être parfait et ne rien corriger tant que
 * `api.chat.ts` ne le consulte pas : c'est exactement l'état dans lequel j'ai
 * livré la première version. Ce fichier tient le branchement lui-même.
 */
const source = readFileSync(join(__dirname, 'api.chat.ts'), 'utf8');

/** Neutralise les commentaires : on veut matcher du CODE, jamais de la prose. */
const code = source.replace(/\/\*[\s\S]*?\*\//g, (bloc) => bloc.replace(/[^\n]/g, ' ')).replace(/\/\/.*$/gm, '');

describe('la décision « annonce sans artefact » est réellement branchée', () => {
  it('la route importe la décision', () => {
    expect(code).toMatch(/import \{ suiteDuTour \} from '~\/lib\/runtime\/annonce-sans-artefact'/u);
  });

  it('elle la calcule avec le mode, le fichier émis et le compteur de segments', () => {
    expect(code).toMatch(/const suite = suiteDuTour\(/u);
    expect(code).toMatch(/modeConstruction: chatMode === 'build'/u);

    /*
     * Le drapeau `emittedFileAction` a été remplacé par un COMPTE (`fichiersEmis`),
     * parce que le critère d'aptitude d'un fournisseur raisonne sur un nombre et
     * qu'un drapeau converti en `1` aurait fait décider un repli sur une mesure
     * qu'on n'a pas faite. L'intention de cette garde est inchangée — la décision
     * doit être calculée à partir du fichier réellement émis, et pas d'une
     * constante — donc on épingle la nouvelle source de vérité, et on épingle
     * AUSSI que l'ancienne a bien disparu : deux vérités pour un fait, c'est ce
     * qui produit un constat faux au premier refactor.
     */
    expect(code).toMatch(/fichierEmis: fichiersEmis > 0/u);
    expect(code).not.toMatch(/emittedFileAction/u);
    expect(code).toMatch(/segmentsConsommes: continuationSegments/u);
    expect(code).toMatch(/segmentsMax: MAX_RESPONSE_SEGMENTS/u);
  });

  it('LA BRANCHE TERMINALE la consulte — sans quoi rien ne change', () => {
    /*
     * Le défaut tenait dans cette seule condition : `finishReason !== 'length'`
     * suffisait à terminer le tour. Elle doit désormais exiger AUSSI que la
     * décision ne demande pas de continuer.
     */
    expect(code).toMatch(/if \(finishReason !== 'length' && suite\.action !== 'continuer'\)/u);
  });

  it('LA RELANCE vient de la décision, pas de `CONTINUE_PROMPT` en dur', () => {
    /*
     * Mesuré : la relance nue rend zéro fichier. Recâbler `CONTINUE_PROMPT` ici
     * remettrait le correctif qui a l'air juste et ne change rien.
     */
    expect(code).toMatch(/suite\.action === 'continuer' \? suite\.relance : CONTINUE_PROMPT/u);
  });

  it('le plafond échoue FRANCHEMENT', () => {
    expect(code).toMatch(/suite\.action === 'terminer-en-echec'/u);
  });

  it('LE COMMENTAIRE MENTEUR A DISPARU', () => {
    /*
     * « model likely too weak » a orienté cinq jours d'enquête vers une cause
     * fausse. Il ne doit pas revenir : le même modèle écrit vingt fichiers en
     * appel direct depuis le même pod.
     */
    expect(code, 'la phrase ne doit plus être JOURNALISÉE').not.toContain('model likely too weak');
    expect(code).toContain('stopped between preamble and implementation');

    /*
     * Elle reste CITÉE en commentaire, et c'est délibéré : effacer la trace de
     * l'erreur ferait perdre la leçon avec elle. Ce qui disparaît, c'est la
     * ligne que la production écrit — pas la mémoire de ce qu'elle affirmait.
     */
    expect(source, 'la citation en commentaire doit rester').toContain('model likely too weak');
  });

  it('TÉMOIN — le fichier lu est bien la route, et il n’est pas vide', () => {
    expect(source.length).toBeGreaterThan(50_000);
    expect(code).toContain('warnIfNoFilesGenerated');
  });
});
