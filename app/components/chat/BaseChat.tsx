/*
 * @ts-nocheck
 * Preventing TS checks with files presented in the video for a better presentation.
 */
import type { JSONValue, Message } from 'ai';
import React, { type RefCallback, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ClientOnly } from 'remix-utils/client-only';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { EditorAdapter } from '@vibecore/editor';
import { Menu } from '~/components/sidebar/Menu.client';
import { Workbench } from '~/components/workbench/Workbench.client';
import { Preview } from '~/components/workbench/Preview';
import { FileTree } from '~/components/workbench/FileTree';
import { Search } from '~/components/workbench/Search';
import { LockManager } from '~/components/workbench/LockManager';
import { workbenchStore } from '~/lib/stores/workbench';
import { themeStore } from '~/lib/stores/theme';
import { classNames } from '~/utils/classNames';
import { PROVIDER_LIST, WORK_DIR } from '~/utils/constants';
import { Messages } from './Messages.client';
import { getApiKeysFromCookies } from './APIKeyManager';
import Cookies from 'js-cookie';
import * as Tooltip from '@radix-ui/react-tooltip';
import styles from './BaseChat.module.scss';
import { ImportButtons } from '~/components/chat/chatExportAndImport/ImportButtons';
import { ExamplePrompts } from '~/components/chat/ExamplePrompts';
import GitCloneButton from './GitCloneButton';
import type { ProviderInfo } from '~/types/model';
import StarterTemplates from './StarterTemplates';
import type { ActionAlert, SupabaseAlert, DeployAlert, LlmErrorAlertType } from '~/types/actions';
import DeployChatAlert from '~/components/deploy/DeployAlert';
import ChatAlert from './ChatAlert';
import type { ModelInfo } from '~/lib/modules/llm/types';
import ProgressCompilation from './ProgressCompilation';
import type { ProgressAnnotation } from '~/types/context';
import { SupabaseChatAlert } from '~/components/chat/SupabaseAlert';
import { expoUrlAtom } from '~/lib/stores/qrCodeStore';
import { useStore } from '@nanostores/react';
import { StickToBottom, useStickToBottomContext } from '~/lib/hooks';
import { ChatBox } from './ChatBox';
import type { DesignScheme } from '~/types/design-scheme';
import type { ElementInfo } from '~/components/workbench/Inspector';
import LlmErrorAlert from './LLMApiAlert';
import { useResponsiveLayout } from '@vibecore/editor';
import { getProjectIdeMemory, saveProjectIdeMemory } from '~/lib/persistence/projectIdeMemory';
import { useSearchParams } from '@remix-run/react';

const TEXTAREA_MIN_HEIGHT = 76;

interface BaseChatProps {
  textareaRef?: React.RefObject<HTMLTextAreaElement> | undefined;
  messageRef?: RefCallback<HTMLDivElement> | undefined;
  scrollRef?: RefCallback<HTMLDivElement> | undefined;
  showChat?: boolean;
  chatStarted?: boolean;
  isStreaming?: boolean;
  onStreamingChange?: (streaming: boolean) => void;
  messages?: Message[];
  description?: string;
  enhancingPrompt?: boolean;
  promptEnhanced?: boolean;
  input?: string;
  model?: string;
  setModel?: (model: string) => void;
  provider?: ProviderInfo;
  setProvider?: (provider: ProviderInfo) => void;
  providerList?: ProviderInfo[];
  handleStop?: () => void;
  sendMessage?: (event: React.UIEvent, messageInput?: string) => void;
  handleInputChange?: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  enhancePrompt?: () => void;
  importChat?: (description: string, messages: Message[]) => Promise<void>;
  exportChat?: () => void;
  uploadedFiles?: File[];
  setUploadedFiles?: (files: File[]) => void;
  imageDataList?: string[];
  setImageDataList?: (dataList: string[]) => void;
  actionAlert?: ActionAlert;
  clearAlert?: () => void;
  supabaseAlert?: SupabaseAlert;
  clearSupabaseAlert?: () => void;
  deployAlert?: DeployAlert;
  clearDeployAlert?: () => void;
  llmErrorAlert?: LlmErrorAlertType;
  clearLlmErrorAlert?: () => void;
  data?: JSONValue[] | undefined;
  chatMode?: 'discuss' | 'build';
  setChatMode?: (mode: 'discuss' | 'build') => void;
  append?: (message: Message) => void;
  designScheme?: DesignScheme;
  setDesignScheme?: (scheme: DesignScheme) => void;
  selectedElement?: ElementInfo | null;
  setSelectedElement?: (element: ElementInfo | null) => void;
  addToolResult?: ({ toolCallId, result }: { toolCallId: string; result: any }) => void;
  onWebSearchResult?: (result: string) => void;
  projectIdeMode?: boolean;
  projectId?: string;
}

