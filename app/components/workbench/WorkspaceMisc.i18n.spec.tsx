/** @vitest-environment jsdom */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createInstance } from 'i18next';
import type { ReactNode } from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => ({
  expoUrl: null as string | null,
  historyProps: null as null | {
    filePath: string;
    currentContent: string;
    onClose: () => void;
  },
}));

vi.mock('@nanostores/react', () => ({
  useStore: () => harness.expoUrl,
}));

vi.mock('react-qrcode-logo', () => ({
  QRCode: ({ value }: { value: string }) => <div data-testid="expo-qr-code" data-value={value} />,
}));

vi.mock('~/components/ui/Dialog', () => ({
  DialogRoot: ({ open, children }: { open: boolean; children: ReactNode }) =>
    open ? <div data-testid="dialog-root">{children}</div> : null,
  Dialog: ({ children, className }: { children: ReactNode; className?: string }) => (
    <section data-testid="dialog-content" className={className}>
      {children}
    </section>
  ),
  DialogTitle: ({ children, className }: { children: ReactNode; className?: string }) => (
    <h2 className={className}>{children}</h2>
  ),
  DialogDescription: ({ children, className }: { children: ReactNode; className?: string }) => (
    <p className={className}>{children}</p>
  ),
}));

vi.mock('./FileHistoryPanel', () => ({
  FileHistoryPanel: (props: { filePath: string; currentContent: string; onClose: () => void }) => {
    harness.historyProps = props;

    return (
      <section data-testid="file-history-panel">
        <button type="button" onClick={props.onClose}>
          Close test panel
        </button>
      </section>
    );
  },
}));

import { EditorHistoryOverlay } from './EditorHistoryOverlay';
import { ExpoQrModal } from './ExpoQrModal';
import { PortDropdown } from './PortDropdown';
import { FloatingPaneFrame } from '~/components/project-ide/FloatingPaneFrame';
import { ProjectAgentRunStatus } from '~/components/project-ide/ProjectAgentRunStatus';
import {
  formatWorkspaceMiscCopy,
  getWorkspaceMiscCopy,
  workspaceMiscEn,
  workspaceMiscFr,
} from '~/lib/i18n/catalogs/workspace-misc';

function createTestI18n(language: string) {
  const i18n = createInstance();

  void i18n.use(initReactI18next).init({
    lng: language,
    fallbackLng: 'en',
    supportedLngs: ['en', 'fr'],
    resources: {
      en: { translation: workspaceMiscEn },
      fr: { translation: workspaceMiscFr },
    },
    initImmediate: false,
    interpolation: { escapeValue: false },
  });

  return i18n;
}

function renderLocalized(children: ReactNode, language = 'fr') {
  const i18n = createTestI18n(language);
  const view = render(<I18nextProvider i18n={i18n}>{children}</I18nextProvider>);

  return { ...view, i18n };
}

afterEach(() => {
  cleanup();
  harness.expoUrl = null;
  harness.historyProps = null;
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
  vi.restoreAllMocks();
});

