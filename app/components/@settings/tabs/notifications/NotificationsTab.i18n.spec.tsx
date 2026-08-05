/**
 * @vitest-environment jsdom
 */

import { readFileSync } from 'node:fs';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { HTMLAttributes, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import NotificationsTab from './NotificationsTab';
import {
  formatNotificationsTabNumber,
  formatNotificationsTabPlural,
  formatNotificationsTabRelativeTime,
  getNotificationsTabCategoryLabel,
  getNotificationsTabCopy,
  getNotificationsTabSafeMessage,
  interpolateNotificationsTabCopy,
  notificationsTabEn,
  notificationsTabFr,
} from '~/lib/i18n/catalogs/notifications-tab';
import type { LogEntry } from '~/lib/stores/logs';

const mocks = vi.hoisted(() => ({
  clearLogs: vi.fn(),
  logInfo: vi.fn(),
  logPerformanceMetric: vi.fn(),
}));

let language = 'en';
let logsState: Record<string, LogEntry> = {};

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ i18n: { language, resolvedLanguage: language } }),
}));

vi.mock('@nanostores/react', () => ({
  useStore: () => logsState,
}));

vi.mock('~/lib/stores/logs', () => ({
  logStore: {
    logs: {},
    clearLogs: mocks.clearLogs,
    logInfo: mocks.logInfo,
    logPerformanceMetric: mocks.logPerformanceMetric,
  },
}));

vi.mock('framer-motion', () => ({
  motion: {
    div: ({
      children,
      initial: _initial,
      animate: _animate,
      ...props
    }: HTMLAttributes<HTMLDivElement> & {
      children?: ReactNode;
      initial?: unknown;
      animate?: unknown;
    }) => <div {...props}>{children}</div>,
  },
}));

function createLog(overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    id: 'notification-1',
    timestamp: new Date(Date.now() - 60_000).toISOString(),
    level: 'info',
    message: 'User-provided notification content',
    category: 'system',
    ...overrides,
  };
}

function interpolationTokens(value: string): string[] {
  return [...value.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/gu)].map((match) => match[1]).sort();
}