export const BaseChat = React.forwardRef<HTMLDivElement, BaseChatProps>(
  (
    {
      textareaRef,
      showChat = true,
      chatStarted = false,
      isStreaming = false,
      onStreamingChange,
      model,
      setModel,
      provider,
      setProvider,
      providerList,
      input = '',
      enhancingPrompt,
      handleInputChange,

      // promptEnhanced,
      enhancePrompt,
      sendMessage,
      handleStop,
      importChat,
      exportChat,
      uploadedFiles = [],
      setUploadedFiles,
      imageDataList = [],
      setImageDataList,
      messages,
      actionAlert,
      clearAlert,
      deployAlert,
      clearDeployAlert,
      supabaseAlert,
      clearSupabaseAlert,
      llmErrorAlert,
      clearLlmErrorAlert,
      data,
      chatMode,
      setChatMode,
      append,
      designScheme,
      setDesignScheme,
      selectedElement,
      setSelectedElement,
      addToolResult = () => {
        throw new Error('addToolResult not implemented');
      },
      onWebSearchResult,
      projectIdeMode = false,
      projectId,
    },
    ref,
  ) => {
    const TEXTAREA_MAX_HEIGHT = chatStarted ? 400 : 200;
    const [searchParams] = useSearchParams();
    const layout = useResponsiveLayout();
    const useMobileIde = layout.isMobile || layout.isTabletPortrait;
    const [mobilePanel, setMobilePanel] = useState<'chat' | 'files' | 'editor' | 'terminal' | 'preview' | 'deploy'>(
      'chat',
    );
    const [isOnline, setIsOnline] = useState(true);
    const [showNotifications, setShowNotifications] = useState(false);
    const [apiKeys, setApiKeys] = useState<Record<string, string>>(getApiKeysFromCookies());
    const [modelList, setModelList] = useState<ModelInfo[]>([]);
    const [isModelSettingsCollapsed, setIsModelSettingsCollapsed] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [recognition, setRecognition] = useState<SpeechRecognition | null>(null);
    const [transcript, setTranscript] = useState('');
    const [isModelLoading, setIsModelLoading] = useState<string | undefined>('all');
    const [progressAnnotations, setProgressAnnotations] = useState<ProgressAnnotation[]>([]);
    const expoUrl = useStore(expoUrlAtom);
    const [qrModalOpen, setQrModalOpen] = useState(false);
    const projectFiles = useStore(workbenchStore.files);
    const selectedFile = useStore(workbenchStore.selectedFile);
    const currentView = useStore(workbenchStore.currentView);
    const currentDocument = useStore(workbenchStore.currentDocument);
    const unsavedFiles = useStore(workbenchStore.unsavedFiles);
    const theme = useStore(themeStore);
    const [rightPanel, setRightPanel] = useState<'files' | 'search' | 'locks'>('files');
    const [projectStateReady, setProjectStateReady] = useState(!projectIdeMode || !projectId);
    const restoredProjectId = useRef<string | undefined>(undefined);
    const pendingProjectSelectedFile = useRef<string | undefined>(undefined);
    const activeProjectPanel = searchParams.get('panel') || 'editor';
    const isManagementPanel = [
      'overview',
      'deployments',
      'env',
      'secrets',
      'git',
      'activity',
      'logs',
      'collaborators',
      'domains',
      'snapshots',
      'settings',
    ].includes(activeProjectPanel);

    const firstProjectFile = useMemo(() => {
      return Object.entries(projectFiles).find(([, file]) => file?.type === 'file')?.[0];
    }, [projectFiles]);

    const projectPanelLayout = useMemo(() => {
      if (layout.isTabletLandscape) {
        return {
          agent: { defaultSize: 31, minSize: 24, maxSize: 42 },
          workspace: { defaultSize: 45, minSize: 34 },
          files: { defaultSize: 24, minSize: 20, maxSize: 32 },
        };
      }

      return {
        agent: { defaultSize: 32, minSize: 22, maxSize: 44 },
        workspace: { defaultSize: 45, minSize: 32 },
        files: { defaultSize: 23, minSize: 18, maxSize: 34 },
      };
    }, [layout.isTabletLandscape]);

    useEffect(() => {
      setProjectStateReady(!projectIdeMode || !projectId);
      restoredProjectId.current = undefined;
      pendingProjectSelectedFile.current = undefined;
    }, [projectIdeMode, projectId]);

    useEffect(() => {
      workbenchStore.setDocuments(projectFiles);
    }, [projectFiles]);

    useEffect(() => {
      if (!projectIdeMode || !projectId || restoredProjectId.current === projectId) {
        return undefined;
      }

      let cancelled = false;
      restoredProjectId.current = projectId;

      getProjectIdeMemory(projectId)
        .then((memory) => {
          if (cancelled) {
            return;
          }

          const ui = memory.ui;

          if (ui?.rightPanel && ['files', 'search', 'locks'].includes(ui.rightPanel)) {
            setRightPanel(ui.rightPanel);
          }

          if (
            ui?.mobilePanel &&
            ['chat', 'files', 'editor', 'terminal', 'preview', 'deploy'].includes(ui.mobilePanel)
          ) {
            setMobilePanel(ui.mobilePanel);
          }

          if (ui?.currentView) {
            workbenchStore.currentView.set(ui.currentView as any);
          }

          if (typeof ui?.showWorkbench === 'boolean') {
            workbenchStore.setShowWorkbench(ui.showWorkbench);
          } else {
            workbenchStore.setShowWorkbench(true);
          }

          if (ui?.selectedFile) {
            if (projectFiles[ui.selectedFile]?.type === 'file') {
              workbenchStore.setSelectedFile(ui.selectedFile);
              pendingProjectSelectedFile.current = undefined;
            } else {
              pendingProjectSelectedFile.current = ui.selectedFile;
            }
          }
        })
        .catch((error) => {
          console.error('Failed to restore project IDE state', error);
        })
        .finally(() => {
          if (!cancelled) {
            setProjectStateReady(true);
          }
        });

      return () => {
        cancelled = true;
      };
    }, [projectFiles, projectIdeMode, projectId]);

    useEffect(() => {
      const pendingSelectedFile = pendingProjectSelectedFile.current;

      if (!projectIdeMode || !pendingSelectedFile || projectFiles[pendingSelectedFile]?.type !== 'file') {
        return;
      }

      workbenchStore.setSelectedFile(pendingSelectedFile);
      pendingProjectSelectedFile.current = undefined;
    }, [projectFiles, projectIdeMode]);

    useEffect(() => {
      if (!projectIdeMode || !projectStateReady || selectedFile || !firstProjectFile) {
        return;
      }

      workbenchStore.setSelectedFile(firstProjectFile);
      workbenchStore.currentView.set('code');
      workbenchStore.setShowWorkbench(true);
    }, [firstProjectFile, projectIdeMode, projectStateReady, selectedFile]);

    useEffect(() => {
      if (!projectIdeMode || !projectId || !projectStateReady) {
        return undefined;
      }

      const saveTimer = window.setTimeout(() => {
        saveProjectIdeMemory(projectId, {
          ui: {
            selectedFile,
            currentView,
            rightPanel,
            mobilePanel,
            showWorkbench: true,
          },
        }).catch((error) => {
          console.error('Failed to persist project IDE state', error);
        });
      }, 400);

      return () => window.clearTimeout(saveTimer);
    }, [projectIdeMode, projectId, projectStateReady, selectedFile, currentView, rightPanel, mobilePanel]);

    const onProjectEditorSave = useCallback(() => {
      workbenchStore.saveCurrentDocument().catch(() => undefined);
    }, []);

    useEffect(() => {
      if (expoUrl) {
        setQrModalOpen(true);
      }
    }, [expoUrl]);

    useEffect(() => {
      if (data) {
        const progressList = data.filter(
          (x) => typeof x === 'object' && (x as any).type === 'progress',
        ) as ProgressAnnotation[];
        setProgressAnnotations(progressList);
      }
    }, [data]);
    useEffect(() => {
      console.log(transcript);
    }, [transcript]);

    useEffect(() => {
      onStreamingChange?.(isStreaming);
    }, [isStreaming, onStreamingChange]);

    useEffect(() => {
      const updateOnlineState = () => setIsOnline(navigator.onLine);
      updateOnlineState();
      window.addEventListener('online', updateOnlineState);
      window.addEventListener('offline', updateOnlineState);

      return () => {
        window.removeEventListener('online', updateOnlineState);
        window.removeEventListener('offline', updateOnlineState);
      };
    }, []);

    useEffect(() => {
      if (!useMobileIde) {
        return undefined;
      }

      const panels: Array<typeof mobilePanel> = ['chat', 'files', 'editor', 'terminal', 'preview', 'deploy'];
      const onKeyDown = (event: KeyboardEvent) => {
        const index = Number(event.key) - 1;

        if ((event.metaKey || event.ctrlKey) && index >= 0 && index < panels.length) {
          event.preventDefault();
          setMobilePanel(panels[index]);

          if (panels[index] !== 'chat') {
            workbenchStore.setShowWorkbench(true);
          }
        }
      };

      window.addEventListener('keydown', onKeyDown);

      return () => window.removeEventListener('keydown', onKeyDown);
    }, [mobilePanel, useMobileIde]);

    useEffect(() => {
      if (typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;

        recognition.onresult = (event) => {
          const transcript = Array.from(event.results)
            .map((result) => result[0])
            .map((result) => result.transcript)
            .join('');

          setTranscript(transcript);

          if (handleInputChange) {
            const syntheticEvent = {
              target: { value: transcript },
            } as React.ChangeEvent<HTMLTextAreaElement>;
            handleInputChange(syntheticEvent);
          }
        };

        recognition.onerror = (event) => {
          console.error('Speech recognition error:', event.error);
          setIsListening(false);
        };

        setRecognition(recognition);
      }
    }, []);

    useEffect(() => {
      if (typeof window !== 'undefined') {
        let parsedApiKeys: Record<string, string> | undefined = {};

        try {
          parsedApiKeys = getApiKeysFromCookies();
          setApiKeys(parsedApiKeys);
        } catch (error) {
          console.error('Error loading API keys from cookies:', error);
          Cookies.remove('apiKeys');
        }

        setIsModelLoading('all');
        fetch('/api/models')
          .then((response) => response.json())
          .then((data) => {
            const typedData = data as { modelList: ModelInfo[] };
            setModelList(typedData.modelList);
          })
          .catch((error) => {
            console.error('Error fetching model list:', error);
          })
          .finally(() => {
            setIsModelLoading(undefined);
          });
      }
    }, [providerList, provider]);

    const onApiKeysChange = async (providerName: string, apiKey: string) => {
      const newApiKeys = { ...apiKeys, [providerName]: apiKey };
      setApiKeys(newApiKeys);
      Cookies.set('apiKeys', JSON.stringify(newApiKeys));

      setIsModelLoading(providerName);

      let providerModels: ModelInfo[] = [];

      try {
        const response = await fetch(`/api/models/${encodeURIComponent(providerName)}`);
        const data = await response.json();
        providerModels = (data as { modelList: ModelInfo[] }).modelList;
      } catch (error) {
        console.error('Error loading dynamic models for:', providerName, error);
      }

      // Only update models for the specific provider
      setModelList((prevModels) => {
        const otherModels = prevModels.filter((model) => model.provider !== providerName);
        return [...otherModels, ...providerModels];
      });
      setIsModelLoading(undefined);
    };

    const startListening = () => {
      if (recognition) {
        recognition.start();
        setIsListening(true);
      }
    };

    const stopListening = () => {
      if (recognition) {
        recognition.stop();
        setIsListening(false);
      }
    };

    const handleSendMessage = (event: React.UIEvent, messageInput?: string) => {
      if (sendMessage) {
        sendMessage(event, messageInput);
        setSelectedElement?.(null);

        if (recognition) {
          recognition.abort(); // Stop current recognition
          setTranscript(''); // Clear transcript
          setIsListening(false);

          // Clear the input by triggering handleInputChange with empty value
          if (handleInputChange) {
            const syntheticEvent = {
              target: { value: '' },
            } as React.ChangeEvent<HTMLTextAreaElement>;
            handleInputChange(syntheticEvent);
          }
        }
      }
    };

    const handleFileUpload = () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';

      input.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];

        if (file) {
          const reader = new FileReader();

          reader.onload = (e) => {
            const base64Image = e.target?.result as string;
            setUploadedFiles?.([...uploadedFiles, file]);
            setImageDataList?.([...imageDataList, base64Image]);
          };
          reader.readAsDataURL(file);
        }
      };

      input.click();
    };

    const handlePaste = async (e: React.ClipboardEvent) => {
      const items = e.clipboardData?.items;

      if (!items) {
        return;
      }

      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();

          const file = item.getAsFile();

          if (file) {
            const reader = new FileReader();

            reader.onload = (e) => {
              const base64Image = e.target?.result as string;
              setUploadedFiles?.([...uploadedFiles, file]);
              setImageDataList?.([...imageDataList, base64Image]);
            };
            reader.readAsDataURL(file);
          }

          break;
        }
      }
    };

    const agentPanel = (
      <div
        data-testid="ide-agent-panel"
        className={classNames(styles.Chat, 'flex h-full min-h-0 flex-col flex-grow', {
          'lg:min-w-[var(--chat-min-width)]': !projectIdeMode,
          'min-w-0 overflow-hidden bolt-project-agent-panel': projectIdeMode,
          hidden: useMobileIde && mobilePanel !== 'chat',
        })}
      >
        {!chatStarted && (
          <div id="intro" className="mt-[16vh] max-w-2xl mx-auto text-center px-4 lg:px-0">
            <h1 className="text-3xl lg:text-6xl font-bold text-bolt-elements-textPrimary mb-4 animate-fade-in">
              Where ideas begin
            </h1>
            <p className="text-md lg:text-xl mb-8 text-bolt-elements-textSecondary animate-fade-in animation-delay-200">
              Bring ideas to life in seconds or get help on existing projects.
            </p>
          </div>
        )}
        <StickToBottom
          className={classNames('pt-6 px-2 sm:px-6 relative', {
            'h-full flex flex-col modern-scrollbar': chatStarted,
          })}
          resize="smooth"
          initial="smooth"
        >
          <StickToBottom.Content className="flex flex-col gap-4 relative ">
            <ClientOnly>
              {() => {
                return chatStarted ? (
                  <Messages
                    className="flex flex-col w-full flex-1 max-w-chat pb-4 mx-auto z-1"
                    messages={messages}
                    isStreaming={isStreaming}
                    append={append}
                    chatMode={chatMode}
                    setChatMode={setChatMode}
                    provider={provider}
                    model={model}
                    addToolResult={addToolResult}
                  />
                ) : null;
              }}
            </ClientOnly>
            <ScrollToBottom />
          </StickToBottom.Content>
          <div
            className={classNames('my-auto flex flex-col gap-2 w-full max-w-chat mx-auto z-prompt mb-6', {
              'sticky bottom-2': chatStarted,
            })}
          >
            <div className="flex flex-col gap-2">
              {deployAlert && (
                <DeployChatAlert
                  alert={deployAlert}
                  clearAlert={() => clearDeployAlert?.()}
                  postMessage={(message: string | undefined) => {
                    sendMessage?.({} as any, message);
                    clearSupabaseAlert?.();
                  }}
                />
              )}
              {supabaseAlert && (
                <SupabaseChatAlert
                  alert={supabaseAlert}
                  clearAlert={() => clearSupabaseAlert?.()}
                  postMessage={(message) => {
                    sendMessage?.({} as any, message);
                    clearSupabaseAlert?.();
                  }}
                />
              )}
              {actionAlert && (
                <ChatAlert
                  alert={actionAlert}
                  clearAlert={() => clearAlert?.()}
                  postMessage={(message) => {
                    sendMessage?.({} as any, message);
                    clearAlert?.();
                  }}
                />
              )}
              {llmErrorAlert && <LlmErrorAlert alert={llmErrorAlert} clearAlert={() => clearLlmErrorAlert?.()} />}
            </div>
            {progressAnnotations && <ProgressCompilation data={progressAnnotations} />}
            <ChatBox
              isModelSettingsCollapsed={isModelSettingsCollapsed}
              setIsModelSettingsCollapsed={setIsModelSettingsCollapsed}
              provider={provider}
              setProvider={setProvider}
              providerList={providerList || (PROVIDER_LIST as ProviderInfo[])}
              model={model}
              setModel={setModel}
              modelList={modelList}
              apiKeys={apiKeys}
              isModelLoading={isModelLoading}
              onApiKeysChange={onApiKeysChange}
              uploadedFiles={uploadedFiles}
              setUploadedFiles={setUploadedFiles}
              imageDataList={imageDataList}
              setImageDataList={setImageDataList}
              textareaRef={textareaRef}
              input={input}
              handleInputChange={handleInputChange}
              handlePaste={handlePaste}
              TEXTAREA_MIN_HEIGHT={TEXTAREA_MIN_HEIGHT}
              TEXTAREA_MAX_HEIGHT={TEXTAREA_MAX_HEIGHT}
              isStreaming={isStreaming}
              handleStop={handleStop}
              handleSendMessage={handleSendMessage}
              enhancingPrompt={enhancingPrompt}
              enhancePrompt={enhancePrompt}
              isListening={isListening}
              startListening={startListening}
              stopListening={stopListening}
              chatStarted={chatStarted}
              exportChat={exportChat}
              qrModalOpen={qrModalOpen}
              setQrModalOpen={setQrModalOpen}
              handleFileUpload={handleFileUpload}
              chatMode={chatMode}
              setChatMode={setChatMode}
              designScheme={designScheme}
              setDesignScheme={setDesignScheme}
              selectedElement={selectedElement}
              setSelectedElement={setSelectedElement}
              onWebSearchResult={onWebSearchResult}
            />
          </div>
        </StickToBottom>
        <div className="flex flex-col justify-center">
          {!chatStarted && (
            <div className="flex justify-center gap-2">
              {ImportButtons(importChat)}
              <GitCloneButton importChat={importChat} />
            </div>
          )}
          <div className="flex flex-col gap-5">
            {!chatStarted &&
              ExamplePrompts((event, messageInput) => {
                if (isStreaming) {
                  handleStop?.();
                  return;
                }

                handleSendMessage?.(event, messageInput);
              })}
            {!chatStarted && <StarterTemplates />}
          </div>
        </div>
      </div>
    );

    const projectIdePanels = (
      <PanelGroup direction="horizontal" className="bolt-project-ide-panels">
        <Panel
          defaultSize={projectPanelLayout.agent.defaultSize}
          minSize={projectPanelLayout.agent.minSize}
          maxSize={projectPanelLayout.agent.maxSize}
          className="min-w-0"
        >
          <section className="bolt-project-ide-panel" aria-label="AI agent">
            <div className="bolt-project-ide-panel-header">
              <span className="i-ph:sparkle" aria-hidden />
              <span>AI Agent</span>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden">{agentPanel}</div>
          </section>
        </Panel>
        <PanelResizeHandle className="bolt-project-ide-resize-handle" />
        <Panel
          defaultSize={projectPanelLayout.workspace.defaultSize}
          minSize={projectPanelLayout.workspace.minSize}
          className="min-w-0"
        >
          <section className="bolt-project-ide-panel" aria-label="Editor and preview">
            {isManagementPanel ? (
              <ProjectIdeServicePanel projectId={projectId} panel={activeProjectPanel} />
            ) : (
              <PanelGroup direction="vertical" className="min-h-0 flex-1">
                <Panel defaultSize={activeProjectPanel === 'preview' ? 35 : 54} minSize={28} className="min-h-0">
                  <div className="flex h-full min-h-0 flex-col">
                    <div className="bolt-project-ide-panel-header">
                      <span className="i-ph:code" aria-hidden />
                      <span>{currentDocument?.filePath?.replace(WORK_DIR, '') || 'Editor'}</span>
                      {currentDocument && unsavedFiles instanceof Set && unsavedFiles.has(currentDocument.filePath) && (
                        <button
                          type="button"
                          className="ml-auto rounded border border-bolt-elements-borderColor px-2 py-0.5 text-[11px] text-bolt-elements-textTertiary hover:text-bolt-elements-textPrimary"
                          onClick={onProjectEditorSave}
                        >
                          Save
                        </button>
                      )}
                    </div>
                    <div className="min-h-0 flex-1 overflow-hidden" data-testid="responsive-code-editor">
                      {currentDocument && !currentDocument.isBinary ? (
                        <EditorAdapter
                          className="h-full w-full"
                          value={currentDocument.value}
                          filePath={currentDocument.filePath}
                          theme={theme === 'dark' ? 'dark' : 'light'}
                          onSave={onProjectEditorSave}
                          onChange={(update) => {
                            workbenchStore.setCurrentDocumentContent(update.value);
                          }}
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center p-6 text-sm text-bolt-elements-textSecondary">
                          Select a source file from the project files panel.
                        </div>
                      )}
                    </div>
                  </div>
                </Panel>
                <PanelResizeHandle className="bolt-project-ide-resize-handle bolt-project-ide-resize-handle-vertical" />
                <Panel defaultSize={activeProjectPanel === 'preview' ? 65 : 46} minSize={24} className="min-h-0">
                  <div className="flex h-full min-h-0 flex-col">
                    <div className="bolt-project-ide-panel-header">
                      <span className="i-ph:browser" aria-hidden />
                      <span>Preview</span>
                      <span className="ml-auto rounded border border-bolt-elements-borderColor px-2 py-0.5 text-[11px] text-bolt-elements-textTertiary">
                        Live runtime
                      </span>
                    </div>
                    <div className="min-h-0 flex-1 overflow-hidden">
                      <Preview setSelectedElement={setSelectedElement} projectId={projectId} />
                    </div>
                  </div>
                </Panel>
              </PanelGroup>
            )}
          </section>
        </Panel>
        <PanelResizeHandle className="bolt-project-ide-resize-handle" />
        <Panel
          defaultSize={projectPanelLayout.files.defaultSize}
          minSize={projectPanelLayout.files.minSize}
          maxSize={projectPanelLayout.files.maxSize}
          className="min-w-0"
        >
          <section className="bolt-project-ide-panel" aria-label="Project files">
            <div className="bolt-project-ide-panel-header">
              {[
                ['files', 'Files'],
                ['search', 'Search'],
                ['locks', 'Locks'],
              ].map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className="bolt-project-ide-tab"
                  aria-current={rightPanel === id ? 'page' : undefined}
                  onClick={() => setRightPanel(id as typeof rightPanel)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
              {rightPanel === 'files' && (
                <FileTree
                  className="h-full"
                  files={projectFiles}
                  hideRoot
                  unsavedFiles={unsavedFiles}
                  rootFolder={WORK_DIR}
                  selectedFile={selectedFile}
                  onFileSelect={(filePath) => {
                    workbenchStore.setSelectedFile(filePath);
                    workbenchStore.currentView.set('code');
                    workbenchStore.setShowWorkbench(true);
                  }}
                />
              )}
              {rightPanel === 'search' && <Search />}
              {rightPanel === 'locks' && <LockManager />}
            </div>
          </section>
        </Panel>
      </PanelGroup>
    );

    const baseChat = (
      <div
        ref={ref}
        className={classNames(styles.BaseChat, 'relative flex h-full w-full overflow-hidden bolt-responsive-ide', {
          'bolt-responsive-ide-mobile': useMobileIde,
          'bolt-responsive-ide-tablet-landscape': layout.isTabletLandscape,
          'bolt-responsive-ide-desktop': layout.isDesktop,
        })}
        data-chat-visible={showChat}
        data-mobile-panel={mobilePanel}
      >
        <ClientOnly>{() => <Menu />}</ClientOnly>
        <div className="bolt-connection-status" role="status" aria-live="polite" data-online={isOnline}>
          {!isOnline ? 'Offline mode: edits stay local until the workspace connection returns.' : 'Connection healthy'}
        </div>
        <button
          type="button"
          className="bolt-notifications-button"
          aria-label="Notifications"
          aria-expanded={showNotifications}
          onClick={() => setShowNotifications((value) => !value)}
        >
          <span className="i-ph:bell" aria-hidden />
        </button>
        {showNotifications && (
          <aside className="bolt-notifications-center" aria-label="Notifications center">
            <div className="font-medium text-bolt-elements-textPrimary">Notifications</div>
            <div className="mt-2 rounded-md border border-bolt-elements-borderColor p-3 text-xs text-bolt-elements-textSecondary">
              Workspace, billing, deploy, and quota notifications appear here without interrupting the IDE.
            </div>
            {!isOnline && (
              <div className="mt-2 rounded-md border border-orange-500/40 bg-orange-500/10 p-3 text-xs text-orange-300">
                Poor connection detected. Terminal streams and preview refresh may pause.
              </div>
            )}
          </aside>
        )}
        <div
          className={classNames('flex w-full h-full min-h-0', {
            'overflow-hidden': projectIdeMode && !useMobileIde,
            'flex-col lg:flex-row overflow-y-auto': !projectIdeMode || useMobileIde,
          })}
        >
          {projectIdeMode && !useMobileIde ? (
            projectIdePanels
          ) : (
            <>
              {agentPanel}
              <ClientOnly>
                {() => (
                  <Workbench
                    chatStarted={chatStarted || useMobileIde}
                    isStreaming={isStreaming}
                    setSelectedElement={setSelectedElement}
                    mobilePanel={mobilePanel === 'chat' ? 'editor' : mobilePanel}
                    projectId={projectId}
                  />
                )}
              </ClientOnly>
            </>
          )}
        </div>
        <nav className="bolt-mobile-tabbar" aria-label="IDE panels">
          {[
            ['chat', 'i-ph:chat-circle-text', 'Chat'],
            ['files', 'i-ph:files', 'Files'],
            ['editor', 'i-ph:code', 'Editor'],
            ['terminal', 'i-ph:terminal-window', 'Terminal'],
            ['preview', 'i-ph:browser', 'Preview'],
            ['deploy', 'i-ph:rocket-launch', 'Deploy'],
          ].map(([id, icon, label]) => (
            <button
              key={id}
              type="button"
              aria-label={label}
              aria-current={mobilePanel === id ? 'page' : undefined}
              onClick={() => {
                setMobilePanel(id as typeof mobilePanel);

                if (id !== 'chat') {
                  workbenchStore.setShowWorkbench(true);
                }
              }}
            >
              <span className={icon} aria-hidden />
              <span>{id === 'deploy' ? 'Ship' : label}</span>
            </button>
          ))}
        </nav>
      </div>
    );

    return <Tooltip.Provider delayDuration={200}>{baseChat}</Tooltip.Provider>;
  },
);

