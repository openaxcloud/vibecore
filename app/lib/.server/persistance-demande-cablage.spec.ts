/*
 * La garde du CÂBLAGE : l'écriture est bien dans la route, et bien AVANT le
 * premier appel au modèle.
 *
 * Le module `persistance-demande.ts` est testé à part et ne prouve rien de la
 * route : retirer l'appel de `api.chat.ts` ne faisait rougir aucun test. Or
 * c'est précisément l'ordre qui fait la correction — écrite après, la demande
 * disparaît exactement comme avant.
 *
 * La garde lit la SOURCE de la route, pas une copie.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const ROUTE = readFileSync(join(process.cwd(), 'app', 'routes', 'api.chat.ts'), 'utf8');

describe('la demande est persistée dans la route de chat', () => {
  it('la route appelle bien le module', () => {
    expect(ROUTE).toContain("from '~/lib/.server/persistance-demande'");
    expect(ROUTE).toContain('demandeAPersister(');
  });

  it('elle écrit sur la route de transcript, en PUT', () => {
    expect(ROUTE).toMatch(/ai\/conversations\/\$\{demande\.conversationId\}\/transcript/);
    expect(ROUTE).toMatch(/method:\s*'PUT'/);
  });

  /*
   * L'assertion qui porte la correction. « Avant tout appel au modèle » est
   * l'invariant ; écrite après, l'écriture ne sert plus à rien.
   */
  it('l’écriture précède le premier appel au modèle', () => {
    const ecriture = ROUTE.indexOf('demandeAPersister(');
    const premierAppel = ROUTE.search(/\bstreamText\s*\(|\bgenerateText\s*\(/);

    expect(ecriture, 'l’appel à demandeAPersister est introuvable').toBeGreaterThan(-1);
    expect(premierAppel, 'aucun appel au modèle trouvé — la garde a perdu son objet').toBeGreaterThan(-1);
    expect(ecriture, 'l’écriture passe APRÈS le premier appel au modèle').toBeLessThan(premierAppel);
  });

  /*
   * L'autre moitié : cette écriture ne doit jamais empêcher un tour de partir.
   * Un `await` nu ferait échouer toute la requête sur une API indisponible.
   */
  it('un échec d’écriture n’interrompt pas le tour', () => {
    const bloc = ROUTE.slice(ROUTE.indexOf('demandeAPersister('), ROUTE.indexOf('demandeAPersister(') + 1400);

    expect(bloc).toContain('try {');
    expect(bloc).toMatch(/catch\s*\(/);
    expect(bloc).toContain('chat.demande.non-persistee');
  });
});
