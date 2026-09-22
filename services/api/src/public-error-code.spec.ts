import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { CODE_GENERIQUE, publicErrorCode } from './public-error-code.js';

/**
 * BUG-QA-PRISMA-CODE-LEAK-001 — le code d'erreur renvoyé au client annonçait la
 * classe exacte de la panne de persistance (`P2002`, `P2003`, `P2025`, `P2037`).
 *
 * Le MESSAGE était bien assaini, le CODE non. Deux fuites distinctes, donc deux
 * règles et deux tests — plus un troisième pour le SITE D'APPEL, qui est le
 * mécanisme le plus souvent laissé sans garde.
 */
describe('BUG-QA-PRISMA-CODE-LEAK-001 — le code exposé ne trahit pas la persistance', () => {
  it('MÉCANISME 1 — un code de forme Prisma ne sort jamais, même en 4xx', () => {
    for (const code of ['P2002', 'P2003', 'P2025', 'P2037']) {
      expect(publicErrorCode({ code, statusCode: 500, hasPublicMessage: false }), code).toBe(CODE_GENERIQUE);

      /*
       * Le cas 4xx compte autant : une erreur de persistance mappée en 409
       * fuiterait exactement la même information.
       */
      expect(publicErrorCode({ code, statusCode: 409, hasPublicMessage: true }), `${code} en 4xx`).toBe(CODE_GENERIQUE);
    }
  });

  it('MÉCANISME 2 — un code PARLANT sur un 5xx SURVIT', () => {
    /*
     * ⚠️ LE TEST QUI MANQUAIT. Ma première version masquait tout code de 5xx
     * non déclaré public. La CI l'a rattrapée : `credit-packs-billing` attend
     * `code === 'CREDIT_PACKS_DISABLED'` sur un **503**. Le produit utilise
     * légitimement des codes parlants sur des 5xx — 503 « fonctionnalité
     * indisponible » en est le cas normal — et des clients en dépendent.
     *
     * Ma contre-garde d'alors ne testait que des 4xx : elle ne POUVAIT pas voir
     * le trou. Une contre-garde qui n'exerce pas le cas visé ne protège rien.
     */
    for (const code of ['CREDIT_PACKS_DISABLED', 'DATABASE_PROVISION_UNAVAILABLE', 'FEATURE_NOT_ENABLED']) {
      expect(publicErrorCode({ code, statusCode: 503, hasPublicMessage: false }), `${code} en 503`).toBe(code);
    }
  });

  it('les 4xx gardent leur code — c’est le contrat de l’API', () => {
    /*
     * Contre-garde : durcir jusqu'à masquer les 4xx casserait les clients, qui
     * doivent distinguer ces cas. Ces codes-là sont écrits par nous.
     */
    for (const code of ['FEATURE_NOT_ENABLED', 'BACKUP_SNAPSHOT_REQUIRED', 'NO_DATABASE']) {
      expect(publicErrorCode({ code, statusCode: 400, hasPublicMessage: false }), code).toBe(code);
    }
  });

  it('MÉCANISME 3 — le gestionnaire global PASSE bien par le filtre', () => {
    /*
     * Une fonction juste dont personne ne se sert ne corrige rien. On lit le
     * code SANS ses commentaires : la prose autour du gestionnaire cite
     * `publicErrorCode`, donc une sonde lisant le fichier brut passerait même
     * si l'appel avait disparu.
     */
    const source = readFileSync(join(__dirname, 'app.ts'), 'utf8');
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

    expect(code.length, 'source lue').toBeGreaterThan(100000);
    expect(code, 'le filtre doit être importé').toMatch(
      /import \{ publicErrorCode \} from '\.\/public-error-code\.js'/,
    );
    expect(code, 'et appliqué au code envoyé').toMatch(
      /code: publicErrorCode\(\{ code, statusCode, hasPublicMessage: Boolean\(error\.publicMessage\) \}\)/,
    );
    expect(code, 'plus aucun envoi du code brut dans le gestionnaire global').not.toMatch(
      /englishFallback \}\),\n\s*code,\n\s*\}\);/,
    );
  });
});
