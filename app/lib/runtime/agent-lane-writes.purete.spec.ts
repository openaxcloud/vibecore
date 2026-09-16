import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const RACINE = join(__dirname, '../../..');
const lire = (chemin: string) => readFileSync(join(RACINE, chemin), 'utf8');

/*
 * LA SÉPARATION QUI TIENT LE GRAPHE DE MODULES.
 *
 * `AssistantMessage` doit lire ce que les sous-agents ont écrit. La première
 * version lisait ce compte depuis `useMessageParser` — et faisait donc entrer
 * dans le morceau d'affichage un parseur construit au chargement du module et
 * `workbenchStore` avec ses dépendances de navigateur (`js-cookie`,
 * `file-saver`, `jszip`). Un module qui affiche n'a aucune raison de tirer le
 * moteur qui écrit.
 *
 * Ces deux assertions sont la garde. Sans elles, un `import` anodin remet la
 * chaîne entière dans le composant sans qu'aucun test ne bouge — et le défaut
 * ne se voit qu'au chargement d'un morceau, en production.
 */
describe('le module de lecture des lanes reste pur', () => {
  it("n'importe ni le magasin d'établi ni le hook de parsing", () => {
    const source = lire('app/lib/runtime/agent-lane-writes.ts');
    expect(source).not.toContain('stores/workbench');
    expect(source).not.toContain('hooks/useMessageParser');
    expect(source).not.toContain('enhanced-message-parser');
  });

  it("n'est importé par la surface d'affichage QUE depuis ce module pur", () => {
    const composant = lire('app/components/chat/AssistantMessage.tsx');

    // TÉMOIN : le composant lit bien le compte (sinon l'assertion suivante est creuse).
    expect(composant).toContain('cheminsEcritsParLesLanes');

    // Et il le lit depuis le module pur, jamais depuis le hook.
    expect(composant).toContain("from '~/lib/runtime/agent-lane-writes'");
    expect(composant).not.toContain("from '~/lib/hooks/useMessageParser'");
  });
});
