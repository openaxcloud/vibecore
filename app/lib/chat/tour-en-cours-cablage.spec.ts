/**
 * LES BRANCHEMENTS DE LA MARQUE « TOUR EN COURS » DANS LE CHAT.
 *
 * `tour-en-cours.spec.ts` tient la marque, `workbench.tour-interrompu.spec.ts`
 * tient la reprise en revue ; ni l'un ni l'autre ne rougit si le chat cesse de
 * poser, d'effacer ou de lire la marque. Chaque oubli a sa conséquence :
 *  - plus posée à l'envoi : le tour interrompu n'est jamais repris ;
 *  - plus effacée à la fin, à l'arrêt ou après rattrapage : un tour FINI est
 *    reproposé en revue à chaque ouverture ;
 *  - lue APRÈS le parseur : ses actions sont déjà sautées comme historiques.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../../components/chat/Chat.client.tsx', import.meta.url), 'utf8');

const bloc = (debut: string, longueur: number) => {
  const i = source.indexOf(debut);
  expect(i, `« ${debut} » introuvable`).toBeGreaterThan(-1);

  return source.slice(i, i + longueur);
};

describe('le chat pose, efface et lit la marque du tour en cours', () => {
  it('posée en préparant CHAQUE requête', () => {
    expect(bloc('experimental_prepareRequestBody:', 1200)).toContain('noterLeTourEnCours(projectId);');
  });

  it('effacée à la fin normale, à l’arrêt volontaire, sur une erreur du serveur, après rattrapage', () => {
    expect(bloc('onFinish: (message, response) => {', 400)).toContain('effacerLeTourEnCours(projectId);');
    expect(bloc('const abort = () => {', 300)).toContain('effacerLeTourEnCours(projectId);');
    expect(bloc('if (estUneCoupureReseau(e)) {', 300)).toContain('effacerLeTourEnCours(projectId);');
    expect(bloc('appliquer: (fil) => {', 300)).toContain('effacerLeTourEnCours(projectId);');
  });

  it('lue AVANT le parseur : au premier rendu pour le cache local, avant setMessages pour le fil relu', () => {
    expect(source).toMatch(
      /repriseDuCacheLocal\.current = true;\s*reprendreLeDernierTourSiInterrompu\(initialMessages\);/,
    );
    expect(source).toMatch(
      /markHydratedMessages\(backendMessages\.map\(\(message\) => message\.id\)\);\s*reprendreLeDernierTourSiInterrompu\(backendMessages\);\s*setMessages\(backendMessages\);/,
    );
  });
});
