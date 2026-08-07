/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { createInstance } from 'i18next';
import React, { type ReactNode } from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  toastError: vi.fn(),
}));

vi.mock('react-toastify', () => ({
  toast: {
    error: (...args: unknown[]) => mocks.toastError(...args),
  },
}));

vi.mock('remix-utils/client-only', () => ({
  ClientOnly: ({ children }: { children: () => ReactNode }) => <>{children()}</>,
}));

vi.mock('./AgentPowerControls', () => ({ AgentPowerControls: () => null }));
vi.mock('./APIKeyManager', () => ({ APIKeyManager: () => null }));
vi.mock('./ChatBoxModeDropdown', () => ({ ChatBoxModeDropdown: () => null }));
vi.mock('./ComposerMentionsOverlay', () => ({ ComposerMentionsOverlay: () => null }));
vi.mock('./ComposerSlashOverlay', () => ({ ComposerSlashOverlay: () => null }));
vi.mock('./FilePreview', () => ({ default: () => null }));
vi.mock('./MCPTools', () => ({
  McpTools: ({ triggerLabel }: { triggerLabel: string }) => <button type="button">{triggerLabel}</button>,
}));
vi.mock('./ScreenshotStateManager', () => ({ ScreenshotStateManager: () => null }));
vi.mock('./SendButton.client', () => ({ SendButton: () => null }));
vi.mock('./SpeechRecognition', () => ({
  SpeechRecognitionButton: ({ triggerLabel }: { triggerLabel?: string }) =>
    triggerLabel ? <button type="button">{triggerLabel}</button> : null,
}));
vi.mock('./SupabaseConnection', () => ({ SupabaseConnection: () => null }));
vi.mock('./WebSearch.client', () => ({
  WebSearch: ({ triggerLabel }: { triggerLabel: string }) => <button type="button">{triggerLabel}</button>,
}));
vi.mock('~/components/ui/ColorSchemeDialog', () => ({ ColorSchemeDialog: () => null }));
vi.mock('~/components/workbench/ExpoQrModal', () => ({ ExpoQrModal: () => null }));
vi.mock('~/lib/stores/settings', () => ({ LOCAL_PROVIDERS: [] }));

import { ChatBox } from './ChatBox';
import {
  chatBoxEn,
  chatBoxFr,
  formatChatBoxAttachmentSummary,
  getChatBoxCopy,
  getChatBoxDroppedImageError,
} from '~/lib/i18n/catalogs/chat-box';

type ChatBoxProps = React.ComponentProps<typeof ChatBox>;

const baseProps: ChatBoxProps = {
  isModelSettingsCollapsed: false,
  setIsModelSettingsCollapsed: vi.fn(),
  provider: { name: 'OpenAI' },
  providerList: [{ name: 'OpenAI' }],
  modelList: [],
  apiKeys: {},
  isModelLoading: undefined,
  onApiKeysChange: vi.fn(),
  uploadedFiles: [],
  imageDataList: [],
  textareaRef: React.createRef<HTMLTextAreaElement>(),
  input: '',
  handlePaste: vi.fn(),
  TEXTAREA_MIN_HEIGHT: 44,
  TEXTAREA_MAX_HEIGHT: 220,
  isStreaming: false,
  handleSendMessage: vi.fn(),
  isListening: false,
  startListening: vi.fn(),
  stopListening: vi.fn(),
  chatStarted: true,
  qrModalOpen: false,
  setQrModalOpen: vi.fn(),
  handleFileUpload: vi.fn(),
  setUploadedFiles: vi.fn(),
  setImageDataList: vi.fn(),
  handleInputChange: vi.fn(),
  handleStop: vi.fn(),
  enhancingPrompt: false,
  enhancePrompt: vi.fn(),
  chatMode: 'build',
  setChatMode: vi.fn(),
  projectIdeMode: false,
};

function renderWithLanguage(language: 'en' | 'fr' | 'es', overrides: Partial<ChatBoxProps> = {}) {
  const i18n = createInstance();

  void i18n.use(initReactI18next).init({
    lng: language,
    fallbackLng: 'en',
    supportedLngs: ['en', 'fr', 'es'],
    resources: { en: { translation: {} }, fr: { translation: {} }, es: { translation: {} } },
    initImmediate: false,
  });

  return render(
    <I18nextProvider i18n={i18n}>
      <ChatBox {...baseProps} {...overrides} />
    </I18nextProvider>,
  );
}

function interpolationTokens(value: string): string[] {
  return [...value.matchAll(/\{\{([A-Za-z_][A-Za-z0-9_]*)\}\}/gu)].map((match) => match[1]).sort();
}

afterEach(() => {
  cleanup();
  mocks.toastError.mockReset();
  vi.unstubAllGlobals();
});

