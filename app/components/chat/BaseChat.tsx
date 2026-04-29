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
import { Link, useSearchParams } from '@remix-run/react';

const TEXTAREA_MIN_HEIGHT = 76;
const IDE_MANAGEMENT_PANELS = [
  'overview',
  'database',
  'object-storage',
  'packages',
  'monitoring',
  'extensions',
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
] as const;
const IDE_RIGHT_PANELS = ['files', 'search', 'locks'] as const;
const IDE_WORKSPACE_PANELS = ['editor', 'preview', ...IDE_MANAGEMENT_PANELS] as const;
const IDE_TOOL_DESCRIPTIONS: Record<IdeWorkspacePanel | IdeRightPanel, string> = {
  overview: 'Project summary',
  database: 'SQL browser',
  'object-storage': 'File storage',
  packages: 'Dependencies manager',
  monitoring: 'App metrics',
  extensions: 'Marketplace',
  deployments: 'Publish your app',
  env: 'Environment variables',
  secrets: 'Environment variables',
  git: 'Version control',
  activity: 'Project timeline',
  logs: 'Terminal',
  collaborators: 'Team access',
  domains: 'Custom domains',
  snapshots: 'Rollback points',
  settings: 'Project settings',
  editor: 'Code editor',
  preview: 'App preview',
  files: 'Browse project files',
  search: 'Find in files',
  locks: 'Locked files',
};

type IdeRightPanel = (typeof IDE_RIGHT_PANELS)[number];
type IdeWorkspacePanel = (typeof IDE_WORKSPACE_PANELS)[number];
type IdePaneDirection = 'horizontal' | 'vertical';
type IdePaneTab = {
  id: string;
  panel: IdeWorkspacePanel;
  pinned?: boolean;
  filePath?: string;
  preview?: boolean;
};
type IdeDropZone = 'center' | 'left' | 'right' | 'top' | 'bottom';
type AgentToolAction = {
  panel: IdeWorkspacePanel | IdeRightPanel;
  title: string;
  description: string;
  icon: string;
};
type ProjectIdeBackendState = {
  workspace?: { id?: string; status?: string; runtimeMode?: string } | null;
  ports?: Array<{ port?: number; ready?: boolean; type?: string; url?: string }>;
  git?: { branch?: string; ahead?: number; behind?: number; changedFiles?: unknown[] };
  files?: Array<{ path: string; sizeBytes?: number }>;
  recentActivity?: Array<{ action: string; createdAt?: string }>;
  collaborators?: Array<{ id?: string; userId?: string; roleKey?: string }>;
};
type IdePaneNode =
  | { type: 'leaf'; id: string; tabs: IdePaneTab[]; activeTabId?: string }
  | {
      type: 'split';
      id: string;
      direction: IdePaneDirection;
      ratio: number;
      first: IdePaneNode;
      second: IdePaneNode;
    };

function projectStatusLabel(state: ProjectIdeBackendState) {
  const status = state.workspace?.status?.toLowerCase();
  const previewPort = state.ports?.find((port) => port.ready !== false)?.port ?? state.ports?.[0]?.port;

  if (status === 'running') {
    return previewPort ? `Running on :${previewPort}` : 'Running';
  }

  if (status === 'building' || status === 'starting' || status === 'pending') {
    return 'Building...';
  }

  if (status === 'crashed' || status === 'failed' || status === 'error') {
    return 'Crashed';
  }

  return 'Stopped';
}

function fileTypeLabel(filePath?: string) {
  const extension = filePath?.split('.').pop()?.toLowerCase();

  if (extension === 'ts' || extension === 'tsx') {
    return 'TypeScript';
  }

  if (extension === 'js' || extension === 'jsx') {
    return 'JavaScript';
  }

  if (extension === 'json') {
    return 'JSON';
  }

  if (extension === 'css' || extension === 'scss') {
    return 'Stylesheet';
  }

  if (extension === 'md' || extension === 'mdx') {
    return 'Markdown';
  }

  return extension ? extension.toUpperCase() : 'Project';
}

const DEFAULT_PANE_TREE: IdePaneNode = {
  type: 'leaf',
  id: 'pane-main',
  tabs: [],
};

function cloneDefaultPaneTree(): IdePaneNode {
  return JSON.parse(JSON.stringify(DEFAULT_PANE_TREE));
}

function isIdeRightPanel(panel: string): panel is IdeRightPanel {
  return (IDE_RIGHT_PANELS as readonly string[]).includes(panel);
}

function isIdeWorkspacePanel(panel: string): panel is IdeWorkspacePanel {
  return (IDE_WORKSPACE_PANELS as readonly string[]).includes(panel);
}

function makePaneTab(panel: IdeWorkspacePanel, options: Partial<IdePaneTab> = {}): IdePaneTab {
  const suffix =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  return {
    id: options.id ?? `tab-${panel}-${suffix}`,
    panel,
    pinned: options.pinned,
    filePath: options.filePath,
  };
}

function inferAgentToolAction(message: string | undefined): AgentToolAction | null {
  const text = (message ?? '').toLowerCase();

  const matches: Array<[RegExp, IdeWorkspacePanel | IdeRightPanel, string]> = [
    [/\b(open|show|ouvre|affiche).*\b(files?|fichiers?|explorer)\b|\b(files?|fichiers?)\b/, 'files', 'Open Files'],
    [/\b(search|find|recherche)\b/, 'search', 'Open Search'],
    [/\b(database|sql|db|base de donn)/, 'database', 'Open Database'],
    [/\b(terminal|console|logs?|shell)\b/, 'logs', 'Open Console'],
    [/\b(preview|webview|aperçu|apercu)\b/, 'preview', 'Open Webview'],
    [/\b(deploy|deployment|publish|publier|déploiement|deploiement)\b/, 'deployments', 'Open Deployments'],
    [/\b(secret|env|environment variable)\b/, 'secrets', 'Open Secrets'],
    [/\bgit\b|\bbranch\b|\bcommit\b/, 'git', 'Open Git'],
    [/\b(package|dependency|dependencies|npm|pnpm)\b/, 'packages', 'Open Packages'],
    [/\b(snapshot|checkpoint|restore|rollback)\b/, 'snapshots', 'Open Snapshots'],
    [/\b(extension|marketplace)\b/, 'extensions', 'Open Extensions'],
    [/\bmonitoring|metrics|observability\b/, 'monitoring', 'Open Monitoring'],
    [/\bsettings|param(è|e)tres|configuration\b/, 'settings', 'Open Settings'],
  ];

  const match = matches.find(([pattern]) => pattern.test(text));

  if (!match) {
    return null;
  }

  const [, panel, title] = match;

  return {
    panel,
    title,
    description: IDE_TOOL_DESCRIPTIONS[panel],
    icon: panelIcon(panel),
  };
}

function isPaneNode(value: any): value is IdePaneNode {
  if (!value || typeof value !== 'object') {
    return false;
  }

  if (value.type === 'leaf') {
    return typeof value.id === 'string' && Array.isArray(value.tabs);
  }

  return (
    value.type === 'split' &&
    typeof value.id === 'string' &&
    (value.direction === 'horizontal' || value.direction === 'vertical') &&
    typeof value.ratio === 'number' &&
    isPaneNode(value.first) &&
    isPaneNode(value.second)
  );
}

function findLeaf(node: IdePaneNode, paneId: string): Extract<IdePaneNode, { type: 'leaf' }> | undefined {
  if (node.type === 'leaf') {
    return node.id === paneId ? node : undefined;
  }

  return findLeaf(node.first, paneId) ?? findLeaf(node.second, paneId);
}

function firstLeaf(node: IdePaneNode): Extract<IdePaneNode, { type: 'leaf' }> {
  return node.type === 'leaf' ? node : firstLeaf(node.first);
}

function findLeafContainingTab(node: IdePaneNode, tabId: string): Extract<IdePaneNode, { type: 'leaf' }> | undefined {
  if (node.type === 'leaf') {
    return node.tabs.some((tab) => tab.id === tabId) ? node : undefined;
  }

  return findLeafContainingTab(node.first, tabId) ?? findLeafContainingTab(node.second, tabId);
}

function updateLeaf(
  node: IdePaneNode,
  paneId: string,
  updater: (leaf: Extract<IdePaneNode, { type: 'leaf' }>) => IdePaneNode,
): IdePaneNode {
  if (node.type === 'leaf') {
    return node.id === paneId ? updater(node) : node;
  }

  return { ...node, first: updateLeaf(node.first, paneId, updater), second: updateLeaf(node.second, paneId, updater) };
}

