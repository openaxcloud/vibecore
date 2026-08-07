/** @vitest-environment jsdom */

import { describe, expect, it } from 'vitest';
import {
  formatAuthLogMessage,
  formatDatabaseLogMessage,
  formatNetworkLogMessage,
  formatPerformanceLogMessage,
} from './logs';

describe('formatPerformanceLogMessage', () => {
  it('localizes platform chrome and number formatting while preserving technical identifiers', () => {
    expect(formatPerformanceLogMessage('EventLogsTab', 'mount-duration', 1234.4, 'fr')).toBe(
      'Performances : EventLogsTab — mount-duration en 1 234 ms',
    );
    expect(formatPerformanceLogMessage('EventLogsTab', 'mount-duration', 1234.4, 'en')).toBe(
      'Performance: EventLogsTab — mount-duration took 1,234 ms',
    );
  });
});

describe('structured log messages', () => {
  it('localizes authentication action and result labels', () => {
    expect(formatAuthLogMessage('token_refresh', true, 'fr')).toBe(
      'Authentification : actualisation du jeton — Réussite',
    );
    expect(formatAuthLogMessage('key_validation', false, 'fr')).toBe(
      'Authentification : validation de la clé API — Échec',
    );
    expect(formatAuthLogMessage('login', true, 'en')).toBe('Auth login - Success');
  });

  it('localizes every network status', () => {
    expect(formatNetworkLogMessage('online', 'fr')).toBe('Réseau : en ligne');
    expect(formatNetworkLogMessage('offline', 'fr')).toBe('Réseau : hors ligne');
    expect(formatNetworkLogMessage('reconnecting', 'fr')).toBe('Réseau : reconnexion en cours');
    expect(formatNetworkLogMessage('connected', 'fr')).toBe('Réseau : connecté');
    expect(formatNetworkLogMessage('online', 'en')).toBe('Network online');
  });

  it('localizes database chrome and duration while preserving the operation identifier', () => {
    expect(formatDatabaseLogMessage('schema-sync', true, 1234.5, 'fr')).toBe(
      'Base de données : schema-sync — Réussite (1 234,5 ms)',
    );
    expect(formatDatabaseLogMessage('schema-sync', false, 12, 'en')).toBe('DB schema-sync - Failed (12ms)');
  });
});
