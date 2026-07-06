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

/*
 * The mic button feature-detects the Web Speech API and hides itself when it
 * is absent (e.g. Firefox). jsdom has neither constructor, so stub one before
 * any render — the detection caches once per module load.
 */
(window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition = class {};

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

  /*
   * The IDE composer wires the Agent/Assistant mode dropdown plus a SEPARATE
   * standalone Plan-first toggle beside it (Replit parity). agentMode/
   * setAgentMode drive the dropdown; planFirstEnabled/onPlanFirstChange drive
   * the standalone Plan toggle.
   */
  agentMode: 'agent',
  setAgentMode: vi.fn(),
};

function renderChatBox(overrides: Partial<ChatBoxTestProps> = {}) {
  return render(<ChatBox {...baseProps} {...overrides} />);
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

    /*
     * The mode dropdown is Agent/Assistant only now; Plan is a standalone toggle
     * beside it. With agentMode='agent' the trigger reads "Agent" and the Plan
     * toggle is present and not pressed (planFirstEnabled=false).
     */
    const modeTrigger = screen.getByRole('button', { name: /Agent/, expanded: false });
    expect(modeTrigger.getAttribute('aria-haspopup')).toBe('menu');
    expect(modeTrigger.getAttribute('data-mode')).toBe('agent');

    const planToggle = screen.getByRole('button', { name: 'Plan' });
    expect(planToggle.getAttribute('aria-pressed')).toBe('false');

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
     * In the IDE composer the mic is surfaced directly on the toolbar bar
     * (Replit parity), so Speech is intentionally omitted from this menu to
     * avoid a duplicate — it lives on the primary bar instead.
     */
    expect(within(menu).queryByText('Speech')).toBeNull();
    expect(screen.getByRole('button', { name: 'Start speech recognition' })).toBeTruthy();
  });

  it('toggles Plan first from the standalone Plan toggle (Replit parity)', () => {
    const onPlanFirstChange = vi.fn();
    renderChatBox({ planFirstEnabled: false, onPlanFirstChange });

    // Standalone toggle, next to the mode dropdown — not a dropdown mode.
    const planToggle = screen.getByRole('button', { name: 'Plan' });
    expect(planToggle.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(planToggle);
    expect(onPlanFirstChange).toHaveBeenCalledWith(true);
  });

  it('shows the standalone Plan toggle pressed when plan-first is on, and turns it off', () => {
    const onPlanFirstChange = vi.fn();
    renderChatBox({ planFirstEnabled: true, onPlanFirstChange });

    const planToggle = screen.getByRole('button', { name: 'Plan' });
    expect(planToggle.getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(planToggle);
    expect(onPlanFirstChange).toHaveBeenCalledWith(false);

    // The Agent/Assistant dropdown no longer carries a Plan mode.
    fireEvent.click(screen.getByRole('button', { name: /Agent/, expanded: false }));

    const menu = screen.getByRole('menu', { name: 'Agent mode' });
    expect(within(menu).queryByRole('menuitemradio', { name: /Plan/ })).toBeNull();
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
     * The boosts + build tier are collapsed behind a single "Power" dropdown
     * (Replit-clean composer) without dropping any control. The live cost
     * estimate stays visible on the bar; the controls live in the popover.
     */
    const powerTrigger = screen.getByRole('button', { name: /Power/i });
    fireEvent.click(powerTrigger);

    expect(screen.getByRole('switch', { name: /High power/i })).toBeTruthy();
    expect(screen.getByRole('switch', { name: /Extended thinking/i })).toBeTruthy();
    expect(screen.getByRole('switch', { name: /Turbo/i })).toBeTruthy();
    expect(screen.getByRole('radiogroup', { name: 'Build tier' })).toBeTruthy();

    // economy (×1) × $0.25 baseline, +30% server AI margin → ceil(33¢) = $0.33
    expect(screen.getByTitle(/Estimated cost for this request/i).textContent).toContain('~$0.33');
  });

  it('does not render the power controls outside the IDE composer', () => {
    renderChatBox({ projectIdeMode: false });
    expect(screen.queryByRole('button', { name: /High power/i })).toBeNull();
  });

  it('raises the proof-of-work estimate when High power is enabled and reports the change', () => {
    const onAgentPowerChange = vi.fn();
    renderChatBox({ onAgentPowerChange });

    fireEvent.click(screen.getByRole('button', { name: /Power/i }));
    fireEvent.click(screen.getByRole('switch', { name: /High power/i }));

    expect(onAgentPowerChange).toHaveBeenCalledWith(expect.objectContaining({ highPowerModel: true }));

    // $0.25 × 4 = $1.00 raw, +30% server AI margin → ceil(130¢) = $1.30
    expect(screen.getByTitle(/Estimated cost for this request/i).textContent).toContain('~$1.30');
  });

  it('honors a parent-controlled power value (Turbo → ~$1.95)', () => {
    renderChatBox({
      agentPower: { highPowerModel: false, extendedThinking: false, turboMode: true, buildTier: 'economy' },
      onAgentPowerChange: vi.fn(),
    });

    fireEvent.click(screen.getByRole('button', { name: /Power/i }));

    expect(screen.getByRole('switch', { name: /Turbo/i }).getAttribute('aria-checked')).toBe('true');

    // $0.25 × 6 = $1.50 raw, +30% server AI margin → ceil(195¢) = $1.95
    expect(screen.getByTitle(/Estimated cost for this request/i).textContent).toContain('~$1.95');
  });
});
