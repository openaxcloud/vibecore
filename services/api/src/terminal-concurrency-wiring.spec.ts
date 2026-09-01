import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * BUG-QUOTA-001, SECOND MÉCANISME — la route doit CONSOMMER le registre.
 *
 * Le correctif en a deux :
 *   1. Le registre ne facture qu'à la transition 0→1 et ne rembourse qu'à 1→0.
 *      Tenu par `terminal-concurrency.spec.ts`.
 *   2. La route `/terminal` l'APPELLE réellement. NON tenu — contre-épreuve
 *      faite : en remplaçant l'appel par `const chargeSlot = true`, les 8 tests
 *      du registre restaient VERTS, et le quota redevenait par connexion.
 *
 * Un correctif à deux mécanismes exige un test par mécanisme.
 *
 * ⚠️ On mesure le code SANS ses commentaires : la prose autour de la route cite
 * `acquireTerminalSlot`, donc un test lisant le fichier brut passerait même si
 * l'appel avait disparu.
 */

const SOURCE = readFileSync(join(__dirname, 'app.ts'), 'utf8');
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

describe('BUG-QUOTA-001 — câblage de la route terminal sur le registre', () => {
  it('la sonde lit bien du code, et les commentaires en sont retirés', () => {
    expect(CODE.length, 'source lue').toBeGreaterThan(100000);
    expect(CODE, 'les commentaires doivent être retirés').not.toContain('le créneau appartient à la SESSION');
  });

  it('la prise de créneau passe par le registre, clé sur le sessionId', () => {
    expect(CODE).toMatch(/chargeSlot\s*=\s*sessionSlotKey\s*\?\s*acquireTerminalSlot\(/);
  });

  it('le remboursement passe par le registre', () => {
    expect(CODE).toMatch(/releaseTerminalSlot\(organizationId,\s*sessionSlotKey\)/);
  });

  it('le quota n’est consommé QUE si le registre le demande', () => {
    /* `if (chargeSlot)` est ce qui distingue une session neuve d'un rattachement. */
    expect(CODE).toMatch(/if\s*\(chargeSlot\)\s*\{/);
  });

  it('un refus de quota rend la prise, sinon la session refusée passerait gratuitement ensuite', () => {
    expect(CODE).toMatch(/catch[\s\S]{0,400}releaseTerminalSlot\(organizationId,\s*sessionSlotKey\)/);
  });
});
