import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * BUG-TERM-002, SECOND MÉCANISME — le produit doit CONSOMMER le module.
 *
 * Le correctif en a deux :
 *   1. `deriveTerminalId` rend un identifiant déterministe. Tenu par
 *      `terminal-session-key.spec.ts`.
 *   2. `openTerminal()` l'APPELLE réellement. NON tenu — contre-épreuve faite :
 *      en remettant la forge en ligne `terminal-${Date.now()}-${Math.random()}`
 *      dans `openTerminal()`, les 52 tests de `runtime-remote` restaient VERTS.
 *
 * C'est exactement le défaut d'origine sous une autre forme : le premier
 * garde-fou épinglait une COPIE de la dérivation ; extraire la logique l'a rendu
 * testable, mais a laissé le SITE D'APPEL sans garde. Un correctif à deux
 * mécanismes exige un test par mécanisme.
 *
 * ⚠️ On mesure le code SANS ses commentaires : la prose cite forcément
 * `deriveTerminalId` et `Date.now()`, donc un test qui lirait le fichier brut
 * réussirait ou échouerait pour la mauvaise raison.
 */

const SOURCE = readFileSync(join(__dirname, 'index.ts'), 'utf8');

/** Le fichier privé de ses commentaires — seul le code décide du comportement. */
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

describe('BUG-TERM-002 — câblage de openTerminal sur le module d’identité', () => {
  it('la sonde lit bien du code, et les commentaires en sont retirés', () => {
    /* Témoin : sans lui, un chemin erroné rendrait une chaîne vide et tout « passerait ». */
    expect(CODE.length, 'source lue').toBeGreaterThan(2000);
    expect(CODE, 'les commentaires doivent être retirés').not.toContain('Régression BUG-TERM-002');
  });

  it('openTerminal prend son identifiant dans le module', () => {
    expect(CODE).toMatch(/const\s+terminalId\s*=\s*deriveTerminalId\(/);
  });

  it('openTerminal construit son chemin avec le module', () => {
    expect(CODE).toMatch(/const\s+terminalPath\s*=\s*buildTerminalPath\(/);
  });

  it('plus aucune forge d’identifiant de terminal en ligne dans le produit', () => {
    /*
     * La forge aléatoire subsiste LÉGITIMEMENT dans `terminal-session.ts`, comme
     * repli pour un appelant sans identité de panneau. Ce qui est interdit,
     * c'est qu'`index.ts` la reconstruise lui-même — c'était le défaut.
     */
    expect(CODE, 'identifiant de terminal forgé en ligne').not.toMatch(/`terminal-\$\{Date\.now\(\)\}/);
  });
});
