/**
 * @vitest-environment jsdom
 */

/*
 * UNIF-04 (lot 2 de docs/UX_UNIFORMIZATION_AUDIT.md) — composeur uniforme :
 *
 * C1  un seul gabarit de contrôle (32 px / rayon 8) pour la rangée du composeur ;
 * C2  une seule bibliothèque d'icônes (Phosphor `i-ph:*`) — plus de lucide-react
 *     dans AgentPowerControls, donc plus deux graisses de trait côte à côte ;
 * C3  taille d'icône unique (text-lg) dans la barre d'outils 32 px ;
 * C4  le feedback drag&drop vit sur la coque (`data-dragover` + CSS), plus en
 *     style inline sur le textarea (double bordure + saut de layout).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AgentPowerControls, type AgentPowerControlsValue } from './AgentPowerControls';
import { ChatBox } from './ChatBox';

vi.mock('remix-utils/client-only', () => ({
  ClientOnly: ({ children }: { children: () => React.ReactNode }) => <>{children()}</>,
}));

vi.mock('./APIKeyManager', () => ({ APIKeyManager: () => null }));
vi.mock('./ComposerMentionsOverlay', () => ({ ComposerMentionsOverlay: () => null }));
vi.mock('./ComposerSlashOverlay', () => ({ ComposerSlashOverlay: () => null }));
vi.mock('./FilePreview', () => ({ default: () => null }));
vi.mock('./ScreenshotStateManager', () => ({ ScreenshotStateManager: () => null }));
vi.mock('./SendButton.client', () => ({
  SendButton: ({ show }: { show: boolean }) => (show ? <button type="button">Send message</button> : null),
}));
vi.mock('./MCPTools', () => ({ McpTools: () => <button type="button">MCP tools</button> }));
vi.mock('./SupabaseConnection', () => ({ SupabaseConnection: () => <button type="button">Supabase</button> }));
vi.mock('./WebSearch.client', () => ({ WebSearch: () => <button type="button">Fetch URL</button> }));
vi.mock('~/lib/stores/settings', () => ({ LOCAL_PROVIDERS: [] }));
vi.mock('~/components/ui/ColorSchemeDialog', () => ({
  ColorSchemeDialog: () => <button type="button">Design palette</button>,
}));
vi.mock('~/components/workbench/ExpoQrModal', () => ({ ExpoQrModal: () => null }));

// jsdom n'a pas l'API Web Speech ; le bouton micro se cache sans ce stub.
(window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition = class {};

const powerValue: AgentPowerControlsValue = {
  highEffort: false,
  highPowerModel: false,
  extendedThinking: false,
  turboMode: false,
  buildTier: 'economy',
};

type ChatBoxTestProps = React.ComponentProps<typeof ChatBox>;

const baseProps: ChatBoxTestProps = {
  isModelSettingsCollapsed: false,
  setIsModelSettingsCollapsed: vi.fn(),
  provider: { name: 'OpenAI' },
  providerList: [{ name: 'OpenAI' }],
  modelList: [{ name: 'gpt-5.5' }],
  apiKeys: {},
  isModelLoading: undefined,
  onApiKeysChange: vi.fn(),
  uploadedFiles: [],
  imageDataList: [],
  textareaRef: React.createRef<HTMLTextAreaElement>(),
  input: 'Build the dashboard',
  handlePaste: vi.fn(),
  TEXTAREA_MIN_HEIGHT: 76,
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
  projectIdeMode: true,
  planFirstEnabled: false,
  onPlanFirstChange: vi.fn(),
  agentMode: 'agent',
  setAgentMode: vi.fn(),
};

const agentPowerSource = readFileSync(join(__dirname, 'AgentPowerControls.tsx'), 'utf8');
const chatBoxSource = readFileSync(join(__dirname, 'ChatBox.tsx'), 'utf8');
const indexScssSource = readFileSync(join(__dirname, '..', '..', 'styles', 'index.scss'), 'utf8');

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.localStorage.clear();
});

describe('UNIF-04 — une seule bibliothèque d’icônes (C2)', () => {
  it('AgentPowerControls n’importe plus lucide-react (source)', () => {
    expect(agentPowerSource).not.toContain('lucide-react');
    expect(agentPowerSource).toContain('i-ph:');
  });

  it('AgentPowerControls ne rend plus aucun <svg> lucide (DOM)', () => {
    const { container } = render(<AgentPowerControls value={powerValue} onChange={vi.fn()} estimatedCents={25} />);

    // lucide rend des <svg> inline ; les icônes Phosphor UnoCSS sont des <span>.
    expect(container.querySelector('svg')).toBeNull();
    expect(container.querySelector('[class*="i-ph:"]')).not.toBeNull();
  });
});

describe('UNIF-04 — gabarit unique 32 px / rayon 8 (C1)', () => {
  it('le segmenté Lite/Economy/Power abandonne min-h-10 / rounded-2xl / rounded-xl', () => {
    expect(agentPowerSource).not.toContain('min-h-10');
    expect(agentPowerSource).not.toContain('rounded-2xl');

    /*
     * Le seul rounded-xl restant est le CONTENEUR du popover Advanced (un
     * dialogue, pas un contrôle de la rangée — même rayon que les autres
     * popovers du composeur). Aucun contrôle de la rangée n'y a droit.
     */
    expect((agentPowerSource.match(/rounded-xl/g) ?? []).length).toBe(1);
    expect(agentPowerSource).toMatch(/bolt-agent-power-popover[^"]*rounded-xl|rounded-xl[^"]*bolt-agent-power-popover/);
  });

  it('le segmenté, Advanced et l’estimation partagent le gabarit (DOM)', () => {
    render(<AgentPowerControls value={powerValue} onChange={vi.fn()} estimatedCents={25} />);

    const segmented = screen.getByTestId('agent-mode-segmented');
    expect(segmented.className).toContain('rounded-lg');

    const advanced = screen.getByTestId('agent-mode-advanced');
    expect(advanced.className).toContain('h-8');
    expect(advanced.className).toContain('rounded-lg');
    expect(advanced.className).not.toContain('rounded-full');
  });
});

