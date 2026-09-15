import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * LES RÈGLES DE PROJET DOIVENT ATTEINDRE LE MODÈLE SUR **TOUS** LES TOURS.
 *
 * Mesuré : `projectRules` est calculé une fois (api.chat.ts:937), et seul
 * l'appel de CONTINUATION le passait. Or une continuation n'existe que si la
 * réponse dépasse la limite de jetons — donc sur la quasi-totalité des tours,
 * les règles écrites par l'utilisateur n'atteignaient jamais le modèle, tout en
 * étant lues, comptées et journalisées comme trouvées.
 *
 * La route fait 2500 lignes et aucun test ne la monte : la garde lit la SOURCE,
 * comme `api.chat.web-reference-cablage.spec.ts`.
 */

const CHAT = readFileSync(join(process.cwd(), 'app/routes/api.chat.ts'), 'utf8');

const compter = (aiguille: string) => CHAT.split(aiguille).length - 1;

describe('api.chat.ts — les règles de projet atteignent le modèle sur tous les tours', () => {
  it('témoin positif : le fichier est lu, et il porte bien DEUX appels au générateur', () => {
    expect(CHAT.length).toBeGreaterThan(50_000);

    /*
     * Sans ce témoin, le compte de la ligne suivante pourrait valoir 2 dans un
     * fichier qui n'appelle plus le générateur du tout — le test passerait au
     * vert en ne mesurant rien.
     */
    expect(compter('await streamText({')).toBe(2);
    expect(CHAT).toContain('const projectRules = retrieveProjectRulesContext(');
  });

  it('les DEUX appels portent le contexte des règles — l’initial ET la continuation', () => {
    expect(compter('projectRulesContext: projectRules?.context,')).toBe(2);
  });

  it('chaque appel au générateur porte les quatre contextes du tour, aucun oublié', () => {
    /*
     * On vise la RÈGLE, pas la seule occurrence corrigée : mémoire, règles,
     * skills et référence web voyagent ensemble. Un cinquième contexte ajouté
     * demain à un seul des deux appels reproduirait exactement ce défaut.
     */
    let curseur = 0;

    for (let appel = 0; appel < 2; appel += 1) {
      const debut = CHAT.indexOf('await streamText({', curseur);

      expect(debut).toBeGreaterThan(0);

      const corps = CHAT.slice(debut, debut + 3000);

      expect(corps, `appel ${appel + 1} : mémoire`).toContain('agentMemoryContext:');
      expect(corps, `appel ${appel + 1} : règles de projet`).toContain('projectRulesContext:');
      expect(corps, `appel ${appel + 1} : skills`).toContain('skillsContext:');
      expect(corps, `appel ${appel + 1} : référence web`).toContain('webReferenceContext');

      curseur = debut + 1;
    }
  });
});
