import { existsSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

/**
 * THINKING-EFFECTIVITY-001 — **le contournement est retiré, et voici pourquoi il
 * ne pouvait pas fonctionner.**
 *
 * Ce fichier affirmait l'inertie du contournement par l'ABSENCE de
 * `providerOptions` dans le paquet installé. Après la montée à
 * `@ai-sdk/anthropic@1.2.12`, `providerOptions` EST là — l'ancienne assertion
 * passerait donc au rouge en mesurant une chose qui n'a plus de rapport avec ce
 * qu'elle protège.
 *
 * LA VRAIE CAUSE, mesurée le 2026-09-10 sur le bundle de `1.2.12` : le SDK ne
 * regarde `thinking` que pour l'ACTIVER —
 *
 *     const isThinking = anthropicOptions?.thinking?.type === "enabled";
 *
 * `withThinkingDisabled` envoyait `{ type: 'disabled' }`, ce qui signifie pour ce
 * SDK « ne pas activer » : c'est déjà le défaut, et AUCUN champ `thinking` n'est
 * envoyé à l'API. Le contournement reposait donc sur une PRÉMISSE FAUSSE —
 * l'existence d'un interrupteur « désactiver la réflexion ». Il n'y en a pas.
 *
 * Il était inerte avant la montée parce que l'option n'était pas lue ; il serait
 * resté inerte après, parce que la valeur ne veut rien dire. Retiré.
 *
 * CE QUE LA MONTÉE CORRIGE VRAIMENT : le SDK COMPREND désormais les blocs de
 * réflexion (`thinking` = 7 occurrences, `signature` = 11, `redacted_thinking`
 * = 5) au lieu de tuer le flux au premier. Le modèle en émet toujours autant —
 * ce sont le temps de réponse, les jetons facturés et le contenu affiché qui
 * changent, pas l'émission.
 */

const BUNDLE = 'node_modules/@ai-sdk/anthropic/dist/index.js';

describe('THINKING-EFFECTIVITY-001 — pourquoi le contournement ne pouvait pas marcher', () => {
  it('la sonde lit bien le paquet installé', () => {
    /*
     * Sans ce cas, un chemin changé rendrait « 0 occurrence » — indiscernable
     * d'un fournisseur qui ignore l'option. « Rien trouvé » et « rien lu »
     * doivent être deux résultats différents.
     *
     * Ce cas a déjà servi : lancé depuis un worktree, `node_modules/` n'existe
     * pas et les trois cas rougissaient. C'est la sentinelle qui l'a dit.
     */
    expect(existsSync(BUNDLE), `${BUNDLE} introuvable : la sonde ne mesure rien`).toBe(true);
    expect(readFileSync(BUNDLE, 'utf8').length, 'paquet vide').toBeGreaterThan(10_000);
  });

  it('LA CAUSE : le SDK ne lit `thinking` que pour l’ACTIVER', () => {
    const bundle = readFileSync(BUNDLE, 'utf8');

    /*
     * C'est cette ligne qui condamne le contournement : `disabled` n'est pas une
     * valeur que le SDK traite, c'est simplement « pas enabled ».
     */
    expect(bundle).toContain('=== "enabled"');
    expect(bundle).not.toContain('=== "disabled"');
  });

  it('LE GAIN : le SDK sait désormais lire un bloc de réflexion', () => {
    const bundle = readFileSync(BUNDLE, 'utf8');

    for (const marqueur of ['thinking_delta', 'signature_delta', 'redacted-reasoning']) {
      expect(bundle, `le SDK doit connaître ${marqueur}`).toContain(marqueur);
    }
  });

  it('LE CONTOURNEMENT EST BIEN PARTI — et il ne revient pas par la fenêtre', () => {
    /*
     * Le rappel de dette laissé par l'auteur d'origine exigeait ce retrait à la
     * montée. Ce cas le remplace : il rougit si quelqu'un réintroduit l'option.
     */
    expect(existsSync('app/lib/.server/llm/anthropic-thinking.ts')).toBe(false);
    expect(readFileSync('app/lib/.server/llm/stream-text.ts', 'utf8')).not.toContain('withThinkingDisabled');
  });

  it('TÉMOIN — la version installée est bien celle qui porte le gain', () => {
    /*
     * LE TÉMOIN LISAIT LA DÉCLARATION, PAS L'INSTALLATION — et il a menti.
     *
     * Il lisait `package.json`, c'est-à-dire ce que le dépôt DEMANDE. Mesuré le
     * 2026-09-10 dans un bac à sable dont `node_modules` datait du 08-09 :
     * déclaré `1.2.12`, INSTALLÉ `0.0.39`. Le témoin passait au vert en
     * annonçant « la version installée est bien celle qui porte le gain »
     * pendant que les deux cas au-dessus rougissaient sur des chaînes absentes
     * du bundle — deux rouges incompréhensibles sous un vert rassurant, alors
     * que la cause tenait en une ligne.
     *
     * C'est le défaut que ce fichier dénonce ailleurs, commis par lui-même : une
     * sonde qui mesure autre chose que ce qu'elle affirme. On lit désormais le
     * paquet RÉELLEMENT chargé, et le message nomme le geste de réparation.
     */
    const declaree = JSON.parse(readFileSync('package.json', 'utf8')).dependencies['@ai-sdk/anthropic'];
    const installee = JSON.parse(readFileSync('node_modules/@ai-sdk/anthropic/package.json', 'utf8')).version;

    expect(
      installee,
      `@ai-sdk/anthropic installé en ${installee} alors que le dépôt demande ${declaree}. ` +
        'Les deux cas ci-dessus lisent le bundle INSTALLÉ : ils rougiront tant que ' +
        "l'arbre n'est pas à jour. Lancez `pnpm install --frozen-lockfile`.",
    ).toMatch(/^1\.2\./u);

    /* La déclaration reste vérifiée : une régression du `package.json` doit rougir aussi. */
    expect(declaree).toMatch(/^1\.2\./u);
  });
});
