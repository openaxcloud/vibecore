/* eslint-disable import/order */
import React from 'react';
import { toast } from 'react-toastify';
import { ClientOnly } from 'remix-utils/client-only';
import { AgentPowerControls, type AgentModeAvailability, type AgentPowerControlsValue } from './AgentPowerControls';
import {
  coerceAgentModeSettings,
  readAgentModeSettingsFromStorage,
  setAgentModeSettings,
} from '~/lib/hooks/useAgentModeSettings';
import { estimateAgentPowerCents } from './agentPowerEstimate';
import { APIKeyManager } from './APIKeyManager';
import { ChatBoxModeDropdown } from './ChatBoxModeDropdown';
import { ComposerMentionsOverlay } from './ComposerMentionsOverlay';
import { ComposerSlashOverlay } from './ComposerSlashOverlay';
import { SpeechRecognitionButton } from '~/components/chat/SpeechRecognition';
import styles from './BaseChat.module.scss';
import FilePreview from './FilePreview';
import { MAX_IMAGE_ATTACHMENTS } from './image-attachments';
import type { ProviderInfo } from '~/types/model';
import type { DesignScheme } from '~/types/design-scheme';
import type { ElementInfo } from '~/components/workbench/Inspector';
import { McpTools } from './MCPTools';
import { ScreenshotStateManager } from './ScreenshotStateManager';
import { SendButton } from './SendButton.client';
import { SupabaseConnection } from './SupabaseConnection';
import { WebSearch } from './WebSearch.client';
import { ColorSchemeDialog } from '~/components/ui/ColorSchemeDialog';
import { IconButton } from '~/components/ui/IconButton';
import { ExpoQrModal } from '~/components/workbench/ExpoQrModal';
import { LOCAL_PROVIDERS } from '~/lib/stores/settings';
import { classNames } from '~/utils/classNames';
import { PROVIDER_LIST } from '~/utils/constants';

const DEFAULT_AGENT_POWER: AgentPowerControlsValue = {
  highEffort: false,
  highPowerModel: false,
  extendedThinking: false,
  turboMode: false,
  buildTier: 'economy',
};

const AGENT_POWER_STORAGE_KEY = 'vibecore.agentPower';

interface ChatBoxProps {
  isModelSettingsCollapsed: boolean;
  setIsModelSettingsCollapsed: (collapsed: boolean) => void;
  provider: any;
  providerList?: any[] | null;
  modelList?: any[] | null;
  apiKeys: Record<string, string>;
  isModelLoading: string | undefined;
  modelError?: string | null;
  onApiKeysChange: (providerName: string, apiKey: string) => void;
  uploadedFiles: File[];
  imageDataList: string[];
  textareaRef: React.RefObject<HTMLTextAreaElement> | undefined;
  input: string;
  handlePaste: (e: React.ClipboardEvent) => void;
  TEXTAREA_MIN_HEIGHT: number;
  TEXTAREA_MAX_HEIGHT: number;
  isStreaming: boolean;
  handleSendMessage: (event: React.UIEvent, messageInput?: string) => void;
  isListening: boolean;
  startListening: () => void;
  stopListening: () => void;
  chatStarted: boolean;
  exportChat?: () => void;
  qrModalOpen: boolean;
  setQrModalOpen: (open: boolean) => void;
  handleFileUpload: () => void;
  setProvider?: ((provider: ProviderInfo) => void) | undefined;
  model?: string | undefined;
  setModel?: ((model: string) => void) | undefined;
  setUploadedFiles?: React.Dispatch<React.SetStateAction<File[]>> | undefined;
  setImageDataList?: React.Dispatch<React.SetStateAction<string[]>> | undefined;
  handleInputChange?: ((event: React.ChangeEvent<HTMLTextAreaElement>) => void) | undefined;
  handleStop?: (() => void) | undefined;
  enhancingPrompt?: boolean | undefined;
  enhancePrompt?: (() => void) | undefined;
  onWebSearchResult?: (result: string) => void;
  chatMode?: 'discuss' | 'build';
  setChatMode?: (mode: 'discuss' | 'build') => void;
  slashContext?: import('~/lib/chat/slash-commands').SlashCommandContext;
  designScheme?: DesignScheme;
  setDesignScheme?: (scheme: DesignScheme) => void;
  selectedElement?: ElementInfo | null;
  setSelectedElement?: ((element: ElementInfo | null) => void) | undefined;
  projectIdeMode?: boolean;
  planFirstEnabled?: boolean;
  onPlanFirstChange?: (next: boolean) => void;

