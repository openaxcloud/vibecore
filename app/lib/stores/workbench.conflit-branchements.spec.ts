/**
 * LES DEUX BRANCHEMENTS DU GARDE-FOU « CE QUE L'UTILISATEUR ENREGISTRE FAIT FOI ».
 *
 * `workbench.conflit-utilisateur.spec.ts` tient la logique sur le vrai
 * WorkbenchStore, mais il appelle lui-même `noterLaLectureDeLAgent` et passe
 * lui-même `conflit` à la règle d'application automatique. Les deux appelants
 * réels sont ailleurs, et chacun peut être défait sans qu'aucun test de la
 * logique ne rougisse :
 *  - sans `noterLaLectureDeLAgent()` à l'envoi, un enregistrement fait entre
 *    l'envoi et le premier morceau de l'agent est effacé en silence ;
 *  - sans `conflit` passé par BaseChat, l'application automatique ré-accepte la
 *    proposition mise en revue — et écrase la version de l'utilisateur qu'on
 *    venait de garder.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const lire = (chemin: string) => readFileSync(new URL(chemin, import.meta.url), 'utf8');

function blocApres(source: string, debut: string, longueur: number) {
  const indice = source.indexOf(debut);
  expect(indice, `« ${debut} » introuvable`).toBeGreaterThan(-1);

  return source.slice(indice, indice + longueur);
}

describe('branchements du garde-fou de conflit', () => {
  it('Chat.client note la lecture de l’agent en préparant CHAQUE requête', () => {
    const bloc = blocApres(lire('../../components/chat/Chat.client.tsx'), 'experimental_prepareRequestBody:', 900);

    expect(bloc).toContain('workbenchStore.noterLaLectureDeLAgent();');
  });

  it('BaseChat passe `conflit` à la règle d’application automatique', () => {
    const bloc = blocApres(lire('../../components/chat/BaseChat.tsx'), '!shouldAutoApplyPatch({', 400);

    expect(bloc).toContain('conflit: proposal.conflit');
  });
});
