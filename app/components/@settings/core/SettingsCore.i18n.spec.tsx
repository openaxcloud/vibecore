/**
 * @vitest-environment jsdom
 */

import { readFileSync } from 'node:fs';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AvatarDropdown } from './AvatarDropdown';
import { ControlPanel } from './ControlPanel';
import { TabPanelBoundary } from './TabPanelBoundary';
import {
  formatSettingsCoreStatusMessage,
  getSettingsCoreCopy,
  getSettingsCoreTabDescription,
  getSettingsCoreTabLabel,
  settingsCoreEn,
  settingsCoreFr,
} from '~/lib/i18n/catalogs/settings-core';

const testState = vi.hoisted(() => ({
  language: 'en',
  profile: {
    username: 'Avi Example',
    bio: 'Builds API_URL integrations',
    avatar: 'data:image/png;base64,user-content',
  },
  tabConfiguration: {
    userTabs: [
      { id: 'features', visible: true, window: 'user', order: 0 },
      { id: 'notifications', visible: true, window: 'user', order: 1 },
      { id: 'mcp', visible: true, window: 'user', order: 2 },
    ],
  } as { userTabs?: Array<Record<string, unknown>> },
  downloadDebugLog: vi.fn(),
  resetTabConfiguration: vi.fn(),
  acknowledgeAllFeatures: vi.fn(),
  markAllAsRead: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: testState.language, resolvedLanguage: testState.language },
  }),
}));

vi.mock('@nanostores/react', () => ({
  useStore: (store: string) => (store === 'profile-store' ? testState.profile : testState.tabConfiguration),
}));

vi.mock('~/lib/stores/profile', () => ({ profileStore: 'profile-store' }));

vi.mock('~/lib/stores/settings', () => ({
  tabConfigurationStore: 'settings-store',
  resetTabConfiguration: testState.resetTabConfiguration,
}));

vi.mock('~/lib/hooks/useFeatures', () => ({
  useFeatures: () => ({
    hasNewFeatures: true,
    unviewedFeatures: [{ id: 'one' }, { id: 'two' }],
    acknowledgeAllFeatures: testState.acknowledgeAllFeatures,
  }),
}));

vi.mock('~/lib/hooks/useNotifications', () => ({
  useNotifications: () => ({
    hasUnreadNotifications: true,
    unreadNotifications: [{ id: 'one' }],
    markAllAsRead: testState.markAllAsRead,
  }),
}));

vi.mock('react-toastify', () => ({
  toast: { success: testState.toastSuccess, error: testState.toastError },
}));

vi.mock('~/utils/debugLogger', () => ({
  downloadDebugLog: testState.downloadDebugLog,
}));

vi.mock('framer-motion', async () => {
  const React = await import('react');

  return {
    motion: {
      button: ({ whileHover: _whileHover, whileTap: _whileTap, ...props }: Record<string, unknown>) =>
        React.createElement('button', props),
    },
  };
});

vi.mock('@radix-ui/react-dropdown-menu', async () => {
  const React = await import('react');

  return {
    Root: ({ children }: { children: ReactNode }) => React.createElement(React.Fragment, null, children),
    Trigger: ({ children }: { children: ReactNode }) => React.createElement(React.Fragment, null, children),
    Portal: ({ children }: { children: ReactNode }) => React.createElement(React.Fragment, null, children),
    Content: ({
      children,
      sideOffset: _sideOffset,
      align: _align,
      collisionPadding: _collisionPadding,
      hideWhenDetached: _hideWhenDetached,
      ...props
    }: Record<string, unknown> & { children: ReactNode }) =>
      React.createElement('div', { ...props, role: 'menu' }, children),
    Item: ({ children, ...props }: Record<string, unknown> & { children: ReactNode }) =>
      React.createElement('button', { ...props, type: 'button', role: 'menuitem' }, children),
  };
});

vi.mock('@radix-ui/react-dialog', async () => {
  const React = await import('react');

  return {
    Root: ({ children, open }: { children: ReactNode; open: boolean }) =>
      open ? React.createElement(React.Fragment, null, children) : null,
    Portal: ({ children }: { children: ReactNode }) => React.createElement(React.Fragment, null, children),
    Overlay: (props: Record<string, unknown>) => React.createElement('div', props),
    Content: ({
      children,
      onEscapeKeyDown: _onEscapeKeyDown,
      onPointerDownOutside: _onPointerDownOutside,
      ...props
    }: Record<string, unknown> & { children: ReactNode }) =>
      React.createElement('section', { ...props, role: 'dialog' }, children),
  };
});

