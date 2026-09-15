/*
 * BUG-ADMIN-002 — le panneau « Fournisseurs d'IA » annonçait « aucune clé »
 * pour les 30 fournisseurs, y compris les quatre qui font tourner la
 * plateforme, parce que sa source ne regardait QUE la colonne en base.
 *
 * Mesuré en production le 2026-09-01 : 0 ligne sur 30 porte `apiKeyEnc` — les
 * clés vivent dans le Secret Kubernetes et arrivent par variable
 * d'environnement. Un panneau qui affiche « aucune clé » pousse un opérateur à
 * en RECOPIER une déjà en place : c'est le geste qu'on veut rendre inutile.
 *
 * Un test par mécanisme :
 *   1. la dérivation tient compte de l'environnement, pas seulement de la base ;
 *   2. la base l'emporte sur l'environnement, comme à l'exécution ;
 *   3. la valeur de la clé n'est JAMAIS rendue ;
 *   4. les trois surfaces partagent la MÊME dérivation (site d'appel).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resolveProviderKeyPresence } from './provider-key-presence.js';

const CLE = 'ANTHROPIC_API_KEY';

describe('présence d’une clé de fournisseur — une seule dérivation', () => {
  let original: string | undefined;

  beforeEach(() => {
    original = process.env[CLE];
  });

  afterEach(() => {
    if (original === undefined) {
      delete process.env[CLE];
    } else {
      process.env[CLE] = original;
    }
  });

  it('1. une clé venue de l’ENVIRONNEMENT compte, même sans ligne en base', () => {
    process.env[CLE] = 'sk-ant-valeur-de-test';

    const r = resolveProviderKeyPresence('Anthropic', null);

    /*
     * C'est LE défaut : avant, `keyConfigured` valait false ici, et le panneau
     * affichait « aucune clé » pour un fournisseur parfaitement opérationnel.
     */
    expect(r.keyConfigured).toBe(true);
    expect(r.hasEnvKey).toBe(true);
    expect(r.hasDbKey).toBe(false);
    expect(r.source).toBe('env');
  });

  it('1 bis. sans clé nulle part, le fournisseur est bien signalé non configuré', () => {
    delete process.env[CLE];

    const r = resolveProviderKeyPresence('Anthropic', null);

    expect(r.keyConfigured).toBe(false);
    expect(r.source).toBe('none');
  });

  it('2. la base l’emporte sur l’environnement, comme à l’exécution', () => {
    process.env[CLE] = 'sk-ant-valeur-de-test';

    const r = resolveProviderKeyPresence('Anthropic', 'chiffre-en-base');

    expect(r.source).toBe('db');
    expect(r.hasDbKey).toBe(true);
    expect(r.hasEnvKey).toBe(true);
  });

  it('3. ne rend JAMAIS la valeur de la clé, ni celle d’env ni celle de base', () => {
    process.env[CLE] = 'sk-ant-SECRET-NE-DOIT-PAS-SORTIR';

    const r = resolveProviderKeyPresence('Anthropic', 'CHIFFRE-NE-DOIT-PAS-SORTIR');
    const rendu = JSON.stringify(r);

    expect(rendu).not.toContain('SECRET-NE-DOIT-PAS-SORTIR');
    expect(rendu).not.toContain('CHIFFRE-NE-DOIT-PAS-SORTIR');

    // Seul le NOM de la variable est exposé — utile, non secret.
    expect(r.envVar).toBe(CLE);
  });

  it('4. les trois surfaces utilisent cette dérivation (site d’appel)', () => {
    const source = readFileSync(join(__dirname, 'app.ts'), 'utf8');

    /*
     * Commentaires retirés : une garde qui matche un commentaire ne garde rien.
     * Vérifié par contre-épreuve sur une autre garde du même jour.
     */
    const sansCommentaires = source
      .split('\n')
      .filter((ligne) => !/^\s*(\/\/|\*|\/\*)/.test(ligne))
      .join('\n');

    // 1 définition + 3 sites d'appel au minimum (fallback-order en fait deux).
    const appels = sansCommentaires.match(/resolveProviderKeyPresence\(/g) ?? [];
    expect(appels.length).toBeGreaterThanOrEqual(4);

    // Et surtout : plus aucun calcul « base seule » à côté.
    expect(sansCommentaires).not.toContain('keyConfigured: Boolean(byName.get(name)?.apiKeyEnc)');
  });
});
