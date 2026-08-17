import { describe, expect, it } from 'vitest';

import { decideWorkspaceSlot } from './workspace-slot.js';

const MAINTENANT = Date.parse('2026-08-17T15:30:00.000Z');
const DELAI = 10 * 60_000;
const options = { now: MAINTENANT, deadlineMs: DELAI };

const ilYA = (ms: number) => new Date(MAINTENANT - ms).toISOString();

describe('decideWorkspaceSlot', () => {
  it('garde un espace de travail qui tourne, quel que soit son âge', () => {
    expect(decideWorkspaceSlot({ status: 'RUNNING', updatedAt: ilYA(48 * 3600_000) }, options)).toBe('keep');
  });

  it('libère un statut terminal', () => {
    for (const statut of ['STOPPED', 'FAILED', 'DELETED']) {
      expect(decideWorkspaceSlot({ status: statut, updatedAt: ilYA(1000) }, options)).toBe('free');
    }
  });

  it('garde un démarrage récent', () => {
    expect(decideWorkspaceSlot({ status: 'PENDING', updatedAt: ilYA(30_000) }, options)).toBe('keep');
    expect(decideWorkspaceSlot({ status: 'STARTING', updatedAt: ilYA(9 * 60_000) }, options)).toBe('keep');
  });

  it('libère un démarrage qui n’aboutit pas — le cas mesuré en réel', () => {
    /*
     * `ws-4cd306324217d298` : PENDING depuis 15:19:42, inchangé à 15:30. Sur une
     * offre gratuite (limite 1), ce créneau bloquait la création de tout autre
     * projet avec un 429 muet.
     */
    expect(decideWorkspaceSlot({ status: 'PENDING', updatedAt: '2026-08-17T15:19:42.000Z' }, options)).toBe('free');
  });

  it('garde le créneau quand le manager ne dit rien d’exploitable', () => {
    expect(decideWorkspaceSlot(undefined, options)).toBe('keep');
    expect(decideWorkspaceSlot({}, options)).toBe('keep');
    expect(decideWorkspaceSlot({ status: 'PENDING' }, options)).toBe('keep');
    expect(decideWorkspaceSlot({ status: 'PENDING', updatedAt: 'pas une date' }, options)).toBe('keep');
  });

  it('accepte la casse minuscule renvoyée par le manager', () => {
    expect(decideWorkspaceSlot({ status: 'running', updatedAt: ilYA(3600_000) }, options)).toBe('keep');
    expect(decideWorkspaceSlot({ status: 'stopped', updatedAt: ilYA(1000) }, options)).toBe('free');
  });
});