vi.mock('~/components/ui/Dialog', async () => {
  const React = await import('react');

  return {
    DialogTitle: ({ children, ...props }: Record<string, unknown> & { children: ReactNode }) =>
      React.createElement('h1', props, children),
  };
});

vi.mock('~/components/ui/BackgroundRays', () => ({ default: () => null }));
vi.mock('~/components/ui/GlowingEffect', () => ({ GlowingEffect: () => null }));

function ThrowingPanel() {
  throw new Error('Raw upstream chunk failure with secret=abc');
}

describe('settings core catalog', () => {
  it('keeps EN/FR key parity and falls back to English', () => {
    expect(Object.keys(settingsCoreFr).sort()).toEqual(Object.keys(settingsCoreEn).sort());
    expect(getSettingsCoreCopy('de-DE')['settingsCore.panel.title']).toBe('Control panel');
    expect(getSettingsCoreCopy('fr-CA')['settingsCore.panel.title']).toBe('Panneau de configuration');
  });

  it('localizes tab labels, descriptions, brands, and plural status tooltips', () => {
    expect(getSettingsCoreTabLabel('features', 'fr')).toBe('Fonctionnalités');
    expect(getSettingsCoreTabDescription('github', 'fr')).toContain('GitHub');
    expect(getSettingsCoreTabLabel('unknown', 'fr')).toBe('Paramètres');
    expect(formatSettingsCoreStatusMessage('features', 2, 'fr')).toBe('2 nouvelles fonctionnalités à découvrir');
    expect(formatSettingsCoreStatusMessage('notifications', 1, 'fr')).toBe('1 notification non lue');
    expect(formatSettingsCoreStatusMessage('notifications', 1200, 'fr')).toContain('1 200');
  });
});

