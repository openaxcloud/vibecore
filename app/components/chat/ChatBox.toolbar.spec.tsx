/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

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
vi.mock('./MCPTools', () => ({
  McpTools: ({ triggerLabel = 'MCP tools' }: { triggerLabel?: string }) => (
    <button type="button">{triggerLabel}</button>
  ),
}));
vi.mock('./SupabaseConnection', () => ({ SupabaseConnection: () => <button type="button">Supabase</button> }));
vi.mock('./WebSearch.client', () => ({
  WebSearch: ({ triggerLabel = 'Fetch URL' }: { triggerLabel?: string }) => (
    <button type="button">{triggerLabel}</button>
  ),
}));
vi.mock('~/components/chat/ModelSelector', () => ({ ModelSelector: () => null }));
vi.mock('~/lib/stores/settings', () => ({ LOCAL_PROVIDERS: [] }));
vi.mock('~/components/ui/ColorSchemeDialog', () => ({
  ColorSchemeDialog: ({ triggerLabel = 'Design palette' }: { triggerLabel?: string }) => (
    <button type="button">{triggerLabel}</button>
  ),
}));
vi.mock('~/components/workbench/ExpoQrModal', () => ({ ExpoQrModal: () => null }));

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
  setProvider: vi.fn(),
  model: 'gpt-5.5',
  setModel: vi.fn(),
  setUploadedFiles: vi.fn(),
  setImageDataList: vi.fn(),
  handleInputChange: vi.fn(),
  handleStop: vi.fn(),
  enhancingPrompt: false,
  enhancePrompt: vi.fn(),
  onWebSearchResult: vi.fn(),
  chatMode: 'build',
  setChatMode: vi.fn(),
  projectIdeMode: true,
  planFirstEnabled: false,
  onPlanFirstChange: vi.fn(),
};

function renderChatBox(overrides: Partial<ChatBoxTestProps> = {}) {
  return render(<ChatBox {...baseProps} {...overrides} />);
}

describe('<ChatBox /> toolbar', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('keeps the composer toolbar compact and moves the newline hint behind a tooltip', () => {
    renderChatBox();

    expect(screen.queryByText(/Use Shift \+ Return a new line/i)).toBeNull();
    expect(screen.getByRole('button', { name: 'Upload file' }).getAttribute('data-vc-tooltip')).toBe('Upload file');
    expect(screen.getByRole('button', { name: 'Plan' }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByRole('button', { name: 'Plan' }).getAttribute('data-vc-tooltip')).toBe(
      'Plan is off: click to require a reviewable plan before edits or commands.',
    );
    expect(screen.getByRole('button', { name: 'More composer tools' }).getAttribute('aria-haspopup')).toBe('menu');

    const shortcuts = screen.getByRole('button', { name: 'Composer shortcuts' });

    expect(shortcuts.getAttribute('data-vc-tooltip')).toBe('Shift + Return inserts a new line');
    expect(shortcuts.getAttribute('data-vc-tooltip-locked')).toBe('true');
  });

  it('groups secondary composer tools inside the overflow menu', () => {
    renderChatBox();

    fireEvent.click(screen.getByRole('button', { name: 'More composer tools' }));

    const menu = screen.getByRole('menu', { name: 'Composer tools' });

    expect(within(menu).getByText('Design palette')).toBeTruthy();
    expect(within(menu).getByText('MCP tools')).toBeTruthy();
    expect(within(menu).getByText('Fetch URL')).toBeTruthy();
    expect(within(menu).getByText('Enhance prompt')).toBeTruthy();
    expect(within(menu).getByText('Speech')).toBeTruthy();
    expect(within(menu).getByText('Hide agent settings')).toBeTruthy();
  });

  it('toggles Plan first from the composer toolbar', () => {
    const onPlanFirstChange = vi.fn();
    renderChatBox({ planFirstEnabled: true, onPlanFirstChange });

    const planButton = screen.getByRole('button', { name: 'Plan' });

    expect(planButton.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(planButton);

    expect(onPlanFirstChange).toHaveBeenCalledWith(false);
  });
});
