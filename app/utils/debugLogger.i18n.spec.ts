import { describe, expect, it } from 'vitest';

import { createDebugReportContent, createDebugSummary, type DebugLogData } from './debugLogger';

const DEBUG_DATA: DebugLogData = {
  timestamp: '2026-08-05T12:34:56.000Z',
  sessionId: 'session-123',
  systemInfo: {
    platform: 'macOS',
    userAgent: 'Browser/1.0 Test/2.0',
    screenResolution: '1440x900',
    viewportSize: '1280x720',
    isMobile: false,
    timezone: 'Europe/Paris',
    language: 'en-US',
    cookiesEnabled: true,
    localStorageEnabled: true,
    sessionStorageEnabled: true,
  },
  appInfo: {
    version: '1.2.3',
    buildTime: '2026-08-05T12:00:00.000Z',
    currentModel: 'gpt-test',
    currentProvider: 'OpenAI',
    projectType: 'web',
    workbenchView: 'code',
    hasActivePreview: true,
    unsavedFiles: 1_234,
    gitInfo: {
      branch: 'feature/i18n',
      commit: '1234567890abcdef',
      isDirty: true,
    },
  },
  logs: Array.from({ length: 1_234 }, (_, index) => ({
    timestamp: '2026-08-05T12:34:56.000Z',
    level: 'info' as const,
    message: `log-${index}`,
  })),
  errors: [],
  networkRequests: [],
  performance: {
    navigationStart: 0,
    loadTime: 1_234.5,
    domContentLoaded: 987.5,
    memoryUsage: { used: 1_294_991, total: 2_000_000, limit: 4_000_000 },
    timing: {},
  },
  state: {
    currentView: 'code',
    showWorkbench: true,
    showTerminal: false,
    artifactsCount: 2,
    filesCount: 1_234,
    alerts: [],
  },
  userActions: [],
  terminalLogs: [],
};

describe('localized debug report', () => {
  it('uses the selected French locale for labels, dates, booleans, and numbers', () => {
    const report = createDebugSummary(DEBUG_DATA, 'fr');

    expect(report).toContain('=== SYNTHÈSE DU JOURNAL DE DIAGNOSTIC E-CODE ===');
    expect(report).toContain('=== INFORMATIONS SYSTÈME ===');
    expect(report).toContain('Appareil mobile : Non');
    expect(report).toContain('Fichiers non enregistrés : 1 234');
    expect(report).toContain('Répertoire de travail : Modifié');
    expect(report).toContain('Nombre total de journaux : 1 234');
    expect(report).toContain('Temps de chargement de la page : 1 234,5 ms');
    expect(report).toContain('Utilisation de la mémoire : 1,23 Mo');
    expect(report).not.toContain('Generated:');
    expect(report).not.toContain('Show Terminal:');
  });

  it('keeps the English fallback and localizes the detailed-data heading', () => {
    const report = createDebugReportContent(DEBUG_DATA, 'en');

    expect(report).toContain('=== E-CODE DEBUG LOG SUMMARY ===');
    expect(report).toContain('Generated:');
    expect(report).toContain('Unsaved files: 1,234');
    expect(report).toContain('=== DETAILED DEBUG DATA ===');
  });
});