function ProjectIdeServicePanel({ projectId, panel }: { projectId?: string; panel: string }) {
  const [payload, setPayload] = useState<any>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const title = panelTitle(panel);

  const loadPanel = useCallback(async () => {
    if (!projectId) {
      return;
    }

    setBusy(true);
    setError(undefined);

    try {
      const response = await fetch(`/api/projects/${projectId}/ide-panel/${panel}`, {
        headers: { accept: 'application/json' },
      });
      const result = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(result.error ?? 'Unable to load IDE panel');
      }

      setPayload(result);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to load IDE panel');
      setPayload(undefined);
    } finally {
      setBusy(false);
    }
  }, [panel, projectId]);

  useEffect(() => {
    void loadPanel();
  }, [loadPanel]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const form = event.currentTarget;

    if (!projectId) {
      return;
    }

    setBusy(true);
    setError(undefined);

    try {
      const response = await fetch(`/api/projects/${projectId}/ide-panel/${panel}`, {
        method: 'POST',
        body: new FormData(form),
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        throw new Error(result.error ?? 'Panel action failed');
      }

      form.reset();
      await loadPanel();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Panel action failed');
    } finally {
      setBusy(false);
    }
  }

  const data = payload?.data ?? {};
  const project = payload?.project ?? {};

  return (
    <div className="bolt-project-service-panel" data-testid="ide-service-panel" data-panel={panel}>
      <div className="bolt-project-ide-panel-header">
        <span className={panelIcon(panel)} aria-hidden />
        <h2 className="m-0 text-sm font-semibold">{title}</h2>
        <button
          type="button"
          className="ml-auto rounded border border-bolt-elements-borderColor px-2 py-0.5 text-[11px] text-bolt-elements-textTertiary hover:text-bolt-elements-textPrimary"
          onClick={() => void loadPanel()}
          disabled={busy}
        >
          {busy ? 'Loading' : 'Refresh'}
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        {error ? (
          <div className="mb-4 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {error}
          </div>
        ) : null}
        {busy && !payload ? (
          <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4 text-sm text-bolt-elements-textSecondary">
            Loading {title.toLowerCase()} from backend...
          </div>
        ) : (
          <ProjectIdePanelContent panel={panel} data={data} project={project} onSubmit={submit} busy={busy} />
        )}
      </div>
    </div>
  );
}