describe('UNIF-04 — taille d’icône unique dans la barre d’outils (C3)', () => {
  it('trombone et ⋯ passent en text-lg comme info/caret', () => {
    expect(chatBoxSource).toContain('i-ph:paperclip text-lg');
    expect(chatBoxSource).toContain('i-ph:dots-three-outline text-lg');
    expect(chatBoxSource).not.toContain('i-ph:paperclip text-xl');
    expect(chatBoxSource).not.toContain('i-ph:dots-three-outline text-xl');
  });
});

describe('UNIF-04 — drag & drop sur la coque (C4)', () => {
  it('le textarea ne pose plus de bordure inline ni de classe hover morte (source)', () => {
    expect(chatBoxSource).not.toContain("e.currentTarget.style.border = '2px solid");
    expect(chatBoxSource).not.toContain('hover:border-bolt-elements-focus');
  });

  it('la coque expose data-dragover et le style associé existe (SCSS)', () => {
    expect(chatBoxSource).toContain('data-dragover');
    expect(indexScssSource).toContain(".bolt-chatbox-input-shell[data-dragover='true']");
  });

  it('survol de fichier : la coque passe en data-dragover, le textarea ne bouge pas (DOM)', () => {
    const { container } = render(<ChatBox {...baseProps} />);

    const shell = container.querySelector('.bolt-chatbox-input-shell') as HTMLElement;
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    expect(shell).not.toBeNull();

    fireEvent.dragEnter(shell);
    expect(shell.getAttribute('data-dragover')).toBe('true');

    // Aucune manipulation inline de bordure sur le textarea (l'ancien bug de saut).
    expect(textarea.style.border).toBe('');

    // dragleave vers l'extérieur (relatedTarget hors coque) → feedback retiré.
    fireEvent.dragLeave(shell, { relatedTarget: document.body });
    expect(shell.getAttribute('data-dragover')).toBeNull();
  });

  it('déposer une image ajoute bien le fichier (comportement conservé)', async () => {
    const setUploadedFiles = vi.fn();
    const setImageDataList = vi.fn();

    const { container } = render(
      <ChatBox {...baseProps} setUploadedFiles={setUploadedFiles} setImageDataList={setImageDataList} />,
    );

    const shell = container.querySelector('.bolt-chatbox-input-shell') as HTMLElement;
    const file = new File(['fake-png-bytes'], 'capture.png', { type: 'image/png' });

    fireEvent.drop(shell, { dataTransfer: { files: [file], types: ['Files'] } });

    expect(shell.getAttribute('data-dragover')).toBeNull();

    // FileReader.onload est asynchrone : on attend le tick suivant.
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(setUploadedFiles).toHaveBeenCalledTimes(1);
    expect(setImageDataList).toHaveBeenCalledTimes(1);
  });
});
