/*
 * BUG-DB-001, moitié « réessai ».
 *
 * Une instance restée `PROVISIONING` enfermait le projet À VIE : le
 * court-circuit `if (existing) return { created: false }` répondait 200 sans
 * rien faire, et rien ne réconciliait jamais la ligne — `updateDatabaseInstance`
 * n'est appelée qu'avec `ACTIVE`.
 *
 * Mesuré en production le 2026-09-01 : 2 instances bloquées depuis 32,2 et
 * 30,4 jours, `updatedAt` = `createdAt`. Les DEUX projets ont été supprimés par
 * leur propriétaire dans les heures suivantes (2 h 23 et 7 h 48).
 *
 * Trois mécanismes, trois tests :
 *   1. une instance UTILISABLE court-circuite toujours — on ne relance jamais
 *      un provisionnement qui a abouti ;
 *   2. un provisionnement RÉCENT court-circuite aussi — on n'interrompt pas ce
 *      qui est réellement en vol ;
 *   3. un provisionnement PÉRIMÉ ne court-circuite plus — le réessai repart.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/** Commentaires retirés : une garde qui matche un commentaire ne garde rien. */
function codeSeul() {
  return readFileSync(join(__dirname, 'app.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((ligne) => !/^\s*\/\//.test(ligne))
    .join('\n');
}

/**
 * Reproduit la décision de la route, telle qu'elle est écrite.
 *
 * ⚠️ LIMITE ASSUMÉE, et c'est pourquoi les tests 4 et 5 existent : cette
 * fonction est une COPIE de la logique de la route. Les tests 1 à 3 documentent
 * donc la table de décision, mais ils resteraient verts si la route dérivait —
 * vérifié par contre-épreuve : rétablir le court-circuit inconditionnel ne les
 * fait PAS rougir, seuls 4 et 5 tombent.
 *
 * Ce sont donc les tests 4 et 5, qui lisent le code réel, qui tiennent le
 * mécanisme. Les trois premiers expliquent ce qu'il doit faire.
 */
function courtCircuite(statut: string, ageMs: number, seuilMs: number): boolean {
  const perime = statut === 'PROVISIONING' && ageMs >= seuilMs;

  return !perime;
}

const SEUIL = 30 * 60 * 1000;

describe('provisionnement de base — le réessai n’est plus muré', () => {
  it('1. une instance ACTIVE court-circuite toujours', () => {
    expect(courtCircuite('ACTIVE', 0, SEUIL)).toBe(true);
    expect(courtCircuite('ACTIVE', 40 * 24 * 3600 * 1000, SEUIL)).toBe(true);
  });

  it('2. un provisionnement RÉCENT court-circuite — on n’interrompt pas ce qui est en vol', () => {
    expect(courtCircuite('PROVISIONING', 0, SEUIL)).toBe(true);
    expect(courtCircuite('PROVISIONING', SEUIL - 1, SEUIL)).toBe(true);
  });

  it('3. un provisionnement PÉRIMÉ ne court-circuite plus', () => {
    expect(courtCircuite('PROVISIONING', SEUIL, SEUIL)).toBe(false);

    // Les deux cas réels mesurés en production : 32,2 j et 30,4 j.
    expect(courtCircuite('PROVISIONING', 32.2 * 24 * 3600 * 1000, SEUIL)).toBe(false);
    expect(courtCircuite('PROVISIONING', 30.4 * 24 * 3600 * 1000, SEUIL)).toBe(false);
  });

  it('4. la route applique bien cette décision (site d’appel)', () => {
    const code = codeSeul();

    expect(code).toMatch(/const PROVISIONING_STALE_MS = 30 \* 60 \* 1000;/);
    expect(code).toMatch(/provisioningPerime/);
    expect(code).toMatch(/existing\.status === 'PROVISIONING'/);

    // Le court-circuit inconditionnel, celui qui murait le réessai, a disparu.
    expect(code).not.toMatch(/if \(existing\) \{\s*return \{ instance: existing, created: false \};/);
  });

  it('5. une ligne périmée est REPRISE, jamais dupliquée', () => {
    const code = codeSeul();

    /*
     * La contrainte unique (projectId, environment) interdit une seconde
     * ligne : la reprise doit passer par `updateDatabaseInstance`, sinon la
     * création échoue et le projet reste muré.
     */
    expect(code).toMatch(/provisioningPerime[\s\S]{0,120}updateDatabaseInstance/);
  });
});