function ProjectIdePanelContent({
  panel,
  data,
  project,
  onSubmit,
  busy,
}: {
  panel: string;
  data: any;
  project: any;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  busy: boolean;
}) {
  if (panel === 'overview') {
    const rows = [
      ['Project', project.name ?? project.id],
      [
        'Workspace',
        data.workspace ? `${data.workspace.status} / ${data.workspace.runtimeMode}` : 'No workspace record',
      ],
      ['Files', String(data.files?.length ?? 0)],
      ['Branch', data.git?.branch ?? project.gitDefaultBranch ?? 'main'],
    ];

    return <PanelRows rows={rows} events={data.recentActivity} empty="No project activity yet." />;
  }

  if (panel === 'logs') {
    const lines = [
      data.workspace
        ? `workspace:${data.workspace.id} status=${data.workspace.status} runtime=${data.workspace.runtimeMode}`
        : 'workspace:none recorded for this project',
      ...(data.recentActivity ?? []).map((event: any) => `${event.createdAt ?? 'recorded'} ${event.action}`),
    ];

    return (
      <div className="rounded-lg border border-bolt-elements-borderColor bg-black p-4 font-mono text-xs text-green-200">
        {lines.map((line: string) => (
          <div key={line}>{line}</div>
        ))}
      </div>
    );
  }

  if (panel === 'snapshots') {
    const snapshots = data.snapshots ?? [];

    return (
      <div className="grid gap-4 xl:grid-cols-[1fr_280px]">
        <PanelRows
          rows={snapshots.map((snapshot: any) => [
            snapshot.label ?? snapshot.kind,
            `${snapshot.kind} - ${snapshot.byteLength ?? 0} bytes`,
          ])}
          empty="No snapshots yet."
        />
        <div className="grid gap-3">
          <form onSubmit={onSubmit} className="grid gap-3 rounded-lg border border-bolt-elements-borderColor p-3">
            <input name="intent" value="create" type="hidden" />
            <PanelInput name="label" placeholder="Manual checkpoint" />
            <PanelButton disabled={busy}>Create snapshot</PanelButton>
          </form>
          {snapshots.map((snapshot: any) => (
            <form key={snapshot.id} onSubmit={onSubmit}>
              <input name="intent" value="restore" type="hidden" />
              <input name="snapshotId" value={snapshot.id} type="hidden" />
              <PanelButton disabled={busy} variant="outline">
                Restore {snapshot.label ?? snapshot.id}
              </PanelButton>
            </form>
          ))}
        </div>
      </div>
    );
  }

  if (panel === 'deployments') {
    return (
      <PanelWithForm
        rows={(data.deployments ?? []).map((deployment: any) => [
          `${deployment.provider} ${deployment.status}`,
          deployment.url ?? deployment.createdAt ?? 'No URL recorded',
        ])}
        empty="No deployments yet."
        onSubmit={onSubmit}
        busy={busy}
        fields={[
          { name: 'provider', placeholder: 'preview' },
          { name: 'url', placeholder: 'https://preview.example.com' },
        ]}
        submitLabel="New deployment"
      />
    );
  }

  if (panel === 'env') {
    return (
      <PanelWithForm
        rows={(data.envVars ?? []).map((item: any) => [item.key, item.updatedAt ?? 'Stored in project metadata'])}
        empty="No environment variables."
        onSubmit={onSubmit}
        busy={busy}
        fields={[
          { name: 'key', placeholder: 'VITE_API_URL', required: true },
          { name: 'value', placeholder: 'https://api.example.com' },
        ]}
        submitLabel="Save variable"
      />
    );
  }

  if (panel === 'secrets') {
    return (
      <PanelWithForm
        rows={(data.secrets ?? []).map((secret: any) => [secret.key, secret.updatedAt ?? 'Encrypted project secret'])}
        empty="No project secrets."
        onSubmit={onSubmit}
        busy={busy}
        fields={[
          { name: 'key', placeholder: 'STRIPE_SECRET_KEY', required: true },
          { name: 'value', placeholder: 'Secret value', type: 'password', required: true },
        ]}
        submitLabel="Save secret"
      />
    );
  }

  if (panel === 'collaborators') {
    return (
      <PanelWithForm
        rows={(data.collaborators ?? []).map((collaborator: any) => [
          collaborator.userId,
          `Role: ${collaborator.roleKey}`,
        ])}
        empty="No project collaborators."
        onSubmit={onSubmit}
        busy={busy}
        fields={[{ name: 'userId', placeholder: 'User ID', required: true }]}
        select={{ name: 'roleKey', options: ['viewer', 'member', 'admin', 'owner'] }}
        submitLabel="Add collaborator"
      />
    );
  }

  if (panel === 'domains') {
    const domains = data.domains ?? [];

    return (
      <div className="grid gap-4 xl:grid-cols-[1fr_280px]">
        <PanelRows
          rows={domains.map((domain: any) => [
            domain.domain,
            domain.verifiedAt ? `Verified ${domain.verifiedAt}` : 'Pending DNS verification',
          ])}
          empty="No custom domains."
        />
        <div className="grid gap-3">
          <form onSubmit={onSubmit} className="grid gap-3 rounded-lg border border-bolt-elements-borderColor p-3">
            <PanelInput name="domain" placeholder="app.example.com" required />
            <PanelButton disabled={busy}>Add domain</PanelButton>
          </form>
          {domains.map((domain: any) => (
            <form key={domain.id} onSubmit={onSubmit}>
              <input name="intent" value="verify" type="hidden" />
              <input name="domain" value={domain.domain} type="hidden" />
              <PanelButton disabled={busy} variant="outline">
                Verify {domain.domain}
              </PanelButton>
            </form>
          ))}
        </div>
      </div>
    );
  }

  if (panel === 'git') {
    const status = data.status ?? data;
    const branch = status.branch ?? project.gitDefaultBranch ?? 'main';

    return (
      <div className="grid gap-4 xl:grid-cols-[1fr_300px]">
        <PanelRows
          rows={[
            ['Branch', branch],
            ['Changed files', String(status.changedFiles?.length ?? 0)],
            ['Ahead / behind', `${status.ahead ?? 0} / ${status.behind ?? 0}`],
            ['Remote', project.gitRepositoryUrl ?? 'No remote repository'],
          ]}
        />
        <div className="grid gap-3">
          <form onSubmit={onSubmit} className="grid gap-3 rounded-lg border border-bolt-elements-borderColor p-3">
            <input name="intent" value="commit" type="hidden" />
            <PanelInput name="message" placeholder="Commit message" />
            <PanelButton disabled={busy}>Commit changes</PanelButton>
          </form>
          {['pull', 'push'].map((intent) => (
            <form key={intent} onSubmit={onSubmit} className="flex gap-2">
              <input name="intent" value={intent} type="hidden" />
              <PanelInput name="branch" defaultValue={branch} />
              <PanelButton disabled={busy} variant="outline">
                {intent === 'pull' ? 'Pull' : 'Push'}
              </PanelButton>
            </form>
          ))}
        </div>
      </div>
    );
  }

  if (panel === 'settings') {
    const settings = data.project ?? project;

    return (
      <form onSubmit={onSubmit} className="grid max-w-2xl gap-3">
        <PanelInput name="name" defaultValue={settings.name ?? ''} required />
        <PanelInput name="description" defaultValue={settings.description ?? ''} />
        <PanelInput name="gitRepositoryUrl" defaultValue={settings.gitRepositoryUrl ?? ''} />
        <PanelInput name="gitDefaultBranch" defaultValue={settings.gitDefaultBranch ?? 'main'} />
        <div>
          <PanelButton disabled={busy}>Save settings</PanelButton>
        </div>
      </form>
    );
  }

  if (panel === 'activity') {
    return (
      <PanelRows
        rows={(data.activity ?? []).map((event: any) => [
          event.action,
          event.createdAt ? new Date(event.createdAt).toLocaleString() : 'Recorded by API',
        ])}
        empty="No activity yet."
      />
    );
  }

  return <PanelRows rows={[]} empty="Panel not available." />;
}

