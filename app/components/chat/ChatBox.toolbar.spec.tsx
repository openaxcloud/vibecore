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
    expect(screen.getByRole('button', { name: 'Attach images' }).getAttribute('data-vc-tooltip')).toBe('Attach images');

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

  it('renders the AGM segmented mode control + Advanced popover in the IDE composer', () => {
    renderChatBox();

    /*
     * AGM: the three MODES (Lite/Economy/Power) are a visible segmented
     * control — never a model name — and the two switches (High effort, Turbo)
     * live behind the Advanced popover. The live cost estimate stays visible.
     */
    const segmented = screen.getByRole('radiogroup', { name: /Agent mode/i });
    expect(within(segmented).getByRole('radio', { name: /Economy/i }).getAttribute('aria-checked')).toBe('true');
    expect(within(segmented).getByRole('radio', { name: /^Lite/i })).toBeTruthy();
    expect(within(segmented).getByRole('radio', { name: /^Power/i })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Advanced/i }));

    expect(screen.getByRole('switch', { name: /High effort/i })).toBeTruthy();
    expect(screen.getByRole('switch', { name: /Turbo/i })).toBeTruthy();

    // No model name anywhere in the composer — the product rule.
    expect(document.body.textContent).not.toMatch(/claude|gpt-|anthropic|openai|gemini/i);

    // economy (×1) × $0.25 baseline, +30% server AI margin → ceil(33¢) = $0.33
    expect(screen.getAllByTitle(/Estimated cost for this request/i)[0].textContent).toContain('~$0.33');
  });

  it('does not render the power controls outside the IDE composer', () => {
    renderChatBox({ projectIdeMode: false });
    expect(screen.queryByRole('radiogroup', { name: /Agent mode/i })).toBeNull();
  });

  it('never allows Turbo outside Power and reports High effort through the legacy wire field', () => {
    const onAgentPowerChange = vi.fn();
    renderChatBox({ onAgentPowerChange });

    fireEvent.click(screen.getByRole('button', { name: /Advanced/i }));

    // Economy: Turbo is locked (Power only)…
    const turbo = screen.getByRole('switch', { name: /Turbo/i });
    expect(turbo.hasAttribute('disabled')).toBe(true);

    // …but High effort is togglable and mirrors onto highPowerModel (wire compat).
    fireEvent.click(screen.getByRole('switch', { name: /High effort/i }));
    expect(onAgentPowerChange).toHaveBeenCalledWith(
      expect.objectContaining({ highEffort: true, highPowerModel: true }),
    );
  });

  it('honors a parent-controlled power value (Turbo in Power mode)', () => {
    renderChatBox({
      agentPower: { highEffort: false, highPowerModel: false, extendedThinking: false, turboMode: true, buildTier: 'power' },
      onAgentPowerChange: vi.fn(),
    });

    fireEvent.click(screen.getByRole('button', { name: /Advanced/i }));

    expect(screen.getByRole('switch', { name: /Turbo/i }).getAttribute('aria-checked')).toBe('true');
  });
});
