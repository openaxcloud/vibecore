import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * THINKING-EFFECTIVITY-001 — **le contournement de BUG-CHAT-THINKING-001 est
 * INERTE, et sept tests verts ne le disaient pas.**
 *
 * `anthropic-thinking.spec.ts` vérifie que `withThinkingDisabled` produit le bon
 * OBJET d'options et que `stream-text` l'appelle. Les sept cas passent. Aucun ne
 * vérifie que l'option **atteint le fournisseur** — et elle ne l'atteint pas :
 *
 *     $ grep -c providerOptions node_modules/@ai-sdk/anthropic/dist/index.js
 *     0
 *
 * `@ai-sdk/anthropic@0.0.39` **ne lit jamais `providerOptions`**. Le
 * contournement écrit donc une option que rien ne consomme, depuis le 18/08.
 *
 * Conséquence mesurée en production le 2026-08-31 (journaux du pod web, 6 h) :
 *
 *     stream onError code=UNKNOWN (Type validation failed: Value:
 *     {"type":"content_block_start","index":0,
 *      "content_block":{"type":"thinking","thinking":"","signature":""}})
 *
 * 4 générations lancées, **10 erreurs de validation**, 0 succès. Le tier
 * « Economy » route vers `claude-opus-5` (`provider: anthropic`, journal
 * `agent-mode.routed`), qui émet des blocs de réflexion par défaut ; la version
 * installée du SDK n'en connaît pas la forme et tue le flux au premier.
 * L'utilisateur voit **« Service unavailable »**.
 *
 * CE TEST vérifie la seule chose qui compte : que le MÉCANISME sur lequel le
 * contournement s'appuie existe réellement dans le paquet installé. C'est
 * dérivé du produit, pas d'une liste écrite à la main — le motif qui a déjà
 * manqué `BUG-THEME-008` et la recette de `BUG-CREATE-010`.
 */

const BUNDLE = 'node_modules/@ai-sdk/anthropic/dist/index.js';

describe('THINKING-EFFECTIVITY-001 — le contournement atteint-il le fournisseur ?', () => {
  it('la sonde lit bien le paquet installé', () => {
    /*
     * Sans ce cas, un chemin changé rendrait « 0 occurrence » — indiscernable
     * d'un fournisseur qui ignore l'option. « Rien trouvé » et « rien lu »
     * doivent être deux résultats différents.
     */
    expect(existsSync(BUNDLE), `${BUNDLE} introuvable : la sonde ne mesure rien`).toBe(true);
    expect(readFileSync(BUNDLE, 'utf8').length, 'paquet vide').toBeGreaterThan(10_000);
  });

  it('CONSTAT : le fournisseur installé ignore `providerOptions`, donc le contournement est inerte', () => {
    const bundle = readFileSync(BUNDLE, 'utf8');

    expect(bundle).not.toContain('providerOptions');
  });

  it('CONSTAT : le fournisseur installé ne sait pas lire un bloc `thinking`', () => {
    const bundle = readFileSync(BUNDLE, 'utf8');

    expect(bundle).not.toContain('thinking');
  });

  /*
   * L'INVARIANT VISÉ. Rouge tant que le défaut est là : `it.fails` réussit tant
   * que le corps échoue. Le jour où le SDK est monté vers une version qui
   * comprend la réflexion, CE test devient rouge et force à retirer les
   * « CONSTAT » ci-dessus ET le contournement devenu inutile.
   */
  it.fails('INVARIANT VISÉ : le fournisseur doit comprendre les blocs de réflexion', () => {
    const bundle = readFileSync(BUNDLE, 'utf8');

    expect(bundle, '@ai-sdk/anthropic ne connaît pas les événements `thinking`').toContain('thinking');
  });
});
