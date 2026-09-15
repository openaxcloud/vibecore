/*
 * BUG-DB-003 — trois mécanismes SÉPARÉS, un test chacun.
 *
 * Les tests portent sur `statutConnexion` telle que la route l'importe, et non
 * sur une copie de sa logique : c'est la leçon de #342, où trois gardes
 * exerçaient une copie et seraient restées vertes si la route avait dérivé.
 */
import { describe, expect, it } from 'vitest';

import { cleSecretPourEnvironnement, statutConnexion } from './database-connection-status.js';

describe('statut joint aux connexions de base de données', () => {
  it('1. joint le statut quand une instance gérée alimente CETTE clé', () => {
    expect(statutConnexion('DATABASE_URL', { status: 'ACTIVE', environment: 'development' })).toBe('active');
    expect(statutConnexion('PROD_DATABASE_URL', { status: 'PROVISIONING', environment: 'production' })).toBe(
      'provisioning',
    );
  });

  it('2. ne joint RIEN quand la clé ne correspond pas à cette instance', () => {
    /*
     * Une connexion saisie à la main pointe vers une base dont nous ne savons
     * rien. Répondre « connectée » serait inventer un fait — précisément le
     * travers combattu ici.
     */
    expect(statutConnexion('AUTRE_DATABASE_URL', { status: 'ACTIVE', environment: 'development' })).toBeUndefined();
    expect(statutConnexion('DATABASE_URL', { status: 'ACTIVE', environment: 'production' })).toBeUndefined();
  });

  it('3. ne joint RIEN en l’absence d’instance gérée', () => {
    expect(statutConnexion('DATABASE_URL', undefined)).toBeUndefined();
  });

  it('4. la correspondance clé↔environnement est celle qu’emploie déjà la route', () => {
    expect(cleSecretPourEnvironnement('production')).toBe('PROD_DATABASE_URL');
    expect(cleSecretPourEnvironnement('development')).toBe('DATABASE_URL');
    expect(cleSecretPourEnvironnement(undefined)).toBe('DATABASE_URL');
  });
});