  /**
   * Agent execution mode (Agent = autonomous end-to-end, Assistant =
   * conversational). Relocated from the old dedicated header tab row into the
   * composer toolbar so the mode lives next to Plan (Replit-style: mode controls
   * sit in the composer, not a separate header). No option lost.
   */
  agentMode?: 'agent' | 'assistant';
  setAgentMode?: (mode: 'agent' | 'assistant') => void;

  /**
   * Per-request agent power controls (Replit parity: High power, Extended
   * thinking, Turbo, build tier). Controlled by the parent when provided;
   * otherwise ChatBox manages local, localStorage-persisted state so the
   * composer works standalone. `onAgentPowerChange` lets the parent capture the
   * selection to attach to the agent request.
   */
  agentPower?: AgentPowerControlsValue;
  onAgentPowerChange?: (next: AgentPowerControlsValue) => void;
  placeholder?: string;

  /** Project id used by the composer overlays to persist MRU palettes. */
  projectId?: string;

  /** MRU file paths from projectIdeMemory; boosts ranking in @-palette. */
  recentMentionedFilePaths?: readonly string[];

  /** MRU slash command ids from projectIdeMemory; boosts ranking in /-palette. */
  recentSlashCommandIds?: readonly string[];
}

export const ChatBox: React.FC<ChatBoxProps> = (props) => {
  const providerList = Array.isArray(props.providerList) ? props.providerList : (PROVIDER_LIST as ProviderInfo[]);

  const hasComposerPayload = props.input.trim().length > 0 || props.uploadedFiles.length > 0;

  /*
   * Replit parity: the Send button only appears once the user has something to
   * send — typed input, an attachment, or an active voice capture — or while a
   * response is streaming (so it can act as Stop). Hiding it otherwise frees
   * space on the conversation wall. Previously the IDE composer always showed it.
   */
  const showSendButton = hasComposerPayload || props.isStreaming || props.isListening;

  const isSendButtonDisabled =
    !props.providerList || props.providerList.length === 0 || (!props.isStreaming && !hasComposerPayload);

  const settingsToggleTitle = props.projectIdeMode
    ? props.isModelSettingsCollapsed
      ? 'Show agent settings'
      : 'Hide agent settings'
    : 'Model Settings';
  const enhancePromptTitle = props.enhancingPrompt
    ? 'Enhancing your prompt with AI'
    : props.input.length === 0
      ? 'Type a prompt to enable AI prompt enhancement'
      : 'Enhance this prompt with AI before sending';

  const [isToolsMenuOpen, setIsToolsMenuOpen] = React.useState(false);
  const toolsMenuRef = React.useRef<HTMLDivElement>(null);

  /*
   * Per-request agent power controls. Parent-controlled when `props.agentPower`
   * is supplied; otherwise locally managed + persisted to localStorage.
   */
  const [localAgentPower, setLocalAgentPower] = React.useState<AgentPowerControlsValue>(() => {
    if (props.agentPower) {
      return props.agentPower;
    }

    if (typeof window === 'undefined') {
      return DEFAULT_AGENT_POWER;
    }

    /*
     * AGM: the mode + switches are a USER setting (never per project). Seed
     * from the per-user store; the legacy per-browser key stays as fallback so
     * an existing choice survives the migration.
     */
    const userSettings = readAgentModeSettingsFromStorage();

    let legacy: Partial<AgentPowerControlsValue> = {};

    try {
      const raw = window.localStorage.getItem(AGENT_POWER_STORAGE_KEY);

      if (raw) {
        legacy = JSON.parse(raw) as Partial<AgentPowerControlsValue>;
      }
    } catch {
      // ignore malformed/blocked storage
    }

    const merged = coerceAgentModeSettings({
      mode: userSettings.mode ?? legacy.buildTier,
      highEffort: userSettings.highEffort || legacy.highEffort || legacy.highPowerModel,
      turbo: userSettings.turbo || legacy.turboMode,
    });

    return {
      ...DEFAULT_AGENT_POWER,
      buildTier: merged.mode,
      highEffort: merged.highEffort,
      highPowerModel: merged.highEffort,
      turboMode: merged.turbo,
    };
  });

  const agentPower = props.agentPower ?? localAgentPower;

  const handleAgentPowerChange = React.useCallback(
    (next: AgentPowerControlsValue) => {
      if (!props.agentPower) {
        setLocalAgentPower(next);
      }

      /*
       * Persist + broadcast on every change (controlled or not) so Chat.client —
       * which owns the /api/chat request body — can pick up the latest power
       * settings and actually send them to the server. Without this the controls
       * stay cosmetic.
       */
      try {
        window.localStorage.setItem(AGENT_POWER_STORAGE_KEY, JSON.stringify(next));
        window.dispatchEvent(new CustomEvent('vibecore:agent-power-change', { detail: next }));
      } catch {
        // ignore blocked storage / SSR
      }

      // AGM: persist per USER (server preferences blob) — never per project.
      setAgentModeSettings({
        mode: next.buildTier,
        highEffort: next.highEffort || next.highPowerModel,
        turbo: next.turboMode,
      });

      props.onAgentPowerChange?.(next);
    },
    [props.agentPower, props.onAgentPowerChange],
  );

  const agentPowerEstimateCents = React.useMemo(() => estimateAgentPowerCents(agentPower), [agentPower]);

  /*
   * AGM: which modes/switches the caller's plan+org may use. Server-enforced
   * regardless; this only drives the locked UI states. Model-name free.
   */
  const [agentModeAvailability, setAgentModeAvailability] = React.useState<AgentModeAvailability | undefined>(
    undefined,
  );

  React.useEffect(() => {
    if (!props.projectIdeMode || !props.projectId) {
      return undefined;
    }

    let cancelled = false;

    fetch(`/api/agent-routing?projectId=${encodeURIComponent(props.projectId)}`, {
      headers: { accept: 'application/json' },
    })
      .then((response) => (response.ok ? response.json() : undefined))
      .then((payload) => {
        if (!cancelled && payload && Array.isArray((payload as AgentModeAvailability).modes)) {
          setAgentModeAvailability(payload as AgentModeAvailability);
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [props.projectIdeMode, props.projectId]);

  React.useEffect(() => {
    if (!isToolsMenuOpen) {
      return undefined;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!toolsMenuRef.current?.contains(event.target as Node)) {
        setIsToolsMenuOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsToolsMenuOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isToolsMenuOpen]);

  const enhancePrompt = () => {
    /*
     * The toast now fires from usePromptEnhancer on the real result (success or
     * error), not here on click — so it stops lying about a not-yet-done op.
     */
    props.enhancePrompt?.();
    setIsToolsMenuOpen(false);
  };

  const toggleChatMode = () => {
    props.setChatMode?.(props.chatMode === 'discuss' ? 'build' : 'discuss');
    setIsToolsMenuOpen(false);
  };

  const toggleModelSettings = () => {
    props.setIsModelSettingsCollapsed(!props.isModelSettingsCollapsed);
    setIsToolsMenuOpen(false);
  };

  return (
    <div
      className={classNames(
        'relative bg-bolt-elements-background-depth-2 backdrop-blur p-3 rounded-lg border border-bolt-elements-borderColor relative w-full max-w-chat mx-auto z-prompt',
        props.projectIdeMode ? 'bolt-project-chatbox' : undefined,

        /*
         * {
         *   'sticky bottom-2': chatStarted,
         * },
         */
      )}
      data-testid={props.projectIdeMode ? 'ide-agent-composer' : undefined}
    >
      <svg className={classNames(styles.PromptEffectContainer)}>
        <defs>
          <linearGradient
            id="line-gradient"
            x1="20%"
            y1="0%"
            x2="-14%"
            y2="10%"
            gradientUnits="userSpaceOnUse"
            gradientTransform="rotate(-45)"
          >
            <stop offset="0%" stopColor="#b44aff" stopOpacity="0%"></stop>
            <stop offset="40%" stopColor="#b44aff" stopOpacity="80%"></stop>
            <stop offset="50%" stopColor="#b44aff" stopOpacity="80%"></stop>
            <stop offset="100%" stopColor="#b44aff" stopOpacity="0%"></stop>
          </linearGradient>
          <linearGradient id="shine-gradient">
            <stop offset="0%" stopColor="white" stopOpacity="0%"></stop>
            <stop offset="40%" stopColor="#ffffff" stopOpacity="80%"></stop>
            <stop offset="50%" stopColor="#ffffff" stopOpacity="80%"></stop>
            <stop offset="100%" stopColor="white" stopOpacity="0%"></stop>
          </linearGradient>
        </defs>
        <rect className={classNames(styles.PromptEffectLine)} pathLength="100" strokeLinecap="round"></rect>
        <rect className={classNames(styles.PromptShine)} x="48" y="24" width="70" height="1"></rect>
      </svg>
      <div>
        <ClientOnly>
          {() => (
            <div className={props.isModelSettingsCollapsed ? 'hidden' : ''}>
              {/*
               * AGM: the model selector is GONE — the agent MODE (Lite/Economy/
               * Power) is the only choice, and the platform routes it to a model
               * server-side. Only the BYOK key manager remains behind this panel.
               */}
              {/*
               * Managed (Replit-parity) model: the platform admin provides the
               * provider keys, so end users don't enter their own. Set
               * VITE_BYOK_DISABLED=true to hide per-user key entry (flag off = no
               * change, so existing self-host / Enterprise BYOK keeps working).
               */}
              {import.meta.env.VITE_BYOK_DISABLED === 'true'
                ? null
                : providerList.length > 0 &&
                  props.provider &&
                  !LOCAL_PROVIDERS.includes(props.provider.name) && (
                    <APIKeyManager
                      provider={props.provider}
                      apiKey={props.apiKeys[props.provider.name] || ''}
                      setApiKey={(key) => {
                        props.onApiKeysChange(props.provider.name, key);
                      }}
                    />
                  )}
            </div>
          )}
        </ClientOnly>
      </div>
      {/*
       * Replit-parity per-request power controls + live proof-of-work cost
       * preview. Always visible in the agent composer (IDE) — not hidden behind
       * the collapsible model-settings — so the effort/cost controls are
       * discoverable. ClientOnly because the estimate + persisted state are
       * client-side.
       */}
      {props.projectIdeMode && (
        <ClientOnly>
          {() => (
            <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-bolt-elements-borderColor px-1 pt-2">
              <AgentPowerControls
                value={agentPower}
                onChange={handleAgentPowerChange}
                estimatedCents={agentPowerEstimateCents}
                disabled={props.isStreaming}
                availability={agentModeAvailability}
              />
              {/* Replit parity: the Plan-first toggle sits directly beside the
                  effort/Power control (shares the projectPlanFirst state — no
                  dup). Wired to the real plan-first pipeline (create-agent-plan). */}
              {props.onPlanFirstChange ? (
                <button
                  type="button"
                  className={classNames('bolt-chatbox-plan-toggle', {
                    'is-active': props.planFirstEnabled ?? false,
                  })}
                  aria-pressed={props.planFirstEnabled ?? false}
                  disabled={props.isStreaming}
                  title="Plan first: propose a reviewable plan and wait for approval before editing"
                  onClick={() => props.onPlanFirstChange?.(!(props.planFirstEnabled ?? false))}
                >
                  <span className="i-ph:list-checks bolt-chatbox-plan-toggle-icon" aria-hidden />
                  <span className="bolt-chatbox-plan-toggle-label">Plan</span>
                </button>
              ) : null}
            </div>
          )}
        </ClientOnly>
      )}
      <FilePreview
        files={props.uploadedFiles}
        imageDataList={props.imageDataList}
        onRemove={(index) => {
          props.setUploadedFiles?.(props.uploadedFiles.filter((_, i) => i !== index));
          props.setImageDataList?.(props.imageDataList.filter((_, i) => i !== index));
        }}
      />
      <ClientOnly>
        {() => (
          <ScreenshotStateManager
            setUploadedFiles={props.setUploadedFiles}
            setImageDataList={props.setImageDataList}
            uploadedFiles={props.uploadedFiles}
            imageDataList={props.imageDataList}
          />
        )}
      </ClientOnly>
      {props.selectedElement && (
        <div className="flex mx-1.5 gap-2 items-center justify-between rounded-lg rounded-b-none border border-b-none border-bolt-elements-borderColor text-bolt-elements-textPrimary flex py-1 px-2.5 font-medium text-xs">
          <div className="flex gap-2 items-center lowercase">
            <code className="bg-accent-500 rounded-4px px-1.5 py-1 mr-0.5 text-white">
              {props?.selectedElement?.tagName}
            </code>
            selected for inspection
          </div>
          <button
            type="button"
            aria-label="Clear selected inspected element"
            className="bg-transparent text-accent-500 pointer-auto"
            onClick={() => props.setSelectedElement?.(null)}
          >
            Clear
          </button>
        </div>
      )}
      <div
        className={classNames(
          'bolt-chatbox-input-shell relative shadow-xs border border-bolt-elements-borderColor backdrop-blur rounded-lg',
        )}
      >
        <div className="bolt-chatbox-input-frame relative">
          <textarea
            ref={props.textareaRef}
            aria-label={props.projectIdeMode ? 'Agent prompt' : 'Chat prompt'}
            className={classNames(
              'block w-full pl-4 pr-16 outline-none resize-none text-bolt-elements-textPrimary placeholder-bolt-elements-textTertiary bg-transparent text-sm',

              /*
               * Replit-style compact composer in the IDE: ~1 line at rest with a
               * tighter button-bar reserve; the standalone/landing composer keeps
               * the roomier sizing.
               */
              props.projectIdeMode ? 'pt-3 pb-10' : 'pt-4 pb-14',
              'transition-all duration-200',
              'hover:border-bolt-elements-focus',
            )}
            onDragEnter={(e) => {
              e.preventDefault();
              e.currentTarget.style.border = '2px solid var(--bolt-elements-focus)';
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.currentTarget.style.border = '2px solid var(--bolt-elements-focus)';
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              e.currentTarget.style.border = '1px solid var(--bolt-elements-borderColor)';
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.currentTarget.style.border = '1px solid var(--bolt-elements-borderColor)';

              const files = Array.from(e.dataTransfer.files);
              files.forEach((file) => {
                if (file.type.startsWith('image/')) {
                  const reader = new FileReader();

                  reader.onload = (e) => {
                    const base64Image = e.target?.result as string;

                    /*
                     * Functional updaters: dropping several images at once spins up
                     * one FileReader per file, and each `onload` fires asynchronously.
                     * Spreading a render-time snapshot (`props.uploadedFiles`) would
                     * make every async callback start from the same stale array and
                     * clobber the others, so only the last image survived. Updating
                     * from the live `prev` accumulates all dropped images.
                     */
                    props.setUploadedFiles?.((prev) => [...prev, file]);
                    props.setImageDataList?.((prev) => [...prev, base64Image]);
                  };

                  reader.onerror = () => {
                    console.error('Failed to read dropped file:', file.name, reader.error);
                    toast.error('Failed to read the dropped image. Please try again.');
                  };
                  reader.readAsDataURL(file);
                }
              });
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                if (event.shiftKey) {
                  return;
                }

                /*
                 * ignore if using input method engine (must be checked before
                 * preventDefault so an IME-confirm Enter isn't swallowed and
                 * doesn't wrongly trigger handleStop while streaming)
                 */
                if (event.nativeEvent.isComposing) {
                  return;
                }

                event.preventDefault();

                if (props.isStreaming) {
                  props.handleStop?.();
                  return;
                }

                props.handleSendMessage?.(event);
              }
            }}
            value={props.input}
            onChange={(event) => {
              props.handleInputChange?.(event);
            }}
            onPaste={props.handlePaste}
            style={{
              minHeight: props.TEXTAREA_MIN_HEIGHT,
              maxHeight: props.TEXTAREA_MAX_HEIGHT,
            }}
            placeholder={
              props.placeholder ??
              (props.chatMode === 'build' ? 'How can E-Code help you today?' : 'What would you like to discuss?')
            }
            translate="no"
          />
          {props.textareaRef ? (
            <ComposerMentionsOverlay
              textareaRef={props.textareaRef}
              input={props.input}
              handleInputChange={props.handleInputChange}
              recentMentionedFilePaths={props.recentMentionedFilePaths}
              projectId={props.projectId}
            />
          ) : null}
          {props.textareaRef ? (
            <ComposerSlashOverlay
              textareaRef={props.textareaRef}
              input={props.input}
              handleInputChange={props.handleInputChange}
              context={{
                chatMode: props.chatMode,
                setChatMode: props.setChatMode,
                ...(props.slashContext ?? {}),
              }}
              recentSlashCommandIds={props.recentSlashCommandIds}
              projectId={props.projectId}
            />
          ) : null}
          {!props.projectIdeMode ? (
            <ClientOnly>
              {() => (
                <SendButton
                  show={showSendButton}
                  isStreaming={props.isStreaming}
                  disabled={isSendButtonDisabled}
                  onClick={(event) => {
                    if (props.isStreaming) {
                      props.handleStop?.();
                      return;
                    }

                    if (props.input.length > 0 || props.uploadedFiles.length > 0) {
                      props.handleSendMessage?.(event);
                    }
                  }}
                />
              )}
            </ClientOnly>
          ) : null}
        </div>
        <div className="bolt-chatbox-toolbar" data-vc-composer-toolbar>
          <div className="bolt-chatbox-toolbar-primary">
            <IconButton
              title="Attach images"
              tooltip="Attach images"
              className="bolt-chatbox-toolbar-button"
              onClick={() => props.handleFileUpload()}
            >
              <div className="i-ph:paperclip text-xl"></div>
            </IconButton>

            {props.uploadedFiles.length > 0 ? (
              <span
                className="text-xs text-bolt-elements-textTertiary"
                aria-live="polite"
                title={`${props.uploadedFiles.length} of ${MAX_IMAGE_ATTACHMENTS} images attached`}
              >
                {props.uploadedFiles.length}/{MAX_IMAGE_ATTACHMENTS}
              </span>
            ) : null}

            {/*
             * I13: the mic/dictation button belongs on EVERY composer (landing /
             * new chat), not just the IDE. Its unsupported-browser guard lives
             * inside SpeechRecognitionButton itself (returns null when the Web
             * Speech API is missing — same G30 behaviour), and the listening
             * props come from BaseChat regardless of projectIdeMode, so it is
             * safe to render unconditionally here.
             */}
            <SpeechRecognitionButton
              isListening={props.isListening}
              onStart={props.startListening}
              onStop={props.stopListening}
              disabled={props.isStreaming}
              triggerVariant="icon"
              triggerClassName="bolt-chatbox-toolbar-button"
            />

            {/* Agent/Assistant mode selector. The Plan-first toggle moved up beside
                the effort/Power control (Replit parity), so it no longer lives here. */}
            {props.projectIdeMode && props.agentMode && props.setAgentMode ? (
              <ChatBoxModeDropdown
                agentMode={props.agentMode}
                setAgentMode={props.setAgentMode}
                disabled={props.isStreaming}
              />
            ) : null}

            <div ref={toolsMenuRef} className="bolt-chatbox-tools-menu-anchor">
              <IconButton
                title="More composer & tools"
                tooltip="More composer & tools"
                className={classNames('bolt-chatbox-toolbar-button', isToolsMenuOpen ? 'is-active' : undefined)}
                ariaExpanded={isToolsMenuOpen}
                ariaHasPopup="menu"
                onClick={() => setIsToolsMenuOpen((open) => !open)}
              >
                <div className="i-ph:dots-three-outline text-xl" />
              </IconButton>

              {isToolsMenuOpen ? (
                <div
                  className="bolt-chatbox-tools-menu"
                  role="menu"
                  aria-label="Composer tools"
                  data-testid="composer-tools-menu"
                >
                  <ColorSchemeDialog
                    designScheme={props.designScheme}
                    setDesignScheme={props.setDesignScheme}
                    triggerVariant="menu"
                    triggerLabel="Design palette"
                  />
                  <McpTools triggerVariant="menu" triggerLabel="MCP tools" />
                  <WebSearch
                    onSearchResult={(result) => props.onWebSearchResult?.(result)}
                    disabled={props.isStreaming}
                    triggerVariant="menu"
                    triggerLabel="Fetch URL"
                  />
                  <SupabaseConnection triggerVariant="menu" onOpen={() => setIsToolsMenuOpen(false)} />
                  <IconButton
                    title={enhancePromptTitle}
                    tooltip={enhancePromptTitle}
                    disabled={props.input.length === 0 || props.enhancingPrompt}
                    className={classNames('bolt-chatbox-tools-menu-item', props.enhancingPrompt ? 'opacity-100' : '')}
                    onClick={enhancePrompt}
                  >
                    <>
                      {props.enhancingPrompt ? (
                        <div className="i-svg-spinners:90-ring-with-bg text-bolt-elements-loader-progress text-xl animate-spin"></div>
                      ) : (
                        <div className="i-bolt:stars text-xl"></div>
                      )}
                      <span>Enhance prompt</span>
                    </>
                  </IconButton>

                  {/* In the IDE the mic is surfaced directly on the composer bar
                      (Replit parity), so it's omitted from this menu to avoid a
                      duplicate; the standalone composer keeps it here. */}
                  {!props.projectIdeMode ? (
                    <SpeechRecognitionButton
                      isListening={props.isListening}
                      onStart={() => {
                        props.startListening();
                        setIsToolsMenuOpen(false);
                      }}
                      onStop={() => {
                        props.stopListening();
                        setIsToolsMenuOpen(false);
                      }}
                      disabled={props.isStreaming}
                      triggerVariant="menu"
                      triggerLabel={props.isListening ? 'Stop speech' : 'Speech'}
                    />
                  ) : null}

                  {props.chatStarted && !props.projectIdeMode ? (
                    <IconButton
                      title="Discuss"
                      tooltip="Discuss"
                      className={classNames('bolt-chatbox-tools-menu-item', {
                        'is-active': props.chatMode === 'discuss',
                      })}
                      onClick={toggleChatMode}
                    >
                      <>
                        <div className="i-ph:chats text-xl" />
                        <span>{props.chatMode === 'discuss' ? 'Switch to build' : 'Discuss'}</span>
                      </>
                    </IconButton>
                  ) : null}

                  <IconButton
                    title={settingsToggleTitle}
                    tooltip={settingsToggleTitle}
                    data-testid="composer-tools-menu-settings"
                    className={classNames('bolt-chatbox-tools-menu-item', {
                      'is-active': props.isModelSettingsCollapsed,
                    })}
                    onClick={toggleModelSettings}
                    disabled={!props.providerList || props.providerList.length === 0}
                  >
                    <>
                      <div className={`i-ph:caret-${props.isModelSettingsCollapsed ? 'right' : 'down'} text-lg`} />
                      <span>{settingsToggleTitle}</span>
                    </>
                  </IconButton>
                </div>
              ) : null}
            </div>
          </div>

          <div className="bolt-chatbox-toolbar-secondary">
            <IconButton
              title="Composer shortcuts"
              tooltip="Shift + Return inserts a new line"
              tooltipLocked
              className="bolt-chatbox-toolbar-button bolt-chatbox-toolbar-info"
            >
              <div className="i-ph:info text-lg" />
            </IconButton>
            {props.projectIdeMode ? (
              <ClientOnly>
                {() => (
                  <SendButton
                    show={showSendButton}
                    isStreaming={props.isStreaming}
                    disabled={isSendButtonDisabled}
                    variant="toolbar"
                    onClick={(event) => {
                      if (props.isStreaming) {
                        props.handleStop?.();
                        return;
                      }

                      if (props.input.length > 0 || props.uploadedFiles.length > 0) {
                        props.handleSendMessage?.(event);
                      }
                    }}
                  />
                )}
              </ClientOnly>
            ) : null}
          </div>
          <ExpoQrModal open={props.qrModalOpen} onClose={() => props.setQrModalOpen(false)} />
        </div>
      </div>
    </div>
  );
};
