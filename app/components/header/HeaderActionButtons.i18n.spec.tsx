/** @vitest-environment jsdom */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createInstance } from 'i18next';
import type { ReactNode } from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => ({
  previews: [{ id: 'preview-1' }],
  downloadDebugLog: vi.fn<() => Promise<void>>(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  hydrateConnectors: vi.fn(),
}));

vi.mock('@nanostores/react', () => ({
  useStore: () => harness.previews,
}));

vi.mock('~/lib/stores/workbench', () => ({
  workbenchStore: { previews: 'previews-store' },
}));

vi.mock('~/lib/hooks/useHydrateConnectors', () => ({
  useHydrateConnectors: () => harness.hydrateConnectors(),
}));

vi.mock('~/components/deploy/DeployButton', () => ({
  DeployButton: () => <button type="button">Deploy</button>,
}));

vi.mock('~/components/ui/Dropdown', () => ({
  Dropdown: ({ trigger, children }: { trigger: ReactNode; children: ReactNode }) => (
    <div>
      {trigger}
      <div role="menu">{children}</div>
    </div>
  ),
  DropdownItem: ({
    children,
    onSelect,
    className,
  }: {
    children: ReactNode;
    onSelect?: () => void;
    className?: string;
  }) => (
    <button type="button" role="menuitem" className={className} onClick={onSelect}>
      {children}
    </button>
  ),
}));

vi.mock('react-toastify', () => ({
  toast: {
    success: (...args: unknown[]) => harness.toastSuccess(...args),
    error: (...args: unknown[]) => harness.toastError(...args),
  },
}));

vi.mock('~/utils/debugLogger', () => ({
  downloadDebugLog: () => harness.downloadDebugLog(),
}));

import { HeaderActionButtons } from './HeaderActionButtons.client';
import {
  getHeaderActionButtonsCopy,
  headerActionButtonsEn,
  headerActionButtonsFr,
} from '~/lib/i18n/catalogs/header-action-buttons';

function createTestI18n(language: string) {
  const i18n = createInstance();

  void i18n.use(initReactI18next).init({
    lng: language,
    fallbackLng: 'en',
    supportedLngs: ['en', 'fr'],
    resources: {
      en: { translation: headerActionButtonsEn },
      fr: { translation: headerActionButtonsFr },
    },
    initImmediate: false,
  });

  return i18n;
}

function renderHeaderActions(language = 'fr') {
  const i18n = createTestI18n(language);

  render(
    <I18nextProvider i18n={i18n}>
      <HeaderActionButtons chatStarted />
    </I18nextProvider>,
  );

  return i18n;
}

beforeEach(() => {
  harness.previews = [{ id: 'preview-1' }];
  harness.downloadDebugLog.mockReset().mockResolvedValue(undefined);
  harness.toastSuccess.mockReset();
  harness.toastError.mockReset();
  harness.hydrateConnectors.mockReset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('<HeaderActionButtons /> i18n', () => {
  it('keeps complete EN/FR catalog parity and falls back to English', () => {
    expect(Object.keys(headerActionButtonsFr).sort()).toEqual(Object.keys(headerActionButtonsEn).sort());
    expect(getHeaderActionButtonsCopy('fr')['headerActionButtons.help.label']).toBe('Aide');
    expect(getHeaderActionButtonsCopy('es')['headerActionButtons.help.label']).toBe('Help');
  });

  it('localizes the accessible help menu, keeps the first-party URL, and switches live', async () => {
    const openWindow = vi.spyOn(window, 'open').mockReturnValue(null);
    const i18n = renderHeaderActions();
    const helpButton = screen.getByRole('button', { name: 'Aide et outils de débogage' });
    const reportBug = screen.getByRole('menuitem', { name: 'Signaler un bug' });
    const downloadLog = screen.getByRole('menuitem', { name: 'Télécharger le journal de débogage' });

    expect(helpButton.getAttribute('title')).toBe('Aide et outils de débogage');
    expect(helpButton.className).toContain('min-h-11');
    expect(helpButton.className).toContain('min-w-11');
    expect(helpButton.closest('div')?.parentElement?.className).toContain('flex-wrap');
    expect(reportBug.className).toContain('min-h-11');
    expect(downloadLog.className).toContain('min-h-11');

    fireEvent.click(reportBug);
    expect(openWindow).toHaveBeenCalledWith(
      new URL('/contact', window.location.origin).toString(),
      '_blank',
      'noopener,noreferrer',
    );

    await act(async () => {
      await i18n.changeLanguage('en');
    });

    expect(screen.getByRole('button', { name: 'Help and debug tools' }).getAttribute('title')).toBe(
      'Help and debug tools',
    );
    expect(screen.getByRole('menuitem', { name: 'Report a bug' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Download debug log' })).toBeTruthy();
  });

  it('shows a live localized loading label and reports completion in the current language', async () => {
    let finishDownload: (() => void) | undefined;
    harness.downloadDebugLog.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishDownload = resolve;
        }),
    );

    const i18n = renderHeaderActions();

    fireEvent.click(screen.getByRole('menuitem', { name: 'Télécharger le journal de débogage' }));
    expect(await screen.findByRole('menuitem', { name: 'Téléchargement du journal de débogage…' })).toBeTruthy();

    await act(async () => {
      await i18n.changeLanguage('en');
    });
    expect(screen.getByRole('menuitem', { name: 'Downloading debug log…' })).toBeTruthy();

    await act(async () => {
      finishDownload?.();
    });

    await waitFor(() => {
      expect(harness.toastSuccess).toHaveBeenCalledWith('Debug log downloaded.');
    });
    expect(screen.getByRole('menuitem', { name: 'Download debug log' })).toBeTruthy();
  });

  it('keeps a rejected technical error out of the UI and displays safe French copy', async () => {
    const rawError = 'Raw upstream English stack trace';
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    harness.downloadDebugLog.mockRejectedValue(new Error(rawError));

    renderHeaderActions();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Télécharger le journal de débogage' }));

    await waitFor(() => {
      expect(harness.toastError).toHaveBeenCalledWith('Impossible de télécharger le journal de débogage. Réessayez.');
    });

    expect(document.body.textContent).not.toContain(rawError);
    expect(consoleError).toHaveBeenCalled();
  });

  it('passes the direct source scan with zero residual visible strings', async () => {
    const sourcePath = resolve(process.cwd(), 'app/components/header/HeaderActionButtons.client.tsx');
    const source = readFileSync(sourcePath, 'utf8');
    const { scanSource } = await import('../../../scripts/i18n/source-scanner.mjs');
    const result = scanSource(source, sourcePath);

    expect(result.parseErrors).toEqual([]);
    expect(result.findings).toEqual([]);
  });
});
