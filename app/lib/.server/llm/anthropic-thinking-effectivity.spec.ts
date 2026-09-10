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
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

    expect(pkg.dependencies['@ai-sdk/anthropic']).not.toBe('0.0.39');
    expect(pkg.dependencies['@ai-sdk/anthropic']).toMatch(/^1\.2\./u);
  });
});