describe('workspace miscellaneous surfaces i18n', () => {
  it('keeps complete EN/FR catalog parity, interpolation, and English fallback', () => {
    expect(Object.keys(workspaceMiscFr).sort()).toEqual(Object.keys(workspaceMiscEn).sort());
    expect(getWorkspaceMiscCopy('fr-CA')['workspaceMisc.editorHistory.open.label']).toBe('Historique');
    expect(getWorkspaceMiscCopy('de-DE')['workspaceMisc.editorHistory.open.label']).toBe('History');
    expect(
      formatWorkspaceMiscCopy(workspaceMiscFr['workspaceMisc.floatingPane.aria'], {
        title: 'Terminal — Projet Avi',
      }),
    ).toBe('Panneau flottant : Terminal — Projet Avi');
  });

  it('localizes floating-pane and agent status controls live while preserving caller labels', async () => {
    const onDock = vi.fn();
    const onStop = vi.fn();
    const onFocus = vi.fn();
    const title = 'Terminal — Projet Avi';
    const stopLabel = 'Arrêter Claude Sonnet';

    const { i18n } = renderLocalized(
      <>
        <FloatingPaneFrame
          paneId="terminal-user-pane"
          title={title}
          bounds={{ x: 12, y: 24, width: 420, height: 300 }}
          zIndex={8}
          active
          onBoundsChange={vi.fn()}
          onDock={onDock}
          onFocus={onFocus}
        >
          <div>user-owned-pane-content</div>
        </FloatingPaneFrame>
        <ProjectAgentRunStatus stopLabel={stopLabel} onStop={onStop} />
      </>,
    );

    const floatingPane = screen.getByRole('dialog', { name: `Panneau flottant : ${title}` });
    expect(floatingPane.textContent).toContain(title);
    expect(floatingPane.textContent).toContain('user-owned-pane-content');
    expect(floatingPane.getAttribute('data-active')).toBe('true');

    const dockButton = screen.getByRole('button', { name: 'Ancrer le panneau' });
    expect(dockButton.className).toContain('min-h-11');
    fireEvent.click(dockButton);
    expect(onDock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('separator', { name: 'Redimensionner le panneau flottant' })).toBeTruthy();

    expect(screen.getByRole('status').textContent).toContain('Agent en cours d’exécution');
    expect(screen.getByRole('status').textContent).toContain('espace de travail');

    const stopButton = screen.getByRole('button', { name: stopLabel });
    expect(stopButton.getAttribute('title')).toBe(`${stopLabel} — appuyez sur Échap`);
    expect(stopButton.className).toContain('min-h-11');
    fireEvent.click(stopButton);
    expect(onStop).toHaveBeenCalledTimes(1);

    await act(async () => {
      await i18n.changeLanguage('en');
    });

    expect(screen.getByRole('dialog', { name: `Floating pane: ${title}` })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Dock pane' }).textContent).toContain('Dock');
    expect(screen.getByRole('status').textContent).toContain('Agent running');
    expect(screen.getByRole('button', { name: stopLabel }).getAttribute('title')).toBe(`${stopLabel} — press Escape`);
  });

  it('sorts ports, localizes state and copy feedback live, and preserves port URLs', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });

    const setActivePreviewIndex = vi.fn();
    const setIsDropdownOpen = vi.fn();
    const setHasSelectedPreview = vi.fn();

    const previews = [
      { port: 5173, ready: false, baseUrl: 'https://preview.example.test:5173/user-path?q=bonjour' },
      { port: 3000, ready: true, baseUrl: 'https://preview.example.test:3000/' },
    ];
    const { i18n } = renderLocalized(
      <PortDropdown
        activePreviewIndex={0}
        setActivePreviewIndex={setActivePreviewIndex}
        isDropdownOpen
        setIsDropdownOpen={setIsDropdownOpen}
        setHasSelectedPreview={setHasSelectedPreview}
        previews={previews}
      />,
    );

    const trigger = screen.getByRole('button', { name: 'Sélectionner le port d’aperçu' });
    expect(trigger.className).toContain('min-h-11');
    expect(screen.getByRole('dialog', { name: 'Ports d’aperçu' }).className).toContain('max-w-[calc(100vw-24px)]');

    const port3000 = screen.getByRole('button', { name: 'Port 3000 — Prêt' });
    const port5173 = screen.getByRole('button', { name: 'Port 5173 — Démarrage…' });
    expect(port3000.compareDocumentPosition(port5173) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(port3000);
    expect(setActivePreviewIndex).toHaveBeenCalledWith(1);
    expect(setIsDropdownOpen).toHaveBeenCalledWith(false);
    expect(setHasSelectedPreview).toHaveBeenCalledWith(true);

    fireEvent.click(screen.getByRole('button', { name: 'Copier l’URL du port 5173' }));
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(previews[0].baseUrl);
      expect(screen.getByRole('status').textContent).toBe('URL du port 5173 copiée.');
    });

    await act(async () => {
      await i18n.changeLanguage('en');
    });

    expect(screen.getByRole('button', { name: 'Select preview port' })).toBeTruthy();
    expect(screen.getByRole('dialog', { name: 'Preview ports' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Port 5173 — Starting…' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('URL for port 5173 copied.');
  });

  it('renders a localized empty port state and masks clipboard failures', async () => {
    const rawFailure = 'Raw browser clipboard permission diagnostic';
    const writeText = vi.fn().mockRejectedValue(new Error(rawFailure));
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });

    const sharedProps = {
      activePreviewIndex: 0,
      setActivePreviewIndex: vi.fn(),
      isDropdownOpen: true,
      setIsDropdownOpen: vi.fn(),
      setHasSelectedPreview: vi.fn(),
    };

    const { rerender, i18n } = renderLocalized(<PortDropdown {...sharedProps} previews={[]} />);
    expect(screen.getByRole('status').textContent).toBe('Aucun port d’aperçu n’est disponible.');

    rerender(
      <I18nextProvider i18n={i18n}>
        <PortDropdown
          {...sharedProps}
          previews={[{ port: 8080, ready: true, baseUrl: 'https://safe.example.test:8080' }]}
        />
      </I18nextProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Copier l’URL du port 8080' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('Impossible de copier l’URL du port 8080.');
    expect(document.body.textContent).not.toContain(rawFailure);
  });

  it('localizes Expo empty and QR states live without changing the Expo URL', async () => {
    harness.expoUrl = null;

    const onClose = vi.fn();
    const { i18n, rerender } = renderLocalized(<ExpoQrModal open onClose={onClose} />);

    expect(screen.getByRole('heading', { name: 'Affichez l’aperçu sur votre appareil mobile' })).toBeTruthy();
    expect(screen.getByText(/l’application Expo Go/u)).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('Aucune URL Expo n’a été détectée.');
    expect(screen.getByTestId('dialog-content').className).toContain('!max-w-md');

    await act(async () => {
      await i18n.changeLanguage('en');
    });
    expect(screen.getByRole('heading', { name: 'Preview on your mobile device' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('No Expo URL was detected.');

    const expoUrl = 'exp://192.0.2.42:8081/--/user-project?token=keep-me';
    harness.expoUrl = expoUrl;
    rerender(
      <I18nextProvider i18n={i18n}>
        <ExpoQrModal open onClose={onClose} />
      </I18nextProvider>,
    );
    expect(screen.getByRole('img', { name: 'QR code for opening the project in Expo Go' })).toBeTruthy();
    expect(screen.getByTestId('expo-qr-code').getAttribute('data-value')).toBe(expoUrl);
    expect(document.body.textContent).not.toContain(expoUrl);
  });

  it('localizes the history trigger live and passes file paths and user content through unchanged', async () => {
    const filePath = 'src/espace utilisateur/bonjour.ts';
    const content = 'const userMessage = "Keep my exact user content";';
    const { i18n } = renderLocalized(<EditorHistoryOverlay filePath={filePath} content={content} />);

    const frenchTrigger = screen.getByRole('button', { name: 'Ouvrir l’historique du fichier' });
    expect(frenchTrigger.textContent).toContain('Historique');
    expect(frenchTrigger.className).toContain('min-h-[44px]');

    await act(async () => {
      await i18n.changeLanguage('en');
    });
    expect(screen.getByRole('button', { name: 'Open file history' }).textContent).toContain('History');

    await act(async () => {
      await i18n.changeLanguage('fr');
    });
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir l’historique du fichier' }));
    expect(screen.getByTestId('file-history-panel')).toBeTruthy();
    expect(harness.historyProps?.filePath).toBe(filePath);
    expect(harness.historyProps?.currentContent).toBe(content);

    fireEvent.click(screen.getByRole('button', { name: 'Close test panel' }));
    expect(screen.getByRole('button', { name: 'Ouvrir l’historique du fichier' })).toBeTruthy();
  });

  it('passes the direct source scan with zero residual visible strings for all five components', async () => {
    const { scanSource } = await import('../../../scripts/i18n/source-scanner.mjs');

    const sourcePaths = [
      'app/components/project-ide/FloatingPaneFrame.tsx',
      'app/components/project-ide/ProjectAgentRunStatus.tsx',
      'app/components/workbench/PortDropdown.tsx',
      'app/components/workbench/ExpoQrModal.tsx',
      'app/components/workbench/EditorHistoryOverlay.tsx',
    ];

    for (const sourcePath of sourcePaths) {
      const absolutePath = resolve(process.cwd(), sourcePath);
      const result = scanSource(readFileSync(absolutePath, 'utf8'), absolutePath);

      expect(result.parseErrors, sourcePath).toEqual([]);
      expect(result.findings, sourcePath).toEqual([]);
    }
  });
});
