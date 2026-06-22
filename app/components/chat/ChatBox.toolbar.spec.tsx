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
  agentMode: 'agent',
  setAgentMode: vi.fn(),
  planFirstEnabled: false,
  onPlanFirstChange: vi.fn(),
};

function renderChatBox(overrides: Partial<ChatBoxTestProps> = {}) {
  return render(<ChatBox {...baseProps} {...overrides} />);
}

/**
 * The per-request boosts (High power / Extended thinking / Turbo) and the build
 * tier live inside the "Power" popover, collapsed by default. Open it via the
 * popover trigger (the only button with `aria-haspopup="dialog"`).
 */
function openPowerPopover() {
  const trigger = screen
    .getAllByRole('button')
    .find((button) => button.getAttribute('aria-haspopup') === 'dialog' && /Power/i.test(button.textContent ?? ''));

  if (!trigger) {
    throw new Error('Power popover trigger not found');
  }

  fireEvent.click(trigger);
}

describe('<ChatBox /> toolbar', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it('keeps the composer toolbar compact and moves the newline hint behind a tooltip', () => {
    renderChatBox();

    expect(screen.queryByText(/Use Shift \+ Return a new line/i)).toBeNull();
    expect(screen.getByRole('button', { name: 'Upload file' }).getAttribute('data-vc-tooltip')).toBe('Upload file');

    // Agent/Plan/Assistant are merged into a single mode dropdown (default Agent).
    const modeTrigger = screen.getByRole('button', { name: 'Agent' });

    expect(modeTrigger.getAttribute('aria-haspopup')).toBe('menu');
    expect(modeTrigger.getAttribute('aria-expanded')).toBe('false');

    expect(screen.getByRole('button', { name: 'More composer & tools' }).getAttribute('aria-haspopup')).toBe('menu');

    const shortcuts = screen.getByRole('button', { name: 'Composer shortcuts' });

    expect(shortcuts.getAttribute('data-vc-tooltip')).toBe('Shift + Return inserts a new line');
    expect(shortcuts.getAttribute('data-vc-tooltip-locked')).toBe('true');
  });

  it('groups secondary composer tools inside the overflow menu', () => {
    renderChatBox();

    fireEvent.click(screen.getByRole('button', { name: 'More composer & tools' }));

    const menu = screen.getByRole('menu', { name: 'Composer tools' });

    expect(within(menu).getByText('Design palette')).toBeTruthy();
    expect(within(menu).getByText('MCP tools')).toBeTruthy();
    expect(within(menu).getByText('Fetch URL')).toBeTruthy();
    expect(within(menu).getByText('Enhance prompt')).toBeTruthy();
    expect(within(menu).getByText('Hide agent settings')).toBeTruthy();

    /*
     * In the IDE composer the mic is surfaced directly on the bar, so Speech is
     * intentionally NOT duplicated inside the overflow menu.
     */
    expect(within(menu).queryByText('Speech')).toBeNull();
  });

  it('selects Plan mode from the composer mode dropdown', () => {
    const onPlanFirstChange = vi.fn();
    const setAgentMode = vi.fn();
    renderChatBox({ planFirstEnabled: false, onPlanFirstChange, setAgentMode });

    fireEvent.click(screen.getByRole('button', { name: 'Agent' }));

    const menu = screen.getByRole('menu', { name: 'Agent mode' });

    fireEvent.click(within(menu).getByRole('menuitemradio', { name: /Plan/i }));

    expect(onPlanFirstChange).toHaveBeenCalledWith(true);
    expect(setAgentMode).toHaveBeenCalledWith('agent');
  });

  it('reflects the active Plan mode on the dropdown trigger', () => {
    renderChatBox({ planFirstEnabled: true });

    expect(screen.getByRole('button', { name: 'Plan' }).getAttribute('aria-haspopup')).toBe('menu');
  });
});

describe('<ChatBox /> agent power controls', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it('renders the per-request power controls + a default proof-of-work estimate in the IDE composer', () => {
    renderChatBox();

    /*
     * The default estimate is visible on the composer bar without opening anything.
     * economy (×1) × $0.25 baseline
     */
    expect(screen.getByTitle(/Estimated cost for this request/i).textContent).toContain('~$0.25');

    // The boosts + build tier live inside the collapsed "Power" popover.
    openPowerPopover();

    expect(screen.getByRole('switch', { name: /High power/i })).toBeTruthy();
    expect(screen.getByRole('switch', { name: /Extended thinking/i })).toBeTruthy();
    expect(screen.getByRole('switch', { name: /Turbo/i })).toBeTruthy();
    expect(screen.getByRole('radiogroup', { name: 'Build tier' })).toBeTruthy();
  });

  it('does not render the power controls outside the IDE composer', () => {
    renderChatBox({ projectIdeMode: false });
    expect(screen.queryByRole('switch', { name: /High power/i })).toBeNull();
    expect(screen.queryByTitle(/Estimated cost for this request/i)).toBeNull();
  });

  it('raises the proof-of-work estimate when High power is enabled and reports the change', () => {
    const onAgentPowerChange = vi.fn();
    renderChatBox({ onAgentPowerChange });

    openPowerPopover();
    fireEvent.click(screen.getByRole('switch', { name: /High power/i }));

    expect(onAgentPowerChange).toHaveBeenCalledWith(expect.objectContaining({ highPowerModel: true }));

    // $0.25 × 4 = $1.00
    expect(screen.getByTitle(/Estimated cost for this request/i).textContent).toContain('~$1.00');
  });

  it('honors a parent-controlled power value (Turbo → ~$1.50)', () => {
    renderChatBox({
      agentPower: { highPowerModel: false, extendedThinking: false, turboMode: true, buildTier: 'economy' },
      onAgentPowerChange: vi.fn(),
    });

    // $0.25 × 6 = $1.50 — shown on the bar straight away.
    expect(screen.getByTitle(/Estimated cost for this request/i).textContent).toContain('~$1.50');

    openPowerPopover();
    expect(screen.getByRole('switch', { name: /Turbo/i }).getAttribute('aria-checked')).toBe('true');
  });
});
