import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/*
 * LE CÂBLAGE DU RATTRAPAGE — ce que les tests de comportement ne voient pas.
 *
 * `rattrapage-fichiers.spec.ts` rejoue le scénario avec le vrai parseur, le
 * vrai moteur et la vraie règle de réarmement, mais avec un workbench réduit à
 * son aiguillage. Ce fichier tient les trois points où le produit branche ces
 * pièces : si l'un disparaît, le scénario reste vert et le produit ne rattrape
 * plus rien.
 */
const lire = (chemin: string) => readFileSync(chemin, 'utf8');

describe('câblage du rattrapage à la reprise', () => {
  it('le workbench passe par actionApresReprise AVANT la garde « déjà exécutée »', () => {
    const source = lire('app/lib/stores/workbench.ts');
    const corps = source.slice(source.indexOf('async _runAction('));
    const reprise = corps.indexOf('actionApresReprise(');
    const garde = corps.indexOf('if (!action || action.executed)');

    expect(reprise).toBeGreaterThan(-1);
    expect(garde).toBeGreaterThan(reprise);
    expect(corps.slice(reprise, garde)).toContain('this.#messagesRattrapes.has(data.messageId)');
  });

  it('le chat arme le rattrapage sur une coupure réseau ET sur le chien de garde', () => {
    const source = lire('app/components/chat/Chat.client.tsx');

    const surErreur = source.slice(
      source.indexOf('onError: (e) => {'),
      source.indexOf('onFinish: (message, response)'),
    );

    expect(surErreur).toMatch(/if \(estUneCoupureReseau\(e\)\) \{\s*armerRattrapageRef\.current\(\);/);

    const chienDeGarde = source.slice(source.indexOf("toast.warning(copy['chatClient.generation.stalled']);"));

    expect(chienDeGarde.slice(0, 400)).toContain('armerRattrapageRef.current();');
    expect(source).toContain('armerRattrapageRef.current = armerRattrapage;');
  });

  it("le crochet autorise la reprise et arme le rejeu AVANT d'appliquer le nouveau fil", () => {
    const source = lire('app/lib/hooks/useRattrapageALaReprise.ts');
    const autoriser = source.indexOf('workbenchStore.autoriserLaReprise(messageId);');
    const rejouer = source.indexOf('rejouerLeMessage(messageId, contenu);');
    const appliquer = source.indexOf('appliquer(filApresRattrapage(fil, plan));');

    expect(autoriser).toBeGreaterThan(-1);
    expect(rejouer).toBeGreaterThan(autoriser);
    expect(appliquer).toBeGreaterThan(rejouer);
  });
});
