/** @vitest-environment jsdom */

import { readFileSync } from 'node:fs';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React, { type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const testState = vi.hoisted(() => ({
  language: 'en',
  providers: {
    OpenAI: {
      name: 'OpenAI',
      settings: { enabled: true, baseUrl: '' },
      staticModels: [],
    },
  },
  updateProviderSettings: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  logProvider: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: testState.language, resolvedLanguage: testState.language },
  }),
}));

vi.mock('framer-motion', () => {
  const motionElement = (tag: 'div' | 'span') => {
    return ({
      children,
      initial: _initial,
      animate: _animate,
      exit: _exit,
      transition: _transition,
      whileHover: _whileHover,
      whileTap: _whileTap,
      layout: _layout,
      ...props
    }: Record<string, unknown> & { children?: ReactNode }) => React.createElement(tag, props, children);
  };

  return {
    AnimatePresence: ({ children }: { children: ReactNode }) => React.createElement(React.Fragment, null, children),
    motion: { div: motionElement('div'), span: motionElement('span') },
  };
});

vi.mock('~/components/ui/Switch', () => ({
  Switch: ({
    checked,
    disabled,
    onCheckedChange,
    'aria-label': ariaLabel,
  }: {
    checked?: boolean;
    disabled?: boolean;
    onCheckedChange?: (checked: boolean) => void;
    'aria-label'?: string;
  }) => (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onCheckedChange?.(!checked)}
    />
  ),
}));

vi.mock('~/lib/hooks/useSettings', () => ({
  useSettings: () => ({
    providers: testState.providers,
    updateProviderSettings: testState.updateProviderSettings,
  }),
}));

vi.mock('~/lib/stores/settings', () => ({ URL_CONFIGURABLE_PROVIDERS: ['OpenAI'] }));
vi.mock('~/lib/stores/logs', () => ({ logStore: { logProvider: testState.logProvider } }));
vi.mock('~/utils/constants', () => ({ providerBaseUrlEnvKeys: {} }));
vi.mock('react-toastify', () => ({
  toast: { success: testState.toastSuccess, error: testState.toastError },
}));

import { GitHubProgressiveLoader } from './github/components/GitHubProgressiveLoader';
import CloudProvidersTab from './providers/cloud/CloudProvidersTab';
import ServiceStatusTab from './service-status/ServiceStatusTab';
import TaskManagerTab from './task-manager/TaskManagerTab';
import {
  formatSettingsStatusBytes,
  formatSettingsStatusEntryCount,
  getSettingsStatusSurfacesCopy,
  settingsStatusSurfacesEn,
  settingsStatusSurfacesFr,
} from '~/lib/i18n/catalogs/settings-status-surfaces';

beforeEach(() => {
  testState.language = 'en';
  testState.providers.OpenAI.settings = { enabled: true, baseUrl: '' };
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  testState.updateProviderSettings.mockReset();
  testState.toastSuccess.mockReset();
  testState.toastError.mockReset();
  testState.logProvider.mockReset();
  localStorage.clear();
});

describe('settings status catalog', () => {
  it('keeps exact EN/FR parity, English fallback, plurals, and localized byte formats', () => {
    expect(Object.keys(settingsStatusSurfacesFr).sort()).toEqual(Object.keys(settingsStatusSurfacesEn).sort());
    expect(getSettingsStatusSurfacesCopy('de-DE')['settingsStatus.cloud.title']).toBe('Cloud providers');
    expect(getSettingsStatusSurfacesCopy('fr-CA')['settingsStatus.cloud.title']).toBe('Fournisseurs cloud');
    expect(formatSettingsStatusEntryCount(1, 'fr')).toBe('1 entrée dans le stockage local');
    expect(formatSettingsStatusEntryCount(2_345, 'fr')).toMatch(/^2[\s\u202f]345 entrées/u);
    expect(formatSettingsStatusBytes(1536, 'fr')).toBe('1,5\u00a0Ko');
    expect(formatSettingsStatusBytes(1536, 'en')).toBe('1.5\u00a0KB');
  });
});

