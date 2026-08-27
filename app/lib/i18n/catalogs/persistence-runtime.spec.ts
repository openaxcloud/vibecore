import { describe, expect, it } from 'vitest';

import {
  formatDuplicatedDiscussionTitle,
  formatForkedDiscussionTitle,
  formatPersistenceRuntimeCopy,
  persistenceRuntimeEn,
  persistenceRuntimeFr,
} from './persistence-runtime';

describe('persistence runtime copy', () => {
  it('keeps English and French catalogs in exact parity', () => {
    expect(Object.keys(persistenceRuntimeFr).sort()).toEqual(Object.keys(persistenceRuntimeEn).sort());
  });

  it('formats generated discussion titles in the active language', () => {
    expect(formatForkedDiscussionTitle('Release plan', 'en')).toBe('Release plan (fork)');
    expect(formatForkedDiscussionTitle('Plan de livraison', 'fr')).toBe('Plan de livraison (branche)');
    expect(formatForkedDiscussionTitle(undefined, 'fr')).toBe('Discussion dérivée');
    expect(formatDuplicatedDiscussionTitle(undefined, 'fr')).toBe('Discussion (copie)');
  });

  it('formats actionable French persistence failures without exposing raw keys', () => {
    expect(formatPersistenceRuntimeCopy(persistenceRuntimeFr['persistence.ide.saveFailed'], { status: '412' })).toBe(
      'Impossible d’enregistrer l’état de l’IDE du projet (HTTP 412).',
    );
    expect(persistenceRuntimeFr['persistence.error.databaseNotInitialized']).not.toContain('persistence.');
  });
});