describe('NotificationsTab i18n surface', () => {
  beforeEach(() => {
    language = 'en';
    logsState = {};
    mocks.clearLogs.mockReset();
    mocks.logInfo.mockReset();
    mocks.logPerformanceMetric.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('keeps flat EN/FR parity, interpolation parity and English fallback', () => {
    expect(Object.keys(notificationsTabFr)).toEqual(Object.keys(notificationsTabEn));

    for (const key of Object.keys(notificationsTabEn) as (keyof typeof notificationsTabEn)[]) {
      expect(notificationsTabEn[key].trim().length, key).toBeGreaterThan(0);
      expect(notificationsTabFr[key].trim().length, key).toBeGreaterThan(0);
      expect(interpolationTokens(notificationsTabFr[key]), key).toEqual(interpolationTokens(notificationsTabEn[key]));

      if (key !== 'notificationsTab.category.api') {
        expect(notificationsTabFr[key], key).not.toBe(notificationsTabEn[key]);
      }
    }

    expect(getNotificationsTabCopy('de-DE')['notificationsTab.filter.all']).toBe('All Notifications');
    expect(
      interpolateNotificationsTabCopy(notificationsTabFr['notificationsTab.filter.aria'], {
        filter: 'Mises à jour',
      }),
    ).toBe('Filtrer les notifications. Filtre actuel : Mises à jour');
  });

  it('formats French numbers, plurals and relative dates safely', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-05T12:00:00.000Z'));

    expect(formatNotificationsTabNumber(12_345, 'fr')).toMatch(/^12[\s\u202f]345$/u);
    expect(
      formatNotificationsTabPlural('fr', 1, {
        one: notificationsTabFr['notificationsTab.action.clearAria.one'],
        other: notificationsTabFr['notificationsTab.action.clearAria.other'],
      }),
    ).toBe('Effacer 1 notification');
    expect(
      formatNotificationsTabPlural('fr', 1_200, {
        one: notificationsTabFr['notificationsTab.action.clearAria.one'],
        other: notificationsTabFr['notificationsTab.action.clearAria.other'],
      }),
    ).toMatch(/^Effacer 1[\s\u202f]200 notifications$/u);
    expect(formatNotificationsTabRelativeTime('2026-08-05T11:00:00.000Z', 'fr')).toContain('il y a');
    expect(formatNotificationsTabRelativeTime('not-a-date', 'fr')).toBe('Date inconnue');
  });

  it('translates known categories, preserves unknown identifiers and masks raw technical errors', () => {
    expect(getNotificationsTabCategoryLabel('database', 'fr')).toBe('Base de données');
    expect(getNotificationsTabCategoryLabel('CustomProviderV2', 'fr')).toBe('CustomProviderV2');
    expect(
      getNotificationsTabSafeMessage(
        { level: 'error', category: 'api', message: 'HTTP 500 secret=private-token' },
        'fr',
      ),
    ).toBe('Une erreur technique est survenue. Vérifiez l’action concernée, puis réessayez.');
    expect(
      getNotificationsTabSafeMessage({ level: 'info', category: 'system', message: 'Dynamic user notification' }, 'fr'),
    ).toBe('Dynamic user notification');
  });

  it('renders the French all-notifications empty state and disables the clear action', () => {
    language = 'fr';

    render(<NotificationsTab />);

    expect(screen.getByRole('button', { name: /Filtrer les notifications/u }).textContent).toContain(
      'Toutes les notifications',
    );
    expect(screen.getByText('Aucune notification')).toBeTruthy();
    expect(screen.getByText('Vous êtes à jour.')).toBeTruthy();
    expect(screen.queryByText('No Notifications')).toBeNull();

    const clearButton = screen.getByRole('button', { name: 'Effacer 0 notification' });
    expect(clearButton.hasAttribute('disabled')).toBe(true);
    expect(clearButton.textContent).toContain('Tout effacer');
  });

  it('filters notifications and localizes the filtered empty state', () => {
    language = 'fr';

    const log = createLog({ message: 'Contenu dynamique', level: 'info', category: 'system' });
    logsState = { [log.id]: log };

    render(<NotificationsTab />);
    fireEvent.keyDown(screen.getByRole('button', { name: /Filtrer les notifications/u }), {
      key: 'ArrowDown',
    });
    fireEvent.click(screen.getByRole('menuitem', { name: 'Erreurs' }));

    expect(screen.getByText('Aucune notification correspondante')).toBeTruthy();
    expect(screen.getByText('Choisissez un autre filtre pour afficher d’autres notifications.')).toBeTruthy();
    expect(mocks.logInfo).toHaveBeenCalledWith(
      'Filtre de notifications modifié',
      expect.objectContaining({ previousFilter: 'all', newFilter: 'error' }),
    );
  });

  it('localizes update chrome while preserving versions, branches, URLs and supplied content', () => {
    language = 'fr';

    const update = createLog({
      message: 'E-Code 4.2 release',
      category: 'update',
      details: {
        type: 'update',
        message: 'Release notes supplied by the provider',
        currentVersion: '4.1.9',
        latestVersion: '4.2.0',
        branch: 'feature/i18n-notifications',
        updateUrl: 'https://example.test/releases/4.2.0',
      },
    });
    logsState = { [update.id]: update };

    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    render(<NotificationsTab />);

    expect(screen.getByText('E-Code 4.2 release')).toBeTruthy();
    expect(screen.getByText('Release notes supplied by the provider')).toBeTruthy();
    expect(screen.getByText(/Version actuelle\s*:\s*4\.1\.9/u)).toBeTruthy();
    expect(screen.getByText(/Dernière version\s*:\s*4\.2\.0/u)).toBeTruthy();
    expect(screen.getByText(/Branche\s*:\s*feature\/i18n-notifications/u)).toBeTruthy();
    expect(screen.getByText(/Catégorie\s*:\s*Mise à jour/u)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Voir les modifications' }));
    expect(openSpy).toHaveBeenCalledWith('https://example.test/releases/4.2.0', '_blank', 'noopener,noreferrer');
  });

  it('never renders raw error messages, detail payloads or error subcategories', () => {
    language = 'fr';

    const error = createLog({
      level: 'error',
      category: 'api',
      message: 'HTTP 500 upstream English error secret=top-secret',
      subCategory: 'private-stack-frame',
      details: {
        message: 'Database password=do-not-render',
      },
    });
    logsState = { [error.id]: error };

    render(<NotificationsTab />);

    expect(
      screen.getByText('Une erreur technique est survenue. Vérifiez l’action concernée, puis réessayez.'),
    ).toBeTruthy();
    expect(document.body.textContent).not.toContain('secret=top-secret');
    expect(document.body.textContent).not.toContain('password=do-not-render');
    expect(document.body.textContent).not.toContain('private-stack-frame');
    expect(screen.getByText(/Catégorie\s*:\s*API/u)).toBeTruthy();
  });

  it('preserves non-error dynamic messages and subcategory identifiers', () => {
    language = 'fr';

    const info = createLog({
      message: 'Build #A-204 completed for user workspace',
      category: 'provider',
      subCategory: 'CustomProviderV2',
      details: { message: 'Artifact ecode-prod-204' },
    });
    logsState = { [info.id]: info };

    render(<NotificationsTab />);

    expect(screen.getByText('Build #A-204 completed for user workspace')).toBeTruthy();
    expect(screen.getByText('Artifact ecode-prod-204')).toBeTruthy();
    expect(screen.getByText(/Catégorie\s*:\s*Fournisseur > CustomProviderV2/u)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Effacer 1 notification' }));
    expect(mocks.clearLogs).toHaveBeenCalledOnce();
    expect(mocks.logInfo).toHaveBeenCalledWith(
      'Notifications effacées',
      expect.objectContaining({ message: 'Notifications effacées', clearedCount: 1 }),
    );
  });

  it('has zero scanner findings and explicit responsive, theme and error-safety safeguards', async () => {
    const sourcePath = 'app/components/@settings/tabs/notifications/NotificationsTab.tsx';
    const source = readFileSync(sourcePath, 'utf8');
    const { scanSource } = await import('../../../../../scripts/i18n/source-scanner.mjs');
    const result = scanSource(source, sourcePath);

    expect(result.parseErrors).toEqual([]);
    expect(result.findings).toEqual([]);
    expect(source).toContain('sm:flex-row');
    expect(source).toContain('sm:p-8');
    expect(source).toContain('min-h-11');
    expect(source).toContain('whitespace-normal');
    expect(source).toContain('break-words');
    expect(source).toContain('text-bolt-elements-icon-error');
    expect(source).not.toMatch(/color:\s*['"]#[0-9a-f]{3,8}/iu);
    expect(source).not.toContain('formatDistanceToNow(new Date(log.timestamp)');
    expect(source).not.toContain('{log.message}');
    expect(source).toContain('!isTechnicalError && log.details');
    expect(source).toContain("window.open(updateUrl, '_blank', 'noopener,noreferrer')");
  });
});
