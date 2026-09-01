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
 * ⚠️ Une première version de ces tests exerçait une COPIE de la décision, restée
 * dans la route : rétablir le défaut ne les faisait PAS rougir. La décision est
 * désormais extraite dans `database-provisioning-staleness.ts`, que ces tests
 * APPELLENT — ils portent donc sur le code réellement exécuté.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { PROVISIONING_STALE_MS, estProvisionnementPerime } from './database-provisioning-staleness.js';

/** Commentaires retirés : une garde qui matche un commentaire ne garde rien. */
function codeSeul() {
  return readFileSync(join(__dirname, 'app.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((ligne) => !/^\s*\/\//.test(ligne))
    .join('\n');
}

const T0 = Date.parse('2026-09-01T12:00:00Z');
const instance = (status: string, ageMs: number) => ({ status, createdAt: new Date(T0 - ageMs) });

describe('provisionnement de base — le réessai n’est plus muré', () => {
  it('1. une instance ACTIVE n’est jamais périmée, même très ancienne', () => {
    expect(estProvisionnementPerime(instance('ACTIVE', 0), T0)).toBe(false);
    expect(estProvisionnementPerime(instance('ACTIVE', 40 * 24 * 3600 * 1000), T0)).toBe(false);
  });

  it('1 bis. les autres états délibérés non plus', () => {
    for (const statut of ['SUSPENDED', 'DELETED']) {
      expect(estProvisionnementPerime(instance(statut, 40 * 24 * 3600 * 1000), T0)).toBe(false);
    }
  });

  it('2. un provisionnement RÉCENT n’est pas périmé — on n’interrompt pas ce qui est en vol', () => {
    expect(estProvisionnementPerime(instance('PROVISIONING', 0), T0)).toBe(false);
    expect(estProvisionnementPerime(instance('PROVISIONING', PROVISIONING_STALE_MS - 1), T0)).toBe(false);
  });

  it('3. un provisionnement PÉRIMÉ l’est, y compris aux deux cas réels mesurés', () => {
    expect(estProvisionnementPerime(instance('PROVISIONING', PROVISIONING_STALE_MS), T0)).toBe(true);
    expect(estProvisionnementPerime(instance('PROVISIONING', 32.2 * 24 * 3600 * 1000), T0)).toBe(true);
    expect(estProvisionnementPerime(instance('PROVISIONING', 30.4 * 24 * 3600 * 1000), T0)).toBe(true);
  });

  it('3 bis. une absence d’instance n’est pas un provisionnement périmé', () => {
    expect(estProvisionnementPerime(undefined, T0)).toBe(false);
  });

  it('4. la route appelle bien cette décision (site d’appel)', () => {
    const code = codeSeul();

    expect(code).toMatch(/const provisioningPerime = estProvisionnementPerime\(existing\)/);

    // Le court-circuit inconditionnel, celui qui murait le réessai, a disparu.
    expect(code).not.toMatch(/if \(existing\) \{\s*return \{ instance: existing, created: false \};/);

    // …et la décision n'est pas recalculée sur place, ce qui la ferait dériver.
    expect(code).not.toMatch(/existing\.status === 'PROVISIONING' &&/);
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
