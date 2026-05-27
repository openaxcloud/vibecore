/* eslint-disable import/order */
import React from 'react';
import { toast } from 'react-toastify';
import { ClientOnly } from 'remix-utils/client-only';
import { APIKeyManager } from './APIKeyManager';
import { ComposerMentionsOverlay } from './ComposerMentionsOverlay';
import { ComposerSlashOverlay } from './ComposerSlashOverlay';
import { SpeechRecognitionButton } from '~/components/chat/SpeechRecognition';
import styles from './BaseChat.module.scss';
import FilePreview from './FilePreview';
import type { ProviderInfo } from '~/types/model';
import type { DesignScheme } from '~/types/design-scheme';
import type { ElementInfo } from '~/components/workbench/Inspector';
import { McpTools } from './MCPTools';
import { ScreenshotStateManager } from './ScreenshotStateManager';
import { SendButton } from './SendButton.client';
import { SupabaseConnection } from './SupabaseConnection';
import { WebSearch } from './WebSearch.client';
import { ModelSelector } from '~/components/chat/ModelSelector';
import { ColorSchemeDialog } from '~/components/ui/ColorSchemeDialog';
import { IconButton } from '~/components/ui/IconButton';
import { ExpoQrModal } from '~/components/workbench/ExpoQrModal';
import { LOCAL_PROVIDERS } from '~/lib/stores/settings';
import { classNames } from '~/utils/classNames';
import { PROVIDER_LIST } from '~/utils/constants';
import { normalizeModelList } from './modelList';

interface ChatBoxProps {
  isModelSettingsCollapsed: boolean;
  setIsModelSettingsCollapsed: (collapsed: boolean) => void;
  provider: any;
  providerList?: any[] | null;
  modelList?: any[] | null;
  apiKeys: Record<string, string>;
  isModelLoading: string | undefined;
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
  setUploadedFiles?: ((files: File[]) => void) | undefined;
  setImageDataList?: ((dataList: string[]) => void) | undefined;
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
  placeholder?: string;

  /** Project id used by the composer overlays to persist MRU palettes. */
  projectId?: string;

  /** MRU file paths from projectIdeMemory; boosts ranking in @-palette. */
  recentMentionedFilePaths?: readonly string[];

  /** MRU slash command ids from projectIdeMemory; boosts ranking in /-palette. */
  recentSlashCommandIds?: readonly string[];
}