function splitLeaf(node: IdePaneNode, paneId: string, direction: IdePaneDirection): IdePaneNode {
  return updateLeaf(node, paneId, (leaf) => {
    const active = leaf.tabs.find((tab) => tab.id === leaf.activeTabId) ?? leaf.tabs[0] ?? makePaneTab('editor');
    const newPaneId = `pane-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const clonedTab = { ...active, id: `${active.id}-split-${Date.now()}`, pinned: false };

    return {
      type: 'split',
      id: `split-${leaf.id}-${Date.now()}`,
      direction,
      ratio: 50,
      first: leaf,
      second: { type: 'leaf', id: newPaneId, tabs: [clonedTab], activeTabId: clonedTab.id },
    };
  });
}

function updateSplitRatio(node: IdePaneNode, splitId: string, ratio: number): IdePaneNode {
  if (node.type === 'leaf') {
    return node;
  }

  const nextRatio = Math.min(85, Math.max(15, Math.round(ratio)));

  if (node.id === splitId) {
    return { ...node, ratio: nextRatio };
  }

  return {
    ...node,
    first: updateSplitRatio(node.first, splitId, nextRatio),
    second: updateSplitRatio(node.second, splitId, nextRatio),
  };
}

function removeTabFromTree(
  node: IdePaneNode,
  paneId: string,
  tabId: string,
): { tree: IdePaneNode; removed?: IdePaneTab } {
  let removed: IdePaneTab | undefined;
  const tree = updateLeaf(node, paneId, (leaf) => {
    const tab = leaf.tabs.find((item) => item.id === tabId);

    if (!tab || tab.pinned) {
      return leaf;
    }

    removed = tab;

    const tabs = leaf.tabs.filter((item) => item.id !== tabId);
    const activeTabId = leaf.activeTabId === tabId ? tabs[tabs.length - 1]?.id : leaf.activeTabId;

    return { ...leaf, tabs, activeTabId };
  });

  return { tree, removed };
}

function dropTabIntoTree(
  node: IdePaneNode,
  sourcePaneId: string,
  tabId: string,
  targetPaneId: string,
  zone: IdeDropZone,
): IdePaneNode {
  if (zone === 'center') {
    if (sourcePaneId === targetPaneId) {
      return node;
    }

    const { tree, removed } = removeTabFromTree(node, sourcePaneId, tabId);

    if (!removed) {
      return node;
    }

    return updateLeaf(tree, targetPaneId, (leaf) => ({
      ...leaf,
      tabs: [...leaf.tabs, removed],
      activeTabId: removed.id,
    }));
  }

  const sourceLeaf = findLeaf(node, sourcePaneId);
  const dragged = sourceLeaf?.tabs.find((tab) => tab.id === tabId);

  if (!dragged) {
    return node;
  }

  const { tree, removed } = removeTabFromTree(node, sourcePaneId, tabId);
  const tab = removed ?? { ...dragged, id: `${dragged.id}-split-${Date.now()}`, pinned: false };
  const direction: IdePaneDirection = zone === 'left' || zone === 'right' ? 'horizontal' : 'vertical';
  const newLeaf: Extract<IdePaneNode, { type: 'leaf' }> = {
    type: 'leaf',
    id: `pane-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    tabs: [tab],
    activeTabId: tab.id,
  };

  return updateLeaf(tree, targetPaneId, (targetLeaf) => ({
    type: 'split',
    id: `split-${targetLeaf.id}-${Date.now()}`,
    direction,
    ratio: 50,
    first: zone === 'left' || zone === 'top' ? newLeaf : targetLeaf,
    second: zone === 'left' || zone === 'top' ? targetLeaf : newLeaf,
  }));
}

function flattenTabs(node: IdePaneNode): IdePaneTab[] {
  if (node.type === 'leaf') {
    return node.tabs;
  }

  return [...flattenTabs(node.first), ...flattenTabs(node.second)];
}

function collectPaneTargets(node: IdePaneNode, excludePaneId?: string): Array<{ id: string; label: string }> {
  if (node.type === 'leaf') {
    if (node.id === excludePaneId) {
      return [];
    }

    const activeTab = node.tabs.find((tab) => tab.id === node.activeTabId) ?? node.tabs[0];

    return [{ id: node.id, label: activeTab ? panelTitle(activeTab.panel) : 'Empty pane' }];
  }

  return [...collectPaneTargets(node.first, excludePaneId), ...collectPaneTargets(node.second, excludePaneId)];
}

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
  resetChat?: () => void;
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
      resetChat,
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
    const [searchParams, setSearchParams] = useSearchParams();
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
    const [rightPanel, setRightPanel] = useState<IdeRightPanel>('files');
    const [rightPanelOpen, setRightPanelOpen] = useState(true);
    const [workspaceTabs, setWorkspaceTabs] = useState<IdeWorkspacePanel[]>(['editor']);
    const [activeWorkspacePanel, setActiveWorkspacePanel] = useState<IdeWorkspacePanel>('editor');
    const [paneTree, setPaneTree] = useState<IdePaneNode>(() => cloneDefaultPaneTree());
    const [activePaneId, setActivePaneId] = useState('pane-main');
    const [agentWidth, setAgentWidth] = useState(420);
    const [terminalBottomOpen, setTerminalBottomOpen] = useState(false);
    const [terminalBottomHeight, setTerminalBottomHeight] = useState(240);
    const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
    const [commandPaletteMode, setCommandPaletteMode] = useState<'all' | 'tools' | 'files'>('all');
    const [commandPaletteQuery, setCommandPaletteQuery] = useState('');
    const [commandPaletteIndex, setCommandPaletteIndex] = useState(0);
    const [conversationHistoryOpen, setConversationHistoryOpen] = useState(false);
    const [dropTarget, setDropTarget] = useState<{ paneId: string; zone: IdeDropZone } | null>(null);
    const [projectBackendState, setProjectBackendState] = useState<ProjectIdeBackendState>({});
    const [cursorPositions, setCursorPositions] = useState<
      Record<string, { line: number; column: number; offset?: number }>
    >({});
    const [scrollPositions, setScrollPositions] = useState<Record<string, number>>({});
    const [recentTabIds, setRecentTabIds] = useState<string[]>([]);
    const [closedTabs, setClosedTabs] = useState<IdePaneTab[]>([]);
    const [agentToolAction, setAgentToolAction] = useState<AgentToolAction | null>(null);
    const [draggedTab, setDraggedTab] = useState<{ paneId: string; tabId: string } | null>(null);
    const draggedTabRef = useRef<{ paneId: string; tabId: string } | null>(null);
    const [projectStateReady, setProjectStateReady] = useState(!projectIdeMode || !projectId);
    const restoredProjectId = useRef<string | undefined>(undefined);
    const pendingProjectSelectedFile = useRef<string | undefined>(undefined);
    const activeProjectPanel = searchParams.get('panel') || '';

    const firstProjectFile = useMemo(() => {
      return Object.entries(projectFiles).find(([, file]) => file?.type === 'file')?.[0];
    }, [projectFiles]);

    useEffect(() => {
      setProjectStateReady(!projectIdeMode || !projectId);
      restoredProjectId.current = undefined;
      pendingProjectSelectedFile.current = undefined;
    }, [projectIdeMode, projectId]);

    useEffect(() => {
      workbenchStore.setDocuments(projectFiles);
    }, [projectFiles]);

    useEffect(() => {
      if (!projectIdeMode || !projectId) {
        return undefined;
      }

      let cancelled = false;

      async function loadProjectBackendState() {
        try {
          const [overviewResponse, collaboratorsResponse] = await Promise.all([
            fetch(`/api/projects/${projectId}/ide-panel/overview`, { headers: { accept: 'application/json' } }),
            fetch(`/api/projects/${projectId}/ide-panel/collaborators`, { headers: { accept: 'application/json' } }),
          ]);

          const overview = (overviewResponse.ok ? await overviewResponse.json() : {}) as {
            data?: ProjectIdeBackendState;
          };
          const collaborators = (collaboratorsResponse.ok ? await collaboratorsResponse.json() : {}) as {
            data?: { collaborators?: ProjectIdeBackendState['collaborators'] };
          };

          if (!cancelled) {
            setProjectBackendState({
              ...(overview.data ?? {}),
              collaborators: collaborators.data?.collaborators ?? [],
            });
          }
        } catch (error) {
          if (!cancelled) {
            console.error('Failed to load project IDE backend state', error);
          }
        }
      }

      void loadProjectBackendState();

      const interval = window.setInterval(loadProjectBackendState, 15000);

      return () => {
        cancelled = true;
        window.clearInterval(interval);
      };
    }, [projectIdeMode, projectId]);

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
            setRightPanel(ui.rightPanel as IdeRightPanel);
          }

          if (typeof ui?.rightPanelOpen === 'boolean') {
            setRightPanelOpen(ui.rightPanelOpen);
          }

          const restoredTabs = Array.isArray(ui?.workspaceTabs)
            ? ui.workspaceTabs.filter((panel: string) => isIdeWorkspacePanel(panel))
            : [];

          if (restoredTabs.length) {
            setWorkspaceTabs(restoredTabs);
          }

          if (ui?.activeWorkspacePanel && isIdeWorkspacePanel(ui.activeWorkspacePanel)) {
            setActiveWorkspacePanel(ui.activeWorkspacePanel);
          }

          if (isPaneNode(ui?.paneTree)) {
            setPaneTree(ui.paneTree);
          }

          if (typeof ui?.activePaneId === 'string') {
            setActivePaneId(ui.activePaneId);
          }

          if (typeof ui?.agentWidth === 'number') {
            setAgentWidth(Math.min(640, Math.max(360, ui.agentWidth)));
          }

          if (typeof ui?.terminalBottomOpen === 'boolean') {
            setTerminalBottomOpen(ui.terminalBottomOpen);
          }

          if (typeof ui?.terminalBottomHeight === 'number') {
            setTerminalBottomHeight(Math.min(600, Math.max(100, ui.terminalBottomHeight)));
          }

          if (ui?.cursorPositions && typeof ui.cursorPositions === 'object') {
            setCursorPositions(ui.cursorPositions);
          }

          if (ui?.scrollPositions && typeof ui.scrollPositions === 'object') {
            setScrollPositions(ui.scrollPositions);
          }

          if (Array.isArray(ui?.recentTabIds)) {
            setRecentTabIds(ui.recentTabIds.filter((tabId: string) => typeof tabId === 'string'));
          }

          if (Array.isArray(ui?.closedTabs)) {
            setClosedTabs(
              ui.closedTabs.filter((tab: IdePaneTab) => tab && isIdeWorkspacePanel(tab.panel)).slice(0, 20),
            );
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
            rightPanelOpen,
            workspaceTabs,
            activeWorkspacePanel,
            paneTree,
            activePaneId,
            agentWidth,
            terminalBottomOpen,
            terminalBottomHeight,
            cursorPositions,
            scrollPositions,
            recentTabIds,
            closedTabs,
            mobilePanel,
            showWorkbench: true,
          },
        }).catch((error) => {
          console.error('Failed to persist project IDE state', error);
        });
      }, 400);

      return () => window.clearTimeout(saveTimer);
    }, [
      projectIdeMode,
      projectId,
      projectStateReady,
      selectedFile,
      currentView,
      rightPanel,
      rightPanelOpen,
      workspaceTabs,
      activeWorkspacePanel,
      paneTree,
      activePaneId,
      agentWidth,
      terminalBottomOpen,
      terminalBottomHeight,
      cursorPositions,
      scrollPositions,
      recentTabIds,
      closedTabs,
      mobilePanel,
    ]);

    const openWorkspacePanel = useCallback(
      (
        panel: IdeWorkspacePanel,
        options: { replaceUrl?: boolean; paneId?: string; filePath?: string; preview?: boolean } = {},
      ) => {
        setWorkspaceTabs((currentTabs) => (currentTabs.includes(panel) ? currentTabs : [...currentTabs, panel]));
        setActiveWorkspacePanel(panel);

        const targetPaneId = options.paneId ?? activePaneId;
        setActivePaneId(targetPaneId);
        setPaneTree((currentTree) =>
          updateLeaf(currentTree, targetPaneId, (leaf) => {
            const existing = options.filePath
              ? leaf.tabs.find((tab) => tab.panel === panel && tab.filePath === options.filePath)
              : leaf.tabs.find((tab) => tab.panel === panel && !tab.filePath);
            const nextTab =
              existing ??
              makePaneTab(panel, {
                pinned: panel === 'preview',
                filePath: options.filePath,
                preview: options.preview,
              });
            const baseTabs =
              panel === 'editor' && options.preview
                ? leaf.tabs.filter((tab) => !(tab.panel === 'editor' && tab.preview))
                : leaf.tabs;
            const tabs = existing
              ? baseTabs.map((tab) =>
                  tab.id === existing.id ? { ...tab, preview: options.preview ?? tab.preview } : tab,
                )
              : [...baseTabs, nextTab];

            return { ...leaf, tabs, activeTabId: nextTab.id };
          }),
        );

        if (panel === 'editor' && options.filePath) {
          workbenchStore.setSelectedFile(options.filePath);
          workbenchStore.currentView.set('code');
          workbenchStore.setShowWorkbench(true);
        }

        if (panel === 'preview') {
          workbenchStore.currentView.set('preview');
          workbenchStore.setShowWorkbench(true);
        }

        if (options.replaceUrl !== false) {
          setSearchParams(panel === 'editor' ? {} : { panel });
        }
      },
      [activePaneId, setSearchParams],
    );

    const openProjectFile = useCallback(
      (filePath: string, options: { paneId?: string; preview?: boolean } = {}) => {
        openWorkspacePanel('editor', {
          paneId: options.paneId,
          filePath,
          preview: options.preview,
        });
      },
      [openWorkspacePanel],
    );

    const openIdeTool = useCallback(
      (panel: IdeWorkspacePanel | IdeRightPanel, paneId = activePaneId) => {
        if (isIdeRightPanel(panel)) {
          setRightPanel(panel);
          setRightPanelOpen(true);
          setSearchParams({ panel });

          return;
        }

        openWorkspacePanel(panel, { paneId });
      },
      [activePaneId, openWorkspacePanel, setSearchParams],
    );

    const closeWorkspacePanel = useCallback(
      (panel: IdeWorkspacePanel, paneId = activePaneId, tabId?: string) => {
        setWorkspaceTabs((currentTabs) => {
          const nextTabs = currentTabs.filter((tab) => tab !== panel);
          const safeTabs: IdeWorkspacePanel[] = nextTabs.length ? nextTabs : ['editor'];

          if (activeWorkspacePanel === panel) {
            const nextActive = safeTabs[safeTabs.length - 1] ?? 'editor';
            setActiveWorkspacePanel(nextActive);
            setSearchParams(nextActive === 'editor' ? {} : { panel: nextActive });
          }

          return safeTabs;
        });
        setPaneTree((currentTree) =>
          updateLeaf(currentTree, paneId, (leaf) => {
            const targetTab = tabId
              ? leaf.tabs.find((tab) => tab.id === tabId)
              : leaf.tabs.find((tab) => tab.panel === panel);

            if (!targetTab || targetTab.pinned) {
              return leaf;
            }

            const tabs = leaf.tabs.filter((tab) => tab.id !== targetTab.id);

            return {
              ...leaf,
              tabs,
              activeTabId: leaf.activeTabId === targetTab.id ? tabs[tabs.length - 1]?.id : leaf.activeTabId,
            };
          }),
        );
      },
      [activeWorkspacePanel, setSearchParams],
    );

    const splitWorkspacePane = useCallback(
      (direction: IdePaneDirection, paneId = activePaneId) => {
        setPaneTree((currentTree) => splitLeaf(currentTree, paneId, direction));
      },
      [activePaneId],
    );

    const moveTabToPane = useCallback((sourcePaneId: string, tabId: string, targetPaneId: string) => {
      setPaneTree((currentTree) => {
        const { tree, removed } = removeTabFromTree(currentTree, sourcePaneId, tabId);

        if (!removed) {
          return currentTree;
        }

        return updateLeaf(tree, targetPaneId, (leaf) => ({
          ...leaf,
          tabs: [...leaf.tabs, removed],
          activeTabId: removed.id,
        }));
      });
      setActivePaneId(targetPaneId);
    }, []);

    const dropTabOnPane = useCallback(
      (sourcePaneId: string, tabId: string, targetPaneId: string, zone: IdeDropZone) => {
        setPaneTree((currentTree) => dropTabIntoTree(currentTree, sourcePaneId, tabId, targetPaneId, zone));
        setActivePaneId(targetPaneId);
        setDropTarget(null);
        draggedTabRef.current = null;
        setDraggedTab(null);
      },
      [],
    );

    useEffect(() => {
      if (!projectIdeMode) {
        return;
      }

      if (isIdeRightPanel(activeProjectPanel)) {
        setRightPanel(activeProjectPanel);
        setRightPanelOpen(true);

        return;
      }

      if (isIdeWorkspacePanel(activeProjectPanel)) {
        openWorkspacePanel(activeProjectPanel, { replaceUrl: false });
      }
    }, [activeProjectPanel, openWorkspacePanel, projectIdeMode]);

    const onProjectEditorSave = useCallback(() => {
      workbenchStore.saveCurrentDocument().catch(() => undefined);
    }, []);

    const startAgentResize = useCallback(
      (event: React.MouseEvent<HTMLDivElement>) => {
        event.preventDefault();

        const startX = event.clientX;
        const startWidth = agentWidth;

        const onMove = (moveEvent: MouseEvent) => {
          const nextWidth = Math.min(640, Math.max(360, startWidth + moveEvent.clientX - startX));
          setAgentWidth(nextWidth);
        };

        const onUp = () => {
          window.removeEventListener('mousemove', onMove);
          window.removeEventListener('mouseup', onUp);
        };

        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
      },
      [agentWidth],
    );

    const startTerminalResize = useCallback(
      (event: React.MouseEvent<HTMLDivElement>) => {
        event.preventDefault();

        const startY = event.clientY;
        const startHeight = terminalBottomHeight;

        const onMove = (moveEvent: MouseEvent) => {
          const nextHeight = Math.min(600, Math.max(100, startHeight + startY - moveEvent.clientY));
          setTerminalBottomHeight(nextHeight);
        };

        const onUp = () => {
          window.removeEventListener('mousemove', onMove);
          window.removeEventListener('mouseup', onUp);
        };

        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
      },
      [terminalBottomHeight],
    );

    useEffect(() => {
      if (!projectIdeMode || useMobileIde) {
        return undefined;
      }

      const onKeyDown = (event: KeyboardEvent) => {
        const command = event.metaKey || event.ctrlKey;

        if (!command) {
          return;
        }

        const key = event.key.toLowerCase();

        if (event.shiftKey && key === 't') {
          event.preventDefault();

          const [tab, ...rest] = closedTabs;

          if (tab) {
            const reopenedId = `${tab.id}-reopen-${Date.now()}`;
            setClosedTabs(rest);
            setPaneTree((currentTree) =>
              updateLeaf(currentTree, activePaneId, (leaf) => ({
                ...leaf,
                tabs: [...leaf.tabs, { ...tab, id: reopenedId }],
                activeTabId: reopenedId,
              })),
            );
            setActiveWorkspacePanel(tab.panel);
            setRecentTabIds((ids) => [reopenedId, ...ids.filter((id) => id !== reopenedId)].slice(0, 20));

            if (tab.filePath) {
              workbenchStore.setSelectedFile(tab.filePath);
            }
          }
        } else if (key === 'k' || (event.shiftKey && key === 'p')) {
          event.preventDefault();
          setCommandPaletteMode('all');
          setCommandPaletteQuery('');
          setCommandPaletteIndex(0);
          setCommandPaletteOpen(true);
        } else if (key === 't') {
          event.preventDefault();
          setCommandPaletteMode('tools');
          setCommandPaletteQuery('');
          setCommandPaletteIndex(0);
          setCommandPaletteOpen(true);
        } else if (key === 'p') {
          event.preventDefault();
          setCommandPaletteMode('files');
          setCommandPaletteQuery('');
          setCommandPaletteIndex(0);
          setCommandPaletteOpen(true);
        } else if (key === 'w') {
          event.preventDefault();

          const leaf = findLeaf(paneTree, activePaneId) ?? firstLeaf(paneTree);
          const tab = leaf.tabs.find((item) => item.id === leaf.activeTabId);

          if (tab) {
            setClosedTabs((items) => [tab, ...items.filter((item) => item.id !== tab.id)].slice(0, 20));
            closeWorkspacePanel(tab.panel, leaf.id, tab.id);
          }
        } else if (key === 'j') {
          event.preventDefault();
          setTerminalBottomOpen((value) => !value);
        } else if (key === '`') {
          event.preventDefault();
          setTerminalBottomOpen(true);
        } else if (key === 'b') {
          event.preventDefault();
          textareaRef?.current?.focus();
          setAgentWidth((width) => Math.min(640, Math.max(420, width)));
        } else if (key === ',') {
          event.preventDefault();
          openWorkspacePanel('settings');
        } else if (key === 's') {
          event.preventDefault();
          onProjectEditorSave();
        } else if (key === '\\') {
          event.preventDefault();
          splitWorkspacePane(event.shiftKey ? 'vertical' : 'horizontal');
        } else if (/^[1-9]$/.test(key)) {
          event.preventDefault();

          const leaf = findLeaf(paneTree, activePaneId) ?? firstLeaf(paneTree);
          const tab = leaf.tabs[Number(key) - 1];

          if (tab) {
            setPaneTree((currentTree) =>
              updateLeaf(currentTree, leaf.id, (currentLeaf) => ({ ...currentLeaf, activeTabId: tab.id })),
            );
            setActivePaneId(leaf.id);
            setActiveWorkspacePanel(tab.panel);
            setRecentTabIds((ids) => [tab.id, ...ids.filter((id) => id !== tab.id)].slice(0, 20));
          }
        } else if (key === 'tab') {
          event.preventDefault();

          const tabs = flattenTabs(paneTree);
          const currentIndex = tabs.findIndex((tab) => tab.id === recentTabIds[0]);
          const nextTab = tabs[(currentIndex + 1) % Math.max(tabs.length, 1)];

          if (nextTab) {
            const nextLeaf = findLeafContainingTab(paneTree, nextTab.id);

            if (nextLeaf) {
              setPaneTree((currentTree) =>
                updateLeaf(currentTree, nextLeaf.id, (leaf) => ({ ...leaf, activeTabId: nextTab.id })),
              );
              setActivePaneId(nextLeaf.id);
              setActiveWorkspacePanel(nextTab.panel);
              setRecentTabIds((ids) => [nextTab.id, ...ids.filter((id) => id !== nextTab.id)].slice(0, 20));
            }
          }
        }
      };

      window.addEventListener('keydown', onKeyDown);

      return () => window.removeEventListener('keydown', onKeyDown);
    }, [
      activePaneId,
      closedTabs,
      closeWorkspacePanel,
      onProjectEditorSave,
      openWorkspacePanel,
      paneTree,
      projectIdeMode,
      recentTabIds,
      splitWorkspacePane,
      useMobileIde,
    ]);

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

    const handleProjectAgentSendMessage = useCallback(
      (event: React.UIEvent, messageInput?: string) => {
        if (projectIdeMode) {
          const action = inferAgentToolAction(messageInput ?? input);

          if (action) {
            setAgentToolAction(action);
          }
        }

        handleSendMessage?.(event, messageInput);
      },
      [handleSendMessage, input, projectIdeMode],
    );

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
            {projectIdeMode && agentToolAction && (
              <div className="bolt-project-agent-action-card" role="region" aria-label={agentToolAction.title}>
                <div>
                  <span className={agentToolAction.icon} aria-hidden />
                  <span>
                    <strong>{agentToolAction.title}</strong>
                    <small>{agentToolAction.description}</small>
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    openIdeTool(agentToolAction.panel);
                    setAgentToolAction(null);
                  }}
                >
                  Open →
                </button>
              </div>
            )}
            {projectIdeMode && (
              <div className="bolt-project-agent-suggestions" aria-label="Agent suggestions">
                {['Add a feature', 'Fix this bug', 'Deploy', 'Optimize performance'].map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={(event) => handleProjectAgentSendMessage(event, suggestion)}
                    disabled={isStreaming}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}
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
              handleSendMessage={projectIdeMode ? handleProjectAgentSendMessage : handleSendMessage}
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
              projectIdeMode={projectIdeMode}
              placeholder={projectIdeMode ? 'Describe what you want to build...' : undefined}
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

    const selectPaneTab = useCallback(
      (paneId: string, tabId: string, panel: IdeWorkspacePanel) => {
        const selectedTab = findLeaf(paneTree, paneId)?.tabs.find((tab) => tab.id === tabId);
        setPaneTree((currentTree) => updateLeaf(currentTree, paneId, (leaf) => ({ ...leaf, activeTabId: tabId })));
        setActivePaneId(paneId);
        setActiveWorkspacePanel(panel);
        setRecentTabIds((ids) => [tabId, ...ids.filter((id) => id !== tabId)].slice(0, 20));
        setSearchParams(panel === 'editor' ? {} : { panel });

        if (panel === 'editor' && selectedTab?.filePath) {
          workbenchStore.setSelectedFile(selectedTab.filePath);
          workbenchStore.currentView.set('code');
          workbenchStore.setShowWorkbench(true);
        }

        if (panel === 'preview') {
          workbenchStore.currentView.set('preview');
          workbenchStore.setShowWorkbench(true);
        }
      },
      [paneTree, setSearchParams],
    );

    const pinPaneTab = useCallback((paneId: string, tabId: string) => {
      setPaneTree((currentTree) =>
        updateLeaf(currentTree, paneId, (leaf) => ({
          ...leaf,
          tabs: leaf.tabs.map((tab) => (tab.id === tabId ? { ...tab, pinned: !tab.pinned } : tab)),
        })),
      );
    }, []);

    const closePaneTabs = useCallback((paneId: string, mode: 'all' | 'others' | 'right', tabId?: string) => {
      setPaneTree((currentTree) =>
        updateLeaf(currentTree, paneId, (leaf) => {
          const targetIndex = tabId ? leaf.tabs.findIndex((tab) => tab.id === tabId) : -1;
          const tabs = leaf.tabs.filter((tab, index) => {
            if (tab.pinned) {
              return true;
            }

            if (mode === 'all') {
              return false;
            }

            if (mode === 'others') {
              return tab.id === tabId;
            }

            return targetIndex < 0 || index <= targetIndex;
          });
          const safeTabs = tabs;
          const activeTabId = safeTabs.some((tab) => tab.id === leaf.activeTabId) ? leaf.activeTabId : safeTabs[0]?.id;

          return { ...leaf, tabs: safeTabs, activeTabId };
        }),
      );
    }, []);

    const renderPaneContent = useCallback(
      (panel: IdeWorkspacePanel) => {
        if (panel === 'editor') {
          return (
            <div
              className="bolt-project-editor-tool min-h-0 flex-1 overflow-hidden"
              data-testid="responsive-code-editor"
            >
              <div className="bolt-project-editor-toolbar">
                <span>{currentDocument?.filePath?.replace(WORK_DIR, '') || 'No file selected'}</span>
                <button type="button" onClick={() => workbenchStore.resetCurrentDocument()} disabled={!currentDocument}>
                  Format
                </button>
                <button type="button" onClick={onProjectEditorSave} disabled={!currentDocument}>
                  Save
                </button>
              </div>
              {currentDocument && !currentDocument.isBinary ? (
                <EditorAdapter
                  className="bolt-project-editor-adapter"
                  value={currentDocument.value}
                  filePath={currentDocument.filePath}
                  theme={theme === 'dark' ? 'dark' : 'light'}
                  onSave={onProjectEditorSave}
                  onChange={(update) => {
                    workbenchStore.setCurrentDocumentContent(update.value);

                    const filePath = currentDocument.filePath;
                    const lines = update.value.slice(0, update.value.length).split('\n');
                    setCursorPositions((positions) => ({
                      ...positions,
                      [filePath]: {
                        line: lines.length,
                        column: lines[lines.length - 1]?.length ?? 1,
                        offset: update.value.length,
                      },
                    }));
                  }}
                />
              ) : (
                <ProjectWelcomeState files={Object.keys(projectFiles).slice(0, 5)} onOpenTool={openIdeTool} />
              )}
            </div>
          );
        }

        if (panel === 'preview') {
          return (
            <div className="bolt-project-webview-tool">
              <div className="bolt-project-webview-toolbar">
                <button type="button" aria-label="Back">
                  <span className="i-ph:arrow-left" aria-hidden />
                </button>
                <button type="button" aria-label="Forward">
                  <span className="i-ph:arrow-right" aria-hidden />
                </button>
                <button type="button" aria-label="Refresh preview">
                  <span className="i-ph:arrow-clockwise" aria-hidden />
                </button>
                <input
                  aria-label="Preview URL"
                  readOnly
                  value={projectBackendState.ports?.[0]?.url ?? 'Runtime preview'}
                />
                <button type="button" aria-label="Open preview in new tab">
                  <span className="i-ph:arrow-square-out" aria-hidden />
                </button>
                <select aria-label="Preview device">
                  <option>Desktop</option>
                  <option>Tablet</option>
                  <option>Mobile</option>
                  <option>Custom width</option>
                </select>
                <button type="button" aria-label="Toggle preview dev tools">
                  <span className="i-ph:wrench" aria-hidden />
                </button>
              </div>
              <div className="bolt-project-webview-frame">
                <Preview setSelectedElement={setSelectedElement} projectId={projectId} />
              </div>
            </div>
          );
        }

        return <ProjectIdeServicePanel projectId={projectId} panel={panel} />;
      },
      [
        currentDocument,
        onProjectEditorSave,
        openIdeTool,
        projectBackendState.ports,
        projectFiles,
        projectId,
        setSelectedElement,
        theme,
      ],
    );

    const renderPaneLeaf = useCallback(
      (leaf: Extract<IdePaneNode, { type: 'leaf' }>) => {
        const activeTab = leaf.tabs.find((tab) => tab.id === leaf.activeTabId) ?? leaf.tabs[0];

        return (
          <div
            key={leaf.id}
            className="bolt-project-pane-leaf"
            data-active={activePaneId === leaf.id}
            onMouseDown={() => setActivePaneId(leaf.id)}
            onDragOver={(event) => {
              if (!draggedTabRef.current) {
                return;
              }

              event.preventDefault();
            }}
            onDragLeave={(event) => {
              if (event.currentTarget.contains(event.relatedTarget as Node)) {
                return;
              }

              setDropTarget((target) => (target?.paneId === leaf.id ? null : target));
            }}
          >
            <IdeTabBar
              paneId={leaf.id}
              activePanel={activeTab?.panel ?? 'editor'}
              activeTabId={activeTab?.id}
              tabs={leaf.tabs.map((tab) => ({
                ...tab,
                label:
                  tab.panel === 'editor'
                    ? tab.filePath?.replace(WORK_DIR, '') ||
                      currentDocument?.filePath?.replace(WORK_DIR, '') ||
                      'Editor'
                    : panelTitle(tab.panel),
                icon: tab.panel === 'editor' ? 'i-ph:code' : panelIcon(tab.panel),
                preview: tab.preview,
                dirty:
                  tab.panel === 'editor' &&
                  !!currentDocument &&
                  !!(tab.filePath ?? currentDocument.filePath) &&
                  unsavedFiles instanceof Set &&
                  unsavedFiles.has(tab.filePath ?? currentDocument.filePath),
                onSave: tab.panel === 'editor' ? onProjectEditorSave : undefined,
                closable: !tab.pinned,
              }))}
              trailing={
                activeTab?.panel === 'preview' ? (
                  <span className="bolt-project-runtime-badge">Live runtime</span>
                ) : undefined
              }
              onSelect={(tabId, panel) => selectPaneTab(leaf.id, tabId, panel)}
              onClose={(tabId, panel) => {
                const tab = leaf.tabs.find((item) => item.id === tabId);

                if (tab) {
                  setClosedTabs((items) => [tab, ...items.filter((item) => item.id !== tab.id)].slice(0, 20));
                }

                closeWorkspacePanel(panel, leaf.id, tabId);
              }}
              onOpenTool={(panel) => openIdeTool(panel, leaf.id)}
              onSplit={(direction) => splitWorkspacePane(direction, leaf.id)}
              onPin={(tabId) => pinPaneTab(leaf.id, tabId)}
              onCloseOthers={(tabId) => closePaneTabs(leaf.id, 'others', tabId)}
              onCloseToRight={(tabId) => closePaneTabs(leaf.id, 'right', tabId)}
              onCloseAll={() => closePaneTabs(leaf.id, 'all')}
              recentFiles={Object.keys(projectFiles)
                .filter((filePath) => projectFiles[filePath]?.type === 'file')
                .slice(0, 5)}
              onOpenFile={(filePath, preview) => openProjectFile(filePath, { paneId: leaf.id, preview })}
              paneTargets={flattenTabs(paneTree).length ? collectPaneTargets(paneTree, leaf.id) : []}
              onMoveToNewPane={(tabId, zone) => dropTabOnPane(leaf.id, tabId, leaf.id, zone)}
              onMoveToExistingPane={(tabId, targetPaneId) => moveTabToPane(leaf.id, tabId, targetPaneId)}
              onDragStart={(paneId, tabId) => {
                draggedTabRef.current = { paneId, tabId };
                setDraggedTab({ paneId, tabId });
              }}
              onDropTab={(paneId) => {
                const dragged = draggedTabRef.current;

                if (dragged && dragged.paneId !== paneId) {
                  moveTabToPane(dragged.paneId, dragged.tabId, paneId);
                }

                draggedTabRef.current = null;
                setDraggedTab(null);
              }}
              onDragEnd={() => {
                draggedTabRef.current = null;
                setDraggedTab(null);
                setDropTarget(null);
              }}
            />
            <div className="bolt-project-drop-zones" data-visible={draggedTab ? 'true' : 'false'} aria-hidden>
              {(['center', 'left', 'right', 'top', 'bottom'] as IdeDropZone[]).map((zone) => (
                <div
                  key={zone}
                  className={`bolt-project-drop-zone bolt-project-drop-zone-${zone}`}
                  data-active={dropTarget?.paneId === leaf.id && dropTarget.zone === zone}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDropTarget({ paneId: leaf.id, zone });
                  }}
                  onDrop={(event) => {
                    event.preventDefault();

                    const dragged = draggedTabRef.current;

                    if (dragged) {
                      dropTabOnPane(dragged.paneId, dragged.tabId, leaf.id, zone);
                    }
                  }}
                  onMouseUp={() => {
                    const dragged = draggedTabRef.current;

                    if (dragged) {
                      dropTabOnPane(dragged.paneId, dragged.tabId, leaf.id, zone);
                    }
                  }}
                />
              ))}
            </div>
            <div
              className="bolt-project-pane-content"
              data-pane-id={leaf.id}
              ref={(element) => {
                if (element && scrollPositions[leaf.id] && element.scrollTop !== scrollPositions[leaf.id]) {
                  element.scrollTop = scrollPositions[leaf.id];
                }
              }}
              onScroll={(event) => {
                setScrollPositions((positions) => ({ ...positions, [leaf.id]: event.currentTarget.scrollTop }));
              }}
            >
              {activeTab ? (
                renderPaneContent(activeTab.panel)
              ) : (
                <ProjectWelcomeState files={Object.keys(projectFiles).slice(0, 5)} onOpenTool={openIdeTool} />
              )}
            </div>
          </div>
        );
      },
      [
        activePaneId,
        closePaneTabs,
        closeWorkspacePanel,
        dropTabOnPane,
        currentDocument,
        dropTarget,
        moveTabToPane,
        onProjectEditorSave,
        openIdeTool,
        paneTree,
        pinPaneTab,
        projectFiles,
        renderPaneContent,
        selectPaneTab,
        scrollPositions,
        splitWorkspacePane,
        unsavedFiles,
      ],
    );

    const renderPaneNode = useCallback(
      (node: IdePaneNode): React.ReactNode => {
        if (node.type === 'leaf') {
          return renderPaneLeaf(node);
        }

        return (
          <PanelGroup
            key={node.id}
            direction={node.direction}
            className="min-h-0 flex-1"
            onLayout={(sizes) => {
              const nextRatio = sizes[0];

              if (Number.isFinite(nextRatio) && Math.abs(nextRatio - node.ratio) >= 1) {
                setPaneTree((currentTree) => updateSplitRatio(currentTree, node.id, nextRatio));
              }
            }}
          >
            <Panel defaultSize={node.ratio} minSize={15} className="min-h-0 min-w-0">
              {renderPaneNode(node.first)}
            </Panel>
            <PanelResizeHandle
              className={classNames('bolt-project-ide-resize-handle', {
                'bolt-project-ide-resize-handle-vertical': node.direction === 'vertical',
              })}
              onDoubleClick={() => setPaneTree((currentTree) => updateSplitRatio(currentTree, node.id, 50))}
            />
            <Panel defaultSize={100 - node.ratio} minSize={15} className="min-h-0 min-w-0">
              {renderPaneNode(node.second)}
            </Panel>
          </PanelGroup>
        );
      },
      [renderPaneLeaf],
    );

    const projectIdePanels = (
      <div
        className="bolt-project-ide-panels"
        style={{ '--project-agent-width': `${agentWidth}px` } as React.CSSProperties}
      >
        <section className="bolt-project-ide-panel bolt-project-agent-shell" aria-label="AI agent">
          <div className="bolt-project-agent-header">
            <div className="bolt-project-agent-avatar" aria-hidden>
              <span className="i-ph:sparkle" />
            </div>
            <span className="bolt-project-agent-title">Agent</span>
            <div className="bolt-project-agent-mode" role="group" aria-label="Agent mode">
              <button type="button" aria-pressed={chatMode === 'build'} onClick={() => setChatMode?.('build')}>
                Build
              </button>
              <button type="button" aria-pressed={chatMode === 'discuss'} onClick={() => setChatMode?.('discuss')}>
                Discuss
              </button>
            </div>
            <div className="ml-auto flex items-center gap-1">
              <button
                type="button"
                className="bolt-project-ide-icon-button"
                aria-label="Conversation history"
                onClick={() => setConversationHistoryOpen((value) => !value)}
              >
                <span className="i-ph:clock" aria-hidden />
              </button>
              <button type="button" className="bolt-project-ide-icon-button" aria-label="New chat" onClick={resetChat}>
                <span className="i-ph:plus" aria-hidden />
              </button>
              <Link to="/settings/providers" className="bolt-project-ide-icon-button" aria-label="Agent settings">
                <span className="i-ph:sliders-horizontal" aria-hidden />
              </Link>
            </div>
          </div>
          {conversationHistoryOpen && (
            <div className="bolt-project-conversation-history">
              <div className="text-[11px] font-semibold uppercase tracking-[0.4px] text-[#6E7681]">History</div>
              {(messages ?? []).slice(-8).map((message, index) => (
                <button key={`${message.id ?? index}`} type="button" onClick={() => setConversationHistoryOpen(false)}>
                  <strong>{message.role === 'user' ? 'You' : 'Agent'}</strong>
                  <span>{String(message.content ?? '').slice(0, 92) || 'Tool call'}</span>
                </button>
              ))}
              {!(messages ?? []).length && <small>No messages in this project conversation yet.</small>}
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-hidden">{agentPanel}</div>
          <div
            className="bolt-project-agent-resize-handle"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize AI agent panel"
            onMouseDown={startAgentResize}
          />
        </section>
        <div className="bolt-project-workspace-shell">
          <PanelGroup direction="horizontal" className="min-h-0 min-w-0 flex-1">
            <Panel defaultSize={rightPanelOpen ? 72 : 100} minSize={35} className="min-w-0">
              <section className="bolt-project-ide-panel" aria-label="Editor and preview">
                <div className="bolt-project-main-stack">
                  <div
                    className="bolt-project-main-panes"
                    style={
                      {
                        '--project-terminal-bottom-height': terminalBottomOpen ? `${terminalBottomHeight}px` : '0px',
                      } as React.CSSProperties
                    }
                  >
                    {renderPaneNode(paneTree)}
                  </div>
                  {terminalBottomOpen && (
                    <div
                      className="bolt-project-bottom-terminal-shell"
                      style={{ '--project-terminal-height': `${terminalBottomHeight}px` } as React.CSSProperties}
                    >
                      <div
                        className="bolt-project-terminal-resize-handle"
                        role="separator"
                        aria-orientation="horizontal"
                        aria-label="Resize pinned terminal"
                        onMouseDown={startTerminalResize}
                      />
                      <div className="bolt-project-bottom-terminal-frame">
                        <ProjectBottomTerminal projectId={projectId} onClose={() => setTerminalBottomOpen(false)} />
                      </div>
                    </div>
                  )}
                </div>
              </section>
            </Panel>
            {rightPanelOpen && (
              <>
                <PanelResizeHandle className="bolt-project-ide-resize-handle" />
                <Panel defaultSize={28} minSize={18} maxSize={38} className="min-w-0">
                  <section className="bolt-project-ide-panel" aria-label="Project files">
                    <div className="bolt-project-right-tabs">
                      {[
                        ['files', 'Files', 'i-ph:files'],
                        ['search', 'Search', 'i-ph:magnifying-glass'],
                        ['locks', 'Locks', 'i-ph:lock'],
                      ].map(([id, label, icon]) => (
                        <button
                          key={id}
                          type="button"
                          className="bolt-project-right-tab"
                          aria-current={rightPanel === id ? 'page' : undefined}
                          onClick={() => setRightPanel(id as typeof rightPanel)}
                        >
                          <span className={icon} aria-hidden />
                          {label}
                        </button>
                      ))}
                      <button
                        type="button"
                        className="bolt-project-ide-icon-button ml-auto"
                        aria-label="Close project files"
                        onClick={() => setRightPanelOpen(false)}
                      >
                        <span className="i-ph:sidebar-simple" aria-hidden />
                      </button>
                    </div>
                    <div className="min-h-0 flex-1 overflow-auto">
                      {rightPanel === 'files' && (
                        <ProjectFilesTool
                          files={projectFiles}
                          selectedFile={selectedFile}
                          unsavedFiles={unsavedFiles}
                          onFilePreview={(filePath) => openProjectFile(filePath, { preview: true })}
                          onFileOpen={(filePath) => openProjectFile(filePath, { preview: false })}
                        />
                      )}
                      {rightPanel === 'search' && <Search />}
                      {rightPanel === 'locks' && <LockManager />}
                    </div>
                  </section>
                </Panel>
              </>
            )}
          </PanelGroup>
        </div>
      </div>
    );

    const commandPaletteEntries = [
      ...Object.keys(projectFiles)
        .filter((filePath) => projectFiles[filePath]?.type === 'file')
        .slice(0, 20)
        .map((filePath) => ({
          id: `file:${filePath}`,
          section: 'Files',
          title: filePath.replace(WORK_DIR, '') || filePath,
          description: 'Open project file',
          shortcut: '⌘P',
          icon: 'i-ph:file-code',
          kind: 'file' as const,
          filePath,
        })),
      ...[
        ['files', 'Files', 'Browse project files', '⌘P'],
        ['search', 'Search', 'Find in files', ''],
        ['logs', 'Console', 'Terminal', '⌘`'],
        ['preview', 'Webview', 'App preview', '⌘⇧V'],
        ['database', 'Database', 'SQL browser', ''],
        ['object-storage', 'Object Storage', 'File storage', ''],
        ['env', 'Env vars', 'Environment variables', ''],
        ['secrets', 'Secrets', 'Encrypted project secrets', ''],
        ['git', 'Git', 'Version control', ''],
        ['packages', 'Packages', 'Dependencies manager', ''],
        ['deployments', 'Deployments', 'Publish your app', ''],
        ['monitoring', 'Monitoring', 'App metrics', ''],
        ['extensions', 'Extensions', 'Marketplace', ''],
        ['snapshots', 'Snapshots', 'Create or restore checkpoints', ''],
        ['settings', 'Settings', 'Project settings', '⌘,'],
      ].map(([panel, title, description, shortcut]) => ({
        id: `tool:${panel}`,
        section: 'Tools',
        title,
        description,
        shortcut,
        icon: panelIcon(panel),
        kind: 'tool' as const,
        panel: panel as IdeWorkspacePanel | IdeRightPanel,
      })),
      ...[
        ['run', 'Run app', 'Open preview runtime', ''],
        ['stop', 'Stop app', 'Open logs to stop runtime process', ''],
        ['deploy', 'Deploy', 'Open deployment panel', ''],
        ['theme', 'Toggle theme', 'Use existing theme controls', ''],
        ['reset-layout', 'Reset layout', 'Restore default IDE layout', ''],
        ['split-right', 'Split right', 'Split active pane vertically', '⌘\\'],
        ['split-down', 'Split down', 'Split active pane horizontally', '⌘⇧\\'],
      ].map(([command, title, description, shortcut]) => ({
        id: `command:${command}`,
        section: 'Commands',
        title,
        description,
        shortcut,
        icon: 'i-ph:command',
        kind: 'command' as const,
        command,
      })),
      ...flattenTabs(paneTree).map((tab) => ({
        id: `recent:${tab.id}`,
        section: 'Recent',
        title: tab.filePath?.replace(WORK_DIR, '') || panelTitle(tab.panel),
        description: 'Focus open tab',
        shortcut: '',
        icon: tab.panel === 'editor' ? 'i-ph:code' : panelIcon(tab.panel),
        kind: 'recent' as const,
        tabId: tab.id,
      })),
    ]
      .filter((entry) => {
        if (commandPaletteMode === 'files' && entry.kind !== 'file') {
          return false;
        }

        if (commandPaletteMode === 'tools' && entry.kind !== 'tool') {
          return false;
        }

        const query = commandPaletteQuery.trim().toLowerCase();

        if (!query) {
          return true;
        }

        return `${entry.title} ${entry.description} ${entry.section}`.toLowerCase().includes(query);
      })
      .slice(0, 60);

    const runCommandPaletteEntry = (entry = commandPaletteEntries[commandPaletteIndex]) => {
      if (!entry) {
        return;
      }

      if (entry.kind === 'file') {
        openProjectFile(entry.filePath, { preview: false });
      } else if (entry.kind === 'tool') {
        openIdeTool(entry.panel);
      } else if (entry.kind === 'recent') {
        const leaf = findLeafContainingTab(paneTree, entry.tabId);
        const tab = leaf?.tabs.find((item) => item.id === entry.tabId);

        if (leaf && tab) {
          selectPaneTab(leaf.id, tab.id, tab.panel);
        }
      } else if (entry.kind === 'command') {
        if (entry.command === 'reset-layout') {
          setPaneTree(cloneDefaultPaneTree());
          setActivePaneId('pane-main');
        } else if (entry.command === 'split-right') {
          splitWorkspacePane('horizontal');
        } else if (entry.command === 'split-down') {
          splitWorkspacePane('vertical');
        } else if (entry.command === 'deploy') {
          openWorkspacePanel('deployments');
        } else if (entry.command === 'run') {
          openWorkspacePanel('preview');
        } else if (entry.command === 'stop') {
          openWorkspacePanel('logs');
        }
      }

      setCommandPaletteOpen(false);
      setCommandPaletteQuery('');
      setCommandPaletteIndex(0);
    };

    const commandPaletteSections = (['Files', 'Tools', 'Commands', 'Recent'] as const).map((name) => ({
      name,
      entries: commandPaletteEntries.filter((entry) => entry.section === name),
    }));

    const baseChat = (
      <div
        ref={ref}
        className={classNames(styles.BaseChat, 'relative flex h-full w-full overflow-hidden bolt-responsive-ide', {
          'bolt-responsive-ide-mobile': useMobileIde,
          'bolt-responsive-ide-tablet-landscape': layout.isTabletLandscape,
          'bolt-responsive-ide-desktop': layout.isDesktop,
        })}
        style={
          projectIdeMode && !useMobileIde
            ? ({ '--project-agent-width': `${agentWidth}px` } as React.CSSProperties)
            : undefined
        }
        data-chat-visible={showChat}
        data-mobile-panel={mobilePanel}
      >
        <ClientOnly>{() => <Menu />}</ClientOnly>
        <div className="bolt-connection-status" role="status" aria-live="polite" data-online={isOnline}>
          {!isOnline ? 'Offline mode: edits stay local until the workspace connection returns.' : 'Connection healthy'}
        </div>
        <button
          type="button"
          className={classNames('bolt-notifications-button', {
            'bolt-notifications-button--with-files-toggle': projectIdeMode && !useMobileIde,
          })}
          aria-label="Notifications"
          aria-expanded={showNotifications}
          onClick={() => setShowNotifications((value) => !value)}
        >
          <span className="i-ph:bell" aria-hidden />
        </button>
        {projectIdeMode && !useMobileIde && (
          <button
            type="button"
            className="bolt-files-panel-toggle"
            aria-label={rightPanelOpen ? 'Close project files' : 'Open project files'}
            aria-pressed={rightPanelOpen}
            data-testid="ide-files-panel-toggle"
            onClick={() => setRightPanelOpen((value) => !value)}
          >
            <span className={rightPanelOpen ? 'i-ph:sidebar-simple' : 'i-ph:files'} aria-hidden />
          </button>
        )}
        {showNotifications && (
          <aside className="bolt-notifications-center" aria-label="Notifications center">
            <div className="font-medium text-bolt-elements-textPrimary">Notifications</div>
            {(projectBackendState.recentActivity ?? []).slice(-6).length ? (
              <div className="mt-2 grid gap-2">
                {(projectBackendState.recentActivity ?? []).slice(-6).map((event, index) => (
                  <button
                    key={`${event.action}-${event.createdAt ?? index}`}
                    type="button"
                    className="rounded-md border border-bolt-elements-borderColor p-3 text-left text-xs text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-3"
                    onClick={() => openWorkspacePanel('activity')}
                  >
                    <strong className="block text-bolt-elements-textPrimary">{event.action}</strong>
                    <span>{event.createdAt ? new Date(event.createdAt).toLocaleString() : 'Recorded by backend'}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="mt-2 rounded-md border border-bolt-elements-borderColor p-3 text-xs text-bolt-elements-textSecondary">
                No project notifications recorded yet.
              </div>
            )}
            {!isOnline && (
              <div className="mt-2 rounded-md border border-orange-500/40 bg-orange-500/10 p-3 text-xs text-orange-300">
                Poor connection detected. Terminal streams and preview refresh may pause.
              </div>
            )}
          </aside>
        )}
        {commandPaletteOpen && (
          <div className="bolt-project-command-palette" role="dialog" aria-modal="true" aria-label="Command palette">
            <input
              autoFocus
              placeholder="Search tools, files, and commands..."
              aria-label="Search commands"
              value={commandPaletteQuery}
              onChange={(event) => {
                setCommandPaletteQuery(event.currentTarget.value);
                setCommandPaletteIndex(0);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  setCommandPaletteOpen(false);
                } else if (event.key === 'ArrowDown') {
                  event.preventDefault();
                  setCommandPaletteIndex((index) => Math.min(index + 1, Math.max(commandPaletteEntries.length - 1, 0)));
                } else if (event.key === 'ArrowUp') {
                  event.preventDefault();
                  setCommandPaletteIndex((index) => Math.max(index - 1, 0));
                } else if (event.key === 'Enter') {
                  event.preventDefault();
                  runCommandPaletteEntry();
                }
              }}
            />
            {commandPaletteSections.map((section) => (
              <React.Fragment key={section.name}>
                <div className="bolt-project-command-section">{section.name}</div>
                {section.entries.map((entry) => {
                  const index = commandPaletteEntries.findIndex((item) => item.id === entry.id);

                  return (
                    <button
                      key={entry.id}
                      type="button"
                      aria-current={commandPaletteIndex === index ? 'page' : undefined}
                      onClick={() => {
                        runCommandPaletteEntry(entry);
                      }}
                    >
                      <span className={entry.icon} aria-hidden />
                      <span>
                        <strong>{entry.title}</strong>
                        <small>{entry.description}</small>
                      </span>
                      <kbd>{entry.shortcut || '↵'}</kbd>
                    </button>
                  );
                })}
              </React.Fragment>
            ))}
            {!commandPaletteEntries.length && (
              <div className="px-4 py-6 text-sm text-[#6E7681]">No matching command, tool, or file.</div>
            )}
            <footer>↑↓ navigate · ↵ select · esc close</footer>
          </div>
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
        {projectIdeMode && !useMobileIde && (
          <footer className="bolt-project-statusbar" aria-label="IDE status">
            <div>
              <span className="i-ph:git-branch" aria-hidden />
              <span>{projectBackendState.git?.branch ?? 'main'}</span>
              <span>
                ↑{projectBackendState.git?.ahead ?? 0} ↓{projectBackendState.git?.behind ?? 0}
              </span>
              <span className="i-ph:x-circle text-[#F85149]" aria-hidden />
              <span>0</span>
              <span className="i-ph:warning text-[#D29922]" aria-hidden />
              <span>{projectBackendState.git?.changedFiles?.length ?? 0}</span>
              <button type="button" onClick={() => openWorkspacePanel('preview')}>
                {projectStatusLabel(projectBackendState)}
              </button>
            </div>
            <div>
              <span>
                {currentDocument?.filePath && cursorPositions[currentDocument.filePath]
                  ? `Ln ${cursorPositions[currentDocument.filePath].line}, Col ${
                      cursorPositions[currentDocument.filePath].column
                    }`
                  : 'Ln 1, Col 1'}
              </span>
              <span>Spaces: 2</span>
              <span>UTF-8</span>
              <span>{fileTypeLabel(currentDocument?.filePath)}</span>
              <button
                type="button"
                aria-label="Toggle terminal"
                onClick={() => setTerminalBottomOpen((value) => !value)}
              >
                <span className="i-ph:terminal-window" aria-hidden />
              </button>
              <button type="button" aria-label="Toggle agent" onClick={() => textareaRef?.current?.focus()}>
                <span className="i-ph:sparkle" aria-hidden />
              </button>
              <button type="button" aria-label="Notifications" onClick={() => setShowNotifications((value) => !value)}>
                <span className="i-ph:bell" aria-hidden />
              </button>
            </div>
          </footer>
        )}
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

  const fetchPanel = useCallback(async (input: RequestInfo | URL, init?: RequestInit) => {
    let response = await fetch(input, init);

    if (response.status === 429) {
      const retryAfter = response.headers.get('retry-after');
      const retryMs = Math.min(5000, Math.max(750, Number(retryAfter ?? 1) * 1000 || 1200));
      await new Promise((resolve) => window.setTimeout(resolve, retryMs));
      response = await fetch(input, init);
    }

    return response;
  }, []);

  const loadPanel = useCallback(async () => {
    if (!projectId) {
      return;
    }

    setBusy(true);
    setError(undefined);

    try {
      const response = await fetchPanel(`/api/projects/${projectId}/ide-panel/${panel}`, {
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
  }, [fetchPanel, panel, projectId]);

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
      const response = await fetchPanel(`/api/projects/${projectId}/ide-panel/${panel}`, {
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

function ProjectBottomTerminal({ projectId, onClose }: { projectId?: string; onClose: () => void }) {
  const [active, setActive] = useState<'terminal' | 'output' | 'problems' | 'debug'>('terminal');

  return (
    <section className="bolt-project-bottom-terminal" aria-label="Pinned terminal">
      <div className="bolt-project-bottom-terminal-tabs">
        {[
          ['terminal', 'Terminal'],
          ['output', 'Output'],
          ['problems', 'Problems'],
          ['debug', 'Debug Console'],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-current={active === id ? 'page' : undefined}
            onClick={() => setActive(id as any)}
          >
            {label}
          </button>
        ))}
        <button type="button" className="ml-auto" aria-label="New terminal">
          +
        </button>
        <button type="button" aria-label="Close terminal panel" onClick={onClose}>
          ×
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {active === 'terminal' ? (
          <ProjectIdeServicePanel projectId={projectId} panel="logs" />
        ) : (
          <div className="h-full bg-[#0A0F1C] p-4 font-mono text-xs text-[#C2C8CC]">
            {active === 'problems'
              ? 'No runtime problems reported by the backend.'
              : `${active} stream is connected through workspace logs.`}
          </div>
        )}
      </div>
    </section>
  );
}

function ProjectFilesTool({
  files,
  selectedFile,
  unsavedFiles,
  onFilePreview,
  onFileOpen,
}: {
  files: any;
  selectedFile?: string;
  unsavedFiles?: Set<string>;
  onFilePreview: (filePath: string) => void;
  onFileOpen: (filePath: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const fileCount = Object.values(files ?? {}).filter((entry: any) => entry?.type === 'file').length;

  async function createEntry(kind: 'file' | 'folder') {
    const value = window.prompt(kind === 'file' ? 'New file path' : 'New folder path');
    const normalized = value?.trim();

    if (!normalized) {
      return;
    }

    const target = normalized.startsWith(WORK_DIR) ? normalized : `${WORK_DIR}/${normalized.replace(/^\/+/, '')}`;

    if (kind === 'file') {
      await workbenchStore.createFile(target, '');
      onFileOpen(target);
    } else {
      await workbenchStore.createFolder(target);
    }
  }

  return (
    <div className="bolt-project-files-tool">
      <div className="bolt-project-files-header">
        <div>
          <strong>workspace</strong>
          <span>{fileCount} files</span>
        </div>
        <button type="button" aria-label="New file" onClick={() => void createEntry('file')}>
          <span className="i-ph:file-plus" aria-hidden />
        </button>
        <button type="button" aria-label="New folder" onClick={() => void createEntry('folder')}>
          <span className="i-ph:folder-plus" aria-hidden />
        </button>
        <button type="button" aria-label="Refresh files" onClick={() => void workbenchStore.loadRuntimeFiles(WORK_DIR)}>
          <span className="i-ph:arrow-clockwise" aria-hidden />
        </button>
        <button type="button" aria-label="Collapse all files" onClick={() => setCollapsed((value) => !value)}>
          <span className="i-ph:caret-double-up" aria-hidden />
        </button>
      </div>
      <FileTree
        key={collapsed ? 'collapsed' : 'expanded'}
        className="bolt-project-file-tree"
        files={files}
        hideRoot
        collapsed={collapsed}
        unsavedFiles={unsavedFiles}
        rootFolder={WORK_DIR}
        selectedFile={selectedFile}
        onFileSelect={(filePath) => {
          workbenchStore.setSelectedFile(filePath);
          workbenchStore.currentView.set('code');
          workbenchStore.setShowWorkbench(true);
        }}
        onFilePreview={onFilePreview}
        onFileOpen={onFileOpen}
      />
    </div>
  );
}

function IdeTabBar({
  paneId,
  activePanel: _activePanel,
  activeTabId,
  tabs,
  trailing,
  onSelect,
  onClose,
  onOpenTool,
  onSplit,
  onPin,
  onCloseOthers,
  onCloseToRight,
  onCloseAll,
  recentFiles = [],
  onOpenFile,
  paneTargets,
  onMoveToNewPane,
  onMoveToExistingPane,
  onDragStart,
  onDropTab,
  onDragEnd,
}: {
  paneId: string;
  activePanel: IdeWorkspacePanel;
  activeTabId?: string;
  tabs: Array<{
    id: string;
    panel: IdeWorkspacePanel;
    label: string;
    icon: string;
    pinned?: boolean;
    preview?: boolean;
    dirty?: boolean;
    closable?: boolean;
    onSave?: () => void;
  }>;
  trailing?: React.ReactNode;
  onSelect: (tabId: string, panel: IdeWorkspacePanel) => void;
  onClose?: (tabId: string, panel: IdeWorkspacePanel) => void;
  onOpenTool?: (panel: IdeWorkspacePanel | IdeRightPanel) => void;
  onSplit?: (direction: IdePaneDirection) => void;
  onPin?: (tabId: string) => void;
  onCloseOthers?: (tabId: string) => void;
  onCloseToRight?: (tabId: string) => void;
  onCloseAll?: () => void;
  recentFiles?: string[];
  onOpenFile?: (filePath: string, preview: boolean) => void;
  paneTargets?: Array<{ id: string; label: string }>;
  onMoveToNewPane?: (tabId: string, zone: IdeDropZone) => void;
  onMoveToExistingPane?: (tabId: string, targetPaneId: string) => void;
  onDragStart?: (paneId: string, tabId: string) => void;
  onDropTab?: (paneId: string) => void;
  onDragEnd?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; tabId: string } | null>(null);
  const pointerDragStartRef = useRef<{ x: number; y: number; paneId: string; tabId: string } | null>(null);
  const startManualTabDrag = useCallback(
    (event: React.MouseEvent, tabId: string) => {
      if (event.button !== 0) {
        return;
      }

      const startX = event.clientX;
      const startY = event.clientY;
      let started = true;

      onDragStart?.(paneId, tabId);

      const onMove = (moveEvent: MouseEvent) => {
        if (started) {
          return;
        }

        if (Math.abs(moveEvent.clientX - startX) > 8 || Math.abs(moveEvent.clientY - startY) > 8) {
          started = true;
          onDragStart?.(paneId, tabId);
        }
      };

      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        onDragEnd?.();
      };

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [onDragEnd, onDragStart, paneId],
  );
  const tools: Array<[IdeWorkspacePanel | IdeRightPanel, string, string, string, string]> = [
    ['overview', 'Overview', 'Project summary', 'i-ph:gauge', '#0099FF'],
    ['files', 'Files', 'Browse project files', 'i-ph:files', '#D29922'],
    ['search', 'Search', 'Find in files', 'i-ph:magnifying-glass', '#0099FF'],
    ['logs', 'Console', 'Terminal', 'i-ph:terminal-window', '#3FB950'],
    ['preview', 'Webview', 'App preview', 'i-ph:browser', '#0099FF'],
    ['database', 'Database', 'SQL browser', 'i-ph:database', '#7B61FF'],
    ['object-storage', 'Object Storage', 'File storage', 'i-ph:package', '#D29922'],
    ['env', 'Env vars', 'Environment variables', 'i-ph:brackets-curly', '#D29922'],
    ['secrets', 'Secrets', 'Encrypted project secrets', 'i-ph:lock', '#D29922'],
    ['git', 'Git', 'Version control', 'i-ph:git-branch', '#3FB950'],
    ['packages', 'Packages', 'Dependencies manager', 'i-ph:cube', '#D29922'],
    ['deployments', 'Deployments', 'Publish your app', 'i-ph:rocket-launch', '#7B61FF'],
    ['monitoring', 'Monitoring', 'App metrics', 'i-ph:chart-line', '#0099FF'],
    ['extensions', 'Extensions', 'Marketplace', 'i-ph:puzzle-piece', '#C2C8CC'],
    ['snapshots', 'Snapshots', 'Rollback points', 'i-ph:stack', '#7B61FF'],
    ['activity', 'Activity', 'Project timeline', 'i-ph:activity', '#0099FF'],
    ['collaborators', 'Collaborators', 'Team access', 'i-ph:users', '#C2C8CC'],
    ['domains', 'Domains', 'Custom domains', 'i-ph:globe', '#0099FF'],
    ['settings', 'Settings', 'Project settings', 'i-ph:gear', '#C2C8CC'],
  ];

  return (
    <div
      className="bolt-project-tabbar"
      onMouseDownCapture={(event) => {
        const tabElement = (event.target as HTMLElement | null)?.closest<HTMLElement>('.bolt-project-tab');
        const tabId = tabElement?.dataset.tabId;

        if (tabId) {
          startManualTabDrag(event, tabId);
        }
      }}
      onDragOver={(event) => event.preventDefault()}
      onDrop={() => onDropTab?.(paneId)}
    >
      <div className="bolt-project-tabs" role="tablist">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            role="tab"
            data-tab-id={tab.id}
            draggable
            aria-selected={activeTabId === tab.id}
            className="bolt-project-tab"
            onDragStart={() => onDragStart?.(paneId, tab.id)}
            onDragEnd={() => onDragEnd?.()}
            onMouseDownCapture={(event) => startManualTabDrag(event, tab.id)}
            onPointerDown={(event) => {
              if (event.button !== 0) {
                return;
              }

              pointerDragStartRef.current = {
                x: event.clientX,
                y: event.clientY,
                paneId,
                tabId: tab.id,
              };
            }}
            onPointerMove={(event) => {
              const start = pointerDragStartRef.current;

              if (!start || event.buttons !== 1) {
                return;
              }

              if (Math.abs(event.clientX - start.x) > 8 || Math.abs(event.clientY - start.y) > 8) {
                onDragStart?.(start.paneId, start.tabId);
                pointerDragStartRef.current = null;
              }
            }}
            onPointerUp={() => {
              pointerDragStartRef.current = null;
            }}
            onContextMenu={(event) => {
              event.preventDefault();
              setContextMenu({ x: event.clientX, y: event.clientY, tabId: tab.id });
            }}
          >
            <button
              type="button"
              className="bolt-project-tab-main"
              draggable
              onClick={() => onSelect(tab.id, tab.panel)}
              onMouseDownCapture={(event) => startManualTabDrag(event, tab.id)}
              onDragStart={() => onDragStart?.(paneId, tab.id)}
              onDragEnd={() => onDragEnd?.()}
            >
              <span className={tab.pinned ? 'i-ph:push-pin-simple' : tab.icon} aria-hidden />
              <span className={tab.preview || tab.dirty ? 'italic' : ''}>{tab.label}</span>
            </button>
            {tab.dirty ? (
              <button
                type="button"
                className="bolt-project-tab-save"
                aria-label={`Save ${tab.label}`}
                onClick={(event) => {
                  event.preventDefault();
                  tab.onSave?.();
                }}
              >
                ●
              </button>
            ) : tab.closable && onClose ? (
              <button
                type="button"
                className="bolt-project-tab-close"
                aria-label={`Close ${tab.label}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onClose(tab.id, tab.panel);
                }}
              >
                ×
              </button>
            ) : (
              <span className="bolt-project-tab-close" aria-hidden>
                ×
              </span>
            )}
          </div>
        ))}
      </div>
      {contextMenu && (
        <div
          className="bolt-project-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onMouseLeave={() => setContextMenu(null)}
        >
          <button
            type="button"
            onClick={() => {
              onPin?.(contextMenu.tabId);
              setContextMenu(null);
            }}
          >
            Pin / unpin
          </button>
          <button
            type="button"
            onClick={() => {
              onMoveToNewPane?.(contextMenu.tabId, 'right');
              setContextMenu(null);
            }}
          >
            Move to new pane right
          </button>
          <button
            type="button"
            onClick={() => {
              onMoveToNewPane?.(contextMenu.tabId, 'bottom');
              setContextMenu(null);
            }}
          >
            Move to new pane down
          </button>
          <button
            type="button"
            onClick={() => {
              onMoveToNewPane?.(contextMenu.tabId, 'left');
              setContextMenu(null);
            }}
          >
            Move to new pane left
          </button>
          <button
            type="button"
            onClick={() => {
              onMoveToNewPane?.(contextMenu.tabId, 'top');
              setContextMenu(null);
            }}
          >
            Move to new pane up
          </button>
          {(paneTargets ?? []).map((pane) => (
            <button
              key={pane.id}
              type="button"
              onClick={() => {
                onMoveToExistingPane?.(contextMenu.tabId, pane.id);
                setContextMenu(null);
              }}
            >
              Move to existing pane - {pane.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              onCloseOthers?.(contextMenu.tabId);
              setContextMenu(null);
            }}
          >
            Close others
          </button>
          <button
            type="button"
            onClick={() => {
              onCloseToRight?.(contextMenu.tabId);
              setContextMenu(null);
            }}
          >
            Close to right
          </button>
        </div>
      )}
      {trailing}
      <div className="bolt-project-tool-popover">
        <button
          type="button"
          className="bolt-project-tab-action"
          aria-label="Open tool"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          +
        </button>
        {open && (
          <div className="bolt-project-tool-menu">
            <div className="bolt-project-tool-search">
              <span className="i-ph:magnifying-glass" aria-hidden />
              <input placeholder="Search tools and files..." aria-label="Search tools and files" />
            </div>
            <div className="bolt-project-tool-section">RECENT FILES</div>
            {recentFiles.slice(0, 5).map((filePath) => (
              <button
                key={`recent-file-${filePath}`}
                type="button"
                className="bolt-project-tool-item"
                onClick={() => {
                  setOpen(false);
                  onOpenFile?.(filePath, false);
                }}
              >
                <span className="i-ph:file-code" aria-hidden />
                <span>
                  <strong>{filePath.split('/').pop() || filePath}</strong>
                  <small>{filePath.replace(WORK_DIR, '')}</small>
                </span>
              </button>
            ))}
            {!recentFiles.length && <div className="bolt-project-tool-empty">No recent files loaded.</div>}
            <div className="bolt-project-tool-section">TOOLS</div>
            {tools.map(([id, title, description, icon, color]) => (
              <button
                key={id}
                type="button"
                className="bolt-project-tool-item"
                onClick={() => {
                  setOpen(false);
                  onOpenTool?.(id);
                }}
              >
                <span className={icon} style={{ color }} aria-hidden />
                <span>
                  <strong>{title}</strong>
                  <small>{description}</small>
                </span>
                {tabs.some((tab) => tab.panel === id) && <em>Open</em>}
              </button>
            ))}
          </div>
        )}
      </div>
      <button
        type="button"
        className="bolt-project-tab-action"
        aria-label="Split right"
        onClick={() => onSplit?.('horizontal')}
      >
        <span className="i-ph:columns" aria-hidden />
      </button>
      <button
        type="button"
        className="bolt-project-tab-action"
        aria-label="Split down"
        onClick={() => onSplit?.('vertical')}
      >
        <span className="i-ph:rows" aria-hidden />
      </button>
      <div className="bolt-project-tool-popover">
        <button
          type="button"
          className="bolt-project-tab-action"
          aria-label="Tab actions"
          aria-expanded={actionsOpen}
          onClick={() => setActionsOpen((value) => !value)}
        >
          <span className="i-ph:dots-three" aria-hidden />
        </button>
        {actionsOpen && (
          <div className="bolt-project-tab-actions-menu">
            <button
              type="button"
              onClick={() => {
                onCloseOthers?.(activeTabId ?? tabs[0]?.id);
                setActionsOpen(false);
              }}
            >
              Close others
            </button>
            <button
              type="button"
              onClick={() => {
                onCloseToRight?.(activeTabId ?? tabs[0]?.id);
                setActionsOpen(false);
              }}
            >
              Close to right
            </button>
            <button
              type="button"
              onClick={() => {
                onCloseAll?.();
                setActionsOpen(false);
              }}
            >
              Close all
            </button>
            <button
              type="button"
              onClick={() => {
                onCloseAll?.();
                setActionsOpen(false);
              }}
            >
              Close saved
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ProjectWelcomeState({
  files,
  onOpenTool,
}: {
  files: string[];
  onOpenTool?: (panel: IdeWorkspacePanel | IdeRightPanel) => void;
}) {
  const shortcuts: Array<[string, string, string, IdeWorkspacePanel | IdeRightPanel]> = [
    ['i-ph:files', 'Open Files', '⌘P', 'files'],
    ['i-ph:terminal-window', 'Open Console', '⌘`', 'logs'],
    ['i-ph:browser', 'View Preview', '⌘⇧V', 'preview'],
    ['i-ph:command', 'All Commands', '⌘K', 'settings'],
  ];

  return (
    <div className="bolt-project-welcome">
      <div className="bolt-project-welcome-logo">
        <span className="i-ph:sparkle" aria-hidden />
      </div>
      <h2>Bienvenue dans votre projet</h2>
      <p>Ouvrez un outil ou demandez à l'agent de commencer.</p>
      <div className="bolt-project-welcome-grid">
        {shortcuts.map(([icon, label, shortcut, panel]) => (
          <button key={label} type="button" className="bolt-project-welcome-card" onClick={() => onOpenTool?.(panel)}>
            <span className={icon} aria-hidden />
            <strong>{label}</strong>
            <small>{shortcut}</small>
          </button>
        ))}
      </div>
      <div className="bolt-project-welcome-recents">
        <span>Récents</span>
        {files.length ? (
          files.map((file) => (
            <button key={file} type="button">
              <span className="i-ph:file-code" aria-hidden />
              {file.replace(WORK_DIR, '')}
            </button>
          ))
        ) : (
          <small>No files loaded yet.</small>
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

  if (panel === 'database') {
    const databaseVars = (data.envVars ?? []).filter((item: any) => /DATABASE|POSTGRES|SQL/i.test(item.key));

    return (
      <div className="bolt-project-database-tool">
        <aside>
          <strong>Database</strong>
          {['Tables', 'Views', 'Functions'].map((section) => (
            <details key={section} open>
              <summary>{section}</summary>
              <button type="button">{section === 'Tables' ? 'project_metadata' : 'No entries'}</button>
            </details>
          ))}
        </aside>
        <main>
          <div className="bolt-project-tool-tabs">
            <button type="button" aria-current="page">
              Editor
            </button>
            <button type="button">Browse</button>
            <button type="button">Schema</button>
          </div>
          <form onSubmit={onSubmit} className="bolt-project-sql-editor">
            <textarea readOnly value="select * from project_metadata limit 50;" aria-label="SQL editor" />
            <PanelButton disabled={busy}>Run</PanelButton>
            <input name="key" value="DATABASE_URL" type="hidden" />
            <input name="value" placeholder="postgres://user:pass@host:5432/db" />
          </form>
          <PanelRows
            rows={
              databaseVars.length
                ? databaseVars.map((item: any) => [item.key, item.updatedAt ?? 'Stored in project environment'])
                : [['Database status', 'No database connection configured for this project']]
            }
            empty="Database metadata is not configured for this project."
          />
        </main>
      </div>
    );
  }

  if (panel === 'object-storage') {
    const storageVars = (data.envVars ?? []).filter((item: any) => /S3|STORAGE|BUCKET|R2/i.test(item.key));

    return (
      <PanelWithForm
        rows={
          storageVars.length
            ? storageVars.map((item: any) => [item.key, item.updatedAt ?? 'Stored in project environment'])
            : [
                ['Storage provider', 'No object storage bucket configured'],
                [
                  'Exports',
                  `${(data.recentActivity ?? []).filter((event: any) => event.action === 'project.export_zip').length} project exports recorded`,
                ],
              ]
        }
        empty="Object storage is not configured for this project."
        onSubmit={onSubmit}
        busy={busy}
        fields={[
          { name: 'key', placeholder: 'OBJECT_STORAGE_BUCKET', defaultValue: 'OBJECT_STORAGE_BUCKET', required: true },
          { name: 'value', placeholder: 'vibecore-project-assets', required: true },
        ]}
        submitLabel="Save storage config"
      />
    );
  }

  if (panel === 'packages') {
    const packageJson = (data.files ?? []).find((file: any) => String(file.path ?? '').endsWith('package.json'));

    return (
      <PanelRows
        rows={[
          ['Package manifest', packageJson ? packageJson.path : 'No package.json found in indexed project files'],
          ['Files indexed', String(data.files?.length ?? 0)],
        ]}
      />
    );
  }

  if (panel === 'monitoring') {
    return (
      <PanelRows
        rows={[
          ['Workspace status', data.workspace?.status ?? 'No active workspace'],
          ['Runtime mode', data.workspace?.runtimeMode ?? 'No runtime session'],
          ['Deployments', String(data.deployments?.length ?? 0)],
          ['Tracked files', String(data.files?.length ?? 0)],
          ['Recent activity', String(data.recentActivity?.length ?? 0)],
        ]}
      />
    );
  }

  if (panel === 'extensions') {
    return (
      <PanelWithForm
        rows={(data.deployments ?? [])
          .filter((deployment: any) => String(deployment.provider ?? '').startsWith('extension:'))
          .map((deployment: any) => [
            deployment.provider.replace('extension:', ''),
            deployment.createdAt ?? 'Installed',
          ])}
        empty="No project extensions installed yet."
        onSubmit={onSubmit}
        busy={busy}
        fields={[{ name: 'extension', placeholder: 'supabase', required: true }]}
        submitLabel="Install extension marker"
      />
    );
  }

  if (panel === 'logs') {
    const lines = [
      data.workspace
        ? `workspace:${data.workspace.id} status=${data.workspace.status} runtime=${data.workspace.runtimeMode}`
        : 'workspace:none recorded for this project',
      ...(data.recentActivity ?? []).map((event: any) => `${event.createdAt ?? 'recorded'} ${event.action}`),
    ];

    return (
      <div className="bolt-project-console-tool">
        <div className="bolt-project-console-header">
          <select aria-label="Shell">
            <option>bash</option>
            <option>zsh</option>
          </select>
          <button type="button">Clear</button>
          <button type="button">Split</button>
        </div>
        <div className="bolt-project-console-body">
          {lines.map((line: string) => (
            <div key={line}>{line}</div>
          ))}
        </div>
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
    const secrets = data.secrets ?? [];

    return (
      <div className="bolt-project-secrets-tool">
        <form onSubmit={onSubmit} className="bolt-project-inline-form">
          <PanelInput name="key" placeholder="STRIPE_SECRET_KEY" required />
          <PanelInput name="value" placeholder="Secret value" type="password" required />
          <PanelButton disabled={busy}>+ New secret</PanelButton>
        </form>
        <div className="bolt-project-secret-list">
          {secrets.length ? (
            secrets.map((secret: any) => (
              <div key={secret.key} className="bolt-project-secret-row">
                <strong>{secret.key}</strong>
                <span>••••••</span>
                <button type="button" aria-label={`Reveal ${secret.key}`}>
                  👁
                </button>
                <button type="button" aria-label={`Copy ${secret.key}`}>
                  Copy
                </button>
                <button type="button" aria-label={`Edit ${secret.key}`}>
                  Edit
                </button>
                <button type="button" aria-label={`Delete ${secret.key}`}>
                  Delete
                </button>
              </div>
            ))
          ) : (
            <div className="bolt-project-empty-panel">No project secrets.</div>
          )}
        </div>
      </div>
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
    const changedFiles = status.changedFiles ?? [];

    return (
      <div className="bolt-project-git-tool">
        <section>
          <h3>Changes</h3>
          {changedFiles.length ? (
            changedFiles.map((file: any) => (
              <label key={String(file.path ?? file)} className="bolt-project-git-file">
                <input type="checkbox" />
                <span>{String(file.path ?? file)}</span>
                <em>{String(file.status ?? 'M')}</em>
              </label>
            ))
          ) : (
            <div className="bolt-project-empty-panel">No changed files.</div>
          )}
          <h3>Staged</h3>
          <div className="bolt-project-empty-panel">Select files above to stage changes.</div>
          <h3>History</h3>
          <PanelRows
            rows={[
              ['Branch', branch],
              ['Ahead / behind', `${status.ahead ?? 0} / ${status.behind ?? 0}`],
              ['Remote', project.gitRepositoryUrl ?? 'No remote repository'],
            ]}
          />
        </section>
        <div className="grid gap-3">
          <form onSubmit={onSubmit} className="grid gap-3 rounded-lg border border-bolt-elements-borderColor p-3">
            <input name="intent" value="commit" type="hidden" />
            <textarea name="message" placeholder="Commit message" />
            <PanelButton disabled={busy}>Commit & Push</PanelButton>
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
    editor: 'Editor',
    preview: 'Webview',
    database: 'Database',
    'object-storage': 'Object Storage',
    packages: 'Packages',
    monitoring: 'Monitoring',
    extensions: 'Extensions',
    files: 'Files',
    search: 'Search',
    locks: 'Locks',
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
    editor: 'i-ph:code',
    preview: 'i-ph:browser',
    database: 'i-ph:database',
    'object-storage': 'i-ph:package',
    packages: 'i-ph:cube',
    monitoring: 'i-ph:chart-line',
    extensions: 'i-ph:puzzle-piece',
    files: 'i-ph:files',
    search: 'i-ph:magnifying-glass',
    locks: 'i-ph:lock',
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
