import { describe, expect, it } from 'vitest';

import { causeDu429 } from './refus-429';

const enTetes = (valeurs: Record<string, string>) => ({
  get: (nom: string) => valeurs[nom.toLowerCase()] ?? null,
});

describe('distinguer un refus de débit d’un refus de quota', () => {
  it('reste à 0 → refus de DÉBIT : il faut attendre', () => {
    expect(causeDu429(enTetes({ 'x-ratelimit-limit': '2000', 'x-ratelimit-remaining': '0' }))).toBe('debit');
  });

  it('reste positif → refus de QUOTA : le limiteur a été franchi', () => {
    /*
     * Le cas réel du 2026-09-06 : le limiteur laisse passer (1998 requêtes
     * restantes) et c'est la facturation qui refuse ensuite.
     */
    expect(causeDu429(enTetes({ 'x-ratelimit-limit': '2000', 'x-ratelimit-remaining': '1998' }))).toBe('quota');
  });

  it('la simple PRÉSENCE des en-têtes ne suffit pas à conclure au débit', () => {
    /*
     * Mesuré : le limiteur pose ces en-têtes sur TOUTES ses réponses, 200
     * comprises. Un contrôle sur leur présence aurait classé tout 429 en débit —
     * l'erreur symétrique de celle qu'on corrige.
     */
    expect(causeDu429(enTetes({ 'x-ratelimit-limit': '2000', 'x-ratelimit-remaining': '1999' }))).not.toBe('debit');
  });

  it('sans en-tête, on retombe sur QUOTA — l’action que l’utilisateur peut mener', () => {
    expect(causeDu429(enTetes({}))).toBe('quota');
    expect(causeDu429(undefined)).toBe('quota');
  });
});