describe('CloudProvidersTab localization', () => {
  it('switches live, preserves provider identifiers, and localizes controls and feedback', async () => {
    testState.language = 'fr';

    const view = render(<CloudProvidersTab />);

    expect(await screen.findByRole('heading', { name: 'Fournisseurs cloud' })).toBeTruthy();
    expect(screen.getByText('OpenAI')).toBeTruthy();
    expect(screen.getByText('Utilisez GPT-4, GPT-3.5 et les autres modèles OpenAI.')).toBeTruthy();
    expect(screen.getByRole('switch', { name: 'Activer tous les fournisseurs cloud' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Modifier l’URL de base de OpenAI' }).className).toContain('min-h-11');

    fireEvent.click(screen.getByRole('switch', { name: 'Activer OpenAI' }));
    expect(testState.updateProviderSettings).toHaveBeenCalledWith('OpenAI', {
      enabled: false,
      baseUrl: '',
    });
    expect(testState.toastSuccess).toHaveBeenCalledWith('OpenAI est désactivé.');

    testState.language = 'en';
    view.rerender(<CloudProvidersTab />);
    expect(await screen.findByRole('heading', { name: 'Cloud providers' })).toBeTruthy();
    expect(screen.getByRole('switch', { name: 'Enable all cloud providers' })).toBeTruthy();
    expect(document.body.textContent).not.toContain('Fournisseurs cloud');
  });

  it('renders a localized empty state instead of a blank provider panel', async () => {
    const providers = testState.providers as Record<string, (typeof testState.providers)['OpenAI']>;
    const original = providers.OpenAI;
    delete providers.OpenAI;
    testState.language = 'fr';

    render(<CloudProvidersTab />);

    expect(await screen.findByRole('heading', { name: 'Aucun fournisseur cloud disponible' })).toBeTruthy();
    expect(screen.getByText(/Aucun fournisseur cloud compatible/u)).toBeTruthy();
    providers.OpenAI = original;
  });
});

describe('GitHubProgressiveLoader localization', () => {
  it('announces localized progress details and keeps caller step data intact', () => {
    testState.language = 'fr';
    render(
      <GitHubProgressiveLoader
        isLoading
        showProgress
        progressSteps={[
          { key: 'metadata', label: 'refs/heads/main', completed: true },
          { key: 'branches', label: 'API_URL', completed: false, loading: true },
        ]}
      >
        <div>child</div>
      </GitHubProgressiveLoader>,
    );

    expect(screen.getByRole('status').textContent).toContain('Chargement…');
    expect(screen.getByRole('progressbar', { name: 'Progression du chargement : 50 %' })).toBeTruthy();

    const details = screen.getByRole('button', { name: 'Afficher les détails' });
    expect(details.className).toContain('min-h-11');
    fireEvent.click(details);
    expect(screen.getByRole('list', { name: 'Étapes du chargement' })).toBeTruthy();
    expect(screen.getByText('refs/heads/main')).toBeTruthy();
    expect(screen.getByText('API_URL')).toBeTruthy();
    expect(screen.getByText('Terminée:')).toBeTruthy();
  });

  it('masks raw errors and exposes localized 44px recovery actions', () => {
    testState.language = 'fr';

    const rawError = 'Raw API failure bearer=secret';
    const onRetry = vi.fn();
    const onRefresh = vi.fn();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    render(
      <GitHubProgressiveLoader error={rawError} isLoading={false} onRetry={onRetry} onRefresh={onRefresh}>
        <div>child</div>
      </GitHubProgressiveLoader>,
    );

    expect(screen.getByRole('alert').textContent).toContain('Impossible de charger cette section GitHub');
    expect(screen.getByRole('alert').textContent).not.toContain(rawError);

    const retry = screen.getByRole('button', { name: 'Réessayer' });
    const refresh = screen.getByRole('button', { name: 'Actualiser' });
    expect(retry.className).toContain('min-h-11');
    expect(refresh.className).toContain('min-h-11');
    fireEvent.click(retry);
    fireEvent.click(refresh);
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});

describe('ServiceStatusTab localization', () => {
  it('renders localized diagnostics, preserves endpoints and switches live', async () => {
    testState.language = 'fr';
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: true, status: 200 } as Response)),
    );

    const view = render(<ServiceStatusTab />);

    expect(await screen.findByRole('list', { name: 'Diagnostics des services' })).toBeTruthy();
    expect(screen.getByText('/api/health')).toBeTruthy();
    expect(screen.getAllByText('Disponible')).toHaveLength(4);
    expect(screen.getAllByText('HTTP 200')).toHaveLength(4);
    expect(screen.getByRole('button', { name: 'Actualiser l’état des services' }).className).toContain('min-h-11');

    testState.language = 'en';
    view.rerender(<ServiceStatusTab />);
    expect(await screen.findByRole('list', { name: 'Service diagnostics' })).toBeTruthy();
    expect(screen.getAllByText('Available')).toHaveLength(4);
    expect(document.body.textContent).not.toContain('Disponible');
  });
});

describe('TaskManagerTab localization', () => {
  it('localizes plurals and sizes while preserving storage keys and clearing only volatile data', () => {
    testState.language = 'fr';
    localStorage.setItem('E_CODE_USER_KEY', 'a');
    localStorage.setItem('error_logs', 'private technical log');

    render(<TaskManagerTab />);

    expect(screen.getByRole('heading', { name: 'Stockage du navigateur' })).toBeTruthy();
    expect(screen.getByText('2 entrées dans le stockage local')).toBeTruthy();
    expect(screen.getByText('E_CODE_USER_KEY')).toBeTruthy();
    expect(screen.getByText(/^1\s?o$/u)).toBeTruthy();

    const clear = screen.getByRole('button', { name: 'Effacer les données temporaires' });
    expect(clear.className).toContain('min-h-11');
    fireEvent.click(clear);
    expect(localStorage.getItem('error_logs')).toBeNull();
    expect(localStorage.getItem('E_CODE_USER_KEY')).toBe('a');
    expect(testState.toastSuccess).toHaveBeenCalledWith('Les données temporaires ont été effacées.');
    expect(screen.getByText('1 entrée dans le stockage local')).toBeTruthy();
  });

  it('masks storage failures and provides localized recovery feedback', () => {
    testState.language = 'fr';
    localStorage.setItem('error_logs', 'raw persisted content');

    const rawError = 'Storage backend English failure';
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error(rawError);
    });

    render(<TaskManagerTab />);
    fireEvent.click(screen.getByRole('button', { name: 'Effacer les données temporaires' }));

    expect(screen.getByRole('alert').textContent).toContain('Impossible d’effacer les données temporaires');
    expect(document.body.textContent).not.toContain(rawError);
    expect(testState.toastError).toHaveBeenCalledWith(
      'Impossible d’effacer les données temporaires. Veuillez réessayer.',
    );
  });
});

describe('targeted source safeguards', () => {
  it('has zero scanner findings and explicit responsive, theme, loading, and accessibility safeguards', async () => {
    const files = [
      'app/components/@settings/tabs/providers/cloud/CloudProvidersTab.tsx',
      'app/components/@settings/tabs/github/components/GitHubProgressiveLoader.tsx',
      'app/components/@settings/tabs/service-status/ServiceStatusTab.tsx',
      'app/components/@settings/tabs/task-manager/TaskManagerTab.tsx',
    ];

    const { scanSource } = await import('../../../../scripts/i18n/source-scanner.mjs');

    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      const result = scanSource(source, file);

      expect(result.parseErrors, file).toEqual([]);
      expect(result.findings, file).toEqual([]);
      expect(source, file).toContain('min-h-11');
      expect(source, file).toContain('text-bolt-elements-textPrimary');
      expect(source, file).toContain('break-');
      expect(source, file).not.toContain('error.message');
    }
  });
});