export const ChatBox: React.FC<ChatBoxProps> = (props) => {
  const modelList = normalizeModelList(props.modelList);
  const providerList = Array.isArray(props.providerList) ? props.providerList : (PROVIDER_LIST as ProviderInfo[]);

  const hasComposerPayload = props.input.trim().length > 0 || props.uploadedFiles.length > 0;
  const showSendButton = props.projectIdeMode ? !props.isStreaming : hasComposerPayload || props.isStreaming;

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
              <ModelSelector
                key={`${props.provider?.name ?? 'provider'}:${modelList.length}`}
                model={props.model}
                setModel={props.setModel}
                modelList={modelList}
                provider={props.provider}
                setProvider={props.setProvider}
                providerList={providerList}
                apiKeys={props.apiKeys}
                modelLoading={props.isModelLoading}
              />
              {providerList.length > 0 && props.provider && !LOCAL_PROVIDERS.includes(props.provider.name) && (
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
        className={classNames('relative shadow-xs border border-bolt-elements-borderColor backdrop-blur rounded-lg')}
      >
        <div className="bolt-chatbox-input-frame relative">
          <textarea
            ref={props.textareaRef}
            aria-label={props.projectIdeMode ? 'Agent prompt' : 'Chat prompt'}
            className={classNames(
              'block w-full pl-4 pt-4 pr-16 pb-14 outline-none resize-none text-bolt-elements-textPrimary placeholder-bolt-elements-textTertiary bg-transparent text-sm',
              'transition-all duration-200',
              'hover:border-bolt-elements-focus',
            )}
            onDragEnter={(e) => {
              e.preventDefault();
              e.currentTarget.style.border = '2px solid #1488fc';
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.currentTarget.style.border = '2px solid #1488fc';
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
                    props.setUploadedFiles?.([...props.uploadedFiles, file]);
                    props.setImageDataList?.([...props.imageDataList, base64Image]);
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

                event.preventDefault();

                if (props.isStreaming) {
                  props.handleStop?.();
                  return;
                }

                // ignore if using input method engine
                if (event.nativeEvent.isComposing) {
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
              (props.chatMode === 'build' ? 'How can Bolt help you today?' : 'What would you like to discuss?')
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
        </div>
        <div className="flex justify-between items-center text-sm p-4 pt-2">
          <div className="flex gap-1 items-center">
            <ColorSchemeDialog designScheme={props.designScheme} setDesignScheme={props.setDesignScheme} />
            <McpTools />
            <IconButton title="Upload file" className="transition-all" onClick={() => props.handleFileUpload()}>
              <div className="i-ph:paperclip text-xl"></div>
            </IconButton>
            <WebSearch onSearchResult={(result) => props.onWebSearchResult?.(result)} disabled={props.isStreaming} />
            <IconButton
              title={enhancePromptTitle}
              disabled={props.input.length === 0 || props.enhancingPrompt}
              className={classNames('transition-all', props.enhancingPrompt ? 'opacity-100' : '')}
              onClick={() => {
                props.enhancePrompt?.();
                toast.success('Prompt enhanced!');
              }}
            >
              {props.enhancingPrompt ? (
                <div className="i-svg-spinners:90-ring-with-bg text-bolt-elements-loader-progress text-xl animate-spin"></div>
              ) : (
                <div className="i-bolt:stars text-xl"></div>
              )}
            </IconButton>

            <SpeechRecognitionButton
              isListening={props.isListening}
              onStart={props.startListening}
              onStop={props.stopListening}
              disabled={props.isStreaming}
            />
            {props.chatStarted && !props.projectIdeMode && (
              <IconButton
                title="Discuss"
                className={classNames(
                  'transition-all flex items-center gap-1 px-1.5',
                  props.chatMode === 'discuss'
                    ? '!bg-bolt-elements-item-backgroundAccent !text-bolt-elements-item-contentAccent'
                    : 'bg-bolt-elements-item-backgroundDefault text-bolt-elements-item-contentDefault',
                )}
                onClick={() => {
                  props.setChatMode?.(props.chatMode === 'discuss' ? 'build' : 'discuss');
                }}
              >
                <div className={`i-ph:chats text-xl`} />
                {props.chatMode === 'discuss' ? <span>Discuss</span> : <span />}
              </IconButton>
            )}
            <IconButton
              title={settingsToggleTitle}
              className={classNames('transition-all flex items-center gap-1', {
                'bg-bolt-elements-item-backgroundAccent text-bolt-elements-item-contentAccent':
                  props.isModelSettingsCollapsed,
                'bg-bolt-elements-item-backgroundDefault text-bolt-elements-item-contentDefault':
                  !props.isModelSettingsCollapsed,
              })}
              onClick={() => props.setIsModelSettingsCollapsed(!props.isModelSettingsCollapsed)}
              disabled={!props.providerList || props.providerList.length === 0}
            >
              <div className={`i-ph:caret-${props.isModelSettingsCollapsed ? 'right' : 'down'} text-lg`} />
              {props.isModelSettingsCollapsed && !props.projectIdeMode ? (
                <span className="text-xs">{props.model}</span>
              ) : (
                <span className="sr-only">{settingsToggleTitle}</span>
              )}
            </IconButton>
          </div>
          {props.input.length > 3 ? (
            <div className="text-xs text-bolt-elements-textTertiary">
              Use <kbd className="kdb px-1.5 py-0.5 rounded bg-bolt-elements-background-depth-2">Shift</kbd> +{' '}
              <kbd className="kdb px-1.5 py-0.5 rounded bg-bolt-elements-background-depth-2">Return</kbd> a new line
            </div>
          ) : null}
          <SupabaseConnection />
          <ExpoQrModal open={props.qrModalOpen} onClose={() => props.setQrModalOpen(false)} />
        </div>
      </div>
    </div>
  );
};
