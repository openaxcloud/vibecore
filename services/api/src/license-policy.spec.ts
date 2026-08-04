import { describe, expect, it } from 'vitest';

import { evaluateLicenseForRemix, listDerivativeAllowedLicenseIds } from './license-policy.js';

/*
 * P0-V3-05 réserve #7 — la licence doit RÉELLEMENT autoriser la dérivation.
 * Avant ce module, `licenseId` était une chaîne libre : « PROPRIETARY — NO
 * DERIVATIVES » passait tous les gates.
 */
describe('SPDX derivative-rights policy', () => {
  it('accepts permissive licenses and returns the CANONICAL id', () => {
    for (const id of ['MIT', 'Apache-2.0', 'BSD-3-Clause', 'ISC', 'Unlicense', 'CC0-1.0']) {
      const decision = evaluateLicenseForRemix(id);
      expect(decision.allowed, id).toBe(true);
      expect(decision.canonicalId, id).toBe(id);
    }
  });

  it('accepts copyleft — dérivation autorisée, obligations héritées', () => {
    for (const id of ['GPL-3.0-or-later', 'AGPL-3.0-only', 'MPL-2.0', 'LGPL-2.1-only', 'EPL-2.0']) {
      expect(evaluateLicenseForRemix(id).allowed, id).toBe(true);
    }
  });

  it('REFUSES no-derivative licenses with a typed reason', () => {
    for (const id of ['CC-BY-ND-4.0', 'CC-BY-NC-ND-4.0', 'PROPRIETARY', 'ALL_RIGHTS_RESERVED']) {
      const decision = evaluateLicenseForRemix(id);
      expect(decision.allowed, id).toBe(false);
      expect(decision.reason, id).toBe('NOT_DERIVATIVE');
      expect(decision.canonicalId, id).toBeUndefined();
    }
  });

  it('REFUSES the exact string that used to slip through', () => {
    // Le contre-exemple de l'audit : chaîne libre, remixAllowed=true, gates verts.
    const decision = evaluateLicenseForRemix('PROPRIETARY — NO DERIVATIVES');
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('UNKNOWN_LICENSE');
  });

  it('is FAIL-CLOSED: unknown / empty / LicenseRef are refused', () => {
    for (const id of ['', '   ', 'LicenseRef-Custom', 'my-company-eula', 'MITT', 'SSPL-1.0']) {
      const decision = evaluateLicenseForRemix(id);
      expect(decision.allowed, JSON.stringify(id)).toBe(false);
    }

    expect(evaluateLicenseForRemix(null).allowed).toBe(false);
    expect(evaluateLicenseForRemix(undefined).allowed).toBe(false);
  });

  it('normalises casing/spacing to a canonical SPDX id — never persists raw input', () => {
    expect(evaluateLicenseForRemix('mit').canonicalId).toBe('MIT');
    expect(evaluateLicenseForRemix('  Apache 2.0 ').canonicalId).toBe('Apache-2.0');
    expect(evaluateLicenseForRemix('apache-2').canonicalId).toBe('Apache-2.0');
    expect(evaluateLicenseForRemix('mpl-2').canonicalId).toBe('MPL-2.0');
  });

  it('does NOT guess an ambiguous version', () => {
    /*
     * « GPL-3.0 » nu est ambigu entre -only et -or-later : deviner l'intention
     * juridique de l'auteur est exactement ce qu'on refuse de faire.
     */
    expect(evaluateLicenseForRemix('GPL-3.0').allowed).toBe(false);
  });

  it('refuses NonCommercial variants (choix produit assumé, plateforme commerciale)', () => {
    expect(evaluateLicenseForRemix('CC-BY-NC-4.0').allowed).toBe(false);
    expect(evaluateLicenseForRemix('CC-BY-NC-SA-4.0').allowed).toBe(false);

    // …alors que la variante SANS NC est acceptée.
    expect(evaluateLicenseForRemix('CC-BY-SA-4.0').allowed).toBe(true);
  });

  it('every advertised id is itself accepted (l’allowlist ne ment pas)', () => {
    const ids = listDerivativeAllowedLicenseIds();
    expect(ids.length).toBeGreaterThan(20);

    for (const id of ids) {
      expect(evaluateLicenseForRemix(id).allowed, id).toBe(true);
    }
  });
});