describe('AvatarDropdown localization', () => {
  beforeEach(() => {
    testState.downloadDebugLog.mockResolvedValue(undefined);
  });

  it('switches EN to FR while preserving profile content and accessible navigation', () => {
    const onSelectTab = vi.fn();
    const view = render(<AvatarDropdown onSelectTab={onSelectTab} />);

    expect(screen.getByRole('button', { name: 'Account menu for Avi Example' })).toBeTruthy();
    expect(screen.getAllByAltText('Profile picture for Avi Example')).toHaveLength(2);
    expect(screen.getByText('Builds API_URL integrations')).toBeTruthy();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit profile' }));
    expect(onSelectTab).toHaveBeenCalledWith('profile');

    testState.language = 'fr';
    view.rerender(<AvatarDropdown onSelectTab={onSelectTab} />);

    const trigger = screen.getByRole('button', { name: 'Menu du compte de Avi Example' });
    expect(trigger.getAttribute('title')).toBe('Menu du compte de Avi Example');
    expect(screen.getByRole('menuitem', { name: 'Modifier le profil' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Télécharger le journal de débogage' })).toBeTruthy();
    expect(screen.getByText('Builds API_URL integrations')).toBeTruthy();
    expect(trigger.className).toContain('h-11');
  });

  it('uses localized success/failure toasts and never renders a raw download error', async () => {
    testState.language = 'fr';

    const rawError = 'Raw backend English with bearer=secret';
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const view = render(<AvatarDropdown onSelectTab={vi.fn()} />);

    fireEvent.click(screen.getByRole('menuitem', { name: 'Télécharger le journal de débogage' }));
    await waitFor(() => expect(testState.toastSuccess).toHaveBeenCalledWith('Journal de débogage téléchargé.'));

    testState.downloadDebugLog.mockRejectedValueOnce(new Error(rawError));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Télécharger le journal de débogage' }));
    await waitFor(() =>
      expect(testState.toastError).toHaveBeenCalledWith('Impossible de télécharger le journal de débogage. Réessayez.'),
    );

    expect(document.body.textContent).not.toContain(rawError);
    expect(consoleError).toHaveBeenCalled();
    view.unmount();
  });
});

describe('ControlPanel localization and resilient states', () => {
  it('renders localized responsive tiles, aria labels, tooltips, and a live locale switch', () => {
    testState.language = 'fr';

    const view = render(<ControlPanel open onClose={vi.fn()} />);

    expect(screen.getByRole('heading', { name: 'Panneau de configuration' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Fonctionnalités' })).toBeTruthy();
    expect(screen.getByText('Découvrez les fonctionnalités nouvelles et à venir')).toBeTruthy();
    expect(screen.getByText('BÊTA')).toBeTruthy();

    const close = screen.getByRole('button', { name: 'Fermer les paramètres' });
    expect(close.getAttribute('title')).toBe('Fermer les paramètres');
    expect(close.className).toContain('h-11');
    expect(close.className).toContain('vc-focus-ring');

    testState.language = 'en';
    view.rerender(<ControlPanel open onClose={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Control panel' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Features' })).toBeTruthy();
  });

  it('explains an empty configuration and restores the default tabs', () => {
    testState.language = 'fr';
    testState.tabConfiguration = { userTabs: [] };
    render(<ControlPanel open onClose={vi.fn()} />);

    expect(screen.getByRole('heading', { name: 'Aucun onglet de paramètres visible' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Restaurer les onglets par défaut' }));
    expect(testState.resetTabConfiguration).toHaveBeenCalledTimes(1);
  });

  it('announces the localized repair loading state for corrupt persisted settings', async () => {
    testState.language = 'fr';
    testState.tabConfiguration = {};
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    render(<ControlPanel open onClose={vi.fn()} />);

    expect(screen.getByRole('status').textContent).toContain('Restauration des onglets de paramètres…');
    await waitFor(() => expect(testState.resetTabConfiguration).toHaveBeenCalledTimes(1));
  });
});

describe('TabPanelBoundary localization and safety', () => {
  it('contains raw failures, announces safe French copy, and offers a 44px retry', () => {
    testState.language = 'fr';

    const onRetry = vi.fn();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    render(
      <TabPanelBoundary language="fr" onRetry={onRetry}>
        <ThrowingPanel />
      </TabPanelBoundary>,
    );

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('Impossible de charger cette section');
    expect(alert.textContent).not.toContain('Raw upstream chunk failure');

    const retry = screen.getByRole('button', { name: 'Réessayer' });
    expect(retry.className).toContain('min-h-11');
    expect(retry.className).toContain('vc-focus-ring');
    fireEvent.click(retry);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe('settings core source guards', () => {
  it('has zero targeted hardcoded-copy findings and keeps responsive, focus, loading, and safe-error primitives', async () => {
    const files = [
      'app/components/@settings/core/AvatarDropdown.tsx',
      'app/components/@settings/core/ControlPanel.tsx',
      'app/components/@settings/core/TabPanelBoundary.tsx',
      'app/components/@settings/shared/components/TabTile.tsx',
    ];

    const { scanSource } = await import('../../../../scripts/i18n/source-scanner.mjs');

    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      const result = scanSource(source, file);

      expect(result.parseErrors, file).toEqual([]);
      expect(result.findings, file).toEqual([]);
    }

    const avatarSource = readFileSync(files[0], 'utf8');
    const controlPanelSource = readFileSync(files[1], 'utf8');
    const boundarySource = readFileSync(files[2], 'utf8');
    const tileSource = readFileSync(files[3], 'utf8');

    expect(avatarSource).toContain('min-h-11');
    expect(avatarSource).toContain('toast.error(copy');
    expect(controlPanelSource).toContain('SettingsTabLoading');
    expect(controlPanelSource).toContain('getSettingsCoreTabLabel');
    expect(controlPanelSource).toContain('sm:grid-cols-2');
    expect(boundarySource).toContain('role="alert"');
    expect(boundarySource).not.toContain('this.state.error');
    expect(tileSource).toContain('const resolvedLabel = label ?? TAB_LABELS[tab.id]');
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  testState.language = 'en';
  testState.tabConfiguration = {
    userTabs: [
      { id: 'features', visible: true, window: 'user', order: 0 },
      { id: 'notifications', visible: true, window: 'user', order: 1 },
      { id: 'mcp', visible: true, window: 'user', order: 2 },
    ],
  };
});