function PanelWithForm({ rows, empty, onSubmit, busy, fields, select, submitLabel }: any) {
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_280px]">
      <PanelRows rows={rows} empty={empty} />
      <form onSubmit={onSubmit} className="grid gap-3 rounded-lg border border-bolt-elements-borderColor p-3">
        {fields.map((field: any) => (
          <PanelInput key={field.name} {...field} />
        ))}
        {select ? (
          <select
            name={select.name}
            className="h-9 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-2 text-sm"
            defaultValue={select.options[1] ?? select.options[0]}
          >
            {select.options.map((option: string) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        ) : null}
        <PanelButton disabled={busy}>{submitLabel}</PanelButton>
      </form>
    </div>
  );
}

function PanelRows({ rows, events, empty }: { rows: any[]; events?: any[]; empty?: string }) {
  const normalized = rows.length
    ? rows
    : (events ?? []).map((event) => [
        event.action,
        event.createdAt ? new Date(event.createdAt).toLocaleString() : 'Recorded by API',
      ]);

  if (!normalized.length) {
    return (
      <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4 text-sm text-bolt-elements-textSecondary">
        {empty ?? 'No records.'}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2">
      {normalized.map(([title, detail], index) => (
        <div key={`${title}-${index}`} className="border-b border-bolt-elements-borderColor px-4 py-3 last:border-b-0">
          <div className="text-sm font-medium text-bolt-elements-textPrimary">{title}</div>
          <div className="mt-1 text-xs text-bolt-elements-textSecondary">{detail}</div>
        </div>
      ))}
    </div>
  );
}

function PanelInput(props: any) {
  return (
    <input
      {...props}
      className="h-9 min-w-0 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-2 text-sm outline-none focus:border-bolt-elements-focus"
    />
  );
}

function PanelButton({ children, variant, ...props }: any) {
  return (
    <button
      {...props}
      type="submit"
      className={classNames(
        'inline-flex h-9 items-center justify-center rounded-md px-3 text-sm font-medium disabled:opacity-60',
        variant === 'outline'
          ? 'border border-bolt-elements-borderColor text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3'
          : 'bg-bolt-elements-button-primary-background text-bolt-elements-button-primary-text',
      )}
    >
      {children}
    </button>
  );
}

function panelTitle(panel: string) {
  const titles: Record<string, string> = {
    overview: 'Overview',
    deployments: 'Deploy',
    env: 'Environment variables',
    secrets: 'Secrets',
    git: 'Git',
    activity: 'Activity',
    logs: 'Logs',
    collaborators: 'Collaborators',
    domains: 'Domains',
    snapshots: 'Snapshots',
    settings: 'Settings',
  };

  return titles[panel] ?? panel;
}

function panelIcon(panel: string) {
  const icons: Record<string, string> = {
    overview: 'i-ph:gauge',
    deployments: 'i-ph:rocket-launch',
    env: 'i-ph:brackets-curly',
    secrets: 'i-ph:lock',
    git: 'i-ph:git-branch',
    activity: 'i-ph:activity',
    logs: 'i-ph:terminal-window',
    collaborators: 'i-ph:users',
    domains: 'i-ph:globe',
    snapshots: 'i-ph:stack',
    settings: 'i-ph:gear',
  };

  return icons[panel] ?? 'i-ph:squares-four';
}

function ScrollToBottom() {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext();

  return (
    !isAtBottom && (
      <>
        <div className="sticky bottom-0 left-0 right-0 bg-gradient-to-t from-bolt-elements-background-depth-1 to-transparent h-20 z-10" />
        <button
          className="sticky z-50 bottom-0 left-0 right-0 text-4xl rounded-lg px-1.5 py-0.5 flex items-center justify-center mx-auto gap-2 bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor text-bolt-elements-textPrimary text-sm"
          onClick={() => scrollToBottom()}
        >
          Go to last message
          <span className="i-ph:arrow-down animate-bounce" />
        </button>
      </>
    )
  );
}
