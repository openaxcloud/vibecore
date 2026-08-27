/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { HTMLAttributes, ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const toastMocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
const fetchMock = vi.hoisted(() => vi.fn());

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) => {
      const {
        initial: _initial,
        animate: _animate,
        transition: _transition,
        ...dom
      } = props as HTMLAttributes<HTMLDivElement> & Record<string, unknown>;

      return <div {...dom}>{children}</div>;
    },
  },
}));
vi.mock('react-toastify', () => ({ toast: toastMocks }));
vi.mock('~/components/ui/Switch', () => ({
  Switch: ({
    checked,
    onCheckedChange,
    'aria-label': ariaLabel,
  }: {
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
    'aria-label'?: string;
  }) => (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={() => onCheckedChange(!checked)}
    />
  ),
}));
vi.mock('~/components/ui/ThemeSwitch', () => ({
  ThemeSwitch: ({ title }: { title?: string }) => <button type="button" aria-label={title} />,
}));

import SettingsTab from './SettingsTab';
import { createI18nInstance } from '~/lib/i18n/runtime';

function renderSettings(language: 'en' | 'fr') {
  return render(
    <I18nextProvider i18n={createI18nInstance(language)}>
      <SettingsTab />
    </I18nextProvider>,
  );
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  localStorage.clear();
  fetchMock.mockImplementation(async (_input: RequestInfo | URL, init?: RequestInit) => ({
    ok: init?.method === 'PATCH',
    json: async () => ({}),
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
  toastMocks.success.mockReset();
  toastMocks.error.mockReset();
});

describe('SettingsTab i18n', () => {
  it('renders all preference controls in French', () => {
    renderSettings('fr');

    expect(screen.getByText('Préférences')).toBeTruthy();
    expect(screen.getByText('Langue')).toBeTruthy();
    expect(screen.getByRole('group', { name: "Choisir la langue d'affichage" })).toBeTruthy();
    expect(screen.getByText('Les notifications sont activées')).toBeTruthy();
    expect(screen.getByRole('switch', { name: 'Activer les notifications' })).toBeTruthy();
    expect(screen.getByText('Paramètres horaires')).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Fuseau horaire' })).toBeTruthy();
    expect(screen.getByText('Raccourcis clavier')).toBeTruthy();
    expect(screen.getByText('Changer de thème')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Basculer entre les thèmes clair et sombre' })).toBeTruthy();
    expect(screen.queryByText('Preferences')).toBeNull();
    expect(screen.queryByText('Toggle theme')).toBeNull();
  });

  it('localizes persistence feedback after a notification change', async () => {
    renderSettings('fr');

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/user/preferences', expect.any(Object)));
    fireEvent.click(screen.getByRole('switch', { name: 'Activer les notifications' }));

    expect(await screen.findByText('Les notifications sont désactivées')).toBeTruthy();
    await waitFor(() => expect(toastMocks.success).toHaveBeenCalledWith('Paramètres mis à jour'));
  });

  it('keeps the complete English catalog available', () => {
    renderSettings('en');

    expect(screen.getByText('Preferences')).toBeTruthy();
    expect(screen.getByText('Language')).toBeTruthy();
    expect(screen.getByText('Notifications are enabled')).toBeTruthy();
    expect(screen.getByText('Time settings')).toBeTruthy();
    expect(screen.getByText('Keyboard shortcuts')).toBeTruthy();
    expect(screen.getByText('Toggle theme')).toBeTruthy();
  });
});
