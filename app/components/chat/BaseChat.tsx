/* eslint-disable @typescript-eslint/ban-ts-comment, import/order */
// @ts-nocheck — Preventing TS checks. Must be a line comment, not a block, or tsc silently ignores the directive.
import * as Popover from '@radix-ui/react-popover';
import * as Tooltip from '@radix-ui/react-tooltip';
import { EditorAdapter } from '@vibecore/editor';
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  Title,
  Tooltip as ChartTooltip,
} from 'chart.js';
import type { JSONValue, Message } from 'ai';
import Cookies from 'js-cookie';
import { Copy, Download, Trash2, Users } from 'lucide-react';
import React, { lazy, Suspense, type RefCallback, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bar } from 'react-chartjs-2';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { ClientOnly } from 'remix-utils/client-only';
import { toast } from 'react-toastify';

import { AGENT_APPLIED_TOAST_ID, showCoalescedAppliedToast } from './AppliedFilesToast';
import {
  PNG_HEADER_SCAN_BYTES,
  decideImageAttachment,
  planImageReencode,
  pngHasAlpha,
  renderImageToCanvas,
} from './image-attachments';
import { clearComposerDraft, createComposerDraftWriter, readComposerDraft } from './composer-draft';
import { describeSkipReason, parseDotEnv } from './parse-dot-env';
import { AppliedFilesToastBuffer } from './applied-files-toast-buffer';
import {
  describeAutoApplyFailure,
  describeSnapshotRestoreFailure,
  isPanelAuthError,
  panelAuthRedirectTarget,
  shouldSuppressAutoApplyFailureToast,
} from './base-chat-panels';

import { getApiKeysFromCookies } from './APIKeyManager';
import styles from './BaseChat.module.scss';
import ChatAlert from './ChatAlert';
import {
  bucketEventsByTime as bucketEventsByTimeHelper,
  deploymentStatusColor,
  partitionMonitoringEvents as partitionMonitoringEventsHelper,
} from './projectMonitoring';
import { formatRailBadgeValue } from '~/lib/labels/rail-badge';
import {
  pairCheckpointsToSnapshots,
  type CheckpointTurn,
  type CheckpointSnapshotPairing,
} from '~/lib/chat/checkpoint-snapshots';
import { useAutoApplyEnabled } from '~/lib/hooks/useAutoApplyEnabled';
import { autoApplyAttemptKey, shouldAutoApplyPatch } from '~/utils/agent-auto-apply';
import GitCloneButton from './GitCloneButton';
import { AgentRepairHistory } from './AgentRepairHistory';
import { ConversationBranchesMenu } from './ConversationBranchesMenu';
import { Messages } from './Messages.client';
import { projectAiMessagesToChatMessages, type ProjectAiMessagesResponse } from './projectAiTranscript';
import { ShareConversationButton } from './ShareConversationButton';
import { ImportButtons } from '~/components/chat/chatExportAndImport/ImportButtons';
import { DatabaseWorkbench } from '~/components/database/DatabaseWorkbench';
import { FileSaveConflictDialog } from '~/components/workbench/FileSaveConflictDialog';
import { Menu } from '~/components/sidebar/Menu.client';
import { ConfirmationDialog } from '~/components/ui/Dialog';
import { EmptyState } from '~/components/ui/EmptyState';
import { InputDialog } from '~/components/ui/InputDialog';
import { PanelBoundary, PanelErrorBoundary, PanelLoading, ZoneErrorBoundary } from '~/components/ui/PanelBoundary';
import { ThemeSwitch } from '~/components/ui/ThemeSwitch';
import { FileTree } from '~/components/workbench/FileTree';
import { Preview } from '~/components/workbench/Preview';
import { Search } from '~/components/workbench/Search';
import { LockManager } from '~/components/workbench/LockManager';
import { ProjectAgentRunStatus } from '~/components/project-ide/ProjectAgentRunStatus';
import { ProjectEditorToolbar } from '~/components/project-ide/ProjectEditorToolbar';
import { ProjectOverviewPanel } from '~/components/project-ide/ProjectOverviewPanel';
import {
  PROJECT_AGENT_PANEL_MIN_WIDTH,
  clampProjectAgentPanelWidth,
  defaultProjectAgentPanelWidth,
  projectAgentStopLabel,
} from '~/lib/project-agent-layout';
import type { FileMap } from '~/lib/stores/files';
import { buildRuntimeDiagnostics, useDiagnosticsStore, type Diagnostic } from '~/lib/stores/diagnostics';
import { workbenchStore } from '~/lib/stores/workbench';
import { DEFAULT_THEME, applyThemeToDocument, kTheme, themeStore, toggleTheme, type Theme } from '~/lib/stores/theme';
import type { ProviderInfo } from '~/types/model';
import { classNames } from '~/utils/classNames';
import { PROVIDER_LIST, WORK_DIR } from '~/utils/constants';
import { buildGitStatusMap } from '~/utils/fileExplorerMetadata';
import { ExamplePrompts } from '~/components/chat/ExamplePrompts';
import { GenerateAppCta } from '~/components/chat/GenerateAppCta';
import { GitTab } from '~/components/git/GitTab';
import StarterTemplates from './StarterTemplates';
import type { ActionAlert, SupabaseAlert, DeployAlert, LlmErrorAlertType } from '~/types/actions';
import DeployChatAlert from '~/components/deploy/DeployAlert';
import {
  BOLT_DEPLOY_PROVIDERS,
  DEFAULT_DEPLOY_BUILD_COMMAND,
  DEFAULT_DEPLOY_OUTPUT_DIRECTORY,
  detectFrameworkFromDeployConfig,
} from '~/components/deploy/deployUtils';
import type { ModelInfo } from '~/lib/modules/llm/types';
import { useProjectCollaboration } from '~/lib/collaboration/useProjectCollaboration';

const LazyWorkbench = lazy(() =>
  import('~/components/workbench/Workbench.client').then((module) => ({ default: module.Workbench })),
);
const LazyTerminalTabs = lazy(() =>
  import('~/components/workbench/terminal/TerminalTabs').then((module) => ({ default: module.TerminalTabs })),
);
import ProgressCompilation from './ProgressCompilation';
import type { ProgressAnnotation } from '~/types/context';
import { SupabaseChatAlert } from '~/components/chat/SupabaseAlert';
import { expoUrlAtom } from '~/lib/stores/qrCodeStore';
import { useStore } from '@nanostores/react';
import { StickToBottom, useKeybindings, useStickToBottomContext } from '~/lib/hooks';
import { useTextDirection } from '~/lib/i18n/direction';
import { ChatBox } from './ChatBox';
import { HeaderOverflowMenu } from './HeaderOverflowMenu';
import { modelListFromResponse } from './modelList';
import type { DesignScheme } from '~/types/design-scheme';
import type { ElementInfo } from '~/components/workbench/Inspector';
import LlmErrorAlert from './LLMApiAlert';
import { editorKindForLayout, useResponsiveLayout } from '@vibecore/editor';
import { useSwipeGesture } from '~/lib/hooks/useMobileGestures';
import { useMobileIdePersistence } from '~/lib/hooks/useMobileIdePersistence';
import { useProjectChatBranches } from '~/lib/hooks/useProjectChatBranches';
import {
  getProjectIdeMemory,
  saveProjectIdeMemory,
  subscribeProjectIdeMemory,
  type ProjectIdeMemory,
} from '~/lib/persistence/projectIdeMemory';
import { hasLivePreviewPort, isWorkspaceReallyRunning, workspaceUiState } from '~/lib/runtime/workspace-status';
import { useCurrentWorkspaceId } from '~/lib/runtime/CurrentWorkspaceContext';
import { useNavigate, useSearchParams } from 'react-router';
import { readPanelSearchParam, withPanelSearchParam } from '~/utils/project-ide-panel-url';
import {
  type CompactPreviewRunState,
  compactPreviewRunAriaLabel,
  compactPreviewRunIcon,
  isCompactPreviewRunActive,
  resolveCompactPreviewRunState,
} from '~/lib/runtime/preview-run-state';
import {
  formatProjectPanelRefreshCadence,
  formatProjectPanelUpdatedLabel,
  projectPanelRefreshIntervalMs,
} from '~/utils/project-panel-refresh';
import { countHiddenMobileBottomTabs, selectVisibleMobileBottomTabs } from '~/lib/mobile-bottom-tabs';
import {
  ECODE_MOBILE_MORE_ITEMS,
  ECODE_MOBILE_TOOLS,
  MOBILE_TOOL_TO_MANAGEMENT_PANEL,
  SHELL_TERMINAL_LABEL,
} from '~/lib/mobile-ide-tabs';
import {
  applyKeybindingOverrides,
  defaultProjectKeybindings,
  detectKeybindingConflicts,
  formatKeybindingCombo,
  type Keybinding,
  type KeybindingOverrideMap,
} from '~/lib/keybindings';
import { useFocusTrap } from '~/lib/use-focus-trap';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, ChartTooltip, Legend);

const TEXTAREA_MIN_HEIGHT = 76;
const PROJECT_BOTTOM_TERMINAL_UI_STORAGE_KEY = 'vibecore-project-bottom-terminal-ui-v1';
const PROJECT_IDE_GUIDED_TOUR_STORAGE_KEY = 'vibecore-project-ide-guided-tour-v1';
const PROJECT_SECURITY_SCAN_TIMEOUT_MS = 90_000;
const PROJECT_IDE_STATE_RESTORE_FALLBACK_MS = 6_000;
const PROJECT_KEYBINDINGS = defaultProjectKeybindings;
type ProjectThemePreference = Theme | 'system';

function isProjectThemePreference(preference: unknown): preference is ProjectThemePreference {
  return preference === 'dark' || preference === 'light' || preference === 'system';
}

function resolveProjectThemePreference(preference: unknown): Theme {
  if (!isProjectThemePreference(preference)) {
    return DEFAULT_THEME;
  }

  if (preference === 'dark' || preference === 'light') {
    return preference;
  }

  /*
   * 'system' / unset → respect the user's persisted toggle if they have one, else
   * the app default (light, matching Replit). We intentionally do NOT follow the OS
   * color-scheme: it made the IDE dark on dark-mode machines and persisted that to
   * bolt_theme, flipping the whole app to dark and overriding both the light default
   * and an explicit light toggle.
   */
  if (typeof localStorage !== 'undefined') {
    const persisted = localStorage.getItem(kTheme);

    if (persisted === 'dark' || persisted === 'light') {
      return persisted;
    }
  }

  return DEFAULT_THEME;
}

function applyProjectThemePreference(preference: unknown): Theme {
  const resolvedTheme = resolveProjectThemePreference(preference);

  themeStore.set(resolvedTheme);

  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(kTheme, resolvedTheme);
  }

  applyThemeToDocument(resolvedTheme);

  return resolvedTheme;
}

const IDE_TOOLTIP_HELP: Record<string, { description: string; shortcut?: string }> = {
  Agent: { description: 'Focus the AI agent composer and project instructions.', shortcut: 'Cmd+J' },
  'Add tab': { description: 'Open another editor, terminal, preview or project panel.', shortcut: 'Ctrl+T' },
  'Close terminal panel': {
    description: 'Hide the bottom terminal drawer without stopping the workspace.',
    shortcut: 'Esc',
  },
  'Close split': { description: 'Return logs to a single stream view.' },
  'Copy preview URL': { description: 'Copy the current preview address to your clipboard.', shortcut: 'Cmd+Shift+C' },
  'Enable inspect to code': {
    description: 'Click an element in preview and jump to its source file.',
    shortcut: 'Cmd+Shift+I',
  },
  'Exit Full Screen': { description: 'Leave full-screen preview mode.', shortcut: 'Esc' },
  'Focus agent composer': { description: 'Jump back to the AI prompt input.', shortcut: 'Cmd+J' },
  'Full Screen': { description: 'Expand the preview to inspect the app without panels.', shortcut: 'F' },
  'Go to definition': {
    description: 'Jump to the symbol definition from the current editor context.',
    shortcut: 'F12',
  },
  'Hide minimap': { description: 'Hide the code overview strip in the editor.' },
  'More editor status': { description: 'Show cursor, indentation, encoding and language details.' },
  'Open in browser': { description: 'Open the preview URL in a separate browser tab.', shortcut: 'Cmd+Enter' },
  'Open refactor menu': { description: 'Show available code actions and refactors.', shortcut: 'Ctrl+.' },
  'Preview window options': { description: 'Adjust preview window and device display options.' },
  'Refresh preview': { description: 'Reload the embedded web preview.', shortcut: 'Cmd+R' },
  'Refresh runtime logs': { description: 'Refresh terminal and runtime state from the workspace.', shortcut: 'R' },
  'Rename symbol': { description: 'Rename the current symbol across references.', shortcut: 'F2' },
  'Resize AI agent panel': { description: 'Drag to give the agent or workbench more room.' },
  'Resize files panel': { description: 'Drag to resize the file browser and project tools.' },
  'Show editor status details': { description: 'Open the full editor status list.' },
  'Show QR': { description: 'Open a QR code for testing the preview on a mobile device.' },
  'Show minimap': { description: 'Show the code overview strip in the editor.' },
  'Split view': { description: 'Show another log stream beside the current one.', shortcut: 'Cmd+\\' },
  'Toggle split log view': { description: 'Show another log stream beside the current one.', shortcut: 'Cmd+\\' },
  'Tab actions': { description: 'Open tab actions such as close, split and pin.' },
  'Toggle live tail': { description: 'Keep logs pinned to the newest entry while output streams.', shortcut: 'T' },
  'Toggle terminal': { description: 'Show or hide the pinned shell terminal drawer.', shortcut: 'Ctrl+`' },
};

const IDE_RAIL_TOOLTIP_HELP: Record<string, { description: string; shortcut?: string }> = {
  Agent: { description: 'Focus the AI agent composer and project instructions.', shortcut: 'Cmd+J' },
  Files: { description: 'Open the project file browser and workspace views.', shortcut: 'Cmd+Shift+E' },
  Editor: { description: 'Return to the active code editor tab.', shortcut: 'Cmd+E' },
  Terminal: { description: 'Open the workspace shell terminal drawer.', shortcut: 'Ctrl+`' },
  [SHELL_TERMINAL_LABEL]: { description: 'Open the workspace shell terminal drawer.', shortcut: 'Ctrl+`' },
  Preview: { description: 'Open the live web preview panel.', shortcut: 'Cmd+Enter' },
  Publish: { description: 'Open deployments, domains and publishing tools.', shortcut: 'Cmd+Shift+P' },
  Search: { description: 'Search project files and symbols.', shortcut: 'Cmd+P' },
  Git: { description: 'Open version control, branches and changes.', shortcut: 'Ctrl+Shift+G' },
  Database: { description: 'Open database connections, query tools and schema browser.' },
  Packages: { description: 'Manage dependencies, manifests and package audits.' },
  Monitoring: { description: 'Inspect runtime health, activity and metrics.' },
  Security: { description: 'Run scans and review vulnerabilities.' },
  Activity: { description: 'Open the project audit timeline and workspace events.' },
  Settings: { description: 'Open workspace and personal IDE settings.', shortcut: 'Cmd+,' },
};

const PROJECT_IDE_TOUR_STEPS = [
  {
    selector: '.bolt-project-agent-panel',
    title: 'Project assistant',
    description:
      'Describe what you want to build, fix or refactor. Use Plan first when you want approval before edits.',
    shortcut: 'Cmd+J',
  },
  {
    selector: '.bolt-project-ide-rail',
    title: 'IDE rail',
    description: 'Switch between files, editor, terminal, preview and publishing. Hover any icon for its purpose.',
  },
  {
    selector: '.bolt-project-tabbar',
    title: 'Workspace tabs',
    description: 'Pin, split and reorder your active work surfaces without losing context.',
    shortcut: 'Ctrl+T',
  },
  {
    selector: '.bolt-project-statusbar',
    title: 'Status bar',
    description: 'Runtime, Git, Problems and Preview state live here. Details move into menus as space gets tight.',
  },
  {
    selector: '.bolt-project-topbar-actions',
    title: 'Topbar actions',
    description: 'Run, Publish and Share stay visible. Secondary actions and notifications are under More.',
  },
] as const;

function readProjectBottomTerminalUiState() {
  if (typeof window === 'undefined') {
    return { height: 420, open: false, stored: false };
  }

  try {
    const stored = window.localStorage.getItem(PROJECT_BOTTOM_TERMINAL_UI_STORAGE_KEY);
    const parsed = JSON.parse(stored ?? '{}');

    return {
      height: typeof parsed.height === 'number' ? Math.min(720, Math.max(320, parsed.height)) : 420,
      open: typeof parsed.open === 'boolean' ? parsed.open : false,
      stored: Boolean(stored),
    };
  } catch {
    return { height: 420, open: false, stored: false };
  }
}

const IDE_MANAGEMENT_PANELS = [
  'overview',
  'studio',
  'database',
  'object-storage',
  'packages',
  'skills',
  'monitoring',
  'ports',
  'extensions',
  'integrations',
  'workflows',
  'debugger',
  'deployments',
  'security',
  'env',
  'secrets',
  'git',
  'activity',
  'terminal',
  'logs',
  'collaborators',
  'domains',
  'snapshots',
  'settings',
] as const;

const IDE_RIGHT_PANELS = ['files'] as const;
const IDE_WORKSPACE_PANELS = ['editor', 'preview', 'files', 'search', 'locks', ...IDE_MANAGEMENT_PANELS] as const;
const IDE_URL_PANELS = [...IDE_WORKSPACE_PANELS, ...IDE_RIGHT_PANELS] as const;
const MOBILE_IDE_PANELS = ['chat', 'files', 'editor', 'search', 'locks', 'terminal', 'preview', 'deploy'] as const;

const ECODE_MOBILE_DEFAULT_TABS = ['editor', 'preview', 'agent', 'deployments'] as const;
const MOBILE_OVERLAY_RESTORE_WINDOW_MS = 120_000;
type MobileOverlayKind = 'tools' | 'tabs' | 'more' | 'agent';

const ECODE_MOBILE_TAB_META: Record<string, { id: string; name: string; icon: string }> = {
  preview: { id: 'preview', name: 'Webview', icon: 'i-ph:monitor' },
  agent: { id: 'agent', name: 'Agent', icon: 'agent' },
  deploy: { id: 'deploy', name: 'Deployments', icon: 'i-ph:rocket-launch' },
  deployments: { id: 'deployments', name: 'Deployments', icon: 'i-ph:rocket-launch' },
  files: { id: 'files', name: 'Library', icon: 'i-ph:folder-open' },
  editor: { id: 'editor', name: 'Editor', icon: 'i-ph:code' },
  search: { id: 'search', name: 'Search', icon: 'i-ph:magnifying-glass' },
  locks: { id: 'locks', name: 'Locks', icon: 'i-ph:lock' },
  terminal: { id: 'terminal', name: SHELL_TERMINAL_LABEL, icon: 'i-ph:terminal-window' },
  actions: { id: 'actions', name: 'Agent', icon: 'agent' },
  assistant: { id: 'assistant', name: 'Agent', icon: 'agent' },
  publishing: { id: 'publishing', name: 'Deployments', icon: 'i-ph:rocket-launch' },
  'app-storage': { id: 'app-storage', name: 'Object Storage', icon: 'i-ph:hard-drives' },
  auth: { id: 'auth', name: 'Settings', icon: 'i-ph:gear' },
  console: { id: 'console', name: SHELL_TERMINAL_LABEL, icon: 'i-ph:terminal-window' },
  database: { id: 'database', name: 'Database', icon: 'i-ph:database' },
  debug: { id: 'debug', name: 'Debugger', icon: 'i-ph:bug' },
  debugger: { id: 'debugger', name: 'Debugger', icon: 'i-ph:bug' },
  developer: { id: 'developer', name: 'Debugger', icon: 'i-ph:bug' },
  git: { id: 'git', name: 'Git', icon: 'i-ph:git-branch' },
  history: { id: 'history', name: 'Activity', icon: 'i-ph:activity' },
  activity: { id: 'activity', name: 'Activity', icon: 'i-ph:activity' },
  integrations: { id: 'integrations', name: 'Integrations', icon: 'i-ph:package' },
  multiplayer: { id: 'multiplayer', name: 'Collaborators', icon: 'i-ph:users' },
  collaboration: { id: 'collaboration', name: 'Collaborators', icon: 'i-ph:users' },
  collaborate: { id: 'collaborate', name: 'Collaborators', icon: 'i-ph:users' },
  collaborators: { id: 'collaborators', name: 'Collaborators', icon: 'i-ph:users' },
  packages: { id: 'packages', name: 'Packages', icon: 'i-ph:package' },
  skills: { id: 'skills', name: 'Skills', icon: 'i-ph:sparkle' },
  secrets: { id: 'secrets', name: 'Secrets', icon: 'i-ph:lock' },
  settings: { id: 'settings', name: 'Settings', icon: 'i-ph:gear' },
  workflows: { id: 'workflows', name: 'Workflows', icon: 'i-ph:git-branch' },
  checkpoints: { id: 'checkpoints', name: 'Snapshots', icon: 'i-ph:stack' },
  snapshots: { id: 'snapshots', name: 'Snapshots', icon: 'i-ph:stack' },
  extensions: { id: 'extensions', name: 'Extensions', icon: 'i-ph:puzzle-piece' },
  security: { id: 'security', name: 'Security', icon: 'i-ph:shield-check' },
  shell: { id: 'shell', name: SHELL_TERMINAL_LABEL, icon: 'i-ph:terminal-window' },
  'kv-store': { id: 'kv-store', name: 'Database', icon: 'i-ph:database' },
  storage: { id: 'storage', name: 'Object Storage', icon: 'i-ph:hard-drives' },
  'object-storage': { id: 'object-storage', name: 'Object Storage', icon: 'i-ph:hard-drives' },
  env: { id: 'env', name: 'Environment variables', icon: 'i-ph:brackets-curly' },
  logs: { id: 'logs', name: 'Logs', icon: 'i-ph:list-magnifying-glass' },
  monitoring: { id: 'monitoring', name: 'Monitoring', icon: 'i-ph:chart-line' },
  ports: { id: 'ports', name: 'Ports', icon: 'i-ph:plugs' },
  domains: { id: 'domains', name: 'Domains', icon: 'i-ph:globe' },
  overview: { id: 'overview', name: 'Overview', icon: 'i-ph:gauge' },
  studio: { id: 'studio', name: 'Agent Studio', icon: 'i-ph:robot' },
  web: { id: 'web', name: 'Webview', icon: 'i-ph:monitor' },
  tools: { id: 'tools', name: 'Tools', icon: 'i-ph:stack' },
};

const IDE_FILE_TREE_HIDDEN_PATTERNS = [
  /\/node_modules(?:\/|$)/,
  /\/\.next(?:\/|$)/,
  /\/\.astro(?:\/|$)/,
  /\/\.vite(?:\/|$)/,
  /\/deps_temp_[^/]+(?:\/|$)/,

  // ext4 filesystem artifact at the volume root of a fresh workspace — not a user file.
  /\/lost\+found(?:\/|$)/,
];

const IDE_TOOL_DESCRIPTIONS: Record<IdeWorkspacePanel | IdeRightPanel, string> = {
  overview: 'Project summary',
  studio: 'Agent supervisor',
  database: 'SQL browser',
  'object-storage': 'File storage',
  packages: 'Dependencies manager',
  skills: 'Agent skills',
  monitoring: 'App metrics',
  ports: 'Forwarded ports',
  extensions: 'Marketplace',
  integrations: 'Connected services',
  workflows: 'Task automation',
  debugger: 'Breakpoints and launch configs',
  deployments: 'Publish your app',
  security: 'Security scanner',
  env: 'Environment variables',
  secrets: 'Environment variables',
  git: 'Version control',
  activity: 'Project timeline',
  terminal: 'Workspace shell terminal',
  logs: 'Runtime logs',
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
type IdeManagementPanel = (typeof IDE_MANAGEMENT_PANELS)[number];
type IdeWorkspacePanel = (typeof IDE_WORKSPACE_PANELS)[number];
type IdePaneTab = {
  id: string;
  panel: IdeWorkspacePanel;
  pinned?: boolean;
  filePath?: string;
  preview?: boolean;
};
type ProjectBottomTerminalView = 'terminal' | 'output' | 'problems' | 'debug';
type AgentToolAction = {
  panel: IdeWorkspacePanel | IdeRightPanel;
  title: string;
  description: string;
  icon: string;
};

const ECODE_MOBILE_MANAGEMENT_PANEL_TABS: Partial<Record<IdeManagementPanel, string>> = {};
type ProjectSnapshot = {
  id: string;
  label?: string;
  kind?: string;
  manifest?: unknown;
  createdByUserId?: string;
  createdAt?: string;
  byteLength?: number;
  conversationId?: string;
  turnIndex?: number;
};
type ProjectConversationCheckpoint = {
  id: string;
  title: string;
  description: string;
  messageId?: string;
  messageIndex: number;
  conversationId: string;
  conversationTitle: string;
  createdAt?: string;
  ageLabel: string;
  commitSha?: string;
  snapshot?: ProjectSnapshot;
  messages: Message[];
  backendConversationId?: string;
};
type ProjectAgentSuggestion = {
  id: string;
  label: string;
  prompt: string;
  reason: string;
  icon: string;
  priority: number;
};
type ProjectAgentExecutionMode = 'ask' | 'edit' | 'agent' | 'architect';

const PROJECT_AGENT_EXECUTION_MODES: Array<{
  id: ProjectAgentExecutionMode;
  label: string;
  chatMode: 'discuss' | 'build';
  description: string;
  placeholder: string;
}> = [
  {
    id: 'ask',
    label: 'Ask',
    chatMode: 'discuss',
    description: 'Answer, explain, and inspect without changing files or running commands.',
    placeholder: 'Ask anything about this project…',
  },
  {
    id: 'edit',
    label: 'Edit',
    chatMode: 'build',
    description: 'Make scoped code changes only after identifying the target files.',
    placeholder: 'Describe a scoped edit, e.g. "Add a logout button to the navbar"…',
  },
  {
    id: 'agent',
    label: 'Agent',
    chatMode: 'build',
    description: 'Execute the requested task end to end with verification.',
    placeholder: 'Describe what you want the agent to build, fix or refactor…',
  },
  {
    id: 'architect',
    label: 'Architect',
    chatMode: 'discuss',
    description: 'Design architecture, contracts, risks, and rollout steps before implementation.',
    placeholder: 'Describe the system to design — goals, constraints, integrations…',
  },
];

type ProjectAgentPublicMode = 'agent' | 'assistant';

const PROJECT_AGENT_PUBLIC_MODES: Array<{
  id: ProjectAgentPublicMode;
  label: string;
  description: string;
  execution: ProjectAgentExecutionMode;
}> = [
  {
    id: 'agent',
    label: 'Agent',
    description: 'Run the selected task end to end.',
    execution: 'agent',
  },
  {
    id: 'assistant',
    label: 'Assistant',
    description: 'Conversational — answers questions and proposes scoped edits but waits for your go.',
    execution: 'ask',
  },
];

/*
 * Shared ARIA "tabs" keyboard handler (roving tabindex, manual activation):
 * Arrow/Home/End move focus between the role="tab" children of the tablist; the
 * focused tab is then activated by Enter/Space (native for <button> tabs, handled
 * explicitly for non-button tabs). Manual activation keeps it valid for tab
 * elements that can't be a <button> (e.g. ones that contain their own buttons).
 */
function moveTabFocus(event: React.KeyboardEvent<HTMLElement>) {
  const navKeys = ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'Home', 'End'];

  if (!navKeys.includes(event.key)) {
    return;
  }

  const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]')).filter(
    (el) => !el.hasAttribute('disabled'),
  );

  if (tabs.length === 0) {
    return;
  }

  event.preventDefault();

  const current = tabs.indexOf(document.activeElement as HTMLElement);

  let next = current;

  switch (event.key) {
    case 'ArrowRight':
    case 'ArrowDown':
      next = current < 0 ? 0 : (current + 1) % tabs.length;
      break;
    case 'ArrowLeft':
    case 'ArrowUp':
      next = current < 0 ? 0 : (current - 1 + tabs.length) % tabs.length;
      break;
    case 'Home':
      next = 0;
      break;
    case 'End':
      next = tabs.length - 1;
      break;
  }

  const target = tabs[next];
  target?.focus();
}

function publicModeForExecution(execution: ProjectAgentExecutionMode): ProjectAgentPublicMode {
  if (execution === 'agent' || execution === 'architect') {
    return 'agent';
  }

  return 'assistant';
}

const INTEGRATION_CATALOG = [
  ['github', 'GitHub', 'Connect repositories for code sync and CI/CD.', 'cicd', 'i-ph:github-logo'],
  ['slack', 'Slack', 'Send build, deploy and incident notifications to channels.', 'communication', 'i-ph:slack-logo'],
  ['jira', 'Jira', 'Sync issues and delivery work across projects.', 'project', 'i-ph:kanban'],
  ['notion', 'Notion', 'Sync docs and product notes with project context.', 'project', 'i-ph:notion-logo'],
  ['gitlab', 'GitLab', 'Alternative Git hosting and CI pipelines.', 'cicd', 'i-ph:gitlab-logo'],
  ['discord', 'Discord', 'Send workspace notifications to Discord.', 'communication', 'i-ph:discord-logo'],
  ['trello', 'Trello', 'Visual boards and cards for product work.', 'project', 'i-ph:columns'],
  ['asana', 'Asana', 'Team work management and task tracking.', 'project', 'i-ph:list-checks'],
  ['figma', 'Figma', 'Design collaboration and handoff links.', 'project', 'i-ph:figma-logo'],
  ['linear', 'Linear', 'Issues, sprints and roadmaps.', 'project', 'i-ph:chart-line-up'],
  ['zendesk', 'Zendesk', 'Support tickets and customer operations.', 'support', 'i-ph:headset'],
  ['datadog', 'Datadog', 'Infrastructure and application monitoring.', 'observability', 'i-ph:chart-line'],
  ['sentry', 'Sentry', 'Error tracking and release health.', 'observability', 'i-ph:warning-diamond'],
  ['pagerduty', 'PagerDuty', 'Incident routing and on-call escalation.', 'observability', 'i-ph:bell-ringing'],
  ['newrelic', 'New Relic', 'Full-stack observability data.', 'observability', 'i-ph:pulse'],
  ['grafana', 'Grafana', 'Dashboards and metrics visualization.', 'observability', 'i-ph:gauge'],
  ['jenkins', 'Jenkins', 'Self-hosted automation server.', 'cicd', 'i-ph:factory'],
  ['circleci', 'CircleCI', 'Continuous integration and delivery.', 'cicd', 'i-ph:circle'],
  ['github-actions', 'GitHub Actions', 'Repository-native workflow automation.', 'cicd', 'i-ph:git-branch'],
  ['vercel', 'Vercel', 'Deploy and host modern web apps.', 'cicd', 'i-ph:triangle'],
  ['aws-s3', 'AWS S3', 'Object storage for assets and exports.', 'data', 'i-ph:cloud'],
  ['mongodb', 'MongoDB', 'Document database integration.', 'data', 'i-ph:database'],
  ['postgresql', 'PostgreSQL', 'Relational database integration.', 'data', 'i-ph:database'],
  ['redis', 'Redis', 'In-memory cache and queue service.', 'data', 'i-ph:stack'],
  ['elasticsearch', 'Elasticsearch', 'Search and analytics indexing.', 'data', 'i-ph:magnifying-glass'],
  ['stripe', 'Stripe', 'Payments, billing and webhook events.', 'payments', 'i-ph:credit-card'],
  ['twilio', 'Twilio', 'SMS, voice and communications APIs.', 'communication', 'i-ph:phone'],
  ['resend', 'Resend', 'Transactional email delivery.', 'communication', 'i-ph:paper-plane-tilt'],
  ['intercom', 'Intercom', 'Customer messaging and support.', 'support', 'i-ph:chat-circle-text'],
  ['hubspot', 'HubSpot', 'CRM and marketing automation.', 'support', 'i-ph:users-three'],
  ['salesforce', 'Salesforce', 'Enterprise CRM workflows.', 'support', 'i-ph:building-office'],
  ['zapier', 'Zapier', 'Cross-tool workflow automation.', 'automation', 'i-ph:lightning'],
] as const;
const INTEGRATION_CATEGORIES = [
  ['all', 'All Integrations', 'i-ph:link'],
  ['cicd', 'CI/CD', 'i-ph:rocket-launch'],
  ['observability', 'Observability', 'i-ph:chart-line'],
  ['communication', 'Communication', 'i-ph:globe'],
  ['project', 'Project Management', 'i-ph:kanban'],
  ['support', 'Support', 'i-ph:headset'],
  ['data', 'Data & Storage', 'i-ph:database'],
  ['payments', 'Payments', 'i-ph:shield-check'],
  ['automation', 'Automation', 'i-ph:hard-drives'],
] as const;

/*
 * The access an integration in each category is granted, surfaced BEFORE the
 * user connects (and again while connected, next to the revoke control) so the
 * consent is informed. Scoped by category because the connect flow authorizes a
 * pasted API token rather than a per-scope OAuth grant.
 */
const INTEGRATION_PERMISSIONS: Record<string, string[]> = {
  cicd: [
    'Read repository and pipeline metadata',
    'Trigger builds/deploys and read their status',
    'Read build and deploy logs',
  ],
  observability: ['Read metrics, dashboards and alert status', 'Read incident and on-call state'],
  communication: ['Post the notifications you authorize to your channels'],
  project: ['Read and sync the issues, tasks and documents you authorize'],
  support: ['Read and create the support tickets and customer records you authorize'],
  data: ['Read and write data in the resources you authorize'],
  payments: ['Read payment, subscription and webhook events'],
  automation: ['Trigger and receive the automation workflows you authorize'],
};

function integrationPermissions(category: string): string[] {
  return INTEGRATION_PERMISSIONS[category] ?? ['Access the data and actions you authorize for this integration'];
}

const TERMINAL_SCRIPT_TEMPLATES = [
  ['start-dev', 'Start Development Server', 'Start the development server with hot reload.', 'npm run dev'],
  ['build', 'Build Project', 'Build the project for production.', 'npm run build'],
  ['test', 'Run Tests', 'Execute the test suite.', 'npm test'],
  ['lint', 'Lint Code', 'Check code style and static issues.', 'npm run lint'],
  ['db-migrate', 'Database Migration', 'Run database migrations.', 'npm run db:migrate'],
  ['docker-build', 'Docker Build', 'Build the project Docker image.', 'docker build -t vibecore-project .'],
  ['git-status', 'Git Status', 'Inspect repository status and recent commits.', 'git status && git log --oneline -5'],
  ['clean-deps', 'Clean Dependencies', 'Remove and reinstall dependencies.', 'rm -rf node_modules && npm install'],
] as const;
type ProjectIdeBackendState = {
  workspace?: {
    id?: string;
    status?: string;
    runtimeMode?: string;
    ports?: Array<{ port?: number; ready?: boolean; type?: string; url?: string }>;
  } | null;
  ports?: Array<{ port?: number; ready?: boolean; type?: string; url?: string }>;
  git?: {
    branch?: string;
    detached?: boolean;
    ahead?: number;
    behind?: number;
    changedFiles?: unknown[];
    fileStatuses?: unknown[];
  };
  files?: Array<{ path: string; sizeBytes?: number }>;
  recentActivity?: Array<{ action: string; createdAt?: string }>;
  collaborators?: Array<{ id?: string; userId?: string; roleKey?: string }>;
  overview?: unknown;
  commits?: unknown[];
  presence?: unknown[];
  manifests?: unknown[];
  dependencies?: unknown[];
  packageManager?: string;
  workflowsState?: { runs?: any[] };
  terminalState?: { scriptRuns?: any[] };
  packagesState?: { runs?: any[] };
};
type IdePaneLeaf = { type: 'leaf'; id: string; tabs: IdePaneTab[]; activeTabId?: string };
type IdePaneSplit = {
  type: 'split';
  id: string;
  direction: 'horizontal';
  first: IdePaneNode;
  second: IdePaneNode;
};
type IdePaneNode = IdePaneLeaf | IdePaneSplit;

function runtimeStatusText(input: {
  workspaceStatus?: { status?: string; ports?: Array<{ port?: number; ready?: boolean }> } | null;
  ports?: Array<{ port?: number; ready?: boolean }>;
  workspaceLoading: boolean;
  workspaceError?: string;
}) {
  if (input.workspaceError) {
    return 'Runtime: Error';
  }

  if (input.workspaceLoading) {
    return 'Runtime: Starting';
  }

  const status = workspaceUiState(input.workspaceStatus, {
    ports: input.ports,
  });

  if (status === 'running') {
    return 'Runtime: Running';
  }

  if (status === 'starting') {
    return 'Runtime: Starting';
  }

  if (status === 'error') {
    return 'Runtime: Error';
  }

  if (status === 'stopped') {
    return 'Runtime: Stopped';
  }

  return 'Runtime: Not started';
}

function runtimePortsFromPayload(payload: any): Array<{ port?: number; ready?: boolean; url?: string }> {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (Array.isArray(payload?.ports)) {
    return payload.ports;
  }

  return [];
}

function runtimeWorkspaceFromPanelData(data: any) {
  if (data?.runtimeStatus && !data.runtimeStatus.error) {
    return data.runtimeStatus;
  }

  return data?.workspace ?? null;
}

function previewPortText(input: {
  previews: Array<{ port: number; ready?: boolean }>;
  workspaceLoading: boolean;
  workspaceError?: string;
  previewServerState: { status: string };
}) {
  const activePreview = input.previews.find((preview) => preview.ready !== false) ?? input.previews[0];

  if (activePreview) {
    return `Port ${activePreview.port}`;
  }

  if (input.workspaceError) {
    return 'Port: unavailable';
  }

  if (input.previewServerState.status === 'static') {
    return 'Port: static';
  }

  return input.workspaceLoading || input.previewServerState.status === 'starting' ? 'Port: detecting' : 'Port: none';
}

function previewPortCompactText(input: {
  previews: Array<{ port: number; ready?: boolean }>;
  workspaceLoading: boolean;
  workspaceError?: string;
  previewServerState: { status: string };
}) {
  const activePreview = input.previews.find((preview) => preview.ready !== false) ?? input.previews[0];

  if (activePreview) {
    return String(activePreview.port);
  }

  if (input.workspaceError) {
    return 'Unavailable';
  }

  if (input.previewServerState.status === 'static') {
    return 'Static';
  }

  return input.workspaceLoading || input.previewServerState.status === 'starting' ? 'Detecting' : 'No port';
}

function previewCommandFromLogs(logs: string[]) {
  for (const log of [...logs].reverse()) {
    const message = typeof log === 'string' ? log : '';
    const match = message.match(/Starting preview with ([^\n]+)/i);

    if (match?.[1]) {
      return match[1].replace(/\s+in\s+.+$/i, '').trim();
    }
  }

  return undefined;
}

function devServerStatusText(input: {
  previews: Array<{ ready?: boolean }>;
  workspaceLoading: boolean;
  workspaceError?: string;
  logs: string[];
  previewServerState: { status: string; command?: string; error?: string };
}) {
  const command = input.previewServerState.command ?? previewCommandFromLogs(input.logs);

  if (input.previews.some((preview) => preview.ready !== false)) {
    return command ? `Dev: active (${command})` : 'Dev: active';
  }

  if (input.workspaceError || input.previewServerState.status === 'error') {
    return 'Dev: blocked';
  }

  if (input.previewServerState.status === 'static') {
    return 'Dev: static preview';
  }

  if (
    input.workspaceLoading ||
    input.previewServerState.status === 'starting' ||
    input.previewServerState.status === 'stopping' ||
    command
  ) {
    if (input.previewServerState.status === 'stopping') {
      return command ? `Dev: stopping (${command})` : 'Dev: stopping';
    }

    return command ? `Dev: starting (${command})` : 'Dev: starting';
  }

  return 'Dev: idle';
}

const PRESENCE_STATUS_WEIGHT: Record<string, number> = {
  online: 3,
  viewing: 3,
  editing: 3,
  typing: 4,
  idle: 2,
};

function presenceTimestamp(user: any) {
  const parsed = Date.parse(String(user?.updatedAt ?? ''));

  return Number.isFinite(parsed) ? parsed : 0;
}

function presenceIdentity(user: any) {
  const userId = String(user?.userId ?? '').trim();

  if (userId) {
    return `user:${userId}`;
  }

  const sessionId = String(user?.sessionId ?? '').trim();

  return sessionId ? `session:${sessionId}` : 'unknown';
}

function dedupeCollaborationPresence(presence: any[] = []) {
  const byIdentity = new Map<string, any>();

  for (const user of presence) {
    if (!user || user.status === 'offline') {
      continue;
    }

    const key = presenceIdentity(user);
    const existing = byIdentity.get(key);

    if (!existing) {
      byIdentity.set(key, user);
      continue;
    }

    const userWeight = PRESENCE_STATUS_WEIGHT[String(user.status ?? 'online')] ?? 1;
    const existingWeight = PRESENCE_STATUS_WEIGHT[String(existing.status ?? 'online')] ?? 1;

    /*
     * Weight-first, then recency. The previous `||` let a newer idle heartbeat
     * replace an older but higher-priority `typing` record, flipping a
     * collaborator from "typing…" to "idle" purely on arrival order.
     */
    if (
      userWeight > existingWeight ||
      (userWeight === existingWeight && presenceTimestamp(user) > presenceTimestamp(existing))
    ) {
      byIdentity.set(key, user);
    }
  }

  return [...byIdentity.values()].sort((a, b) => presenceTimestamp(b) - presenceTimestamp(a));
}

function presenceDisplayName(user: any) {
  return String(user?.name ?? user?.userId ?? user?.sessionId ?? 'Unknown user').trim() || 'Unknown user';
}

function collaborationPresenceTooltip(presence: any[]) {
  if (!presence.length) {
    return 'Collaboration: no one else present';
  }

  const names = presence
    .slice(0, 3)
    .map((user) => {
      const status = String(user?.status ?? 'online');
      const mode = String(user?.mode ?? 'editing');

      return `${presenceDisplayName(user)} (${status}, ${mode})`;
    })
    .join(', ');

  const overflow = presence.length > 3 ? `, +${presence.length - 3}` : '';

  return `Collaboration: ${presence.length} present - ${names}${overflow}`;
}

function stringifyMessageContent(value: unknown) {
  if (typeof value === 'string') {
    return value;
  }

  if (value === null || value === undefined) {
    return '';
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function messageText(message: Message) {
  const parts = Array.isArray((message as any).parts) ? (message as any).parts : [];

  if (parts.length) {
    const text = parts
      .map((part: any) => {
        if (typeof part?.text === 'string') {
          return part.text;
        }

        if (part?.type === 'image' || part?.image) {
          return '[image]';
        }

        if (part?.type === 'tool-invocation' || part?.toolInvocation) {
          return '[tool invocation]';
        }

        return stringifyMessageContent(part);
      })
      .filter(Boolean)
      .join('\n');

    if (text.trim()) {
      return text.trim();
    }
  }

  return stringifyMessageContent((message as any).content).trim();
}

function conversationTranscript(messages: Message[] = [], title?: string) {
  const heading = title?.trim() || 'Project conversation';

  const body = messages
    .map((message, index) => {
      const role = String(message.role ?? 'message');
      const content = messageText(message) || '[empty message]';

      return `## ${index + 1}. ${role}\n\n${content}`;
    })
    .join('\n\n');

  return `# ${heading}\n\n${body}`.trim();
}

function safeDownloadName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
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

function stripPromptScaffold(value: unknown): string {
  let text = String(value ?? '');

  text = text
    .replace(/^\s*\[Model:[^\]]*\]\s*/i, '')
    .replace(/^\s*\[Provider:[^\]]*\]\s*/i, '')
    .replace(/\[Model:[^\]]*\]/gi, '')
    .replace(/\[Provider:[^\]]*\]/gi, '')
    .replace(/<boltArtifact\s+[^>]*>[\s\S]*?<\/boltArtifact>/gm, '')
    .replace(/<boltAction\s+[^>]*>[\s\S]*?<\/boltAction>/gm, '');

  const userPromptMatch = text.match(/User prompt:\s*([\s\S]*)$/i);

  if (userPromptMatch && userPromptMatch[1].trim()) {
    text = userPromptMatch[1];
  }

  return text;
}

function shortContent(value: unknown, fallback = 'Project update') {
  const text = stripPromptScaffold(value)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return text ? text.slice(0, 120) : fallback;
}

function timeAgo(value?: string) {
  if (!value) {
    return 'just now';
  }

  const timestamp = Date.parse(value);

  if (!Number.isFinite(timestamp)) {
    return 'recorded';
  }

  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));

  const units: Array<[number, string]> = [
    [60 * 60 * 24 * 365, 'year'],
    [60 * 60 * 24 * 30, 'month'],
    [60 * 60 * 24, 'day'],
    [60 * 60, 'hour'],
    [60, 'minute'],
  ];

  for (const [size, label] of units) {
    const count = Math.floor(seconds / size);

    if (count >= 1) {
      return `${count} ${label}${count === 1 ? '' : 's'} ago`;
    }
  }

  return 'just now';
}

function formatBytes(bytes?: number) {
  if (!Number.isFinite(bytes) || !bytes || bytes <= 0) {
    return '0 KB';
  }

  const units = ['B', 'KB', 'MB', 'GB'];

  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value >= 10 || unitIndex === 0 ? Math.round(value) : value.toFixed(1)} ${units[unitIndex]}`;
}

function snapshotFiles(snapshot: ProjectSnapshot): Array<{ path: string; sizeBytes?: number; updatedAt?: string }> {
  const manifest = snapshot.manifest as { files?: unknown } | undefined;

  if (!Array.isArray(manifest?.files)) {
    return [];
  }

  return manifest.files
    .map((file) => {
      const entry = file as { path?: unknown; sizeBytes?: unknown; updatedAt?: unknown };

      if (typeof entry.path !== 'string' || !entry.path.trim()) {
        return null;
      }

      return {
        path: entry.path,
        sizeBytes: typeof entry.sizeBytes === 'number' ? entry.sizeBytes : undefined,
        updatedAt: typeof entry.updatedAt === 'string' ? entry.updatedAt : undefined,
      };
    })
    .filter(Boolean) as Array<{ path: string; sizeBytes?: number; updatedAt?: string }>;
}

function snapshotAuthor(snapshot: ProjectSnapshot) {
  if (snapshot.kind === 'before-ai-change' || /ai|agent/i.test(snapshot.label ?? '')) {
    return 'Agent';
  }

  if (snapshot.kind === 'automatic') {
    return 'System';
  }

  return 'Manual';
}

function snapshotKindLabel(snapshot: ProjectSnapshot) {
  if (snapshot.kind === 'before-ai-change') {
    return 'Before AI change';
  }

  if (snapshot.kind === 'automatic') {
    return 'Automatic';
  }

  return 'Manual';
}

function snapshotDiffSummary(current: ProjectSnapshot, previous?: ProjectSnapshot) {
  const currentFiles = snapshotFiles(current);
  const previousFiles = snapshotFiles(previous ?? ({} as ProjectSnapshot));
  const previousByPath = new Map(previousFiles.map((file) => [file.path, file]));
  const currentByPath = new Map(currentFiles.map((file) => [file.path, file]));
  const added: string[] = [];
  const changed: string[] = [];
  const removed: string[] = [];

  for (const file of currentFiles) {
    const previousFile = previousByPath.get(file.path);

    if (!previousFile) {
      added.push(file.path);
    } else if (previousFile.sizeBytes !== file.sizeBytes || previousFile.updatedAt !== file.updatedAt) {
      changed.push(file.path);
    }
  }

  for (const file of previousFiles) {
    if (!currentByPath.has(file.path)) {
      removed.push(file.path);
    }
  }

  const sample = [...changed, ...added, ...removed, ...currentFiles.map((file) => file.path)]
    .filter((path, index, list) => list.indexOf(path) === index)
    .slice(0, 6);

  return { added, changed, removed, sample };
}

function messageCreatedAt(message: Message | undefined) {
  const candidate = (message as any)?.createdAt ?? (message as any)?.timestamp;

  if (candidate instanceof Date) {
    return candidate.toISOString();
  }

  return typeof candidate === 'string' ? candidate : undefined;
}

function hasProjectFile(files: FileMap, matcher: (filePath: string) => boolean) {
  return Object.entries(files).some(([filePath, file]) => file?.type === 'file' && matcher(filePath));
}

function projectFileNames(files: FileMap) {
  return Object.entries(files)
    .filter(([, file]) => file?.type === 'file')
    .map(([filePath]) => filePath);
}

function buildProjectAgentSuggestions(input: {
  files: FileMap;
  selectedFile?: string;
  messages?: Message[];
  backendState: ProjectIdeBackendState;
  runtimeState: ProjectIdeBackendState;
  workspaceLogs: string[];
  activePanel: IdeWorkspacePanel;
  chatStarted: boolean;
}): ProjectAgentSuggestion[] {
  const {
    files,
    selectedFile,
    messages = [],
    backendState,
    runtimeState,
    workspaceLogs,
    activePanel,
    chatStarted,
  } = input;

  const filePaths = projectFileNames(files);
  const changedFiles = backendState.git?.changedFiles?.length ?? 0;

  const recentText = messages
    .slice(-6)
    .map((message) => String(message.content ?? ''))
    .join(' ')
    .toLowerCase();

  const lastUserText = [...messages].reverse().find((message) => message.role === 'user')?.content;
  const recentLogs = workspaceLogs.slice(-40).join('\n').toLowerCase();

  /*
   * The preview counts as "running" if the workspace reports RUNNING with ports OR
   * if any forwarded port is actually serving (ready / has a URL). The latter guard
   * stops the stale "Get preview running" chip from showing while the app is already
   * rendered in the Webview but the workspace status still lags behind (e.g. mid
   * cold-start / a PENDING status that hasn't reconciled yet).
   */
  const previewRunning =
    isWorkspaceReallyRunning(runtimeState.workspace, runtimeState.ports) ||
    (runtimeState.ports ?? []).some((port) => port.ready === true || Boolean(port.url));

  const hasPackageJson = hasProjectFile(
    files,
    (filePath) => filePath.endsWith('/package.json') || filePath === 'package.json',
  );
  const hasTests = hasProjectFile(
    files,
    (filePath) => /\.(test|spec)\.[jt]sx?$/.test(filePath) || filePath.includes('__tests__'),
  );
  const hasEnvExample = hasProjectFile(
    files,
    (filePath) => filePath.endsWith('.env.example') || filePath.includes('/.env'),
  );
  const hasDbFiles = hasProjectFile(files, (filePath) =>
    /(schema\.prisma|supabase|drizzle|migrations|tenders\.json|database|db\.)/i.test(filePath),
  );

  const hasUiFiles = hasProjectFile(files, (filePath) => /\.(tsx|jsx|css|scss)$/.test(filePath));

  const hasApiFiles = hasProjectFile(files, (filePath) =>
    /(api|server|route|routes|controller|handler)/i.test(filePath),
  );

  const selectedLabel = selectedFile ? selectedFile.split('/').slice(-2).join('/') : undefined;

  const suggestions: ProjectAgentSuggestion[] = [];

  const add = (suggestion: ProjectAgentSuggestion) => {
    if (!suggestions.some((item) => item.id === suggestion.id || item.prompt === suggestion.prompt)) {
      suggestions.push(suggestion);
    }
  };

  if (/error|failed|exception|traceback|cannot|econn|invalid/i.test(recentLogs)) {
    add({
      id: 'fix-runtime-error',
      label: 'Fix latest error',
      prompt:
        'Analyze the latest runtime logs, identify the root cause, and patch the project so the preview runs cleanly.',
      reason: 'Recent logs contain errors',
      icon: 'i-ph:warning',
      priority: 100,
    });
  }

  if (!previewRunning && hasPackageJson) {
    add({
      id: 'start-preview',
      label: 'Get preview running',
      prompt:
        'Inspect the project startup setup, install or fix missing dependencies if needed, and get the preview dev server running.',
      reason: 'Preview has no active port',
      icon: 'i-ph:browser',
      priority: 95,
    });
  }

  if (selectedFile) {
    add({
      id: 'improve-selected-file',
      label: `Improve ${selectedLabel}`,
      prompt: `Review ${selectedFile}, explain the most important improvement, then implement it with minimal changes.`,
      reason: 'Based on the open file',
      icon: 'i-ph:file-code',
      priority: 88,
    });
  }

  if (changedFiles > 0) {
    add({
      id: 'review-changes',
      label: 'Review changes',
      prompt:
        'Review the current uncommitted project changes, summarize what changed, find likely bugs, and suggest the next safe commit.',
      reason: `${changedFiles} changed file${changedFiles === 1 ? '' : 's'}`,
      icon: 'i-ph:git-diff',
      priority: 84,
    });
  }

  if (/deploy|publish|ship|production|prod|domain/.test(recentText) || activePanel === 'deployments') {
    add({
      id: 'prepare-deploy',
      label: 'Prepare deploy',
      prompt:
        'Check the project for deployment readiness: build command, env vars, output directory, runtime risks, and any blocker before publishing.',
      reason: 'Deployment context detected',
      icon: 'i-ph:rocket-launch',
      priority: 80,
    });
  }

  if (!hasTests && filePaths.length > 4) {
    add({
      id: 'add-smoke-tests',
      label: 'Add smoke tests',
      prompt:
        'Add a small smoke test or validation script for the most important user flow in this project, following the existing stack.',
      reason: 'No tests detected',
      icon: 'i-ph:check-circle',
      priority: 72,
    });
  }

  if (hasDbFiles || /database|db|data|schema|migration|supabase/.test(recentText)) {
    add({
      id: 'audit-data-layer',
      label: 'Audit data flow',
      prompt:
        'Inspect the project data layer and recent conversation context, then fix the highest-risk data consistency or schema issue.',
      reason: 'Database/data files detected',
      icon: 'i-ph:database',
      priority: 70,
    });
  }

  if (hasUiFiles && (/ui|design|button|panel|theme|mobile|responsive/.test(recentText) || activePanel === 'preview')) {
    add({
      id: 'polish-ui',
      label: 'Polish current UI',
      prompt:
        'Audit the current UI for layout, theme, responsive issues and interaction gaps, then patch the most visible problems.',
      reason: 'UI work is active',
      icon: 'i-ph:paint-brush',
      priority: 68,
    });
  }

  if (hasEnvExample || /api key|env|secret|provider|openai|anthropic/.test(recentText)) {
    add({
      id: 'check-config',
      label: 'Check config',
      prompt:
        'Validate environment variables and provider configuration for this project, then fix missing or misleading UI/config states.',
      reason: 'Config/provider context detected',
      icon: 'i-ph:key',
      priority: 64,
    });
  }

  if (hasApiFiles) {
    add({
      id: 'harden-api',
      label: 'Harden API paths',
      prompt:
        'Inspect the API/server routes touched by this project and fix one concrete reliability, error handling, or missing route issue.',
      reason: 'Server/API files detected',
      icon: 'i-ph:shield-check',
      priority: 58,
    });
  }

  if (lastUserText && chatStarted) {
    add({
      id: 'continue-last-request',
      label: 'Continue last request',
      prompt: `Continue from my last request: "${shortContent(lastUserText, 'the last request')}". Check what is still missing and finish it.`,
      reason: 'Based on the latest conversation',
      icon: 'i-ph:arrow-bend-down-right',
      priority: 92,
    });
  }

  add({
    id: 'add-feature',
    label: 'Add a feature',
    prompt:
      'Inspect the current project and add one useful, coherent feature. Keep the change small, runnable, and aligned with the existing app structure.',
    reason: 'Core E-Code workflow',
    icon: 'i-ph:plus-circle',
    priority: 88,
  });

  add({
    id: 'next-best-step',
    label: 'Find next best step',
    prompt:
      'Analyze the current project files, recent conversation, preview/runtime state and git changes, then choose and implement the highest-impact next step.',
    reason: 'Project-aware fallback',
    icon: 'i-ph:sparkle',
    priority: 1,
  });

  return suggestions.sort((left, right) => right.priority - left.priority).slice(0, 4);
}

const DEFAULT_PANE_TREE: IdePaneLeaf = {
  type: 'leaf',
  id: 'pane-main',
  tabs: [
    { id: 'tab-editor-default', panel: 'editor' },
    { id: 'tab-preview-default', panel: 'preview', pinned: true },
  ],
  activeTabId: 'tab-editor-default',
};

function cloneDefaultPaneTree(): IdePaneNode {
  return JSON.parse(JSON.stringify(DEFAULT_PANE_TREE));
}

function collectPaneTabs(node: any): IdePaneTab[] {
  if (node?.type === 'leaf' && Array.isArray(node.tabs)) {
    return node.tabs;
  }

  return [...collectPaneTabs(node?.first), ...collectPaneTabs(node?.second)];
}

function ensureCorePaneTabs(tabs: IdePaneTab[]) {
  const nextTabs = [...tabs];

  if (!nextTabs.some((tab) => tab.panel === 'editor')) {
    nextTabs.unshift({ id: 'tab-editor-default', panel: 'editor' });
  }

  if (!nextTabs.some((tab) => tab.panel === 'preview')) {
    nextTabs.push({ id: 'tab-preview-default', panel: 'preview', pinned: true });
  }

  return nextTabs;
}

function normalizePaneTree(node: any): IdePaneNode {
  if (node?.type === 'split') {
    return {
      type: 'split',
      id: typeof node.id === 'string' ? node.id : 'pane-split-root',
      direction: 'horizontal',
      first: normalizePaneTree(node.first),
      second: normalizePaneTree(node.second),
    };
  }

  const tabs = ensureCorePaneTabs(collectPaneTabs(node));
  const legacyActiveTabId = typeof node?.activeTabId === 'string' ? node.activeTabId : undefined;
  const activeTabId = tabs.some((tab) => tab.id === legacyActiveTabId) ? legacyActiveTabId : tabs[tabs.length - 1]?.id;

  return {
    type: 'leaf',
    id: 'pane-main',
    tabs,
    activeTabId,
  };
}

function isIdeRightPanel(panel: string): panel is IdeRightPanel {
  return (IDE_RIGHT_PANELS as readonly string[]).includes(panel);
}

function isIdeWorkspacePanel(panel: string): panel is IdeWorkspacePanel {
  return (IDE_WORKSPACE_PANELS as readonly string[]).includes(panel);
}

function isIdeManagementPanel(panel: string): panel is IdeManagementPanel {
  return (IDE_MANAGEMENT_PANELS as readonly string[]).includes(panel);
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

function formatEditorTabLabel(label: string, panel: IdeWorkspacePanel) {
  if (panel !== 'editor') {
    return label;
  }

  const normalized = label.replace(WORK_DIR, '').replace(/^\/+/, '');
  const pathParts = normalized.split('/').filter(Boolean);

  if (pathParts.length <= 2) {
    return normalized || label;
  }

  return `${pathParts.at(-2)}/${pathParts.at(-1)}`;
}

function formatRailItemLabel(label: string, badgeLabel?: string) {
  return badgeLabel ? `${label}, ${badgeLabel}` : label;
}

function formatRailItemTooltip(label: string, fallbackDescription: string, badgeLabel?: string) {
  const help = IDE_RAIL_TOOLTIP_HELP[label];
  const description = help?.description ?? fallbackDescription;

  const details = [label, description, badgeLabel, help?.shortcut ? `Shortcut: ${help.shortcut}` : undefined].filter(
    Boolean,
  );

  return details.join('. ');
}

function isIdeHiddenPath(filePath: string) {
  return IDE_FILE_TREE_HIDDEN_PATTERNS.some((pattern) => pattern.test(filePath));
}

function inferAgentToolAction(message: string | undefined): AgentToolAction | null {
  const text = (message ?? '').toLowerCase();

  const matches: Array<[RegExp, IdeWorkspacePanel | IdeRightPanel, string]> = [
    [/\b(open|show|ouvre|affiche).*\b(files?|fichiers?|explorer)\b|\b(files?|fichiers?)\b/, 'files', 'Open Files'],
    [/\b(search|find|recherche)\b/, 'search', 'Open Search'],
    [/\b(database|sql|db|base de donn)/, 'database', 'Open Database'],
    [/\b(terminal|console|logs?|shell)\b/, 'terminal', `Open ${SHELL_TERMINAL_LABEL}`],
    [/\b(preview|webview|aperçu|apercu)\b/, 'preview', 'Open Webview'],
    [/\b(deploy|deployment|publish|publier|déploiement|deploiement)\b/, 'deployments', 'Open Deployments'],
    [/\b(secret|env|environment variable)\b/, 'secrets', 'Open Secrets'],
    [/\bgit\b|\bbranch\b|\bcommit\b/, 'git', 'Open Git'],
    [/\b(package|dependency|dependencies|npm|pnpm)\b/, 'packages', 'Open Packages'],
    [
      /\b(integration|integrations|webhook|api key|event stream|slack|jira|sentry|stripe|zapier)\b/,
      'integrations',
      'Open Integrations',
    ],
    [/\b(workflow|workflows|run button|automation|automate|script|task)\b/, 'workflows', 'Open Workflows'],
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

function resolveMentionedProjectFiles(message: string, projectFilePaths: string[]) {
  const rawMentions = Array.from(message.matchAll(/@([^\s,;:()[\]{}"'`]+)/g)).map((match) =>
    match[1].replace(/[.!?]+$/, ''),
  );

  const matches: string[] = [];

  for (const mention of rawMentions) {
    const normalizedMention = mention.replace(/^\/+/, '').toLowerCase();

    const match = projectFilePaths.find((filePath) => {
      const normalizedPath = filePath.replace(/^\/+/, '').toLowerCase();

      return (
        normalizedPath === normalizedMention ||
        normalizedPath.endsWith(`/${normalizedMention}`) ||
        normalizedPath.includes(normalizedMention)
      );
    });

    if (match && !matches.includes(match)) {
      matches.push(match);
    }
  }

  return matches.slice(0, 12);
}

function resolveMentionedProjectSymbols(message: string, files: FileMap) {
  const rawSymbols = Array.from(message.matchAll(/#([A-Za-z_$][\w$.-]*)/g)).map((match) =>
    match[1].replace(/[.!?]+$/, ''),
  );

  if (!rawSymbols.length) {
    return [];
  }

  const results: Array<{ symbol: string; filePath: string; line: number; preview: string }> = [];

  for (const symbol of rawSymbols) {
    const symbolPattern = new RegExp(`\\b${symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);

    for (const [filePath, file] of Object.entries(files)) {
      if (file?.type !== 'file' || file.isBinary || results.some((result) => result.symbol === symbol)) {
        continue;
      }

      const lines = file.content.split(/\r?\n/);
      const lineIndex = lines.findIndex((line) => symbolPattern.test(line));

      if (lineIndex >= 0) {
        results.push({
          symbol,
          filePath,
          line: lineIndex + 1,
          preview: lines[lineIndex].trim().slice(0, 160),
        });
      }
    }
  }

  return results.slice(0, 12);
}

function buildProjectAgentPrompt({
  message,
  mode,
  planFirst,
  mentionedFiles,
  mentionedSymbols,
}: {
  message: string;
  mode: ProjectAgentExecutionMode;
  planFirst: boolean;
  mentionedFiles: string[];
  mentionedSymbols: Array<{ symbol: string; filePath: string; line: number; preview: string }>;
}) {
  const modeConfig = PROJECT_AGENT_EXECUTION_MODES.find((item) => item.id === mode) ?? PROJECT_AGENT_EXECUTION_MODES[2];

  const guardrails = [
    `Mode: ${modeConfig.label}. ${modeConfig.description}`,
    planFirst
      ? 'Plan first is enabled: produce a concise, reviewable plan and wait for explicit approval before editing files, running shell commands, deploying, or applying destructive actions.'
      : 'Plan first is disabled: proceed according to the selected mode, but keep changes scoped and verify them.',
    mode === 'edit' || mode === 'agent'
      ? 'Diff review is enforced by the IDE: file edits are captured as patch proposals and must be accepted or rejected by the user before they are applied.'
      : 'No file patch should be produced in this mode unless the user explicitly switches to Edit or Agent.',
  ];

  if (mode === 'ask') {
    guardrails.push(
      'Do not edit files, run shell commands, or trigger runtime tools unless the user explicitly switches mode.',
    );
  }

  if (mode === 'architect') {
    guardrails.push(
      'Prioritize architecture, contracts, rollout sequence, risks, and acceptance criteria over code changes.',
    );
  }

  if (mentionedFiles.length > 0) {
    guardrails.push(`User-selected file context: ${mentionedFiles.map((filePath) => `@${filePath}`).join(', ')}`);
  }

  if (mentionedSymbols.length > 0) {
    guardrails.push(
      `User-selected symbol context: ${mentionedSymbols
        .map((item) => `#${item.symbol} at ${item.filePath}:${item.line} (${item.preview})`)
        .join('; ')}`,
    );
  }

  return `<vibecore_agent_request>\n${guardrails.map((line) => `- ${line}`).join('\n')}\n</vibecore_agent_request>\n\n${message}`;
}

function findFirstLeaf(node: IdePaneNode): IdePaneLeaf | undefined {
  return node.type === 'leaf' ? node : (findFirstLeaf(node.first) ?? findFirstLeaf(node.second));
}

function findLeaf(node: IdePaneNode, paneId: string): IdePaneLeaf | undefined {
  if (node.type === 'leaf') {
    return node.id === paneId ? node : undefined;
  }

  return findLeaf(node.first, paneId) ?? findLeaf(node.second, paneId);
}

function findLeafContainingTab(node: IdePaneNode, tabId: string): IdePaneLeaf | undefined {
  if (node.type === 'leaf') {
    return node.tabs.some((tab) => tab.id === tabId) ? node : undefined;
  }

  return findLeafContainingTab(node.first, tabId) ?? findLeafContainingTab(node.second, tabId);
}

function updateLeaf(node: IdePaneNode, paneId: string, updater: (leaf: IdePaneLeaf) => IdePaneNode): IdePaneNode {
  if (node.type === 'leaf') {
    return node.id === paneId ? updater(node) : node;
  }

  return {
    ...node,
    first: updateLeaf(node.first, paneId, updater),
    second: updateLeaf(node.second, paneId, updater),
  };
}

function flattenTabs(node: IdePaneNode): IdePaneTab[] {
  if (node.type === 'leaf') {
    return node.tabs;
  }

  return [...flattenTabs(node.first), ...flattenTabs(node.second)];
}

function HeaderTip({
  label,
  children,
  side = 'bottom',
}: {
  label: string;
  children: React.ReactElement;
  side?: 'top' | 'bottom' | 'left' | 'right';
}) {
  const [open, setOpen] = useState(false);

  const trigger = React.cloneElement(children, {
    'data-vc-radix-tooltip': 'true',
    title: children.props.title ?? label,
    onPointerEnter: (event: React.PointerEvent<HTMLElement>) => {
      children.props.onPointerEnter?.(event);
      setOpen(true);
    },
    onPointerLeave: (event: React.PointerEvent<HTMLElement>) => {
      children.props.onPointerLeave?.(event);
      setOpen(false);
    },
    onFocus: (event: React.FocusEvent<HTMLElement>) => {
      children.props.onFocus?.(event);
      setOpen(true);
    },
    onBlur: (event: React.FocusEvent<HTMLElement>) => {
      children.props.onBlur?.(event);
      setOpen(false);
    },
    onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => {
      children.props.onKeyDown?.(event);

      if (event.key === 'Escape') {
        setOpen(false);
      }
    },
  });

  return (
    <Tooltip.Root open={open} onOpenChange={setOpen} delayDuration={0}>
      <Tooltip.Trigger asChild>{trigger}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content side={side} sideOffset={8} collisionPadding={12} className="bolt-project-tooltip-content">
          {label}
          <Tooltip.Arrow className="bolt-project-tooltip-arrow" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

function AgentPatchReviewQueue({ proposals, autoApplyEnabled }: { proposals: any[]; autoApplyEnabled?: boolean }) {
  const [selectedHunksByProposal, setSelectedHunksByProposal] = useState<Record<string, Set<string>>>({});

  const visibleProposals = useMemo(() => {
    if (autoApplyEnabled) {
      return [];
    }

    return proposals;
  }, [proposals, autoApplyEnabled]);

  useEffect(() => {
    setSelectedHunksByProposal((current) => {
      let changed = false;

      const next = { ...current };

      for (const proposal of visibleProposals) {
        if (!next[proposal.id]) {
          next[proposal.id] = new Set(proposal.hunks.map((hunk: any) => hunk.id));
          changed = true;
        }
      }

      for (const proposalId of Object.keys(next)) {
        if (!visibleProposals.some((proposal) => proposal.id === proposalId)) {
          delete next[proposalId];
          changed = true;
        }
      }

      return changed ? next : current;
    });
  }, [visibleProposals]);

  if (!visibleProposals.length) {
    return null;
  }

  const toggleHunk = (proposalId: string, hunkId: string) => {
    setSelectedHunksByProposal((current) => {
      const selected = new Set(current[proposalId] ?? []);

      if (selected.has(hunkId)) {
        selected.delete(hunkId);
      } else {
        selected.add(hunkId);
      }

      return { ...current, [proposalId]: selected };
    });
  };

  const pendingForBulk = visibleProposals.filter((proposal) => proposal.status !== 'applying');

  const acceptAll = () => {
    /*
     * Apply the whole batch through the store's bulk path, which topologically
     * sorts by import dependencies and awaits each accept sequentially. Firing
     * the accepts concurrently here (the previous behaviour) raced the per-accept
     * resetAllFileModifications/loadRuntimeFiles/saveFile calls against each other
     * and could land an importer before the file it imports.
     */
    const ids: string[] = [];
    const hunkSelections: Record<string, string[]> = {};

    for (const proposal of pendingForBulk) {
      const selected = selectedHunksByProposal[proposal.id] ?? new Set(proposal.hunks.map((hunk: any) => hunk.id));

      if (selected.size === 0) {
        continue;
      }

      ids.push(proposal.id);
      hunkSelections[proposal.id] = Array.from(selected);
    }

    if (ids.length === 0) {
      return;
    }

    void workbenchStore.acceptAllAgentPatchProposals(ids, hunkSelections);
  };
  const rejectAll = () => {
    for (const proposal of pendingForBulk) {
      workbenchStore.rejectAgentPatchProposal(proposal.id);
    }
  };

  return (
    <section className="bolt-project-agent-patch-review" aria-label="AI patch review queue">
      <div className="bolt-project-agent-patch-review-head">
        <div>
          <strong>Review AI changes</strong>
          <span>
            {autoApplyEnabled
              ? `${visibleProposals.length} AI change${visibleProposals.length === 1 ? '' : 's'} failed and need a manual decision`
              : `${visibleProposals.length} AI change${visibleProposals.length === 1 ? '' : 's'} to review`}
          </span>
        </div>
        <div className="bolt-project-agent-patch-review-bulk">
          <button
            type="button"
            className="bolt-project-agent-patch-review-bulk-accept"
            disabled={pendingForBulk.length === 0}
            onClick={acceptAll}
          >
            Accept all
          </button>
          <button
            type="button"
            className="bolt-project-agent-patch-review-bulk-reject"
            disabled={pendingForBulk.length === 0}
            onClick={rejectAll}
          >
            Reject all
          </button>
        </div>
      </div>
      <div className="bolt-project-agent-patch-review-list">
        {visibleProposals.map((proposal) => {
          const selectedHunks =
            selectedHunksByProposal[proposal.id] ?? new Set(proposal.hunks.map((hunk: any) => hunk.id));

          const selectedCount = selectedHunks.size;
          const busy = proposal.status === 'applying';

          return (
            <article key={proposal.id} className="bolt-project-agent-patch-card" data-status={proposal.status}>
              <div className="bolt-project-agent-patch-card-head">
                <div>
                  <strong title={proposal.relativePath}>{proposal.relativePath}</strong>
                  <span>
                    {proposal.hunks.length} hunk{proposal.hunks.length === 1 ? '' : 's'} · {selectedCount} selected
                  </span>
                </div>
                <div className="bolt-project-agent-patch-actions">
                  <button
                    type="button"
                    disabled={busy || selectedCount === 0}
                    onClick={() => workbenchStore.acceptAgentPatchProposal(proposal.id, Array.from(selectedHunks))}
                  >
                    Accept file
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => workbenchStore.rejectAgentPatchProposal(proposal.id)}
                  >
                    Reject file
                  </button>
                </div>
              </div>
              {proposal.error ? <p className="bolt-project-agent-patch-error">{proposal.error}</p> : null}
              <details className="bolt-project-agent-patch-hunks-toggle">
                <summary>
                  <span className="bolt-project-agent-patch-hunks-toggle-label">
                    Show diff
                    <span className="bolt-project-agent-patch-hunks-toggle-count">
                      {proposal.hunks.length} hunk{proposal.hunks.length === 1 ? '' : 's'}
                    </span>
                  </span>
                  <span className="bolt-project-agent-patch-hunks-toggle-chevron i-ph:caret-down" aria-hidden />
                </summary>
                <div className="bolt-project-agent-patch-hunks">
                  {proposal.hunks.map((hunk: any, index: number) => {
                    const checked = selectedHunks.has(hunk.id);

                    return (
                      <div key={hunk.id} className="bolt-project-agent-patch-hunk bolt-project-agent-patch-hunk--flat">
                        <div className="bolt-project-agent-patch-hunk-head">
                          <label onClick={(event) => event.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleHunk(proposal.id, hunk.id)}
                            />
                            Hunk {index + 1}
                          </label>
                          <span>
                            -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines}
                          </span>
                        </div>
                        <pre aria-label={`Diff hunk ${index + 1} for ${proposal.relativePath}`}>
                          {hunk.lines.map((line: any) => (
                            <code key={line.id} data-line-type={line.type}>
                              {line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '}
                              {line.content}
                            </code>
                          ))}
                        </pre>
                      </div>
                    );
                  })}
                </div>
              </details>
            </article>
          );
        })}
      </div>
    </section>
  );
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
  onRewindToMessage?: (messageId: string) => void;
  resetChat?: () => void;
  designScheme?: DesignScheme;
  setDesignScheme?: (scheme: DesignScheme) => void;
  selectedElement?: ElementInfo | null;
  setSelectedElement?: (element: ElementInfo | null) => void;
  addToolResult?: ({ toolCallId, result }: { toolCallId: string; result: any }) => void;
  onWebSearchResult?: (result: string) => void;
  projectIdeMode?: boolean;
  projectId?: string;
  projectUrl?: string;
  initialIdePanels?: Record<string, any>;
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
      description,
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
      onRewindToMessage,
      resetChat,
      designScheme,
      setDesignScheme,
      selectedElement,
      setSelectedElement,
      addToolResult = () => {
        console.warn('Tool result ignored because addToolResult is not available in this render path.');
      },
      onWebSearchResult,
      projectIdeMode = false,
      projectId,
      projectUrl,
      initialIdePanels,
    },
    ref,
  ) => {
    const TEXTAREA_MAX_HEIGHT = chatStarted ? 400 : 200;
    const [searchParams, setSearchParams] = useSearchParams();
    const layout = useResponsiveLayout();
    const textDirection = useTextDirection();

    /*
     * Workspace isolation — when the IDE is scoped to a specific workspace
     * route IDE state through `/api/workspaces/:id/ide-state` so two open
     * workspaces in the same project keep distinct editor layouts, open
     * conversations, palette MRU, etc. Falls back to the project endpoint
     * for legacy projects that don't have a workspace assigned yet.
     */
    const currentWorkspaceId = useCurrentWorkspaceId();

    /*
     * Header presence — subscribe to the project collaboration channel
     * at the root so PresenceAvatars in the agent header stays live
     * regardless of which sidebar panel is active. (The collaborators
     * panel currently runs its own subscription too; deduping is a
     * follow-up — the WS handshake cost is negligible.)
     */
    const headerCollaboration = useProjectCollaboration({
      projectId,
      enabled: Boolean(projectId) && projectIdeMode,
      mode: 'editing',
    });

    /*
     * Sprint 3/4 polish — read the MRU palette lists from project IDE
     * memory so the @-mentions and /-commands palettes can boost
     * frequent entries. Updates live via subscribeProjectIdeMemory so a
     * fresh pick from another tab also bumps the local ranking.
     */
    const [paletteMemory, setPaletteMemory] = useState<ProjectIdeMemory | undefined>(undefined);

    useEffect(() => {
      if (!projectId || !projectIdeMode) {
        setPaletteMemory(undefined);

        return undefined;
      }

      let cancelled = false;

      getProjectIdeMemory(projectId, currentWorkspaceId)
        .then((value) => {
          if (!cancelled) {
            setPaletteMemory(value);
          }
        })
        .catch(() => undefined);

      const unsubscribe = subscribeProjectIdeMemory(
        projectId,
        (next) => {
          if (!cancelled) {
            setPaletteMemory(next);
          }
        },
        currentWorkspaceId,
      );

      return () => {
        cancelled = true;
        unsubscribe();
      };
    }, [projectId, projectIdeMode, currentWorkspaceId]);

    const recentMentionedFilePaths = paletteMemory?.ui?.recentMentionedFilePaths;
    const recentSlashCommandIds = paletteMemory?.ui?.recentSlashCommandIds;

    /*
     * Slash command callbacks. Each one is opt-in — when its hook isn't
     * relevant (e.g. Bolt standalone has no projectId, no snapshot route),
     * we simply leave the callback off the context and the command
     * no-ops gracefully (verified in slash-commands.spec.ts).
     */
    const insertIntoComposer = useCallback(
      (text: string, opts?: { replace?: boolean }) => {
        if (!handleInputChange) {
          return;
        }

        const nextValue = opts?.replace ? text : `${input ?? ''}${text}`;

        const syntheticEvent = {
          target: { value: nextValue },
          currentTarget: { value: nextValue },
        } as unknown as React.ChangeEvent<HTMLTextAreaElement>;
        handleInputChange(syntheticEvent);

        window.requestAnimationFrame(() => {
          const el = textareaRef?.current;

          if (!el) {
            return;
          }

          el.focus();

          const caret = nextValue.length;
          el.setSelectionRange(caret, caret);
        });
      },
      [handleInputChange, input, textareaRef],
    );

    /*
     * Composer draft persistence — the typed-but-unsent prompt survives a
     * reload/tab restore via sessionStorage (per project, per tab; helpers in
     * composer-draft.ts). Restore runs once, as soon as a projectId is known,
     * and ONLY into an empty composer so prefilled prompts (e.g. the homepage
     * Build-Now handoff) are never clobbered. Writes are debounced 300ms; an
     * actual send clears the draft (see handleSendMessage).
     */
    const composerDraftWriter = useMemo(() => createComposerDraftWriter(), []);
    const composerDraftRestoreDoneRef = useRef(false);

    useEffect(() => {
      if (composerDraftRestoreDoneRef.current || !projectId) {
        return;
      }

      composerDraftRestoreDoneRef.current = true;

      if (input.length > 0 || !handleInputChange) {
        return;
      }

      const draft = readComposerDraft(projectId);

      if (!draft) {
        return;
      }

      const syntheticEvent = {
        target: { value: draft },
        currentTarget: { value: draft },
      } as unknown as React.ChangeEvent<HTMLTextAreaElement>;
      handleInputChange(syntheticEvent);
    }, [projectId, input, handleInputChange]);

    useEffect(() => {
      /*
       * Don't persist before the restore decision ran — an initial empty
       * `input` would otherwise race to delete the very draft being restored.
       */
      if (!projectId || !composerDraftRestoreDoneRef.current) {
        return;
      }

      composerDraftWriter.schedule(projectId, input);
    }, [composerDraftWriter, input, projectId]);

    // Unmount (IDE navigation away) persists the last keystrokes immediately.
    useEffect(() => () => composerDraftWriter.flush(), [composerDraftWriter]);

    /*
     * Agentic Git conflict resolution (Replit parity): the Git panel dispatches a
     * `vibecore:agent-task` event when the user asks the agent to resolve merge
     * conflicts. We compose a structured task into the agent composer (preserve
     * BOTH sides, never lose work, git add each resolved file) and focus it — the
     * user reviews and sends, so no merge/commit/push happens without confirmation
     * (the agent then resolves using its existing shell + file-edit tools).
     */
    useEffect(() => {
      if (!projectIdeMode) {
        return undefined;
      }

      const handler = (event: Event) => {
        const detail = (event as CustomEvent).detail as
          | {
              kind?: string;
              files?: Array<string | { path?: string }>;
              branch?: string;
              title?: string;
              details?: string;
              severity?: string;
              source?: string;
            }
          | undefined;

        if (detail?.kind === 'resolve-git-conflicts') {
          const files = Array.isArray(detail.files) ? detail.files : [];

          const list = files
            .map((file) => `- ${typeof file === 'string' ? file : (file?.path ?? '')}`.trim())
            .filter((line) => line !== '-')
            .join('\n');

          const prompt = [
            `Resolve the current Git merge conflicts in this workspace${detail.branch ? ` (branch ${detail.branch})` : ''}, preserving BOTH sides' intent — never discard either side's work.`,
            '',
            'Conflicted files:',
            list || '- (run `git status` to list them)',
            '',
            'For each file: read the <<<<<<< / ======= / >>>>>>> conflict markers, merge both sides correctly, write the resolved file, then `git add` it. Do NOT push, and do NOT finish the merge or commit until I confirm.',
          ].join('\n');

          insertIntoComposer(prompt, { replace: true });

          return;
        }

        if (detail?.kind === 'fix-security-finding') {
          const prompt = [
            'Fix this security finding in the project code:',
            '',
            `- Severity: ${detail.severity ?? 'unknown'}`,
            `- Finding: ${detail.title ?? ''}`,
            detail.details ? `- Details: ${detail.details}` : '',
            detail.source ? `- Source: ${detail.source}` : '',
            '',
            'Locate the affected code, apply the minimal safe fix, and explain the change. Do NOT commit or push until I confirm.',
          ]
            .filter(Boolean)
            .join('\n');

          insertIntoComposer(prompt, { replace: true });
        }
      };

      window.addEventListener('vibecore:agent-task', handler);

      return () => window.removeEventListener('vibecore:agent-task', handler);
    }, [projectIdeMode, insertIntoComposer]);

    const createSnapshotCommand = useCallback(async () => {
      if (!projectId) {
        return;
      }

      try {
        const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/snapshots`, {
          method: 'POST',
          credentials: 'include',
          headers: { accept: 'application/json', 'content-type': 'application/json' },
          body: JSON.stringify({ label: 'Manual checkpoint via /snapshot', kind: 'manual', manifest: {} }),
        });

        if (!response.ok) {
          throw new Error(`Snapshot failed (${response.status})`);
        }

        toast.success('Snapshot created');
      } catch (error) {
        toast.error(`Snapshot failed: ${(error as Error).message}`);
      }
    }, [projectId]);

    const getLastPreviewError = useCallback(() => {
      const state = workbenchStore.previewServerState.get();

      if (state.status !== 'error' || !state.error) {
        return undefined;
      }

      return state.error;
    }, []);

    /*
     * /open <path> — switch to code view + select the file. Normalises
     * the path against WORK_DIR so the user can pass either relative
     * (`src/App.tsx`) or absolute (`/home/project/src/App.tsx`).
     */
    const openFileFromSlash = useCallback((rawPath: string) => {
      const normalised = rawPath.startsWith('/') ? rawPath : `${WORK_DIR}/${rawPath.replace(/^\.?\//, '')}`;
      workbenchStore.currentView.set('code');
      workbenchStore.setSelectedFile(normalised);
    }, []);

    /*
     * /diff <path> — switch to diff view; when no path is given, keep
     * the currently selected file as the diff target.
     */
    const openDiffFromSlash = useCallback((rawPath?: string) => {
      if (rawPath) {
        const normalised = rawPath.startsWith('/') ? rawPath : `${WORK_DIR}/${rawPath.replace(/^\.?\//, '')}`;
        workbenchStore.setSelectedFile(normalised);
      }

      workbenchStore.currentView.set('diff');
    }, []);

    /*
     * /run <command> — execute a shell command via the bolt terminal.
     * The output streams into the IDE terminal panel; we surface a
     * toast on failure so the user knows when it crashed silently.
     */
    const runShellCommandFromSlash = useCallback(async (command: string) => {
      const shell = workbenchStore.boltTerminal;

      if (!shell || typeof shell.executeCommand !== 'function') {
        toast.error('Shell unavailable — open the terminal panel first');
        return;
      }

      try {
        await shell.executeCommand(`slash-run:${Date.now()}`, command);
      } catch (error) {
        toast.error(`Shell command failed: ${(error as Error).message}`);
      }
    }, []);

    const useMobileIde = layout.isMobile || layout.isTablet;
    const navigate = useNavigate();
    const [clientHydrated, setClientHydrated] = useState(false);

    const [mobilePanel, setMobilePanel] = useState<
      'chat' | 'files' | 'editor' | 'search' | 'locks' | 'terminal' | 'preview' | 'deploy'
    >('chat');

    const [mobileToolsSheetOpen, setMobileToolsSheetOpen] = useState(false);
    const [mobileToolsQuery, setMobileToolsQuery] = useState('');
    const [mobileTabSearchQuery, setMobileTabSearchQuery] = useState('');

    const [mobileTabSwitcherOpen, setMobileTabSwitcherOpen] = useState(false);
    const [mobileMoreMenuOpen, setMobileMoreMenuOpen] = useState(false);
    const [mobileAgentMenuOpen, setMobileAgentMenuOpen] = useState(false);

    const mobileOverlayStorageKey = useMemo(
      () => (projectIdeMode && projectId ? `vibecore:mobile-overlay:${projectId}` : undefined),
      [projectIdeMode, projectId],
    );
    const persistMobileOverlay = useCallback(
      (overlay: MobileOverlayKind | null) => {
        if (!mobileOverlayStorageKey || typeof window === 'undefined') {
          return;
        }

        try {
          if (!overlay) {
            window.sessionStorage.removeItem(mobileOverlayStorageKey);

            return;
          }

          window.sessionStorage.setItem(mobileOverlayStorageKey, JSON.stringify({ overlay, openedAt: Date.now() }));
        } catch {
          // Session storage can be disabled in hardened browsers; overlay state still works in memory.
        }
      },
      [mobileOverlayStorageKey],
    );
    const blurActiveMobileControl = useCallback(() => {
      if (typeof document === 'undefined') {
        return;
      }

      const activeElement = document.activeElement;

      if (activeElement instanceof HTMLElement) {
        activeElement.blur();
      }
    }, []);

    useEffect(() => {
      setClientHydrated(true);
    }, []);

    useEffect(() => {
      if (!useMobileIde || typeof window === 'undefined') {
        return undefined;
      }

      const updateVisualViewportHeight = () => {
        const height = window.visualViewport?.height ?? window.innerHeight;
        document.documentElement.style.setProperty('--vc-mobile-visual-viewport-height', `${Math.round(height)}px`);
      };

      updateVisualViewportHeight();
      window.addEventListener('resize', updateVisualViewportHeight);
      window.visualViewport?.addEventListener('resize', updateVisualViewportHeight);
      window.visualViewport?.addEventListener('scroll', updateVisualViewportHeight);

      return () => {
        window.removeEventListener('resize', updateVisualViewportHeight);
        window.visualViewport?.removeEventListener('resize', updateVisualViewportHeight);
        window.visualViewport?.removeEventListener('scroll', updateVisualViewportHeight);
        document.documentElement.style.removeProperty('--vc-mobile-visual-viewport-height');
      };
    }, [useMobileIde]);

    /*
     * Keep the transcript's reserved bottom space in lock-step with the *actual*
     * composer height on mobile. The composer grows/shrinks as notices, the
     * tool-calls card and suggestions appear — a static clamp left a gap that
     * mismatched the sticky composer, so the last messages jumped (and could hide
     * behind the composer) every time its height changed. Measuring it removes
     * that layout jump.
     */
    useEffect(() => {
      if (!useMobileIde || typeof window === 'undefined' || typeof ResizeObserver === 'undefined') {
        return undefined;
      }

      const node = agentComposerRef.current;

      if (!node) {
        document.documentElement.style.removeProperty('--vc-agent-composer-measured-height');
        return undefined;
      }

      let lastReserved = -1;

      const updateComposerHeight = () => {
        const height = node.getBoundingClientRect().height;

        if (height <= 0) {
          return;
        }

        const reserved = Math.round(height) + 16;

        /*
         * Only rewrite the reserved space when it changes by a meaningful amount.
         * Sub-pixel/1-2px churn while streaming would otherwise re-shift the
         * transcript on every frame — the very "jumping" we're trying to kill.
         */
        if (Math.abs(reserved - lastReserved) < 6) {
          return;
        }

        lastReserved = reserved;
        document.documentElement.style.setProperty('--vc-agent-composer-measured-height', `${reserved}px`);
      };

      updateComposerHeight();

      const observer = new ResizeObserver(updateComposerHeight);
      observer.observe(node);

      return () => {
        observer.disconnect();
        document.documentElement.style.removeProperty('--vc-agent-composer-measured-height');
      };
    }, [useMobileIde, mobilePanel]);

    const closeMobileOverlays = useCallback(() => {
      setMobileToolsSheetOpen(false);
      setMobileTabSwitcherOpen(false);
      setMobileMoreMenuOpen(false);
      setMobileAgentMenuOpen(false);
      setMobileToolsQuery('');
      setMobileTabSearchQuery('');
      persistMobileOverlay(null);
    }, [persistMobileOverlay]);

    const closeMobileToolsSheet = useCallback(() => {
      setMobileToolsSheetOpen(false);
      setMobileToolsQuery('');
      persistMobileOverlay(null);
    }, [persistMobileOverlay]);

    const handleMobileOverlayEscapeKey = useCallback(
      (event: React.KeyboardEvent<HTMLElement>) => {
        if (event.key !== 'Escape') {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        closeMobileOverlays();
      },
      [closeMobileOverlays],
    );

    const openMobileToolsSheet = useCallback(() => {
      blurActiveMobileControl();
      setMobileTabSwitcherOpen(false);
      setMobileMoreMenuOpen(false);
      setMobileAgentMenuOpen(false);
      setMobileToolsQuery('');
      setMobileTabSearchQuery('');
      setMobileToolsSheetOpen(true);
      persistMobileOverlay('tools');
    }, [blurActiveMobileControl, persistMobileOverlay]);

    const openMobileTabSwitcher = useCallback(() => {
      blurActiveMobileControl();
      setMobileToolsSheetOpen(false);
      setMobileMoreMenuOpen(false);
      setMobileAgentMenuOpen(false);
      setMobileToolsQuery('');
      setMobileTabSearchQuery('');
      setMobileTabSwitcherOpen(true);
      persistMobileOverlay('tabs');
    }, [blurActiveMobileControl, persistMobileOverlay]);

    const openMobileMoreMenu = useCallback(() => {
      blurActiveMobileControl();
      setMobileToolsSheetOpen(false);
      setMobileTabSwitcherOpen(false);
      setMobileAgentMenuOpen(false);
      setMobileToolsQuery('');
      setMobileTabSearchQuery('');
      setMobileMoreMenuOpen(true);
      persistMobileOverlay('more');
    }, [blurActiveMobileControl, persistMobileOverlay]);

    const openMobileAgentMenu = useCallback(() => {
      blurActiveMobileControl();
      setMobileToolsSheetOpen(false);
      setMobileTabSwitcherOpen(false);
      setMobileMoreMenuOpen(false);
      setMobileToolsQuery('');
      setMobileTabSearchQuery('');
      setMobileAgentMenuOpen(true);
      persistMobileOverlay('agent');
    }, [blurActiveMobileControl, persistMobileOverlay]);

    useEffect(() => {
      if (!useMobileIde || !clientHydrated || !mobileOverlayStorageKey || typeof window === 'undefined') {
        return;
      }

      try {
        const rawState = window.sessionStorage.getItem(mobileOverlayStorageKey);

        if (!rawState) {
          return;
        }

        const parsedState = JSON.parse(rawState) as { overlay?: unknown; openedAt?: unknown };
        const openedAt = typeof parsedState.openedAt === 'number' ? parsedState.openedAt : 0;
        const isFresh = Date.now() - openedAt <= MOBILE_OVERLAY_RESTORE_WINDOW_MS;

        if (!isFresh) {
          window.sessionStorage.removeItem(mobileOverlayStorageKey);

          return;
        }

        if (parsedState.overlay === 'tools') {
          setMobileTabSwitcherOpen(false);
          setMobileMoreMenuOpen(false);
          setMobileAgentMenuOpen(false);
          setMobileToolsSheetOpen(true);
        } else if (parsedState.overlay === 'tabs') {
          setMobileToolsSheetOpen(false);
          setMobileMoreMenuOpen(false);
          setMobileAgentMenuOpen(false);
          setMobileTabSwitcherOpen(true);
        } else if (parsedState.overlay === 'more') {
          setMobileToolsSheetOpen(false);
          setMobileTabSwitcherOpen(false);
          setMobileAgentMenuOpen(false);
          setMobileMoreMenuOpen(true);
        } else if (parsedState.overlay === 'agent') {
          setMobileToolsSheetOpen(false);
          setMobileTabSwitcherOpen(false);
          setMobileMoreMenuOpen(false);
          setMobileAgentMenuOpen(true);
        }
      } catch {
        window.sessionStorage.removeItem(mobileOverlayStorageKey);
      }
    }, [clientHydrated, mobileOverlayStorageKey, useMobileIde]);

    const [mobileOpenTabs, setMobileOpenTabs] = useState(() =>
      ECODE_MOBILE_DEFAULT_TABS.map((tab) => ECODE_MOBILE_TAB_META[tab]),
    );

    const [activeMobileOpenTabId, setActiveMobileOpenTabId] = useState('agent');

    const { setActivePanel: persistMobilePanel } = useMobileIdePersistence(projectIdeMode ? projectId : undefined);

    const ensureMobileOpenTab = useCallback((tabId: string) => {
      const tab = ECODE_MOBILE_TAB_META[tabId] ?? {
        id: tabId,
        name: panelTitle(tabId),
        icon: panelIcon(tabId),
      };

      setMobileOpenTabs((current) => (current.some((item) => item.id === tab.id) ? current : [...current, tab]));
      setActiveMobileOpenTabId(tab.id);
    }, []);
    const setMobileIdePanel = useCallback(
      (panel: (typeof MOBILE_IDE_PANELS)[number], options: { activeTabId?: string } = {}) => {
        setMobilePanel(panel);
        persistMobilePanel(panel);
        ensureMobileOpenTab(options.activeTabId ?? (panel === 'chat' ? 'agent' : panel));

        if (panel !== 'chat') {
          workbenchStore.setShowWorkbench(true);
        }
      },
      [ensureMobileOpenTab, persistMobilePanel],
    );
    const filteredMobileToolsSheetItems = useMemo(() => {
      const query = mobileToolsQuery.trim().toLowerCase();

      if (!query) {
        return ECODE_MOBILE_TOOLS;
      }

      return ECODE_MOBILE_TOOLS.filter(
        (item) =>
          item.title.toLowerCase().includes(query) ||
          item.description.toLowerCase().includes(query) ||
          item.id.toLowerCase().includes(query),
      );
    }, [mobileToolsQuery]);
    const filteredMobileOpenTabs = useMemo(() => {
      const query = mobileTabSearchQuery.trim().toLowerCase();

      if (!query) {
        return mobileOpenTabs;
      }

      return mobileOpenTabs.filter(
        (tab) =>
          tab.name.toLowerCase().includes(query) ||
          tab.id.toLowerCase().includes(query) ||
          panelTitle(tab.id).toLowerCase().includes(query),
      );
    }, [mobileOpenTabs, mobileTabSearchQuery]);
    const goToAdjacentMobilePanel = useCallback(
      (direction: 1 | -1) => {
        const currentIndex = MOBILE_IDE_PANELS.indexOf(mobilePanel);
        const nextIndex = Math.min(Math.max(currentIndex + direction, 0), MOBILE_IDE_PANELS.length - 1);
        const nextPanel = MOBILE_IDE_PANELS[nextIndex];

        if (nextPanel && nextPanel !== mobilePanel) {
          setMobileIdePanel(nextPanel);
        }
      },
      [mobilePanel, setMobileIdePanel],
    );
    const mobileSwipeHandlers = useSwipeGesture({
      onSwipeLeft: () => {
        if (useMobileIde) {
          goToAdjacentMobilePanel(1);
        }
      },
      onSwipeRight: () => {
        if (useMobileIde) {
          goToAdjacentMobilePanel(-1);
        }
      },
      threshold: 64,
      preventScroll: useMobileIde,
    });

    useEffect(() => {
      if (!useMobileIde) {
        closeMobileOverlays();
      }
    }, [closeMobileOverlays, useMobileIde]);

    useEffect(() => {
      if (
        !useMobileIde ||
        (!mobileToolsSheetOpen && !mobileTabSwitcherOpen && !mobileMoreMenuOpen && !mobileAgentMenuOpen)
      ) {
        return undefined;
      }

      const handleMobileOverlayEscape = (event: KeyboardEvent) => {
        if (event.key !== 'Escape') {
          return;
        }

        closeMobileOverlays();
      };

      window.addEventListener('keydown', handleMobileOverlayEscape);

      return () => window.removeEventListener('keydown', handleMobileOverlayEscape);
    }, [
      closeMobileOverlays,
      mobileAgentMenuOpen,
      mobileMoreMenuOpen,
      mobileTabSwitcherOpen,
      mobileToolsSheetOpen,
      useMobileIde,
    ]);

    const [isOnline, setIsOnline] = useState(true);
    const [apiKeys, setApiKeys] = useState<Record<string, string>>(getApiKeysFromCookies());
    const [modelList, setModelList] = useState<ModelInfo[]>([]);
    const [isModelSettingsCollapsed, setIsModelSettingsCollapsed] = useState(projectIdeMode);
    const [isListening, setIsListening] = useState(false);
    const [recognition, setRecognition] = useState<SpeechRecognition | null>(null);
    const [transcript, setTranscript] = useState('');
    const [isModelLoading, setIsModelLoading] = useState<string | undefined>('all');
    const [modelError, setModelError] = useState<string | null>(null);
    const [progressAnnotations, setProgressAnnotations] = useState<ProgressAnnotation[]>([]);
    const expoUrl = useStore(expoUrlAtom);
    const [qrModalOpen, setQrModalOpen] = useState(false);
    const projectFiles = useStore(workbenchStore.files);
    const runtimePreviews = useStore(workbenchStore.previews);
    const runtimeWorkspaceStatus = useStore(workbenchStore.workspaceStatus);
    const workspaceLoading = useStore(workbenchStore.workspaceLoading);
    const workspaceError = useStore(workbenchStore.workspaceError);
    const workspaceLogs = useStore(workbenchStore.workspaceLogs);
    const quotaWarning = useStore(workbenchStore.quotaWarning);
    const billingUpgradePrompt = useStore(workbenchStore.billingUpgradePrompt);
    const previewServerState = useStore(workbenchStore.previewServerState);
    const projectFilesPanelRequest = useStore(workbenchStore.projectFilesPanelRequest);
    const selectedFile = useStore(workbenchStore.selectedFile);
    const currentView = useStore(workbenchStore.currentView);
    const currentDocument = useStore(workbenchStore.currentDocument);
    const unsavedFiles = useStore(workbenchStore.unsavedFiles);
    const theme = useStore(themeStore);
    const DEFAULT_RIGHT_PANEL_WIDTH = 280;
    const MIN_RIGHT_PANEL_WIDTH = 272;
    const MAX_RIGHT_PANEL_WIDTH = 360;
    const [rightPanelOpen, setRightPanelOpen] = useState(true);
    const [rightPanelMode, setRightPanelMode] = useState<'files' | 'preview-logs'>('files');
    const [rightPanelWidth, setRightPanelWidth] = useState(DEFAULT_RIGHT_PANEL_WIDTH);
    const [workspaceTabs, setWorkspaceTabs] = useState<IdeWorkspacePanel[]>(['editor']);
    const [activeWorkspacePanel, setActiveWorkspacePanel] = useState<IdeWorkspacePanel>('editor');
    const [paneTree, setPaneTree] = useState<IdePaneNode>(() => cloneDefaultPaneTree());
    const [activePaneId, setActivePaneId] = useState('pane-main');
    const [paneDropTarget, setPaneDropTarget] = useState<string | null>(null);

    const [agentWidth, setAgentWidth] = useState(() =>
      defaultProjectAgentPanelWidth(typeof window === 'undefined' ? undefined : window.innerWidth),
    );

    const initialBottomTerminalUiState = useMemo(readProjectBottomTerminalUiState, []);
    const [terminalBottomOpen, setTerminalBottomOpen] = useState<boolean>(initialBottomTerminalUiState.open);
    const [terminalBottomHeight, setTerminalBottomHeight] = useState<number>(initialBottomTerminalUiState.height);
    const [bottomTerminalView, setBottomTerminalView] = useState<ProjectBottomTerminalView>('terminal');
    const [editorMinimapEnabled, setEditorMinimapEnabled] = useState(true);
    const [previewDevice, setPreviewDevice] = useState<'desktop' | 'tablet' | 'mobile' | 'custom'>('desktop');
    const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
    const [commandPaletteMode, setCommandPaletteMode] = useState<'all' | 'tools' | 'files'>('all');
    const [commandPaletteQuery, setCommandPaletteQuery] = useState('');
    const [commandPaletteIndex, setCommandPaletteIndex] = useState(0);

    /*
     * Restore focus to whatever was focused when the palette opened, once it
     * closes — so keyboard users aren't dumped at the top of the document.
     */
    const commandPaletteReturnFocusRef = useRef<HTMLElement | null>(null);
    useEffect(() => {
      if (commandPaletteOpen) {
        commandPaletteReturnFocusRef.current = document.activeElement as HTMLElement | null;
        return;
      }

      const previous = commandPaletteReturnFocusRef.current;
      commandPaletteReturnFocusRef.current = null;

      if (previous && typeof previous.focus === 'function') {
        requestAnimationFrame(() => previous.focus());
      }
    }, [commandPaletteOpen]);

    const [keyboardShortcutsOpen, setKeyboardShortcutsOpen] = useState(false);
    const keyboardShortcutsRef = useFocusTrap<HTMLDivElement>(keyboardShortcutsOpen);
    const [projectKeybindingOverrides, setProjectKeybindingOverrides] = useState<KeybindingOverrideMap>({});
    const [conversationHistoryOpen, setConversationHistoryOpen] = useState(false);
    const [conversationHistoryQuery, setConversationHistoryQuery] = useState('');
    const [confirmClearHistoryOpen, setConfirmClearHistoryOpen] = useState(false);
    const [projectAgentExecutionMode, setProjectAgentExecutionMode] = useState<ProjectAgentExecutionMode>('agent');
    const isAgentRunning = projectIdeMode && isStreaming;
    const stopAgentLabel = projectAgentStopLabel(provider?.name, model);
    const [projectAgentPanelOpen, setProjectAgentPanelOpen] = useState(true);

    const [projectPlanFirst, setProjectPlanFirst] = useState(() => {
      if (typeof window === 'undefined') {
        return false;
      }

      return window.localStorage.getItem('vibecore:agent-plan-first-default') === 'true';
    });

    useEffect(() => {
      if (typeof window === 'undefined') {
        return;
      }

      window.localStorage.setItem('vibecore:agent-plan-first-default', String(projectPlanFirst));

      /*
       * Broadcast so Chat.client (owner of the /api/chat body) sends planFirst to
       * the server, where it actually forces a decompose-and-plan pass. Without
       * this the Plan toggle was cosmetic.
       */
      window.dispatchEvent(new CustomEvent('vibecore:plan-first-change', { detail: projectPlanFirst }));
    }, [projectPlanFirst]);

    /*
     * Auto-apply follows the user's "Require review of AI changes" setting:
     * default OFF ⇒ auto-apply ON (changes land silently). When the user turns
     * review on, proposals stay pending for the review queue instead.
     */
    const projectAutoApply = useAutoApplyEnabled();

    const [guidedTourOpen, setGuidedTourOpen] = useState(false);
    const [guidedTourStepIndex, setGuidedTourStepIndex] = useState(0);
    const [projectSnapshots, setProjectSnapshots] = useState<ProjectSnapshot[]>([]);

    /*
     * Backend AI conversation id of the *live* project conversation. The
     * checkpoint↔snapshot pairing keys on this so before-ai-change snapshots
     * (stamped server-side with their conversationId) can be matched to the
     * current transcript's turns, not only to archived conversations.
     */
    const [currentAiConversationId, setCurrentAiConversationId] = useState<string | undefined>(undefined);
    const agentPatchProposals = useStore(workbenchStore.agentPatchProposals);

    const pendingAgentPatchProposals = useMemo(
      () =>
        Object.values(agentPatchProposals)
          .filter((proposal) => ['pending', 'applying', 'failed'].includes(proposal.status))
          .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
      [agentPatchProposals],
    );

    /*
     * Auto-apply effect — every pending proposal is accepted silently.
     * The effect runs again whenever a new proposal lands, so existing
     * items get picked up immediately. Each silent accept fires a toast
     * with an Undo action.
     */
    const autoAppliedRef = useRef<Map<string, string>>(new Map());

    /*
     * Serializes silent auto-apply accepts. Each accept mutates shared workspace
     * state (resetAllFileModifications, a full loadRuntimeFiles tree reload, file
     * writes); firing them concurrently for a multi-file agent turn interleaved
     * those mutations non-deterministically. Chaining keeps them one-at-a-time.
     */
    const autoApplyChainRef = useRef<Promise<void>>(Promise.resolve());
    const appliedToastBufferRef = useRef<AppliedFilesToastBuffer>(new AppliedFilesToastBuffer());
    const appliedToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    /*
     * True while a coalesced toast is open; lets a flush detect that a prior
     * toast already closed (auto-close) so the next turn starts a fresh buffer.
     */
    const appliedToastOpenRef = useRef(false);

    const flushAppliedFilesToast = useCallback(() => {
      /*
       * If we previously opened a coalesced toast but it is no longer active, it
       * auto-closed (or was dismissed) — the buffered items belong to a finished
       * turn. Reset so a new agent turn starts fresh and does not re-render or
       * re-revert already-closed batches. We only reset on a *closed* prior toast,
       * never before the first toast of a turn is created.
       */
      if (appliedToastOpenRef.current && !toast.isActive(AGENT_APPLIED_TOAST_ID)) {
        appliedToastOpenRef.current = false;
        appliedToastBufferRef.current.reset();
      }

      const buffer = appliedToastBufferRef.current;

      if (buffer.isEmpty()) {
        return;
      }

      /*
       * Emit the FULL accumulated set on every flush. Each accepted file triggers
       * its own debounced flush (the serialized accepts resolve with gaps larger
       * than the debounce window), and the toast is updated in place under one
       * toast id. Carrying only the current batch would make the in-place update
       * replace the file list AND the "Undo all" closure with the last batch
       * only — silently undoing just the last proposal(s). Accumulating means the
       * toast always shows every applied file and "Undo all" reverts them all.
       */
      const { files, proposalIds } = buffer.snapshot();

      appliedToastOpenRef.current = true;

      showCoalescedAppliedToast(files, {
        onUndoAll: () => {
          for (const proposalId of proposalIds) {
            void workbenchStore.revertAgentPatchProposal(proposalId);
          }

          appliedToastOpenRef.current = false;
          appliedToastBufferRef.current.reset();
          toast.dismiss(AGENT_APPLIED_TOAST_ID);
        },
        onDismissAll: () => {
          appliedToastOpenRef.current = false;
          appliedToastBufferRef.current.reset();
          toast.dismiss(AGENT_APPLIED_TOAST_ID);
        },
      });
    }, []);

    const scheduleAppliedFilesToast = useCallback(
      (filePath: string, proposalId: string) => {
        appliedToastBufferRef.current.add(filePath, proposalId);

        if (appliedToastTimerRef.current) {
          clearTimeout(appliedToastTimerRef.current);
        }

        appliedToastTimerRef.current = setTimeout(() => {
          appliedToastTimerRef.current = null;
          flushAppliedFilesToast();
        }, 80);
      },
      [flushAppliedFilesToast],
    );

    useEffect(() => {
      return () => {
        if (appliedToastTimerRef.current) {
          clearTimeout(appliedToastTimerRef.current);
        }
      };
    }, []);

    useEffect(() => {
      for (const proposal of Object.values(agentPatchProposals)) {
        const attemptKey = autoApplyAttemptKey({
          id: proposal.id,
          updatedAt: proposal.updatedAt,
          proposedContent: proposal.proposedContent,
        });

        if (autoAppliedRef.current.get(proposal.id) === attemptKey) {
          continue;
        }

        if (!shouldAutoApplyPatch({ autoApplyEnabled: projectAutoApply, status: proposal.status })) {
          continue;
        }

        autoAppliedRef.current.set(proposal.id, attemptKey);

        const filePath = proposal.relativePath;
        const proposalId = proposal.id;
        const attemptedUpdatedAt = proposal.updatedAt;
        const attemptedContentLength = proposal.proposedContent.length;

        /*
         * A failure toast is only meaningful for the FINAL attempt on a file. An
         * intermediate streaming chunk (truncated → invalid) is superseded by a
         * newer version of the same proposal or by another still-pending proposal
         * for the same path; the auto-apply effect re-fires on those, so flashing
         * a red "Couldn't apply …" now would just churn. Re-read the LIVE store at
         * toast time (the chained apply may have run long after this closure was
         * captured) to decide whether this failure has been superseded.
         */
        const failureIsSuperseded = () =>
          shouldSuppressAutoApplyFailureToast({
            proposalId,
            filePath,
            attemptedUpdatedAt,
            attemptedContentLength,
            proposals: Object.values(workbenchStore.agentPatchProposals.get()),
          });

        autoApplyChainRef.current = autoApplyChainRef.current
          .then(() => workbenchStore.acceptAgentPatchProposal(proposalId))
          .then((result) => {
            if (result === 'accepted') {
              scheduleAppliedFilesToast(filePath, proposalId);

              return;
            }

            /*
             * A 'failed' return means the patch was rejected (validation / write
             * failure). In auto-apply mode the review queue is hidden, so without
             * an explicit toast the user would never learn the edit didn't land.
             * Use a per-file toastId so repeated failures for the SAME file (e.g.
             * several package.json proposals during streaming) collapse into ONE
             * toast instead of stacking 3-4 identical ones.
             */
            if (failureIsSuperseded()) {
              return;
            }

            toast.error(describeAutoApplyFailure(filePath), { toastId: `auto-apply-error-${filePath}` });
          })
          .catch((error) => {
            if (failureIsSuperseded()) {
              return;
            }

            toast.error(describeAutoApplyFailure(filePath, error), { toastId: `auto-apply-error-${filePath}` });
          });
      }
    }, [agentPatchProposals, scheduleAppliedFilesToast, projectAutoApply]);

    const [archivedProjectConversations, setArchivedProjectConversations] = useState<
      Array<{ id: string; title?: string; messages: Message[]; createdAt?: string; updatedAt?: string }>
    >([]);

    const [rollbackTarget, setRollbackTarget] = useState<ProjectConversationCheckpoint | null>(null);
    const [rollbackDatabase, setRollbackDatabase] = useState(false);
    const [rollbackBusy, setRollbackBusy] = useState(false);
    const [projectBackendState, setProjectBackendState] = useState<ProjectIdeBackendState>({});

    /*
     * Statusbar git sync (E24): the `↑N ↓M` ahead/behind badge is a real
     * Push/Pull control. `statusbarGitRemoteUrl` tracks whether a remote is
     * configured (undefined = not known yet, null = none) so the actions can
     * be disabled with a reason instead of failing.
     */
    const [statusbarGitBusy, setStatusbarGitBusy] = useState(false);
    const [statusbarGitRemoteUrl, setStatusbarGitRemoteUrl] = useState<string | null | undefined>(undefined);
    const statusbarGitBranch = projectBackendState.git?.branch;

    const runStatusbarGitSync = useCallback(
      async (intent: 'push' | 'pull') => {
        if (!projectId || statusbarGitBusy) {
          return;
        }

        setStatusbarGitBusy(true);

        try {
          // Same real endpoint as the Git pane (handles SSH-in-workspace-pod vs API-pod path).
          const formData = new FormData();
          formData.set('intent', intent);
          formData.set('branch', statusbarGitBranch ?? 'main');

          const response = await fetch(`/api/projects/${projectId}/ide-panel/git`, {
            method: 'POST',
            body: formData,
          });

          const result = (await response.json().catch(() => ({}))) as { error?: string };

          if (!response.ok) {
            throw new Error(result.error ?? `Git ${intent} failed`);
          }

          toast.success(`Git ${intent} completed`);

          // Refresh the ahead/behind counts right away instead of waiting for the overview stream.
          const refreshed = await fetch(`/api/projects/${projectId}/ide-panel/overview`, {
            headers: { accept: 'application/json' },
          });

          if (refreshed.ok) {
            const envelope = (await refreshed.json()) as { data?: ProjectIdeBackendState };

            if (envelope.data) {
              setProjectBackendState((current) => ({
                ...envelope.data,
                collaborators: envelope.data?.collaborators ?? current.collaborators ?? [],
              }));
            }
          }
        } catch (error) {
          toast.error(error instanceof Error ? error.message : `Git ${intent} failed`);
        } finally {
          setStatusbarGitBusy(false);
        }
      },
      [projectId, statusbarGitBranch, statusbarGitBusy],
    );

    const setDiagnosticsForSource = useDiagnosticsStore((state) => state.setDiagnosticsForSource);
    const diagnosticErrorCount = useDiagnosticsStore((state) => state.errors);
    const diagnosticWarningCount = useDiagnosticsStore((state) => state.warnings);

    const [cursorPositions, setCursorPositions] = useState<
      Record<string, { line: number; column: number; offset?: number }>
    >({});

    const [scrollPositions, setScrollPositions] = useState<Record<string, number>>({});
    const [recentTabIds, setRecentTabIds] = useState<string[]>([]);
    const [closedTabs, setClosedTabs] = useState<IdePaneTab[]>([]);
    const [agentToolAction, setAgentToolAction] = useState<AgentToolAction | null>(null);
    const [projectStateReady, setProjectStateReady] = useState(!projectIdeMode || !projectId);
    const restoredProjectId = useRef<string | undefined>(undefined);
    const pendingProjectSelectedFile = useRef<string | undefined>(undefined);
    const scrollUpdateFrame = useRef<number | null>(null);
    const agentComposerRef = useRef<HTMLDivElement | null>(null);
    const activeProjectPanel = readPanelSearchParam(searchParams, IDE_URL_PANELS) || '';

    const setProjectPanelSearchParam = useCallback(
      (panel?: string) => {
        setSearchParams((current) => withPanelSearchParam(current, panel));
      },
      [setSearchParams],
    );

    const activeMobileServicePanel = useMemo<IdeManagementPanel>(() => {
      return isIdeManagementPanel(activeProjectPanel) ? activeProjectPanel : 'deployments';
    }, [activeProjectPanel]);

    const firstProjectFile = useMemo(() => {
      return Object.entries(projectFiles).find(([, file]) => file?.type === 'file')?.[0];
    }, [projectFiles]);
    const projectFilePaths = useMemo(
      () => Object.keys(projectFiles).filter((filePath) => projectFiles[filePath]?.type === 'file'),
      [projectFiles],
    );

    /*
     * Visible files share the same hidden-path filter as ProjectFilesTool
     * so the rail badge, the panel header, and the tree all agree on one
     * count. Power tooling (search index, mention picker) keeps using
     * `projectFilePaths` because it needs every indexed path.
     */
    const visibleProjectFilePaths = useMemo(
      () => projectFilePaths.filter((filePath) => !isIdeHiddenPath(filePath)),
      [projectFilePaths],
    );

    const recentProjectFiles = useMemo(() => projectFilePaths.slice(0, 5), [projectFilePaths]);

    const editorProjectFiles = useMemo(
      () =>
        Object.fromEntries(
          Object.entries(projectFiles).flatMap(([filePath, file]) =>
            file?.type === 'file' && !file.isBinary ? [[filePath, file.content]] : [],
          ),
        ),
      [projectFiles],
    );

    const backendLockedItems = useMemo(
      () =>
        Object.entries(projectFiles)
          .filter(([, file]) => file?.isLocked && !file.lockedByFolder)
          .map(([filePath, file]) => ({
            path: filePath,
            type: (file?.type === 'folder' ? 'folder' : 'file') as 'file' | 'folder',
          })),
      [projectFiles],
    );

    const backendDeletedPaths = useMemo(() => workbenchStore.getDeletedPaths(), [projectFiles]);

    const projectRuntimeState = useMemo<ProjectIdeBackendState>(() => {
      const runtimePorts = runtimePreviews.map((preview) => ({
        port: preview.port,
        ready: preview.ready,
        type: 'open',
        url: preview.baseUrl,
      }));

      const effectiveWorkspace = runtimeWorkspaceStatus ?? projectBackendState.workspace ?? null;

      /*
       * Ground-truth reconciliation: a forwarded port that is genuinely serving means
       * the runtime IS running, even while the API/session status still lags at
       * PENDING/STARTING (cold-start). Surface 'running' on the SHARED status here so
       * EVERY consumer of the raw status field — the bottom-terminal "… workspace"
       * badge, the status label, the runtime diagnostics — reflects reality without
       * each render site re-deriving it. The status flips the instant a port responds,
       * not when the API finally reconciles.
       */
      const servingLive = hasLivePreviewPort(runtimePorts);

      return {
        ...projectBackendState,
        workspace: effectiveWorkspace
          ? {
              ...effectiveWorkspace,
              status: servingLive ? 'running' : effectiveWorkspace.status,
              ports: 'ports' in effectiveWorkspace ? (effectiveWorkspace.ports ?? runtimePorts) : runtimePorts,
            }
          : null,
        ports: runtimePorts.length ? runtimePorts : (projectBackendState.ports ?? []),
      };
    }, [projectBackendState, runtimePreviews, runtimeWorkspaceStatus]);

    const runtimePorts = projectRuntimeState.ports ?? [];
    const isRuntimeReallyRunning = isWorkspaceReallyRunning(projectRuntimeState.workspace, runtimePorts);

    /*
     * A forwarded port that is actually serving means the runtime is healthy — even
     * if the workspace status still lags behind (a cold-start where the pod became
     * ready after the initial provisioning request timed out / returned a transient
     * 500). Clear any stale workspaceError so it stops surfacing a persistent
     * "Error runtime … 500" in Problems and a stuck PENDING/Error status after the
     * preview has already come up. If the runtime errors again the store re-sets it.
     */
    const previewPortLive = runtimePorts.some((port) => port.ready === true || Boolean(port.url));
    useEffect(() => {
      /*
       * Re-run on workspaceError too: a transient 500 can be re-set AFTER the port
       * went live (the store re-sets it on a later failed poll), and keying only on
       * previewPortLive would miss that second error and leave it stuck in Problems.
       */
      if (previewPortLive && workbenchStore.workspaceError.get()) {
        workbenchStore.workspaceError.set(undefined);
      }
    }, [previewPortLive, workspaceError]);

    const runtimeUiState = workspaceUiState(projectRuntimeState.workspace, {
      ports: runtimePorts,
      loading: workspaceLoading,
      error: workspaceError,
    });

    const previewServerStatus = previewServerState.status;

    const [mobilePreviewRunFeedbackState, setMobilePreviewRunFeedbackState] = useState<CompactPreviewRunState | null>(
      null,
    );

    const resolvedMobilePreviewRunState = resolveCompactPreviewRunState({
      previewServerStatus,
      runtimeRunning: isRuntimeReallyRunning,
      runtimeStarting: runtimeUiState === 'starting',
    });

    const mobilePreviewRunState = mobilePreviewRunFeedbackState ?? resolvedMobilePreviewRunState;

    const isMobilePreviewRunActive = isCompactPreviewRunActive(mobilePreviewRunState);
    const isMobilePreviewStopping = mobilePreviewRunState === 'stopping';
    const isMobilePreviewTransitioning = mobilePreviewRunState === 'starting' || mobilePreviewRunState === 'stopping';
    const mobilePreviewRunLabel = compactPreviewRunAriaLabel(mobilePreviewRunState);
    const mobilePreviewRunIcon = compactPreviewRunIcon(mobilePreviewRunState);

    useEffect(() => {
      if (!mobilePreviewRunFeedbackState) {
        return;
      }

      if (mobilePreviewRunFeedbackState === 'starting' && resolvedMobilePreviewRunState !== 'idle') {
        setMobilePreviewRunFeedbackState(null);
      }

      if (
        mobilePreviewRunFeedbackState === 'stopping' &&
        (resolvedMobilePreviewRunState === 'stopping' || !isCompactPreviewRunActive(resolvedMobilePreviewRunState))
      ) {
        setMobilePreviewRunFeedbackState(null);
      }
    }, [mobilePreviewRunFeedbackState, resolvedMobilePreviewRunState]);

    const runtimeStatusSummary = useMemo(
      () =>
        runtimeStatusText({
          workspaceStatus: projectRuntimeState.workspace,
          ports: runtimePorts,
          workspaceLoading,
          workspaceError,
        }),
      [projectRuntimeState.workspace, runtimePorts, workspaceError, workspaceLoading],
    );
    const runtimePortSummary = useMemo(
      () =>
        previewPortText({
          previews: runtimePreviews,
          workspaceLoading,
          workspaceError,
          previewServerState,
        }),
      [previewServerState, runtimePreviews, workspaceError, workspaceLoading],
    );
    const runtimePortCompactSummary = useMemo(
      () =>
        previewPortCompactText({
          previews: runtimePreviews,
          workspaceLoading,
          workspaceError,
          previewServerState,
        }),
      [previewServerState, runtimePreviews, workspaceError, workspaceLoading],
    );
    const runtimeDevServerSummary = useMemo(
      () =>
        devServerStatusText({
          previews: runtimePreviews,
          workspaceLoading,
          workspaceError,
          logs: workspaceLogs,
          previewServerState,
        }),
      [previewServerState, runtimePreviews, workspaceError, workspaceLoading, workspaceLogs],
    );
    const workspaceStatusLabel = useMemo(() => {
      // A live serving port means Running — beats a stale error or a lagging status.
      if (isRuntimeReallyRunning || previewPortLive) {
        return 'Running';
      }

      if (workspaceError) {
        return 'Error';
      }

      if (workspaceLoading) {
        return 'Starting';
      }

      const status = projectRuntimeState.workspace?.status?.toLowerCase();

      if (status === 'running') {
        return 'Running';
      }

      if (status === 'booting' || status === 'starting') {
        return 'Starting';
      }

      return projectRuntimeState.workspace?.status ?? 'Stopped';
    }, [isRuntimeReallyRunning, previewPortLive, projectRuntimeState.workspace, workspaceError, workspaceLoading]);
    const handleMobilePreviewRunToggle = useCallback(() => {
      setMobileIdePanel('preview');
      setProjectPanelSearchParam('preview');

      if (isMobilePreviewRunActive) {
        setMobilePreviewRunFeedbackState('stopping');
        void workbenchStore.stopPreviewServer().catch((error) => {
          setMobilePreviewRunFeedbackState(null);
          toast.error(error instanceof Error ? error.message : 'Failed to stop the preview server');
        });

        return;
      }

      setMobilePreviewRunFeedbackState('starting');
      void workbenchStore.startPreviewServer().catch((error) => {
        setMobilePreviewRunFeedbackState(null);
        toast.error(error instanceof Error ? error.message : 'Failed to start the preview server');
      });
    }, [isMobilePreviewRunActive, setMobileIdePanel, setProjectPanelSearchParam]);
    const workspaceStatusTitle = useMemo(
      () =>
        [
          `Workspace: ${workspaceStatusLabel}`,
          workspaceError,
          quotaWarning,
          billingUpgradePrompt,
          workspaceLogs.length > 0 ? `${workspaceLogs.length} log lines` : undefined,
        ]
          .filter(Boolean)
          .join(' | '),
      [billingUpgradePrompt, quotaWarning, workspaceError, workspaceLogs.length, workspaceStatusLabel],
    );
    useEffect(() => {
      setDiagnosticsForSource(
        'runtime',
        projectIdeMode
          ? buildRuntimeDiagnostics({
              workspaceError,
              workspaceLogs,

              /*
               * Once a forwarded port is serving, drop the stale cold-start 500/502
               * provisioning errors (workspaceError AND log-derived) from Problems.
               */
              previewLive: previewPortLive,
            })
          : [],
      );
    }, [projectIdeMode, setDiagnosticsForSource, workspaceError, workspaceLogs, previewPortLive]);

    const statusbarDiagnostics = useMemo(
      () => ({
        errors: diagnosticErrorCount,
        warnings: diagnosticWarningCount,
      }),
      [diagnosticErrorCount, diagnosticWarningCount],
    );

    const statusbarChangedFiles = projectBackendState.git?.changedFiles?.length ?? 0;

    /*
     * Statusbar connection indicator: reuses the browser online state that
     * already drives .bolt-connection-status (no new polling) plus the live
     * workspace status for the 'Reconnecting' nuance.
     */
    const statusbarConnection = !isOnline
      ? ({ label: 'Offline', color: 'var(--vc-ide-accent-error)', text: 'var(--status-error-text)' } as const)
      : workspaceLoading || runtimeWorkspaceStatus === 'STARTING' || runtimeWorkspaceStatus === 'PENDING'
        ? ({
            label: 'Reconnecting',
            color: 'var(--vc-ide-accent-warning)',
            text: 'var(--status-warning-text)',
          } as const)
        : ({ label: 'Connected', color: 'var(--vc-ide-accent-success)', text: 'var(--status-success-text)' } as const);

    const projectConversationCheckpoints = useMemo<ProjectConversationCheckpoint[]>(() => {
      if (!projectIdeMode || !projectId) {
        return [];
      }

      const conversationSources = [
        ...archivedProjectConversations.map((conversation) => ({
          id: conversation.id,
          title: conversation.title ?? 'Project conversation',
          messages: conversation.messages,
          createdAt: conversation.createdAt,
          updatedAt: conversation.updatedAt,
          backendConversationId: conversation.backendConversationId,
        })),
        {
          id: `project:${projectId}`,
          title: 'Current project conversation',
          messages: messages ?? [],
          createdAt: undefined,
          updatedAt: undefined,
          backendConversationId: currentAiConversationId,
        },
      ].filter((conversation) => conversation.messages.length);

      /*
       * Pair each assistant turn to the snapshot representing the state BEFORE the
       * turn ran, using the persisted (conversationId, turnIndex) association — NOT
       * by ordinal array position. One agent turn can take several before-ai-change
       * snapshots (one per mutating tool call), so the old `snapshots[N - 1]` index
       * pointed at an unrelated snapshot and "Rollback here" silently restored the
       * wrong files. See app/lib/chat/checkpoint-snapshots.ts.
       */
      const checkpointTurns: CheckpointTurn[] = [];
      const turnOrdinalByConversation = new Map<string, number>();

      const turnKeyFor = (conversationId: string, messageId: string | undefined, index: number) =>
        `${conversationId}:${messageId ?? index}`;

      conversationSources.forEach((conversation) => {
        conversation.messages.forEach((message, index) => {
          if (message.role !== 'assistant') {
            return;
          }

          const ordinal = turnOrdinalByConversation.get(conversation.id) ?? 0;
          turnOrdinalByConversation.set(conversation.id, ordinal + 1);

          checkpointTurns.push({
            key: turnKeyFor(conversation.id, message.id, index),
            backendConversationId: conversation.backendConversationId,
            turnOrdinal: ordinal,
          });
        });
      });

      const snapshotPairings = pairCheckpointsToSnapshots<ProjectSnapshot>(checkpointTurns, projectSnapshots);

      /*
       * Legacy fallback. Snapshots created before the association existed carry no
       * conversationId/turnIndex, so `pairCheckpointsToSnapshots` returns no match
       * for their turns. Only when NO snapshot in the project carries the
       * association do we fall back to the old best-effort ordinal heuristic — a
       * project that has *any* associated snapshot is fully on the precise path,
       * and we never silently bind an associated turn to an unrelated snapshot.
       */
      const hasAnyAssociatedSnapshot = projectSnapshots.some(
        (snapshot) => snapshot.conversationId && snapshot.turnIndex !== undefined && snapshot.turnIndex !== null,
      );

      const resolveCheckpointSnapshot = (
        pairing: CheckpointSnapshotPairing<ProjectSnapshot> | undefined,
        legacyIndex: number,
      ): ProjectSnapshot | undefined => {
        if (pairing?.match === 'association') {
          return pairing.snapshot;
        }

        if (hasAnyAssociatedSnapshot) {
          /* Precise data exists but this turn has none — do not guess. */
          return undefined;
        }

        return projectSnapshots[legacyIndex] ?? projectSnapshots[projectSnapshots.length - 1];
      };

      const checkpoints: ProjectConversationCheckpoint[] = [];

      let checkpointNumber = 0;

      conversationSources.forEach((conversation) => {
        let lastUserMessage: Message | undefined;

        const assistantCheckpointsBeforeConversation = checkpoints.length;

        conversation.messages.forEach((message, index) => {
          if (message.role === 'user') {
            lastUserMessage = message;
            return;
          }

          if (message.role !== 'assistant') {
            return;
          }

          checkpointNumber += 1;

          const createdAt = messageCreatedAt(message) ?? messageCreatedAt(lastUserMessage) ?? conversation.updatedAt;

          const snapshot = resolveCheckpointSnapshot(
            snapshotPairings.get(turnKeyFor(conversation.id, message.id, index)),
            checkpointNumber - 1,
          );

          const title = shortContent(lastUserMessage?.content, `Checkpoint ${checkpointNumber}`);
          const description = shortContent(message.content, 'Agent response checkpoint');

          checkpoints.push({
            id: `${conversation.id}:${message.id ?? index}`,
            title,
            description,
            messageId: message.id,
            messageIndex: index,
            conversationId: conversation.id,
            conversationTitle: conversation.title,
            createdAt,
            ageLabel: timeAgo(createdAt ?? snapshot?.createdAt ?? conversation.createdAt),
            commitSha: snapshot?.id?.slice(0, 8),
            snapshot,
            messages: conversation.messages.slice(0, index + 1),
            backendConversationId: conversation.backendConversationId,
          });
        });

        if (checkpoints.length === assistantCheckpointsBeforeConversation && conversation.messages.length) {
          const lastMessage = conversation.messages[conversation.messages.length - 1];
          const firstUserMessage = conversation.messages.find((message) => message.role === 'user');

          const createdAt =
            messageCreatedAt(lastMessage) ?? messageCreatedAt(firstUserMessage) ?? conversation.updatedAt;

          /*
           * This branch covers a conversation with no assistant turn yet (e.g.
           * "Waiting for the agent response"), so there is no turn to pair. Fall
           * back to the legacy ordinal only when no associated snapshot exists.
           */
          const snapshot = resolveCheckpointSnapshot(undefined, checkpointNumber);

          checkpoints.push({
            id: `${conversation.id}:${lastMessage.id ?? 'latest'}`,
            title: shortContent(firstUserMessage?.content ?? lastMessage.content, conversation.title),
            description:
              lastMessage.role === 'user'
                ? 'Waiting for the agent response'
                : shortContent(lastMessage.content, 'Project conversation checkpoint'),
            messageId: lastMessage.id,
            messageIndex: conversation.messages.length - 1,
            conversationId: conversation.id,
            conversationTitle: conversation.title,
            createdAt,
            ageLabel: timeAgo(createdAt ?? snapshot?.createdAt ?? conversation.createdAt),
            commitSha: snapshot?.id?.slice(0, 8),
            snapshot,
            messages: conversation.messages,
            backendConversationId: conversation.backendConversationId,
          });
        }
      });

      if (!checkpoints.length && messages?.length) {
        const sourceMessages = messages;
        const lastMessage = sourceMessages[sourceMessages.length - 1];
        const createdAt = messageCreatedAt(lastMessage);
        const snapshot = resolveCheckpointSnapshot(undefined, 0);

        checkpoints.push({
          id: `${lastMessage.id ?? 'current'}`,
          title: shortContent(sourceMessages.find((message) => message.role === 'user')?.content, 'Current chat'),
          description: 'Current project conversation',
          messageId: lastMessage.id,
          messageIndex: sourceMessages.length - 1,
          conversationId: `project:${projectId}`,
          conversationTitle: 'Current project conversation',
          createdAt,
          ageLabel: timeAgo(createdAt ?? snapshot?.createdAt),
          commitSha: snapshot?.id?.slice(0, 8),
          snapshot,
          messages: sourceMessages,
        });
      }

      return checkpoints.reverse();
    }, [archivedProjectConversations, currentAiConversationId, messages, projectId, projectIdeMode, projectSnapshots]);
    const filteredProjectConversationCheckpoints = useMemo(() => {
      const query = conversationHistoryQuery.trim().toLowerCase();

      if (!query) {
        return projectConversationCheckpoints;
      }

      return projectConversationCheckpoints.filter((checkpoint) => {
        const searchable = [
          checkpoint.title,
          checkpoint.description,
          checkpoint.conversationTitle,
          checkpoint.commitSha,
          checkpoint.ageLabel,
          ...checkpoint.messages.map((message) => message.content),
        ]
          .filter(Boolean)
          .join('\n')
          .toLowerCase();

        return searchable.includes(query);
      });
    }, [conversationHistoryQuery, projectConversationCheckpoints]);
    const projectAgentSuggestions = useMemo(
      () =>
        buildProjectAgentSuggestions({
          files: projectFiles,
          selectedFile,
          messages,
          backendState: projectBackendState,
          runtimeState: projectRuntimeState,
          workspaceLogs,
          activePanel: activeWorkspacePanel,
          chatStarted,
        }),
      [
        activeWorkspacePanel,
        chatStarted,
        messages,
        projectBackendState,
        projectFiles,
        projectRuntimeState,
        selectedFile,
        workspaceLogs,
      ],
    );

    const mobileAgentFileCount = useMemo(() => Object.keys(projectFiles ?? {}).length, [projectFiles]);

    const visibleProjectMessageCount = useMemo(
      () =>
        (messages ?? []).filter((message) => message.role !== 'system' && !message.annotations?.includes('hidden'))
          .length,
      [messages],
    );

    const mobileAgentSelectedFileLabel = useMemo(() => {
      if (!selectedFile) {
        return undefined;
      }

      return selectedFile.replace(`${WORK_DIR}/`, '').replace(/^\/+/, '');
    }, [selectedFile]);

    const mobileAgentStatusLabel = isAgentRunning
      ? 'Working'
      : chatStarted || visibleProjectMessageCount > 0
        ? `${visibleProjectMessageCount} messages`
        : 'Ready';

    const shouldShowMobileAgentStartState = projectIdeMode && useMobileIde && visibleProjectMessageCount === 0;

    const mobileAgentContextLabel = mobileAgentSelectedFileLabel
      ? mobileAgentSelectedFileLabel
      : mobileAgentFileCount > 0
        ? `${mobileAgentFileCount} files loaded`
        : 'Workspace ready';
    useEffect(() => {
      setProjectStateReady(!projectIdeMode || !projectId);
      restoredProjectId.current = undefined;
      pendingProjectSelectedFile.current = undefined;
    }, [projectIdeMode, projectId]);

    useEffect(() => {
      workbenchStore.setAgentPatchReviewRequired(
        projectIdeMode && (projectAgentExecutionMode === 'edit' || projectAgentExecutionMode === 'agent'),
      );

      return () => {
        workbenchStore.setAgentPatchReviewRequired(false);
      };
    }, [projectAgentExecutionMode, projectIdeMode]);

    useEffect(() => {
      if (!projectIdeMode || !projectId) {
        return;
      }

      try {
        setConversationHistoryQuery(localStorage.getItem(`vibecore.agentHistorySearch.${projectId}`) ?? '');
      } catch {
        setConversationHistoryQuery('');
      }
    }, [projectId, projectIdeMode]);

    useEffect(() => {
      if (!projectIdeMode || !projectId) {
        return;
      }

      try {
        const storageKey = `vibecore.agentHistorySearch.${projectId}`;

        if (conversationHistoryQuery.trim()) {
          localStorage.setItem(storageKey, conversationHistoryQuery);
        } else {
          localStorage.removeItem(storageKey);
        }
      } catch {
        // Search persistence is best-effort and must never block the IDE.
      }
    }, [conversationHistoryQuery, projectId, projectIdeMode]);

    useEffect(() => {
      return () => {
        if (scrollUpdateFrame.current !== null) {
          window.cancelAnimationFrame(scrollUpdateFrame.current);
          scrollUpdateFrame.current = null;
        }
      };
    }, []);

    useEffect(() => {
      workbenchStore.setDocuments(projectFiles);
    }, [projectFiles]);

    useEffect(() => {
      if (!projectIdeMode || !projectId) {
        return undefined;
      }

      let cancelled = false;
      let eventSource: EventSource | undefined;
      let fallbackInterval: number | undefined;

      const applyOverviewData = (data?: ProjectIdeBackendState | null) => {
        if (cancelled || !data) {
          return;
        }

        setProjectBackendState({
          ...(data ?? {}),
          collaborators: data.collaborators ?? [],
        });
      };

      async function loadProjectBackendState() {
        try {
          const [overviewResponse, collaboratorsResponse] = await Promise.all([
            fetch(`/api/projects/${projectId}/ide-panel/overview`, { headers: { accept: 'application/json' } }),
            fetch(`/api/projects/${projectId}/ide-panel/collaborators`, { headers: { accept: 'application/json' } }),
          ]);

          const overview = (overviewResponse.ok ? await overviewResponse.json() : {}) as {
            data?: ProjectIdeBackendState;
            project?: { gitRepositoryUrl?: string | null };
          };
          const collaborators = (collaboratorsResponse.ok ? await collaboratorsResponse.json() : {}) as {
            data?: { collaborators?: ProjectIdeBackendState['collaborators'] };
          };

          if (!cancelled) {
            setProjectBackendState({
              ...(overview.data ?? {}),
              collaborators: collaborators.data?.collaborators ?? [],
            });

            if (overviewResponse.ok) {
              setStatusbarGitRemoteUrl(overview.project?.gitRepositoryUrl ?? null);
            }
          }
        } catch (error) {
          if (!cancelled) {
            console.error('Failed to load project IDE backend state', error);
          }
        }
      }

      function startFallbackPolling() {
        if (fallbackInterval || cancelled) {
          return;
        }

        void loadProjectBackendState();
        fallbackInterval = window.setInterval(loadProjectBackendState, 30_000);
      }

      if (typeof EventSource === 'undefined') {
        startFallbackPolling();
      } else {
        eventSource = new EventSource(`/api/projects/${projectId}/ide-panel/overview?stream=1`);

        /*
         * EventSource auto-reconnects on transient drops. Resetting this counter
         * on every successful open/message means a single network blip — or the
         * server recycling the stream on its periodic interval — no longer
         * strands the panel on 30s polling for the rest of the session.
         */
        let consecutiveErrors = 0;

        eventSource.onopen = () => {
          consecutiveErrors = 0;
        };

        eventSource.addEventListener('overview', (event) => {
          consecutiveErrors = 0;

          try {
            const envelope = JSON.parse((event as MessageEvent<string>).data) as {
              data?: ProjectIdeBackendState;
              status?: string;
              project?: { gitRepositoryUrl?: string | null };
            };

            if (envelope.status !== 'error') {
              applyOverviewData(envelope.data);
              setStatusbarGitRemoteUrl(envelope.project?.gitRepositoryUrl ?? null);
            }
          } catch (error) {
            console.error('Failed to parse project IDE overview stream', error);
          }
        });

        eventSource.onerror = () => {
          if (cancelled) {
            return;
          }

          consecutiveErrors += 1;

          /*
           * Only give up on the live stream once the browser has permanently
           * closed it, or after several consecutive failures (a genuinely dead
           * endpoint that EventSource would otherwise retry forever). A lone
           * transient error is left to EventSource's own reconnect.
           */
          if (eventSource?.readyState === EventSource.CLOSED || consecutiveErrors >= 3) {
            console.warn('Project IDE overview stream unhealthy; falling back to slow refresh.');
            eventSource?.close();
            startFallbackPolling();
          }
        };
      }

      return () => {
        cancelled = true;
        eventSource?.close();

        if (fallbackInterval) {
          window.clearInterval(fallbackInterval);
        }
      };
    }, [projectIdeMode, projectId]);

    /*
     * Snapshots are project-scoped, so they must NOT re-fetch when the workspace
     * id churns (PENDING→Starting→Running plus heartbeats during provisioning) —
     * doing so fired the snapshots endpoint dozens of times during startup and
     * tripped its rate limit (a 429 storm in the console). Keyed on projectId only.
     */
    useEffect(() => {
      if (!projectIdeMode || !projectId) {
        setProjectSnapshots([]);

        return undefined;
      }

      let cancelled = false;

      const safeProjectId = projectId;

      async function loadProjectSnapshots() {
        try {
          const response = await fetch(`/api/projects/${safeProjectId}/ide-panel/snapshots`, {
            headers: { accept: 'application/json' },
          });

          if (!response.ok || cancelled) {
            return;
          }

          const payload = (await response.json()) as {
            data?: { snapshots?: ProjectSnapshot[] };
          };

          if (!cancelled) {
            setProjectSnapshots([...(payload.data?.snapshots ?? [])].reverse());
          }
        } catch (reason) {
          console.warn('Project snapshots unavailable for conversation history', reason);
        }
      }

      void loadProjectSnapshots();

      return () => {
        cancelled = true;
      };
    }, [projectIdeMode, projectId]);

    useEffect(() => {
      if (!projectIdeMode || !projectId) {
        setArchivedProjectConversations([]);

        return undefined;
      }

      let cancelled = false;

      const safeProjectId = projectId;
      const safeWorkspaceId = currentWorkspaceId;

      async function loadBackendProjectConversations(activeConversationId?: string) {
        const conversationsResponse = await fetch(
          `/api/projects/${encodeURIComponent(safeProjectId)}/ai/conversations?limit=20`,
          { headers: { accept: 'application/json' } },
        );

        if (!conversationsResponse.ok) {
          return [];
        }

        const conversationsPayload = (await conversationsResponse.json()) as {
          conversations?: Array<{ id?: string; title?: string; createdAt?: string }>;
        };

        const conversations = (conversationsPayload.conversations ?? []).filter(
          (conversation) => conversation?.id && conversation.id !== activeConversationId,
        );

        const hydrated = await Promise.all(
          conversations.map(async (conversation) => {
            const messagesResponse = await fetch(
              `/api/projects/${encodeURIComponent(safeProjectId)}/ai/conversations/${encodeURIComponent(
                conversation.id!,
              )}/messages`,
              { headers: { accept: 'application/json' } },
            );

            if (!messagesResponse.ok) {
              return undefined;
            }

            const messagesPayload = (await messagesResponse.json()) as ProjectAiMessagesResponse;
            const hydratedMessages = projectAiMessagesToChatMessages(messagesPayload.messages);

            if (!hydratedMessages.length) {
              return undefined;
            }

            return {
              id: conversation.id!,
              title: conversation.title || 'Project conversation',
              messages: hydratedMessages,
              createdAt: conversation.createdAt,
              updatedAt: conversation.createdAt,
              backendConversationId: conversation.id!,
            };
          }),
        );

        return hydrated.filter(Boolean);
      }

      async function loadProjectConversationMemory() {
        try {
          const memory = await getProjectIdeMemory(safeProjectId, safeWorkspaceId);

          const memoryConversations = (memory?.chat?.conversations ?? []).filter(
            (conversation) => conversation && Array.isArray(conversation.messages),
          );

          const liveAiConversationId = memory?.chat?.metadata?.aiConversationId;
          const backendConversations = await loadBackendProjectConversations(liveAiConversationId);

          const conversationsById = new Map<string, (typeof memoryConversations)[number]>();

          if (!cancelled) {
            for (const conversation of [...backendConversations, ...memoryConversations]) {
              conversationsById.set(conversation.id, conversation);
            }

            setArchivedProjectConversations(Array.from(conversationsById.values()));
            setCurrentAiConversationId(liveAiConversationId);
          }
        } catch (reason) {
          console.warn('Project conversation memory unavailable', reason);
        }
      }

      void loadProjectConversationMemory();

      return () => {
        cancelled = true;
      };
    }, [projectIdeMode, projectId, currentWorkspaceId]);

    useEffect(() => {
      if (!projectIdeMode || !projectId || restoredProjectId.current === projectId) {
        return undefined;
      }

      let cancelled = false;
      restoredProjectId.current = projectId;

      const restoreFallbackTimer = window.setTimeout(() => {
        if (!cancelled) {
          setProjectStateReady(true);
        }
      }, PROJECT_IDE_STATE_RESTORE_FALLBACK_MS);

      getProjectIdeMemory(projectId, currentWorkspaceId)
        .then((memory) => {
          if (cancelled) {
            return;
          }

          const ui = memory.ui;

          if (typeof ui?.rightPanelOpen === 'boolean') {
            setRightPanelOpen(ui.rightPanelOpen);
          }

          if (ui?.rightPanelMode === 'preview-logs') {
            setRightPanelMode('preview-logs');
          }

          if (typeof ui?.rightPanelWidth === 'number') {
            setRightPanelWidth(Math.min(MAX_RIGHT_PANEL_WIDTH, Math.max(MIN_RIGHT_PANEL_WIDTH, ui.rightPanelWidth)));
          }

          const restoredTabs = Array.isArray(ui?.workspaceTabs)
            ? ui.workspaceTabs.filter((panel: string) => isIdeWorkspacePanel(panel))
            : [];

          if (restoredTabs.length) {
            setWorkspaceTabs(restoredTabs);
          }

          if (
            !useMobileIde &&
            !activeProjectPanel &&
            ui?.activeWorkspacePanel &&
            isIdeWorkspacePanel(ui.activeWorkspacePanel)
          ) {
            setActiveWorkspacePanel(ui.activeWorkspacePanel);
          }

          if (ui?.paneTree && typeof ui.paneTree === 'object') {
            setPaneTree(normalizePaneTree(ui.paneTree));
          }

          setActivePaneId('pane-main');

          if (typeof ui?.agentWidth === 'number') {
            setAgentWidth(clampProjectAgentPanelWidth(ui.agentWidth));
          }

          const localBottomTerminalUiState = readProjectBottomTerminalUiState();

          if (localBottomTerminalUiState.stored) {
            setTerminalBottomOpen(localBottomTerminalUiState.open);
            setTerminalBottomHeight(localBottomTerminalUiState.height);
          } else if (typeof ui?.terminalBottomOpen === 'boolean') {
            setTerminalBottomOpen(ui.terminalBottomOpen);
          }

          if (!localBottomTerminalUiState.stored && typeof ui?.terminalBottomHeight === 'number') {
            setTerminalBottomHeight(Math.min(720, Math.max(320, ui.terminalBottomHeight)));
          }

          if (ui?.cursorPositions && typeof ui.cursorPositions === 'object') {
            setCursorPositions(ui.cursorPositions);
          }

          if (typeof ui?.editorMinimapEnabled === 'boolean') {
            setEditorMinimapEnabled(ui.editorMinimapEnabled);
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
            useMobileIde &&
            !activeProjectPanel &&
            ['chat', 'files', 'editor', 'search', 'locks', 'terminal', 'preview', 'deploy'].includes(ui.mobilePanel)
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

          if (Array.isArray(ui?.lockedItems)) {
            ui.lockedItems.forEach((item: { path?: string; type?: string }) => {
              if (!item?.path) {
                return;
              }

              if (item.type === 'folder') {
                workbenchStore.lockFolder(item.path);
              } else {
                workbenchStore.lockFile(item.path);
              }
            });
          }

          if (Array.isArray(ui?.deletedPaths)) {
            workbenchStore.setDeletedPaths(ui.deletedPaths.filter((filePath: unknown) => typeof filePath === 'string'));
          }
        })
        .catch((error) => {
          console.error('Failed to restore project IDE state', error);
        })
        .finally(() => {
          window.clearTimeout(restoreFallbackTimer);

          if (!cancelled) {
            setProjectStateReady(true);
          }
        });

      return () => {
        cancelled = true;
        window.clearTimeout(restoreFallbackTimer);
      };
    }, [activeProjectPanel, projectFiles, projectIdeMode, projectId, currentWorkspaceId]);

    useEffect(() => {
      const pendingSelectedFile = pendingProjectSelectedFile.current;

      const resolvedPendingFile =
        pendingSelectedFile && projectFiles[pendingSelectedFile]?.type === 'file'
          ? pendingSelectedFile
          : pendingSelectedFile
            ? Object.keys(projectFiles).find(
                (filePath) => projectFiles[filePath]?.type === 'file' && filePath.endsWith(pendingSelectedFile),
              )
            : undefined;

      if (!projectIdeMode || !pendingSelectedFile || !resolvedPendingFile) {
        return;
      }

      workbenchStore.setSelectedFile(resolvedPendingFile);
      pendingProjectSelectedFile.current = undefined;
    }, [projectFiles, projectIdeMode]);

    useEffect(() => {
      if (!projectIdeMode || !rightPanelOpen) {
        return;
      }

      void workbenchStore.loadRuntimeFiles('.').catch((error) => {
        console.error('Failed to refresh right files panel:', error);
      });
    }, [projectIdeMode, rightPanelOpen]);

    useEffect(() => {
      if (!projectIdeMode || !rightPanelOpen || rightPanelMode !== 'files' || projectFilePaths.length > 0) {
        return undefined;
      }

      let attempts = 0;

      const interval = window.setInterval(() => {
        attempts += 1;

        void workbenchStore.loadRuntimeFiles('.').catch((error) => {
          console.error('Failed to retry right files panel refresh:', error);
        });

        if (attempts >= 20 || Object.values(workbenchStore.files.get()).some((entry) => entry?.type === 'file')) {
          window.clearInterval(interval);
        }
      }, 1500);

      return () => window.clearInterval(interval);
    }, [projectFilePaths.length, projectIdeMode, rightPanelMode, rightPanelOpen]);

    useEffect(() => {
      if (!projectIdeMode || useMobileIde || workspaceLoading || workspaceError) {
        return undefined;
      }

      if (window.localStorage.getItem(PROJECT_IDE_GUIDED_TOUR_STORAGE_KEY) === 'complete') {
        return undefined;
      }

      const timer = window.setTimeout(() => setGuidedTourOpen(true), 4_000);

      return () => window.clearTimeout(timer);
    }, [projectIdeMode, useMobileIde, workspaceError, workspaceLoading]);

    useEffect(() => {
      if (useMobileIde && guidedTourOpen) {
        setGuidedTourOpen(false);
      }
    }, [guidedTourOpen, useMobileIde]);

    useEffect(() => {
      if (!projectIdeMode || !guidedTourOpen) {
        return undefined;
      }

      const selector = PROJECT_IDE_TOUR_STEPS[guidedTourStepIndex]?.selector;
      const target = selector ? document.querySelector<HTMLElement>(selector) : null;

      if (!target) {
        return undefined;
      }

      target.setAttribute('data-vc-tour-active', 'true');
      target.scrollIntoView({ block: 'nearest', inline: 'nearest' });

      return () => {
        target.removeAttribute('data-vc-tour-active');
      };
    }, [guidedTourOpen, guidedTourStepIndex, projectIdeMode]);

    const closeGuidedTour = useCallback(() => {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(PROJECT_IDE_GUIDED_TOUR_STORAGE_KEY, 'complete');
      }

      setGuidedTourOpen(false);
      setGuidedTourStepIndex(0);
    }, []);

    useEffect(() => {
      if (!projectIdeMode) {
        return undefined;
      }

      const syncIconTitles = () => {
        const tooltipTargets = document.querySelectorAll<HTMLElement>(
          [
            '.bolt-responsive-ide button[aria-label]',
            '.bolt-responsive-ide [role="button"][aria-label]',
            '.bolt-responsive-ide [role="separator"][aria-label]',
            '.bolt-responsive-ide input[aria-label]',
            '.bolt-responsive-ide select[aria-label]',
            '.bolt-responsive-ide button[title]',
            '.bolt-responsive-ide [role="button"][title]',
          ].join(','),
        );

        tooltipTargets.forEach((target) => {
          const label = (target.getAttribute('aria-label') || target.getAttribute('title') || '').trim();

          if (!label) {
            return;
          }

          const normalizedLabel = label.replace(/\s+/g, ' ');
          const directHelp = IDE_TOOLTIP_HELP[normalizedLabel];

          const contextualHelp =
            directHelp ||
            (normalizedLabel.startsWith('Pin ') || normalizedLabel.startsWith('Unpin ')
              ? { description: 'Keep this tab visible in the tab strip while you switch context.', shortcut: 'Alt+P' }
              : normalizedLabel.startsWith('Close ')
                ? {
                    description: 'Close this view without deleting files or stopping the workspace.',
                    shortcut: 'Cmd+W',
                  }
                : normalizedLabel.startsWith('Save ')
                  ? {
                      description: 'Save the current file immediately. Autosave still handles normal edits.',
                      shortcut: 'Cmd+S',
                    }
                  : undefined);
          const tooltip = contextualHelp
            ? `${normalizedLabel}. ${contextualHelp.description}${
                contextualHelp.shortcut ? ` Shortcut: ${contextualHelp.shortcut}.` : ''
              }`
            : normalizedLabel;

          const currentTitle = target.getAttribute('title');
          const autoTitle = target.getAttribute('data-vc-auto-title') === 'true';
          const lockedTooltip = target.getAttribute('data-vc-tooltip-locked') === 'true';

          if (!currentTitle || autoTitle) {
            target.setAttribute('title', tooltip);
            target.setAttribute('data-vc-auto-title', 'true');
          }

          if (!lockedTooltip) {
            target.setAttribute('data-vc-tooltip', tooltip);
          }
        });
      };

      syncIconTitles();

      const ideRoot = document.querySelector('.bolt-responsive-ide');
      const observer = new MutationObserver(syncIconTitles);

      if (ideRoot) {
        observer.observe(ideRoot, {
          attributes: true,
          attributeFilter: ['aria-label'],
          childList: true,
          subtree: true,
        });
      }

      return () => observer.disconnect();
    }, [projectIdeMode]);

    useEffect(() => {
      if (!projectIdeMode) {
        return undefined;
      }

      workbenchStore.projectFilesPanelOpen.set(rightPanelOpen);
      window.dispatchEvent(
        new CustomEvent('vibecore:project-files-panel-state', {
          detail: { open: rightPanelOpen },
        }),
      );

      return undefined;
    }, [projectIdeMode, rightPanelOpen]);

    useEffect(() => {
      if (!projectIdeMode || !projectFilesPanelRequest) {
        return;
      }

      setRightPanelOpen((currentOpen) => {
        const nextOpen =
          typeof projectFilesPanelRequest.open === 'boolean' ? projectFilesPanelRequest.open : !currentOpen;

        if (nextOpen) {
          setRightPanelMode('files');
        }

        if (!nextOpen) {
          setProjectPanelSearchParam();
        }

        return nextOpen;
      });
    }, [projectFilesPanelRequest, projectIdeMode, setProjectPanelSearchParam]);

    useEffect(() => {
      if (!projectIdeMode) {
        return undefined;
      }

      const handleToggleFilesPanel = (event: Event) => {
        const requestedOpen = (event as CustomEvent<{ open?: boolean }>).detail?.open;

        setRightPanelOpen((currentOpen) => {
          const nextOpen = typeof requestedOpen === 'boolean' ? requestedOpen : !currentOpen;

          if (nextOpen) {
            setRightPanelMode('files');
          }

          if (!nextOpen) {
            setProjectPanelSearchParam();
          }

          return nextOpen;
        });
      };

      window.addEventListener('vibecore:toggle-project-files-panel', handleToggleFilesPanel);

      return () => window.removeEventListener('vibecore:toggle-project-files-panel', handleToggleFilesPanel);
    }, [projectIdeMode, setProjectPanelSearchParam]);

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
        saveProjectIdeMemory(
          projectId,
          {
            ui: {
              selectedFile,
              currentView,
              rightPanelOpen,
              rightPanelMode,
              rightPanelWidth,
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
              editorMinimapEnabled,
              lockedItems: backendLockedItems,
              deletedPaths: backendDeletedPaths,
              showWorkbench: true,
            },
          },
          currentWorkspaceId,
        ).catch((error) => {
          console.error('Failed to persist project IDE state', error);
        });
      }, 1000);

      return () => window.clearTimeout(saveTimer);
    }, [
      projectIdeMode,
      projectId,
      currentWorkspaceId,
      projectStateReady,
      selectedFile,
      currentView,
      rightPanelOpen,
      rightPanelMode,
      rightPanelWidth,
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
      editorMinimapEnabled,
      backendLockedItems,
      backendDeletedPaths,
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

        if (panel === 'terminal') {
          workbenchStore.currentView.set('code');
          workbenchStore.setShowWorkbench(true);
          workbenchStore.toggleTerminal(true);
        }

        if (options.replaceUrl !== false) {
          setProjectPanelSearchParam(panel);
        }
      },
      [activePaneId, setProjectPanelSearchParam],
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

    useEffect(() => {
      const handleOpenEditorFile = (event: Event) => {
        const filePath = (event as CustomEvent<{ filePath?: string }>).detail?.filePath;

        if (!filePath) {
          return;
        }

        const normalizedPath = filePath.startsWith('/') ? filePath : `${WORK_DIR}/${filePath.replace(/^\.?\//, '')}`;

        const exactPath = projectFiles[filePath]
          ? filePath
          : projectFiles[normalizedPath]
            ? normalizedPath
            : Object.keys(projectFiles).find((path) => path.endsWith(filePath));

        const targetPath = exactPath ?? normalizedPath;

        pendingProjectSelectedFile.current = targetPath;
        openProjectFile(targetPath, { preview: false });

        if (useMobileIde) {
          setMobileIdePanel('editor');
          setProjectPanelSearchParam('editor');
        }
      };

      window.addEventListener('vibecore:open-editor-file', handleOpenEditorFile);

      return () => window.removeEventListener('vibecore:open-editor-file', handleOpenEditorFile);
    }, [openProjectFile, projectFiles, setMobileIdePanel, setProjectPanelSearchParam, useMobileIde]);

    const runProjectEditorCommand = useCallback((command: string) => {
      window.dispatchEvent(new CustomEvent('vibecore:editor-command', { detail: { command } }));
    }, []);

    const openProjectFilesPanel = useCallback(() => {
      setRightPanelMode('files');
      setRightPanelOpen(true);
      workbenchStore.projectFilesPanelOpen.set(true);
      setProjectPanelSearchParam('files');
    }, [setProjectPanelSearchParam]);

    const openIdeTool = useCallback(
      (panel: IdeWorkspacePanel | IdeRightPanel, paneId = activePaneId) => {
        if (isIdeRightPanel(panel)) {
          openProjectFilesPanel();

          return;
        }

        openWorkspacePanel(panel, { paneId });
      },
      [activePaneId, openProjectFilesPanel, openWorkspacePanel],
    );

    const openCommandPalette = useCallback((mode: 'all' | 'tools' | 'files' = 'all') => {
      setCommandPaletteMode(mode);
      setCommandPaletteQuery('');
      setCommandPaletteIndex(0);
      setCommandPaletteOpen(true);
    }, []);

    const activateMobileTool = useCallback(
      (toolId: string) => {
        const normalizedToolId = toolId === 'deployment' ? 'deployments' : toolId;

        if (normalizedToolId === 'commands') {
          openCommandPalette('all');
          closeMobileOverlays();

          return;
        }

        if (normalizedToolId === 'share') {
          closeMobileOverlays();

          const projectLink = `${window.location.origin}${projectUrl ?? `/projects/${projectId}`}`;

          if (!navigator.clipboard?.writeText) {
            toast.error('Clipboard unavailable');

            return;
          }

          void navigator.clipboard
            .writeText(projectLink)
            .then(() => toast.success('Project link copied'))
            .catch((error) => toast.error(`Copy failed: ${(error as Error).message}`));

          return;
        }

        if (
          normalizedToolId === 'agent' ||
          normalizedToolId === 'assistant' ||
          normalizedToolId === 'actions' ||
          normalizedToolId === 'tools'
        ) {
          setMobileIdePanel('chat', { activeTabId: normalizedToolId });
          setProjectPanelSearchParam();
        } else if (normalizedToolId === 'files') {
          setMobileIdePanel('files');
          setProjectPanelSearchParam('files');
        } else if (normalizedToolId === 'search') {
          setMobileIdePanel('search');
          setProjectPanelSearchParam('search');
        } else if (normalizedToolId === 'locks') {
          setMobileIdePanel('locks');
          setProjectPanelSearchParam('locks');
        } else if (normalizedToolId === 'preview') {
          setMobileIdePanel('preview');
          setProjectPanelSearchParam('preview');
        } else if (normalizedToolId === 'console' || normalizedToolId === 'terminal' || normalizedToolId === 'shell') {
          setMobileIdePanel('terminal', { activeTabId: 'terminal' });
          setProjectPanelSearchParam('terminal');
        } else if (normalizedToolId === 'editor') {
          setMobileIdePanel('editor');
          setProjectPanelSearchParam('editor');
        } else {
          const managementPanel = MOBILE_TOOL_TO_MANAGEMENT_PANEL[normalizedToolId] as IdeManagementPanel | undefined;

          if (managementPanel) {
            openWorkspacePanel(managementPanel, { replaceUrl: false });
            setProjectPanelSearchParam(managementPanel);
            setMobileIdePanel('deploy', { activeTabId: managementPanel });
          }
        }

        closeMobileOverlays();
      },
      [
        closeMobileOverlays,
        ensureMobileOpenTab,
        openCommandPalette,
        openWorkspacePanel,
        projectId,
        projectUrl,
        setMobileIdePanel,
        setProjectPanelSearchParam,
      ],
    );

    const closeMobileOpenTab = useCallback(
      (tabId: string) => {
        setMobileOpenTabs((current) => {
          const coreTabs = new Set<string>(ECODE_MOBILE_DEFAULT_TABS);
          const nextTabs = coreTabs.has(tabId) ? current : current.filter((tab) => tab.id !== tabId);

          if (activeMobileOpenTabId === tabId) {
            const fallbackTab = nextTabs[nextTabs.length - 1] ?? ECODE_MOBILE_TAB_META.agent;
            window.setTimeout(() => activateMobileTool(fallbackTab.id), 0);
          }

          return nextTabs;
        });
      },
      [activateMobileTool, activeMobileOpenTabId],
    );

    useEffect(() => {
      if (!projectIdeMode) {
        return undefined;
      }

      const handleOpenProjectIdePanel = (event: Event) => {
        const panel = (event as CustomEvent<{ panel?: string }>).detail?.panel;

        if (!panel) {
          return;
        }

        if (useMobileIde) {
          activateMobileTool(panel);

          return;
        }

        if (isIdeRightPanel(panel) || isIdeWorkspacePanel(panel)) {
          openIdeTool(panel);
        }
      };

      window.addEventListener('vibecore:open-project-ide-panel', handleOpenProjectIdePanel);

      return () => {
        window.removeEventListener('vibecore:open-project-ide-panel', handleOpenProjectIdePanel);
      };
    }, [activateMobileTool, openIdeTool, projectIdeMode, useMobileIde]);

    const closeWorkspacePanel = useCallback(
      (panel: IdeWorkspacePanel, paneId = activePaneId, tabId?: string) => {
        setWorkspaceTabs((currentTabs) => {
          const nextTabs = currentTabs.filter((tab) => tab !== panel);
          const safeTabs: IdeWorkspacePanel[] = nextTabs.length ? nextTabs : ['editor'];

          if (activeWorkspacePanel === panel) {
            const nextActive = safeTabs[safeTabs.length - 1] ?? 'editor';
            setActiveWorkspacePanel(nextActive);
            setProjectPanelSearchParam(nextActive);
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
      [activeWorkspacePanel, setProjectPanelSearchParam],
    );

    useEffect(() => {
      if (!projectIdeMode || (!projectStateReady && !activeProjectPanel)) {
        return;
      }

      if (isIdeRightPanel(activeProjectPanel)) {
        setRightPanelMode('files');
        setRightPanelOpen(true);

        if (useMobileIde && activeProjectPanel === 'files') {
          setMobileIdePanel('files');
        }

        return;
      }

      if (isIdeWorkspacePanel(activeProjectPanel)) {
        if (useMobileIde) {
          if (activeProjectPanel === 'terminal') {
            setMobileIdePanel('terminal');
          } else if (activeProjectPanel === 'preview') {
            setMobileIdePanel('preview');
          } else if (activeProjectPanel === 'files') {
            setMobileIdePanel('files');
          } else if (activeProjectPanel === 'search') {
            setMobileIdePanel('search');
          } else if (activeProjectPanel === 'editor') {
            setMobileIdePanel('editor');
          } else if (activeProjectPanel === 'locks') {
            setMobileIdePanel('locks');
          } else if (isIdeManagementPanel(activeProjectPanel)) {
            setMobileIdePanel('deploy', {
              activeTabId: ECODE_MOBILE_MANAGEMENT_PANEL_TABS[activeProjectPanel] ?? activeProjectPanel,
            });
          }

          return;
        }

        openWorkspacePanel(activeProjectPanel, { replaceUrl: false });
      }
    }, [activeProjectPanel, openWorkspacePanel, projectIdeMode, projectStateReady, setMobileIdePanel, useMobileIde]);

    /*
     * Audit v3 (M): surface save failures. Previously the result was
     * `.catch(() => undefined)`, so a failed write — including the
     * "Remote file changed since it was loaded" conflict guard and any
     * runtime write error — left the user believing the file was saved when
     * it was not (silent data loss).
     */
    const handleSaveError = useCallback((error: unknown) => {
      toast.error(`Failed to save file: ${error instanceof Error ? error.message : 'unknown error'}`);
    }, []);

    /*
     * Route saves through the conflict-aware path: a "changed on disk" race
     * opens the resolution dialog (reload / keep mine / diff) instead of the
     * dead-end toast that left the edit stranded (BUG-IDE-004). Every other
     * failure still reaches handleSaveError.
     */
    const onProjectEditorSave = useCallback(() => {
      const filePath = workbenchStore.currentDocument.get()?.filePath;

      if (!filePath) {
        return;
      }

      workbenchStore.saveFileWithConflictPrompt(filePath).catch(handleSaveError);
    }, [handleSaveError]);

    /*
     * Audit v3 (M): save a specific tab's file. The per-tab dirty-dot save
     * button used the generic `onProjectEditorSave`, which always saves the
     * *currently active* document — so clicking the dot on an inactive dirty
     * tab saved the wrong file. Target the tab's own path instead.
     */
    const saveProjectEditorFile = useCallback(
      (filePath: string) => {
        workbenchStore.saveFileWithConflictPrompt(filePath).catch(handleSaveError);
      },
      [handleSaveError],
    );

    const startTerminalResize = useCallback(
      (event: React.MouseEvent<HTMLDivElement>) => {
        event.preventDefault();

        const startY = event.clientY;
        const startHeight = terminalBottomHeight;

        /*
         * Drive the live drag straight through the DOM CSS vars instead of React
         * state: setTerminalBottomHeight on every mousemove frame re-rendered the
         * entire (very large) BaseChat and wrote localStorage per frame. Capture
         * the two elements that carry the height vars, mutate them during the
         * drag, and commit to state only once on mouseup.
         */
        const terminalShell = (event.currentTarget as HTMLElement).closest(
          '.bolt-project-bottom-terminal-shell',
        ) as HTMLElement | null;

        const mainPanes = terminalShell?.parentElement?.querySelector('.bolt-project-main-panes') as HTMLElement | null;

        let nextHeight = startHeight;

        const onMove = (moveEvent: MouseEvent) => {
          nextHeight = Math.min(720, Math.max(320, startHeight + startY - moveEvent.clientY));
          terminalShell?.style.setProperty('--project-terminal-height', `${nextHeight}px`);
          mainPanes?.style.setProperty('--project-terminal-bottom-height', `${nextHeight}px`);
        };

        const onUp = () => {
          window.removeEventListener('mousemove', onMove);
          window.removeEventListener('mouseup', onUp);
          setTerminalBottomHeight(nextHeight);
        };

        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
      },
      [terminalBottomHeight],
    );

    useEffect(() => {
      if (typeof window === 'undefined') {
        return;
      }

      window.localStorage.setItem(
        PROJECT_BOTTOM_TERMINAL_UI_STORAGE_KEY,
        JSON.stringify({ height: terminalBottomHeight, open: terminalBottomOpen }),
      );
    }, [terminalBottomHeight, terminalBottomOpen]);

    const openBottomTerminal = useCallback(
      (view: ProjectBottomTerminalView = 'terminal') => {
        setBottomTerminalView(view);

        if (useMobileIde) {
          setMobileIdePanel('terminal');

          return;
        }

        setTerminalBottomOpen(true);
      },
      [useMobileIde],
    );

    const reopenLastClosedTab = useCallback(() => {
      const [tab, ...rest] = closedTabs;

      if (!tab) {
        return;
      }

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
    }, [activePaneId, closedTabs]);

    const closeActivePaneTab = useCallback(() => {
      const leaf = findLeaf(paneTree, activePaneId) ?? findFirstLeaf(paneTree);
      const tab = leaf?.tabs.find((item) => item.id === leaf.activeTabId);

      if (leaf && tab) {
        setClosedTabs((items) => [tab, ...items.filter((item) => item.id !== tab.id)].slice(0, 20));
        closeWorkspacePanel(tab.panel, leaf.id, tab.id);
      }
    }, [activePaneId, closeWorkspacePanel, paneTree]);

    const focusAgentPanel = useCallback(() => {
      setProjectAgentPanelOpen(true);
      setAgentWidth((width) => Math.min(640, Math.max(420, width)));
      window.setTimeout(() => textareaRef?.current?.focus(), 0);
    }, [textareaRef]);

    const loadProjectKeybindingOverrides = useCallback(async () => {
      if (!projectIdeMode || !projectId) {
        setProjectKeybindingOverrides({});
        return;
      }

      try {
        const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/ide-panel/settings`, {
          headers: { accept: 'application/json' },
        });

        const payload = (await response.json().catch(() => ({}))) as any;
        const settingsState = payload?.data?.settingsState;
        const overrides = settingsState?.keybindings?.overrides;

        setProjectKeybindingOverrides(
          overrides && typeof overrides === 'object' && !Array.isArray(overrides) ? overrides : {},
        );

        if (isProjectThemePreference(settingsState?.preferences?.theme)) {
          applyProjectThemePreference(settingsState.preferences.theme);
        }
      } catch {
        setProjectKeybindingOverrides({});
      }
    }, [projectId, projectIdeMode]);

    useEffect(() => {
      void loadProjectKeybindingOverrides();
    }, [loadProjectKeybindingOverrides]);

    useEffect(() => {
      function handleKeybindingSettingsSaved(event: Event) {
        const detail = (event as CustomEvent).detail ?? {};

        if (detail.panel === 'settings' && detail.intent === 'keybindings' && detail.ok) {
          void loadProjectKeybindingOverrides();
        }
      }

      window.addEventListener('vibecore:ide-panel-action', handleKeybindingSettingsSaved);

      return () => window.removeEventListener('vibecore:ide-panel-action', handleKeybindingSettingsSaved);
    }, [loadProjectKeybindingOverrides]);

    const runProjectKeybindingAction = useCallback(
      (action: string, _binding: Keybinding, event: KeyboardEvent) => {
        if (action === 'overlay.close') {
          if (keyboardShortcutsOpen) {
            setKeyboardShortcutsOpen(false);
          } else if (commandPaletteOpen) {
            setCommandPaletteOpen(false);
          }

          return;
        }

        if (action === 'file.save') {
          onProjectEditorSave();
        } else if (action === 'file.saveAll') {
          void workbenchStore.saveAllFiles();
        } else if (action === 'file.quickOpen') {
          openCommandPalette('files');
        } else if (action === 'command.palette') {
          openCommandPalette('all');
        } else if (action === 'workbench.tools') {
          openCommandPalette('tools');
        } else if (action === 'tab.close') {
          closeActivePaneTab();
        } else if (action === 'tab.reopenClosed') {
          reopenLastClosedTab();
        } else if (action === 'sidebar.toggle') {
          setRightPanelOpen((open) => !open);
        } else if (action === 'terminal.toggle') {
          setTerminalBottomOpen((value) => !value);
        } else if (action === 'terminal.focus') {
          openBottomTerminal('terminal');
        } else if (action === 'workspace.run') {
          openWorkspacePanel('preview');
          void workbenchStore.startPreviewServer();
        } else if (action === 'agent.focus') {
          focusAgentPanel();
        } else if (action === 'settings.open') {
          openWorkspacePanel('settings');
        } else if (action === 'editor.toggleComment') {
          runProjectEditorCommand('toggleComment');
        } else if (action === 'editor.rename') {
          runProjectEditorCommand('renameSymbol');
        } else if (action === 'editor.goToDefinition') {
          runProjectEditorCommand('goToDefinition');
        } else if (action === 'editor.findReferences') {
          runProjectEditorCommand('findReferences');
        } else if (action === 'editor.quickFix') {
          runProjectEditorCommand('quickFix');
        } else if (action === 'help.keyboard') {
          setKeyboardShortcutsOpen(true);
        } else if (/^tab\\.focus\\.[1-9]$/.test(action)) {
          const index = Number(action.at(-1)) - 1;
          const leaf = findLeaf(paneTree, activePaneId) ?? findFirstLeaf(paneTree);
          const tab = leaf?.tabs[index];

          if (leaf && tab) {
            setPaneTree((currentTree) =>
              updateLeaf(currentTree, leaf.id, (currentLeaf) => ({ ...currentLeaf, activeTabId: tab.id })),
            );
            setActivePaneId(leaf.id);
            setActiveWorkspacePanel(tab.panel);
            setRecentTabIds((ids) => [tab.id, ...ids.filter((id) => id !== tab.id)].slice(0, 20));
          }
        } else if (action === 'tab.next') {
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

        window.dispatchEvent(
          new CustomEvent('vibecore:keybinding-run', {
            detail: {
              action,
              combo: event.key,
              activePanel: activeWorkspacePanel,
            },
          }),
        );
      },
      [
        activePaneId,
        activeWorkspacePanel,
        closeActivePaneTab,
        commandPaletteOpen,
        focusAgentPanel,
        keyboardShortcutsOpen,
        onProjectEditorSave,
        openBottomTerminal,
        openCommandPalette,
        openWorkspacePanel,
        paneTree,
        recentTabIds,
        reopenLastClosedTab,
        runProjectEditorCommand,
      ],
    );

    const projectKeybindings = useMemo(
      () =>
        applyKeybindingOverrides(
          [
            ...PROJECT_KEYBINDINGS,
            ...Array.from({ length: 9 }, (_, index) => ({
              combo: `cmd+${index + 1}`,
              action: `tab.focus.${index + 1}`,
              label: `Focus tab ${index + 1}`,
              description: `Focus workspace tab ${index + 1}.`,
              category: 'Workbench' as const,
              preventDefault: true,
            })),
            {
              combo: 'cmd+tab',
              action: 'tab.next',
              label: 'Next tab',
              description: 'Cycle to the next open workspace tab.',
              category: 'Workbench' as const,
              preventDefault: true,
            },
          ],
          projectKeybindingOverrides,
        ),
      [projectKeybindingOverrides],
    );

    useKeybindings({
      enabled: projectIdeMode && !useMobileIde,
      bindings: projectKeybindings,
      getContext: useCallback(
        () => ({
          activePanel: activeWorkspacePanel,
          commandPaletteOpen,
          focusTarget:
            activeWorkspacePanel === 'terminal' ? 'terminal' : activeWorkspacePanel === 'editor' ? 'editor' : 'none',
          useMobileIde,
        }),
        [activeWorkspacePanel, commandPaletteOpen, useMobileIde],
      ),
      runAction: runProjectKeybindingAction,
    });

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
      if (!projectIdeMode || !useMobileIde || activeProjectPanel) {
        return;
      }

      setMobilePanel('chat');
      setActiveMobileOpenTabId('agent');
      persistMobilePanel('chat');
      ensureMobileOpenTab('agent');
    }, [activeProjectPanel, ensureMobileOpenTab, persistMobilePanel, projectIdeMode, useMobileIde]);

    /*
     * Escape stops the active stream (covers long-running shell actions too —
     * they ride the same abort). Ignored while a dialog/menu/popover is open so
     * Esc keeps its close-the-overlay meaning there.
     */
    useEffect(() => {
      if (!isStreaming || !handleStop) {
        return undefined;
      }

      const onKeyDown = (event: KeyboardEvent) => {
        if (event.key !== 'Escape' || event.defaultPrevented) {
          return;
        }

        const overlayOpen = document.querySelector(
          '[role="dialog"], [role="alertdialog"], [role="menu"], [data-radix-popper-content-wrapper]',
        );

        if (overlayOpen) {
          return;
        }

        event.preventDefault();
        handleStop();
      };

      document.addEventListener('keydown', onKeyDown);

      return () => document.removeEventListener('keydown', onKeyDown);
    }, [isStreaming, handleStop]);

    const networkToastRef = useRef<{ offline?: string | number; first: boolean }>({ first: true });

    useEffect(() => {
      const updateOnlineState = (transition: 'online' | 'offline' | 'init') => {
        const online = navigator.onLine;
        setIsOnline(online);

        if (transition === 'init' || !projectIdeMode) {
          return;
        }

        if (transition === 'offline') {
          if (networkToastRef.current.offline === undefined) {
            networkToastRef.current.offline = toast.warn('Connection lost. Reconnecting…', {
              autoClose: false,
              closeOnClick: false,
              icon: false,
            });
          }
        } else if (transition === 'online') {
          if (networkToastRef.current.offline !== undefined) {
            toast.dismiss(networkToastRef.current.offline);
            networkToastRef.current.offline = undefined;
          }

          if (!networkToastRef.current.first) {
            toast.success('Reconnected', { autoClose: 2500, icon: false });
          }
        }

        networkToastRef.current.first = false;
      };

      updateOnlineState('init');

      const onOffline = () => updateOnlineState('offline');
      const onOnline = () => updateOnlineState('online');

      window.addEventListener('online', onOnline);
      window.addEventListener('offline', onOffline);

      return () => {
        window.removeEventListener('online', onOnline);
        window.removeEventListener('offline', onOffline);

        if (networkToastRef.current.offline !== undefined) {
          toast.dismiss(networkToastRef.current.offline);
          networkToastRef.current.offline = undefined;
        }
      };
    }, [projectIdeMode]);

    useEffect(() => {
      if (!useMobileIde) {
        return undefined;
      }

      const onKeyDown = (event: KeyboardEvent) => {
        const index = Number(event.key) - 1;

        if ((event.metaKey || event.ctrlKey) && index >= 0 && index < MOBILE_IDE_PANELS.length) {
          event.preventDefault();
          setMobileIdePanel(MOBILE_IDE_PANELS[index]);
        }
      };

      window.addEventListener('keydown', onKeyDown);

      return () => window.removeEventListener('keydown', onKeyDown);
    }, [setMobileIdePanel, useMobileIde]);

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

          if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
            /*
             * Mic permission is blocked at the browser level — explain it once
             * per session (sessionStorage guard), not on every click.
             */
            let alreadyExplained = false;

            try {
              alreadyExplained = sessionStorage.getItem('vc:mic-permission-toast') === '1';

              if (!alreadyExplained) {
                sessionStorage.setItem('vc:mic-permission-toast', '1');
              }
            } catch {
              // sessionStorage unavailable (privacy mode): fall back to toastId dedupe.
            }

            if (!alreadyExplained) {
              toast.error(
                'Microphone access is blocked. Allow the microphone permission for this site in your browser settings to use speech-to-text.',
                { toastId: 'mic-permission-blocked' },
              );
            }
          }
        };

        setRecognition(recognition);

        return () => {
          /*
           * Tear down the recognizer on unmount so it stops capturing the mic
           * and releases the underlying SpeechRecognition resource.
           */
          recognition.onresult = null;
          recognition.onerror = null;

          try {
            recognition.abort();
          } catch {
            // abort() throws if recognition was never started; ignore.
          }
        };
      }

      return undefined;
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
          .then((response) => {
            if (!response.ok) {
              throw new Error(`Failed to fetch model list: ${response.status}`);
            }

            return response.json();
          })
          .then((data) => {
            setModelList(modelListFromResponse(data));
            setModelError(null);
          })
          .catch((error) => {
            console.warn('Error fetching model list:', error);

            /*
             * Surface the failure so the model picker shows an error instead of a
             * permanently empty list with no explanation.
             */
            setModelError("Couldn't load the model list. Check your connection and reopen the picker.");
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

        if (!response.ok) {
          throw new Error(`Failed to fetch models for ${providerName}: ${response.status}`);
        }

        const data = await response.json();
        providerModels = modelListFromResponse(data);
      } catch (error) {
        console.warn('Error loading dynamic models for:', providerName, error);
      }

      // Only update models for the specific provider
      setModelList((prevModels) => {
        const otherModels = prevModels.filter((model) => model.provider !== providerName);
        return [...otherModels, ...providerModels];
      });
      setIsModelLoading(undefined);
    };

    const startListening = () => {
      if (!recognition) {
        // The mic button hides itself when the API is absent, but never let a click be inert.
        toast.error('Speech recognition is not available in this browser.', { toastId: 'speech-unavailable' });
        return;
      }

      try {
        recognition.start();
      } catch (error) {
        /*
         * start() throws InvalidStateError when recognition is already
         * running — swallow it and let the state below resync the UI so the
         * click still has a visible effect.
         */
        console.error('Speech recognition start failed:', error);
      }

      setIsListening(true);
    };

    const stopListening = () => {
      if (recognition) {
        recognition.stop();
      }

      // Always resync the UI, even if the recognizer is gone.
      setIsListening(false);
    };

    const handleSendMessage = (event: React.UIEvent, messageInput?: string) => {
      if (sendMessage) {
        sendMessage(event, messageInput);
        setSelectedElement?.(null);

        // An actual send consumes the composer draft — drop pending debounced writes too.
        composerDraftWriter.cancel();
        clearComposerDraft(projectId);

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

    /**
     * Downscales images above the max edge and re-encodes opaque ones to JPEG
     * (alpha PNGs stay PNG; already-small files pass through untouched). Any
     * processing failure falls back to the original file — it already passed
     * the size gate in decideImageAttachment.
     */
    const optimizeImageFile = async (file: File): Promise<File> => {
      let hasAlpha = false;

      if (file.type === 'image/png') {
        const header = new Uint8Array(await file.slice(0, PNG_HEADER_SCAN_BYTES).arrayBuffer());
        hasAlpha = pngHasAlpha(header);
      }

      const objectUrl = URL.createObjectURL(file);

      try {
        const image = await new Promise<HTMLImageElement>((resolve, reject) => {
          const element = new Image();
          element.onload = () => resolve(element);
          element.onerror = () => reject(new Error(`Failed to decode image: ${file.name}`));
          element.src = objectUrl;
        });

        const plan = planImageReencode({
          width: image.naturalWidth,
          height: image.naturalHeight,
          sizeBytes: file.size,
          hasAlpha,
        });

        if (!plan.reencode) {
          return file;
        }

        const canvas = renderImageToCanvas(image, plan, (width, height) => {
          const element = document.createElement('canvas');
          element.width = width;
          element.height = height;

          return element;
        });

        if (!canvas) {
          return file;
        }

        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, plan.outputType, plan.quality));

        if (!blob) {
          return file;
        }

        const extension = plan.outputType === 'image/png' ? 'png' : 'jpg';
        const baseName = file.name.replace(/\.[^.]+$/, '') || 'image';

        return new File([blob], `${baseName}.${extension}`, { type: plan.outputType });
      } catch (error) {
        console.warn('Image optimization failed; attaching the original file.', error);

        return file;
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    };

    /**
     * Shared upload/paste entry point: enforces the size limit and the
     * per-message image cap (with a toast naming the limit), then optimizes
     * and attaches the file.
     */
    const attachImageFile = (file: File, source: 'selected' | 'pasted') => {
      const decision = decideImageAttachment({
        fileSizeBytes: file.size,
        currentAttachmentCount: uploadedFiles.length,
      });

      if (decision.action === 'reject') {
        toast.error(decision.message);

        return;
      }

      void optimizeImageFile(file).then((processedFile) => {
        const reader = new FileReader();

        reader.onload = (event) => {
          const base64Image = event.target?.result as string;
          setUploadedFiles?.([...uploadedFiles, processedFile]);
          setImageDataList?.([...imageDataList, base64Image]);
        };

        reader.onerror = () => {
          console.error(`Failed to read ${source} file:`, processedFile.name, reader.error);
          toast.error(`Failed to read the ${source} image. Please try again.`);
        };
        reader.readAsDataURL(processedFile);
      });
    };

    const handleFileUpload = () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';

      input.onchange = (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];

        if (file) {
          attachImageFile(file, 'selected');
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
            attachImageFile(file, 'pasted');
          }

          break;
        }
      }
    };

    const handleProjectAgentSendMessage = useCallback(
      (event: React.UIEvent, messageInput?: string) => {
        const rawMessage = messageInput ?? input;

        if (projectIdeMode) {
          const action = inferAgentToolAction(rawMessage);

          if (action) {
            setAgentToolAction(action);
          }

          const mentionedFiles = resolveMentionedProjectFiles(rawMessage, projectFilePaths);
          const mentionedSymbols = resolveMentionedProjectSymbols(rawMessage, projectFiles);

          const agentMessage = buildProjectAgentPrompt({
            message: rawMessage,
            mode: projectAgentExecutionMode,
            planFirst: projectPlanFirst,
            mentionedFiles,
            mentionedSymbols,
          });

          handleSendMessage?.(event, agentMessage);

          return;
        }

        handleSendMessage?.(event, messageInput);
      },
      [
        handleSendMessage,
        input,
        projectAgentExecutionMode,
        projectFilePaths,
        projectFiles,
        projectIdeMode,
        projectPlanFirst,
      ],
    );

    const viewProjectCheckpoint = useCallback(
      async (checkpoint: ProjectConversationCheckpoint) => {
        setConversationHistoryOpen(false);

        if (projectId && checkpoint.conversationId !== `project:${projectId}`) {
          const currentMemory = await getProjectIdeMemory(projectId, currentWorkspaceId).catch(() => undefined);
          await saveProjectIdeMemory(
            projectId,
            {
              chat: {
                id: `project:${projectId}`,
                description: checkpoint.conversationTitle,
                metadata: checkpoint.backendConversationId
                  ? {
                      ...(currentMemory?.chat?.metadata ?? {}),
                      aiConversationId: checkpoint.backendConversationId,
                    }
                  : currentMemory?.chat?.metadata,
                messages: checkpoint.messages,
                archivedMessages: [],

                /*
                 * Replace (not union-merge) the transcript. Without clearMessages
                 * the older/shorter checkpoint list gets unioned with the live
                 * messages keyed by id, so every newer message resurfaces and the
                 * restore does nothing. archivedMessages: [] is likewise ignored
                 * unless cleared.
                 */
                clearMessages: true,
              },
            },
            currentWorkspaceId,
          ).catch((error) => console.error('Failed to load archived project conversation', error));
          window.location.hash = checkpoint.messageId ? `chat-message-${checkpoint.messageId}` : '';
          window.location.reload();

          return;
        }

        const focusCheckpointMessage = () => {
          const targetId = checkpoint.messageId ?? checkpoint.messages.at(-1)?.id;

          let element: HTMLElement | null = null;

          if (targetId) {
            element = document.getElementById(`chat-message-${targetId}`);
          }

          if (!element) {
            const rows = document.querySelectorAll<HTMLElement>('[data-testid="ide-agent-panel"] [data-message-id]');
            element = rows[rows.length - 1] ?? null;
          }

          if (!element) {
            return false;
          }

          element.scrollIntoView({ block: 'center', behavior: 'smooth' });
          element.classList.add('bolt-project-chat-jump-highlight');
          window.setTimeout(() => element?.classList.remove('bolt-project-chat-jump-highlight'), 1600);

          return true;
        };

        let attempts = 0;

        const tryFocus = () => {
          if (focusCheckpointMessage() || attempts >= 12) {
            return;
          }

          attempts += 1;
          window.setTimeout(tryFocus, 60);
        };

        window.requestAnimationFrame(tryFocus);
      },
      [projectId, currentWorkspaceId],
    );

    const openCheckpointChanges = useCallback(
      (checkpoint: ProjectConversationCheckpoint) => {
        setConversationHistoryOpen(false);
        openWorkspacePanel('git');
        setSearchParams({
          panel: 'git',
          commit: checkpoint.commitSha ?? checkpoint.snapshot?.id ?? checkpoint.id,
        });
      },
      [openWorkspacePanel, setSearchParams],
    );

    const confirmProjectRollback = useCallback(async () => {
      if (!projectId || !rollbackTarget) {
        return;
      }

      setRollbackBusy(true);

      try {
        if (rollbackTarget.snapshot?.id) {
          const form = new FormData();
          form.set('intent', 'restore');
          form.set('snapshotId', rollbackTarget.snapshot.id);
          form.set('restoreDatabase', rollbackDatabase ? 'true' : 'false');

          const response = await fetch(`/api/projects/${projectId}/ide-panel/snapshots`, {
            method: 'POST',
            body: form,
            credentials: 'include',
          });

          /*
           * A failed restore (409 storage missing/checksum, 403 RBAC, 5xx) must NOT
           * fall through to overwrite chat memory + reload, which would destroy the
           * live transcript while leaving files un-restored. Surface the coded error
           * and bail before mutating anything.
           */
          if (!response.ok) {
            const payload = await response.json().catch(() => undefined);
            toast.error(describeSnapshotRestoreFailure(response.status, payload));

            return;
          }
        }

        await saveProjectIdeMemory(
          projectId,
          {
            chat: {
              id: `project:${projectId}`,
              description: rollbackTarget.title,
              messages: rollbackTarget.messages,
              archivedMessages: [],

              /*
               * Replace (not union-merge) the transcript so the rollback target's
               * shorter list overwrites the live messages instead of unioning with
               * them by id, which would resurface every newer message and make the
               * rollback a no-op.
               */
              clearMessages: true,
            },
          },
          currentWorkspaceId,
        );

        window.location.reload();
      } catch (error) {
        console.error('Failed to rollback project checkpoint', error);
        toast.error(describeSnapshotRestoreFailure(0, undefined));
      } finally {
        setRollbackBusy(false);
      }
    }, [projectId, currentWorkspaceId, rollbackDatabase, rollbackTarget]);

    const headerPresence = useMemo(
      () => dedupeCollaborationPresence(headerCollaboration.snapshot?.presence ?? []),
      [headerCollaboration.snapshot?.presence],
    );

    const headerPresenceTooltip = collaborationPresenceTooltip(headerPresence);

    const copyProjectConversation = useCallback(async () => {
      const currentMessages = messages ?? [];

      if (!currentMessages.length) {
        toast.info('No conversation to copy');
        return;
      }

      if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
        toast.error('Clipboard is unavailable');
        return;
      }

      try {
        await navigator.clipboard.writeText(conversationTranscript(currentMessages, description));
        toast.success('Conversation copied');
      } catch (error) {
        toast.error(`Copy failed: ${(error as Error).message}`);
      }
    }, [description, messages]);

    const clearProjectConversation = useCallback(() => {
      const currentMessages = messages ?? [];

      if (!currentMessages.length) {
        toast.info('No history to clear');
        return;
      }

      setConfirmClearHistoryOpen(true);
    }, [messages]);

    const confirmClearProjectConversation = useCallback(() => {
      setConfirmClearHistoryOpen(false);
      resetChat?.();
      toast.success('History cleared');
    }, [resetChat]);

    const exportProjectConversation = useCallback(() => {
      const currentMessages = messages ?? [];

      if (!currentMessages.length) {
        toast.info('No conversation to export');
        return;
      }

      const title = description?.trim() || 'Project conversation';
      const exportDate = new Date().toISOString();

      const payload = {
        title,
        projectId,
        exportDate,
        messages: currentMessages,
        transcript: conversationTranscript(currentMessages, title),
      };

      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      const suffix = safeDownloadName(title) || projectId || 'conversation';

      anchor.href = url;
      anchor.download = `conversation-${suffix}-${exportDate.replace(/[:.]/g, '-')}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
      toast.success('Conversation exported');
    }, [description, messages, projectId]);

    const startMobileAgentChat = useCallback(() => {
      closeMobileOverlays();
      clearProjectConversation();
      window.setTimeout(() => textareaRef?.current?.focus(), 0);
    }, [clearProjectConversation, closeMobileOverlays, textareaRef]);

    const openMobileAgentHistory = useCallback(() => {
      closeMobileOverlays();
      setConversationHistoryOpen(true);
    }, [closeMobileOverlays]);

    const openMobileAgentUsage = useCallback(() => {
      activateMobileTool('monitoring');
    }, [activateMobileTool]);

    const openMobileAgentSettings = useCallback(() => {
      activateMobileTool('settings');
    }, [activateMobileTool]);

    const copyMobileAgentConversation = useCallback(() => {
      closeMobileOverlays();
      void copyProjectConversation();
    }, [closeMobileOverlays, copyProjectConversation]);

    const exportMobileAgentConversation = useCallback(() => {
      closeMobileOverlays();
      exportProjectConversation();
    }, [closeMobileOverlays, exportProjectConversation]);

    const toggleMobileAgentTheme = useCallback(() => {
      closeMobileOverlays();
      toggleTheme();
    }, [closeMobileOverlays]);

    const openMobileAgentFeedback = useCallback(() => {
      closeMobileOverlays();
      window.location.assign('/support');
    }, [closeMobileOverlays]);

    const closeMobileAgentView = useCallback(() => {
      activateMobileTool('editor');
    }, [activateMobileTool]);

    const shouldRenderAgentPatchReviewQueue =
      projectIdeMode && !projectAutoApply && pendingAgentPatchProposals.length > 0;

    const shouldRenderAgentComposer = !projectIdeMode || !useMobileIde || mobilePanel === 'chat';

    const agentPanel = (
      <div
        data-testid="ide-agent-panel"
        dir={textDirection}
        aria-live={projectIdeMode ? 'polite' : undefined}
        className={classNames(styles.Chat, 'flex h-full min-h-0 flex-col flex-grow', {
          'lg:min-w-[var(--chat-min-width)]': !projectIdeMode,
          'min-w-0 overflow-hidden bolt-project-agent-panel': projectIdeMode,
          hidden: useMobileIde && mobilePanel !== 'chat',
        })}
      >
        <ConfirmationDialog
          isOpen={confirmClearHistoryOpen}
          onClose={() => setConfirmClearHistoryOpen(false)}
          onConfirm={confirmClearProjectConversation}
          title="Clear conversation history?"
          description="The history of this conversation is cleared. This cannot be undone."
          confirmLabel="Clear history"
          variant="destructive"
        />
        {useMobileIde && conversationHistoryOpen && (
          <div className="bolt-project-conversation-history" role="dialog" aria-label="Project agent history">
            <div className="bolt-project-conversation-history-head">
              <div>
                <strong>Agent history</strong>
                <span>
                  {filteredProjectConversationCheckpoints.length} of {projectConversationCheckpoints.length} checkpoints
                </span>
              </div>
              <button
                type="button"
                className="bolt-project-ide-icon-button"
                aria-label="Close history"
                onClick={() => setConversationHistoryOpen(false)}
              >
                <span className="i-ph:x" aria-hidden />
              </button>
            </div>
            <label className="bolt-project-conversation-history-search">
              <span className="i-ph:magnifying-glass" aria-hidden />
              <input
                type="search"
                value={conversationHistoryQuery}
                placeholder="Search checkpoints, commits, prompts, or agent replies"
                aria-label="Search agent checkpoints"
                onChange={(event) => setConversationHistoryQuery(event.currentTarget.value)}
              />
              {conversationHistoryQuery && (
                <button type="button" aria-label="Clear history search" onClick={() => setConversationHistoryQuery('')}>
                  <span className="i-ph:x" aria-hidden />
                </button>
              )}
            </label>
            <div className="bolt-project-conversation-history-list">
              {filteredProjectConversationCheckpoints.map((checkpoint) => {
                const rollbackAvailable = checkpoint.snapshot || checkpoint.messages.length;

                return (
                  <article key={checkpoint.id} className="bolt-project-history-checkpoint">
                    <div className="bolt-project-history-checkpoint-main">
                      <strong>{checkpoint.title}</strong>
                      <span>{checkpoint.description}</span>
                      <small>
                        {checkpoint.ageLabel}
                        {checkpoint.commitSha ? ` - ${checkpoint.commitSha}` : ''}
                      </small>
                    </div>
                    <div className="bolt-project-history-checkpoint-actions">
                      <button
                        type="button"
                        aria-label={`View chat at checkpoint ${checkpoint.title}`}
                        onClick={() => viewProjectCheckpoint(checkpoint)}
                      >
                        View Chat
                      </button>
                      <button
                        type="button"
                        disabled={!rollbackAvailable}
                        aria-label={`Rollback to checkpoint ${checkpoint.title}`}
                        onClick={() => {
                          setRollbackDatabase(false);
                          setRollbackTarget(checkpoint);
                        }}
                      >
                        Rollback here
                      </button>
                      <button
                        type="button"
                        aria-label={`Review diff for checkpoint ${checkpoint.title}`}
                        onClick={() => openCheckpointChanges(checkpoint)}
                      >
                        Review diff
                      </button>
                    </div>
                  </article>
                );
              })}
              {!projectConversationCheckpoints.length && (
                <div className="bolt-project-history-empty">No project agent history yet.</div>
              )}
              {projectConversationCheckpoints.length > 0 && !filteredProjectConversationCheckpoints.length && (
                <div className="bolt-project-history-empty">No checkpoints match this search.</div>
              )}
            </div>
          </div>
        )}
        {shouldShowMobileAgentStartState ? (
          <MobileAgentStartState
            fileCount={mobileAgentFileCount}
            selectedFileLabel={mobileAgentSelectedFileLabel}
            isRunning={isAgentRunning}
            suggestions={projectAgentSuggestions.slice(0, 3)}
            onSuggestion={(prompt) => handleProjectAgentSendMessage({} as React.UIEvent, prompt)}
          />
        ) : !chatStarted ? (
          <div id="intro" className="mt-[16vh] max-w-2xl mx-auto text-center px-4 lg:px-0">
            <h1 className="text-3xl lg:text-6xl font-bold text-bolt-elements-textPrimary mb-4 animate-fade-in">
              Turn ideas into working software
            </h1>
            <p className="text-md lg:text-xl mb-8 text-bolt-elements-textSecondary animate-fade-in animation-delay-200">
              Describe what you want to build, or ask E-Code to improve an existing project.
            </p>
          </div>
        ) : null}
        <StickToBottom
          className={classNames('pt-6 px-2 sm:px-6 relative', {
            'h-full flex flex-col modern-scrollbar': chatStarted,
            'bolt-project-agent-scroll': projectIdeMode,
          })}
          resize="smooth"
          initial="smooth"
        >
          <StickToBottom.Content
            className={classNames('flex flex-col gap-4 relative', {
              'bolt-project-agent-transcript': projectIdeMode,
            })}
            role={projectIdeMode ? 'log' : undefined}
            aria-live={projectIdeMode ? 'polite' : undefined}
            aria-relevant={projectIdeMode ? 'additions text' : undefined}
            aria-label={projectIdeMode ? 'Agent conversation history' : undefined}
          >
            {/*
             * Thin agent status line, sticky at the TOP of the panel (agent-panel
             * UX refonte, point 2). Full-bleed via negative margins that cancel the
             * scroll container's pt-6/px padding; stays pinned while the transcript
             * scrolls underneath it.
             */}
            {progressAnnotations && (
              <div className="sticky top-0 z-10 -mt-6 -mx-2 sm:-mx-6">
                <ProgressCompilation data={progressAnnotations} />
              </div>
            )}
            <ClientOnly>
              {() => {
                return chatStarted ? (
                  <>
                    <Messages
                      className="flex flex-col w-full flex-1 max-w-chat pb-4 mx-auto z-1"
                      messages={messages}
                      isStreaming={isStreaming}
                      append={append}
                      chatMode={chatMode}
                      setChatMode={setChatMode}
                      provider={provider}
                      model={model}
                      projectIdeMode={projectIdeMode}
                      onRewindToMessage={onRewindToMessage}
                      addToolResult={addToolResult}
                    />
                    {shouldRenderAgentPatchReviewQueue && (
                      <div className="w-full max-w-chat mx-auto px-0 pb-4">
                        <AgentPatchReviewQueue
                          proposals={pendingAgentPatchProposals}
                          autoApplyEnabled={projectAutoApply}
                        />
                      </div>
                    )}
                    {projectIdeMode && projectId ? (
                      <div className="w-full max-w-chat mx-auto px-0 pb-4">
                        <AgentRepairHistory projectId={projectId} />
                      </div>
                    ) : null}
                  </>
                ) : null;
              }}
            </ClientOnly>
            <ScrollToBottom />
          </StickToBottom.Content>
          {shouldRenderAgentComposer && (
            <div
              ref={agentComposerRef}
              className={classNames('my-auto flex flex-col gap-2 w-full max-w-chat mx-auto z-prompt mb-6', {
                'sticky bottom-2': chatStarted,
                'bolt-project-agent-composer bolt-project-agent-composer-stack': projectIdeMode,
                'bolt-project-agent-composer-has-messages':
                  projectIdeMode && useMobileIde && visibleProjectMessageCount > 0,
              })}
            >
              <div className="flex flex-col gap-2 bolt-project-agent-notice-stack">
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
                {/*
                 * AGM: no model names in the UI, ever — the "retry with a
                 * different model" dropdown is gone. An empty list hides the
                 * control; plain retry re-routes through the user's MODE.
                 */}
                {llmErrorAlert && (
                  <LlmErrorAlert
                    alert={llmErrorAlert}
                    clearAlert={() => clearLlmErrorAlert?.()}
                    alternativeModels={[]}
                  />
                )}
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
              </div>
              {projectIdeMode && isStreaming && (
                <div className="vc-sr-only" role="status" aria-live="polite">
                  Agent is thinking
                </div>
              )}
              {projectIdeMode &&
                !shouldShowMobileAgentStartState &&
                (!useMobileIde || visibleProjectMessageCount === 0) && (
                  <div className="bolt-project-agent-suggestions" aria-label="Agent suggestions">
                    {projectAgentSuggestions.map((suggestion) => (
                      <button
                        key={suggestion.id}
                        type="button"
                        title={`${suggestion.label}: ${suggestion.reason}`}
                        aria-label={`${suggestion.label}. ${suggestion.reason}`}
                        onClick={(event) => handleProjectAgentSendMessage(event, suggestion.prompt)}
                        disabled={isStreaming}
                      >
                        <span className={suggestion.icon} aria-hidden />
                        <span>{suggestion.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              {projectIdeMode && (
                <GenerateAppCta
                  files={projectFiles}
                  hasMessages={(messages?.length ?? 0) > 0}
                  isGenerating={isAgentRunning}
                  onGenerate={(prompt) => handleProjectAgentSendMessage({} as React.UIEvent, prompt)}
                />
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
                modelError={modelError}
                onApiKeysChange={onApiKeysChange}
                uploadedFiles={uploadedFiles}
                setUploadedFiles={setUploadedFiles}
                imageDataList={imageDataList}
                setImageDataList={setImageDataList}
                textareaRef={textareaRef}
                input={input}
                handleInputChange={handleInputChange}
                handlePaste={handlePaste}
                TEXTAREA_MIN_HEIGHT={projectIdeMode ? 28 : TEXTAREA_MIN_HEIGHT}
                TEXTAREA_MAX_HEIGHT={projectIdeMode ? 140 : TEXTAREA_MAX_HEIGHT}
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
                slashContext={{
                  planFirst: projectPlanFirst,
                  setPlanFirst: setProjectPlanFirst,
                  autoApplyEnabled: projectAutoApply,
                  insertIntoComposer,
                  createSnapshot: projectId ? createSnapshotCommand : undefined,
                  getLastPreviewError,
                  openFile: openFileFromSlash,
                  openDiff: openDiffFromSlash,
                  runShellCommand: runShellCommandFromSlash,
                }}
                projectId={projectId}
                recentMentionedFilePaths={recentMentionedFilePaths}
                recentSlashCommandIds={recentSlashCommandIds}
                designScheme={designScheme}
                setDesignScheme={setDesignScheme}
                selectedElement={selectedElement}
                setSelectedElement={setSelectedElement}
                onWebSearchResult={onWebSearchResult}
                projectIdeMode={projectIdeMode}
                planFirstEnabled={projectPlanFirst}
                onPlanFirstChange={setProjectPlanFirst}
                agentMode={publicModeForExecution(projectAgentExecutionMode)}
                setAgentMode={(mode) => {
                  /*
                   * Mirrors the old header tab onClick: pick the execution for
                   * the chosen public mode, set it, and sync chatMode (Agent →
                   * build, Assistant → discuss). Relocated into the composer.
                   */
                  const publicMode = PROJECT_AGENT_PUBLIC_MODES.find((entry) => entry.id === mode);
                  const execution = publicMode?.execution ?? 'agent';
                  const executionEntry = PROJECT_AGENT_EXECUTION_MODES.find((entry) => entry.id === execution);
                  setProjectAgentExecutionMode(execution);
                  setChatMode?.(executionEntry?.chatMode ?? 'build');
                }}
                placeholder={
                  projectIdeMode
                    ? `${
                        (
                          PROJECT_AGENT_EXECUTION_MODES.find((mode) => mode.id === projectAgentExecutionMode) ??
                          PROJECT_AGENT_EXECUTION_MODES[2]
                        ).placeholder
                      }${projectPlanFirst ? ' (Plan first)' : ''}`
                    : undefined
                }
              />
            </div>
          )}
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
            {!chatStarted && <StarterTemplates hasUnsentDraft={input.trim().length > 0} />}
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
        setProjectPanelSearchParam(panel);

        if (panel === 'editor' && selectedTab?.filePath) {
          workbenchStore.setSelectedFile(selectedTab.filePath);
          workbenchStore.currentView.set('code');
          workbenchStore.setShowWorkbench(true);
        }

        if (panel === 'preview') {
          workbenchStore.currentView.set('preview');
          workbenchStore.setShowWorkbench(true);
        }

        if (panel === 'terminal') {
          workbenchStore.currentView.set('code');
          workbenchStore.setShowWorkbench(true);
          workbenchStore.toggleTerminal(true);
        }
      },
      [paneTree, setProjectPanelSearchParam],
    );

    const closePaneTabs = useCallback((paneId: string, mode: 'all' | 'others' | 'right' | 'saved', tabId?: string) => {
      setPaneTree((currentTree) =>
        updateLeaf(currentTree, paneId, (leaf) => {
          const targetIndex = tabId ? leaf.tabs.findIndex((tab) => tab.id === tabId) : -1;

          /*
           * Audit v3 (H): 'saved' must keep tabs with unsaved changes.
           * The "Close saved" menu item previously reused the 'all' handler,
           * so it closed unsaved editors too — silent data loss. Read the live
           * unsaved-files set from the store so this stays correct without
           * adding a render dependency to the callback.
           */
          const unsaved = workbenchStore.unsavedFiles.get();

          const tabs = leaf.tabs.filter((tab, index) => {
            if (tab.pinned) {
              return true;
            }

            if (mode === 'saved') {
              return unsaved instanceof Set && !!tab.filePath && unsaved.has(tab.filePath);
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

    const togglePaneTabPinned = useCallback((paneId: string, tabId?: string) => {
      setPaneTree((currentTree) =>
        updateLeaf(currentTree, paneId, (leaf) => {
          const targetTabId = tabId ?? leaf.activeTabId ?? leaf.tabs[0]?.id;

          if (!targetTabId) {
            return leaf;
          }

          return {
            ...leaf,
            tabs: leaf.tabs.map((tab) => (tab.id === targetTabId ? { ...tab, pinned: !tab.pinned } : tab)),
          };
        }),
      );
    }, []);

    const splitPaneRight = useCallback((paneId: string, tabId?: string) => {
      let nextActivePaneId: string | undefined;

      setPaneTree((currentTree) =>
        updateLeaf(currentTree, paneId, (leaf) => {
          const targetTab =
            leaf.tabs.find((tab) => tab.id === tabId) ??
            leaf.tabs.find((tab) => tab.id === leaf.activeTabId) ??
            leaf.tabs[leaf.tabs.length - 1];

          if (!targetTab || leaf.tabs.length < 2) {
            return leaf;
          }

          const remainingTabs = leaf.tabs.filter((tab) => tab.id !== targetTab.id);
          const nextPaneId = `pane-${Date.now()}-${Math.random().toString(16).slice(2)}`;
          nextActivePaneId = nextPaneId;

          return {
            type: 'split',
            id: `split-${leaf.id}-${nextPaneId}`,
            direction: 'horizontal',
            first: {
              ...leaf,
              tabs: remainingTabs,
              activeTabId: remainingTabs.some((tab) => tab.id === leaf.activeTabId)
                ? leaf.activeTabId
                : remainingTabs[remainingTabs.length - 1]?.id,
            },
            second: {
              type: 'leaf',
              id: nextPaneId,
              tabs: [targetTab],
              activeTabId: targetTab.id,
            },
          };
        }),
      );

      if (nextActivePaneId) {
        setActivePaneId(nextActivePaneId);
      }
    }, []);

    const swapPaneTabs = useCallback(
      (sourcePaneId: string, sourceTabId: string, targetPaneId: string, targetTabId?: string) => {
        if (sourcePaneId === targetPaneId) {
          setPaneTree((currentTree) =>
            updateLeaf(currentTree, sourcePaneId, (leaf) => {
              const sourceIndex = leaf.tabs.findIndex((tab) => tab.id === sourceTabId);

              const targetIndex = targetTabId
                ? leaf.tabs.findIndex((tab) => tab.id === targetTabId)
                : leaf.tabs.length - 1;

              if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
                return leaf;
              }

              const tabs = [...leaf.tabs];
              const [sourceTab] = tabs.splice(sourceIndex, 1);
              const insertionIndex = sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
              tabs.splice(insertionIndex, 0, sourceTab);

              return {
                ...leaf,
                tabs,
                activeTabId: sourceTab.id,
              };
            }),
          );
          return;
        }

        const sourceLeaf = findLeaf(paneTree, sourcePaneId);
        const targetLeaf = findLeaf(paneTree, targetPaneId);
        const sourceTab = sourceLeaf?.tabs.find((tab) => tab.id === sourceTabId);

        const targetTab =
          targetLeaf?.tabs.find((tab) => tab.id === targetTabId) ??
          targetLeaf?.tabs.find((tab) => tab.id === targetLeaf.activeTabId) ??
          targetLeaf?.tabs[0];

        if (!sourceLeaf || !targetLeaf || !sourceTab || !targetTab) {
          return;
        }

        setPaneTree((currentTree) => {
          const withTargetInSource = updateLeaf(currentTree, sourcePaneId, (leaf) => ({
            ...leaf,
            tabs: leaf.tabs.map((tab) => (tab.id === sourceTab.id ? targetTab : tab)),
            activeTabId: targetTab.id,
          }));

          return updateLeaf(withTargetInSource, targetPaneId, (leaf) => ({
            ...leaf,
            tabs: leaf.tabs.map((tab) => (tab.id === targetTab.id ? sourceTab : tab)),
            activeTabId: sourceTab.id,
          }));
        });

        setActivePaneId(targetPaneId);
        setActiveWorkspacePanel(sourceTab.panel);
        setRecentTabIds((ids) => [sourceTab.id, ...ids.filter((id) => id !== sourceTab.id)].slice(0, 20));
        setProjectPanelSearchParam(sourceTab.panel);
      },
      [paneTree, setProjectPanelSearchParam],
    );

    const clearPaneDropTarget = useCallback(() => setPaneDropTarget(null), []);

    const renderPaneContent = useCallback(
      (panel: IdeWorkspacePanel) => {
        if (panel === 'editor') {
          return (
            <div
              className="bolt-project-editor-tool min-h-0 flex-1 overflow-hidden"
              data-testid="responsive-code-editor"
            >
              <ProjectEditorToolbar
                fileLabel={currentDocument?.filePath?.replace(WORK_DIR, '') || 'No file selected'}
                hasDocument={Boolean(currentDocument)}
                minimapEnabled={editorMinimapEnabled}
                monacoActive={editorKindForLayout(layout) === 'monaco'}
                onToggleMinimap={() => setEditorMinimapEnabled((enabled) => !enabled)}
                onFormat={() => {
                  workbenchStore.formatCurrentDocument().catch((error) => {
                    toast.error(`Format failed: ${(error as Error).message}`);
                  });
                }}
                onGoToDefinition={() => runProjectEditorCommand('goToDefinition')}
                onFindReferences={() => runProjectEditorCommand('findReferences')}
                onRenameSymbol={() => runProjectEditorCommand('renameSymbol')}
                onRefactor={() => runProjectEditorCommand('refactor')}
                onSave={onProjectEditorSave}
              />
              {currentDocument && !currentDocument.isBinary ? (
                <EditorAdapter
                  className="bolt-project-editor-adapter"
                  value={currentDocument.value}
                  filePath={currentDocument.filePath}
                  theme={theme === 'dark' ? 'dark' : 'light'}
                  minimapEnabled={editorMinimapEnabled}
                  projectFiles={editorProjectFiles}
                  onSave={onProjectEditorSave}
                  onChange={(update) => {
                    workbenchStore.setCurrentDocumentContent(update.value);

                    const filePath = currentDocument.filePath;
                    workbenchStore.scheduleFileAutosave(filePath, update.value);

                    let line = 1;
                    let lastLineStart = 0;

                    for (let index = 0; index < update.value.length; index += 1) {
                      if (update.value.charCodeAt(index) === 10) {
                        line += 1;
                        lastLineStart = index + 1;
                      }
                    }

                    setCursorPositions((positions) => ({
                      ...positions,
                      [filePath]: {
                        line,
                        column: update.value.length - lastLineStart,
                        offset: update.value.length,
                      },
                    }));
                  }}
                />
              ) : (
                <ProjectWelcomeState
                  files={recentProjectFiles}
                  onOpenTool={openIdeTool}
                  onOpenFile={(filePath) => openProjectFile(filePath, { preview: false })}
                />
              )}
            </div>
          );
        }

        if (panel === 'files') {
          return (
            <ProjectFilesTool
              files={projectFiles}
              selectedFile={selectedFile}
              unsavedFiles={unsavedFiles}
              openEditors={flattenTabs(paneTree)
                .filter((tab) => tab.filePath)
                .map((tab) => ({
                  id: tab.id,
                  filePath: tab.filePath,
                  dirty: unsavedFiles instanceof Set && unsavedFiles.has(tab.filePath!),
                  pinned: Boolean(tab.pinned),
                }))}
              changedFiles={projectBackendState.git?.fileStatuses ?? projectBackendState.git?.changedFiles}
              openFilesOnSelect={useMobileIde}
              onFilePreview={(filePath) => {
                openProjectFile(filePath, { preview: true });

                if (useMobileIde) {
                  setMobileIdePanel('editor');
                  setProjectPanelSearchParam('editor');
                }
              }}
              onFileOpen={(filePath) => {
                openProjectFile(filePath, { preview: false });

                if (useMobileIde) {
                  setMobileIdePanel('editor');
                  setProjectPanelSearchParam('editor');
                }
              }}
            />
          );
        }

        if (panel === 'search') {
          return <Search />;
        }

        if (panel === 'locks') {
          return <LockManager />;
        }

        if (panel === 'preview') {
          return (
            <div className="bolt-project-webview-tool">
              <div className="bolt-project-webview-frame" data-preview-device={previewDevice}>
                <div className="bolt-project-webview-viewport">
                  <Preview
                    setSelectedElement={setSelectedElement}
                    projectId={projectId}
                    previewDevice={previewDevice}
                    onPreviewDeviceChange={setPreviewDevice}
                    onOpenSourceFile={(filePath) => {
                      openProjectFile(filePath, { preview: false });

                      if (useMobileIde) {
                        setMobileIdePanel('editor');
                        setProjectPanelSearchParam('editor');
                      }
                    }}
                    onOpenLogsRight={() => {
                      setRightPanelMode('preview-logs');
                      setRightPanelOpen(true);
                      setTerminalBottomOpen(false);
                    }}
                  />
                </div>
              </div>
            </div>
          );
        }

        if (panel === 'terminal') {
          return <ProjectInteractiveTerminalPanel projectId={projectId} />;
        }

        return (
          <ProjectIdeServicePanel
            key={`${projectId ?? 'project'}:${panel}`}
            projectId={projectId}
            panel={panel}
            initialPayload={initialIdePanels?.[panel]}
          />
        );
      },
      [
        currentDocument,
        editorMinimapEnabled,
        editorProjectFiles,
        initialIdePanels,
        layout,
        onProjectEditorSave,
        openIdeTool,
        openProjectFile,
        previewDevice,
        projectFiles,
        projectId,
        recentProjectFiles,
        runProjectEditorCommand,
        selectedFile,
        setSelectedElement,
        setMobileIdePanel,
        setProjectPanelSearchParam,
        theme,
        unsavedFiles,
        useMobileIde,
      ],
    );

    const renderPaneLeaf = useCallback(
      (leaf: IdePaneLeaf) => {
        const activeTab = leaf.tabs.find((tab) => tab.id === leaf.activeTabId) ?? leaf.tabs[0];

        const canAcceptPaneDrop = (event: React.DragEvent) =>
          Array.from(event.dataTransfer.types).includes('application/x-vibecore-tab-id');
        const activatePaneDrop = (event: React.DragEvent) => {
          if (!canAcceptPaneDrop(event)) {
            return;
          }

          event.preventDefault();
          event.dataTransfer.dropEffect = 'move';

          if (paneDropTarget !== leaf.id) {
            setPaneDropTarget(leaf.id);
          }
        };

        return (
          <div
            key={leaf.id}
            className="bolt-project-pane-leaf"
            data-pane-id={leaf.id}
            data-active={activePaneId === leaf.id}
            data-drop-target={paneDropTarget === leaf.id ? 'true' : undefined}
            onMouseDown={() => setActivePaneId(leaf.id)}
            onDragEnter={activatePaneDrop}
            onDragOver={activatePaneDrop}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                setPaneDropTarget((target) => (target === leaf.id ? null : target));
              }
            }}
            onDrop={(event) => {
              const sourcePaneId = event.dataTransfer.getData('application/x-vibecore-pane-id');
              const sourceTabId = event.dataTransfer.getData('application/x-vibecore-tab-id');

              if (sourcePaneId && sourceTabId && sourcePaneId !== leaf.id) {
                event.preventDefault();
                event.stopPropagation();
                swapPaneTabs(sourcePaneId, sourceTabId, leaf.id, activeTab?.id);
              }

              setPaneDropTarget(null);
            }}
          >
            <IdeTabBar
              activePanel={activeTab?.panel ?? 'editor'}
              activeTabId={activeTab?.id}
              tabs={leaf.tabs.map((tab) => {
                const label =
                  tab.panel === 'editor'
                    ? tab.filePath?.replace(WORK_DIR, '') ||
                      currentDocument?.filePath?.replace(WORK_DIR, '') ||
                      'Editor'
                    : panelTitle(tab.panel);

                return {
                  ...tab,
                  label,
                  displayLabel: formatEditorTabLabel(label, tab.panel),
                  icon: tab.panel === 'editor' ? 'i-ph:code' : panelIcon(tab.panel),
                  preview: tab.preview,
                  dirty:
                    tab.panel === 'editor' &&
                    !!currentDocument &&
                    !!(tab.filePath ?? currentDocument.filePath) &&
                    unsavedFiles instanceof Set &&
                    unsavedFiles.has(tab.filePath ?? currentDocument.filePath),
                  onSave:
                    tab.panel === 'editor'
                      ? tab.filePath
                        ? () => saveProjectEditorFile(tab.filePath!)
                        : onProjectEditorSave
                      : undefined,
                  closable: !tab.pinned,
                };
              })}
              onSelect={(tabId, panel) => selectPaneTab(leaf.id, tabId, panel)}
              onClose={(tabId, panel) => {
                const tab = leaf.tabs.find((item) => item.id === tabId);

                if (tab) {
                  setClosedTabs((items) => [tab, ...items.filter((item) => item.id !== tab.id)].slice(0, 20));
                }

                closeWorkspacePanel(panel, leaf.id, tabId);
              }}
              onOpenTool={(panel) => openIdeTool(panel, leaf.id)}
              onCloseOthers={(tabId) => closePaneTabs(leaf.id, 'others', tabId)}
              onCloseToRight={(tabId) => closePaneTabs(leaf.id, 'right', tabId)}
              onCloseAll={() => closePaneTabs(leaf.id, 'all')}
              onCloseSaved={() => closePaneTabs(leaf.id, 'saved')}
              onSplitActiveRight={(tabId) => splitPaneRight(leaf.id, tabId)}
              onSwapTab={(sourcePaneId, sourceTabId, targetTabId) =>
                swapPaneTabs(sourcePaneId, sourceTabId, leaf.id, targetTabId)
              }
              onDragEnd={clearPaneDropTarget}
              onTogglePin={(tabId) => togglePaneTabPinned(leaf.id, tabId)}
              recentFiles={recentProjectFiles}
              onOpenFile={(filePath, preview) => openProjectFile(filePath, { paneId: leaf.id, preview })}
            />
            <div
              className="bolt-project-pane-content"
              data-pane-id={leaf.id}
              ref={(element) => {
                if (element && scrollPositions[leaf.id] && element.scrollTop !== scrollPositions[leaf.id]) {
                  element.scrollTop = scrollPositions[leaf.id];
                }
              }}
              onScroll={(event) => {
                const scrollTop = event.currentTarget.scrollTop;
                const paneId = leaf.id;

                if (scrollUpdateFrame.current !== null) {
                  window.cancelAnimationFrame(scrollUpdateFrame.current);
                }

                scrollUpdateFrame.current = window.requestAnimationFrame(() => {
                  setScrollPositions((positions) => ({ ...positions, [paneId]: scrollTop }));
                  scrollUpdateFrame.current = null;
                });
              }}
            >
              {activeTab ? (
                <PanelErrorBoundary
                  panel={panelTitle(activeTab.panel)}
                  boundaryId={`project:${projectId}:pane:${leaf.id}:${activeTab.panel}`}
                  projectId={projectId}
                  getSnapshot={() => ({
                    paneId: leaf.id,
                    activeTabId: activeTab.id,
                    panel: activeTab.panel,
                    filePath: activeTab.filePath,
                    unsavedChanges: unsavedFiles instanceof Set ? unsavedFiles.size : 0,
                  })}
                >
                  {renderPaneContent(activeTab.panel)}
                </PanelErrorBoundary>
              ) : (
                <ProjectWelcomeState
                  files={recentProjectFiles}
                  onOpenTool={openIdeTool}
                  onOpenFile={(filePath) => openProjectFile(filePath, { paneId: leaf.id, preview: false })}
                />
              )}
            </div>
          </div>
        );
      },
      [
        activePaneId,
        clearPaneDropTarget,
        closePaneTabs,
        closeWorkspacePanel,
        currentDocument,
        onProjectEditorSave,
        saveProjectEditorFile,
        openIdeTool,
        paneDropTarget,
        projectId,
        recentProjectFiles,
        renderPaneContent,
        selectPaneTab,
        splitPaneRight,
        scrollPositions,
        swapPaneTabs,
        unsavedFiles,
      ],
    );

    const renderPaneNode = useCallback(
      (node: IdePaneNode): React.ReactNode => {
        if (node.type === 'leaf') {
          return renderPaneLeaf(node);
        }

        return (
          <div key={node.id} className="bolt-project-pane-split" data-direction={node.direction}>
            {renderPaneNode(node.first)}
            <div className="bolt-project-pane-split-divider" aria-hidden />
            {renderPaneNode(node.second)}
          </div>
        );
      },
      [renderPaneLeaf],
    );

    const ideRailToolItems = [
      {
        panel: 'files',
        label: 'Library',
        icon: 'i-ph:files',
        badge: visibleProjectFilePaths.length || undefined,
        badgeLabel:
          visibleProjectFilePaths.length > 0
            ? `${visibleProjectFilePaths.length} file${visibleProjectFilePaths.length === 1 ? '' : 's'}`
            : undefined,
        tone: 'neutral',
        active: rightPanelOpen && rightPanelMode === 'files',
        title: `${visibleProjectFilePaths.length} file${visibleProjectFilePaths.length === 1 ? '' : 's'} in the project`,
      },
      { panel: 'search', label: 'Search', icon: 'i-ph:magnifying-glass', badge: undefined, tone: 'neutral' },
      {
        panel: 'git',
        label: 'Git',
        icon: 'i-ph:git-branch',
        badge: statusbarChangedFiles || undefined,
        badgeLabel:
          statusbarChangedFiles > 0
            ? `${statusbarChangedFiles} changed file${statusbarChangedFiles === 1 ? '' : 's'}`
            : undefined,
        tone: 'neutral',
      },
      { panel: 'packages', label: 'Packages', icon: 'i-ph:cube', badge: undefined, tone: 'neutral' },
      { panel: 'database', label: 'Database', icon: 'i-ph:database', badge: undefined, tone: 'neutral' },
      { panel: 'secrets', label: 'Secrets', icon: 'i-ph:lock', badge: undefined, tone: 'neutral' },
      { panel: 'deployments', label: 'Deployments', icon: 'i-ph:rocket-launch', badge: undefined, tone: 'neutral' },
      {
        panel: 'monitoring',
        label: 'Monitoring',
        icon: 'i-ph:chart-line',
        badge: statusbarDiagnostics.errors || undefined,
        badgeLabel:
          statusbarDiagnostics.errors > 0
            ? `${statusbarDiagnostics.errors} project error${statusbarDiagnostics.errors === 1 ? '' : 's'}`
            : undefined,
        tone: statusbarDiagnostics.errors > 0 ? 'danger' : 'neutral',
      },
      { panel: 'settings', label: 'Settings', icon: 'i-ph:gear', badge: undefined, tone: 'neutral' },
    ] as const;

    const renderIdeRailToolItem = (item: (typeof ideRailToolItems)[number]) => {
      const badgeLabel = 'badgeLabel' in item ? item.badgeLabel : undefined;
      const title = 'title' in item && item.title ? item.title : IDE_TOOL_DESCRIPTIONS[item.panel];
      const tooltip = formatRailItemTooltip(item.label, title, badgeLabel);
      const active = 'active' in item ? item.active : activeWorkspacePanel === item.panel;

      return (
        <HeaderTip key={item.panel} label={tooltip} side="right">
          <button
            type="button"
            className="bolt-project-ide-rail-item"
            aria-current={active ? 'page' : undefined}
            aria-label={formatRailItemLabel(item.label, badgeLabel)}
            title={tooltip}
            data-vc-tooltip={tooltip}
            data-tone={item.tone}
            onClick={() => openIdeTool(item.panel)}
          >
            <span className={item.icon} aria-hidden />
            <span className="bolt-project-ide-rail-label">{item.label}</span>
            {item.badge ? (
              <span className="bolt-project-ide-rail-badge" aria-hidden>
                {formatRailBadgeValue(item.badge)}
              </span>
            ) : null}
          </button>
        </HeaderTip>
      );
    };

    const getProjectPanelAvailableWidth = useCallback(() => {
      const viewportWidth = typeof window === 'undefined' ? 1440 : window.innerWidth;

      const railWidth =
        typeof document === 'undefined'
          ? 48
          : Number.parseFloat(
              window
                .getComputedStyle(document.querySelector('.bolt-responsive-ide-desktop') ?? document.documentElement)
                .getPropertyValue('--project-ide-rail-width'),
            ) || 48;

      return Math.max(320, viewportWidth - railWidth - 1);
    }, []);

    const panelPercentToPixels = useCallback(
      (size: number) => Math.round((getProjectPanelAvailableWidth() * size) / 100),
      [getProjectPanelAvailableWidth],
    );

    const panelPixelsToPercent = useCallback(
      (pixels: number) => {
        const clampedPixels = Math.min(MAX_RIGHT_PANEL_WIDTH, Math.max(MIN_RIGHT_PANEL_WIDTH, pixels));

        return (clampedPixels / getProjectPanelAvailableWidth()) * 100;
      },
      [MAX_RIGHT_PANEL_WIDTH, MIN_RIGHT_PANEL_WIDTH, getProjectPanelAvailableWidth],
    );

    const rightPanelDefaultSize = panelPixelsToPercent(rightPanelWidth);
    const rightPanelMinSize = panelPixelsToPercent(MIN_RIGHT_PANEL_WIDTH);
    const rightPanelMaxSize = panelPixelsToPercent(MAX_RIGHT_PANEL_WIDTH);
    const agentPanelDefaultSize = 24;

    const workspacePanelDefaultSize = rightPanelOpen
      ? projectAgentPanelOpen
        ? Math.max(35, 100 - agentPanelDefaultSize - rightPanelDefaultSize)
        : Math.max(35, 100 - rightPanelDefaultSize)
      : projectAgentPanelOpen
        ? 100 - agentPanelDefaultSize
        : 100;

    const projectIdePanels = (
      <div
        className="bolt-project-ide-panels"
        style={
          {
            '--project-agent-width': `${agentWidth}px`,
            '--project-agent-statusbar-left-offset': projectAgentPanelOpen ? `${agentWidth}px` : '0px',
            '--project-agent-min-width': `${PROJECT_AGENT_PANEL_MIN_WIDTH}px`,
            '--project-right-panel-width': rightPanelOpen ? `${rightPanelWidth}px` : '0px',
          } as React.CSSProperties
        }
      >
        <ZoneErrorBoundary
          zone="sidebar"
          title="Workspace tools"
          boundaryId={`project:${projectId}:sidebar`}
          projectId={projectId}
          getSnapshot={() => ({
            activeWorkspacePanel,
            rightPanelMode,
            rightPanelOpen,
            changedFiles: statusbarChangedFiles,
          })}
        >
          <aside className="bolt-project-ide-rail" aria-label="Workspace tools">
            <div className="bolt-project-ide-rail-tools">{ideRailToolItems.map(renderIdeRailToolItem)}</div>
          </aside>
        </ZoneErrorBoundary>
        <PanelGroup direction="horizontal" className="bolt-project-panel-group">
          <Panel
            id="project-workspace-panel"
            order={projectAgentPanelOpen ? 2 : 1}
            defaultSize={workspacePanelDefaultSize}
            minSize={35}
            className="bolt-project-panel-slot bolt-project-panel-slot-workspace"
          >
            <ZoneErrorBoundary
              zone="editor"
              title="Workspace"
              boundaryId={`project:${projectId}:workspace`}
              projectId={projectId}
              getSnapshot={() => ({
                activeWorkspacePanel,
                activePaneId,
                terminalBottomOpen,
                bottomTerminalView,
                tabCount: flattenTabs(paneTree).length,
              })}
            >
              <div className="bolt-project-workspace-shell">
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
                          <ProjectBottomTerminal
                            projectId={projectId}
                            active={bottomTerminalView}
                            runtimeWorkspace={projectRuntimeState.workspace}
                            initialIdePanels={initialIdePanels}
                            onActiveChange={setBottomTerminalView}
                            onClose={() => setTerminalBottomOpen(false)}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </section>
              </div>
            </ZoneErrorBoundary>
          </Panel>
          {rightPanelOpen && (
            <>
              <PanelResizeHandle
                className="bolt-project-panel-resize-handle"
                aria-label="Resize files panel"
                title="Resize files panel"
              />
              <Panel
                id="project-right-panel"
                order={projectAgentPanelOpen ? 3 : 2}
                defaultSize={rightPanelDefaultSize}
                minSize={rightPanelMinSize}
                maxSize={rightPanelMaxSize}
                collapsible
                collapsedSize={0}
                className="bolt-project-panel-slot bolt-project-panel-slot-right"
                onCollapse={() => {
                  setRightPanelOpen(false);
                  setProjectPanelSearchParam();
                }}
                onResize={(size) => {
                  const nextWidth = Math.min(
                    MAX_RIGHT_PANEL_WIDTH,
                    Math.max(MIN_RIGHT_PANEL_WIDTH, panelPercentToPixels(size)),
                  );
                  setRightPanelWidth(nextWidth);
                }}
              >
                <aside
                  className="bolt-project-right-panel-shell"
                  aria-label={rightPanelMode === 'files' ? 'Project library panel' : 'Preview logs panel'}
                  style={{ '--project-right-panel-width': `${rightPanelWidth}px` } as React.CSSProperties}
                >
                  <div className="bolt-project-right-files-header">
                    <span className={rightPanelMode === 'files' ? 'i-ph:files' : 'i-ph:terminal-window'} aria-hidden />
                    <span>{rightPanelMode === 'files' ? 'Library' : 'Preview logs'}</span>
                    <button
                      type="button"
                      className="bolt-project-ide-icon-button ml-auto"
                      aria-label="Close right panel"
                      onClick={() => {
                        setRightPanelOpen(false);
                        setProjectPanelSearchParam();
                      }}
                    >
                      <span className="i-ph:x" aria-hidden />
                    </button>
                  </div>
                  <div className="bolt-project-right-panel-content">
                    <PanelErrorBoundary
                      panel={rightPanelMode === 'files' ? 'Library' : 'Preview logs'}
                      boundaryId={`project:${projectId}:right:${rightPanelMode}`}
                      projectId={projectId}
                      getSnapshot={() => ({
                        rightPanelMode,
                        selectedFile,
                        fileCount: projectFilePaths.length,
                        changedFiles: statusbarChangedFiles,
                      })}
                    >
                      {rightPanelMode === 'files' ? (
                        <ProjectFilesTool
                          files={projectFiles}
                          selectedFile={selectedFile}
                          unsavedFiles={unsavedFiles}
                          openEditors={flattenTabs(paneTree)
                            .filter((tab) => tab.filePath)
                            .map((tab) => ({
                              id: tab.id,
                              filePath: tab.filePath,
                              dirty: unsavedFiles instanceof Set && unsavedFiles.has(tab.filePath!),
                              pinned: Boolean(tab.pinned),
                            }))}
                          changedFiles={projectBackendState.git?.fileStatuses ?? projectBackendState.git?.changedFiles}
                          onFilePreview={(filePath) => openProjectFile(filePath, { preview: true })}
                          onFileOpen={(filePath) => openProjectFile(filePath, { preview: false })}
                        />
                      ) : (
                        <ProjectIdeServicePanel
                          key={`${projectId ?? 'project'}:right:logs`}
                          projectId={projectId}
                          panel="logs"
                          initialPayload={initialIdePanels?.logs}
                        />
                      )}
                    </PanelErrorBoundary>
                  </div>
                </aside>
              </Panel>
            </>
          )}
          {projectAgentPanelOpen && (
            <>
              <PanelResizeHandle
                className="bolt-project-panel-resize-handle bolt-project-agent-resize-handle"
                aria-label="Resize AI agent panel"
                title="Resize AI agent panel"
              />
              <Panel
                id="project-agent-panel"
                order={1}
                defaultSize={agentPanelDefaultSize}
                minSize={20}
                maxSize={36}
                className="bolt-project-panel-slot bolt-project-panel-slot-agent"
                onResize={(size) => setAgentWidth(clampProjectAgentPanelWidth(panelPercentToPixels(size)))}
              >
                <section className="bolt-project-ide-panel bolt-project-agent-shell" aria-label="AI agent">
                  <div className="bolt-project-agent-header">
                    <div className="bolt-project-agent-avatar" aria-hidden>
                      <span className="i-ph:sparkle" />
                    </div>
                    <span className="bolt-project-agent-title" title={description?.trim() || 'New chat'}>
                      {description?.trim() || 'New chat'}
                    </span>
                    <div className="ml-auto flex min-w-max items-center gap-1">
                      <HeaderTip label={headerPresenceTooltip}>
                        <button
                          type="button"
                          className="bolt-project-ide-icon-button bolt-project-collaboration-button"
                          aria-label={headerPresenceTooltip}
                          onClick={() => openWorkspacePanel('collaborators')}
                        >
                          <Users size={15} strokeWidth={2} aria-hidden />
                          {headerPresence.length ? (
                            <span className="bolt-project-collaboration-count" aria-hidden>
                              {headerPresence.length}
                            </span>
                          ) : null}
                        </button>
                      </HeaderTip>
                      {projectId ? (
                        <HeaderTip label="Browse conversation branches">
                          <ConversationBranchesMenu projectId={projectId} className="bolt-project-ide-icon-button" />
                        </HeaderTip>
                      ) : null}
                      {projectId ? (
                        <HeaderTip label="Share this conversation as a read-only link">
                          <ShareConversationButton
                            conversationId={`project:${projectId}`}
                            projectId={projectId}
                            authorUserId="self"
                            title={description?.trim() || undefined}
                            messages={messages ?? []}
                            className="bolt-project-ide-icon-button"
                          />
                        </HeaderTip>
                      ) : null}
                      <HeaderTip label="Conversation history">
                        <button
                          type="button"
                          className="bolt-project-ide-icon-button"
                          aria-label="Conversation history"
                          onClick={() => setConversationHistoryOpen((value) => !value)}
                        >
                          <span className="i-ph:clock" aria-hidden />
                        </button>
                      </HeaderTip>
                      {/*
                       * Replit-clean header: the lower-frequency actions (copy,
                       * export, settings, appearance, clear) collapse into a single
                       * "…" overflow — none removed, all still reachable here. The
                       * interactive popovers (presence, branches, share) stay inline
                       * because they don't nest cleanly inside another menu.
                       */}
                      <HeaderOverflowMenu label="More agent actions">
                        <button
                          type="button"
                          role="menuitem"
                          className="bolt-header-overflow-item"
                          aria-label="Copy conversation"
                          onClick={() => void copyProjectConversation()}
                        >
                          <Copy size={14} strokeWidth={2} aria-hidden />
                          <span>Copy conversation</span>
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          className="bolt-header-overflow-item"
                          aria-label="Export conversation"
                          onClick={exportProjectConversation}
                        >
                          <Download size={14} strokeWidth={2} aria-hidden />
                          <span>Export conversation</span>
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          className="bolt-header-overflow-item"
                          aria-label="Agent settings"
                          onClick={() => openWorkspacePanel('settings')}
                        >
                          <span className="i-ph:sliders-horizontal" aria-hidden />
                          <span>Agent settings</span>
                        </button>
                        <div className="bolt-header-overflow-item bolt-header-overflow-item--static">
                          <span className="flex items-center gap-2">
                            <span className="i-ph:moon" aria-hidden />
                            <span>Appearance</span>
                          </span>
                          <ThemeSwitch size="sm" title="Switch light/dark theme" />
                        </div>
                        <button
                          type="button"
                          role="menuitem"
                          className="bolt-header-overflow-item bolt-header-overflow-item--danger"
                          aria-label="Clear history"
                          onClick={clearProjectConversation}
                        >
                          <Trash2 size={14} strokeWidth={2} aria-hidden />
                          <span>Clear history</span>
                        </button>
                      </HeaderOverflowMenu>
                      <HeaderTip label="Hide agent panel (Cmd+L)">
                        <button
                          type="button"
                          className="bolt-project-ide-icon-button"
                          aria-label="Hide AI agent panel"
                          onClick={() => setProjectAgentPanelOpen(false)}
                        >
                          <span className="i-ph:x" aria-hidden />
                        </button>
                      </HeaderTip>
                    </div>
                  </div>
                  {/*
                   * The dedicated Agent/Assistant tab row was removed from the
                   * header (Replit-style: no separate mode header). The same
                   * Agent/Assistant control now lives in the composer toolbar
                   * next to Plan (ChatBox `agentMode`/`setAgentMode`). No option
                   * lost — the execution mode + chatMode sync is identical.
                   */}
                  {isAgentRunning && <ProjectAgentRunStatus stopLabel={stopAgentLabel} onStop={handleStop} />}
                  {conversationHistoryOpen && (
                    <div className="bolt-project-conversation-history" role="dialog" aria-label="Project agent history">
                      <div className="bolt-project-conversation-history-head">
                        <div>
                          <strong>Agent history</strong>
                          <span>
                            {filteredProjectConversationCheckpoints.length} of {projectConversationCheckpoints.length}{' '}
                            checkpoints
                          </span>
                        </div>
                        <button
                          type="button"
                          className="bolt-project-ide-icon-button"
                          aria-label="Close history"
                          onClick={() => setConversationHistoryOpen(false)}
                        >
                          <span className="i-ph:x" aria-hidden />
                        </button>
                      </div>
                      <label className="bolt-project-conversation-history-search">
                        <span className="i-ph:magnifying-glass" aria-hidden />
                        <input
                          type="search"
                          value={conversationHistoryQuery}
                          placeholder="Search checkpoints, commits, prompts, or agent replies"
                          aria-label="Search agent checkpoints"
                          onChange={(event) => setConversationHistoryQuery(event.currentTarget.value)}
                        />
                        {conversationHistoryQuery && (
                          <button
                            type="button"
                            aria-label="Clear history search"
                            onClick={() => setConversationHistoryQuery('')}
                          >
                            <span className="i-ph:x" aria-hidden />
                          </button>
                        )}
                      </label>
                      <div className="bolt-project-conversation-history-list">
                        {filteredProjectConversationCheckpoints.map((checkpoint) => {
                          const rollbackAvailable = checkpoint.snapshot || checkpoint.messages.length;

                          return (
                            <article key={checkpoint.id} className="bolt-project-history-checkpoint">
                              <div className="bolt-project-history-checkpoint-main">
                                <strong>{checkpoint.title}</strong>
                                <span>{checkpoint.description}</span>
                                <small>
                                  {checkpoint.ageLabel}
                                  {checkpoint.commitSha ? ` • ${checkpoint.commitSha}` : ''}
                                </small>
                              </div>
                              <div className="bolt-project-history-checkpoint-actions">
                                <button
                                  type="button"
                                  aria-label={`View chat at checkpoint ${checkpoint.title}`}
                                  onClick={() => viewProjectCheckpoint(checkpoint)}
                                >
                                  View Chat
                                </button>
                                <button
                                  type="button"
                                  disabled={!rollbackAvailable}
                                  aria-label={`Rollback to checkpoint ${checkpoint.title}`}
                                  onClick={() => {
                                    setRollbackDatabase(false);
                                    setRollbackTarget(checkpoint);
                                  }}
                                >
                                  Rollback here
                                </button>
                                <button
                                  type="button"
                                  aria-label={`Review diff for checkpoint ${checkpoint.title}`}
                                  onClick={() => openCheckpointChanges(checkpoint)}
                                >
                                  Review diff
                                </button>
                              </div>
                            </article>
                          );
                        })}
                        {!projectConversationCheckpoints.length && (
                          <div className="bolt-project-history-empty">No project agent history yet.</div>
                        )}
                        {projectConversationCheckpoints.length > 0 &&
                          !filteredProjectConversationCheckpoints.length && (
                            <div className="bolt-project-history-empty">No checkpoints match this search.</div>
                          )}
                      </div>
                    </div>
                  )}
                  <ZoneErrorBoundary
                    zone="agent"
                    title="Agent"
                    boundaryId={`project:${projectId}:agent`}
                    projectId={projectId}
                    getSnapshot={() => ({
                      isAgentRunning,
                      projectAgentExecutionMode,
                      projectPlanFirst,
                      projectAutoApply,
                      pendingProposals: pendingAgentPatchProposals.length,
                    })}
                  >
                    <div className="min-h-0 flex-1 overflow-hidden">{agentPanel}</div>
                  </ZoneErrorBoundary>
                </section>
              </Panel>
            </>
          )}
        </PanelGroup>
        {!projectAgentPanelOpen && (
          <button
            type="button"
            className="bolt-project-agent-panel-toggle"
            aria-label="Open AI agent panel"
            title="Open AI agent panel (Cmd+L)"
            onClick={() => {
              setProjectAgentPanelOpen(true);
              window.setTimeout(() => textareaRef?.current?.focus(), 0);
            }}
          >
            <span className="i-ph:sparkle" aria-hidden />
            <span>Agent</span>
            <kbd>{formatKeybindingCombo('cmd+l')}</kbd>
          </button>
        )}
      </div>
    );

    const commandPaletteEntries = useMemo(
      () =>
        [
          ...projectFilePaths.slice(0, 20).map((filePath) => ({
            id: `file:${filePath}`,
            section: 'Files',
            title: filePath.replace(WORK_DIR, '') || filePath,
            description: 'Open project file',
            shortcut: formatKeybindingCombo('cmd+p'),
            icon: 'i-ph:file-code',
            kind: 'file' as const,
            filePath,
          })),
          ...[
            ['files', 'Files', 'Browse project files', formatKeybindingCombo('cmd+p')],
            ['search', 'Search', 'Find in files', ''],
            ['terminal', SHELL_TERMINAL_LABEL, 'Workspace shell', formatKeybindingCombo('cmd+`')],
            ['preview', 'Webview', 'App preview', formatKeybindingCombo('cmd+enter')],
            ['database', 'Database', 'SQL browser', ''],
            ['object-storage', 'Object Storage', 'File storage', ''],
            ['env', 'Environment variables', 'Environment variables', ''],
            ['secrets', 'Secrets', 'Encrypted project secrets', ''],
            ['git', 'Git', 'Version control', ''],
            ['packages', 'Packages', 'Dependencies manager', ''],
            ['skills', 'Skills', 'Agent skills', ''],
            ['integrations', 'Integrations', 'Connected services', ''],
            ['workflows', 'Workflows', 'Task automation', ''],
            ['deployments', 'Deployments', 'Publish your app', ''],
            ['security', 'Security', 'Security scanner', ''],
            ['monitoring', 'Monitoring', 'App metrics', ''],
            ['ports', 'Ports', 'Forwarded ports', ''],
            ['extensions', 'Extensions', 'Marketplace', ''],
            ['snapshots', 'Snapshots', 'Create or restore checkpoints', ''],
            ['settings', 'Settings', 'Project settings', formatKeybindingCombo('cmd+,')],
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
            ['deploy', 'Deployments', 'Open Deployments panel', ''],
            ['theme', 'Toggle theme', 'Use existing theme controls', ''],
            ['reset-layout', 'Reset layout', 'Restore default IDE layout', ''],
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
          .slice(0, 60),
      [commandPaletteMode, commandPaletteQuery, paneTree, projectFilePaths],
    );

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
        } else if (entry.command === 'deploy') {
          openWorkspacePanel('deployments');
        } else if (entry.command === 'run') {
          openWorkspacePanel('preview');
          void workbenchStore.startPreviewServer();
        } else if (entry.command === 'stop') {
          void workbenchStore.stopPreviewServer();
          openWorkspacePanel('logs');
        } else if (entry.command === 'theme') {
          toggleTheme();
        }
      }

      setCommandPaletteOpen(false);
      setCommandPaletteQuery('');
      setCommandPaletteIndex(0);
    };

    const commandPaletteSections = useMemo(
      () =>
        (['Files', 'Tools', 'Commands', 'Recent'] as const).map((name) => ({
          name,
          entries: commandPaletteEntries.filter((entry) => entry.section === name),
        })),
      [commandPaletteEntries],
    );

    const keybindingConflicts = useMemo(() => detectKeybindingConflicts(projectKeybindings), [projectKeybindings]);

    const mobileHeaderTab = ECODE_MOBILE_TAB_META[activeMobileOpenTabId] ??
      ECODE_MOBILE_TAB_META[mobilePanel === 'chat' ? 'agent' : mobilePanel] ?? {
        id: activeMobileOpenTabId,
        name: panelTitle(activeMobileOpenTabId),
        icon: panelIcon(activeMobileOpenTabId),
      };
    const isMobileAgentActive =
      mobilePanel === 'chat' ||
      activeMobileOpenTabId === 'agent' ||
      activeMobileOpenTabId === 'assistant' ||
      activeMobileOpenTabId === 'actions';
    const mobileServiceHeaderTab =
      useMobileIde && mobilePanel === 'deploy' && activeMobileOpenTabId ? mobileHeaderTab : undefined;
    const mobileMoreMenuItems = useMemo(
      () =>
        ECODE_MOBILE_MORE_ITEMS.map((itemId) => {
          const tool = ECODE_MOBILE_TOOLS.find((item) => item.id === itemId);
          const meta = ECODE_MOBILE_TAB_META[itemId];

          return {
            id: itemId,
            title: tool?.title ?? meta?.name ?? panelTitle(itemId),
            icon: tool?.icon ?? meta?.icon ?? panelIcon(itemId),
            tone: tool && 'tone' in tool ? tool.tone : undefined,
          };
        }),
      [],
    );

    const mobileBottomTabSlotCount = 4;

    const mobileBottomTabs = useMemo(
      () => selectVisibleMobileBottomTabs(mobileOpenTabs, activeMobileOpenTabId, mobileBottomTabSlotCount),
      [activeMobileOpenTabId, mobileBottomTabSlotCount, mobileOpenTabs],
    );
    const hiddenMobileBottomTabCount = useMemo(
      () => countHiddenMobileBottomTabs(mobileOpenTabs, mobileBottomTabs),
      [mobileBottomTabs, mobileOpenTabs],
    );

    const showMobileChrome = useMobileIde && clientHydrated;

    const keybindingSections = useMemo(
      () =>
        (['File', 'Navigation', 'Workbench', 'Editor', 'Agent', 'Terminal', 'Help'] as const)
          .map((category) => ({
            category,
            bindings: projectKeybindings.filter((binding) => binding.category === category),
          }))
          .filter((section) => section.bindings.length > 0),
      [projectKeybindings],
    );

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
            ? ({
                '--project-agent-width': `${agentWidth}px`,
                '--project-agent-min-width': `${PROJECT_AGENT_PANEL_MIN_WIDTH}px`,
              } as React.CSSProperties)
            : undefined
        }
        data-chat-visible={showChat}
        data-mobile-panel={mobilePanel}
        data-mobile-agent-context={showMobileChrome && isMobileAgentActive ? 'true' : 'false'}
        {...(useMobileIde ? mobileSwipeHandlers : {})}
      >
        {!projectIdeMode && <ClientOnly>{() => <Menu />}</ClientOnly>}
        {/*
         * Save-conflict resolution, mounted at the IDE root so it covers every
         * save surface (project editor, workbench, diff view) on desktop and
         * mobile alike. Renders null unless a conflict is pending.
         */}
        <ClientOnly>{() => <FileSaveConflictDialog />}</ClientOnly>
        {/* DO NOT MODIFY — mobile Terminal tab frozen per Avi (ref IMG_9149). Header structure
            (back · activity · "Shell (Terminal)" · + · ⋮) is the reference; exclude from responsive/
            fan-out/parity passes. */}
        {projectIdeMode && showMobileChrome && (
          <header className="bolt-mobile-ecode-header" data-testid="mobile-ide-header">
            <div className="bolt-mobile-ecode-header-inner">
              <div className="bolt-mobile-ecode-header-side">
                <button
                  type="button"
                  aria-label="Back to dashboard"
                  data-testid="button-back"
                  onClick={() => navigate('/dashboard')}
                >
                  <span className="i-ph:arrow-left" aria-hidden />
                </button>
                <button
                  type="button"
                  aria-label="Activity"
                  data-testid="button-history"
                  onClick={() => activateMobileTool('activity')}
                >
                  <span className="i-ph:activity" aria-hidden />
                </button>
              </div>

              <div className="bolt-mobile-ecode-header-title">
                {mobileHeaderTab.icon === 'agent' ? (
                  <MobileReplitAgentIcon className="bolt-mobile-ecode-header-agent" />
                ) : (
                  <span className={mobileHeaderTab.icon} aria-hidden />
                )}
                <span>
                  <strong>{mobileHeaderTab.name}</strong>
                  {isMobileAgentActive ? <small>{mobileAgentStatusLabel}</small> : null}
                </span>
              </div>

              <div className="bolt-mobile-ecode-header-side bolt-mobile-ecode-header-side--right">
                <button
                  type="button"
                  aria-label="Open tools"
                  aria-haspopup="dialog"
                  aria-expanded={mobileToolsSheetOpen}
                  data-testid="button-new-tab"
                  onClick={openMobileToolsSheet}
                >
                  <span className="i-ph:plus" aria-hidden />
                </button>
                <button
                  type="button"
                  aria-label={isMobileAgentActive ? 'Agent options' : 'More options'}
                  aria-haspopup="dialog"
                  aria-expanded={isMobileAgentActive ? mobileAgentMenuOpen : mobileMoreMenuOpen}
                  data-testid={isMobileAgentActive ? 'mobile-agent-menu-trigger' : 'button-more'}
                  onClick={isMobileAgentActive ? openMobileAgentMenu : openMobileMoreMenu}
                >
                  <span className="i-ph:dots-three-vertical-bold" aria-hidden />
                </button>
              </div>
            </div>
            {isMobileAgentActive ? (
              <div className="bolt-mobile-agent-context-bar" data-running={isAgentRunning ? 'true' : 'false'}>
                <span className={isAgentRunning ? 'i-svg-spinners:3-dots-fade' : 'i-ph:check-circle'} aria-hidden />
                <span>
                  <strong>{isAgentRunning ? 'Working on this workspace' : 'Ready for the next change'}</strong>
                  <small>{mobileAgentContextLabel}</small>
                </span>
                <button type="button" aria-label="Focus Agent prompt" onClick={() => textareaRef?.current?.focus()}>
                  Prompt
                </button>
              </div>
            ) : null}
          </header>
        )}
        <div className="bolt-connection-status" role="status" aria-live="polite" data-online={isOnline}>
          {!isOnline ? 'Offline mode: edits stay local until the workspace connection returns.' : 'Connection healthy'}
        </div>
        {commandPaletteOpen && (
          <>
            <button
              type="button"
              className="bolt-project-command-palette-backdrop"
              aria-label="Close command palette"
              data-testid="command-palette-backdrop"
              onClick={() => setCommandPaletteOpen(false)}
            />
            <div className="bolt-project-command-palette" role="dialog" aria-modal="true" aria-label="Command palette">
              <input
                type="text"
                autoFocus
                autoComplete="off"
                inputMode="search"
                placeholder="Search tools, files, and commands..."
                aria-label="Search commands"
                role="combobox"
                aria-expanded
                aria-controls="project-command-listbox"
                aria-activedescendant={
                  commandPaletteEntries.length ? `project-command-option-${commandPaletteIndex}` : undefined
                }
                data-testid="project-command-palette-search"
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
                    setCommandPaletteIndex((index) =>
                      Math.min(index + 1, Math.max(commandPaletteEntries.length - 1, 0)),
                    );
                  } else if (event.key === 'ArrowUp') {
                    event.preventDefault();
                    setCommandPaletteIndex((index) => Math.max(index - 1, 0));
                  } else if (event.key === 'Enter') {
                    event.preventDefault();
                    runCommandPaletteEntry();
                  }
                }}
              />
              <div id="project-command-listbox" role="listbox" aria-label="Commands, tools and files">
                {commandPaletteSections.map((section) => (
                  <div key={section.name} role="group" aria-label={section.name}>
                    <div className="bolt-project-command-section" role="presentation">
                      {section.name}
                    </div>
                    {section.entries.map((entry) => {
                      const index = commandPaletteEntries.findIndex((item) => item.id === entry.id);
                      const active = commandPaletteIndex === index;

                      return (
                        <button
                          key={entry.id}
                          id={`project-command-option-${index}`}
                          type="button"
                          role="option"
                          aria-selected={active}
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
                  </div>
                ))}
                {!commandPaletteEntries.length && (
                  <div className="px-4 py-6 text-sm text-bolt-elements-textTertiary">
                    No matching command, tool, or file.
                  </div>
                )}
              </div>
              <footer>↑↓ navigate · ↵ select · esc close</footer>
            </div>
          </>
        )}
        {keyboardShortcutsOpen && (
          <div
            ref={keyboardShortcutsRef}
            className="bolt-project-command-palette bolt-project-keybindings-palette"
            role="dialog"
            aria-modal="true"
            aria-label="Keyboard shortcuts"
          >
            <header className="bolt-project-keybindings-head">
              <div>
                <strong>Keyboard shortcuts</strong>
                <span>{projectKeybindings.length} active bindings in this workspace</span>
              </div>
              <button
                type="button"
                className="bolt-project-ide-icon-button"
                aria-label="Close keyboard shortcuts"
                onClick={() => setKeyboardShortcutsOpen(false)}
              >
                <span className="i-ph:x" aria-hidden />
              </button>
            </header>
            {keybindingConflicts.length > 0 ? (
              <div className="bolt-project-keybindings-conflicts" role="alert">
                <strong>Shortcut conflicts detected</strong>
                <span>
                  {keybindingConflicts
                    .map((conflict) => `${formatKeybindingCombo(conflict.combo)}: ${conflict.actions.join(', ')}`)
                    .join(' · ')}
                </span>
              </div>
            ) : null}
            <div className="bolt-project-keybindings-list">
              {keybindingSections.map((section) => (
                <section key={section.category} aria-label={`${section.category} shortcuts`}>
                  <h3>{section.category}</h3>
                  {section.bindings.map((binding) => (
                    <div key={`${binding.combo}-${binding.action}`} className="bolt-project-keybinding-row">
                      <span>
                        <strong>{binding.label}</strong>
                        <small>{binding.description}</small>
                      </span>
                      <kbd>{formatKeybindingCombo(binding.combo)}</kbd>
                    </div>
                  ))}
                </section>
              ))}
            </div>
            <footer>Press Esc to close</footer>
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
              {useMobileIde && mobilePanel === 'locks' ? (
                <PanelBoundary title="Locks">
                  <div
                    className="bolt-workbench-mobile bolt-workbench-mobile-service fixed left-0 z-0 w-full"
                    data-testid="mobile-locks-panel"
                  >
                    <LockManager />
                  </div>
                </PanelBoundary>
              ) : useMobileIde && mobilePanel === 'deploy' ? (
                <PanelBoundary title={IDE_TOOL_DESCRIPTIONS[activeMobileServicePanel] ?? 'Project tools'}>
                  <div className="bolt-workbench-mobile bolt-workbench-mobile-service fixed left-0 z-0 w-full">
                    <ProjectIdeServicePanel
                      key={`${projectId ?? 'project'}:mobile:${activeMobileServicePanel}`}
                      projectId={projectId}
                      panel={activeMobileServicePanel}
                      displayTitle={mobileServiceHeaderTab?.name}
                      displayIcon={mobileServiceHeaderTab?.icon === 'agent' ? undefined : mobileServiceHeaderTab?.icon}
                      initialPayload={initialIdePanels?.[activeMobileServicePanel]}
                    />
                  </div>
                </PanelBoundary>
              ) : useMobileIde && mobilePanel === 'chat' ? null : (
                <ClientOnly>
                  {() => (
                    <PanelBoundary title="Workbench">
                      <Suspense fallback={<PanelLoading title="Loading workspace panels" />}>
                        <LazyWorkbench
                          chatStarted={chatStarted || useMobileIde}
                          isStreaming={isStreaming}
                          setSelectedElement={setSelectedElement}
                          mobilePanel={
                            mobilePanel === 'chat' ? 'editor' : mobilePanel === 'deploy' ? 'editor' : mobilePanel
                          }
                          projectId={projectId}
                          onMobilePanelChange={(panel) => {
                            if (panel === 'editor') {
                              setMobileIdePanel('editor');
                              setProjectPanelSearchParam('editor');
                            }
                          }}
                        />
                      </Suspense>
                    </PanelBoundary>
                  )}
                </ClientOnly>
              )}
            </>
          )}
        </div>
        {/* DO NOT MODIFY — mobile Terminal tab frozen per Avi (ref IMG_9149). Bottom dock
            (record/run · tab-switcher · Files · </> · preview · apps · +N · + · ⋮) is the reference;
            exclude from responsive/fan-out/parity passes. */}
        {showMobileChrome && (
          <nav className="bolt-mobile-replit-nav" aria-label="IDE panels" data-testid="mobile-bottom-navigation">
            <div className="bolt-mobile-replit-nav-bg" aria-hidden />
            <div className="bolt-mobile-replit-nav-inner">
              <button
                type="button"
                className={classNames('bolt-mobile-replit-run', {
                  'bolt-mobile-replit-run--active': isMobilePreviewRunActive,
                })}
                aria-busy={isMobilePreviewTransitioning || undefined}
                aria-label={mobilePreviewRunLabel}
                aria-pressed={isMobilePreviewRunActive}
                data-run-state={mobilePreviewRunState}
                data-testid="button-play-stop"
                data-preview-state={previewServerStatus}
                data-runtime-running={isRuntimeReallyRunning || undefined}
                disabled={isMobilePreviewStopping}
                onClick={handleMobilePreviewRunToggle}
                title={mobilePreviewRunLabel}
              >
                <span className={mobilePreviewRunIcon} aria-hidden />
              </button>

              <div className="bolt-mobile-replit-tabs" data-testid="mobile-open-tabs">
                <button
                  type="button"
                  className="bolt-mobile-replit-icon-tab"
                  aria-label="Open tab switcher"
                  data-testid="button-tab-switcher"
                  onClick={openMobileTabSwitcher}
                >
                  <span className="i-ph:squares-four" aria-hidden />
                </button>
                <span className="bolt-mobile-replit-divider" aria-hidden />
                <div className="bolt-mobile-replit-panel-scroll" role="group" aria-label="Open tabs">
                  {mobileBottomTabs.map((tab) => {
                    const isActive = activeMobileOpenTabId === tab.id;

                    return (
                      <button
                        key={tab.id}
                        type="button"
                        className="bolt-mobile-replit-icon-tab bolt-mobile-replit-panel-tab"
                        aria-label={`Switch to ${tab.name} tab`}
                        aria-pressed={isActive}
                        aria-current={isActive ? 'page' : undefined}
                        data-testid={`tab-${tab.id}`}
                        onClick={() => activateMobileTool(tab.id)}
                      >
                        {tab.icon === 'agent' ? <MobileReplitAgentIcon /> : <span className={tab.icon} aria-hidden />}
                        <span className="sr-only bolt-mobile-replit-tab-label">{tab.name}</span>
                        {isActive ? <span className="bolt-mobile-replit-tab-indicator" aria-hidden /> : null}
                      </button>
                    );
                  })}
                </div>
                {hiddenMobileBottomTabCount > 0 ? (
                  <button
                    type="button"
                    className="bolt-mobile-replit-icon-tab bolt-mobile-replit-more-tabs"
                    aria-label={`Show ${hiddenMobileBottomTabCount} more tabs`}
                    data-testid="button-more-tabs"
                    onClick={openMobileTabSwitcher}
                  >
                    +{hiddenMobileBottomTabCount}
                  </button>
                ) : null}
                <span className="bolt-mobile-replit-divider bolt-mobile-replit-divider--add" aria-hidden />
                <button
                  type="button"
                  className="bolt-mobile-replit-icon-tab"
                  aria-label="Add new tab"
                  aria-haspopup="dialog"
                  aria-expanded={mobileToolsSheetOpen}
                  data-testid="button-add-tab"
                  onClick={openMobileToolsSheet}
                >
                  <span className="i-ph:plus" aria-hidden />
                </button>
              </div>

              <button
                type="button"
                className="bolt-mobile-replit-tools"
                aria-label="More options"
                aria-haspopup="dialog"
                aria-expanded={mobileMoreMenuOpen}
                data-testid="button-more"
                onClick={openMobileMoreMenu}
              >
                <span className="i-ph:dots-three-vertical-bold" aria-hidden />
              </button>
            </div>
          </nav>
        )}
        {showMobileChrome && mobileAgentMenuOpen && (
          <>
            <button
              type="button"
              className="bolt-mobile-agent-menu-backdrop"
              aria-label="Close agent options"
              data-testid="mobile-agent-menu-backdrop"
              onClick={closeMobileOverlays}
            />
            <section
              className="bolt-mobile-agent-menu-sheet"
              role="dialog"
              aria-modal="true"
              aria-label="Agent options"
              data-testid="mobile-agent-menu-sheet"
              onKeyDownCapture={handleMobileOverlayEscapeKey}
            >
              <div className="bolt-mobile-agent-menu-handle" aria-hidden />
              <header className="bolt-mobile-agent-menu-header">
                <div className="bolt-mobile-agent-menu-title">
                  <MobileReplitAgentIcon />
                  <h2>Agent</h2>
                </div>
                <button
                  type="button"
                  aria-label="Close agent options"
                  data-testid="mobile-agent-menu-close"
                  onClick={closeMobileOverlays}
                >
                  <span className="i-ph:x" aria-hidden />
                </button>
              </header>
              <div className="bolt-mobile-agent-menu-list">
                <button
                  type="button"
                  className="bolt-mobile-agent-menu-row--primary"
                  data-testid="mobile-agent-new-chat"
                  onClick={startMobileAgentChat}
                >
                  <span className="i-ph:chat-circle-text" aria-hidden />
                  <span>New chat</span>
                  <span className="i-ph:plus" aria-hidden />
                </button>
                <button type="button" data-testid="mobile-agent-history" onClick={openMobileAgentHistory}>
                  <span className="i-ph:clock-counter-clockwise" aria-hidden />
                  <span>History</span>
                  <span className="i-ph:caret-right" aria-hidden />
                </button>
                <button type="button" data-testid="mobile-agent-usage" onClick={openMobileAgentUsage}>
                  <span className="i-ph:gauge" aria-hidden />
                  <span>Usage &amp; monitoring</span>
                  <span className="i-ph:caret-right" aria-hidden />
                </button>
                <button type="button" data-testid="mobile-agent-settings" onClick={openMobileAgentSettings}>
                  <span className="i-ph:sliders-horizontal" aria-hidden />
                  <span>Agent settings</span>
                  <span className="i-ph:caret-right" aria-hidden />
                </button>
                <button type="button" data-testid="mobile-agent-copy" onClick={copyMobileAgentConversation}>
                  <span className="i-ph:copy" aria-hidden />
                  <span>Copy conversation</span>
                </button>
                <button type="button" data-testid="mobile-agent-export" onClick={exportMobileAgentConversation}>
                  <span className="i-ph:download-simple" aria-hidden />
                  <span>Export conversation</span>
                </button>
                <button type="button" data-testid="mobile-agent-theme" onClick={toggleMobileAgentTheme}>
                  <span className={theme === 'dark' ? 'i-ph:sun' : 'i-ph:moon'} aria-hidden />
                  <span>{theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}</span>
                </button>
                <button type="button" data-testid="mobile-agent-feedback" onClick={openMobileAgentFeedback}>
                  <span className="i-ph:megaphone" aria-hidden />
                  <span>Share feedback</span>
                  <span className="i-ph:arrow-square-out" aria-hidden />
                </button>
                <button
                  type="button"
                  className="bolt-mobile-agent-menu-row--danger"
                  data-testid="mobile-agent-close-view"
                  onClick={closeMobileAgentView}
                >
                  <span className="i-ph:x" aria-hidden />
                  <span>Close Agent view</span>
                </button>
              </div>
            </section>
          </>
        )}
        {showMobileChrome && mobileMoreMenuOpen && (
          <>
            <button
              type="button"
              className="bolt-mobile-more-menu-backdrop"
              aria-label="Close more menu"
              data-testid="mobile-more-menu-backdrop"
              onClick={closeMobileOverlays}
            />
            <section
              className="bolt-mobile-more-menu-sheet"
              role="dialog"
              aria-modal="true"
              aria-label="More IDE panels"
              data-testid="mobile-more-menu-sheet"
              onKeyDownCapture={handleMobileOverlayEscapeKey}
            >
              <div className="bolt-mobile-more-menu-handle" aria-hidden />
              <header className="bolt-mobile-more-menu-header">
                <h2>Panels</h2>
                <button
                  type="button"
                  aria-label="Close more menu"
                  data-testid="mobile-more-menu-close"
                  onClick={closeMobileOverlays}
                >
                  <span className="i-ph:x" aria-hidden />
                </button>
              </header>
              <div className="bolt-mobile-more-menu-grid">
                {mobileMoreMenuItems.map((item) => {
                  const isActive = activeMobileOpenTabId === item.id;

                  return (
                    <button
                      key={item.id}
                      type="button"
                      className="bolt-mobile-more-menu-item"
                      data-tone={item.tone}
                      data-testid={`mobile-more-menu-${item.id}`}
                      aria-current={isActive ? 'page' : undefined}
                      onClick={() => activateMobileTool(item.id)}
                    >
                      <span className="bolt-mobile-more-menu-icon" aria-hidden>
                        {item.icon === 'agent' ? <MobileReplitAgentIcon /> : <span className={item.icon} />}
                      </span>
                      <span>{item.title}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          </>
        )}
        {showMobileChrome && mobileTabSwitcherOpen && (
          <section
            className="bolt-mobile-tab-switcher"
            role="dialog"
            aria-modal="true"
            aria-label="Tab switcher"
            data-testid="mobile-tab-switcher"
            onKeyDownCapture={handleMobileOverlayEscapeKey}
            onClick={(event) => {
              /*
               * Full-screen switcher: tapping empty (non-interactive) space dismisses it,
               * matching the backdrop-tap behaviour of the other mobile sheets.
               */
              if (!(event.target as HTMLElement).closest('.bolt-mobile-tab-switcher-card, button, input, label')) {
                closeMobileOverlays();
              }
            }}
          >
            <div className="bolt-mobile-tab-switcher-body">
              <div className="bolt-mobile-tab-switcher-content">
                <div className="bolt-mobile-tab-switcher-grid">
                  {filteredMobileOpenTabs.map((tab) => (
                    <div
                      key={tab.id}
                      className="bolt-mobile-tab-switcher-card"
                      aria-current={activeMobileOpenTabId === tab.id ? 'page' : undefined}
                      data-testid={`tab-card-${tab.id}`}
                    >
                      <button
                        type="button"
                        className="bolt-mobile-tab-switcher-card-main"
                        aria-label={`Switch to ${tab.name} tab`}
                        onClick={() => activateMobileTool(tab.id)}
                      >
                        <span className="bolt-mobile-tab-switcher-card-icon" aria-hidden>
                          {tab.icon === 'agent' ? <MobileReplitAgentIcon /> : <span className={tab.icon} />}
                        </span>
                        <span>{tab.name}</span>
                      </button>
                      {!ECODE_MOBILE_DEFAULT_TABS.includes(tab.id as any) ? (
                        <button
                          type="button"
                          className="bolt-mobile-tab-switcher-close"
                          aria-label={`Close ${tab.name} tab`}
                          data-testid={`button-close-tab-${tab.id}`}
                          onClick={() => closeMobileOpenTab(tab.id)}
                        >
                          <span className="i-ph:x" aria-hidden />
                        </button>
                      ) : null}
                    </div>
                  ))}
                  {filteredMobileOpenTabs.length === 0 ? (
                    <div className="bolt-mobile-tab-switcher-empty" role="status">
                      No open tabs match your search.
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="bolt-mobile-tab-switcher-footer">
                <div className="bolt-mobile-tab-switcher-quick" role="group" aria-label="Quick access tools">
                  {['secrets', 'database', 'settings'].map((toolId) => {
                    const tool = ECODE_MOBILE_TAB_META[toolId];

                    return (
                      <button
                        key={toolId}
                        type="button"
                        aria-label={`Quick access: ${tool.name}`}
                        data-testid={`quick-access-${toolId}`}
                        onClick={() => activateMobileTool(toolId)}
                      >
                        <span className={tool.icon} aria-hidden />
                        <span>{tool.name}</span>
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    aria-label="Open new tab"
                    data-testid="button-new-tab"
                    onClick={openMobileToolsSheet}
                  >
                    <span className="i-ph:plus" aria-hidden />
                    <span>New Tab</span>
                  </button>
                </div>
                <div className="bolt-mobile-tab-switcher-search">
                  <label>
                    <span className="i-ph:files" aria-hidden />
                    <input
                      placeholder="Search tabs..."
                      aria-label="Search open tabs"
                      data-testid="input-search-tabs"
                      value={mobileTabSearchQuery}
                      onChange={(event) => setMobileTabSearchQuery(event.target.value)}
                    />
                  </label>
                  <button
                    type="button"
                    aria-label="Clear search"
                    data-testid="button-clear-search"
                    onClick={() => setMobileTabSearchQuery('')}
                  >
                    <span className={mobileTabSearchQuery ? 'i-ph:x' : 'i-ph:magnifying-glass'} aria-hidden />
                  </button>
                  <button
                    type="button"
                    aria-label="Close tab switcher"
                    data-testid="button-close-switcher"
                    onClick={closeMobileOverlays}
                  >
                    <span className="i-ph:x" aria-hidden />
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}
        {showMobileChrome && mobileToolsSheetOpen && (
          <>
            <button
              type="button"
              className="bolt-mobile-more-backdrop"
              aria-label="Close tools sheet"
              onClick={closeMobileToolsSheet}
            />
            <section
              className="bolt-mobile-more-sheet"
              role="dialog"
              aria-modal="true"
              aria-label="Search for tools and files"
              data-testid="tools-sheet"
              onKeyDownCapture={handleMobileOverlayEscapeKey}
            >
              <div className="bolt-mobile-more-handle" aria-hidden />
              <header className="bolt-mobile-more-header">
                <label className="bolt-mobile-more-search">
                  <span className="sr-only">Search for tools and files</span>
                  <input
                    aria-label="Search for tools and files"
                    type="search"
                    inputMode="search"
                    enterKeyHint="search"
                    value={mobileToolsQuery}
                    onChange={(event) => setMobileToolsQuery(event.target.value)}
                    placeholder="Search for tools and files"
                    autoComplete="off"
                    data-testid="tools-search-input"
                  />
                </label>
                <button
                  type="button"
                  className="bolt-mobile-more-close"
                  data-testid="tools-sheet-close"
                  onClick={closeMobileToolsSheet}
                >
                  Close
                </button>
              </header>
              <div className="bolt-mobile-more-scroll">
                {(['search', 'tools'] as const).map((section) => {
                  const items = filteredMobileToolsSheetItems.filter((item) => item.section === section);

                  if (!items.length) {
                    return null;
                  }

                  return (
                    <div key={section} className="bolt-mobile-more-group" data-section={section}>
                      <div className="bolt-mobile-more-section-label">{section === 'search' ? 'Search' : 'Tools'}</div>
                      <div className="bolt-mobile-more-list">
                        {items.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            className="bolt-mobile-more-item"
                            data-tone={'tone' in item ? item.tone : undefined}
                            aria-label={item.title}
                            aria-current={activeMobileOpenTabId === item.id ? 'page' : undefined}
                            data-testid={`tool-item-${item.id}`}
                            onClick={() => activateMobileTool(item.id)}
                          >
                            <span className="bolt-mobile-more-item-icon" aria-hidden>
                              {item.icon === 'agent' ? <MobileReplitAgentIcon /> : <span className={item.icon} />}
                            </span>
                            <span className="bolt-mobile-more-item-copy">
                              <span>{item.title}</span>
                              <small>{item.description}</small>
                            </span>
                            {section === 'search' ? (
                              <span className="bolt-mobile-more-item-chevron i-ph:caret-right" aria-hidden />
                            ) : null}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
              {filteredMobileToolsSheetItems.length === 0 && (
                <div className="bolt-mobile-more-empty">No tools found for "{mobileToolsQuery}".</div>
              )}
            </section>
          </>
        )}
        {projectIdeMode && (
          <footer
            className={classNames('bolt-project-statusbar', {
              'bolt-project-statusbar-mobile': useMobileIde,
            })}
            aria-label="IDE status"
          >
            <div className="bolt-project-statusbar-primary">
              <span
                className="bolt-project-statusbar-pill"
                role="status"
                aria-live="polite"
                title={
                  statusbarConnection.label === 'Offline'
                    ? 'Offline — edits stay local until the connection returns'
                    : statusbarConnection.label === 'Reconnecting'
                      ? 'Workspace runtime is starting or reconnecting'
                      : 'Workspace connection healthy'
                }
              >
                <span
                  aria-hidden
                  className={classNames(
                    'inline-block h-[7px] w-[7px] shrink-0 rounded-full',
                    statusbarConnection.label === 'Reconnecting' && 'animate-pulse',
                  )}
                  style={{ background: statusbarConnection.color }}
                />
                <span className="bolt-project-statusbar-label" style={{ color: statusbarConnection.text }}>
                  {statusbarConnection.label}
                </span>
              </span>
              <button
                type="button"
                className="bolt-project-statusbar-pill"
                aria-label={`Open Git panel. Branch ${projectBackendState.git?.branch ?? 'main'}, ${
                  projectBackendState.git?.ahead ?? 0
                } ahead, ${projectBackendState.git?.behind ?? 0} behind, ${statusbarChangedFiles} changed files.`}
                title={`Git branch: ${projectBackendState.git?.branch ?? 'main'} | Ahead ${
                  projectBackendState.git?.ahead ?? 0
                }, behind ${projectBackendState.git?.behind ?? 0} | ${statusbarChangedFiles} changed files`}
                onClick={() => openWorkspacePanel('git')}
              >
                <span className="i-ph:git-branch" aria-hidden />
                <span className="bolt-project-statusbar-label">Git</span>
                <strong>{projectBackendState.git?.branch ?? 'main'}</strong>
                {statusbarChangedFiles > 0 ? (
                  <span className="bolt-project-statusbar-count" aria-label={`${statusbarChangedFiles} changed files`}>
                    {statusbarChangedFiles}
                  </span>
                ) : null}
              </button>
              {/*
               * E24: the ahead/behind badge is its own control (a button cannot nest
               * inside the Git pill button) opening REAL Push / Pull actions.
               */}
              <Popover.Root>
                <Popover.Trigger asChild>
                  <button
                    type="button"
                    className="bolt-project-statusbar-pill bolt-project-statusbar-optional"
                    data-testid="statusbar-git-sync-badge"
                    aria-label={`${projectBackendState.git?.ahead ?? 0} commits to push, ${
                      projectBackendState.git?.behind ?? 0
                    } commits to pull. Open push and pull actions.`}
                    title={`${projectBackendState.git?.ahead ?? 0} to push, ${
                      projectBackendState.git?.behind ?? 0
                    } to pull — click for Push / Pull`}
                  >
                    <span className="bolt-project-statusbar-muted">
                      {projectBackendState.git?.ahead ?? 0}↑ {projectBackendState.git?.behind ?? 0}↓
                    </span>
                  </button>
                </Popover.Trigger>
                <Popover.Portal>
                  <Popover.Content
                    side="top"
                    align="start"
                    sideOffset={6}
                    data-testid="statusbar-git-sync-popover"
                    className="z-[10010] w-[min(240px,calc(100vw-24px))] rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-2 shadow-xl"
                  >
                    <div className="grid gap-2">
                      {(['push', 'pull'] as const).map((intent) => (
                        <Popover.Close asChild key={intent}>
                          <button
                            type="button"
                            data-testid={`statusbar-git-${intent}`}
                            disabled={
                              statusbarGitBusy ||
                              statusbarGitRemoteUrl === null ||
                              Boolean(projectBackendState.git?.detached)
                            }
                            className="inline-flex h-[32px] w-full items-center justify-center gap-1.5 rounded-[6px] border border-bolt-elements-borderColor text-[13px] font-medium text-bolt-elements-item-contentAccent hover:bg-bolt-elements-background-depth-3 disabled:opacity-60 disabled:text-bolt-elements-textSecondary"
                            onClick={() => void runStatusbarGitSync(intent)}
                          >
                            <span
                              className={intent === 'push' ? 'i-ph:arrow-up text-sm' : 'i-ph:arrow-down text-sm'}
                              aria-hidden
                            />
                            {intent === 'push'
                              ? `Push${(projectBackendState.git?.ahead ?? 0) > 0 ? ` ${projectBackendState.git?.ahead}` : ''}`
                              : `Pull${(projectBackendState.git?.behind ?? 0) > 0 ? ` ${projectBackendState.git?.behind}` : ''}`}
                          </button>
                        </Popover.Close>
                      ))}
                      {statusbarGitRemoteUrl === null ? (
                        <p className="px-1 text-xs leading-4 text-bolt-elements-textSecondary">
                          No remote configured — connect one in the Git panel settings first.
                        </p>
                      ) : projectBackendState.git?.detached ? (
                        <p className="px-1 text-xs leading-4 text-bolt-elements-textSecondary">
                          Detached HEAD — create a branch in the Git panel before syncing.
                        </p>
                      ) : null}
                    </div>
                  </Popover.Content>
                </Popover.Portal>
              </Popover.Root>
              <button
                type="button"
                className="bolt-project-statusbar-pill"
                aria-label={`Open Problems. ${statusbarDiagnostics.errors} ${statusbarDiagnostics.errors === 1 ? 'error' : 'errors'}, ${statusbarDiagnostics.warnings} ${statusbarDiagnostics.warnings === 1 ? 'warning' : 'warnings'}.`}
                title={`${statusbarDiagnostics.errors} ${statusbarDiagnostics.errors === 1 ? 'error' : 'errors'} · ${statusbarDiagnostics.warnings} ${statusbarDiagnostics.warnings === 1 ? 'warning' : 'warnings'}`}
                onClick={() => openBottomTerminal('problems')}
              >
                <span className="bolt-project-statusbar-label">Problems</span>
                <span
                  className="bolt-project-statusbar-error-count"
                  data-empty={statusbarDiagnostics.errors === 0 ? 'true' : undefined}
                  aria-label={`${statusbarDiagnostics.errors} ${statusbarDiagnostics.errors === 1 ? 'error' : 'errors'}`}
                >
                  <span className="i-ph:x-circle-fill" aria-hidden />
                  {statusbarDiagnostics.errors}
                </span>
                <span
                  className="bolt-project-statusbar-warning-count"
                  data-empty={statusbarDiagnostics.warnings === 0 ? 'true' : undefined}
                  aria-label={`${statusbarDiagnostics.warnings} ${statusbarDiagnostics.warnings === 1 ? 'warning' : 'warnings'}`}
                >
                  <span className="i-ph:warning-fill" aria-hidden />
                  {statusbarDiagnostics.warnings}
                </span>
              </button>
              <button
                type="button"
                className="bolt-project-statusbar-pill bolt-project-statusbar-workspace"
                onClick={() => openBottomTerminal('terminal')}
                title={workspaceStatusTitle}
                aria-label={workspaceStatusTitle || 'Open workspace terminal'}
              >
                <span
                  className="bolt-project-statusbar-runtime-dot"
                  data-state={workspaceError ? 'error' : workspaceLoading ? 'starting' : runtimeUiState}
                  aria-hidden
                />
                <span className="bolt-project-statusbar-label">Workspace</span>
                <strong>{workspaceStatusLabel}</strong>
                {workspaceError ? <span className="bolt-project-statusbar-error-count">!</span> : null}
                {quotaWarning || billingUpgradePrompt ? (
                  <span className="bolt-project-statusbar-warning-count">!</span>
                ) : null}
              </button>
              {workspaceLogs.length > 0 ? (
                <button
                  type="button"
                  className="bolt-project-statusbar-pill bolt-project-statusbar-logs bolt-project-statusbar-tier-secondary"
                  onClick={() => {
                    setBottomTerminalView('output');

                    if (useMobileIde) {
                      setMobileIdePanel('terminal');
                    } else {
                      setTerminalBottomOpen((value) => !value);
                    }
                  }}
                  title={
                    useMobileIde
                      ? 'Show workspace logs'
                      : terminalBottomOpen
                        ? 'Hide workspace logs'
                        : 'Show workspace logs'
                  }
                  aria-label={`${terminalBottomOpen ? 'Hide' : 'Show'} workspace logs. ${workspaceLogs.length} log lines.`}
                >
                  <span className="i-ph:list-magnifying-glass" aria-hidden />
                  <span className="bolt-project-statusbar-label">
                    {!useMobileIde && terminalBottomOpen ? 'Hide logs' : 'Logs'}
                  </span>
                  <span className="bolt-project-statusbar-count">{workspaceLogs.length}</span>
                </button>
              ) : null}
              <button
                type="button"
                className="bolt-project-statusbar-pill bolt-project-statusbar-runtime"
                aria-label={
                  workspaceError
                    ? 'Crashed runtime'
                    : workspaceLoading
                      ? 'Building runtime'
                      : isRuntimeReallyRunning
                        ? `Running on ${runtimePortSummary}`
                        : 'Stopped runtime'
                }
                onClick={() => {
                  if (useMobileIde) {
                    setMobileIdePanel('preview');

                    return;
                  }

                  openWorkspacePanel('preview');
                }}
                title={`Open preview | ${runtimeStatusSummary} | ${runtimePortSummary} | ${runtimeDevServerSummary}`}
              >
                <span className="i-ph:monitor-play" aria-hidden />
                <span className="bolt-project-statusbar-label">Preview</span>
                <span className="bolt-project-statusbar-muted">{runtimePortCompactSummary}</span>
                <span className="bolt-project-statusbar-muted bolt-project-statusbar-optional">
                  {runtimeDevServerSummary}
                </span>
              </button>
            </div>
            <div className="bolt-project-statusbar-secondary" aria-label="Editor status">
              {(() => {
                const cursorValue =
                  currentDocument?.filePath && cursorPositions[currentDocument.filePath]
                    ? `Ln ${cursorPositions[currentDocument.filePath].line}, Col ${
                        cursorPositions[currentDocument.filePath].column
                      }`
                    : 'Ln 1, Col 1';
                const editorItems: Array<{ key: string; tier: 1 | 2 | 3 | 4; title: string; value: string }> = [
                  { key: 'cursor', tier: 4, title: 'Current cursor position', value: cursorValue },
                  { key: 'indent', tier: 2, title: 'Indentation: 2 spaces', value: 'Spaces: 2' },
                  { key: 'encoding', tier: 1, title: 'File encoding: UTF-8', value: 'UTF-8' },
                  {
                    key: 'language',
                    tier: 3,
                    title: 'Detected language mode',
                    value: fileTypeLabel(currentDocument?.filePath),
                  },
                ];

                return (
                  <>
                    {editorItems.map((item) => (
                      <span
                        key={item.key}
                        className={classNames(
                          'bolt-project-statusbar-pill',
                          'bolt-project-statusbar-editor-pill',
                          `bolt-project-statusbar-editor-pill--tier-${item.tier}`,
                          item.key === 'cursor' && 'bolt-project-statusbar-editor',
                        )}
                        title={item.title}
                      >
                        {item.value}
                      </span>
                    ))}
                    <Popover.Root>
                      <Popover.Trigger asChild>
                        <button
                          type="button"
                          aria-label="Show editor status details"
                          title="More editor status"
                          className="bolt-project-statusbar-icon-button bolt-project-statusbar-overflow-trigger"
                        >
                          <span className="i-ph:dots-three" aria-hidden />
                        </button>
                      </Popover.Trigger>
                      <Popover.Portal>
                        <Popover.Content
                          side="top"
                          align="end"
                          sideOffset={6}
                          collisionPadding={12}
                          hideWhenDetached
                          className="bolt-project-statusbar-overflow-content"
                        >
                          <div className="bolt-project-statusbar-overflow-list" role="list">
                            {editorItems.map((item) => (
                              <div key={item.key} className="bolt-project-statusbar-overflow-row" role="listitem">
                                <span className="bolt-project-statusbar-overflow-label">{item.title}</span>
                                <span className="bolt-project-statusbar-overflow-value">{item.value}</span>
                              </div>
                            ))}
                          </div>
                        </Popover.Content>
                      </Popover.Portal>
                    </Popover.Root>
                  </>
                );
              })()}
              <button
                type="button"
                aria-label={`Toggle ${SHELL_TERMINAL_LABEL}`}
                title={`Toggle ${SHELL_TERMINAL_LABEL}`}
                className="bolt-project-statusbar-icon-button"
                onClick={() => {
                  setBottomTerminalView('terminal');
                  setTerminalBottomOpen((value) => !value);
                }}
              >
                <span className="i-ph:terminal-window" aria-hidden />
              </button>
              <button
                type="button"
                aria-label="Focus agent composer"
                title="Focus agent composer"
                className="bolt-project-statusbar-icon-button"
                onClick={() => textareaRef?.current?.focus()}
              >
                <span className="i-ph:sparkle" aria-hidden />
              </button>
            </div>
          </footer>
        )}
        {projectIdeMode && guidedTourOpen ? (
          <ProjectIdeGuidedTour
            step={PROJECT_IDE_TOUR_STEPS[guidedTourStepIndex]}
            stepIndex={guidedTourStepIndex}
            totalSteps={PROJECT_IDE_TOUR_STEPS.length}
            onBack={() => setGuidedTourStepIndex((current) => Math.max(0, current - 1))}
            onNext={() => {
              if (guidedTourStepIndex >= PROJECT_IDE_TOUR_STEPS.length - 1) {
                closeGuidedTour();

                return;
              }

              setGuidedTourStepIndex((current) => Math.min(PROJECT_IDE_TOUR_STEPS.length - 1, current + 1));
            }}
            onSkip={closeGuidedTour}
          />
        ) : null}
        {rollbackTarget && (
          <div
            className="bolt-project-rollback-overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby="rollback-title"
          >
            <div className="bolt-project-rollback-dialog">
              <div className="bolt-project-rollback-body">
                <h2 id="rollback-title">Rollback to checkpoint</h2>
                {/*
                 * No per-checkpoint screenshot is captured or stored, so a static
                 * 'Screenshot — Preview expired' placeholder would misrepresent the
                 * state being reverted to in this destructive confirmation. Only
                 * truthful checkpoint metadata is shown below.
                 */}
                <section>
                  <span className="bolt-project-rollback-label">Target checkpoint</span>
                  <h3>{rollbackTarget.title}</h3>
                  <p>{rollbackTarget.description}</p>
                  <small>
                    {rollbackTarget.ageLabel}
                    {rollbackTarget.commitSha ? ` • ${rollbackTarget.commitSha}` : ''}
                  </small>
                </section>
                <section>
                  <span className="bolt-project-rollback-label">What will be impacted</span>
                  <div className="bolt-project-rollback-impact">
                    <strong>Files</strong>
                    {rollbackTarget.snapshot?.id ? (
                      <p>
                        All files in your app will be restored to the state they were in at the time of this checkpoint.
                      </p>
                    ) : (
                      <p>
                        No file snapshot is available for this checkpoint, so your files will be left untouched. Only
                        the Agent's memory will be reset.
                      </p>
                    )}
                    <strong>Agent memory</strong>
                    <p>The Agent's memory will reset to what it knew about your app at the time of this checkpoint.</p>
                    <strong>Tasks</strong>
                    <p>All in-progress tasks will finish but will require review</p>
                  </div>
                </section>
                <section>
                  <span className="bolt-project-rollback-label">Additional rollback options</span>
                  <label className="bolt-project-rollback-option">
                    <input
                      type="checkbox"
                      checked={rollbackDatabase}
                      onChange={(event) => setRollbackDatabase(event.currentTarget.checked)}
                    />
                    <span>
                      <strong>Database</strong>
                      <small>
                        Your development database will be restored to the time of this checkpoint. This will not affect
                        your production database.
                      </small>
                    </span>
                  </label>
                </section>
              </div>
              <footer>
                <button type="button" onClick={() => setRollbackTarget(null)} disabled={rollbackBusy}>
                  Cancel
                </button>
                <button type="button" onClick={confirmProjectRollback} disabled={rollbackBusy}>
                  {rollbackBusy ? 'Rolling back...' : 'Rollback to this checkpoint'}
                </button>
              </footer>
            </div>
          </div>
        )}
      </div>
    );

    return <Tooltip.Provider delayDuration={500}>{baseChat}</Tooltip.Provider>;
  },
);

function ProjectIdeGuidedTour({
  step,
  stepIndex,
  totalSteps,
  onBack,
  onNext,
  onSkip,
}: {
  step: (typeof PROJECT_IDE_TOUR_STEPS)[number];
  stepIndex: number;
  totalSteps: number;
  onBack: () => void;
  onNext: () => void;
  onSkip: () => void;
}) {
  return (
    <div className="bolt-project-guided-tour" role="dialog" aria-modal="false" aria-labelledby="ide-tour-title">
      <div className="bolt-project-guided-tour-card">
        <div className="bolt-project-guided-tour-kicker">
          Guided tour
          <span>
            {stepIndex + 1}/{totalSteps}
          </span>
        </div>
        <h2 id="ide-tour-title">{step.title}</h2>
        <p>{step.description}</p>
        {'shortcut' in step && step.shortcut ? (
          <div className="bolt-project-guided-tour-shortcut">
            <span>Shortcut</span>
            <kbd>{step.shortcut}</kbd>
          </div>
        ) : null}
        <div className="bolt-project-guided-tour-progress" aria-hidden>
          {Array.from({ length: totalSteps }).map((_, index) => (
            <span key={index} data-active={index <= stepIndex ? 'true' : undefined} />
          ))}
        </div>
        <footer>
          <button type="button" onClick={onSkip}>
            Skip tour
          </button>
          <div>
            <button type="button" onClick={onBack} disabled={stepIndex === 0}>
              Back
            </button>
            <button type="button" onClick={onNext}>
              {stepIndex === totalSteps - 1 ? 'Finish' : 'Next'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

const PROJECT_PANEL_FETCH_MAX_ATTEMPTS = 3;
const PROJECT_PANEL_FETCH_BASE_RETRY_MS = 650;

/*
 * How long the initial panel fetch may run before we surface a manual Retry
 * affordance under the loading skeleton. Below this the panel shows only a
 * discreet skeleton (no "Retry", which reads as broken); a normal fetch — even
 * with the retry/backoff above — resolves well under this budget, so Retry only
 * appears when the load is genuinely stuck (e.g. the workspace is still booting).
 */
const PROJECT_PANEL_SLOW_LOAD_MS = 7000;

/*
 * In-memory cache of the last successful payload per `${projectId}:${panel}`.
 * Panels are keyed by panel name in the workbench, so switching tabs unmounts
 * and remounts ProjectIdeServicePanel — without this, returning to a tab would
 * re-flash the loading skeleton every time. Seeding from this cache lets a
 * revisited tab render its previous content immediately while it refreshes
 * silently in the background. Bounded so it can't grow without limit.
 */
const PROJECT_PANEL_CACHE_MAX = 60;
const projectPanelPayloadCache = new Map<string, { payload: any; lastLoadedAt: string }>();

function readProjectPanelCache(key: string | undefined) {
  return key ? projectPanelPayloadCache.get(key) : undefined;
}

function writeProjectPanelCache(key: string | undefined, entry: { payload: any; lastLoadedAt: string }) {
  if (!key) {
    return;
  }

  // Refresh insertion order (Map preserves it) so the oldest key evicts first.
  projectPanelPayloadCache.delete(key);
  projectPanelPayloadCache.set(key, entry);

  while (projectPanelPayloadCache.size > PROJECT_PANEL_CACHE_MAX) {
    const oldest = projectPanelPayloadCache.keys().next().value;

    if (oldest === undefined) {
      break;
    }

    projectPanelPayloadCache.delete(oldest);
  }
}

function projectPanelFetchMethod(init?: RequestInit) {
  return (init?.method ?? 'GET').toUpperCase();
}

function projectPanelFetchRetryDelay(response: Response | undefined, attempt: number) {
  const retryAfter = response?.headers.get('retry-after');
  const retryAfterMs = retryAfter ? Number(retryAfter) * 1000 : Number.NaN;
  const fallbackMs = PROJECT_PANEL_FETCH_BASE_RETRY_MS * 2 ** attempt;

  return Math.min(5000, Math.max(500, Number.isFinite(retryAfterMs) ? retryAfterMs : fallbackMs));
}

function shouldRetryProjectPanelFetch(response: Response, method: string, attempt: number) {
  if (attempt >= PROJECT_PANEL_FETCH_MAX_ATTEMPTS - 1) {
    return false;
  }

  if (response.status === 429) {
    return true;
  }

  const isIdempotentRead = method === 'GET' || method === 'HEAD';

  return isIdempotentRead && (response.status === 408 || response.status >= 500);
}

function shouldRetryProjectPanelNetworkError(method: string, attempt: number) {
  if (attempt >= PROJECT_PANEL_FETCH_MAX_ATTEMPTS - 1) {
    return false;
  }

  return method === 'GET' || method === 'HEAD';
}

function ProjectIdeServicePanel({
  projectId,
  panel,
  displayTitle,
  displayIcon,
  initialPayload,
}: {
  projectId?: string;
  panel: string;
  displayTitle?: string;
  displayIcon?: string;
  initialPayload?: any;
}) {
  /*
   * Seed from SSR payload first, else the in-memory cache from a previous visit
   * to this tab (avoids a re-flash of the loading skeleton on tab switch).
   */
  const panelCacheKey = projectId ? `${projectId}:${panel}` : undefined;
  const seededCache = readProjectPanelCache(panelCacheKey);
  const [payload, setPayload] = useState<any>(() => initialPayload ?? seededCache?.payload);
  const [error, setError] = useState<string>();
  const [actionNotice, setActionNotice] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [slowLoad, setSlowLoad] = useState(false);
  const [panelActionsOpen, setPanelActionsOpen] = useState(false);

  // One-time share link returned by the share-link action; the raw token is never re-listed afterwards.
  const [createdShareLink, setCreatedShareLink] = useState<string | undefined>();
  const [refreshLabelNow, setRefreshLabelNow] = useState(() => new Date());
  const loadingPanelRef = useRef(false);
  const panelActionsRef = useRef<HTMLDivElement | null>(null);

  const [lastLoadedAt, setLastLoadedAt] = useState<string | undefined>(() =>
    initialPayload ? new Date().toISOString() : seededCache?.lastLoadedAt,
  );

  const selectedFile = useStore(workbenchStore.selectedFile);

  const collaborationRealtime = useProjectCollaboration({
    projectId,
    enabled: panel === 'collaborators' && Boolean(projectId),
    filePath: selectedFile,
    mode: 'editing',
  });

  const title = displayTitle ?? panelTitle(panel);
  const icon = displayIcon ?? panelIcon(panel);
  const refreshIntervalMs = projectPanelRefreshIntervalMs(panel);

  const rendersEmptyStateActions =
    panel === 'deployments' ||
    panel === 'env' ||
    panel === 'secrets' ||
    panel === 'snapshots' ||
    panel === 'domains' ||
    panel === 'integrations' ||
    panel === 'workflows';

  const fetchPanel = useCallback(async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = projectPanelFetchMethod(init);

    let lastNetworkError: unknown;

    for (let attempt = 0; attempt < PROJECT_PANEL_FETCH_MAX_ATTEMPTS; attempt += 1) {
      try {
        const response = await fetch(input, init);

        if (!shouldRetryProjectPanelFetch(response, method, attempt)) {
          return response;
        }

        await new Promise((resolve) => window.setTimeout(resolve, projectPanelFetchRetryDelay(response, attempt)));
      } catch (error) {
        lastNetworkError = error;

        if (!shouldRetryProjectPanelNetworkError(method, attempt)) {
          throw error;
        }

        await new Promise((resolve) => window.setTimeout(resolve, projectPanelFetchRetryDelay(undefined, attempt)));
      }
    }

    throw lastNetworkError instanceof Error ? lastNetworkError : new Error('Unable to reach IDE panel API');
  }, []);

  const loadPanel = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!projectId) {
        return;
      }

      if (loadingPanelRef.current) {
        return;
      }

      loadingPanelRef.current = true;

      if (!options?.silent) {
        setBusy(true);
      }

      setError(undefined);

      try {
        const response = await fetchPanel(`/api/projects/${projectId}/ide-panel/${panel}`, {
          headers: { accept: 'application/json' },
        });
        const result = (await response.json()) as {
          error?: { code: string; message: string; retryable: boolean } | string;
          status?: 'ok' | 'empty' | 'error';
        };

        const errorCode = typeof result.error === 'object' ? result.error?.code : undefined;

        /*
         * A mid-session 401 / PANEL_AUTH means the cookie expired while the SPA is
         * mounted. The API doesn't redirect /api/* requests, so without this the
         * panel renders a dead-end Retry that re-issues the same unauthenticated
         * request forever. Bounce to login with a returnTo instead.
         */
        if (isPanelAuthError(response.status, errorCode)) {
          if (typeof window !== 'undefined') {
            window.location.assign(panelAuthRedirectTarget(window.location.href));
          }

          return;
        }

        if (!response.ok) {
          const message = typeof result.error === 'string' ? result.error : result.error?.message;
          throw new Error(message ?? 'Unable to load IDE panel');
        }

        if (result.status === 'error' && typeof result.error === 'object' && result.error) {
          setError(`[${result.error.code}] ${result.error.message}`);
        }

        const loadedAt = new Date().toISOString();
        setPayload(result);
        setLastLoadedAt(loadedAt);

        // Cache the fresh payload so a later revisit to this tab renders instantly.
        if (projectId) {
          writeProjectPanelCache(`${projectId}:${panel}`, { payload: result, lastLoadedAt: loadedAt });
        }
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : 'Unable to load IDE panel');

        if (!options?.silent) {
          setPayload(undefined);
        }
      } finally {
        loadingPanelRef.current = false;

        if (!options?.silent) {
          setBusy(false);
        }
      }
    },
    [fetchPanel, panel, projectId],
  );

  useEffect(() => {
    /*
     * Silent (no skeleton) whenever we already have content to show — an SSR
     * payload or a cached payload from a previous visit to this tab — so the
     * refresh happens in the background instead of re-flashing the loader.
     */
    const seeded =
      Boolean(initialPayload) ||
      Boolean(readProjectPanelCache(projectId ? `${projectId}:${panel}` : undefined)?.payload);

    if (initialPayload) {
      setPayload(initialPayload);
      setLastLoadedAt(new Date().toISOString());
    }

    void loadPanel({ silent: seeded });
  }, [initialPayload, loadPanel, panel, projectId]);

  /*
   * Only surface a manual Retry once the initial load has been stuck past
   * PROJECT_PANEL_SLOW_LOAD_MS. During a normal (fast) load the skeleton shows
   * alone — a Retry button that appears instantly reads as "broken".
   */
  useEffect(() => {
    if (!busy || payload) {
      setSlowLoad(false);
      return undefined;
    }

    const timer = window.setTimeout(() => setSlowLoad(true), PROJECT_PANEL_SLOW_LOAD_MS);

    return () => window.clearTimeout(timer);
  }, [busy, payload]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void loadPanel({ silent: true });
    }, refreshIntervalMs);

    return () => window.clearInterval(interval);
  }, [loadPanel, refreshIntervalMs]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setRefreshLabelNow(new Date());
    }, 15_000);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!panelActionsOpen) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setPanelActionsOpen(false);
      }
    };

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;

      if (target && panelActionsRef.current?.contains(target)) {
        return;
      }

      setPanelActionsOpen(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('pointerdown', handlePointerDown, true);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('pointerdown', handlePointerDown, true);
    };
  }, [panelActionsOpen]);

  useEffect(() => {
    if (panel !== 'collaborators' || !collaborationRealtime.snapshot) {
      return;
    }

    setPayload((current: any) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        data: {
          ...(current.data ?? {}),
          presence: dedupeCollaborationPresence(
            collaborationRealtime.snapshot?.presence ?? current.data?.presence ?? [],
          ),
          comments: collaborationRealtime.snapshot?.comments ?? current.data?.comments ?? [],
          realtime: {
            status: collaborationRealtime.snapshot?.status,
            error: collaborationRealtime.snapshot?.error,
            lastEvent: collaborationRealtime.snapshot?.lastEvent,
          },
        },
      };
    });
  }, [collaborationRealtime.snapshot, panel]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const form = event.currentTarget;

    if (!projectId) {
      return;
    }

    setBusy(true);
    setError(undefined);
    setActionNotice('Submitting action...');

    const formData = new FormData(form);
    const intent = String(formData.get('intent') ?? 'default');

    try {
      const response = await fetchPanel(`/api/projects/${projectId}/ide-panel/${panel}`, {
        method: 'POST',
        body: formData,
      });

      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
        shareLink?: { url?: string };
      };

      if (!response.ok) {
        throw new Error(result.error ?? 'Panel action failed');
      }

      if (result.shareLink?.url) {
        setCreatedShareLink(result.shareLink.url);
        setActionNotice('Share link created.');
        void navigator.clipboard?.writeText(result.shareLink.url).catch(() => {
          // Clipboard may be blocked; the URL is still shown for manual copy.
        });
      } else {
        setActionNotice(formatProjectPanelActionNotice(panel, intent));
      }

      if (shouldResetIdePanelFormAfterSubmit(panel, intent)) {
        form.reset();
      }

      window.dispatchEvent(new CustomEvent('vibecore:ide-panel-action', { detail: { panel, intent, ok: true } }));
      void loadPanel({ silent: true });
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : 'Panel action failed';

      setError(message);
      setActionNotice(undefined);
      window.dispatchEvent(
        new CustomEvent('vibecore:ide-panel-action', { detail: { panel, intent, ok: false, error: message } }),
      );
    } finally {
      setBusy(false);
    }
  }

  const data = payload?.data ?? {};
  const project = payload?.project ?? {};
  const updatedLabel = formatProjectPanelUpdatedLabel(lastLoadedAt, refreshLabelNow);

  const updatedTitle = lastLoadedAt
    ? `Last updated ${new Date(lastLoadedAt).toLocaleString()}`
    : 'Auto-refresh pending';

  const refreshCadenceLabel = formatProjectPanelRefreshCadence(refreshIntervalMs);

  return (
    <div className="bolt-project-service-panel" data-testid="ide-service-panel" data-panel={panel}>
      <div className="bolt-project-ide-panel-header">
        <span className={icon} aria-hidden />
        <h2 className="m-0 min-w-0 truncate text-sm font-semibold">{title}</h2>
        <div className="relative ml-auto flex min-w-0 items-center gap-2" ref={panelActionsRef}>
          <span
            className="hidden max-w-[190px] items-center gap-1.5 truncate rounded border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-2 py-0.5 text-[11px] text-bolt-elements-textTertiary sm:inline-flex"
            data-testid="ide-panel-updated-at"
            title={updatedTitle}
            aria-live="polite"
          >
            <span className={busy ? 'i-ph:spinner-gap animate-spin' : 'i-ph:clock'} aria-hidden />
            <span className="truncate">{updatedLabel}</span>
          </span>
          <button
            type="button"
            className="inline-flex h-7 w-7 items-center justify-center rounded border border-bolt-elements-borderColor text-bolt-elements-textTertiary hover:bg-bolt-elements-background-depth-2 hover:text-bolt-elements-textPrimary disabled:cursor-not-allowed disabled:opacity-60"
            aria-label={`${title} panel actions`}
            aria-haspopup="menu"
            aria-expanded={panelActionsOpen}
            data-testid="ide-panel-actions"
            onClick={() => setPanelActionsOpen((value) => !value)}
            disabled={busy && !payload}
          >
            <span className="i-ph:dots-three-vertical-bold" aria-hidden />
          </button>
          {panelActionsOpen ? (
            <div
              className="bolt-project-panel-actions-menu absolute right-0 top-[calc(100%+6px)] z-20 w-[192px] max-w-[calc(100vw-1.5rem)] rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-1 text-[12px] text-bolt-elements-textPrimary shadow-lg"
              role="menu"
              aria-label={`${title} panel actions`}
            >
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-bolt-elements-background-depth-3 disabled:cursor-not-allowed disabled:opacity-60"
                role="menuitem"
                onClick={() => {
                  setPanelActionsOpen(false);
                  void loadPanel();
                }}
                disabled={busy}
              >
                <span className="i-ph:arrow-clockwise" aria-hidden />
                Refresh now
              </button>
              <div className="flex items-center gap-2 px-2 py-1.5 text-bolt-elements-textTertiary" role="presentation">
                <span className="i-ph:clock" aria-hidden />
                Auto-refresh every {refreshCadenceLabel}
              </div>
            </div>
          ) : null}
        </div>
      </div>
      {/*
       * pb-20: the service panel and the bottom terminal are flex siblings. When a
       * tall panel (e.g. Settings) is open in a short viewport, its scroller is
       * cramped and the action footer (Save) could scroll flush against the
       * terminal's top edge — a click there was intercepted by the terminal. The
       * extra bottom padding keeps the last controls clear of that boundary so
       * Save is always cleanly clickable.
       */}
      <div className="min-h-0 flex-1 overflow-auto p-4 pb-20">
        {error ? (
          <div
            className="mb-4 flex items-start gap-3 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-[var(--status-error-text)]"
            role="alert"
          >
            <span className="flex-1">{error}</span>
            <button
              type="button"
              className="rounded border border-red-500/40 px-2 py-0.5 text-[11px] hover:bg-red-500/20"
              onClick={() => void loadPanel()}
              disabled={busy}
            >
              Retry
            </button>
          </div>
        ) : null}
        {!error && actionNotice ? (
          <div
            className="mb-4 flex items-center gap-2 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-2 text-sm text-bolt-elements-textSecondary"
            role="status"
            aria-live="polite"
          >
            <span className={busy ? 'i-ph:spinner-gap animate-spin' : 'i-ph:check-circle'} aria-hidden />
            <span>{actionNotice}</span>
          </div>
        ) : null}
        {createdShareLink ? (
          <div
            className="mb-4 grid gap-2 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-2 text-sm"
            role="status"
          >
            <span className="font-medium text-bolt-elements-textPrimary">
              Share link created — copied to clipboard. It is shown only once:
            </span>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={createdShareLink}
                onFocus={(event) => event.currentTarget.select()}
                className="min-w-0 flex-1 select-all rounded border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-2 py-1 font-mono text-[12px] text-bolt-elements-textPrimary"
                aria-label="Share link URL"
              />
              <button
                type="button"
                className="rounded border border-bolt-elements-borderColor px-2 py-1 text-[12px] hover:bg-bolt-elements-background-depth-3"
                onClick={() => void navigator.clipboard?.writeText(createdShareLink).catch(() => undefined)}
              >
                Copy
              </button>
              <button
                type="button"
                className="rounded border border-bolt-elements-borderColor px-2 py-1 text-[12px] hover:bg-bolt-elements-background-depth-3"
                onClick={() => setCreatedShareLink(undefined)}
                aria-label="Dismiss share link"
              >
                Dismiss
              </button>
            </div>
          </div>
        ) : null}
        {busy && !payload ? (
          <div className="flex flex-col gap-3">
            {/* Discreet skeleton while the first fetch is in flight — no raw
                "from backend" text and no immediate Retry (which reads as broken). */}
            <PanelLoading title={`Loading ${title.toLowerCase()}…`} />
            {/*
             * Retry only appears once the load is genuinely stuck (past the slow
             * threshold) — e.g. the workspace is still starting, or the panel has
             * no data yet. During a normal fast load the skeleton shows alone.
             */}
            {slowLoad ? (
              <div
                className="flex flex-col items-center gap-2 text-center text-xs text-bolt-elements-textSecondary"
                role="status"
              >
                <span>This is taking longer than usual — the workspace may still be starting.</span>
                <button
                  type="button"
                  className="rounded border border-bolt-elements-borderColor px-2 py-1 text-[12px] text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3"
                  onClick={() => void loadPanel()}
                >
                  Retry
                </button>
              </div>
            ) : null}
          </div>
        ) : payload?.status === 'empty' && !error && !rendersEmptyStateActions ? (
          <div className="rounded-lg border border-dashed border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-6 text-center text-sm text-bolt-elements-textSecondary">
            <div className="mb-1 font-medium text-bolt-elements-textPrimary">No {title.toLowerCase()} yet</div>
            <div className="text-[12px]">Once your workspace produces data, it will appear here automatically.</div>
          </div>
        ) : (
          <PanelErrorBoundary
            panel={title}
            boundaryId={`project:${projectId ?? 'unknown'}:service:${panel}`}
            projectId={projectId}
            getSnapshot={() => ({
              panel,
              status: payload?.status,
              busy,
              lastLoadedAt,
            })}
          >
            <ProjectIdePanelContent
              panel={panel}
              data={data}
              project={project}
              projectId={projectId}
              onSubmit={submit}
              busy={busy}
              reload={loadPanel}
              lastLoadedAt={lastLoadedAt}
            />
          </PanelErrorBoundary>
        )}
      </div>
    </div>
  );
}

/*
 * Wrap a panel form submit with a confirmation dialog for irreversible deletes.
 * These forms otherwise delete on a single click with no undo, which is an easy
 * data-loss footgun. This is the single confirm-gated-submit entry point for the
 * project IDE panels (design handoff G5: token-styled dialog, not window.confirm):
 * the form's own submit is intercepted, and the stored form is replayed into the
 * panel's submit handler only after the user confirms.
 */
function ConfirmSubmitForm({
  onSubmit,
  title,
  description,
  confirmLabel,
  children,
  ...formProps
}: Omit<React.FormHTMLAttributes<HTMLFormElement>, 'onSubmit' | 'title'> & {
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  title: string;
  description: string;
  confirmLabel: string;
}) {
  const [pendingForm, setPendingForm] = useState<HTMLFormElement | null>(null);

  return (
    <>
      <form
        {...formProps}
        onSubmit={(event) => {
          event.preventDefault();
          setPendingForm(event.currentTarget);
        }}
      >
        {children}
      </form>
      <ConfirmationDialog
        isOpen={pendingForm !== null}
        onClose={() => setPendingForm(null)}
        onConfirm={() => {
          const form = pendingForm;
          setPendingForm(null);

          if (form) {
            onSubmit({
              preventDefault: () => undefined,
              currentTarget: form,
            } as unknown as React.FormEvent<HTMLFormElement>);
          }
        }}
        title={title}
        description={description}
        confirmLabel={confirmLabel}
        variant="destructive"
      />
    </>
  );
}

function shouldResetIdePanelFormAfterSubmit(panel: string, intent: string) {
  if (panel !== 'settings') {
    return true;
  }

  return intent === 'change-password' || intent === 'save-ai-key' || intent === 'delete-account';
}

function formatProjectPanelActionNotice(panel: string, intent: string) {
  const normalizedIntent = intent === 'default' ? 'settings' : intent;
  const action = normalizedIntent.replace(/-/g, ' ');
  const label = panelTitle(panel).toLowerCase();

  if (normalizedIntent.startsWith('delete') || normalizedIntent.startsWith('revoke')) {
    return `${action} submitted for ${label}.`;
  }

  if (normalizedIntent.startsWith('run') || normalizedIntent.startsWith('start')) {
    return `${action} started.`;
  }

  if (normalizedIntent.startsWith('stop') || normalizedIntent === 'cancel') {
    return `${action} requested.`;
  }

  return `${action} saved for ${label}.`;
}

function ProjectBottomTerminal({
  projectId,
  active,
  runtimeWorkspace,
  initialIdePanels,
  onActiveChange,
  onClose,
}: {
  projectId?: string;
  active: ProjectBottomTerminalView;
  runtimeWorkspace?: ProjectIdeBackendState['workspace'];
  initialIdePanels?: Record<string, any>;
  onActiveChange: (view: ProjectBottomTerminalView) => void;
  onClose: () => void;
}) {
  const workspaceStatus = useStore(workbenchStore.workspaceStatus);
  const runtimePreviews = useStore(workbenchStore.previews);
  const diagnosticErrorCount = useDiagnosticsStore((state) => state.errors);
  const diagnosticWarningCount = useDiagnosticsStore((state) => state.warnings);
  const effectiveWorkspace = runtimeWorkspace ?? workspaceStatus ?? null;
  const backendSessionId = effectiveWorkspace?.id ?? projectId ?? 'no-workspace';
  const runtimeUiState = workspaceUiState(effectiveWorkspace, { ports: runtimePreviews });

  const workspaceLabel = effectiveWorkspace
    ? `${runtimeUiState === 'running' ? 'running' : runtimeUiState === 'starting' ? 'starting' : (effectiveWorkspace.status ?? 'unknown')} workspace`
    : 'No backend workspace';

  const terminalTabs = [
    ['terminal', SHELL_TERMINAL_LABEL, 'i-ph:terminal-window'],
    ['output', 'Output', 'i-ph:list-bullets'],
    ['problems', 'Problems', 'i-ph:warning-circle'],
    ['debug', 'Debug Console', 'i-ph:bug'],
  ] as const;

  return (
    <section className="bolt-project-bottom-terminal" aria-label="Pinned terminal">
      <div className="bolt-project-bottom-terminal-tabs">
        <div className="bolt-project-bottom-terminal-tabs-left" aria-label="Pinned terminal views">
          {terminalTabs.map(([id, label, icon]) => (
            <button
              key={id}
              type="button"
              aria-current={active === id ? 'page' : undefined}
              aria-label={
                id === 'problems'
                  ? `Open Problems. ${diagnosticErrorCount} errors and ${diagnosticWarningCount} warnings.`
                  : undefined
              }
              onClick={() => onActiveChange(id)}
            >
              <span className={icon} aria-hidden />
              {label}
              {id === 'problems' && diagnosticErrorCount + diagnosticWarningCount > 0 ? (
                <span
                  className="bolt-project-bottom-terminal-problems-badges"
                  aria-hidden="true"
                  title={`${diagnosticErrorCount} errors, ${diagnosticWarningCount} warnings`}
                >
                  <span className="bolt-project-bottom-terminal-problem-badge" data-severity="error">
                    <span className="i-ph:x-circle-fill" aria-hidden />
                    {diagnosticErrorCount}
                  </span>
                  <span className="bolt-project-bottom-terminal-problem-badge" data-severity="warning">
                    <span className="i-ph:warning-fill" aria-hidden />
                    {diagnosticWarningCount}
                  </span>
                </span>
              ) : null}
            </button>
          ))}
        </div>
        <div className="bolt-project-bottom-terminal-meta">
          <span
            className="bolt-project-bottom-terminal-status"
            data-state={effectiveWorkspace ? runtimeUiState : 'offline'}
          >
            <span aria-hidden />
            {workspaceLabel}
          </span>
          <span className="bolt-project-bottom-terminal-session" title={backendSessionId}>
            Session {backendSessionId === 'no-workspace' ? 'pending' : backendSessionId.slice(0, 8)}
          </span>
          <button
            type="button"
            aria-label="Refresh runtime logs"
            onClick={() => {
              onActiveChange('terminal');
              void workbenchStore.refreshRuntimePorts().catch(() => undefined);
            }}
          >
            <span className="i-ph:arrow-clockwise" aria-hidden />
          </button>
          <button type="button" aria-label="Close terminal panel" onClick={onClose}>
            <span className="i-ph:x" aria-hidden />
          </button>
        </div>
      </div>
      <div className="bolt-project-bottom-terminal-content">
        {active === 'terminal' ? (
          <ClientOnly fallback={<TerminalTabsFallback />}>
            {() => (
              <PanelBoundary title={SHELL_TERMINAL_LABEL}>
                <Suspense fallback={<TerminalTabsFallback />}>
                  <PanelGroup direction="vertical" className="h-full">
                    <LazyTerminalTabs panelDefaultSize={100} />
                  </PanelGroup>
                </Suspense>
              </PanelBoundary>
            )}
          </ClientOnly>
        ) : active === 'output' ? (
          <ProjectIdeServicePanel
            key={`${projectId ?? 'project'}:bottom:logs`}
            projectId={projectId}
            panel="logs"
            initialPayload={initialIdePanels?.logs}
          />
        ) : active === 'problems' ? (
          <ProjectProblemsPanel />
        ) : (
          <ProjectIdeServicePanel
            key={`${projectId ?? 'project'}:bottom:debugger`}
            projectId={projectId}
            panel="debugger"
            initialPayload={initialIdePanels?.debugger}
          />
        )}
      </div>
    </section>
  );
}

function TerminalTabsFallback() {
  return (
    <div className="h-full">
      <div className="bolt-terminal-tabs-shell bg-bolt-elements-terminals-background flex h-full flex-col">
        <div className="bolt-terminal-tabs-bar" data-testid="terminal-tabs-bar" aria-busy="true">
          <div className="bolt-terminal-session-switcher" aria-label="Shell sessions">
            <button type="button" className="bolt-terminal-session-button" aria-label="Shell session loading" disabled>
              <span className="i-ph:caret-down" aria-hidden />
              <span className="bolt-terminal-session-label">~/workspace: bash</span>
            </button>
          </div>
          <div className="bolt-terminal-primary-actions" aria-label="Shell actions">
            <button type="button" className="bolt-terminal-icon-button" aria-label="Find in Shell" disabled>
              <span className="i-ph:magnifying-glass" aria-hidden />
            </button>
            <button type="button" className="bolt-terminal-icon-button" aria-label="Clear conversation" disabled>
              <span className="i-ph:trash" aria-hidden />
            </button>
            <div className="bolt-terminal-more">
              <button type="button" className="bolt-terminal-more-button" aria-label="More Shell actions" disabled>
                <span className="i-ph:dots-three-vertical-bold" aria-hidden />
              </button>
            </div>
            <button type="button" className="bolt-terminal-icon-button" aria-label="Close tab" disabled>
              <span className="i-ph:x" aria-hidden />
            </button>
          </div>
        </div>
        <div className="bolt-terminal-content-frame">
          <div className="bolt-terminal-viewports">
            <div className="grid h-full place-items-center text-sm text-bolt-elements-textSecondary" role="status">
              Loading terminal...
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const PROBLEM_LOCATION_PATTERN = /((?:\/|\.{0,2}\/)?[\w@][\w@./-]*\.[a-z]{2,6}):(\d+)(?::\d+)?/i;

/*
 * Runtime diagnostics are parsed log lines with no structured file/line field,
 * so recover a `path.ext:line` mention from the text when one exists. Entries
 * without a parseable location stay plain rows.
 */
function extractProblemLocation(diagnostic: Diagnostic): { path: string; line: number } | null {
  const match = PROBLEM_LOCATION_PATTERN.exec(`${diagnostic.message}\n${diagnostic.detail ?? ''}`);

  return match ? { path: match[1], line: Number.parseInt(match[2], 10) } : null;
}

function resolveProblemWorkbenchPath(filePath: string): string | undefined {
  const files = workbenchStore.files.get();

  if (files[filePath]?.type === 'file') {
    return filePath;
  }

  const absolutePath = filePath.startsWith(WORK_DIR) ? filePath : `${WORK_DIR}/${filePath.replace(/^\/+/, '')}`;

  if (files[absolutePath]?.type === 'file') {
    return absolutePath;
  }

  return Object.keys(files).find((candidate) => candidate.endsWith(`/${filePath.replace(/^\/+/, '')}`));
}

function ProjectProblemsPanel() {
  const diagnostics = useDiagnosticsStore((state) => state.diagnostics);
  const errors = useDiagnosticsStore((state) => state.errors);
  const warnings = useDiagnosticsStore((state) => state.warnings);
  const panelRef = useRef<HTMLElement | null>(null);

  // Move focus into the dock when it opens: first jump-to-file entry, else the heading.
  useEffect(() => {
    const panel = panelRef.current;

    if (!panel) {
      return;
    }

    const target =
      panel.querySelector<HTMLElement>('.bolt-project-problem-open') ?? panel.querySelector<HTMLElement>('h3');
    target?.focus({ preventScroll: true });
  }, []);

  const openProblemLocation = (resolvedPath: string, line: number) => {
    workbenchStore.setSelectedFile(resolvedPath);
    workbenchStore.setCurrentDocumentScrollPosition({ line: Math.max(0, line - 1), column: 0 });
    workbenchStore.currentView.set('code');
  };

  return (
    <section ref={panelRef} className="bolt-project-problems-panel" aria-label="Problems" aria-live="polite">
      <header className="bolt-project-problems-header">
        <div>
          <h3 tabIndex={-1}>Problems</h3>
          <p>
            {errors} errors · {warnings} warnings in the current workspace
          </p>
        </div>
        <div
          className="bolt-project-problems-counts"
          aria-label={`${errors} ${errors === 1 ? 'error' : 'errors'}, ${warnings} ${warnings === 1 ? 'warning' : 'warnings'}`}
        >
          <span
            className="bolt-project-problems-count bolt-project-problems-count-error"
            data-empty={errors === 0 ? 'true' : undefined}
          >
            <span className="i-ph:x-circle-fill" aria-hidden />
            {errors}
            <span className="bolt-project-problems-count-suffix">{errors === 1 ? 'error' : 'errors'}</span>
          </span>
          <span
            className="bolt-project-problems-count bolt-project-problems-count-warning"
            data-empty={warnings === 0 ? 'true' : undefined}
          >
            <span className="i-ph:warning-fill" aria-hidden />
            {warnings}
            <span className="bolt-project-problems-count-suffix">{warnings === 1 ? 'warning' : 'warnings'}</span>
          </span>
        </div>
      </header>
      {diagnostics.length === 0 ? (
        <div className="bolt-project-problems-empty">
          <span className="i-ph:check-circle" aria-hidden />
          <h4>No problems detected</h4>
          <p>Runtime diagnostics, preview errors, and warnings will appear here when they are reported.</p>
        </div>
      ) : (
        <ul className="bolt-project-problems-list">
          {diagnostics.map((diagnostic) => {
            const location = extractProblemLocation(diagnostic);
            const resolvedPath = location ? resolveProblemWorkbenchPath(location.path) : undefined;

            return (
              <li key={diagnostic.id} className="bolt-project-problem-item" data-severity={diagnostic.severity}>
                <span
                  className={diagnostic.severity === 'error' ? 'i-ph:x-circle' : 'i-ph:warning-circle'}
                  aria-hidden
                />
                <div className="bolt-project-problem-body">
                  <div className="bolt-project-problem-title">
                    <strong>{diagnostic.severity === 'error' ? 'Error' : 'Warning'}</strong>
                    <span>{diagnostic.source}</span>
                    {diagnostic.occurrences && diagnostic.occurrences > 1 ? (
                      <span>{diagnostic.occurrences} occurrences</span>
                    ) : null}
                    {location && resolvedPath ? (
                      <button
                        type="button"
                        className="bolt-project-problem-open"
                        onClick={() => openProblemLocation(resolvedPath, location.line)}
                        aria-label={`Open ${location.path} at line ${location.line}`}
                      >
                        <span className="i-ph:arrow-square-out" aria-hidden />
                        {location.path}:{location.line}
                      </button>
                    ) : null}
                  </div>
                  <p>{diagnostic.message}</p>
                  {diagnostic.detail ? <pre>{diagnostic.detail}</pre> : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function ProjectInteractiveTerminalPanel({ projectId }: { projectId?: string }) {
  const [toolsOpen, setToolsOpen] = useState(false);

  return (
    <section className="bolt-project-terminal-direct-panel" aria-label="Interactive terminal">
      <div className="bolt-project-terminal-direct-shell">
        <ClientOnly fallback={<TerminalTabsFallback />}>
          {() => (
            <PanelBoundary title={SHELL_TERMINAL_LABEL}>
              <Suspense fallback={<TerminalTabsFallback />}>
                <PanelGroup direction="vertical" className="h-full">
                  <LazyTerminalTabs panelDefaultSize={100} />
                </PanelGroup>
              </Suspense>
            </PanelBoundary>
          )}
        </ClientOnly>
      </div>
      <div className="bolt-project-terminal-direct-tools">
        <button type="button" aria-expanded={toolsOpen} onClick={() => setToolsOpen((value) => !value)}>
          <span className="i-ph:sliders-horizontal" aria-hidden />
          Runtime panels
        </button>
      </div>
      {toolsOpen ? <ProjectTerminalPanel projectId={projectId} /> : null}
    </section>
  );
}

function ProjectTerminalPanel({ projectId }: { projectId?: string }) {
  const [activeTab, setActiveTab] = useState<'shell' | 'environment' | 'scripts' | 'connections'>('shell');
  const [payload, setPayload] = useState<any>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(() => new Set(['.', '/workspace']));
  const [showEnvForm, setShowEnvForm] = useState(false);
  const [showSshForm, setShowSshForm] = useState(false);
  const [showKeygenForm, setShowKeygenForm] = useState(false);
  const [showScriptForm, setShowScriptForm] = useState(false);
  const [customScript, setCustomScript] = useState('');
  const [revealedSecrets, setRevealedSecrets] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const data = payload?.data ?? {};
  const envVars = data.envVars ?? [];
  const secrets = data.secrets ?? [];
  const terminalState = data.terminalState ?? {};
  const sshConnections = terminalState.sshConnections ?? [];
  const scriptRuns = terminalState.scriptRuns ?? [];

  const runtimeFiles = Array.isArray(data.runtimeFiles?.files)
    ? data.runtimeFiles.files
    : Array.isArray(data.runtimeFiles)
      ? data.runtimeFiles
      : [];
  const runtimeProcesses = Array.isArray(data.runtimeProcesses?.processes)
    ? data.runtimeProcesses.processes
    : Array.isArray(data.runtimeProcesses)
      ? data.runtimeProcesses
      : [];
  const runtimePorts = runtimePortsFromPayload(data.runtimePorts).length
    ? runtimePortsFromPayload(data.runtimePorts)
    : runtimePortsFromPayload(data.ports);

  const workspace = runtimeWorkspaceFromPanelData(data);
  const workspaceId = data.workspaceId ?? workspace?.id ?? projectId;

  const loadPanel = useCallback(async () => {
    if (!projectId) {
      return;
    }

    setBusy(true);
    setError(undefined);

    try {
      const response = await fetch(`/api/projects/${projectId}/ide-panel/terminal`, {
        headers: { accept: 'application/json' },
      });

      const result = (await response.json()) as any;

      if (!response.ok) {
        throw new Error(result?.error?.message ?? result?.error ?? 'Unable to load terminal panel');
      }

      if (result.status === 'error' && result.error) {
        setError(result.error.message ?? 'Terminal panel returned an error');
      }

      setPayload(result);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to load terminal panel');
    } finally {
      setBusy(false);
    }
  }, [projectId]);

  useEffect(() => {
    void loadPanel();
  }, [loadPanel]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!projectId) {
      return;
    }

    const form = event.currentTarget;
    setBusy(true);
    setError(undefined);
    setMessage('');

    try {
      const response = await fetch(`/api/projects/${projectId}/ide-panel/terminal`, {
        method: 'POST',
        body: new FormData(form),
      });

      const result = (await response.json().catch(() => ({}))) as any;

      if (!response.ok) {
        throw new Error(result.error ?? 'Terminal action failed');
      }

      form.reset();
      setShowEnvForm(false);
      setShowSshForm(false);
      setShowKeygenForm(false);
      setShowScriptForm(false);
      setCustomScript('');
      setMessage(
        result.fingerprint
          ? `Key pair generated (${result.keyType ?? 'ed25519'} · ${result.fingerprint}). Public key shown on the connection below.`
          : 'Action applied to the workspace backend.',
      );
      await loadPanel();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Terminal action failed');
    } finally {
      setBusy(false);
    }
  }

  function toggleDir(path: string) {
    setExpandedDirs((current) => {
      const next = new Set(current);

      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }

      return next;
    });
  }

  async function copyValue(value: string, label: string) {
    await navigator.clipboard?.writeText(value);
    setMessage(`${label} copied.`);
  }

  async function revealSecret(key: string) {
    if (!projectId) {
      return;
    }

    if (revealedSecrets[key]) {
      setRevealedSecrets((current) => {
        const next = { ...current };
        delete next[key];

        return next;
      });
      return;
    }

    const response = await fetch(
      `/api/projects/${projectId}/ide-panel/secrets?reveal=true&confirm=1&key=${encodeURIComponent(key)}`,
      { headers: { accept: 'application/json' } },
    );

    const result = (await response.json().catch(() => null)) as any;

    if (!response.ok || !result || result.status === 'error') {
      setError(result?.error?.message ?? result?.error ?? 'Unable to reveal secret');
      return;
    }

    const secret = result.data?.secrets?.find((item: any) => item.key === key);
    setRevealedSecrets((current) => ({ ...current, [key]: secret?.value ?? '' }));
  }

  function renderFileTree(nodes: any[], depth = 0) {
    return nodes.map((node) => {
      const directory = node.type === 'directory';
      const expanded = expandedDirs.has(node.path);

      return (
        <div key={node.path}>
          <button
            type="button"
            className="bolt-terminal-file-node"
            style={{ paddingLeft: `${depth * 14 + 8}px` }}
            onClick={() => directory && toggleDir(node.path)}
            data-testid={`terminal-file-node-${node.name}`}
          >
            <span
              className={directory ? (expanded ? 'i-ph:caret-down' : 'i-ph:caret-right') : 'i-ph:file-code'}
              aria-hidden
            />
            {directory && <span className={expanded ? 'i-ph:folder-open' : 'i-ph:folder'} aria-hidden />}
            <span>{node.name}</span>
          </button>
          {directory && expanded && node.children?.length ? (
            <div>{renderFileTree(node.children, depth + 1)}</div>
          ) : null}
        </div>
      );
    });
  }

  return (
    <div className="bolt-project-terminal-hub" data-testid="terminal-hub-panel">
      <header className="bolt-terminal-hub-head">
        <div>
          <h3>Shell Environment</h3>
          <p>
            Live workspace shell, runtime files, processes, ports, project environment and SSH checks for{' '}
            {workspaceId ?? 'this project'}.
          </p>
        </div>
        <div>
          <button type="button" onClick={() => void loadPanel()} disabled={busy}>
            <span className="i-ph:arrows-clockwise" aria-hidden />
            {busy ? 'Refreshing' : 'Refresh'}
          </button>
          <form onSubmit={submit}>
            <input type="hidden" name="intent" value="restart-workspace" />
            <PanelButton disabled={busy} variant="outline">
              Restart
            </PanelButton>
          </form>
          <form onSubmit={submit}>
            <input type="hidden" name="intent" value="stop-workspace" />
            <PanelButton disabled={busy} variant="outline">
              Stop
            </PanelButton>
          </form>
        </div>
      </header>

      {error ? <div className="bolt-project-empty-panel terminal-error">{error}</div> : null}
      {message ? <div className="bolt-project-empty-panel terminal-message">{message}</div> : null}

      <div className="bolt-terminal-hub-grid">
        <aside className="bolt-terminal-sidebar">
          <section data-testid="card-file-navigator">
            <h4>
              <span className="i-ph:files" aria-hidden />
              File Navigator
            </h4>
            <small>Workspace root</small>
            <div className="bolt-terminal-file-tree">
              {runtimeFiles.length ? (
                renderFileTree(runtimeFiles)
              ) : (
                <div className="bolt-project-empty-panel">No files loaded.</div>
              )}
            </div>
          </section>

          <section>
            <h4>
              <span className="i-ph:hard-drives" aria-hidden />
              Runtime
            </h4>
            <PanelRows
              rows={[
                ['Workspace', workspaceId ?? 'none'],
                [
                  'Status',
                  runtimeStatusText({
                    workspaceStatus: workspace,
                    ports: runtimePorts,
                    workspaceLoading: Boolean(workspace && !workspace.status),
                    workspaceError: workspace?.error,
                  }).replace(/^Runtime:\s*/, ''),
                ],
                ['Ports', runtimePorts.length ? runtimePorts.map((port: any) => `:${port.port}`).join(', ') : 'none'],
                ['Processes', String(runtimeProcesses.length)],
              ]}
              empty="No runtime details."
            />
          </section>

          <section data-testid="card-ssh-connections">
            <div className="bolt-terminal-section-head">
              <h4>
                <span className="i-ph:wifi-high" aria-hidden />
                SSH Connections
              </h4>
              <div className="bolt-terminal-section-actions">
                <button
                  type="button"
                  onClick={() => setShowKeygenForm((value) => !value)}
                  data-testid="button-ssh-generate-key"
                >
                  Generate key
                </button>
                <button
                  type="button"
                  onClick={() => setShowSshForm((value) => !value)}
                  data-testid="button-ssh-connections"
                >
                  Add
                </button>
              </div>
            </div>
            {showSshForm ? (
              <form onSubmit={submit} className="bolt-terminal-compact-form" data-testid="dialog-ssh">
                <input type="hidden" name="intent" value="add-ssh" />
                <PanelInput name="name" placeholder="Production bastion" required />
                <PanelInput name="host" placeholder="host.example.com" required />
                <PanelInput name="port" placeholder="22" defaultValue="22" />
                <PanelInput name="username" placeholder="deploy" required />
                <textarea name="privateKey" placeholder="Optional private key stored as a project secret" />
                <PanelButton disabled={busy} data-testid="button-add-ssh">
                  Save SSH
                </PanelButton>
              </form>
            ) : null}
            {showKeygenForm ? (
              <form onSubmit={submit} className="bolt-terminal-compact-form" data-testid="dialog-ssh-keygen">
                <input type="hidden" name="intent" value="generate-keypair" />
                <PanelInput name="name" placeholder="Key label (e.g. deploy key)" required />
                <select name="type" defaultValue="ed25519" aria-label="Key type">
                  <option value="ed25519">ed25519 (recommended)</option>
                  <option value="rsa">rsa</option>
                </select>
                <PanelInput name="comment" placeholder="Optional comment (e.g. you@host)" />
                <PanelButton disabled={busy} data-testid="button-generate-keypair">
                  Generate key pair
                </PanelButton>
              </form>
            ) : null}
            <div className="bolt-terminal-ssh-list">
              {sshConnections.map((connection: any) => (
                <article key={connection.id} data-testid={`ssh-connection-${connection.id}`}>
                  <span
                    className={connection.status === 'connected' ? 'i-ph:wifi-high' : 'i-ph:wifi-slash'}
                    aria-hidden
                  />
                  <div>
                    <strong>{connection.name}</strong>
                    <small>
                      {connection.username}@{connection.host}:{connection.port}
                    </small>
                    {connection.lastError ? (
                      <small className="terminal-error-text">{connection.lastError}</small>
                    ) : null}
                    {connection.publicKey ? (
                      <div className="bolt-terminal-ssh-pubkey">
                        {connection.fingerprint ? <small>{connection.fingerprint}</small> : null}
                        <code className="block truncate" title={connection.publicKey}>
                          {connection.publicKey}
                        </code>
                        <button
                          type="button"
                          onClick={() => void navigator.clipboard?.writeText(connection.publicKey)}
                          aria-label={`Copy public key for ${connection.name}`}
                        >
                          Copy public key
                        </button>
                      </div>
                    ) : null}
                  </div>
                  <form onSubmit={submit}>
                    <input
                      type="hidden"
                      name="intent"
                      value={connection.status === 'connected' ? 'disconnect-ssh' : 'connect-ssh'}
                    />
                    <input type="hidden" name="connectionId" value={connection.id} />
                    <PanelButton disabled={busy} variant="outline">
                      {connection.status === 'connected' ? 'Disconnect' : 'Connect'}
                    </PanelButton>
                  </form>
                  <form onSubmit={submit} className="bolt-terminal-ssh-git" data-testid={`ssh-git-${connection.id}`}>
                    <input type="hidden" name="intent" value="git-ssh" />
                    <input type="hidden" name="connectionId" value={connection.id} />
                    <PanelInput name="repoUrl" placeholder="git@github.com:owner/repo.git" aria-label="SSH git URL" />
                    <PanelButton disabled={busy} variant="outline" data-testid={`button-git-ssh-${connection.id}`}>
                      Test git access
                    </PanelButton>
                  </form>
                </article>
              ))}
              {!sshConnections.length ? (
                <div className="bolt-project-empty-panel">No SSH connections configured.</div>
              ) : null}
            </div>
          </section>
        </aside>

        <main className="bolt-terminal-main">
          <nav className="bolt-terminal-tabs" data-testid="tabs-shell">
            {[
              ['shell', 'Shell', 'i-ph:terminal-window'],
              ['environment', 'Environment', 'i-ph:key'],
              ['scripts', 'Scripts', 'i-ph:lightning'],
              ['connections', 'Processes', 'i-ph:activity'],
            ].map(([id, label, icon]) => (
              <button
                key={id}
                type="button"
                aria-current={activeTab === id ? 'page' : undefined}
                onClick={() => setActiveTab(id as any)}
                data-testid={`tab-${id}`}
              >
                <span className={icon} aria-hidden />
                {label}
              </button>
            ))}
          </nav>

          {activeTab === 'shell' && (
            <section className="bolt-terminal-live-card" data-testid="card-shell-terminal">
              <div className="bolt-terminal-live-toolbar">
                <strong>Interactive workspace shell</strong>
                <small>{workspace?.status ?? 'runtime status loading'}</small>
              </div>
              <ClientOnly fallback={<TerminalTabsFallback />}>
                {() => (
                  <PanelBoundary title={SHELL_TERMINAL_LABEL}>
                    <Suspense fallback={<TerminalTabsFallback />}>
                      <PanelGroup direction="vertical" className="h-full">
                        <LazyTerminalTabs panelDefaultSize={100} />
                      </PanelGroup>
                    </Suspense>
                  </PanelBoundary>
                )}
              </ClientOnly>
            </section>
          )}

          {activeTab === 'environment' && (
            <section className="bolt-terminal-card" data-testid="card-env-vars">
              <div className="bolt-terminal-section-head">
                <div>
                  <strong>Environment Variables</strong>
                  <small>Project variables and encrypted secrets loaded from backend stores.</small>
                </div>
                <button
                  type="button"
                  onClick={() => setShowEnvForm((value) => !value)}
                  data-testid="button-add-env-var"
                >
                  Add Variable
                </button>
              </div>
              {showEnvForm ? (
                <form onSubmit={submit} className="bolt-terminal-env-form" data-testid="dialog-add-env">
                  <input type="hidden" name="intent" value="add-env" />
                  <PanelInput name="key" placeholder="MY_VARIABLE" required data-testid="input-env-key" />
                  <PanelInput name="value" placeholder="Value" data-testid="input-env-value" />
                  <select name="isSecret" defaultValue="false" data-testid="switch-env-secret">
                    <option value="false">Plain variable</option>
                    <option value="true">Encrypted secret</option>
                  </select>
                  <PanelButton disabled={busy} data-testid="button-save-env">
                    Save Variable
                  </PanelButton>
                </form>
              ) : null}
              <div className="bolt-terminal-env-list">
                {envVars.map((envVar: any) => (
                  <article key={envVar.key} data-testid={`env-var-${envVar.key}`}>
                    <span className="i-ph:brackets-curly" aria-hidden />
                    <div>
                      <strong>{envVar.key}</strong>
                      <small>{envVar.value || 'empty value'}</small>
                    </div>
                    <button type="button" onClick={() => void copyValue(envVar.value ?? '', envVar.key)}>
                      Copy
                    </button>
                    <form onSubmit={submit}>
                      <input type="hidden" name="intent" value="delete-env" />
                      <input type="hidden" name="key" value={envVar.key} />
                      <input type="hidden" name="isSecret" value="false" />
                      <PanelButton disabled={busy} variant="outline">
                        Delete
                      </PanelButton>
                    </form>
                  </article>
                ))}
                {secrets.map((secret: any) => (
                  <article key={secret.key} data-testid={`env-var-${secret.key}`}>
                    <span className="i-ph:lock" aria-hidden />
                    <div>
                      <strong>{secret.key}</strong>
                      <small>{revealedSecrets[secret.key] ?? '••••••••'}</small>
                    </div>
                    <button type="button" onClick={() => void revealSecret(secret.key)}>
                      {revealedSecrets[secret.key] ? 'Hide' : 'Reveal'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void copyValue(revealedSecrets[secret.key] ?? secret.key, secret.key)}
                    >
                      Copy
                    </button>
                    <form onSubmit={submit}>
                      <input type="hidden" name="intent" value="delete-env" />
                      <input type="hidden" name="key" value={secret.key} />
                      <input type="hidden" name="isSecret" value="true" />
                      <PanelButton disabled={busy} variant="outline">
                        Delete
                      </PanelButton>
                    </form>
                  </article>
                ))}
                {!envVars.length && !secrets.length ? (
                  <div className="bolt-project-empty-panel">No environment variables.</div>
                ) : null}
              </div>
            </section>
          )}

          {activeTab === 'scripts' && (
            <section className="bolt-terminal-card" data-testid="card-script-runner">
              <div className="bolt-terminal-section-head">
                <div>
                  <strong>Script Runner</strong>
                  <small>Runs commands through the runtime command API with abuse prevention.</small>
                </div>
                <button
                  type="button"
                  onClick={() => setShowScriptForm((value) => !value)}
                  data-testid="button-create-script"
                >
                  New Script
                </button>
              </div>
              {showScriptForm ? (
                <form onSubmit={submit} className="bolt-terminal-script-editor" data-testid="dialog-script-editor">
                  <input type="hidden" name="intent" value="run-script" />
                  <PanelInput name="name" placeholder="Custom script" data-testid="input-script-name" />
                  <textarea
                    name="script"
                    placeholder="#!/bin/sh&#10;echo ready"
                    value={customScript}
                    onChange={(event) => setCustomScript(event.target.value)}
                    data-testid="textarea-script-content"
                  />
                  <PanelButton disabled={busy || !customScript.trim()} data-testid="button-run-custom-script">
                    Run Script
                  </PanelButton>
                </form>
              ) : null}
              <div className="bolt-terminal-script-grid">
                {TERMINAL_SCRIPT_TEMPLATES.map(([id, name, description, script]) => (
                  <article key={id} data-testid={`script-template-${id}`}>
                    <div>
                      <span className="i-ph:lightning" aria-hidden />
                      <strong>{name}</strong>
                      <p>{description}</p>
                      <code>$ {script}</code>
                    </div>
                    <form onSubmit={submit}>
                      <input type="hidden" name="intent" value="run-script" />
                      <input type="hidden" name="name" value={name} />
                      <input type="hidden" name="script" value={script} />
                      <PanelButton disabled={busy} variant="outline" data-testid={`button-run-${id}`}>
                        Run
                      </PanelButton>
                    </form>
                  </article>
                ))}
              </div>
              <div className="bolt-terminal-runs">
                {scriptRuns.map((run: any) => (
                  <details key={run.id} open={run.id === scriptRuns[0]?.id}>
                    <summary>
                      <span data-status={run.status}>{run.status}</span>
                      <strong>{run.name}</strong>
                      <small>{run.finishedAt ? new Date(run.finishedAt).toLocaleString() : run.startedAt}</small>
                    </summary>
                    <pre>{run.output || 'No output captured.'}</pre>
                  </details>
                ))}
              </div>
            </section>
          )}

          {activeTab === 'connections' && (
            <section className="bolt-terminal-card" data-testid="card-runtime-processes">
              <div className="bolt-terminal-section-head">
                <div>
                  <strong>Processes and Ports</strong>
                  <small>Live process and preview port state from the workspace agent.</small>
                </div>
              </div>
              <div className="bolt-terminal-process-list">
                {runtimeProcesses.map((process: any) => (
                  <article key={process.id}>
                    <span className="i-ph:activity" aria-hidden />
                    <div>
                      <strong>{process.command}</strong>
                      <small>{process.startedAt ?? process.status}</small>
                    </div>
                    <form onSubmit={submit}>
                      <input type="hidden" name="intent" value="stop-process" />
                      <input type="hidden" name="processId" value={process.id} />
                      <PanelButton disabled={busy} variant="outline">
                        Stop
                      </PanelButton>
                    </form>
                  </article>
                ))}
                {!runtimeProcesses.length ? (
                  <div className="bolt-project-empty-panel">No runtime processes reported.</div>
                ) : null}
              </div>
              <div className="bolt-terminal-port-grid">
                {runtimePorts.map((port: any) => (
                  <a key={port.port} href={port.url} target="_blank" rel="noreferrer">
                    <span className="i-ph:link" aria-hidden />
                    Port {port.port}
                    <small>{port.ready === false ? 'not ready' : 'ready'}</small>
                  </a>
                ))}
                {!runtimePorts.length ? <div className="bolt-project-empty-panel">No preview ports open.</div> : null}
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}

function ProjectFilesTool({
  files,
  selectedFile,
  unsavedFiles,
  openEditors = [],
  changedFiles = [],
  openFilesOnSelect = false,
  onFilePreview,
  onFileOpen,
}: {
  files: any;
  selectedFile?: string;
  unsavedFiles?: Set<string>;
  openEditors?: Array<{ id: string; filePath?: string; dirty?: boolean; pinned?: boolean }>;
  changedFiles?: unknown[];
  openFilesOnSelect?: boolean;
  onFilePreview: (filePath: string) => void;
  onFileOpen: (filePath: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [query, setQuery] = useState('');
  const [showHiddenFiles, setShowHiddenFiles] = useState(false);
  const [createEntryKind, setCreateEntryKind] = useState<'file' | 'folder' | null>(null);
  const gitStatusByPath = useMemo(() => buildGitStatusMap(changedFiles), [changedFiles]);

  const fileOpenEditors = useMemo(
    () =>
      openEditors
        .filter((editor) => typeof editor.filePath === 'string' && editor.filePath)
        .map((editor) => ({
          id: editor.id,
          filePath: editor.filePath as string,
          dirty: editor.dirty,
          pinned: editor.pinned,
        })),
    [openEditors],
  );

  const { fileCount, hiddenSystemFileCount } = useMemo(() => {
    let visible = 0;
    let hidden = 0;

    for (const [filePath, entry] of Object.entries(files ?? {}) as Array<[string, any]>) {
      if (entry?.type !== 'file') {
        continue;
      }

      if (isIdeHiddenPath(filePath)) {
        hidden++;

        if (showHiddenFiles) {
          visible++;
        }

        continue;
      }

      visible++;
    }

    return { fileCount: visible, hiddenSystemFileCount: hidden };
  }, [files, showHiddenFiles]);

  const filteredFiles = useMemo(() => {
    const trimmedQuery = query.trim().toLowerCase();

    if (!trimmedQuery) {
      return files;
    }

    return Object.fromEntries(
      Object.entries(files ?? {}).filter(([filePath]) => filePath.toLowerCase().includes(trimmedQuery)),
    );
  }, [files, query]);

  async function createEntry(kind: 'file' | 'folder', value: string) {
    const normalized = value.trim();

    if (!normalized) {
      return;
    }

    const target = normalized.startsWith(WORK_DIR) ? normalized : `${WORK_DIR}/${normalized.replace(/^\/+/, '')}`;

    /*
     * Don't let "New file/folder" silently overwrite an existing entry. createFile
     * only refuses LOCKED targets, so an existing unlocked file at this path would
     * be truncated to empty content with no confirm — data loss.
     */
    if (workbenchStore.files.get()[target]) {
      toast.error(`A file or folder already exists at "${target}"`);
      return;
    }

    if (kind === 'file') {
      onFileOpen(target);
      await workbenchStore.createFile(target, '');
    } else {
      await workbenchStore.createFolder(target);
    }
  }

  const collapseFilesLabel = collapsed ? 'Expand all files' : 'Collapse all files';
  const systemFilesLabel = showHiddenFiles ? 'Hide hidden/system files' : 'Show hidden/system files';

  const hiddenFilesSummary = hiddenSystemFileCount
    ? `${hiddenSystemFileCount} hidden/system files ${showHiddenFiles ? 'shown' : 'hidden'}`
    : 'No hidden/system files detected';

  return (
    <div className="bolt-project-files-tool">
      <InputDialog
        isOpen={createEntryKind !== null}
        onClose={() => setCreateEntryKind(null)}
        onSubmit={(value) => {
          const kind = createEntryKind;
          setCreateEntryKind(null);

          if (kind) {
            void createEntry(kind, value);
          }
        }}
        title={createEntryKind === 'folder' ? 'New folder' : 'New file'}
        label={createEntryKind === 'folder' ? 'Folder path' : 'File path'}
        placeholder={createEntryKind === 'folder' ? 'src/components' : 'src/index.ts'}
        confirmLabel="Create"
        validate={(value) => (value.trim() ? undefined : 'Enter a path')}
      />
      <div className="bolt-project-files-header">
        <span className="bolt-project-files-count" title={hiddenFilesSummary}>
          {fileCount} files
        </span>
        <HeaderTip label="New file" side="top">
          <button type="button" aria-label="New file" title="New file" onClick={() => setCreateEntryKind('file')}>
            <span className="i-ph:file-plus" aria-hidden />
          </button>
        </HeaderTip>
        <HeaderTip label="New folder" side="top">
          <button type="button" aria-label="New folder" title="New folder" onClick={() => setCreateEntryKind('folder')}>
            <span className="i-ph:folder-plus" aria-hidden />
          </button>
        </HeaderTip>
        <HeaderTip label="Refresh files" side="top">
          <button
            type="button"
            aria-label="Refresh files"
            title="Refresh files"
            onClick={() => void workbenchStore.loadRuntimeFiles('.')}
          >
            <span className="i-ph:arrow-clockwise" aria-hidden />
          </button>
        </HeaderTip>
        <HeaderTip label={collapseFilesLabel} side="top">
          <button
            type="button"
            aria-label={collapseFilesLabel}
            title={collapseFilesLabel}
            onClick={() => setCollapsed((value) => !value)}
          >
            <span className={collapsed ? 'i-ph:caret-double-down' : 'i-ph:caret-double-up'} aria-hidden />
          </button>
        </HeaderTip>
        <HeaderTip label={systemFilesLabel} side="top">
          <button
            type="button"
            aria-label={systemFilesLabel}
            aria-pressed={showHiddenFiles}
            title={systemFilesLabel}
            onClick={() => setShowHiddenFiles((value) => !value)}
          >
            <span className={showHiddenFiles ? 'i-ph:eye' : 'i-ph:eye-slash'} aria-hidden />
          </button>
        </HeaderTip>
      </div>
      <label className="bolt-project-files-search">
        <span>Search</span>
        <input
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          placeholder="Filter files"
          aria-label="Search files"
        />
      </label>
      <FileTree
        key={collapsed ? 'collapsed' : 'expanded'}
        className="bolt-project-file-tree"
        files={filteredFiles}
        hideRoot
        collapsed={collapsed}
        hiddenFiles={IDE_FILE_TREE_HIDDEN_PATTERNS}
        showHiddenFiles={showHiddenFiles}
        unsavedFiles={unsavedFiles}
        openEditors={fileOpenEditors}
        gitStatusByPath={gitStatusByPath}
        enableWorkspaceViews
        rootFolder={WORK_DIR}
        selectedFile={selectedFile}
        onFileSelect={(filePath) => {
          if (openFilesOnSelect) {
            onFileOpen(filePath);
            return;
          }

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
  activePanel: _activePanel,
  activeTabId,
  tabs,
  trailing,
  onSelect,
  onClose,
  onOpenTool,
  onCloseOthers,
  onCloseToRight,
  onCloseAll,
  onCloseSaved,
  onSplitActiveRight,
  onSwapTab,
  onDragEnd,
  onTogglePin,
  recentFiles = [],
  onOpenFile,
}: {
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
    displayLabel?: string;
    onSave?: () => void;
  }>;
  trailing?: React.ReactNode;
  onSelect: (tabId: string, panel: IdeWorkspacePanel) => void;
  onClose?: (tabId: string, panel: IdeWorkspacePanel) => void;
  onOpenTool?: (panel: IdeWorkspacePanel | IdeRightPanel) => void;
  onCloseOthers?: (tabId: string) => void;
  onCloseToRight?: (tabId: string) => void;
  onCloseAll?: () => void;
  onCloseSaved?: () => void;
  onSplitActiveRight?: (tabId?: string) => void;
  onSwapTab?: (sourcePaneId: string, sourceTabId: string, targetTabId?: string) => void;
  onDragEnd?: () => void;
  onTogglePin?: (tabId?: string) => void;
  recentFiles?: string[];
  onOpenFile?: (filePath: string, preview: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [toolQuery, setToolQuery] = useState('');
  const addTabButtonRef = useRef<HTMLButtonElement | null>(null);
  const toolMenuRef = useRef<HTMLDivElement | null>(null);
  const commandPaletteShortcut = formatKeybindingCombo('cmd+k');

  const closeToolMenu = useCallback((options: { restoreFocus?: boolean } = {}) => {
    setOpen(false);
    setToolQuery('');

    if (options.restoreFocus) {
      window.requestAnimationFrame(() => addTabButtonRef.current?.focus());
    }
  }, []);

  const openToolMenu = useCallback(() => {
    setActionsOpen(false);
    setToolQuery('');
    setOpen(true);
  }, []);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeToolMenu({ restoreFocus: true });
      } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        closeToolMenu();
      }
    };

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;

      if (target && (toolMenuRef.current?.contains(target) || addTabButtonRef.current?.contains(target))) {
        return;
      }

      closeToolMenu();
    };

    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('pointerdown', handlePointerDown, true);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('pointerdown', handlePointerDown, true);
    };
  }, [closeToolMenu, open]);

  const tools: Array<[IdeWorkspacePanel | IdeRightPanel, string, string, string, string, string]> = [
    ['overview', 'Overview', 'Project summary', 'i-ph:gauge', 'var(--vc-ide-accent-action)', 'Workspace'],
    ['editor', 'Code', 'Code editor', 'i-ph:code', 'var(--vc-ide-accent-action)', 'Workspace'],
    ['files', 'Files', 'Browse project files', 'i-ph:files', 'var(--vc-ide-accent-warning)', 'Workspace'],
    ['search', 'Search', 'Find in files', 'i-ph:magnifying-glass', 'var(--vc-ide-accent-action)', 'Workspace'],
    ['locks', 'Locks', 'Locked files', 'i-ph:lock', 'var(--vc-ide-accent-warning)', 'Workspace'],
    [
      'terminal',
      SHELL_TERMINAL_LABEL,
      'Workspace shell',
      'i-ph:terminal-window',
      'var(--vc-ide-accent-success)',
      'Runtime',
    ],
    ['logs', 'Logs', 'Runtime logs', 'i-ph:list-magnifying-glass', 'var(--vc-ide-accent-success)', 'Runtime'],
    ['preview', 'Webview', 'App preview', 'i-ph:browser', 'var(--vc-ide-accent-action)', 'Runtime'],
    ['database', 'Database', 'SQL browser', 'i-ph:database', 'var(--vc-ide-accent-action)', 'Data'],
    ['object-storage', 'Object Storage', 'File storage', 'i-ph:package', 'var(--vc-ide-accent-warning)', 'Data'],
    [
      'env',
      'Environment variables',
      'Environment variables',
      'i-ph:brackets-curly',
      'var(--vc-ide-accent-warning)',
      'Configuration',
    ],
    ['secrets', 'Secrets', 'Encrypted project secrets', 'i-ph:lock', 'var(--vc-ide-accent-warning)', 'Configuration'],
    ['git', 'Git', 'Version control', 'i-ph:git-branch', 'var(--vc-ide-accent-success)', 'Project'],
    ['packages', 'Packages', 'Dependencies manager', 'i-ph:cube', 'var(--vc-ide-accent-warning)', 'Project'],
    ['skills', 'Skills', 'Agent skills', 'i-ph:sparkle', 'var(--vc-ide-accent-action)', 'Project'],
    [
      'integrations',
      'Integrations',
      'Connected services',
      'i-ph:plugs-connected',
      'var(--vc-ide-accent-success)',
      'Project',
    ],
    ['workflows', 'Workflows', 'Task automation', 'i-ph:git-branch', 'var(--vc-ide-accent-success)', 'Project'],
    ['debugger', 'Debugger', 'Breakpoints and launch configs', 'i-ph:bug', 'var(--vc-ide-accent-action)', 'Project'],
    ['deployments', 'Deployments', 'Publish your app', 'i-ph:rocket-launch', 'var(--vc-ide-accent-action)', 'Delivery'],
    ['security', 'Security', 'Security scanner', 'i-ph:shield-check', 'var(--vc-ide-accent-error)', 'Security'],
    ['monitoring', 'Monitoring', 'App metrics', 'i-ph:chart-line', 'var(--vc-ide-accent-action)', 'Delivery'],
    ['ports', 'Ports', 'Forwarded ports', 'i-ph:plugs', 'var(--vc-ide-accent-success)', 'Runtime'],
    ['extensions', 'Extensions', 'Marketplace', 'i-ph:puzzle-piece', 'var(--vc-ide-text-secondary)', 'Project'],
    ['snapshots', 'Snapshots', 'Rollback points', 'i-ph:stack', 'var(--vc-ide-accent-action)', 'Project'],
    ['activity', 'Activity', 'Project timeline', 'i-ph:activity', 'var(--vc-ide-accent-action)', 'Team'],
    ['collaborators', 'Collaborators', 'Team access', 'i-ph:users', 'var(--vc-ide-text-secondary)', 'Team'],
    ['settings', 'Settings', 'Project settings', 'i-ph:gear', 'var(--vc-ide-text-secondary)', 'Configuration'],
  ];

  const normalizedToolQuery = toolQuery.trim().toLowerCase();

  const filteredRecentFiles = recentFiles
    .filter((filePath) => !normalizedToolQuery || filePath.toLowerCase().includes(normalizedToolQuery))
    .slice(0, 5);
  const filteredTools = tools.filter(
    ([id, title, description, , , category]) =>
      !normalizedToolQuery || [id, title, description, category].join(' ').toLowerCase().includes(normalizedToolQuery),
  );
  const toolGroups = Array.from(
    filteredTools
      .reduce((groups, tool) => {
        const category = normalizedToolQuery ? 'Matches' : tool[5];
        const groupTools = groups.get(category) ?? [];

        groupTools.push(tool);
        groups.set(category, groupTools);

        return groups;
      }, new Map<string, typeof filteredTools>())
      .entries(),
  );

  const toolMenu = open ? (
    <div className="bolt-project-tool-modal" data-testid="ide-add-tab-command-palette">
      <div
        ref={toolMenuRef}
        className="bolt-project-tool-menu bolt-project-tool-menu--modal"
        role="dialog"
        aria-label="Add tab command palette"
      >
        <div className="bolt-project-tool-menu-header">
          <div className="bolt-project-tool-menu-title">
            <span>
              <strong>Add tab</strong>
              <small>Open a tool, project file, or command in this workspace.</small>
            </span>
            <kbd>{commandPaletteShortcut}</kbd>
          </div>
          <div className="bolt-project-tool-search">
            <span className="i-ph:magnifying-glass" aria-hidden />
            <input
              autoFocus
              placeholder="Search commands, tools, or files..."
              aria-label="Search commands, tools, or files"
              value={toolQuery}
              onChange={(event) => setToolQuery(event.target.value)}
            />
            <button
              type="button"
              aria-label="Close add tab command palette"
              title="Close"
              className="bolt-project-tool-search-close"
              onClick={() => closeToolMenu({ restoreFocus: true })}
            >
              <span className="i-ph:x" aria-hidden />
            </button>
          </div>
        </div>
        <div className="bolt-project-tool-menu-body">
          {!normalizedToolQuery && (
            <>
              <div className="bolt-project-tool-section">RECENT FILES</div>
              {filteredRecentFiles.map((filePath) => (
                <button
                  key={`recent-file-${filePath}`}
                  type="button"
                  className="bolt-project-tool-item"
                  onClick={() => {
                    onOpenFile?.(filePath, false);
                    closeToolMenu();
                  }}
                >
                  <span className="i-ph:file-code" aria-hidden />
                  <span>
                    <strong>{filePath.split('/').pop() || filePath}</strong>
                    <small>{filePath.replace(WORK_DIR, '')}</small>
                  </span>
                  <span className="bolt-project-tool-item-chevron i-ph:caret-right" aria-hidden />
                </button>
              ))}
            </>
          )}
          <div className="bolt-project-tool-section">TOOLS</div>
          {toolGroups.map(([category, groupTools]) => (
            <div key={category} className="bolt-project-tool-group">
              <div className="bolt-project-tool-section">{category}</div>
              {groupTools.map(([id, title, description, icon, color]) => (
                <button
                  key={id}
                  type="button"
                  className="bolt-project-tool-item"
                  data-testid={`feature-${id}`}
                  onClick={() => {
                    onOpenTool?.(id);
                    closeToolMenu();
                  }}
                >
                  <span className={icon} style={{ color }} aria-hidden />
                  <span>
                    <strong>{title}</strong>
                    <small>{description}</small>
                  </span>
                  {tabs.some((tab) => tab.panel === id) && <em>Open</em>}
                  <span className="bolt-project-tool-item-chevron i-ph:caret-right" aria-hidden />
                </button>
              ))}
            </div>
          ))}
          {!filteredTools.length && (
            <div className="bolt-project-tool-empty">
              <span className="i-ph:sparkle" aria-hidden />
              <strong>No features found</strong>
              <small>Try a different search term.</small>
            </div>
          )}
        </div>
        <div className="bolt-project-tool-footer">
          <span>
            {filteredTools.length} feature{filteredTools.length === 1 ? '' : 's'} available
            {normalizedToolQuery ? ` matching "${toolQuery.trim()}"` : ''}
          </span>
          <span>
            <kbd>Esc</kbd> close · <kbd>{commandPaletteShortcut}</kbd> full palette
          </span>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <>
      <div className="bolt-project-tabbar" data-tools-panel-open={open ? 'true' : undefined}>
        <div
          className="bolt-project-tabs"
          role="tablist"
          onKeyDown={moveTabFocus}
          onDragOver={(event) => {
            if (onSwapTab) {
              event.preventDefault();
            }
          }}
          onDrop={(event) => {
            const sourcePaneId = event.dataTransfer.getData('application/x-vibecore-pane-id');
            const sourceTabId = event.dataTransfer.getData('application/x-vibecore-tab-id');

            if (sourcePaneId && sourceTabId) {
              event.preventDefault();
              onSwapTab?.(sourcePaneId, sourceTabId, activeTabId);
            }
          }}
        >
          {tabs.map((tab) => (
            <div
              key={tab.id}
              role="tab"
              data-tab-id={tab.id}
              data-testid={`tab-${tab.id}`}
              data-panel={tab.panel}
              data-pinned={tab.pinned ? 'true' : undefined}
              data-dirty={tab.dirty ? 'true' : undefined}
              aria-label={`${tab.pinned ? 'Pinned tab: ' : ''}${tab.label}${tab.dirty ? ', unsaved changes' : ''}`}
              aria-selected={activeTabId === tab.id}
              tabIndex={activeTabId === tab.id ? 0 : -1}
              onKeyDown={(event) => {
                /*
                 * Manual activation: the focused tab selects on Enter/Space (the
                 * tab is a div — it contains pin/save/close buttons — so it can't
                 * be a <button>). Arrow nav is handled by the tablist's onKeyDown.
                 */
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  closeToolMenu();
                  onSelect(tab.id, tab.panel);
                }
              }}
              className="bolt-project-tab"
              draggable
              onDragStart={(event) => {
                const pane = event.currentTarget.closest('[data-pane-id]') as HTMLElement | null;
                const paneId = pane?.dataset.paneId;

                if (!paneId) {
                  event.preventDefault();
                  return;
                }

                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('application/x-vibecore-pane-id', paneId);
                event.dataTransfer.setData('application/x-vibecore-tab-id', tab.id);
              }}
              onDragEnd={onDragEnd}
              onDragOver={(event) => {
                if (onSwapTab) {
                  event.preventDefault();
                }
              }}
              onDrop={(event) => {
                const sourcePaneId = event.dataTransfer.getData('application/x-vibecore-pane-id');
                const sourceTabId = event.dataTransfer.getData('application/x-vibecore-tab-id');

                if (sourcePaneId && sourceTabId) {
                  event.preventDefault();
                  event.stopPropagation();
                  onSwapTab?.(sourcePaneId, sourceTabId, tab.id);
                }
              }}
            >
              <button
                type="button"
                className="bolt-project-tab-main"
                title={tab.label}
                tabIndex={-1}
                onClick={() => {
                  closeToolMenu();
                  onSelect(tab.id, tab.panel);
                }}
              >
                <span className={classNames('bolt-project-tab-icon', tab.icon)} aria-hidden />
                <span className={classNames('bolt-project-tab-label', tab.preview || tab.dirty ? 'italic' : '')}>
                  {tab.displayLabel ?? tab.label}
                </span>
                {tab.dirty ? <span className="bolt-project-tab-dirty-dot" aria-hidden /> : null}
              </button>
              {onTogglePin ? (
                <button
                  type="button"
                  className="bolt-project-tab-pin"
                  aria-label={`${tab.pinned ? 'Unpin' : 'Pin'} ${tab.label}`}
                  title={`${tab.pinned ? 'Unpin' : 'Pin'} ${tab.label}`}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onTogglePin(tab.id);
                  }}
                >
                  <span className={tab.pinned ? 'i-ph:push-pin-simple-fill' : 'i-ph:push-pin-simple'} aria-hidden />
                </button>
              ) : null}
              {tab.dirty ? (
                <button
                  type="button"
                  className="bolt-project-tab-save"
                  aria-label={`Save ${tab.label}`}
                  title={`Save ${tab.label}`}
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
        {trailing}
        <div className="bolt-project-tool-popover">
          <button
            ref={addTabButtonRef}
            type="button"
            className="bolt-project-tab-action bolt-project-add-tab-action"
            aria-label="Add tab with command palette"
            title={`Add tab (${commandPaletteShortcut})`}
            data-testid="tab-add"
            aria-haspopup="dialog"
            aria-expanded={open}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={() => {
              if (open) {
                closeToolMenu({ restoreFocus: true });
              } else {
                openToolMenu();
              }
            }}
          >
            <span className="i-ph:plus" aria-hidden />
          </button>
        </div>
        <div className="bolt-project-tool-popover">
          <button
            type="button"
            className="bolt-project-tab-action"
            aria-label="Tab actions"
            title="Tab actions"
            aria-expanded={actionsOpen}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={() => {
              closeToolMenu();
              setActionsOpen((value) => !value);
            }}
          >
            <span className="i-ph:dots-three" aria-hidden />
          </button>
          {actionsOpen && (
            <div className="bolt-project-tab-actions-menu">
              <button
                type="button"
                onClick={() => {
                  onTogglePin?.(activeTabId ?? tabs[0]?.id);
                  setActionsOpen(false);
                }}
              >
                <span className="i-ph:push-pin-simple" aria-hidden />
                {tabs.find((tab) => tab.id === activeTabId)?.pinned ? 'Unpin tab' : 'Pin tab'}
              </button>
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
                  onCloseSaved?.();
                  setActionsOpen(false);
                }}
              >
                Close saved
              </button>
              <button
                type="button"
                onClick={() => {
                  onSplitActiveRight?.(activeTabId ?? tabs[0]?.id);
                  setActionsOpen(false);
                }}
              >
                Split active right
              </button>
            </div>
          )}
        </div>
      </div>
      {toolMenu}
    </>
  );
}

function ProjectWelcomeState({
  files,
  onOpenTool,
  onOpenFile,
}: {
  files: string[];
  onOpenTool?: (panel: IdeWorkspacePanel | IdeRightPanel) => void;
  onOpenFile?: (filePath: string) => void;
}) {
  const shortcuts: Array<[string, string, string, IdeWorkspacePanel | IdeRightPanel]> = [
    ['i-ph:files', 'Open Files', formatKeybindingCombo('cmd+p'), 'files'],
    ['i-ph:terminal-window', `Open ${SHELL_TERMINAL_LABEL}`, formatKeybindingCombo('cmd+`'), 'terminal'],
    ['i-ph:browser', 'View Preview', formatKeybindingCombo('cmd+enter'), 'preview'],
    ['i-ph:command', 'All Commands', formatKeybindingCombo('cmd+k'), 'settings'],
  ];

  return (
    <div className="bolt-project-welcome">
      <div className="bolt-project-welcome-logo">
        <span className="i-ph:sparkle" aria-hidden />
      </div>
      <h2>Welcome to your project</h2>
      <p>Open a tool or ask the agent to get started.</p>
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
        <span>Recent</span>
        {files.length ? (
          files.map((file) => (
            <button key={file} type="button" onClick={() => onOpenFile?.(file)}>
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
  projectId,
  onSubmit,
  busy,
  reload,
  lastLoadedAt,
}: {
  panel: string;
  data: any;
  project: any;
  projectId?: string;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  busy: boolean;
  reload?: () => void | Promise<void>;
  lastLoadedAt?: string;
}) {
  if (panel === 'overview') {
    return <ProjectOverviewPanel data={data} project={project} />;
  }

  if (panel === 'studio') {
    return <ProjectAgentStudioPanel data={data} projectId={projectId} reload={reload} busy={busy} />;
  }

  if (panel === 'database') {
    return <ProjectDatabasePanel projectId={projectId} data={data} onSubmit={onSubmit} busy={busy} reload={reload} />;
  }

  if (panel === 'object-storage') {
    return <ProjectObjectStoragePanel projectId={projectId} busy={busy} />;
  }

  if (panel === 'packages') {
    return <ProjectPackagesPanel data={data} onSubmit={onSubmit} busy={busy} />;
  }

  if (panel === 'skills') {
    return <ProjectSkillsPanel projectId={projectId} data={data} busy={busy} reload={reload} />;
  }

  if (panel === 'ports') {
    return <ProjectPortsPanel data={data} projectId={projectId} onSubmit={onSubmit} busy={busy} />;
  }

  if (panel === 'monitoring') {
    return <ProjectMonitoringPanel data={data} reload={reload} busy={busy} />;
  }

  if (panel === 'extensions') {
    return <ProjectExtensionsPanel data={data} onSubmit={onSubmit} busy={busy} />;
  }

  if (panel === 'integrations') {
    return <ProjectIntegrationsPanel data={data} projectId={projectId} onSubmit={onSubmit} busy={busy} />;
  }

  if (panel === 'workflows') {
    return <ProjectWorkflowsPanel data={data} onSubmit={onSubmit} busy={busy} />;
  }

  if (panel === 'security') {
    return (
      <ProjectSecurityPanel
        data={data}
        project={project}
        projectId={projectId}
        onSubmit={onSubmit}
        busy={busy}
        reload={reload}
      />
    );
  }

  if (panel === 'logs') {
    return <ProjectLogsPanel data={data} reload={reload} busy={busy} />;
  }

  if (panel === 'debugger') {
    return <ProjectDebuggerPanel data={data} onSubmit={onSubmit} busy={busy} reload={reload} />;
  }

  if (panel === 'snapshots') {
    const snapshots = ([...(data.snapshots ?? [])] as ProjectSnapshot[]).sort((a, b) => {
      return Date.parse(b.createdAt ?? '') - Date.parse(a.createdAt ?? '');
    });

    return (
      <section className="bolt-project-snapshots-panel" aria-label="Project checkpoints">
        <div className="bolt-project-snapshots-header">
          <div>
            <h3>Checkpoints</h3>
            <p>Restore a known-good project state or create a manual checkpoint before risky changes.</p>
          </div>
          <form onSubmit={onSubmit} className="bolt-project-snapshots-create">
            <input name="intent" value="create" type="hidden" />
            <PanelInput name="label" placeholder="Manual checkpoint" />
            <PanelButton disabled={busy}>+ New checkpoint</PanelButton>
          </form>
        </div>
        {snapshots.length ? (
          <div className="bolt-project-snapshots-timeline">
            {snapshots.map((snapshot, index) => {
              const previousSnapshot = snapshots[index + 1];
              const files = snapshotFiles(snapshot);
              const diff = snapshotDiffSummary(snapshot, previousSnapshot);
              const modifiedCount = diff.added.length + diff.changed.length + diff.removed.length;
              const fileCountLabel = `${files.length} file${files.length === 1 ? '' : 's'}`;
              const title = snapshot.label || snapshotKindLabel(snapshot);
              const exactDate = snapshot.createdAt ? new Date(snapshot.createdAt).toLocaleString() : 'Recorded';

              return (
                <article key={snapshot.id} className="bolt-project-snapshot-card">
                  <div className="bolt-project-snapshot-rail" aria-hidden>
                    <span />
                  </div>
                  <div className="bolt-project-snapshot-body">
                    <div className="bolt-project-snapshot-main">
                      <div className="bolt-project-snapshot-title-row">
                        <span className="bolt-project-snapshot-kind">{snapshotAuthor(snapshot)}</span>
                        <strong title={title}>{title}</strong>
                      </div>
                      <div className="bolt-project-snapshot-meta" aria-label="Checkpoint metadata">
                        <span title={exactDate}>{timeAgo(snapshot.createdAt)}</span>
                        <span>{fileCountLabel}</span>
                        <span>{formatBytes(snapshot.byteLength)}</span>
                        <span>{modifiedCount ? `${modifiedCount} changed` : 'Baseline'}</span>
                      </div>
                      <details className="bolt-project-snapshot-diff">
                        <summary title={diff.sample.length ? diff.sample.join('\n') : 'No file metadata recorded'}>
                          Preview changed files
                        </summary>
                        {diff.sample.length ? (
                          <ul>
                            {diff.sample.map((path) => {
                              const marker = diff.added.includes(path)
                                ? 'A'
                                : diff.removed.includes(path)
                                  ? 'D'
                                  : diff.changed.includes(path)
                                    ? 'M'
                                    : '·';

                              return (
                                <li key={path} data-marker={marker}>
                                  <span>{marker}</span>
                                  <code>{path}</code>
                                </li>
                              );
                            })}
                          </ul>
                        ) : (
                          <p>No file manifest was recorded for this checkpoint.</p>
                        )}
                      </details>
                    </div>
                    <form onSubmit={onSubmit} className="bolt-project-snapshot-actions">
                      <input name="intent" value="restore" type="hidden" />
                      <input name="snapshotId" value={snapshot.id} type="hidden" />
                      <button type="submit" disabled={busy} aria-label={`Restore checkpoint ${title}`}>
                        Restore
                      </button>
                    </form>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="bolt-project-snapshots-empty">
            <strong>No checkpoints yet</strong>
            <p>Create a checkpoint before major edits, package upgrades, or AI-led refactors.</p>
          </div>
        )}
      </section>
    );
  }

  if (panel === 'deployments') {
    return (
      <ProjectDeploymentsPanel data={data} project={project} projectId={projectId} onSubmit={onSubmit} busy={busy} />
    );
  }

  if (panel === 'env') {
    return <ProjectEnvPanel data={data} onSubmit={onSubmit} busy={busy} />;
  }

  if (panel === 'secrets') {
    return <ProjectSecretsPanel projectId={projectId} data={data} onSubmit={onSubmit} busy={busy} reload={reload} />;
  }

  if (panel === 'collaborators') {
    const collaborators = data.collaborators ?? [];
    const presence = dedupeCollaborationPresence(data.presence ?? []);
    const comments = data.comments ?? [];
    const activity = data.activity ?? [];
    const shareLinks = data.shareLinks ?? [];
    const terminalPermissions = data.terminalPermissions ?? {};
    const aiConversation = data.aiConversation ?? { shared: false, mode: 'comment' };
    const realtime = data.realtime ?? { status: 'idle' };

    const realtimeLabel =
      realtime.status === 'connected'
        ? 'Live'
        : realtime.status === 'reconnecting'
          ? 'Reconnecting'
          : realtime.status === 'error'
            ? 'Offline'
            : 'Connecting';

    return (
      <div className="bolt-project-collaboration-tool">
        <section className="bolt-project-collaboration-card">
          <div className="bolt-project-collaboration-header">
            <div>
              <h3>Presence</h3>
              <p>{presence.length} online users with live cursor and selection sync.</p>
            </div>
            <span className="bolt-project-collaboration-live">{realtimeLabel}</span>
          </div>
          {realtime.error ? <div className="bolt-project-empty-panel">{realtime.error}</div> : null}
          <div className="bolt-project-collaboration-users">
            {presence.length ? (
              presence.map((user: any) => (
                <div key={user.sessionId} className="bolt-project-collaboration-user">
                  <span className="bolt-project-collaboration-avatar">{String(user.userId ?? 'U').slice(0, 2)}</span>
                  <div>
                    <strong>{user.userId}</strong>
                    <small>
                      {user.mode ?? 'editing'} {user.filePath ? `in ${user.filePath}` : ''}
                    </small>
                  </div>
                  <em>{user.status ?? 'online'}</em>
                </div>
              ))
            ) : (
              <div className="bolt-project-empty-panel">No active presence yet.</div>
            )}
          </div>
        </section>

        <section className="bolt-project-collaboration-card">
          <div className="bolt-project-collaboration-header">
            <div>
              <h3>Role-based collaborators</h3>
              <p>Project access is enforced by the backend before editing, comments and terminal access.</p>
            </div>
          </div>
          <div className="bolt-project-collaboration-list">
            {collaborators.length ? (
              collaborators.map((collaborator: any) => (
                <div key={collaborator.id} className="bolt-project-collaboration-row">
                  <span>{collaborator.userId}</span>
                  <strong>{collaborator.roleKey}</strong>
                  <form method="post" onSubmit={onSubmit}>
                    <input type="hidden" name="intent" value="terminal-permission" />
                    <input type="hidden" name="userId" value={collaborator.userId} />
                    <input
                      type="hidden"
                      name="allowed"
                      value={terminalPermissions[collaborator.userId]?.allowed ? 'false' : 'true'}
                    />
                    <PanelButton disabled={busy} variant="outline">
                      {terminalPermissions[collaborator.userId]?.allowed ? 'Revoke terminal' : 'Allow terminal'}
                    </PanelButton>
                  </form>
                </div>
              ))
            ) : (
              <div className="bolt-project-empty-panel">No project collaborators.</div>
            )}
          </div>
          <form onSubmit={onSubmit} className="bolt-project-collaboration-form">
            <label className="bolt-project-collaboration-field">
              <span>Collaborator</span>
              <PanelInput
                name="userId"
                placeholder="email or username"
                autoComplete="username email"
                required
                pattern="(^[^@\s]+@[^@\s]+\.[^@\s]+$)|(^[a-zA-Z0-9][a-zA-Z0-9._-]{1,62}$)"
                title="Enter a valid email address or username. Usernames can contain letters, numbers, dots, underscores and hyphens."
                aria-describedby="collaborator-identity-help"
              />
              <small id="collaborator-identity-help">
                Invite by email or username. The backend resolves this value before granting project access.
              </small>
            </label>
            <label className="bolt-project-collaboration-field">
              <span>Role</span>
              <select
                name="roleKey"
                defaultValue="member"
                title="Viewer can inspect the project, member can edit, admin can manage collaborators. Owner is reserved for project ownership transfers."
                aria-describedby="collaborator-role-help"
              >
                {['viewer', 'member', 'admin', 'owner'].map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
              <small id="collaborator-role-help">
                Viewer: read-only access. Member: edit and comment. Admin: manage project access. Owner: ownership-level
                access.
              </small>
            </label>
            <div className="bolt-project-collaboration-role-guide" aria-label="Role permissions">
              {[
                ['viewer', 'Can view files, preview and comments without editing.'],
                ['member', 'Can edit files, comment, and collaborate in the workspace.'],
                ['admin', 'Can manage collaborators, sharing, comments and access settings.'],
              ].map(([role, description]) => (
                <span key={role} title={description}>
                  <strong>{role}</strong>
                  {description}
                </span>
              ))}
            </div>
            <div>
              <PanelButton disabled={busy}>Invite to project</PanelButton>
            </div>
          </form>
        </section>

        <section className="bolt-project-collaboration-card">
          <div className="bolt-project-collaboration-header">
            <div>
              <h3>Comments</h3>
              <p>Members can leave file comments without requiring a file lock.</p>
            </div>
          </div>
          <div className="bolt-project-collaboration-list">
            {comments.length ? (
              comments.slice(-6).map((comment: any) => (
                <div key={comment.id} className="bolt-project-collaboration-comment">
                  <strong>
                    {comment.filePath ?? 'Project'} {comment.line ? `:${comment.line}` : ''}
                  </strong>
                  <p>{comment.body}</p>
                  <small>{comment.userId}</small>
                </div>
              ))
            ) : (
              <div className="bolt-project-empty-panel">No comments yet.</div>
            )}
          </div>
          <form onSubmit={onSubmit} className="bolt-project-collaboration-form">
            <input type="hidden" name="intent" value="comment" />
            <PanelInput name="filePath" placeholder="src/App.tsx" />
            <PanelInput name="line" placeholder="Line" />
            <PanelInput name="body" placeholder="Comment" required />
            <PanelButton disabled={busy}>Add comment</PanelButton>
          </form>
        </section>

        <section className="bolt-project-collaboration-card">
          <div className="bolt-project-collaboration-header">
            <div>
              <h3>Sharing and pair programming</h3>
              <p>Expiring links, shared AI conversation policy and read-only modes stay scoped to this project.</p>
            </div>
          </div>
          <div className="bolt-project-collaboration-grid">
            <form onSubmit={onSubmit} className="bolt-project-collaboration-form">
              <input type="hidden" name="intent" value="share-link" />
              <select name="roleKey" defaultValue="viewer">
                <option value="viewer">Read-only link</option>
                <option value="member">Pair-programming link</option>
              </select>
              <PanelInput name="expiresInMinutes" placeholder="Expires in minutes" defaultValue="1440" />
              <PanelButton disabled={busy}>Create expiring link</PanelButton>
            </form>
            <form onSubmit={onSubmit} className="bolt-project-collaboration-form">
              <input type="hidden" name="intent" value="ai-sharing" />
              <input type="hidden" name="shared" value={aiConversation.shared ? 'false' : 'true'} />
              <select name="mode" defaultValue={aiConversation.mode ?? 'comment'}>
                <option value="read-only">AI read-only</option>
                <option value="comment">AI comments</option>
                <option value="pair-programming">AI pair programming</option>
              </select>
              <PanelButton disabled={busy} variant="outline">
                {aiConversation.shared ? 'Disable shared AI' : 'Enable shared AI'}
              </PanelButton>
            </form>
          </div>
          <PanelRows
            rows={shareLinks.map((link: any) => [link.roleKey, `Expires ${link.expiresAt}`])}
            empty="No active share links."
          />
        </section>

        <section className="bolt-project-collaboration-card">
          <div className="bolt-project-collaboration-header">
            <div>
              <h3>Activity feed</h3>
              <p>Collaboration actions create audit and project activity events.</p>
            </div>
          </div>
          <PanelRows
            rows={activity
              .slice(-8)
              .map((event: any) => [event.action, event.actorUserId ? `By ${event.actorUserId}` : 'System'])}
            empty="No collaboration activity yet."
          />
        </section>
      </div>
    );
  }

  if (panel === 'domains') {
    return <ProjectDomainsPanel data={data} onSubmit={onSubmit} busy={busy} />;
  }

  if (panel === 'git') {
    /*
     * Canonical Git pane: render the single, Replit-parity GitTab (single-column
     * layout, rich diff, inline merge editor #8, commit-detail/restore #3,
     * last-fetched + remote-URL-edit + commit-author #5). This replaces the older
     * inline ProjectGitPanel duplicate so the user-facing IDE and the Bolt
     * workbench share ONE implementation. GitTab self-fetches and reads the same
     * CurrentWorkspaceProvider the IDE route already wraps this tree in.
     */
    return <GitTab projectId={project.id} />;
  }

  if (panel === 'settings') {
    const settings = data.project ?? project;

    return <ProjectSettingsPanel settings={settings} data={data} onSubmit={onSubmit} busy={busy} />;
  }

  if (panel === 'activity') {
    return <ProjectActivityPanel data={data} reload={reload} busy={busy} lastLoadedAt={lastLoadedAt} />;
  }

  return <PanelRows rows={[]} empty="Panel not available." />;
}

function ProjectDomainsPanel({
  data: dataProp,
  onSubmit: onSubmitProp,
  busy: busyProp,
  projectId,
}: {
  data?: any;
  onSubmit?: any;
  busy?: boolean;
  projectId?: string;
}) {
  /*
   * Two modes over the SAME /ide-panel/domains loader+action (one domains UI,
   * Replit-style under Deploy):
   *  - self-contained (projectId given, used by the Deploy → Domains tab):
   *    self-fetch the list and self-submit add/verify/delete to the domains
   *    endpoint, since the Deploy panel's own onSubmit targets `deployments`;
   *  - framework mode (data/onSubmit/busy from the panel host) — legacy path.
   */
  const selfMode = Boolean(projectId);
  const [selfData, setSelfData] = useState<any>(null);
  const [selfBusy, setSelfBusy] = useState(false);

  const loadDomains = useCallback(async () => {
    if (!projectId) {
      return;
    }

    try {
      const response = await fetch(`/api/projects/${projectId}/ide-panel/domains`, {
        headers: { accept: 'application/json' },
      });

      const envelope = (await response.json().catch(() => ({}))) as any;
      setSelfData(envelope?.data ?? envelope ?? {});
    } catch {
      // Non-fatal: keep whatever we last had.
    }
  }, [projectId]);

  useEffect(() => {
    if (selfMode) {
      void loadDomains();
    }
  }, [selfMode, loadDomains]);

  const selfSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      if (!projectId) {
        return;
      }

      const form = new FormData(event.currentTarget);
      setSelfBusy(true);

      try {
        const response = await fetch(`/api/projects/${projectId}/ide-panel/domains`, { method: 'POST', body: form });

        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as { error?: string };
          toast.error(payload.error ?? 'Domain update failed.');
        }

        await loadDomains();
      } catch {
        toast.error('Domain update failed — please retry.');
      } finally {
        setSelfBusy(false);
      }
    },
    [projectId, loadDomains],
  );

  const data = selfMode ? (selfData ?? {}) : (dataProp ?? {});
  const onSubmit = selfMode ? selfSubmit : onSubmitProp;
  const busy = selfMode ? selfBusy : Boolean(busyProp);

  const domains = data.domains ?? [];
  const latestReadyDeployment = (data.deployments ?? []).find((deployment: any) => deployment.status === 'READY');
  const deploymentHost = getHostname(latestReadyDeployment?.productionUrl ?? latestReadyDeployment?.url);
  const hasRoutingTarget = Boolean(deploymentHost);

  return (
    <div className="bolt-project-domains-panel">
      <section className="bolt-project-domains-hero" aria-labelledby="domains-title">
        <div>
          <span className="bolt-project-domains-kicker">Domains</span>
          <h3 id="domains-title">Production routing, DNS verification and managed TLS</h3>
          <p>
            Add a hostname, publish the DNS records below, then verify. E-Code keeps redirect, wildcard and TLS
            readiness as backend state for this organization.
          </p>
        </div>
        <div className="bolt-project-domain-target-card">
          <span>Deployment target</span>
          <strong>{deploymentHost ?? 'Create a ready deployment first'}</strong>
          <small>
            {hasRoutingTarget
              ? 'Use this host as the CNAME or ALIAS target.'
              : 'The CNAME/A instructions unlock after the first successful deployment.'}
          </small>
        </div>
      </section>

      <div className="bolt-project-domains-layout">
        <section className="bolt-project-domain-add-card" aria-labelledby="add-domain-title">
          <div>
            <h4 id="add-domain-title">Add domain</h4>
            <p>Use a fully qualified domain. Wildcards are enabled per domain after it is created.</p>
          </div>
          <form onSubmit={onSubmit} className="bolt-project-domain-add-form">
            <label>
              Domain
              <PanelInput
                name="domain"
                inputMode="url"
                autoComplete="off"
                placeholder="app.example.com"
                pattern="^(?:[A-Za-z0-9](?:(?:[A-Za-z0-9]|-){0,61}[A-Za-z0-9])?[.])+[A-Za-z]{2,}$"
                title="Enter a valid domain such as app.example.com"
                aria-describedby="domain-help"
                required
              />
            </label>
            <small id="domain-help">No protocol, path or port. Example: app.example.com.</small>
            <PanelButton disabled={busy}>Add domain</PanelButton>
          </form>
        </section>

        {domains.length ? (
          <div className="bolt-project-domain-list">
            {domains.map((domain: any) => (
              <DomainVerificationCard
                key={domain.id}
                domain={domain}
                deploymentHost={deploymentHost}
                onSubmit={onSubmit}
                busy={busy}
              />
            ))}
          </div>
        ) : (
          <div className="bolt-project-domain-empty">
            <strong>No custom domains yet</strong>
            <span>Add a domain to generate organization-specific TXT verification records.</span>
          </div>
        )}
      </div>
    </div>
  );
}

function DomainVerificationCard({
  domain,
  deploymentHost,
  onSubmit,
  busy,
}: {
  domain: any;
  deploymentHost?: string;
  onSubmit: any;
  busy: boolean;
}) {
  const txtName = `_vibecore.${domain.domain}`;
  const txtValue = `vibecore-domain-verification=${domain.verificationToken}`;
  const rootName = domain.domain.split('.').length === 2 ? '@' : domain.domain.split('.')[0];

  const records = [
    { type: 'TXT', name: txtName, value: txtValue, state: 'Required' },
    {
      type: 'CNAME',
      name: rootName === '@' ? 'www' : rootName,
      value: deploymentHost ?? 'Waiting for a ready deployment',
      state: deploymentHost ? 'Routing' : 'Blocked',
    },
    {
      type: 'A / ALIAS',
      name: '@',
      value: deploymentHost ? `ALIAS or ANAME to ${deploymentHost}` : 'Waiting for a ready deployment',
      state: deploymentHost ? 'Apex' : 'Blocked',
    },
  ];

  if (domain.wildcardEnabled) {
    records.push({
      type: 'CNAME',
      name: `*.${domain.domain}`,
      value: deploymentHost ?? 'Waiting for a ready deployment',
      state: deploymentHost ? 'Wildcard' : 'Blocked',
    });
  }

  return (
    <article className="bolt-project-domain-card">
      <div className="bolt-project-domain-card-header">
        <div>
          <h4>{domain.domain}</h4>
          <p>Created {formatDomainDate(domain.createdAt)}</p>
        </div>
        <span className={classNames('bolt-project-domain-status', domain.verifiedAt ? 'verified' : 'pending')}>
          {domain.verifiedAt ? 'DNS verified' : 'Pending DNS'}
        </span>
      </div>

      <div className="bolt-project-domain-status-grid">
        <div>
          <span>Verification</span>
          <strong>{domain.verifiedAt ? formatDomainDate(domain.verifiedAt) : 'TXT record required'}</strong>
        </div>
        <div>
          <span>Auto TLS</span>
          <strong>
            {domain.sslStatus === 'dns_verified' ? 'Ready for certificate provisioning' : 'Waiting for DNS'}
          </strong>
        </div>
        <div>
          <span>WWW redirect</span>
          <strong>{domain.redirectWww ? 'Enabled' : 'Disabled'}</strong>
        </div>
        <div>
          <span>Wildcard</span>
          <strong>{domain.wildcardEnabled ? 'Enabled' : 'Off'}</strong>
        </div>
      </div>

      <div className="bolt-project-dns-records" aria-label={`DNS records for ${domain.domain}`}>
        <div className="bolt-project-dns-records-head">
          <span>Type</span>
          <span>Name</span>
          <span>Value</span>
          <span>Status</span>
        </div>
        {records.map((record) => (
          <div key={`${record.type}-${record.name}`} className="bolt-project-dns-record">
            <code>{record.type}</code>
            <code>{record.name}</code>
            <code title={record.value}>{record.value}</code>
            <span>{record.state}</span>
          </div>
        ))}
      </div>

      <div className="bolt-project-domain-actions">
        <form onSubmit={onSubmit}>
          <input name="intent" value="verify" type="hidden" />
          <input name="domain" value={domain.domain} type="hidden" />
          <PanelButton disabled={busy} variant={domain.verifiedAt ? 'outline' : undefined}>
            {domain.verifiedAt ? 'Recheck DNS' : 'Verify DNS'}
          </PanelButton>
        </form>

        <form onSubmit={onSubmit} className="bolt-project-domain-options">
          <input name="intent" value="configure" type="hidden" />
          <input name="domain" value={domain.domain} type="hidden" />
          <input name="redirectWww" value="false" type="hidden" />
          <label>
            <input name="redirectWww" value="true" type="checkbox" defaultChecked={domain.redirectWww} />
            Redirect www
          </label>
          <input name="wildcardEnabled" value="false" type="hidden" />
          <label>
            <input name="wildcardEnabled" value="true" type="checkbox" defaultChecked={domain.wildcardEnabled} />
            Wildcard subdomains
          </label>
          <PanelButton disabled={busy} variant="outline">
            Save routing
          </PanelButton>
        </form>
      </div>
    </article>
  );
}

function getHostname(url?: string) {
  if (!url) {
    return undefined;
  }

  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}

function formatDomainDate(value?: string) {
  if (!value) {
    return 'Not available';
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function ProjectActivityPanel({
  data,
  reload,
  busy,
  lastLoadedAt,
}: {
  data: any;
  reload?: () => void | Promise<void>;
  busy: boolean;
  lastLoadedAt?: string;
}) {
  const events = data.activity ?? [];
  const [query, setQuery] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [actorFilter, setActorFilter] = useState('all');
  const [periodFilter, setPeriodFilter] = useState<'all' | '15m' | '1h' | '24h'>('all');
  const [expandedEventId, setExpandedEventId] = useState<string>();

  const filterOptions = useMemo(() => {
    const actions = Array.from(new Set(events.map((event: any) => event.action).filter(Boolean))).sort() as string[];

    const actors = Array.from(
      new Set(events.map((event: any) => event.actorUserId).filter(Boolean)),
    ).sort() as string[];

    return { actions, actors };
  }, [events]);

  /*
   * Quick-filter chips: the most frequent event types and the most active
   * members, so a single tap deep-links the stream to that type/actor (reusing
   * the same actionFilter/actorFilter state the selects drive).
   */
  const quickChips = useMemo(() => {
    const actionCounts = new Map<string, number>();
    const actorCounts = new Map<string, number>();

    for (const event of events) {
      if (event.action) {
        actionCounts.set(event.action, (actionCounts.get(event.action) ?? 0) + 1);
      }

      if (event.actorUserId) {
        actorCounts.set(event.actorUserId, (actorCounts.get(event.actorUserId) ?? 0) + 1);
      }
    }

    const topActions = Array.from(actionCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
    const topActors = Array.from(actorCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    return { topActions, topActors };
  }, [events]);

  const filteredEvents = useMemo(() => {
    const search = query.trim().toLowerCase();
    const now = Date.now();

    const periodMs =
      periodFilter === '15m'
        ? 15 * 60 * 1000
        : periodFilter === '1h'
          ? 60 * 60 * 1000
          : periodFilter === '24h'
            ? 24 * 60 * 60 * 1000
            : 0;

    return events.filter((event: any) => {
      if (actionFilter !== 'all' && event.action !== actionFilter) {
        return false;
      }

      if (actorFilter !== 'all' && event.actorUserId !== actorFilter) {
        return false;
      }

      if (periodMs && event.createdAt && now - new Date(event.createdAt).getTime() > periodMs) {
        return false;
      }

      if (!search) {
        return true;
      }

      return (
        String(event.action ?? '')
          .toLowerCase()
          .includes(search) ||
        String(event.actorUserId ?? '')
          .toLowerCase()
          .includes(search) ||
        JSON.stringify(event.metadata ?? {})
          .toLowerCase()
          .includes(search)
      );
    });
  }, [actionFilter, actorFilter, events, periodFilter, query]);

  const ideSaveCount = events.filter((event: any) => event.action === 'project.ide_state.save').length;
  const importantCount = events.filter((event: any) => classifyProjectActivity(event.action) !== 'routine').length;

  return (
    <section className="bolt-project-activity-panel" aria-label="Project activity audit trail">
      <header className="bolt-project-activity-hero">
        <div>
          <span className="bolt-project-activity-eyebrow">Audit trail</span>
          <h3>Project activity</h3>
          <p>
            Backend activity, collaboration changes and operational events. Routine IDE UI saves are suppressed before
            they reach the activity stream.
          </p>
        </div>
        <button type="button" onClick={() => void reload?.()} disabled={busy}>
          <span className="i-ph:arrows-clockwise" aria-hidden />
          {busy ? 'Refreshing' : 'Refresh now'}
        </button>
      </header>

      <div className="bolt-project-activity-metrics" aria-label="Activity summary">
        <article>
          <span>Total events</span>
          <strong>{events.length}</strong>
          <small>
            {lastLoadedAt ? `Updated ${new Date(lastLoadedAt).toLocaleTimeString()}` : 'Live refresh every 15s'}
          </small>
        </article>
        <article>
          <span>Important</span>
          <strong>{importantCount}</strong>
          <small>Exports, deploys, collaborators, Git and runtime actions</small>
        </article>
        <article data-tone={ideSaveCount > 10 ? 'warning' : 'neutral'}>
          <span>IDE state saves</span>
          <strong>{ideSaveCount}</strong>
          <small>{ideSaveCount > 10 ? 'Legacy noise detected in current window' : 'Noise controlled'}</small>
        </article>
      </div>

      <div className="bolt-project-activity-filters">
        <label>
          <span>Search</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find action, user or payload..."
            aria-label="Search project activity"
          />
        </label>
        <label>
          <span>Type</span>
          <select value={actionFilter} onChange={(event) => setActionFilter(event.target.value)}>
            <option value="all">All event types</option>
            {filterOptions.actions.map((action: string) => (
              <option key={action} value={action}>
                {formatProjectActivityAction(action)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>User</span>
          <select value={actorFilter} onChange={(event) => setActorFilter(event.target.value)}>
            <option value="all">All users</option>
            {filterOptions.actors.map((actor: string) => (
              <option key={actor} value={actor}>
                {actor}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Period</span>
          <select value={periodFilter} onChange={(event) => setPeriodFilter(event.target.value as any)}>
            <option value="all">All time</option>
            <option value="15m">Last 15 minutes</option>
            <option value="1h">Last hour</option>
            <option value="24h">Last 24 hours</option>
          </select>
        </label>
      </div>

      {quickChips.topActions.length || quickChips.topActors.length ? (
        <div className="bolt-project-activity-chips" aria-label="Quick filters">
          {quickChips.topActions.map(([action, count]) => (
            <FilterChip
              key={`type-${action}`}
              icon="i-ph:tag"
              label={formatProjectActivityAction(action)}
              value={count}
              active={actionFilter === action}
              onClick={() => setActionFilter((current) => (current === action ? 'all' : action))}
            />
          ))}
          {quickChips.topActors.map(([actor, count]) => (
            <FilterChip
              key={`actor-${actor}`}
              icon="i-ph:user"
              label={actor}
              value={count}
              active={actorFilter === actor}
              onClick={() => setActorFilter((current) => (current === actor ? 'all' : actor))}
            />
          ))}
          {actionFilter !== 'all' || actorFilter !== 'all' ? (
            <FilterChip
              icon="i-ph:x-circle"
              label="Clear filters"
              onClick={() => {
                setActionFilter('all');
                setActorFilter('all');
              }}
            />
          ) : null}
        </div>
      ) : null}

      <div className="bolt-project-activity-list" role="list" aria-live="polite">
        {filteredEvents.length ? (
          filteredEvents.map((event: any) => {
            const expanded = expandedEventId === event.id;
            const severity = classifyProjectActivity(event.action);
            const deepLink = activityDeepLink(event);

            return (
              <article key={event.id} className="bolt-project-activity-event" data-severity={severity} role="listitem">
                <button
                  type="button"
                  className="bolt-project-activity-event-main"
                  onClick={() => setExpandedEventId(expanded ? undefined : event.id)}
                  aria-expanded={expanded}
                >
                  <span className="bolt-project-activity-dot" aria-hidden />
                  <span>
                    <strong>{formatProjectActivityAction(event.action)}</strong>
                    <small>
                      {event.createdAt ? new Date(event.createdAt).toLocaleString() : 'Recorded by backend'}
                      {event.actorUserId ? ` · ${event.actorUserId}` : ' · system'}
                    </small>
                  </span>
                  <em>{severity}</em>
                  <span className={expanded ? 'i-ph:caret-up' : 'i-ph:caret-down'} aria-hidden />
                </button>
                {deepLink ? (
                  <a
                    className="bolt-project-activity-deeplink"
                    href={deepLink.href}
                    target={deepLink.href.startsWith('/') ? undefined : '_blank'}
                    rel={deepLink.href.startsWith('/') ? undefined : 'noreferrer noopener'}
                  >
                    <span className="i-ph:arrow-square-out" aria-hidden />
                    {deepLink.label}
                  </a>
                ) : null}
                {expanded ? (
                  <pre className="bolt-project-activity-payload">
                    {JSON.stringify(
                      {
                        id: event.id,
                        action: event.action,
                        actorUserId: event.actorUserId ?? null,
                        createdAt: event.createdAt,
                        metadata: event.metadata ?? {},
                      },
                      null,
                      2,
                    )}
                  </pre>
                ) : null}
              </article>
            );
          })
        ) : (
          <div className="bolt-project-empty-panel">No activity matches the current filters.</div>
        )}
      </div>
    </section>
  );
}

function formatProjectActivityAction(action: string) {
  return String(action ?? 'project.activity')
    .replace(/^project\./, '')
    .replace(/\./g, ' / ')
    .replace(/_/g, ' ');
}

/*
 * A real, resolvable deep link for an activity event, or null. We only surface a
 * link when the backend actually recorded a target (a URL in metadata, or a
 * deploy/preview URL) — never a fabricated one.
 */
function activityDeepLink(event: any): { href: string; label: string } | null {
  const metadata = (event?.metadata ?? {}) as Record<string, unknown>;
  const candidate = metadata.url ?? metadata.href ?? metadata.link ?? metadata.deploymentUrl ?? metadata.previewUrl;

  if (typeof candidate === 'string' && /^https?:\/\//i.test(candidate)) {
    return { href: candidate, label: 'Open' };
  }

  if (typeof metadata.path === 'string' && metadata.path.startsWith('/')) {
    return { href: metadata.path, label: 'View' };
  }

  return null;
}

function classifyProjectActivity(action: string) {
  if (/delete|fail|error|rollback|abuse|revoke/i.test(action)) {
    return 'critical';
  }

  if (/deploy|export|import|create_from_ai|collaborator|secret|snapshot|git|domain/i.test(action)) {
    return 'important';
  }

  if (action === 'project.ide_state.save') {
    return 'routine';
  }

  return 'normal';
}

function ProjectSettingsPanel({
  settings,
  data,
  onSubmit,
  busy,
}: {
  settings: any;
  data: any;
  onSubmit: any;
  busy: boolean;
}) {
  const [draft, setDraft] = useState({
    name: settings.name ?? '',
    description: settings.description ?? '',
    gitRepositoryUrl: settings.gitRepositoryUrl ?? '',
    gitDefaultBranch: settings.gitDefaultBranch ?? 'main',
  });

  const [settingsTab, setSettingsTab] = useState('project');
  const [memoryDraft, setMemoryDraft] = useState('');
  const [memoryType, setMemoryType] = useState('semantic');
  const [memoryTags, setMemoryTags] = useState('');
  const [memoryError, setMemoryError] = useState<string>();
  const [memoryLoading, setMemoryLoading] = useState(false);
  const [memories, setMemories] = useState<any[]>([]);
  const [memoryEnabled, setMemoryEnabled] = useState(true);
  const [memoryEditId, setMemoryEditId] = useState<string>();
  const [memoryEditDraft, setMemoryEditDraft] = useState('');
  const [memoryEditType, setMemoryEditType] = useState('semantic');
  const [memoryEditTags, setMemoryEditTags] = useState('');
  const [settingsNotice, setSettingsNotice] = useState('');
  const settingsNoticeRef = useRef('Settings saved.');
  const pendingThemePreferenceRef = useRef<ProjectThemePreference | undefined>(undefined);
  const accountUser = data.account?.user ?? {};
  const sessions = data.sessions?.sessions ?? [];
  const state = data.settingsState ?? {};
  const persistedThemePreference = state.preferences?.theme;

  /*
   * Default to 'system' (follow the user's persisted global light/dark choice), NOT a
   * hardcoded 'dark' — a project with no explicit per-IDE theme override must inherit
   * the theme chosen in the user area, so opening a template in light mode stays light.
   */
  const preferences = state.preferences ?? { theme: 'system', keyboardMode: false, creditAlertThreshold: 80 };
  const notifications = state.notifications ?? {};

  const keybindingOverrides: KeybindingOverrideMap =
    state.keybindings?.overrides && typeof state.keybindings.overrides === 'object' ? state.keybindings.overrides : {};

  const aiRouting = state.aiRouting ?? {
    defaultProvider: 'openai',
    defaultModel: 'openai:managed-default',
    fallbackProvider: 'openrouter',
    fallbackEnabled: true,
  };

  const secrets = data.secrets ?? [];
  const billing = data.billing ?? {};
  const aiUsage = data.aiUsage?.usage ?? [];

  const settingsSections: Array<{
    group: string;
    description: string;
    items: Array<[string, string, string]>;
  }> = [
    {
      // Replit parity: three settings groups — Workspace / Account / User.
      group: 'Workspace',
      description: 'Shared project configuration and governance.',
      items: [
        ['project', 'Project', 'Metadata, repository and export controls'],
        ['security', 'Security', 'Password policy, sessions and account protection'],
        ['ai', 'AI', 'Provider routing, agent defaults and keys'],
      ],
    },
    {
      group: 'Account',
      description: 'Plan, usage and billing for this account.',
      items: [['usage', 'Usage', 'Plan, limits, usage events and quotas']],
    },
    {
      group: 'User',
      description: 'Your profile, agent memory and IDE preferences.',
      items: [
        ['account', 'Account', 'Profile and connected accounts'],
        ['memory', 'Memory', 'Persistent agent memory'],
        ['preferences', 'Preferences', 'Theme, keyboard and notifications'],
      ],
    },
  ];

  const activeSettingsItem = settingsSections.flatMap((section) => section.items).find(([id]) => id === settingsTab);

  const providers: Array<{ id: string; label: string; secretKey: string; models: string[] }> = [
    {
      id: 'openai',
      label: 'OpenAI',
      secretKey: 'OPENAI_API_KEY',
      models: ['gpt-5.4', 'gpt-5.4-mini', 'gpt-5.3-codex'],
    },
    {
      id: 'anthropic',
      label: 'Anthropic',
      secretKey: 'ANTHROPIC_API_KEY',
      models: ['claude-sonnet-4.5', 'claude-opus-4.1'],
    },
    {
      id: 'google',
      label: 'Google',
      secretKey: 'GOOGLE_API_KEY',
      models: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-3.5-flash'],
    },
    {
      id: 'openrouter',
      label: 'OpenRouter',
      secretKey: 'OPENROUTER_API_KEY',
      models: ['openrouter:auto', 'anthropic/claude-sonnet-4.5'],
    },
  ];
  const notificationRows = [
    ['agent', 'Agent', 'Agent needs help or finished working'],
    ['billing', 'Billing', 'Plan changes, quota warnings, payment updates'],
    ['deployment', 'Deployments', 'Deployment status changes'],
    ['security', 'Security', 'Security scan results and alerts'],
    ['team', 'Team', 'Team invitations and member changes'],
    ['system', 'System', 'System updates and maintenance notices'],
  ];
  const keyboardSections = (['File', 'Navigation', 'Workbench', 'Editor', 'Agent', 'Terminal', 'Help'] as const)
    .map((category) => ({
      category,
      bindings: applyKeybindingOverrides(PROJECT_KEYBINDINGS, keybindingOverrides).filter(
        (binding) => binding.category === category,
      ),
    }))
    .filter((section) => section.bindings.length > 0);

  const keyboardConflicts = detectKeybindingConflicts(
    applyKeybindingOverrides(PROJECT_KEYBINDINGS, keybindingOverrides),
  );

  const initials =
    String(accountUser.name ?? accountUser.email ?? settings.name ?? 'VC')
      .slice(0, 2)
      .toUpperCase() || 'VC';

  useEffect(() => {
    setDraft({
      name: settings.name ?? '',
      description: settings.description ?? '',
      gitRepositoryUrl: settings.gitRepositoryUrl ?? '',
      gitDefaultBranch: settings.gitDefaultBranch ?? 'main',
    });
  }, [settings.name, settings.description, settings.gitRepositoryUrl, settings.gitDefaultBranch]);

  function updateDraft(key: keyof typeof draft) {
    return (event: any) => setDraft((current) => ({ ...current, [key]: event.target.value }));
  }

  function submitWithNotice(message: string) {
    return (event: React.FormEvent<HTMLFormElement>) => {
      const formData = new FormData(event.currentTarget);
      const intent = String(formData.get('intent') ?? '');

      if (intent === 'preferences') {
        const themePreference = formData.get('theme');
        pendingThemePreferenceRef.current = isProjectThemePreference(themePreference) ? themePreference : DEFAULT_THEME;
      }

      settingsNoticeRef.current = message;
      setSettingsNotice('Saving changes...');
      onSubmit(event);
    };
  }

  useEffect(() => {
    if (isProjectThemePreference(persistedThemePreference)) {
      applyProjectThemePreference(persistedThemePreference);
    }
  }, [persistedThemePreference]);

  useEffect(() => {
    function handlePanelAction(event: Event) {
      const detail = (event as CustomEvent).detail ?? {};

      if (detail.panel !== 'settings') {
        return;
      }

      if (detail.intent === 'preferences') {
        const pendingThemePreference = pendingThemePreferenceRef.current;

        if (detail.ok && isProjectThemePreference(pendingThemePreference)) {
          applyProjectThemePreference(pendingThemePreference);
        }

        pendingThemePreferenceRef.current = undefined;
      }

      setSettingsNotice(detail.ok ? settingsNoticeRef.current : (detail.error ?? 'Settings action failed.'));
    }

    window.addEventListener('vibecore:ide-panel-action', handlePanelAction);

    return () => window.removeEventListener('vibecore:ide-panel-action', handlePanelAction);
  }, []);

  function formatSessionDevice(session: any) {
    const agent = String(session.userAgent ?? '').toLowerCase();

    if (agent.includes('mobile')) {
      return 'Mobile browser session';
    }

    if (agent.includes('chrome')) {
      return 'Chrome browser session';
    }

    if (agent.includes('firefox')) {
      return 'Firefox browser session';
    }

    if (agent.includes('safari')) {
      return 'Safari browser session';
    }

    if (agent.includes('node')) {
      return 'E-Code CLI or local development session';
    }

    return session.userAgent ? 'Browser session' : 'Authenticated session';
  }

  function formatSessionDetail(session: any) {
    const parts = [
      session.ipAddress ?? session.ip,
      session.createdAt ? `Created ${new Date(session.createdAt).toLocaleString()}` : undefined,
      session.expiresAt ? `Expires ${new Date(session.expiresAt).toLocaleString()}` : undefined,
    ].filter(Boolean);

    return parts.join(' - ') || session.id;
  }

  const usageByKey = new Map(
    (billing.usage ?? []).map((item: any) => [
      item.key ?? item.type ?? item.metric ?? item.name,
      Number(item.used ?? item.value ?? item.quantity ?? item.count ?? 0),
    ]),
  );

  const limitEntries = Object.entries(billing.limits ?? {});

  const aiUsageTotals = aiUsage.reduce(
    (totals: any, item: any) => ({
      inputTokens: totals.inputTokens + Number(item.inputTokens ?? item.promptTokens ?? 0),
      outputTokens: totals.outputTokens + Number(item.outputTokens ?? item.completionTokens ?? 0),
      cost: totals.cost + Number(item.costUsd ?? item.cost ?? 0),
    }),
    { inputTokens: 0, outputTokens: 0, cost: 0 },
  );

  function parseMemoryTags(value: string) {
    return [
      ...new Set(
        value
          .split(',')
          .map((tag) => tag.trim().toLowerCase())
          .filter(Boolean),
      ),
    ].slice(0, 20);
  }

  const loadMemories = useCallback(async () => {
    if (!settings.id) {
      return;
    }

    setMemoryLoading(true);
    setMemoryError(undefined);

    try {
      const response = await fetch(`/api/agent-memory?projectId=${encodeURIComponent(settings.id)}&limit=30`, {
        headers: { accept: 'application/json' },
      });
      const preferenceResponse = await fetch(
        `/api/agent-memory/preferences?projectId=${encodeURIComponent(settings.id)}`,
        {
          headers: { accept: 'application/json' },
        },
      );

      const payload = (await response.json()) as { memories?: any[]; error?: string };

      const preferencePayload = (await preferenceResponse.json().catch(() => ({}))) as {
        preference?: { enabled?: boolean };
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? 'Unable to load agent memory');
      }

      if (!preferenceResponse.ok) {
        throw new Error(preferencePayload.error ?? 'Unable to load agent memory preference');
      }

      setMemories(payload.memories ?? []);
      setMemoryEnabled(preferencePayload.preference?.enabled !== false);
    } catch (error) {
      setMemoryError(error instanceof Error ? error.message : 'Unable to load agent memory');
    } finally {
      setMemoryLoading(false);
    }
  }, [settings.id]);

  useEffect(() => {
    if (settingsTab === 'memory') {
      void loadMemories();
    }
  }, [loadMemories, settingsTab]);

  async function saveMemory(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!memoryDraft.trim()) {
      return;
    }

    setMemoryLoading(true);
    setMemoryError(undefined);

    try {
      const response = await fetch('/api/agent-memory', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          scope: 'project',
          projectId: settings.id,
          content: memoryDraft,
          memoryType,
          tags: parseMemoryTags(memoryTags),
          source: 'manual',
          force: true,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        skipped?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? 'Unable to save memory');
      }

      /*
       * The API returns 202 (ok) with a {skipped} reason (quota_exceeded /
       * too_short) when the write was NOT persisted — don't claim "saved".
       */
      if (response.status === 202 || payload.skipped) {
        setMemoryError(`Memory not saved: ${payload.skipped ?? 'rejected by the server'}.`);
        setSettingsNotice('Memory not saved.');

        return;
      }

      setMemoryDraft('');
      setMemoryTags('');
      setSettingsNotice('Memory saved.');
      await loadMemories();
    } catch (error) {
      setMemoryError(error instanceof Error ? error.message : 'Unable to save memory');
      setSettingsNotice('Memory action failed.');
    } finally {
      setMemoryLoading(false);
    }
  }

  async function deleteMemory(memoryId: string) {
    setMemoryLoading(true);
    setMemoryError(undefined);

    try {
      const response = await fetch(`/api/agent-memory/${encodeURIComponent(memoryId)}`, {
        method: 'DELETE',
        headers: { accept: 'application/json' },
      });

      const payload = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? 'Unable to delete memory');
      }

      setSettingsNotice('Memory deleted.');
      await loadMemories();
    } catch (error) {
      setMemoryError(error instanceof Error ? error.message : 'Unable to delete memory');
      setSettingsNotice('Memory action failed.');
    } finally {
      setMemoryLoading(false);
    }
  }

  async function toggleMemoryEnabled(enabled: boolean) {
    setMemoryLoading(true);
    setMemoryError(undefined);

    try {
      const response = await fetch('/api/agent-memory/preferences', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ projectId: settings.id, enabled }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        preference?: { enabled?: boolean };
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? 'Unable to update agent memory preference');
      }

      setMemoryEnabled(payload.preference?.enabled !== false);
      setSettingsNotice(enabled ? 'Agent memory enabled.' : 'Agent memory disabled.');
    } catch (error) {
      setMemoryError(error instanceof Error ? error.message : 'Unable to update agent memory preference');
      setSettingsNotice('Memory action failed.');
    } finally {
      setMemoryLoading(false);
    }
  }

  function startEditMemory(memory: any) {
    setMemoryEditId(memory.id);
    setMemoryEditDraft(memory.content ?? memory.summary ?? '');
    setMemoryEditType(memory.memoryType ?? 'semantic');
    setMemoryEditTags(Array.isArray(memory.tags) ? memory.tags.join(', ') : '');
  }

  async function saveEditedMemory(memoryId: string) {
    if (!memoryEditDraft.trim()) {
      return;
    }

    setMemoryLoading(true);
    setMemoryError(undefined);

    try {
      const response = await fetch(`/api/agent-memory/${encodeURIComponent(memoryId)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          content: memoryEditDraft,
          memoryType: memoryEditType,
          tags: parseMemoryTags(memoryEditTags),
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? 'Unable to update memory');
      }

      setMemoryEditId(undefined);
      setMemoryEditDraft('');
      setMemoryEditTags('');
      setSettingsNotice('Memory updated.');
      await loadMemories();
    } catch (error) {
      setMemoryError(error instanceof Error ? error.message : 'Unable to update memory');
      setSettingsNotice('Memory action failed.');
    } finally {
      setMemoryLoading(false);
    }
  }

  return (
    <div className="bolt-project-settings-hub" data-testid="settings-hub-panel">
      <header>
        <div>
          <h3>Account Settings</h3>
          <p>Project, identity, security, billing, AI credentials and IDE preferences backed by platform APIs.</p>
        </div>
        {settingsNotice ? (
          <span className="bolt-project-settings-status" role="status" aria-live="polite">
            {settingsNotice}
          </span>
        ) : null}
        <a href={`/api/projects/${settings.id}/project-action?intent=export`} target="_blank" rel="noreferrer">
          Export project
        </a>
      </header>

      <div className="bolt-project-settings-layout">
        <nav aria-label="Settings sections" className="bolt-project-settings-sidebar">
          {settingsSections.map((section) => (
            <section key={section.group}>
              <div>
                <strong>{section.group}</strong>
                <small>{section.description}</small>
              </div>
              {section.items.map(([id, label, description]) => (
                <button
                  key={id}
                  type="button"
                  aria-current={settingsTab === id ? 'page' : undefined}
                  onClick={() => setSettingsTab(id)}
                  data-testid={`button-settings-tab-${id}`}
                >
                  <span>{label}</span>
                  <small>{description}</small>
                </button>
              ))}
            </section>
          ))}
        </nav>

        <main className="bolt-project-settings-main">
          {activeSettingsItem ? (
            <div className="bolt-project-settings-active-heading">
              <span>{activeSettingsItem[1]}</span>
              <p>{activeSettingsItem[2]}</p>
            </div>
          ) : null}

          {settingsTab === 'project' && (
            <form
              onSubmit={submitWithNotice('Project settings saved to backend.')}
              className="bolt-project-settings-card"
            >
              <div className="bolt-project-settings-card-title">
                <h4>Project Metadata</h4>
                <small>These fields update `/projects/:id/settings` and are reflected in the IDE breadcrumb.</small>
              </div>
              <label>
                Project name
                <PanelInput
                  name="name"
                  value={draft.name}
                  onChange={updateDraft('name')}
                  required
                  aria-label="Project name"
                />
              </label>
              <label>
                Description
                <PanelInput
                  name="description"
                  value={draft.description}
                  onChange={updateDraft('description')}
                  aria-label="Project description"
                />
              </label>
              <label>
                Git repository URL
                <PanelInput
                  name="gitRepositoryUrl"
                  type="url"
                  value={draft.gitRepositoryUrl}
                  onChange={updateDraft('gitRepositoryUrl')}
                  placeholder="https://github.com/org/repo"
                  aria-label="Git repository URL"
                />
              </label>
              <label>
                Default branch
                <PanelInput
                  name="gitDefaultBranch"
                  value={draft.gitDefaultBranch}
                  onChange={updateDraft('gitDefaultBranch')}
                  aria-label="Default Git branch"
                />
              </label>
              <PanelButton disabled={busy || !draft.name.trim()}>Save settings</PanelButton>
            </form>
          )}

          {settingsTab === 'account' && (
            <div className="bolt-project-settings-grid">
              <form onSubmit={submitWithNotice('Profile saved to account API.')} className="bolt-project-settings-card">
                <input name="intent" value="profile" type="hidden" />
                <div className="bolt-project-settings-card-title">
                  <h4>Profile</h4>
                  <small>Visible identity used by comments, audit events and collaboration surfaces.</small>
                </div>
                <div className="bolt-project-settings-profile">
                  <span>{initials}</span>
                  <div>
                    <strong>{accountUser.name ?? 'User'}</strong>
                    <small>{accountUser.email ?? 'No email returned by API'}</small>
                  </div>
                </div>
                <label>
                  Display name
                  <PanelInput name="name" defaultValue={accountUser.name ?? ''} required aria-label="Display name" />
                </label>
                <label>
                  Email address
                  <PanelInput
                    name="email"
                    type="email"
                    defaultValue={accountUser.email ?? ''}
                    required
                    aria-label="Email address"
                  />
                </label>
                <PanelButton disabled={busy}>Save profile</PanelButton>
              </form>

              <section className="bolt-project-settings-card">
                <div className="bolt-project-settings-card-title">
                  <h4>Connected Accounts & Data</h4>
                  <small>Only actions backed by platform routes are shown here.</small>
                </div>
                <div className="bolt-project-account-connectors">
                  <div>
                    <strong>Email verification</strong>
                    <small>{accountUser.emailVerifiedAt ? 'Verified' : 'Not verified yet'}</small>
                  </div>
                  <div>
                    <strong>GitHub OAuth</strong>
                    <small>Use OAuth to import repositories and unlock GitHub project flows.</small>
                  </div>
                  <div>
                    <strong>Account export</strong>
                    <small>Profile, sessions, organizations, projects, usage and AI costs as JSON.</small>
                  </div>
                </div>
                {!accountUser.emailVerifiedAt && (
                  <form
                    onSubmit={submitWithNotice('Verification email requested.')}
                    className="bolt-project-inline-action"
                  >
                    <input name="intent" value="send-verification" type="hidden" />
                    <PanelButton disabled={busy} variant="outline">
                      Send verification email
                    </PanelButton>
                  </form>
                )}
                <a href="/auth/oauth/github">Connect GitHub</a>
                <a href="/api/auth/export" target="_blank" rel="noreferrer">
                  Export account JSON
                </a>
              </section>
            </div>
          )}

          {settingsTab === 'security' && (
            <div className="bolt-project-settings-grid">
              <form onSubmit={submitWithNotice('Password update submitted.')} className="bolt-project-settings-card">
                <input name="intent" value="change-password" type="hidden" />
                <div className="bolt-project-settings-card-title">
                  <h4>Change Password</h4>
                  <small>Password changes are processed by `/auth/password` and audited.</small>
                </div>
                <label>
                  Current password
                  <PanelInput
                    name="currentPassword"
                    type="password"
                    autoComplete="current-password"
                    required
                    aria-label="Current password"
                  />
                </label>
                <label>
                  New password
                  <PanelInput
                    name="newPassword"
                    type="password"
                    autoComplete="new-password"
                    placeholder="Minimum 8 characters"
                    required
                    aria-label="New password"
                  />
                </label>
                <PanelButton disabled={busy}>Update password</PanelButton>
                <small>Successful password changes revoke other sessions through the API.</small>
              </form>

              <section className="bolt-project-settings-card">
                <div className="bolt-project-settings-card-title">
                  <h4>Sign-in Protection</h4>
                  <small>Security controls currently backed by the authentication service.</small>
                </div>
                <div className="bolt-project-security-methods">
                  <a href="/mfa-setup">
                    <strong>Multi-factor authentication</strong>
                    <small>
                      {accountUser.mfaEnabled ? 'Enabled for this account' : 'Set up TOTP MFA and recovery codes'}
                    </small>
                  </a>
                  <a href="/security-settings">
                    <strong>Security rules</strong>
                    <small>Review MFA policy, recovery and security settings.</small>
                  </a>
                  <a href="/enterprise-sso-settings">
                    <strong>Enterprise SSO</strong>
                    <small>Configure SAML or OIDC for organizations that require SSO.</small>
                  </a>
                </div>
              </section>

              <section className="bolt-project-settings-card">
                <div className="bolt-project-settings-card-title">
                  <h4>Active Sessions</h4>
                  <small>Session names are normalized from user-agent data returned by `/auth/sessions`.</small>
                </div>
                <div className="bolt-project-settings-list">
                  {sessions.length ? (
                    sessions.slice(0, 8).map((session: any) => (
                      <form key={session.id} onSubmit={submitWithNotice('Session revoke submitted.')}>
                        <input name="intent" value="revoke-session" type="hidden" />
                        <input name="sessionId" value={session.id} type="hidden" />
                        <span>
                          <strong>{formatSessionDevice(session)}</strong>
                          <small>{formatSessionDetail(session)}</small>
                        </span>
                        <PanelButton
                          disabled={busy}
                          variant="outline"
                          aria-label={`Revoke ${formatSessionDevice(session)}`}
                        >
                          Revoke
                        </PanelButton>
                      </form>
                    ))
                  ) : (
                    <div className="bolt-project-empty-panel">No active sessions returned by API.</div>
                  )}
                </div>
                <form
                  onSubmit={submitWithNotice('Other sessions sign-out submitted.')}
                  className="bolt-project-inline-action"
                >
                  <input name="intent" value="logout-all" type="hidden" />
                  <PanelButton disabled={busy} variant="outline">
                    Sign out other sessions
                  </PanelButton>
                </form>
              </section>

              <section className="bolt-project-settings-card danger">
                <h4>Danger Zone</h4>
                <p>
                  Permanently delete this account. The API audits the request, deletes the user, and clears this
                  session.
                </p>
                <form
                  onSubmit={submitWithNotice('Account deletion request submitted.')}
                  className="bolt-project-danger-form"
                >
                  <input name="intent" value="delete-account" type="hidden" />
                  <label>
                    Type DELETE MY ACCOUNT to confirm
                    <input
                      name="confirmation"
                      placeholder="DELETE MY ACCOUNT"
                      required
                      aria-label="Delete account confirmation"
                    />
                  </label>
                  <PanelButton disabled={busy} variant="outline">
                    Delete account
                  </PanelButton>
                </form>
              </section>
            </div>
          )}

          {settingsTab === 'usage' && (
            <div className="bolt-project-settings-grid">
              <section className="bolt-project-settings-card">
                <div className="bolt-project-settings-card-title">
                  <h4>Billing & Plan</h4>
                  <small>Limits are rendered from the billing API instead of a flat comma-separated string.</small>
                </div>
                <PanelRows
                  rows={[
                    ['Plan', billing.plan?.name ?? billing.plan?.key ?? 'No billing plan returned'],
                    ['Subscription', billing.subscription?.status ?? billing.error ?? 'No active subscription'],
                    ['Usage events', String(billing.usage?.length ?? 0)],
                  ]}
                />
                {limitEntries.length ? (
                  <div className="bolt-project-usage-limits" role="table" aria-label="Billing limits">
                    <div role="row">
                      <span role="columnheader">Limit</span>
                      <span role="columnheader">Used</span>
                      <span role="columnheader">Quota</span>
                    </div>
                    {limitEntries.map(([key, value]: any) => {
                      const limit = Number(value?.limit ?? value?.max ?? value ?? 0);
                      const used = Number(usageByKey.get(key) ?? value?.used ?? 0);
                      const percent = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;

                      return (
                        <div key={key} role="row">
                          <span role="cell">{key.replaceAll('.', ' ')}</span>
                          <span role="cell">{used.toLocaleString()}</span>
                          <span role="cell">
                            {limit ? limit.toLocaleString() : 'Unlimited'}
                            <em style={{ inlineSize: `${percent}%` }} aria-hidden />
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="bolt-project-empty-panel">No billing limits returned by API.</div>
                )}
                <a href="/billing" target="_blank" rel="noreferrer">
                  Open billing management
                </a>
              </section>

              <section className="bolt-project-settings-card">
                <div className="bolt-project-settings-card-title">
                  <h4>AI Usage & Costs</h4>
                  <small>Token totals are calculated from the real `/ai/usage` response.</small>
                </div>
                <div className="bolt-project-usage-metrics">
                  <span>
                    <strong>{aiUsageTotals.inputTokens.toLocaleString()}</strong>
                    <small>Input tokens</small>
                  </span>
                  <span>
                    <strong>{aiUsageTotals.outputTokens.toLocaleString()}</strong>
                    <small>Output tokens</small>
                  </span>
                  <span>
                    <strong>${aiUsageTotals.cost.toFixed(4)}</strong>
                    <small>Estimated cost</small>
                  </span>
                </div>
                <PanelRows
                  rows={
                    aiUsage.length
                      ? aiUsage
                          .slice(0, 10)
                          .map((item: any) => [
                            item.provider ?? item.model ?? item.type ?? 'AI call',
                            `${item.inputTokens ?? item.promptTokens ?? 0} in / ${item.outputTokens ?? item.completionTokens ?? 0} out`,
                          ])
                      : [['Usage', data.aiUsage?.error ?? 'No AI usage recorded yet']]
                  }
                />
              </section>
            </div>
          )}

          {settingsTab === 'ai' && (
            <section className="bolt-project-settings-card">
              <div className="bolt-project-settings-card-title">
                <h4>AI Provider Controls</h4>
                <small>
                  Provider modes, keys and routing are persisted in project secrets; agent behaviour is surfaced here.
                </small>
              </div>
              <div className="bolt-project-agent-policy" aria-label="Agent patch policy">
                <article>
                  <span>
                    <strong>Auto-apply successful patches</strong>
                    <small>
                      Successful patches are applied automatically; failed validation stays in review with retry and
                      reject actions.
                    </small>
                  </span>
                  <em>Enabled</em>
                </article>
                <article>
                  <span>
                    <strong>Plan control</strong>
                    <small>Use the Plan button in the prompt toolbar when you want approval before edits.</small>
                  </span>
                  <em>Composer</em>
                </article>
              </div>
              <form onSubmit={submitWithNotice('AI routing preferences saved.')} className="bolt-project-ai-routing">
                <input name="intent" value="ai-routing" type="hidden" />
                <label>
                  Default provider
                  <select name="defaultProvider" defaultValue={aiRouting.defaultProvider}>
                    {providers.map((provider) => (
                      <option key={provider.id} value={provider.id}>
                        {provider.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Default model
                  <select name="defaultModel" defaultValue={aiRouting.defaultModel}>
                    {providers.flatMap((provider) =>
                      provider.models.map((model) => (
                        <option key={`${provider.id}:${model}`} value={`${provider.id}:${model}`}>
                          {provider.label} - {model}
                        </option>
                      )),
                    )}
                  </select>
                </label>
                <label>
                  Fallback provider
                  <select name="fallbackProvider" defaultValue={aiRouting.fallbackProvider}>
                    {providers.map((provider) => (
                      <option key={provider.id} value={provider.id}>
                        {provider.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="bolt-project-checkbox-row">
                  <input
                    name="fallbackEnabled"
                    type="checkbox"
                    value="true"
                    defaultChecked={aiRouting.fallbackEnabled !== false}
                  />
                  <span>Use fallback when the primary provider errors or exceeds quota</span>
                </label>
                <PanelButton disabled={busy}>Save AI routing</PanelButton>
              </form>
              {/*
               * Managed (Replit-parity) mode: the platform admin owns the
               * provider keys, so the per-provider BYOK credential-mode + key
               * entry/removal grid is hidden from end users. VITE_BYOK_DISABLED
               * is a build-time flag (true for the prod web image); a bare
               * docker build leaves it unset and keeps the BYOK grid for
               * self-host / Enterprise BYOK.
               */}
              {import.meta.env.VITE_BYOK_DISABLED === 'true' ? (
                <div className="bolt-project-managed-note" data-testid="ai-keys-managed-note">
                  <p>
                    AI provider keys are managed by E-Code. Calls are billed to your plan's included credits — there's
                    no key to enter. Pick your default model and routing above.
                  </p>
                </div>
              ) : (
                <div className="bolt-project-settings-provider-grid">
                  {providers.map((provider) => {
                    const configured = secrets.some((secret: any) => secret.key === provider.secretKey);
                    const mode = state.aiCredentials?.[provider.id]?.mode ?? 'managed';

                    return (
                      <article key={provider.id}>
                        <div className="bolt-project-provider-header">
                          <span>
                            <strong>{provider.label}</strong>
                            <small>
                              {mode === 'byok'
                                ? configured
                                  ? 'BYOK key configured'
                                  : 'BYOK enabled, key missing'
                                : 'Managed credits'}
                            </small>
                          </span>
                          <em title="Managed credits use E-Code platform billing. BYOK stores a project secret and routes calls through your provider key.">
                            {mode === 'byok' ? 'BYOK' : 'Managed'}
                          </em>
                        </div>
                        <form onSubmit={submitWithNotice(`${provider.label} provider mode saved.`)}>
                          <input name="intent" value="ai-credential-mode" type="hidden" />
                          <input name="provider" value={provider.id} type="hidden" />
                          <label>
                            Credential mode
                            <select name="mode" defaultValue={mode}>
                              <option value="managed">Managed platform credits</option>
                              <option value="byok">Bring your own key</option>
                            </select>
                          </label>
                          <PanelButton disabled={busy}>Save mode</PanelButton>
                        </form>
                        <form onSubmit={submitWithNotice(`${provider.label} API key saved as a project secret.`)}>
                          <input name="intent" value="save-ai-key" type="hidden" />
                          <input name="provider" value={provider.id} type="hidden" />
                          <label>
                            API key secret
                            <input
                              name="apiKey"
                              type="password"
                              placeholder={`${provider.secretKey}`}
                              required
                              aria-label={`${provider.label} API key`}
                            />
                          </label>
                          <PanelButton disabled={busy}>Save key</PanelButton>
                        </form>
                        {configured && (
                          <form onSubmit={submitWithNotice(`${provider.label} API key removal submitted.`)}>
                            <input name="intent" value="delete-ai-key" type="hidden" />
                            <input name="provider" value={provider.id} type="hidden" />
                            <PanelButton disabled={busy} variant="outline">
                              Remove key
                            </PanelButton>
                          </form>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {settingsTab === 'memory' && (
            <div className="bolt-project-settings-grid">
              <form onSubmit={saveMemory} className="bolt-project-settings-card">
                <div className="bolt-project-settings-card-title">
                  <h4>Persistent Agent Memory</h4>
                  <small>
                    Project-scoped memories are embedded with the configured backend provider and retrieved before
                    future IDE agent runs.
                  </small>
                </div>
                <label className="bolt-project-memory-toggle">
                  <input
                    type="checkbox"
                    checked={memoryEnabled}
                    onChange={(event) => void toggleMemoryEnabled(event.target.checked)}
                    disabled={memoryLoading}
                  />
                  <span>
                    <strong>Use memory in future agent responses</strong>
                    <small>
                      {memoryEnabled
                        ? 'Retrieval and automatic capture are enabled.'
                        : 'Stored memories stay visible but are not injected.'}
                    </small>
                  </span>
                </label>
                <label>
                  New memory
                  <textarea
                    value={memoryDraft}
                    onChange={(event) => setMemoryDraft(event.target.value)}
                    placeholder="Example: Always push to main after validation checks pass."
                    rows={5}
                  />
                </label>
                {memoryDraft.trim() ? (
                  <details className="bolt-project-memory-preview">
                    <summary>Preview memory payload</summary>
                    <pre>
                      {JSON.stringify(
                        {
                          scope: 'project',
                          projectId: settings.id,
                          memoryType,
                          tags: parseMemoryTags(memoryTags),
                          content: memoryDraft,
                        },
                        null,
                        2,
                      )}
                    </pre>
                  </details>
                ) : null}
                <div className="bolt-project-memory-fields">
                  <label>
                    Type
                    <select value={memoryType} onChange={(event) => setMemoryType(event.target.value)}>
                      <option value="semantic">Semantic</option>
                      <option value="procedural">Procedural</option>
                      <option value="episodic">Episodic</option>
                      <option value="working">Working</option>
                      <option value="cache">Cache</option>
                    </select>
                  </label>
                  <label>
                    Tags
                    <input
                      value={memoryTags}
                      onChange={(event) => setMemoryTags(event.target.value)}
                      placeholder="validation, workflow"
                    />
                  </label>
                </div>
                <div className="bolt-project-form-actions">
                  <PanelButton disabled={memoryLoading || !memoryDraft.trim()}>Save memory</PanelButton>
                  <button
                    type="button"
                    onClick={() => {
                      setMemoryDraft('');
                      setMemoryTags('');
                      setMemoryType('semantic');
                    }}
                    disabled={memoryLoading || (!memoryDraft && !memoryTags && memoryType === 'semantic')}
                  >
                    Reset draft
                  </button>
                </div>
                {memoryError ? (
                  <div className="bolt-project-settings-memory-error" role="alert">
                    <span>{memoryError}</span>
                    <button type="button" onClick={() => void loadMemories()} disabled={memoryLoading}>
                      Retry
                    </button>
                  </div>
                ) : null}
              </form>

              <section className="bolt-project-settings-card">
                <div className="bolt-project-memory-card-header">
                  <h4>Stored Memories</h4>
                  <a
                    href={`/api/agent-memory/export?projectId=${encodeURIComponent(settings.id)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Export JSON
                  </a>
                </div>
                {memoryLoading && !memories.length ? (
                  <div className="bolt-project-memory-skeleton" role="status">
                    <span />
                    <span />
                    <span />
                  </div>
                ) : memories.length ? (
                  <div className="bolt-project-settings-list">
                    {memories.map((memory) => (
                      <article key={memory.id} className="bolt-project-memory-row">
                        {memoryEditId === memory.id ? (
                          <div className="bolt-project-memory-edit">
                            <label>
                              Memory content
                              <textarea
                                value={memoryEditDraft}
                                onChange={(event) => setMemoryEditDraft(event.target.value)}
                                rows={4}
                              />
                            </label>
                            <div className="bolt-project-memory-fields">
                              <label>
                                Type
                                <select
                                  value={memoryEditType}
                                  onChange={(event) => setMemoryEditType(event.target.value)}
                                >
                                  <option value="semantic">Semantic</option>
                                  <option value="procedural">Procedural</option>
                                  <option value="episodic">Episodic</option>
                                  <option value="working">Working</option>
                                  <option value="cache">Cache</option>
                                </select>
                              </label>
                              <label>
                                Tags
                                <input
                                  value={memoryEditTags}
                                  onChange={(event) => setMemoryEditTags(event.target.value)}
                                  placeholder="validation, workflow"
                                />
                              </label>
                            </div>
                            <div>
                              <button
                                type="button"
                                onClick={() => void saveEditedMemory(memory.id)}
                                disabled={memoryLoading || !memoryEditDraft.trim()}
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setMemoryEditId(undefined);
                                  setMemoryEditDraft('');
                                  setMemoryEditTags('');
                                }}
                                disabled={memoryLoading}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <span>
                              <strong>{memory.summary}</strong>
                              <small>
                                {memory.scope} - {memory.memoryType ?? 'semantic'} - importance{' '}
                                {Math.round((memory.importance ?? 0) * 100)}% - used {memory.accessCount ?? 0}x -{' '}
                                {memory.updatedAt ? new Date(memory.updatedAt).toLocaleString() : 'stored'}
                              </small>
                              {Array.isArray(memory.tags) && memory.tags.length ? (
                                <span className="bolt-project-memory-tags">
                                  {memory.tags.map((tag: string) => (
                                    <em key={tag}>{tag}</em>
                                  ))}
                                </span>
                              ) : null}
                            </span>
                            <div className="bolt-project-memory-actions">
                              <button type="button" onClick={() => startEditMemory(memory)} disabled={memoryLoading}>
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => void deleteMemory(memory.id)}
                                disabled={memoryLoading}
                              >
                                Delete
                              </button>
                            </div>
                          </>
                        )}
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="bolt-project-empty-panel">No persistent memories stored for this project yet.</div>
                )}
              </section>
            </div>
          )}

          {settingsTab === 'preferences' && (
            <div className="bolt-project-settings-grid">
              <form onSubmit={submitWithNotice('IDE preferences saved.')} className="bolt-project-settings-card">
                <input name="intent" value="preferences" type="hidden" />
                <div className="bolt-project-settings-card-title">
                  <h4>Appearance & Keyboard</h4>
                  <small>Workspace preferences are stored per project and default to dark mode.</small>
                </div>
                <label>
                  Theme
                  <select name="theme" defaultValue={preferences.theme}>
                    <option value="dark">Dark</option>
                    <option value="light">Light</option>
                    <option value="system">System</option>
                  </select>
                </label>
                <label>
                  Keyboard mode
                  <select name="keyboardMode" defaultValue={String(Boolean(preferences.keyboardMode))}>
                    <option value="false">Standard browser shortcuts</option>
                    <option value="true">Hardware keyboard IDE shortcuts</option>
                  </select>
                </label>
                <label>
                  Credit alert threshold
                  <input
                    name="creditAlertThreshold"
                    type="number"
                    min="10"
                    max="100"
                    defaultValue={preferences.creditAlertThreshold ?? 80}
                  />
                </label>
                <PanelButton disabled={busy}>Save preferences</PanelButton>
              </form>

              <form onSubmit={submitWithNotice('Keyboard shortcuts saved.')} className="bolt-project-settings-card">
                <input name="intent" value="keybindings" type="hidden" />
                <div className="bolt-project-settings-card-title">
                  <h4>Keyboard Shortcuts</h4>
                  <small>
                    Edit shortcuts with combos like cmd+s, cmd+shift+p or f12. Contextual editor shortcuts win over
                    globals.
                  </small>
                </div>
                {keyboardConflicts.length > 0 ? (
                  <div className="bolt-project-keybindings-conflicts" role="alert">
                    <strong>Shortcut conflicts detected</strong>
                    <span>
                      {keyboardConflicts
                        .map((conflict) => `${formatKeybindingCombo(conflict.combo)}: ${conflict.actions.join(', ')}`)
                        .join(' · ')}
                    </span>
                  </div>
                ) : null}
                <div className="bolt-project-settings-keybindings">
                  {keyboardSections.map((section) => (
                    <section key={section.category} aria-label={`${section.category} shortcuts`}>
                      <h5>{section.category}</h5>
                      {section.bindings.map((binding) => (
                        <div key={`${binding.combo}-${binding.action}`} className="bolt-project-keybinding-row">
                          <span>
                            <strong>{binding.label}</strong>
                            <small>{binding.description}</small>
                          </span>
                          <label>
                            <span className="sr-only">{binding.label} shortcut</span>
                            <input
                              name={`keybinding:${binding.action}`}
                              defaultValue={binding.combo}
                              spellCheck={false}
                              autoCapitalize="none"
                              aria-label={`${binding.label} shortcut`}
                            />
                          </label>
                          <kbd>{formatKeybindingCombo(binding.combo)}</kbd>
                        </div>
                      ))}
                    </section>
                  ))}
                </div>
                <PanelButton disabled={busy}>Save keyboard shortcuts</PanelButton>
              </form>

              <section className="bolt-project-settings-card">
                <div className="bolt-project-settings-card-title">
                  <h4>Notification Preferences</h4>
                  <small>
                    In-app toggles are persisted here. Email and push delivery are managed by account channels.
                  </small>
                </div>
                <div className="bolt-project-settings-list">
                  {notificationRows.map(([key, label, desc]) => {
                    const enabled = notifications[key] !== false;

                    return (
                      <form key={key} onSubmit={submitWithNotice(`${label} notification preference saved.`)}>
                        <input name="intent" value="notification" type="hidden" />
                        <input name="key" value={key} type="hidden" />
                        <input name="enabled" value={String(!enabled)} type="hidden" />
                        <span>
                          <strong>{label}</strong>
                          <small>{desc}</small>
                          <span className="bolt-project-notification-channels">
                            <em data-enabled={enabled}>In-app {enabled ? 'on' : 'off'}</em>
                            <em>Email via account</em>
                            <em>Push via native runtime</em>
                          </span>
                        </span>
                        <PanelButton
                          disabled={busy}
                          variant="outline"
                          aria-label={`${enabled ? 'Disable' : 'Enable'} ${label} notifications`}
                          aria-pressed={enabled}
                        >
                          {enabled ? 'Turn off' : 'Turn on'}
                        </PanelButton>
                      </form>
                    );
                  })}
                </div>
              </section>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

interface ObjectStorageObject {
  key: string;
  size?: number;
  updated?: string | null;
  contentType?: string | null;
}

function formatObjectStorageSize(size?: number): string {
  if (typeof size !== 'number' || Number.isNaN(size)) {
    return 'unknown size';
  }

  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

/*
 * Real per-project GCS object storage. Self-fetches via the ide-panel proxy
 * (intents list/upload-url/download-url/move/delete-object/ensure-bucket) which
 * forwards to /projects/:id/object-storage/*. The feature is flag-gated
 * (OBJECT_STORAGE_ENABLED); when off the proxy returns { enabled: false } and we
 * render a clear "not enabled" state rather than any placeholder data.
 */
function ProjectObjectStoragePanel({ projectId, busy }: { projectId?: string; busy: boolean }) {
  const [prefix, setPrefix] = useState('');
  const [enabled, setEnabled] = useState<boolean | null>(null);

  // Per-project bucket provisioning (Replit App Storage first-run). null = unknown.
  const [provisioned, setProvisioned] = useState<boolean | null>(null);
  const [enabling, setEnabling] = useState(false);
  const [objects, setObjects] = useState<ObjectStorageObject[]>([]);
  const [folders, setFolders] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  // Replit App Storage parity: a per-bucket Objects | Settings view switch.
  const [view, setView] = useState<'objects' | 'settings'>('objects');
  const [filter, setFilter] = useState('');

  // G5: token-styled dialogs replacing window.prompt/window.confirm.
  const [renameKey, setRenameKey] = useState<string | null>(null);
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [confirmDeleteBucket, setConfirmDeleteBucket] = useState(false);

  // F8: highlight the Objects view while files are dragged over it for drop-to-upload.
  const [dragActive, setDragActive] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);

  const postIntent = useCallback(
    async (fields: Record<string, string>): Promise<any> => {
      if (!projectId) {
        return null;
      }

      const form = new FormData();

      for (const [key, value] of Object.entries(fields)) {
        form.append(key, value);
      }

      const response = await fetch(`/api/projects/${projectId}/ide-panel/object-storage`, {
        method: 'POST',
        body: form,
      });

      return (await response.json().catch(() => ({}))) as any;
    },
    [projectId],
  );

  const refresh = useCallback(
    async (nextPrefix: string) => {
      if (!projectId) {
        return;
      }

      setLoading(true);

      try {
        const result = await postIntent({ intent: 'list', prefix: nextPrefix });

        if (!result) {
          return;
        }

        setEnabled(Boolean(result.enabled));
        setObjects(Array.isArray(result.objects) ? result.objects : []);
        setFolders(Array.isArray(result.folders) ? result.folders : []);
        setStatus(typeof result.error === 'string' ? result.error : null);
      } catch {
        setStatus('Unable to reach object storage.');
      } finally {
        setLoading(false);
      }
    },
    [postIntent, projectId],
  );

  /*
   * Load per-project status first: it tells us whether the platform flag is on
   * AND whether THIS project's bucket exists. The object list is only fetched
   * once provisioned, so a brand-new project shows the "Enable" CTA instead of a
   * failed list against a bucket that doesn't exist yet.
   */
  const loadStatus = useCallback(async () => {
    if (!projectId) {
      return;
    }

    const result = await postIntent({ intent: 'status' });

    if (!result) {
      return;
    }

    setEnabled(Boolean(result.enabled));
    setProvisioned(result.enabled ? Boolean(result.provisioned) : false);
  }, [postIntent, projectId]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    if (provisioned) {
      void refresh(prefix);
    }
  }, [prefix, provisioned, refresh]);

  // Replit-style first-run: create the project's GCS bucket, then reveal the panel.
  const enableStorage = useCallback(async () => {
    setEnabling(true);
    setStatus(null);

    try {
      const result = await postIntent({ intent: 'ensure-bucket' });

      if (result && result.error) {
        setStatus(typeof result.error === 'string' ? result.error : 'Could not enable Object Storage.');
        return;
      }

      if (result && result.enabled === false) {
        setEnabled(false);
        return;
      }

      setProvisioned(true);
      setStatus('Object Storage enabled.');
      await refresh(prefix);
    } catch {
      setStatus('Could not enable Object Storage.');
    } finally {
      setEnabling(false);
    }
  }, [postIntent, prefix, refresh]);

  const runOperation = useCallback(
    async (fields: Record<string, string>, successMessage: string) => {
      setWorking(true);
      setStatus(null);

      try {
        const result = await postIntent(fields);

        if (result && result.error) {
          setStatus(typeof result.error === 'string' ? result.error : 'Operation failed.');
          return;
        }

        setStatus(successMessage);
        await refresh(prefix);
      } catch {
        setStatus('Operation failed.');
      } finally {
        setWorking(false);
      }
    },
    [postIntent, prefix, refresh],
  );

  const handleUpload = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList || !fileList.length) {
        return;
      }

      setWorking(true);
      setStatus(null);

      try {
        for (const file of Array.from(fileList)) {
          /*
           * For a folder upload the browser sets webkitRelativePath (e.g.
           * "src/index.ts"); preserve it so the bucket keeps the folder tree.
           */
          const relativePath = (file as unknown as { webkitRelativePath?: string }).webkitRelativePath || file.name;
          const key = `${prefix}${relativePath}`;
          const contentType = file.type || 'application/octet-stream';

          const signed = await postIntent({ intent: 'upload-url', key, contentType });

          if (!signed || signed.enabled === false || !signed.url) {
            setStatus(signed?.error ?? 'Object storage is not enabled.');
            return;
          }

          const put = await fetch(signed.url, {
            method: signed.method ?? 'PUT',
            headers: signed.headers ?? { 'Content-Type': contentType },
            body: file,
          });

          if (!put.ok) {
            setStatus(`Upload failed for ${file.name} (${put.status}).`);
            return;
          }
        }

        setStatus('Upload complete.');
        await refresh(prefix);
      } catch {
        setStatus('Upload failed.');
      } finally {
        setWorking(false);

        if (uploadInputRef.current) {
          uploadInputRef.current.value = '';
        }

        if (folderInputRef.current) {
          folderInputRef.current.value = '';
        }
      }
    },
    [postIntent, prefix, refresh],
  );

  const handleDownload = useCallback(
    async (key: string) => {
      const result = await postIntent({ intent: 'download-url', key });

      if (result && result.url) {
        window.open(result.url, '_blank', 'noopener,noreferrer');
      } else {
        setStatus(result?.error ?? 'Unable to create a download link.');
      }
    },
    [postIntent],
  );

  const handleRename = useCallback(
    (next: string) => {
      const key = renameKey;
      setRenameKey(null);

      if (key && next.trim() && next.trim() !== key) {
        void runOperation({ intent: 'move', from: key, to: next.trim() }, 'Object moved.');
      }
    },
    [renameKey, runOperation],
  );

  /*
   * Create a folder by materializing an empty placeholder object at "<prefix><name>/"
   * (GCS folders are virtual prefixes; an empty trailing-slash object surfaces it).
   */
  const handleCreateFolder = useCallback(
    async (name: string) => {
      if (!name.trim()) {
        return;
      }

      const key = `${prefix}${name.trim().replace(/^\/+|\/+$/g, '')}/`;

      setWorking(true);
      setStatus(null);

      try {
        const signed = await postIntent({ intent: 'upload-url', key, contentType: 'application/x-directory' });

        if (!signed || signed.enabled === false || !signed.url) {
          setStatus(signed?.error ?? 'Object storage is not enabled.');
          return;
        }

        const put = await fetch(signed.url, {
          method: signed.method ?? 'PUT',
          headers: signed.headers ?? { 'Content-Type': 'application/x-directory' },
          body: '',
        });

        if (!put.ok) {
          setStatus(`Could not create folder (${put.status}).`);
          return;
        }

        setStatus('Folder created.');
        await refresh(prefix);
      } catch {
        setStatus('Could not create folder.');
      } finally {
        setWorking(false);
      }
    },
    [postIntent, prefix, refresh],
  );

  const parentPrefix = (() => {
    const trimmed = prefix.replace(/\/$/, '');
    const idx = trimmed.lastIndexOf('/');

    return idx >= 0 ? trimmed.slice(0, idx + 1) : '';
  })();

  // Client-side search/filter over the current prefix (Replit App Storage parity).
  const normalizedFilter = filter.trim().toLowerCase();

  const visibleFolders = normalizedFilter
    ? folders.filter((folder) => folder.replace(prefix, '').toLowerCase().includes(normalizedFilter))
    : folders;
  const visibleObjects = normalizedFilter
    ? objects.filter((object) => object.key.replace(prefix, '').toLowerCase().includes(normalizedFilter))
    : objects;

  if (enabled === null) {
    return (
      <div className="bolt-project-managed-panel bolt-project-object-storage-panel">
        <div className="bolt-project-empty-panel grid gap-2 text-sm text-bolt-elements-textSecondary">
          Checking Object Storage…
        </div>
      </div>
    );
  }

  if (enabled === false) {
    return (
      <div className="bolt-project-managed-panel bolt-project-object-storage-panel">
        <div className="bolt-project-empty-panel grid gap-2 text-sm">
          <strong className="text-bolt-elements-textPrimary">Object Storage is not available yet</strong>
          <span className="text-bolt-elements-textSecondary">
            Cloud Object Storage hasn’t been turned on for this workspace’s platform. Once an administrator enables it,
            you’ll be able to create this project’s bucket and manage files right here — no further setup on your side.
          </span>
        </div>
      </div>
    );
  }

  /*
   * Platform storage is available but this project has no bucket yet — offer the
   * one-click "Enable" (create bucket) CTA, Replit App Storage style.
   */
  if (provisioned === false) {
    return (
      <div className="bolt-project-managed-panel bolt-project-object-storage-panel">
        <div className="bolt-project-empty-panel grid gap-3 text-sm">
          <div className="flex items-center gap-2 text-bolt-elements-textPrimary">
            <span className="i-ph:hard-drives text-lg" aria-hidden />
            <strong>Enable Object Storage for this project</strong>
          </div>
          <span className="text-bolt-elements-textSecondary">
            Create a private cloud bucket to store files, uploads and generated assets for this app. You can list,
            upload, download, move and delete objects here as soon as it’s ready.
          </span>
          {status ? (
            <span className="text-xs text-bolt-elements-textTertiary" role="status">
              {status}
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => void enableStorage()}
            disabled={enabling || busy}
            className="w-fit rounded-md bg-[var(--vc-ide-accent-action)] px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {enabling ? 'Enabling…' : 'Enable Object Storage'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="bolt-project-managed-panel bolt-project-object-storage-panel relative"
      onDragOver={(event) => {
        if (view !== 'objects' || working) {
          return;
        }

        // Only intercept file drags (ignore text/element drags from within the IDE).
        if (!Array.from(event.dataTransfer.types || []).includes('Files')) {
          return;
        }

        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
        setDragActive(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setDragActive(false);
        }
      }}
      onDrop={(event) => {
        if (view !== 'objects' || working) {
          return;
        }

        if (!event.dataTransfer.files?.length) {
          return;
        }

        event.preventDefault();
        setDragActive(false);
        void handleUpload(event.dataTransfer.files);
      }}
    >
      {dragActive && view === 'objects' ? (
        <div
          className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-[var(--vc-ide-accent-action)] bg-bolt-elements-background-depth-1/85 text-sm text-bolt-elements-textPrimary"
          aria-hidden
        >
          <span className="i-ph:upload-simple text-2xl text-[var(--vc-ide-accent-action)]" />
          <span>Drop files to upload to {prefix || 'the bucket root'}</span>
        </div>
      ) : null}
      <InputDialog
        isOpen={renameKey !== null}
        onClose={() => setRenameKey(null)}
        onSubmit={handleRename}
        title="Move / rename object"
        description="Moves the object to the new key inside the project bucket."
        label="New object key"
        initialValue={renameKey ?? ''}
        confirmLabel="Move"
        validate={(value) => (value.trim() ? undefined : 'Enter an object key')}
      />
      <InputDialog
        isOpen={createFolderOpen}
        onClose={() => setCreateFolderOpen(false)}
        onSubmit={(value) => {
          setCreateFolderOpen(false);
          void handleCreateFolder(value);
        }}
        title="New folder"
        description={`Created under ${prefix || 'the bucket root'}.`}
        label="Folder name"
        placeholder="assets"
        confirmLabel="Create folder"
        validate={(value) => (value.trim() ? undefined : 'Enter a folder name')}
      />
      <ConfirmationDialog
        isOpen={confirmDeleteBucket}
        onClose={() => setConfirmDeleteBucket(false)}
        onConfirm={() => {
          setConfirmDeleteBucket(false);
          void runOperation({ intent: 'delete-bucket' }, 'Bucket deleted.');
        }}
        title="Delete this bucket?"
        description="Permanently deletes the project bucket and ALL its objects. This cannot be undone."
        confirmLabel="Delete bucket"
        variant="destructive"
      />
      <section className="grid gap-3">
        {/* Bucket header + Objects | Settings switch (Replit App Storage parity). */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm text-bolt-elements-textPrimary">
            <span className="i-ph:package" aria-hidden />
            <strong>Project bucket</strong>
          </div>
          <div className="bolt-project-tool-tabs">
            {(
              [
                ['objects', 'Objects'],
                ['settings', 'Settings'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                aria-current={view === id ? 'page' : undefined}
                onClick={() => setView(id)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {view === 'settings' ? (
          <div className="grid gap-4 text-sm">
            <section className="grid gap-2 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-3">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-bolt-elements-textSecondary">Bucket</h4>
              <p className="text-xs text-bolt-elements-textSecondary">
                A single GCS bucket is provisioned per project (server-managed name). Use “Ensure bucket” to create it
                on first use.
              </p>
              <button
                type="button"
                className="w-fit rounded-md border border-bolt-elements-borderColor px-3 py-1.5 text-xs text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3 disabled:opacity-60"
                onClick={() => void runOperation({ intent: 'ensure-bucket' }, 'Bucket ready.')}
                disabled={busy || working}
              >
                Ensure bucket exists
              </button>
            </section>
            <section className="grid gap-2 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-3">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-bolt-elements-textSecondary">
                Sharing
              </h4>
              <p className="text-xs text-bolt-elements-textTertiary">
                Adding or removing this bucket from other apps is coming soon — backend pending.
              </p>
            </section>
            <section className="grid gap-2 rounded-lg border border-red-500/30 bg-bolt-elements-background-depth-2 p-3">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-bolt-elements-textSecondary">
                Delete bucket
              </h4>
              <p className="text-xs text-bolt-elements-textTertiary">
                Permanently deletes the project bucket and every object in it. This cannot be undone.
              </p>
              <button
                type="button"
                className="w-fit rounded-md border border-red-500/40 px-3 py-1.5 text-xs font-medium text-[var(--status-error-text)] hover:bg-red-500/10 disabled:opacity-60"
                disabled={busy || working}
                onClick={() => setConfirmDeleteBucket(true)}
              >
                Delete bucket
              </button>
            </section>
            {status ? (
              <p className="text-xs text-bolt-elements-textSecondary" role="status">
                {status}
              </p>
            ) : null}
          </div>
        ) : (
          <>
            <div className="bolt-project-panel-toolbar flex flex-wrap items-end gap-2">
              <label className="grid gap-1 text-xs text-bolt-elements-textSecondary">
                Prefix (folder)
                <input
                  value={prefix}
                  onChange={(event) => setPrefix(event.target.value)}
                  placeholder="assets/"
                  autoCapitalize="none"
                  spellCheck={false}
                />
              </label>
              <button type="button" onClick={() => void refresh(prefix)} disabled={loading || working}>
                {loading ? 'Loading…' : 'Refresh'}
              </button>
              <button type="button" onClick={() => uploadInputRef.current?.click()} disabled={busy || working}>
                Upload files
              </button>
              <button type="button" onClick={() => folderInputRef.current?.click()} disabled={busy || working}>
                Upload folder
              </button>
              <button type="button" onClick={() => setCreateFolderOpen(true)} disabled={busy || working}>
                Create folder
              </button>
              <button
                type="button"
                onClick={() => void runOperation({ intent: 'ensure-bucket' }, 'Bucket ready.')}
                disabled={busy || working}
              >
                Ensure bucket
              </button>
              <input
                ref={uploadInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(event) => void handleUpload(event.currentTarget.files)}
              />
              <input
                ref={folderInputRef}
                type="file"
                multiple
                className="hidden"
                {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
                onChange={(event) => void handleUpload(event.currentTarget.files)}
              />
            </div>

            <p className="flex items-center gap-1 text-xs text-bolt-elements-textTertiary">
              <span className="i-ph:upload-simple" aria-hidden />
              Tip: drag &amp; drop files anywhere in this panel to upload them to the current folder.
            </p>

            {prefix ? (
              <div className="flex items-center gap-2 text-xs text-bolt-elements-textSecondary">
                <button type="button" onClick={() => setPrefix(parentPrefix)} className="underline">
                  ⬆ Up
                </button>
                <span className="font-mono">{prefix}</span>
              </div>
            ) : null}

            <input
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Search this folder…"
              autoCapitalize="none"
              spellCheck={false}
              aria-label="Search objects"
              className="w-full rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-2 py-1 text-xs text-bolt-elements-textPrimary outline-none focus:border-bolt-elements-focus"
            />

            {visibleFolders.length ? (
              <div className="flex flex-wrap gap-2">
                {visibleFolders.map((folder) => (
                  <span key={folder} className="inline-flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setPrefix(folder)}
                      className="inline-flex items-center gap-1 rounded-md border border-bolt-elements-borderColor px-2 py-1 text-xs text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3"
                    >
                      📁 {folder.replace(prefix, '').replace(/\/$/, '')}
                    </button>
                    <button
                      type="button"
                      onClick={() => void runOperation({ intent: 'delete-object', prefix: folder }, 'Folder deleted.')}
                      aria-label={`Delete folder ${folder}`}
                      className="text-bolt-elements-textTertiary hover:text-bolt-elements-item-contentDanger"
                      disabled={working}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            ) : null}

            {visibleObjects.length ? (
              <div className="grid gap-1">
                {visibleObjects.map((object) => (
                  <div
                    key={object.key}
                    className="flex items-center justify-between gap-2 rounded-md border border-bolt-elements-borderColor px-2 py-1 text-xs"
                  >
                    <div className="min-w-0">
                      <strong className="block truncate text-bolt-elements-textPrimary">
                        {object.key.replace(prefix, '')}
                      </strong>
                      <span className="text-bolt-elements-textSecondary">
                        {formatObjectStorageSize(object.size)}
                        {object.updated ? ` · ${new Date(object.updated).toLocaleString()}` : ''}
                      </span>
                    </div>
                    <div className="bolt-project-object-actions flex shrink-0 items-center gap-2">
                      <button type="button" onClick={() => void handleDownload(object.key)} disabled={working}>
                        Download
                      </button>
                      <button type="button" onClick={() => setRenameKey(object.key)} disabled={working}>
                        Move
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          void runOperation({ intent: 'delete-object', key: object.key }, 'Object deleted.')
                        }
                        disabled={working}
                        className="text-bolt-elements-item-contentDanger"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bolt-project-empty-panel">
                {loading
                  ? 'Loading objects…'
                  : normalizedFilter
                    ? 'No objects match your search.'
                    : prefix
                      ? 'No objects under this prefix.'
                      : 'The bucket is empty.'}
              </div>
            )}

            {status ? (
              <p className="text-xs text-bolt-elements-textSecondary" role="status">
                {status}
              </p>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}

interface ProjectSkill {
  id: string;
  name: string;
  description?: string;
  category?: string;
  enabled?: boolean;
  source?: string;
  updatedAt?: string | null;
}

/** A curated community catalog entry (F#27). */
interface SkillCatalogEntry {
  ownerRepo: string;
  name: string;
  description: string;
  category: string;
  homepageUrl: string;
  installCount: number;
  installedInProject: boolean;
  installedInWorkspace: boolean;
}

/** A security-audit finding (RPL-SK-001.3). */
interface SkillAuditFinding {
  code: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  title: string;
  detail: string;
  location: string;
  evidence: string;
}

/** An installed GitHub-repo / interop skill row (F#27 + RPL-SK-001). */
interface InstalledSkill {
  id: string;
  ownerRepo: string;
  name: string;
  description: string;
  instructions: string;
  homepageUrl?: string | null;
  enabled: boolean;
  scope: string;

  // RPL-SK-001.3/.4 provenance + audit + revoke.
  origin?: string;
  contentHash?: string | null;
  auditVerdict?: 'approved' | 'quarantined' | 'rejected' | null;
  auditFindings?: SkillAuditFinding[];
  auditedAt?: string | null;
  manifestName?: string | null;
  resources?: Array<{ path: string; kind: string; bytes: number }>;
  revokedAt?: string | null;
  revokeReason?: string | null;
}

/** A row in the skill audit journal (RPL-SK-001.3). */
interface SkillAuditEvent {
  id: string;
  ownerRepo: string;
  action: string;
  verdict?: string | null;
  contentHash?: string | null;
  createdAt: string;
}

/*
 * Per-project agent Skills registry (F#27). Three tabs:
 *  - Project   — builtin catalog toggles (ProjectSkill overrides) + project-scoped
 *                installed GitHub-repo skills.
 *  - Workspace — installed GitHub-repo skills scoped to the project's workspace.
 *  - Community — the curated public skill-repo catalog: browse, search, install,
 *                and open a chevron detail with the fetched instructions.
 * Every write goes through the ide-panel proxy (/projects/:id/ide-panel/skills)
 * which relays to the real, additive, unflagged backend.
 */
type SkillsTab = 'project' | 'workspace' | 'community';
type SkillInstallScope = 'project' | 'workspace';

function ProjectSkillsPanel({
  projectId,
  data,
  busy,
  reload,
}: {
  projectId?: string;
  data: any;
  busy: boolean;
  reload?: () => void | Promise<void>;
}) {
  const skills = (data?.skills ?? []) as ProjectSkill[];
  const catalog = (data?.catalog ?? []) as SkillCatalogEntry[];
  const installedProject = (data?.installedProject ?? []) as InstalledSkill[];
  const installedWorkspace = (data?.installedWorkspace ?? []) as InstalledSkill[];
  const auditEvents = (data?.auditEvents ?? []) as SkillAuditEvent[];
  const hasWorkspace = Boolean(data?.hasWorkspace);

  const [tab, setTab] = useState<SkillsTab>('project');
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [communityScope, setCommunityScope] = useState<SkillInstallScope>('project');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  const submit = useCallback(
    async (fields: Record<string, string>, key: string) => {
      if (!projectId) {
        return false;
      }

      setPending(key);
      setError(null);
      setNote(null);

      try {
        const form = new FormData();

        for (const [name, value] of Object.entries(fields)) {
          form.append(name, value);
        }

        const response = await fetch(`/api/projects/${projectId}/ide-panel/skills`, { method: 'POST', body: form });
        const result = (await response.json().catch(() => ({}))) as { error?: string; note?: string };

        if (!response.ok) {
          throw new Error(result.error ?? 'Unable to update skills.');
        }

        if (result.note) {
          setNote(result.note);
        }

        await reload?.();

        return true;
      } catch (actionError) {
        setError(actionError instanceof Error ? actionError.message : 'Unable to update skills.');

        return false;
      } finally {
        setPending(null);
      }
    },
    [projectId, reload],
  );

  const toggleBuiltin = useCallback(
    (skill: ProjectSkill) =>
      submit({ intent: skill.enabled ? 'disable' : 'enable', skillId: skill.id }, `b:${skill.id}`),
    [submit],
  );

  const installFromCatalog = useCallback(
    (ownerRepo: string, scope: SkillInstallScope) => submit({ intent: 'install', ownerRepo, scope }, `i:${ownerRepo}`),
    [submit],
  );

  const uninstall = useCallback(
    async (ownerRepo: string, scope: SkillInstallScope) => {
      const ok = await submit({ intent: 'uninstall', ownerRepo, scope }, `u:${scope}:${ownerRepo}`);

      if (ok) {
        setConfirming(null);
      }
    },
    [submit],
  );

  const toggleInstalled = useCallback(
    (skill: InstalledSkill, scope: SkillInstallScope) =>
      submit(
        { intent: skill.enabled ? 'disable-installed' : 'enable-installed', ownerRepo: skill.ownerRepo, scope },
        `t:${scope}:${skill.ownerRepo}`,
      ),
    [submit],
  );

  const revokeInstalled = useCallback(
    (ownerRepo: string, scope: SkillInstallScope) =>
      submit({ intent: 'revoke', ownerRepo, scope }, `r:${scope}:${ownerRepo}`),
    [submit],
  );

  const approveInstalled = useCallback(
    (ownerRepo: string, scope: SkillInstallScope) =>
      submit({ intent: 'approve', ownerRepo, scope }, `a:${scope}:${ownerRepo}`),
    [submit],
  );

  const needle = query.trim().toLowerCase();

  const filteredCatalog = needle
    ? catalog.filter(
        (entry) =>
          entry.name.toLowerCase().includes(needle) ||
          entry.description.toLowerCase().includes(needle) ||
          entry.ownerRepo.toLowerCase().includes(needle) ||
          entry.category.toLowerCase().includes(needle),
      )
    : catalog;

  const tabs: Array<{ id: SkillsTab; label: string; count: number }> = [
    { id: 'project', label: 'Project', count: skills.filter((s) => s.enabled).length + installedProject.length },
    { id: 'workspace', label: 'Workspace', count: installedWorkspace.length },
    { id: 'community', label: 'Community', count: catalog.length },
  ];

  const tabButtonClass = (active: boolean) =>
    `rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
      active
        ? 'bg-[var(--vc-ide-accent-action)] text-white'
        : 'text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-3'
    }`;

  return (
    <div className="bolt-project-managed-panel bolt-project-skills-panel">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-bolt-elements-borderColor pb-3">
        {tabs.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => setTab(entry.id)}
            className={tabButtonClass(tab === entry.id)}
            aria-pressed={tab === entry.id}
          >
            {entry.label}
            <span className="ml-1.5 opacity-70">{entry.count}</span>
          </button>
        ))}
      </div>

      {error ? (
        <p
          className="mt-3 rounded-md border border-[var(--vc-ide-accent-error)]/40 px-3 py-2 text-xs text-[var(--status-error-text)]"
          role="status"
        >
          {error}
        </p>
      ) : null}
      {note ? (
        <p className="mt-3 text-xs text-bolt-elements-textSecondary" role="status">
          {note}
        </p>
      ) : null}

      {tab === 'project' ? (
        <section className="mt-3 grid gap-4">
          <div className="grid gap-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-bolt-elements-textSecondary">
              Builtin skills
            </h4>
            <p className="text-xs text-bolt-elements-textSecondary">
              Toggles are stored per project over a builtin catalog; the agent applies enabled skills as capabilities.
            </p>
            {skills.length ? (
              skills.map((skill) => (
                <div
                  key={skill.id}
                  className="flex items-center justify-between gap-3 rounded-md border border-bolt-elements-borderColor px-3 py-2"
                >
                  <div className="min-w-0">
                    <strong className="block truncate text-sm text-bolt-elements-textPrimary">{skill.name}</strong>
                    {skill.description ? (
                      <span className="block text-xs text-bolt-elements-textSecondary">{skill.description}</span>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => void toggleBuiltin(skill)}
                    disabled={busy || pending === `b:${skill.id}`}
                    className={`shrink-0 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-60 ${
                      skill.enabled
                        ? 'border-bolt-elements-focus bg-bolt-elements-background-depth-3 text-bolt-elements-textPrimary'
                        : 'border-bolt-elements-borderColor text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-3'
                    }`}
                    aria-pressed={Boolean(skill.enabled)}
                  >
                    {pending === `b:${skill.id}` ? '…' : skill.enabled ? 'Enabled' : 'Disabled'}
                  </button>
                </div>
              ))
            ) : (
              <div className="bolt-project-empty-panel">No builtin skills are available.</div>
            )}
          </div>

          <InstalledSkillsList
            title="Installed from GitHub (project)"
            emptyLabel="No project-scoped skills installed yet. Browse the Community tab to add some."
            skills={installedProject}
            scope="project"
            busy={busy}
            pending={pending}
            expanded={expanded}
            confirming={confirming}
            onExpand={setExpanded}
            onConfirm={setConfirming}
            onToggle={toggleInstalled}
            onUninstall={uninstall}
            onRevoke={revokeInstalled}
            onApprove={approveInstalled}
          />

          <SkillAuditLog events={auditEvents} />
        </section>
      ) : null}

      {tab === 'workspace' ? (
        <section className="mt-3 grid gap-4">
          {!hasWorkspace ? (
            <div className="bolt-project-empty-panel">
              This project has no workspace yet. Open the project once, then install workspace-scoped skills.
            </div>
          ) : (
            <InstalledSkillsList
              title="Installed from GitHub (workspace)"
              emptyLabel="No workspace-scoped skills installed yet."
              skills={installedWorkspace}
              scope="workspace"
              busy={busy}
              pending={pending}
              expanded={expanded}
              confirming={confirming}
              onExpand={setExpanded}
              onConfirm={setConfirming}
              onToggle={toggleInstalled}
              onUninstall={uninstall}
              onRevoke={revokeInstalled}
              onApprove={approveInstalled}
            />
          )}
        </section>
      ) : null}

      {tab === 'community' ? (
        <section className="mt-3 grid gap-3">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search skills by name, repo, or category"
            className="w-full rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-2 text-sm text-bolt-elements-textPrimary placeholder:text-bolt-elements-textTertiary focus:border-bolt-elements-focus focus:outline-none"
          />

          <div className="flex flex-wrap items-center gap-2 text-xs text-bolt-elements-textSecondary">
            <span>Install to:</span>
            {(['project', 'workspace'] as SkillInstallScope[]).map((scope) => (
              <button
                key={scope}
                type="button"
                onClick={() => setCommunityScope(scope)}
                disabled={scope === 'workspace' && !hasWorkspace}
                className={`rounded-md border px-2.5 py-1 font-medium capitalize transition-colors disabled:opacity-50 ${
                  communityScope === scope
                    ? 'border-[var(--vc-ide-accent-action)] text-[var(--vc-ide-accent-action)]'
                    : 'border-bolt-elements-borderColor hover:bg-bolt-elements-background-depth-3'
                }`}
              >
                {scope}
              </button>
            ))}
          </div>

          {filteredCatalog.length ? (
            filteredCatalog.map((entry) => {
              const installed = communityScope === 'project' ? entry.installedInProject : entry.installedInWorkspace;

              const isExpanded = expanded === `c:${entry.ownerRepo}`;

              return (
                <div key={entry.ownerRepo} className="rounded-md border border-bolt-elements-borderColor px-3 py-2.5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => setExpanded(isExpanded ? null : `c:${entry.ownerRepo}`)}
                      className="flex min-w-0 flex-1 items-start gap-2 text-left"
                      aria-expanded={isExpanded}
                    >
                      <span
                        className={`i-ph:caret-right mt-0.5 shrink-0 text-bolt-elements-textSecondary transition-transform ${
                          isExpanded ? 'rotate-90' : ''
                        }`}
                      />
                      <span className="min-w-0">
                        <strong className="block truncate text-sm text-bolt-elements-textPrimary">{entry.name}</strong>
                        <span className="block truncate text-xs text-bolt-elements-textTertiary">
                          {entry.ownerRepo}
                        </span>
                        <span className="mt-0.5 block text-xs text-bolt-elements-textSecondary">
                          {entry.description}
                        </span>
                        <span className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-bolt-elements-textTertiary">
                          <span className="rounded bg-bolt-elements-background-depth-3 px-1.5 py-0.5 capitalize">
                            {entry.category}
                          </span>
                          <span>
                            {entry.installCount} install{entry.installCount === 1 ? '' : 's'}
                          </span>
                        </span>
                      </span>
                    </button>

                    {installed ? (
                      <button
                        type="button"
                        onClick={() => void uninstall(entry.ownerRepo, communityScope)}
                        disabled={busy || pending === `u:${communityScope}:${entry.ownerRepo}`}
                        className="shrink-0 rounded-md border border-[var(--vc-ide-accent-error)]/50 px-3 py-1.5 text-xs font-medium text-[var(--vc-ide-accent-error)] transition-colors hover:bg-[var(--vc-ide-accent-error)]/10 disabled:opacity-60"
                      >
                        {pending === `u:${communityScope}:${entry.ownerRepo}` ? '…' : 'Uninstall'}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void installFromCatalog(entry.ownerRepo, communityScope)}
                        disabled={busy || pending === `i:${entry.ownerRepo}`}
                        className="shrink-0 rounded-md bg-[var(--vc-ide-accent-action)] px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                      >
                        {pending === `i:${entry.ownerRepo}` ? 'Installing…' : 'Install'}
                      </button>
                    )}
                  </div>

                  {isExpanded ? (
                    <div className="mt-2 border-t border-bolt-elements-borderColor pt-2 text-xs text-bolt-elements-textSecondary">
                      <a
                        href={entry.homepageUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-[var(--vc-ide-accent-action)] hover:underline"
                      >
                        <span className="i-ph:github-logo" />
                        {entry.homepageUrl.replace(/^https?:\/\//, '')}
                      </a>
                    </div>
                  ) : null}
                </div>
              );
            })
          ) : (
            <div className="bolt-project-empty-panel">No community skills match “{query}”.</div>
          )}
        </section>
      ) : null}
    </div>
  );
}

/** Shared list of installed GitHub-repo skills with toggle + confirm-uninstall + chevron detail. */
/** The append-only skill audit journal for the project scope (RPL-SK-001.3). */
function SkillAuditLog({ events }: { events: SkillAuditEvent[] }) {
  const [open, setOpen] = useState(false);

  if (!events.length) {
    return null;
  }

  const actionStyle: Record<string, string> = {
    'install-rejected': 'text-[var(--vc-ide-accent-error)]',
    'install-quarantined': 'text-[var(--vc-ide-accent-warning,#d97706)]',
    revoke: 'text-[var(--vc-ide-accent-error)]',
  };

  return (
    <div className="grid gap-2">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-2 text-left text-xs font-semibold uppercase tracking-wide text-bolt-elements-textSecondary"
        aria-expanded={open}
      >
        <span className={`i-ph:caret-right transition-transform ${open ? 'rotate-90' : ''}`} />
        Audit log
        <span className="opacity-70">{events.length}</span>
      </button>

      {open ? (
        <ul className="grid gap-1">
          {events.map((event) => (
            <li
              key={event.id}
              className="flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded border border-bolt-elements-borderColor px-2 py-1 text-[11px]"
            >
              <span className={`font-medium ${actionStyle[event.action] ?? 'text-bolt-elements-textPrimary'}`}>
                {event.action}
              </span>
              <span className="text-bolt-elements-textSecondary">{event.ownerRepo}</span>
              {event.verdict ? <span className="text-bolt-elements-textTertiary">({event.verdict})</span> : null}
              <span className="ml-auto text-bolt-elements-textTertiary">
                {new Date(event.createdAt).toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Provenance + audit-state badges for an installed skill (RPL-SK-001.4). */
function SkillProvenanceBadges({ skill }: { skill: InstalledSkill }) {
  const verdict = skill.revokedAt ? 'revoked' : (skill.auditVerdict ?? null);

  const verdictStyle: Record<string, string> = {
    approved: 'border-[var(--vc-ide-accent-success,#16a34a)]/50 text-[var(--vc-ide-accent-success,#16a34a)]',
    quarantined: 'border-[var(--vc-ide-accent-warning,#d97706)]/50 text-[var(--vc-ide-accent-warning,#d97706)]',
    rejected: 'border-[var(--vc-ide-accent-error)]/50 text-[var(--vc-ide-accent-error)]',
    revoked: 'border-[var(--vc-ide-accent-error)]/50 text-[var(--vc-ide-accent-error)]',
  };

  const verdictIcon: Record<string, string> = {
    approved: 'i-ph:shield-check',
    quarantined: 'i-ph:warning',
    rejected: 'i-ph:prohibit',
    revoked: 'i-ph:seal-warning',
  };

  return (
    <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
      {verdict ? (
        <span
          className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-medium capitalize ${
            verdictStyle[verdict] ?? 'border-bolt-elements-borderColor text-bolt-elements-textSecondary'
          }`}
          title="Security-audit verdict"
        >
          <span className={verdictIcon[verdict] ?? 'i-ph:shield'} />
          {verdict}
        </span>
      ) : null}
      {skill.origin ? (
        <span
          className="inline-flex items-center gap-1 rounded bg-bolt-elements-background-depth-3 px-1.5 py-0.5 capitalize text-bolt-elements-textTertiary"
          title="Where this skill came from"
        >
          <span className="i-ph:git-fork" />
          {skill.origin}
        </span>
      ) : null}
      {skill.auditFindings && skill.auditFindings.length ? (
        <span className="text-bolt-elements-textTertiary">
          {skill.auditFindings.length} finding{skill.auditFindings.length === 1 ? '' : 's'}
        </span>
      ) : null}
    </span>
  );
}

const SEVERITY_STYLE: Record<string, string> = {
  critical: 'text-[var(--vc-ide-accent-error)]',
  high: 'text-[var(--vc-ide-accent-warning,#d97706)]',
  medium: 'text-bolt-elements-textSecondary',
  low: 'text-bolt-elements-textTertiary',
  info: 'text-bolt-elements-textTertiary',
};

function InstalledSkillsList({
  title,
  emptyLabel,
  skills,
  scope,
  busy,
  pending,
  expanded,
  confirming,
  onExpand,
  onConfirm,
  onToggle,
  onUninstall,
  onRevoke,
  onApprove,
}: {
  title: string;
  emptyLabel: string;
  skills: InstalledSkill[];
  scope: SkillInstallScope;
  busy: boolean;
  pending: string | null;
  expanded: string | null;
  confirming: string | null;
  onExpand: (key: string | null) => void;
  onConfirm: (key: string | null) => void;
  onToggle: (skill: InstalledSkill, scope: SkillInstallScope) => void | Promise<unknown>;
  onUninstall: (ownerRepo: string, scope: SkillInstallScope) => void | Promise<unknown>;
  onRevoke: (ownerRepo: string, scope: SkillInstallScope) => void | Promise<unknown>;
  onApprove: (ownerRepo: string, scope: SkillInstallScope) => void | Promise<unknown>;
}) {
  return (
    <div className="grid gap-2">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-bolt-elements-textSecondary">{title}</h4>
      {skills.length ? (
        skills.map((skill) => {
          const rowKey = `${scope}:${skill.ownerRepo}`;
          const isExpanded = expanded === `s:${rowKey}`;
          const isConfirming = confirming === rowKey;

          return (
            <div key={skill.id} className="rounded-md border border-bolt-elements-borderColor px-3 py-2.5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <button
                  type="button"
                  onClick={() => onExpand(isExpanded ? null : `s:${rowKey}`)}
                  className="flex min-w-0 flex-1 items-start gap-2 text-left"
                  aria-expanded={isExpanded}
                >
                  <span
                    className={`i-ph:caret-right mt-0.5 shrink-0 text-bolt-elements-textSecondary transition-transform ${
                      isExpanded ? 'rotate-90' : ''
                    }`}
                  />
                  <span className="min-w-0">
                    <strong className="block truncate text-sm text-bolt-elements-textPrimary">{skill.name}</strong>
                    <span className="block truncate text-xs text-bolt-elements-textTertiary">{skill.ownerRepo}</span>
                    <SkillProvenanceBadges skill={skill} />
                  </span>
                </button>

                <div className="flex shrink-0 items-center gap-1.5">
                  {skill.auditVerdict === 'quarantined' && !skill.revokedAt ? (
                    <button
                      type="button"
                      onClick={() => void onApprove(skill.ownerRepo, scope)}
                      disabled={busy || pending === `a:${rowKey}`}
                      className="rounded-md border border-[var(--vc-ide-accent-warning,#d97706)]/60 px-3 py-1.5 text-xs font-medium text-[var(--vc-ide-accent-warning,#d97706)] transition-colors hover:bg-[var(--vc-ide-accent-warning,#d97706)]/10 disabled:opacity-60"
                      title="Approve this quarantined skill and enable it"
                    >
                      {pending === `a:${rowKey}` ? '…' : 'Approve'}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void onToggle(skill, scope)}
                    disabled={busy || pending === `t:${rowKey}` || Boolean(skill.revokedAt)}
                    className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-60 ${
                      skill.enabled
                        ? 'border-bolt-elements-focus bg-bolt-elements-background-depth-3 text-bolt-elements-textPrimary'
                        : 'border-bolt-elements-borderColor text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-3'
                    }`}
                    aria-pressed={skill.enabled}
                    title={skill.revokedAt ? 'Revoked — re-install to reconsider' : undefined}
                  >
                    {pending === `t:${rowKey}` ? '…' : skill.enabled ? 'Enabled' : 'Disabled'}
                  </button>

                  {!skill.revokedAt ? (
                    <button
                      type="button"
                      onClick={() => void onRevoke(skill.ownerRepo, scope)}
                      disabled={busy || pending === `r:${rowKey}`}
                      className="rounded-md border border-[var(--vc-ide-accent-error)]/50 px-3 py-1.5 text-xs font-medium text-[var(--vc-ide-accent-error)] transition-colors hover:bg-[var(--vc-ide-accent-error)]/10 disabled:opacity-60"
                      title="Revoke: hard-disable and keep for the audit trail"
                    >
                      {pending === `r:${rowKey}` ? '…' : 'Revoke'}
                    </button>
                  ) : null}

                  {isConfirming ? (
                    <>
                      <button
                        type="button"
                        onClick={() => void onUninstall(skill.ownerRepo, scope)}
                        disabled={busy || pending === `u:${rowKey}`}
                        className="rounded-md bg-[var(--vc-ide-accent-error)] px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                      >
                        {pending === `u:${rowKey}` ? '…' : 'Confirm'}
                      </button>
                      <button
                        type="button"
                        onClick={() => onConfirm(null)}
                        className="rounded-md border border-bolt-elements-borderColor px-3 py-1.5 text-xs font-medium text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-3"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onConfirm(rowKey)}
                      className="rounded-md border border-[var(--vc-ide-accent-error)]/50 px-3 py-1.5 text-xs font-medium text-[var(--vc-ide-accent-error)] transition-colors hover:bg-[var(--vc-ide-accent-error)]/10"
                    >
                      Uninstall
                    </button>
                  )}
                </div>
              </div>

              {isExpanded ? (
                <div className="mt-2 border-t border-bolt-elements-borderColor pt-2">
                  {skill.homepageUrl ? (
                    <a
                      href={skill.homepageUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mb-1 inline-flex items-center gap-1 text-xs text-[var(--vc-ide-accent-action)] hover:underline"
                    >
                      <span className="i-ph:github-logo" />
                      {skill.homepageUrl.replace(/^https?:\/\//, '')}
                    </a>
                  ) : null}

                  {/* Provenance (RPL-SK-001.4): integrity hash, manifest name, resources. */}
                  <dl className="mt-1 grid grid-cols-[auto,1fr] gap-x-3 gap-y-0.5 text-[11px] text-bolt-elements-textTertiary">
                    {skill.contentHash ? (
                      <>
                        <dt>Content hash</dt>
                        <dd className="truncate font-mono" title={skill.contentHash}>
                          sha256:{skill.contentHash.slice(0, 16)}…
                        </dd>
                      </>
                    ) : null}
                    {skill.manifestName ? (
                      <>
                        <dt>Manifest</dt>
                        <dd className="truncate">{skill.manifestName}</dd>
                      </>
                    ) : null}
                    {skill.auditedAt ? (
                      <>
                        <dt>Audited</dt>
                        <dd>{new Date(skill.auditedAt).toLocaleString()}</dd>
                      </>
                    ) : null}
                    {skill.revokedAt ? (
                      <>
                        <dt>Revoked</dt>
                        <dd className="text-[var(--vc-ide-accent-error)]">
                          {new Date(skill.revokedAt).toLocaleString()}
                          {skill.revokeReason ? ` — ${skill.revokeReason}` : ''}
                        </dd>
                      </>
                    ) : null}
                  </dl>

                  {skill.resources && skill.resources.length ? (
                    <div className="mt-1.5 text-[11px] text-bolt-elements-textTertiary">
                      <span className="font-medium">Bundled resources (loaded on demand):</span>{' '}
                      {skill.resources.map((resource) => resource.path).join(', ')}
                    </div>
                  ) : null}

                  {/* Audit findings (RPL-SK-001.3). */}
                  {skill.auditFindings && skill.auditFindings.length ? (
                    <ul className="mt-2 grid gap-1.5">
                      {skill.auditFindings.map((finding, index) => (
                        <li
                          key={`${finding.code}:${index}`}
                          className="rounded border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-2 py-1.5 text-[11px]"
                        >
                          <span className={`font-semibold uppercase ${SEVERITY_STYLE[finding.severity] ?? ''}`}>
                            {finding.severity}
                          </span>{' '}
                          <span className="text-bolt-elements-textPrimary">{finding.title}</span>
                          <span className="block text-bolt-elements-textSecondary">{finding.detail}</span>
                          <span className="mt-0.5 block text-bolt-elements-textTertiary">
                            {finding.location}: <code className="font-mono">{finding.evidence}</code>
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  <pre className="mt-1.5 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-bolt-elements-background-depth-2 p-2 text-xs text-bolt-elements-textSecondary">
                    {skill.instructions}
                  </pre>
                </div>
              ) : null}
            </div>
          );
        })
      ) : (
        <div className="bolt-project-empty-panel">{emptyLabel}</div>
      )}
    </div>
  );
}

function ProjectPackagesPanel({ data, onSubmit, busy }: { data: any; onSubmit: any; busy: boolean }) {
  const [query, setQuery] = useState('');
  const detectedPackageManager = data.packageManager || 'npm';
  const [packageManager, setPackageManager] = useState(detectedPackageManager);
  const [packageInput, setPackageInput] = useState('');
  const [installAsDevDependency, setInstallAsDevDependency] = useState(false);
  const manifests = data.manifests ?? [];
  const dependencies = data.dependencies ?? [];
  const lockfiles = data.lockfiles ?? [];
  const runs = data.packagesState?.runs ?? [];
  const packageFiles = (data.files ?? []).filter((file: any) => String(file.path ?? '').endsWith('package.json'));

  const visibleDependencies = dependencies.filter((dependency: any) => {
    const haystack =
      `${dependency.name} ${dependency.version} ${dependency.scope} ${dependency.manifestPath}`.toLowerCase();
    return haystack.includes(query.toLowerCase());
  });

  useEffect(() => {
    setPackageManager(detectedPackageManager);
  }, [detectedPackageManager]);

  const managerOptions = ['npm', 'pnpm', 'yarn', 'bun'];

  return (
    <div className="bolt-project-packages-panel">
      <section className="bolt-project-packages-hero">
        <div>
          <span>Package intelligence</span>
          <h3>{manifests.length ? `${dependencies.length} dependencies detected` : 'No package manifest detected'}</h3>
          <p>
            E-Code reads package manifests and lockfiles directly from the project/runtime, then runs install, audit,
            and outdated checks against the real workspace terminal.
          </p>
        </div>
        <form onSubmit={onSubmit}>
          <input name="intent" value="install-all" type="hidden" />
          <input name="packageManager" value={packageManager} type="hidden" />
          <PanelButton disabled={busy || !manifests.length}>Install from lockfile</PanelButton>
        </form>
      </section>

      <section className="bolt-project-package-manager-card">
        <div className="bolt-project-package-summary-header">
          <div>
            <span>Workspace package summary</span>
            <strong>{packageManager}</strong>
          </div>
          <small>{lockfiles.length ? `${lockfiles.length} lockfile(s) detected` : 'No lockfile detected yet'}</small>
        </div>
        <div className="bolt-project-package-stat-grid">
          <article>
            <span>Manifests</span>
            <strong>{manifests.length}</strong>
            <small>
              {packageFiles.length ? packageFiles.map((file: any) => file.path).join(', ') : 'No package.json'}
            </small>
          </article>
          <article>
            <span>Indexed files</span>
            <strong>{data.files?.length ?? 0}</strong>
            <small>Project storage plus runtime package files</small>
          </article>
          <article>
            <span>Runtime</span>
            <strong>{data.workspace?.status ?? 'unknown'}</strong>
            <small>{data.workspace?.runtimeMode ?? 'Workspace command runner'}</small>
          </article>
          <article>
            <span>Lockfiles</span>
            <strong>{lockfiles.length}</strong>
            <small>
              {lockfiles.length ? lockfiles.map((file: any) => file.path).join(', ') : 'Install will create one'}
            </small>
          </article>
        </div>
      </section>

      <section className="bolt-project-package-actions" aria-label="Package install and maintenance actions">
        <div className="bolt-project-package-action-header">
          <div>
            <span>Add package</span>
            <h4>Install into the real workspace</h4>
            <p>Choose the detected package manager, then install one or more packages against this project.</p>
          </div>
          <div className="bolt-project-package-manager-options" role="group" aria-label="Package manager">
            {managerOptions.map((manager) => (
              <button
                key={manager}
                type="button"
                className={manager === packageManager ? 'selected' : undefined}
                onClick={() => setPackageManager(manager)}
              >
                {manager}
              </button>
            ))}
          </div>
        </div>
        <form onSubmit={onSubmit} className="bolt-project-package-install-form">
          <input name="intent" value="install-package" type="hidden" />
          <input name="packageManager" value={packageManager} type="hidden" />
          <input name="packages" value={packageInput} type="hidden" />
          <input name="devDependency" value={installAsDevDependency ? 'true' : 'false'} type="hidden" />
          <label>
            Add package
            <input
              value={packageInput}
              onChange={(event) => setPackageInput(event.target.value)}
              placeholder="@scope/name, react-query, vite@latest"
              autoComplete="off"
            />
          </label>
          <label className="bolt-project-package-checkbox">
            <input
              type="checkbox"
              checked={installAsDevDependency}
              onChange={(event) => setInstallAsDevDependency(event.target.checked)}
            />
            Dev dependency
          </label>
          <PanelButton disabled={busy || !packageInput.trim()}>Install package</PanelButton>
        </form>
        <div className="bolt-project-package-command-row" aria-label="Package health checks">
          <form onSubmit={onSubmit}>
            <input name="intent" value="audit" type="hidden" />
            <input name="packageManager" value={packageManager} type="hidden" />
            <PanelButton variant="outline" disabled={busy || !manifests.length}>
              Run security audit
            </PanelButton>
          </form>
          <form onSubmit={onSubmit}>
            <input name="intent" value="outdated" type="hidden" />
            <input name="packageManager" value={packageManager} type="hidden" />
            <PanelButton variant="outline" disabled={busy || !manifests.length}>
              Check outdated
            </PanelButton>
          </form>
        </div>
      </section>

      <section className="bolt-project-package-content">
        <div>
          <div className="bolt-project-panel-toolbar">
            <label>
              Filter installed packages
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search name, version, manifest, scope"
              />
            </label>
          </div>
          <div className="bolt-project-package-list">
            {visibleDependencies.map((dependency: any) => (
              <a
                key={`${dependency.manifestPath}:${dependency.scope}:${dependency.name}`}
                href={`https://www.npmjs.com/package/${encodeURIComponent(dependency.name)}`}
                target="_blank"
                rel="noreferrer"
              >
                <strong>{dependency.name}</strong>
                <span>{dependency.version}</span>
                <em>{dependency.scope}</em>
                <small>{dependency.manifestPath}</small>
              </a>
            ))}
            {!visibleDependencies.length && (
              <div className="bolt-project-empty-panel">
                {dependencies.length
                  ? 'No installed package matches this filter.'
                  : 'No dependencies found in package.json.'}
              </div>
            )}
          </div>
        </div>

        <aside className="bolt-project-package-sidebar">
          <div>
            <h4>Manifests</h4>
            {manifests.length ? (
              manifests.map((manifest: any) => (
                <article key={manifest.path}>
                  <strong>{manifest.name}</strong>
                  <span>{manifest.path}</span>
                  <small>
                    {manifest.dependencyCount} prod / {manifest.devDependencyCount} dev
                  </small>
                </article>
              ))
            ) : (
              <p>No package.json has been indexed for this workspace.</p>
            )}
          </div>
          <div>
            <h4>Install &amp; runtime checks</h4>
            {runs.length ? (
              runs.map((run: any) => {
                const failed = run.status === 'failed' || (run.exitCode != null && run.exitCode !== 0);
                const outputTail = typeof run.output === 'string' ? run.output.trim().slice(-1200) : '';

                return (
                  <article key={run.id}>
                    <strong>{run.name}</strong>
                    <span className={failed ? 'text-bolt-elements-icon-error' : 'text-bolt-elements-icon-success'}>
                      {failed ? 'failed' : 'succeeded'} · exit {run.exitCode ?? 0}
                    </span>
                    <small>{run.script}</small>
                    {outputTail ? (
                      <pre
                        className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-md bg-bolt-elements-background-depth-3 p-2 text-[11px] leading-snug text-bolt-elements-textSecondary"
                        aria-label={`${run.name} output`}
                      >
                        {outputTail}
                      </pre>
                    ) : null}
                    <small>{run.finishedAt ? new Date(run.finishedAt).toLocaleString() : ''}</small>
                  </article>
                );
              })
            ) : (
              <p>
                Install a package, or run audit/outdated, to capture real package-manager output from the workspace.
              </p>
            )}
          </div>
        </aside>
      </section>
    </div>
  );
}

/*
 * Ports — real, against the runtime. Lists the ports the running workspace has
 * opened (GET /api/runtime/workspaces/:id/ports → {port, ready, url}) with a
 * preview link per port, a primary-port selection and a public/private toggle,
 * both persisted server-side (VIBECORE_PORTS_STATE) via the ide-panel action.
 */
function ProjectPortsPanel({
  data,
  projectId,
  onSubmit,
  busy,
}: {
  data: any;
  projectId?: string;
  onSubmit: any;
  busy: boolean;
}) {
  const ports = runtimePortsFromPayload(data);
  const portsState = data.portsState ?? {};
  const primaryPort = portsState.primaryPort;
  const visibility: Record<string, string> = portsState.visibility ?? {};

  return (
    <div className="bolt-project-managed-panel bolt-project-ports-panel">
      <section className="grid gap-3">
        <p className="text-xs text-bolt-elements-textSecondary">
          Ports opened by the running workspace. Open a port&apos;s preview, choose the primary port, or set its
          visibility.
        </p>

        {ports.length ? (
          <div className="grid gap-2">
            {ports.map((entry) => {
              const portNumber = entry.port;
              const isPrimary = primaryPort != null && Number(primaryPort) === Number(portNumber);
              const vis = visibility[String(portNumber)] ?? 'public';

              return (
                <div
                  key={String(portNumber)}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-bolt-elements-borderColor px-3 py-2 text-xs"
                >
                  <div className="min-w-0">
                    <strong className="text-bolt-elements-textPrimary">
                      :{portNumber}
                      {isPrimary ? ' · primary' : ''}
                    </strong>
                    <span
                      className={`ml-2 ${entry.ready ? 'text-[var(--status-success-text)]' : 'text-[var(--status-warning-text)]'}`}
                    >
                      {entry.ready ? 'ready' : 'starting'}
                    </span>
                    <span className="ml-2 rounded bg-bolt-elements-background-depth-3 px-1.5 py-0.5 text-bolt-elements-textSecondary">
                      {vis}
                    </span>
                    {entry.url ? (
                      <div className="mt-0.5 truncate font-mono text-bolt-elements-textSecondary">{entry.url}</div>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {entry.url ? (
                      <a href={entry.url} target="_blank" rel="noreferrer" className="underline">
                        Open preview
                      </a>
                    ) : null}
                    <form onSubmit={onSubmit}>
                      <input type="hidden" name="intent" value="set-primary" />
                      <input type="hidden" name="port" value={String(portNumber)} />
                      <button type="submit" disabled={busy || isPrimary}>
                        {isPrimary ? 'Primary' : 'Set primary'}
                      </button>
                    </form>
                    <form onSubmit={onSubmit}>
                      <input type="hidden" name="intent" value="set-visibility" />
                      <input type="hidden" name="port" value={String(portNumber)} />
                      <input type="hidden" name="visibility" value={vis === 'public' ? 'private' : 'public'} />
                      <button type="submit" disabled={busy || !projectId}>
                        {vis === 'public' ? 'Make private' : 'Make public'}
                      </button>
                    </form>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bolt-project-empty-panel">
            No ports detected yet. Start your app (it must listen on a port) and refresh.
          </div>
        )}
      </section>
    </div>
  );
}

interface StudioMemorySummary {
  total: number;
  enabled: boolean;
  recent: Array<{ id: string; content: string; scope?: string; memoryType?: string; createdAt?: string }>;
}

/**
 * Read-only projection of one persisted multi-agent ConsensusRecord as returned
 * by GET /projects/:projectId/agent-consensus (project-scoped via AgentRun.projectId).
 */
interface ConsensusRecordView {
  id: string;
  runId: string;
  algorithm: 'QUORUM' | 'BYZANTINE_PBFT' | 'WEIGHTED_PLURALITY' | string;
  outcome: 'ACCEPTED' | 'REJECTED' | 'PARTIAL' | 'ABSTAINED' | string;
  agreementScore: number;
  roundCount: number;
  durationMs: number;
  createdAt: string;
}

const CONSENSUS_OUTCOME_LABEL: Record<string, string> = {
  ACCEPTED: 'Accepted',
  REJECTED: 'Rejected',
  PARTIAL: 'Partial',
  ABSTAINED: 'Abstained',
};

const CONSENSUS_OUTCOME_CLASS: Record<string, string> = {
  ACCEPTED: 'text-[var(--status-success-text)] border-green-500/40',
  REJECTED: 'text-[var(--status-error-text)] border-red-500/40',
  PARTIAL: 'text-amber-500 border-amber-500/40',
  ABSTAINED: 'text-bolt-elements-textSecondary border-bolt-elements-borderColor',
};

const CONSENSUS_ALGORITHM_LABEL: Record<string, string> = {
  QUORUM: 'Quorum',
  BYZANTINE_PBFT: 'Byzantine (PBFT)',
  WEIGHTED_PLURALITY: 'Weighted plurality',
};

function AgentConsensusOutcomeBadge({ outcome }: { outcome: string }) {
  const label = CONSENSUS_OUTCOME_LABEL[outcome] ?? outcome;

  const className =
    CONSENSUS_OUTCOME_CLASS[outcome] ?? 'text-bolt-elements-textSecondary border-bolt-elements-borderColor';

  return <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${className}`}>{label}</span>;
}

function formatConsensusScore(score: number) {
  if (!Number.isFinite(score)) {
    return '—';
  }

  // Scores are 0–1 agreement ratios; show as a percentage.
  return `${Math.round(Math.max(0, Math.min(1, score)) * 100)}% agreement`;
}

function formatConsensusAlgorithm(algorithm: string) {
  return CONSENSUS_ALGORITHM_LABEL[algorithm] ?? algorithm;
}

function formatConsensusDuration(durationMs: number) {
  if (!Number.isFinite(durationMs) || durationMs < 0) {
    return '—';
  }

  if (durationMs < 1000) {
    return `${Math.round(durationMs)} ms`;
  }

  return `${(durationMs / 1000).toFixed(durationMs < 10_000 ? 1 : 0)} s`;
}

/*
 * Full consensus detail (the per-agent vote) fetched on demand from
 * GET /api/projects/:id/agent-consensus/:runId when a row is expanded.
 */
interface ConsensusClaimVoteView {
  claim: string;
  type: string;
  supporters: string[];
  dissenters: string[];
  abstainers: string[];
  agreementRatio: number;
  decision: string;
}

interface ConsensusConflictView {
  type: string;
  description: string;
  involvedRoles: string[];
  severity: string;
}

interface ConsensusConsolidatedView {
  summary: string;
  acceptedRisks: string[];
  acceptedVerification: string[];
  acceptedFiles: string[];
  rejectedClaims: Array<{ claim: string; type: string }>;
  perRoleSummaries: Array<{ roleId: string; summary: string; status: string }>;
}

interface ConsensusRecordDetailView extends ConsensusRecordView {
  claimVotes: ConsensusClaimVoteView[];
  conflicts: ConsensusConflictView[];
  consolidated: ConsensusConsolidatedView | null;
}

// Specialist lane ids → human labels (the agents that vote in a run).
const CONSENSUS_LANE_LABEL: Record<string, string> = {
  architect: 'Architect',
  frontend: 'Frontend',
  backend: 'Backend',
  devops: 'DevOps',
  qa: 'QA',
};

function consensusLaneLabel(roleId: string): string {
  return CONSENSUS_LANE_LABEL[roleId] ?? roleId;
}

/** A row of lane chips (supporters / dissenters / abstainers) for one claim. */
function ConsensusLaneChips({ label, roles, tone }: { label: string; roles: string[]; tone: string }) {
  if (roles.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className="text-[11px] uppercase tracking-wide text-bolt-elements-textSecondary">{label}</span>
      {roles.map((role) => (
        <span key={role} className={`rounded-full border px-1.5 py-0.5 text-[11px] ${tone}`}>
          {consensusLaneLabel(role)}
        </span>
      ))}
    </div>
  );
}

const CONSENSUS_DECISION_CLASS: Record<string, string> = {
  accepted: 'text-[var(--status-success-text)]',
  rejected: 'text-[var(--status-error-text)]',
  inconclusive: 'text-amber-500',
};

const CONSENSUS_SEVERITY_CLASS: Record<string, string> = {
  high: 'text-[var(--status-error-text)] border-red-500/40',
  medium: 'text-amber-500 border-amber-500/40',
  low: 'text-bolt-elements-textSecondary border-bolt-elements-borderColor',
};

/**
 * The real per-agent vote for one consensus run: each claim with the lanes that
 * supported / dissented / abstained, the inter-lane conflicts, and the merged
 * consolidated summary. Renders the persisted ConsensusRecord detail.
 */
function ConsensusVoteDetail({ detail }: { detail: ConsensusRecordDetailView }) {
  return (
    <>
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-bolt-elements-textSecondary">
          Vote · {detail.claimVotes.length} {detail.claimVotes.length === 1 ? 'claim' : 'claims'}
        </h4>
        {detail.claimVotes.length ? (
          <ul className="mt-1 space-y-2">
            {detail.claimVotes.map((vote, index) => (
              <li key={`${vote.type}-${index}`} className="rounded-md border border-bolt-elements-borderColor p-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`text-xs font-medium ${
                      CONSENSUS_DECISION_CLASS[vote.decision] ?? 'text-bolt-elements-textSecondary'
                    }`}
                  >
                    {vote.decision}
                  </span>
                  <span className="text-[11px] uppercase tracking-wide text-bolt-elements-textSecondary">
                    {vote.type}
                  </span>
                  <span className="ml-auto text-[11px] text-bolt-elements-textSecondary">
                    {Math.round(Math.max(0, Math.min(1, vote.agreementRatio)) * 100)}% agreement
                  </span>
                </div>
                <p className="mt-1 text-xs text-bolt-elements-textPrimary">{vote.claim}</p>
                <div className="mt-1.5 space-y-1">
                  <ConsensusLaneChips
                    label="For"
                    roles={vote.supporters}
                    tone="text-[var(--status-success-text)] border-green-500/40"
                  />
                  <ConsensusLaneChips
                    label="Against"
                    roles={vote.dissenters}
                    tone="text-[var(--status-error-text)] border-red-500/40"
                  />
                  <ConsensusLaneChips
                    label="Abstain"
                    roles={vote.abstainers}
                    tone="text-bolt-elements-textSecondary border-bolt-elements-borderColor"
                  />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-xs text-bolt-elements-textSecondary">No individual claims were voted on.</p>
        )}
      </div>

      {detail.conflicts.length ? (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-bolt-elements-textSecondary">
            Conflicts · {detail.conflicts.length}
          </h4>
          <ul className="mt-1 space-y-1">
            {detail.conflicts.map((conflict, index) => (
              <li key={`${conflict.type}-${index}`} className="flex flex-wrap items-center gap-2 text-xs">
                <span
                  className={`rounded-full border px-1.5 py-0.5 ${
                    CONSENSUS_SEVERITY_CLASS[conflict.severity] ??
                    'text-bolt-elements-textSecondary border-bolt-elements-borderColor'
                  }`}
                >
                  {conflict.severity}
                </span>
                <span className="text-bolt-elements-textSecondary">{conflict.type}</span>
                <span className="text-bolt-elements-textPrimary">{conflict.description}</span>
                {conflict.involvedRoles.length ? (
                  <span className="text-bolt-elements-textSecondary">
                    ({conflict.involvedRoles.map(consensusLaneLabel).join(', ')})
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {detail.consolidated && detail.consolidated.summary ? (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-bolt-elements-textSecondary">
            Consolidated
          </h4>
          <p className="mt-1 whitespace-pre-wrap text-xs text-bolt-elements-textPrimary">
            {detail.consolidated.summary}
          </p>
        </div>
      ) : null}
    </>
  );
}

/*
 * Agent Studio supervisor — a single per-project oversight surface that
 * AGGREGATES the agent signals that already exist elsewhere in the IDE, so an
 * operator can see (and action) everything the agent is doing in one place:
 *
 *   - Pending patch proposals    → live from workbenchStore.agentPatchProposals
 *                                   (approve/reject reuse the EXISTING store path
 *                                   which writes through the patch endpoints).
 *   - Self-repair history        → reuses <AgentRepairHistory> (project-scoped).
 *   - Multi-agent consensus      → reuses GET /projects/:id/agent-consensus,
 *                                   a read-only projection of the persisted
 *                                   ConsensusRecord rows scoped by AgentRun.projectId.
 *   - Conversation branches      → reuses useProjectChatBranches(projectId).
 *   - Agent-memory summary       → reuses GET /api/agent-memory?projectId=…
 *
 * Every signal is scoped to the current projectId; nothing is aggregated across
 * projects. The server-side loader (ide-panel `studio` case) provides initial
 * patch/repair/consensus snapshots gated by project read; the live store is the
 * source of truth for the actionable patch queue.
 */
function ProjectAgentStudioPanel({
  data,
  projectId,
  reload,
  busy,
}: {
  data: any;
  projectId?: string;
  reload?: () => void | Promise<void>;
  busy: boolean;
}) {
  const agentPatchProposals = useStore(workbenchStore.agentPatchProposals);

  const pendingProposals = useMemo(
    () =>
      Object.values(agentPatchProposals).filter(
        (proposal) => proposal.status === 'pending' || proposal.status === 'applying' || proposal.status === 'failed',
      ),
    [agentPatchProposals],
  );

  const { conversations, tree } = useProjectChatBranches(projectId);

  const serverProposalCount = Array.isArray(data?.patchProposals) ? data.patchProposals.length : 0;
  const repairEventsCount = Array.isArray(data?.repairEvents) ? data.repairEvents.length : 0;

  const consensusRecords: ConsensusRecordView[] = useMemo(
    () => (Array.isArray(data?.consensusRecords) ? (data.consensusRecords as ConsensusRecordView[]) : []),
    [data?.consensusRecords],
  );

  /*
   * The consensus list is a summary; the full per-agent vote is fetched on
   * demand (GET /api/projects/:id/agent-consensus/:runId) when a row expands,
   * then cached by runId so re-expanding is instant.
   */
  const [expandedConsensusRunId, setExpandedConsensusRunId] = useState<string | null>(null);

  const [consensusDetails, setConsensusDetails] = useState<
    Record<string, ConsensusRecordDetailView | 'loading' | 'error'>
  >({});

  const toggleConsensus = useCallback(
    (runId: string) => {
      setExpandedConsensusRunId((current) => (current === runId ? null : runId));

      const existing = consensusDetails[runId];

      if (!projectId || existing === 'loading' || (existing && existing !== 'error')) {
        return;
      }

      setConsensusDetails((current) => ({ ...current, [runId]: 'loading' }));

      void fetch(`/api/projects/${encodeURIComponent(projectId)}/agent-consensus/${encodeURIComponent(runId)}`, {
        credentials: 'include',
        headers: { accept: 'application/json' },
      })
        .then(async (response) => {
          if (!response.ok) {
            throw new Error(String(response.status));
          }

          const payload = (await response.json()) as { record?: ConsensusRecordDetailView };
          setConsensusDetails((current) => ({ ...current, [runId]: payload.record ?? 'error' }));
        })
        .catch(() => setConsensusDetails((current) => ({ ...current, [runId]: 'error' })));
    },
    [projectId, consensusDetails],
  );

  const [memory, setMemory] = useState<StudioMemorySummary | undefined>();
  const [memoryError, setMemoryError] = useState<string | undefined>();

  const loadMemory = useCallback(async () => {
    if (!projectId) {
      return;
    }

    setMemoryError(undefined);

    try {
      const [memoriesResponse, preferenceResponse] = await Promise.all([
        fetch(`/api/agent-memory?projectId=${encodeURIComponent(projectId)}&limit=30`, {
          headers: { accept: 'application/json' },
        }),
        fetch(`/api/agent-memory/preferences?projectId=${encodeURIComponent(projectId)}`, {
          headers: { accept: 'application/json' },
        }),
      ]);

      const payload = (await memoriesResponse.json().catch(() => ({}))) as { memories?: any[]; error?: string };

      const preferencePayload = (await preferenceResponse.json().catch(() => ({}))) as {
        preference?: { enabled?: boolean };
      };

      if (!memoriesResponse.ok) {
        throw new Error(payload.error ?? 'Unable to load agent memory');
      }

      const memories = Array.isArray(payload.memories) ? payload.memories : [];

      setMemory({
        total: memories.length,
        enabled: preferencePayload.preference?.enabled !== false,
        recent: memories.slice(0, 5).map((item: any) => ({
          id: String(item.id),
          content: String(item.content ?? item.summary ?? ''),
          scope: item.scope,
          memoryType: item.memoryType,
          createdAt: item.createdAt,
        })),
      });
    } catch (error) {
      setMemoryError(error instanceof Error ? error.message : 'Unable to load agent memory');
    }
  }, [projectId]);

  useEffect(() => {
    void loadMemory();
  }, [loadMemory]);

  const branchCount = conversations.length;

  const metrics = [
    [
      'Pending changes',
      String(pendingProposals.length),
      pendingProposals.length ? 'Awaiting your review below' : 'No AI changes to review',
    ],
    ['Recorded proposals', String(serverProposalCount), 'Open proposals tracked server-side'],
    [
      'Self-repair events',
      String(repairEventsCount),
      repairEventsCount ? 'AST repair loop activity' : 'No self-repair recorded',
    ],
    [
      'Multi-agent runs',
      String(consensusRecords.length),
      consensusRecords.length ? 'Consensus records logged' : 'No consensus runs yet',
    ],
    ['Conversation branches', String(branchCount), branchCount ? 'Archived agent threads' : 'No branches yet'],
    [
      'Agent memories',
      memory ? String(memory.total) : '—',
      memory ? (memory.enabled ? 'Memory enabled' : 'Memory disabled') : 'Loading…',
    ],
  ] as const;

  return (
    <div className="bolt-project-monitoring-panel" aria-label="Agent Studio supervisor">
      <div className="bolt-project-panel-toolbar">
        <button type="button" onClick={() => void reload?.()} disabled={busy}>
          {busy ? 'Refreshing' : 'Refresh'}
        </button>
      </div>

      <div className="bolt-project-metric-grid">
        {metrics.map(([label, value, detail]) => (
          <article key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
            <small>{detail}</small>
          </article>
        ))}
      </div>

      <section
        className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-3"
        aria-label="Pending AI changes"
      >
        <h3 className="mb-2 text-sm font-medium text-bolt-elements-textPrimary">Pending AI changes</h3>
        {pendingProposals.length ? (
          <AgentPatchReviewQueue proposals={pendingProposals} />
        ) : (
          <p className="text-sm text-bolt-elements-textSecondary">
            No AI changes are waiting for review. Accepted and rejected changes are applied automatically.
          </p>
        )}
      </section>

      {projectId ? (
        <section className="mt-3" aria-label="Self-repair history">
          <AgentRepairHistory projectId={projectId} />
        </section>
      ) : null}

      <section
        className="mt-3 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-3"
        aria-label="Multi-agent consensus"
      >
        <h3 className="mb-2 text-sm font-medium text-bolt-elements-textPrimary">
          Multi-agent consensus
          <span className="ml-2 rounded-full bg-bolt-elements-background-depth-3 px-2 py-0.5 text-xs text-bolt-elements-textSecondary">
            {consensusRecords.length}
          </span>
        </h3>
        {consensusRecords.length ? (
          <ul className="divide-y divide-bolt-elements-borderColor">
            {consensusRecords.map((record) => {
              const expanded = expandedConsensusRunId === record.runId;
              const detail = consensusDetails[record.runId];

              return (
                <li key={record.id} className="py-2 text-sm">
                  <button
                    type="button"
                    className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 text-left"
                    aria-expanded={expanded}
                    onClick={() => toggleConsensus(record.runId)}
                    data-testid={`consensus-row-${record.runId}`}
                  >
                    <span className={expanded ? 'i-ph:caret-down' : 'i-ph:caret-right'} aria-hidden />
                    <AgentConsensusOutcomeBadge outcome={record.outcome} />
                    <span className="font-medium text-bolt-elements-textPrimary">
                      {formatConsensusScore(record.agreementScore)}
                    </span>
                    <span className="text-xs text-bolt-elements-textSecondary">
                      {formatConsensusAlgorithm(record.algorithm)}
                    </span>
                    <span className="text-xs text-bolt-elements-textSecondary">
                      {record.roundCount} {record.roundCount === 1 ? 'round' : 'rounds'}
                    </span>
                    <span className="text-xs text-bolt-elements-textSecondary">
                      {formatConsensusDuration(record.durationMs)}
                    </span>
                    <span className="ml-auto text-xs text-bolt-elements-textSecondary" title={record.createdAt}>
                      {timeAgo(record.createdAt)}
                    </span>
                  </button>

                  {expanded ? (
                    <div className="mt-2 space-y-3 border-l-2 border-bolt-elements-borderColor pl-3">
                      {detail === 'loading' || detail === undefined ? (
                        <p className="text-xs text-bolt-elements-textSecondary">Loading the vote…</p>
                      ) : detail === 'error' ? (
                        <p className="text-xs text-[var(--status-error-text)]">
                          Could not load the consensus detail. Try again.
                        </p>
                      ) : (
                        <ConsensusVoteDetail detail={detail} />
                      )}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-bolt-elements-textSecondary">
            No multi-agent consensus runs recorded for this project yet. Consensus records appear here after a
            parallel-subagent run reaches a decision.
          </p>
        )}
      </section>

      <section
        className="mt-3 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-3"
        aria-label="Conversation branches"
      >
        <h3 className="mb-2 text-sm font-medium text-bolt-elements-textPrimary">
          Conversation branches
          <span className="ml-2 rounded-full bg-bolt-elements-background-depth-3 px-2 py-0.5 text-xs text-bolt-elements-textSecondary">
            {branchCount}
          </span>
        </h3>
        {branchCount ? (
          <ul className="divide-y divide-bolt-elements-borderColor">
            {tree.flatMap(function flatten(node, depth = 0): React.ReactNode[] {
              const label = node.conversation.title?.trim() || node.conversation.id;

              return [
                <li key={node.conversation.id} className="flex items-center gap-2 py-1.5 text-sm">
                  <span className="i-ph:git-branch text-bolt-elements-textSecondary" aria-hidden />
                  <span
                    className="truncate text-bolt-elements-textPrimary"
                    style={{ paddingLeft: `${depth * 12}px` }}
                    title={label}
                  >
                    {label}
                  </span>
                  <span className="ml-auto text-xs text-bolt-elements-textSecondary">
                    {node.conversation.messages.length} msg
                  </span>
                </li>,
                ...node.children.flatMap((child) => flatten(child, depth + 1)),
              ];
            })}
          </ul>
        ) : (
          <p className="text-sm text-bolt-elements-textSecondary">
            No archived conversation branches for this project yet.
          </p>
        )}
      </section>

      <section
        className="mt-3 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-3"
        aria-label="Agent memory"
      >
        <h3 className="mb-2 text-sm font-medium text-bolt-elements-textPrimary">Agent memory</h3>
        {memoryError ? (
          <p className="text-sm text-[var(--status-error-text)]">{memoryError}</p>
        ) : !memory ? (
          <p className="text-sm text-bolt-elements-textSecondary">Loading agent memory…</p>
        ) : memory.recent.length === 0 ? (
          <p className="text-sm text-bolt-elements-textSecondary">No agent memories recorded for this project yet.</p>
        ) : (
          <ul className="divide-y divide-bolt-elements-borderColor">
            {memory.recent.map((item) => (
              <li key={item.id} className="py-1.5 text-sm">
                <p className="truncate text-bolt-elements-textPrimary" title={item.content}>
                  {item.content}
                </p>
                <p className="text-xs text-bolt-elements-textSecondary">
                  {[item.scope, item.memoryType].filter(Boolean).join(' · ')}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ProjectMonitoringPanel({
  data,
  reload,
  busy,
}: {
  data: any;
  reload?: () => void | Promise<void>;
  busy: boolean;
}) {
  const [windowSize, setWindowSize] = useState<'15m' | '1h' | '24h'>('1h');
  const deployments: any[] = Array.isArray(data.deployments) ? data.deployments : [];
  const allActivity: any[] = Array.isArray(data.recentActivity) ? data.recentActivity : [];

  const windowMs = windowSize === '15m' ? 15 * 60_000 : windowSize === '1h' ? 60 * 60_000 : 24 * 60 * 60_000;
  const cutoff = Date.now() - windowMs;

  const windowed = allActivity.filter((event) => {
    if (!event?.createdAt) {
      return true;
    }

    const ts = new Date(event.createdAt).getTime();

    return Number.isFinite(ts) && ts >= cutoff;
  });

  const { userFacingEvents, hiddenRoutineCount } = partitionMonitoringEventsHelper(windowed);

  const runtimePorts = runtimePortsFromPayload(data.runtimePorts);
  const workspace = runtimeWorkspaceFromPanelData(data);

  const workspaceLabel = runtimeStatusText({
    workspaceStatus: workspace,
    ports: runtimePorts,
    workspaceLoading: Boolean(workspace && !workspace.status),
    workspaceError: workspace?.error,
  });

  const lastDeployment = deployments[0];

  const lastDeploymentDetail = lastDeployment
    ? `${lastDeployment.status ?? 'unknown'}${
        lastDeployment.createdAt ? ` · ${new Date(lastDeployment.createdAt).toLocaleString()}` : ''
      }`
    : 'No deployment recorded';

  const metrics = [
    ['Workspace', workspaceLabel, workspace?.runtimeMode ?? 'No runtime session reported'],
    ['Deployments', String(deployments.length), lastDeploymentDetail],
    ['User events', String(userFacingEvents.length), `${windowSize} window · ${hiddenRoutineCount} routine hidden`],
    ['Tracked files', String(data.files?.length ?? 0), `${windowSize} window`],
  ] as const;

  return (
    <div className="bolt-project-monitoring-panel">
      <div className="bolt-project-panel-toolbar">
        {(['15m', '1h', '24h'] as const).map((item) => (
          <button
            key={item}
            type="button"
            className={windowSize === item ? 'selected' : ''}
            onClick={() => setWindowSize(item)}
          >
            {item}
          </button>
        ))}
        <button type="button" onClick={() => void reload?.()} disabled={busy}>
          {busy ? 'Refreshing' : 'Refresh metrics'}
        </button>
      </div>
      <div className="bolt-project-metric-grid">
        {metrics.map(([label, value, detail]) => (
          <article key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
            <small>{detail}</small>
          </article>
        ))}
      </div>
      <ProjectMonitoringDeploymentTimeline deployments={deployments} />
      <ProjectMonitoringActivitySparkline
        events={userFacingEvents}
        windowMs={windowMs}
        emptyLabel="No user-facing events in this window."
      />
      <PanelRows
        rows={userFacingEvents
          .slice(0, 12)
          .map((event: any) => [
            formatProjectActivityAction(event.action ?? 'project.activity'),
            event.createdAt ? new Date(event.createdAt).toLocaleString() : 'Recorded by API',
          ])}
        empty="No user-facing events yet. Routine IDE state saves are hidden — see logs for raw audit."
      />
      {hiddenRoutineCount > 0 ? (
        <div className="bolt-project-monitoring-routine-note" role="note">
          {hiddenRoutineCount} routine internal event{hiddenRoutineCount === 1 ? '' : 's'} hidden (
          <code>project.ide_state.*</code>
          ). Open the Logs panel to inspect the raw audit trail.
        </div>
      ) : null}
    </div>
  );
}

function ProjectMonitoringDeploymentTimeline({ deployments }: { deployments: any[] }) {
  const visible = deployments.slice(0, 24);

  if (visible.length === 0) {
    return (
      <section className="bolt-project-monitoring-timeline" aria-label="Deployment history">
        <header>
          <strong>Deployments</strong>
          <small>No deployment recorded for this project yet.</small>
        </header>
      </section>
    );
  }

  const width = 100;
  const barWidth = width / visible.length;

  return (
    <section className="bolt-project-monitoring-timeline" aria-label="Deployment history">
      <header>
        <strong>Deployments</strong>
        <small>
          Last {visible.length} deployment{visible.length === 1 ? '' : 's'}, newest on the right.
        </small>
      </header>
      <svg viewBox={`0 0 ${width} 20`} preserveAspectRatio="none" role="img" aria-label="Deployment status timeline">
        {visible
          .slice()
          .reverse()
          .map((deployment: any, index: number) => (
            <rect
              key={deployment.id ?? `${deployment.createdAt ?? 'deploy'}-${index}`}
              x={index * barWidth + barWidth * 0.1}
              y={2}
              width={Math.max(barWidth * 0.8, 0.5)}
              height={16}
              fill={deploymentStatusColor(deployment.status)}
            >
              <title>
                {(deployment.status ?? 'unknown') +
                  (deployment.provider ? ` · ${deployment.provider}` : '') +
                  (deployment.createdAt ? ` · ${new Date(deployment.createdAt).toLocaleString()}` : '')}
              </title>
            </rect>
          ))}
      </svg>
    </section>
  );
}

function ProjectMonitoringActivitySparkline({
  events,
  windowMs,
  emptyLabel,
}: {
  events: any[];
  windowMs: number;
  emptyLabel: string;
}) {
  const [zoomLevel, setZoomLevel] = useState<'fit' | '2x' | '4x'>('fit');

  if (events.length === 0) {
    return (
      <section className="bolt-project-monitoring-sparkline" aria-label="Activity rate">
        <header>
          <strong>Activity rate</strong>
          <small>{emptyLabel}</small>
        </header>
      </section>
    );
  }

  const zoomFactor = zoomLevel === '4x' ? 4 : zoomLevel === '2x' ? 2 : 1;
  const visibleWindowMs = Math.max(60_000, windowMs / zoomFactor);
  const buckets = 24;
  const now = Date.now();
  const counts = bucketEventsByTimeHelper(events, visibleWindowMs, buckets, now);
  const max = Math.max(1, ...counts);
  const bucketSizeMs = visibleWindowMs / buckets;

  const visibleEvents = events.filter((event) => {
    const ts = event?.createdAt ? new Date(event.createdAt).getTime() : NaN;

    return Number.isFinite(ts) && now - ts >= 0 && now - ts <= visibleWindowMs;
  });
  const labels = counts.map((_, index) => {
    const bucketStart = now - visibleWindowMs + index * bucketSizeMs;
    const bucketEnd = bucketStart + bucketSizeMs;

    const formatBucketTime = (timestamp: number) =>
      visibleWindowMs <= 60 * 60_000
        ? new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : new Date(timestamp).toLocaleString([], { month: 'short', day: '2-digit', hour: '2-digit' });

    return `${formatBucketTime(bucketStart)}-${formatBucketTime(bucketEnd)}`;
  });
  const chartData = {
    labels,
    datasets: [
      {
        label: 'Events',
        data: counts,
        borderColor: 'rgba(56, 189, 248, 0.95)',
        backgroundColor: 'rgba(56, 189, 248, 0.32)',
        borderWidth: 1,
        borderRadius: 4,
        hoverBackgroundColor: 'rgba(56, 189, 248, 0.58)',
      },
    ],
  };
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      intersect: false,
      mode: 'index' as const,
    },
    plugins: {
      legend: {
        display: true,
        labels: {
          color: 'rgb(148, 163, 184)',
          boxWidth: 10,
          usePointStyle: true,
        },
      },
      tooltip: {
        callbacks: {
          title: (items: any[]) => items[0]?.label ?? 'Bucket',
          label: (item: any) => `${item.raw} event${item.raw === 1 ? '' : 's'}`,
        },
      },
    },
    scales: {
      x: {
        title: {
          display: true,
          text: 'Time',
          color: 'rgb(148, 163, 184)',
        },
        ticks: {
          color: 'rgb(148, 163, 184)',
          maxRotation: 0,
          autoSkip: true,
          maxTicksLimit: 6,
        },
        grid: {
          color: 'rgba(148, 163, 184, 0.14)',
        },
      },
      y: {
        beginAtZero: true,
        suggestedMax: max,
        title: {
          display: true,
          text: 'Count',
          color: 'rgb(148, 163, 184)',
        },
        ticks: {
          color: 'rgb(148, 163, 184)',
          precision: 0,
          stepSize: Math.max(1, Math.ceil(max / 4)),
        },
        grid: {
          color: 'rgba(148, 163, 184, 0.14)',
        },
      },
    },
  };

  return (
    <section className="bolt-project-monitoring-sparkline" aria-label="Activity rate">
      <header>
        <div>
          <strong>Activity rate</strong>
          <small>
            {visibleEvents.length} of {events.length} event{events.length === 1 ? '' : 's'} · {buckets} buckets · peak{' '}
            {max}/bucket
          </small>
        </div>
        <div className="bolt-project-monitoring-zoom" aria-label="Activity chart zoom">
          {(['fit', '2x', '4x'] as const).map((level) => (
            <button
              key={level}
              type="button"
              className={zoomLevel === level ? 'selected' : ''}
              onClick={() => setZoomLevel(level)}
            >
              {level === 'fit' ? 'Fit' : level}
            </button>
          ))}
        </div>
      </header>
      <div className="bolt-project-monitoring-chart" role="img" aria-label="Activity events by time bucket">
        <ClientOnly fallback={<div className="bolt-project-chart-loading">Loading chart...</div>}>
          {() => <Bar data={chartData} options={chartOptions} />}
        </ClientOnly>
      </div>
    </section>
  );
}

function ProjectExtensionsPanel({ data, onSubmit, busy }: { data: any; onSubmit: any; busy: boolean }) {
  /*
   * Extensions are MCP marketplace servers: install/enable/remove all map to
   * real McpInstall records, which also surface in the MCP settings tab.
   */
  const installs: any[] = Array.isArray(data.mcpInstalls) ? data.mcpInstalls : [];
  const catalog: any[] = Array.isArray(data.mcpCatalog) ? data.mcpCatalog : [];

  /*
   * Legacy VIBECORE_EXTENSIONS env entries (pre-MCP) shown read-only so older
   * projects don't appear to lose state.
   */
  const legacyInstalled = String(
    (data.envVars ?? []).find((item: any) => item.key === 'VIBECORE_EXTENSIONS')?.value ?? '',
  )
    .split(',')
    .map((extension) => extension.trim())
    .filter(Boolean);

  const [query, setQuery] = useState('');
  const [domain, setDomain] = useState('All');
  const normalizedQuery = query.trim().toLowerCase();

  const domains = ['All', ...Array.from(new Set(catalog.map((entry) => String(entry.domain ?? '')).filter(Boolean)))];
  const installedSlugs = new Set(installs.map((install) => install.catalogEntry?.slug));

  const visibleCatalog = catalog.filter((entry) => {
    const matchesDomain = domain === 'All' || entry.domain === domain;

    const matchesQuery =
      !normalizedQuery ||
      [entry.name, entry.author, entry.domain, entry.description, ...(entry.tags ?? [])]
        .join(' ')
        .toLowerCase()
        .includes(normalizedQuery);

    return matchesDomain && matchesQuery;
  });

  return (
    <div className="bolt-project-extensions-panel">
      <header className="bolt-project-extensions-hero">
        <div>
          <strong>Extensions</strong>
          <span>
            Install MCP servers to extend the agent with new tools. Installs are shared with the MCP settings tab.
          </span>
        </div>
        <div className="bolt-project-extensions-summary" aria-label="Installed extension summary">
          <strong>{installs.length}</strong>
          <span>installed</span>
        </div>
      </header>

      <div className="bolt-project-panel-toolbar">
        <label>
          Search the MCP marketplace
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Name, author, tag or capability..."
          />
        </label>
        <div className="bolt-project-extension-categories" role="group" aria-label="Extension domains">
          {domains.map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={domain === item}
              className={domain === item ? 'selected' : ''}
              onClick={() => setDomain(item)}
            >
              {item === 'All' ? 'All' : String(item).replace(/_/g, ' ').toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      <section className="bolt-project-installed-extensions" aria-label="Installed extensions">
        <div className="bolt-project-section-heading">
          <strong>Installed</strong>
          <span>Enable, disable or remove extensions without leaving the IDE.</span>
        </div>
        {installs.length ? (
          <div className="bolt-project-extension-catalog installed">
            {installs.map((install) => (
              <article key={install.id} className="bolt-project-extension-card" data-enabled={install.enabled}>
                <div>
                  <strong>{install.catalogEntry?.name ?? install.alias}</strong>
                  <span>
                    {install.catalogEntry?.author ?? 'MCP'} · v{install.catalogEntry?.version ?? '1'}
                  </span>
                </div>
                <p>{install.catalogEntry?.description ?? `alias: ${install.alias}`}</p>
                <div className="bolt-project-extension-card-footer">
                  <em>{install.enabled ? 'Enabled' : 'Disabled'}</em>
                  <form onSubmit={onSubmit}>
                    <input name="installId" value={install.id} type="hidden" />
                    <input name="extensionAction" value={install.enabled ? 'disable' : 'enable'} type="hidden" />
                    <PanelButton disabled={busy} variant="outline">
                      {install.enabled ? 'Disable' : 'Enable'}
                    </PanelButton>
                  </form>
                  <form onSubmit={onSubmit}>
                    <input name="installId" value={install.id} type="hidden" />
                    <input name="extensionAction" value="remove" type="hidden" />
                    <PanelButton disabled={busy} variant="outline">
                      Remove
                    </PanelButton>
                  </form>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="bolt-project-empty-panel">
            No extensions installed yet. Install one from the marketplace below.
          </div>
        )}
        {legacyInstalled.length ? (
          <p className="bolt-project-extension-legacy-note">
            Legacy workspace extensions (read-only): {legacyInstalled.join(', ')}
          </p>
        ) : null}
      </section>

      <section aria-label="Marketplace extensions">
        <div className="bolt-project-section-heading">
          <strong>Marketplace</strong>
          <span>
            {visibleCatalog.length} extension{visibleCatalog.length === 1 ? '' : 's'} shown
          </span>
        </div>
        {visibleCatalog.length ? (
          <div className="bolt-project-extension-catalog">
            {visibleCatalog.map((entry) => {
              const isInstalled = installedSlugs.has(entry.slug);

              return (
                <article key={entry.id} className="bolt-project-extension-card" data-enabled={isInstalled}>
                  <div>
                    <strong>{entry.name}</strong>
                    <span>
                      {entry.author} ·{' '}
                      {String(entry.domain ?? '')
                        .replace(/_/g, ' ')
                        .toLowerCase()}
                      {entry.verified ? ' · verified' : ''}
                    </span>
                  </div>
                  <p>{entry.description}</p>
                  <div className="bolt-project-extension-card-footer">
                    <em>{isInstalled ? 'Installed' : `${entry.installCount ?? 0} installs`}</em>
                    <form onSubmit={onSubmit}>
                      <input name="extension" value={entry.slug} type="hidden" />
                      <input name="extensionAction" value="install" type="hidden" />
                      <PanelButton disabled={busy || isInstalled}>{isInstalled ? 'Installed' : 'Install'}</PanelButton>
                    </form>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="bolt-project-empty-panel">
            {catalog.length
              ? 'No extensions match the current search and domain filters.'
              : 'The MCP marketplace catalog is empty or unavailable.'}
          </div>
        )}
      </section>
    </div>
  );
}

/** Human duration between a run's start and finish, or null if not finished. */
function formatRunDuration(startedAt?: string, finishedAt?: string): string | null {
  if (!startedAt || !finishedAt) {
    return null;
  }

  const ms = new Date(finishedAt).getTime() - new Date(startedAt).getTime();

  if (!Number.isFinite(ms) || ms < 0) {
    return null;
  }

  if (ms < 1000) {
    return `${ms}ms`;
  }

  const seconds = ms / 1000;

  if (seconds < 60) {
    return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`;
  }

  const minutes = Math.floor(seconds / 60);

  return `${minutes}m ${Math.round(seconds % 60)}s`;
}

function ProjectWorkflowsPanel({ data, onSubmit, busy }: { data: any; onSubmit: any; busy: boolean }) {
  const state = data.workflowsState ?? {};

  const workflows = (state.workflows ?? []).slice().sort((left: any, right: any) => {
    if (left.isGenerated !== right.isGenerated) {
      return left.isGenerated ? -1 : 1;
    }

    return String(left.name ?? '').localeCompare(String(right.name ?? ''));
  });

  const runs = state.runs ?? [];

  // Replit parity: the package selector on "Install Packages" tasks.
  const dependencies: Array<{ name?: string }> = data.dependencies ?? [];
  const packageManager: string = data.packageManager || 'npm';
  const [query, setQuery] = useState('');
  const [createOpen, setCreateOpen] = useState(false);

  // Replit parity: every workflow is COLLAPSED by default (chevron to expand).
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const filtered = workflows.filter((workflow: any) =>
    String(workflow.name ?? '')
      .toLowerCase()
      .includes(query.toLowerCase()),
  );

  const agentWorkflows = filtered.filter((workflow: any) => workflow.isGenerated);
  const userWorkflows = filtered.filter((workflow: any) => !workflow.isGenerated);
  const latestRun = runs[0];
  const workspace = data.workspace;

  function WorkflowSection({ title, items, empty }: { title: string; items: any[]; empty: string }) {
    return (
      <section className="bolt-project-workflows-section">
        <h4>{title}</h4>
        {items.length ? (
          items.map((workflow) => <WorkflowItem key={workflow.id} workflow={workflow} />)
        ) : (
          <div className="bolt-project-empty-panel">{empty}</div>
        )}
      </section>
    );
  }

  function WorkflowItem({ workflow }: { workflow: any }) {
    const expanded = expandedId === workflow.id;
    const tasks = (workflow.tasks ?? []).slice().sort((left: any, right: any) => left.orderIndex - right.orderIndex);
    const workflowRuns = runs.filter((run: any) => run.workflowId === workflow.id).slice(0, 3);

    return (
      <article className="bolt-project-workflow-card" data-testid={`workflow-item-${workflow.id}`}>
        <header>
          <button type="button" onClick={() => setExpandedId(expanded ? null : workflow.id)}>
            <span className={expanded ? 'i-ph:caret-down' : 'i-ph:caret-right'} aria-hidden />
            <strong>{workflow.name}</strong>
          </button>
          <div>
            {workflow.isRunButton && <em data-kind="run-button">Run Button</em>}
            {workflow.isGenerated && <em data-kind="generated">Generated</em>}
            {workflow.lastRunStatus && <em data-status={workflow.lastRunStatus}>{workflow.lastRunStatus}</em>}
            <form onSubmit={onSubmit} className="bolt-project-workflow-run-now">
              <input type="hidden" name="intent" value="run-workflow" />
              <input type="hidden" name="workflowId" value={workflow.id} />
              <PanelButton
                disabled={busy || workflow.enabled === false}
                data-testid={`workflow-run-now-${workflow.id}`}
              >
                <span className="i-ph:play" aria-hidden />
                Run now
              </PanelButton>
            </form>
          </div>
        </header>

        <small>
          {tasks.length} task{tasks.length === 1 ? '' : 's'} · {workflow.executionMode}
          {workflow.lastRunAt ? ` · last run ${new Date(workflow.lastRunAt).toLocaleString()}` : ''}
        </small>

        {workflowRuns.length ? (
          <section className="bolt-project-workflow-runs">
            <strong>Recent runs</strong>
            {workflowRuns.map((run: any) => (
              <details key={run.id} open={run.id === latestRun?.id}>
                <summary>
                  <span data-status={run.status}>{run.status}</span>
                  <small>{new Date(run.startedAt).toLocaleString()}</small>
                  {formatRunDuration(run.startedAt, run.finishedAt) ? (
                    <small className="bolt-project-workflow-run-meta">
                      <span className="i-ph:timer" aria-hidden /> {formatRunDuration(run.startedAt, run.finishedAt)}
                    </small>
                  ) : null}
                  <small className="bolt-project-workflow-run-meta">
                    <span className="i-ph:lightning" aria-hidden />{' '}
                    {run.trigger === 'schedule' ? 'Scheduled' : 'Manual'}
                  </small>
                </summary>
                {Array.isArray(run.steps) && run.steps.length ? (
                  <ol className="bolt-project-workflow-run-steps" data-testid={`run-steps-${run.id}`}>
                    {run.steps.map((step: any, stepIndex: number) => (
                      <li key={`${step.taskId}-${stepIndex}`} data-status={step.status}>
                        <div className="bolt-project-workflow-run-step-head">
                          <span data-status={step.status}>{step.status}</span>
                          <code>{step.command || '(no command)'}</code>
                          {step.exitCode !== null && step.exitCode !== undefined ? (
                            <small>exit {step.exitCode}</small>
                          ) : null}
                        </div>
                        {step.outputTail ? <pre>{step.outputTail}</pre> : null}
                      </li>
                    ))}
                  </ol>
                ) : (
                  <pre>
                    {(run.logs ?? []).map((log: any) => `[${log.level}] ${log.message}`).join('\n') ||
                      'No output captured.'}
                  </pre>
                )}
              </details>
            ))}
          </section>
        ) : null}

        {expanded && (
          <div className="bolt-project-workflow-details">
            <div className="bolt-project-workflow-form">
              {/* Name (field + Save) */}
              <form onSubmit={onSubmit} className="bolt-project-workflow-name-form">
                <input type="hidden" name="intent" value="update-workflow" />
                <input type="hidden" name="workflowId" value={workflow.id} />
                <input type="hidden" name="executionMode" value={workflow.executionMode} />
                <input type="hidden" name="enabled" value={workflow.enabled === false ? 'false' : 'true'} />
                <label>
                  Workflow
                  <PanelInput name="name" defaultValue={workflow.name} data-testid={`workflow-name-${workflow.id}`} />
                </label>
                <PanelButton disabled={busy}>Save</PanelButton>
              </form>
              {/* Sequential / Parallel toggle (instant, Replit parity) */}
              <form
                onSubmit={onSubmit}
                className="bolt-project-workflow-mode-toggle"
                role="group"
                aria-label="Execution mode"
              >
                <input type="hidden" name="intent" value="update-workflow" />
                <input type="hidden" name="workflowId" value={workflow.id} />
                <input type="hidden" name="name" value={workflow.name} />
                <input type="hidden" name="enabled" value={workflow.enabled === false ? 'false' : 'true'} />
                <button
                  type="submit"
                  name="executionMode"
                  value="sequential"
                  data-active={workflow.executionMode !== 'parallel'}
                  aria-pressed={workflow.executionMode !== 'parallel'}
                  disabled={busy}
                  data-testid={`workflow-mode-sequential-${workflow.id}`}
                >
                  Sequential
                </button>
                <button
                  type="submit"
                  name="executionMode"
                  value="parallel"
                  data-active={workflow.executionMode === 'parallel'}
                  aria-pressed={workflow.executionMode === 'parallel'}
                  disabled={busy}
                  data-testid={`workflow-mode-parallel-${workflow.id}`}
                >
                  Parallel
                </button>
              </form>
              {/* Schedule (persisted cron + enable toggle + computed nextRunAt). */}
              <form
                onSubmit={onSubmit}
                className="bolt-project-workflow-schedule"
                data-testid={`workflow-schedule-${workflow.id}`}
              >
                <input type="hidden" name="intent" value="set-schedule" />
                <input type="hidden" name="workflowId" value={workflow.id} />
                <label>
                  Schedule (cron)
                  <PanelInput
                    name="cron"
                    defaultValue={workflow.schedule?.cron ?? ''}
                    placeholder="0 3 * * *"
                    data-testid={`workflow-cron-${workflow.id}`}
                  />
                </label>
                <label className="bolt-project-workflow-schedule-toggle">
                  <input
                    type="checkbox"
                    name="scheduleEnabled"
                    value="true"
                    defaultChecked={workflow.schedule?.enabled === true}
                    data-testid={`workflow-schedule-enabled-${workflow.id}`}
                  />
                  Enabled
                </label>
                <PanelButton disabled={busy}>Save schedule</PanelButton>
                {workflow.schedule?.enabled && workflow.schedule?.nextRunAt ? (
                  <small className="bolt-project-workflow-nextrun" data-testid={`workflow-nextrun-${workflow.id}`}>
                    Next run {new Date(workflow.schedule.nextRunAt).toLocaleString()} (
                    {workflow.schedule.timezone ?? 'UTC'})
                  </small>
                ) : (
                  <small className="bolt-project-workflow-nextrun">
                    Not scheduled. Enter a cron expression (e.g. <code>0 3 * * *</code>) and enable it — the scheduler
                    will actually run it.
                  </small>
                )}
              </form>
              {/*
               * Real execution history. Every row below is a run that actually
               * happened in this project's sandbox: real exit code, real duration,
               * real captured output, and the compute it was billed for.
               */}
              {workflow.scheduledTaskId ? (
                <div className="bolt-project-workflow-runs" data-testid={`workflow-scheduled-runs-${workflow.id}`}>
                  <div className="bolt-project-workflow-subhead">
                    <strong>Scheduled runs</strong>
                    <form onSubmit={onSubmit}>
                      <input type="hidden" name="intent" value="run-scheduled-now" />
                      <input type="hidden" name="workflowId" value={workflow.id} />
                      <input type="hidden" name="scheduledTaskId" value={workflow.scheduledTaskId} />
                      <PanelButton disabled={busy} data-testid={`workflow-run-now-${workflow.id}`}>
                        Run now
                      </PanelButton>
                    </form>
                  </div>
                  {(workflow.scheduledRuns ?? []).length === 0 ? (
                    <small>No runs yet. The first one will appear here after the schedule fires.</small>
                  ) : (
                    <ul className="bolt-project-workflow-run-list">
                      {(workflow.scheduledRuns ?? []).map((run: any) => (
                        <li key={run.id} data-testid={`workflow-scheduled-run-${run.id}`} data-status={run.status}>
                          <span className="bolt-project-workflow-run-status">{run.status}</span>
                          <span>{new Date(run.startedAt).toLocaleString()}</span>
                          <span>{run.durationMs == null ? '—' : `${Math.round(run.durationMs / 100) / 10}s`}</span>
                          <span>{run.exitCode == null ? '' : `exit ${run.exitCode}`}</span>
                          <span>{run.trigger === 'manual' ? 'manual' : 'cron'}</span>
                          <span title="Billed compute for this run">
                            {run.costCents == null ? '' : `${run.costCents.toFixed(4)}¢`}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {workflow.latestScheduledRun?.logs ? (
                    <details data-testid={`workflow-scheduled-logs-${workflow.id}`}>
                      <summary>Logs — latest run ({workflow.latestScheduledRun.status})</summary>
                      <pre className="bolt-project-workflow-run-logs">{workflow.latestScheduledRun.logs}</pre>
                    </details>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="bolt-project-workflow-task-list">
              <div className="bolt-project-workflow-subhead">
                <strong>Tasks</strong>
                <span>{workflow.executionMode === 'parallel' ? 'Run together' : 'Run in order'}</span>
              </div>
              {tasks.map((task: any, index: number) => (
                <article
                  key={task.id}
                  className="bolt-project-workflow-task"
                  data-testid={`workflow-task-${task.id}`}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();

                    const fromId = event.dataTransfer.getData('text/plain');

                    if (!fromId) {
                      return;
                    }

                    const reorderForm = event.currentTarget.querySelector<HTMLFormElement>('form[data-reorder]');
                    const taskIdInput = reorderForm?.querySelector<HTMLInputElement>('input[name="taskId"]');

                    if (reorderForm && taskIdInput) {
                      taskIdInput.value = fromId;
                      reorderForm.requestSubmit();
                    }
                  }}
                >
                  {/* Drag handle — reorder by dragging (Replit parity), not just Up/Down. */}
                  <span
                    className="bolt-project-workflow-task-drag i-ph:dots-six-vertical"
                    aria-label="Drag to reorder"
                    role="button"
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.setData('text/plain', String(task.id));
                      event.dataTransfer.effectAllowed = 'move';
                    }}
                  />
                  {/* Task TYPE dropdown — auto-submits so the type-specific control below refreshes. */}
                  <form onSubmit={onSubmit} className="bolt-project-workflow-task-type">
                    <input type="hidden" name="intent" value="update-task" />
                    <input type="hidden" name="workflowId" value={workflow.id} />
                    <input type="hidden" name="taskId" value={task.id} />
                    <input type="hidden" name="command" value={task.command ?? ''} />
                    <input type="hidden" name="targetWorkflowId" value={task.targetWorkflowId ?? ''} />
                    <select
                      name="taskType"
                      defaultValue={task.taskType}
                      data-testid={`task-type-${task.id}`}
                      onChange={(event) => event.currentTarget.form?.requestSubmit()}
                    >
                      <option value="shell">Execute Shell Command</option>
                      <option value="packages">Install Packages</option>
                      <option value="workflow">Run Workflow</option>
                    </select>
                  </form>
                  {/* Type-specific control + Save. */}
                  <form onSubmit={onSubmit} className="bolt-project-workflow-task-form">
                    <input type="hidden" name="intent" value="update-task" />
                    <input type="hidden" name="workflowId" value={workflow.id} />
                    <input type="hidden" name="taskId" value={task.id} />
                    <input type="hidden" name="taskType" value={task.taskType} />
                    {task.taskType === 'packages' ? (
                      <select
                        name="command"
                        defaultValue={task.command || `${packageManager} install`}
                        data-testid={`task-packages-${task.id}`}
                      >
                        <option value={`${packageManager} install`}>all</option>
                        {dependencies
                          .filter((dep) => dep?.name)
                          .map((dep) => (
                            <option key={dep.name} value={`${packageManager} install ${dep.name}`}>
                              {dep.name}
                            </option>
                          ))}
                      </select>
                    ) : task.taskType === 'workflow' ? (
                      <select name="targetWorkflowId" defaultValue={task.targetWorkflowId ?? ''}>
                        <option value="">No target workflow</option>
                        {workflows
                          .filter((item: any) => item.id !== workflow.id)
                          .map((item: any) => (
                            <option key={item.id} value={item.id}>
                              {item.name}
                            </option>
                          ))}
                      </select>
                    ) : (
                      <PanelInput
                        name="command"
                        defaultValue={task.command ?? ''}
                        placeholder="npm run dev"
                        data-testid={`task-command-${task.id}`}
                      />
                    )}
                    <PanelButton disabled={busy}>Save</PanelButton>
                  </form>
                  {/* Trash (Replit parity). */}
                  <ConfirmSubmitForm
                    onSubmit={onSubmit}
                    title="Remove this task?"
                    description="The task is removed from the workflow. This cannot be undone."
                    confirmLabel="Remove task"
                    className="bolt-project-workflow-task-delete"
                  >
                    <input type="hidden" name="intent" value="delete-task" />
                    <input type="hidden" name="workflowId" value={workflow.id} />
                    <input type="hidden" name="taskId" value={task.id} />
                    <button type="submit" disabled={busy} aria-label="Delete task" title="Delete task">
                      <span className="i-ph:trash" aria-hidden />
                    </button>
                  </ConfirmSubmitForm>
                  {/* Hidden form the drop handler submits to reorder this task to `index`. */}
                  <form onSubmit={onSubmit} data-reorder hidden>
                    <input type="hidden" name="intent" value="reorder-task" />
                    <input type="hidden" name="workflowId" value={workflow.id} />
                    <input type="hidden" name="taskId" value="" />
                    <input type="hidden" name="toIndex" value={index} />
                  </form>
                </article>
              ))}
              {!tasks.length && <div className="bolt-project-empty-panel">No tasks configured for this workflow.</div>}
            </div>

            <div className="bolt-project-workflow-add-task">
              <form onSubmit={onSubmit}>
                <input type="hidden" name="intent" value="add-task" />
                <input type="hidden" name="workflowId" value={workflow.id} />
                <input type="hidden" name="taskType" value="shell" />
                <PanelButton disabled={busy} variant="outline" data-testid={`add-task-${workflow.id}`}>
                  <span className="i-ph:plus" aria-hidden />
                  Add task
                </PanelButton>
              </form>
            </div>

            <footer>
              <form onSubmit={onSubmit}>
                <input type="hidden" name="intent" value="set-run-button" />
                <input type="hidden" name="workflowId" value={workflow.id} />
                <PanelButton disabled={busy || workflow.isRunButton} variant="outline">
                  {workflow.isRunButton ? 'Assigned to Run Button' : 'Assign to Run Button'}
                </PanelButton>
              </form>
              {!workflow.isSystem && (
                <ConfirmSubmitForm
                  onSubmit={onSubmit}
                  title={`Delete workflow "${workflow.name ?? workflow.id}"?`}
                  description="The workflow and its tasks are deleted. This cannot be undone."
                  confirmLabel="Delete workflow"
                >
                  <input type="hidden" name="intent" value="delete-workflow" />
                  <input type="hidden" name="workflowId" value={workflow.id} />
                  <PanelButton disabled={busy} variant="outline">
                    Delete Workflow
                  </PanelButton>
                </ConfirmSubmitForm>
              )}
            </footer>
          </div>
        )}
      </article>
    );
  }

  return (
    <div className="bolt-project-workflows-tool" data-testid="workflows-panel">
      <header className="bolt-project-workflows-head">
        <div>
          <h3>Workflows</h3>
          <p>
            Project automation runs against the active isolated workspace
            {workspace?.id ? ` (${workspace.id})` : ''}.
          </p>
        </div>
        <button type="button" onClick={() => setCreateOpen((value) => !value)} data-testid="new-workflow-button">
          <span className="i-ph:plus" aria-hidden />
          New Workflow
        </button>
      </header>

      <div className="bolt-project-workflows-toolbar">
        <label>
          <span className="i-ph:magnifying-glass" aria-hidden />
          <input
            placeholder="Search for a workflow..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            data-testid="search-workflows"
          />
        </label>
        <a href="/docs" target="_blank" rel="noreferrer">
          Configure workflows
          <span className="i-ph:arrow-square-out" aria-hidden />
        </a>
      </div>

      {createOpen && (
        <form onSubmit={onSubmit} className="bolt-project-workflow-create" data-testid="create-workflow-form">
          <input type="hidden" name="intent" value="create-workflow" />
          <PanelInput name="name" placeholder="My Workflow" required data-testid="workflow-name-input" />
          <select name="executionMode" defaultValue="sequential">
            <option value="sequential">Sequential</option>
            <option value="parallel">Parallel</option>
          </select>
          <PanelInput name="command" placeholder="npm run dev" defaultValue="npm run dev" />
          <PanelButton disabled={busy}>Create Workflow</PanelButton>
        </form>
      )}

      <WorkflowSection title="Agent Workflows" items={agentWorkflows} empty="No agent workflows yet." />
      <WorkflowSection title="My Workflows" items={userWorkflows} empty="No custom workflows yet." />
    </div>
  );
}

/*
 * "Add Authentication" — Replit-Auth-equivalent for the generated app. Triggers
 * the real scaffold (POST /api/projects/:id/auth-scaffold → writes users
 * migration + Express session/JWT router + login page into the project and
 * provisions AUTH_JWT_SECRET). Self-contained; shows the written files + wiring.
 */
function AddAuthenticationCard({ projectId }: { projectId?: string }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ scaffolded?: string[]; skipped?: string[]; error?: string } | null>(null);

  const run = useCallback(async () => {
    if (!projectId) {
      return;
    }

    setBusy(true);
    setResult(null);

    try {
      const response = await fetch(`/api/projects/${projectId}/auth-scaffold`, { method: 'POST' });

      const payload = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        scaffolded?: string[];
        skipped?: string[];
        error?: string;
      };

      if (!response.ok || payload.error) {
        setResult({ error: payload.error ?? 'Could not add authentication.' });
      } else {
        setResult({ scaffolded: payload.scaffolded ?? [], skipped: payload.skipped ?? [] });
      }
    } catch {
      setResult({ error: 'Could not reach the auth scaffold service.' });
    } finally {
      setBusy(false);
    }
  }, [projectId]);

  return (
    <section className="grid gap-2 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-bolt-elements-textPrimary">Add Authentication</h3>
          <p className="text-xs text-bolt-elements-textSecondary">
            Scaffold real email/password auth into this app — a <code>users</code> table migration, an Express
            session/JWT router (signup / login / logout / me), and a login page — backed by your project Postgres.
            Idempotent; sets <code>AUTH_JWT_SECRET</code> for you.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void run()}
          disabled={busy || !projectId}
          className="shrink-0 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-3 px-3 py-1.5 text-xs font-medium text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-1 disabled:opacity-60"
        >
          {busy ? 'Adding…' : 'Add Authentication'}
        </button>
      </div>
      {result?.error ? <p className="text-xs text-bolt-elements-item-contentDanger">{result.error}</p> : null}
      {result && !result.error ? (
        <div className="text-xs text-bolt-elements-textSecondary">
          {result.scaffolded?.length ? (
            <>
              <span className="text-[var(--status-success-text)]">Added:</span>{' '}
              <span className="font-mono">{result.scaffolded.join(', ')}</span>. Next:{' '}
              <span className="font-mono">npm i pg bcryptjs jsonwebtoken cookie-parser</span>, run the migration, then{' '}
              <span className="font-mono">app.use(require(&apos;./auth&apos;).router)</span> (see auth/README.md).
            </>
          ) : (
            <span>
              Already scaffolded — auth files already exist
              {result.skipped?.length ? ` (${result.skipped.length} files)` : ''}.
            </span>
          )}
        </div>
      ) : null}
    </section>
  );
}

function ProjectIntegrationsPanel({
  data,
  projectId,
  onSubmit,
  busy,
}: {
  data: any;
  projectId?: string;
  onSubmit: any;
  busy: boolean;
}) {
  const state = data.integrationsState ?? {};
  const integrationState = state.integrations ?? {};
  const webhooks = state.webhooks ?? [];
  const apiKeys = state.apiKeys ?? [];
  const eventStreams = state.eventStreams ?? [];
  const secrets = data.secrets ?? [];
  const [activeTab, setActiveTab] = useState<'browse' | 'connected' | 'webhooks' | 'api-keys'>('browse');
  const [category, setCategory] = useState('all');
  const [query, setQuery] = useState('');
  const [selectedIntegrationId, setSelectedIntegrationId] = useState<string | null>(null);
  const [showWebhookForm, setShowWebhookForm] = useState(false);
  const [showApiKeyForm, setShowApiKeyForm] = useState(false);
  const [showStreamForm, setShowStreamForm] = useState(false);

  const catalog = INTEGRATION_CATALOG.map(([id, name, description, itemCategory, icon]) => ({
    id,
    name,
    description,
    category: itemCategory,
    icon,
    ...(integrationState[id] ?? {}),
  }));

  const connected = catalog.filter((item) => item.connected);

  const filtered = catalog.filter(
    (item) =>
      (category === 'all' || item.category === category) &&
      `${item.name} ${item.description}`.toLowerCase().includes(query.toLowerCase()),
  );

  const selected = catalog.find((item) => item.id === selectedIntegrationId) ?? null;
  const secretKeys = new Set(secrets.map((secret: any) => secret.key));

  function statusClass(status?: string) {
    return status === 'error' ? 'error' : status === 'syncing' ? 'syncing' : status === 'active' ? 'active' : 'idle';
  }

  return (
    <div className="bolt-project-integrations-tool" data-testid="integrations-panel">
      <AddAuthenticationCard projectId={projectId} />
      <header className="bolt-project-integrations-head">
        <div>
          <h3>Integration Hub</h3>
          <p>Connect project tools, webhooks, API keys and event streams through backend-persisted project config.</p>
        </div>
        <div className="bolt-project-integrations-actions">
          <button type="button" onClick={() => setShowApiKeyForm((value) => !value)}>
            <span className="i-ph:key" aria-hidden />
            API Keys
          </button>
          <button type="button" onClick={() => setShowWebhookForm((value) => !value)}>
            <span className="i-ph:webhooks-logo" aria-hidden />
            Webhooks
          </button>
          <button type="button" onClick={() => setShowStreamForm((value) => !value)}>
            <span className="i-ph:broadcast" aria-hidden />
            Event Streaming
          </button>
        </div>
      </header>

      <div className="bolt-project-integrations-layout">
        <aside className="bolt-project-integrations-sidebar">
          <section>
            <h4>Categories</h4>
            {INTEGRATION_CATEGORIES.map(([id, label, icon]) => {
              const count = id === 'all' ? catalog.length : catalog.filter((item) => item.category === id).length;

              return (
                <button
                  key={id}
                  type="button"
                  aria-current={category === id ? 'page' : undefined}
                  onClick={() => setCategory(id)}
                >
                  <span className={icon} aria-hidden />
                  <span>{label}</span>
                  <em>{count}</em>
                </button>
              );
            })}
          </section>
          <section>
            <h4>Connected</h4>
            <strong>{connected.length}</strong>
            <div className="bolt-project-integrations-connected-list">
              {connected.slice(0, 10).map((item) => (
                <button key={item.id} type="button" onClick={() => setSelectedIntegrationId(item.id)}>
                  <span className={item.icon} aria-hidden />
                  <span>{item.name}</span>
                  <i data-status={statusClass(item.status)} />
                </button>
              ))}
              {!connected.length && <small>No connected integrations yet.</small>}
            </div>
          </section>
        </aside>

        <main className="bolt-project-integrations-main">
          <div className="bolt-project-integrations-tabs">
            {[
              ['browse', 'Browse All'],
              ['connected', `Connected (${connected.length})`],
              ['webhooks', `Webhooks (${webhooks.length})`],
              ['api-keys', `API Keys (${apiKeys.length})`],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                aria-current={activeTab === id ? 'page' : undefined}
                onClick={() => setActiveTab(id as any)}
              >
                {label}
              </button>
            ))}
            <label>
              <span className="i-ph:magnifying-glass" aria-hidden />
              <input
                placeholder="Search integrations..."
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
          </div>

          {selected ? (
            <section className="bolt-project-integration-config" data-testid="dialog-integration-config">
              <div>
                <span className={selected.icon} aria-hidden />
                <strong>{selected.name}</strong>
                <small>{selected.description}</small>
              </div>
              <div
                className="bolt-project-integration-permissions"
                data-connected={selected.connected ? 'true' : 'false'}
              >
                <strong>
                  {selected.connected
                    ? `${selected.name} currently has access to:`
                    : `Before you connect, ${selected.name} will be able to:`}
                </strong>
                <ul>
                  {integrationPermissions(selected.category).map((permission: string) => (
                    <li key={permission}>
                      <span className="i-ph:check-circle" aria-hidden />
                      {permission}
                    </li>
                  ))}
                </ul>
                <small>
                  {selected.connected
                    ? 'Revoking removes the stored token and stops all syncs immediately.'
                    : 'You can revoke this access at any time.'}
                </small>
              </div>
              <form onSubmit={onSubmit}>
                <input type="hidden" name="intent" value={selected.connected ? 'disconnect' : 'connect'} />
                <input type="hidden" name="integrationId" value={selected.id} />
                {selected.connected ? null : (
                  <>
                    <PanelInput name="apiToken" type="password" placeholder="API token, OAuth token or app password" />
                    <PanelInput
                      name="organization"
                      placeholder="Organization or workspace"
                      defaultValue={selected.config?.organization ?? ''}
                    />
                  </>
                )}
                <PanelButton disabled={busy} variant={selected.connected ? 'outline' : undefined}>
                  {selected.connected ? `Revoke access` : `Connect ${selected.name}`}
                </PanelButton>
              </form>
              <PanelRows
                rows={[
                  ['Status', selected.connected ? (selected.status ?? 'active') : 'Not connected'],
                  ['Last sync', selected.lastSync ? new Date(selected.lastSync).toLocaleString() : 'Never'],
                  [
                    'Secret stored',
                    secretKeys.has(`INTEGRATION_TOKEN_${selected.id.toUpperCase().replace(/[^A-Z0-9_]/g, '_')}`)
                      ? 'Yes'
                      : 'No token stored',
                  ],
                ]}
              />
              <button type="button" onClick={() => setSelectedIntegrationId(null)}>
                Close configuration
              </button>
            </section>
          ) : null}

          {activeTab === 'browse' && (
            <section className="bolt-project-integrations-grid" data-testid="grid-integrations">
              {filtered.map((item) => (
                <article key={item.id} data-testid={`integration-card-${item.id}`}>
                  <div>
                    <span className={item.icon} aria-hidden />
                    <div>
                      <strong>{item.name}</strong>
                      <p>{item.description}</p>
                    </div>
                    {item.connected && <em data-status={statusClass(item.status)}>{item.status ?? 'active'}</em>}
                  </div>
                  <footer>
                    <small>{item.category}</small>
                    <button
                      type="button"
                      onClick={() => setSelectedIntegrationId(item.id)}
                      data-testid={`button-connect-${item.id}`}
                    >
                      {item.connected ? 'Manage' : 'Connect'}
                    </button>
                  </footer>
                </article>
              ))}
            </section>
          )}

          {activeTab === 'connected' && (
            <section className="bolt-project-integrations-list" data-testid="list-connected">
              {connected.map((item) => (
                <article key={item.id}>
                  <span className={item.icon} aria-hidden />
                  <div>
                    <strong>{item.name}</strong>
                    <small>
                      {item.lastSync ? `Last sync: ${new Date(item.lastSync).toLocaleString()}` : 'No sync yet'}
                    </small>
                  </div>
                  <form onSubmit={onSubmit}>
                    <input type="hidden" name="intent" value="sync" />
                    <input type="hidden" name="integrationId" value={item.id} />
                    <PanelButton disabled={busy} variant="outline">
                      Sync
                    </PanelButton>
                  </form>
                  <button type="button" onClick={() => setSelectedIntegrationId(item.id)}>
                    Configure
                  </button>
                </article>
              ))}
              {!connected.length && (
                <EmptyState
                  variant="compact"
                  icon="i-ph:plugs-connected"
                  title="No connected integrations"
                  description="Connect a service to sync data and automate your project."
                  actionLabel="Browse integrations"
                  onAction={() => setActiveTab('browse')}
                />
              )}
            </section>
          )}

          {activeTab === 'webhooks' && (
            <section className="bolt-project-integrations-list" data-testid="card-webhooks-list">
              <div className="bolt-project-integrations-section-head">
                <div>
                  <strong>Webhooks</strong>
                  <small>Outgoing endpoints persisted in project backend config.</small>
                </div>
                <button type="button" onClick={() => setShowWebhookForm((value) => !value)}>
                  Create Webhook
                </button>
              </div>
              {showWebhookForm && (
                <form onSubmit={onSubmit} className="bolt-project-integrations-form">
                  <input type="hidden" name="intent" value="create-webhook" />
                  <PanelInput name="name" placeholder="Deployment Notifications" required />
                  <PanelInput name="url" placeholder="https://example.com/webhook" required />
                  <PanelInput name="secret" type="password" placeholder="Webhook signing secret" />
                  <PanelInput name="events" placeholder="deploy.success,deploy.fail" defaultValue="all" />
                  <PanelButton disabled={busy}>Create Webhook</PanelButton>
                </form>
              )}
              {webhooks.map((webhook: any) => (
                <article key={webhook.id} data-testid={`webhook-${webhook.id}`}>
                  <span className="i-ph:webhooks-logo" aria-hidden />
                  <div>
                    <strong>{webhook.name}</strong>
                    <small>{webhook.url}</small>
                    <small>
                      {(webhook.events ?? []).join(', ')} · {webhook.successRate ?? 100}% success
                    </small>
                  </div>
                  <form onSubmit={onSubmit}>
                    <input type="hidden" name="intent" value="toggle-webhook" />
                    <input type="hidden" name="webhookId" value={webhook.id} />
                    <input type="hidden" name="active" value={webhook.active ? 'false' : 'true'} />
                    <PanelButton disabled={busy} variant="outline">
                      {webhook.active ? 'Pause' : 'Resume'}
                    </PanelButton>
                  </form>
                  <form onSubmit={onSubmit}>
                    <input type="hidden" name="intent" value="delete-webhook" />
                    <input type="hidden" name="webhookId" value={webhook.id} />
                    <PanelButton disabled={busy} variant="outline">
                      Delete
                    </PanelButton>
                  </form>
                </article>
              ))}
              {!webhooks.length && (
                <EmptyState
                  variant="compact"
                  icon="i-ph:webhooks-logo"
                  title="No webhooks configured"
                  description="Send project events to an outgoing endpoint."
                  actionLabel="Create webhook"
                  onAction={() => setShowWebhookForm(true)}
                />
              )}
            </section>
          )}

          {activeTab === 'api-keys' && (
            <section className="bolt-project-integrations-list" data-testid="card-api-keys-list">
              <div className="bolt-project-integrations-section-head">
                <div>
                  <strong>API Keys</strong>
                  <small>Secrets are stored in the backend secret store; only prefixes are shown here.</small>
                </div>
                <button type="button" onClick={() => setShowApiKeyForm((value) => !value)}>
                  Create API Key
                </button>
              </div>
              {showApiKeyForm && (
                <form onSubmit={onSubmit} className="bolt-project-integrations-form">
                  <input type="hidden" name="intent" value="create-api-key" />
                  <PanelInput name="name" placeholder="Production API Key" required />
                  <select name="permissions" defaultValue="read,write">
                    <option value="read">Read Only</option>
                    <option value="read,write">Read & Write</option>
                    <option value="read,write,admin">Admin</option>
                    <option value="read,deploy">Deploy</option>
                  </select>
                  <select name="environment" defaultValue="development">
                    <option value="development">Development</option>
                    <option value="production">Production</option>
                    <option value="ci">CI/CD</option>
                  </select>
                  <select name="expiration" defaultValue="never">
                    <option value="30">30 days</option>
                    <option value="90">90 days</option>
                    <option value="365">1 year</option>
                    <option value="never">Never</option>
                  </select>
                  <PanelButton disabled={busy}>Generate Key</PanelButton>
                </form>
              )}
              {apiKeys.map((apiKey: any) => (
                <article key={apiKey.id} data-testid={`api-key-${apiKey.id}`}>
                  <span className="i-ph:key" aria-hidden />
                  <div>
                    <strong>{apiKey.name}</strong>
                    <small>{apiKey.prefix}••••••••••••••••••••</small>
                    <small>
                      {(apiKey.permissions ?? []).join(', ')}
                      {apiKey.expiresAt ? ` · expires ${new Date(apiKey.expiresAt).toLocaleDateString()}` : ''}
                    </small>
                  </div>
                  <form onSubmit={onSubmit}>
                    <input type="hidden" name="intent" value="revoke-api-key" />
                    <input type="hidden" name="apiKeyId" value={apiKey.id} />
                    <PanelButton disabled={busy} variant="outline">
                      Revoke
                    </PanelButton>
                  </form>
                </article>
              ))}
              {!apiKeys.length && (
                <EmptyState
                  variant="compact"
                  icon="i-ph:key"
                  title="No API keys created"
                  description="Generate a key to access this project programmatically."
                  actionLabel="Create API key"
                  onAction={() => setShowApiKeyForm(true)}
                />
              )}
            </section>
          )}

          <section className="bolt-project-integrations-streams" data-testid="dialog-event-streaming">
            <div className="bolt-project-integrations-section-head">
              <div>
                <strong>Event Streaming</strong>
                <small>Streams are project-scoped and backed by the same persisted integration state.</small>
              </div>
              <button type="button" onClick={() => setShowStreamForm((value) => !value)}>
                Add Stream
              </button>
            </div>
            {showStreamForm && (
              <form onSubmit={onSubmit} className="bolt-project-integrations-form">
                <input type="hidden" name="intent" value="create-stream" />
                <PanelInput name="name" placeholder="Audit Logs" required />
                <select name="destination" defaultValue="AWS Kinesis">
                  <option value="AWS Kinesis">AWS Kinesis</option>
                  <option value="Apache Kafka">Apache Kafka</option>
                  <option value="Google Pub/Sub">Google Pub/Sub</option>
                  <option value="Azure Event Hub">Azure Event Hub</option>
                  <option value="Elasticsearch">Elasticsearch</option>
                </select>
                <PanelInput name="events" placeholder="auth.*,api.*" defaultValue="*" />
                <PanelButton disabled={busy}>Add Stream</PanelButton>
              </form>
            )}
            <div className="bolt-project-integrations-list compact">
              {eventStreams.map((stream: any) => (
                <article key={stream.id} data-testid={`stream-${stream.id}`}>
                  <span className="i-ph:broadcast" aria-hidden />
                  <div>
                    <strong>{stream.name}</strong>
                    <small>
                      {stream.destination} · {(stream.events ?? []).join(', ')} · {stream.throughput ?? 0}/min
                    </small>
                  </div>
                  <form onSubmit={onSubmit}>
                    <input type="hidden" name="intent" value="toggle-stream" />
                    <input type="hidden" name="streamId" value={stream.id} />
                    <input type="hidden" name="active" value={stream.active ? 'false' : 'true'} />
                    <PanelButton disabled={busy} variant="outline">
                      {stream.active ? 'Pause' : 'Resume'}
                    </PanelButton>
                  </form>
                </article>
              ))}
              {!eventStreams.length && (
                <EmptyState
                  variant="compact"
                  icon="i-ph:broadcast"
                  title="No event streams configured"
                  description="Stream project events to an external destination."
                  actionLabel="Add stream"
                  onAction={() => setShowStreamForm(true)}
                />
              )}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

const ENV_VAR_SCOPES = [
  { key: 'development', label: 'Development', short: 'Dev' },
  { key: 'preview', label: 'Preview', short: 'Preview' },
  { key: 'production', label: 'Production', short: 'Prod' },
] as const;

type EnvVarScope = (typeof ENV_VAR_SCOPES)[number]['key'];

function normalizeEnvScope(scope: unknown): EnvVarScope {
  // Legacy rows carry no scope; treat them as production (the store default).
  return scope === 'development' || scope === 'preview' || scope === 'production' ? scope : 'production';
}

function maskEnvValue(value: string): string {
  if (!value) {
    return 'empty value';
  }

  return '•'.repeat(Math.min(Math.max(value.length, 4), 12));
}

function ProjectEnvPanel({ data, onSubmit, busy }: { data: any; onSubmit: any; busy: boolean }) {
  const envVars: Array<{ key: string; value?: string; scope?: string; updatedAt?: string }> = data.envVars ?? [];
  const [query, setQuery] = useState('');
  const [activeScope, setActiveScope] = useState<EnvVarScope>('production');
  const [showDiff, setShowDiff] = useState(false);
  const [revealDiff, setRevealDiff] = useState(false);
  const [editing, setEditing] = useState<{ key: string; value?: string; scope: EnvVarScope } | null>(null);

  /*
   * The key/value inputs are React-controlled via `editing`, so the shared
   * submit handler's DOM-level form.reset() cannot clear them. Without resetting
   * `editing` after a successful upsert the form stays populated, the button
   * stays stuck on "Save variable", and the next "Create variable" silently
   * re-submits the previous key. Clear it on the panel's success event.
   */
  useEffect(() => {
    const handlePanelSuccess = (event: Event) => {
      const detail = (event as CustomEvent).detail as { panel?: string; intent?: string; ok?: boolean } | undefined;

      if (detail?.panel === 'env' && detail.intent === 'upsert' && detail.ok) {
        setEditing(null);
      }
    };

    window.addEventListener('vibecore:ide-panel-action', handlePanelSuccess);

    return () => window.removeEventListener('vibecore:ide-panel-action', handlePanelSuccess);
  }, []);

  const [message, setMessage] = useState('');

  // Per-scope view: only the variables that belong to the active scope.
  const scopedVars = envVars.filter((item) => normalizeEnvScope(item.scope) === activeScope);

  const filtered = scopedVars.filter((item) =>
    [item.key, item.value, item.updatedAt].join(' ').toLowerCase().includes(query.toLowerCase()),
  );

  // Diff view: one row per key, its value/presence across all three scopes.
  const diffRows = (() => {
    const byKey = new Map<string, Partial<Record<EnvVarScope, string>>>();

    for (const item of envVars) {
      const scope = normalizeEnvScope(item.scope);
      const row = byKey.get(item.key) ?? {};
      row[scope] = item.value ?? '';
      byKey.set(item.key, row);
    }

    return [...byKey.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .filter(([key]) => key.toLowerCase().includes(query.toLowerCase()))
      .map(([key, values]) => {
        const present = ENV_VAR_SCOPES.map((s) => values[s.key]).filter((v) => v !== undefined) as string[];
        const distinct = new Set(present);

        /*
         * Diverges when the scopes disagree: either a different value OR the key
         * is set in some scopes but missing in others.
         */
        const diverges = distinct.size > 1 || present.length !== ENV_VAR_SCOPES.length;

        return { key, values, diverges };
      });
  })();

  async function copyEnv(key: string, value?: string) {
    try {
      await navigator.clipboard?.writeText(value ? `${key}=${value}` : key);
      setMessage(value ? `${key} copied with value.` : `${key} copied.`);
    } catch {
      // writeText rejects when the document isn't focused / permission denied.
      setMessage(`Unable to copy ${key} to clipboard.`);
    }
  }

  return (
    <div className="bolt-project-managed-panel">
      <section>
        <div className="bolt-project-env-scopes" role="tablist" aria-label="Environment scope">
          {ENV_VAR_SCOPES.map((scope) => (
            <button
              key={scope.key}
              type="button"
              role="tab"
              aria-selected={activeScope === scope.key}
              className={activeScope === scope.key ? 'selected' : undefined}
              disabled={showDiff}
              onClick={() => {
                setActiveScope(scope.key);
                setEditing((current) => (current ? { ...current, scope: scope.key } : current));
              }}
            >
              {scope.label}
            </button>
          ))}
          <button
            type="button"
            className={showDiff ? 'bolt-project-env-diff-toggle selected' : 'bolt-project-env-diff-toggle'}
            aria-pressed={showDiff}
            onClick={() => setShowDiff((current) => !current)}
          >
            {showDiff ? 'Exit diff' : 'Diff scopes'}
          </button>
        </div>

        <div className="bolt-project-panel-toolbar">
          <label>
            {showDiff ? 'Filter keys' : `Search ${activeScope} variables`}
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="VITE_, DATABASE, API"
            />
          </label>
          {!showDiff && (
            <button type="button" onClick={() => setEditing({ key: 'VITE_API_URL', value: '', scope: activeScope })}>
              New variable
            </button>
          )}
        </div>
        {message && <div className="bolt-project-empty-panel">{message}</div>}

        {showDiff ? (
          <div className="bolt-project-env-diff-wrap">
            <div className="bolt-project-env-diff-actions">
              <button type="button" onClick={() => setRevealDiff((current) => !current)} aria-pressed={revealDiff}>
                {revealDiff ? 'Mask values' : 'Reveal values'}
              </button>
            </div>
            {diffRows.length ? (
              <table className="bolt-project-env-diff">
                <thead>
                  <tr>
                    <th scope="col">Key</th>
                    {ENV_VAR_SCOPES.map((scope) => (
                      <th key={scope.key} scope="col">
                        {scope.short}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {diffRows.map((row) => (
                    <tr key={row.key} className={row.diverges ? 'diverges' : undefined}>
                      <th scope="row">
                        <span>{row.key}</span>
                        {row.diverges && <em className="bolt-project-env-diff-flag">differs</em>}
                      </th>
                      {ENV_VAR_SCOPES.map((scope) => {
                        const value = row.values[scope.key];
                        const absent = value === undefined;

                        return (
                          <td key={scope.key} className={absent ? 'absent' : undefined}>
                            {absent ? '—' : revealDiff ? value || 'empty value' : maskEnvValue(value)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="bolt-project-empty-panel">
                {query ? 'No key matches this filter.' : 'No environment variables to compare yet.'}
              </div>
            )}
          </div>
        ) : (
          <div className="bolt-project-env-list">
            {filtered.length ? (
              filtered.map((item) => (
                <div key={`${item.scope ?? 'production'}:${item.key}`} className="bolt-project-env-row">
                  <strong>{item.key}</strong>
                  <span>{item.value || 'empty value'}</span>
                  <small>{item.updatedAt ?? 'Stored in project metadata'}</small>
                  <button
                    type="button"
                    onClick={() => setEditing({ key: item.key, value: item.value ?? '', scope: activeScope })}
                  >
                    Edit
                  </button>
                  <button type="button" onClick={() => void copyEnv(item.key, item.value)}>
                    Copy
                  </button>
                  <ConfirmSubmitForm
                    onSubmit={onSubmit}
                    title={`Delete ${item.key} from ${activeScope}?`}
                    description="The variable is removed from this scope only. This cannot be undone."
                    confirmLabel="Delete variable"
                  >
                    <input name="intent" value="delete" type="hidden" />
                    <input name="key" value={item.key} type="hidden" />
                    <input name="scope" value={activeScope} type="hidden" />
                    <PanelButton disabled={busy} variant="outline">
                      Delete
                    </PanelButton>
                  </ConfirmSubmitForm>
                </div>
              ))
            ) : query ? (
              <div className="bolt-project-empty-panel">No environment variable matches this search.</div>
            ) : (
              <EmptyState
                variant="compact"
                icon="i-ph:brackets-curly"
                title={`No ${activeScope} variables`}
                description={`Add a variable to configure this project's ${activeScope} runtime.`}
                actionLabel="New variable"
                onAction={() => setEditing({ key: 'VITE_API_URL', value: '', scope: activeScope })}
              />
            )}
          </div>
        )}
      </section>
      {!showDiff && (
        <form onSubmit={onSubmit} className="grid gap-3 rounded-lg border border-bolt-elements-borderColor p-3">
          <input name="intent" value="upsert" type="hidden" />
          <label className="bolt-project-env-scope-field">
            <span>Scope</span>
            <select
              name="scope"
              value={editing?.scope ?? activeScope}
              onChange={(event) =>
                setEditing((current) => ({
                  key: current?.key ?? '',
                  value: current?.value ?? '',
                  scope: normalizeEnvScope(event.target.value),
                }))
              }
            >
              {ENV_VAR_SCOPES.map((scope) => (
                <option key={scope.key} value={scope.key}>
                  {scope.label}
                </option>
              ))}
            </select>
          </label>
          <PanelInput
            name="key"
            placeholder="VITE_API_URL"
            required
            value={editing?.key ?? ''}
            onChange={(event: any) =>
              setEditing((current) => ({
                key: event.target.value,
                value: current?.value ?? '',
                scope: current?.scope ?? activeScope,
              }))
            }
          />
          <PanelInput
            name="value"
            value={editing?.value ?? ''}
            onChange={(event: any) =>
              setEditing((current) => ({
                key: current?.key ?? '',
                value: event.target.value,
                scope: current?.scope ?? activeScope,
              }))
            }
          />
          <PanelButton disabled={busy || !editing?.key?.trim()}>
            {editing ? 'Save variable' : 'Create variable'}
          </PanelButton>
        </form>
      )}
    </div>
  );
}

function ProjectDatabasePanel({
  projectId,
  data,
  onSubmit,
  busy,
}: {
  projectId?: string;
  data: any;
  onSubmit: any;
  busy: boolean;
  reload?: () => void | Promise<void>;
}) {
  /*
   * Replit-parity Database panel = the DatabaseWorkbench shell only: root
   * "All Databases" Dev/Prod usage cards -> breadcrumb + Dev/Prod selector ->
   * exactly three tabs (Overview / My Data / Settings). The legacy 5-tab block
   * (Explorer/Query/Schema/Secrets/Backups) that used to be duplicated below it
   * has been removed: Overview lists tables + row counts, My Data is the SQL
   * console + database studio, and Settings holds the connection string,
   * storage and the point-in-time restore (folded in from the old Backups tab).
   * First-run connection onboarding still shows when there are no connections.
   */
  const connections = data.connections ?? [];

  /*
   * The BYO "Add your first database" onboarding must ONLY show for a genuinely
   * empty project. Previously it gated on `connections.length === 0` alone, so it
   * rendered even when a MANAGED database is already connected (DatabaseWorkbench
   * below shows "Production Database — Connected") — a confusing dead-looking
   * button (it's a form submit needing a connection string) stacked on top of a
   * live DB. Also hide it once a managed instance/environment exists (same
   * connected-signal DatabasePanel uses).
   */
  const hasManagedDatabase =
    Boolean(data?.instance) || (Array.isArray(data?.environments) && data.environments.length > 0);

  return (
    <div className="grid gap-4">
      {connections.length === 0 && !hasManagedDatabase ? (
        <DatabaseConnectionOnboarding onSubmit={onSubmit} busy={busy} />
      ) : null}
      {projectId ? <DatabaseWorkbench projectId={projectId} /> : null}
    </div>
  );
}

function DatabaseConnectionOnboarding({ onSubmit, busy }: { onSubmit: any; busy: boolean }) {
  const providerExamples = [
    {
      provider: 'Neon / Supabase Postgres',
      key: 'DATABASE_URL',
      value: 'postgresql://user:password@host.neon.tech/db?sslmode=require',
      note: 'Use this for Drizzle, Prisma, SQL migrations and Postgres query browsing.',
    },
    {
      provider: 'PlanetScale / MySQL',
      key: 'MYSQL_URL',
      value: 'mysql://user:password@aws.connect.psdb.cloud/app?ssl={"rejectUnauthorized":true}',
      note: 'Use a MySQL connection URL when your app runs mysql2, Prisma or server-side SQL.',
    },
    {
      provider: 'MongoDB Atlas',
      key: 'MONGODB_URI',
      value: 'mongodb+srv://user:password@cluster.mongodb.net/app?retryWrites=true&w=majority',
      note: 'Use this for document collections and MongoDB query inspection.',
    },
    {
      provider: 'Upstash Redis',
      key: 'REDIS_URL',
      value: 'redis://default:password@host.upstash.io:6379',
      note: 'Use Redis for queues, cache, sessions and rate limits.',
    },
  ];

  return (
    <section className="bolt-project-database-onboarding" aria-label="Database connection setup">
      <div className="bolt-project-database-onboarding-hero">
        <div>
          <span className="i-ph:database-duotone" aria-hidden />
          <h3>Add your first database</h3>
          <p>
            Connect a real provider by saving its connection string as an encrypted project secret. E-Code detects
            Postgres, MySQL, MongoDB and Redis URLs from secrets and uses them for schema browsing, backups and
            read-only queries.
          </p>
        </div>
      </div>

      <div className="bolt-project-database-steps" aria-label="Database setup steps">
        {[
          [
            '1',
            'Create or open a hosted database',
            'Use Neon, Supabase, PlanetScale, MongoDB Atlas, Upstash or any compatible provider.',
          ],
          [
            '2',
            'Copy the connection string',
            'Keep the password in the URL. It will be stored server-side as a secret, not displayed back.',
          ],
          [
            '3',
            'Save it below',
            'Use DATABASE_URL for the primary database, then reload this panel to inspect schema and run queries.',
          ],
        ].map(([step, title, description]) => (
          <article key={step}>
            <strong>{step}</strong>
            <div>
              <h4>{title}</h4>
              <p>{description}</p>
            </div>
          </article>
        ))}
      </div>

      <form onSubmit={onSubmit} className="bolt-project-database-wizard">
        <input name="intent" value="upsert-secret" type="hidden" />
        <div>
          <h4>Connection secret</h4>
          <p>Paste the provider URL exactly as given by your database dashboard.</p>
        </div>
        <label>
          <span>Secret name</span>
          <PanelInput name="key" placeholder="DATABASE_URL" defaultValue="DATABASE_URL" required />
          <small>Recommended: DATABASE_URL, MYSQL_URL, MONGODB_URI or REDIS_URL.</small>
        </label>
        <label>
          <span>Connection string</span>
          <PanelInput
            name="value"
            type="password"
            placeholder="postgresql://user:password@host/db?sslmode=require"
            required
          />
          <small>Stored as an encrypted secret. The value is never returned to the browser after saving.</small>
        </label>
        <PanelButton disabled={busy}>Add your first database</PanelButton>
      </form>

      <details className="bolt-project-database-docs" open>
        <summary>Connection string examples by provider</summary>
        <div>
          {providerExamples.map((example) => (
            <article key={example.provider}>
              <div>
                <strong>{example.provider}</strong>
                <span>{example.key}</span>
              </div>
              <code>{example.value}</code>
              <p>{example.note}</p>
            </article>
          ))}
        </div>
      </details>
    </section>
  );
}

function ProjectSecurityPanel({
  data,
  project,
  projectId,
  onSubmit,
  busy,
  reload,
}: {
  data: any;
  project: any;
  projectId?: string;
  onSubmit: any;
  busy: boolean;
  reload?: () => void | Promise<void>;
}) {
  const [activeTab, setActiveTab] = useState<'active' | 'hidden' | 'settings' | 'reports' | 'compare'>('active');

  const [scanState, setScanState] = useState<{
    status: 'idle' | 'running' | 'completed' | 'timeout' | 'cancelled' | 'failed';
    progress: number;
    message?: string;
    startedAt?: number;
  }>({ status: 'idle', progress: 0 });

  const scanAbortRef = useRef<AbortController | null>(null);
  const state = data.securityState ?? {};
  const settings = state.settings ?? {};
  const scans = state.scans ?? [];
  const vulnerabilities = state.vulnerabilities ?? [];
  const activeVulnerabilities = vulnerabilities.filter((item: any) => !item.hidden);

  const visibleVulnerabilities = vulnerabilities.filter((item: any) =>
    activeTab === 'hidden' ? item.hidden : !item.hidden,
  );

  const latestScan = scans[0];
  const previousScan = scans[1];
  const latestCounts = latestScan?.counts ?? securityCountsFromVulnerabilities(activeVulnerabilities);
  const previousCounts = previousScan?.counts ?? {};
  const schedule = settings.schedule ?? {};
  const githubSecurityUrl = githubSecurityHref(project);

  const severityRows = ['critical', 'high', 'moderate', 'low', 'info'].map((severity) => [
    severity,
    `${activeVulnerabilities.filter((item: any) => item.severity === severity).length} active`,
  ]);

  const exportSarifReport = () => downloadSecurityReport('sarif', project, state);
  const exportJsonReport = () => downloadSecurityReport('json', project, state);

  const scanRunning = scanState.status === 'running';
  const scanElapsedMs = scanRunning && scanState.startedAt ? Date.now() - scanState.startedAt : 0;
  const scanStage = scanProgressStage(scanState.progress, scanElapsedMs);

  useEffect(() => {
    if (!scanRunning || !scanState.startedAt) {
      return undefined;
    }

    const interval = window.setInterval(() => {
      setScanState((current) => {
        if (current.status !== 'running' || !current.startedAt) {
          return current;
        }

        const elapsed = Date.now() - current.startedAt;

        const progress = Math.min(
          94,
          Math.max(current.progress, 8 + Math.round((elapsed / PROJECT_SECURITY_SCAN_TIMEOUT_MS) * 84)),
        );

        return {
          ...current,
          progress,
          message: scanProgressStage(progress, elapsed),
        };
      });
    }, 800);

    return () => window.clearInterval(interval);
  }, [scanRunning, scanState.startedAt]);

  useEffect(() => {
    return () => {
      scanAbortRef.current?.abort();
    };
  }, []);

  const runScan = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!projectId) {
      setScanState({
        status: 'failed',
        progress: 0,
        message: 'Missing project id. Reload the IDE and try again.',
      });

      return;
    }

    scanAbortRef.current?.abort();

    const controller = new AbortController();
    scanAbortRef.current = controller;

    const timeout = window.setTimeout(() => {
      controller.abort();
      setScanState({
        status: 'timeout',
        progress: 100,
        message: 'Security scan timed out after 90 seconds. No result was accepted; retry or inspect runtime logs.',
      });
    }, PROJECT_SECURITY_SCAN_TIMEOUT_MS);

    setScanState({
      status: 'running',
      progress: 8,
      startedAt: Date.now(),
      message: 'Preparing scanner profile',
    });

    try {
      const formData = new FormData(event.currentTarget);

      const response = await fetch(`/api/projects/${projectId}/ide-panel/security`, {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      });

      const result = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        throw new Error(result.error ?? 'Security scan failed');
      }

      window.clearTimeout(timeout);
      setScanState({
        status: 'completed',
        progress: 100,
        message: 'Scan completed. Results were refreshed from backend state.',
      });
      await reload?.();
    } catch (error) {
      window.clearTimeout(timeout);

      if (controller.signal.aborted) {
        setScanState((current) =>
          current.status === 'timeout'
            ? current
            : {
                status: 'cancelled',
                progress: 0,
                message:
                  'Scan cancelled locally. Reload the panel to confirm whether the backend stored a partial run.',
              },
        );

        return;
      }

      setScanState({
        status: 'failed',
        progress: 100,
        message: error instanceof Error ? error.message : 'Security scan failed',
      });
    } finally {
      window.clearTimeout(timeout);

      if (scanAbortRef.current === controller) {
        scanAbortRef.current = null;
      }
    }
  };

  const cancelScan = () => {
    scanAbortRef.current?.abort();
    setScanState({
      status: 'cancelled',
      progress: 0,
      message: 'Scan cancelled locally. No completed scan was accepted in this browser session.',
    });
  };

  const printReport = () => {
    const report = buildSecurityReport(project, state);
    const printable = window.open('', '_blank', 'noopener,noreferrer');

    if (!printable) {
      return;
    }

    printable.document.write(renderSecurityReportHtml(report));
    printable.document.close();
    printable.focus();
    printable.print();
  };

  return (
    <div className="bolt-project-security-tool">
      <section className="bolt-project-security-summary">
        <div>
          <h3>Security and privacy scanner</h3>
          <p>
            Runs SCA, secret scanning and lightweight SAST against the active workspace. Findings, schedules and reports
            are stored in project backend state.
          </p>
        </div>
        <form onSubmit={runScan} className="bolt-project-security-scan-form">
          <input name="intent" value="scan" type="hidden" />
          <PanelButton disabled={busy || scanRunning}>{scanRunning ? 'Scanning...' : 'Run full scan'}</PanelButton>
          {scanRunning ? (
            <button type="button" className="bolt-project-security-cancel" onClick={cancelScan}>
              Cancel scan
            </button>
          ) : null}
        </form>
      </section>

      {scanState.status !== 'idle' ? (
        <section className="bolt-project-security-progress" data-status={scanState.status} aria-live="polite">
          <div>
            <strong>
              {scanState.status === 'running'
                ? scanStage
                : scanState.status === 'completed'
                  ? 'Scan completed'
                  : scanState.status === 'timeout'
                    ? 'Scan timed out'
                    : scanState.status === 'cancelled'
                      ? 'Scan cancelled'
                      : 'Scan failed'}
            </strong>
            <span>{scanState.message}</span>
          </div>
          <progress max={100} value={scanState.progress} aria-label="Security scan progress" />
        </section>
      ) : null}

      <section className="bolt-project-security-scope" aria-label="Security scanner coverage">
        {[
          ['SCA', 'npm audit dependency advisories', settings.dependencyAuditEnabled !== false],
          ['Secrets', 'API keys, tokens and passwords in source', settings.secretScanEnabled !== false],
          ['SAST', 'Unsafe DOM sinks and command execution patterns', settings.sastEnabled !== false],
          ['Privacy', 'Client-side privacy risk signals', settings.privacyDetectionEnabled !== false],
        ].map(([label, description, enabled]) => (
          <article key={String(label)} data-enabled={enabled ? 'true' : 'false'}>
            <strong>{label}</strong>
            <span>{description}</span>
          </article>
        ))}
      </section>

      <div className="bolt-project-security-grid">
        <aside>
          <strong>Latest scan</strong>
          <PanelRows
            rows={[
              ['Status', latestScan?.status ?? 'No scan yet'],
              ['Profile', latestScan?.scanner ?? settings.scannerProfile ?? 'workspace-runtime'],
              ['Summary', latestScan?.summary ?? 'Run a scan to populate security findings'],
              [
                'Schedule',
                schedule.enabled ? `${schedule.frequency}, next ${formatSecurityDate(schedule.nextRunAt)}` : 'Manual',
              ],
            ]}
          />
          <strong>Severity</strong>
          <PanelRows rows={severityRows} />
          <strong>GitHub Security</strong>
          <PanelRows
            rows={[
              ['Status', githubSecurityUrl ? 'Repository detected' : 'No GitHub remote detected'],
              ['Sync', settings.githubSecuritySyncEnabled ? 'Enabled' : 'Manual reports'],
            ]}
          />
          {githubSecurityUrl ? (
            <a className="bolt-project-security-link" href={githubSecurityUrl} target="_blank" rel="noreferrer">
              Open GitHub Security tab
            </a>
          ) : (
            <a className="bolt-project-security-link" href="?panel=git">
              Connect a GitHub remote
            </a>
          )}
        </aside>

        <main>
          <div className="bolt-project-tool-tabs">
            {[
              ['active', 'Active'],
              ['hidden', 'Hidden'],
              ['compare', 'Compare'],
              ['reports', 'Reports'],
              ['settings', 'Settings'],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                aria-current={activeTab === id ? 'page' : undefined}
                onClick={() => setActiveTab(id as any)}
              >
                {label}
              </button>
            ))}
          </div>

          {activeTab === 'settings' ? (
            <form onSubmit={onSubmit} className="bolt-project-security-settings">
              <input name="intent" value="settings" type="hidden" />
              <label>
                <span>Scanner profile</span>
                <select name="scannerProfile" defaultValue={settings.scannerProfile ?? 'workspace-runtime'}>
                  <option value="workspace-runtime">Full workspace runtime</option>
                  <option value="sca">SCA only</option>
                  <option value="secrets">Secrets only</option>
                  <option value="sast">SAST only</option>
                </select>
              </label>
              {[
                ['dependencyAuditEnabled', 'Dependency audit', settings.dependencyAuditEnabled !== false],
                ['secretScanEnabled', 'Secret scan', settings.secretScanEnabled !== false],
                ['sastEnabled', 'Static application security scan', settings.sastEnabled !== false],
                ['privacyDetectionEnabled', 'Privacy detection', settings.privacyDetectionEnabled !== false],
              ].map(([name, label, enabled]) => (
                <label key={String(name)}>
                  <span>{label}</span>
                  <select name={String(name)} defaultValue={enabled ? 'true' : 'false'}>
                    <option value="true">Enabled</option>
                    <option value="false">Disabled</option>
                  </select>
                </label>
              ))}
              <label>
                <span>Automatic schedule</span>
                <select name="scheduleEnabled" defaultValue={schedule.enabled ? 'true' : 'false'}>
                  <option value="true">Enabled</option>
                  <option value="false">Manual only</option>
                </select>
              </label>
              <label>
                <span>Schedule cadence</span>
                <select name="scheduleFrequency" defaultValue={schedule.frequency ?? 'weekly'}>
                  <option value="daily">Daily at 03:00 UTC</option>
                  <option value="weekly">Weekly at 03:00 UTC</option>
                </select>
              </label>
              <label>
                <span>GitHub Security reporting</span>
                <select
                  name="githubSecuritySyncEnabled"
                  defaultValue={settings.githubSecuritySyncEnabled ? 'true' : 'false'}
                >
                  <option value="true">Enabled when GitHub remote exists</option>
                  <option value="false">Manual export only</option>
                </select>
              </label>
              <PanelButton disabled={busy}>Save scanner settings</PanelButton>
            </form>
          ) : activeTab === 'reports' ? (
            <section className="bolt-project-security-reports">
              <article>
                <strong>Export audit package</strong>
                <p>
                  Generate a report from the current backend scan state. SARIF can be uploaded to GitHub Security Code
                  Scanning, and the printable report can be saved as PDF by the browser.
                </p>
                <div>
                  <button type="button" onClick={exportSarifReport}>
                    Export SARIF
                  </button>
                  <button type="button" onClick={exportJsonReport}>
                    Export JSON
                  </button>
                  <button type="button" onClick={printReport}>
                    Print / Save PDF
                  </button>
                </div>
              </article>
              <PanelRows
                rows={[
                  ['Findings in report', String(vulnerabilities.length)],
                  ['Latest scan', latestScan?.completedAt ? formatSecurityDate(latestScan.completedAt) : 'No scan yet'],
                  ['SARIF target', 'GitHub Code Scanning compatible'],
                ]}
              />
            </section>
          ) : activeTab === 'compare' ? (
            <section className="bolt-project-security-compare">
              <div>
                <h4>Scan comparison</h4>
                <p>Compares the latest completed scan against the previous scan stored for this project.</p>
              </div>
              <div className="bolt-project-security-comparison-grid">
                {['critical', 'high', 'moderate', 'low', 'info'].map((severity) => {
                  const current = Number(latestCounts?.[severity] ?? 0);
                  const previous = Number(previousCounts?.[severity] ?? 0);
                  const delta = current - previous;

                  return (
                    <article key={severity}>
                      <span>{severity}</span>
                      <strong>{current}</strong>
                      <small data-delta={delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'}>
                        {delta > 0 ? '+' : ''}
                        {delta} vs previous
                      </small>
                    </article>
                  );
                })}
              </div>
              <PanelRows
                rows={[
                  ['Latest', latestScan?.completedAt ? formatSecurityDate(latestScan.completedAt) : 'No scan yet'],
                  [
                    'Previous',
                    previousScan?.completedAt ? formatSecurityDate(previousScan.completedAt) : 'No previous scan',
                  ],
                ]}
              />
            </section>
          ) : (
            <div className="bolt-project-vulnerability-list">
              {visibleVulnerabilities.length ? (
                visibleVulnerabilities.map((vulnerability: any) => (
                  <article key={vulnerability.id} className="bolt-project-vulnerability-card">
                    <div>
                      <span data-severity={vulnerability.severity}>{vulnerability.severity}</span>
                      <strong>{vulnerability.title}</strong>
                      <p>{vulnerability.details || vulnerability.recommendation || vulnerability.source}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {activeTab !== 'hidden' ? (
                        <PanelButton
                          type="button"
                          onClick={() =>
                            window.dispatchEvent(
                              new CustomEvent('vibecore:agent-task', {
                                detail: {
                                  kind: 'fix-security-finding',
                                  title: vulnerability.title,
                                  details: vulnerability.details || vulnerability.recommendation,
                                  severity: vulnerability.severity,
                                  source: vulnerability.source,
                                },
                              }),
                            )
                          }
                        >
                          Fix with Agent
                        </PanelButton>
                      ) : null}
                      <form onSubmit={onSubmit}>
                        <input
                          name="intent"
                          value={activeTab === 'hidden' ? 'unhide-vulnerability' : 'hide-vulnerability'}
                          type="hidden"
                        />
                        <input name="vulnerabilityId" value={vulnerability.id} type="hidden" />
                        <PanelButton disabled={busy} variant="outline">
                          {activeTab === 'hidden' ? 'Restore' : 'Ignore'}
                        </PanelButton>
                      </form>
                    </div>
                  </article>
                ))
              ) : (
                <PanelRows
                  rows={[]}
                  empty={activeTab === 'hidden' ? 'No hidden vulnerabilities.' : 'No active vulnerabilities.'}
                />
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function securityCountsFromVulnerabilities(vulnerabilities: any[]) {
  return ['critical', 'high', 'moderate', 'low', 'info'].reduce<Record<string, number>>((acc, severity) => {
    acc[severity] = vulnerabilities.filter((item: any) => item.severity === severity).length;
    return acc;
  }, {});
}

function scanProgressStage(progress: number, elapsedMs: number) {
  if (progress < 18) {
    return 'Preparing scanner profile';
  }

  if (progress < 42) {
    return 'Running dependency audit';
  }

  if (progress < 66) {
    return 'Scanning secrets';
  }

  if (progress < 88) {
    return 'Running static analysis';
  }

  return elapsedMs > 60_000 ? 'Finalizing long-running scan' : 'Finalizing report';
}

function formatSecurityDate(value?: string | null) {
  if (!value) {
    return 'Not scheduled';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Not scheduled';
  }

  return date.toLocaleString();
}

function githubSecurityHref(project: any) {
  const candidates = [
    project?.repositoryUrl,
    project?.gitRemoteUrl,
    project?.githubUrl,
    project?.metadata?.repositoryUrl,
    project?.metadata?.gitRemoteUrl,
  ].filter(Boolean);

  const remote = String(candidates[0] ?? '');
  const match = remote.match(/github\.com[:/](?<owner>[^/\s]+)\/(?<repo>[^/\s.]+)(?:\.git)?/i);

  if (!match?.groups) {
    return null;
  }

  return `https://github.com/${match.groups.owner}/${match.groups.repo}/security/code-scanning`;
}

function buildSecurityReport(project: any, state: any) {
  const vulnerabilities = Array.isArray(state?.vulnerabilities) ? state.vulnerabilities : [];
  const scans = Array.isArray(state?.scans) ? state.scans : [];

  return {
    project: {
      id: project?.id ?? 'unknown',
      name: project?.name ?? 'Workspace project',
    },
    generatedAt: new Date().toISOString(),
    latestScan: scans[0] ?? null,
    scans,
    vulnerabilities,
    counts: securityCountsFromVulnerabilities(vulnerabilities.filter((item: any) => !item.hidden)),
  };
}

function securityReportToSarif(report: any) {
  const vulnerabilities = Array.isArray(report.vulnerabilities) ? report.vulnerabilities : [];

  return {
    version: '2.1.0',
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    runs: [
      {
        tool: {
          driver: {
            name: 'E-Code Security Scanner',
            informationUri: 'https://github.com/openaxcloud/vibecore',
            rules: vulnerabilities.map((vulnerability: any) => ({
              id: vulnerability.id,
              name: vulnerability.title,
              shortDescription: { text: vulnerability.title },
              fullDescription: { text: vulnerability.details || vulnerability.recommendation || vulnerability.source },
              help: {
                text: vulnerability.recommendation || 'Review this finding and apply the recommended remediation.',
              },
              defaultConfiguration: { level: sarifLevel(vulnerability.severity) },
              properties: {
                source: vulnerability.source,
                packageName: vulnerability.packageName,
                status: vulnerability.status,
              },
            })),
          },
        },
        results: vulnerabilities
          .filter((vulnerability: any) => !vulnerability.hidden)
          .map((vulnerability: any) => ({
            ruleId: vulnerability.id,
            level: sarifLevel(vulnerability.severity),
            message: { text: vulnerability.details || vulnerability.title },
            locations: [
              {
                physicalLocation: {
                  artifactLocation: { uri: 'workspace' },
                },
              },
            ],
            properties: {
              recommendation: vulnerability.recommendation,
              source: vulnerability.source,
            },
          })),
        properties: {
          projectId: report.project.id,
          projectName: report.project.name,
          generatedAt: report.generatedAt,
        },
      },
    ],
  };
}

function sarifLevel(severity: string) {
  if (severity === 'critical' || severity === 'high') {
    return 'error';
  }

  if (severity === 'moderate') {
    return 'warning';
  }

  return 'note';
}

function downloadSecurityReport(format: 'json' | 'sarif', project: any, state: any) {
  const report = buildSecurityReport(project, state);
  const payload = format === 'sarif' ? securityReportToSarif(report) : report;
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  const projectSlug = String(report.project.name || report.project.id)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-');

  anchor.href = url;
  anchor.download = `${projectSlug || 'project'}-security-report.${format === 'sarif' ? 'sarif' : 'json'}`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(url);
}

function renderSecurityReportHtml(report: any) {
  const escape = (value: unknown) =>
    String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  const rows = (report.vulnerabilities ?? [])
    .map(
      (finding: any) => `
        <tr>
          <td>${escape(finding.severity)}</td>
          <td>${escape(finding.title)}</td>
          <td>${escape(finding.source)}</td>
          <td>${escape(finding.recommendation || finding.details)}</td>
        </tr>
      `,
    )
    .join('');

  return `<!doctype html>
    <html>
      <head>
        <title>Security report - ${escape(report.project.name)}</title>
        <style>
          body { font-family: ui-sans-serif, system-ui, sans-serif; color: #0f172a; margin: 32px; }
          h1 { margin: 0 0 8px; }
          p { color: #475569; }
          table { width: 100%; border-collapse: collapse; margin-top: 24px; }
          th, td { border: 1px solid #cbd5e1; padding: 10px; text-align: left; vertical-align: top; }
          th { background: #f8fafc; }
        </style>
      </head>
      <body>
        <h1>Security report</h1>
        <p>${escape(report.project.name)} - generated ${escape(formatSecurityDate(report.generatedAt))}</p>
        <table>
          <thead><tr><th>Severity</th><th>Finding</th><th>Source</th><th>Recommendation</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="4">No findings recorded.</td></tr>'}</tbody>
        </table>
      </body>
    </html>`;
}

function ProjectDebuggerPanel({
  data,
  onSubmit,
  busy,
  reload,
}: {
  data: any;
  onSubmit: any;
  busy: boolean;
  reload?: () => void | Promise<void>;
}) {
  const state = data.debuggerState ?? {};
  const launchConfigs = state.launchConfigs ?? [];
  const breakpoints = state.breakpoints ?? [];
  const watches = state.watches ?? [];
  const sessions = state.sessions ?? [];
  const activeSession = sessions.find((session: any) => session.status === 'paused') ?? sessions[0];
  const processes = data.runtimeProcesses?.processes ?? data.runtimeProcesses ?? [];
  const logs = data.runtimeLogs?.logs ?? [];

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[
          ['Launch configs', launchConfigs.length],
          ['Breakpoints', breakpoints.filter((breakpoint: any) => breakpoint.enabled !== false).length],
          ['Watch expressions', watches.filter((watch: any) => watch.enabled !== false).length],
          ['Runtime processes', Array.isArray(processes) ? processes.length : 0],
        ].map(([label, value]) => (
          <div
            key={label}
            className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-3"
          >
            <div className="text-[11px] uppercase tracking-wide text-bolt-elements-textSecondary">{label}</div>
            <div className="mt-1 text-sm font-semibold text-bolt-elements-textPrimary">{value}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="grid gap-4">
          <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-bolt-elements-textPrimary">Debug sessions</h3>
                <p className="text-xs text-bolt-elements-textSecondary">
                  Launches run in the real workspace runtime. Paused frames, variables and stepping appear when the
                  configured adapter reports a paused state.
                </p>
              </div>
              <button
                type="button"
                className="rounded border border-bolt-elements-borderColor px-2 py-1 text-xs text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary"
                onClick={() => void reload?.()}
                disabled={busy}
              >
                Refresh runtime
              </button>
            </div>
            <div className="grid gap-2">
              {sessions.length ? (
                sessions.map((session: any) => (
                  <div
                    key={session.id}
                    className="rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-bolt-elements-textPrimary">
                          {session.name}
                        </div>
                        <div className="mt-1 truncate font-mono text-xs text-bolt-elements-textSecondary">
                          {session.command}
                        </div>
                      </div>
                      <span className="rounded bg-bolt-elements-background-depth-3 px-2 py-0.5 text-xs text-bolt-elements-textSecondary">
                        {session.status}
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {['continue', 'step-over', 'step-into', 'step-out'].map((action) => (
                        <button
                          key={action}
                          type="button"
                          disabled={session.status !== 'paused'}
                          className="h-8 rounded border border-bolt-elements-borderColor px-2 text-xs text-bolt-elements-textSecondary disabled:opacity-50"
                          title="Stepping is enabled when a debug adapter reports a paused frame."
                        >
                          {action.replace('-', ' ')}
                        </button>
                      ))}
                      {session.status === 'running' && (
                        <form onSubmit={onSubmit}>
                          <input name="intent" value="stop-session" type="hidden" />
                          <input name="sessionId" value={session.id} type="hidden" />
                          <PanelButton disabled={busy} variant="outline">
                            Stop
                          </PanelButton>
                        </form>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-sm text-bolt-elements-textSecondary">No debug session has been launched yet.</div>
              )}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4">
              <h3 className="text-sm font-semibold text-bolt-elements-textPrimary">Breakpoints</h3>
              <div className="mt-3 grid gap-2">
                {breakpoints.length ? (
                  breakpoints.map((breakpoint: any) => (
                    <div
                      key={breakpoint.id}
                      className="rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate font-mono text-xs text-bolt-elements-textPrimary">
                            {breakpoint.filePath}:{breakpoint.line}
                          </div>
                          {breakpoint.condition || breakpoint.hitCondition || breakpoint.logMessage ? (
                            <div className="mt-1 text-xs text-bolt-elements-textSecondary">
                              {breakpoint.condition ? `if ${breakpoint.condition}` : null}
                              {breakpoint.hitCondition ? ` hit ${breakpoint.hitCondition}` : null}
                              {breakpoint.logMessage ? ` log ${breakpoint.logMessage}` : null}
                            </div>
                          ) : null}
                        </div>
                        <form onSubmit={onSubmit}>
                          <input name="intent" value="delete-breakpoint" type="hidden" />
                          <input name="breakpointId" value={breakpoint.id} type="hidden" />
                          <PanelButton disabled={busy} variant="outline">
                            Remove
                          </PanelButton>
                        </form>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-bolt-elements-textSecondary">No breakpoints configured.</div>
                )}
              </div>
            </section>

            <section className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4">
              <h3 className="text-sm font-semibold text-bolt-elements-textPrimary">Call stack and variables</h3>
              {activeSession?.status === 'paused' ? (
                <div className="mt-3 grid gap-2">
                  <PanelRows rows={activeSession.callStack ?? []} empty="No stack frames reported by adapter." />
                  <PanelRows rows={activeSession.variables ?? []} empty="No variables reported by adapter." />
                </div>
              ) : (
                <div className="mt-3 rounded-md border border-dashed border-bolt-elements-borderColor p-4 text-sm text-bolt-elements-textSecondary">
                  No paused frame. Start a launch configuration with inspector/debugpy and pause on a breakpoint to
                  populate stack frames, scopes and variables.
                </div>
              )}
            </section>
          </div>
        </section>

        <aside className="grid content-start gap-4">
          <form
            onSubmit={onSubmit}
            className="grid gap-3 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4"
          >
            <input name="intent" value="start-session" type="hidden" />
            <label className="grid gap-1 text-xs font-medium text-bolt-elements-textSecondary">
              Launch configuration
              <select
                name="configId"
                className="h-9 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-2 text-sm text-bolt-elements-textPrimary outline-none focus:border-bolt-elements-focus"
              >
                {launchConfigs.map((config: any) => (
                  <option key={config.id} value={config.id}>
                    {config.name}
                  </option>
                ))}
              </select>
            </label>
            <PanelButton disabled={busy || !launchConfigs.length}>Start debugging</PanelButton>
          </form>

          <form
            onSubmit={onSubmit}
            className="grid gap-3 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4"
          >
            <input name="intent" value="save-config" type="hidden" />
            <h3 className="text-sm font-semibold text-bolt-elements-textPrimary">launch.json config</h3>
            <PanelInput name="name" placeholder="Node inspector: app" required />
            <PanelInput name="command" placeholder="npm run dev" />
            <PanelInput name="program" placeholder="src/server.ts" />
            <PanelInput name="args" placeholder="--port 3000" />
            <PanelInput name="env" placeholder="DEBUG=app:*" />
            <label className="flex items-center gap-2 text-xs text-bolt-elements-textSecondary">
              <input name="stopOnEntry" value="true" type="checkbox" />
              Stop on entry
            </label>
            <PanelButton disabled={busy}>Save config</PanelButton>
          </form>

          <form
            onSubmit={onSubmit}
            className="grid gap-3 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4"
          >
            <input name="intent" value="add-breakpoint" type="hidden" />
            <h3 className="text-sm font-semibold text-bolt-elements-textPrimary">Conditional breakpoint</h3>
            <PanelInput name="filePath" placeholder="src/App.tsx" required />
            <PanelInput name="line" type="number" min="1" placeholder="42" required />
            <PanelInput name="condition" placeholder="user.id === targetId" />
            <PanelInput name="hitCondition" placeholder=">= 5" />
            <PanelInput name="logMessage" placeholder="user={user.id}" />
            <PanelButton disabled={busy}>Add breakpoint</PanelButton>
          </form>

          <form
            onSubmit={onSubmit}
            className="grid gap-3 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4"
          >
            <input name="intent" value="add-watch" type="hidden" />
            <h3 className="text-sm font-semibold text-bolt-elements-textPrimary">Watch expressions</h3>
            <PanelInput name="expression" placeholder="request.user" required />
            <PanelButton disabled={busy}>Add watch</PanelButton>
          </form>

          {watches.length ? (
            <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4">
              <h3 className="text-sm font-semibold text-bolt-elements-textPrimary">Watch list</h3>
              <div className="mt-3 grid gap-2">
                {watches.map((watch: any) => (
                  <div key={watch.id} className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate font-mono text-bolt-elements-textPrimary">{watch.expression}</span>
                    <form onSubmit={onSubmit}>
                      <input name="intent" value="delete-watch" type="hidden" />
                      <input name="watchId" value={watch.id} type="hidden" />
                      <PanelButton disabled={busy} variant="outline">
                        Remove
                      </PanelButton>
                    </form>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {logs.length ? (
            <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4">
              <h3 className="text-sm font-semibold text-bolt-elements-textPrimary">Runtime output</h3>
              <div className="mt-3 max-h-44 overflow-auto font-mono text-xs text-bolt-elements-textSecondary">
                {logs.slice(-12).map((log: any, index: number) => (
                  <div key={`${log.timestamp}-${index}`}>{log.message}</div>
                ))}
              </div>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function ProjectLogsPanel({ data, reload, busy }: { data: any; reload?: () => void | Promise<void>; busy: boolean }) {
  const [cleared, setCleared] = useState(false);
  const [split, setSplit] = useState(false);
  const [activeStream, setActiveStream] = useState<'console' | 'workflow' | 'system'>('console');
  const [level, setLevel] = useState<'all' | 'info' | 'warn' | 'error'>('all');
  const [query, setQuery] = useState('');
  const [regexEnabled, setRegexEnabled] = useState(false);
  const [liveTail, setLiveTail] = useState(true);
  const runtimePorts = runtimePortsFromPayload(data.runtimePorts);
  const workspace = runtimeWorkspaceFromPanelData(data);

  const workspaceStatus = runtimeStatusText({
    workspaceStatus: workspace,
    ports: runtimePorts,
    workspaceLoading: Boolean(workspace && !workspace.status),
    workspaceError: workspace?.error,
  }).replace(/^Runtime:\s*/, '');

  const runtimeLogs = Array.isArray(data.runtimeLogs?.logs) ? data.runtimeLogs.logs : [];

  const deploymentLogs = (data.deployments ?? []).flatMap((deployment: any) =>
    (deployment.logs ?? []).map((log: any) => ({
      level: log.level ?? classifyLogLevel(log.message ?? ''),
      message: log.message ?? '',
      source: 'workflow',
      timestamp: log.timestamp ?? deployment.createdAt,
      context: deployment.provider ? `${deployment.provider}:${deployment.environment ?? 'preview'}` : 'deployment',
    })),
  );

  const systemEvents = buildSystemLogEvents(data);
  const logs = cleared ? [] : [...runtimeLogs, ...deploymentLogs, ...systemEvents];
  const activeStreamLogs = logs.filter((entry: any) => entry.source === activeStream);
  const filtersActive = level !== 'all' || query.trim().length > 0;

  /*
   * Chip counts are derived from the query-filtered stream with the level
   * filter excluded, so every chip always shows exactly how many lines it
   * would reveal when selected.
   */
  const queryFilteredLogs = filterLogEntries(activeStreamLogs, 'all', query, regexEnabled);

  const levelCounts = queryFilteredLogs.reduce(
    (counts: Record<'info' | 'warn' | 'error', number>, entry: any) => {
      counts[normalizeLogEntryLevel(entry)] += 1;

      return counts;
    },
    { info: 0, warn: 0, error: 0 },
  );

  const filteredLogs =
    level === 'all'
      ? queryFilteredLogs
      : queryFilteredLogs.filter((entry: any) => normalizeLogEntryLevel(entry) === level);

  const activeStreamEmptyMessage = cleared
    ? 'Visible logs were cleared for this session. Reload to fetch the latest runtime output.'
    : activeStreamLogs.length === 0
      ? `No ${activeStream} logs yet. Start the workspace or run a command to stream output here.`
      : filtersActive
        ? `No ${activeStream} log results for this filter.`
        : `No ${activeStream} logs are visible right now.`;

  const secondaryLogs = split
    ? filterLogEntries(
        logs.filter((entry: any) => entry.source !== activeStream),
        level,
        query,
        regexEnabled,
      )
    : [];

  useEffect(() => {
    if (!liveTail || !reload) {
      return undefined;
    }

    const interval = window.setInterval(() => {
      void reload();
    }, 5000);

    return () => window.clearInterval(interval);
  }, [liveTail, reload]);

  const downloadLogs = () => {
    const payload = filteredLogs
      .map((entry: any) => `${entry.timestamp ?? new Date().toISOString()} [${entry.level}] ${entry.message}`)
      .join('\n');

    const blob = new Blob([payload || activeStreamEmptyMessage], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');

    anchor.href = url;
    anchor.download = `logs-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className={classNames('bolt-project-console-tool', split && 'bolt-project-console-tool-split')}>
      <div className="bolt-project-console-header">
        {[
          ['console', 'Console'],
          ['workflow', 'Workflow logs'],
          ['system', 'System logs'],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={activeStream === id}
            aria-label={`Show ${label}`}
            onClick={() => setActiveStream(id as any)}
          >
            {label}
          </button>
        ))}
        <span className="bolt-project-console-status" title={`Workspace ${workspaceStatus}`}>
          {workspaceStatus}
        </span>
        <div className="bolt-project-console-level-chips" role="group" aria-label="Filter logs by level">
          {(
            [
              ['all', 'All', queryFilteredLogs.length],
              ['info', 'Info', levelCounts.info],
              ['warn', 'Warn', levelCounts.warn],
              ['error', 'Error', levelCounts.error],
            ] as const
          ).map(([id, label, count]) => (
            <button
              key={id}
              type="button"
              data-level={id}
              aria-pressed={level === id}
              aria-label={`Show ${label.toLowerCase()} logs. ${count} line${count === 1 ? '' : 's'}.`}
              onClick={() => setLevel(id)}
            >
              {label}
              <span className="bolt-project-console-level-count">{count}</span>
            </button>
          ))}
        </div>
        <input
          aria-label="Search logs"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={regexEnabled ? 'Regex search' : 'Search logs'}
        />
        <button
          type="button"
          aria-pressed={regexEnabled}
          aria-label="Toggle regex search"
          onClick={() => setRegexEnabled((value) => !value)}
        >
          Regex
        </button>
        <button type="button" aria-label="Clear visible logs" onClick={() => setCleared(true)}>
          Clear logs
        </button>
        <button type="button" aria-label="Toggle split log view" onClick={() => setSplit((value) => !value)}>
          {split ? 'Close split' : 'Split view'}
        </button>
        <button type="button" aria-label="Export currently filtered logs as a .txt file" onClick={downloadLogs}>
          Export .txt
        </button>
        <button
          type="button"
          aria-pressed={liveTail}
          aria-label="Toggle live tail"
          onClick={() => setLiveTail((value) => !value)}
        >
          {liveTail ? 'Live tail on' : 'Live tail off'}
        </button>
        <button type="button" aria-label="Reload logs from backend" onClick={() => void reload?.()} disabled={busy}>
          {busy ? 'Refreshing' : 'Reload'}
        </button>
      </div>
      <LogStreamView logs={filteredLogs} empty={activeStreamEmptyMessage} />
      {split && (
        <LogStreamView
          logs={secondaryLogs}
          empty={
            filtersActive
              ? 'No secondary stream log results for this filter.'
              : 'No secondary stream logs yet. Start the workspace or run a command to stream output here.'
          }
        />
      )}
    </div>
  );
}

/*
 * How close (px) to the bottom edge still counts as "at the bottom" for follow
 * mode. Scrolling further up than this hands control back to the user.
 */
const LOG_FOLLOW_BOTTOM_THRESHOLD_PX = 32;

function LogStreamView({ logs, empty }: { logs: any[]; empty: string }) {
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const [follow, setFollow] = useState(true);

  // While follow mode is on, keep the view pinned to the newest line.
  useEffect(() => {
    const node = bodyRef.current;

    if (follow && node) {
      node.scrollTop = node.scrollHeight;
    }
  }, [follow, logs]);

  /*
   * Scrolling away from the bottom switches follow off automatically;
   * scrolling back down to the bottom re-arms it. The programmatic pin above
   * always lands at distance 0, so it never disables its own follow mode.
   */
  const handleScroll = () => {
    const node = bodyRef.current;

    if (!node) {
      return;
    }

    const distanceFromBottom = node.scrollHeight - node.scrollTop - node.clientHeight;

    setFollow(distanceFromBottom <= LOG_FOLLOW_BOTTOM_THRESHOLD_PX);
  };

  const resumeFollow = () => {
    const node = bodyRef.current;

    if (node) {
      node.scrollTop = node.scrollHeight;
    }

    setFollow(true);
  };

  return (
    <div className="bolt-project-console-stream">
      <div ref={bodyRef} className="bolt-project-console-body" role="log" aria-live="polite" onScroll={handleScroll}>
        {logs.length ? (
          logs.map((entry: any, index: number) => (
            <div
              key={`${entry.timestamp ?? 'log'}-${index}`}
              className="bolt-project-log-line"
              data-level={entry.level}
            >
              <span>{formatLogTime(entry.timestamp)}</span>
              <strong>{entry.level ?? 'info'}</strong>
              {entry.context ? <em>{entry.context}</em> : null}
              <code>{entry.message}</code>
            </div>
          ))
        ) : (
          <div className="bolt-project-console-empty">{empty}</div>
        )}
      </div>
      {!follow && logs.length > 0 ? (
        <button
          type="button"
          className="bolt-project-console-follow"
          aria-label="Resume follow mode and jump to the newest log line"
          onClick={resumeFollow}
        >
          <span className="i-ph:arrow-line-down" aria-hidden />
          Follow
        </button>
      ) : null}
    </div>
  );
}

function buildSystemLogEvents(data: any) {
  const workspace = data.workspace ?? data.runtimeStatus;
  const processes = Array.isArray(data.runtimeProcesses) ? data.runtimeProcesses : [];
  const ports = Array.isArray(data.runtimePorts) ? data.runtimePorts : [];
  const activity = (data.recentActivity ?? []).filter((event: any) => event.action !== 'project.ide_state.save');

  const ideStateSaveCount = (data.recentActivity ?? []).filter(
    (event: any) => event.action === 'project.ide_state.save',
  ).length;

  const base = [
    {
      level: workspace?.status === 'failed' ? 'error' : 'info',
      source: 'system',
      message: workspace
        ? `Workspace ${workspace.id ?? data.workspaceId} is ${workspace.status ?? 'unknown'} (${workspace.runtimeMode ?? 'runtime'})`
        : `Workspace ${data.workspaceId ?? 'unknown'} has no dashboard record; using runtime snapshot`,
      timestamp: new Date().toISOString(),
      context: 'workspace',
    },
    {
      level: 'info',
      source: 'system',
      message: `${processes.length} running process${processes.length === 1 ? '' : 'es'}, ${ports.length} detected port${
        ports.length === 1 ? '' : 's'
      }`,
      timestamp: new Date().toISOString(),
      context: 'runtime',
    },
  ];

  if (ideStateSaveCount > 0) {
    base.push({
      level: 'warn',
      source: 'system',
      message: `${ideStateSaveCount} ide_state.save event${ideStateSaveCount === 1 ? '' : 's'} collapsed to keep logs readable`,
      timestamp: new Date().toISOString(),
      context: 'audit',
    });
  }

  return [
    ...base,
    ...activity.slice(0, 80).map((event: any) => ({
      level: classifyLogLevel(event.action ?? ''),
      source: 'system',
      message: event.action ?? 'project event',
      timestamp: event.createdAt,
      context: event.actorUserId ?? event.resourceType ?? 'activity',
    })),
  ];
}

/*
 * Log entries arrive from several producers (runtime snapshot, deployment
 * logs, synthesized system events); most carry a structured `level`, but the
 * value space is not guaranteed. Normalize to the panel's three levels,
 * falling back to message classification when the field is missing.
 */
function normalizeLogEntryLevel(entry: any): 'info' | 'warn' | 'error' {
  const raw = typeof entry?.level === 'string' ? entry.level.toLowerCase() : '';

  if (raw === 'error' || raw === 'fatal') {
    return 'error';
  }

  if (raw === 'warn' || raw === 'warning') {
    return 'warn';
  }

  if (raw === 'info' || raw === 'debug' || raw === 'log' || raw === 'notice') {
    return 'info';
  }

  return classifyLogLevel(String(entry?.message ?? ''));
}

function filterLogEntries(logs: any[], level: string, query: string, regexEnabled: boolean) {
  const trimmed = query.trim();

  return logs.filter((entry: any) => {
    if (level !== 'all' && normalizeLogEntryLevel(entry) !== level) {
      return false;
    }

    if (!trimmed) {
      return true;
    }

    const haystack = `${entry.message ?? ''} ${entry.context ?? ''}`;

    if (regexEnabled) {
      try {
        return new RegExp(trimmed, 'i').test(haystack);
      } catch {
        return false;
      }
    }

    return haystack.toLowerCase().includes(trimmed.toLowerCase());
  });
}

function classifyLogLevel(line: string) {
  if (/\b(error|failed|exception|traceback|panic|fatal)\b/i.test(line)) {
    return 'error';
  }

  if (/\b(warn|warning|deprecated|retry)\b/i.test(line)) {
    return 'warn';
  }

  return 'info';
}

function formatLogTime(value?: string) {
  const date = value ? new Date(value) : new Date();

  if (Number.isNaN(date.getTime())) {
    return '--:--:--';
  }

  return date.toLocaleTimeString();
}

function ProjectSecretsPanel({
  projectId,
  data,
  onSubmit,
  busy,
  reload,
}: {
  projectId?: string;
  data: any;
  onSubmit: any;
  busy: boolean;
  reload?: () => void | Promise<void>;
}) {
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [editingKey, setEditingKey] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{ done: number; total: number } | null>(null);
  const [importFailures, setImportFailures] = useState<Array<{ key: string; error: string }>>([]);
  const secrets = data.secrets ?? [];

  // Live preview of the pasted .env block: parsed entries + honestly-reported skipped lines.
  const importPreview = useMemo(() => parseDotEnv(importText), [importText]);
  const existingSecretKeys = useMemo(() => new Set<string>(secrets.map((secret: any) => secret.key)), [secrets]);
  const overwriteCount = importPreview.entries.filter((entry) => existingSecretKeys.has(entry.key)).length;

  // Fetch a secret's real value (reveal endpoint); shared by copy-value + reveal.
  async function fetchSecretValue(key: string): Promise<string | undefined> {
    if (!projectId) {
      return undefined;
    }

    const response = await fetch(
      `/api/projects/${encodeURIComponent(projectId)}/ide-panel/secrets?reveal=true&confirm=1&key=${encodeURIComponent(
        key,
      )}`,
      { headers: { accept: 'application/json' } },
    );

    const result = (await response.json().catch(() => null)) as any;

    return response.ok && typeof result?.data?.secret?.value === 'string' ? result.data.secret.value : undefined;
  }

  /*
   * Replit-style bulk .env import: the pasted block is parsed live into the
   * preview table; confirming upserts each entry sequentially via the existing
   * secrets intent (real per-project secrets API), surfacing per-key failures
   * and progress, then refreshes the list.
   */
  async function handleImport() {
    if (!projectId) {
      return;
    }

    const { entries } = importPreview;

    if (!entries.length) {
      setMessage('No KEY=value lines found to import.');
      return;
    }

    setImporting(true);
    setImportProgress({ done: 0, total: entries.length });
    setImportFailures([]);

    const failures: Array<{ key: string; error: string }> = [];

    try {
      for (const [index, { key, value }] of entries.entries()) {
        const form = new FormData();
        form.append('intent', 'upsert');
        form.append('key', key);
        form.append('value', value);

        try {
          const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/ide-panel/secrets`, {
            method: 'POST',
            body: form,
          });

          if (!response.ok) {
            const result = (await response.json().catch(() => null)) as any;
            failures.push({ key, error: String(result?.error ?? `HTTP ${response.status}`) });
          }
        } catch (error) {
          failures.push({ key, error: error instanceof Error ? error.message : 'Network error' });
        }

        setImportProgress({ done: index + 1, total: entries.length });
      }

      const ok = entries.length - failures.length;

      if (failures.length) {
        // Keep the section open so the user can see and retry what failed.
        setImportFailures(failures);
        setMessage(
          `Imported ${ok}/${entries.length} secret${entries.length === 1 ? '' : 's'} — ${failures.length} failed.`,
        );
      } else {
        setMessage(`Imported ${ok}/${entries.length} secret${entries.length === 1 ? '' : 's'} from .env.`);
        setImportText('');
        setImportOpen(false);
      }

      await reload?.();
    } finally {
      setImporting(false);
      setImportProgress(null);
    }
  }

  async function copySecretValue(key: string) {
    const value = revealed[key] ?? (await fetchSecretValue(key));

    if (typeof value !== 'string') {
      setMessage(`Unable to reveal ${key}.`);
      return;
    }

    try {
      await navigator.clipboard?.writeText(value);
      setMessage(`${key} value copied.`);
    } catch {
      setMessage(`Unable to copy ${key} to clipboard.`);
    }
  }

  function revealSecret(key: string) {
    if (!projectId) {
      return;
    }

    if (revealed[key]) {
      setRevealed((current) => {
        const next = { ...current };
        delete next[key];

        return next;
      });
      return;
    }

    /*
     * Reveal in place immediately, like a password field's eye toggle — no
     * blocking confirmation dialog. The value is still fetched only on reveal
     * (never listed by default) and only kept for this browser session; the
     * "revealed for this session" notice is surfaced non-blockingly as a toast.
     */
    void performRevealSecret(key);
  }

  async function performRevealSecret(key: string) {
    if (!projectId) {
      return;
    }

    const response = await fetch(
      `/api/projects/${encodeURIComponent(projectId)}/ide-panel/secrets?reveal=true&confirm=1&key=${encodeURIComponent(
        key,
      )}`,
      { headers: { accept: 'application/json' } },
    );

    const result = (await response.json().catch(() => null)) as any;
    const value = response.ok ? result?.data?.secret?.value : undefined;

    if (typeof value === 'string') {
      setRevealed((current) => ({ ...current, [key]: value }));
      setMessage(`${key} revealed for this session.`);
    } else {
      setMessage(`Unable to reveal ${key}.`);
    }
  }

  async function copySecret(key: string) {
    const value = revealed[key] ?? key;

    try {
      await navigator.clipboard?.writeText(value);
      setMessage(`${revealed[key] ? 'Secret value' : 'Secret key'} copied.`);
    } catch {
      setMessage(`Unable to copy ${key} to clipboard.`);
    }
  }

  return (
    <div className="bolt-project-secrets-tool">
      <form onSubmit={onSubmit} className="bolt-project-inline-form">
        <input name="intent" value="upsert" type="hidden" />
        {/*
         * `key` forces the uncontrolled inputs to remount whenever the user
         * clicks "Edit" (which sets editingKey). Without it, defaultValue is only
         * read on first mount, so clicking Edit changed the button label to
         * "Update secret" but never populated the key field — forcing the user to
         * retype the key from scratch.
         */}
        <PanelInput
          key={`secret-key-${editingKey}`}
          name="key"
          placeholder="STRIPE_SECRET_KEY"
          required
          defaultValue={editingKey}
        />
        <PanelInput
          key={`secret-value-${editingKey}`}
          name="value"
          placeholder="Secret value"
          type="password"
          required
        />
        <PanelButton disabled={busy}>{editingKey ? 'Update secret' : '+ New secret'}</PanelButton>
        <PanelButton
          type="button"
          variant="outline"
          onClick={() => {
            setImportOpen((open) => !open);
            setImportFailures([]);
          }}
        >
          Import .env
        </PanelButton>
      </form>

      {importOpen ? (
        <div className="grid gap-2 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-3">
          <label className="grid gap-1 text-xs text-bolt-elements-textSecondary">
            Paste a .env file — one <span className="font-mono">KEY=value</span> per line (comments and blank lines are
            ignored)
            <textarea
              value={importText}
              onChange={(event) => {
                setImportText(event.target.value);
                setImportFailures([]);
              }}
              placeholder={'DATABASE_URL=postgres://…\nSTRIPE_SECRET_KEY=sk_live_…'}
              spellCheck={false}
              style={{ fontFamily: 'var(--vc-font-code)' }}
              className="min-h-28 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-2 text-xs text-bolt-elements-textPrimary outline-none focus:border-bolt-elements-focus"
            />
          </label>

          {importPreview.entries.length ? (
            <div className="grid gap-1">
              <span className="text-xs text-bolt-elements-textSecondary">
                {importPreview.entries.length} secret{importPreview.entries.length === 1 ? '' : 's'} to import
                {overwriteCount
                  ? ` — ${overwriteCount} overwrite${overwriteCount === 1 ? 's' : ''} existing value${overwriteCount === 1 ? '' : 's'}`
                  : ''}
              </span>
              <div className="grid gap-1 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-2">
                {importPreview.entries.map((entry) => (
                  <div key={entry.key} className="flex items-center gap-2 text-xs">
                    <span
                      className="font-medium text-bolt-elements-textPrimary"
                      style={{ fontFamily: 'var(--vc-font-code)' }}
                    >
                      {entry.key}
                    </span>
                    <span className="text-bolt-elements-textTertiary" aria-label="Value hidden">
                      •••
                    </span>
                    {existingSecretKeys.has(entry.key) ? (
                      <span
                        className="rounded-sm px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide"
                        style={{
                          background: 'color-mix(in srgb, var(--vc-ide-accent-warning) 12%, transparent)',
                          borderLeft: '3px solid var(--vc-ide-accent-warning)',
                          color: 'var(--vc-ide-accent-warning)',
                        }}
                      >
                        overwrites existing
                      </span>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {importPreview.skipped.length ? (
            <div
              className="grid gap-1 rounded-md p-2 text-xs"
              style={{
                background: 'color-mix(in srgb, var(--vc-ide-accent-warning) 12%, transparent)',
                borderLeft: '3px solid var(--vc-ide-accent-warning)',
              }}
            >
              <span className="font-medium" style={{ color: 'var(--vc-ide-accent-warning)' }}>
                {importPreview.skipped.length} line{importPreview.skipped.length === 1 ? '' : 's'} will be skipped
              </span>
              {importPreview.skipped.map((skippedLine) => (
                <span key={skippedLine.line} className="text-bolt-elements-textSecondary">
                  Line {skippedLine.line} ({describeSkipReason(skippedLine.reason)}):{' '}
                  <span style={{ fontFamily: 'var(--vc-font-code)' }}>{skippedLine.text}</span>
                </span>
              ))}
            </div>
          ) : null}

          {importFailures.length ? (
            <div className="grid gap-1 text-xs text-bolt-elements-icon-error">
              {importFailures.map((failure) => (
                <span key={failure.key}>
                  <span style={{ fontFamily: 'var(--vc-font-code)' }}>{failure.key}</span>: {failure.error}
                </span>
              ))}
            </div>
          ) : null}

          <div className="flex items-center gap-2">
            <PanelButton
              type="button"
              onClick={() => void handleImport()}
              disabled={importing || !importPreview.entries.length}
            >
              {importing && importProgress
                ? `Importing ${importProgress.done}/${importProgress.total}…`
                : importPreview.entries.length
                  ? `Import ${importPreview.entries.length} secret${importPreview.entries.length === 1 ? '' : 's'}`
                  : 'Import secrets'}
            </PanelButton>
            <PanelButton type="button" variant="outline" onClick={() => setImportOpen(false)} disabled={importing}>
              Cancel
            </PanelButton>
          </div>
        </div>
      ) : null}

      {message && <div className="bolt-project-empty-panel">{message}</div>}
      <div className="bolt-project-secret-list">
        {secrets.length ? (
          secrets.map((secret: any) => (
            <div key={secret.key} className="bolt-project-secret-row">
              <strong>{secret.key}</strong>
              <span>{revealed[secret.key] ?? '••••••'}</span>
              <button type="button" aria-label={`Reveal ${secret.key}`} onClick={() => revealSecret(secret.key)}>
                {revealed[secret.key] ? 'Hide' : 'Reveal'}
              </button>
              <button type="button" aria-label={`Copy ${secret.key} name`} onClick={() => void copySecret(secret.key)}>
                Copy
              </button>
              <button
                type="button"
                aria-label={`Copy ${secret.key} value`}
                onClick={() => void copySecretValue(secret.key)}
              >
                Copy value
              </button>
              <button type="button" aria-label={`Edit ${secret.key}`} onClick={() => setEditingKey(secret.key)}>
                Edit
              </button>
              <form onSubmit={onSubmit}>
                <input name="intent" value="delete" type="hidden" />
                <input name="key" value={secret.key} type="hidden" />
                <PanelButton disabled={busy} variant="outline">
                  Delete
                </PanelButton>
              </form>
            </div>
          ))
        ) : (
          <div className="bolt-project-empty-panel">No project secrets.</div>
        )}
      </div>
    </div>
  );
}

/*
 * Deployments panel — Replit-parity tabs (Overview / Logs / Domains / Manage)
 * over the existing deployment data + actions (no backend change). Overview is
 * the at-a-glance status + URLs, Logs streams each deployment's build/runtime
 * log, Domains lists the URLs/custom domains a deploy produced (full DNS lives
 * in the dedicated Domains panel), and Manage holds the lifecycle actions
 * (redeploy / rollback / cancel) plus the create-deployment wizard.
 */
// Map a stored deployment provider id to its display label (real data, no mock).
function formatDeployProvider(provider: string): string {
  return BOLT_DEPLOY_PROVIDERS.find((entry) => entry.id === provider)?.name ?? provider;
}

function ProjectDeploymentsPanel({
  data,
  project,
  projectId,
  onSubmit,
  busy,
}: {
  data: any;
  project: any;
  projectId?: string;
  onSubmit: any;
  busy: boolean;
}) {
  const deployments = data.deployments ?? [];
  const latestDeployment = deployments[0];
  const workspaceId = data.selectedWorkspaceId ?? data.workspaceId ?? data.workspace?.id ?? '';

  const inferredFramework = detectFrameworkFromDeployConfig({
    buildCommand: latestDeployment?.buildCommand,
    outputDirectory: latestDeployment?.outputDirectory,
  });

  const [tab, setTab] = useState<'overview' | 'logs' | 'domains' | 'manage'>('overview');

  // Real Overview data wired from the deployments loader.
  const connections = Array.isArray((data as any).connections) ? (data as any).connections : [];
  const gitCommits = Array.isArray((data as any).gitCommits) ? (data as any).gitCommits : [];

  return (
    <div className="bolt-project-deploy-tool">
      <div className="bolt-project-tool-tabs">
        {(
          [
            ['overview', 'Overview'],
            ['logs', 'Logs'],
            ['domains', 'Domains'],
            ['manage', 'Manage'],
          ] as const
        ).map(([id, label]) => (
          <button key={id} type="button" aria-current={tab === id ? 'page' : undefined} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'overview' ? (
        <section className="bolt-project-deploy-history">
          <div className="bolt-project-deploy-summary">
            <div>
              <span>Latest status</span>
              <strong>{latestDeployment?.status ?? 'No deployment'}</strong>
            </div>
            <div>
              <span>Environment</span>
              <strong>{latestDeployment?.environment ?? 'preview'}</strong>
            </div>
            <div>
              <span>Framework</span>
              <strong>{latestDeployment?.framework ?? inferredFramework}</strong>
            </div>
          </div>

          {/*
           * Replit Overview widgets. Real values where the backend has them
           * (Type = provider, Database = live project connections); a graceful
           * "—" only where the data genuinely does not exist (we run no
           * Autoscale compute tier, so vCPU/memory resources and compute usage
           * have no backend). Never mocked.
           */}
          <div className="bolt-project-deploy-summary">
            <div>
              <span>Type</span>
              <strong>{latestDeployment?.provider ? formatDeployProvider(latestDeployment.provider) : '—'}</strong>
            </div>
            <div>
              <span>Resources</span>
              <strong title="vCPU / memory — no Autoscale compute backend">—</strong>
            </div>
            <div>
              <span>Usage</span>
              <strong title="Compute usage this billing period — no metering backend">—</strong>
            </div>
            <div>
              <span>Database</span>
              <strong>{connections.length ? `Connected · ${connections.length}` : 'Not connected'}</strong>
            </div>
          </div>

          {deployments.length ? (
            deployments.map((deployment: any) => (
              <article key={deployment.id} className="bolt-project-deploy-card">
                <header>
                  <div>
                    <strong>
                      {deployment.provider} · {deployment.environment ?? 'preview'}
                    </strong>
                    <span>{deployment.url ?? deployment.customDomain ?? deployment.createdAt ?? 'URL pending'}</span>
                  </div>
                  <em data-status={deployment.status}>{deployment.status}</em>
                </header>
                {deployment.url ? (
                  <div className="bolt-project-deploy-actions">
                    <a href={deployment.url} target="_blank" rel="noreferrer">
                      Open
                    </a>
                    <button
                      type="button"
                      onClick={() => void navigator.clipboard?.writeText(deployment.url).catch(() => {})}
                    >
                      Copy link
                    </button>
                  </div>
                ) : null}
              </article>
            ))
          ) : (
            <EmptyState
              variant="compact"
              icon="i-ph:rocket-launch"
              title="No deployments yet"
              description="Ship this project to a live URL from the Manage tab."
              actionLabel="Go to Manage"
              onAction={() => setTab('manage')}
            />
          )}

          {/* Real commit history (hash + author + date) from the git graph. */}
          <div className="grid gap-1">
            <span className="text-[11px] uppercase tracking-wide text-bolt-elements-textSecondary">Commit history</span>
            {gitCommits.length ? (
              gitCommits.slice(0, 8).map((commit: any) => (
                <div
                  key={commit.sha}
                  className="flex items-center justify-between gap-2 rounded-md border border-bolt-elements-borderColor px-2 py-1 text-xs"
                >
                  <div className="min-w-0">
                    <span className="font-mono text-bolt-elements-textPrimary">
                      {commit.shortSha ?? commit.sha?.slice(0, 7)}
                    </span>
                    <span className="ml-2 truncate text-bolt-elements-textSecondary">{commit.message}</span>
                  </div>
                  <span className="shrink-0 text-bolt-elements-textTertiary">
                    {commit.author}
                    {commit.date ? ` · ${new Date(commit.date).toLocaleDateString()}` : ''}
                  </span>
                </div>
              ))
            ) : (
              <span className="text-xs text-bolt-elements-textTertiary">No commits in this workspace yet.</span>
            )}
          </div>
        </section>
      ) : null}

      {tab === 'logs' ? (
        <section className="bolt-project-deploy-history">
          {deployments.length ? (
            deployments.map((deployment: any) => (
              <article key={deployment.id} className="bolt-project-deploy-card">
                <header>
                  <div>
                    <strong>
                      {deployment.provider} · {deployment.environment ?? 'preview'}
                    </strong>
                    <span>{deployment.url ?? deployment.createdAt ?? ''}</span>
                  </div>
                  <em data-status={deployment.status}>{deployment.status}</em>
                </header>
                <pre aria-label={`Deployment logs for ${deployment.id}`}>
                  {(deployment.logs ?? []).map((log: any) => `[${log.level ?? 'info'}] ${log.message}`).join('\n') ||
                    'No deployment logs yet.'}
                </pre>
              </article>
            ))
          ) : (
            <div className="bolt-project-empty-panel">No deployment logs yet.</div>
          )}
        </section>
      ) : null}

      {/*
       * Real domains management, consolidated under Deploy (Replit parity): the
       * full ProjectDomainsPanel self-fetches + submits against /orgs/:id/domains
       * (list / add custom domain / DNS verify / delete). The standalone Domains
       * panel is removed from the Add-tab selector so this is the single place.
       */}
      {tab === 'domains' ? <ProjectDomainsPanel projectId={projectId} /> : null}

      {tab === 'manage' ? (
        <>
          {deployments.length ? (
            <section className="bolt-project-deploy-history">
              {deployments.map((deployment: any) => (
                <article key={deployment.id} className="bolt-project-deploy-card">
                  <header>
                    <div>
                      <strong>
                        {deployment.provider} · {deployment.environment ?? 'preview'}
                      </strong>
                      <span>{deployment.url ?? deployment.customDomain ?? deployment.createdAt ?? 'URL pending'}</span>
                    </div>
                    <em data-status={deployment.status}>{deployment.status}</em>
                  </header>
                  <div className="bolt-project-deploy-actions">
                    {deployment.url ? (
                      <a href={deployment.url} target="_blank" rel="noreferrer">
                        Open
                      </a>
                    ) : null}
                    <ProjectDeploymentAction
                      intent="redeploy"
                      deploymentId={deployment.id}
                      onSubmit={onSubmit}
                      busy={busy}
                    >
                      Redeploy
                    </ProjectDeploymentAction>
                    <ProjectDeploymentAction
                      intent="rollback"
                      deploymentId={deployment.id}
                      onSubmit={onSubmit}
                      busy={busy}
                    >
                      Rollback
                    </ProjectDeploymentAction>
                    <ProjectDeploymentAction
                      intent="cancel"
                      deploymentId={deployment.id}
                      onSubmit={onSubmit}
                      busy={busy}
                    >
                      Cancel
                    </ProjectDeploymentAction>
                  </div>
                </article>
              ))}
            </section>
          ) : null}

          <form onSubmit={onSubmit} className="bolt-project-deploy-wizard">
            {workspaceId ? <input type="hidden" name="workspaceId" value={workspaceId} /> : null}
            <h3>Deployment wizard</h3>
            <p>
              Uses the existing E-Code build defaults and records the SaaS deployment with quotas, audit logs and
              redacted output.
            </p>
            <label>
              Provider
              <select name="provider" defaultValue="static">
                {BOLT_DEPLOY_PROVIDERS.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Environment
              <select name="environment" defaultValue="preview">
                <option value="preview">Preview</option>
                <option value="staging">Staging</option>
                <option value="production">Production</option>
              </select>
            </label>
            <label title="Command executed before deployment to generate production assets.">
              <span>Build command</span>
              <PanelInput name="buildCommand" defaultValue={DEFAULT_DEPLOY_BUILD_COMMAND} aria-label="Build command" />
              <small>Example: npm run build, pnpm build, or yarn build.</small>
            </label>
            <label title="Directory containing the built static assets or server bundle to deploy.">
              <span>Output directory</span>
              <PanelInput
                name="outputDirectory"
                defaultValue={DEFAULT_DEPLOY_OUTPUT_DIRECTORY}
                aria-label="Output directory"
              />
              <small>For Vite this is usually dist.</small>
            </label>
            <label title="Detected framework used to choose provider defaults. Leave empty to keep auto-detection.">
              <span>Framework detected</span>
              <PanelInput name="framework" placeholder={`Auto: ${inferredFramework}`} aria-label="Framework detected" />
              <small>Leave blank to let E-Code infer the framework from package scripts and config files.</small>
            </label>
            <label title="Git branch or workspace branch used as the deployment source.">
              <span>Branch</span>
              <PanelInput
                name="branch"
                placeholder={project.gitDefaultBranch ?? 'main'}
                aria-label="Deployment branch"
              />
              <small>Defaults to the project branch when no branch is provided.</small>
            </label>
            <label title="Optional Git remote URL used by providers that deploy from a repository.">
              <span>Repository URL</span>
              <PanelInput
                name="repositoryUrl"
                defaultValue={project.gitRepositoryUrl ?? ''}
                aria-label="Repository URL"
              />
            </label>
            <label title="Optional domain to attach to the deployment after DNS verification.">
              <span>Custom domain</span>
              <PanelInput name="customDomain" aria-label="Custom domain" placeholder="app.example.com" />
            </label>
            <label title="Plain environment variables added for this deployment. Do not paste secrets here.">
              <span>Environment variables</span>
              <textarea
                name="envVars"
                placeholder={'KEY=value\nANOTHER_KEY=value'}
                aria-label="Environment variables"
              />
              <small>Use KEY=value pairs, one per line. Store sensitive values as secrets.</small>
            </label>
            <label title="Comma-separated names of existing project secrets to inject at deploy time.">
              <span>Secrets to inject</span>
              <PanelInput
                name="injectSecrets"
                placeholder="DATABASE_URL,STRIPE_SECRET_KEY"
                aria-label="Secrets to inject"
              />
            </label>
            <label className="bolt-project-checkbox-row">
              <input name="previewDeployment" type="checkbox" defaultChecked />
              Create preview URL for non-production deploys
            </label>
            <PanelButton disabled={busy}>Deploy project</PanelButton>
          </form>
        </>
      ) : null}
    </div>
  );
}

function ProjectDeploymentAction({
  intent,
  deploymentId,
  onSubmit,
  busy,
  children,
}: {
  intent: string;
  deploymentId: string;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  busy: boolean;
  children: React.ReactNode;
}) {
  return (
    <form onSubmit={onSubmit}>
      <input name="intent" value={intent} type="hidden" />
      <input name="deploymentId" value={deploymentId} type="hidden" />
      <PanelButton disabled={busy} variant="outline">
        {children}
      </PanelButton>
    </form>
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

function MobileAgentStartState({
  fileCount,
  selectedFileLabel,
  isRunning,
  suggestions,
  onSuggestion,
}: {
  fileCount: number;
  selectedFileLabel?: string;
  isRunning: boolean;
  suggestions: ProjectAgentSuggestion[];
  onSuggestion: (prompt: string) => void;
}) {
  const contextLabel = selectedFileLabel
    ? `Focused on ${selectedFileLabel}`
    : fileCount > 0
      ? `${fileCount} project files indexed`
      : 'Workspace context ready';

  return (
    <section className="bolt-mobile-agent-start-state" aria-label="Agent workspace context">
      <div className="bolt-mobile-agent-start-card">
        <header>
          <span className="bolt-mobile-agent-start-icon">
            <MobileReplitAgentIcon />
          </span>
          <span>
            <strong>{isRunning ? 'Working' : 'Agent ready'}</strong>
            <small>{contextLabel}</small>
          </span>
          <span className="bolt-mobile-agent-start-status" data-running={isRunning ? 'true' : 'false'}>
            {isRunning ? 'Live' : 'Idle'}
          </span>
        </header>
        <div className="bolt-mobile-agent-start-steps" aria-label="Workspace readiness">
          <div>
            <span className="i-ph:check-circle" aria-hidden />
            <span>Context loaded</span>
          </div>
          <div>
            <span className="i-ph:code" aria-hidden />
            <span>{fileCount > 0 ? `${fileCount} files` : 'Files ready'}</span>
          </div>
          <div>
            <span className="i-ph:monitor" aria-hidden />
            <span>Preview available</span>
          </div>
        </div>
      </div>

      {suggestions.length > 0 ? (
        <div className="bolt-mobile-agent-start-actions" aria-label="Agent quick actions">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion.id}
              type="button"
              title={`${suggestion.label}: ${suggestion.reason}`}
              onClick={() => onSuggestion(suggestion.prompt)}
            >
              <span className={suggestion.icon} aria-hidden />
              <span>{suggestion.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function MobileReplitAgentIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <circle cx="7" cy="7" r="3" />
      <circle cx="17" cy="7" r="3" />
      <circle cx="7" cy="17" r="3" />
      <circle cx="17" cy="17" r="3" />
    </svg>
  );
}

function panelTitle(panel: string) {
  const titles: Record<string, string> = {
    editor: 'Editor',
    preview: 'Webview',
    webview: 'Webview',
    console: 'Console',
    network: 'Network',
    database: 'Database',
    'object-storage': 'Object Storage',
    packages: 'Packages',
    monitoring: 'Monitoring',
    extensions: 'Extensions',
    integrations: 'Integrations',
    workflows: 'Workflows',
    debugger: 'Debugger',
    files: 'Library',
    search: 'Search',
    locks: 'Locks',
    overview: 'Overview',
    deployments: 'Deployments',
    security: 'Security',
    env: 'Environment variables',
    secrets: 'Secrets',
    git: 'Git',
    activity: 'Activity',
    terminal: SHELL_TERMINAL_LABEL,
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
    studio: 'i-ph:robot',
    editor: 'i-ph:code',
    preview: 'i-ph:browser',
    webview: 'i-ph:browser',
    console: 'i-ph:terminal-window',
    network: 'i-ph:activity',
    database: 'i-ph:database',
    'object-storage': 'i-ph:package',
    packages: 'i-ph:cube',
    monitoring: 'i-ph:chart-line',
    extensions: 'i-ph:puzzle-piece',
    integrations: 'i-ph:plugs-connected',
    workflows: 'i-ph:git-branch',
    debugger: 'i-ph:bug',
    files: 'i-ph:files',
    search: 'i-ph:magnifying-glass',
    locks: 'i-ph:lock',
    overview: 'i-ph:gauge',
    deployments: 'i-ph:rocket-launch',
    security: 'i-ph:shield-check',
    env: 'i-ph:brackets-curly',
    secrets: 'i-ph:lock',
    git: 'i-ph:git-branch',
    activity: 'i-ph:activity',
    terminal: 'i-ph:terminal-window',
    logs: 'i-ph:list-magnifying-glass',
    collaborators: 'i-ph:users',
    domains: 'i-ph:globe',
    snapshots: 'i-ph:stack',
    settings: 'i-ph:gear',
  };

  return icons[panel] ?? 'i-ph:squares-four';
}

/*
 * Threshold (in px) the user has to be away from the bottom of the conversation
 * before the "Go to last message" control fades in. Keeping it well above the
 * patch-review card height (~200px) prevents the button from flickering when
 * content streams in and the layout settles.
 */
const SCROLL_TO_BOTTOM_THRESHOLD = 240;

function ScrollToBottom() {
  const { isAtBottom, scrollToBottom, state } = useStickToBottomContext();
  const shouldShowScrollControl = !isAtBottom && state.scrollDifference > SCROLL_TO_BOTTOM_THRESHOLD;

  if (!shouldShowScrollControl) {
    return null;
  }

  return (
    <>
      <div className="sticky bottom-0 left-0 right-0 bg-gradient-to-t from-bolt-elements-background-depth-1 to-transparent h-20 z-10" />
      <button
        type="button"
        aria-label="Scroll to the latest message"
        className="sticky z-50 bottom-0 left-0 right-0 text-4xl rounded-lg px-1.5 py-0.5 flex items-center justify-center mx-auto gap-2 bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor text-bolt-elements-textPrimary text-sm shadow-sm"
        onClick={() => scrollToBottom()}
      >
        Go to last message
        <span className="i-ph:arrow-down animate-bounce" />
      </button>
    </>
  );
}