describe('ChatBox i18n', () => {
  it('keeps catalog parity, plural interpolation, and English fallback', () => {
    expect(Object.keys(chatBoxFr).sort()).toEqual(Object.keys(chatBoxEn).sort());

    for (const key of Object.keys(chatBoxEn) as Array<keyof typeof chatBoxEn>) {
      expect(chatBoxEn[key].trim().length, key).toBeGreaterThan(0);
      expect(chatBoxFr[key].trim().length, key).toBeGreaterThan(0);
      expect(interpolationTokens(chatBoxFr[key]), key).toEqual(interpolationTokens(chatBoxEn[key]));
    }

    expect(formatChatBoxAttachmentSummary('fr-FR', 1, 5)).toBe('1 image jointe sur 5');
    expect(formatChatBoxAttachmentSummary('fr-FR', 2, 5)).toBe('2 images jointes sur 5');
    expect(formatChatBoxAttachmentSummary('en-US', 2, 5)).toBe('2 of 5 images attached');
    expect(getChatBoxCopy('es-MX')['chatBox.tools.more']).toBe('More composer & tools');
    expect(getChatBoxDroppedImageError('fr', new Error('Raw FileReader failure /Users/private'))).toBe(
      'Impossible de lire l’image déposée. Réessayez.',
    );
  });

  it('renders the standalone composer and tools menu in French', () => {
    renderWithLanguage('fr', { input: 'Expliquez cette architecture' });

    expect(screen.getByRole('textbox', { name: 'Prompt de discussion' }).getAttribute('placeholder')).toBe(
      'Comment E-Code peut-il vous aider aujourd’hui ?',
    );
    expect(screen.getByRole('button', { name: 'Joindre des images' }).getAttribute('data-vc-tooltip')).toBe(
      'Joindre des images',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Plus d’options et d’outils' }));

    const menu = screen.getByRole('menu', { name: 'Outils du prompt' });
    expect(within(menu).getByRole('button', { name: 'Outils MCP' })).toBeTruthy();
    expect(within(menu).getByRole('button', { name: 'Récupérer une URL' })).toBeTruthy();
    expect(
      within(menu).getByRole('button', { name: 'Améliorer ce prompt avec l’IA avant l’envoi' }).textContent,
    ).toContain('Améliorer le prompt');
    expect(within(menu).getByRole('button', { name: 'Saisie vocale' })).toBeTruthy();
    expect(within(menu).getByRole('button', { name: 'Discuter' }).textContent).toContain('Discuter');
    expect(within(menu).getByRole('button', { name: 'Paramètres du modèle' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Raccourcis du prompt' }).getAttribute('data-vc-tooltip')).toBe(
      'Maj + Entrée insère une nouvelle ligne',
    );
    expect(screen.queryByText('Enhance prompt')).toBeNull();
    expect(screen.queryByText('Discuss')).toBeNull();
  });

  it('localizes project controls and preserves long inspected element identifiers without translating them', () => {
    const selectedElement = {
      tagName: 'customer-owned-extremely-long-component-identifier',
    } as NonNullable<ChatBoxProps['selectedElement']>;

    renderWithLanguage('fr', {
      projectIdeMode: true,
      planFirstEnabled: false,
      onPlanFirstChange: vi.fn(),
      selectedElement,
      setSelectedElement: vi.fn(),
      uploadedFiles: [new File(['image'], 'customer-image.png', { type: 'image/png' })],
    });

    const planButton = screen.getByRole('button', { name: 'Planifier' });
    expect(planButton.getAttribute('title')).toBe(
      'Planifier d’abord : proposer un plan vérifiable et attendre votre approbation avant toute modification',
    );
    expect(screen.getByRole('textbox', { name: 'Prompt de l’agent' })).toBeTruthy();

    const inspectedIdentifier = screen.getByText('customer-owned-extremely-long-component-identifier');

    expect(inspectedIdentifier.className).toContain('break-all');
    expect(inspectedIdentifier.className).not.toContain('overflow-hidden');
    expect(screen.getByText('sélectionné pour inspection')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Effacer l’élément sélectionné pour inspection' })).toBeTruthy();
    expect(screen.getByTitle('1 image jointe sur 4').textContent).toContain('1/4');

    const inspectedRow = screen.getByText('sélectionné pour inspection').parentElement?.parentElement;
    expect(inspectedRow?.className).toContain('flex-wrap');
    expect(inspectedRow?.className).toContain('sm:flex-nowrap');
  });

  it('never exposes a raw FileReader error in the localized toast', () => {
    const rawError = new Error('Raw English reader failure: /Users/private/customer-image.png');

    class FailingFileReader {
      error = rawError;
      result: string | ArrayBuffer | null = null;
      onload: ((event: ProgressEvent<FileReader>) => void) | null = null;
      onerror: ((event: ProgressEvent<FileReader>) => void) | null = null;

      readAsDataURL() {
        this.onerror?.(new ProgressEvent('error') as ProgressEvent<FileReader>);
      }
    }

    vi.stubGlobal('FileReader', FailingFileReader);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    renderWithLanguage('fr');

    fireEvent.drop(screen.getByRole('textbox', { name: 'Prompt de discussion' }), {
      dataTransfer: {
        files: [new File(['image'], 'customer-image.png', { type: 'image/png' })],
      },
    });

    expect(mocks.toastError).toHaveBeenCalledWith('Impossible de lire l’image déposée. Réessayez.');
    expect(mocks.toastError).not.toHaveBeenCalledWith(expect.stringContaining('Raw English reader failure'));
    expect(document.body.textContent).not.toContain('Raw English reader failure');
  });

  it('falls back to English for an unsupported locale', () => {
    renderWithLanguage('es');

    expect(screen.getByRole('textbox', { name: 'Chat prompt' }).getAttribute('placeholder')).toBe(
      'How can E-Code help you today?',
    );
    expect(screen.getByRole('button', { name: 'Attach images' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Joindre des images' })).toBeNull();
  });
});
