/* eslint-disable @typescript-eslint/ban-ts-comment, import/order */
// @ts-nocheck — Preventing TS checks. Must be a line comment, not a block, or tsc silently ignores the directive.
/*
 * DETTE MESURÉE le 2026-08-30, directive retirée le temps de la mesure : 16
 * erreurs. Les quatre `TS2304` qu'elle masquait — le panneau Intégrations qui ne
 * s'affichait pas du tout — sont CORRIGÉES, avec deux autres plantages.
 *
 * Deuxième passe le 2026-08-31 : les 5 erreurs à risque d'exécution sont
 * traitées (TS2339 champ absent du type de l'état, TS18048/TS2345 sur deux
 * `filter(Boolean)` qui ne restreignaient rien, TS2345 sur un corps réseau
 * `unknown`, TS2684 qui cachait un vrai décalage d'indentation des branches
 * racines). 12 → 7.
 *
 * Il reste 7 erreurs, toutes de la même famille : des types structurellement
 * voisins (`IdePaneTab` vs `ProjectIdePaneTab`) que TypeScript refuse
 * d'assimiler. Aucune n'a de conséquence à l'exécution. Elles ne sont pas
 * oubliées : `BaseChat.ts-nocheck-debt.spec.ts` fige le compte et échoue s'il
 * remonte.
 *
 * La directive reste une ligne `//` et non un bloc : en bloc, tsc l'ignore
 * silencieusement.
 */
import { useTranslation } from 'react-i18next';
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
import type { TFunction } from 'i18next';
import Cookies from 'js-cookie';
import { Copy, Download, Trash2, Users } from 'lucide-react';
import React, {
  lazy,
  Suspense,
  type RefCallback,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { Bar } from 'react-chartjs-2';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import {
  bringFloatingPaneToFront as engineBringFloatingPaneToFront,
  dockPane as engineDockPane,
  floatPane as engineFloatPane,
  moveTab as engineMoveTab,
  reorderTab as engineReorderTab,
  setSplitRatio as engineSetSplitRatio,
  splitPane as engineSplitPane,
  updateFloatingBounds as engineUpdateFloatingBounds,
  updatePane as engineUpdatePane,
  type ProjectEditorWindowState,
} from '~/lib/project-editor-layout';
import { ClientOnly } from 'remix-utils/client-only';

import { computeComposerReservedSpace, shouldRewriteReservedSpace } from './composer-reserved-space';
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
import { devServerStatusText } from './dev-server-status';
import { describeSkipReason, parseDotEnv } from './parse-dot-env';
import {
  TAB_DRAG_PANE_MIME,
  TAB_DRAG_TAB_MIME,
  dropSlotForTab,
  isProjectEditorTabDrag,
  samePaneReorderIndex,
} from './project-editor-tab-drag';
import {
  PROJECT_EDITOR_TOOL_CATEGORY_LABEL_KEYS,
  PROJECT_EDITOR_TOOL_SHORTCUTS,
  projectEditorToolList,
  projectEditorToolsByCategory,
} from './project-editor-tool-catalog';
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
import { LanguageSetting } from '~/components/i18n/LanguageSetting';
import { panelActionFailureMessage } from '~/lib/panel-action-failure';
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
import { laDispositionPeutEtreRestauree } from './ide-layout-restore';
import { creerGardeDeRestauration } from './project-ide-restore-guard';
import { projectAiMessagesToChatMessages, type ProjectAiMessagesResponse } from './projectAiTranscript';
import { recouvrementBasDuNavigateur } from './visual-viewport-bottom';
import { ShareConversationButton } from './ShareConversationButton';
import { ImportButtons } from '~/components/chat/chatExportAndImport/ImportButtons';
import { DatabaseWorkbench } from '~/components/database/DatabaseWorkbench';
import { initialesPersonne, libellePersonne } from '~/utils/person-label';
import { Menu } from '~/components/sidebar/Menu.client';
import { ConfirmationDialog } from '~/components/ui/Dialog';
import { EmptyState } from '~/components/ui/EmptyState';
import { FilterChip } from '~/components/ui/FilterChip';
import { InputDialog } from '~/components/ui/InputDialog';
import { PanelBoundary, PanelErrorBoundary, PanelLoading, ZoneErrorBoundary } from '~/components/ui/PanelBoundary';
import { ThemeSwitch } from '~/components/ui/ThemeSwitch';
import { EditorHistoryOverlay } from '~/components/workbench/EditorHistoryOverlay';
import { FileTree } from '~/components/workbench/FileTree';
import { Preview } from '~/components/workbench/Preview';
import { Search } from '~/components/workbench/Search';
import { LockManager } from '~/components/workbench/LockManager';
import { ProjectAgentRunStatus } from '~/components/project-ide/ProjectAgentRunStatus';
import { FloatingPaneFrame } from '~/components/project-ide/FloatingPaneFrame';
import { PANEL_ICONS, panelIcon } from '~/components/project-ide/panel-meta';
import {
  IdePanelHeader,
  PanelButton,
  PanelEmptyState,
  PanelInput,
  PanelSectionTitle,
  PanelToolTabs,
} from '~/components/project-ide/PanelPrimitives';
import { Badge } from '~/components/ui/Badge';
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
import { parseProblemLocation, type ProblemLocation } from '~/lib/stores/problem-location';
import { workbenchStore } from '~/lib/stores/workbench';
import { DEFAULT_THEME, applyThemeToDocument, kTheme, themeStore, toggleTheme, type Theme } from '~/lib/stores/theme';
import { resolveProjectThemePreference } from '~/lib/stores/project-theme';
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
import { isAgentRunDegraded, isAgentRunFailed } from './bundled-artifact-state';
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
  getProjectIdeMemorySync,
  saveProjectIdeMemory,
  subscribeProjectIdeMemory,
  type ProjectIdeMemory,
} from '~/lib/persistence/projectIdeMemory';
import { hasLivePreviewPort, isWorkspaceReallyRunning, workspaceUiState } from '~/lib/runtime/workspace-status';
import { useCurrentWorkspaceId } from '~/lib/runtime/CurrentWorkspaceContext';
import { useNavigate, useSearchParams } from 'react-router';
import {
  isMobileWorkbenchPanel,
  resolveMobileWorkbenchPanel,
  shouldMountMobileWorkbench,
  type MobileWorkbenchPanelId,
} from '~/components/chat/mobile-workbench-keepalive';
import { isRedundantPanelSearchParamUpdate, withPanelSearchParam } from '~/utils/project-ide-panel-url';
import {
  IDE_AGENT_PANEL,
  ideMobileTarget,
  isIdeRightPanel,
  isIdeWorkspacePanel,
  resolveIdePanelKey,
  type IdeManagementPanel,
  type IdeRightPanel,
  type IdeWorkspacePanel,
} from '~/lib/ide/panel-registry';
import { readProjectPanelCache, writeProjectPanelCache } from '~/lib/ide/panel-payload-cache';
import { resolvePendingSelectedFile } from '~/lib/ide/pending-selected-file';
import {
  type CompactPreviewRunState,
  compactPreviewRunAriaLabel,
  compactPreviewRunIcon,
  isCompactPreviewRunActive,
  resolveCompactPreviewRunState,
} from '~/lib/runtime/preview-run-state';
import { projectPanelRefreshIntervalMs } from '~/utils/project-panel-refresh';
import { countHiddenMobileBottomTabs, selectVisibleMobileBottomTabs } from '~/lib/mobile-bottom-tabs';
import {
  ECODE_MOBILE_MORE_ITEMS,
  ECODE_MOBILE_TOOLS,
  MOBILE_TOOL_TO_MANAGEMENT_PANEL,
  SHELL_TERMINAL_LABEL,
} from '~/lib/mobile-ide-tabs';
import {
  applyKeybindingOverrides,
  createProjectFocusTabKeybinding,
  defaultProjectKeybindings,
  detectKeybindingConflicts,
  formatKeybindingCombo,
  getKeybindingCategoryLabel,
  localizeProjectKeybindings,
  PROJECT_KEYBINDING_CATEGORIES,
  type Keybinding,
  type KeybindingOverrideMap,
} from '~/lib/keybindings';
import { readPointerCapabilities, shouldAutoFocusCommandPalette } from '~/lib/command-palette-focus';
import { useFocusTrap } from '~/lib/use-focus-trap';
import {
  formatBaseChatAstDate,
  formatBaseChatAstDateTime,
  formatBaseChatAstNumber,
  formatBaseChatAstRelativeTime,
  formatBaseChatAstTime,
  getBaseChatAstCopy,
} from '~/lib/i18n/catalogs/base-chat-ast';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, ChartTooltip, Legend);

const TEXTAREA_MIN_HEIGHT = 76;
const PROJECT_BOTTOM_TERMINAL_UI_STORAGE_KEY = 'vibecore-project-bottom-terminal-ui-v1';
const PROJECT_IDE_GUIDED_TOUR_STORAGE_KEY = 'vibecore-project-ide-guided-tour-v1';
const PROJECT_SECURITY_SCAN_TIMEOUT_MS = 90_000;
const PROJECT_IDE_STATE_RESTORE_FALLBACK_MS = 6_000;
const PROJECT_KEYBINDINGS = defaultProjectKeybindings;
type ProjectThemePreference = Theme | 'system';

function chatKey<const Key extends string>(key: Key): Key {
  return key;
}

function codeExample<const Value extends string>(value: Value): Value {
  return value;
}

function resolvedBaseChatLanguage(i18n: { resolvedLanguage?: string; language?: string }): string {
  return i18n.resolvedLanguage ?? i18n.language ?? 'en';
}

function isProjectThemePreference(preference: unknown): preference is ProjectThemePreference {
  return preference === 'dark' || preference === 'light' || preference === 'system';
}

function applyProjectThemePreference(preference: unknown): Theme {
  const { theme: resolvedTheme, explicite } = resolveProjectThemePreference(preference);

  themeStore.set(resolvedTheme);

  /*
   * On n'écrit `bolt_theme` que pour un choix réel. Persister le défaut
   * fabriquait une préférence que l'utilisateur n'avait jamais exprimée : au
   * chargement suivant, `initStore` la recopiait dans le cookie partagé et
   * l'épinglait sur toutes les surfaces — un simple passage dans l'IDE suffisait
   * à figer le compte en clair.
   */
  if (explicite && typeof localStorage !== 'undefined') {
    localStorage.setItem(kTheme, resolvedTheme);
  }

  applyThemeToDocument(resolvedTheme);

  return resolvedTheme;
}

const IDE_TOOLTIP_HELP: Record<string, { description: string; shortcut?: string }> = {
  Agent: { description: chatKey('chat.copy.focusTheAiAgentComposerAnd_8d14ee25'), shortcut: 'Cmd+J' },
  'Add tab': { description: chatKey('chat.copy.openAnotherEditorTerminalPreviewOr_f5ea7611'), shortcut: 'Ctrl+T' },
  'Close terminal panel': {
    description: chatKey('chat.copy.hideTheBottomTerminalDrawerWithout_2b21049b'),
    shortcut: 'Esc',
  },
  'Close split': { description: chatKey('chat.copy.returnLogsToASingleStream_df5589bc') },
  'Copy preview URL': {
    description: chatKey('chat.copy.copyTheCurrentPreviewAddressTo_c7d1b1b6'),
    shortcut: 'Cmd+Shift+C',
  },
  'Enable inspect to code': {
    description: chatKey('chat.copy.clickAnElementInPreviewAnd_ba396983'),
    shortcut: 'Cmd+Shift+I',
  },
  'Exit Full Screen': { description: chatKey('chat.copy.leaveFullScreenPreviewMode_d51d485e'), shortcut: 'Esc' },
  'Focus agent composer': { description: chatKey('chat.copy.jumpBackToTheAiPrompt_5866f7c8'), shortcut: 'Cmd+J' },
  'Full Screen': { description: chatKey('chat.copy.expandThePreviewToInspectThe_19231abf'), shortcut: 'F' },
  'Go to definition': {
    description: chatKey('chat.copy.jumpToTheSymbolDefinitionFrom_a82809fc'),
    shortcut: 'F12',
  },
  'Hide minimap': { description: chatKey('chat.copy.hideTheCodeOverviewStripIn_7c73c82b') },
  'More editor status': { description: chatKey('chat.copy.showCursorIndentationEncodingAndLanguage_c153dba0') },
  'Open in browser': { description: chatKey('chat.copy.openThePreviewUrlInA_a778992d'), shortcut: 'Cmd+Enter' },
  'Open refactor menu': {
    description: chatKey('chat.copy.showAvailableCodeActionsAndRefactors_b1d1b39b'),
    shortcut: 'Ctrl+.',
  },
  'Preview window options': { description: chatKey('chat.copy.adjustPreviewWindowAndDeviceDisplay_6dc02f87') },
  'Refresh preview': { description: chatKey('chat.copy.reloadTheEmbeddedWebPreview_b6dbf5bc'), shortcut: 'Cmd+R' },
  'Refresh runtime logs': {
    description: chatKey('chat.copy.refreshTerminalAndRuntimeStateFrom_635b5627'),
    shortcut: 'R',
  },
  'Rename symbol': {
    description: chatKey('chat.copy.renameTheCurrentSymbolAcrossReferences_eb70d3d0'),
    shortcut: 'F2',
  },
  'Resize AI agent panel': { description: chatKey('chat.copy.dragToGiveTheAgentOr_bc97c212') },
  'Resize files panel': { description: chatKey('chat.copy.dragToResizeTheFileBrowser_8c3d7d12') },
  'Show editor status details': { description: chatKey('chat.copy.openTheFullEditorStatusList_ab95dccd') },
  'Show QR': { description: chatKey('chat.copy.openAQrCodeForTesting_f8b14567') },
  'Show minimap': { description: chatKey('chat.copy.showTheCodeOverviewStripIn_6c768a34') },
  'Split view': { description: chatKey('chat.copy.showAnotherLogStreamBesideThe_b12c7790'), shortcut: 'Cmd+\\' },
  'Toggle split log view': {
    description: chatKey('chat.copy.showAnotherLogStreamBesideThe_b12c7790'),
    shortcut: 'Cmd+\\',
  },
  'Tab actions': { description: chatKey('chat.copy.openTabActionsSuchAsClose_524ae782') },
  'Toggle live tail': { description: chatKey('chat.copy.keepLogsPinnedToTheNewest_b6be115d'), shortcut: 'T' },
  'Toggle terminal': { description: chatKey('chat.copy.showOrHideThePinnedShell_adb90367'), shortcut: 'Ctrl+`' },
};

const IDE_RAIL_TOOLTIP_HELP: Record<string, { description: string; shortcut?: string }> = {
  Agent: { description: chatKey('chat.copy.focusTheAiAgentComposerAnd_8d14ee25'), shortcut: 'Cmd+J' },
  Files: { description: chatKey('chat.copy.openTheProjectFileBrowserAnd_f4aa4650'), shortcut: 'Cmd+Shift+E' },
  Editor: { description: chatKey('chat.copy.returnToTheActiveCodeEditor_e983595e'), shortcut: 'Cmd+E' },
  Terminal: { description: chatKey('chat.copy.openTheWorkspaceShellTerminalDrawer_53ba4b78'), shortcut: 'Ctrl+`' },
  [SHELL_TERMINAL_LABEL]: {
    description: chatKey('chat.copy.openTheWorkspaceShellTerminalDrawer_53ba4b78'),
    shortcut: 'Ctrl+`',
  },
  Preview: { description: chatKey('chat.copy.openTheLiveWebPreviewPanel_76fd4695'), shortcut: 'Cmd+Enter' },
  Publish: {
    description: chatKey('chat.copy.openDeploymentsDomainsAndPublishingTools_e353e9a5'),
    shortcut: 'Cmd+Shift+P',
  },
  Search: { description: chatKey('chat.copy.searchProjectFilesAndSymbols_855ee585'), shortcut: 'Cmd+P' },
  Git: { description: chatKey('chat.copy.openVersionControlBranchesAndChanges_297ee092'), shortcut: 'Ctrl+Shift+G' },
  Database: { description: chatKey('chat.copy.openDatabaseConnectionsQueryToolsAnd_d505c108') },
  Packages: { description: chatKey('chat.copy.manageDependenciesManifestsAndPackageAudits_56e1be8f') },
  Monitoring: { description: chatKey('chat.copy.inspectRuntimeHealthActivityAndMetrics_37d738f1') },
  Security: { description: chatKey('chat.copy.runScansAndReviewVulnerabilities_5bc3c76a') },
  Activity: { description: chatKey('chat.copy.openTheProjectAuditTimelineAnd_b112349e') },
  Settings: { description: chatKey('chat.copy.openWorkspaceAndPersonalIdeSettings_04dbe1d2'), shortcut: 'Cmd+,' },
};

const PROJECT_IDE_TOUR_STEPS = [
  {
    selector: '.bolt-project-agent-panel',
    title: chatKey('chat.copy.projectAssistant_2b677b08'),
    description: chatKey('chat.copy.describeWhatYouWantToBuild_998d9a1a'),
    shortcut: 'Cmd+J',
  },
  {
    selector: '.bolt-project-ide-rail',
    title: chatKey('chat.copy.ideRail_f70134ec'),
    description: chatKey('chat.copy.switchBetweenFilesEditorTerminalPreview_4f1972a7'),
  },
  {
    selector: '.bolt-project-tabbar',
    title: chatKey('chat.copy.workspaceTabs_41a97420'),
    description: chatKey('chat.copy.pinSplitAndReorderYourActive_b37b4560'),
    shortcut: 'Ctrl+T',
  },
  {
    selector: '.bolt-project-statusbar',
    title: chatKey('chat.copy.statusBar_31b8336a'),
    description: chatKey('chat.copy.runtimeGitProblemsAndPreviewState_eaa1d16d'),
  },
  {
    selector: '.bolt-project-topbar-actions',
    title: chatKey('chat.copy.topbarActions_5e8fe8aa'),
    description: chatKey('chat.copy.runPublishAndShareStayVisible_1bc7711c'),
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

/*
 * Les listes de panneaux vivent désormais dans `~/lib/ide/panel-registry` :
 * une seule source de vérité pour l'URL, l'en-tête et le contenu.
 * BUG-IDE-PANEL-RESOLUTION-001.
 */
const MOBILE_IDE_PANELS = ['chat', 'files', 'editor', 'search', 'locks', 'terminal', 'preview', 'deploy'] as const;

/*
 * Les TROIS onglets fixes de la barre mobile, dans l'ordre demandé par Avi :
 * Webview, Agent, Déploiement. L'éditeur en a été retiré — il devient un panneau
 * à la demande, atteignable par la grille du sélecteur, la feuille d'outils ou
 * l'ouverture d'un fichier, qui le réinsèrent via `ensureMobileOpenTab`.
 * Ces trois-là ne se ferment pas : la croix des tuiles s'appuie sur cette liste.
 */
const ECODE_MOBILE_DEFAULT_TABS = ['preview', 'agent', 'deployments'] as const;
const MOBILE_OVERLAY_RESTORE_WINDOW_MS = 120_000;
type MobileOverlayKind = 'tools' | 'tabs' | 'more' | 'agent';

/*
 * UNIF-05 : les icônes viennent du registre unique PANEL_ICONS (panel-meta) —
 * la même icône pour le même outil sur les tuiles mobile, les onglets desktop,
 * le rail et la palette « + ». Deux exceptions volontaires, en littéral :
 * - `agent` (marque, rendue à part) ;
 * - `terminal`/`console`/`shell` : l'onglet Terminal mobile est GELÉ sur la
 *   référence d'Avi (IMG_9149) — son glyphe ne doit jamais dériver via le
 *   registre (même si la valeur actuelle y est identique).
 */
const ECODE_MOBILE_TAB_META_BASE: Record<string, { id: string; name: string; icon: string }> = {
  preview: { id: 'preview', name: 'Webview', icon: PANEL_ICONS.preview },
  agent: { id: 'agent', name: 'Agent', icon: 'agent' },
  deploy: { id: 'deploy', name: 'Deployments', icon: PANEL_ICONS.deployments },
  deployments: { id: 'deployments', name: 'Deployments', icon: PANEL_ICONS.deployments },
  files: { id: 'files', name: 'Library', icon: PANEL_ICONS.files },
  editor: { id: 'editor', name: 'Editor', icon: PANEL_ICONS.editor },
  search: { id: 'search', name: 'Search', icon: PANEL_ICONS.search },
  locks: { id: 'locks', name: 'Locks', icon: PANEL_ICONS.locks },
  terminal: { id: 'terminal', name: SHELL_TERMINAL_LABEL, icon: 'i-ph:terminal-window' },
  actions: { id: 'actions', name: 'Agent', icon: 'agent' },
  assistant: { id: 'assistant', name: 'Agent', icon: 'agent' },
  publishing: { id: 'publishing', name: 'Deployments', icon: PANEL_ICONS.deployments },
  'app-storage': { id: 'app-storage', name: 'Object Storage', icon: PANEL_ICONS['object-storage'] },
  auth: { id: 'auth', name: 'Settings', icon: PANEL_ICONS.settings },
  console: { id: 'console', name: SHELL_TERMINAL_LABEL, icon: 'i-ph:terminal-window' },
  database: { id: 'database', name: 'Database', icon: PANEL_ICONS.database },
  problems: { id: 'problems', name: 'Problems', icon: PANEL_ICONS.problems },
  debug: { id: 'debug', name: 'Debugger', icon: PANEL_ICONS.debugger },
  debugger: { id: 'debugger', name: 'Debugger', icon: PANEL_ICONS.debugger },
  developer: { id: 'developer', name: 'Debugger', icon: PANEL_ICONS.debugger },
  git: { id: 'git', name: 'Git', icon: PANEL_ICONS.git },
  history: { id: 'history', name: 'Activity', icon: PANEL_ICONS.activity },
  activity: { id: 'activity', name: 'Activity', icon: PANEL_ICONS.activity },
  integrations: { id: 'integrations', name: 'Integrations', icon: PANEL_ICONS.integrations },
  multiplayer: { id: 'multiplayer', name: 'Collaborators', icon: PANEL_ICONS.collaborators },
  collaboration: { id: 'collaboration', name: 'Collaborators', icon: PANEL_ICONS.collaborators },
  collaborate: { id: 'collaborate', name: 'Collaborators', icon: PANEL_ICONS.collaborators },
  collaborators: { id: 'collaborators', name: 'Collaborators', icon: PANEL_ICONS.collaborators },
  packages: { id: 'packages', name: 'Packages', icon: PANEL_ICONS.packages },
  skills: { id: 'skills', name: 'Skills', icon: PANEL_ICONS.skills },
  secrets: { id: 'secrets', name: 'Secrets', icon: PANEL_ICONS.secrets },
  settings: { id: 'settings', name: 'Settings', icon: PANEL_ICONS.settings },
  workflows: { id: 'workflows', name: 'Workflows', icon: PANEL_ICONS.workflows },
  checkpoints: { id: 'checkpoints', name: 'Snapshots', icon: PANEL_ICONS.snapshots },
  snapshots: { id: 'snapshots', name: 'Snapshots', icon: PANEL_ICONS.snapshots },
  extensions: { id: 'extensions', name: 'Extensions', icon: PANEL_ICONS.extensions },
  security: { id: 'security', name: 'Security', icon: PANEL_ICONS.security },
  shell: { id: 'shell', name: SHELL_TERMINAL_LABEL, icon: 'i-ph:terminal-window' },
  'kv-store': { id: 'kv-store', name: 'Database', icon: PANEL_ICONS.database },
  storage: { id: 'storage', name: 'Object Storage', icon: PANEL_ICONS['object-storage'] },
  'object-storage': { id: 'object-storage', name: 'Object Storage', icon: PANEL_ICONS['object-storage'] },
  env: { id: 'env', name: 'Environment variables', icon: PANEL_ICONS.env },
  logs: { id: 'logs', name: 'Logs', icon: PANEL_ICONS.logs },
  monitoring: { id: 'monitoring', name: 'Monitoring', icon: PANEL_ICONS.monitoring },
  ports: { id: 'ports', name: 'Ports', icon: PANEL_ICONS.ports },
  domains: { id: 'domains', name: 'Domains', icon: PANEL_ICONS.domains },
  overview: { id: 'overview', name: 'Overview', icon: PANEL_ICONS.overview },
  studio: { id: 'studio', name: 'Agent Studio', icon: PANEL_ICONS.studio },
  web: { id: 'web', name: 'Webview', icon: PANEL_ICONS.webview },
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
  overview: 'chat.copy.projectSummary_398c8190',
  studio: 'chat.copy.agentSupervisor_ac7559cf',
  problems: 'chat.copy.runtimeDiagnosticsPreviewErrorsAndWarnings_0b9c0dad',
  database: 'chat.copy.sqlBrowser_4bdd94d4',
  'object-storage': 'chat.copy.fileStorage_4fbddfd9',
  packages: 'chat.copy.dependenciesManager_5bf6692e',
  skills: 'chat.copy.agentSkills_ce8667c8',
  monitoring: 'chat.copy.appMetrics_a76e2b66',
  ports: 'chat.copy.forwardedPorts_fc7ae1ef',
  extensions: 'chat.copy.marketplace_983095c0',
  integrations: 'chat.copy.connectedServices_35c4834d',
  workflows: 'chat.copy.taskAutomation_00886567',
  debugger: 'chat.copy.breakpointsAndLaunchConfigs_0e342dbd',
  deployments: 'chat.copy.publishYourApp_84e20c23',
  security: 'chat.copy.securityScanner_3993f46d',
  env: 'chat.copy.environmentVariables_1173b2e1',
  secrets: 'chat.copy.secretsToolDescription',
  git: 'chat.copy.versionControl_62f1aa26',
  activity: 'chat.copy.projectTimeline_307c9b37',
  terminal: 'chat.copy.workspaceShellTerminal_21af7c52',
  logs: 'chat.copy.runtimeLogs_d0a587ed',
  collaborators: 'chat.copy.teamAccess_8fb3578f',
  domains: 'chat.copy.customDomains_b18c921e',
  snapshots: 'chat.copy.rollbackPoints_3ab1afec',
  settings: 'chat.copy.projectSettings_95590645',
  editor: 'chat.copy.codeEditor_2faee521',
  preview: 'chat.copy.appPreview_9edb6188',
  files: 'chat.copy.browseProjectFiles_644a8995',
  search: 'chat.copy.findInFiles_c8857ba2',
  locks: 'chat.copy.lockedFiles_9c2ea979',
};

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
    label: chatKey('chat.copy.ask_3562777b'),
    chatMode: 'discuss',
    description: chatKey('chat.copy.answerExplainAndInspectWithoutChanging_ec00ba1e'),
    placeholder: chatKey('chat.copy.askAnythingAboutThisProject_ce81dd6b'),
  },
  {
    id: 'edit',
    label: chatKey('chat.copy.edit_5301648d'),
    chatMode: 'build',
    description: chatKey('chat.copy.makeScopedCodeChangesOnlyAfter_c3f95796'),
    placeholder: chatKey('chat.copy.describeAScopedEditEG_0d84e847'),
  },
  {
    id: 'agent',
    label: chatKey('chat.copy.agent_5ce2e6f4'),
    chatMode: 'build',
    description: chatKey('chat.copy.executeTheRequestedTaskEndTo_41227963'),
    placeholder: chatKey('chat.copy.describeWhatYouWantTheAgent_283b294d'),
  },
  {
    id: 'architect',
    label: chatKey('chat.copy.architect_16639cf7'),
    chatMode: 'discuss',
    description: chatKey('chat.copy.designArchitectureContractsRisksAndRollout_33a8af69'),
    placeholder: chatKey('chat.copy.describeTheSystemToDesignGoals_b6fcef66'),
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
    label: chatKey('chat.copy.agent_5ce2e6f4'),
    description: chatKey('chat.copy.runTheSelectedTaskEndTo_5494ff2a'),
    execution: 'agent',
  },
  {
    id: 'assistant',
    label: chatKey('chat.copy.assistant_8010d1f4'),
    description: chatKey('chat.copy.conversationalAnswersQuestionsAndProposesScoped_01156362'),
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
  ['github', 'GitHub', 'chat.copy.connectRepositoriesForCodeSyncAnd_7a7a39e3', 'cicd', 'i-ph:github-logo'],
  ['slack', 'Slack', 'chat.copy.sendBuildDeployAndIncidentNotifications_f2cc4419', 'communication', 'i-ph:slack-logo'],
  ['jira', 'Jira', 'chat.copy.syncIssuesAndDeliveryWorkAcross_c61d98fd', 'project', 'i-ph:kanban'],
  ['notion', 'Notion', 'chat.copy.syncDocsAndProductNotesWith_03a48a9d', 'project', 'i-ph:notion-logo'],
  ['gitlab', 'GitLab', 'chat.copy.alternativeGitHostingAndCiPipelines_c18b2802', 'cicd', 'i-ph:gitlab-logo'],
  [
    'discord',
    'Discord',
    'chat.copy.sendWorkspaceNotificationsToDiscord_3525cc0e',
    'communication',
    'i-ph:discord-logo',
  ],
  ['trello', 'Trello', 'chat.copy.visualBoardsAndCardsForProduct_d6198868', 'project', 'i-ph:columns'],
  ['asana', 'Asana', 'chat.copy.teamWorkManagementAndTaskTracking_a4d7156b', 'project', 'i-ph:list-checks'],
  ['figma', 'Figma', 'chat.copy.designCollaborationAndHandoffLinks_972088ed', 'project', 'i-ph:figma-logo'],
  ['linear', 'Linear', 'chat.copy.issuesSprintsAndRoadmaps_aeeb5615', 'project', 'i-ph:chart-line-up'],
  ['zendesk', 'Zendesk', 'chat.copy.supportTicketsAndCustomerOperations_3440bfe7', 'support', 'i-ph:headset'],
  [
    'datadog',
    'Datadog',
    'chat.copy.infrastructureAndApplicationMonitoring_3d56e01c',
    'observability',
    'i-ph:chart-line',
  ],
  ['sentry', 'Sentry', 'chat.copy.errorTrackingAndReleaseHealth_375126dc', 'observability', 'i-ph:warning-diamond'],
  [
    'pagerduty',
    'PagerDuty',
    'chat.copy.incidentRoutingAndOnCallEscalation_5a435a1c',
    'observability',
    'i-ph:bell-ringing',
  ],
  ['newrelic', 'New Relic', 'chat.copy.fullStackObservabilityData_527efc13', 'observability', 'i-ph:pulse'],
  ['grafana', 'Grafana', 'chat.copy.dashboardsAndMetricsVisualization_e0e986bf', 'observability', 'i-ph:gauge'],
  ['jenkins', 'Jenkins', 'chat.copy.selfHostedAutomationServer_090b33ce', 'cicd', 'i-ph:factory'],
  ['circleci', 'CircleCI', 'chat.copy.continuousIntegrationAndDelivery_725543ac', 'cicd', 'i-ph:circle'],
  [
    'github-actions',
    'GitHub Actions',
    'chat.copy.repositoryNativeWorkflowAutomation_5174acde',
    'cicd',
    'i-ph:git-branch',
  ],
  ['vercel', 'Vercel', 'chat.copy.deployAndHostModernWebApps_c87b1d87', 'cicd', 'i-ph:triangle'],
  ['aws-s3', 'AWS S3', 'chat.copy.objectStorageForAssetsAndExports_5fbc8bd4', 'data', 'i-ph:cloud'],
  ['mongodb', 'MongoDB', 'chat.copy.documentDatabaseIntegration_f9e95150', 'data', 'i-ph:database'],
  ['postgresql', 'PostgreSQL', 'chat.copy.relationalDatabaseIntegration_96f9a13b', 'data', 'i-ph:database'],
  ['redis', 'Redis', 'chat.copy.inMemoryCacheAndQueueService_2ef34e77', 'data', 'i-ph:stack'],
  ['elasticsearch', 'Elasticsearch', 'chat.copy.searchAndAnalyticsIndexing_3c363e99', 'data', 'i-ph:magnifying-glass'],
  ['stripe', 'Stripe', 'chat.copy.paymentsBillingAndWebhookEvents_1f22daf9', 'payments', 'i-ph:credit-card'],
  ['twilio', 'Twilio', 'chat.copy.smsVoiceAndCommunicationsApis_64da7fa3', 'communication', 'i-ph:phone'],
  ['resend', 'Resend', 'chat.copy.transactionalEmailDelivery_c27c4a85', 'communication', 'i-ph:paper-plane-tilt'],
  ['intercom', 'Intercom', 'chat.copy.customerMessagingAndSupport_2e0907c6', 'support', 'i-ph:chat-circle-text'],
  ['hubspot', 'HubSpot', 'chat.copy.crmAndMarketingAutomation_6a8ec43f', 'support', 'i-ph:users-three'],
  ['salesforce', 'Salesforce', 'chat.copy.enterpriseCrmWorkflows_21d2a378', 'support', 'i-ph:building-office'],
  ['zapier', 'Zapier', 'chat.copy.crossToolWorkflowAutomation_1d9b7342', 'automation', 'i-ph:lightning'],
] as const;
const INTEGRATION_CATEGORIES = [
  ['all', 'chat.copy.allIntegrations_4cf0ab99', 'i-ph:link'],
  ['cicd', 'chat.copy.ciCd_25ef1b43', 'i-ph:rocket-launch'],
  ['observability', 'chat.copy.observability_e2397377', 'i-ph:chart-line'],
  ['communication', 'chat.copy.communication_ade0d50c', 'i-ph:globe'],
  ['project', 'chat.copy.projectManagement_dd64c0f0', 'i-ph:kanban'],
  ['support', 'chat.copy.support_f32d5a3b', 'i-ph:headset'],
  ['data', 'chat.copy.dataStorage_d7b94492', 'i-ph:database'],
  ['payments', 'chat.copy.payments_44357ae5', 'i-ph:shield-check'],
  ['automation', 'chat.copy.automation_a15fde51', 'i-ph:hard-drives'],
] as const;

/*
 * The access an integration in each category is granted, surfaced BEFORE the
 * user connects (and again while connected, next to the revoke control) so the
 * consent is informed. Scoped by category because the connect flow authorizes a
 * pasted API token rather than a per-scope OAuth grant.
 */
const INTEGRATION_PERMISSIONS: Record<string, string[]> = {
  cicd: [
    'chat.copy.readRepositoryAndPipelineMetadata_da9b7a67',
    'chat.copy.triggerBuildsDeploysAndReadTheir_01110234',
    'chat.copy.readBuildAndDeployLogs_d1752153',
  ],
  observability: [
    'chat.copy.readMetricsDashboardsAndAlertStatus_c49abb55',
    'chat.copy.readIncidentAndOnCallState_e09c9828',
  ],
  communication: ['chat.copy.postTheNotificationsYouAuthorizeTo_e3b91e04'],
  project: ['chat.copy.readAndSyncTheIssuesTasks_4d625aa5'],
  support: ['chat.copy.readAndCreateTheSupportTickets_edcf0535'],
  data: ['chat.copy.readAndWriteDataInThe_07bdc6c0'],
  payments: ['chat.copy.readPaymentSubscriptionAndWebhookEvents_584bbdef'],
  automation: ['chat.copy.triggerAndReceiveTheAutomationWorkflows_7e21af4b'],
};

function integrationPermissions(category: string): string[] {
  return INTEGRATION_PERMISSIONS[category] ?? ['chat.copy.accessTheDataAndActionsYou_90610671'];
}

const TERMINAL_SCRIPT_TEMPLATES = [
  [
    'start-dev',
    'chat.copy.startDevelopmentServer_ac4c3f32',
    'chat.copy.startTheDevelopmentServerWithHot_212b828e',
    'npm run dev',
  ],
  ['build', 'chat.copy.buildProject_26b3ae15', 'chat.copy.buildTheProjectForProduction_b2a7b008', 'npm run build'],
  ['test', 'chat.copy.runTests_40e0369d', 'chat.copy.executeTheTestSuite_f416c702', 'npm test'],
  ['lint', 'chat.copy.lintCode_05d2a7c2', 'chat.copy.checkCodeStyleAndStaticIssues_2d6e0695', 'npm run lint'],
  [
    'db-migrate',
    'chat.copy.databaseMigration_3325d37a',
    'chat.copy.runDatabaseMigrations_42783d59',
    'npm run db:migrate',
  ],
  [
    'docker-build',
    'chat.copy.dockerBuild_ae5f0584',
    'chat.copy.buildTheProjectDockerImage_b3eee5e3',
    'docker build -t vibecore-project .',
  ],
  [
    'git-status',
    'chat.copy.gitStatus_1dc1b911',
    'chat.copy.inspectRepositoryStatusAndRecentCommits_36c970c6',
    'git status && git log --oneline -5',
  ],
  [
    'clean-deps',
    'chat.copy.cleanDependencies_d00bb9d3',
    'chat.copy.removeAndReinstallDependencies_b81fd44b',
    'rm -rf node_modules && npm install',
  ],
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

  /** RPL-IDE-001.2: horizontal or vertical split. */
  direction: 'horizontal' | 'vertical';

  /** Fraction occupied by `first`, clamped 0.1–0.9. Undefined = default 50/50. */
  ratio?: number;
  first: IdePaneNode;
  second: IdePaneNode;
};
type IdePaneNode = IdePaneLeaf | IdePaneSplit;

/** RPL-IDE-001.3: a pane popped out of the docked tree into a floating window. */
type IdeFloatingPane = {
  id: string;
  pane: IdePaneLeaf;
  bounds: { x: number; y: number; width: number; height: number };
  zIndex: number;
  dockOrigin?: unknown;
};

function runtimeStatusText(
  t: TFunction,
  input: {
    workspaceStatus?: { status?: string; ports?: Array<{ port?: number; ready?: boolean }> } | null;
    ports?: Array<{ port?: number; ready?: boolean }>;
    workspaceLoading: boolean;
    workspaceError?: string;
  },
) {
  if (input.workspaceError) {
    return t('baseChatAst.runtime.error');
  }

  if (input.workspaceLoading) {
    return t('baseChatAst.runtime.starting');
  }

  const status = workspaceUiState(input.workspaceStatus, {
    ports: input.ports,
  });

  if (status === 'running') {
    return t('baseChatAst.runtime.running');
  }

  if (status === 'starting') {
    return t('baseChatAst.runtime.starting');
  }

  if (status === 'error') {
    return t('baseChatAst.runtime.error');
  }

  if (status === 'stopped') {
    return t('baseChatAst.runtime.stopped');
  }

  return t('baseChatAst.runtime.notStarted');
}

function runtimeStateLabel(t: TFunction, status?: string | null): string {
  const normalized = status?.trim().toLowerCase();

  if (normalized === 'running' || normalized === 'ready' || normalized === 'active') {
    return t('baseChatAst.status.running');
  }

  if (normalized === 'starting' || normalized === 'booting' || normalized === 'pending') {
    return t('baseChatAst.status.starting');
  }

  if (normalized === 'stopped' || normalized === 'offline') {
    return t('baseChatAst.status.stopped');
  }

  if (normalized === 'error' || normalized === 'failed' || normalized === 'crashed') {
    return t('baseChatAst.status.error');
  }

  return status || t('baseChatAst.status.unknown');
}

function platformStateLabel(t: TFunction, status: unknown): string {
  const raw = String(status ?? '').trim();
  const normalized = raw.toLowerCase().replace(/[\s-]+/g, '_');

  switch (normalized) {
    case 'active':
      return t('baseChatAst.status.active');
    case 'cancelled':
    case 'canceled':
      return t('baseChatAst.status.cancelled');
    case 'critical':
      return t('baseChatAst.status.critical');
    case 'completed':
      return t('baseChatAst.status.completed');
    case 'connected':
      return t('baseChatAst.status.connected');
    case 'disabled':
      return t('baseChatAst.status.disabled');
    case 'enabled':
      return t('baseChatAst.status.enabled');
    case 'error':
      return t('baseChatAst.status.error');
    case 'failed':
      return t('baseChatAst.status.failed');
    case 'high':
      return t('baseChatAst.status.high');
    case 'info':
      return t('baseChatAst.status.info');
    case 'idle':
      return t('baseChatAst.presence.idle');
    case 'offline':
      return t('baseChatAst.status.offline');
    case 'low':
      return t('baseChatAst.status.low');
    case 'medium':
      return t('baseChatAst.status.medium');
    case 'moderate':
      return t('baseChatAst.status.moderate');
    case 'paused':
      return t('baseChatAst.status.paused');
    case 'pending':
      return t('baseChatAst.status.pending');
    case 'preview':
      return t('baseChatAst.status.preview');
    case 'production':
      return t('baseChatAst.status.production');
    case 'ready':
      return t('baseChatAst.status.ready');
    case 'reconnecting':
      return t('baseChatAst.status.reconnecting');
    case 'running':
      return t('baseChatAst.status.running');
    case 'starting':
      return t('baseChatAst.status.starting');
    case 'stopped':
      return t('baseChatAst.status.stopped');
    case 'staging':
      return t('baseChatAst.status.staging');
    case 'succeeded':
    case 'success':
      return t('baseChatAst.status.succeeded');
    case 'trialing':
      return t('baseChatAst.status.trialing');
    case 'approved':
      return t('baseChatAst.status.approved');
    case 'quarantined':
      return t('baseChatAst.status.quarantined');
    case 'rejected':
      return t('baseChatAst.status.rejected');
    case 'revoked':
      return t('baseChatAst.status.revoked');
    case 'daily':
      return t('baseChatAst.status.daily');
    case 'weekly':
      return t('baseChatAst.status.weekly');
    case 'warn':
    case 'warning':
      return t('baseChatAst.status.warning');
    default:
      return raw || t('baseChatAst.status.unknown');
  }
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

function previewPortText(
  t: TFunction,
  input: {
    previews: Array<{ port: number; ready?: boolean }>;
    workspaceLoading: boolean;
    workspaceError?: string;
    previewServerState: { status: string };
  },
) {
  const activePreview = input.previews.find((preview) => preview.ready !== false) ?? input.previews[0];

  if (activePreview) {
    return t('baseChatAst.port.number', { port: activePreview.port });
  }

  if (input.workspaceError) {
    return t('baseChatAst.port.unavailable');
  }

  if (input.previewServerState.status === 'static') {
    return t('baseChatAst.port.static');
  }

  return input.workspaceLoading || input.previewServerState.status === 'starting'
    ? t('baseChatAst.port.detecting')
    : t('baseChatAst.port.none');
}

function previewPortCompactText(
  t: TFunction,
  input: {
    previews: Array<{ port: number; ready?: boolean }>;
    workspaceLoading: boolean;
    workspaceError?: string;
    previewServerState: { status: string };
  },
) {
  const activePreview = input.previews.find((preview) => preview.ready !== false) ?? input.previews[0];

  if (activePreview) {
    return String(activePreview.port);
  }

  if (input.workspaceError) {
    return t('baseChatAst.port.compactUnavailable');
  }

  if (input.previewServerState.status === 'static') {
    return t('baseChatAst.port.compactStatic');
  }

  return input.workspaceLoading || input.previewServerState.status === 'starting'
    ? t('baseChatAst.port.compactDetecting')
    : t('baseChatAst.port.compactNone');
}

/*
 * previewCommandFromLogs / devServerStatusText live in ./dev-server-status so
 * the BUG-UX-DEV-BLOCKED-STUCK decision is unit-testable without importing
 * this whole file (see dev-server-status.spec.ts).
 */

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

function presenceDisplayName(t: TFunction, user: any) {
  return (
    String(user?.name ?? user?.userId ?? user?.sessionId ?? t('baseChatAst.presence.unknownUser')).trim() ||
    t('baseChatAst.presence.unknownUser')
  );
}

function presenceStateLabel(t: TFunction, value: unknown, fallback: 'online' | 'editing') {
  const state = String(value ?? fallback).toLowerCase();

  const key = {
    online: 'baseChatAst.presence.online',
    viewing: 'baseChatAst.presence.viewing',
    editing: 'baseChatAst.presence.editing',
    typing: 'baseChatAst.presence.typing',
    idle: 'baseChatAst.presence.idle',
  }[state];

  return key ? t(key) : String(value ?? fallback);
}

function collaborationPresenceTooltip(t: TFunction, language: string, presence: any[]) {
  if (!presence.length) {
    return t('baseChatAst.presence.none');
  }

  const names = presence
    .slice(0, 3)
    .map((user) => {
      const status = presenceStateLabel(t, user?.status, 'online');
      const mode = presenceStateLabel(t, user?.mode, 'editing');

      return `${presenceDisplayName(t, user)} (${status}, ${mode})`;
    })
    .join(', ');

  const overflow = presence.length > 3 ? `, +${formatBaseChatAstNumber(language, presence.length - 3)}` : '';

  return t('baseChatAst.presence.summary', { count: presence.length, names, overflow });
}

function collaborationRoleLabel(t: TFunction, role: unknown): string {
  const normalized = String(role ?? '').toLowerCase();

  const key = {
    viewer: 'baseChatAst.collaboration.role.viewer',
    member: 'baseChatAst.collaboration.role.member',
    admin: 'baseChatAst.collaboration.role.admin',
    owner: 'baseChatAst.collaboration.role.owner',
  }[normalized];

  return key ? t(key) : String(role ?? '');
}

function collaborationRoleDescription(t: TFunction, role: string): string {
  if (role === 'viewer') {
    return t('baseChatAst.collaboration.viewerDescription');
  }

  if (role === 'member') {
    return t('baseChatAst.collaboration.memberDescription');
  }

  return t('baseChatAst.collaboration.adminDescription');
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

function messageText(t: TFunction, message: Message) {
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
          return t('baseChatAst.export.toolInvocation');
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

function conversationTranscript(t: TFunction, messages: Message[] = [], title?: string) {
  const heading = title?.trim() || t('baseChatAst.conversation.project');

  const body = messages
    .map((message, index) => {
      const role = String(message.role ?? 'message');
      const content = messageText(t, message) || t('baseChatAst.export.emptyMessage');

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

function fileTypeLabel(t: TFunction, filePath?: string) {
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
    return t('baseChatAst.fileType.stylesheet');
  }

  if (extension === 'md' || extension === 'mdx') {
    return t('baseChatAst.fileType.markdown');
  }

  return extension ? extension.toUpperCase() : t('baseChatAst.fileType.project');
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

function shortContent(value: unknown, fallback = '') {
  const text = stripPromptScaffold(value)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return text ? text.slice(0, 120) : fallback;
}

function timeAgo(t: TFunction, language: string, value?: string) {
  if (!value) {
    return formatBaseChatAstRelativeTime(language, Date.now()) ?? t('baseChatAst.time.recorded');
  }

  return formatBaseChatAstRelativeTime(language, value) ?? t('baseChatAst.time.recorded');
}

function formatBytes(t: TFunction, language: string, bytes?: number) {
  if (!Number.isFinite(bytes) || !bytes || bytes <= 0) {
    return t('baseChatAst.bytes.zero');
  }

  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < 3) {
    value /= 1024;
    unitIndex += 1;
  }

  const formattedValue = formatBaseChatAstNumber(language, value, {
    maximumFractionDigits: value >= 10 || unitIndex === 0 ? 0 : 1,
  });

  if (unitIndex === 0) {
    return t('baseChatAst.storage.bytes', { value: formattedValue });
  }

  if (unitIndex === 1) {
    return t('baseChatAst.storage.kilobytes', { value: formattedValue });
  }

  if (unitIndex === 2) {
    return t('baseChatAst.storage.megabytes', { value: formattedValue });
  }

  return t('baseChatAst.storage.gigabytes', { value: formattedValue });
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

function snapshotAuthor(t: TFunction, snapshot: ProjectSnapshot) {
  if (snapshot.kind === 'before-ai-change' || /ai|agent/i.test(snapshot.label ?? '')) {
    return t('baseChatAst.snapshot.author.agent');
  }

  if (snapshot.kind === 'automatic') {
    return t('baseChatAst.snapshot.author.system');
  }

  return t('baseChatAst.snapshot.author.manual');
}

function snapshotKindLabel(t: TFunction, snapshot: ProjectSnapshot) {
  if (snapshot.kind === 'before-ai-change') {
    return t('baseChatAst.snapshot.kind.beforeAi');
  }

  if (snapshot.kind === 'automatic') {
    return t('baseChatAst.snapshot.kind.automatic');
  }

  return t('baseChatAst.snapshot.kind.manual');
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
  t: TFunction;
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
    t,
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
      label: t('chat.copy.fixLatestError_b6da7063'),
      prompt: t('chat.copy.analyzeTheLatestRuntimeLogsIdentify_680e460a'),
      reason: t('chat.copy.recentLogsContainErrors_6290ed06'),
      icon: 'i-ph:warning',
      priority: 100,
    });
  }

  if (!previewRunning && hasPackageJson) {
    add({
      id: 'start-preview',
      label: t('chat.copy.getPreviewRunning_0d5b5104'),
      prompt: t('chat.copy.inspectTheProjectStartupSetupInstall_f94a95ae'),
      reason: t('chat.copy.previewHasNoActivePort_18ad3861'),
      icon: 'i-ph:browser',
      priority: 95,
    });
  }

  if (selectedFile) {
    add({
      id: 'improve-selected-file',
      label: t('baseChatAst.suggestion.improveLabel', { file: selectedLabel }),
      prompt: t('baseChatAst.suggestion.improvePrompt', { path: selectedFile }),
      reason: t('chat.copy.basedOnTheOpenFile_d8844105'),
      icon: 'i-ph:file-code',
      priority: 88,
    });
  }

  if (changedFiles > 0) {
    add({
      id: 'review-changes',
      label: t('chat.copy.reviewChanges_d174dd6e'),
      prompt: t('chat.copy.reviewTheCurrentUncommittedProjectChanges_2e7d7a94'),
      reason: t('baseChatAst.suggestion.changedFiles', { count: changedFiles }),
      icon: 'i-ph:git-diff',
      priority: 84,
    });
  }

  if (/deploy|publish|ship|production|prod|domain/.test(recentText) || activePanel === 'deployments') {
    add({
      id: 'prepare-deploy',
      label: t('chat.copy.prepareDeploy_d5681ade'),
      prompt: t('chat.copy.checkTheProjectForDeploymentReadiness_57818802'),
      reason: t('chat.copy.deploymentContextDetected_4ffe7eeb'),
      icon: 'i-ph:rocket-launch',
      priority: 80,
    });
  }

  if (!hasTests && filePaths.length > 4) {
    add({
      id: 'add-smoke-tests',
      label: t('chat.copy.addSmokeTests_7804b150'),
      prompt: t('chat.copy.addASmallSmokeTestOr_74d572da'),
      reason: t('chat.copy.noTestsDetected_01e780d6'),
      icon: 'i-ph:check-circle',
      priority: 72,
    });
  }

  if (hasDbFiles || /database|db|data|schema|migration|supabase/.test(recentText)) {
    add({
      id: 'audit-data-layer',
      label: t('chat.copy.auditDataFlow_3f71c822'),
      prompt: t('chat.copy.inspectTheProjectDataLayerAnd_78e474e0'),
      reason: t('chat.copy.databaseDataFilesDetected_a167d972'),
      icon: 'i-ph:database',
      priority: 70,
    });
  }

  if (hasUiFiles && (/ui|design|button|panel|theme|mobile|responsive/.test(recentText) || activePanel === 'preview')) {
    add({
      id: 'polish-ui',
      label: t('chat.copy.polishCurrentUi_f37c63be'),
      prompt: t('chat.copy.auditTheCurrentUiForLayout_7be4ee43'),
      reason: t('chat.copy.uiWorkIsActive_67802593'),
      icon: 'i-ph:paint-brush',
      priority: 68,
    });
  }

  if (hasEnvExample || /api key|env|secret|provider|openai|anthropic/.test(recentText)) {
    add({
      id: 'check-config',
      label: t('chat.copy.checkConfig_7a9e01b2'),
      prompt: t('chat.copy.validateEnvironmentVariablesAndProviderConfiguration_16afcc7c'),
      reason: t('chat.copy.configProviderContextDetected_f4d95af6'),
      icon: 'i-ph:key',
      priority: 64,
    });
  }

  if (hasApiFiles) {
    add({
      id: 'harden-api',
      label: t('chat.copy.hardenApiPaths_87a1be38'),
      prompt: t('chat.copy.inspectTheApiServerRoutesTouched_4cd1030f'),
      reason: t('chat.copy.serverApiFilesDetected_a0f3f80e'),
      icon: 'i-ph:shield-check',
      priority: 58,
    });
  }

  if (lastUserText && chatStarted) {
    add({
      id: 'continue-last-request',
      label: t('chat.copy.continueLastRequest_6d14c48e'),
      prompt: t('baseChatAst.suggestion.continuePrompt', {
        request: shortContent(lastUserText, t('baseChatAst.suggestion.lastRequestFallback')),
      }),
      reason: t('chat.copy.basedOnTheLatestConversation_ec330857'),
      icon: 'i-ph:arrow-bend-down-right',
      priority: 92,
    });
  }

  add({
    id: 'add-feature',
    label: t('chat.copy.addAFeature_17a8f96a'),
    prompt: t('chat.copy.inspectTheCurrentProjectAndAdd_22ca1855'),
    reason: t('chat.copy.coreECodeWorkflow_2622e876'),
    icon: 'i-ph:plus-circle',
    priority: 88,
  });

  add({
    id: 'next-best-step',
    label: t('chat.copy.findNextBestStep_aa78d3eb'),
    prompt: t('chat.copy.analyzeTheCurrentProjectFilesRecent_1735206f'),
    reason: t('chat.copy.projectAwareFallback_4ffb1415'),
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
      direction: node.direction === 'vertical' ? 'vertical' : 'horizontal',
      ...(typeof node.ratio === 'number' && Number.isFinite(node.ratio)
        ? { ratio: Math.min(0.9, Math.max(0.1, node.ratio)) }
        : {}),
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

function normalizeFloatingPanes(input: unknown): IdeFloatingPane[] {
  if (!Array.isArray(input)) {
    return [];
  }

  const result: IdeFloatingPane[] = [];

  for (const entry of input) {
    const floating = entry as Partial<IdeFloatingPane> | undefined;
    const pane = floating?.pane as any;

    if (!floating || !pane || pane.type !== 'leaf' || !Array.isArray(pane.tabs) || pane.tabs.length === 0) {
      continue;
    }

    const normalizedPane = normalizePaneTree(pane);

    if (normalizedPane.type !== 'leaf') {
      continue;
    }

    const bounds = floating.bounds ?? { x: 72, y: 72, width: 720, height: 480 };

    result.push({
      id: typeof floating.id === 'string' ? floating.id : `floating-${pane.id ?? 'pane'}`,
      pane: { ...normalizedPane, id: typeof pane.id === 'string' ? pane.id : normalizedPane.id },
      bounds: {
        x: Number.isFinite(bounds.x) ? bounds.x : 72,
        y: Number.isFinite(bounds.y) ? bounds.y : 72,
        width: Number.isFinite(bounds.width) ? Math.max(280, bounds.width) : 720,
        height: Number.isFinite(bounds.height) ? Math.max(180, bounds.height) : 480,
      },
      zIndex: typeof floating.zIndex === 'number' ? floating.zIndex : result.length + 1,
      ...(floating.dockOrigin ? { dockOrigin: floating.dockOrigin } : {}),
    });
  }

  return result;
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

/*
 * Contrat explicite : cette fonction ne traduit QUE ce qu'elle possède — les
 * descriptions de `IDE_RAIL_TOOLTIP_HELP`, qui sont des clés. La `description`
 * reçue en argument est du TEXTE DÉJÀ RÉSOLU, et n'est plus retraduite.
 *
 * Elle l'était, sans distinguer les deux cas. Or `IDE_RAIL_TOOLTIP_HELP` est
 * indexée par libellés ANGLAIS (« Files », « Search ») alors que l'appelant
 * passe le libellé traduit : la carte ne matche jamais en français, on tombait
 * donc toujours sur l'argument — et quand celui-ci était déjà du texte français,
 * `t(« Parcourir les fichiers du projet »)` ne résolvait rien et rendait
 * l'étiquette de secours « Unavailable ».
 *
 * Mesuré en réel : `title="Bibliothèque. Unavailable. 8 fichiers"`. Ma première
 * tentative — envelopper l'argument d'un `t()` de plus au site d'appel — a
 * AGGRAVÉ le défaut : `t(t(clé))` échouait pour les huit items au lieu d'un
 * seul. C'est en mesurant les trois formats après déploiement que je l'ai vu.
 */
function formatRailItemTooltip(t: TFunction, label: string, description: string, badgeLabel?: string) {
  const help = IDE_RAIL_TOOLTIP_HELP[label];
  const resolved = help?.description ? t(help.description) : description;

  const details = [
    label,
    resolved,
    badgeLabel,
    help?.shortcut ? t('chat.copy.shortcutValue', { shortcut: help.shortcut }) : undefined,
  ].filter(Boolean);

  return details.join('. ');
}

function isIdeHiddenPath(filePath: string) {
  return IDE_FILE_TREE_HIDDEN_PATTERNS.some((pattern) => pattern.test(filePath));
}

function inferAgentToolAction(t: TFunction, message: string | undefined): AgentToolAction | null {
  const text = (message ?? '').toLowerCase();

  const matches: Array<[RegExp, IdeWorkspacePanel | IdeRightPanel, string]> = [
    [
      /\b(open|show|ouvre|affiche).*\b(files?|fichiers?|explorer)\b|\b(files?|fichiers?)\b/,
      'files',
      t('baseChatAst.tool.openFiles'),
    ],
    [/\b(search|find|recherche)\b/, 'search', t('baseChatAst.tool.openSearch')],
    [/\b(database|sql|db|base de donn)/, 'database', t('baseChatAst.tool.openDatabase')],
    [
      /\b(terminal|console|logs?|shell)\b/,
      'terminal',
      t('baseChatAst.tool.openTerminal', { terminal: SHELL_TERMINAL_LABEL }),
    ],
    [/\b(preview|webview|aperçu|apercu)\b/, 'preview', t('baseChatAst.tool.openWebview')],
    [
      /\b(deploy|deployment|publish|publier|déploiement|deploiement)\b/,
      'deployments',
      t('baseChatAst.tool.openDeployments'),
    ],
    [/\b(secret|env|environment variable)\b/, 'secrets', t('baseChatAst.tool.openSecrets')],
    [/\bgit\b|\bbranch\b|\bcommit\b/, 'git', t('baseChatAst.tool.openGit')],
    [/\b(package|dependency|dependencies|npm|pnpm)\b/, 'packages', t('baseChatAst.tool.openPackages')],
    [
      /\b(integration|integrations|webhook|api key|event stream|slack|jira|sentry|stripe|zapier)\b/,
      'integrations',
      t('baseChatAst.tool.openIntegrations'),
    ],
    [
      /\b(workflow|workflows|run button|automation|automate|script|task)\b/,
      'workflows',
      t('baseChatAst.tool.openWorkflows'),
    ],
    [/\b(snapshot|checkpoint|restore|rollback)\b/, 'snapshots', t('baseChatAst.tool.openSnapshots')],
    [/\b(extension|marketplace)\b/, 'extensions', t('baseChatAst.tool.openExtensions')],
    [/\bmonitoring|metrics|observability\b/, 'monitoring', t('baseChatAst.tool.openMonitoring')],
    [/\bsettings|param(è|e)tres|configuration\b/, 'settings', t('baseChatAst.tool.openSettings')],
  ];

  const match = matches.find(([pattern]) => pattern.test(text));

  if (!match) {
    return null;
  }

  const [, panel, title] = match;

  return {
    panel,
    title,
    description: t(IDE_TOOL_DESCRIPTIONS[panel]),
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
  t,
  message,
  mode,
  planFirst,
  mentionedFiles,
  mentionedSymbols,
}: {
  t: TFunction;
  message: string;
  mode: ProjectAgentExecutionMode;
  planFirst: boolean;
  mentionedFiles: string[];
  mentionedSymbols: Array<{ symbol: string; filePath: string; line: number; preview: string }>;
}) {
  const modeConfig = PROJECT_AGENT_EXECUTION_MODES.find((item) => item.id === mode) ?? PROJECT_AGENT_EXECUTION_MODES[2];

  const guardrails = [
    `Mode: ${t(modeConfig.label)}. ${t(modeConfig.description)}`,
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

/**
 * RPL-IDE-001.4 — a floating pane is a leaf too, and a tab can be dragged in or
 * out of one. Floating panes live outside the docked tree, so `findLeaf` alone
 * misses them.
 */
function findFloatingLeaf(floatingPanes: IdeFloatingPane[], paneId: string): IdePaneLeaf | undefined {
  return floatingPanes.find((floating) => floating.pane.id === paneId)?.pane;
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

function countLeaves(node: IdePaneNode | null): number {
  if (!node) {
    return 0;
  }

  return node.type === 'leaf' ? 1 : countLeaves(node.first) + countLeaves(node.second);
}

function flattenPaneLeafIds(node: IdePaneNode | null): string[] {
  if (!node) {
    return [];
  }

  return node.type === 'leaf' ? [node.id] : [...flattenPaneLeafIds(node.first), ...flattenPaneLeafIds(node.second)];
}

/**
 * RPL-IDE-001.1/.2/.3 — the docked pane tree, floating panes and active pane of
 * a single browser window. Structurally identical to the pure engine's
 * `ProjectEditorWindowState`; the app-side tool union (`IdeWorkspacePanel`) is a
 * subset of the engine's, so the cast at the engine boundary is sound.
 */
type IdeWindowState = {
  root: IdePaneNode | null;
  floatingPanes: IdeFloatingPane[];
  activePaneId: string;
  maximizedPaneId?: string;
};

/**
 * Bridge to the pure layout engine. We keep the app's own pane state as the
 * source of truth (incremental, no wholesale rewrite) and delegate the tree
 * transforms — split H/V, resize, float, dock (with origin restore) — to the
 * tested engine, casting at the single boundary here.
 */
function runProjectEditorWindowOp(
  state: IdeWindowState,
  op: (windowState: ProjectEditorWindowState) => ProjectEditorWindowState,
): IdeWindowState {
  const engineInput = {
    id: 'window',
    root: state.root,
    floatingPanes: state.floatingPanes,
    activePaneId: state.activePaneId,
    ...(state.maximizedPaneId ? { maximizedPaneId: state.maximizedPaneId } : {}),
  } as unknown as ProjectEditorWindowState;

  const next = op(engineInput);

  return {
    root: (next.root as unknown as IdePaneNode | null) ?? null,
    floatingPanes: next.floatingPanes as unknown as IdeFloatingPane[],
    activePaneId: next.activePaneId,
    maximizedPaneId: next.maximizedPaneId,
  };
}

const PROJECT_EDITOR_WINDOW_PARAM = 'peWindow';
const DEFAULT_PROJECT_EDITOR_WINDOW = 'window-main';

/** Structural signature of a window layout, excluding volatile timestamps. */
function projectEditorLayoutSignature(
  root: IdePaneNode | null,
  floatingPanes: IdeFloatingPane[],
  activePaneId: string,
): string {
  return JSON.stringify({ root, floatingPanes, activePaneId });
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
  const { t } = useTranslation();
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
    <section className="bolt-project-agent-patch-review" aria-label={t('chat.copy.aiPatchReviewQueue_b6f83c83')}>
      <div className="bolt-project-agent-patch-review-head">
        <div>
          <strong>{t('chat.copy.reviewAiChanges_5c09969d')}</strong>
          <span>
            {autoApplyEnabled
              ? t('baseChatAst.patch.failed', { count: visibleProposals.length })
              : t('baseChatAst.patch.review', { count: visibleProposals.length })}
          </span>
        </div>
        <div className="bolt-project-agent-patch-review-bulk">
          <button
            type="button"
            className="bolt-project-agent-patch-review-bulk-accept"
            disabled={pendingForBulk.length === 0}
            onClick={acceptAll}
          >
            {t('chat.copy.acceptAll_821d1f79')}
          </button>
          <button
            type="button"
            className="bolt-project-agent-patch-review-bulk-reject"
            disabled={pendingForBulk.length === 0}
            onClick={rejectAll}
          >
            {t('chat.copy.rejectAll_35c291a4')}
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
                    {/*
                     * BUG-QA-I18N-COUNT-002 : compteurs collés au libellé, et
                     * pluriel fabriqué avec un « s » ANGLAIS ajouté à une chaîne
                     * traduite (« Segments » en français par accident).
                     */}
                    {t('baseChatAst.patch.hunks', { count: proposal.hunks.length })} ·{' '}
                    {t('baseChatAst.patch.selected', { count: selectedCount })}
                  </span>
                </div>
                <div className="bolt-project-agent-patch-actions">
                  <button
                    type="button"
                    disabled={busy || selectedCount === 0}
                    onClick={() => workbenchStore.acceptAgentPatchProposal(proposal.id, Array.from(selectedHunks))}
                  >
                    {t('chat.copy.acceptFile_72208421')}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => workbenchStore.rejectAgentPatchProposal(proposal.id)}
                  >
                    {t('chat.copy.rejectFile_a52b87d3')}
                  </button>
                </div>
              </div>
              {proposal.error ? <p className="bolt-project-agent-patch-error">{proposal.error}</p> : null}
              <details className="bolt-project-agent-patch-hunks-toggle">
                <summary>
                  <span className="bolt-project-agent-patch-hunks-toggle-label">
                    {t('chat.copy.showDiff_78016e77')}
                    <span className="bolt-project-agent-patch-hunks-toggle-count">
                      {t('baseChatAst.counts.hunks', { count: proposal.hunks.length })}
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
                            {t('chat.copy.hunk_1920d3ca')}
                            {index + 1}
                          </label>
                          <span>
                            -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines}
                          </span>
                        </div>
                        <pre
                          aria-label={t('chat.copy.diffHunkValue0ForValue1_15b99314', {
                            value0: index + 1,
                            value1: proposal.relativePath,
                          })}
                        >
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
    const { t, i18n } = useTranslation();
    const language = resolvedBaseChatLanguage(i18n);

    const ECODE_MOBILE_TAB_META = useMemo(
      () =>
        Object.fromEntries(
          Object.entries(ECODE_MOBILE_TAB_META_BASE).map(([id, meta]) => {
            const aliases: Record<string, string> = {
              agent: 'agent',
              actions: 'agent',
              assistant: 'agent',
              deploy: 'deployments',
              publishing: 'deployments',
              'app-storage': 'object-storage',
              storage: 'object-storage',
              auth: 'settings',
              console: 'terminal',
              shell: 'terminal',
              debug: 'debugger',
              developer: 'debugger',
              history: 'activity',
              multiplayer: 'collaborators',
              collaboration: 'collaborators',
              collaborate: 'collaborators',
              checkpoints: 'snapshots',
              'kv-store': 'database',
              web: 'preview',
            };

            const canonicalPanel = aliases[id] ?? id;

            return [
              id,
              {
                ...meta,
                name:
                  canonicalPanel === 'agent'
                    ? t('chat.copy.agent_5ce2e6f4')
                    : canonicalPanel === 'tools'
                      ? t('baseChatAst.common.tools')
                      : panelTitle(canonicalPanel, t),
              },
            ];
          }),
        ),
      [language, t],
    );

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
          body: JSON.stringify({
            label: t('chat.copy.manualCheckpointViaSnapshot_11e1a834'),
            kind: 'manual',
            manifest: {},
          }),
        });

        if (!response.ok) {
          console.warn('Snapshot creation failed', { status: response.status });
          toast.error(t('baseChatAst.snapshot.failedHttp', { status: response.status }));

          return;
        }

        toast.success(t('chat.copy.snapshotCreated_69d5db4f'));
      } catch (error) {
        console.error('Snapshot creation request failed', error);
        toast.error(t('baseChatAst.snapshot.failed'));
      }
    }, [projectId, t]);

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
    const runShellCommandFromSlash = useCallback(
      async (command: string) => {
        const shell = workbenchStore.boltTerminal;

        if (!shell || typeof shell.executeCommand !== 'function') {
          toast.error(t('chat.copy.shellUnavailableOpenTheTerminalPanel_578d6a74'));
          return;
        }

        try {
          await shell.executeCommand(`slash-run:${Date.now()}`, command);
        } catch (error) {
          console.error('Slash shell command failed', error);
          toast.error(t('baseChatAst.shell.commandFailed'));
        }
      },
      [t],
    );

    const useMobileIde = layout.isMobile || layout.isTablet;
    const navigate = useNavigate();
    const [clientHydrated, setClientHydrated] = useState(false);

    const [mobilePanel, setMobilePanel] = useState<
      'chat' | 'files' | 'editor' | 'search' | 'locks' | 'terminal' | 'preview' | 'deploy'
    >('chat');

    /*
     * BUG-IDE-PANEL-REPROVISION-RELOAD-001 — keep-alive du Workbench mobile.
     * Une fois un panneau workbench (Webview, Shell, éditeur, fichiers,
     * recherche) ouvert, LazyWorkbench reste monté pour la session et n'est que
     * MASQUÉ quand Agent/gestion/locks est actif. Avant, chaque retour vers un
     * panneau workbench remontait tout le workbench à froid (Suspense plein
     * écran, terminal et éditeur réinitialisés) et, sur un pod endormi, la
     * Preview remontée relançait le re-provisionnement avec son overlay
     * « Webview startup » sur toute la zone — vécu comme « ouvrir un panneau
     * recharge tout l'IDE ». Voir mobile-workbench-keepalive.ts.
     */
    const [mobileWorkbenchKeepAlive, setMobileWorkbenchKeepAlive] = useState(false);
    const lastMobileWorkbenchPanelRef = useRef<MobileWorkbenchPanelId | undefined>(undefined);
    const mobileWorkbenchPanelActive = useMobileIde && isMobileWorkbenchPanel(mobilePanel);

    useEffect(() => {
      if (mobileWorkbenchPanelActive && isMobileWorkbenchPanel(mobilePanel)) {
        setMobileWorkbenchKeepAlive(true);
        lastMobileWorkbenchPanelRef.current = mobilePanel;
      }
    }, [mobilePanel, mobileWorkbenchPanelActive]);

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
        const vue = window.visualViewport;
        const height = vue?.height ?? window.innerHeight;
        document.documentElement.style.setProperty('--vc-mobile-visual-viewport-height', `${Math.round(height)}px`);

        /*
         * RECOUVREMENT BAS DU NAVIGATEUR — ce que `env(safe-area-inset-bottom)`
         * ne dit PAS.
         *
         * Sur iOS, la barre d'outils de Safari recouvre le bas de la fenêtre de
         * MISE EN PAGE : un panneau en `position: fixed` ancré à
         * `bottom: calc(nav + env(safe-area-inset-bottom))` se place donc SOUS
         * elle. `env(safe-area-inset-bottom)` vaut 0 tant que la barre est
         * affichée — ce n'est pas une encoche, c'est du chrome de navigateur.
         *
         * La seule grandeur qui le décrit est l'écart entre la fenêtre de mise
         * en page et la fenêtre VISUELLE. Avi le photographie : les panneaux du
         * composeur passent sous la barre Safari et sous la barre d'outils de
         * l'IDE, coupés en haut ET en bas.
         */
        const recouvrementBas = recouvrementBasDuNavigateur(window.innerHeight, vue ?? undefined);
        document.documentElement.style.setProperty(
          '--vc-mobile-visual-viewport-bottom',
          `${Math.round(recouvrementBas)}px`,
        );
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
        document.documentElement.style.removeProperty('--vc-mobile-visual-viewport-bottom');
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

        /*
         * La reserve doit couvrir TOUT le chrome qui recouvre en permanence le
         * transcript : la boite de saisie ET la barre de navigation du bas.
         *
         * Elle valait `height + 16` — un padding fixe qui n'incluait pas la
         * barre. Des que celle-ci depasse 16 px (elle fait 72 px, mesure au
         * 2026-09-01), faire defiler jusqu'au dernier message le laissait
         * passer dessous. On mesure donc la barre au lieu de la supposer : sa
         * hauteur depend de `--mobile-nav-height` ET de la zone de securite du
         * telephone, qu'aucune constante ne peut deviner.
         */
        const navBar = document.querySelector<HTMLElement>('.bolt-mobile-replit-nav');
        const navHeight = navBar ? navBar.getBoundingClientRect().height : 0;

        const reserved = computeComposerReservedSpace(height, navHeight);

        /*
         * Only rewrite the reserved space when it changes by a meaningful amount.
         * Sub-pixel/1-2px churn while streaming would otherwise re-shift the
         * transcript on every frame — the very "jumping" we're trying to kill.
         */
        if (!shouldRewriteReservedSpace(lastReserved, reserved)) {
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

    useEffect(() => {
      setMobileOpenTabs((current) =>
        current.map((tab) => ECODE_MOBILE_TAB_META[tab.id] ?? { ...tab, name: panelTitle(tab.id, t) }),
      );
    }, [ECODE_MOBILE_TAB_META, t]);

    const [activeMobileOpenTabId, setActiveMobileOpenTabId] = useState('agent');

    /*
     * Panneau de service rendu par la surface mobile « deploy ». En-tête ET
     * contenu lisent cette unique valeur — elle est écrite par le seul entonnoir
     * `setMobileIdePanel`, que l'ouverture vienne de l'URL, d'un onglet ou d'un outil.
     */
    const [mobileServicePanel, setMobileServicePanel] = useState<IdeManagementPanel>('deployments');

    const { setActivePanel: persistMobilePanel } = useMobileIdePersistence(projectIdeMode ? projectId : undefined);

    const ensureMobileOpenTab = useCallback(
      (tabId: string) => {
        const tab = ECODE_MOBILE_TAB_META[tabId] ?? {
          id: tabId,
          name: panelTitle(tabId, t),
          icon: panelIcon(tabId),
        };

        /*
         * Move an already-open tab to the END rather than leaving it in place:
         * the bottom row shows the most recently used tabs, so "end of list"
         * has to mean "most recent". Without this, re-opening a panel left it
         * stuck at its original position and it could stay hidden behind the
         * +N counter even though the user had just asked for it.
         */
        setMobileOpenTabs((current) => [...current.filter((item) => item.id !== tab.id), tab]);
        setActiveMobileOpenTabId(tab.id);
      },
      [t],
    );
    const setMobileIdePanel = useCallback(
      (panel: (typeof MOBILE_IDE_PANELS)[number], options: { activeTabId?: string } = {}) => {
        const tabId = options.activeTabId ?? (panel === 'chat' ? 'agent' : panel);

        /*
         * BUG-IDE-PANEL-RESOLUTION-001 — l'onglet demandé décide du contenu ET
         * de l'en-tête. Sans ça, un onglet ouvert hors URL (outil, raccourci,
         * barre du bas) laissait le contenu sur sa valeur précédente pendant que
         * l'en-tête affichait le nouvel onglet.
         */
        if (panel === 'deploy') {
          const tabResolution = resolveIdePanelKey(tabId);

          if (tabResolution.status === 'canonical' || tabResolution.status === 'alias') {
            const target = ideMobileTarget(tabResolution.panel);

            if (target.servicePanel) {
              setMobileServicePanel(target.servicePanel);
            }
          }
        }

        setMobilePanel(panel);
        persistMobilePanel(panel);
        ensureMobileOpenTab(tabId);

        if (panel !== 'chat') {
          workbenchStore.setShowWorkbench(true);
        }
      },
      [ensureMobileOpenTab, persistMobilePanel],
    );
    const localizedMobileTools = useMemo(
      () =>
        ECODE_MOBILE_TOOLS.map((item) => ({ ...item, title: t(item.titleKey), description: t(item.descriptionKey) })),
      [t],
    );
    const filteredMobileToolsSheetItems = useMemo(() => {
      const query = mobileToolsQuery.trim().toLowerCase();

      if (!query) {
        return localizedMobileTools;
      }

      return localizedMobileTools.filter(
        (item) =>
          item.title.toLowerCase().includes(query) ||
          item.description.toLowerCase().includes(query) ||
          item.id.toLowerCase().includes(query),
      );
    }, [localizedMobileTools, mobileToolsQuery]);
    const filteredMobileOpenTabs = useMemo(() => {
      const query = mobileTabSearchQuery.trim().toLowerCase();

      if (!query) {
        return mobileOpenTabs;
      }

      return mobileOpenTabs.filter(
        (tab) =>
          tab.name.toLowerCase().includes(query) ||
          tab.id.toLowerCase().includes(query) ||
          panelTitle(tab.id, t).toLocaleLowerCase(language).includes(query),
      );
    }, [language, mobileOpenTabs, mobileTabSearchQuery, t]);
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
    const [isModelLoading, setIsModelLoading] = useState<string | undefined>('all');
    const [modelError, setModelError] = useState<string | null>(null);
    const [progressAnnotations, setProgressAnnotations] = useState<ProgressAnnotation[]>([]);
    const [agentRunFailed, setAgentRunFailed] = useState(false);

    // BUG-UX-AGENT-DONE-FALSE : run allé au bout mais pas proprement (partiel / accord faible / rôles incomplets).
    const [agentRunDegraded, setAgentRunDegraded] = useState(false);
    const expoUrl = useStore(expoUrlAtom);
    const [qrModalOpen, setQrModalOpen] = useState(false);
    const projectFiles = useStore(workbenchStore.files);

    /*
     * BUG-PANEL-PERF-004 — miroir de la carte des fichiers COURANTE, lisible
     * depuis une réponse asynchrone (même forme que `paneTreeRef` plus bas).
     *
     * L'effet de restauration ne lit `projectFiles` que pour décider
     * « je restaure le fichier tout de suite » ou « je le diffère ». Le mettre
     * dans ses dépendances le faisait REJOUER à chaque vague de chargement de
     * fichiers — et chaque rejeu relançait `getProjectIdeMemory`, donc une
     * requête réseau de plus (aucune mise en commun des requêtes en vol), en
     * plus de ré-appliquer TOUTE la restauration par-dessus ce que
     * l'utilisateur venait éventuellement de changer.
     *
     * Le cas « les fichiers ne sont pas encore là » est déjà couvert, et mieux,
     * par `pendingProjectSelectedFile` + l'effet qui le consomme.
     */
    const projectFilesRef = useRef(projectFiles);

    projectFilesRef.current = projectFiles;
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

    /*
     * Miroir de la disposition COURANTE, lisible depuis une réponse asynchrone.
     * La valeur capturée dans la fermeture de l'effet date de son lancement ;
     * or c'est précisément l'écart entre les deux qui nous intéresse.
     */
    const paneTreeRef = useRef(paneTree);

    paneTreeRef.current = paneTree;

    const [activePaneId, setActivePaneId] = useState('pane-main');
    const [paneDropTarget, setPaneDropTarget] = useState<string | null>(null);

    /** RPL-IDE-001.3 — panes popped out of the docked tree in this window. */
    const [floatingPanes, setFloatingPanes] = useState<IdeFloatingPane[]>([]);

    /** RPL-IDE-001.1 — last layout signature applied, to skip redundant cross-tab echoes. */
    const projectEditorWindowSyncRef = useRef<string>('');

    /**
     * RPL-IDE-001.1 — this browser tab's Project Editor window id. `window-main`
     * is the primary; secondary windows opened via "Open in new window" carry a
     * `?peWindow=<id>` param and persist their layout independently.
     */
    const projectEditorWindowId = useMemo(
      () => searchParams.get(PROJECT_EDITOR_WINDOW_PARAM) || DEFAULT_PROJECT_EDITOR_WINDOW,
      [searchParams],
    );

    const isSecondaryProjectEditorWindow = projectEditorWindowId !== DEFAULT_PROJECT_EDITOR_WINDOW;

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

    /*
     * RPL-IDE-001.8 — `spotlight` is a fourth mode of the same palette engine:
     * it shows every section (files, tools, commands, open tabs) and adds a
     * project header, and it is what the app name in the topbar opens.
     */
    const [commandPaletteMode, setCommandPaletteMode] = useState<'all' | 'tools' | 'files' | 'spotlight'>('all');
    const [commandPaletteQuery, setCommandPaletteQuery] = useState('');

    /** RPL-IDE-001.8 — project name shown in the Spotlight header, sent by the topbar. */
    const [spotlightProjectName, setSpotlightProjectName] = useState('');
    const [commandPaletteIndex, setCommandPaletteIndex] = useState(0);

    /*
     * BUG-MOB-PALETTE-KEYBOARD-001 — sur un appareil purement tactile, ne PAS
     * lever le clavier logiciel à l'ouverture de la palette : c'est lui qui
     * masquait la moitié basse de la liste et déplaçait la mise en page entre
     * le toucher et le `click`, si bien que la sélection partait sur une autre
     * cible (« la palette reste », « la vue ne bascule pas »). Voir
     * `~/lib/command-palette-focus` pour le détail du mécanisme. Mesuré côté
     * client uniquement : la palette n'existe jamais dans le rendu serveur.
     */
    const [commandPaletteAutoFocus, setCommandPaletteAutoFocus] = useState(true);
    useEffect(() => {
      setCommandPaletteAutoFocus(shouldAutoFocusCommandPalette(readPointerCapabilities()));
    }, []);

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
    const stopAgentLabel = projectAgentStopLabel(provider?.name, model, language);
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

            toast.error(describeAutoApplyFailure(filePath, undefined, language), {
              toastId: `auto-apply-error-${filePath}`,
            });
          })
          .catch((error) => {
            if (failureIsSuperseded()) {
              return;
            }

            toast.error(describeAutoApplyFailure(filePath, error, language), {
              toastId: `auto-apply-error-${filePath}`,
            });
          });
      }
    }, [agentPatchProposals, language, scheduleAppliedFilesToast, projectAutoApply]);

    /*
     * `backendConversationId` est optionnel et non absent : les conversations
     * venues du backend le portent (c'est la clé de rollback côté serveur),
     * celles reconstruites depuis la mémoire locale non. Le type l'omettait,
     * alors que `projectConversationCheckpoints` le lit — TS2339 masqué par
     * `@ts-nocheck`. Le lire restait correct à l'exécution, mais rien
     * n'empêchait plus de le supprimer par erreur.
     */
    const [archivedProjectConversations, setArchivedProjectConversations] = useState<
      Array<{
        id: string;
        title?: string;
        messages: Message[];
        createdAt?: string;
        updatedAt?: string;
        backendConversationId?: string;
      }>
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
            console.warn('Git synchronization request failed', {
              intent,
              status: response.status,
              serverError: result.error,
            });
            toast.error(
              t('baseChatAst.git.failedHttp', {
                action: t(intent === 'push' ? 'baseChatAst.git.push' : 'baseChatAst.git.pull'),
                status: response.status,
              }),
            );

            return;
          }

          toast.success(
            t('baseChatAst.git.completed', {
              action: t(intent === 'push' ? 'baseChatAst.git.push' : 'baseChatAst.git.pull'),
            }),
          );

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
          console.error('Git synchronization failed', { intent, error });
          toast.error(
            t('baseChatAst.git.failed', {
              action: t(intent === 'push' ? 'baseChatAst.git.push' : 'baseChatAst.git.pull'),
            }),
          );
        } finally {
          setStatusbarGitBusy(false);
        }
      },
      [projectId, statusbarGitBranch, statusbarGitBusy, t],
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
    const gardeDeRestauration = useRef(creerGardeDeRestauration());
    const pendingProjectSelectedFile = useRef<string | undefined>(undefined);
    const scrollUpdateFrame = useRef<number | null>(null);
    const agentComposerRef = useRef<HTMLDivElement | null>(null);

    /*
     * BUG-IDE-PANEL-RESOLUTION-001 — une seule résolution, explicite, pour tout
     * l'IDE. `agent`/`chat` sont acceptés (le dock Agent est un panneau
     * affichable), les alias historiques sont canonisés dans l'URL, et une clé
     * inconnue n'est plus muette : elle est signalée et retirée de l'URL au
     * lieu d'afficher un panneau que personne n'a demandé.
     */
    const warnedUnknownPanelRef = useRef<string | undefined>(undefined);
    const projectPanelResolution = useMemo(() => resolveIdePanelKey(searchParams.get('panel')), [searchParams]);

    const activeProjectPanel =
      projectPanelResolution.status === 'canonical' || projectPanelResolution.status === 'alias'
        ? projectPanelResolution.panel
        : '';

    const setProjectPanelSearchParam = useCallback(
      (panel?: string) => {
        /*
         * BUG-IDE-PANEL-RECLICK-REPROVISION-001 — re-cliquer le panneau DÉJÀ
         * ACTIF ne doit déclencher AUCUNE navigation. setSearchParams avec une
         * valeur ?panel= inchangée est une navigation vers la même URL, que
         * React Router traite comme un refresh (defaultShouldRevalidate est
         * VRAI quand pathname+search sont identiques) : tous les loaders
         * repartaient, initialIdePanels changeait d'identité, chaque panneau de
         * service se rechargeait et la Webview repartait dans sa boucle de
         * démarrage — le « re-clic recharge tout l'IDE » constaté en prod. La
         * valeur est lue sur window.location (l'URL réellement affichée) pour
         * ne pas dépendre de l'identité changeante de searchParams.
         */
        if (
          typeof window !== 'undefined' &&
          isRedundantPanelSearchParamUpdate(new URLSearchParams(window.location.search), panel)
        ) {
          return;
        }

        setSearchParams((current) => withPanelSearchParam(current, panel));
      },
      [setSearchParams],
    );

    /*
     * Canonisation et traitement EXPLICITE de la clé d'URL.
     *  - alias connu (`chat`, `deploy`, `web`…) → l'URL est réécrite vers la clé
     *    canonique, pour que le lien partagé et l'état affiché coïncident ;
     *  - clé inconnue → message visible + paramètre retiré, au lieu du repli
     *    muet sur `deployments` qui affichait un panneau jamais demandé.
     */
    useEffect(() => {
      if (!projectIdeMode) {
        return;
      }

      if (projectPanelResolution.status === 'alias') {
        setProjectPanelSearchParam(projectPanelResolution.panel);
        return;
      }

      if (projectPanelResolution.status === 'unknown') {
        // Un seul message par clé : `searchParams` change d'identité à chaque rendu.
        if (warnedUnknownPanelRef.current !== projectPanelResolution.requested) {
          warnedUnknownPanelRef.current = projectPanelResolution.requested;
          toast.warn(t('chat.copy.unknownIdePanel_9d1c4b70', { value0: projectPanelResolution.requested }));
        }

        setProjectPanelSearchParam(undefined);
      }
    }, [projectIdeMode, projectPanelResolution, setProjectPanelSearchParam, t]);

    /*
     * Le panneau de service affiché sur la surface mobile « deploy ». Il ne se
     * déduit plus par défaut : il ne change QUE lorsqu'une clé résolue désigne
     * réellement un panneau de service. L'en-tête lit la même valeur, donc
     * en-tête et contenu ne peuvent plus diverger (« Agent » au-dessus de
     * Déploiements), quel que soit l'ordre de montage des onglets.
     */
    const activeMobileServicePanel = mobileServicePanel;

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
    /*
     * Must stay identical to `hasLivePreviewPort`: a URL is stamped on EVERY port
     * the API reports, so the old `|| Boolean(port.url)` made this vacuously true
     * and wiped genuine runtime errors out of Problems the moment any port existed
     * (SOLUTIONS_REAL_PROOF_BLOCKERS.md §5).
     */
    const previewPortLive = hasLivePreviewPort(runtimePorts);
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
    const mobilePreviewRunLabel = compactPreviewRunAriaLabel(mobilePreviewRunState, language);
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
        runtimeStatusText(t, {
          workspaceStatus: projectRuntimeState.workspace,
          ports: runtimePorts,
          workspaceLoading,
          workspaceError,
        }),
      [projectRuntimeState.workspace, runtimePorts, t, workspaceError, workspaceLoading],
    );
    const runtimePortSummary = useMemo(
      () =>
        previewPortText(t, {
          previews: runtimePreviews,
          workspaceLoading,
          workspaceError,
          previewServerState,
        }),
      [previewServerState, runtimePreviews, t, workspaceError, workspaceLoading],
    );
    const runtimePortCompactSummary = useMemo(
      () =>
        previewPortCompactText(t, {
          previews: runtimePreviews,
          workspaceLoading,
          workspaceError,
          previewServerState,
        }),
      [previewServerState, runtimePreviews, t, workspaceError, workspaceLoading],
    );
    const runtimeDevServerSummary = useMemo(
      () =>
        devServerStatusText(t, {
          previews: runtimePreviews,
          workspaceLoading,
          workspaceError,
          logs: workspaceLogs,
          previewServerState,
        }),
      [previewServerState, runtimePreviews, t, workspaceError, workspaceLoading, workspaceLogs],
    );
    const workspaceStatusLabel = useMemo(() => {
      // A live serving port means Running — beats a stale error or a lagging status.
      if (isRuntimeReallyRunning || previewPortLive) {
        return t('baseChatAst.status.running');
      }

      if (workspaceError) {
        return t('baseChatAst.status.error');
      }

      if (workspaceLoading) {
        return t('baseChatAst.status.starting');
      }

      const status = projectRuntimeState.workspace?.status?.toLowerCase();

      if (status === 'running') {
        return t('baseChatAst.status.running');
      }

      if (status === 'booting' || status === 'starting') {
        return t('baseChatAst.status.starting');
      }

      return projectRuntimeState.workspace?.status
        ? platformStateLabel(t, projectRuntimeState.workspace.status)
        : t('baseChatAst.status.stopped');
    }, [isRuntimeReallyRunning, previewPortLive, projectRuntimeState.workspace, t, workspaceError, workspaceLoading]);
    const handleMobilePreviewRunToggle = useCallback(() => {
      setMobileIdePanel('preview');
      setProjectPanelSearchParam('preview');

      if (isMobilePreviewRunActive) {
        setMobilePreviewRunFeedbackState('stopping');
        void workbenchStore.stopPreviewServer().catch((error) => {
          setMobilePreviewRunFeedbackState(null);
          console.error('Preview server stop failed', error);
          toast.error(t('baseChatAst.preview.stopFailed'));
        });

        return;
      }

      setMobilePreviewRunFeedbackState('starting');
      void workbenchStore.startPreviewServer().catch((error) => {
        setMobilePreviewRunFeedbackState(null);
        console.error('Preview server start failed', error);
        toast.error(t('baseChatAst.preview.startFailed'));
      });
    }, [isMobilePreviewRunActive, setMobileIdePanel, setProjectPanelSearchParam, t]);
    const workspaceStatusTitle = useMemo(
      () =>
        [
          t('baseChatAst.runtime.workspaceState', { status: workspaceStatusLabel }),
          workspaceError,
          quotaWarning,
          billingUpgradePrompt,
          workspaceLogs.length > 0 ? t('baseChatAst.runtime.logLines', { count: workspaceLogs.length }) : undefined,
        ]
          .filter(Boolean)
          .join(' | '),
      [billingUpgradePrompt, quotaWarning, t, workspaceError, workspaceLogs.length, workspaceStatusLabel],
    );
    useEffect(() => {
      setDiagnosticsForSource(
        'runtime',
        projectIdeMode
          ? buildRuntimeDiagnostics({
              workspaceError,
              workspaceLogs,

              /*
               * Un refus de quota (429) n'était visible que dans une infobulle :
               * Problèmes annonçait « Aucun problème détecté » alors que l'espace
               * de travail ne pouvait pas démarrer. Il remonte ici comme les
               * autres conditions bloquantes.
               */
              quotaWarning,
              quotaUpgrade: billingUpgradePrompt,

              /*
               * Once a forwarded port is serving, drop the stale cold-start 500/502
               * provisioning errors (workspaceError AND log-derived) from Problems.
               */
              previewLive: previewPortLive,
            })
          : [],
      );
    }, [
      projectIdeMode,
      setDiagnosticsForSource,
      workspaceError,
      workspaceLogs,
      previewPortLive,
      quotaWarning,
      billingUpgradePrompt,
    ]);

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
      ? ({
          state: 'offline',
          label: t('chat.copy.offline_e01fa717'),
          color: 'var(--vc-ide-accent-error)',
          text: t('chat.copy.varStatusErrorText_f1e5857c'),
        } as const)
      : /*
         * BUG-IDE-008 — `runtimeWorkspaceStatus` est une WorkspaceSession, PAS une
         * chaîne. Les deux comparaisons `=== 'STARTING'` / `=== 'PENDING'` étaient
         * donc TOUJOURS fausses (TS2367, que le `@ts-nocheck` en tête de fichier
         * empêchait de voir).
         *
         * Conséquence réelle : pendant tout le démarrage à froid, la barre de statut
         * annonçait « Connected » au lieu de « Reconnecting ». Le produit affirmait
         * une connexion qui n'existait pas encore.
         *
         * On lit le champ `status` et on compare en minuscules, comme le fait déjà
         * `workspaceUiState` : le domaine de valeurs mélange les casses selon la
         * source.
         */
        workspaceLoading ||
          ['starting', 'booting', 'pending'].includes(runtimeWorkspaceStatus?.status?.toLowerCase() ?? '')
        ? ({
            state: 'reconnecting',
            label: t('chat.copy.reconnecting_9d80f91f'),
            color: 'var(--vc-ide-accent-warning)',
            text: t('chat.copy.varStatusWarningText_58e57537'),
          } as const)
        : ({
            state: 'connected',
            label: t('chat.copy.connected_c2f9b7b4'),
            color: 'var(--vc-ide-accent-success)',
            text: t('chat.copy.varStatusSuccessText_8712f526'),
          } as const);

    const projectConversationCheckpoints = useMemo<ProjectConversationCheckpoint[]>(() => {
      if (!projectIdeMode || !projectId) {
        return [];
      }

      const conversationSources = [
        ...archivedProjectConversations.map((conversation) => ({
          id: conversation.id,
          title: conversation.title ?? t('baseChatAst.conversation.project'),
          messages: conversation.messages,
          createdAt: conversation.createdAt,
          updatedAt: conversation.updatedAt,
          backendConversationId: conversation.backendConversationId,
        })),
        {
          id: `project:${projectId}`,
          title: t('chat.copy.currentProjectConversation_1df5a771'),
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

          const title = shortContent(
            lastUserMessage?.content,
            t('baseChatAst.snapshot.checkpoint', { count: checkpointNumber }),
          );

          const description = shortContent(message.content, t('baseChatAst.snapshot.agentResponse'));

          checkpoints.push({
            id: `${conversation.id}:${message.id ?? index}`,
            title,
            description,
            messageId: message.id,
            messageIndex: index,
            conversationId: conversation.id,
            conversationTitle: conversation.title,
            createdAt,
            ageLabel: timeAgo(t, language, createdAt ?? snapshot?.createdAt ?? conversation.createdAt),
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
                ? t('baseChatAst.conversation.waiting')
                : shortContent(lastMessage.content, t('baseChatAst.conversation.checkpoint')),
            messageId: lastMessage.id,
            messageIndex: conversation.messages.length - 1,
            conversationId: conversation.id,
            conversationTitle: conversation.title,
            createdAt,
            ageLabel: timeAgo(t, language, createdAt ?? snapshot?.createdAt ?? conversation.createdAt),
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
          title: shortContent(
            sourceMessages.find((message) => message.role === 'user')?.content,
            t('baseChatAst.conversation.currentChat'),
          ),
          description: t('chat.copy.currentProjectConversation_1df5a771'),
          messageId: lastMessage.id,
          messageIndex: sourceMessages.length - 1,
          conversationId: `project:${projectId}`,
          conversationTitle: t('baseChatAst.conversation.current'),
          createdAt,
          ageLabel: timeAgo(t, language, createdAt ?? snapshot?.createdAt),
          commitSha: snapshot?.id?.slice(0, 8),
          snapshot,
          messages: sourceMessages,
        });
      }

      return checkpoints.reverse();
    }, [
      archivedProjectConversations,
      currentAiConversationId,
      messages,
      projectId,
      projectIdeMode,
      projectSnapshots,
      language,
      t,
    ]);
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
          t,
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
        t,
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
      ? t('baseChatAst.mobile.working')
      : chatStarted || visibleProjectMessageCount > 0
        ? t('baseChatAst.mobile.messageCount', { count: visibleProjectMessageCount })
        : t('baseChatAst.mobile.ready');

    const shouldShowMobileAgentStartState = projectIdeMode && useMobileIde && visibleProjectMessageCount === 0;

    const mobileAgentContextLabel = mobileAgentSelectedFileLabel
      ? mobileAgentSelectedFileLabel
      : mobileAgentFileCount > 0
        ? t('baseChatAst.mobile.filesLoaded', { count: mobileAgentFileCount })
        : t('baseChatAst.mobile.workspaceReady');
    useEffect(() => {
      setProjectStateReady(!projectIdeMode || !projectId);
      gardeDeRestauration.current.oublier();
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
              title: conversation.title || t('baseChatAst.conversation.project'),
              messages: hydratedMessages,
              createdAt: conversation.createdAt,
              updatedAt: conversation.createdAt,
              backendConversationId: conversation.id!,
            };
          }),
        );

        /*
         * Même correction qu'en mémoire : `filter(Boolean)` retire bien les
         * conversations dont l'hydratation a échoué (retour `undefined`), mais
         * seul un prédicat de type le dit à TypeScript.
         */
        return hydrated.filter((conversation): conversation is NonNullable<typeof conversation> =>
          Boolean(conversation),
        );
      }

      async function loadProjectConversationMemory() {
        try {
          const memory = await getProjectIdeMemory(safeProjectId, safeWorkspaceId);

          /*
           * Prédicat de type et non simple booléen : le filtre RETIRE bien les
           * entrées nulles à l'exécution, mais sans `is` TypeScript garde
           * `possibly undefined` sur chaque élément (TS18048, masqué par
           * `@ts-nocheck`). Le comportement est identique ; c'est le type qui
           * décrit enfin ce que le filtre garantit.
           */
          const memoryConversations = (memory?.chat?.conversations ?? []).filter(
            (conversation): conversation is NonNullable<typeof conversation> =>
              Boolean(conversation) && Array.isArray(conversation?.messages),
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
      if (!projectIdeMode || !projectId || !gardeDeRestauration.current.peutLancer(projectId)) {
        return undefined;
      }

      let cancelled = false;

      const jeton = gardeDeRestauration.current.lancer(projectId);

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

          /*
           * RPL-IDE-001.1 — restore this window's own layout slice. window-main
           * keeps reading the legacy top-level fields; secondary windows read
           * their entry from the per-window map.
           */
          const windowSlice = isSecondaryProjectEditorWindow
            ? ui?.projectEditorWindows?.[projectEditorWindowId]
            : { paneTree: ui?.paneTree, activePaneId: ui?.activePaneId, floatingPanes: ui?.floatingPanes };

          const restoredTree =
            windowSlice?.paneTree && typeof windowSlice.paneTree === 'object'
              ? normalizePaneTree(windowSlice.paneTree)
              : undefined;

          /*
           * Ne pas écraser une disposition que l'utilisateur vient de changer.
           *
           * Tracé le 2026-09-02 : split demandé à t=24 104 ms, restauration
           * appliquée à t=24 361 ms — le split avait disparu. Tant que la
           * restauration n'aboutissait jamais, le défaut restait invisible ;
           * la réparer l'a mis au jour.
           */
          const dispositionIntacte = laDispositionPeutEtreRestauree(paneTreeRef.current, cloneDefaultPaneTree());

          if (restoredTree && dispositionIntacte) {
            setPaneTree(restoredTree);
          }

          const restoredFloating = normalizeFloatingPanes(windowSlice?.floatingPanes);

          if (dispositionIntacte) {
            setFloatingPanes(restoredFloating);
          }

          const dockedLeafIds = new Set(restoredTree ? flattenPaneLeafIds(restoredTree) : flattenPaneLeafIds(paneTree));
          restoredFloating.forEach((floating) => dockedLeafIds.add(floating.pane.id));

          const restoredActivePaneId =
            typeof windowSlice?.activePaneId === 'string' && dockedLeafIds.has(windowSlice.activePaneId)
              ? windowSlice.activePaneId
              : restoredTree
                ? (findFirstLeaf(restoredTree)?.id ?? 'pane-main')
                : 'pane-main';

          if (dispositionIntacte) {
            setActivePaneId(restoredActivePaneId);
          }

          if (restoredTree) {
            projectEditorWindowSyncRef.current = projectEditorLayoutSignature(
              restoredTree,
              restoredFloating,
              restoredActivePaneId,
            );
          }

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
            if (projectFilesRef.current[ui.selectedFile]?.type === 'file') {
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

          /*
           * Le garde se pose ICI, après une restauration réellement appliquée —
           * jamais à l'entrée de l'opération.
           */
          gardeDeRestauration.current.reussir(projectId);
        })
        .catch((error) => {
          console.error('Failed to restore project IDE state', error);
        })
        .finally(() => {
          gardeDeRestauration.current.liberer(jeton);
          window.clearTimeout(restoreFallbackTimer);

          if (!cancelled) {
            setProjectStateReady(true);
          }
        });

      return () => {
        cancelled = true;
        gardeDeRestauration.current.liberer(jeton);
        window.clearTimeout(restoreFallbackTimer);
      };
    }, [activeProjectPanel, projectIdeMode, projectId, currentWorkspaceId]);

    useEffect(() => {
      const pendingSelectedFile = pendingProjectSelectedFile.current;

      const resolvedPendingFile = resolvePendingSelectedFile(projectFiles, pendingSelectedFile);

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
              ? { description: chatKey('chat.copy.keepThisTabVisibleInThe_506ff6ed'), shortcut: 'Alt+P' }
              : normalizedLabel.startsWith('Close ')
                ? {
                    description: chatKey('chat.copy.closeThisViewWithoutDeletingFiles_8643fd37'),
                    shortcut: 'Cmd+W',
                  }
                : normalizedLabel.startsWith('Save ')
                  ? {
                      description: chatKey('chat.copy.saveTheCurrentFileImmediatelyAutosave_0d1746e1'),
                      shortcut: 'Cmd+S',
                    }
                  : undefined);
          const tooltip = contextualHelp
            ? `${normalizedLabel}. ${t(contextualHelp.description)}${
                contextualHelp.shortcut
                  ? ` ${t('chat.copy.shortcutValue', { shortcut: contextualHelp.shortcut })}.`
                  : ''
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
    }, [projectIdeMode, t]);

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
        /*
         * RPL-IDE-001.1 — persist this window's layout slice, merging the
         * per-window map so sibling windows opened in other tabs survive.
         */
        const existingWindows = getProjectIdeMemorySync(projectId, currentWorkspaceId)?.ui?.projectEditorWindows ?? {};

        const windowSlice = {
          paneTree,
          activePaneId,
          floatingPanes,
          updatedAt: new Date().toISOString(),
        };

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

              /*
               * Only the primary window owns the legacy top-level fields; a
               * secondary window must never clobber window-main's tree.
               */
              ...(isSecondaryProjectEditorWindow ? {} : { paneTree, activePaneId, floatingPanes }),
              projectEditorWindows: { ...existingWindows, [projectEditorWindowId]: windowSlice },
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
      floatingPanes,
      projectEditorWindowId,
      isSecondaryProjectEditorWindow,
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

    /**
     * RPL-IDE-001.1 — cross-tab coherence. Storage events only fire in OTHER
     * tabs, so this never echoes our own writes. When another tab persists THIS
     * window's slice (e.g. the same window open on a second screen), mirror it;
     * distinct windows write distinct map keys, so their slices stay untouched.
     */
    useEffect(() => {
      if (!projectIdeMode || !projectId) {
        return undefined;
      }

      const unsubscribe = subscribeProjectIdeMemory(
        projectId,
        (memory) => {
          const slice = isSecondaryProjectEditorWindow
            ? memory.ui?.projectEditorWindows?.[projectEditorWindowId]
            : {
                paneTree: memory.ui?.paneTree,
                activePaneId: memory.ui?.activePaneId,
                floatingPanes: memory.ui?.floatingPanes,
              };

          if (!slice?.paneTree || typeof slice.paneTree !== 'object') {
            return;
          }

          const nextTree = normalizePaneTree(slice.paneTree);
          const nextFloating = normalizeFloatingPanes(slice.floatingPanes);

          const nextActive =
            typeof slice.activePaneId === 'string' ? slice.activePaneId : (findFirstLeaf(nextTree)?.id ?? 'pane-main');

          const signature = projectEditorLayoutSignature(nextTree, nextFloating, nextActive);

          if (signature === projectEditorWindowSyncRef.current) {
            return;
          }

          projectEditorWindowSyncRef.current = signature;
          setPaneTree(nextTree);
          setFloatingPanes(nextFloating);
          setActivePaneId(nextActive);
        },
        currentWorkspaceId,
      );

      return unsubscribe;
    }, [projectId, projectIdeMode, currentWorkspaceId, projectEditorWindowId, isSecondaryProjectEditorWindow]);

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

    const openCommandPalette = useCallback((mode: 'all' | 'tools' | 'files' | 'spotlight' = 'all') => {
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
          /*
           * AV-UX point 6 — tapping "Partager" used to only fire a clipboard
           * write after the sheet unmounted: no surface ever opened, and on
           * iOS the write itself could be rejected once the gesture was gone,
           * so the tap looked like a no-op. Copy the link as a best-effort
           * side effect while the tap gesture is still alive, then OPEN the
           * Collaborators panel — the surface that owns the project share
           * link (the same one the desktop "Invite" button opens).
           */
          const projectLink = `${window.location.origin}${projectUrl ?? `/projects/${projectId}`}`;

          if (navigator.clipboard?.writeText) {
            void navigator.clipboard
              .writeText(projectLink)
              .then(() => toast.success(t('chat.copy.projectLinkCopied_d1bf8999')))
              .catch((error) => console.error('Project link copy failed', error));
          }

          openWorkspacePanel('collaborators', { replaceUrl: false });
          setProjectPanelSearchParam('collaborators');
          setMobileIdePanel('deploy', { activeTabId: 'collaborators' });
          closeMobileOverlays();

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

      /*
       * SCR-006 — le clic sur le nom du projet doit ouvrir la recherche
       * « Rechercher des outils et des fichiers », pas la visite guidée.
       *
       * La palette vit ici, le nom du projet vit dans la route de l'IDE : il
       * faut donc un canal. `vibecore:keybinding-run` ne convenait pas — il est
       * ÉMIS par cette coque pour être observé, jamais consommé, donc le
       * déclencher n'ouvrirait rien. On suit le modèle éprouvé de
       * `vibecore:open-project-ide-panel`.
       *
       * `Cmd+K`, lui, était déjà relié à la même palette par l'action
       * `command.palette` — la moitié clavier de la demande fonctionnait déjà.
       */
      const handleOpenCommandPalette = (event: Event) => {
        const mode = (event as CustomEvent<{ mode?: 'all' | 'tools' | 'files' }>).detail?.mode;

        openCommandPalette(mode ?? 'all');
      };

      window.addEventListener('vibecore:open-project-ide-panel', handleOpenProjectIdePanel);
      window.addEventListener('vibecore:open-command-palette', handleOpenCommandPalette);

      return () => {
        window.removeEventListener('vibecore:open-project-ide-panel', handleOpenProjectIdePanel);
        window.removeEventListener('vibecore:open-command-palette', handleOpenCommandPalette);
      };
    }, [activateMobileTool, openCommandPalette, openIdeTool, projectIdeMode, useMobileIde]);

    /*
     * RPL-IDE-001.8 — the app name lives in the topbar (`projects.$projectId.ide.tsx`)
     * while Spotlight is rendered here, inside the workspace shell. They talk over
     * the same window-event channel the topbar already uses to open tool panels,
     * rather than threading a callback through the whole route tree.
     */
    useEffect(() => {
      if (!projectIdeMode) {
        return undefined;
      }

      const handleOpenSpotlight = (event: Event) => {
        const name = (event as CustomEvent<{ projectName?: string }>).detail?.projectName;

        if (name) {
          setSpotlightProjectName(name);
        }

        openCommandPalette('spotlight');
      };

      window.addEventListener('vibecore:open-project-spotlight', handleOpenSpotlight);

      return () => window.removeEventListener('vibecore:open-project-spotlight', handleOpenSpotlight);
    }, [openCommandPalette, projectIdeMode]);

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

      // Le dock Agent est un panneau affichable : `?panel=agent` doit l'ouvrir, pas être ignoré.
      if (activeProjectPanel === IDE_AGENT_PANEL) {
        if (useMobileIde) {
          setMobileIdePanel('chat');
        } else {
          setProjectAgentPanelOpen(true);
        }

        return;
      }

      if (isIdeWorkspacePanel(activeProjectPanel)) {
        if (useMobileIde) {
          const target = ideMobileTarget(activeProjectPanel);
          setMobileIdePanel(target.surface, { activeTabId: target.tabId });

          return;
        }

        openWorkspacePanel(activeProjectPanel, { replaceUrl: false });
      }
    }, [
      activeProjectPanel,
      openWorkspacePanel,
      projectIdeMode,
      projectStateReady,
      setMobileIdePanel,
      setProjectAgentPanelOpen,
      useMobileIde,
    ]);

    /*
     * Audit v3 (M): surface save failures. Previously the result was
     * `.catch(() => undefined)`, so a failed write — including the
     * "Remote file changed since it was loaded" conflict guard and any
     * runtime write error — left the user believing the file was saved when
     * it was not (silent data loss).
     */
    const handleSaveError = useCallback(
      (error: unknown) => {
        console.error('Project file save failed', error);
        toast.error(t('baseChatAst.editor.saveFailed'));
      },
      [t],
    );

    const onProjectEditorSave = useCallback(() => {
      workbenchStore.saveCurrentDocument().catch(handleSaveError);
    }, [handleSaveError]);

    /*
     * Audit v3 (M): save a specific tab's file. The per-tab dirty-dot save
     * button used the generic `onProjectEditorSave`, which always saves the
     * *currently active* document — so clicking the dot on an inactive dirty
     * tab saved the wrong file. Target the tab's own path instead.
     */
    const saveProjectEditorFile = useCallback(
      (filePath: string) => {
        workbenchStore.saveFile(filePath).catch(handleSaveError);
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
          /*
           * BUG-IDE-013 — sur mobile, « Problèmes » ne doit PAS atterrir sur la
           * surface Terminal. Celle-ci est gelée (ref IMG_9149) et ignore
           * `bottomTerminalView` : elle affiche toujours le Shell. C'est
           * exactement ce qui faisait qu'un clic sur « Problèmes 1 0 »
           * n'ouvrait jamais le moindre diagnostic. On ouvre donc le panneau
           * dédié, sans toucher à la surface gelée.
           */
          if (view === 'problems') {
            openWorkspacePanel('problems', { replaceUrl: false });
            setProjectPanelSearchParam('problems');
            setMobileIdePanel('deploy', { activeTabId: 'problems' });

            return;
          }

          setMobileIdePanel('terminal');

          return;
        }

        setTerminalBottomOpen(true);
      },
      [openWorkspacePanel, setMobileIdePanel, setProjectPanelSearchParam, useMobileIde],
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
            ...localizeProjectKeybindings(PROJECT_KEYBINDINGS, language),
            ...Array.from({ length: 9 }, (_, index) => createProjectFocusTabKeybinding(index + 1, language)),
            {
              combo: 'cmd+tab',
              action: 'tab.next',
              label: t('chat.copy.nextTab_84c508a2'),
              description: t('chat.copy.cycleToTheNextOpenWorkspace_0b3b1e8d'),
              category: 'Workbench' as const,
              preventDefault: true,
            },
          ],
          projectKeybindingOverrides,
        ),
      [language, projectKeybindingOverrides, t],
    );

    useKeybindings({
      /*
       * SCR-006 — `Cmd+K` doit ouvrir la recherche AUSSI sur les coques mobile
       * et tablette. Le raccourci y était purement et simplement désactivé :
       * mesuré live à 390 et 768, la palette n'était même pas dans le DOM et le
       * focus restait sur `BODY`. Une tablette avec clavier est exactement le
       * cas où l'utilisateur l'attend. Le contexte expose déjà `useMobileIde`,
       * donc une liaison qui n'a pas de sens sur mobile peut s'en exclure
       * elle-même ; les actions restantes y sont des no-ops inoffensifs.
       */
      enabled: projectIdeMode,
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

        // BUG-AGENT-003 : un échec d'orchestration doit dégrader la ligne de statut.
        setAgentRunFailed(isAgentRunFailed(data));

        // BUG-UX-AGENT-DONE-FALSE : un run partiel / à faible accord ne peut pas s'afficher « Terminé » tout court.
        setAgentRunDegraded(isAgentRunDegraded(data));
      }
    }, [data]);
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
            networkToastRef.current.offline = toast.warn(t('chat.copy.connectionLostReconnecting_f155d22d'), {
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
            toast.success(t('chat.copy.reconnected_43e3de6a'), { autoClose: 2500, icon: false });
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
              toast.error(t('chat.copy.microphoneAccessIsBlockedAllowThe_84aa8fa0'), {
                toastId: 'mic-permission-blocked',
              });
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
              throw new Error(t('baseChatAst.models.loadFailedHttp', { status: response.status }));
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
            setModelError(t('baseChatAst.models.loadFailed'));
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
          throw new Error(
            t('baseChatAst.models.providerLoadFailedHttp', {
              provider: providerName,
              status: response.status,
            }),
          );
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
        toast.error(t('chat.copy.speechRecognitionIsNotAvailableIn_af2b2f6a'), { toastId: 'speech-unavailable' });
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
          element.onerror = () => reject(new Error(t('baseChatAst.images.decodeFailed', { file: file.name })));
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
        language,
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
          toast.error(
            t(source === 'selected' ? 'baseChatAst.images.readSelectedFailed' : 'baseChatAst.images.readPastedFailed'),
          );
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
          const action = inferAgentToolAction(t, rawMessage);

          if (action) {
            setAgentToolAction(action);
          }

          const mentionedFiles = resolveMentionedProjectFiles(rawMessage, projectFilePaths);
          const mentionedSymbols = resolveMentionedProjectSymbols(rawMessage, projectFiles);

          const agentMessage = buildProjectAgentPrompt({
            t,
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
        t,
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
            toast.error(describeSnapshotRestoreFailure(response.status, payload, language));

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
        toast.error(describeSnapshotRestoreFailure(0, undefined, language));
      } finally {
        setRollbackBusy(false);
      }
    }, [projectId, currentWorkspaceId, language, rollbackDatabase, rollbackTarget]);

    const headerPresence = useMemo(
      () => dedupeCollaborationPresence(headerCollaboration.snapshot?.presence ?? []),
      [headerCollaboration.snapshot?.presence],
    );

    const headerPresenceTooltip = collaborationPresenceTooltip(t, language, headerPresence);

    const copyProjectConversation = useCallback(async () => {
      const currentMessages = messages ?? [];

      if (!currentMessages.length) {
        toast.info(t('chat.copy.noConversationToCopy_cac64e35'));
        return;
      }

      if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
        toast.error(t('chat.copy.clipboardIsUnavailable_977bef31'));
        return;
      }

      try {
        await navigator.clipboard.writeText(conversationTranscript(t, currentMessages, description));
        toast.success(t('chat.copy.conversationCopied_f68386e5'));
      } catch (error) {
        console.error('Conversation copy failed', error);
        toast.error(t('baseChatAst.clipboard.copyFailed'));
      }
    }, [description, messages, t]);

    const clearProjectConversation = useCallback(() => {
      const currentMessages = messages ?? [];

      if (!currentMessages.length) {
        toast.info(t('chat.copy.noHistoryToClear_790efa27'));
        return;
      }

      setConfirmClearHistoryOpen(true);
    }, [messages]);

    const confirmClearProjectConversation = useCallback(() => {
      setConfirmClearHistoryOpen(false);
      resetChat?.();
      toast.success(t('chat.copy.historyCleared_5a2d82b8'));
    }, [resetChat]);

    const exportProjectConversation = useCallback(() => {
      const currentMessages = messages ?? [];

      if (!currentMessages.length) {
        toast.info(t('chat.copy.noConversationToExport_424b736d'));
        return;
      }

      const title = description?.trim() || t('baseChatAst.conversation.project');
      const exportDate = new Date().toISOString();

      const payload = {
        title,
        projectId,
        exportDate,
        messages: currentMessages,
        transcript: conversationTranscript(t, currentMessages, title),
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
      toast.success(t('chat.copy.conversationExported_1fd2dd87'));
    }, [description, messages, projectId, t]);

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
          title={t('chat.copy.clearConversationHistory_95f3d926')}
          description={t('chat.copy.theHistoryOfThisConversationIs_36dfc6fb')}
          confirmLabel={t('chat.copy.clearHistory_53b5158b')}
          variant="destructive"
        />
        {useMobileIde && conversationHistoryOpen && (
          <div
            className="bolt-project-conversation-history"
            role="dialog"
            aria-label={t('chat.copy.projectAgentHistory_c9f06d3e')}
          >
            <div className="bolt-project-conversation-history-head">
              <div>
                <strong>{t('chat.copy.agentHistory_c783eeb3')}</strong>
                <span>
                  {t('baseChatAst.counts.checkpointsFiltered', {
                    shown: filteredProjectConversationCheckpoints.length,
                    count: projectConversationCheckpoints.length,
                  })}
                </span>
              </div>
              <button
                type="button"
                className="bolt-project-ide-icon-button"
                aria-label={t('chat.copy.closeHistory_7bf06ef3')}
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
                placeholder={t('chat.copy.searchCheckpointsCommitsPromptsOrAgent_7b472db0')}
                aria-label={t('chat.copy.searchAgentCheckpoints_471244eb')}
                onChange={(event) => setConversationHistoryQuery(event.currentTarget.value)}
              />
              {conversationHistoryQuery && (
                <button
                  type="button"
                  aria-label={t('chat.copy.clearHistorySearch_9758bed5')}
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
                        {checkpoint.commitSha ? ` - ${checkpoint.commitSha}` : ''}
                      </small>
                    </div>
                    <div className="bolt-project-history-checkpoint-actions">
                      <button
                        type="button"
                        aria-label={t('chat.copy.viewChatAtCheckpointValue0_7e82ca09', { value0: checkpoint.title })}
                        onClick={() => viewProjectCheckpoint(checkpoint)}
                      >
                        {t('chat.copy.viewChat_7dd435d1')}
                      </button>
                      <button
                        type="button"
                        disabled={!rollbackAvailable}
                        aria-label={t('chat.copy.rollbackToCheckpointValue0_2131e13b', { value0: checkpoint.title })}
                        onClick={() => {
                          setRollbackDatabase(false);
                          setRollbackTarget(checkpoint);
                        }}
                      >
                        {t('chat.copy.rollbackHere_643ef4ec')}
                      </button>
                      <button
                        type="button"
                        aria-label={t('chat.copy.reviewDiffForCheckpointValue0_7903beba', { value0: checkpoint.title })}
                        onClick={() => openCheckpointChanges(checkpoint)}
                      >
                        {t('chat.copy.reviewDiff_cfcf10aa')}
                      </button>
                    </div>
                  </article>
                );
              })}
              {!projectConversationCheckpoints.length && (
                <div className="bolt-project-history-empty">{t('chat.copy.noProjectAgentHistoryYet_3aa0ec67')}</div>
              )}
              {projectConversationCheckpoints.length > 0 && !filteredProjectConversationCheckpoints.length && (
                <div className="bolt-project-history-empty">{t('chat.copy.noCheckpointsMatchThisSearch_aef33bf2')}</div>
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
              {t('chat.copy.turnIdeasIntoWorkingSoftware_c5341c2f')}
            </h1>
            <p className="text-md lg:text-xl mb-8 text-bolt-elements-textSecondary animate-fade-in animation-delay-200">
              {t('chat.copy.describeWhatYouWantToBuild_c9de63b3')}
            </p>
          </div>
        ) : null}
        {/*
         * `resize` pilote l'animation quand le CONTENU change de taille alors
         * qu'on est collé en bas. En « smooth », `useStickToBottom` lance un
         * ressort qui pousse `scrollTop` image par image vers la nouvelle fin.
         * Pendant un stream la cible bouge à chaque jeton : le ressort la
         * poursuit sans jamais l'atteindre, et le transcript n'arrête plus de
         * glisser. Sur une fenêtre de lecture courte — un téléphone — c'est
         * exactement le « ça saute » signalé.
         *
         * En « instant », la bibliothèque fait une seule affectation
         * (`state.scrollTop = state.calculatedTargetScrollTop`) : le bas reste
         * collé, sans animation qui court après lui.
         *
         * `initial` reste en « smooth » : c'est l'animation d'ARRIVÉE sur le
         * fil, jouée une fois, jamais pendant le stream.
         */}
        <StickToBottom
          className={classNames('pt-6 px-2 sm:px-6 relative', {
            'h-full flex flex-col modern-scrollbar': chatStarted,
            'bolt-project-agent-scroll': projectIdeMode,
          })}
          resize="instant"
          initial="smooth"
        >
          <StickToBottom.Content
            className={classNames('flex flex-col gap-4 relative', {
              'bolt-project-agent-transcript': projectIdeMode,
            })}
            role={projectIdeMode ? 'log' : undefined}
            aria-live={projectIdeMode ? 'polite' : undefined}
            aria-relevant={projectIdeMode ? 'additions text' : undefined}
            aria-label={projectIdeMode ? t('chat.copy.agentConversationHistory_207d557d') : undefined}
          >
            {/*
             * Thin agent status line, sticky at the TOP of the panel (agent-panel
             * UX refonte, point 2). Full-bleed via negative margins that cancel the
             * scroll container's pt-6/px padding; stays pinned while the transcript
             * scrolls underneath it.
             */}
            {progressAnnotations && (
              <div className="sticky top-0 z-10 -mt-6 -mx-2 sm:-mx-6">
                {/*
                 * BUG-UX-AGENT-DONE-FALSE : le % vient du ratio d'actions de
                 * fichiers — il peut valoir 100 sur un projet cassé. `degraded`
                 * injecte la santé réelle : erreurs dans Problèmes, orchestration
                 * partielle / accord faible / rôles incomplets, ou carte
                 * « Erreur d'aperçu » encore active. La ligne affiche alors
                 * « Terminé avec des erreurs », jamais une coche verte.
                 */}
                <ProgressCompilation
                  data={progressAnnotations}
                  streaming={isStreaming}
                  failed={Boolean(llmErrorAlert) || agentRunFailed}
                  degraded={
                    agentRunDegraded ||
                    diagnosticErrorCount > 0 ||
                    Boolean(actionAlert && actionAlert.source === 'preview')
                  }
                />
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
                      {t('chat.copy.open_6f4789b0')}
                    </button>
                  </div>
                )}
              </div>
              {projectIdeMode && isStreaming && (
                <div className="vc-sr-only" role="status" aria-live="polite">
                  {t('chat.copy.agentIsThinking_34aec774')}
                </div>
              )}
              {projectIdeMode &&
                !shouldShowMobileAgentStartState &&
                (!useMobileIde || visibleProjectMessageCount === 0) && (
                  <div className="bolt-project-agent-suggestions" aria-label={t('chat.copy.agentSuggestions_1622dc2b')}>
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
                    ? `${t(
                        (
                          PROJECT_AGENT_EXECUTION_MODES.find((mode) => mode.id === projectAgentExecutionMode) ??
                          PROJECT_AGENT_EXECUTION_MODES[2]
                        ).placeholder,
                      )}${projectPlanFirst ? ` ${t('chat.copy.planFirstSuffix')}` : ''}`
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

    /**
     * RPL-IDE-001.1/.2/.3 — apply a pure-engine transform to this window's live
     * state (docked tree + floating panes + active pane) and fan the result back
     * into the three React atoms atomically.
     */
    const applyProjectEditorWindowOp = useCallback(
      (op: (windowState: ProjectEditorWindowState) => ProjectEditorWindowState) => {
        const next = runProjectEditorWindowOp({ root: paneTree, floatingPanes, activePaneId }, op);

        if (next.root) {
          setPaneTree(next.root);
        }

        setFloatingPanes(next.floatingPanes);
        setActivePaneId(next.activePaneId);
      },
      [paneTree, floatingPanes, activePaneId],
    );

    /** RPL-IDE-001.2 — split a pane horizontally or vertically (engine-backed). */
    const splitActivePane = useCallback(
      (paneId: string, direction: 'horizontal' | 'vertical', tabId?: string) => {
        applyProjectEditorWindowOp((windowState) => engineSplitPane(windowState, { paneId, direction, tabId }));
      },
      [applyProjectEditorWindowOp],
    );

    const splitPaneRight = useCallback(
      (paneId: string, tabId?: string) => splitActivePane(paneId, 'horizontal', tabId),
      [splitActivePane],
    );

    const splitPaneDown = useCallback(
      (paneId: string, tabId?: string) => splitActivePane(paneId, 'vertical', tabId),
      [splitActivePane],
    );

    /** RPL-IDE-001.2 — persist a resized split ratio. */
    const setPaneSplitRatio = useCallback(
      (splitId: string, ratio: number) => {
        setPaneTree((currentTree) => {
          const next = runProjectEditorWindowOp({ root: currentTree, floatingPanes, activePaneId }, (windowState) =>
            engineSetSplitRatio(windowState, splitId, ratio),
          );

          return next.root ?? currentTree;
        });
      },
      [floatingPanes, activePaneId],
    );

    /** RPL-IDE-001.3 — float a docked pane, or dock a floating one back to origin. */
    const togglePaneFloating = useCallback(
      (paneId: string) => {
        const isFloating = floatingPanes.some((floating) => floating.pane.id === paneId);

        if (isFloating) {
          applyProjectEditorWindowOp((windowState) => engineDockPane(windowState, { paneId }));
          return;
        }

        // Keep at least one docked pane so the workspace never goes blank.
        if (countLeaves(paneTree) < 2) {
          return;
        }

        applyProjectEditorWindowOp((windowState) => engineFloatPane(windowState, { paneId }));
      },
      [applyProjectEditorWindowOp, floatingPanes, paneTree],
    );

    /** RPL-IDE-001.3 — move/resize a floating pane frame. */
    const changeFloatingPaneBounds = useCallback(
      (paneId: string, bounds: { x: number; y: number; width: number; height: number }) => {
        setFloatingPanes((current) => {
          const next = runProjectEditorWindowOp(
            { root: paneTree, floatingPanes: current, activePaneId },
            (windowState) => engineUpdateFloatingBounds(windowState, paneId, bounds),
          );

          return next.floatingPanes;
        });
      },
      [paneTree, activePaneId],
    );

    /** RPL-IDE-001.3 — raise a floating pane above its siblings. */
    const focusFloatingPane = useCallback(
      (paneId: string) => {
        applyProjectEditorWindowOp((windowState) => engineBringFloatingPaneToFront(windowState, paneId));
      },
      [applyProjectEditorWindowOp],
    );

    /**
     * RPL-IDE-001.1 — open the Project Editor in a new browser window/tab. The
     * new window carries a distinct `peWindow` id and starts from a seeded
     * layout (the chosen tab, or a fresh editor) persisted independently so both
     * screens stay coherent across reloads. The seed is merged into the existing
     * per-window map (see the shallow-merge caveat) so sibling windows survive.
     */
    const openProjectEditorWindow = useCallback(
      (sourceTab?: IdePaneTab) => {
        if (typeof window === 'undefined' || !projectId) {
          return;
        }

        const newWindowId = `window-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 6)}`;

        const seedTab = makePaneTab(sourceTab?.panel ?? 'editor', {
          ...(sourceTab?.filePath ? { filePath: sourceTab.filePath } : {}),
        });

        const seedPane: IdePaneLeaf = { type: 'leaf', id: 'pane-main', tabs: [seedTab], activeTabId: seedTab.id };

        const existingWindows = getProjectIdeMemorySync(projectId, currentWorkspaceId)?.ui?.projectEditorWindows ?? {};

        saveProjectIdeMemory(
          projectId,
          {
            ui: {
              projectEditorWindows: {
                ...existingWindows,
                [newWindowId]: {
                  paneTree: seedPane,
                  activePaneId: 'pane-main',
                  floatingPanes: [],
                  updatedAt: new Date().toISOString(),
                },
              },
            },
          },
          currentWorkspaceId,
        ).catch((error) => console.error('Failed to seed new Project Editor window', error));

        const url = new URL(window.location.href);
        url.searchParams.set(PROJECT_EDITOR_WINDOW_PARAM, newWindowId);
        window.open(url.toString(), '_blank', 'noopener');
      },
      [projectId, currentWorkspaceId],
    );

    /**
     * RPL-IDE-001.4 — move a tab to a slot in a (possibly different) pane.
     *
     * `toIndex` is the insertion slot expressed against the destination pane's
     * tab array **as it currently stands** ("insert before the tab at index i",
     * `tabs.length` meaning append). That is exactly what the engine's
     * `moveTab` expects for a cross-pane move; for a same-pane reorder the
     * engine's `reorderTab` wants a *post-removal* index instead, so the slot is
     * shifted down by one when the tab travels rightwards. Keeping the
     * conversion here means every call site — tab strip, pane body, keyboard —
     * speaks the same, simpler language.
     *
     * The previous implementation *swapped* the dragged tab with whatever tab
     * sat under the pointer. That is not the Replit/Cursor gesture: dropping a
     * tab on another pane must MOVE it there, leaving the source pane one tab
     * lighter (and collapsing it when it empties). Both behaviours now come from
     * the tested engine rather than being re-derived on the tree.
     */
    const moveProjectEditorTab = useCallback(
      (sourcePaneId: string, sourceTabId: string, targetPaneId: string, toIndex?: number) => {
        const sourceLeaf = findLeaf(paneTree, sourcePaneId) ?? findFloatingLeaf(floatingPanes, sourcePaneId);
        const targetLeaf = findLeaf(paneTree, targetPaneId) ?? findFloatingLeaf(floatingPanes, targetPaneId);
        const sourceTab = sourceLeaf?.tabs.find((tab) => tab.id === sourceTabId);

        if (!sourceLeaf || !targetLeaf || !sourceTab) {
          return;
        }

        if (sourcePaneId === targetPaneId) {
          const fromIndex = sourceLeaf.tabs.findIndex((tab) => tab.id === sourceTabId);

          const postRemovalIndex = samePaneReorderIndex(
            fromIndex,
            toIndex ?? sourceLeaf.tabs.length,
            sourceLeaf.tabs.length,
          );

          if (postRemovalIndex === null) {
            return;
          }

          applyProjectEditorWindowOp((windowState) =>
            engineReorderTab(windowState, { paneId: sourcePaneId, tabId: sourceTabId, toIndex: postRemovalIndex }),
          );
        } else {
          applyProjectEditorWindowOp((windowState) =>
            engineMoveTab(windowState, {
              tabId: sourceTabId,
              sourcePaneId,
              targetPaneId,
              toIndex: toIndex ?? targetLeaf.tabs.length,
            }),
          );
        }

        setActiveWorkspacePanel(sourceTab.panel);
        setRecentTabIds((ids) => [sourceTab.id, ...ids.filter((id) => id !== sourceTab.id)].slice(0, 20));
        setProjectPanelSearchParam(sourceTab.panel);
      },
      [applyProjectEditorWindowOp, floatingPanes, paneTree, setProjectPanelSearchParam],
    );

    /**
     * RPL-IDE-001.6 — close a whole pane (Pane scope of the Options menu).
     * `closePaneTabs(paneId, 'all')` empties the tab list but leaves the pane
     * standing; the engine's `updatePane` returning null removes it AND
     * collapses its parent split, which is the behaviour the menu item promises.
     * Refuses on the last docked pane so the workspace never goes blank.
     */
    const closeProjectEditorPane = useCallback(
      (targetPaneId: string) => {
        const isFloating = floatingPanes.some((floating) => floating.pane.id === targetPaneId);

        if (!isFloating && countLeaves(paneTree) < 2) {
          return;
        }

        applyProjectEditorWindowOp((windowState) => engineUpdatePane(windowState, targetPaneId, () => null));
      },
      [applyProjectEditorWindowOp, floatingPanes, paneTree],
    );

    /**
     * RPL-IDE-001.6 — every pane in this window, docked then floating, labelled
     * by the tool it is currently showing so "Move tab to Webview" reads like the
     * screen rather than like "Move tab to pane-1a2b".
     */
    const projectEditorPaneChoices = useMemo(() => {
      const label = (pane: IdePaneLeaf, index: number) => {
        const activeTab = pane.tabs.find((tab) => tab.id === pane.activeTabId) ?? pane.tabs[0];

        return activeTab ? panelTitle(activeTab.panel, t) : t('baseChatAst.options.paneNumber', { index: index + 1 });
      };

      const docked = flattenPaneLeafIds(paneTree)
        .map((id) => findLeaf(paneTree, id))
        .filter((pane): pane is IdePaneLeaf => Boolean(pane));

      return [...docked, ...floatingPanes.map((floating) => floating.pane)].map((pane, index) => ({
        id: pane.id,
        label: label(pane, index),
      }));
    }, [floatingPanes, paneTree, t]);

    /** RPL-IDE-001.6 — Window scope: back to a single default pane. */
    const resetProjectEditorLayout = useCallback(() => {
      setPaneTree(cloneDefaultPaneTree());
      setFloatingPanes([]);
      setActivePaneId('pane-main');
    }, []);

    const clearPaneDropTarget = useCallback(() => setPaneDropTarget(null), []);

    const renderPaneContent = useCallback(
      (panel: IdeWorkspacePanel) => {
        if (panel === 'editor') {
          return (
            <div
              className="bolt-project-editor-tool relative min-h-0 flex-1 overflow-hidden"
              data-testid="responsive-code-editor"
            >
              <ProjectEditorToolbar
                fileLabel={currentDocument?.filePath?.replace(WORK_DIR, '') || t('baseChatAst.files.noneSelected')}
                hasDocument={Boolean(currentDocument)}
                minimapEnabled={editorMinimapEnabled}
                monacoActive={editorKindForLayout(layout) === 'monaco'}
                onToggleMinimap={() => setEditorMinimapEnabled((enabled) => !enabled)}
                onFormat={() => {
                  workbenchStore.formatCurrentDocument().catch((error) => {
                    console.error('Project file format failed', error);
                    toast.error(t('baseChatAst.editor.formatFailed'));
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
              {/* File History — bottom-right toggle + standalone panel (independent of Git) */}
              {currentDocument && !currentDocument.isBinary && (
                <EditorHistoryOverlay filePath={currentDocument.filePath} content={currentDocument.value} />
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

        /*
         * BUG-IDE-013 — « Problèmes » est alimenté par le store `diagnostics`
         * côté client, pas par `/ide-panel/:panel`. Passer par la coque de
         * service ferait un aller-retour qui 404 et afficherait une erreur à la
         * place des diagnostics qu'on a justement sous la main.
         */
        if (panel === 'problems') {
          return <ProjectProblemsPanel />;
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
        t,
        theme,
        unsavedFiles,
        useMobileIde,
      ],
    );

    const renderPaneLeaf = useCallback(
      (leaf: IdePaneLeaf) => {
        const activeTab = leaf.tabs.find((tab) => tab.id === leaf.activeTabId) ?? leaf.tabs[0];

        const canAcceptPaneDrop = (event: React.DragEvent) => isProjectEditorTabDrag(event.dataTransfer.types);

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
              const sourcePaneId = event.dataTransfer.getData(TAB_DRAG_PANE_MIME);
              const sourceTabId = event.dataTransfer.getData(TAB_DRAG_TAB_MIME);

              if (sourcePaneId && sourceTabId && sourcePaneId !== leaf.id) {
                event.preventDefault();
                event.stopPropagation();

                // Dropping on the pane body (not on the strip) appends to the end.
                moveProjectEditorTab(sourcePaneId, sourceTabId, leaf.id);
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
                      t('baseChatAst.common.editor')
                    : panelTitle(tab.panel, t);

                return {
                  ...tab,
                  label,
                  displayLabel: formatEditorTabLabel(label, tab.panel),
                  icon: panelIcon(tab.panel),
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
              onSplitActiveDown={(tabId) => splitPaneDown(leaf.id, tabId)}
              onToggleFloating={() => togglePaneFloating(leaf.id)}
              onOpenNewWindow={(tabId) => openProjectEditorWindow(leaf.tabs.find((tab) => tab.id === tabId))}
              isFloating={floatingPanes.some((floating) => floating.pane.id === leaf.id)}
              onMoveTab={(sourcePaneId, sourceTabId, toIndex) =>
                moveProjectEditorTab(sourcePaneId, sourceTabId, leaf.id, toIndex)
              }
              paneId={leaf.id}
              onClosePane={() => closeProjectEditorPane(leaf.id)}
              onResetLayout={resetProjectEditorLayout}
              onMoveTabToPane={(targetPaneId) => {
                const tabId = leaf.activeTabId ?? leaf.tabs[0]?.id;

                if (tabId) {
                  moveProjectEditorTab(leaf.id, tabId, targetPaneId);
                }
              }}
              otherPanes={projectEditorPaneChoices.filter((pane) => pane.id !== leaf.id)}
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
                  panel={panelTitle(activeTab.panel, t)}
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
        splitPaneDown,
        togglePaneFloating,
        openProjectEditorWindow,
        floatingPanes,
        scrollPositions,
        moveProjectEditorTab,
        closeProjectEditorPane,
        resetProjectEditorLayout,
        projectEditorPaneChoices,
        t,
        unsavedFiles,
      ],
    );

    const renderPaneNode = useCallback(
      (node: IdePaneNode): React.ReactNode => {
        if (node.type === 'leaf') {
          return renderPaneLeaf(node);
        }

        const ratio = Math.min(0.9, Math.max(0.1, node.ratio ?? 0.5));

        return (
          <PanelGroup
            key={node.id}
            id={`project-pane-split-${node.id}`}
            className="bolt-project-pane-split"
            data-direction={node.direction}
            direction={node.direction}
            onLayout={(sizes) => {
              const nextRatio = Math.min(0.9, Math.max(0.1, (sizes[0] ?? 50) / 100));

              // Ignore layout echoes that don't materially move the divider.
              if (Math.abs(nextRatio - ratio) < 0.004) {
                return;
              }

              setPaneSplitRatio(node.id, nextRatio);
            }}
          >
            <Panel id={`${node.id}-first`} order={1} defaultSize={ratio * 100} minSize={15}>
              {renderPaneNode(node.first)}
            </Panel>
            <PanelResizeHandle
              className="bolt-project-pane-split-divider"
              aria-label={
                node.direction === 'horizontal'
                  ? t('chat.copy.resizePanesHorizontally_2340f8da')
                  : t('chat.copy.resizePanesVertically_5ecc3ff6')
              }
              data-testid={`pane-resize-${node.id}`}
            />
            <Panel id={`${node.id}-second`} order={2} defaultSize={(1 - ratio) * 100} minSize={15}>
              {renderPaneNode(node.second)}
            </Panel>
          </PanelGroup>
        );
      },
      [renderPaneLeaf, setPaneSplitRatio],
    );

    const ideRailToolItems = [
      {
        panel: 'files',
        label: t('chat.copy.library_b8100f5b'),
        icon: panelIcon('files'),
        badge: visibleProjectFilePaths.length || undefined,
        badgeLabel:
          visibleProjectFilePaths.length > 0
            ? t('baseChatAst.files.count', { count: visibleProjectFilePaths.length })
            : undefined,
        tone: 'neutral',
        active: rightPanelOpen && rightPanelMode === 'files',
        title: t('baseChatAst.files.projectCount', { count: visibleProjectFilePaths.length }),
      },
      {
        panel: 'search',
        label: t('chat.copy.search_bce06414'),
        icon: panelIcon('search'),
        badge: undefined,
        tone: 'neutral',
      },
      {
        panel: 'git',
        label: t('chat.copy.git_58197788'),
        icon: panelIcon('git'),
        badge: statusbarChangedFiles || undefined,
        badgeLabel:
          statusbarChangedFiles > 0 ? t('baseChatAst.files.changedCount', { count: statusbarChangedFiles }) : undefined,
        tone: 'neutral',
      },
      {
        panel: 'packages',
        label: t('chat.copy.packages_0a999012'),
        icon: panelIcon('packages'),
        badge: undefined,
        tone: 'neutral',
      },
      {
        panel: 'database',
        label: t('chat.copy.database_61074f1c'),
        icon: panelIcon('database'),
        badge: undefined,
        tone: 'neutral',
      },
      {
        panel: 'secrets',
        label: t('chat.copy.secrets_1e3732ae'),
        icon: panelIcon('secrets'),
        badge: undefined,
        tone: 'neutral',
      },
      {
        panel: 'deployments',
        label: t('chat.copy.deployments_8d458ed0'),
        icon: panelIcon('deployments'),
        badge: undefined,
        tone: 'neutral',
      },
      {
        panel: 'monitoring',
        label: t('chat.copy.monitoring_a8143458'),
        icon: panelIcon('monitoring'),
        badge: statusbarDiagnostics.errors || undefined,
        badgeLabel:
          statusbarDiagnostics.errors > 0
            ? t('baseChatAst.diagnostics.count', { count: statusbarDiagnostics.errors })
            : undefined,
        tone: statusbarDiagnostics.errors > 0 ? 'danger' : 'neutral',
      },
      {
        panel: 'settings',
        label: t('chat.copy.settings_c7f73bb5'),
        icon: panelIcon('settings'),
        badge: undefined,
        tone: 'neutral',
      },
    ] as const;

    const renderIdeRailToolItem = (item: (typeof ideRailToolItems)[number]) => {
      const badgeLabel = 'badgeLabel' in item ? item.badgeLabel : undefined;
      const title = 'title' in item && item.title ? item.title : t(IDE_TOOL_DESCRIPTIONS[item.panel]);
      const baseTooltip = formatRailItemTooltip(t, item.label, title, badgeLabel);
      const active = 'active' in item ? item.active : activeWorkspacePanel === item.panel;

      /*
       * RPL-IDE-001.5 — dock shortcuts. Only tools with a genuinely registered
       * keybinding advertise one (the catalog spec enforces that), so the dock
       * never promises a key combination that does nothing.
       */
      const shortcut = PROJECT_EDITOR_TOOL_SHORTCUTS[item.panel as keyof typeof PROJECT_EDITOR_TOOL_SHORTCUTS];
      const shortcutLabel = shortcut ? formatKeybindingCombo(shortcut) : undefined;
      const tooltip = shortcutLabel ? `${baseTooltip} · ${shortcutLabel}` : baseTooltip;

      return (
        <HeaderTip key={item.panel} label={tooltip} side="right">
          <button
            type="button"
            className="bolt-project-ide-rail-item"
            aria-current={active ? 'page' : undefined}
            aria-keyshortcuts={shortcut}
            aria-label={formatRailItemLabel(item.label, badgeLabel)}
            title={tooltip}
            data-vc-tooltip={tooltip}
            data-testid={`ide-dock-${item.panel}`}
            data-tone={item.tone}
            onClick={() => openIdeTool(item.panel)}
          >
            <span className={item.icon} aria-hidden />
            <span className="bolt-project-ide-rail-label">{item.label}</span>
            {shortcutLabel ? (
              <span className="bolt-project-ide-rail-shortcut" aria-hidden>
                {shortcutLabel}
              </span>
            ) : null}
            {item.badge ? (
              <span className="bolt-project-ide-rail-badge" aria-hidden>
                {formatRailBadgeValue(item.badge, language)}
              </span>
            ) : null}
          </button>
        </HeaderTip>
      );
    };

    /**
     * RPL-IDE-001.5 — "All tools" at the foot of the dock. The searchable popup
     * existed only behind the tab strip's "+", which meant the dock could reach
     * nine tools and nothing else. Opening it in `tools` mode lists the full
     * catalog and each result opens in a tab of the active pane.
     */
    const renderIdeRailAllToolsItem = () => {
      const label = t('baseChatAst.tool.allTools');
      const tooltip = `${label} · ${formatKeybindingCombo('cmd+t')}`;

      return (
        <HeaderTip label={tooltip} side="right">
          <button
            type="button"
            className="bolt-project-ide-rail-item bolt-project-ide-rail-item-all-tools"
            aria-label={label}
            aria-haspopup="dialog"
            aria-keyshortcuts="cmd+t"
            title={tooltip}
            data-vc-tooltip={tooltip}
            data-testid="ide-dock-all-tools"
            data-tone="neutral"
            onClick={() => openCommandPalette('tools')}
          >
            <span className="i-ph:squares-four" aria-hidden />
            <span className="bolt-project-ide-rail-label">{label}</span>
            <span className="bolt-project-ide-rail-shortcut" aria-hidden>
              {formatKeybindingCombo('cmd+t')}
            </span>
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
          title={t('chat.copy.workspaceTools_7b36c62b')}
          boundaryId={`project:${projectId}:sidebar`}
          projectId={projectId}
          getSnapshot={() => ({
            activeWorkspacePanel,
            rightPanelMode,
            rightPanelOpen,
            changedFiles: statusbarChangedFiles,
          })}
        >
          <aside className="bolt-project-ide-rail" aria-label={t('chat.copy.workspaceTools_7b36c62b')}>
            <div className="bolt-project-ide-rail-tools">{ideRailToolItems.map(renderIdeRailToolItem)}</div>
            <div className="bolt-project-ide-rail-footer">{renderIdeRailAllToolsItem()}</div>
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
              title={t('chat.copy.workspace_4ca0a75c')}
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
                <section className="bolt-project-ide-panel" aria-label={t('chat.copy.editorAndPreview_c279cf0b')}>
                  <div className="bolt-project-main-stack">
                    <div
                      className="bolt-project-main-panes"
                      data-window-id={projectEditorWindowId}
                      style={
                        {
                          '--project-terminal-bottom-height': terminalBottomOpen ? `${terminalBottomHeight}px` : '0px',
                        } as React.CSSProperties
                      }
                    >
                      {renderPaneNode(paneTree)}
                      {floatingPanes.map((floating) => {
                        const activeTab =
                          floating.pane.tabs.find((tab) => tab.id === floating.pane.activeTabId) ??
                          floating.pane.tabs[0];

                        return (
                          <FloatingPaneFrame
                            key={floating.id}
                            paneId={floating.pane.id}
                            title={activeTab ? panelTitle(activeTab.panel, t) : t('chat.copy.projectEditor_f0067be1')}
                            bounds={floating.bounds}
                            zIndex={20 + floating.zIndex}
                            active={activePaneId === floating.pane.id}
                            onBoundsChange={(bounds) => changeFloatingPaneBounds(floating.pane.id, bounds)}
                            onDock={() => togglePaneFloating(floating.pane.id)}
                            onFocus={() => focusFloatingPane(floating.pane.id)}
                          >
                            {renderPaneLeaf(floating.pane)}
                          </FloatingPaneFrame>
                        );
                      })}
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
                          aria-label={t('chat.copy.resizePinnedTerminal_a5c5a9c6')}
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
                aria-label={t('chat.copy.resizeFilesPanel_95c3842c')}
                title={t('chat.copy.resizeFilesPanel_95c3842c')}
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
                  aria-label={
                    rightPanelMode === 'files'
                      ? t('chat.copy.projectLibraryPanel_03bdd26b')
                      : t('chat.copy.previewLogsPanel_03bc2bda')
                  }
                  style={{ '--project-right-panel-width': `${rightPanelWidth}px` } as React.CSSProperties}
                >
                  <div className="bolt-project-right-files-header">
                    <span className={rightPanelMode === 'files' ? 'i-ph:files' : 'i-ph:terminal-window'} aria-hidden />
                    <span>
                      {rightPanelMode === 'files'
                        ? t('chat.copy.library_b8100f5b')
                        : t('chat.copy.previewLogs_d42e29e7')}
                    </span>
                    <button
                      type="button"
                      className="bolt-project-ide-icon-button ml-auto"
                      aria-label={t('chat.copy.closeRightPanel_b31ffa0e')}
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
                      panel={
                        rightPanelMode === 'files'
                          ? t('baseChatAst.common.library')
                          : t('baseChatAst.common.previewLogs')
                      }
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
                aria-label={t('chat.copy.resizeAiAgentPanel_2b57c38b')}
                title={t('chat.copy.resizeAiAgentPanel_2b57c38b')}
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
                <section
                  className="bolt-project-ide-panel bolt-project-agent-shell"
                  aria-label={t('chat.copy.aiAgent_ab15eb3d')}
                >
                  <div className="bolt-project-agent-header">
                    <div className="bolt-project-agent-avatar" aria-hidden>
                      <span className="i-ph:sparkle" />
                    </div>
                    <span
                      className="bolt-project-agent-title"
                      title={description?.trim() || t('chat.copy.newChat_009bf6b9')}
                    >
                      {description?.trim() || t('chat.copy.newChat_009bf6b9')}
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
                        <HeaderTip label={t('chat.copy.browseConversationBranches_f8505149')}>
                          <ConversationBranchesMenu projectId={projectId} className="bolt-project-ide-icon-button" />
                        </HeaderTip>
                      ) : null}
                      {projectId ? (
                        <HeaderTip label={t('chat.copy.shareThisConversationAsARead_86f1bf77')}>
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
                      <HeaderTip label={t('chat.copy.conversationHistory_a03d887e')}>
                        <button
                          type="button"
                          className="bolt-project-ide-icon-button"
                          aria-label={t('chat.copy.conversationHistory_a03d887e')}
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
                      <HeaderOverflowMenu label={t('chat.copy.moreAgentActions_b515ee74')}>
                        <button
                          type="button"
                          role="menuitem"
                          className="bolt-header-overflow-item"
                          aria-label={t('chat.copy.copyConversation_4f1cbe7c')}
                          onClick={() => void copyProjectConversation()}
                        >
                          <Copy size={14} strokeWidth={2} aria-hidden />
                          <span>{t('chat.copy.copyConversation_4f1cbe7c')}</span>
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          className="bolt-header-overflow-item"
                          aria-label={t('chat.copy.exportConversation_6b17f1ef')}
                          onClick={exportProjectConversation}
                        >
                          <Download size={14} strokeWidth={2} aria-hidden />
                          <span>{t('chat.copy.exportConversation_6b17f1ef')}</span>
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          className="bolt-header-overflow-item"
                          aria-label={t('chat.copy.agentSettings_b02d736f')}
                          onClick={() => openWorkspacePanel('settings')}
                        >
                          <span className="i-ph:sliders-horizontal" aria-hidden />
                          <span>{t('chat.copy.agentSettings_b02d736f')}</span>
                        </button>
                        <div className="bolt-header-overflow-item bolt-header-overflow-item--static">
                          <span className="flex items-center gap-2">
                            <span className="i-ph:moon" aria-hidden />
                            <span>{t('chat.copy.appearance_41def7a0')}</span>
                          </span>
                          <ThemeSwitch size="sm" title={t('chat.copy.switchLightDarkTheme_4f952812')} />
                        </div>
                        <button
                          type="button"
                          role="menuitem"
                          className="bolt-header-overflow-item bolt-header-overflow-item--danger"
                          aria-label={t('chat.copy.clearHistory_53b5158b')}
                          onClick={clearProjectConversation}
                        >
                          <Trash2 size={14} strokeWidth={2} aria-hidden />
                          <span>{t('chat.copy.clearHistory_53b5158b')}</span>
                        </button>
                      </HeaderOverflowMenu>
                      <HeaderTip label={t('chat.copy.hideAgentPanelCmdL_9b94ba4c')}>
                        <button
                          type="button"
                          className="bolt-project-ide-icon-button"
                          aria-label={t('chat.copy.hideAiAgentPanel_65280672')}
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
                    <div
                      className="bolt-project-conversation-history"
                      role="dialog"
                      aria-label={t('chat.copy.projectAgentHistory_c9f06d3e')}
                    >
                      <div className="bolt-project-conversation-history-head">
                        <div>
                          <strong>{t('chat.copy.agentHistory_c783eeb3')}</strong>
                          <span>
                            {t('baseChatAst.counts.checkpointsFiltered', {
                              shown: filteredProjectConversationCheckpoints.length,
                              count: projectConversationCheckpoints.length,
                            })}
                          </span>
                        </div>
                        <button
                          type="button"
                          className="bolt-project-ide-icon-button"
                          aria-label={t('chat.copy.closeHistory_7bf06ef3')}
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
                          placeholder={t('chat.copy.searchCheckpointsCommitsPromptsOrAgent_7b472db0')}
                          aria-label={t('chat.copy.searchAgentCheckpoints_471244eb')}
                          onChange={(event) => setConversationHistoryQuery(event.currentTarget.value)}
                        />
                        {conversationHistoryQuery && (
                          <button
                            type="button"
                            aria-label={t('chat.copy.clearHistorySearch_9758bed5')}
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
                                  aria-label={t('chat.copy.viewChatAtCheckpointValue0_7e82ca09', {
                                    value0: checkpoint.title,
                                  })}
                                  onClick={() => viewProjectCheckpoint(checkpoint)}
                                >
                                  {t('chat.copy.viewChat_7dd435d1')}
                                </button>
                                <button
                                  type="button"
                                  disabled={!rollbackAvailable}
                                  aria-label={t('chat.copy.rollbackToCheckpointValue0_2131e13b', {
                                    value0: checkpoint.title,
                                  })}
                                  onClick={() => {
                                    setRollbackDatabase(false);
                                    setRollbackTarget(checkpoint);
                                  }}
                                >
                                  {t('chat.copy.rollbackHere_643ef4ec')}
                                </button>
                                <button
                                  type="button"
                                  aria-label={t('chat.copy.reviewDiffForCheckpointValue0_7903beba', {
                                    value0: checkpoint.title,
                                  })}
                                  onClick={() => openCheckpointChanges(checkpoint)}
                                >
                                  {t('chat.copy.reviewDiff_cfcf10aa')}
                                </button>
                              </div>
                            </article>
                          );
                        })}
                        {!projectConversationCheckpoints.length && (
                          <div className="bolt-project-history-empty">
                            {t('chat.copy.noProjectAgentHistoryYet_3aa0ec67')}
                          </div>
                        )}
                        {projectConversationCheckpoints.length > 0 &&
                          !filteredProjectConversationCheckpoints.length && (
                            <div className="bolt-project-history-empty">
                              {t('chat.copy.noCheckpointsMatchThisSearch_aef33bf2')}
                            </div>
                          )}
                      </div>
                    </div>
                  )}
                  <ZoneErrorBoundary
                    zone="agent"
                    title={t('chat.copy.agent_5ce2e6f4')}
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
            aria-label={t('chat.copy.openAiAgentPanel_17b0ac72')}
            title={t('chat.copy.openAiAgentPanelCmdL_e8c479b3')}
            onClick={() => {
              setProjectAgentPanelOpen(true);
              window.setTimeout(() => textareaRef?.current?.focus(), 0);
            }}
          >
            <span className="i-ph:sparkle" aria-hidden />
            <span>{t('chat.copy.agent_5ce2e6f4')}</span>
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
            section: t('baseChatAst.common.files'),
            title: filePath.replace(WORK_DIR, '') || filePath,
            description: t('chat.copy.openProjectFile_f9fc8bf6'),
            shortcut: formatKeybindingCombo('cmd+p'),
            icon: 'i-ph:file-code',
            kind: 'file' as const,
            filePath,
          })),

          /*
           * RPL-IDE-001.5 — driven by the shared catalog, so the palette lists
           * EVERY Project Editor tool. The previous hand-written list stopped at
           * 20 of 29: `studio`, `domains`, `locks`, `overview`, `logs`,
           * `activity`, `collaborators`, `debugger` and `editor` were rendered
           * as panels but could not be reached from here at all.
           */
          ...projectEditorToolList().map((tool) => {
            const shortcut = PROJECT_EDITOR_TOOL_SHORTCUTS[tool.id];

            return {
              id: `tool:${tool.id}`,
              section: t('baseChatAst.common.tools'),
              title: panelTitle(tool.id, t),
              description: t(IDE_TOOL_DESCRIPTIONS[tool.id as keyof typeof IDE_TOOL_DESCRIPTIONS]),
              shortcut: shortcut ? formatKeybindingCombo(shortcut) : '',
              icon: tool.icon,
              kind: 'tool' as const,
              panel: tool.id as IdeWorkspacePanel | IdeRightPanel,
            };
          }),
          ...[
            ['run', t('baseChatAst.command.runApp'), t('baseChatAst.command.runAppDescription'), ''],
            ['stop', t('baseChatAst.command.stopApp'), t('baseChatAst.command.stopAppDescription'), ''],
            ['deploy', t('baseChatAst.command.deploy'), t('baseChatAst.command.deployDescription'), ''],
            ['theme', t('baseChatAst.command.theme'), t('baseChatAst.command.themeDescription'), ''],
            ['reset-layout', t('baseChatAst.command.resetLayout'), t('baseChatAst.command.resetLayoutDescription'), ''],
          ].map(([command, title, description, shortcut]) => ({
            id: `command:${command}`,
            section: t('baseChatAst.common.commands'),
            title,
            description,
            shortcut,
            icon: 'i-ph:command',
            kind: 'command' as const,
            command,
          })),
          ...flattenTabs(paneTree).map((tab) => ({
            id: `recent:${tab.id}`,
            section: t('baseChatAst.common.recent'),
            title: tab.filePath?.replace(WORK_DIR, '') || panelTitle(tab.panel, t),
            description: t('chat.copy.focusOpenTab_9394aa42'),
            shortcut: '',
            icon: panelIcon(tab.panel),
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

            const query = commandPaletteQuery.trim().toLocaleLowerCase(language);

            if (!query) {
              return true;
            }

            return `${entry.title} ${entry.description} ${entry.section}`.toLocaleLowerCase(language).includes(query);
          })
          .slice(0, 60),
      [commandPaletteMode, commandPaletteQuery, language, paneTree, projectFilePaths, t],
    );

    const runCommandPaletteEntry = (entry = commandPaletteEntries[commandPaletteIndex]) => {
      if (!entry) {
        return;
      }

      /*
       * AV-UX point 7 — the palette entries only mutated desktop pane state /
       * the URL search param; on mobile the URL round-trip is skipped when the
       * param is unchanged, so `mobilePanel` never switched and the previous
       * panel stayed on screen after the palette closed. Each activation is
       * now explicitly mobile-aware, and the close runs in `finally` so a
       * throw can never leave the full-screen palette sheet covering the IDE.
       */
      try {
        if (entry.kind === 'file') {
          openProjectFile(entry.filePath, { preview: false });

          if (useMobileIde) {
            setMobileIdePanel('editor');
            setProjectPanelSearchParam('editor');
          }
        } else if (entry.kind === 'tool') {
          if (useMobileIde) {
            activateMobileTool(entry.panel);
          } else {
            openIdeTool(entry.panel);
          }
        } else if (entry.kind === 'recent') {
          const leaf = findLeafContainingTab(paneTree, entry.tabId);
          const tab = leaf?.tabs.find((item) => item.id === entry.tabId);

          if (leaf && tab) {
            selectPaneTab(leaf.id, tab.id, tab.panel);

            if (useMobileIde) {
              activateMobileTool(tab.panel);
            }
          }
        } else if (entry.kind === 'command') {
          if (entry.command === 'reset-layout') {
            setPaneTree(cloneDefaultPaneTree());
            setActivePaneId('pane-main');
          } else if (entry.command === 'deploy') {
            if (useMobileIde) {
              activateMobileTool('deployments');
            } else {
              openWorkspacePanel('deployments');
            }
          } else if (entry.command === 'run') {
            if (useMobileIde) {
              activateMobileTool('preview');
            } else {
              openWorkspacePanel('preview');
            }

            void workbenchStore.startPreviewServer();
          } else if (entry.command === 'stop') {
            void workbenchStore.stopPreviewServer();

            if (useMobileIde) {
              activateMobileTool('logs');
            } else {
              openWorkspacePanel('logs');
            }
          } else if (entry.command === 'theme') {
            toggleTheme();
          }
        }
      } finally {
        setCommandPaletteOpen(false);
        setCommandPaletteQuery('');
        setCommandPaletteIndex(0);
      }
    };

    const commandPaletteSections = useMemo(
      () =>
        [
          t('baseChatAst.common.files'),
          t('baseChatAst.common.tools'),
          t('baseChatAst.common.commands'),
          t('baseChatAst.common.recent'),
        ].map((name) => ({
          name,
          entries: commandPaletteEntries.filter((entry) => entry.section === name),
        })),
      [commandPaletteEntries, t],
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

    /*
     * L'en-tête dérive du panneau de service RÉSOLU, pas de `activeMobileOpenTabId`
     * (état d'onglet monté plus tard) : c'est ce décalage qui produisait
     * `?panel=studio` → Vue d'ensemble et `?panel=debugger` → Git à froid.
     */
    const mobileServiceHeaderTab =
      useMobileIde && mobilePanel === 'deploy'
        ? (ECODE_MOBILE_TAB_META[activeMobileServicePanel] ?? {
            id: activeMobileServicePanel,
            name: panelTitle(activeMobileServicePanel, t),
            icon: panelIcon(activeMobileServicePanel),
          })
        : undefined;
    const mobileMoreMenuItems = useMemo(
      () =>
        ECODE_MOBILE_MORE_ITEMS.map((itemId) => {
          const tool = ECODE_MOBILE_TOOLS.find((item) => item.id === itemId);
          const meta = ECODE_MOBILE_TAB_META[itemId];

          return {
            id: itemId,
            title: tool ? t(tool.titleKey) : (meta?.name ?? panelTitle(itemId)),
            icon: tool?.icon ?? meta?.icon ?? panelIcon(itemId),
            tone: tool && 'tone' in tool ? tool.tone : undefined,
          };
        }),
      [t],
    );

    const mobileBottomTabSlotCount = 4;

    const mobileBottomTabs = useMemo(
      () =>
        selectVisibleMobileBottomTabs(
          mobileOpenTabs,
          activeMobileOpenTabId,
          mobileBottomTabSlotCount,
          ECODE_MOBILE_DEFAULT_TABS,
        ),
      [activeMobileOpenTabId, mobileBottomTabSlotCount, mobileOpenTabs],
    );
    const hiddenMobileBottomTabCount = useMemo(
      () => countHiddenMobileBottomTabs(mobileOpenTabs, mobileBottomTabs),
      [mobileBottomTabs, mobileOpenTabs],
    );

    const showMobileChrome = useMobileIde && clientHydrated;

    const keybindingSections = useMemo(
      () =>
        PROJECT_KEYBINDING_CATEGORIES.map((category) => ({
          category,
          label: getKeybindingCategoryLabel(language, category),
          bindings: projectKeybindings.filter((binding) => binding.category === category),
        })).filter((section) => section.bindings.length > 0),
      [language, projectKeybindings],
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
        {/* DO NOT MODIFY — mobile Terminal tab frozen per Avi (ref IMG_9149). Header structure
            (back · activity · "Shell (Terminal)" · + · ⋮) is the reference; exclude from responsive/
            fan-out/parity passes. */}
        {projectIdeMode && showMobileChrome && (
          <header className="bolt-mobile-ecode-header" data-testid="mobile-ide-header">
            <div className="bolt-mobile-ecode-header-inner">
              <div className="bolt-mobile-ecode-header-side">
                <button
                  type="button"
                  aria-label={t('baseChatMobileHeader.back')}
                  data-testid="button-back"
                  onClick={() => navigate('/dashboard')}
                >
                  <span className="i-ph:arrow-left" aria-hidden />
                </button>
                <button
                  type="button"
                  aria-label={t('baseChatMobileHeader.activity')}
                  data-testid="button-history"
                  onClick={() => activateMobileTool('activity')}
                >
                  <span className="i-ph:activity" aria-hidden />
                </button>
              </div>

              <button
                type="button"
                className="bolt-mobile-ecode-header-title"
                aria-label={t('baseChatMobileHeader.search')}
                data-testid="mobile-header-title-search"
                onClick={() =>
                  window.dispatchEvent(new CustomEvent('vibecore:open-command-palette', { detail: { mode: 'all' } }))
                }
              >
                {mobileHeaderTab.icon === 'agent' ? (
                  <MobileReplitAgentIcon className="bolt-mobile-ecode-header-agent" />
                ) : (
                  <span className={mobileHeaderTab.icon} aria-hidden />
                )}
                <span>
                  <strong>{mobileHeaderTab.name}</strong>
                  {isMobileAgentActive ? <small>{mobileAgentStatusLabel}</small> : null}
                </span>
              </button>

              <div className="bolt-mobile-ecode-header-side bolt-mobile-ecode-header-side--right">
                <button
                  type="button"
                  aria-label={t('baseChatMobileHeader.openTools')}
                  aria-haspopup="dialog"
                  aria-expanded={mobileToolsSheetOpen}
                  data-testid="button-new-tab"
                  onClick={openMobileToolsSheet}
                >
                  <span className="i-ph:plus" aria-hidden />
                </button>
                <button
                  type="button"
                  aria-label={
                    isMobileAgentActive ? t('baseChatMobileHeader.agentOptions') : t('baseChatMobileHeader.moreOptions')
                  }
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
                  <strong>
                    {isAgentRunning ? t('baseChatMobileHeader.agentWorking') : t('baseChatMobileHeader.agentReady')}
                  </strong>
                  <small>{mobileAgentContextLabel}</small>
                </span>
                <button
                  type="button"
                  aria-label={t('baseChatMobileHeader.focusPrompt')}
                  onClick={() => textareaRef?.current?.focus()}
                >
                  {t('baseChatMobileHeader.promptButton')}
                </button>
              </div>
            ) : null}
          </header>
        )}
        <div className="bolt-connection-status" role="status" aria-live="polite" data-online={isOnline}>
          {!isOnline
            ? t('chat.copy.offlineModeEditsStayLocalUntil_d05ea2ef')
            : t('chat.copy.connectionHealthy_86695b92')}
        </div>
        {commandPaletteOpen && (
          <>
            <button
              type="button"
              className="bolt-project-command-palette-backdrop"
              aria-label={t('chat.copy.closeCommandPalette_1f7df2fe')}
              data-testid="command-palette-backdrop"
              onClick={() => setCommandPaletteOpen(false)}
            />
            <div
              className="bolt-project-command-palette"
              role="dialog"
              aria-modal="true"
              data-mode={commandPaletteMode}
              data-testid={commandPaletteMode === 'spotlight' ? 'project-spotlight' : 'project-command-palette'}
              aria-label={
                commandPaletteMode === 'spotlight'
                  ? t('baseChatAst.spotlight.title')
                  : t('chat.copy.commandPalette_7b6b539e')
              }
            >
              {/*
                RPL-IDE-001.8 — Spotlight is project-scoped, so it names the
                project it is searching. Without this header it is just the
                command palette under another trigger.
              */}
              {commandPaletteMode === 'spotlight' ? (
                <header className="bolt-project-spotlight-head" data-testid="project-spotlight-head">
                  <span className="i-ph:magic-wand" aria-hidden />
                  <span>
                    <strong>{spotlightProjectName}</strong>
                    <small>{t('baseChatAst.spotlight.subtitle')}</small>
                  </span>
                </header>
              ) : null}
              <input
                type="text"
                autoFocus={commandPaletteAutoFocus}
                autoComplete="off"
                inputMode="search"
                placeholder={t('chat.copy.searchToolsFilesAndCommands_c085ba2a')}
                aria-label={t('chat.copy.searchCommands_5ae3aa24')}
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
              <div
                id="project-command-listbox"
                role="listbox"
                aria-label={t('chat.copy.commandsToolsAndFiles_edb9d782')}
              >
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
                    {t('chat.copy.noMatchingCommandToolOrFile_949660c4')}
                  </div>
                )}
              </div>
              <footer>{t('chat.copy.navigateSelectEscClose_69f03d69')}</footer>
            </div>
          </>
        )}
        {keyboardShortcutsOpen && (
          <div
            ref={keyboardShortcutsRef}
            className="bolt-project-command-palette bolt-project-keybindings-palette"
            role="dialog"
            aria-modal="true"
            aria-label={t('chat.copy.keyboardShortcuts_26669547')}
          >
            <header className="bolt-project-keybindings-head">
              <div>
                <strong>{t('chat.copy.keyboardShortcuts_26669547')}</strong>
                <span>
                  {projectKeybindings.length}
                  {t('chat.copy.activeBindingsInThisWorkspace_0a75087f')}
                </span>
              </div>
              <button
                type="button"
                className="bolt-project-ide-icon-button"
                aria-label={t('chat.copy.closeKeyboardShortcuts_b87b092b')}
                onClick={() => setKeyboardShortcutsOpen(false)}
              >
                <span className="i-ph:x" aria-hidden />
              </button>
            </header>
            {keybindingConflicts.length > 0 ? (
              <div className="bolt-project-keybindings-conflicts" role="alert">
                <strong>{t('chat.copy.shortcutConflictsDetected_4514c8b4')}</strong>
                <span>
                  {keybindingConflicts
                    .map((conflict) => `${formatKeybindingCombo(conflict.combo)}: ${conflict.actions.join(', ')}`)
                    .join(' · ')}
                </span>
              </div>
            ) : null}
            <div className="bolt-project-keybindings-list">
              {keybindingSections.map((section) => (
                <section
                  key={section.category}
                  aria-label={t('chat.copy.value0Shortcuts_52261c31', { value0: section.label })}
                >
                  <h3>{section.label}</h3>
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
            <footer>{t('chat.copy.pressEscToClose_083ab5a6')}</footer>
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
                <PanelBoundary title={t('chat.copy.locks_01175ae5')}>
                  <div
                    className="bolt-workbench-mobile bolt-workbench-mobile-service fixed left-0 z-0 w-full"
                    data-testid="mobile-locks-panel"
                  >
                    <LockManager />
                  </div>
                </PanelBoundary>
              ) : null}
              {useMobileIde && mobilePanel === 'deploy' ? (
                <PanelBoundary title={t(IDE_TOOL_DESCRIPTIONS[activeMobileServicePanel] ?? 'chat.copy.projectTools')}>
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
              ) : null}
              {/*
               * BUG-IDE-PANEL-REPROVISION-RELOAD-001 — le Workbench n'est plus
               * démonté quand Agent/gestion/locks est actif : une fois ouvert il
               * reste monté (keep-alive) et n'est que masqué via
               * [data-active='false'], pour qu'un changement de panneau ne
               * remonte jamais tout l'IDE ni ne relance la boucle de démarrage
               * de la Preview (re-provisionnement plein écran sur pod froid).
               */}
              {shouldMountMobileWorkbench({
                useMobileIde,
                mobilePanel,
                workbenchKeepAlive: mobileWorkbenchKeepAlive,
              }) ? (
                <div
                  className="bolt-workbench-mobile-keepalive"
                  data-testid="mobile-workbench-keepalive"
                  data-active={!useMobileIde || mobileWorkbenchPanelActive ? 'true' : 'false'}
                  aria-hidden={!useMobileIde || mobileWorkbenchPanelActive ? undefined : true}
                >
                  <ClientOnly>
                    {() => (
                      <PanelBoundary title={t('chat.copy.workbench_93ef7c63')}>
                        <Suspense fallback={<PanelLoading title={t('chat.copy.loadingWorkspacePanels_3d3423fa')} />}>
                          <LazyWorkbench
                            chatStarted={chatStarted || useMobileIde}
                            isStreaming={isStreaming}
                            setSelectedElement={setSelectedElement}
                            mobilePanel={resolveMobileWorkbenchPanel({
                              mobilePanel,
                              lastWorkbenchPanel: lastMobileWorkbenchPanelRef.current,
                            })}
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
                </div>
              ) : null}
            </>
          )}
        </div>
        {/* DO NOT MODIFY — mobile Terminal tab frozen per Avi (ref IMG_9149). Exclude from
            responsive/fan-out/parity passes.

            Composition du dock rouverte par Avi le 19/08, et par lui seul : la rangée
            porte désormais TROIS onglets fixes — Webview · Agent · Déploiement — et
            l'éditeur devient un panneau à la demande. L'onglet Terminal, lui, reste gelé.
            Référence à jour :
            record/run · tab-switcher · preview · agent · deployments · +N · + · ⋮ */}
        {showMobileChrome && (
          <nav
            className="bolt-mobile-replit-nav"
            aria-label={t('baseChatMobileHeader.idePanels')}
            data-testid="mobile-bottom-navigation"
          >
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
                  aria-label={t('baseChatMobileHeader.openTabSwitcher')}
                  data-testid="button-tab-switcher"
                  onClick={openMobileTabSwitcher}
                >
                  <span className="i-ph:squares-four" aria-hidden />
                </button>
                <span className="bolt-mobile-replit-divider" aria-hidden />
                <div
                  className="bolt-mobile-replit-panel-scroll"
                  role="group"
                  aria-label={t('baseChatMobileHeader.openTabs')}
                >
                  {mobileBottomTabs.map((tab) => {
                    const isActive = activeMobileOpenTabId === tab.id;

                    return (
                      <button
                        key={tab.id}
                        type="button"
                        className="bolt-mobile-replit-icon-tab bolt-mobile-replit-panel-tab"
                        aria-label={t('baseChatMobileHeader.switchToTab', { name: tab.name })}
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
                    aria-label={t('baseChatMobileHeader.moreTabs', { count: hiddenMobileBottomTabCount })}
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
                  aria-label={t('baseChatMobileHeader.addNewTab')}
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
                aria-label={t('baseChatMobileHeader.moreOptions')}
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
              aria-label={t('chat.copy.closeAgentOptions_8e9b146d')}
              data-testid="mobile-agent-menu-backdrop"
              onClick={closeMobileOverlays}
            />
            <section
              className="bolt-mobile-agent-menu-sheet"
              role="dialog"
              aria-modal="true"
              aria-label={t('chat.copy.agentOptions_a43f3a55')}
              data-testid="mobile-agent-menu-sheet"
              onKeyDownCapture={handleMobileOverlayEscapeKey}
            >
              <div className="bolt-mobile-agent-menu-handle" aria-hidden />
              <header className="bolt-mobile-agent-menu-header">
                <div className="bolt-mobile-agent-menu-title">
                  <MobileReplitAgentIcon />
                  <h2>{t('chat.copy.agent_5ce2e6f4')}</h2>
                </div>
                <button
                  type="button"
                  aria-label={t('chat.copy.closeAgentOptions_8e9b146d')}
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
                  <span>{t('chat.copy.newChat_009bf6b9')}</span>
                  <span className="i-ph:plus" aria-hidden />
                </button>
                <button type="button" data-testid="mobile-agent-history" onClick={openMobileAgentHistory}>
                  <span className="i-ph:clock-counter-clockwise" aria-hidden />
                  <span>{t('chat.copy.history_90ccd649')}</span>
                  <span className="i-ph:caret-right" aria-hidden />
                </button>
                <button type="button" data-testid="mobile-agent-usage" onClick={openMobileAgentUsage}>
                  <span className="i-ph:gauge" aria-hidden />
                  <span>{t('chat.copy.usageMonitoring_6e358d3b')}</span>
                  <span className="i-ph:caret-right" aria-hidden />
                </button>
                <button type="button" data-testid="mobile-agent-settings" onClick={openMobileAgentSettings}>
                  <span className="i-ph:sliders-horizontal" aria-hidden />
                  <span>{t('chat.copy.agentSettings_b02d736f')}</span>
                  <span className="i-ph:caret-right" aria-hidden />
                </button>
                <button type="button" data-testid="mobile-agent-copy" onClick={copyMobileAgentConversation}>
                  <span className="i-ph:copy" aria-hidden />
                  <span>{t('chat.copy.copyConversation_4f1cbe7c')}</span>
                </button>
                <button type="button" data-testid="mobile-agent-export" onClick={exportMobileAgentConversation}>
                  <span className="i-ph:download-simple" aria-hidden />
                  <span>{t('chat.copy.exportConversation_6b17f1ef')}</span>
                </button>
                <button type="button" data-testid="mobile-agent-theme" onClick={toggleMobileAgentTheme}>
                  <span className={theme === 'dark' ? 'i-ph:sun' : 'i-ph:moon'} aria-hidden />
                  <span>
                    {theme === 'dark'
                      ? t('chat.copy.switchToLightMode_fc450912')
                      : t('chat.copy.switchToDarkMode_c29220f9')}
                  </span>
                </button>
                <button type="button" data-testid="mobile-agent-feedback" onClick={openMobileAgentFeedback}>
                  <span className="i-ph:megaphone" aria-hidden />
                  <span>{t('chat.copy.shareFeedback_21af3b1c')}</span>
                  <span className="i-ph:arrow-square-out" aria-hidden />
                </button>
                <button
                  type="button"
                  className="bolt-mobile-agent-menu-row--danger"
                  data-testid="mobile-agent-close-view"
                  onClick={closeMobileAgentView}
                >
                  <span className="i-ph:x" aria-hidden />
                  <span>{t('chat.copy.closeAgentView_b85f8435')}</span>
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
              aria-label={t('chat.copy.closeMoreMenu_033870ff')}
              data-testid="mobile-more-menu-backdrop"
              onClick={closeMobileOverlays}
            />
            <section
              className="bolt-mobile-more-menu-sheet"
              role="dialog"
              aria-modal="true"
              aria-label={t('chat.copy.moreIdePanels_d3cb95e1')}
              data-testid="mobile-more-menu-sheet"
              onKeyDownCapture={handleMobileOverlayEscapeKey}
            >
              <div className="bolt-mobile-more-menu-handle" aria-hidden />
              <header className="bolt-mobile-more-menu-header">
                <h2>{t('chat.copy.panels_8dfeed48')}</h2>
                <button
                  type="button"
                  aria-label={t('chat.copy.closeMoreMenu_033870ff')}
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
            aria-label={t('chat.copy.tabSwitcher_36e22491')}
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
                        aria-label={t('chat.copy.switchToValue0Tab_f9ebf5a1', { value0: tab.name })}
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
                          aria-label={t('chat.copy.closeValue0Tab_50bbc6b5', { value0: tab.name })}
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
                      {t('chat.copy.noOpenTabsMatchYourSearch_c9496ce2')}
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="bolt-mobile-tab-switcher-footer">
                <div
                  className="bolt-mobile-tab-switcher-quick"
                  role="group"
                  aria-label={t('chat.copy.quickAccessTools_3bf4f7bd')}
                >
                  {['secrets', 'database', 'settings'].map((toolId) => {
                    const tool = ECODE_MOBILE_TAB_META[toolId];

                    return (
                      <button
                        key={toolId}
                        type="button"
                        aria-label={t('chat.copy.quickAccessValue0_a4477e98', { value0: tool.name })}
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
                    aria-label={t('chat.copy.openNewTab_22fde835')}
                    data-testid="button-new-tab"
                    onClick={openMobileToolsSheet}
                  >
                    <span className="i-ph:plus" aria-hidden />
                    <span>{t('chat.copy.newTab_bbeec6fc')}</span>
                  </button>
                </div>
                <div className="bolt-mobile-tab-switcher-search">
                  <label>
                    <span className="i-ph:files" aria-hidden />
                    <input
                      placeholder={t('chat.copy.searchTabs_04552c6d')}
                      aria-label={t('chat.copy.searchOpenTabs_971c2f61')}
                      data-testid="input-search-tabs"
                      value={mobileTabSearchQuery}
                      onChange={(event) => setMobileTabSearchQuery(event.target.value)}
                    />
                  </label>
                  <button
                    type="button"
                    aria-label={t('chat.copy.clearSearch_67300d0f')}
                    data-testid="button-clear-search"
                    onClick={() => setMobileTabSearchQuery('')}
                  >
                    <span className={mobileTabSearchQuery ? 'i-ph:x' : 'i-ph:magnifying-glass'} aria-hidden />
                  </button>
                  <button
                    type="button"
                    aria-label={t('chat.copy.closeTabSwitcher_0bbc0c95')}
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
              aria-label={t('chat.copy.closeToolsSheet_3df4541f')}
              onClick={closeMobileToolsSheet}
            />
            <section
              className="bolt-mobile-more-sheet"
              role="dialog"
              aria-modal="true"
              aria-label={t('chat.copy.searchForToolsAndFiles_6730018d')}
              data-testid="tools-sheet"
              onKeyDownCapture={handleMobileOverlayEscapeKey}
            >
              <div className="bolt-mobile-more-handle" aria-hidden />
              <header className="bolt-mobile-more-header">
                <label className="bolt-mobile-more-search">
                  <span className="sr-only">{t('chat.copy.searchForToolsAndFiles_6730018d')}</span>
                  <input
                    aria-label={t('chat.copy.searchForToolsAndFiles_6730018d')}
                    type="search"
                    inputMode="search"
                    enterKeyHint="search"
                    value={mobileToolsQuery}
                    onChange={(event) => setMobileToolsQuery(event.target.value)}
                    placeholder={t('chat.copy.searchForToolsAndFiles_6730018d')}
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
                  {t('chat.copy.close_bbfa773e')}
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
                      <div className="bolt-mobile-more-section-label">
                        {section === 'search' ? t('chat.copy.search_bce06414') : t('chat.copy.tools_4fa8cc86')}
                      </div>
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
                <div className="bolt-mobile-more-empty">
                  {t('chat.copy.noToolsFoundFor_57552084')}
                  {mobileToolsQuery}".
                </div>
              )}
            </section>
          </>
        )}
        {projectIdeMode && (
          <footer
            className={classNames('bolt-project-statusbar', {
              'bolt-project-statusbar-mobile': useMobileIde,
            })}
            aria-label={t('chat.copy.ideStatus_15238998')}
          >
            <div className="bolt-project-statusbar-primary">
              <span
                className="bolt-project-statusbar-pill"
                role="status"
                aria-live="polite"
                title={
                  statusbarConnection.state === 'offline'
                    ? t('chat.copy.offlineEditsStayLocalUntilThe_6c528a0d')
                    : statusbarConnection.state === 'reconnecting'
                      ? t('chat.copy.workspaceRuntimeIsStartingOrReconnecting_dae64fde')
                      : t('chat.copy.workspaceConnectionHealthy_f87a6d3a')
                }
              >
                <span
                  aria-hidden
                  className={classNames(
                    'inline-block h-[7px] w-[7px] shrink-0 rounded-full',
                    statusbarConnection.state === 'reconnecting' && 'animate-pulse',
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
                aria-label={t('chat.copy.openGitPanelBranchValue0Value1_b3c8a94c', {
                  value0: projectBackendState.git?.branch ?? 'main',
                  value1: projectBackendState.git?.ahead ?? 0,
                  value2: projectBackendState.git?.behind ?? 0,
                  value3: statusbarChangedFiles,
                })}
                title={t('chat.copy.gitBranchValue0AheadValue1Behind_cbe910c1', {
                  value0: projectBackendState.git?.branch ?? 'main',
                  value1: projectBackendState.git?.ahead ?? 0,
                  value2: projectBackendState.git?.behind ?? 0,
                  value3: statusbarChangedFiles,
                })}
                onClick={() => openWorkspacePanel('git')}
              >
                <span className="i-ph:git-branch" aria-hidden />
                <span className="bolt-project-statusbar-label">{t('chat.copy.git_58197788')}</span>
                <strong>{projectBackendState.git?.branch ?? t('chat.copy.main_b28b7af6')}</strong>
                {statusbarChangedFiles > 0 ? (
                  <span
                    className="bolt-project-statusbar-count"
                    aria-label={t('chat.copy.value0ChangedFiles_1a946eed', { value0: statusbarChangedFiles })}
                  >
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
                    aria-label={t('chat.copy.value0CommitsToPushValue1Commits_3da2e29d', {
                      value0: projectBackendState.git?.ahead ?? 0,
                      value1: projectBackendState.git?.behind ?? 0,
                    })}
                    title={t('chat.copy.value0ToPushValue1ToPull_14e8383b', {
                      value0: projectBackendState.git?.ahead ?? 0,
                      value1: projectBackendState.git?.behind ?? 0,
                    })}
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
                              ? `${t('baseChatAst.git.push')}${
                                  (projectBackendState.git?.ahead ?? 0) > 0 ? ` ${projectBackendState.git?.ahead}` : ''
                                }`
                              : `${t('baseChatAst.git.pull')}${
                                  (projectBackendState.git?.behind ?? 0) > 0
                                    ? ` ${projectBackendState.git?.behind}`
                                    : ''
                                }`}
                          </button>
                        </Popover.Close>
                      ))}
                      {statusbarGitRemoteUrl === null ? (
                        <p className="px-1 text-xs leading-4 text-bolt-elements-textSecondary">
                          {t('chat.copy.noRemoteConfiguredConnectOneIn_c5d82469')}
                        </p>
                      ) : projectBackendState.git?.detached ? (
                        <p className="px-1 text-xs leading-4 text-bolt-elements-textSecondary">
                          {t('chat.copy.detachedHeadCreateABranchIn_c49bc71e')}
                        </p>
                      ) : null}
                    </div>
                  </Popover.Content>
                </Popover.Portal>
              </Popover.Root>
              <button
                type="button"
                className="bolt-project-statusbar-pill"
                aria-label={t('chat.copy.openProblemsValue0Value1Value2Value3_cdcc72fd', {
                  value0: statusbarDiagnostics.errors,
                  value1:
                    statusbarDiagnostics.errors === 1 ? t('chat.copy.error_11f9578d') : t('chat.copy.errors_57004359'),
                  value2: statusbarDiagnostics.warnings,
                  value3:
                    statusbarDiagnostics.warnings === 1
                      ? t('chat.copy.warning_383fd7bf')
                      : t('chat.copy.warnings_bd207fab'),
                })}
                title={t('baseChatAst.diagnostics.summary', {
                  errors: formatBaseChatAstNumber(language, statusbarDiagnostics.errors),
                  errorsLabel:
                    statusbarDiagnostics.errors === 1 ? t('chat.copy.error_11f9578d') : t('chat.copy.errors_57004359'),
                  warnings: formatBaseChatAstNumber(language, statusbarDiagnostics.warnings),
                  warningsLabel:
                    statusbarDiagnostics.warnings === 1
                      ? t('chat.copy.warning_383fd7bf')
                      : t('chat.copy.warnings_bd207fab'),
                })}
                onClick={() => openBottomTerminal('problems')}
              >
                <span className="bolt-project-statusbar-label">{t('chat.copy.problems_8e6b86dc')}</span>
                <span
                  className="bolt-project-statusbar-error-count"
                  data-empty={statusbarDiagnostics.errors === 0 ? 'true' : undefined}
                  aria-label={t('baseChatAst.diagnostics.count', {
                    /*
                     * `count` doit rester un NOMBRE : i18next s'en sert pour
                     * choisir entre `_one` et `_other`, et une chaîne déjà
                     * formatée faisait échouer la résolution — l'étiquette lue
                     * par un lecteur d'écran tombait sur « Unavailable », en
                     * anglais, dans une interface française. Le nombre mis en
                     * forme passe à part.
                     */
                    count: statusbarDiagnostics.errors,
                    formatted: formatBaseChatAstNumber(language, statusbarDiagnostics.errors),
                    label:
                      statusbarDiagnostics.errors === 1
                        ? t('chat.copy.error_11f9578d')
                        : t('chat.copy.errors_57004359'),
                  })}
                >
                  <span className="i-ph:x-circle-fill" aria-hidden />
                  {statusbarDiagnostics.errors}
                </span>
                <span
                  className="bolt-project-statusbar-warning-count"
                  data-empty={statusbarDiagnostics.warnings === 0 ? 'true' : undefined}
                  aria-label={t('baseChatAst.diagnostics.count', {
                    /*
                     * `count` doit rester un NOMBRE : i18next s'en sert pour
                     * choisir entre `_one` et `_other`, et une chaîne déjà
                     * formatée faisait échouer la résolution — l'étiquette lue
                     * par un lecteur d'écran tombait sur « Unavailable », en
                     * anglais, dans une interface française. Le nombre mis en
                     * forme passe à part.
                     */
                    count: statusbarDiagnostics.warnings,
                    formatted: formatBaseChatAstNumber(language, statusbarDiagnostics.warnings),
                    label:
                      statusbarDiagnostics.warnings === 1
                        ? t('chat.copy.warning_383fd7bf')
                        : t('chat.copy.warnings_bd207fab'),
                  })}
                >
                  <span className="i-ph:warning-fill" aria-hidden />
                  {statusbarDiagnostics.warnings}
                </span>
              </button>
              {/*
               * BUG-CREATE-002 — le rejet de quota n'était signalé que par un « ! »
               * posé sur ce bouton, dont le clic ouvrait la vue « terminal » : le
               * Shell, où le message n'est pas rendu. Le diagnostic est pourtant
               * bien poussé dans le panneau PROBLÈMES (diagnostics.ts:248). On route
               * donc le clic vers la vue qui contient réellement le message, et on
               * met ce message dans l'infobulle pour qu'il soit lisible sans ouvrir
               * quoi que ce soit.
               */}
              <button
                type="button"
                className="bolt-project-statusbar-pill bolt-project-statusbar-workspace"
                onClick={() => openBottomTerminal(quotaWarning || billingUpgradePrompt ? 'problems' : 'terminal')}
                title={quotaWarning || workspaceStatusTitle}
                aria-label={quotaWarning || workspaceStatusTitle || t('chat.copy.openWorkspaceTerminal_b039db9a')}
              >
                <span
                  className="bolt-project-statusbar-runtime-dot"
                  data-state={workspaceError ? 'error' : workspaceLoading ? 'starting' : runtimeUiState}
                  aria-hidden
                />
                <span className="bolt-project-statusbar-label">{t('chat.copy.workspace_4ca0a75c')}</span>
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
                      ? t('chat.copy.showWorkspaceLogs_fb555ca7')
                      : terminalBottomOpen
                        ? t('chat.copy.hideWorkspaceLogs_47034470')
                        : t('chat.copy.showWorkspaceLogs_fb555ca7')
                  }
                  aria-label={t('chat.copy.value0WorkspaceLogsValue1LogLines_8bbbae16', {
                    value0: terminalBottomOpen ? t('baseChatAst.common.hide') : t('baseChatAst.common.show'),
                    value1: workspaceLogs.length,
                  })}
                >
                  <span className="i-ph:list-magnifying-glass" aria-hidden />
                  <span className="bolt-project-statusbar-label">
                    {!useMobileIde && terminalBottomOpen
                      ? t('chat.copy.hideLogs_d1fea8c5')
                      : t('chat.copy.logs_126dd3b7')}
                  </span>
                  <span className="bolt-project-statusbar-count">{workspaceLogs.length}</span>
                </button>
              ) : null}
              <button
                type="button"
                className="bolt-project-statusbar-pill bolt-project-statusbar-runtime"
                aria-label={
                  workspaceError
                    ? t('chat.copy.crashedRuntime_28a31e36')
                    : workspaceLoading
                      ? t('chat.copy.buildingRuntime_054f1799')
                      : isRuntimeReallyRunning
                        ? t('chat.copy.runningOnValue0_0f8bc1d7', { value0: runtimePortSummary })
                        : t('chat.copy.stoppedRuntime_94f5c638')
                }
                onClick={() => {
                  if (useMobileIde) {
                    setMobileIdePanel('preview');

                    return;
                  }

                  openWorkspacePanel('preview');
                }}
                title={t('chat.copy.openPreviewValue0Value1Value2_a2664c5a', {
                  value0: runtimeStatusSummary,
                  value1: runtimePortSummary,
                  value2: runtimeDevServerSummary,
                })}
              >
                <span className="i-ph:monitor-play" aria-hidden />
                <span className="bolt-project-statusbar-label">{t('chat.copy.preview_f1fbb2b4')}</span>
                <span className="bolt-project-statusbar-muted">{runtimePortCompactSummary}</span>
                <span className="bolt-project-statusbar-muted bolt-project-statusbar-optional">
                  {runtimeDevServerSummary}
                </span>
              </button>
            </div>
            <div className="bolt-project-statusbar-secondary" aria-label={t('chat.copy.editorStatus_93f582c4')}>
              {(() => {
                const cursorValue =
                  currentDocument?.filePath && cursorPositions[currentDocument.filePath]
                    ? t('chat.copy.lnValue0ColValue1_98b8103f', {
                        value0: cursorPositions[currentDocument.filePath].line,
                        value1: cursorPositions[currentDocument.filePath].column,
                      })
                    : t('chat.copy.ln1Col1_b6c4de39');
                const editorItems: Array<{ key: string; tier: 1 | 2 | 3 | 4; title: string; value: string }> = [
                  { key: 'cursor', tier: 4, title: t('chat.copy.currentCursorPosition_3b9ed6e5'), value: cursorValue },
                  { key: 'indent', tier: 2, title: t('chat.copy.indentation2Spaces_d1008d4c'), value: 'Spaces: 2' },
                  { key: 'encoding', tier: 1, title: t('chat.copy.fileEncodingUtf8_b8734a83'), value: 'UTF-8' },
                  {
                    key: 'language',
                    tier: 3,
                    title: t('chat.copy.detectedLanguageMode_3617844d'),
                    value: fileTypeLabel(t, currentDocument?.filePath),
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
                          aria-label={t('chat.copy.showEditorStatusDetails_4ad9efe1')}
                          title={t('chat.copy.moreEditorStatus_8a1aa94a')}
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
                aria-label={t('chat.copy.toggleValue0_f75a5e61', { value0: SHELL_TERMINAL_LABEL })}
                title={t('chat.copy.toggleValue0_f75a5e61', { value0: SHELL_TERMINAL_LABEL })}
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
                aria-label={t('chat.copy.focusAgentComposer_778a634b')}
                title={t('chat.copy.focusAgentComposer_778a634b')}
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
                <h2 id="rollback-title">{t('chat.copy.rollbackToCheckpoint_b3cc16a0')}</h2>
                {/*
                 * No per-checkpoint screenshot is captured or stored, so a static
                 * 'Screenshot — Preview expired' placeholder would misrepresent the
                 * state being reverted to in this destructive confirmation. Only
                 * truthful checkpoint metadata is shown below.
                 */}
                <section>
                  <span className="bolt-project-rollback-label">{t('chat.copy.targetCheckpoint_8dfbabe1')}</span>
                  <h3>{rollbackTarget.title}</h3>
                  <p>{rollbackTarget.description}</p>
                  <small>
                    {rollbackTarget.ageLabel}
                    {rollbackTarget.commitSha ? ` • ${rollbackTarget.commitSha}` : ''}
                  </small>
                </section>
                <section>
                  <span className="bolt-project-rollback-label">{t('chat.copy.whatWillBeImpacted_e370579d')}</span>
                  <div className="bolt-project-rollback-impact">
                    <strong>{t('chat.copy.files_6ce6c512')}</strong>
                    {rollbackTarget.snapshot?.id ? (
                      <p>{t('chat.copy.allFilesInYourAppWill_216ac181')}</p>
                    ) : (
                      <p>{t('chat.copy.noFileSnapshotIsAvailableFor_43c662d0')}</p>
                    )}
                    <strong>{t('chat.copy.agentMemory_bcf5354f')}</strong>
                    <p>{t('chat.copy.theAgentSMemoryWillReset_1cccfbd1')}</p>
                    <strong>{t('chat.copy.tasks_090ec5f5')}</strong>
                    <p>{t('chat.copy.allInProgressTasksWillFinish_8502f56c')}</p>
                  </div>
                </section>
                <section>
                  <span className="bolt-project-rollback-label">
                    {t('chat.copy.additionalRollbackOptions_0a728603')}
                  </span>
                  <label className="bolt-project-rollback-option">
                    <input
                      type="checkbox"
                      checked={rollbackDatabase}
                      onChange={(event) => setRollbackDatabase(event.currentTarget.checked)}
                    />
                    <span>
                      <strong>{t('chat.copy.database_61074f1c')}</strong>
                      <small>{t('chat.copy.yourDevelopmentDatabaseWillBeRestored_5db4609a')}</small>
                    </span>
                  </label>
                </section>
              </div>
              <footer>
                <button type="button" onClick={() => setRollbackTarget(null)} disabled={rollbackBusy}>
                  {t('chat.copy.cancel_77dfd213')}
                </button>
                <button type="button" onClick={confirmProjectRollback} disabled={rollbackBusy}>
                  {rollbackBusy
                    ? t('chat.copy.rollingBack_1accbd2a')
                    : t('chat.copy.rollbackToThisCheckpoint_7d8b2a6c')}
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
  const { t } = useTranslation();

  return (
    <div className="bolt-project-guided-tour" role="dialog" aria-modal="false" aria-labelledby="ide-tour-title">
      <div className="bolt-project-guided-tour-card">
        <div className="bolt-project-guided-tour-kicker">
          {t('chat.copy.guidedTour_5a0d3068')}
          <span>
            {stepIndex + 1}/{totalSteps}
          </span>
        </div>
        <h2 id="ide-tour-title">{t(step.title)}</h2>
        <p>{t(step.description)}</p>
        {'shortcut' in step && step.shortcut ? (
          <div className="bolt-project-guided-tour-shortcut">
            <span>{t('chat.copy.shortcut_e2012dea')}</span>
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
            {t('chat.copy.skipTour_57bc79e3')}
          </button>
          <div>
            <button type="button" onClick={onBack} disabled={stepIndex === 0}>
              {t('chat.copy.back_b52b36b7')}
            </button>
            <button type="button" onClick={onNext}>
              {stepIndex === totalSteps - 1 ? t('chat.copy.finish') : t('chat.copy.next')}
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

/*
 * BUG-IDE-013 — « Problèmes » n'est pas alimenté par `/ide-panel/:panel` mais
 * par le store `diagnostics`, côté client.
 *
 * L'aiguillage vit dans cette enveloppe SANS crochet, et non au point d'appel :
 * le point d'appel mobile est dans le bloc GELÉ par Avi (`mobileHeaderTab` →
 * `projectIdeMode`), scellé par empreinte dans `base-chat-ast.spec.ts`. Le
 * modifier aurait fait dériver le sceau — exactement ce qu'il est là pour
 * refuser. Le corps réel n'a pas bougé ; il est simplement appelé par
 * l'enveloppe, donc aucun crochet n'est rendu conditionnel.
 */
function ProjectIdeServicePanel(props: React.ComponentProps<typeof ProjectIdeApiServicePanel>) {
  if (props.panel === 'problems') {
    return <ProjectProblemsPanel />;
  }

  return <ProjectIdeApiServicePanel {...props} />;
}

function ProjectIdeApiServicePanel({
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
  const { t } = useTranslation();

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

  // One-time share link returned by the share-link action; the raw token is never re-listed afterwards.
  const [createdShareLink, setCreatedShareLink] = useState<string | undefined>();
  const loadingPanelRef = useRef(false);

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

  const title = displayTitle ?? panelTitle(panel, t);
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

    throw lastNetworkError instanceof Error
      ? lastNetworkError
      : new Error(t('chat.copy.unableToReachIdePanelApi_d66f72aa'));
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
          console.warn('IDE panel request failed', {
            panel,
            status: response.status,
            serverError: result.error,
          });
          setError(t('baseChatAst.panel.loadFailedHttp', { status: response.status }));

          if (!options?.silent) {
            setPayload(undefined);
          }

          return;
        }

        if (result.status === 'error' && typeof result.error === 'object' && result.error) {
          console.warn('IDE panel returned an error envelope', { panel, serverError: result.error });
          setError(`[${result.error.code}] ${t('baseChatAst.panel.loadFailed')}`);
        }

        const loadedAt = new Date().toISOString();
        setPayload(result);
        setLastLoadedAt(loadedAt);

        // Cache the fresh payload so a later revisit to this tab renders instantly.
        if (projectId) {
          writeProjectPanelCache(`${projectId}:${panel}`, { payload: result, lastLoadedAt: loadedAt });
        }
      } catch (requestError) {
        console.error('IDE panel request failed', { panel, requestError });
        setError(t('baseChatAst.panel.loadFailed'));

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
    [fetchPanel, panel, projectId, t],
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
    setActionNotice(t('baseChatAst.panel.submitting'));

    const formData = new FormData(form);
    const intent = String(formData.get('intent') ?? 'default');

    try {
      const response = await fetchPanel(`/api/projects/${projectId}/ide-panel/${panel}`, {
        method: 'POST',
        body: formData,
      });

      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
        code?: string;
        reason?: string;
        shareLink?: { url?: string };
      };

      if (!response.ok) {
        console.warn('IDE panel action failed', {
          panel,
          intent,
          status: response.status,
          serverError: result.error,
        });

        /*
         * Le message du serveur PRIME sur le générique de statut. Il est déjà
         * masqué et localisé côté route ; le remplacer par « HTTP 503 »
         * annulait le travail fait en amont pour nommer la cause.
         */
        const { message } = panelActionFailureMessage(
          result,
          t('baseChatAst.panel.actionFailedHttp', { status: response.status }),
        );
        setError(message);
        setActionNotice(undefined);
        window.dispatchEvent(
          new CustomEvent('vibecore:ide-panel-action', { detail: { panel, intent, ok: false, error: message } }),
        );

        return;
      }

      if (result.shareLink?.url) {
        setCreatedShareLink(result.shareLink.url);
        setActionNotice(t('baseChatAst.panel.shareCreated'));
        void navigator.clipboard?.writeText(result.shareLink.url).catch(() => {
          // Clipboard may be blocked; the URL is still shown for manual copy.
        });
      } else {
        setActionNotice(formatProjectPanelActionNotice(t, intent));
      }

      if (shouldResetIdePanelFormAfterSubmit(panel, intent)) {
        form.reset();
      }

      window.dispatchEvent(new CustomEvent('vibecore:ide-panel-action', { detail: { panel, intent, ok: true } }));
      void loadPanel({ silent: true });
    } catch (requestError) {
      console.error('IDE panel action request failed', { panel, intent, requestError });

      const message = t('baseChatAst.panel.actionFailed');

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

  return (
    <div className="bolt-project-service-panel" data-testid="ide-service-panel" data-panel={panel}>
      {/*
       * AV-UX point 10 : la puce « Mis à jour … » et le menu ⋮ (« Actualiser
       * maintenant » / cadence) sont retirés de TOUS les panneaux. Le
       * rafraîchissement est AUTOMATIQUE (intervalle silencieux ci-dessus,
       * 15 s ou 60 s selon le panneau, + rechargement après chaque action) :
       * la rangée n'apportait qu'une méta-information redondante. En mobile,
       * l'en-tête (icône + titre) est masqué par la feuille responsive — le
       * titre est déjà dans l'en-tête mobile gelé.
       */}
      <IdePanelHeader icon={icon} title={title} />
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
            className="mb-4 flex items-start gap-3 rounded-md border border-[var(--status-error-border)] bg-[var(--status-error-bg)] px-3 py-2 text-sm text-[var(--status-error-text)]"
            role="alert"
          >
            <span className="flex-1">{error}</span>
            <PanelButton type="button" variant="danger" size="sm" onClick={() => void loadPanel()} disabled={busy}>
              {t('chat.copy.retry_9f5cd8a2')}
            </PanelButton>
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
              {t('chat.copy.shareLinkCreatedCopiedToClipboard_ff151a13')}
            </span>
            <div className="flex items-center gap-2">
              <PanelInput
                readOnly
                size="sm"
                value={createdShareLink}
                onFocus={(event) => event.currentTarget.select()}
                className="flex-1 select-all font-mono text-bolt-elements-textPrimary"
                aria-label={t('chat.copy.shareLinkUrl_4e30a187')}
              />
              <PanelButton
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void navigator.clipboard?.writeText(createdShareLink).catch(() => undefined)}
              >
                {t('chat.copy.copy_af74f7c5')}
              </PanelButton>
              <PanelButton
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setCreatedShareLink(undefined)}
                aria-label={t('chat.copy.dismissShareLink_275b18df')}
              >
                {t('chat.copy.dismiss_70afe9ef')}
              </PanelButton>
            </div>
          </div>
        ) : null}
        {busy && !payload ? (
          <div className="flex flex-col gap-3">
            {/* Discreet skeleton while the first fetch is in flight — no raw
                "from backend" text and no immediate Retry (which reads as broken). */}
            <PanelLoading title={t('chat.copy.loadingValue0_99abf3e6', { value0: title.toLowerCase() })} />
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
                <span>{t('chat.copy.thisIsTakingLongerThanUsual_04718c01')}</span>
                <PanelButton type="button" variant="outline" size="sm" onClick={() => void loadPanel()}>
                  {t('chat.copy.retry_9f5cd8a2')}
                </PanelButton>
              </div>
            ) : null}
          </div>
        ) : payload?.status === 'empty' && !error && !rendersEmptyStateActions ? (
          <PanelEmptyState
            icon={icon}
            title={t('baseChatAst.phrases.emptyYet', { title: title.toLowerCase() })}
            description={t('chat.copy.onceYourWorkspaceProducesDataIt_1de76193')}
          />
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

function formatProjectPanelActionNotice(t: TFunction, intent: string) {
  const normalizedIntent = intent === 'default' ? 'settings' : intent;

  if (normalizedIntent.startsWith('delete') || normalizedIntent.startsWith('revoke')) {
    return t('baseChatAst.panel.action.destructiveSubmitted');
  }

  if (normalizedIntent.startsWith('run') || normalizedIntent.startsWith('start')) {
    return t('baseChatAst.panel.action.started');
  }

  if (normalizedIntent.startsWith('stop') || normalizedIntent === 'cancel') {
    return t('baseChatAst.panel.action.requested');
  }

  return t('baseChatAst.panel.action.saved');
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
  const { t } = useTranslation();
  const workspaceStatus = useStore(workbenchStore.workspaceStatus);
  const runtimePreviews = useStore(workbenchStore.previews);
  const diagnosticErrorCount = useDiagnosticsStore((state) => state.errors);
  const diagnosticWarningCount = useDiagnosticsStore((state) => state.warnings);
  const effectiveWorkspace = runtimeWorkspace ?? workspaceStatus ?? null;
  const backendSessionId = effectiveWorkspace?.id ?? projectId ?? 'no-workspace';
  const runtimeUiState = workspaceUiState(effectiveWorkspace, { ports: runtimePreviews });

  const workspaceLabel = effectiveWorkspace
    ? t('baseChatAst.runtime.workspaceState', {
        status:
          runtimeUiState === 'running'
            ? t('baseChatAst.status.running').toLowerCase()
            : runtimeUiState === 'starting'
              ? t('baseChatAst.status.starting').toLowerCase()
              : (effectiveWorkspace.status ?? t('baseChatAst.status.unknown').toLowerCase()),
      })
    : t('baseChatAst.runtime.noWorkspace');

  const terminalTabs = [
    ['terminal', SHELL_TERMINAL_LABEL, 'i-ph:terminal-window'],
    ['output', t('baseChatAst.common.output'), 'i-ph:list-bullets'],
    ['problems', t('baseChatAst.common.problems'), 'i-ph:warning-circle'],
    ['debug', t('baseChatAst.common.debugConsole'), 'i-ph:bug'],
  ] as const;

  return (
    <section className="bolt-project-bottom-terminal" aria-label={t('chat.copy.pinnedTerminal_c8fe22f6')}>
      <div className="bolt-project-bottom-terminal-tabs">
        <div
          className="bolt-project-bottom-terminal-tabs-left"
          aria-label={t('chat.copy.pinnedTerminalViews_49687702')}
        >
          {terminalTabs.map(([id, label, icon]) => (
            <button
              key={id}
              type="button"
              aria-current={active === id ? 'page' : undefined}
              aria-label={
                id === 'problems'
                  ? t('chat.copy.openProblemsValue0ErrorsAndValue1_ef267d7f', {
                      value0: diagnosticErrorCount,
                      value1: diagnosticWarningCount,
                    })
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
                  title={t('chat.copy.value0ErrorsValue1Warnings_500056a8', {
                    value0: diagnosticErrorCount,
                    value1: diagnosticWarningCount,
                  })}
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
            {t('chat.copy.session_f7f1997c')}
            {backendSessionId === 'no-workspace' ? t('baseChatAst.status.pending') : backendSessionId.slice(0, 8)}
          </span>
          <button
            type="button"
            aria-label={t('chat.copy.refreshRuntimeLogs_1554f590')}
            onClick={() => {
              onActiveChange('terminal');
              void workbenchStore.refreshRuntimePorts().catch(() => undefined);
            }}
          >
            <span className="i-ph:arrow-clockwise" aria-hidden />
          </button>
          <button type="button" aria-label={t('chat.copy.closeTerminalPanel_9f78d80c')} onClick={onClose}>
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
  const { t } = useTranslation();
  return (
    <div className="h-full">
      <div className="bolt-terminal-tabs-shell bg-bolt-elements-terminals-background flex h-full flex-col">
        <div className="bolt-terminal-tabs-bar" data-testid="terminal-tabs-bar" aria-busy="true">
          <div className="bolt-terminal-session-switcher" aria-label={t('chat.copy.shellSessions_af5dbf7c')}>
            <button
              type="button"
              className="bolt-terminal-session-button"
              aria-label={t('chat.copy.shellSessionLoading_f020ee73')}
              disabled
            >
              <span className="i-ph:caret-down" aria-hidden />
              <span className="bolt-terminal-session-label">{t('chat.copy.workspaceBash_f04a2ba1')}</span>
            </button>
          </div>
          <div className="bolt-terminal-primary-actions" aria-label={t('chat.copy.shellActions_f8a7f542')}>
            <button
              type="button"
              className="bolt-terminal-icon-button"
              aria-label={t('chat.copy.findInShell_f73f20f0')}
              disabled
            >
              <span className="i-ph:magnifying-glass" aria-hidden />
            </button>
            <button
              type="button"
              className="bolt-terminal-icon-button"
              aria-label={t('chat.copy.clearConversation_751e4570')}
              disabled
            >
              <span className="i-ph:trash" aria-hidden />
            </button>
            <div className="bolt-terminal-more">
              <button
                type="button"
                className="bolt-terminal-more-button"
                aria-label={t('chat.copy.moreShellActions_b0815143')}
                disabled
              >
                <span className="i-ph:dots-three-vertical-bold" aria-hidden />
              </button>
            </div>
            <button
              type="button"
              className="bolt-terminal-icon-button"
              aria-label={t('chat.copy.closeTab_296b59cd')}
              disabled
            >
              <span className="i-ph:x" aria-hidden />
            </button>
          </div>
        </div>
        <div className="bolt-terminal-content-frame">
          <div className="bolt-terminal-viewports">
            <div className="grid h-full place-items-center text-sm text-bolt-elements-textSecondary" role="status">
              {t('chat.copy.loadingTerminal_641ac822')}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/*
 * Runtime diagnostics are parsed log lines with no structured file/line field,
 * so recover the location from the text when one exists (see
 * ~/lib/stores/problem-location for the two dev-server shapes it handles).
 * Entries without a parseable location stay plain rows.
 */
function extractProblemLocation(diagnostic: Diagnostic): ProblemLocation | null {
  return parseProblemLocation(`${diagnostic.message}\n${diagnostic.detail ?? ''}`);
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
  const { t } = useTranslation();
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

    // UNIF-06 : le titre vient d'IdePanelHeader et est un h2 (plus un h3 maison).
    const target =
      panel.querySelector<HTMLElement>('.bolt-project-problem-open') ?? panel.querySelector<HTMLElement>('h2');
    target?.focus({ preventScroll: true });
  }, []);

  const openProblemLocation = (resolvedPath: string, line: number) => {
    workbenchStore.setSelectedFile(resolvedPath);
    workbenchStore.setCurrentDocumentScrollPosition({ line: Math.max(0, line - 1), column: 0 });
    workbenchStore.currentView.set('code');
  };

  return (
    <section
      ref={panelRef}
      className="bolt-project-problems-panel"
      aria-label={t('chat.copy.problems_8e6b86dc')}
      aria-live="polite"
    >
      {/*
       * UNIF-06 (audit H1) : Problems adoptait une tête maison (h3 + résumé)
       * différente de l'en-tête commun des panneaux. Il passe sur le même
       * IdePanelHeader (icône + titre + slot droite) ; les compteurs restent le
       * slot d'actions, le résumé textuel doublonnait les puces et disparaît.
       */}
      <IdePanelHeader icon={panelIcon('problems')} title={t('chat.copy.problems_8e6b86dc')} titleTabIndex={-1}>
        <div
          className="bolt-project-problems-counts"
          aria-label={t('baseChatAst.diagnostics.summary', {
            errors,
            errorsLabel: errors === 1 ? t('chat.copy.error_11f9578d') : t('chat.copy.errors_57004359'),
            warnings,
            warningsLabel: warnings === 1 ? t('chat.copy.warning_383fd7bf') : t('chat.copy.warnings_bd207fab'),
          })}
        >
          <span
            className="bolt-project-problems-count bolt-project-problems-count-error"
            data-empty={errors === 0 ? 'true' : undefined}
          >
            <span className="i-ph:x-circle-fill" aria-hidden />
            {errors}
            <span className="bolt-project-problems-count-suffix">
              {errors === 1 ? t('chat.copy.error_11f9578d') : t('chat.copy.errors_57004359')}
            </span>
          </span>
          <span
            className="bolt-project-problems-count bolt-project-problems-count-warning"
            data-empty={warnings === 0 ? 'true' : undefined}
          >
            <span className="i-ph:warning-fill" aria-hidden />
            {warnings}
            <span className="bolt-project-problems-count-suffix">
              {warnings === 1 ? t('chat.copy.warning_383fd7bf') : t('chat.copy.warnings_bd207fab')}
            </span>
          </span>
        </div>
      </IdePanelHeader>
      {diagnostics.length === 0 ? (
        <PanelEmptyState
          icon="i-ph:check-circle"
          title={t('chat.copy.noProblemsDetected_2b9a1d7d')}
          description={t('chat.copy.runtimeDiagnosticsPreviewErrorsAndWarnings_0b9c0dad')}
          className="m-3 flex-1"
        />
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
                    <strong>
                      {diagnostic.severity === 'error'
                        ? t('chat.copy.error_7f2f6a15')
                        : t('chat.copy.warning_e9c45563')}
                    </strong>
                    <span>{diagnostic.source}</span>
                    {diagnostic.occurrences && diagnostic.occurrences > 1 ? (
                      <span>{t('baseChatAst.counts.occurrences', { count: diagnostic.occurrences })}</span>
                    ) : null}
                    {location && resolvedPath ? (
                      <button
                        type="button"
                        className="bolt-project-problem-open"
                        onClick={() => openProblemLocation(resolvedPath, location.line)}
                        aria-label={t('chat.copy.openValue0AtLineValue1_d3ee3837', {
                          value0: location.path,
                          value1: location.line,
                        })}
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
  const { t } = useTranslation();
  const [toolsOpen, setToolsOpen] = useState(false);

  return (
    <section className="bolt-project-terminal-direct-panel" aria-label={t('chat.copy.interactiveTerminal_a0b76f34')}>
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
          {t('chat.copy.runtimePanels_8560a91c')}
        </button>
      </div>
      {toolsOpen ? <ProjectTerminalPanel projectId={projectId} /> : null}
    </section>
  );
}

function ProjectTerminalPanel({ projectId }: { projectId?: string }) {
  const { t, i18n } = useTranslation();
  const language = resolvedBaseChatLanguage(i18n);
  const [activeTab, setActiveTab] = useState<'shell' | 'environment' | 'scripts' | 'connections'>('shell');
  const [payload, setPayload] = useState<any>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(() => new Set(['.', '/workspace']));
  const [showSshForm, setShowSshForm] = useState(false);
  const [showKeygenForm, setShowKeygenForm] = useState(false);
  const [showScriptForm, setShowScriptForm] = useState(false);
  const [customScript, setCustomScript] = useState('');
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
        console.warn('Terminal panel request failed', {
          status: response.status,
          serverError: result?.error,
        });
        setError(t('baseChatAst.terminal.loadFailedHttp', { status: response.status }));

        return;
      }

      if (result.status === 'error' && result.error) {
        console.warn('Terminal panel returned an error envelope', result.error);

        const code = typeof result.error?.code === 'string' ? `[${result.error.code}] ` : '';
        setError(`${code}${t('baseChatAst.terminal.loadFailed')}`);
      }

      setPayload(result);
    } catch (requestError) {
      console.error('Terminal panel request failed', requestError);
      setError(t('baseChatAst.terminal.loadFailed'));
    } finally {
      setBusy(false);
    }
  }, [projectId, t]);

  useEffect(() => {
    void loadPanel();
  }, [loadPanel]);

  /*
   * R-2 — the Environment tab hosts the REAL env/secrets panels, whose forms
   * must reach their own endpoints (`/ide-panel/env`, `/ide-panel/secrets`),
   * not the terminal's. Same submit contract as `submit` below, only the target
   * panel changes; the terminal payload is reloaded afterwards so the mounted
   * panels see the write they just made.
   */
  function submitToPanel(panel: 'env' | 'secrets' | 'ports') {
    return async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      if (!projectId) {
        return;
      }

      const form = event.currentTarget;
      setBusy(true);
      setError(undefined);
      setMessage('');

      try {
        const response = await fetch(`/api/projects/${projectId}/ide-panel/${panel}`, {
          method: 'POST',
          body: new FormData(form),
        });

        const result = (await response.json().catch(() => ({}))) as any;

        if (!response.ok) {
          console.warn('Environment action request failed', {
            panel,
            status: response.status,
            serverError: result.error,
          });
          setError(t('baseChatAst.terminal.actionFailedHttp', { status: response.status }));

          return;
        }

        form.reset();

        /*
         * ProjectEnvPanel clears its controlled key/value inputs on this event
         * (a DOM-level form.reset() cannot), so it has to fire here too or the
         * form stays populated and the next create re-submits the old key.
         */
        window.dispatchEvent(
          new CustomEvent('vibecore:ide-panel-action', { detail: { panel, intent: 'upsert', ok: true } }),
        );
        setMessage(t('baseChatAst.terminal.actionApplied'));
        await loadPanel();
      } catch (requestError) {
        console.error('Environment action request failed', requestError);
        setError(t('baseChatAst.terminal.actionFailed'));
      } finally {
        setBusy(false);
      }
    };
  }

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
        console.warn('Terminal action request failed', {
          status: response.status,
          serverError: result.error,
        });
        setError(t('baseChatAst.terminal.actionFailedHttp', { status: response.status }));

        return;
      }

      form.reset();
      setShowSshForm(false);
      setShowKeygenForm(false);
      setShowScriptForm(false);
      setCustomScript('');
      setMessage(
        result.fingerprint
          ? t('baseChatAst.terminal.keyPairGenerated', {
              keyType: result.keyType ?? 'ed25519',
              fingerprint: result.fingerprint,
            })
          : t('baseChatAst.terminal.actionApplied'),
      );
      await loadPanel();
    } catch (requestError) {
      console.error('Terminal action request failed', requestError);
      setError(t('baseChatAst.terminal.actionFailed'));
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
          <h3>{t('chat.copy.shellEnvironment_ceb651a8')}</h3>
          <p>
            {t('chat.copy.liveWorkspaceShellRuntimeFilesProcesses_b135207c')}{' '}
            {workspaceId ?? t('chat.copy.thisProject_bd0d431c')}.
          </p>
        </div>
        <div>
          <button type="button" onClick={() => void loadPanel()} disabled={busy}>
            <span className="i-ph:arrows-clockwise" aria-hidden />
            {busy ? t('chat.copy.refreshing_505dddc9') : t('chat.copy.refresh_56e3badc')}
          </button>
          <form onSubmit={submit}>
            <input type="hidden" name="intent" value="restart-workspace" />
            <PanelButton disabled={busy} variant="outline">
              {t('chat.copy.restart_b134bd55')}
            </PanelButton>
          </form>
          <form onSubmit={submit}>
            <input type="hidden" name="intent" value="stop-workspace" />
            <PanelButton disabled={busy} variant="outline">
              {t('chat.copy.stop_9e253470')}
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
              {t('chat.copy.fileNavigator_35afe31d')}
            </h4>
            <small>{t('chat.copy.workspaceRoot_12c2483d')}</small>
            <div className="bolt-terminal-file-tree">
              {runtimeFiles.length ? (
                renderFileTree(runtimeFiles)
              ) : (
                <div className="bolt-project-empty-panel">{t('chat.copy.noFilesLoaded_de0672aa')}</div>
              )}
            </div>
          </section>

          <section>
            <h4>
              <span className="i-ph:hard-drives" aria-hidden />
              {t('chat.copy.runtime_c4740e4c')}
            </h4>
            <PanelRows
              rows={[
                [t('baseChatAst.common.workspace'), workspaceId ?? t('baseChatAst.status.none')],
                [
                  t('baseChatAst.common.status'),
                  runtimeStatusText(t, {
                    workspaceStatus: workspace,
                    ports: runtimePorts,
                    workspaceLoading: Boolean(workspace && !workspace.status),
                    workspaceError: workspace?.error,
                  }),
                ],
                [
                  t('baseChatAst.common.ports'),
                  runtimePorts.length
                    ? runtimePorts.map((port: any) => `:${port.port}`).join(', ')
                    : t('baseChatAst.status.none'),
                ],
                [t('baseChatAst.common.processes'), formatBaseChatAstNumber(language, runtimeProcesses.length)],
              ]}
              empty={t('baseChatAst.runtime.noDetails')}
            />
          </section>

          <section data-testid="card-ssh-connections">
            <div className="bolt-terminal-section-head">
              <h4>
                <span className="i-ph:wifi-high" aria-hidden />
                {t('chat.copy.sshConnections_564ae345')}
              </h4>
              <div className="bolt-terminal-section-actions">
                <button
                  type="button"
                  onClick={() => setShowKeygenForm((value) => !value)}
                  data-testid="button-ssh-generate-key"
                >
                  {t('chat.copy.generateKey_937129af')}
                </button>
                <button
                  type="button"
                  onClick={() => setShowSshForm((value) => !value)}
                  data-testid="button-ssh-connections"
                >
                  {t('chat.copy.add_61cc55aa')}
                </button>
              </div>
            </div>
            {showSshForm ? (
              <form onSubmit={submit} className="bolt-terminal-compact-form" data-testid="dialog-ssh">
                <input type="hidden" name="intent" value="add-ssh" />
                <PanelInput name="name" placeholder={t('chat.copy.productionBastion_786805c7')} required />
                <PanelInput name="host" placeholder={codeExample('host.example.com')} required />
                <PanelInput name="port" placeholder="22" defaultValue="22" />
                <PanelInput name="username" placeholder={t('chat.copy.deploy_b0d51b9f')} required />
                <textarea name="privateKey" placeholder={t('chat.copy.optionalPrivateKeyStoredAsA_2aecf154')} />
                <PanelButton disabled={busy} data-testid="button-add-ssh">
                  {t('chat.copy.saveSsh_9207c237')}
                </PanelButton>
              </form>
            ) : null}
            {showKeygenForm ? (
              <form onSubmit={submit} className="bolt-terminal-compact-form" data-testid="dialog-ssh-keygen">
                <input type="hidden" name="intent" value="generate-keypair" />
                <PanelInput name="name" placeholder={t('chat.copy.keyLabelEGDeployKey_058a1d24')} required />
                <select name="type" defaultValue="ed25519" aria-label={t('chat.copy.keyType_3b13fb6c')}>
                  <option value="ed25519">{t('chat.copy.ed25519Recommended_9405f411')}</option>
                  <option value="rsa">{t('chat.copy.rsa_01e4715c')}</option>
                </select>
                <PanelInput name="comment" placeholder={t('chat.copy.optionalCommentEGYouHost_de88ef9c')} />
                <PanelButton disabled={busy} data-testid="button-generate-keypair">
                  {t('chat.copy.generateKeyPair_27cc8fa3')}
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
                          aria-label={t('chat.copy.copyPublicKeyForValue0_8d2691a6', { value0: connection.name })}
                        >
                          {t('chat.copy.copyPublicKey_0e8baa3d')}
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
                      {connection.status === 'connected'
                        ? t('chat.copy.disconnect_ed28e068')
                        : t('chat.copy.connect_b65463cb')}
                    </PanelButton>
                  </form>
                  <form onSubmit={submit} className="bolt-terminal-ssh-git" data-testid={`ssh-git-${connection.id}`}>
                    <input type="hidden" name="intent" value="git-ssh" />
                    <input type="hidden" name="connectionId" value={connection.id} />
                    <PanelInput
                      name="repoUrl"
                      placeholder={t('chat.copy.gitGithubComOwnerRepoGit_227027b4')}
                      aria-label={t('chat.copy.sshGitUrl_f6b1fb5f')}
                    />
                    <PanelButton disabled={busy} variant="outline" data-testid={`button-git-ssh-${connection.id}`}>
                      {t('chat.copy.testGitAccess_ca9d5bc9')}
                    </PanelButton>
                  </form>
                </article>
              ))}
              {!sshConnections.length ? (
                <div className="bolt-project-empty-panel">{t('chat.copy.noSshConnectionsConfigured_149be10e')}</div>
              ) : null}
            </div>
          </section>
        </aside>

        <main className="bolt-terminal-main">
          <nav className="bolt-terminal-tabs" data-testid="tabs-shell">
            {[
              ['shell', t('baseChatAst.common.shell'), 'i-ph:terminal-window'],
              ['environment', t('baseChatAst.common.environment'), 'i-ph:key'],
              ['scripts', t('baseChatAst.common.scripts'), 'i-ph:lightning'],
              ['connections', t('baseChatAst.common.processes'), 'i-ph:activity'],
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
                <strong>{t('chat.copy.interactiveWorkspaceShell_cada4730')}</strong>
                <small>
                  {workspace?.status
                    ? runtimeStateLabel(t, workspace.status)
                    : t('chat.copy.runtimeStatusLoading_226ec569')}
                </small>
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

          {/*
           * R-2 — one implementation, mounted here.
           *
           * This tab used to carry its OWN env/secrets CRUD: a second set of
           * forms writing the same `/projects/:id/env-vars` and
           * `/projects/:id/secrets` endpoints as the Env vars and Secrets
           * tools. It was not merely redundant, it DIVERGED — the terminal
           * panel's `add-env`/`delete-env` sent no `scope`, and the store
           * defaults an omitted scope to production
           * (`prisma-store.upsertProjectEnvVar` / `deleteProjectEnvVar`). So
           * this tab listed variables from EVERY scope undifferentiated, then
           * wrote and deleted only the production row: deleting a
           * preview-scoped `API_URL` from here silently removed the
           * PRODUCTION one instead — or nothing, leaving the clicked row on
           * screen. It also keyed the list on `envVar.key`, which collides in
           * React as soon as one key exists in two scopes.
           *
           * Mounting the real panels keeps everything this tab offered — env
           * vars AND secrets side by side, which the dedicated tools show
           * separately — and gains what it never had: scope selection, search,
           * diff, and .env import.
           */}
          {activeTab === 'environment' && (
            <section className="bolt-terminal-card" data-testid="card-env-vars">
              <ProjectEnvPanel data={{ envVars }} onSubmit={submitToPanel('env')} busy={busy} />
              <ProjectSecretsPanel
                projectId={projectId}
                data={{ secrets }}
                onSubmit={submitToPanel('secrets')}
                busy={busy}
                reload={loadPanel}
              />
            </section>
          )}

          {activeTab === 'scripts' && (
            <section className="bolt-terminal-card" data-testid="card-script-runner">
              <div className="bolt-terminal-section-head">
                <div>
                  <strong>{t('chat.copy.scriptRunner_0765a7f9')}</strong>
                  <small>{t('chat.copy.runsCommandsThroughTheRuntimeCommand_7f7c4938')}</small>
                </div>
                <button
                  type="button"
                  onClick={() => setShowScriptForm((value) => !value)}
                  data-testid="button-create-script"
                >
                  {t('chat.copy.newScript_03e075be')}
                </button>
              </div>
              {showScriptForm ? (
                <form onSubmit={submit} className="bolt-terminal-script-editor" data-testid="dialog-script-editor">
                  <input type="hidden" name="intent" value="run-script" />
                  <PanelInput
                    name="name"
                    placeholder={t('chat.copy.customScript_929fa0a0')}
                    data-testid="input-script-name"
                  />
                  <textarea
                    name="script"
                    placeholder={t('chat.copy.binShEchoReady_fc10292a')}
                    value={customScript}
                    onChange={(event) => setCustomScript(event.target.value)}
                    data-testid="textarea-script-content"
                  />
                  <PanelButton disabled={busy || !customScript.trim()} data-testid="button-run-custom-script">
                    {t('chat.copy.runScript_9c520cef')}
                  </PanelButton>
                </form>
              ) : null}
              <div className="bolt-terminal-script-grid">
                {TERMINAL_SCRIPT_TEMPLATES.map(([id, name, description, script]) => (
                  <article key={id} data-testid={`script-template-${id}`}>
                    <div>
                      <span className="i-ph:lightning" aria-hidden />
                      <strong>{t(name)}</strong>
                      <p>{t(description)}</p>
                      <code>$ {script}</code>
                    </div>
                    <form onSubmit={submit}>
                      <input type="hidden" name="intent" value="run-script" />
                      <input type="hidden" name="name" value={t(name)} />
                      <input type="hidden" name="script" value={script} />
                      <PanelButton disabled={busy} variant="outline" data-testid={`button-run-${id}`}>
                        {t('chat.copy.run_b1b39260')}
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
                      <small>
                        {run.finishedAt
                          ? (formatBaseChatAstDateTime(language, run.finishedAt) ??
                            t('baseChatAst.status.notAvailable'))
                          : (formatBaseChatAstDateTime(language, run.startedAt) ??
                            t('baseChatAst.status.notAvailable'))}
                      </small>
                    </summary>
                    <pre>{run.output || t('chat.copy.noOutputCaptured_6c86d6de')}</pre>
                  </details>
                ))}
              </div>
            </section>
          )}

          {activeTab === 'connections' && (
            <section className="bolt-terminal-card" data-testid="card-runtime-processes">
              <div className="bolt-terminal-section-head">
                <div>
                  <strong>{t('chat.copy.processesAndPorts_52df812f')}</strong>
                  <small>{t('chat.copy.liveProcessAndPreviewPortState_e565a816')}</small>
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
                        {t('chat.copy.stop_9e253470')}
                      </PanelButton>
                    </form>
                  </article>
                ))}
                {!runtimeProcesses.length ? (
                  <div className="bolt-project-empty-panel">{t('chat.copy.noRuntimeProcessesReported_f02fbd04')}</div>
                ) : null}
              </div>
              {/*
               * R-3 — one ports implementation, mounted here.
               *
               * This tab used to re-render the port list itself from the very
               * same `runtimePortsFromPayload` helper the Ports tool uses, so
               * the same data had two renderers — and the copy here was the
               * poorer one: a bare link per port, with no primary-port
               * selection and no public/private toggle, the two things that
               * actually change how a port behaves. Mounting the real panel
               * removes the second renderer AND gives this tab the controls it
               * never had.
               *
               * The process list above stays: it is this panel's own, no tool
               * duplicates it.
               */}
              <ProjectPortsPanel
                data={{ ports: runtimePorts, portsState: data.portsState }}
                projectId={projectId}
                onSubmit={submitToPanel('ports')}
                busy={busy}
              />
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
  const { t } = useTranslation();
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
      toast.error(t('baseChatAst.files.entryExists', { path: target }));
      return;
    }

    if (kind === 'file') {
      onFileOpen(target);
      await workbenchStore.createFile(target, '');
    } else {
      await workbenchStore.createFolder(target);
    }
  }

  const collapseFilesLabel = collapsed ? t('baseChatAst.files.expandAll') : t('baseChatAst.files.collapseAll');
  const systemFilesLabel = showHiddenFiles ? t('baseChatAst.files.hideSystem') : t('baseChatAst.files.showSystem');

  const hiddenFilesSummary = hiddenSystemFileCount
    ? t('baseChatAst.files.hiddenSummary', {
        count: hiddenSystemFileCount,
        state: showHiddenFiles ? t('baseChatAst.files.shown') : t('baseChatAst.files.hidden'),
      })
    : t('baseChatAst.files.noHidden');

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
        title={createEntryKind === 'folder' ? t('chat.copy.newFolder_a711999b') : t('chat.copy.newFile_3cb7ea0f')}
        label={createEntryKind === 'folder' ? t('chat.copy.folderPath_cd6605ee') : t('chat.copy.filePath_1214946f')}
        placeholder={createEntryKind === 'folder' ? codeExample('src/components') : codeExample('src/index.ts')}
        confirmLabel={t('baseChatAst.files.create')}
        validate={(value) => (value.trim() ? undefined : t('baseChatAst.files.enterPath'))}
      />
      <div className="bolt-project-files-header">
        <span className="bolt-project-files-count" title={hiddenFilesSummary}>
          {/*
           * BUG-QA-I18N-COUNT-001 : `{fileCount}` et `{t(...)}` étaient deux
           * expressions JSX ADJACENTES — React les concatène sans séparateur, d'où
           * « 8fichiers ». La clé plurielle existait déjà et porte son espace.
           */}
          {t('baseChatAst.files.count', { count: fileCount })}
        </span>
        <HeaderTip label={t('chat.copy.newFile_3cb7ea0f')} side="top">
          <button
            type="button"
            aria-label={t('chat.copy.newFile_3cb7ea0f')}
            title={t('chat.copy.newFile_3cb7ea0f')}
            onClick={() => setCreateEntryKind('file')}
          >
            <span className="i-ph:file-plus" aria-hidden />
          </button>
        </HeaderTip>
        <HeaderTip label={t('chat.copy.newFolder_a711999b')} side="top">
          <button
            type="button"
            aria-label={t('chat.copy.newFolder_a711999b')}
            title={t('chat.copy.newFolder_a711999b')}
            onClick={() => setCreateEntryKind('folder')}
          >
            <span className="i-ph:folder-plus" aria-hidden />
          </button>
        </HeaderTip>
        <HeaderTip label={t('chat.copy.refreshFiles_75bfab07')} side="top">
          <button
            type="button"
            aria-label={t('chat.copy.refreshFiles_75bfab07')}
            title={t('chat.copy.refreshFiles_75bfab07')}
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
        <span>{t('chat.copy.search_bce06414')}</span>
        <input
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          placeholder={t('chat.copy.filterFiles_1c07a419')}
          aria-label={t('chat.copy.searchFiles_ec88257e')}
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
  onSplitActiveDown,
  onToggleFloating,
  onOpenNewWindow,
  isFloating,
  onMoveTab,
  paneId,
  onClosePane,
  onResetLayout,
  onMoveTabToPane,
  otherPanes = [],
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
  onSplitActiveDown?: (tabId?: string) => void;
  onToggleFloating?: () => void;
  onOpenNewWindow?: (tabId?: string) => void;
  isFloating?: boolean;

  /**
   * RPL-IDE-001.4 — move `sourceTabId` out of `sourcePaneId` into THIS pane at
   * `toIndex`, the slot in this pane's current tab array ("insert before the tab
   * at index i"; omit to append). Same-pane calls are a reorder.
   */
  onMoveTab?: (sourcePaneId: string, sourceTabId: string, toIndex?: number) => void;

  /** Id of the pane owning this strip — the drag payload's destination. */
  paneId?: string;

  /** RPL-IDE-001.6 — Pane scope: close this pane entirely (its tabs go with it). */
  onClosePane?: () => void;

  /** RPL-IDE-001.6 — Window scope: restore the default single-pane layout. */
  onResetLayout?: () => void;

  /** RPL-IDE-001.6 — Tab scope: keyboard equivalent of dragging the tab to another pane. */
  onMoveTabToPane?: (targetPaneId: string) => void;

  /** Panes other than this one, as move destinations. */
  otherPanes?: Array<{ id: string; label: string }>;
  onDragEnd?: () => void;
  onTogglePin?: (tabId?: string) => void;
  recentFiles?: string[];
  onOpenFile?: (filePath: string, preview: boolean) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [toolQuery, setToolQuery] = useState('');

  /**
   * RPL-IDE-001.4 — insertion slot under the pointer during a tab drag, drawn as
   * a caret between two tabs so the drop position is visible before releasing
   * (Replit/Cursor behaviour). `null` = no drag over this strip.
   */
  const [dropSlot, setDropSlot] = useState<number | null>(null);
  const addTabButtonRef = useRef<HTMLButtonElement | null>(null);
  const actionsButtonRef = useRef<HTMLButtonElement | null>(null);
  const actionsMenuRef = useRef<HTMLDivElement | null>(null);
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

  /*
   * RPL-IDE-001.6 — the menu is portalled to <body> and positioned from the
   * trigger's rect. It cannot stay in the normal flow: between the ⋮ button and
   * the document there are NINE `overflow: hidden` ancestors, the innermost of
   * them the 40 px-tall tab bar, so the menu was clipped to a single visible
   * item. (Playwright treats a clipped element as visible — it has a non-empty
   * box — which is why automated checks never caught it; only a screenshot did.)
   */
  const [actionsAnchor, setActionsAnchor] = useState<{ top: number; right: number } | null>(null);

  useLayoutEffect(() => {
    if (!actionsOpen) {
      setActionsAnchor(null);

      return undefined;
    }

    const place = () => {
      const rect = actionsButtonRef.current?.getBoundingClientRect();

      if (rect) {
        setActionsAnchor({ top: rect.bottom + 4, right: Math.max(8, window.innerWidth - rect.right) });
      }
    };

    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);

    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [actionsOpen]);

  const closeOptionsMenu = useCallback((options: { restoreFocus?: boolean } = {}) => {
    setActionsOpen(false);

    if (options.restoreFocus) {
      window.requestAnimationFrame(() => actionsButtonRef.current?.focus());
    }
  }, []);

  /** Run a menu action, then close and hand focus back to the trigger. */
  const runOptionsAction = useCallback(
    (action: () => void) => {
      action();
      closeOptionsMenu({ restoreFocus: true });
    },
    [closeOptionsMenu],
  );

  /*
   * RPL-IDE-001.6 — menu keyboard model. Roving focus over the live
   * `[role="menuitem"]` list rather than a precomputed index, so the wrapping
   * stays correct however many items the current pane/window state renders
   * (Float vs Dock, per-pane Move entries, optional Reset layout).
   */
  const handleOptionsMenuKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const items = Array.from(actionsMenuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);

      if (!items.length) {
        return;
      }

      const currentIndex = items.findIndex((item) => item === document.activeElement);

      const focusAt = (index: number) => {
        event.preventDefault();
        items[(index + items.length) % items.length]?.focus();
      };

      if (event.key === 'ArrowDown') {
        focusAt(currentIndex + 1);
      } else if (event.key === 'ArrowUp') {
        focusAt(currentIndex <= 0 ? items.length - 1 : currentIndex - 1);
      } else if (event.key === 'Home') {
        focusAt(0);
      } else if (event.key === 'End') {
        focusAt(items.length - 1);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeOptionsMenu({ restoreFocus: true });
      } else if (event.key === 'Tab') {
        // Tabbing out of a menu closes it, as in every native menu.
        closeOptionsMenu();
      }
    },
    [closeOptionsMenu],
  );

  /* Focus the first item on open, and close on an outside pointer press. */
  useEffect(() => {
    if (!actionsOpen) {
      return undefined;
    }

    window.requestAnimationFrame(() =>
      actionsMenuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus(),
    );

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;

      if (target && (actionsMenuRef.current?.contains(target) || actionsButtonRef.current?.contains(target))) {
        return;
      }

      closeOptionsMenu();
    };

    /*
     * Escape is handled on the window in the CAPTURE phase, not by the menu's
     * own onKeyDown.
     *
     * Two things defeat the obvious approaches, both established by measuring
     * the live IDE at 1440 rather than by reasoning: the menu is portalled to
     * <body>, i.e. outside React's root container, so its React `onKeyDown`
     * does not reliably receive the event; and the project-wide keybinding
     * handler already owns Escape (`overlay.close`) and consumes it first, so a
     * bubble-phase window listener never ran either — the menu stayed open with
     * exactly one trigger and one menu node in the DOM.
     *
     * Capture runs before both, and closing the topmost menu is the correct
     * precedence for Escape anyway.
     */
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeOptionsMenu({ restoreFocus: true });
      }
    };

    window.addEventListener('keydown', handleEscape, true);
    document.addEventListener('pointerdown', handlePointerDown, true);

    return () => {
      window.removeEventListener('keydown', handleEscape, true);
      document.removeEventListener('pointerdown', handlePointerDown, true);
    };
  }, [actionsOpen, closeOptionsMenu]);

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

  /*
   * RPL-IDE-001.5 — the All-tools list comes from the shared catalog, which is
   * derived from the engine's `PROJECT_EDITOR_TOOLS`. It used to be 217 lines of
   * hand-maintained tuples here that had drifted: `studio` (Agent Studio) and
   * `domains` were rendered as real panels but appeared in no tool list, so they
   * could not be opened from this popup at all.
   */
  const tools: Array<[IdeWorkspacePanel | IdeRightPanel, string, string, string, string, string]> =
    projectEditorToolsByCategory().flatMap(([category, categoryTools]) =>
      categoryTools.map(
        (tool) =>
          [
            tool.id as IdeWorkspacePanel | IdeRightPanel,
            toolDisplayTitle(tool.id, t),
            t(IDE_TOOL_DESCRIPTIONS[tool.id as keyof typeof IDE_TOOL_DESCRIPTIONS]),
            tool.icon,
            tool.accent,
            t(PROJECT_EDITOR_TOOL_CATEGORY_LABEL_KEYS[category] as never),
          ] as [IdeWorkspacePanel | IdeRightPanel, string, string, string, string, string],
      ),
    );

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
        const category = normalizedToolQuery ? t('baseChatAst.common.matches') : tool[5];
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
        aria-label={t('chat.copy.addTabCommandPalette_83a59334')}
      >
        <div className="bolt-project-tool-menu-header">
          <div className="bolt-project-tool-menu-title">
            <span>
              <strong>{t('chat.copy.addTab_f7bb0210')}</strong>
              <small>{t('chat.copy.openAToolProjectFileOr_3d5a9427')}</small>
            </span>
            <kbd>{commandPaletteShortcut}</kbd>
          </div>
          <div className="bolt-project-tool-search">
            <span className="i-ph:magnifying-glass" aria-hidden />
            <input
              autoFocus
              placeholder={t('chat.copy.searchCommandsToolsOrFiles_01d43db7')}
              aria-label={t('chat.copy.searchCommandsToolsOrFiles_b3328825')}
              value={toolQuery}
              onChange={(event) => setToolQuery(event.target.value)}
            />
            <button
              type="button"
              aria-label={t('chat.copy.closeAddTabCommandPalette_d16caca1')}
              title={t('chat.copy.close_bbfa773e')}
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
              <div className="bolt-project-tool-section">{t('chat.copy.recentFiles_2944f38c')}</div>
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
          <div className="bolt-project-tool-section">{t('chat.copy.tools_9d0e510b')}</div>
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
                  {tabs.some((tab) => tab.panel === id) && <em>{t('chat.copy.open_cf9b7706')}</em>}
                  <span className="bolt-project-tool-item-chevron i-ph:caret-right" aria-hidden />
                </button>
              ))}
            </div>
          ))}
          {!filteredTools.length && (
            <PanelEmptyState
              icon="i-ph:sparkle"
              title={t('chat.copy.noFeaturesFound_295ba03b')}
              description={t('chat.copy.tryADifferentSearchTerm_0ba628a3')}
              className="m-2"
            />
          )}
        </div>
        <div className="bolt-project-tool-footer">
          <span>
            {t('baseChatAst.tool.featureAvailable', { count: filteredTools.length })}
            {normalizedToolQuery ? t('chat.copy.matchingValue0_5feb64b4', { value0: toolQuery.trim() }) : ''}
          </span>
          <span>
            <kbd>Esc</kbd>
            {t('chat.copy.close_1ee04a74')}
            <kbd>{commandPaletteShortcut}</kbd>
            {t('chat.copy.fullPalette_49524ad9')}
          </span>
        </div>
      </div>
    </div>
  ) : null;

  /*
   * RPL-IDE-001.4 — `getData` is deliberately blocked during dragover by the
   * HTML drag protocol (only `types` is readable), so the visual affordance is
   * driven by the presence of our tab MIME type and the payload is read on drop.
   */
  /*
   * RPL-IDE-001.6 — the trigger names the tab it acts on. "Tab actions" alone
   * told a screen-reader user nothing about scope when several panes are open.
   */
  const optionsMenuActiveTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0];

  const optionsMenuLabel = optionsMenuActiveTab
    ? t('baseChatAst.options.menuForTab', { label: optionsMenuActiveTab.label })
    : t('chat.copy.tabActions_b7a78b89');

  const isTabDrag = (event: React.DragEvent) => Boolean(onMoveTab) && isProjectEditorTabDrag(event.dataTransfer.types);

  const clearDropSlot = () => setDropSlot(null);

  const dropTabAt = (event: React.DragEvent, toIndex?: number) => {
    const sourcePaneId = event.dataTransfer.getData(TAB_DRAG_PANE_MIME);
    const sourceTabId = event.dataTransfer.getData(TAB_DRAG_TAB_MIME);

    setDropSlot(null);

    if (!sourcePaneId || !sourceTabId || !onMoveTab) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    onMoveTab(sourcePaneId, sourceTabId, toIndex);
  };

  return (
    <>
      <div className="bolt-project-tabbar" data-tools-panel-open={open ? 'true' : undefined}>
        <div
          className="bolt-project-tabs"
          role="tablist"
          data-pane-strip={paneId}
          onKeyDown={moveTabFocus}
          onDragOver={(event) => {
            if (!isTabDrag(event)) {
              return;
            }

            // Bare strip area (after the last tab) — append.
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
            setDropSlot(tabs.length);
          }}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
              clearDropSlot();
            }
          }}
          onDrop={(event) => dropTabAt(event, tabs.length)}
        >
          {tabs.map((tab, index) => (
            <div
              key={tab.id}
              role="tab"
              data-tab-id={tab.id}
              data-testid={`tab-${tab.id}`}
              data-panel={tab.panel}
              data-pinned={tab.pinned ? 'true' : undefined}
              data-dirty={tab.dirty ? 'true' : undefined}
              data-drop-before={dropSlot === index ? 'true' : undefined}
              data-drop-after={dropSlot === index + 1 && index === tabs.length - 1 ? 'true' : undefined}
              aria-label={
                tab.pinned && tab.dirty
                  ? t('baseChatAst.tab.pinnedUnsaved', { label: tab.label })
                  : tab.pinned
                    ? t('baseChatAst.tab.pinned', { label: tab.label })
                    : tab.dirty
                      ? t('baseChatAst.tab.unsaved', { label: tab.label })
                      : tab.label
              }
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
                event.dataTransfer.setData(TAB_DRAG_PANE_MIME, paneId);
                event.dataTransfer.setData(TAB_DRAG_TAB_MIME, tab.id);
              }}
              onDragEnd={(event) => {
                clearDropSlot();
                onDragEnd?.();
                void event;
              }}
              onDragOver={(event) => {
                if (!isTabDrag(event)) {
                  return;
                }

                /*
                 * Pointer past the tab's midpoint means "insert after me". This
                 * is what makes the drop position deterministic instead of
                 * "wherever the browser felt like it".
                 */
                event.preventDefault();
                event.stopPropagation();
                event.dataTransfer.dropEffect = 'move';
                setDropSlot(dropSlotForTab(index, event.clientX, event.currentTarget.getBoundingClientRect()));
              }}
              onDrop={(event) =>
                dropTabAt(event, dropSlotForTab(index, event.clientX, event.currentTarget.getBoundingClientRect()))
              }
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
                  aria-label={t(tab.pinned ? 'baseChatAst.tab.unpin' : 'baseChatAst.tab.pin', {
                    label: tab.label,
                  })}
                  title={t(tab.pinned ? 'baseChatAst.tab.unpin' : 'baseChatAst.tab.pin', { label: tab.label })}
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
                  aria-label={t('chat.copy.saveValue0_b6c78e5c', { value0: tab.label })}
                  title={t('chat.copy.saveValue0_b6c78e5c', { value0: tab.label })}
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
                  aria-label={t('chat.copy.closeValue0_15e23702', { value0: tab.label })}
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
            aria-label={t('chat.copy.addTabWithCommandPalette_49e6c454')}
            title={t('chat.copy.addTabValue0_8ed5ba85', { value0: commandPaletteShortcut })}
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
        {/*
          RPL-IDE-001.6 — Options (⋮) for the active tab. Previously a flat,
          unlabelled list of buttons in a plain <div>: no menu semantics, no
          keyboard navigation, no Escape, no outside-click, and no way to tell
          which scope an action acted on. It is now a real `role="menu"` split
          into the three scopes the Project Editor model has — Window, Pane and
          Tab — with every item wired to a working action.
        */}
        <div className="bolt-project-tool-popover">
          <button
            ref={actionsButtonRef}
            type="button"
            className="bolt-project-tab-action"
            aria-label={optionsMenuLabel}
            title={optionsMenuLabel}
            aria-haspopup="menu"
            aria-expanded={actionsOpen}
            data-testid="tab-options"
            onMouseDown={(event) => event.stopPropagation()}
            onClick={() => {
              closeToolMenu();
              setActionsOpen((value) => !value);
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown' && !actionsOpen) {
                event.preventDefault();
                closeToolMenu();
                setActionsOpen(true);
              }
            }}
          >
            <span className="i-ph:dots-three" aria-hidden />
          </button>
          {actionsOpen &&
            typeof document !== 'undefined' &&
            createPortal(
              <div
                ref={actionsMenuRef}
                className="bolt-project-tab-actions-menu"
                role="menu"
                aria-orientation="vertical"
                aria-label={optionsMenuLabel}
                data-testid="tab-options-menu"
                style={
                  actionsAnchor
                    ? { top: `${actionsAnchor.top}px`, right: `${actionsAnchor.right}px` }
                    : { visibility: 'hidden' }
                }
                onKeyDown={handleOptionsMenuKeyDown}
              >
                <div role="group" aria-label={t('baseChatAst.options.windowGroup')}>
                  <p className="bolt-project-tab-actions-group-label" aria-hidden>
                    {t('baseChatAst.options.windowGroup')}
                  </p>
                  {onOpenNewWindow ? (
                    <button
                      type="button"
                      role="menuitem"
                      data-testid="tab-options-open-new-window"
                      onClick={() => runOptionsAction(() => onOpenNewWindow(activeTabId ?? tabs[0]?.id))}
                    >
                      <span className="i-ph:arrow-square-out" aria-hidden />
                      {t('chat.copy.openInNewWindow_a75732d8')}
                    </button>
                  ) : null}
                  {onResetLayout ? (
                    <button
                      type="button"
                      role="menuitem"
                      data-testid="tab-options-reset-layout"
                      onClick={() => runOptionsAction(() => onResetLayout())}
                    >
                      <span className="i-ph:layout" aria-hidden />
                      {t('baseChatAst.options.resetLayout')}
                    </button>
                  ) : null}
                </div>

                <div role="group" aria-label={t('baseChatAst.options.paneGroup')}>
                  <p className="bolt-project-tab-actions-group-label" aria-hidden>
                    {t('baseChatAst.options.paneGroup')}
                  </p>
                  <button
                    type="button"
                    role="menuitem"
                    data-testid="tab-options-split-right"
                    onClick={() => runOptionsAction(() => onSplitActiveRight?.(activeTabId ?? tabs[0]?.id))}
                  >
                    <span className="i-ph:columns" aria-hidden />
                    {t('chat.copy.splitActiveRight_59014f08')}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    data-testid="tab-options-split-down"
                    onClick={() => runOptionsAction(() => onSplitActiveDown?.(activeTabId ?? tabs[0]?.id))}
                  >
                    <span className="i-ph:rows" aria-hidden />
                    {t('chat.copy.splitActiveDown_7468f839')}
                  </button>
                  {onToggleFloating ? (
                    <button
                      type="button"
                      role="menuitem"
                      data-testid="tab-options-toggle-floating"
                      onClick={() => runOptionsAction(() => onToggleFloating())}
                    >
                      <span className={isFloating ? 'i-ph:push-pin' : 'i-ph:frame-corners'} aria-hidden />
                      {isFloating ? t('chat.copy.dockPane_f6b796f1') : t('chat.copy.floatPane_ca0c0b63')}
                    </button>
                  ) : null}
                  {onClosePane ? (
                    <button
                      type="button"
                      role="menuitem"
                      data-testid="tab-options-close-pane"
                      onClick={() => runOptionsAction(() => onClosePane())}
                    >
                      <span className="i-ph:x-square" aria-hidden />
                      {t('baseChatAst.options.closePane')}
                    </button>
                  ) : null}
                </div>

                <div role="group" aria-label={t('baseChatAst.options.tabGroup')}>
                  <p className="bolt-project-tab-actions-group-label" aria-hidden>
                    {t('baseChatAst.options.tabGroup')}
                  </p>
                  <button
                    type="button"
                    role="menuitem"
                    data-testid="tab-options-pin"
                    onClick={() => runOptionsAction(() => onTogglePin?.(activeTabId ?? tabs[0]?.id))}
                  >
                    <span className="i-ph:push-pin-simple" aria-hidden />
                    {tabs.find((tab) => tab.id === activeTabId)?.pinned
                      ? t('chat.copy.unpinTab_279bad8b')
                      : t('chat.copy.pinTab_3623fa20')}
                  </button>
                  {/*
                  RPL-IDE-001.4 + .6 — the keyboard route to the cross-pane move.
                  Dragging a tab is a pointer-only gesture; without this, moving a
                  tab between panes was unreachable without a mouse.
                */}
                  {onMoveTabToPane && otherPanes.length
                    ? otherPanes.map((pane, index) => (
                        <button
                          key={pane.id}
                          type="button"
                          role="menuitem"
                          data-testid={`tab-options-move-to-pane-${index}`}
                          onClick={() => runOptionsAction(() => onMoveTabToPane(pane.id))}
                        >
                          <span className="i-ph:arrow-line-right" aria-hidden />
                          {t('baseChatAst.options.moveTabToPane', { pane: pane.label })}
                        </button>
                      ))
                    : null}
                  <button
                    type="button"
                    role="menuitem"
                    data-testid="tab-options-close-others"
                    onClick={() => runOptionsAction(() => onCloseOthers?.(activeTabId ?? tabs[0]?.id))}
                  >
                    {t('chat.copy.closeOthers_445ef4ad')}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    data-testid="tab-options-close-to-right"
                    onClick={() => runOptionsAction(() => onCloseToRight?.(activeTabId ?? tabs[0]?.id))}
                  >
                    {t('chat.copy.closeToRight_8b7725b0')}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    data-testid="tab-options-close-saved"
                    onClick={() => runOptionsAction(() => onCloseSaved?.())}
                  >
                    {t('chat.copy.closeSaved_40a993da')}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    data-testid="tab-options-close-all"
                    onClick={() => runOptionsAction(() => onCloseAll?.())}
                  >
                    {t('chat.copy.closeAll_98553cc8')}
                  </button>
                </div>
              </div>,
              document.body,
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
  const { t } = useTranslation();

  // UNIF-05 : icônes des raccourcis d'accueil tirées du registre unique.
  const shortcuts: Array<[string, string, string, IdeWorkspacePanel | IdeRightPanel]> = [
    [panelIcon('files'), t('baseChatAst.tool.openFiles'), formatKeybindingCombo('cmd+p'), 'files'],
    [
      panelIcon('terminal'),
      t('baseChatAst.tool.openTerminal', { terminal: SHELL_TERMINAL_LABEL }),
      formatKeybindingCombo('cmd+`'),
      'terminal',
    ],
    [panelIcon('preview'), t('baseChatAst.tool.viewPreview'), formatKeybindingCombo('cmd+enter'), 'preview'],
    ['i-ph:command', t('baseChatAst.tool.allCommands'), formatKeybindingCombo('cmd+k'), 'settings'],
  ];

  return (
    <div className="bolt-project-welcome">
      <div className="bolt-project-welcome-logo">
        <span className="i-ph:sparkle" aria-hidden />
      </div>
      <h2>{t('chat.copy.welcomeToYourProject_bc14fca5')}</h2>
      <p>{t('chat.copy.openAToolOrAskThe_f1c45f7a')}</p>
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
        <span>{t('chat.copy.recent_76eec760')}</span>
        {files.length ? (
          files.map((file) => (
            <button key={file} type="button" onClick={() => onOpenFile?.(file)}>
              <span className="i-ph:file-code" aria-hidden />
              {file.replace(WORK_DIR, '')}
            </button>
          ))
        ) : (
          <small>{t('chat.copy.noFilesLoadedYet_8eb60de2')}</small>
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
  const { t, i18n } = useTranslation();
  const language = resolvedBaseChatLanguage(i18n);

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
      <section className="bolt-project-snapshots-panel" aria-label={t('chat.copy.projectCheckpoints_f1ddc705')}>
        <div className="bolt-project-snapshots-header">
          <div>
            <h3>{t('chat.copy.checkpoints_a2b3a59a')}</h3>
            <p>{t('chat.copy.restoreAKnownGoodProjectState_ae594c01')}</p>
          </div>
          <form onSubmit={onSubmit} className="bolt-project-snapshots-create">
            <input name="intent" value="create" type="hidden" />
            <PanelInput name="label" placeholder={t('chat.copy.manualCheckpoint_b29f671a')} />
            <PanelButton disabled={busy}>{t('chat.copy.newCheckpoint_3480863c')}</PanelButton>
          </form>
        </div>
        {snapshots.length ? (
          <div className="bolt-project-snapshots-timeline">
            {snapshots.map((snapshot, index) => {
              const previousSnapshot = snapshots[index + 1];
              const files = snapshotFiles(snapshot);
              const diff = snapshotDiffSummary(snapshot, previousSnapshot);
              const modifiedCount = diff.added.length + diff.changed.length + diff.removed.length;
              const fileCountLabel = t('baseChatAst.files.count', { count: files.length });
              const title = snapshot.label || snapshotKindLabel(t, snapshot);

              const exactDate = snapshot.createdAt
                ? (formatBaseChatAstDateTime(language, snapshot.createdAt) ?? t('baseChatAst.status.notAvailable'))
                : t('chat.copy.recorded_d5383ea7');

              return (
                <article key={snapshot.id} className="bolt-project-snapshot-card">
                  <div className="bolt-project-snapshot-rail" aria-hidden>
                    <span />
                  </div>
                  <div className="bolt-project-snapshot-body">
                    <div className="bolt-project-snapshot-main">
                      <div className="bolt-project-snapshot-title-row">
                        <span className="bolt-project-snapshot-kind">{snapshotAuthor(t, snapshot)}</span>
                        <strong title={title}>{title}</strong>
                      </div>
                      <div
                        className="bolt-project-snapshot-meta"
                        aria-label={t('chat.copy.checkpointMetadata_2e369897')}
                      >
                        <span title={exactDate}>{timeAgo(t, language, snapshot.createdAt)}</span>
                        <span>{fileCountLabel}</span>
                        <span>{formatBytes(t, language, snapshot.byteLength)}</span>
                        <span>
                          {modifiedCount
                            ? t('chat.copy.value0Changed_3fbc2486', { value0: modifiedCount })
                            : t('chat.copy.baseline_e6ab7982')}
                        </span>
                      </div>
                      <details className="bolt-project-snapshot-diff">
                        <summary
                          title={
                            diff.sample.length ? diff.sample.join('\n') : t('chat.copy.noFileMetadataRecorded_c8f89f26')
                          }
                        >
                          {t('chat.copy.previewChangedFiles_e59d9680')}
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
                          <p>{t('chat.copy.noFileManifestWasRecordedFor_67abbaf6')}</p>
                        )}
                      </details>
                    </div>
                    <form onSubmit={onSubmit} className="bolt-project-snapshot-actions">
                      <input name="intent" value="restore" type="hidden" />
                      <input name="snapshotId" value={snapshot.id} type="hidden" />
                      <button
                        type="submit"
                        disabled={busy}
                        aria-label={t('chat.copy.restoreCheckpointValue0_4ea16940', { value0: title })}
                      >
                        {t('chat.copy.restore_3cbe6d6b')}
                      </button>
                    </form>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <PanelEmptyState
            icon="i-ph:stack"
            title={t('chat.copy.noCheckpointsYet_0cd8841d')}
            description={t('chat.copy.createACheckpointBeforeMajorEdits_c50a54ac')}
          />
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
        ? t('baseChatAst.status.live')
        : realtime.status === 'reconnecting'
          ? t('baseChatAst.status.reconnecting')
          : realtime.status === 'error'
            ? t('baseChatAst.status.offline')
            : t('baseChatAst.status.connecting');

    return (
      <div className="bolt-project-collaboration-tool">
        <section className="bolt-project-collaboration-card">
          <div className="bolt-project-collaboration-header">
            <div>
              <h3>{t('chat.copy.presence_89a8a335')}</h3>
              <p>
                {t('baseChatAst.counts.presenceOnline', {
                  shown: formatBaseChatAstNumber(language, presence.length),
                  count: presence.length,
                })}
              </p>
            </div>
            <span className="bolt-project-collaboration-live">{realtimeLabel}</span>
          </div>
          {realtime.error ? (
            <div className="bolt-project-empty-panel">{t('baseChatAst.collaboration.realtimeError')}</div>
          ) : null}
          <div className="bolt-project-collaboration-users">
            {presence.length ? (
              presence.map((user: any, index: number) => (
                <div key={user.sessionId} className="bolt-project-collaboration-user">
                  <span className="bolt-project-collaboration-avatar">
                    {initialesPersonne(
                      libellePersonne({
                        displayName: user.displayName,
                        name: user.name,
                        userId: user.userId,
                        repli: t('baseChatAst.collaboration.participant', { index: index + 1 }),
                      }),
                    )}
                  </span>
                  <div>
                    <strong>
                      {libellePersonne({
                        displayName: user.displayName,
                        name: user.name,
                        userId: user.userId,
                        repli: t('baseChatAst.collaboration.participant', { index: index + 1 }),
                      })}
                    </strong>
                    <small>
                      {presenceStateLabel(t, user.mode, 'editing')}{' '}
                      {user.filePath ? t('chat.copy.inValue0_79271ca2', { value0: user.filePath }) : ''}
                    </small>
                  </div>
                  <em>{presenceStateLabel(t, user.status, 'online')}</em>
                </div>
              ))
            ) : (
              <PanelEmptyState icon="i-ph:users" title={t('chat.copy.noActivePresenceYet_5bb4c6e2')} />
            )}
          </div>
        </section>

        <section className="bolt-project-collaboration-card">
          <div className="bolt-project-collaboration-header">
            <div>
              <h3>{t('chat.copy.roleBasedCollaborators_cd5ada44')}</h3>
              <p>{t('chat.copy.projectAccessIsEnforcedByThe_280521ba')}</p>
            </div>
          </div>
          <div className="bolt-project-collaboration-list">
            {collaborators.length ? (
              collaborators.map((collaborator: any, index: number) => (
                <div key={collaborator.id} className="bolt-project-collaboration-row">
                  <span>
                    {libellePersonne({
                      displayName: collaborator.displayName,
                      name: collaborator.name,
                      userId: collaborator.userId,
                      repli: t('baseChatAst.collaboration.participant', { index: index + 1 }),
                    })}
                  </span>
                  <strong>{collaborationRoleLabel(t, collaborator.roleKey)}</strong>
                  <form method="post" onSubmit={onSubmit}>
                    <input type="hidden" name="intent" value="terminal-permission" />
                    <input type="hidden" name="userId" value={collaborator.userId} />
                    <input
                      type="hidden"
                      name="allowed"
                      value={terminalPermissions[collaborator.userId]?.allowed ? 'false' : 'true'}
                    />
                    <PanelButton disabled={busy} variant="outline">
                      {terminalPermissions[collaborator.userId]?.allowed
                        ? t('chat.copy.revokeTerminal_be5ec95d')
                        : t('chat.copy.allowTerminal_7d1efbc3')}
                    </PanelButton>
                  </form>
                </div>
              ))
            ) : (
              <PanelEmptyState icon="i-ph:users" title={t('chat.copy.noProjectCollaborators_3bcac170')} />
            )}
          </div>
          <form onSubmit={onSubmit} className="bolt-project-collaboration-form">
            <label className="bolt-project-collaboration-field">
              <span>{t('chat.copy.collaborator_794b34c1')}</span>
              <PanelInput
                name="userId"
                placeholder={t('chat.copy.emailOrUsername_5af65060')}
                autoComplete="username email"
                required
                pattern="(^[^@\s]+@[^@\s]+\.[^@\s]+$)|(^[a-zA-Z0-9][a-zA-Z0-9._-]{1,62}$)"
                title={t('chat.copy.enterAValidEmailAddressOr_b9c2422c')}
                aria-describedby="collaborator-identity-help"
              />
              <small id="collaborator-identity-help">{t('chat.copy.inviteByEmailOrUsernameThe_83671d35')}</small>
            </label>
            <label className="bolt-project-collaboration-field">
              <span>{t('chat.copy.role_c3f104d1')}</span>
              <select
                name="roleKey"
                defaultValue="member"
                title={t('chat.copy.viewerCanInspectTheProjectMember_a3f28012')}
                aria-describedby="collaborator-role-help"
              >
                {['viewer', 'member', 'admin', 'owner'].map((role) => (
                  <option key={role} value={role}>
                    {collaborationRoleLabel(t, role)}
                  </option>
                ))}
              </select>
              <small id="collaborator-role-help">{t('chat.copy.viewerReadOnlyAccessMemberEdit_85ee87ee')}</small>
            </label>
            <div className="bolt-project-collaboration-role-guide" aria-label={t('chat.copy.rolePermissions_4b9cd8f7')}>
              {(['viewer', 'member', 'admin'] as const).map((role) =>
                (() => {
                  const description = collaborationRoleDescription(t, role);

                  return (
                    <span key={role} title={description}>
                      <strong>{collaborationRoleLabel(t, role)}</strong>
                      {description}
                    </span>
                  );
                })(),
              )}
            </div>
            <div>
              <PanelButton disabled={busy}>{t('chat.copy.inviteToProject_d1cc986a')}</PanelButton>
            </div>
          </form>
        </section>

        <section className="bolt-project-collaboration-card">
          <div className="bolt-project-collaboration-header">
            <div>
              <h3>{t('chat.copy.comments_fce06e20')}</h3>
              <p>{t('chat.copy.membersCanLeaveFileCommentsWithout_9485a8e7')}</p>
            </div>
          </div>
          <div className="bolt-project-collaboration-list">
            {comments.length ? (
              comments.slice(-6).map((comment: any) => (
                <div key={comment.id} className="bolt-project-collaboration-comment">
                  <strong>
                    {comment.filePath ?? t('chat.copy.project_f6f4da8d')} {comment.line ? `:${comment.line}` : ''}
                  </strong>
                  <p>{comment.body}</p>
                  <small>
                    {libellePersonne({
                      displayName: comment.displayName,
                      name: comment.name,
                      userId: comment.userId,
                      repli: t('baseChatAst.collaboration.participantUnknown'),
                    })}
                  </small>
                </div>
              ))
            ) : (
              <PanelEmptyState icon="i-ph:chat-circle" title={t('chat.copy.noCommentsYet_207b24fc')} />
            )}
          </div>
          <form onSubmit={onSubmit} className="bolt-project-collaboration-form">
            <input type="hidden" name="intent" value="comment" />
            <PanelInput name="filePath" placeholder={t('chat.copy.srcAppTsx_835da56f')} />
            <PanelInput name="line" placeholder={t('chat.copy.line_ea967600')} />
            <PanelInput name="body" placeholder={t('chat.copy.comment_153d7a58')} required />
            <PanelButton disabled={busy}>{t('chat.copy.addComment_7d3764e4')}</PanelButton>
          </form>
        </section>

        <section className="bolt-project-collaboration-card">
          <div className="bolt-project-collaboration-header">
            <div>
              <h3>{t('chat.copy.sharingAndPairProgramming_19b5e603')}</h3>
              <p>{t('chat.copy.expiringLinksSharedAiConversationPolicy_fc638296')}</p>
            </div>
          </div>
          <div className="bolt-project-collaboration-grid">
            <form onSubmit={onSubmit} className="bolt-project-collaboration-form">
              <input type="hidden" name="intent" value="share-link" />
              <select name="roleKey" defaultValue="viewer">
                <option value="viewer">{t('chat.copy.readOnlyLink_532e235f')}</option>
                <option value="member">{t('chat.copy.pairProgrammingLink_be0c8ac8')}</option>
              </select>
              <PanelInput
                name="expiresInMinutes"
                placeholder={t('chat.copy.expiresInMinutes_13812bb6')}
                defaultValue="1440"
              />
              <PanelButton disabled={busy}>{t('chat.copy.createExpiringLink_7830b037')}</PanelButton>
            </form>
            <form onSubmit={onSubmit} className="bolt-project-collaboration-form">
              <input type="hidden" name="intent" value="ai-sharing" />
              <input type="hidden" name="shared" value={aiConversation.shared ? 'false' : 'true'} />
              <select name="mode" defaultValue={aiConversation.mode ?? 'comment'}>
                <option value="read-only">{t('chat.copy.aiReadOnly_09b34a79')}</option>
                <option value="comment">{t('chat.copy.aiComments_a8a02d41')}</option>
                <option value="pair-programming">{t('chat.copy.aiPairProgramming_4e0c4554')}</option>
              </select>
              <PanelButton disabled={busy} variant="outline">
                {aiConversation.shared
                  ? t('chat.copy.disableSharedAi_d3aeb47b')
                  : t('chat.copy.enableSharedAi_f00bcdcb')}
              </PanelButton>
            </form>
          </div>
          <PanelRows
            rows={shareLinks.map((link: any) => [
              collaborationRoleLabel(t, link.roleKey),
              t('baseChatAst.collaboration.expires', {
                date: formatBaseChatAstDateTime(language, link.expiresAt) ?? t('baseChatAst.status.notAvailable'),
              }),
            ])}
            empty={t('baseChatAst.collaboration.noShareLinks')}
          />
        </section>

        <section className="bolt-project-collaboration-card">
          <div className="bolt-project-collaboration-header">
            <div>
              <h3>{t('chat.copy.activityFeed_35ed39ad')}</h3>
              <p>{t('chat.copy.collaborationActionsCreateAuditAndProject_694bab3d')}</p>
            </div>
          </div>
          <PanelRows
            rows={activity.slice(-8).map((event: any) => [
              formatProjectActivityAction(t, event.action),
              event.actorUserId
                ? t('baseChatAst.collaboration.by', {
                    user: libellePersonne({
                      userId: event.actorUserId,
                      repli: t('baseChatAst.collaboration.participantUnknown'),
                    }),
                  })
                : t('baseChatAst.collaboration.system'),
            ])}
            empty={t('baseChatAst.collaboration.noActivity')}
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

  return <PanelRows rows={[]} empty={t('baseChatAst.panel.unavailable')} />;
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
  const { t } = useTranslation();

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
          console.warn('Domain update request failed', { status: response.status, serverError: payload.error });
          toast.error(t('baseChatAst.domain.updateFailedHttp', { status: response.status }));
        }

        await loadDomains();
      } catch (error) {
        console.error('Domain update request failed', error);
        toast.error(t('baseChatAst.domain.updateFailed'));
      } finally {
        setSelfBusy(false);
      }
    },
    [projectId, loadDomains, t],
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
          <span className="bolt-project-domains-kicker">{t('chat.copy.domains_a0d641b3')}</span>
          <h3 id="domains-title">{t('chat.copy.productionRoutingDnsVerificationAndManaged_f5631fc2')}</h3>
          <p>{t('chat.copy.addAHostnamePublishTheDns_c1a019dd')}</p>
        </div>
        <div className="bolt-project-domain-target-card">
          <span>{t('chat.copy.deploymentTarget_aa5c28e3')}</span>
          <strong>{deploymentHost ?? t('chat.copy.createAReadyDeploymentFirst_95b9e4fe')}</strong>
          <small>
            {hasRoutingTarget
              ? t('chat.copy.useThisHostAsTheCname_3faff382')
              : t('chat.copy.theCnameAInstructionsUnlockAfter_4c5056ef')}
          </small>
        </div>
      </section>

      <div className="bolt-project-domains-layout">
        <section className="bolt-project-domain-add-card" aria-labelledby="add-domain-title">
          <div>
            <h4 id="add-domain-title">{t('chat.copy.addDomain_76d74001')}</h4>
            <p>{t('chat.copy.useAFullyQualifiedDomainWildcards_7dda886c')}</p>
          </div>
          <form onSubmit={onSubmit} className="bolt-project-domain-add-form">
            <label>
              {t('chat.copy.domain_9b10914d')}
              <PanelInput
                name="domain"
                inputMode="url"
                autoComplete="off"
                placeholder={codeExample('app.example.com')}
                pattern="^(?:[A-Za-z0-9](?:(?:[A-Za-z0-9]|-){0,61}[A-Za-z0-9])?[.])+[A-Za-z]{2,}$"
                title={t('chat.copy.enterAValidDomainSuchAs_763570b5')}
                aria-describedby="domain-help"
                required
              />
            </label>
            <small id="domain-help">{t('chat.copy.noProtocolPathOrPortExample_d3c7f2f8')}</small>
            <PanelButton disabled={busy}>{t('chat.copy.addDomain_76d74001')}</PanelButton>
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
          <PanelEmptyState
            icon="i-ph:globe"
            title={t('chat.copy.noCustomDomainsYet_d9c8b21d')}
            description={t('chat.copy.addADomainToGenerateOrganization_14f8de9b')}
          />
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
  const { t, i18n } = useTranslation();
  const language = resolvedBaseChatLanguage(i18n);
  const txtName = `_vibecore.${domain.domain}`;
  const txtValue = `vibecore-domain-verification=${domain.verificationToken}`;
  const rootName = domain.domain.split('.').length === 2 ? '@' : domain.domain.split('.')[0];

  const records = [
    { type: 'TXT', name: txtName, value: txtValue, state: t('baseChatAst.status.required') },
    {
      type: 'CNAME',
      name: rootName === '@' ? 'www' : rootName,
      value: deploymentHost ?? t('baseChatAst.domain.waitingDeployment'),
      state: deploymentHost ? t('baseChatAst.status.routing') : t('baseChatAst.status.blocked'),
    },
    {
      type: 'A / ALIAS',
      name: '@',
      value: deploymentHost
        ? t('baseChatAst.domain.aliasTarget', { host: deploymentHost })
        : t('baseChatAst.domain.waitingDeployment'),
      state: deploymentHost ? t('baseChatAst.status.apex') : t('baseChatAst.status.blocked'),
    },
  ];

  if (domain.wildcardEnabled) {
    records.push({
      type: 'CNAME',
      name: `*.${domain.domain}`,
      value: deploymentHost ?? t('baseChatAst.domain.waitingDeployment'),
      state: deploymentHost ? t('baseChatAst.status.wildcard') : t('baseChatAst.status.blocked'),
    });
  }

  return (
    <article className="bolt-project-domain-card">
      <div className="bolt-project-domain-card-header">
        <div>
          <h4>{domain.domain}</h4>
          <p>
            {t('chat.copy.created_accf40c8')}
            {formatDomainDate(t, language, domain.createdAt)}
          </p>
        </div>
        <span className={classNames('bolt-project-domain-status', domain.verifiedAt ? 'verified' : 'pending')}>
          {domain.verifiedAt ? t('chat.copy.dnsVerified_ef1eec49') : t('chat.copy.pendingDns_c85e4427')}
        </span>
      </div>

      <div className="bolt-project-domain-status-grid">
        <div>
          <span>{t('chat.copy.verification_03128bed')}</span>
          <strong>
            {domain.verifiedAt
              ? formatDomainDate(t, language, domain.verifiedAt)
              : t('chat.copy.txtRecordRequired_ca016701')}
          </strong>
        </div>
        <div>
          <span>{t('chat.copy.autoTls_b277ddf3')}</span>
          <strong>
            {domain.sslStatus === 'dns_verified'
              ? t('chat.copy.readyForCertificateProvisioning_e45d337a')
              : t('chat.copy.waitingForDns_882e37ec')}
          </strong>
        </div>
        <div>
          <span>{t('chat.copy.wwwRedirect_e9d211d2')}</span>
          <strong>{domain.redirectWww ? t('chat.copy.enabled_df174a3f') : t('chat.copy.disabled_f4f4473d')}</strong>
        </div>
        <div>
          <span>{t('chat.copy.wildcard_91987ff6')}</span>
          <strong>{domain.wildcardEnabled ? t('chat.copy.enabled_df174a3f') : t('chat.copy.off_e3de5ab0')}</strong>
        </div>
      </div>

      <div
        className="bolt-project-dns-records"
        aria-label={t('chat.copy.dnsRecordsForValue0_ed418d75', { value0: domain.domain })}
      >
        <div className="bolt-project-dns-records-head">
          <span>{t('chat.copy.type_3deb7456')}</span>
          <span>{t('chat.copy.name_709a2322')}</span>
          <span>{t('chat.copy.value_8dce170d')}</span>
          <span>{t('chat.copy.status_bae7d5be')}</span>
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
            {domain.verifiedAt ? t('chat.copy.recheckDns_76c0201d') : t('chat.copy.verifyDns_4d255ccc')}
          </PanelButton>
        </form>

        <form onSubmit={onSubmit} className="bolt-project-domain-options">
          <input name="intent" value="configure" type="hidden" />
          <input name="domain" value={domain.domain} type="hidden" />
          <input name="redirectWww" value="false" type="hidden" />
          <label>
            <input name="redirectWww" value="true" type="checkbox" defaultChecked={domain.redirectWww} />
            {t('chat.copy.redirectWww_0450d04e')}
          </label>
          <input name="wildcardEnabled" value="false" type="hidden" />
          <label>
            <input name="wildcardEnabled" value="true" type="checkbox" defaultChecked={domain.wildcardEnabled} />
            {t('chat.copy.wildcardSubdomains_56b5dec7')}
          </label>
          <PanelButton disabled={busy} variant="outline">
            {t('chat.copy.saveRouting_bedccc70')}
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

function formatDomainDate(t: TFunction, language: string, value?: string) {
  if (!value) {
    return t('baseChatAst.status.notAvailable');
  }

  return (
    formatBaseChatAstDateTime(language, value, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }) ?? t('baseChatAst.status.notAvailable')
  );
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
  const { t, i18n } = useTranslation();
  const language = resolvedBaseChatLanguage(i18n);
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
    <section className="bolt-project-activity-panel" aria-label={t('chat.copy.projectActivityAuditTrail_57e9c542')}>
      <header className="bolt-project-activity-hero">
        <div>
          <span className="bolt-project-activity-eyebrow">{t('chat.copy.auditTrail_33de865a')}</span>
          <h3>{t('chat.copy.projectActivity_d2b7b50c')}</h3>
          <p>{t('chat.copy.backendActivityCollaborationChangesAndOperational_ad32cb87')}</p>
        </div>
        {/* UNIF lot 4 — bouton nu stylé SCSS remplacé par le PanelButton partagé. */}
        <PanelButton
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0 gap-1.5"
          onClick={() => void reload?.()}
          disabled={busy}
        >
          <span className="i-ph:arrows-clockwise" aria-hidden />
          {busy ? t('chat.copy.refreshing_505dddc9') : t('chat.copy.refreshNow_29664b3f')}
        </PanelButton>
      </header>

      <div className="bolt-project-activity-metrics" aria-label={t('chat.copy.activitySummary_70f4ec76')}>
        <article>
          <span>{t('chat.copy.totalEvents_65939a4f')}</span>
          <strong>{events.length}</strong>
          <small>
            {lastLoadedAt
              ? t('chat.copy.updatedValue0_18c0fe1c', {
                  value0: formatBaseChatAstTime(language, lastLoadedAt) ?? t('baseChatAst.status.notAvailable'),
                })
              : t('chat.copy.liveRefreshEvery15s_9d420b0c')}
          </small>
        </article>
        <article>
          <span>{t('chat.copy.important_4b6d6a30')}</span>
          <strong>{importantCount}</strong>
          <small>{t('chat.copy.exportsDeploysCollaboratorsGitAndRuntime_21970b4b')}</small>
        </article>
        <article data-tone={ideSaveCount > 10 ? 'warning' : 'neutral'}>
          <span>{t('chat.copy.ideStateSaves_125ba3a6')}</span>
          <strong>{ideSaveCount}</strong>
          <small>
            {ideSaveCount > 10
              ? t('chat.copy.legacyNoiseDetectedInCurrentWindow_32e344cc')
              : t('chat.copy.noiseControlled_6c7d7929')}
          </small>
        </article>
      </div>

      <div className="bolt-project-activity-filters">
        <label>
          <span>{t('chat.copy.search_bce06414')}</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('chat.copy.findActionUserOrPayload_93fbd8a2')}
            aria-label={t('chat.copy.searchProjectActivity_5066f3e5')}
          />
        </label>
        <label>
          <span>{t('chat.copy.type_3deb7456')}</span>
          <select value={actionFilter} onChange={(event) => setActionFilter(event.target.value)}>
            <option value="all">{t('chat.copy.allEventTypes_85756507')}</option>
            {filterOptions.actions.map((action: string) => (
              <option key={action} value={action}>
                {formatProjectActivityAction(t, action)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{t('chat.copy.user_9f8a2389')}</span>
          <select value={actorFilter} onChange={(event) => setActorFilter(event.target.value)}>
            <option value="all">{t('chat.copy.allUsers_ce832d9b')}</option>
            {filterOptions.actors.map((actor: string) => (
              <option key={actor} value={actor}>
                {actor}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{t('chat.copy.period_170a28a9')}</span>
          <select value={periodFilter} onChange={(event) => setPeriodFilter(event.target.value as any)}>
            <option value="all">{t('chat.copy.allTime_dbad49d8')}</option>
            <option value="15m">{t('chat.copy.last15Minutes_7cb95edc')}</option>
            <option value="1h">{t('chat.copy.lastHour_1e84a813')}</option>
            <option value="24h">{t('chat.copy.last24Hours_99d63362')}</option>
          </select>
        </label>
      </div>

      {quickChips.topActions.length || quickChips.topActors.length ? (
        <div className="bolt-project-activity-chips" aria-label={t('chat.copy.quickFilters_6bab4fad')}>
          {quickChips.topActions.map(([action, count]) => (
            <FilterChip
              key={`type-${action}`}
              icon="i-ph:tag"
              label={formatProjectActivityAction(t, action)}
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
              label={t('chat.copy.clearFilters_41222671')}
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
                    <strong>{formatProjectActivityAction(t, event.action)}</strong>
                    <small>
                      {event.createdAt
                        ? (formatBaseChatAstDateTime(language, event.createdAt) ?? t('baseChatAst.status.notAvailable'))
                        : t('chat.copy.recordedByBackend_4908e1dc')}
                      {event.actorUserId ? ` · ${event.actorUserId}` : t('chat.copy.system_1435f3bd')}
                    </small>
                  </span>
                  <em>{t(`baseChatAst.activity.severity.${severity}`)}</em>
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
                    {t(deepLink.label)}
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
          <PanelEmptyState
            icon="i-ph:list-magnifying-glass"
            title={t('chat.copy.noActivityMatchesTheCurrentFilters_b352e1bf')}
          />
        )}
      </div>
    </section>
  );
}

function formatProjectActivityAction(t: TFunction, action: string) {
  const labels: Record<string, string> = {
    activity: t('baseChatAst.common.activity'),
    collaborator: t('baseChatAst.common.collaborators'),
    collaborators: t('baseChatAst.common.collaborators'),
    comment: t('baseChatAst.activity.segment.comment'),
    create: t('baseChatAst.activity.segment.create'),
    delete: t('baseChatAst.activity.segment.delete'),
    deploy: t('baseChatAst.activity.segment.deploy'),
    deployment: t('baseChatAst.common.deployments'),
    git: t('baseChatAst.common.git'),
    ide_state: t('baseChatAst.activity.segment.ideState'),
    restore: t('baseChatAst.activity.segment.restore'),
    save: t('baseChatAst.activity.segment.save'),
    secret: t('baseChatAst.common.secrets'),
    settings: t('baseChatAst.common.settings'),
    share: t('baseChatAst.activity.segment.share'),
    snapshot: t('baseChatAst.common.snapshots'),
    update: t('baseChatAst.activity.segment.update'),
    workspace: t('baseChatAst.common.workspace'),
  };

  return String(action ?? 'project.activity')
    .replace(/^project\./, '')
    .split('.')
    .map((segment) => labels[segment] ?? segment.replace(/_/g, ' '))
    .join(' / ');
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
    return { href: candidate, label: chatKey('chat.copy.open_cf9b7706') };
  }

  if (typeof metadata.path === 'string' && metadata.path.startsWith('/')) {
    return { href: metadata.path, label: chatKey('chat.copy.view_69bd4ef9') };
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
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language ?? 'en';

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
  const settingsNoticeRef = useRef(t('baseChatAst.settings.saved'));
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
      group: t('baseChatAst.settings.group.workspace'),
      description: t('chat.copy.sharedProjectConfigurationAndGovernance_920219db'),
      items: [
        [
          codeExample('project'),
          t('baseChatAst.settings.project.label'),
          t('baseChatAst.settings.project.description'),
        ],
        [
          codeExample('security'),
          t('baseChatAst.settings.security.label'),
          t('baseChatAst.settings.security.description'),
        ],
        [codeExample('ai'), t('baseChatAst.settings.ai.label'), t('baseChatAst.settings.ai.description')],
      ],
    },
    {
      group: t('baseChatAst.settings.group.account'),
      description: t('chat.copy.planUsageAndBillingForThis_c9dca5c9'),
      items: [
        [codeExample('usage'), t('baseChatAst.settings.usage.label'), t('baseChatAst.settings.usage.description')],
      ],
    },
    {
      group: t('baseChatAst.settings.group.user'),
      description: t('chat.copy.yourProfileAgentMemoryAndIde_12d0409c'),
      items: [
        [
          codeExample('account'),
          t('baseChatAst.settings.account.label'),
          t('baseChatAst.settings.account.description'),
        ],
        [codeExample('memory'), t('baseChatAst.settings.memory.label'), t('baseChatAst.settings.memory.description')],
        [
          codeExample('preferences'),
          t('baseChatAst.settings.preferences.label'),
          t('baseChatAst.settings.preferences.description'),
        ],
      ],
    },
  ];

  const activeSettingsItem = settingsSections.flatMap((section) => section.items).find(([id]) => id === settingsTab);

  const providers: Array<{ id: string; label: string; secretKey: string; models: string[] }> = [
    {
      id: 'openai',
      label: t('chat.copy.openai_a19ee5a9'),
      secretKey: 'OPENAI_API_KEY',
      models: ['gpt-5.4', 'gpt-5.4-mini', 'gpt-5.3-codex'],
    },
    {
      id: 'anthropic',
      label: t('chat.copy.anthropic_b780a23b'),
      secretKey: 'ANTHROPIC_API_KEY',
      models: ['claude-sonnet-4.5', 'claude-opus-4.1'],
    },
    {
      id: 'google',
      label: t('chat.copy.google_2b681c0a'),
      secretKey: 'GOOGLE_API_KEY',
      models: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-3.5-flash'],
    },
    {
      id: 'openrouter',
      label: t('chat.copy.openrouter_12ecf701'),
      secretKey: 'OPENROUTER_API_KEY',
      models: ['openrouter:auto', 'anthropic/claude-sonnet-4.5'],
    },
  ];
  const notificationRows = [
    [
      'agent',
      t('baseChatAst.settings.notification.agent.label'),
      t('baseChatAst.settings.notification.agent.description'),
    ],
    [
      'billing',
      t('baseChatAst.settings.notification.billing.label'),
      t('baseChatAst.settings.notification.billing.description'),
    ],
    [
      'deployment',
      t('baseChatAst.settings.notification.deployment.label'),
      t('baseChatAst.settings.notification.deployment.description'),
    ],
    [
      'security',
      t('baseChatAst.settings.notification.security.label'),
      t('baseChatAst.settings.notification.security.description'),
    ],
    [
      'team',
      t('baseChatAst.settings.notification.team.label'),
      t('baseChatAst.settings.notification.team.description'),
    ],
    [
      'system',
      t('baseChatAst.settings.notification.system.label'),
      t('baseChatAst.settings.notification.system.description'),
    ],
  ];

  const localizedProjectKeybindings = localizeProjectKeybindings(PROJECT_KEYBINDINGS, language);

  const keyboardSections = PROJECT_KEYBINDING_CATEGORIES.map((category) => ({
    category,
    label: getKeybindingCategoryLabel(language, category),
    bindings: applyKeybindingOverrides(localizedProjectKeybindings, keybindingOverrides).filter(
      (binding) => binding.category === category,
    ),
  })).filter((section) => section.bindings.length > 0);

  const keyboardConflicts = detectKeybindingConflicts(
    applyKeybindingOverrides(localizedProjectKeybindings, keybindingOverrides),
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
      setSettingsNotice(t('baseChatAst.settings.saving'));
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

      setSettingsNotice(detail.ok ? settingsNoticeRef.current : t('baseChatAst.settings.actionFailed'));
    }

    window.addEventListener('vibecore:ide-panel-action', handlePanelAction);

    return () => window.removeEventListener('vibecore:ide-panel-action', handlePanelAction);
  }, [t]);

  function formatSessionDevice(session: any) {
    const agent = String(session.userAgent ?? '').toLowerCase();

    if (agent.includes('mobile')) {
      return t('baseChatAst.session.mobile');
    }

    if (agent.includes('chrome')) {
      return t('baseChatAst.session.chrome');
    }

    if (agent.includes('firefox')) {
      return t('baseChatAst.session.firefox');
    }

    if (agent.includes('safari')) {
      return t('baseChatAst.session.safari');
    }

    if (agent.includes('node')) {
      return t('baseChatAst.session.cli');
    }

    return session.userAgent ? t('baseChatAst.session.browser') : t('baseChatAst.session.authenticated');
  }

  function formatSessionDetail(session: any) {
    const parts = [
      session.ipAddress ?? session.ip,
      session.createdAt
        ? t('baseChatAst.session.created', {
            date: formatBaseChatAstDateTime(language, session.createdAt) ?? t('baseChatAst.status.notAvailable'),
          })
        : undefined,
      session.expiresAt
        ? t('baseChatAst.session.expires', {
            date: formatBaseChatAstDateTime(language, session.expiresAt) ?? t('baseChatAst.status.notAvailable'),
          })
        : undefined,
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
        console.warn('Agent memory request failed', { status: response.status, serverError: payload.error });
        setMemoryError(t('baseChatAst.memory.loadFailedHttp', { status: response.status }));

        return;
      }

      if (!preferenceResponse.ok) {
        console.warn('Agent memory preference request failed', {
          status: preferenceResponse.status,
          serverError: preferencePayload.error,
        });
        setMemoryError(
          t('baseChatAst.memory.preferenceLoadFailedHttp', {
            status: preferenceResponse.status,
          }),
        );

        return;
      }

      setMemories(payload.memories ?? []);
      setMemoryEnabled(preferencePayload.preference?.enabled !== false);
    } catch (error) {
      console.error('Agent memory request failed', error);
      setMemoryError(t('baseChatAst.memory.loadFailed'));
    } finally {
      setMemoryLoading(false);
    }
  }, [settings.id, t]);

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
        console.warn('Agent memory save request failed', { status: response.status, serverError: payload.error });
        setMemoryError(t('baseChatAst.memory.saveFailedHttp', { status: response.status }));
        setSettingsNotice(t('baseChatAst.memory.actionFailed'));

        return;
      }

      /*
       * The API returns 202 (ok) with a {skipped} reason (quota_exceeded /
       * too_short) when the write was NOT persisted — don't claim "saved".
       */
      if (response.status === 202 || payload.skipped) {
        console.warn('Agent memory save was skipped', { reason: payload.skipped });
        setMemoryError(t('baseChatAst.memory.notSaved'));
        setSettingsNotice(t('baseChatAst.memory.notSaved'));

        return;
      }

      setMemoryDraft('');
      setMemoryTags('');
      setSettingsNotice(t('baseChatAst.memory.saved'));
      await loadMemories();
    } catch (error) {
      console.error('Agent memory save request failed', error);
      setMemoryError(t('baseChatAst.memory.actionFailed'));
      setSettingsNotice(t('baseChatAst.memory.actionFailed'));
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
        console.warn('Agent memory delete request failed', { status: response.status, serverError: payload.error });
        setMemoryError(t('baseChatAst.memory.deleteFailedHttp', { status: response.status }));
        setSettingsNotice(t('baseChatAst.memory.actionFailed'));

        return;
      }

      setSettingsNotice(t('baseChatAst.memory.deleted'));
      await loadMemories();
    } catch (error) {
      console.error('Agent memory delete request failed', error);
      setMemoryError(t('baseChatAst.memory.actionFailed'));
      setSettingsNotice(t('baseChatAst.memory.actionFailed'));
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
        console.warn('Agent memory preference update failed', {
          status: response.status,
          serverError: payload.error,
        });
        setMemoryError(t('baseChatAst.memory.preferenceUpdateFailedHttp', { status: response.status }));
        setSettingsNotice(t('baseChatAst.memory.actionFailed'));

        return;
      }

      setMemoryEnabled(payload.preference?.enabled !== false);
      setSettingsNotice(t(enabled ? 'baseChatAst.memory.enabled' : 'baseChatAst.memory.disabled'));
    } catch (error) {
      console.error('Agent memory preference update failed', error);
      setMemoryError(t('baseChatAst.memory.actionFailed'));
      setSettingsNotice(t('baseChatAst.memory.actionFailed'));
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
        console.warn('Agent memory update request failed', { status: response.status, serverError: payload.error });
        setMemoryError(t('baseChatAst.memory.updateFailedHttp', { status: response.status }));
        setSettingsNotice(t('baseChatAst.memory.actionFailed'));

        return;
      }

      setMemoryEditId(undefined);
      setMemoryEditDraft('');
      setMemoryEditTags('');
      setSettingsNotice(t('baseChatAst.memory.updated'));
      await loadMemories();
    } catch (error) {
      console.error('Agent memory update request failed', error);
      setMemoryError(t('baseChatAst.memory.actionFailed'));
      setSettingsNotice(t('baseChatAst.memory.actionFailed'));
    } finally {
      setMemoryLoading(false);
    }
  }

  return (
    <div className="bolt-project-settings-hub" data-testid="settings-hub-panel">
      <header>
        <div>
          <h3>{t('chat.copy.accountSettings_e3270761')}</h3>
          <p>{t('chat.copy.projectIdentitySecurityBillingAiCredentials_63be3c90')}</p>
        </div>
        {settingsNotice ? (
          <span className="bolt-project-settings-status" role="status" aria-live="polite">
            {settingsNotice}
          </span>
        ) : null}
        <a href={`/api/projects/${settings.id}/project-action?intent=export`} target="_blank" rel="noreferrer">
          {t('chat.copy.exportProject_5eff3aab')}
        </a>
      </header>

      <div className="bolt-project-settings-layout">
        <nav aria-label={t('chat.copy.settingsSections_2e7109bd')} className="bolt-project-settings-sidebar">
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
              onSubmit={submitWithNotice(t('baseChatAst.settings.notice.projectSaved'))}
              className="bolt-project-settings-card"
            >
              <div className="bolt-project-settings-card-title">
                <h4>{t('chat.copy.projectMetadata_fca99c55')}</h4>
                <small>{t('chat.copy.theseFieldsUpdateProjectsIdSettings_cd1c0bbf')}</small>
              </div>
              <label>
                {t('chat.copy.projectName_ab9773fc')}
                <PanelInput
                  name="name"
                  value={draft.name}
                  onChange={updateDraft('name')}
                  required
                  aria-label={t('chat.copy.projectName_ab9773fc')}
                />
              </label>
              <label>
                {t('chat.copy.description_55f8ebc8')}
                <PanelInput
                  name="description"
                  value={draft.description}
                  onChange={updateDraft('description')}
                  aria-label={t('chat.copy.projectDescription_f9e31cfd')}
                />
              </label>
              <label>
                {t('chat.copy.gitRepositoryUrl_fa85202a')}
                <PanelInput
                  name="gitRepositoryUrl"
                  type="url"
                  value={draft.gitRepositoryUrl}
                  onChange={updateDraft('gitRepositoryUrl')}
                  placeholder={t('chat.copy.httpsGithubComOrgRepo_c3460b93')}
                  aria-label={t('chat.copy.gitRepositoryUrl_fa85202a')}
                />
              </label>
              <label>
                {t('chat.copy.defaultBranch_80f8aa6a')}
                <PanelInput
                  name="gitDefaultBranch"
                  value={draft.gitDefaultBranch}
                  onChange={updateDraft('gitDefaultBranch')}
                  aria-label={t('chat.copy.defaultGitBranch_f6c17ffb')}
                />
              </label>
              <PanelButton disabled={busy || !draft.name.trim()}>{t('chat.copy.saveSettings_913aba9f')}</PanelButton>
            </form>
          )}

          {settingsTab === 'account' && (
            <div className="bolt-project-settings-grid">
              <form
                onSubmit={submitWithNotice(t('baseChatAst.settings.notice.profileSaved'))}
                className="bolt-project-settings-card"
              >
                <input name="intent" value="profile" type="hidden" />
                <div className="bolt-project-settings-card-title">
                  <h4>{t('chat.copy.profile_ff4fc027')}</h4>
                  <small>{t('chat.copy.visibleIdentityUsedByCommentsAudit_b250290b')}</small>
                </div>
                <div className="bolt-project-settings-profile">
                  <span>{initials}</span>
                  <div>
                    <strong>{accountUser.name ?? t('chat.copy.user_9f8a2389')}</strong>
                    <small>{accountUser.email ?? t('chat.copy.noEmailReturnedByApi_dfb6c309')}</small>
                  </div>
                </div>
                <label>
                  {t('chat.copy.displayName_c7874aaa')}
                  <PanelInput
                    name="name"
                    defaultValue={accountUser.name ?? ''}
                    required
                    aria-label={t('chat.copy.displayName_c7874aaa')}
                  />
                </label>
                <label>
                  {t('chat.copy.emailAddress_c94d3175')}
                  <PanelInput
                    name="email"
                    type="email"
                    defaultValue={accountUser.email ?? ''}
                    required
                    aria-label={t('chat.copy.emailAddress_c94d3175')}
                  />
                </label>
                <PanelButton disabled={busy}>{t('chat.copy.saveProfile_f597c0e8')}</PanelButton>
              </form>

              <section className="bolt-project-settings-card">
                <div className="bolt-project-settings-card-title">
                  <h4>{t('chat.copy.connectedAccountsData_b6b14f3b')}</h4>
                  <small>{t('chat.copy.onlyActionsBackedByPlatformRoutes_8db7a78b')}</small>
                </div>
                <div className="bolt-project-account-connectors">
                  <div>
                    <strong>{t('chat.copy.emailVerification_a674e88b')}</strong>
                    <small>
                      {accountUser.emailVerifiedAt
                        ? t('chat.copy.verified_aed3b8c6')
                        : t('chat.copy.notVerifiedYet_ae8be834')}
                    </small>
                  </div>
                  <div>
                    <strong>{t('chat.copy.githubOauth_b37815ca')}</strong>
                    <small>{t('chat.copy.useOauthToImportRepositoriesAnd_f0b172ff')}</small>
                  </div>
                  <div>
                    <strong>{t('chat.copy.accountExport_a83de782')}</strong>
                    <small>{t('chat.copy.profileSessionsOrganizationsProjectsUsageAnd_fc485c37')}</small>
                  </div>
                </div>
                {!accountUser.emailVerifiedAt && (
                  <form
                    onSubmit={submitWithNotice(t('baseChatAst.settings.notice.verificationRequested'))}
                    className="bolt-project-inline-action"
                  >
                    <input name="intent" value="send-verification" type="hidden" />
                    <PanelButton disabled={busy} variant="outline">
                      {t('chat.copy.sendVerificationEmail_d8fa8944')}
                    </PanelButton>
                  </form>
                )}
                <a href="/auth/oauth/github">{t('chat.copy.connectGithub_ab6f5ed0')}</a>
                <a href="/api/auth/export" target="_blank" rel="noreferrer">
                  {t('chat.copy.exportAccountJson_90f35d95')}
                </a>
              </section>
            </div>
          )}

          {settingsTab === 'security' && (
            <div className="bolt-project-settings-grid">
              <form
                onSubmit={submitWithNotice(t('baseChatAst.settings.notice.passwordSubmitted'))}
                className="bolt-project-settings-card"
              >
                <input name="intent" value="change-password" type="hidden" />
                <div className="bolt-project-settings-card-title">
                  <h4>{t('chat.copy.changePassword_49289db4')}</h4>
                  <small>{t('chat.copy.passwordChangesAreProcessedByAuth_e49364ef')}</small>
                </div>
                <label>
                  {t('chat.copy.currentPassword_19dff4da')}
                  <PanelInput
                    name="currentPassword"
                    type="password"
                    autoComplete="current-password"
                    required
                    aria-label={t('chat.copy.currentPassword_19dff4da')}
                  />
                </label>
                <label>
                  {t('chat.copy.newPassword_d850ee18')}
                  <PanelInput
                    name="newPassword"
                    type="password"
                    autoComplete="new-password"
                    placeholder={t('chat.copy.minimum8Characters_77c6662e')}
                    required
                    aria-label={t('chat.copy.newPassword_d850ee18')}
                  />
                </label>
                <PanelButton disabled={busy}>{t('chat.copy.updatePassword_350c355e')}</PanelButton>
                <small>{t('chat.copy.successfulPasswordChangesRevokeOtherSessions_255563ef')}</small>
              </form>

              <section className="bolt-project-settings-card">
                <div className="bolt-project-settings-card-title">
                  <h4>{t('chat.copy.signInProtection_dc3322d4')}</h4>
                  <small>{t('chat.copy.securityControlsCurrentlyBackedByThe_519a5a03')}</small>
                </div>
                <div className="bolt-project-security-methods">
                  <a href="/mfa-setup">
                    <strong>{t('chat.copy.multiFactorAuthentication_2ee1f6c6')}</strong>
                    <small>
                      {accountUser.mfaEnabled
                        ? t('chat.copy.enabledForThisAccount_60b56529')
                        : t('chat.copy.setUpTotpMfaAndRecovery_641e8eea')}
                    </small>
                  </a>
                  <a href="/security-settings">
                    <strong>{t('chat.copy.securityRules_0148ac1c')}</strong>
                    <small>{t('chat.copy.reviewMfaPolicyRecoveryAndSecurity_753c4979')}</small>
                  </a>
                  <a href="/enterprise-sso-settings">
                    <strong>{t('chat.copy.enterpriseSso_2a5603da')}</strong>
                    <small>{t('chat.copy.configureSamlOrOidcForOrganizations_19fa6e90')}</small>
                  </a>
                </div>
              </section>

              <section className="bolt-project-settings-card">
                <div className="bolt-project-settings-card-title">
                  <h4>{t('chat.copy.activeSessions_c71ffaf9')}</h4>
                  <small>{t('chat.copy.sessionNamesAreNormalizedFromUser_98537608')}</small>
                </div>
                <div className="bolt-project-settings-list">
                  {sessions.length ? (
                    sessions.slice(0, 8).map((session: any) => (
                      <form
                        key={session.id}
                        onSubmit={submitWithNotice(t('baseChatAst.settings.notice.sessionRevokeSubmitted'))}
                      >
                        <input name="intent" value="revoke-session" type="hidden" />
                        <input name="sessionId" value={session.id} type="hidden" />
                        <span>
                          <strong>{formatSessionDevice(session)}</strong>
                          <small>{formatSessionDetail(session)}</small>
                        </span>
                        <PanelButton
                          disabled={busy}
                          variant="outline"
                          aria-label={t('chat.copy.revokeValue0_34640d6a', { value0: formatSessionDevice(session) })}
                        >
                          {t('chat.copy.revoke_0be72075')}
                        </PanelButton>
                      </form>
                    ))
                  ) : (
                    <PanelEmptyState
                      icon="i-ph:monitor"
                      title={t('chat.copy.noActiveSessionsReturnedByApi_93156dfd')}
                    />
                  )}
                </div>
                <form
                  onSubmit={submitWithNotice(t('baseChatAst.settings.notice.otherSessionsSubmitted'))}
                  className="bolt-project-inline-action"
                >
                  <input name="intent" value="logout-all" type="hidden" />
                  <PanelButton disabled={busy} variant="outline">
                    {t('chat.copy.signOutOtherSessions_0f67c3ff')}
                  </PanelButton>
                </form>
              </section>

              <section className="bolt-project-settings-card danger">
                <h4>{t('chat.copy.dangerZone_8fc83aac')}</h4>
                <p>{t('chat.copy.permanentlyDeleteThisAccountTheApi_002c6691')}</p>
                <form
                  onSubmit={submitWithNotice(t('baseChatAst.settings.notice.accountDeletionSubmitted'))}
                  className="bolt-project-danger-form"
                >
                  <input name="intent" value="delete-account" type="hidden" />
                  <label>
                    {t('chat.copy.typeDeleteMyAccountToConfirm_1eff2ac0')}
                    <input
                      name="confirmation"
                      placeholder={t('chat.copy.deleteMyAccount_93b6c0a2')}
                      required
                      aria-label={t('chat.copy.deleteAccountConfirmation_344b143a')}
                    />
                  </label>
                  <PanelButton disabled={busy} variant="outline">
                    {t('chat.copy.deleteAccount_1753c206')}
                  </PanelButton>
                </form>
              </section>
            </div>
          )}

          {settingsTab === 'usage' && (
            <div className="bolt-project-settings-grid">
              <section className="bolt-project-settings-card">
                <div className="bolt-project-settings-card-title">
                  <h4>{t('chat.copy.billingPlan_c8f1555a')}</h4>
                  <small>{t('chat.copy.limitsAreRenderedFromTheBilling_d2a0ca4f')}</small>
                </div>
                <PanelRows
                  rows={[
                    [
                      t('baseChatAst.common.plan'),
                      billing.plan?.name ?? billing.plan?.key ?? t('baseChatAst.settings.noPlan'),
                    ],
                    [
                      t('baseChatAst.common.subscription'),
                      billing.subscription?.status
                        ? platformStateLabel(t, billing.subscription.status)
                        : (billing.error ?? t('baseChatAst.settings.noSubscription')),
                    ],
                    [
                      t('baseChatAst.common.usageEvents'),
                      formatBaseChatAstNumber(language, billing.usage?.length ?? 0),
                    ],
                  ]}
                />
                {limitEntries.length ? (
                  <div
                    className="bolt-project-usage-limits"
                    role="table"
                    aria-label={t('chat.copy.billingLimits_44423a56')}
                  >
                    <div role="row">
                      <span role="columnheader">{t('chat.copy.limit_24d948e4')}</span>
                      <span role="columnheader">{t('chat.copy.used_02c0e4a1')}</span>
                      <span role="columnheader">{t('chat.copy.quota_c6ecc23d')}</span>
                    </div>
                    {limitEntries.map(([key, value]: any) => {
                      const limit = Number(value?.limit ?? value?.max ?? value ?? 0);
                      const used = Number(usageByKey.get(key) ?? value?.used ?? 0);
                      const percent = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;

                      return (
                        <div key={key} role="row">
                          <span role="cell">{key.replaceAll('.', ' ')}</span>
                          <span role="cell">{formatBaseChatAstNumber(language, used)}</span>
                          <span role="cell">
                            {limit ? formatBaseChatAstNumber(language, limit) : t('chat.copy.unlimited_b8bef37b')}
                            <em style={{ inlineSize: `${percent}%` }} aria-hidden />
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <PanelEmptyState icon="i-ph:gauge" title={t('chat.copy.noBillingLimitsReturnedByApi_68d00609')} />
                )}
                <a href="/billing" target="_blank" rel="noreferrer">
                  {t('chat.copy.openBillingManagement_e4f3b4fc')}
                </a>
              </section>

              <section className="bolt-project-settings-card">
                <div className="bolt-project-settings-card-title">
                  <h4>{t('chat.copy.aiUsageCosts_67a38db2')}</h4>
                  <small>{t('chat.copy.tokenTotalsAreCalculatedFromThe_40e3f3be')}</small>
                </div>
                <div className="bolt-project-usage-metrics">
                  <span>
                    <strong>{formatBaseChatAstNumber(language, aiUsageTotals.inputTokens)}</strong>
                    <small>{t('chat.copy.inputTokens_92f7d222')}</small>
                  </span>
                  <span>
                    <strong>{formatBaseChatAstNumber(language, aiUsageTotals.outputTokens)}</strong>
                    <small>{t('chat.copy.outputTokens_b879f52d')}</small>
                  </span>
                  <span>
                    <strong>
                      {formatBaseChatAstNumber(language, aiUsageTotals.cost, {
                        style: 'currency',
                        currency: 'USD',
                        minimumFractionDigits: 4,
                        maximumFractionDigits: 4,
                      })}
                    </strong>
                    <small>{t('chat.copy.estimatedCost_516cbee2')}</small>
                  </span>
                </div>
                <PanelRows
                  rows={
                    aiUsage.length
                      ? aiUsage.slice(0, 10).map((item: any) => [
                          item.provider ?? item.model ?? item.type ?? t('baseChatAst.settings.aiCall'),
                          t('baseChatAst.settings.tokensInOut', {
                            input: formatBaseChatAstNumber(language, item.inputTokens ?? item.promptTokens ?? 0),
                            output: formatBaseChatAstNumber(language, item.outputTokens ?? item.completionTokens ?? 0),
                          }),
                        ])
                      : [[t('baseChatAst.common.usage'), data.aiUsage?.error ?? t('baseChatAst.settings.noAiUsage')]]
                  }
                />
              </section>
            </div>
          )}

          {settingsTab === 'ai' && (
            <section className="bolt-project-settings-card">
              <div className="bolt-project-settings-card-title">
                <h4>{t('chat.copy.aiProviderControls_5c3d5cbf')}</h4>
                <small>{t('chat.copy.providerModesKeysAndRoutingAre_9774aeff')}</small>
              </div>
              <div className="bolt-project-agent-policy" aria-label={t('chat.copy.agentPatchPolicy_90d5bd27')}>
                <article>
                  <span>
                    <strong>{t('chat.copy.autoApplySuccessfulPatches_3c5397c8')}</strong>
                    <small>{t('chat.copy.successfulPatchesAreAppliedAutomaticallyFailed_2f5dae7d')}</small>
                  </span>
                  <em>{t('chat.copy.enabled_df174a3f')}</em>
                </article>
                <article>
                  <span>
                    <strong>{t('chat.copy.planControl_b30ffa4e')}</strong>
                    <small>{t('chat.copy.useThePlanButtonInThe_295a8a73')}</small>
                  </span>
                  <em>{t('chat.copy.composer_10c35d71')}</em>
                </article>
              </div>
              <form
                onSubmit={submitWithNotice(t('baseChatAst.settings.notice.aiRoutingSaved'))}
                className="bolt-project-ai-routing"
              >
                <input name="intent" value="ai-routing" type="hidden" />
                <label>
                  {t('chat.copy.defaultProvider_8428a03f')}
                  <select name="defaultProvider" defaultValue={aiRouting.defaultProvider}>
                    {providers.map((provider) => (
                      <option key={provider.id} value={provider.id}>
                        {provider.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t('chat.copy.defaultModel_5fbae11e')}
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
                  {t('chat.copy.fallbackProvider_595064ee')}
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
                  <span>{t('chat.copy.useFallbackWhenThePrimaryProvider_b9aae73b')}</span>
                </label>
                <PanelButton disabled={busy}>{t('chat.copy.saveAiRouting_70900185')}</PanelButton>
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
                  <p>{t('chat.copy.aiProviderKeysAreManagedBy_81a3fe0b')}</p>
                </div>
              ) : (
                <div className="bolt-project-settings-provider-grid">
                  {providers.map((provider) => {
                    const configured = secrets.some((secret: any) => secret.key === provider.secretKey);
                    const mode = state.aiCredentials?.[provider.id]?.mode ?? t('chat.copy.managed_9fdf36c7');

                    return (
                      <article key={provider.id}>
                        <div className="bolt-project-provider-header">
                          <span>
                            <strong>{provider.label}</strong>
                            <small>
                              {mode === 'byok'
                                ? configured
                                  ? t('chat.copy.byokKeyConfigured_b10d2fa8')
                                  : t('chat.copy.byokEnabledKeyMissing_dac0cf84')
                                : t('chat.copy.managedCredits_16478357')}
                            </small>
                          </span>
                          <em title={t('chat.copy.managedCreditsUseECodePlatform_ee651c81')}>
                            {mode === 'byok' ? t('chat.copy.byok_36068183') : t('chat.copy.managed_7f0cab64')}
                          </em>
                        </div>
                        <form
                          onSubmit={submitWithNotice(
                            t('baseChatAst.settings.notice.providerModeSaved', { provider: provider.label }),
                          )}
                        >
                          <input name="intent" value="ai-credential-mode" type="hidden" />
                          <input name="provider" value={provider.id} type="hidden" />
                          <label>
                            {t('chat.copy.credentialMode_23fdd899')}
                            <select name="mode" defaultValue={mode}>
                              <option value="managed">{t('chat.copy.managedPlatformCredits_0f0a513d')}</option>
                              <option value="byok">{t('chat.copy.bringYourOwnKey_1cc3a1bb')}</option>
                            </select>
                          </label>
                          <PanelButton disabled={busy}>{t('chat.copy.saveMode_5e23f893')}</PanelButton>
                        </form>
                        <form
                          onSubmit={submitWithNotice(
                            t('baseChatAst.settings.notice.apiKeySaved', { provider: provider.label }),
                          )}
                        >
                          <input name="intent" value="save-ai-key" type="hidden" />
                          <input name="provider" value={provider.id} type="hidden" />
                          <label>
                            {t('chat.copy.apiKeySecret_00b16050')}
                            <input
                              name="apiKey"
                              type="password"
                              placeholder={`${provider.secretKey}`}
                              required
                              aria-label={t('chat.copy.value0ApiKey_b57b5786', { value0: provider.label })}
                            />
                          </label>
                          <PanelButton disabled={busy}>{t('chat.copy.saveKey_f5216b3a')}</PanelButton>
                        </form>
                        {configured && (
                          <form
                            onSubmit={submitWithNotice(
                              t('baseChatAst.settings.notice.apiKeyRemovalSubmitted', { provider: provider.label }),
                            )}
                          >
                            <input name="intent" value="delete-ai-key" type="hidden" />
                            <input name="provider" value={provider.id} type="hidden" />
                            <PanelButton disabled={busy} variant="outline">
                              {t('chat.copy.removeKey_582d9a78')}
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
                  <h4>{t('chat.copy.persistentAgentMemory_46293406')}</h4>
                  <small>{t('chat.copy.projectScopedMemoriesAreEmbeddedWith_392a706f')}</small>
                </div>
                <label className="bolt-project-memory-toggle">
                  <input
                    type="checkbox"
                    checked={memoryEnabled}
                    onChange={(event) => void toggleMemoryEnabled(event.target.checked)}
                    disabled={memoryLoading}
                  />
                  <span>
                    <strong>{t('chat.copy.useMemoryInFutureAgentResponses_63f5aa36')}</strong>
                    <small>
                      {memoryEnabled
                        ? t('chat.copy.retrievalAndAutomaticCaptureAreEnabled_12e2c9a0')
                        : t('chat.copy.storedMemoriesStayVisibleButAre_207d1495')}
                    </small>
                  </span>
                </label>
                <label>
                  {t('chat.copy.newMemory_c8ff73b0')}
                  <textarea
                    value={memoryDraft}
                    onChange={(event) => setMemoryDraft(event.target.value)}
                    placeholder={t('chat.copy.exampleAlwaysPushToMainAfter_3934df0b')}
                    rows={5}
                  />
                </label>
                {memoryDraft.trim() ? (
                  <details className="bolt-project-memory-preview">
                    <summary>{t('chat.copy.previewMemoryPayload_23b406cf')}</summary>
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
                    {t('chat.copy.type_3deb7456')}
                    <select value={memoryType} onChange={(event) => setMemoryType(event.target.value)}>
                      <option value="semantic">{t('chat.copy.semantic_2b3a5e30')}</option>
                      <option value="procedural">{t('chat.copy.procedural_4fce7cb8')}</option>
                      <option value="episodic">{t('chat.copy.episodic_2de3ef9c')}</option>
                      <option value="working">{t('chat.copy.working_3b4dfc97')}</option>
                      <option value="cache">{t('chat.copy.cache_50338b3b')}</option>
                    </select>
                  </label>
                  <label>
                    {t('chat.copy.tags_848eed0f')}
                    <input
                      value={memoryTags}
                      onChange={(event) => setMemoryTags(event.target.value)}
                      placeholder={t('chat.copy.validationWorkflow_bfc0d82a')}
                    />
                  </label>
                </div>
                <div className="bolt-project-form-actions">
                  <PanelButton disabled={memoryLoading || !memoryDraft.trim()}>
                    {t('chat.copy.saveMemory_d739576e')}
                  </PanelButton>
                  <button
                    type="button"
                    onClick={() => {
                      setMemoryDraft('');
                      setMemoryTags('');
                      setMemoryType('semantic');
                    }}
                    disabled={memoryLoading || (!memoryDraft && !memoryTags && memoryType === 'semantic')}
                  >
                    {t('chat.copy.resetDraft_cdca2702')}
                  </button>
                </div>
                {memoryError ? (
                  <div className="bolt-project-settings-memory-error" role="alert">
                    <span>{memoryError}</span>
                    <button type="button" onClick={() => void loadMemories()} disabled={memoryLoading}>
                      {t('chat.copy.retry_9f5cd8a2')}
                    </button>
                  </div>
                ) : null}
              </form>

              <section className="bolt-project-settings-card">
                <div className="bolt-project-memory-card-header">
                  <h4>{t('chat.copy.storedMemories_fcb0b767')}</h4>
                  <a
                    href={`/api/agent-memory/export?projectId=${encodeURIComponent(settings.id)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t('chat.copy.exportJson_bc399052')}
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
                              {t('chat.copy.memoryContent_66fe7c72')}
                              <textarea
                                value={memoryEditDraft}
                                onChange={(event) => setMemoryEditDraft(event.target.value)}
                                rows={4}
                              />
                            </label>
                            <div className="bolt-project-memory-fields">
                              <label>
                                {t('chat.copy.type_3deb7456')}
                                <select
                                  value={memoryEditType}
                                  onChange={(event) => setMemoryEditType(event.target.value)}
                                >
                                  <option value="semantic">{t('chat.copy.semantic_2b3a5e30')}</option>
                                  <option value="procedural">{t('chat.copy.procedural_4fce7cb8')}</option>
                                  <option value="episodic">{t('chat.copy.episodic_2de3ef9c')}</option>
                                  <option value="working">{t('chat.copy.working_3b4dfc97')}</option>
                                  <option value="cache">{t('chat.copy.cache_50338b3b')}</option>
                                </select>
                              </label>
                              <label>
                                {t('chat.copy.tags_848eed0f')}
                                <input
                                  value={memoryEditTags}
                                  onChange={(event) => setMemoryEditTags(event.target.value)}
                                  placeholder={t('chat.copy.validationWorkflow_bfc0d82a')}
                                />
                              </label>
                            </div>
                            <div>
                              <button
                                type="button"
                                onClick={() => void saveEditedMemory(memory.id)}
                                disabled={memoryLoading || !memoryEditDraft.trim()}
                              >
                                {t('chat.copy.save_efc007a3')}
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
                                {t('chat.copy.cancel_77dfd213')}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <span>
                              <strong>{memory.summary}</strong>
                              <small>
                                {memory.scope} - {memory.memoryType ?? t('chat.copy.semantic_94fb17e3')}
                                {t('chat.copy.importance_1f63883f')} {Math.round((memory.importance ?? 0) * 100)}
                                {t('chat.copy.used_a073030d')}
                                {memory.accessCount ?? 0}
                                {t('chat.copy.x_74e0fa34')}{' '}
                                {memory.updatedAt
                                  ? (formatBaseChatAstDateTime(language, memory.updatedAt) ??
                                    t('baseChatAst.status.notAvailable'))
                                  : t('chat.copy.stored_ab514b9a')}
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
                                {t('chat.copy.edit_5301648d')}
                              </button>
                              <button
                                type="button"
                                onClick={() => void deleteMemory(memory.id)}
                                disabled={memoryLoading}
                              >
                                {t('chat.copy.delete_f6fdbe48')}
                              </button>
                            </div>
                          </>
                        )}
                      </article>
                    ))}
                  </div>
                ) : (
                  <PanelEmptyState
                    icon="i-ph:brain"
                    title={t('chat.copy.noPersistentMemoriesStoredForThis_322165dc')}
                  />
                )}
              </section>
            </div>
          )}

          {settingsTab === 'preferences' && (
            <div className="bolt-project-settings-grid">
              <form
                onSubmit={submitWithNotice(t('baseChatAst.settings.notice.idePreferencesSaved'))}
                className="bolt-project-settings-card"
              >
                <input name="intent" value="preferences" type="hidden" />
                <div className="bolt-project-settings-card-title">
                  <h4>{t('chat.copy.appearanceKeyboard_9ee473c9')}</h4>
                  <small>{t('chat.copy.workspacePreferencesAreStoredPerProject_bd451dcb')}</small>
                </div>
                <label>
                  {t('chat.copy.theme_a797e309')}
                  <select name="theme" defaultValue={preferences.theme}>
                    <option value="dark">{t('chat.copy.dark_ae1ef014')}</option>
                    <option value="light">{t('chat.copy.light_a36ef8ab')}</option>
                    <option value="system">{t('chat.copy.system_bc0792d8')}</option>
                  </select>
                </label>
                {/*
                 * Langue : réglage de COMPTE, pas de projet — d'où le POST vers
                 * `/api/user/preferences` du composant plutôt que le formulaire
                 * `intent=preferences` de cette carte, qui écrit dans les
                 * variables d'environnement du projet. Il a remplacé la bascule
                 * FR/EN de la barre de l'IDE : la langue est détectée depuis le
                 * navigateur, ce réglage ne sert qu'à surcharger la détection.
                 */}
                <label>
                  {t('settingsPreferences.language')}
                  <LanguageSetting />
                </label>
                <label>
                  {t('chat.copy.keyboardMode_648b32a7')}
                  <select name="keyboardMode" defaultValue={String(Boolean(preferences.keyboardMode))}>
                    <option value="false">{t('chat.copy.standardBrowserShortcuts_ac1cbde1')}</option>
                    <option value="true">{t('chat.copy.hardwareKeyboardIdeShortcuts_80e616e2')}</option>
                  </select>
                </label>
                <label>
                  {t('chat.copy.creditAlertThreshold_40535a69')}
                  <input
                    name="creditAlertThreshold"
                    type="number"
                    min="10"
                    max="100"
                    defaultValue={preferences.creditAlertThreshold ?? 80}
                  />
                </label>
                <PanelButton disabled={busy}>{t('chat.copy.savePreferences_d8ab74e1')}</PanelButton>
              </form>

              <form
                onSubmit={submitWithNotice(t('baseChatAst.settings.notice.shortcutsSaved'))}
                className="bolt-project-settings-card"
              >
                <input name="intent" value="keybindings" type="hidden" />
                <div className="bolt-project-settings-card-title">
                  <h4>{t('chat.copy.keyboardShortcuts_b465751c')}</h4>
                  <small>{t('chat.copy.editShortcutsWithCombosLikeCmd_ace80b63')}</small>
                </div>
                {keyboardConflicts.length > 0 ? (
                  <div className="bolt-project-keybindings-conflicts" role="alert">
                    <strong>{t('chat.copy.shortcutConflictsDetected_4514c8b4')}</strong>
                    <span>
                      {keyboardConflicts
                        .map((conflict) => `${formatKeybindingCombo(conflict.combo)}: ${conflict.actions.join(', ')}`)
                        .join(' · ')}
                    </span>
                  </div>
                ) : null}
                <div className="bolt-project-settings-keybindings">
                  {keyboardSections.map((section) => (
                    <section
                      key={section.category}
                      aria-label={t('chat.copy.value0Shortcuts_52261c31', { value0: section.label })}
                    >
                      <h5>{section.label}</h5>
                      {section.bindings.map((binding) => (
                        <div key={`${binding.combo}-${binding.action}`} className="bolt-project-keybinding-row">
                          <span>
                            <strong>{binding.label}</strong>
                            <small>{binding.description}</small>
                          </span>
                          <label>
                            <span className="sr-only">
                              {t('baseChatAst.phrases.shortcutFor', { label: binding.label })}
                            </span>
                            <input
                              name={`keybinding:${binding.action}`}
                              defaultValue={binding.combo}
                              spellCheck={false}
                              autoCapitalize="none"
                              aria-label={t('chat.copy.value0Shortcut_3842fc24', { value0: binding.label })}
                            />
                          </label>
                          <kbd>{formatKeybindingCombo(binding.combo)}</kbd>
                        </div>
                      ))}
                    </section>
                  ))}
                </div>
                <PanelButton disabled={busy}>{t('chat.copy.saveKeyboardShortcuts_65d1bc6e')}</PanelButton>
              </form>

              <section className="bolt-project-settings-card">
                <div className="bolt-project-settings-card-title">
                  <h4>{t('chat.copy.notificationPreferences_a92e15bc')}</h4>
                  <small>{t('chat.copy.inAppTogglesArePersistedHere_a5c24093')}</small>
                </div>
                <div className="bolt-project-settings-list">
                  {notificationRows.map(([key, label, desc]) => {
                    const enabled = notifications[key] !== false;

                    return (
                      <form
                        key={key}
                        onSubmit={submitWithNotice(t('baseChatAst.settings.notice.notificationSaved', { label }))}
                      >
                        <input name="intent" value="notification" type="hidden" />
                        <input name="key" value={key} type="hidden" />
                        <input name="enabled" value={String(!enabled)} type="hidden" />
                        <span>
                          <strong>{label}</strong>
                          <small>{desc}</small>
                          <span className="bolt-project-notification-channels">
                            <em data-enabled={enabled}>
                              {t('chat.copy.inApp_db5a6884')}
                              {enabled ? t('chat.copy.on_db3d405b') : t('chat.copy.off_da7a6873')}
                            </em>
                            <em>{t('chat.copy.emailViaAccount_7de69732')}</em>
                            <em>{t('chat.copy.pushViaNativeRuntime_91ec78cc')}</em>
                          </span>
                        </span>
                        <PanelButton
                          disabled={busy}
                          variant="outline"
                          aria-label={t('chat.copy.value0Value1Notifications_a1f4307f', {
                            value0: enabled
                              ? t('baseChatAst.status.disableAction')
                              : t('baseChatAst.status.enableAction'),
                            value1: label,
                          })}
                          aria-pressed={enabled}
                        >
                          {enabled ? t('chat.copy.turnOff_8807c2b3') : t('chat.copy.turnOn_26563efc')}
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

function formatObjectStorageSize(t: TFunction, language: string, size?: number): string {
  if (typeof size !== 'number' || Number.isNaN(size)) {
    return t('baseChatAst.storage.unknownSize');
  }

  if (size < 1024) {
    return t('baseChatAst.storage.bytes', { value: formatBaseChatAstNumber(language, size) });
  }

  if (size < 1024 * 1024) {
    return t('baseChatAst.storage.kilobytes', {
      value: formatBaseChatAstNumber(language, size / 1024, {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }),
    });
  }

  return t('baseChatAst.storage.megabytes', {
    value: formatBaseChatAstNumber(language, size / (1024 * 1024), {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }),
  });
}

/*
 * Real per-project GCS object storage. Self-fetches via the ide-panel proxy
 * (intents list/upload-url/download-url/move/delete-object/ensure-bucket) which
 * forwards to /projects/:id/object-storage/*. The feature is flag-gated
 * (OBJECT_STORAGE_ENABLED); when off the proxy returns { enabled: false } and we
 * render a clear "not enabled" state rather than any placeholder data.
 */
function ProjectObjectStoragePanel({ projectId, busy }: { projectId?: string; busy: boolean }) {
  const { t, i18n } = useTranslation();
  const language = resolvedBaseChatLanguage(i18n);
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

        if (result.error) {
          console.warn('Object storage list request failed', { serverError: result.error });
          setStatus(t('baseChatAst.storage.operationFailed'));
        } else {
          setStatus(null);
        }
      } catch (error) {
        console.error('Object storage list request failed', error);
        setStatus(t('baseChatAst.storage.unreachable'));
      } finally {
        setLoading(false);
      }
    },
    [postIntent, projectId, t],
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

    /*
     * `enabled === null` renders "Checking object storage…", so ANY unresolved
     * probe left that spinner on screen forever with no error — which is what
     * users saw when the status intent 500'd (the panel route times out after
     * 30s when the API pod cannot reach the metadata server to mint GCS
     * credentials). A failed probe is an answer too: report it instead of
     * pretending the check is still running.
     */
    try {
      const result = await postIntent({ intent: 'status' });

      if (!result || result.error) {
        console.warn('Object storage status request failed', { serverError: result?.error });
        setEnabled(false);
        setProvisioned(false);
        setStatus(t('baseChatAst.storage.unreachable'));

        return;
      }

      setEnabled(Boolean(result.enabled));
      setProvisioned(result.enabled ? Boolean(result.provisioned) : false);
    } catch (error) {
      console.error('Object storage status request failed', error);
      setEnabled(false);
      setProvisioned(false);
      setStatus(t('baseChatAst.storage.unreachable'));
    }
  }, [postIntent, projectId, t]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  /*
   * Seconds spent on the initial probe, so the waiting state can show that it is
   * still working. The timer only runs while `enabled` is undecided, and is
   * cleared as soon as the answer lands — it must not keep ticking behind a
   * panel that has already rendered its result.
   */
  const [checkSeconds, setCheckSeconds] = useState(0);

  useEffect(() => {
    if (enabled !== null) {
      return undefined;
    }

    const started = Date.now();
    const timer = setInterval(() => setCheckSeconds(Math.round((Date.now() - started) / 1000)), 1000);

    return () => clearInterval(timer);
  }, [enabled]);

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
        console.warn('Object storage enable request failed', { serverError: result.error });
        setStatus(t('baseChatAst.storage.enableFailed'));

        return;
      }

      if (result && result.enabled === false) {
        setEnabled(false);
        return;
      }

      setProvisioned(true);
      setStatus(t('baseChatAst.storage.enabled'));
      await refresh(prefix);
    } catch (error) {
      console.error('Object storage enable request failed', error);
      setStatus(t('baseChatAst.storage.enableFailed'));
    } finally {
      setEnabling(false);
    }
  }, [postIntent, prefix, refresh, t]);

  const runOperation = useCallback(
    async (fields: Record<string, string>, successMessage: string) => {
      setWorking(true);
      setStatus(null);

      try {
        const result = await postIntent(fields);

        if (result && result.error) {
          console.warn('Object storage operation failed', { fields, serverError: result.error });
          setStatus(t('baseChatAst.storage.operationFailed'));

          return;
        }

        setStatus(successMessage);
        await refresh(prefix);
      } catch (error) {
        console.error('Object storage operation failed', { fields, error });
        setStatus(t('baseChatAst.storage.operationFailed'));
      } finally {
        setWorking(false);
      }
    },
    [postIntent, prefix, refresh, t],
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
            console.warn('Object storage upload URL request failed', { key, serverError: signed?.error });
            setStatus(t('baseChatAst.storage.notEnabled'));

            return;
          }

          const put = await fetch(signed.url, {
            method: signed.method ?? 'PUT',
            headers: signed.headers ?? { 'Content-Type': contentType },
            body: file,
          });

          if (!put.ok) {
            setStatus(t('baseChatAst.storage.uploadFailedHttp', { file: file.name, status: put.status }));
            return;
          }
        }

        setStatus(t('baseChatAst.storage.uploadComplete'));
        await refresh(prefix);
      } catch (error) {
        console.error('Object storage upload failed', error);
        setStatus(t('baseChatAst.storage.uploadFailed'));
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
    [postIntent, prefix, refresh, t],
  );

  const handleDownload = useCallback(
    async (key: string) => {
      const result = await postIntent({ intent: 'download-url', key });

      if (result && result.url) {
        window.open(result.url, '_blank', 'noopener,noreferrer');
      } else {
        console.warn('Object storage download URL request failed', { key, serverError: result?.error });
        setStatus(t('baseChatAst.storage.downloadLinkFailed'));
      }
    },
    [postIntent, t],
  );

  const handleRename = useCallback(
    (next: string) => {
      const key = renameKey;
      setRenameKey(null);

      if (key && next.trim() && next.trim() !== key) {
        void runOperation({ intent: 'move', from: key, to: next.trim() }, t('baseChatAst.storage.objectMoved'));
      }
    },
    [renameKey, runOperation, t],
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
          console.warn('Object storage folder upload URL request failed', { key, serverError: signed?.error });
          setStatus(t('baseChatAst.storage.notEnabled'));

          return;
        }

        const put = await fetch(signed.url, {
          method: signed.method ?? 'PUT',
          headers: signed.headers ?? { 'Content-Type': 'application/x-directory' },
          body: '',
        });

        if (!put.ok) {
          setStatus(t('baseChatAst.storage.folderCreateFailedHttp', { status: put.status }));
          return;
        }

        setStatus(t('baseChatAst.storage.folderCreated'));
        await refresh(prefix);
      } catch (error) {
        console.error('Object storage folder creation failed', error);
        setStatus(t('baseChatAst.storage.folderCreateFailed'));
      } finally {
        setWorking(false);
      }
    },
    [postIntent, prefix, refresh, t],
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
    /*
     * Measured against a real project: the probe answers `200` three times
     * while it waits, then fails, and the panel showed this one static line for
     * 45 seconds before saying anything. Nothing moved, no elapsed time, no
     * hint that a wait was expected — the panel read as frozen. So: a live
     * spinner, the seconds counting up once the wait stops being instant, and
     * an explicit "this can take up to a minute" past the point where a user
     * starts to assume it is broken.
     */
    return (
      <div className="bolt-project-managed-panel bolt-project-object-storage-panel">
        <div className="bolt-project-empty-panel grid gap-2 text-sm text-bolt-elements-textSecondary">
          <span className="flex items-center gap-2" role="status" aria-live="polite">
            <span className="i-svg-spinners:3-dots-fade shrink-0" aria-hidden />
            <span>
              {t('chat.copy.checkingObjectStorage_959b2900')}
              {checkSeconds >= 5 ? ` ${t('baseChatAst.storage.checkingElapsed', { seconds: checkSeconds })}` : ''}
            </span>
          </span>
          {checkSeconds >= 15 ? (
            <span className="text-bolt-elements-textTertiary">{t('baseChatAst.storage.checkingSlow')}</span>
          ) : null}
        </div>
      </div>
    );
  }

  if (enabled === false) {
    return (
      <div className="bolt-project-managed-panel bolt-project-object-storage-panel">
        <PanelEmptyState
          icon="i-ph:hard-drives"
          title={t('chat.copy.objectStorageIsNotAvailableYet_0f2325e6')}
          description={t('chat.copy.cloudObjectStorageHasnTBeen_714efe71')}
        />
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
            <strong>{t('chat.copy.enableObjectStorageForThisProject_6caf063b')}</strong>
          </div>
          <span className="text-bolt-elements-textSecondary">
            {t('chat.copy.createAPrivateCloudBucketTo_cedeeb5d')}
          </span>
          {status ? (
            <span className="text-xs text-bolt-elements-textTertiary" role="status">
              {status}
            </span>
          ) : null}
          <PanelButton type="button" onClick={() => void enableStorage()} disabled={enabling || busy} className="w-fit">
            {enabling ? t('chat.copy.enabling_5c258f09') : t('chat.copy.enableObjectStorage_3c4cc0c4')}
          </PanelButton>
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
          <span>
            {t('chat.copy.dropFilesToUploadTo_62098588')}
            {prefix || t('chat.copy.theBucketRoot_d8754c09')}
          </span>
        </div>
      ) : null}
      <InputDialog
        isOpen={renameKey !== null}
        onClose={() => setRenameKey(null)}
        onSubmit={handleRename}
        title={t('chat.copy.moveRenameObject_4ed5265d')}
        description={t('chat.copy.movesTheObjectToTheNew_402bdb5f')}
        label={t('chat.copy.newObjectKey_e45fdbc8')}
        initialValue={renameKey ?? ''}
        confirmLabel={t('baseChatAst.storage.move')}
        validate={(value) => (value.trim() ? undefined : t('baseChatAst.storage.enterObjectKey'))}
      />
      <InputDialog
        isOpen={createFolderOpen}
        onClose={() => setCreateFolderOpen(false)}
        onSubmit={(value) => {
          setCreateFolderOpen(false);
          void handleCreateFolder(value);
        }}
        title={t('chat.copy.newFolder_a711999b')}
        description={t('chat.copy.createdUnderValue0_73c7698c', {
          value0: prefix || t('baseChatAst.storage.bucketRoot'),
        })}
        label={t('chat.copy.folderName_b2ce023b')}
        placeholder={t('chat.copy.assets_3685e330')}
        confirmLabel={t('baseChatAst.storage.createFolder')}
        validate={(value) => (value.trim() ? undefined : t('baseChatAst.storage.enterFolderName'))}
      />
      <ConfirmationDialog
        isOpen={confirmDeleteBucket}
        onClose={() => setConfirmDeleteBucket(false)}
        onConfirm={() => {
          setConfirmDeleteBucket(false);
          void runOperation({ intent: 'delete-bucket' }, t('baseChatAst.storage.bucketDeleted'));
        }}
        title={t('chat.copy.deleteThisBucket_293894e5')}
        description={t('chat.copy.permanentlyDeletesTheProjectBucketAnd_5f3e0981')}
        confirmLabel={t('baseChatAst.storage.deleteBucket')}
        variant="destructive"
      />
      <section className="grid gap-3">
        {/* Bucket header + Objects | Settings switch (Replit App Storage parity). */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm text-bolt-elements-textPrimary">
            <span className="i-ph:package" aria-hidden />
            <strong>{t('chat.copy.projectBucket_b51aaf40')}</strong>
          </div>
          <PanelToolTabs
            tabs={
              [
                ['objects', t('baseChatAst.common.objects')],
                ['settings', t('baseChatAst.common.settings')],
              ] as const
            }
            active={view}
            onSelect={setView}
          />
        </div>

        {view === 'settings' ? (
          <div className="grid gap-4 text-sm">
            <section className="grid gap-2 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-3">
              <PanelSectionTitle level="group">{t('chat.copy.bucket_40dafe4c')}</PanelSectionTitle>
              <p className="text-xs text-bolt-elements-textSecondary">
                {t('chat.copy.aSingleGcsBucketIsProvisioned_0d81fecc')}
              </p>
              <PanelButton
                type="button"
                variant="outline"
                size="sm"
                className="w-fit"
                onClick={() => void runOperation({ intent: 'ensure-bucket' }, t('baseChatAst.storage.bucketReady'))}
                disabled={busy || working}
              >
                {t('chat.copy.ensureBucketExists_5c9d55b8')}
              </PanelButton>
            </section>
            <section className="grid gap-2 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-3">
              <PanelSectionTitle level="group">{t('chat.copy.sharing_78779bad')}</PanelSectionTitle>
              <p className="text-xs text-bolt-elements-textTertiary">
                {t('chat.copy.addingOrRemovingThisBucketFrom_63b69b72')}
              </p>
            </section>
            <section className="grid gap-2 rounded-lg border border-[var(--status-error-border)] bg-bolt-elements-background-depth-2 p-3">
              <PanelSectionTitle level="group">{t('chat.copy.deleteBucket_0d2c8e99')}</PanelSectionTitle>
              <p className="text-xs text-bolt-elements-textTertiary">
                {t('chat.copy.permanentlyDeletesTheProjectBucketAnd_850cc916')}
              </p>
              <PanelButton
                type="button"
                variant="danger"
                size="sm"
                className="w-fit"
                disabled={busy || working}
                onClick={() => setConfirmDeleteBucket(true)}
              >
                {t('chat.copy.deleteBucket_0d2c8e99')}
              </PanelButton>
            </section>
            {status ? (
              <p className="text-xs text-bolt-elements-textSecondary" role="status">
                {status}
              </p>
            ) : null}
          </div>
        ) : (
          <>
            {/* UNIF lot 7 — toolbar storage sur les primitives (PanelInput/PanelButton sm). */}
            <div className="bolt-project-panel-toolbar flex flex-wrap items-end gap-2">
              <label className="grid gap-1 text-xs text-bolt-elements-textSecondary">
                {t('chat.copy.prefixFolder_db73cfed')}
                <PanelInput
                  size="sm"
                  value={prefix}
                  onChange={(event) => setPrefix(event.target.value)}
                  placeholder={t('chat.copy.assets_79f5d556')}
                  autoCapitalize="none"
                  spellCheck={false}
                />
              </label>
              <PanelButton
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void refresh(prefix)}
                disabled={loading || working}
              >
                {loading ? t('chat.copy.loading_33ce4174') : t('chat.copy.refresh_56e3badc')}
              </PanelButton>
              <PanelButton
                type="button"
                size="sm"
                onClick={() => uploadInputRef.current?.click()}
                disabled={busy || working}
              >
                {t('chat.copy.uploadFiles_41aca16f')}
              </PanelButton>
              <PanelButton
                type="button"
                variant="outline"
                size="sm"
                onClick={() => folderInputRef.current?.click()}
                disabled={busy || working}
              >
                {t('chat.copy.uploadFolder_e77a1496')}
              </PanelButton>
              <PanelButton
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setCreateFolderOpen(true)}
                disabled={busy || working}
              >
                {t('chat.copy.createFolder_e59f63fa')}
              </PanelButton>
              <PanelButton
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void runOperation({ intent: 'ensure-bucket' }, t('baseChatAst.storage.bucketReady'))}
                disabled={busy || working}
              >
                {t('chat.copy.ensureBucket_59b7cad5')}
              </PanelButton>
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
              {t('chat.copy.tipDragDropFilesAnywhereIn_330e97ac')}
            </p>

            {prefix ? (
              <div className="flex items-center gap-2 text-xs text-bolt-elements-textSecondary">
                {/* UNIF lot 7 — « Up » n'est plus un lien souligné ad hoc mais un PanelButton outline. */}
                <PanelButton type="button" variant="outline" size="sm" onClick={() => setPrefix(parentPrefix)}>
                  <span className="i-ph:arrow-elbow-left-up mr-1" aria-hidden />
                  {t('chat.copy.up_12493f7d')}
                </PanelButton>
                <span className="min-w-0 truncate font-mono">{prefix}</span>
              </div>
            ) : null}

            <PanelInput
              size="sm"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder={t('chat.copy.searchThisFolder_3bbb9af2')}
              autoCapitalize="none"
              spellCheck={false}
              aria-label={t('chat.copy.searchObjects_e9aa6bcc')}
              className="w-full text-bolt-elements-textPrimary"
            />

            {visibleFolders.length ? (
              <div className="flex flex-wrap gap-2">
                {visibleFolders.map((folder) => (
                  <span key={folder} className="inline-flex items-center gap-1">
                    {/* UNIF lot 4 — plus d'emoji brut : icône Phosphor, même gabarit que les badges. */}
                    <button
                      type="button"
                      onClick={() => setPrefix(folder)}
                      className="inline-flex items-center gap-1 rounded-md border border-bolt-elements-borderColor px-2 py-1 text-xs text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3"
                    >
                      <span className="i-ph:folder" aria-hidden />
                      {folder.replace(prefix, '').replace(/\/$/, '')}
                    </button>
                    {/* UNIF lot 7 — croix typographique remplacée par l'icône Phosphor standard. */}
                    <button
                      type="button"
                      onClick={() =>
                        void runOperation(
                          { intent: 'delete-object', prefix: folder },
                          t('baseChatAst.storage.folderDeleted'),
                        )
                      }
                      aria-label={t('chat.copy.deleteFolderValue0_f97d9e9f', { value0: folder })}
                      className="inline-flex items-center rounded p-0.5 text-bolt-elements-textTertiary transition-colors hover:text-bolt-elements-item-contentDanger disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={working}
                    >
                      <span className="i-ph:x" aria-hidden />
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
                    {/* UNIF lot 7 — ligne fichier : icône Phosphor + taille en Badge, actions en PanelButton. */}
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="i-ph:file shrink-0 text-bolt-elements-textSecondary" aria-hidden />
                      <div className="min-w-0">
                        <strong className="block truncate text-bolt-elements-textPrimary">
                          {object.key.replace(prefix, '')}
                        </strong>
                        <span className="flex flex-wrap items-center gap-1 text-bolt-elements-textSecondary">
                          <Badge variant="subtle" size="sm">
                            {formatObjectStorageSize(t, language, object.size)}
                          </Badge>
                          {object.updated ? (formatBaseChatAstDateTime(language, object.updated) ?? '') : ''}
                        </span>
                      </div>
                    </div>
                    <div className="bolt-project-object-actions flex shrink-0 items-center gap-2">
                      <PanelButton
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void handleDownload(object.key)}
                        disabled={working}
                      >
                        {t('chat.copy.download_a479c9c3')}
                      </PanelButton>
                      <PanelButton
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setRenameKey(object.key)}
                        disabled={working}
                      >
                        {t('chat.copy.move_76cdb950')}
                      </PanelButton>
                      <PanelButton
                        type="button"
                        variant="danger"
                        size="sm"
                        onClick={() =>
                          void runOperation(
                            { intent: 'delete-object', key: object.key },
                            t('baseChatAst.storage.objectDeleted'),
                          )
                        }
                        disabled={working}
                      >
                        {t('chat.copy.delete_f6fdbe48')}
                      </PanelButton>
                    </div>
                  </div>
                ))}
              </div>
            ) : loading ? (
              <div className="bolt-project-empty-panel">{t('chat.copy.loadingObjects_9bcff057')}</div>
            ) : (
              <PanelEmptyState
                icon="i-ph:hard-drives"
                title={
                  normalizedFilter
                    ? t('chat.copy.noObjectsMatchYourSearch_15d8d7b9')
                    : prefix
                      ? t('chat.copy.noObjectsUnderThisPrefix_a8bfd956')
                      : t('chat.copy.theBucketIsEmpty_18809c5d')
                }
              />
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
  const { t } = useTranslation();
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
          console.warn('Skills update request failed', { status: response.status, serverError: result.error });
          setError(t('baseChatAst.skills.updateFailedHttp', { status: response.status }));

          return false;
        }

        if (result.note) {
          setNote(result.note);
        }

        await reload?.();

        return true;
      } catch (actionError) {
        console.error('Skills update request failed', actionError);
        setError(t('baseChatAst.skills.updateFailed'));

        return false;
      } finally {
        setPending(null);
      }
    },
    [projectId, reload, t],
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
    {
      id: 'project',
      label: t('chat.copy.project_f6f4da8d'),
      count: skills.filter((s) => s.enabled).length + installedProject.length,
    },
    { id: 'workspace', label: t('chat.copy.workspace_4ca0a75c'), count: installedWorkspace.length },
    { id: 'community', label: t('chat.copy.community_bfd58ee3'), count: catalog.length },
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
            <PanelSectionTitle level="group">{t('chat.copy.builtinSkills_e1514b4a')}</PanelSectionTitle>
            <p className="text-xs text-bolt-elements-textSecondary">
              {t('chat.copy.togglesAreStoredPerProjectOver_7e9883ea')}
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
                    {pending === `b:${skill.id}`
                      ? '…'
                      : skill.enabled
                        ? t('chat.copy.enabled_df174a3f')
                        : t('chat.copy.disabled_f4f4473d')}
                  </button>
                </div>
              ))
            ) : (
              <PanelEmptyState icon="i-ph:sparkle" title={t('chat.copy.noBuiltinSkillsAreAvailable_22eb212a')} />
            )}
          </div>

          <InstalledSkillsList
            title={t('chat.copy.installedFromGithubProject_e3344d94')}
            emptyLabel={t('baseChatAst.skills.noProject')}
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
            <PanelEmptyState icon="i-ph:sparkle" title={t('chat.copy.thisProjectHasNoWorkspaceYet_c3f6040c')} />
          ) : (
            <InstalledSkillsList
              title={t('chat.copy.installedFromGithubWorkspace_f3607e99')}
              emptyLabel={t('baseChatAst.skills.noWorkspace')}
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
            placeholder={t('chat.copy.searchSkillsByNameRepoOr_32760210')}
            className="w-full rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-2 text-sm text-bolt-elements-textPrimary placeholder:text-bolt-elements-textTertiary focus:border-bolt-elements-focus focus:outline-none"
          />

          <div className="flex flex-wrap items-center gap-2 text-xs text-bolt-elements-textSecondary">
            <span>{t('chat.copy.installTo_358c06d6')}</span>
            {/* UNIF-14 — bascule de scope d'installation sur le FilterChip commun (aria-pressed + accent action). */}
            {(['project', 'workspace'] as SkillInstallScope[]).map((scope) => (
              <FilterChip
                key={scope}
                label={scope === 'project' ? t('baseChatAst.common.project') : t('baseChatAst.common.workspace')}
                active={communityScope === scope}
                disabled={scope === 'workspace' && !hasWorkspace}
                onClick={() => setCommunityScope(scope)}
              />
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
                          <span>{t('baseChatAst.skills.installCount', { count: entry.installCount })}</span>
                        </span>
                      </span>
                    </button>

                    {/* UNIF-14 — Install / Uninstall dupliquaient à la main les classes du
                        PanelButton (danger / primary) ; ils passent au composant partagé. */}
                    {installed ? (
                      <PanelButton
                        type="button"
                        variant="danger"
                        size="sm"
                        className="shrink-0"
                        onClick={() => void uninstall(entry.ownerRepo, communityScope)}
                        disabled={busy || pending === `u:${communityScope}:${entry.ownerRepo}`}
                      >
                        {pending === `u:${communityScope}:${entry.ownerRepo}` ? '…' : t('chat.copy.uninstall_a735da1d')}
                      </PanelButton>
                    ) : (
                      <PanelButton
                        type="button"
                        size="sm"
                        className="shrink-0"
                        onClick={() => void installFromCatalog(entry.ownerRepo, communityScope)}
                        disabled={busy || pending === `i:${entry.ownerRepo}`}
                      >
                        {pending === `i:${entry.ownerRepo}`
                          ? t('chat.copy.installing_8d278823')
                          : t('chat.copy.install_fd6c3ebf')}
                      </PanelButton>
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
            <PanelEmptyState
              icon="i-ph:sparkle"
              title={t('chat.copy.noCommunitySkillsMatchQuery_4c1d9a2e', { value0: query })}
            />
          )}
        </section>
      ) : null}
    </div>
  );
}

/** Shared list of installed GitHub-repo skills with toggle + confirm-uninstall + chevron detail. */
/** The append-only skill audit journal for the project scope (RPL-SK-001.3). */
function SkillAuditLog({ events }: { events: SkillAuditEvent[] }) {
  const { t, i18n } = useTranslation();
  const language = resolvedBaseChatLanguage(i18n);
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
        {t('chat.copy.auditLog_3cfc5f1c')}
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
                {formatBaseChatAstDateTime(language, event.createdAt)}
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
  const { t } = useTranslation();
  const verdict = skill.revokedAt ? 'revoked' : (skill.auditVerdict ?? null);

  /* UNIF lot 4 (audit point 4) — les tags skills passent par le Badge commun `ui/Badge`. */
  const verdictVariant: Record<string, 'success' | 'warning' | 'danger'> = {
    approved: 'success',
    quarantined: 'warning',
    rejected: 'danger',
    revoked: 'danger',
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
        <Badge
          size="sm"
          variant={verdictVariant[verdict] ?? 'secondary'}
          icon={verdictIcon[verdict] ?? 'i-ph:shield'}
          className="font-medium capitalize"
          title={t('chat.copy.securityAuditVerdict_291c3bac')}
        >
          {platformStateLabel(t, verdict)}
        </Badge>
      ) : null}
      {skill.origin ? (
        <Badge
          size="sm"
          variant="secondary"
          icon="i-ph:git-fork"
          className="capitalize"
          title={t('chat.copy.whereThisSkillCameFrom_1f68b118')}
        >
          {skill.origin}
        </Badge>
      ) : null}
      {skill.auditFindings && skill.auditFindings.length ? (
        <span className="text-bolt-elements-textTertiary">
          {t('baseChatAst.skills.findingCount', { count: skill.auditFindings.length })}
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
  const { t, i18n } = useTranslation();
  const language = resolvedBaseChatLanguage(i18n);

  return (
    <div className="grid gap-2">
      <PanelSectionTitle level="group">{title}</PanelSectionTitle>
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
                      title={t('chat.copy.approveThisQuarantinedSkillAndEnable_0a63e78a')}
                    >
                      {pending === `a:${rowKey}` ? '…' : t('chat.copy.approve_7b2c7f14')}
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
                    title={skill.revokedAt ? t('chat.copy.revokedReInstallToReconsider_50d9d496') : undefined}
                  >
                    {pending === `t:${rowKey}`
                      ? '…'
                      : skill.enabled
                        ? t('chat.copy.enabled_df174a3f')
                        : t('chat.copy.disabled_f4f4473d')}
                  </button>

                  {!skill.revokedAt ? (
                    <button
                      type="button"
                      onClick={() => void onRevoke(skill.ownerRepo, scope)}
                      disabled={busy || pending === `r:${rowKey}`}
                      className="rounded-md border border-[var(--vc-ide-accent-error)]/50 px-3 py-1.5 text-xs font-medium text-[var(--vc-ide-accent-error)] transition-colors hover:bg-[var(--vc-ide-accent-error)]/10 disabled:opacity-60"
                      title={t('chat.copy.revokeHardDisableAndKeepFor_cfee988f')}
                    >
                      {pending === `r:${rowKey}` ? '…' : t('chat.copy.revoke_0be72075')}
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
                        {pending === `u:${rowKey}` ? '…' : t('chat.copy.confirm_04a21221')}
                      </button>
                      <button
                        type="button"
                        onClick={() => onConfirm(null)}
                        className="rounded-md border border-bolt-elements-borderColor px-3 py-1.5 text-xs font-medium text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-3"
                      >
                        {t('chat.copy.cancel_77dfd213')}
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onConfirm(rowKey)}
                      className="rounded-md border border-[var(--vc-ide-accent-error)]/50 px-3 py-1.5 text-xs font-medium text-[var(--vc-ide-accent-error)] transition-colors hover:bg-[var(--vc-ide-accent-error)]/10"
                    >
                      {t('chat.copy.uninstall_a735da1d')}
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
                        <dt>{t('chat.copy.contentHash_16586c72')}</dt>
                        <dd className="truncate font-mono" title={skill.contentHash}>
                          {t('chat.copy.sha256_b2d28e41')}
                          {skill.contentHash.slice(0, 16)}…
                        </dd>
                      </>
                    ) : null}
                    {skill.manifestName ? (
                      <>
                        <dt>{t('chat.copy.manifest_e63e4519')}</dt>
                        <dd className="truncate">{skill.manifestName}</dd>
                      </>
                    ) : null}
                    {skill.auditedAt ? (
                      <>
                        <dt>{t('chat.copy.audited_9d320122')}</dt>
                        <dd>{formatBaseChatAstDateTime(language, skill.auditedAt)}</dd>
                      </>
                    ) : null}
                    {skill.revokedAt ? (
                      <>
                        <dt>{t('chat.copy.revoked_85f17ac0')}</dt>
                        <dd className="text-[var(--vc-ide-accent-error)]">
                          {formatBaseChatAstDateTime(language, skill.revokedAt)}
                          {skill.revokeReason ? ` — ${skill.revokeReason}` : ''}
                        </dd>
                      </>
                    ) : null}
                  </dl>

                  {skill.resources && skill.resources.length ? (
                    <div className="mt-1.5 text-[11px] text-bolt-elements-textTertiary">
                      <span className="font-medium">{t('chat.copy.bundledResourcesLoadedOnDemand_afd948a9')}</span>{' '}
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
                            {platformStateLabel(t, finding.severity)}
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
        <PanelEmptyState icon="i-ph:sparkle" title={emptyLabel} />
      )}
    </div>
  );
}

function ProjectPackagesPanel({ data, onSubmit, busy }: { data: any; onSubmit: any; busy: boolean }) {
  const { t, i18n } = useTranslation();
  const language = resolvedBaseChatLanguage(i18n);
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
          <span>{t('chat.copy.packageIntelligence_2bfabe16')}</span>
          <h3>
            {manifests.length
              ? t('chat.copy.value0DependenciesDetected_f8e7ed82', { value0: dependencies.length })
              : t('chat.copy.noPackageManifestDetected_635f4471')}
          </h3>
          <p>{t('chat.copy.eCodeReadsPackageManifestsAnd_43bae185')}</p>
        </div>
        <form onSubmit={onSubmit}>
          <input name="intent" value="install-all" type="hidden" />
          <input name="packageManager" value={packageManager} type="hidden" />
          <PanelButton disabled={busy || !manifests.length}>{t('chat.copy.installFromLockfile_0216ef44')}</PanelButton>
        </form>
      </section>

      <section className="bolt-project-package-manager-card">
        <div className="bolt-project-package-summary-header">
          <div>
            <span>{t('chat.copy.workspacePackageSummary_22202f6b')}</span>
            <strong>{packageManager}</strong>
          </div>
          <small>
            {lockfiles.length
              ? // BUG-QA-I18N-COUNT-002 : « 1 fichier(s) » -> pluriel réel par langue.
                t('chat.copy.value0LockfileSDetected_e2f1f51c', {
                  value0: lockfiles.length,
                  count: lockfiles.length,
                })
              : t('chat.copy.noLockfileDetectedYet_33076d29')}
          </small>
        </div>
        <div className="bolt-project-package-stat-grid">
          <article>
            <span>{t('chat.copy.manifests_7bd7947c')}</span>
            <strong>{manifests.length}</strong>
            <small>
              {packageFiles.length
                ? packageFiles.map((file: any) => file.path).join(', ')
                : t('chat.copy.noPackageJson_75c1100f')}
            </small>
          </article>
          <article>
            <span>{t('chat.copy.indexedFiles_4816e84e')}</span>
            <strong>{data.files?.length ?? 0}</strong>
            <small>{t('chat.copy.projectStoragePlusRuntimePackageFiles_493e5b95')}</small>
          </article>
          <article>
            <span>{t('chat.copy.runtime_c4740e4c')}</span>
            <strong>{platformStateLabel(t, data.workspace?.status ?? 'unknown')}</strong>
            <small>{data.workspace?.runtimeMode ?? t('chat.copy.workspaceCommandRunner_d6e87e0b')}</small>
          </article>
          <article>
            <span>{t('chat.copy.lockfiles_9596c974')}</span>
            <strong>{lockfiles.length}</strong>
            <small>
              {lockfiles.length
                ? lockfiles.map((file: any) => file.path).join(', ')
                : t('chat.copy.installWillCreateOne_f12e5457')}
            </small>
          </article>
        </div>
      </section>

      <section
        className="bolt-project-package-actions"
        aria-label={t('chat.copy.packageInstallAndMaintenanceActions_7e7d15e6')}
      >
        <div className="bolt-project-package-action-header">
          <div>
            <span>{t('chat.copy.addPackage_4db3997e')}</span>
            <h4>{t('chat.copy.installIntoTheRealWorkspace_9aae5ad8')}</h4>
            <p>{t('chat.copy.chooseTheDetectedPackageManagerThen_0f9e0f75')}</p>
          </div>
          <div
            className="bolt-project-package-manager-options"
            role="group"
            aria-label={t('chat.copy.packageManager_a069a02e')}
          >
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
            {t('chat.copy.addPackage_4db3997e')}
            <input
              value={packageInput}
              onChange={(event) => setPackageInput(event.target.value)}
              placeholder={t('chat.copy.scopeNameReactQueryViteLatest_2c453a8a')}
              autoComplete="off"
            />
          </label>
          <label className="bolt-project-package-checkbox">
            <input
              type="checkbox"
              checked={installAsDevDependency}
              onChange={(event) => setInstallAsDevDependency(event.target.checked)}
            />
            {t('chat.copy.devDependency_77dacb21')}
          </label>
          <PanelButton disabled={busy || !packageInput.trim()}>{t('chat.copy.installPackage_cb1fe356')}</PanelButton>
        </form>
        <div className="bolt-project-package-command-row" aria-label={t('chat.copy.packageHealthChecks_f1ef1cd6')}>
          <form onSubmit={onSubmit}>
            <input name="intent" value="audit" type="hidden" />
            <input name="packageManager" value={packageManager} type="hidden" />
            <PanelButton variant="outline" disabled={busy || !manifests.length}>
              {t('chat.copy.runSecurityAudit_2cc855d6')}
            </PanelButton>
          </form>
          <form onSubmit={onSubmit}>
            <input name="intent" value="outdated" type="hidden" />
            <input name="packageManager" value={packageManager} type="hidden" />
            <PanelButton variant="outline" disabled={busy || !manifests.length}>
              {t('chat.copy.checkOutdated_5f9aa679')}
            </PanelButton>
          </form>
        </div>
      </section>

      <section className="bolt-project-package-content">
        <div>
          <div className="bolt-project-panel-toolbar">
            <label>
              {t('chat.copy.filterInstalledPackages_40f3effe')}
              <PanelInput
                size="sm"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t('chat.copy.searchNameVersionManifestScope_c42b6712')}
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
              <PanelEmptyState
                icon="i-ph:cube"
                title={
                  dependencies.length
                    ? t('chat.copy.noInstalledPackageMatchesThisFilter_e346163e')
                    : t('chat.copy.noDependenciesFoundInPackageJson_8f3d26bd')
                }
              />
            )}
          </div>
        </div>

        <aside className="bolt-project-package-sidebar">
          <div>
            <h4>{t('chat.copy.manifests_7bd7947c')}</h4>
            {manifests.length ? (
              manifests.map((manifest: any) => (
                <article key={manifest.path}>
                  <strong>{manifest.name}</strong>
                  <span>{manifest.path}</span>
                  <small>
                    {t('baseChatAst.counts.dependencies', {
                      prod: manifest.dependencyCount,
                      dev: manifest.devDependencyCount,
                    })}
                  </small>
                </article>
              ))
            ) : (
              <p>{t('chat.copy.noPackageJsonHasBeenIndexed_1523ebeb')}</p>
            )}
          </div>
          <div>
            <h4>{t('chat.copy.installRuntimeChecks_5fcca529')}</h4>
            {runs.length ? (
              runs.map((run: any) => {
                const failed = run.status === 'failed' || (run.exitCode != null && run.exitCode !== 0);
                const outputTail = typeof run.output === 'string' ? run.output.trim().slice(-1200) : '';

                return (
                  <article key={run.id}>
                    <strong>{run.name}</strong>
                    <span className={failed ? 'text-bolt-elements-icon-error' : 'text-bolt-elements-icon-success'}>
                      {t('baseChatAst.phrases.runOutcome', {
                        status: failed ? t('chat.copy.failed_5f5f8758') : t('chat.copy.succeeded_88c2e0b3'),
                        code: run.exitCode ?? 0,
                      })}
                    </span>
                    <small>{run.script}</small>
                    {outputTail ? (
                      <pre
                        className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-md bg-bolt-elements-background-depth-3 p-2 text-[11px] leading-snug text-bolt-elements-textSecondary"
                        aria-label={t('chat.copy.value0Output_4e0948e7', { value0: run.name })}
                      >
                        {outputTail}
                      </pre>
                    ) : null}
                    <small>{run.finishedAt ? formatBaseChatAstDateTime(language, run.finishedAt) : ''}</small>
                  </article>
                );
              })
            ) : (
              <p>{t('chat.copy.installAPackageOrRunAudit_619e2f89')}</p>
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
  const { t } = useTranslation();
  const ports = runtimePortsFromPayload(data);
  const portsState = data.portsState ?? {};
  const primaryPort = portsState.primaryPort;
  const visibility: Record<string, string> = portsState.visibility ?? {};

  return (
    <div className="bolt-project-managed-panel bolt-project-ports-panel">
      <section className="grid gap-3">
        <p className="text-xs text-bolt-elements-textSecondary">
          {t('chat.copy.portsOpenedByTheRunningWorkspace_ef815c2c')}
        </p>

        {ports.length ? (
          <div className="grid gap-2">
            {ports.map((entry) => {
              const portNumber = entry.port;
              const isPrimary = primaryPort != null && Number(primaryPort) === Number(portNumber);
              const vis = visibility[String(portNumber)] ?? t('chat.copy.public_61c9b2b1');

              return (
                <div
                  key={String(portNumber)}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-bolt-elements-borderColor px-3 py-2 text-xs"
                >
                  <div className="min-w-0">
                    <strong className="text-bolt-elements-textPrimary">
                      :{portNumber}
                      {isPrimary ? t('chat.copy.primary_f37ab377') : ''}
                    </strong>
                    <span
                      className={`ml-2 ${entry.ready ? 'text-[var(--status-success-text)]' : 'text-[var(--status-warning-text)]'}`}
                    >
                      {entry.ready ? t('chat.copy.ready_75c05337') : t('chat.copy.starting_9493af05')}
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
                        {t('chat.copy.openPreview_7a3aa872')}
                      </a>
                    ) : null}
                    <form onSubmit={onSubmit}>
                      <input type="hidden" name="intent" value="set-primary" />
                      <input type="hidden" name="port" value={String(portNumber)} />
                      <button type="submit" disabled={busy || isPrimary}>
                        {isPrimary ? t('chat.copy.primary_a9a96ec0') : t('chat.copy.setPrimary_582333f3')}
                      </button>
                    </form>
                    <form onSubmit={onSubmit}>
                      <input type="hidden" name="intent" value="set-visibility" />
                      <input type="hidden" name="port" value={String(portNumber)} />
                      <input type="hidden" name="visibility" value={vis === 'public' ? 'private' : 'public'} />
                      <button type="submit" disabled={busy || !projectId}>
                        {vis === 'public' ? t('chat.copy.makePrivate_df1b5c0a') : t('chat.copy.makePublic_012e4893')}
                      </button>
                    </form>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <PanelEmptyState icon="i-ph:plugs" title={t('chat.copy.noPortsDetectedYetStartYour_3bba07f1')} />
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
  ACCEPTED: 'chat.copy.accepted_61a0572c',
  REJECTED: 'chat.copy.rejected_27eeb7a2',
  PARTIAL: 'chat.copy.partial_65de2e2a',
  ABSTAINED: 'chat.copy.abstained_4b9d7cf5',
};

const CONSENSUS_OUTCOME_CLASS: Record<string, string> = {
  ACCEPTED: 'text-[var(--status-success-text)] border-[var(--status-success-border)]',
  REJECTED: 'text-[var(--status-error-text)] border-[var(--status-error-border)]',
  PARTIAL: 'text-[var(--status-warning-text)] border-[var(--status-warning-border)]',
  ABSTAINED: 'text-bolt-elements-textSecondary border-bolt-elements-borderColor',
};

const CONSENSUS_ALGORITHM_LABEL: Record<string, string> = {
  QUORUM: 'chat.copy.quorum_fdaafe2d',
  BYZANTINE_PBFT: 'chat.copy.byzantinePbft_95a6d828',
  WEIGHTED_PLURALITY: 'chat.copy.weightedPlurality_f4ca4c45',
};

function AgentConsensusOutcomeBadge({ outcome }: { outcome: string }) {
  const { t } = useTranslation();
  const label = CONSENSUS_OUTCOME_LABEL[outcome] ?? outcome;

  const className =
    CONSENSUS_OUTCOME_CLASS[outcome] ?? 'text-bolt-elements-textSecondary border-bolt-elements-borderColor';

  return <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${className}`}>{t(label)}</span>;
}

function formatConsensusScore(t: TFunction, score: number) {
  if (!Number.isFinite(score)) {
    return '—';
  }

  // Scores are 0–1 agreement ratios; show as a percentage.
  return t('chat.copy.consensusAgreement', { value: Math.round(Math.max(0, Math.min(1, score)) * 100) });
}

function formatConsensusAlgorithm(t: TFunction, algorithm: string) {
  return t(CONSENSUS_ALGORITHM_LABEL[algorithm] ?? algorithm);
}

function formatConsensusDuration(language: string, durationMs: number) {
  if (!Number.isFinite(durationMs) || durationMs < 0) {
    return '—';
  }

  if (durationMs < 1000) {
    return `${formatBaseChatAstNumber(language, Math.round(durationMs))} ms`;
  }

  return `${formatBaseChatAstNumber(language, durationMs / 1000, {
    minimumFractionDigits: durationMs < 10_000 ? 1 : 0,
    maximumFractionDigits: durationMs < 10_000 ? 1 : 0,
  })} s`;
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
  architect: 'chat.copy.architect_16639cf7',
  frontend: 'chat.copy.frontend_152d1cf2',
  backend: 'chat.copy.backend_e758ca64',
  devops: 'chat.copy.devops_7f3f11f5',
  qa: 'chat.copy.qa_d851aefa',
};

function consensusLaneLabel(t: TFunction, roleId: string): string {
  return t(CONSENSUS_LANE_LABEL[roleId] ?? roleId);
}

/** A row of lane chips (supporters / dissenters / abstainers) for one claim. */
function ConsensusLaneChips({ label, roles, tone }: { label: string; roles: string[]; tone: string }) {
  const { t } = useTranslation();

  if (roles.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className="text-[11px] uppercase tracking-wide text-bolt-elements-textSecondary">{label}</span>
      {roles.map((role) => (
        <span key={role} className={`rounded-full border px-1.5 py-0.5 text-[11px] ${tone}`}>
          {consensusLaneLabel(t, role)}
        </span>
      ))}
    </div>
  );
}

const CONSENSUS_DECISION_CLASS: Record<string, string> = {
  accepted: 'text-[var(--status-success-text)]',
  rejected: 'text-[var(--status-error-text)]',
  inconclusive: 'text-[var(--status-warning-text)]',
};

const CONSENSUS_SEVERITY_CLASS: Record<string, string> = {
  high: 'text-[var(--status-error-text)] border-[var(--status-error-border)]',
  medium: 'text-[var(--status-warning-text)] border-[var(--status-warning-border)]',
  low: 'text-bolt-elements-textSecondary border-bolt-elements-borderColor',
};

/**
 * The real per-agent vote for one consensus run: each claim with the lanes that
 * supported / dissented / abstained, the inter-lane conflicts, and the merged
 * consolidated summary. Renders the persisted ConsensusRecord detail.
 */
function ConsensusVoteDetail({ detail }: { detail: ConsensusRecordDetailView }) {
  const { t } = useTranslation();
  return (
    <>
      <div>
        <PanelSectionTitle level="group">
          {t('chat.copy.vote_f3f11c36')}
          {detail.claimVotes.length}{' '}
          {detail.claimVotes.length === 1 ? t('chat.copy.claim_013872e3') : t('chat.copy.claims_d72041bc')}
        </PanelSectionTitle>
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
                    {Math.round(Math.max(0, Math.min(1, vote.agreementRatio)) * 100)}
                    {t('chat.copy.agreement_fc61aa8b')}
                  </span>
                </div>
                <p className="mt-1 text-xs text-bolt-elements-textPrimary">{vote.claim}</p>
                <div className="mt-1.5 space-y-1">
                  <ConsensusLaneChips
                    label={t('chat.copy.for_f7880600')}
                    roles={vote.supporters}
                    tone="text-[var(--status-success-text)] border-[var(--status-success-border)]"
                  />
                  <ConsensusLaneChips
                    label={t('chat.copy.against_2d19e3d7')}
                    roles={vote.dissenters}
                    tone="text-[var(--status-error-text)] border-[var(--status-error-border)]"
                  />
                  <ConsensusLaneChips
                    label={t('chat.copy.abstain_bc39d849')}
                    roles={vote.abstainers}
                    tone="text-bolt-elements-textSecondary border-bolt-elements-borderColor"
                  />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-xs text-bolt-elements-textSecondary">
            {t('chat.copy.noIndividualClaimsWereVotedOn_b957dd3e')}
          </p>
        )}
      </div>

      {detail.conflicts.length ? (
        <div>
          <PanelSectionTitle level="group">
            {t('chat.copy.conflicts_19401428')}
            {detail.conflicts.length}
          </PanelSectionTitle>
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
                    ({conflict.involvedRoles.map((roleId: string) => consensusLaneLabel(t, roleId)).join(', ')})
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {detail.consolidated && detail.consolidated.summary ? (
        <div>
          <PanelSectionTitle level="group">{t('chat.copy.consolidated_067fc063')}</PanelSectionTitle>
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
  const { t, i18n } = useTranslation();
  const language = resolvedBaseChatLanguage(i18n);
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
        console.warn('Agent Studio memory request failed', {
          status: memoriesResponse.status,
          serverError: payload.error,
        });
        setMemoryError(t('baseChatAst.memory.loadFailedHttp', { status: memoriesResponse.status }));

        return;
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
      console.error('Agent Studio memory request failed', error);
      setMemoryError(t('baseChatAst.memory.loadFailed'));
    }
  }, [projectId, t]);

  useEffect(() => {
    void loadMemory();
  }, [loadMemory]);

  const branchCount = conversations.length;

  const metrics = [
    [
      t('baseChatAst.agentStudio.pendingChanges'),
      formatBaseChatAstNumber(language, pendingProposals.length),
      pendingProposals.length ? t('baseChatAst.agentStudio.awaitingReview') : t('baseChatAst.agentStudio.noReview'),
    ],
    [
      t('baseChatAst.agentStudio.recordedProposals'),
      formatBaseChatAstNumber(language, serverProposalCount),
      t('baseChatAst.agentStudio.openProposals'),
    ],
    [
      t('baseChatAst.agentStudio.selfRepair'),
      formatBaseChatAstNumber(language, repairEventsCount),
      repairEventsCount ? t('baseChatAst.agentStudio.repairActivity') : t('baseChatAst.agentStudio.noRepair'),
    ],
    [
      t('baseChatAst.agentStudio.multiAgent'),
      formatBaseChatAstNumber(language, consensusRecords.length),
      consensusRecords.length ? t('baseChatAst.agentStudio.consensusLogged') : t('baseChatAst.agentStudio.noConsensus'),
    ],
    [
      t('baseChatAst.agentStudio.branches'),
      formatBaseChatAstNumber(language, branchCount),
      branchCount ? t('baseChatAst.agentStudio.archivedThreads') : t('baseChatAst.agentStudio.noBranches'),
    ],
    [
      t('baseChatAst.agentStudio.memories'),
      memory ? formatBaseChatAstNumber(language, memory.total) : '—',
      memory
        ? memory.enabled
          ? t('baseChatAst.agentStudio.memoryEnabled')
          : t('baseChatAst.agentStudio.memoryDisabled')
        : t('chat.copy.loading_33ce4174'),
    ],
  ] as const;

  return (
    <div className="bolt-project-monitoring-panel" aria-label={t('chat.copy.agentStudioSupervisor_fc1ab50e')}>
      <div className="bolt-project-panel-toolbar">
        <PanelButton type="button" variant="outline" size="sm" onClick={() => void reload?.()} disabled={busy}>
          {busy ? t('chat.copy.refreshing_505dddc9') : t('chat.copy.refresh_56e3badc')}
        </PanelButton>
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
        aria-label={t('chat.copy.pendingAiChanges_69a074a3')}
      >
        <PanelSectionTitle className="mb-2">{t('chat.copy.pendingAiChanges_69a074a3')}</PanelSectionTitle>
        {pendingProposals.length ? (
          <AgentPatchReviewQueue proposals={pendingProposals} />
        ) : (
          <p className="text-sm text-bolt-elements-textSecondary">{t('chat.copy.noAiChangesAreWaitingFor_625a8e45')}</p>
        )}
      </section>

      {projectId ? (
        <section className="mt-3" aria-label={t('chat.copy.selfRepairHistory_79447f7a')}>
          <AgentRepairHistory projectId={projectId} />
        </section>
      ) : null}

      <section
        className="mt-3 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-3"
        aria-label={t('chat.copy.multiAgentConsensus_6ab6c619')}
      >
        <PanelSectionTitle className="mb-2">
          {t('chat.copy.multiAgentConsensus_6ab6c619')}
          <span className="ml-2 rounded-full bg-bolt-elements-background-depth-3 px-2 py-0.5 text-xs text-bolt-elements-textSecondary">
            {consensusRecords.length}
          </span>
        </PanelSectionTitle>
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
                      {formatConsensusScore(t, record.agreementScore)}
                    </span>
                    <span className="text-xs text-bolt-elements-textSecondary">
                      {formatConsensusAlgorithm(t, record.algorithm)}
                    </span>
                    <span className="text-xs text-bolt-elements-textSecondary">
                      {record.roundCount}{' '}
                      {record.roundCount === 1 ? t('chat.copy.round_f0590a6d') : t('chat.copy.rounds_75a7b395')}
                    </span>
                    <span className="text-xs text-bolt-elements-textSecondary">
                      {formatConsensusDuration(language, record.durationMs)}
                    </span>
                    <span className="ml-auto text-xs text-bolt-elements-textSecondary" title={record.createdAt}>
                      {timeAgo(t, language, record.createdAt)}
                    </span>
                  </button>

                  {expanded ? (
                    <div className="mt-2 space-y-3 border-l-2 border-bolt-elements-borderColor pl-3">
                      {detail === 'loading' || detail === undefined ? (
                        <p className="text-xs text-bolt-elements-textSecondary">
                          {t('chat.copy.loadingTheVote_56f791d9')}
                        </p>
                      ) : detail === 'error' ? (
                        <p className="text-xs text-[var(--status-error-text)]">
                          {t('chat.copy.couldNotLoadTheConsensusDetail_862d66ca')}
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
            {t('chat.copy.noMultiAgentConsensusRunsRecorded_333b707f')}
          </p>
        )}
      </section>

      <section
        className="mt-3 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-3"
        aria-label={t('chat.copy.conversationBranches_ab9b421a')}
      >
        <PanelSectionTitle className="mb-2">
          {t('chat.copy.conversationBranches_ab9b421a')}
          <span className="ml-2 rounded-full bg-bolt-elements-background-depth-3 px-2 py-0.5 text-xs text-bolt-elements-textSecondary">
            {branchCount}
          </span>
        </PanelSectionTitle>
        {branchCount ? (
          <ul className="divide-y divide-bolt-elements-borderColor">
            {/*
             * DÉFAUT RÉEL, pas seulement de typage : `flatMap` passe l'INDICE en
             * deuxième argument. Le paramètre s'appelant `depth`, chaque branche
             * racine recevait sa position comme profondeur — la 2e racine était
             * décalée de 12 px, la 3e de 24 px, comme si elles étaient imbriquées
             * les unes dans les autres. L'enveloppe force `depth = 0` à la
             * racine ; c'est aussi ce que disait TS2684, masqué par `@ts-nocheck`.
             */}
            {tree.flatMap((rootNode) =>
              (function flatten(node: (typeof tree)[number], depth: number): React.ReactNode[] {
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
                      {t('baseChatAst.counts.messages', { count: node.conversation.messages.length })}
                    </span>
                  </li>,
                  ...node.children.flatMap((child) => flatten(child, depth + 1)),
                ];
              })(rootNode, 0),
            )}
          </ul>
        ) : (
          <p className="text-sm text-bolt-elements-textSecondary">
            {t('chat.copy.noArchivedConversationBranchesForThis_d64f39a6')}
          </p>
        )}
      </section>

      <section
        className="mt-3 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-3"
        aria-label={t('chat.copy.agentMemory_bcf5354f')}
      >
        <PanelSectionTitle className="mb-2">{t('chat.copy.agentMemory_bcf5354f')}</PanelSectionTitle>
        {memoryError ? (
          <p className="text-sm text-[var(--status-error-text)]">{memoryError}</p>
        ) : !memory ? (
          <p className="text-sm text-bolt-elements-textSecondary">{t('chat.copy.loadingAgentMemory_947414eb')}</p>
        ) : memory.recent.length === 0 ? (
          <p className="text-sm text-bolt-elements-textSecondary">
            {t('chat.copy.noAgentMemoriesRecordedForThis_538bbffe')}
          </p>
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
  /*
   * `i18n` was missing here while the body already called
   * `formatBaseChatAstDateTime(language, …)` and `formatBaseChatAstNumber(language, …)`
   * in five places — so the panel threw `ReferenceError: language is not defined`
   * on every render and the Monitoring tab crashed 100 % of the time
   * (BUG-QA-MONITORING-CRASH-001). The sibling components below already resolve
   * it exactly this way.
   */
  const { t, i18n } = useTranslation();
  const language = resolvedBaseChatLanguage(i18n);
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

  const workspaceLabel = runtimeStatusText(t, {
    workspaceStatus: workspace,
    ports: runtimePorts,
    workspaceLoading: Boolean(workspace && !workspace.status),
    workspaceError: workspace?.error,
  });

  const lastDeployment = deployments[0];

  const lastDeploymentDetail = lastDeployment
    ? `${platformStateLabel(t, lastDeployment.status ?? 'unknown')}${
        lastDeployment.createdAt ? ` · ${formatBaseChatAstDateTime(language, lastDeployment.createdAt) ?? ''}` : ''
      }`
    : t('baseChatAst.runtime.noDeployment');

  const metrics = [
    [
      t('baseChatAst.monitoring.workspace'),
      workspaceLabel,
      workspace?.runtimeMode ?? t('baseChatAst.runtime.noSession'),
    ],
    [
      t('baseChatAst.monitoring.deployments'),
      formatBaseChatAstNumber(language, deployments.length),
      lastDeploymentDetail,
    ],
    [
      t('baseChatAst.monitoring.userEvents'),
      formatBaseChatAstNumber(language, userFacingEvents.length),
      t('baseChatAst.runtime.routineHidden', { count: hiddenRoutineCount, window: windowSize }),
    ],
    [
      t('baseChatAst.monitoring.trackedFiles'),
      formatBaseChatAstNumber(language, data.files?.length ?? 0),
      t('baseChatAst.monitoring.window', { window: windowSize }),
    ],
  ] as const;

  return (
    <div className="bolt-project-monitoring-panel">
      <div className="bolt-project-panel-toolbar">
        {/* UNIF lot 7 — le sélecteur de plage passe au FilterChip commun (aria-pressed + accent action). */}
        {(['15m', '1h', '24h'] as const).map((item) => (
          <FilterChip key={item} label={item} active={windowSize === item} onClick={() => setWindowSize(item)} />
        ))}
        <PanelButton type="button" variant="outline" size="sm" onClick={() => void reload?.()} disabled={busy}>
          {busy ? t('chat.copy.refreshing_505dddc9') : t('chat.copy.refreshMetrics_d4cc03bc')}
        </PanelButton>
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
        emptyLabel={t('baseChatAst.runtime.noEventsWindow')}
      />
      <PanelRows
        rows={userFacingEvents
          .slice(0, 12)
          .map((event: any) => [
            formatProjectActivityAction(t, event.action ?? 'project.activity'),
            event.createdAt
              ? (formatBaseChatAstDateTime(language, event.createdAt) ?? t('baseChatAst.runtime.recordedByApi'))
              : t('baseChatAst.runtime.recordedByApi'),
          ])}
        empty={t('baseChatAst.runtime.noEvents')}
      />
      {hiddenRoutineCount > 0 ? (
        <div className="bolt-project-monitoring-routine-note" role="note">
          {/*
           * BUG-QA-I18N-COUNT-002 : compteur et libellé étaient adjacents (donc
           * collés), et le pluriel était fabriqué en ajoutant un « s » ANGLAIS à
           * une chaîne traduite — « événement interne de routines ». Une clé
           * plurielle par langue règle les deux.
           */}
          {t('baseChatAst.monitoring.hiddenRoutine', { count: hiddenRoutineCount })}
          <code>project.ide_state.*</code>
          {t('chat.copy.openTheLogsPanelToInspect_cc12758f')}
        </div>
      ) : null}
    </div>
  );
}

function ProjectMonitoringDeploymentTimeline({ deployments }: { deployments: any[] }) {
  const { t, i18n } = useTranslation();
  const language = resolvedBaseChatLanguage(i18n);
  const visible = deployments.slice(0, 24);

  if (visible.length === 0) {
    return (
      <section className="bolt-project-monitoring-timeline" aria-label={t('chat.copy.deploymentHistory_2312352b')}>
        <header>
          <strong>{t('chat.copy.deployments_8d458ed0')}</strong>
          <small>{t('chat.copy.noDeploymentRecordedForThisProject_8c58faca')}</small>
        </header>
      </section>
    );
  }

  const width = 100;
  const barWidth = width / visible.length;

  return (
    <section className="bolt-project-monitoring-timeline" aria-label={t('chat.copy.deploymentHistory_2312352b')}>
      <header>
        <strong>{t('chat.copy.deployments_8d458ed0')}</strong>
        <small>{t('baseChatAst.counts.lastDeployments', { count: visible.length })}</small>
      </header>
      <svg
        viewBox={`0 0 ${width} 20`}
        preserveAspectRatio="none"
        role="img"
        aria-label={t('chat.copy.deploymentStatusTimeline_33142e05')}
      >
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
                {platformStateLabel(t, deployment.status ?? 'unknown') +
                  (deployment.provider ? ` · ${deployment.provider}` : '') +
                  (deployment.createdAt ? ` · ${formatBaseChatAstDateTime(language, deployment.createdAt) ?? ''}` : '')}
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
  const { t, i18n } = useTranslation();
  const language = resolvedBaseChatLanguage(i18n);
  const [zoomLevel, setZoomLevel] = useState<'fit' | '2x' | '4x'>('fit');

  if (events.length === 0) {
    return (
      <section className="bolt-project-monitoring-sparkline" aria-label={t('chat.copy.activityRate_d137b2cc')}>
        <header>
          <strong>{t('chat.copy.activityRate_d137b2cc')}</strong>
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
        ? (formatBaseChatAstTime(language, timestamp, { hour: '2-digit', minute: '2-digit' }) ?? '')
        : (formatBaseChatAstDateTime(language, timestamp, {
            month: 'short',
            day: '2-digit',
            hour: '2-digit',
          }) ?? '');

    return `${formatBucketTime(bucketStart)}-${formatBucketTime(bucketEnd)}`;
  });
  const chartData = {
    labels,
    datasets: [
      {
        label: t('chat.copy.events_c5497bca'),
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
          title: (items: any[]) => items[0]?.label ?? t('baseChatAst.monitoring.bucket'),
          label: (item: any) => t('baseChatAst.monitoring.eventCount', { count: Number(item.raw) }),
        },
      },
    },
    scales: {
      x: {
        title: {
          display: true,
          text: t('chat.copy.time_6c82e6dd'),
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
          text: t('chat.copy.count_66e12969'),
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
    <section className="bolt-project-monitoring-sparkline" aria-label={t('chat.copy.activityRate_d137b2cc')}>
      <header>
        <div>
          <strong>{t('chat.copy.activityRate_d137b2cc')}</strong>
          <small>
            {t('baseChatAst.counts.eventsShown', {
              shown: formatBaseChatAstNumber(language, visibleEvents.length),
              count: events.length,
            })}{' '}
            ·{' '}
            {t('baseChatAst.counts.bucketsPeak', {
              count: buckets,
              peak: formatBaseChatAstNumber(language, max),
            })}
          </small>
        </div>
        {/* UNIF-14 — le zoom du graphe (fit/2x/4x) passe au FilterChip commun, comme la fenêtre 15m/1h/24h. */}
        <div className="bolt-project-monitoring-zoom" aria-label={t('chat.copy.activityChartZoom_3789999d')}>
          {(['fit', '2x', '4x'] as const).map((level) => (
            <FilterChip
              key={level}
              label={level === 'fit' ? t('chat.copy.fit_dab564d8') : level}
              active={zoomLevel === level}
              onClick={() => setZoomLevel(level)}
            />
          ))}
        </div>
      </header>
      <div
        className="bolt-project-monitoring-chart"
        role="img"
        aria-label={t('chat.copy.activityEventsByTimeBucket_49ff7752')}
      >
        <ClientOnly fallback={<div className="bolt-project-chart-loading">{t('chat.copy.loadingChart_f9755ad2')}</div>}>
          {() => <Bar data={chartData} options={chartOptions} />}
        </ClientOnly>
      </div>
    </section>
  );
}

function ProjectExtensionsPanel({ data, onSubmit, busy }: { data: any; onSubmit: any; busy: boolean }) {
  const { t } = useTranslation();

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
          <strong>{t('chat.copy.extensions_656bcfe2')}</strong>
          <span>{t('chat.copy.installMcpServersToExtendThe_2040a281')}</span>
        </div>
        <div className="bolt-project-extensions-summary" aria-label={t('chat.copy.installedExtensionSummary_16466bd6')}>
          <strong>{installs.length}</strong>
          <span>{t('chat.copy.installed_85841abd')}</span>
        </div>
      </header>

      <div className="bolt-project-panel-toolbar">
        <label>
          {t('chat.copy.searchTheMcpMarketplace_48179a04')}
          <PanelInput
            size="sm"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('chat.copy.nameAuthorTagOrCapability_a6726d8f')}
          />
        </label>
        {/* UNIF lot 7 — pilules de domaine sur le FilterChip commun (aria-pressed + accent action). */}
        <div
          className="bolt-project-extension-categories"
          role="group"
          aria-label={t('chat.copy.extensionDomains_abc98b01')}
        >
          {domains.map((item) => (
            <FilterChip
              key={item}
              label={item === 'All' ? t('chat.copy.all_6a720856') : String(item).replace(/_/g, ' ').toLowerCase()}
              active={domain === item}
              onClick={() => setDomain(item)}
            />
          ))}
        </div>
      </div>

      <section className="bolt-project-installed-extensions" aria-label={t('chat.copy.installedExtensions_749ba7d5')}>
        <div className="bolt-project-section-heading">
          <strong>{t('chat.copy.installed_7bb4405c')}</strong>
          <span>{t('chat.copy.enableDisableOrRemoveExtensionsWithout_fd2603b1')}</span>
        </div>
        {installs.length ? (
          <div className="bolt-project-extension-catalog installed">
            {installs.map((install) => (
              <article key={install.id} className="bolt-project-extension-card" data-enabled={install.enabled}>
                <div>
                  <strong>{install.catalogEntry?.name ?? install.alias}</strong>
                  <span>
                    {t('baseChatAst.phrases.authorVersion', {
                      // « MCP » est un acronyme de protocole : le catalogue le « traduisait » en « PCM ».
                      author: install.catalogEntry?.author ?? 'MCP',
                      version: install.catalogEntry?.version ?? '1',
                    })}
                  </span>
                </div>
                <p>
                  {install.catalogEntry?.description ?? t('chat.copy.aliasValue0_e4780a7c', { value0: install.alias })}
                </p>
                <div className="bolt-project-extension-card-footer">
                  <em>{install.enabled ? t('chat.copy.enabled_df174a3f') : t('chat.copy.disabled_f4f4473d')}</em>
                  <form onSubmit={onSubmit}>
                    <input name="installId" value={install.id} type="hidden" />
                    <input name="extensionAction" value={install.enabled ? 'disable' : 'enable'} type="hidden" />
                    <PanelButton disabled={busy} variant="outline">
                      {install.enabled ? t('chat.copy.disable_9a7d4e06') : t('chat.copy.enable_20063ad9')}
                    </PanelButton>
                  </form>
                  <form onSubmit={onSubmit}>
                    <input name="installId" value={install.id} type="hidden" />
                    <input name="extensionAction" value="remove" type="hidden" />
                    <PanelButton disabled={busy} variant="outline">
                      {t('chat.copy.remove_e963907d')}
                    </PanelButton>
                  </form>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <PanelEmptyState
            icon="i-ph:puzzle-piece"
            title={t('chat.copy.noExtensionsInstalledYetInstallOne_d6597fc4')}
          />
        )}
        {legacyInstalled.length ? (
          <p className="bolt-project-extension-legacy-note">
            {t('chat.copy.legacyWorkspaceExtensionsReadOnly_a2563ac6')}
            {legacyInstalled.join(', ')}
          </p>
        ) : null}
      </section>

      <section aria-label={t('chat.copy.marketplaceExtensions_c006e268')}>
        <div className="bolt-project-section-heading">
          <strong>{t('chat.copy.marketplace_983095c0')}</strong>
          <span>{t('baseChatAst.counts.extensionsShown', { count: visibleCatalog.length })}</span>
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
                      {entry.verified ? t('chat.copy.verified_5de33a87') : ''}
                    </span>
                  </div>
                  <p>{entry.description}</p>
                  <div className="bolt-project-extension-card-footer">
                    <em>
                      {isInstalled
                        ? t('chat.copy.installed_7bb4405c')
                        : t('chat.copy.value0Installs_caea0dc2', { value0: entry.installCount ?? 0 })}
                    </em>
                    <form onSubmit={onSubmit}>
                      <input name="extension" value={entry.slug} type="hidden" />
                      <input name="extensionAction" value="install" type="hidden" />
                      <PanelButton disabled={busy || isInstalled}>
                        {isInstalled ? t('chat.copy.installed_7bb4405c') : t('chat.copy.install_fd6c3ebf')}
                      </PanelButton>
                    </form>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <PanelEmptyState
            icon="i-ph:puzzle-piece"
            title={
              catalog.length
                ? t('chat.copy.noExtensionsMatchTheCurrentSearch_98b63cc6')
                : t('chat.copy.theMcpMarketplaceCatalogIsEmpty_be25c277')
            }
          />
        )}
      </section>
    </div>
  );
}

/** Human duration between a run's start and finish, or null if not finished. */
function formatRunDuration(language: string, startedAt?: string, finishedAt?: string): string | null {
  if (!startedAt || !finishedAt) {
    return null;
  }

  const ms = new Date(finishedAt).getTime() - new Date(startedAt).getTime();

  if (!Number.isFinite(ms) || ms < 0) {
    return null;
  }

  if (ms < 1000) {
    return `${formatBaseChatAstNumber(language, ms)} ms`;
  }

  const seconds = ms / 1000;

  if (seconds < 60) {
    return `${formatBaseChatAstNumber(language, seconds, {
      minimumFractionDigits: seconds < 10 ? 1 : 0,
      maximumFractionDigits: seconds < 10 ? 1 : 0,
    })} s`;
  }

  const minutes = Math.floor(seconds / 60);

  return `${formatBaseChatAstNumber(language, minutes)} min ${formatBaseChatAstNumber(
    language,
    Math.round(seconds % 60),
  )} s`;
}

function ProjectWorkflowsPanel({ data, onSubmit, busy }: { data: any; onSubmit: any; busy: boolean }) {
  const { t, i18n } = useTranslation();
  const language = resolvedBaseChatLanguage(i18n);
  const state = data.workflowsState ?? {};

  const workflows = (state.workflows ?? []).slice().sort((left: any, right: any) => {
    if (left.isGenerated !== right.isGenerated) {
      return left.isGenerated ? -1 : 1;
    }

    return String(left.name ?? '').localeCompare(String(right.name ?? ''), language);
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
          <PanelEmptyState icon="i-ph:git-branch" title={empty} />
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
            {workflow.isRunButton && <em data-kind="run-button">{t('chat.copy.runButton_d1e247ba')}</em>}
            {workflow.isGenerated && <em data-kind="generated">{t('chat.copy.generated_8eefdd52')}</em>}
            {workflow.lastRunStatus && (
              <em data-status={workflow.lastRunStatus}>{platformStateLabel(t, workflow.lastRunStatus)}</em>
            )}
            <form onSubmit={onSubmit} className="bolt-project-workflow-run-now">
              <input type="hidden" name="intent" value="run-workflow" />
              <input type="hidden" name="workflowId" value={workflow.id} />
              <PanelButton
                disabled={busy || workflow.enabled === false}
                data-testid={`workflow-run-now-${workflow.id}`}
              >
                <span className="i-ph:play" aria-hidden />
                {t('chat.copy.runNow_2af00e23')}
              </PanelButton>
            </form>
          </div>
        </header>

        <small>
          {t('baseChatAst.counts.tasks', { count: tasks.length })} ·{' '}
          {workflow.executionMode === 'parallel'
            ? t('chat.copy.parallel_afc12957')
            : t('chat.copy.sequential_0edc0112')}
          {workflow.lastRunAt
            ? t('chat.copy.lastRunValue0_203ff58b', {
                value0: formatBaseChatAstDateTime(language, workflow.lastRunAt) ?? '',
              })
            : ''}
        </small>

        {workflowRuns.length ? (
          <section className="bolt-project-workflow-runs">
            <strong>{t('chat.copy.recentRuns_af7051db')}</strong>
            {workflowRuns.map((run: any) => (
              <details key={run.id} open={run.id === latestRun?.id}>
                <summary>
                  <span data-status={run.status}>{platformStateLabel(t, run.status)}</span>
                  <small>{formatBaseChatAstDateTime(language, run.startedAt)}</small>
                  {formatRunDuration(language, run.startedAt, run.finishedAt) ? (
                    <small className="bolt-project-workflow-run-meta">
                      <span className="i-ph:timer" aria-hidden />{' '}
                      {formatRunDuration(language, run.startedAt, run.finishedAt)}
                    </small>
                  ) : null}
                  <small className="bolt-project-workflow-run-meta">
                    <span className="i-ph:lightning" aria-hidden />{' '}
                    {run.trigger === 'schedule' ? t('chat.copy.scheduled_1cd1bdad') : t('chat.copy.manual_4e836fdc')}
                  </small>
                </summary>
                {Array.isArray(run.steps) && run.steps.length ? (
                  <ol className="bolt-project-workflow-run-steps" data-testid={`run-steps-${run.id}`}>
                    {run.steps.map((step: any, stepIndex: number) => (
                      <li key={`${step.taskId}-${stepIndex}`} data-status={step.status}>
                        <div className="bolt-project-workflow-run-step-head">
                          <span data-status={step.status}>{platformStateLabel(t, step.status)}</span>
                          <code>{step.command || t('chat.copy.noCommand_96ba3230')}</code>
                          {step.exitCode !== null && step.exitCode !== undefined ? (
                            <small>{`${t('chat.copy.exit_de3ac217')} ${step.exitCode}`}</small>
                          ) : null}
                        </div>
                        {step.outputTail ? <pre>{step.outputTail}</pre> : null}
                      </li>
                    ))}
                  </ol>
                ) : (
                  <pre>
                    {(run.logs ?? []).map((log: any) => `[${log.level}] ${log.message}`).join('\n') ||
                      t('chat.copy.noOutputCaptured_6c86d6de')}
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
                  {t('chat.copy.workflow_d7a48414')}
                  <PanelInput name="name" defaultValue={workflow.name} data-testid={`workflow-name-${workflow.id}`} />
                </label>
                <PanelButton disabled={busy}>{t('chat.copy.save_efc007a3')}</PanelButton>
              </form>
              {/* Sequential / Parallel toggle (instant, Replit parity) */}
              <form
                onSubmit={onSubmit}
                className="bolt-project-workflow-mode-toggle"
                role="group"
                aria-label={t('chat.copy.executionMode_cb9e185b')}
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
                  {t('chat.copy.sequential_0edc0112')}
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
                  {t('chat.copy.parallel_afc12957')}
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
                  {t('chat.copy.scheduleCron_dc5dc87e')}
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
                  {t('chat.copy.enabled_df174a3f')}
                </label>
                <PanelButton disabled={busy}>{t('chat.copy.saveSchedule_f2202071')}</PanelButton>
                {workflow.schedule?.enabled && workflow.schedule?.nextRunAt ? (
                  <small className="bolt-project-workflow-nextrun" data-testid={`workflow-nextrun-${workflow.id}`}>
                    {t('chat.copy.nextRun_6c03cbdc')}
                    {formatBaseChatAstDateTime(language, workflow.schedule.nextRunAt)} (
                    {workflow.schedule.timezone ?? t('chat.copy.utc_bdfd4d8d')})
                  </small>
                ) : (
                  <small className="bolt-project-workflow-nextrun">
                    {t('chat.copy.notScheduledEnterACronExpression_4b9e799a')}
                    <code>0 3 * * *</code>
                    {t('chat.copy.andEnableItTheSchedulerWill_c6c6f347')}
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
                    <strong>{t('chat.copy.scheduledRuns_8776dc41')}</strong>
                    <form onSubmit={onSubmit}>
                      <input type="hidden" name="intent" value="run-scheduled-now" />
                      <input type="hidden" name="workflowId" value={workflow.id} />
                      <input type="hidden" name="scheduledTaskId" value={workflow.scheduledTaskId} />
                      <PanelButton disabled={busy} data-testid={`workflow-run-now-${workflow.id}`}>
                        {t('chat.copy.runNow_2af00e23')}
                      </PanelButton>
                    </form>
                  </div>
                  {(workflow.scheduledRuns ?? []).length === 0 ? (
                    <small>{t('chat.copy.noRunsYetTheFirstOne_ba1ed340')}</small>
                  ) : (
                    <ul className="bolt-project-workflow-run-list">
                      {(workflow.scheduledRuns ?? []).map((run: any) => (
                        <li key={run.id} data-testid={`workflow-scheduled-run-${run.id}`} data-status={run.status}>
                          <span className="bolt-project-workflow-run-status">{platformStateLabel(t, run.status)}</span>
                          <span>{formatBaseChatAstDateTime(language, run.startedAt)}</span>
                          <span>
                            {run.durationMs == null
                              ? '—'
                              : t('chat.copy.value0S_659ddab8', {
                                  value0: formatBaseChatAstNumber(language, Math.round(run.durationMs / 100) / 10),
                                })}
                          </span>
                          <span>
                            {run.exitCode == null ? '' : t('chat.copy.exitValue0_2ccaa3a9', { value0: run.exitCode })}
                          </span>
                          <span>
                            {run.trigger === 'manual' ? t('chat.copy.manual_b363713a') : t('chat.copy.cron_02f91914')}
                          </span>
                          <span title={t('chat.copy.billedComputeForThisRun_41d5a36e')}>
                            {run.costCents == null
                              ? ''
                              : `${formatBaseChatAstNumber(language, run.costCents, {
                                  minimumFractionDigits: 4,
                                  maximumFractionDigits: 4,
                                })} ¢`}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {workflow.latestScheduledRun?.logs ? (
                    <details data-testid={`workflow-scheduled-logs-${workflow.id}`}>
                      <summary>
                        {t('chat.copy.logsLatestRun_b1c6c18a')}
                        {platformStateLabel(t, workflow.latestScheduledRun.status)})
                      </summary>
                      <pre className="bolt-project-workflow-run-logs">{workflow.latestScheduledRun.logs}</pre>
                    </details>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="bolt-project-workflow-task-list">
              <div className="bolt-project-workflow-subhead">
                <strong>{t('chat.copy.tasks_090ec5f5')}</strong>
                <span>
                  {workflow.executionMode === 'parallel'
                    ? t('chat.copy.runTogether_8eab02f9')
                    : t('chat.copy.runInOrder_56733fe3')}
                </span>
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
                    aria-label={t('chat.copy.dragToReorder_e7541faf')}
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
                      <option value="shell">{t('chat.copy.executeShellCommand_ded81fd3')}</option>
                      <option value="packages">{t('chat.copy.installPackages_b0907ce4')}</option>
                      <option value="workflow">{t('chat.copy.runWorkflow_f59d958d')}</option>
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
                        <option value={`${packageManager} install`}>{t('chat.copy.all_d87c4480')}</option>
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
                        <option value="">{t('chat.copy.noTargetWorkflow_eb5ef507')}</option>
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
                        placeholder={t('chat.copy.npmRunDev_4eedebe9')}
                        data-testid={`task-command-${task.id}`}
                      />
                    )}
                    <PanelButton disabled={busy}>{t('chat.copy.save_efc007a3')}</PanelButton>
                  </form>
                  {/* Trash (Replit parity). */}
                  <ConfirmSubmitForm
                    onSubmit={onSubmit}
                    title={t('chat.copy.removeThisTask_0eb078df')}
                    description={t('chat.copy.theTaskIsRemovedFromThe_42e10863')}
                    confirmLabel={t('baseChatAst.workflows.removeTask')}
                    className="bolt-project-workflow-task-delete"
                  >
                    <input type="hidden" name="intent" value="delete-task" />
                    <input type="hidden" name="workflowId" value={workflow.id} />
                    <input type="hidden" name="taskId" value={task.id} />
                    {/* UNIF-14 — corbeille de tâche sur le PanelButton commun (danger sm, icône seule). */}
                    <PanelButton
                      variant="danger"
                      size="sm"
                      disabled={busy}
                      aria-label={t('chat.copy.deleteTask_9ad9dc2d')}
                      title={t('chat.copy.deleteTask_9ad9dc2d')}
                    >
                      <span className="i-ph:trash" aria-hidden />
                    </PanelButton>
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
              {!tasks.length && (
                <PanelEmptyState
                  icon="i-ph:list-checks"
                  title={t('chat.copy.noTasksConfiguredForThisWorkflow_e345761c')}
                />
              )}
            </div>

            <div className="bolt-project-workflow-add-task">
              <form onSubmit={onSubmit}>
                <input type="hidden" name="intent" value="add-task" />
                <input type="hidden" name="workflowId" value={workflow.id} />
                <input type="hidden" name="taskType" value="shell" />
                <PanelButton disabled={busy} variant="outline" data-testid={`add-task-${workflow.id}`}>
                  <span className="i-ph:plus" aria-hidden />
                  {t('chat.copy.addTask_24700e60')}
                </PanelButton>
              </form>
            </div>

            <footer>
              <form onSubmit={onSubmit}>
                <input type="hidden" name="intent" value="set-run-button" />
                <input type="hidden" name="workflowId" value={workflow.id} />
                <PanelButton disabled={busy || workflow.isRunButton} variant="outline">
                  {workflow.isRunButton
                    ? t('chat.copy.assignedToRunButton_029605f0')
                    : t('chat.copy.assignToRunButton_8208483f')}
                </PanelButton>
              </form>
              {!workflow.isSystem && (
                <ConfirmSubmitForm
                  onSubmit={onSubmit}
                  title={t('chat.copy.deleteWorkflowValue0_7521eaaf', { value0: workflow.name ?? workflow.id })}
                  description={t('chat.copy.theWorkflowAndItsTasksAre_d3966253')}
                  confirmLabel={t('baseChatAst.workflows.delete')}
                >
                  <input type="hidden" name="intent" value="delete-workflow" />
                  <input type="hidden" name="workflowId" value={workflow.id} />
                  <PanelButton disabled={busy} variant="outline">
                    {t('chat.copy.deleteWorkflow_0edaeb8e')}
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
          <h3>{t('chat.copy.workflows_825ce9e9')}</h3>
          <p>
            {t('chat.copy.projectAutomationRunsAgainstTheActive_bec66266')}
            {workspace?.id ? ` (${workspace.id})` : ''}.
          </p>
        </div>
        {/* UNIF-14 — « New workflow » sur le PanelButton commun (CTA primary). */}
        <PanelButton type="button" onClick={() => setCreateOpen((value) => !value)} data-testid="new-workflow-button">
          <span className="i-ph:plus" aria-hidden />
          {t('chat.copy.newWorkflow_c1418c2d')}
        </PanelButton>
      </header>

      <div className="bolt-project-workflows-toolbar">
        <label>
          <span className="i-ph:magnifying-glass" aria-hidden />
          <input
            placeholder={t('chat.copy.searchForAWorkflow_77008afd')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            data-testid="search-workflows"
          />
        </label>
        <a href="/docs" target="_blank" rel="noreferrer">
          {t('chat.copy.configureWorkflows_20afd690')}
          <span className="i-ph:arrow-square-out" aria-hidden />
        </a>
      </div>

      {createOpen && (
        <form onSubmit={onSubmit} className="bolt-project-workflow-create" data-testid="create-workflow-form">
          <input type="hidden" name="intent" value="create-workflow" />
          <PanelInput
            name="name"
            placeholder={t('chat.copy.myWorkflow_c637a95c')}
            required
            data-testid="workflow-name-input"
          />
          <select name="executionMode" defaultValue="sequential">
            <option value="sequential">{t('chat.copy.sequential_0edc0112')}</option>
            <option value="parallel">{t('chat.copy.parallel_afc12957')}</option>
          </select>
          <PanelInput name="command" placeholder={t('chat.copy.npmRunDev_4eedebe9')} defaultValue="npm run dev" />
          <PanelButton disabled={busy}>{t('chat.copy.createWorkflow_b2c26d5c')}</PanelButton>
        </form>
      )}

      <WorkflowSection
        title={t('chat.copy.agentWorkflows_fb8c5af7')}
        items={agentWorkflows}
        empty={t('baseChatAst.workflows.noAgent')}
      />
      <WorkflowSection
        title={t('chat.copy.myWorkflows_681b11f1')}
        items={userWorkflows}
        empty={t('baseChatAst.workflows.noCustom')}
      />
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
  const { t } = useTranslation();
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
        console.warn('Authentication scaffold request failed', {
          status: response.status,
          serverError: payload.error,
        });
        setResult({
          error: response.ok
            ? t('baseChatAst.authScaffold.failed')
            : t('baseChatAst.authScaffold.failedHttp', { status: response.status }),
        });
      } else {
        setResult({ scaffolded: payload.scaffolded ?? [], skipped: payload.skipped ?? [] });
      }
    } catch (error) {
      console.error('Authentication scaffold request failed', error);
      setResult({ error: t('baseChatAst.authScaffold.unreachable') });
    } finally {
      setBusy(false);
    }
  }, [projectId, t]);

  return (
    <section className="grid gap-2 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <PanelSectionTitle>{t('chat.copy.addAuthentication_2855841d')}</PanelSectionTitle>
          <p className="text-xs text-bolt-elements-textSecondary">
            {t('chat.copy.scaffoldRealEmailPasswordAuthInto_9954f11b')}
            <code>users</code>
            {t('chat.copy.tableMigrationAnExpressSessionJwt_120a5fe5')}
            <code>AUTH_JWT_SECRET</code>
            {t('chat.copy.forYou_c10f85ac')}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void run()}
          disabled={busy || !projectId}
          className="shrink-0 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-3 px-3 py-1.5 text-xs font-medium text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-1 disabled:opacity-60"
        >
          {busy ? t('chat.copy.adding_ffb2e628') : t('chat.copy.addAuthentication_2855841d')}
        </button>
      </div>
      {result?.error ? <p className="text-xs text-bolt-elements-item-contentDanger">{result.error}</p> : null}
      {result && !result.error ? (
        <div className="text-xs text-bolt-elements-textSecondary">
          {result.scaffolded?.length ? (
            <>
              <span className="text-[var(--status-success-text)]">{t('chat.copy.added_0ae84aa1')}</span>{' '}
              <span className="font-mono">{result.scaffolded.join(', ')}</span>
              {t('chat.copy.next_8bbb03ad')}{' '}
              <span className="font-mono">{t('chat.copy.npmIPgBcryptjsJsonwebtokenCookie_479d8370')}</span>
              {t('chat.copy.runTheMigrationThen_e18920e3')}{' '}
              <span className="font-mono">{t('chat.copy.appUseRequireAuthRouter_86b3c0e7')}</span>
              {t('chat.copy.seeAuthReadmeMd_b0365c1e')}
            </>
          ) : (
            <span>
              {t('chat.copy.alreadyScaffoldedAuthFilesAlreadyExist_6ffb7ffc')}
              {result.skipped?.length ? t('chat.copy.value0Files_756fd7e6', { value0: result.skipped.length }) : ''}.
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
  const { t, i18n } = useTranslation();

  /*
   * BUG-IDE-006 — `language` alimente `formatBaseChatAstNumber` quatre fois plus
   * bas dans ce composant, sans jamais avoir été déclaré : la migration i18n a
   * ajouté l'argument aux appels sans ajouter la variable.
   *
   * Le `@ts-nocheck` en tête de fichier masquait les quatre TS2304, et le panneau
   * Intégrations jetait `ReferenceError: language is not defined` AU RENDU —
   * c'est-à-dire qu'il ne s'affichait pas du tout.
   *
   * `ProjectMonitoringPanel` a déjà reçu ce correctif ; celui-ci était resté.
   */
  const language = resolvedBaseChatLanguage(i18n);
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
    description: t(description),
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

  function integrationCategoryLabel(categoryId?: string) {
    const categoryEntry = INTEGRATION_CATEGORIES.find(([id]) => id === categoryId);

    return categoryEntry ? t(categoryEntry[1]) : (categoryId ?? '');
  }

  return (
    <div className="bolt-project-integrations-tool" data-testid="integrations-panel">
      <AddAuthenticationCard projectId={projectId} />
      <header className="bolt-project-integrations-head">
        <div>
          <h3>{t('chat.copy.integrationHub_689b11c8')}</h3>
          <p>{t('chat.copy.connectProjectToolsWebhooksApiKeys_8c15c5e1')}</p>
        </div>
        {/* UNIF-14 — les 3 raccourcis d'en-tête (API keys / Webhooks / Event streaming) sur le PanelButton commun. */}
        <div className="bolt-project-integrations-actions">
          <PanelButton type="button" variant="outline" size="sm" onClick={() => setShowApiKeyForm((value) => !value)}>
            <span className="i-ph:key" aria-hidden />
            {t('chat.copy.apiKeys_e18ffc8d')}
          </PanelButton>
          <PanelButton type="button" variant="outline" size="sm" onClick={() => setShowWebhookForm((value) => !value)}>
            <span className="i-ph:webhooks-logo" aria-hidden />
            {t('chat.copy.webhooks_fdfe2da7')}
          </PanelButton>
          <PanelButton type="button" variant="outline" size="sm" onClick={() => setShowStreamForm((value) => !value)}>
            <span className="i-ph:broadcast" aria-hidden />
            {t('chat.copy.eventStreaming_d053a572')}
          </PanelButton>
        </div>
      </header>

      <div className="bolt-project-integrations-layout">
        <aside className="bolt-project-integrations-sidebar">
          <section>
            <h4>{t('chat.copy.categories_6ccb6007')}</h4>
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
                  <span>{t(label)}</span>
                  <em>{count}</em>
                </button>
              );
            })}
          </section>
          <section>
            <h4>{t('chat.copy.connected_c2f9b7b4')}</h4>
            <strong>{connected.length}</strong>
            <div className="bolt-project-integrations-connected-list">
              {connected.slice(0, 10).map((item) => (
                <button key={item.id} type="button" onClick={() => setSelectedIntegrationId(item.id)}>
                  <span className={item.icon} aria-hidden />
                  <span>{item.name}</span>
                  <i data-status={statusClass(item.status)} />
                </button>
              ))}
              {!connected.length && <small>{t('chat.copy.noConnectedIntegrationsYet_23fcaf4d')}</small>}
            </div>
          </section>
        </aside>

        <main className="bolt-project-integrations-main">
          <div className="bolt-project-integrations-tabs">
            {[
              ['browse', t('baseChatAst.integrations.browse')],
              ['connected', t('chat.copy.connectedValue0_0b1b1081', { value0: connected.length })],
              ['webhooks', t('chat.copy.webhooksValue0_598b5795', { value0: webhooks.length })],
              ['api-keys', t('chat.copy.apiKeysValue0_41fce3bd', { value0: apiKeys.length })],
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
                placeholder={t('chat.copy.searchIntegrations_febbd60d')}
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
                    ? t('chat.copy.value0CurrentlyHasAccessTo_25db6291', { value0: selected.name })
                    : t('chat.copy.beforeYouConnectValue0WillBe_513f1b91', { value0: selected.name })}
                </strong>
                <ul>
                  {integrationPermissions(selected.category).map((permission: string) => (
                    <li key={permission}>
                      <span className="i-ph:check-circle" aria-hidden />
                      {t(permission)}
                    </li>
                  ))}
                </ul>
                <small>
                  {selected.connected
                    ? t('chat.copy.revokingRemovesTheStoredTokenAnd_2da0fa0d')
                    : t('chat.copy.youCanRevokeThisAccessAt_76f2b594')}
                </small>
              </div>
              <form onSubmit={onSubmit}>
                <input type="hidden" name="intent" value={selected.connected ? 'disconnect' : 'connect'} />
                <input type="hidden" name="integrationId" value={selected.id} />
                {selected.connected ? null : (
                  <>
                    <PanelInput
                      name="apiToken"
                      type="password"
                      placeholder={t('chat.copy.apiTokenOauthTokenOrApp_76acb24f')}
                    />
                    <PanelInput
                      name="organization"
                      placeholder={t('chat.copy.organizationOrWorkspace_f81f84d0')}
                      defaultValue={selected.config?.organization ?? ''}
                    />
                  </>
                )}
                <PanelButton disabled={busy} variant={selected.connected ? 'outline' : undefined}>
                  {selected.connected
                    ? t('chat.copy.revokeAccess_094386f6', {})
                    : t('chat.copy.connectValue0_521bd823', { value0: selected.name })}
                </PanelButton>
              </form>
              <PanelRows
                rows={[
                  [
                    t('baseChatAst.common.status'),
                    selected.connected
                      ? platformStateLabel(t, selected.status ?? 'active')
                      : t('baseChatAst.status.notConnected'),
                  ],
                  [
                    t('baseChatAst.integrations.lastSync'),
                    selected.lastSync
                      ? (formatBaseChatAstDateTime(language, selected.lastSync) ?? t('baseChatAst.status.never'))
                      : t('baseChatAst.status.never'),
                  ],
                  [
                    t('baseChatAst.integrations.secretStored'),
                    secretKeys.has(`INTEGRATION_TOKEN_${selected.id.toUpperCase().replace(/[^A-Z0-9_]/g, '_')}`)
                      ? t('baseChatAst.status.yes')
                      : t('baseChatAst.status.noToken'),
                  ],
                ]}
              />
              <PanelButton type="button" variant="outline" size="sm" onClick={() => setSelectedIntegrationId(null)}>
                {t('chat.copy.closeConfiguration_0675f715')}
              </PanelButton>
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
                    {item.connected && (
                      <em data-status={statusClass(item.status)}>{platformStateLabel(t, item.status ?? 'active')}</em>
                    )}
                  </div>
                  <footer>
                    <small>{integrationCategoryLabel(item.category)}</small>
                    {/* UNIF-14 — Connect/Manage de carte sur le PanelButton commun (primary sm) ;
                        c'était le dernier usage des tokens legacy button-primary du hub. */}
                    <PanelButton
                      type="button"
                      size="sm"
                      onClick={() => setSelectedIntegrationId(item.id)}
                      data-testid={`button-connect-${item.id}`}
                    >
                      {item.connected ? t('chat.copy.manage_bf58d17e') : t('chat.copy.connect_b65463cb')}
                    </PanelButton>
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
                      {item.lastSync
                        ? t('chat.copy.lastSyncValue0_f4f23a01', {
                            value0: formatBaseChatAstDateTime(language, item.lastSync) ?? '',
                          })
                        : t('chat.copy.noSyncYet_d2ba97a9')}
                    </small>
                  </div>
                  <form onSubmit={onSubmit}>
                    <input type="hidden" name="intent" value="sync" />
                    <input type="hidden" name="integrationId" value={item.id} />
                    <PanelButton disabled={busy} variant="outline">
                      {t('chat.copy.sync_905f6309')}
                    </PanelButton>
                  </form>
                  <PanelButton
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedIntegrationId(item.id)}
                  >
                    {t('chat.copy.configure_792c81a4')}
                  </PanelButton>
                </article>
              ))}
              {!connected.length && (
                <EmptyState
                  variant="compact"
                  icon="i-ph:plugs-connected"
                  title={t('chat.copy.noConnectedIntegrations_b428bc03')}
                  description={t('chat.copy.connectAServiceToSyncData_643c4e95')}
                  actionLabel={t('baseChatAst.integrations.browse')}
                  onAction={() => setActiveTab('browse')}
                />
              )}
            </section>
          )}

          {activeTab === 'webhooks' && (
            <section className="bolt-project-integrations-list" data-testid="card-webhooks-list">
              <div className="bolt-project-integrations-section-head">
                <div>
                  <strong>{t('chat.copy.webhooks_fdfe2da7')}</strong>
                  <small>{t('chat.copy.outgoingEndpointsPersistedInProjectBackend_e4b52238')}</small>
                </div>
                {/* UNIF-14 — CTA de création sur le PanelButton commun (primary sm, comme « New variable »). */}
                <PanelButton type="button" size="sm" onClick={() => setShowWebhookForm((value) => !value)}>
                  {t('chat.copy.createWebhook_0e738ec3')}
                </PanelButton>
              </div>
              {showWebhookForm && (
                <form onSubmit={onSubmit} className="bolt-project-integrations-form">
                  <input type="hidden" name="intent" value="create-webhook" />
                  <PanelInput name="name" placeholder={t('chat.copy.deploymentNotifications_d741eccf')} required />
                  <PanelInput name="url" placeholder={t('chat.copy.httpsExampleComWebhook_251ba43c')} required />
                  <PanelInput
                    name="secret"
                    type="password"
                    placeholder={t('chat.copy.webhookSigningSecret_4d07255a')}
                  />
                  <PanelInput
                    name="events"
                    placeholder={t('chat.copy.deploySuccessDeployFail_2b41724e')}
                    defaultValue="all"
                  />
                  <PanelButton disabled={busy}>{t('chat.copy.createWebhook_0e738ec3')}</PanelButton>
                </form>
              )}
              {webhooks.map((webhook: any) => (
                <article key={webhook.id} data-testid={`webhook-${webhook.id}`}>
                  <span className="i-ph:webhooks-logo" aria-hidden />
                  <div>
                    <strong>{webhook.name}</strong>
                    <small>{webhook.url}</small>
                    <small>
                      {(webhook.events ?? []).join(', ')} ·{' '}
                      {formatBaseChatAstNumber(language, webhook.successRate ?? 100)}
                      {t('chat.copy.success_319e54bc')}
                    </small>
                  </div>
                  <form onSubmit={onSubmit}>
                    <input type="hidden" name="intent" value="toggle-webhook" />
                    <input type="hidden" name="webhookId" value={webhook.id} />
                    <input type="hidden" name="active" value={webhook.active ? 'false' : 'true'} />
                    <PanelButton disabled={busy} variant="outline">
                      {webhook.active ? t('chat.copy.pause_781961bc') : t('chat.copy.resume_b3bd0b5a')}
                    </PanelButton>
                  </form>
                  <form onSubmit={onSubmit}>
                    <input type="hidden" name="intent" value="delete-webhook" />
                    <input type="hidden" name="webhookId" value={webhook.id} />
                    <PanelButton disabled={busy} variant="outline">
                      {t('chat.copy.delete_f6fdbe48')}
                    </PanelButton>
                  </form>
                </article>
              ))}
              {!webhooks.length && (
                <EmptyState
                  variant="compact"
                  icon="i-ph:webhooks-logo"
                  title={t('chat.copy.noWebhooksConfigured_8cb1dd66')}
                  description={t('chat.copy.sendProjectEventsToAnOutgoing_18c07ece')}
                  actionLabel={t('baseChatAst.integrations.createWebhook')}
                  onAction={() => setShowWebhookForm(true)}
                />
              )}
            </section>
          )}

          {activeTab === 'api-keys' && (
            <section className="bolt-project-integrations-list" data-testid="card-api-keys-list">
              <div className="bolt-project-integrations-section-head">
                <div>
                  <strong>{t('chat.copy.apiKeys_e18ffc8d')}</strong>
                  <small>{t('chat.copy.secretsAreStoredInTheBackend_e0a856a4')}</small>
                </div>
                <PanelButton type="button" size="sm" onClick={() => setShowApiKeyForm((value) => !value)}>
                  {t('chat.copy.createApiKey_b68d55de')}
                </PanelButton>
              </div>
              {showApiKeyForm && (
                <form onSubmit={onSubmit} className="bolt-project-integrations-form">
                  <input type="hidden" name="intent" value="create-api-key" />
                  <PanelInput name="name" placeholder={t('chat.copy.productionApiKey_43fad6cd')} required />
                  <select name="permissions" defaultValue="read,write">
                    <option value="read">{t('chat.copy.readOnly_2a6216ee')}</option>
                    <option value="read,write">{t('chat.copy.readWrite_7c0d355c')}</option>
                    <option value="read,write,admin">{t('chat.copy.admin_4e7afebc')}</option>
                    <option value="read,deploy">{t('chat.copy.deploy_fb4192a0')}</option>
                  </select>
                  <select name="environment" defaultValue="development">
                    <option value="development">{t('chat.copy.development_4c17aadf')}</option>
                    <option value="production">{t('chat.copy.production_df70fc79')}</option>
                    <option value="ci">{t('chat.copy.ciCd_25ef1b43')}</option>
                  </select>
                  <select name="expiration" defaultValue="never">
                    <option value="30">{t('chat.copy.30Days_7d4278a8')}</option>
                    <option value="90">{t('chat.copy.90Days_170621ac')}</option>
                    <option value="365">{t('chat.copy.1Year_afe36da6')}</option>
                    <option value="never">{t('chat.copy.never_80c3052d')}</option>
                  </select>
                  <PanelButton disabled={busy}>{t('chat.copy.generateKey_174bfb65')}</PanelButton>
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
                      {apiKey.expiresAt
                        ? t('chat.copy.expiresValue0_db310163', {
                            value0: formatBaseChatAstDate(language, apiKey.expiresAt) ?? '',
                          })
                        : ''}
                    </small>
                  </div>
                  <form onSubmit={onSubmit}>
                    <input type="hidden" name="intent" value="revoke-api-key" />
                    <input type="hidden" name="apiKeyId" value={apiKey.id} />
                    <PanelButton disabled={busy} variant="outline">
                      {t('chat.copy.revoke_0be72075')}
                    </PanelButton>
                  </form>
                </article>
              ))}
              {!apiKeys.length && (
                <EmptyState
                  variant="compact"
                  icon="i-ph:key"
                  title={t('chat.copy.noApiKeysCreated_f68337b0')}
                  description={t('chat.copy.generateAKeyToAccessThis_c2e35480')}
                  actionLabel={t('baseChatAst.integrations.createApiKey')}
                  onAction={() => setShowApiKeyForm(true)}
                />
              )}
            </section>
          )}

          <section className="bolt-project-integrations-streams" data-testid="dialog-event-streaming">
            <div className="bolt-project-integrations-section-head">
              <div>
                <strong>{t('chat.copy.eventStreaming_d053a572')}</strong>
                <small>{t('chat.copy.streamsAreProjectScopedAndBacked_3cc6a996')}</small>
              </div>
              <PanelButton type="button" size="sm" onClick={() => setShowStreamForm((value) => !value)}>
                {t('chat.copy.addStream_0c868a56')}
              </PanelButton>
            </div>
            {showStreamForm && (
              <form onSubmit={onSubmit} className="bolt-project-integrations-form">
                <input type="hidden" name="intent" value="create-stream" />
                <PanelInput name="name" placeholder={t('chat.copy.auditLogs_344c7ffc')} required />
                <select name="destination" defaultValue="AWS Kinesis">
                  <option value="AWS Kinesis">{t('chat.copy.awsKinesis_e2cb7d09')}</option>
                  <option value="Apache Kafka">{t('chat.copy.apacheKafka_d646e904')}</option>
                  <option value="Google Pub/Sub">{t('chat.copy.googlePubSub_5e01c618')}</option>
                  <option value="Azure Event Hub">{t('chat.copy.azureEventHub_4d000d9a')}</option>
                  <option value="Elasticsearch">{t('chat.copy.elasticsearch_85bb5d88')}</option>
                </select>
                <PanelInput name="events" placeholder={t('chat.copy.authApi_72386460')} defaultValue="*" />
                <PanelButton disabled={busy}>{t('chat.copy.addStream_0c868a56')}</PanelButton>
              </form>
            )}
            <div className="bolt-project-integrations-list compact">
              {eventStreams.map((stream: any) => (
                <article key={stream.id} data-testid={`stream-${stream.id}`}>
                  <span className="i-ph:broadcast" aria-hidden />
                  <div>
                    <strong>{stream.name}</strong>
                    <small>
                      {stream.destination} · {(stream.events ?? []).join(', ')} · {stream.throughput ?? 0}
                      {t('chat.copy.min_145a01fb')}
                    </small>
                  </div>
                  <form onSubmit={onSubmit}>
                    <input type="hidden" name="intent" value="toggle-stream" />
                    <input type="hidden" name="streamId" value={stream.id} />
                    <input type="hidden" name="active" value={stream.active ? 'false' : 'true'} />
                    <PanelButton disabled={busy} variant="outline">
                      {stream.active ? t('chat.copy.pause_781961bc') : t('chat.copy.resume_b3bd0b5a')}
                    </PanelButton>
                  </form>
                </article>
              ))}
              {!eventStreams.length && (
                <EmptyState
                  variant="compact"
                  icon="i-ph:broadcast"
                  title={t('chat.copy.noEventStreamsConfigured_63fc1f4d')}
                  description={t('chat.copy.streamProjectEventsToAnExternal_e02f102e')}
                  actionLabel={t('baseChatAst.integrations.addStream')}
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
  {
    key: 'development',
    label: chatKey('chat.copy.development_4c17aadf'),
    short: 'baseChatAst.env.shortDevelopment',
  },
  { key: 'preview', label: chatKey('chat.copy.preview_f1fbb2b4'), short: 'baseChatAst.env.shortPreview' },
  { key: 'production', label: chatKey('chat.copy.production_df70fc79'), short: 'baseChatAst.env.shortProduction' },
] as const;

type EnvVarScope = (typeof ENV_VAR_SCOPES)[number]['key'];

function normalizeEnvScope(scope: unknown): EnvVarScope {
  // Legacy rows carry no scope; treat them as production (the store default).
  return scope === 'development' || scope === 'preview' || scope === 'production' ? scope : 'production';
}

function maskEnvValue(t: TFunction, value: string): string {
  if (!value) {
    return t('baseChatAst.env.emptyValue');
  }

  return '•'.repeat(Math.min(Math.max(value.length, 4), 12));
}

function ProjectEnvPanel({ data, onSubmit, busy }: { data: any; onSubmit: any; busy: boolean }) {
  const { t, i18n } = useTranslation();
  const language = resolvedBaseChatLanguage(i18n);
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
  const activeScopeLabel = t(ENV_VAR_SCOPES.find((scope) => scope.key === activeScope)?.label ?? activeScope);

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
      setMessage(t(value ? 'baseChatAst.env.copiedWithValue' : 'baseChatAst.env.copied', { key }));
    } catch (error) {
      // writeText rejects when the document isn't focused / permission denied.
      console.error('Environment variable copy failed', { key, error });
      setMessage(t('baseChatAst.env.copyFailed', { key }));
    }
  }

  return (
    <div className="bolt-project-managed-panel">
      <section>
        {/*
         * UNIF-14 — les onglets de scope maison (boutons `.selected` + rôle tab
         * ad hoc) passent au PanelToolTabs commun (aria-current, feuille
         * `.bolt-project-tool-tabs` unique) ; ils restent gelés pendant la vue
         * Diff, comme avant. Le « Diff scopes » devient un PanelButton outline.
         */}
        <div className="bolt-project-env-scopes">
          <PanelToolTabs
            tabs={ENV_VAR_SCOPES.map((scope) => [scope.key, t(scope.label)] as const)}
            active={activeScope}
            disabled={showDiff}
            onSelect={(scopeKey) => {
              setActiveScope(scopeKey);
              setEditing((current) => (current ? { ...current, scope: scopeKey } : current));
            }}
          />
          <PanelButton
            type="button"
            variant="outline"
            size="sm"
            className="bolt-project-env-diff-toggle"
            aria-pressed={showDiff}
            onClick={() => setShowDiff((current) => !current)}
          >
            {showDiff ? t('chat.copy.exitDiff_f97e0642') : t('chat.copy.diffScopes_053a2907')}
          </PanelButton>
        </div>

        <div className="bolt-project-panel-toolbar">
          <label>
            {showDiff
              ? t('chat.copy.filterKeys_14e0ed60')
              : t('chat.copy.searchValue0Variables_01db9728', { value0: activeScopeLabel })}
            <PanelInput
              size="sm"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('chat.copy.viteDatabaseApi_c73cb9ac')}
            />
          </label>
          {!showDiff && (
            <PanelButton
              type="button"
              size="sm"
              onClick={() => setEditing({ key: 'VITE_API_URL', value: '', scope: activeScope })}
            >
              {t('chat.copy.newVariable_7adfa76b')}
            </PanelButton>
          )}
        </div>
        {message && <div className="bolt-project-empty-panel">{message}</div>}

        {showDiff ? (
          <div className="bolt-project-env-diff-wrap">
            <div className="bolt-project-env-diff-actions">
              {/* UNIF-14 — « Reveal values » sur le PanelButton commun (outline sm). */}
              <PanelButton
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setRevealDiff((current) => !current)}
                aria-pressed={revealDiff}
              >
                {revealDiff ? t('chat.copy.maskValues_bc20ce51') : t('chat.copy.revealValues_3c8deb88')}
              </PanelButton>
            </div>
            {diffRows.length ? (
              <table className="bolt-project-env-diff">
                <thead>
                  <tr>
                    <th scope="col">{t('chat.copy.key_c67dd20e')}</th>
                    {ENV_VAR_SCOPES.map((scope) => (
                      <th key={scope.key} scope="col">
                        {t(scope.short)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {diffRows.map((row) => (
                    <tr key={row.key} className={row.diverges ? 'diverges' : undefined}>
                      <th scope="row">
                        <span>{row.key}</span>
                        {row.diverges && (
                          <em className="bolt-project-env-diff-flag">{t('chat.copy.differs_b43b190f')}</em>
                        )}
                      </th>
                      {ENV_VAR_SCOPES.map((scope) => {
                        const value = row.values[scope.key];
                        const absent = value === undefined;

                        return (
                          <td key={scope.key} className={absent ? 'absent' : undefined}>
                            {absent
                              ? '—'
                              : revealDiff
                                ? value || t('chat.copy.emptyValue_2464254a')
                                : maskEnvValue(t, value)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <PanelEmptyState
                icon="i-ph:brackets-curly"
                title={
                  query
                    ? t('chat.copy.noKeyMatchesThisFilter_ec9af2f3')
                    : t('chat.copy.noEnvironmentVariablesToCompareYet_73d09bd3')
                }
              />
            )}
          </div>
        ) : (
          <div className="bolt-project-env-list">
            {filtered.length ? (
              filtered.map((item) => (
                <div key={`${item.scope ?? 'production'}:${item.key}`} className="bolt-project-env-row">
                  <strong>{item.key}</strong>
                  <span>{item.value || t('chat.copy.emptyValue_2464254a')}</span>
                  <small>
                    {item.updatedAt
                      ? (formatBaseChatAstDateTime(language, item.updatedAt) ?? item.updatedAt)
                      : t('chat.copy.storedInProjectMetadata_ac0072b9')}
                  </small>
                  {/* UNIF-14 — Edit / Copy de ligne sur le PanelButton commun (outline sm). */}
                  <PanelButton
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setEditing({ key: item.key, value: item.value ?? '', scope: activeScope })}
                  >
                    {t('chat.copy.edit_5301648d')}
                  </PanelButton>
                  <PanelButton
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void copyEnv(item.key, item.value)}
                  >
                    {t('chat.copy.copy_af74f7c5')}
                  </PanelButton>
                  <ConfirmSubmitForm
                    onSubmit={onSubmit}
                    title={t('chat.copy.deleteValue0FromValue1_9746c6b2', {
                      value0: item.key,
                      value1: activeScopeLabel,
                    })}
                    description={t('chat.copy.theVariableIsRemovedFromThis_6e9756de')}
                    confirmLabel={t('baseChatAst.env.deleteVariable')}
                  >
                    <input name="intent" value="delete" type="hidden" />
                    <input name="key" value={item.key} type="hidden" />
                    <input name="scope" value={activeScope} type="hidden" />
                    <PanelButton disabled={busy} variant="outline" size="sm">
                      {t('chat.copy.delete_f6fdbe48')}
                    </PanelButton>
                  </ConfirmSubmitForm>
                </div>
              ))
            ) : query ? (
              <PanelEmptyState
                icon="i-ph:brackets-curly"
                title={t('chat.copy.noEnvironmentVariableMatchesThisSearch_71d294b1')}
              />
            ) : (
              <EmptyState
                variant="compact"
                icon="i-ph:brackets-curly"
                title={t('chat.copy.noValue0Variables_34b0862e', { value0: activeScopeLabel })}
                description={t('chat.copy.addAVariableToConfigureThis_769019a5', { value0: activeScopeLabel })}
                actionLabel={t('baseChatAst.env.newVariable')}
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
            <span>{t('chat.copy.scope_4651a34e')}</span>
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
                  {t(scope.label)}
                </option>
              ))}
            </select>
          </label>
          <PanelInput
            name="key"
            placeholder={t('chat.copy.viteApiUrl_c5db039c')}
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
            {editing ? t('chat.copy.saveVariable_ae0baaa7') : t('chat.copy.createVariable_6fe55b12')}
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
  const { t } = useTranslation();

  const providerExamples = [
    {
      provider: 'Neon / Supabase Postgres',
      key: 'DATABASE_URL',
      value: 'postgresql://user:password@host.neon.tech/db?sslmode=require',
      note: t('baseChatAst.database.postgresNote'),
    },
    {
      provider: 'PlanetScale / MySQL',
      key: 'MYSQL_URL',
      value: 'mysql://user:password@aws.connect.psdb.cloud/app?ssl={"rejectUnauthorized":true}',
      note: t('baseChatAst.database.mysqlNote'),
    },
    {
      provider: 'MongoDB Atlas',
      key: 'MONGODB_URI',
      value: 'mongodb+srv://user:password@cluster.mongodb.net/app?retryWrites=true&w=majority',
      note: t('baseChatAst.database.mongodbNote'),
    },
    {
      provider: 'Upstash Redis',
      key: 'REDIS_URL',
      value: 'redis://default:password@host.upstash.io:6379',
      note: t('baseChatAst.database.redisNote'),
    },
  ];

  return (
    <section className="bolt-project-database-onboarding" aria-label={t('chat.copy.databaseConnectionSetup_bb8a9aeb')}>
      <div className="bolt-project-database-onboarding-hero">
        <div>
          <span className="i-ph:database-duotone" aria-hidden />
          <h3>{t('chat.copy.addYourFirstDatabase_b10872bd')}</h3>
          <p>{t('chat.copy.connectARealProviderBySaving_bb256530')}</p>
        </div>
      </div>

      <div className="bolt-project-database-steps" aria-label={t('chat.copy.databaseSetupSteps_a7f1a5e2')}>
        {[
          ['1', t('baseChatAst.database.stepHosted'), t('baseChatAst.database.stepHostedDetail')],
          ['2', t('baseChatAst.database.stepCopy'), t('baseChatAst.database.stepCopyDetail')],
          ['3', t('baseChatAst.database.stepSave'), t('baseChatAst.database.stepSaveDetail')],
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
          <h4>{t('chat.copy.connectionSecret_dfb3808b')}</h4>
          <p>{t('chat.copy.pasteTheProviderUrlExactlyAs_fbf1c1d4')}</p>
        </div>
        <label>
          <span>{t('chat.copy.secretName_a3321681')}</span>
          <PanelInput
            name="key"
            placeholder={t('chat.copy.databaseUrl_01d2f16e')}
            defaultValue="DATABASE_URL"
            required
          />
          <small>{t('chat.copy.recommendedDatabaseUrlMysqlUrlMongodb_95ee0c89')}</small>
        </label>
        <label>
          <span>{t('chat.copy.connectionString_11a3690d')}</span>
          <PanelInput
            name="value"
            type="password"
            placeholder={t('chat.copy.postgresqlUserPasswordHostDbSslmode_263921bc')}
            required
          />
          <small>{t('chat.copy.storedAsAnEncryptedSecretThe_4760688f')}</small>
        </label>
        <PanelButton disabled={busy}>{t('chat.copy.addYourFirstDatabase_b10872bd')}</PanelButton>
      </form>

      <details className="bolt-project-database-docs" open>
        <summary>{t('chat.copy.connectionStringExamplesByProvider_368f1c1d')}</summary>
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
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language ?? 'en';
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
    platformStateLabel(t, severity),
    t('baseChatAst.security.activeCount', {
      count: activeVulnerabilities.filter((item: any) => item.severity === severity).length,
    }),
  ]);

  const exportSarifReport = () => downloadSecurityReport('sarif', project, state, t);
  const exportJsonReport = () => downloadSecurityReport('json', project, state, t);

  const scanRunning = scanState.status === 'running';
  const scanElapsedMs = scanRunning && scanState.startedAt ? Date.now() - scanState.startedAt : 0;
  const scanStage = scanProgressStage(t, scanState.progress, scanElapsedMs);

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
          message: scanProgressStage(t, progress, elapsed),
        };
      });
    }, 800);

    return () => window.clearInterval(interval);
  }, [scanRunning, scanState.startedAt, t]);

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
        message: t('chat.copy.missingProjectIdReloadTheIde_66a40459'),
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
        message: t('chat.copy.securityScanTimedOutAfter90_6f170c10'),
      });
    }, PROJECT_SECURITY_SCAN_TIMEOUT_MS);

    setScanState({
      status: 'running',
      progress: 8,
      startedAt: Date.now(),
      message: t('chat.copy.preparingScannerProfile_eaa96b71'),
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
        console.warn('Security scan request failed', { status: response.status, serverError: result.error });
        window.clearTimeout(timeout);
        setScanState({
          status: 'failed',
          progress: 100,
          message: t('baseChatAst.security.scanFailedHttp', { status: response.status }),
        });

        return;
      }

      window.clearTimeout(timeout);
      setScanState({
        status: 'completed',
        progress: 100,
        message: t('chat.copy.scanCompletedResultsWereRefreshedFrom_7f5ecdf8'),
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
                message: t('chat.copy.scanCancelledLocallyReloadThePanel_919bd102'),
              },
        );

        return;
      }

      console.error('Security scan request failed', error);
      setScanState({
        status: 'failed',
        progress: 100,
        message: t('baseChatAst.security.scanFailed'),
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
      message: t('chat.copy.scanCancelledLocallyNoCompletedScan_344286af'),
    });
  };

  const printReport = () => {
    const report = buildSecurityReport(project, state, t);
    const printable = window.open('', '_blank', 'noopener,noreferrer');

    if (!printable) {
      return;
    }

    printable.document.write(renderSecurityReportHtml(report, t, language));
    printable.document.close();
    printable.focus();
    printable.print();
  };

  return (
    <div className="bolt-project-security-tool">
      <section className="bolt-project-security-summary">
        <div>
          <h3>{t('chat.copy.securityAndPrivacyScanner_afeac30e')}</h3>
          <p>{t('chat.copy.runsScaSecretScanningAndLightweight_97d45880')}</p>
        </div>
        <form onSubmit={runScan} className="bolt-project-security-scan-form">
          <input name="intent" value="scan" type="hidden" />
          <PanelButton disabled={busy || scanRunning}>
            {scanRunning ? t('chat.copy.scanning_bd5e8d69') : t('chat.copy.runFullScan_aedc848e')}
          </PanelButton>
          {/* UNIF-14 — « Cancel scan » sur le PanelButton commun (variant danger). */}
          {scanRunning ? (
            <PanelButton type="button" variant="danger" onClick={cancelScan}>
              {t('chat.copy.cancelScan_b37844ba')}
            </PanelButton>
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
                  ? t('chat.copy.scanCompleted_6d13ae13')
                  : scanState.status === 'timeout'
                    ? t('chat.copy.scanTimedOut_02ef0c04')
                    : scanState.status === 'cancelled'
                      ? t('chat.copy.scanCancelled_9e663f73')
                      : t('chat.copy.scanFailed_944d285f')}
            </strong>
            <span>{scanState.message}</span>
          </div>
          <progress max={100} value={scanState.progress} aria-label={t('chat.copy.securityScanProgress_036e43e1')} />
        </section>
      ) : null}

      <section className="bolt-project-security-scope" aria-label={t('chat.copy.securityScannerCoverage_c99a66ee')}>
        {[
          [
            codeExample('SCA'),
            t('baseChatAst.security.dependencyAdvisories'),
            settings.dependencyAuditEnabled !== false,
          ],
          [
            t('baseChatAst.common.secrets'),
            t('baseChatAst.security.secretSources'),
            settings.secretScanEnabled !== false,
          ],
          [codeExample('SAST'), t('baseChatAst.security.staticRisks'), settings.sastEnabled !== false],
          [
            t('baseChatAst.security.privacy'),
            t('baseChatAst.security.privacyRisks'),
            settings.privacyDetectionEnabled !== false,
          ],
        ].map(([label, description, enabled]) => (
          <article key={String(label)} data-enabled={enabled ? 'true' : 'false'}>
            <strong>{label}</strong>
            <span>{description}</span>
          </article>
        ))}
      </section>

      <div className="bolt-project-security-grid">
        <aside>
          <strong>{t('chat.copy.latestScan_25d91d34')}</strong>
          <PanelRows
            rows={[
              [
                t('baseChatAst.common.status'),
                latestScan?.status ? platformStateLabel(t, latestScan.status) : t('baseChatAst.security.noScan'),
              ],
              [
                t('baseChatAst.security.profile'),
                latestScan?.scanner ?? settings.scannerProfile ?? codeExample('workspace-runtime'),
              ],
              [t('baseChatAst.common.summary'), latestScan?.summary ?? t('baseChatAst.security.runToPopulate')],
              [
                t('baseChatAst.common.schedule'),
                schedule.enabled
                  ? `${platformStateLabel(t, schedule.frequency)}, ${formatSecurityDate(t, language, schedule.nextRunAt)}`
                  : t('chat.copy.manual_4e836fdc'),
              ],
            ]}
          />
          <strong>{t('chat.copy.severity_de314fa0')}</strong>
          <PanelRows rows={severityRows} />
          <strong>{t('chat.copy.githubSecurity_a8fa7886')}</strong>
          <PanelRows
            rows={[
              [
                t('baseChatAst.common.status'),
                githubSecurityUrl
                  ? t('baseChatAst.security.repositoryDetected')
                  : t('baseChatAst.security.noGithubRemote'),
              ],
              [
                t('baseChatAst.security.sync'),
                settings.githubSecuritySyncEnabled
                  ? t('baseChatAst.status.enabled')
                  : t('baseChatAst.security.manualReports'),
              ],
            ]}
          />
          {githubSecurityUrl ? (
            <a className="bolt-project-security-link" href={githubSecurityUrl} target="_blank" rel="noreferrer">
              {t('chat.copy.openGithubSecurityTab_ee1f0bac')}
            </a>
          ) : (
            <a className="bolt-project-security-link" href="?panel=git">
              {t('chat.copy.connectAGithubRemote_5cd948b7')}
            </a>
          )}
        </aside>

        <main>
          <PanelToolTabs
            tabs={
              [
                ['active', t('baseChatAst.common.active')],
                ['hidden', t('baseChatAst.common.hidden')],
                ['compare', t('baseChatAst.common.compare')],
                ['reports', t('baseChatAst.common.reports')],
                ['settings', t('baseChatAst.common.settings')],
              ] as const
            }
            active={activeTab}
            onSelect={setActiveTab}
          />

          {activeTab === 'settings' ? (
            <form onSubmit={onSubmit} className="bolt-project-security-settings">
              <input name="intent" value="settings" type="hidden" />
              <label>
                <span>{t('chat.copy.scannerProfile_60cef8cf')}</span>
                <select name="scannerProfile" defaultValue={settings.scannerProfile ?? 'workspace-runtime'}>
                  <option value="workspace-runtime">{t('chat.copy.fullWorkspaceRuntime_45bcb64f')}</option>
                  <option value="sca">{t('chat.copy.scaOnly_2a97c363')}</option>
                  <option value="secrets">{t('chat.copy.secretsOnly_0b9d03ca')}</option>
                  <option value="sast">{t('chat.copy.sastOnly_fef4382e')}</option>
                </select>
              </label>
              {[
                [
                  'dependencyAuditEnabled',
                  t('baseChatAst.security.dependencyAudit'),
                  settings.dependencyAuditEnabled !== false,
                ],
                ['secretScanEnabled', t('baseChatAst.security.secretScan'), settings.secretScanEnabled !== false],
                ['sastEnabled', t('baseChatAst.security.sast'), settings.sastEnabled !== false],
                [
                  'privacyDetectionEnabled',
                  t('baseChatAst.security.privacyDetection'),
                  settings.privacyDetectionEnabled !== false,
                ],
              ].map(([name, label, enabled]) => (
                <label key={String(name)}>
                  <span>{label}</span>
                  <select name={String(name)} defaultValue={enabled ? 'true' : 'false'}>
                    <option value="true">{t('chat.copy.enabled_df174a3f')}</option>
                    <option value="false">{t('chat.copy.disabled_f4f4473d')}</option>
                  </select>
                </label>
              ))}
              <label>
                <span>{t('chat.copy.automaticSchedule_9e0dd16d')}</span>
                <select name="scheduleEnabled" defaultValue={schedule.enabled ? 'true' : 'false'}>
                  <option value="true">{t('chat.copy.enabled_df174a3f')}</option>
                  <option value="false">{t('chat.copy.manualOnly_aaf64b3f')}</option>
                </select>
              </label>
              <label>
                <span>{t('chat.copy.scheduleCadence_aab51f97')}</span>
                <select name="scheduleFrequency" defaultValue={schedule.frequency ?? 'weekly'}>
                  <option value="daily">{t('chat.copy.dailyAt0300Utc_ca914139')}</option>
                  <option value="weekly">{t('chat.copy.weeklyAt0300Utc_ce446487')}</option>
                </select>
              </label>
              <label>
                <span>{t('chat.copy.githubSecurityReporting_381ce4fe')}</span>
                <select
                  name="githubSecuritySyncEnabled"
                  defaultValue={settings.githubSecuritySyncEnabled ? 'true' : 'false'}
                >
                  <option value="true">{t('chat.copy.enabledWhenGithubRemoteExists_de9d427d')}</option>
                  <option value="false">{t('chat.copy.manualExportOnly_ca92d00c')}</option>
                </select>
              </label>
              <PanelButton disabled={busy}>{t('chat.copy.saveScannerSettings_82310df7')}</PanelButton>
            </form>
          ) : activeTab === 'reports' ? (
            <section className="bolt-project-security-reports">
              <article>
                <strong>{t('chat.copy.exportAuditPackage_913ca7d5')}</strong>
                <p>{t('chat.copy.generateAReportFromTheCurrent_99a3cc7e')}</p>
                {/* UNIF-14 — les 3 exports (SARIF / JSON / Print) sur le PanelButton commun. */}
                <div>
                  <PanelButton type="button" variant="outline" size="sm" onClick={exportSarifReport}>
                    {t('chat.copy.exportSarif_e4ff4ea2')}
                  </PanelButton>
                  <PanelButton type="button" variant="outline" size="sm" onClick={exportJsonReport}>
                    {t('chat.copy.exportJson_bc399052')}
                  </PanelButton>
                  <PanelButton type="button" variant="outline" size="sm" onClick={printReport}>
                    {t('chat.copy.printSavePdf_6b15347b')}
                  </PanelButton>
                </div>
              </article>
              <PanelRows
                rows={[
                  [t('baseChatAst.security.reportFindings'), formatBaseChatAstNumber(language, vulnerabilities.length)],
                  [
                    t('chat.copy.latestScan_25d91d34'),
                    latestScan?.completedAt
                      ? formatSecurityDate(t, language, latestScan.completedAt)
                      : t('baseChatAst.security.notScheduled'),
                  ],
                  [t('baseChatAst.security.sarifTarget'), t('baseChatAst.security.githubScanningCompatible')],
                ]}
              />
            </section>
          ) : activeTab === 'compare' ? (
            <section className="bolt-project-security-compare">
              <div>
                <h4>{t('chat.copy.scanComparison_3b588c46')}</h4>
                <p>{t('chat.copy.comparesTheLatestCompletedScanAgainst_b4268ea5')}</p>
              </div>
              <div className="bolt-project-security-comparison-grid">
                {['critical', 'high', 'moderate', 'low', 'info'].map((severity) => {
                  const current = Number(latestCounts?.[severity] ?? 0);
                  const previous = Number(previousCounts?.[severity] ?? 0);
                  const delta = current - previous;

                  return (
                    <article key={severity}>
                      <span>{platformStateLabel(t, severity)}</span>
                      <strong>{formatBaseChatAstNumber(language, current)}</strong>
                      <small data-delta={delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'}>
                        {t('baseChatAst.phrases.deltaVsPrevious', {
                          delta: `${delta > 0 ? '+' : ''}${formatBaseChatAstNumber(language, delta)}`,
                        })}
                      </small>
                    </article>
                  );
                })}
              </div>
              <PanelRows
                rows={[
                  [
                    t('baseChatAst.common.latest'),
                    latestScan?.completedAt
                      ? formatSecurityDate(t, language, latestScan.completedAt)
                      : t('baseChatAst.security.notScheduled'),
                  ],
                  [
                    t('baseChatAst.common.previous'),
                    previousScan?.completedAt
                      ? formatSecurityDate(t, language, previousScan.completedAt)
                      : t('baseChatAst.security.notScheduled'),
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
                      <span data-severity={vulnerability.severity}>
                        {platformStateLabel(t, vulnerability.severity)}
                      </span>
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
                          {t('chat.copy.fixWithAgent_387d0de5')}
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
                          {activeTab === 'hidden' ? t('chat.copy.restore_3cbe6d6b') : t('chat.copy.ignore_98f55db5')}
                        </PanelButton>
                      </form>
                    </div>
                  </article>
                ))
              ) : (
                <PanelRows
                  rows={[]}
                  empty={
                    activeTab === 'hidden'
                      ? t('baseChatAst.security.noHiddenVulnerabilities')
                      : t('baseChatAst.security.noActiveVulnerabilities')
                  }
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

function scanProgressStage(t: TFunction, progress: number, elapsedMs: number) {
  if (progress < 18) {
    return t('baseChatAst.security.stage.preparing');
  }

  if (progress < 42) {
    return t('baseChatAst.security.stage.dependencies');
  }

  if (progress < 66) {
    return t('baseChatAst.security.stage.secrets');
  }

  if (progress < 88) {
    return t('baseChatAst.security.stage.staticAnalysis');
  }

  return t(elapsedMs > 60_000 ? 'baseChatAst.security.stage.finalizingLong' : 'baseChatAst.security.stage.finalizing');
}

function formatSecurityDate(t: TFunction, language: string, value?: string | null) {
  if (!value) {
    return t('baseChatAst.security.notScheduled');
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return t('baseChatAst.security.notScheduled');
  }

  return new Intl.DateTimeFormat(language.startsWith('fr') ? 'fr-FR' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
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

function buildSecurityReport(project: any, state: any, t: TFunction) {
  const vulnerabilities = Array.isArray(state?.vulnerabilities) ? state.vulnerabilities : [];
  const scans = Array.isArray(state?.scans) ? state.scans : [];

  return {
    project: {
      id: project?.id ?? 'unknown',
      name: project?.name ?? t('baseChatAst.security.projectFallback'),
    },
    generatedAt: new Date().toISOString(),
    latestScan: scans[0] ?? null,
    scans,
    vulnerabilities,
    counts: securityCountsFromVulnerabilities(vulnerabilities.filter((item: any) => !item.hidden)),
  };
}

function securityReportToSarif(report: any, t: TFunction) {
  const vulnerabilities = Array.isArray(report.vulnerabilities) ? report.vulnerabilities : [];

  return {
    version: '2.1.0',
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    runs: [
      {
        tool: {
          driver: {
            name: t('baseChatAst.security.scannerName'),
            informationUri: 'https://github.com/openaxcloud/vibecore',
            rules: vulnerabilities.map((vulnerability: any) => ({
              id: vulnerability.id,
              name: vulnerability.title,
              shortDescription: { text: vulnerability.title },
              fullDescription: { text: vulnerability.details || vulnerability.recommendation || vulnerability.source },
              help: {
                text: vulnerability.recommendation || t('baseChatAst.security.recommendationFallback'),
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

function downloadSecurityReport(format: 'json' | 'sarif', project: any, state: any, t: TFunction) {
  const report = buildSecurityReport(project, state, t);
  const payload = format === 'sarif' ? securityReportToSarif(report, t) : report;
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

function renderSecurityReportHtml(report: any, t: TFunction, language: string) {
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
    <html lang="${language.startsWith('fr') ? 'fr' : 'en'}">
      <head>
        <title>${escape(t('baseChatAst.security.reportDocumentTitle', { project: report.project.name }))}</title>
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
        <h1>${escape(t('baseChatAst.security.reportTitle'))}</h1>
        <p>${escape(
          t('baseChatAst.security.reportGenerated', {
            project: report.project.name,
            date: formatSecurityDate(t, language, report.generatedAt),
          }),
        )}</p>
        <table>
          <thead><tr><th>${escape(t('baseChatAst.security.severity'))}</th><th>${escape(
            t('baseChatAst.security.finding'),
          )}</th><th>${escape(t('baseChatAst.security.source'))}</th><th>${escape(
            t('baseChatAst.security.recommendation'),
          )}</th></tr></thead>
          <tbody>${rows || `<tr><td colspan="4">${escape(t('baseChatAst.security.noFindings'))}</td></tr>`}</tbody>
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
  const { t, i18n } = useTranslation();
  const language = resolvedBaseChatLanguage(i18n);
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
          [t('baseChatAst.debugger.launchConfigs'), launchConfigs.length],
          [
            t('baseChatAst.debugger.breakpoints'),
            breakpoints.filter((breakpoint: any) => breakpoint.enabled !== false).length,
          ],
          [t('baseChatAst.debugger.watchExpressions'), watches.filter((watch: any) => watch.enabled !== false).length],
          [t('baseChatAst.debugger.runtimeProcesses'), Array.isArray(processes) ? processes.length : 0],
        ].map(([label, value]) => (
          <div
            key={label}
            className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-3"
          >
            <div className="text-[11px] uppercase tracking-wide text-bolt-elements-textSecondary">{label}</div>
            <div className="mt-1 text-sm font-semibold text-bolt-elements-textPrimary">
              {formatBaseChatAstNumber(language, Number(value))}
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="grid gap-4">
          <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <PanelSectionTitle>{t('chat.copy.debugSessions_7f873835')}</PanelSectionTitle>
                <p className="text-xs text-bolt-elements-textSecondary">
                  {t('chat.copy.launchesRunInTheRealWorkspace_307c6320')}
                </p>
              </div>
              <PanelButton type="button" variant="outline" size="sm" onClick={() => void reload?.()} disabled={busy}>
                {t('chat.copy.refreshRuntime_f5c4addc')}
              </PanelButton>
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
                        {platformStateLabel(t, session.status)}
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {(
                        [
                          ['continue', t('baseChatAst.debugger.continue')],
                          ['step-over', t('baseChatAst.debugger.stepOver')],
                          ['step-into', t('baseChatAst.debugger.stepInto')],
                          ['step-out', t('baseChatAst.debugger.stepOut')],
                        ] as const
                      ).map(([action, label]) => (
                        <button
                          key={action}
                          type="button"
                          disabled={session.status !== 'paused'}
                          className="h-8 rounded border border-bolt-elements-borderColor px-2 text-xs text-bolt-elements-textSecondary disabled:opacity-50"
                          title={t('chat.copy.steppingIsEnabledWhenADebug_d6ee4bd3')}
                        >
                          {label}
                        </button>
                      ))}
                      {session.status === 'running' && (
                        <form onSubmit={onSubmit}>
                          <input name="intent" value="stop-session" type="hidden" />
                          <input name="sessionId" value={session.id} type="hidden" />
                          <PanelButton disabled={busy} variant="outline">
                            {t('chat.copy.stop_9e253470')}
                          </PanelButton>
                        </form>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-sm text-bolt-elements-textSecondary">
                  {t('chat.copy.noDebugSessionHasBeenLaunched_124153a2')}
                </div>
              )}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4">
              <PanelSectionTitle>{t('chat.copy.breakpoints_21a8752f')}</PanelSectionTitle>
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
                              {breakpoint.condition
                                ? t('chat.copy.ifValue0_3ddebae8', { value0: breakpoint.condition })
                                : null}
                              {breakpoint.hitCondition
                                ? t('chat.copy.hitValue0_ecfd5f98', { value0: breakpoint.hitCondition })
                                : null}
                              {breakpoint.logMessage
                                ? t('chat.copy.logValue0_7807582a', { value0: breakpoint.logMessage })
                                : null}
                            </div>
                          ) : null}
                        </div>
                        <form onSubmit={onSubmit}>
                          <input name="intent" value="delete-breakpoint" type="hidden" />
                          <input name="breakpointId" value={breakpoint.id} type="hidden" />
                          <PanelButton disabled={busy} variant="outline">
                            {t('chat.copy.remove_e963907d')}
                          </PanelButton>
                        </form>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-bolt-elements-textSecondary">
                    {t('chat.copy.noBreakpointsConfigured_cac0d3f6')}
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4">
              <PanelSectionTitle>{t('chat.copy.callStackAndVariables_6820d7cf')}</PanelSectionTitle>
              {activeSession?.status === 'paused' ? (
                <div className="mt-3 grid gap-2">
                  <PanelRows rows={activeSession.callStack ?? []} empty={t('baseChatAst.debugger.noFrames')} />
                  <PanelRows rows={activeSession.variables ?? []} empty={t('baseChatAst.debugger.noVariables')} />
                </div>
              ) : (
                <div className="mt-3 rounded-md border border-dashed border-bolt-elements-borderColor p-4 text-sm text-bolt-elements-textSecondary">
                  {t('chat.copy.noPausedFrameStartALaunch_7af5fa04')}
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
              {t('chat.copy.launchConfiguration_a3b98e4e')}
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
            <PanelButton disabled={busy || !launchConfigs.length}>{t('chat.copy.startDebugging_94a77e4e')}</PanelButton>
          </form>

          <form
            onSubmit={onSubmit}
            className="grid gap-3 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4"
          >
            <input name="intent" value="save-config" type="hidden" />
            <PanelSectionTitle>{t('chat.copy.launchJsonConfig_018615eb')}</PanelSectionTitle>
            <PanelInput name="name" placeholder={t('chat.copy.nodeInspectorApp_25e2551a')} required />
            <PanelInput name="command" placeholder={t('chat.copy.npmRunDev_4eedebe9')} />
            <PanelInput name="program" placeholder={t('chat.copy.srcServerTs_bcc09dcb')} />
            <PanelInput name="args" placeholder={t('chat.copy.port3000_ec45ac33')} />
            <PanelInput name="env" placeholder={t('chat.copy.debugApp_61e65435')} />
            <label className="flex min-h-11 items-center gap-2 text-xs text-bolt-elements-textSecondary">
              <input name="stopOnEntry" value="true" type="checkbox" />
              {t('chat.copy.stopOnEntry_36fd986b')}
            </label>
            <PanelButton disabled={busy}>{t('chat.copy.saveConfig_64e1de9d')}</PanelButton>
          </form>

          <form
            onSubmit={onSubmit}
            className="grid gap-3 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4"
          >
            <input name="intent" value="add-breakpoint" type="hidden" />
            <PanelSectionTitle>{t('chat.copy.conditionalBreakpoint_af2996c8')}</PanelSectionTitle>
            <PanelInput name="filePath" placeholder={t('chat.copy.srcAppTsx_835da56f')} required />
            <PanelInput name="line" type="number" min="1" placeholder="42" required />
            <PanelInput name="condition" placeholder={t('chat.copy.userIdTargetid_cecbcb16')} />
            <PanelInput name="hitCondition" placeholder=">= 5" />
            <PanelInput name="logMessage" placeholder={t('chat.copy.userUserId_f7f4b839')} />
            <PanelButton disabled={busy}>{t('chat.copy.addBreakpoint_f0d58392')}</PanelButton>
          </form>

          <form
            onSubmit={onSubmit}
            className="grid gap-3 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4"
          >
            <input name="intent" value="add-watch" type="hidden" />
            <PanelSectionTitle>{t('chat.copy.watchExpressions_5a230a1a')}</PanelSectionTitle>
            <PanelInput name="expression" placeholder={codeExample('request.user')} required />
            <PanelButton disabled={busy}>{t('chat.copy.addWatch_11f0adc5')}</PanelButton>
          </form>

          {watches.length ? (
            <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4">
              <PanelSectionTitle>{t('chat.copy.watchList_daa6ded7')}</PanelSectionTitle>
              <div className="mt-3 grid gap-2">
                {watches.map((watch: any) => (
                  <div key={watch.id} className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate font-mono text-bolt-elements-textPrimary">{watch.expression}</span>
                    <form onSubmit={onSubmit}>
                      <input name="intent" value="delete-watch" type="hidden" />
                      <input name="watchId" value={watch.id} type="hidden" />
                      <PanelButton disabled={busy} variant="outline">
                        {t('chat.copy.remove_e963907d')}
                      </PanelButton>
                    </form>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {logs.length ? (
            <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4">
              <PanelSectionTitle>{t('chat.copy.runtimeOutput_fb71b522')}</PanelSectionTitle>
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
  const { t, i18n } = useTranslation();
  const language = resolvedBaseChatLanguage(i18n);
  const [cleared, setCleared] = useState(false);
  const [split, setSplit] = useState(false);
  const [activeStream, setActiveStream] = useState<'console' | 'workflow' | 'system'>('console');
  const [level, setLevel] = useState<'all' | 'info' | 'warn' | 'error'>('all');
  const [query, setQuery] = useState('');
  const [regexEnabled, setRegexEnabled] = useState(false);
  const [liveTail, setLiveTail] = useState(true);

  const streamLabels = {
    console: t('baseChatAst.logs.stream.console'),
    workflow: t('baseChatAst.logs.stream.workflow'),
    system: t('baseChatAst.logs.stream.system'),
  } as const;

  const runtimePorts = runtimePortsFromPayload(data.runtimePorts);
  const workspace = runtimeWorkspaceFromPanelData(data);

  const workspaceStatus = runtimeStatusText(t, {
    workspaceStatus: workspace,
    ports: runtimePorts,
    workspaceLoading: Boolean(workspace && !workspace.status),
    workspaceError: workspace?.error,
  });

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

  const systemEvents = buildSystemLogEvents(data, t, language);
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
    ? t('baseChatAst.logs.empty.cleared')
    : activeStreamLogs.length === 0
      ? t('baseChatAst.logs.empty.stream', { stream: streamLabels[activeStream] })
      : filtersActive
        ? t('baseChatAst.logs.empty.filtered', { stream: streamLabels[activeStream] })
        : t('baseChatAst.logs.empty.visible', { stream: streamLabels[activeStream] });

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
          ['console', streamLabels.console],
          ['workflow', streamLabels.workflow],
          ['system', streamLabels.system],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={activeStream === id}
            aria-label={t('chat.copy.showValue0_60e2ce8e', { value0: label })}
            onClick={() => setActiveStream(id as any)}
          >
            {label}
          </button>
        ))}
        <span
          className="bolt-project-console-status"
          title={t('chat.copy.workspaceValue0_2f7c1a1b', { value0: workspaceStatus })}
        >
          {workspaceStatus}
        </span>
        <div
          className="bolt-project-console-level-chips"
          role="group"
          aria-label={t('chat.copy.filterLogsByLevel_f194bf68')}
        >
          {(
            [
              ['all', t('baseChatAst.logs.level.all'), queryFilteredLogs.length],
              ['info', t('baseChatAst.logs.level.info'), levelCounts.info],
              ['warn', t('baseChatAst.logs.level.warn'), levelCounts.warn],
              ['error', t('baseChatAst.logs.level.error'), levelCounts.error],
            ] as const
          ).map(([id, label, count]) => (
            <button
              key={id}
              type="button"
              data-level={id}
              aria-pressed={level === id}
              aria-label={t('baseChatAst.logs.showLevel', {
                count,
                level: label.toLocaleLowerCase(language),
              })}
              onClick={() => setLevel(id)}
            >
              {label}
              <span className="bolt-project-console-level-count">{count}</span>
            </button>
          ))}
        </div>
        <input
          aria-label={t('chat.copy.searchLogs_48225af1')}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={regexEnabled ? t('chat.copy.regexSearch_012ab8b4') : t('chat.copy.searchLogs_48225af1')}
        />
        <button
          type="button"
          aria-pressed={regexEnabled}
          aria-label={t('chat.copy.toggleRegexSearch_4ed228f4')}
          onClick={() => setRegexEnabled((value) => !value)}
        >
          {t('chat.copy.regex_6e681935')}
        </button>
        <button type="button" aria-label={t('chat.copy.clearVisibleLogs_eb78a0d1')} onClick={() => setCleared(true)}>
          {t('chat.copy.clearLogs_532ffc7a')}
        </button>
        <button
          type="button"
          aria-label={t('chat.copy.toggleSplitLogView_4cbcd801')}
          onClick={() => setSplit((value) => !value)}
        >
          {split ? t('chat.copy.closeSplit_1024a76a') : t('chat.copy.splitView_329af640')}
        </button>
        <button
          type="button"
          aria-label={t('chat.copy.exportCurrentlyFilteredLogsAsA_487e7db6')}
          onClick={downloadLogs}
        >
          {t('chat.copy.exportTxt_469c1c08')}
        </button>
        <button
          type="button"
          aria-pressed={liveTail}
          aria-label={t('chat.copy.toggleLiveTail_e5a60fa5')}
          onClick={() => setLiveTail((value) => !value)}
        >
          {liveTail ? t('chat.copy.liveTailOn_b3b68f8a') : t('chat.copy.liveTailOff_160816b4')}
        </button>
        <button
          type="button"
          aria-label={t('chat.copy.reloadLogsFromBackend_6896c671')}
          onClick={() => void reload?.()}
          disabled={busy}
        >
          {busy ? t('chat.copy.refreshing_505dddc9') : t('chat.copy.reload_cce71553')}
        </button>
      </div>
      <LogStreamView logs={filteredLogs} empty={activeStreamEmptyMessage} />
      {split && (
        <LogStreamView
          logs={secondaryLogs}
          empty={filtersActive ? t('baseChatAst.logs.empty.secondaryFiltered') : t('baseChatAst.logs.empty.secondary')}
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
  const { t, i18n } = useTranslation();
  const language = resolvedBaseChatLanguage(i18n);
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
              <span>{formatLogTime(language, entry.timestamp)}</span>
              <strong>{platformStateLabel(t, normalizeLogEntryLevel(entry))}</strong>
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
          aria-label={t('chat.copy.resumeFollowModeAndJumpTo_ed8991ee')}
          onClick={resumeFollow}
        >
          <span className="i-ph:arrow-line-down" aria-hidden />
          {t('chat.copy.follow_66587a7a')}
        </button>
      ) : null}
    </div>
  );
}

function buildSystemLogEvents(data: any, t: TFunction, language: string) {
  const workspace = data.workspace ?? data.runtimeStatus;
  const processes = Array.isArray(data.runtimeProcesses) ? data.runtimeProcesses : [];
  const ports = Array.isArray(data.runtimePorts) ? data.runtimePorts : [];
  const activity = (data.recentActivity ?? []).filter((event: any) => event.action !== 'project.ide_state.save');

  const ideStateSaveCount = (data.recentActivity ?? []).filter(
    (event: any) => event.action === 'project.ide_state.save',
  ).length;

  const number = new Intl.NumberFormat(language.startsWith('fr') ? 'fr-FR' : 'en-US');
  const processCount = number.format(processes.length);
  const portCount = number.format(ports.length);

  const runtimeSummaryKey =
    processes.length === 1
      ? ports.length === 1
        ? 'baseChatAst.logs.processOnePortOne'
        : 'baseChatAst.logs.processOnePortsMany'
      : ports.length === 1
        ? 'baseChatAst.logs.processesManyPortOne'
        : 'baseChatAst.logs.processesManyPortsMany';

  const base = [
    {
      level: workspace?.status === 'failed' ? 'error' : 'info',
      source: 'system',
      message: workspace
        ? t('baseChatAst.logs.workspaceState', {
            workspace: workspace.id ?? data.workspaceId ?? t('chat.copy.unknown_50d8b4a9'),
            status: platformStateLabel(t, workspace.status),
            runtime: workspace.runtimeMode ?? t('baseChatAst.common.runtime'),
          })
        : t('baseChatAst.logs.workspaceSnapshot', {
            workspace: data.workspaceId ?? t('chat.copy.unknown_50d8b4a9'),
          }),
      timestamp: new Date().toISOString(),
      context: t('baseChatAst.logs.context.workspace'),
    },
    {
      level: 'info',
      source: 'system',
      message: t(runtimeSummaryKey, { processes: processCount, ports: portCount }),
      timestamp: new Date().toISOString(),
      context: t('baseChatAst.logs.context.runtime'),
    },
  ];

  if (ideStateSaveCount > 0) {
    base.push({
      level: 'warn',
      source: 'system',
      message: t('baseChatAst.logs.auditCollapsed', { count: ideStateSaveCount }),
      timestamp: new Date().toISOString(),
      context: t('baseChatAst.logs.context.audit'),
    });
  }

  return [
    ...base,
    ...activity.slice(0, 80).map((event: any) => ({
      level: classifyLogLevel(event.action ?? ''),
      source: 'system',
      message: event.action ? formatProjectActivityAction(t, event.action) : t('baseChatAst.logs.projectEvent'),
      timestamp: event.createdAt,
      context: event.actorUserId ?? event.resourceType ?? t('baseChatAst.logs.context.activity'),
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

function formatLogTime(language: string, value?: string) {
  const date = value ? new Date(value) : new Date();

  if (Number.isNaN(date.getTime())) {
    return '--:--:--';
  }

  return formatBaseChatAstTime(language, date, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
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
  const { t, i18n } = useTranslation();
  const language = resolvedBaseChatLanguage(i18n);
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
      setMessage(t('baseChatAst.secrets.noEntries'));
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
          console.error('Secret import request failed', { key, error });
          failures.push({ key, error: t('baseChatAst.secrets.networkError') });
        }

        setImportProgress({ done: index + 1, total: entries.length });
      }

      const ok = entries.length - failures.length;

      if (failures.length) {
        // Keep the section open so the user can see and retry what failed.
        setImportFailures(failures);
        setMessage(
          t('baseChatAst.secrets.importPartial', {
            count: entries.length,
            imported: ok,
            failed: failures.length,
          }),
        );
      } else {
        setMessage(t('baseChatAst.secrets.importComplete', { count: entries.length, imported: ok }));
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
      setMessage(t('baseChatAst.secrets.revealFailed', { key }));
      return;
    }

    try {
      await navigator.clipboard?.writeText(value);
      setMessage(t('baseChatAst.secrets.valueCopied', { key }));
    } catch (error) {
      console.error('Secret value copy failed', { key, error });
      setMessage(t('baseChatAst.secrets.copyFailed', { key }));
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
      setMessage(t('baseChatAst.secrets.revealed', { key }));
    } else {
      setMessage(t('baseChatAst.secrets.revealFailed', { key }));
    }
  }

  async function copySecret(key: string) {
    const value = revealed[key] ?? key;

    try {
      await navigator.clipboard?.writeText(value);
      setMessage(
        t('baseChatAst.secrets.copied', {
          label: t(revealed[key] ? 'baseChatAst.secrets.secretValue' : 'baseChatAst.secrets.secretKey'),
        }),
      );
    } catch (error) {
      console.error('Secret copy failed', { key, error });
      setMessage(t('baseChatAst.secrets.copyFailed', { key }));
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
          placeholder={t('chat.copy.stripeSecretKey_b147aa52')}
          required
          defaultValue={editingKey}
        />
        <PanelInput
          key={`secret-value-${editingKey}`}
          name="value"
          placeholder={t('chat.copy.secretValue_50fbacc0')}
          type="password"
          required
        />
        <PanelButton disabled={busy}>
          {editingKey ? t('chat.copy.updateSecret_77d1a1a5') : t('chat.copy.newSecret_57764d66')}
        </PanelButton>
        <PanelButton
          type="button"
          variant="outline"
          onClick={() => {
            setImportOpen((open) => !open);
            setImportFailures([]);
          }}
        >
          {t('chat.copy.importEnv_f0940267')}
        </PanelButton>
      </form>

      {importOpen ? (
        <div className="grid gap-2 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-3">
          <label className="grid gap-1 text-xs text-bolt-elements-textSecondary">
            {t('chat.copy.pasteAEnvFileOne_7111ba2a')}
            <span className="font-mono">{t('chat.copy.keyValue_a4409af0')}</span>
            {t('chat.copy.perLineCommentsAndBlankLines_9af5356e')}
            <textarea
              value={importText}
              onChange={(event) => {
                setImportText(event.target.value);
                setImportFailures([]);
              }}
              placeholder={t('chat.copy.databaseUrlPostgresStripeSecretKey_1e39ac87')}
              spellCheck={false}
              style={{ fontFamily: 'var(--vc-font-code)' }}
              className="min-h-28 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-2 text-xs text-bolt-elements-textPrimary outline-none focus:border-bolt-elements-focus"
            />
          </label>

          {importPreview.entries.length ? (
            <div className="grid gap-1">
              <span className="text-xs text-bolt-elements-textSecondary">
                {t('baseChatAst.counts.secretsToImport', { count: importPreview.entries.length })}
                {overwriteCount ? ` ${t('baseChatAst.secrets.overwrite', { count: overwriteCount })}` : ''}
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
                    <span className="text-bolt-elements-textTertiary" aria-label={t('chat.copy.valueHidden_4dff2356')}>
                      •••
                    </span>
                    {existingSecretKeys.has(entry.key) ? (
                      <span
                        className="rounded-sm px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wide"
                        style={{
                          background: 'color-mix(in srgb, var(--vc-ide-accent-warning) 12%, transparent)',
                          borderLeft: '3px solid var(--vc-ide-accent-warning)',
                          color: 'var(--vc-ide-accent-warning)',
                        }}
                      >
                        {t('chat.copy.overwritesExisting_b450bd78')}
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
                {t('baseChatAst.counts.linesSkipped', { count: importPreview.skipped.length })}
              </span>
              {importPreview.skipped.map((skippedLine) => (
                <span key={skippedLine.line} className="text-bolt-elements-textSecondary">
                  {t('chat.copy.line_ea967600')}
                  {skippedLine.line} ({describeSkipReason(skippedLine.reason, language)}):{' '}
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
                ? t('chat.copy.importingValue0Value1_df968922', {
                    value0: importProgress.done,
                    value1: importProgress.total,
                  })
                : importPreview.entries.length
                  ? t('baseChatAst.secrets.importAction', { count: importPreview.entries.length })
                  : t('chat.copy.importSecrets_9deaeb2d')}
            </PanelButton>
            <PanelButton type="button" variant="outline" onClick={() => setImportOpen(false)} disabled={importing}>
              {t('chat.copy.cancel_77dfd213')}
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
              <button
                type="button"
                aria-label={t('chat.copy.revealValue0_e5d8efb3', { value0: secret.key })}
                onClick={() => revealSecret(secret.key)}
              >
                {revealed[secret.key] ? t('chat.copy.hide_34d8b60f') : t('chat.copy.reveal_90c0c2eb')}
              </button>
              <button
                type="button"
                aria-label={t('chat.copy.copyValue0Name_64ac36a4', { value0: secret.key })}
                onClick={() => void copySecret(secret.key)}
              >
                {t('chat.copy.copy_af74f7c5')}
              </button>
              <button
                type="button"
                aria-label={t('chat.copy.copyValue0Value_8ab75412', { value0: secret.key })}
                onClick={() => void copySecretValue(secret.key)}
              >
                {t('chat.copy.copyValue_4c924dcb')}
              </button>
              <button
                type="button"
                aria-label={t('chat.copy.editValue0_fad75899', { value0: secret.key })}
                onClick={() => setEditingKey(secret.key)}
              >
                {t('chat.copy.edit_5301648d')}
              </button>
              <form onSubmit={onSubmit}>
                <input name="intent" value="delete" type="hidden" />
                <input name="key" value={secret.key} type="hidden" />
                <PanelButton disabled={busy} variant="outline">
                  {t('chat.copy.delete_f6fdbe48')}
                </PanelButton>
              </form>
            </div>
          ))
        ) : (
          <PanelEmptyState icon="i-ph:lock" title={t('chat.copy.noProjectSecrets_f3f1ca38')} />
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
  const { t, i18n } = useTranslation();
  const language = resolvedBaseChatLanguage(i18n);
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
      <PanelToolTabs
        tabs={
          [
            ['overview', t('baseChatAst.common.overview')],
            ['logs', t('baseChatAst.common.logs')],
            ['domains', t('baseChatAst.common.domains')],
            ['manage', t('baseChatAst.common.manage')],
          ] as const
        }
        active={tab}
        onSelect={setTab}
      />

      {tab === 'overview' ? (
        <section className="bolt-project-deploy-history">
          <div className="bolt-project-deploy-summary">
            <div>
              <span>{t('chat.copy.latestStatus_d9f96f98')}</span>
              <strong>
                {latestDeployment?.status
                  ? platformStateLabel(t, latestDeployment.status)
                  : t('chat.copy.noDeployment_26885551')}
              </strong>
            </div>
            <div>
              <span>{t('chat.copy.environment_d443a118')}</span>
              <strong>{platformStateLabel(t, latestDeployment?.environment ?? 'preview')}</strong>
            </div>
            <div>
              <span>{t('chat.copy.framework_fb001b2c')}</span>
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
              <span>{t('chat.copy.type_3deb7456')}</span>
              <strong>{latestDeployment?.provider ? formatDeployProvider(latestDeployment.provider) : '—'}</strong>
            </div>
            <div>
              <span>{t('chat.copy.resources_87df60de')}</span>
              <strong title={t('chat.copy.vcpuMemoryNoAutoscaleComputeBackend_a18a66c2')}>—</strong>
            </div>
            <div>
              <span>{t('chat.copy.usage_0bb18642')}</span>
              <strong title={t('chat.copy.computeUsageThisBillingPeriodNo_c6482992')}>—</strong>
            </div>
            <div>
              <span>{t('chat.copy.database_61074f1c')}</span>
              <strong>
                {connections.length
                  ? t('chat.copy.connectedValue0_4e4f1431', { value0: connections.length })
                  : t('chat.copy.notConnected_8b02f3de')}
              </strong>
            </div>
          </div>

          {deployments.length ? (
            deployments.map((deployment: any) => (
              <article key={deployment.id} className="bolt-project-deploy-card">
                <header>
                  <div>
                    <strong>
                      {formatDeployProvider(deployment.provider)} ·{' '}
                      {platformStateLabel(t, deployment.environment ?? 'preview')}
                    </strong>
                    <span>
                      {deployment.url ??
                        deployment.customDomain ??
                        (deployment.createdAt ? formatBaseChatAstDateTime(language, deployment.createdAt) : null) ??
                        t('chat.copy.urlPending_6c60f919')}
                    </span>
                  </div>
                  <em data-status={deployment.status}>{platformStateLabel(t, deployment.status)}</em>
                </header>
                {deployment.url ? (
                  <div className="bolt-project-deploy-actions">
                    <a href={deployment.url} target="_blank" rel="noreferrer">
                      {t('chat.copy.open_cf9b7706')}
                    </a>
                    <button
                      type="button"
                      onClick={() =>
                        void navigator.clipboard
                          ?.writeText(deployment.url)
                          .catch(() => toast.error(t('chat.copy.clipboardUnavailable_bec46a29')))
                      }
                    >
                      {t('chat.copy.copyLink_2f84eea5')}
                    </button>
                  </div>
                ) : null}
              </article>
            ))
          ) : (
            <EmptyState
              variant="compact"
              icon="i-ph:rocket-launch"
              title={t('chat.copy.noDeploymentsYet_b00d97cd')}
              description={t('chat.copy.shipThisProjectToALive_40d39230')}
              actionLabel={t('baseChatAst.deploy.goManage')}
              onAction={() => setTab('manage')}
            />
          )}

          {/* Real commit history (hash + author + date) from the git graph. */}
          <div className="grid gap-1">
            <span className="text-[11px] uppercase tracking-wide text-bolt-elements-textSecondary">
              {t('chat.copy.commitHistory_6c512e8d')}
            </span>
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
                    {commit.date ? ` · ${formatBaseChatAstDate(language, commit.date) ?? ''}` : ''}
                  </span>
                </div>
              ))
            ) : (
              <span className="text-xs text-bolt-elements-textTertiary">
                {t('chat.copy.noCommitsInThisWorkspaceYet_0a787c26')}
              </span>
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
                      {formatDeployProvider(deployment.provider)} ·{' '}
                      {platformStateLabel(t, deployment.environment ?? 'preview')}
                    </strong>
                    <span>
                      {deployment.url ??
                        (deployment.createdAt ? formatBaseChatAstDateTime(language, deployment.createdAt) : '')}
                    </span>
                  </div>
                  <em data-status={deployment.status}>{platformStateLabel(t, deployment.status)}</em>
                </header>
                <pre aria-label={t('chat.copy.deploymentLogsForValue0_cffeb837', { value0: deployment.id })}>
                  {(deployment.logs ?? [])
                    .map((log: any) => `[${platformStateLabel(t, log.level ?? 'info')}] ${log.message}`)
                    .join('\n') || t('chat.copy.noDeploymentLogsYet_8f8bec37')}
                </pre>
              </article>
            ))
          ) : (
            <PanelEmptyState icon="i-ph:file-text" title={t('chat.copy.noDeploymentLogsYet_8f8bec37')} />
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
                        {formatDeployProvider(deployment.provider)} ·{' '}
                        {platformStateLabel(t, deployment.environment ?? 'preview')}
                      </strong>
                      <span>
                        {deployment.url ??
                          deployment.customDomain ??
                          (deployment.createdAt ? formatBaseChatAstDateTime(language, deployment.createdAt) : null) ??
                          t('chat.copy.urlPending_6c60f919')}
                      </span>
                    </div>
                    <em data-status={deployment.status}>{platformStateLabel(t, deployment.status)}</em>
                  </header>
                  <div className="bolt-project-deploy-actions">
                    {deployment.url ? (
                      <a href={deployment.url} target="_blank" rel="noreferrer">
                        {t('chat.copy.open_cf9b7706')}
                      </a>
                    ) : null}
                    <ProjectDeploymentAction
                      intent="redeploy"
                      deploymentId={deployment.id}
                      onSubmit={onSubmit}
                      busy={busy}
                    >
                      {t('chat.copy.redeploy_620446dc')}
                    </ProjectDeploymentAction>
                    <ProjectDeploymentAction
                      intent="rollback"
                      deploymentId={deployment.id}
                      onSubmit={onSubmit}
                      busy={busy}
                    >
                      {t('chat.copy.rollback_f28daee2')}
                    </ProjectDeploymentAction>
                    <ProjectDeploymentAction
                      intent="cancel"
                      deploymentId={deployment.id}
                      onSubmit={onSubmit}
                      busy={busy}
                    >
                      {t('chat.copy.cancel_77dfd213')}
                    </ProjectDeploymentAction>
                  </div>
                </article>
              ))}
            </section>
          ) : null}

          <form onSubmit={onSubmit} className="bolt-project-deploy-wizard">
            {workspaceId ? <input type="hidden" name="workspaceId" value={workspaceId} /> : null}
            <h3>{t('chat.copy.deploymentWizard_3306b958')}</h3>
            <p>{t('chat.copy.usesTheExistingECodeBuild_2d40a6c6')}</p>
            <label>
              {t('chat.copy.provider_7ceee3f3')}
              <select name="provider" defaultValue="static">
                {BOLT_DEPLOY_PROVIDERS.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t('chat.copy.environment_d443a118')}
              <select name="environment" defaultValue="preview">
                <option value="preview">{t('chat.copy.preview_f1fbb2b4')}</option>
                <option value="staging">{t('chat.copy.staging_c9fb656c')}</option>
                <option value="production">{t('chat.copy.production_df70fc79')}</option>
              </select>
            </label>
            <label title={t('chat.copy.commandExecutedBeforeDeploymentToGenerate_87b85f3b')}>
              <span>{t('chat.copy.buildCommand_2740bf0b')}</span>
              <PanelInput
                name="buildCommand"
                defaultValue={DEFAULT_DEPLOY_BUILD_COMMAND}
                aria-label={t('chat.copy.buildCommand_2740bf0b')}
              />
              <small>{t('chat.copy.exampleNpmRunBuildPnpmBuild_cf3d34a0')}</small>
            </label>
            <label title={t('chat.copy.directoryContainingTheBuiltStaticAssets_26607c07')}>
              <span>{t('chat.copy.outputDirectory_ba9028f4')}</span>
              <PanelInput
                name="outputDirectory"
                defaultValue={DEFAULT_DEPLOY_OUTPUT_DIRECTORY}
                aria-label={t('chat.copy.outputDirectory_ba9028f4')}
              />
              <small>{t('chat.copy.forViteThisIsUsuallyDist_03b25ded')}</small>
            </label>
            <label title={t('chat.copy.detectedFrameworkUsedToChooseProvider_4dd054b6')}>
              <span>{t('chat.copy.frameworkDetected_7a55cf59')}</span>
              <PanelInput
                name="framework"
                placeholder={t('chat.copy.autoValue0_eef47a46', { value0: inferredFramework })}
                aria-label={t('chat.copy.frameworkDetected_7a55cf59')}
              />
              <small>{t('chat.copy.leaveBlankToLetECode_d7db4b95')}</small>
            </label>
            <label title={t('chat.copy.gitBranchOrWorkspaceBranchUsed_90c55da3')}>
              <span>{t('chat.copy.branch_1627510b')}</span>
              <PanelInput
                name="branch"
                placeholder={project.gitDefaultBranch ?? t('chat.copy.main_b28b7af6')}
                aria-label={t('chat.copy.deploymentBranch_1e947167')}
              />
              <small>{t('chat.copy.defaultsToTheProjectBranchWhen_3964715b')}</small>
            </label>
            <label title={t('chat.copy.optionalGitRemoteUrlUsedBy_d9896847')}>
              <span>{t('chat.copy.repositoryUrl_ca38850c')}</span>
              <PanelInput
                name="repositoryUrl"
                defaultValue={project.gitRepositoryUrl ?? ''}
                aria-label={t('chat.copy.repositoryUrl_ca38850c')}
              />
            </label>
            <label title={t('chat.copy.optionalDomainToAttachToThe_839fb219')}>
              <span>{t('chat.copy.customDomain_0354c889')}</span>
              <PanelInput
                name="customDomain"
                aria-label={t('chat.copy.customDomain_0354c889')}
                placeholder={codeExample('app.example.com')}
              />
            </label>
            <label title={t('chat.copy.plainEnvironmentVariablesAddedForThis_0d76b791')}>
              <span>{t('chat.copy.environmentVariables_1173b2e1')}</span>
              <textarea
                name="envVars"
                placeholder={t('chat.copy.keyValueAnotherKeyValue_36d39107')}
                aria-label={t('chat.copy.environmentVariables_1173b2e1')}
              />
              <small>{t('chat.copy.useKeyValuePairsOnePer_0a98c277')}</small>
            </label>
            <label title={t('chat.copy.commaSeparatedNamesOfExistingProject_93f64262')}>
              <span>{t('chat.copy.secretsToInject_5712dba7')}</span>
              <PanelInput
                name="injectSecrets"
                placeholder={t('chat.copy.databaseUrlStripeSecretKey_42eb88dc')}
                aria-label={t('chat.copy.secretsToInject_5712dba7')}
              />
            </label>
            <label className="bolt-project-checkbox-row">
              <input name="previewDeployment" type="checkbox" defaultChecked />
              {t('chat.copy.createPreviewUrlForNonProduction_9d087457')}
            </label>
            <PanelButton disabled={busy}>{t('chat.copy.deployProject_9e37b103')}</PanelButton>
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
  const { t, i18n } = useTranslation();
  const language = resolvedBaseChatLanguage(i18n);

  const normalized = rows.length
    ? rows
    : (events ?? []).map((event) => [
        formatProjectActivityAction(t, event.action),
        event.createdAt
          ? (formatBaseChatAstDateTime(language, event.createdAt) ?? t('baseChatAst.runtime.recordedByApi'))
          : t('baseChatAst.runtime.recordedByApi'),
      ]);

  if (!normalized.length) {
    /*
     * UNIF-IDE lot 1 : l'état vide passe par la carte canonique partagée
     * (PanelEmptyState → ui/EmptyState) au lieu d'une carte ad hoc alignée à
     * gauche — même rendu vide pour tous les panneaux qui listent via
     * PanelRows (Activity, Collaborators, Security, Debugger, Monitoring,
     * Settings, Integrations, …).
     */
    return <PanelEmptyState title={empty ?? t('chat.copy.noRecords_2cd2e011')} />;
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
  const { t } = useTranslation();

  const contextLabel = selectedFileLabel
    ? t('baseChatAst.mobile.focusedOn', { file: selectedFileLabel })
    : fileCount > 0
      ? t('baseChatAst.mobile.filesIndexed', { count: fileCount })
      : t('baseChatAst.mobile.contextReady');

  return (
    <section className="bolt-mobile-agent-start-state" aria-label={t('chat.copy.agentWorkspaceContext_c9e2d0ab')}>
      <div className="bolt-mobile-agent-start-card">
        <header>
          <span className="bolt-mobile-agent-start-icon">
            <MobileReplitAgentIcon />
          </span>
          <span>
            <strong>{isRunning ? t('chat.copy.working_3b4dfc97') : t('chat.copy.agentReady_07195d6a')}</strong>
            <small>{contextLabel}</small>
          </span>
          <span className="bolt-mobile-agent-start-status" data-running={isRunning ? 'true' : 'false'}>
            {isRunning ? t('chat.copy.live_65c821a5') : t('chat.copy.idle_cc1ebdd0')}
          </span>
        </header>
        <div className="bolt-mobile-agent-start-steps" aria-label={t('chat.copy.workspaceReadiness_c8a908ef')}>
          <div>
            <span className="i-ph:check-circle" aria-hidden />
            <span>{t('chat.copy.contextLoaded_fe9e1240')}</span>
          </div>
          <div>
            <span className="i-ph:code" aria-hidden />
            <span>
              {fileCount > 0
                ? t('chat.copy.value0Files_05f7ab26', { value0: fileCount })
                : t('chat.copy.filesReady_cf37cc0b')}
            </span>
          </div>
          <div>
            <span className="i-ph:monitor" aria-hidden />
            <span>{t('chat.copy.previewAvailable_4a051188')}</span>
          </div>
        </div>
      </div>

      {suggestions.length > 0 ? (
        <div className="bolt-mobile-agent-start-actions" aria-label={t('chat.copy.agentQuickActions_cfcfd957')}>
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

/**
 * RPL-IDE-001.5 — tool label as the All-tools popup shows it. Identical to
 * `panelTitle` apart from two labels the popup has always used: the editor reads
 * "Code" there, and the shell carries the deployment's configured terminal name.
 */
function toolDisplayTitle(tool: string, t: TFunction) {
  /*
   * T2 — pas d'exception pour `editor`. La palette doit nommer l'éditeur
   * EXACTEMENT comme son onglet : `panelTitle('editor')` rend « Éditeur ».
   * Un cas particulier renvoyant `baseChatAst.common.code` réintroduisait
   * « Code » dans la palette seule, et donc deux noms pour un même panneau.
   *
   * Le cas `terminal` ci-dessous, lui, reste : SHELL_TERMINAL_LABEL est un
   * libellé de marque gelé, utilisé partout ailleurs dans le fichier.
   */
  if (tool === 'terminal') {
    return SHELL_TERMINAL_LABEL;
  }

  return panelTitle(tool, t);
}

function panelTitle(panel: string, t?: TFunction) {
  const titleKeys: Record<string, keyof ReturnType<typeof getBaseChatAstCopy>> = {
    studio: 'baseChatAst.common.agentStudio',
    editor: 'baseChatAst.common.editor',
    preview: 'baseChatAst.common.webview',
    webview: 'baseChatAst.common.webview',
    console: 'baseChatAst.common.console',
    network: 'baseChatAst.common.network',
    database: 'baseChatAst.common.database',
    'object-storage': 'baseChatAst.common.objectStorage',
    packages: 'baseChatAst.common.packages',
    skills: 'baseChatAst.common.skills',
    monitoring: 'baseChatAst.common.monitoring',
    extensions: 'baseChatAst.common.extensions',
    integrations: 'baseChatAst.common.integrations',
    workflows: 'baseChatAst.common.workflows',
    debugger: 'baseChatAst.common.debugger',
    files: 'baseChatAst.common.library',
    search: 'baseChatAst.common.search',
    locks: 'baseChatAst.common.locks',
    overview: 'baseChatAst.common.overview',
    problems: 'baseChatAst.common.problems',
    deployments: 'baseChatAst.common.deployments',
    security: 'baseChatAst.common.security',
    env: 'baseChatAst.common.environmentVariables',
    secrets: 'baseChatAst.common.secrets',
    git: 'baseChatAst.common.git',
    activity: 'baseChatAst.common.activity',
    terminal: 'baseChatAst.common.shell',
    logs: 'baseChatAst.common.logs',
    ports: 'baseChatAst.common.ports',
    collaborators: 'baseChatAst.common.collaborators',
    domains: 'baseChatAst.common.domains',
    snapshots: 'baseChatAst.common.snapshots',
    settings: 'baseChatAst.common.settings',
  };

  const key = titleKeys[panel];

  if (key) {
    return t ? t(key) : getBaseChatAstCopy('en')[key];
  }

  /*
   * Repli anti-dérive (BUG-IDE-002, audit cluster D). Sans lui, un panneau
   * ajouté sans clé de traduction affiche son id brut : l'onglet lisait
   * « skills », le titre « studio » et l'état vide « No studio yet ». Le
   * catalogue de base porte déjà un nom produit pour chaque panneau, donc on
   * s'y rabat plutôt que d'entretenir une seconde liste qui redérivera au
   * prochain panneau ajouté.
   *
   * `ECODE_MOBILE_TAB_META_BASE` (module) et non `ECODE_MOBILE_TAB_META` : ce
   * dernier est mémoïsé DANS le composant et n'est pas visible ici.
   */
  return ECODE_MOBILE_TAB_META_BASE[panel]?.name ?? panel;
}

/*
 * UNIF-05 : `panelIcon` ne vit plus ici — le registre unique est
 * `~/components/project-ide/panel-meta` (PANEL_ICONS), consommé par les
 * onglets, le rail, la palette « + » et les tuiles mobile.
 */

function ScrollToBottom() {
  const { t } = useTranslation();
  const { isAtBottom, scrollToBottom } = useStickToBottomContext();

  /*
   * Apparaît dès qu'on n'est PLUS en bas — c'est tout.
   *
   * Il y avait ici un seuil supplémentaire de 240px, ajouté parce que le bouton
   * scintillait quand une carte de revue (~200px) arrivait en cours de stream.
   * Ce scintillement venait du défilement ANIMÉ : le ressort accusait un retard
   * sur la fin du contenu, on repassait donc brièvement « pas en bas ». Le
   * défilement étant désormais instantané (voir `resize` plus haut), la cause a
   * disparu et le seuil n'a plus lieu d'être — il ne faisait que retarder le
   * bouton de plus d'une demi-fenêtre sur un téléphone.
   *
   * `isAtBottom` porte déjà sa propre tolérance (`STICK_TO_BOTTOM_OFFSET_PX`,
   * 70px) : deux ou trois lignes qui s'ajoutent ne le font pas basculer.
   */
  if (isAtBottom) {
    return null;
  }

  return (
    <button
      type="button"
      className="bolt-agent-scroll-to-bottom"
      aria-label={t('chat.copy.scrollToTheLatestMessage_705d9356')}
      title={t('chat.copy.goToLastMessage_2d23b856')}
      onClick={() => scrollToBottom()}
    >
      <span className="i-ph:arrow-down" aria-hidden />
      {/* Le libellé est VISIBLE, pas seulement lu par un lecteur d'écran : une
          icône seule n'annonce pas ce qu'elle fait à qui ne la connaît pas. */}
      <span className="bolt-agent-scroll-to-bottom__label">{t('chat.copy.scrollToLatest')}</span>
    </button>
  );
}
