/* eslint-disable import/order */
import { Octokit, type RestEndpointMethodTypes } from '@octokit/rest';
import type { CommandEvent, CommandRequest, RuntimeAdapter, WorkspaceSession } from '@vibecore/runtime-contract';
import fileSaver from 'file-saver';
import Cookies from 'js-cookie';
import JSZip from 'jszip';
import { atom, map, type MapStore, type ReadableAtom, type WritableAtom } from 'nanostores';
import { toast } from 'react-toastify';
import { confirmWriteWithinDeadline, WRITE_CONFIRMATION_TIMEOUT_MS } from '~/lib/runtime/confirm-write';
import { EditorStore } from './editor';
import { fileHistoryStore } from './fileHistory';
import { FilesStore, type FileMap, type ProjectStorageFile, type SaveFileOptions } from './files';
import {
  appendWorkspaceLogLines,
  decodeArchiveEntry,
  isTransientCommandFailure,
  shouldUseExistingPreviewServer,
  workspaceNeedsReprovision,
} from './preview-recovery';
import { isPreviewHealthy, shouldAutoDismissPreviewAlert } from './preview-alert-autodismiss';
import { PreviewsStore } from './previews';
import { TerminalStore } from './terminal';
import type { EditorDocument, ScrollPosition } from '~/components/editor/codemirror/CodeMirrorEditor';
import { description } from '~/lib/persistence';
import {
  formatWorkbenchRuntimeCopy,
  getWorkbenchRuntimeCopy,
  type WorkbenchRuntimeKey,
} from '~/lib/i18n/catalogs/workbench-runtime';
import { getI18nInstance } from '~/lib/i18n/runtime';
import {
  deleteAgentPatchProposalRemote,
  fetchOpenAgentPatchProposals,
  isTerminalAgentPatchStatus,
  putAgentPatchProposal,
} from '~/lib/persistence/agentPatchProposalSync';
import { recordAgentRepairEvent } from '~/lib/persistence/agentRepairEventSync';
import { getRuntimeAdapter } from '~/lib/runtime/RuntimeAdapterProvider';
import { foldCommandExitCode } from '~/lib/runtime/command-exit';
import { ActionRunner } from '~/lib/runtime/action-runner';
import { hasInstalledPreviewDependencies, type PreviewPackageManifest } from '~/lib/runtime/preview-dependencies';
import { buildPreviewManifestRepair } from '~/lib/runtime/preview-manifest';
import { runProjectDoctor } from '~/lib/runtime/project-doctor';
import { collectRuntimeTextFiles } from '~/lib/runtime/runtime-files';
import { withRuntimeRetry } from '~/lib/runtime/retry';
import { writeAcceptedAgentFile } from '~/lib/runtime/agent-file-write';
import { topologicallySortFileActions } from '~/lib/runtime/topological-apply';
import { workspaceEvents } from '~/lib/runtime/workspace-events';
import { reportOptTelemetry } from '~/lib/telemetry/report-opt-telemetry';
import type { ActionCallbackData, ArtifactCallbackData } from '~/lib/runtime/message-parser';
import { validateGeneratedFile, validateGeneratedFiles, type GeneratedFile } from '~/services/agent/post-validate';
import type { ITerminal } from '~/types/terminal';
import { path } from '~/utils/path';
import { unreachable } from '~/utils/unreachable';
import { GitLabApiService } from '~/lib/services/gitlabApiService';
import { WORK_DIR } from '~/utils/constants';
import {
  applyReviewableDiffHunks,
  buildReviewableDiffHunks,
  extractRelativePath,
  type ReviewableDiffHunk,
} from '~/utils/diff';
import {
  dropFailedPatchLogsForPath,
  dropResolvedMissingImportPatchLogs,
  isResolvedMissingImportPatchFailure,
} from '~/utils/agent-patch-logs';
import { mergeJsonContent } from '~/lib/chat/merge-json-content';
import { resolveFailedAgentPatchContent } from '~/lib/stores/agent-patch-fallback';
import { reconcileRemoteWrite } from '~/lib/stores/reconcile-remote-write';
import { KeyedMutex } from '~/lib/common/keyed-mutex';
import { createSampler } from '~/utils/sampler';
import { syncWriteContent } from '~/lib/stores/workbench-sync';
import type { ActionAlert, DeployAlert, SupabaseAlert } from '~/types/actions';

const { saveAs } = fileSaver;

function workbenchText(key: WorkbenchRuntimeKey, values: Readonly<Record<string, string | number>> = {}): string {
  const i18n = getI18nInstance();
  const copy = getWorkbenchRuntimeCopy(i18n.resolvedLanguage ?? i18n.language);

  return formatWorkbenchRuntimeCopy(copy[key], values);
}

export interface ArtifactState {
  id: string;
  title: string;
  type?: string;
  closed: boolean;
  runner: ActionRunner;
}

export type ArtifactUpdateState = Pick<ArtifactState, 'title' | 'closed'>;

type Artifacts = MapStore<Record<string, ArtifactState>>;
type PreviewCommand = {
  command: string;
  args: string[];
  label: string;
  cwd?: string;
  setupCommands?: PreviewCommand[];
};
type ProjectExportResponse = {
  archive?: {
    base64?: string;
  };
};
export type PreviewServerState = {
  status: 'idle' | 'static' | 'starting' | 'running' | 'stopping' | 'error';
  command?: string;
  error?: string;
};

export type WorkbenchViewType = 'code' | 'diff' | 'preview' | 'git';
export type ProjectFilesPanelRequest = {
  open?: boolean;
  requestId: number;
};
export type AgentPatchProposalStatus = 'pending' | 'applying' | 'accepted' | 'rejected' | 'failed' | 'reverted';
export interface AgentPatchProposal {
  id: string;
  artifactId: string;
  messageId: string;
  actionId: string;
  filePath: string;
  relativePath: string;
  originalContent: string;
  proposedContent: string;
  hunks: ReviewableDiffHunk[];
  status: AgentPatchProposalStatus;
  createdAt: string;
  updatedAt: string;
  error?: string;
}

const WORKSPACE_LOG_LIMIT = 500;
const WORKSPACE_LOG_FLUSH_INTERVAL_MS = 100;

/*
 * Bounded retry for a preview SETUP command (npm/pnpm/yarn install). A freshly
 * provisioned pod is most fragile during the long install: the workspace-agent
 * WS can drop mid-stream (surfaced as a synthetic "stream closed before
 * completion"), the LB can idle-kill it, or a registry blip can 502. Those are
 * worth re-running; a deterministic install error (unknown package, ERESOLVE)
 * is not. Total attempts = 1 try + 2 retries, with exponential backoff.
 */
const PREVIEW_SETUP_RETRY_ATTEMPTS = 3;
const PREVIEW_SETUP_RETRY_BASE_DELAY_MS = 1000;
const ANSI_ESCAPE_SEQUENCE = /\x1B\[[0-?]*[ -/]*[@-~]/g;
const WORKSPACE_LOG_NOISE_PATTERNS = [/malloc.*stack logging.*not enabled/i];

/*
 * Sampling window for the AI streaming-action runner. Each token chunk
 * carries a partial action update; running them all would saturate the
 * preview filesystem with intermediate writes. 100 ms keeps the UI
 * responsive (≈10 updates/s feels live) while collapsing the dozens of
 * chunks that arrive within a single render frame into a single apply.
 */
const ACTION_STREAM_SAMPLE_INTERVAL_MS = 100;

const PROJECT_STORAGE_SYNC_EXCLUDED_DIRECTORIES = new Set([
  '.git',
  '.next',
  '.turbo',
  '.vite',
  '.cache',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'out',
]);

const PROJECT_STORAGE_SYNC_EXCLUDED_FILES = new Set(['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', '.DS_Store']);
const PROJECT_STORAGE_SYNC_MAX_FILE_BYTES = 512_000;
const PROJECT_STORAGE_SYNC_MAX_TOTAL_BYTES = 4_000_000;
const PROJECT_ARCHIVE_TEXT_DECODER = new TextDecoder('utf-8', { fatal: true });
const hotData = import.meta.hot?.data ?? {};

/*
 * Encode raw bytes as standard base64. Chunked through String.fromCharCode so a
 * large asset can't blow the argument-count limit, and falls back to Buffer in
 * non-browser (SSR/test) contexts where btoa is absent. Mirrors the
 * base64ToUint8Array reader in FileTree (plain atob-decodable base64).
 */
function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';

  const CHUNK_SIZE = 0x8000;

  for (let index = 0; index < bytes.length; index += CHUNK_SIZE) {
    const chunk = bytes.subarray(index, index + CHUNK_SIZE);
    binary += String.fromCharCode(...chunk);
  }

  if (typeof btoa === 'function') {
    return btoa(binary);
  }

  return Buffer.from(binary, 'binary').toString('base64');
}

function workspaceLogLines(event: CommandEvent | string) {
  const rawLine = typeof event === 'string' ? event : event.data || event.error?.message || event.type;

  return rawLine
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => {
      const normalizedLine = line.replace(ANSI_ESCAPE_SEQUENCE, '').trim();

      return normalizedLine.length > 0 && !WORKSPACE_LOG_NOISE_PATTERNS.some((pattern) => pattern.test(normalizedLine));
    });
}

export class WorkbenchStore {
  #runtime: RuntimeAdapter = getRuntimeAdapter();
  #previewsStore = new PreviewsStore(this.#runtime);
  #filesStore = new FilesStore(this.#runtime);
  #editorStore = new EditorStore(this.#filesStore);
  #terminalStore = new TerminalStore(this.#runtime);

  #reloadedMessages = new Set<string>();
  #previewStartPromise: Promise<string> | undefined;

  /*
   * Synchronous in-flight guard: #previewStartPromise is only set late (after the
   * install/detect awaits), so two concurrent startPreviewServer calls could both
   * pass that check and launch two dev servers. This flag is set synchronously at
   * entry to dedup them.
   */
  #previewStarting = false;
  #previewCommandRunning = false;
  #projectId: string | undefined;
  #autosaveTimers = new Map<string, ReturnType<typeof setTimeout>>();

  /*
   * Coalesce workspace-log appends. A streamed install/build emits hundreds of
   * lines in a burst; a workspaceLogs.set() per line re-rendered the whole IDE
   * shell on every line. We buffer incoming lines and flush them on a short timer
   * (mirroring the PORT_REFRESH_THROTTLE pattern), collapsing a burst into a
   * handful of store updates.
   */
  #pendingWorkspaceLogLines: string[] = [];
  #workspaceLogFlushTimer: ReturnType<typeof setTimeout> | undefined;

  artifacts: Artifacts = hotData.artifacts ?? map({});

  showWorkbench: WritableAtom<boolean> = hotData.showWorkbench ?? atom(false);
  currentView: WritableAtom<WorkbenchViewType> = hotData.currentView ?? atom('code');
  unsavedFiles: WritableAtom<Set<string>> = hotData.unsavedFiles ?? atom(new Set<string>());
  actionAlert: WritableAtom<ActionAlert | undefined> = hotData.actionAlert ?? atom<ActionAlert | undefined>(undefined);
  supabaseAlert: WritableAtom<SupabaseAlert | undefined> =
    hotData.supabaseAlert ?? atom<SupabaseAlert | undefined>(undefined);
  deployAlert: WritableAtom<DeployAlert | undefined> = hotData.deployAlert ?? atom<DeployAlert | undefined>(undefined);
  modifiedFiles = new Set<string>();
  artifactIdList: string[] = [];
  workspaceStatus: WritableAtom<WorkspaceSession | undefined> =
    hotData.workspaceStatus ?? atom<WorkspaceSession | undefined>(undefined);
  workspaceLoading: WritableAtom<boolean> = hotData.workspaceLoading ?? atom(false);
  workspaceError: WritableAtom<string | undefined> = hotData.workspaceError ?? atom<string | undefined>(undefined);
  workspaceLogs: WritableAtom<string[]> = hotData.workspaceLogs ?? atom<string[]>([]);
  previewServerState: WritableAtom<PreviewServerState> =
    hotData.previewServerState ?? atom<PreviewServerState>({ status: 'idle' });

  /**
   * True once the file map has been CONFIRMED hydrated (loaded from the runtime
   * or project storage at least once) for the currently-configured project.
   * Reset to false on every project switch and flipped back to true when a load
   * settles. The pending-prompt replay gate keys off this so a not-yet-loaded
   * empty snapshot is never mistaken for an ungenerated project (which would
   * regenerate over an existing app on reopen).
   */
  filesHydrated: WritableAtom<boolean> = hotData.filesHydrated ?? atom(false);
  projectFilesPanelOpen: WritableAtom<boolean> = hotData.projectFilesPanelOpen ?? atom(true);
  projectFilesPanelRequest: WritableAtom<ProjectFilesPanelRequest | undefined> =
    hotData.projectFilesPanelRequest ?? atom<ProjectFilesPanelRequest | undefined>(undefined);
  agentPatchReviewRequired: WritableAtom<boolean> = hotData.agentPatchReviewRequired ?? atom<boolean>(false);

  /*
   * Per-filePath self-repair progress mirrored from the
   * `agent:self-repair:progress` workspace event. Keyed by the action's
   * runtime-relative path; the MessagePatchReview surface looks up
   * `proposal.relativePath` in this map to surface the "Self-repair
   * attempt N/M…" banner on the matching InlineFileActionDiff card.
   */
  agentPatchSelfRepair: MapStore<Record<string, { attempt: number; maxAttempts: number; errorMessage?: string }>> =
    hotData.agentPatchSelfRepair ??
    map<Record<string, { attempt: number; maxAttempts: number; errorMessage?: string }>>({});
  agentPatchProposals: MapStore<Record<string, AgentPatchProposal>> =
    hotData.agentPatchProposals ?? map<Record<string, AgentPatchProposal>>({});
  quotaWarning: WritableAtom<string | undefined> = hotData.quotaWarning ?? atom<string | undefined>(undefined);
  billingUpgradePrompt: WritableAtom<string | undefined> =
    hotData.billingUpgradePrompt ?? atom<string | undefined>(undefined);
  #snapshottedArtifacts = new Set<string>();

  /*
   * Paths already materialized in the runtime by the streaming sampler.
   *
   * BUG-AGENT-001. The streaming branch of `#processFileAction` wrote the file
   * to the runtime whenever the editor had no document for it. That guard never
   * closed, because `EditorStore.updateFile` no-ops when the document is
   * missing instead of creating it — so a FULL-FILE write left every 100ms
   * (`ACTION_STREAM_SAMPLE_INTERVAL_MS`) for as long as the file streamed.
   * Measured live: 150 writes for 9 files (55 for one single file), 750 for 20
   * in the QA run. Those writes are chained on one serial promise, so the
   * authoritative close-writes queued behind them had not drained when the
   * stream ended — and `abortStreamingFileActions` then cancelled the backlog,
   * so the files were NEVER written to the runtime.
   *
   * One materialization per path is all the guard was ever after.
   */
  #streamMaterializedPaths = new Set<string>();
  #agentPatchOriginals = new Map<string, string>();

  /*
   * Serializes agent-patch applies per file path so two multi-agent lanes never
   * apply to the same file (package.json, index.html) at once — the interleave
   * that surfaced as "Remote file changed since it was loaded".
   */
  #agentPatchApplyMutex = new KeyedMutex();
  #runtimeFilesLoadedProjectId: string | undefined;
  #globalExecutionQueue = Promise.resolve();
  constructor() {
    if (import.meta.hot) {
      const writableHot = import.meta.hot as unknown as { data?: Record<string, unknown> };
      const writableHotData = (writableHot.data ??= {});

      writableHotData.artifacts = this.artifacts;
      writableHotData.unsavedFiles = this.unsavedFiles;
      writableHotData.showWorkbench = this.showWorkbench;
      writableHotData.currentView = this.currentView;
      writableHotData.agentPatchReviewRequired = this.agentPatchReviewRequired;
      writableHotData.agentPatchProposals = this.agentPatchProposals;
      writableHotData.agentPatchSelfRepair = this.agentPatchSelfRepair;
      writableHotData.actionAlert = this.actionAlert;
      writableHotData.supabaseAlert = this.supabaseAlert;
      writableHotData.deployAlert = this.deployAlert;
      writableHotData.workspaceStatus = this.workspaceStatus;
      writableHotData.workspaceLoading = this.workspaceLoading;
      writableHotData.workspaceError = this.workspaceError;
      writableHotData.workspaceLogs = this.workspaceLogs;
      writableHotData.previewServerState = this.previewServerState;
      writableHotData.filesHydrated = this.filesHydrated;
      writableHotData.projectFilesPanelOpen = this.projectFilesPanelOpen;
      writableHotData.projectFilesPanelRequest = this.projectFilesPanelRequest;
      writableHotData.quotaWarning = this.quotaWarning;
      writableHotData.billingUpgradePrompt = this.billingUpgradePrompt;

      // Ensure binary files are properly preserved across hot reloads
      const filesMap = this.files.get();

      for (const [path, dirent] of Object.entries(filesMap)) {
        if (dirent?.type === 'file' && dirent.isBinary && dirent.content) {
          // Make sure binary content is preserved
          this.files.setKey(path, { ...dirent });
        }
      }
    }

    workspaceEvents.on('agent:self-repair:progress', ({ filePath, status }) => {
      if (status) {
        this.agentPatchSelfRepair.setKey(filePath, status);
      } else {
        const current = { ...this.agentPatchSelfRepair.get() };

        if (filePath in current) {
          delete current[filePath];
          this.agentPatchSelfRepair.set(current);
        }
      }
    });

    /*
     * Mirror each terminal self-repair outcome to the durable audit log so the
     * repair review UI survives a reload. Best-effort: the sync helper swallows
     * failures, and we only fire when a project is bound (Bolt standalone has
     * no projectId / no API route).
     */
    workspaceEvents.on('agent:self-repair:event', ({ filePath, outcome, attempt, validationError, repairError }) => {
      const projectId = this.#projectId;

      if (!projectId) {
        return;
      }

      void recordAgentRepairEvent(projectId, {
        relativePath: filePath,
        outcome,
        attempt,
        validationError,
        repairError,
      });
    });

    /*
     * Forward each diff-edit apply outcome to the server telemetry sink so the
     * estimatedTokensSaved is greppable in prod pod logs (`opt.telemetry`), not
     * just the browser console. Fire-and-forget + best-effort — the helper never
     * throws and never blocks the apply path; `hunkStatuses` is dropped server-side.
     */
    workspaceEvents.on('agent:diff-edit:apply', (payload) => {
      reportOptTelemetry({
        type: 'diff-edit-apply',
        chatId: this.#projectId ?? undefined,
        outcome: payload.outcome,
        filePath: payload.filePath,
        blockCount: payload.blockCount,
        addedLines: payload.addedLines,
        removedLines: payload.removedLines,
        hunkCount: payload.hunkCount,
        fellBackToFullFile: payload.fellBackToFullFile,
        failureKind: payload.failureKind,
        estimatedTokensSaved: payload.estimatedTokensSaved,
      });
    });

    /*
     * BUG-UX-PREVIEW-ERROR-STICKY — la carte « Erreur d'aperçu » se retire toute
     * seule quand l'aperçu redevient sain. Détection par FRONT malade → sain sur
     * le store des previews (un port `ready` réapparaît) : voir
     * preview-alert-autodismiss.ts pour la règle exacte et pourquoi une alerte
     * posée pendant que l'aperçu est déjà sain n'est jamais balayée.
     */
    let previewWasHealthy = isPreviewHealthy(this.previews.get());

    this.previews.subscribe((previews) => {
      const previewIsHealthy = isPreviewHealthy(previews);

      if (
        shouldAutoDismissPreviewAlert({
          wasHealthy: previewWasHealthy,
          isHealthy: previewIsHealthy,
          alert: this.actionAlert.get(),
        })
      ) {
        this.actionAlert.set(undefined);
      }

      previewWasHealthy = previewIsHealthy;
    });
  }

  requestProjectFilesPanel(open?: boolean) {
    this.projectFilesPanelRequest.set({ open, requestId: Date.now() });
  }

  configureRuntime(runtime: RuntimeAdapter) {
    if (this.#runtime === runtime) {
      return;
    }

    this.#runtime = runtime;
    this.#previewsStore.setRuntime(runtime);
    this.#filesStore.setRuntime(runtime);
    this.#terminalStore.setRuntime(runtime);
    this.artifacts.set({});
    this.artifactIdList = [];
    this.#snapshottedArtifacts.clear();
  }

  configureProject(projectId?: string) {
    const changed = this.#projectId !== projectId;
    this.#projectId = projectId;

    // Bind per-file History (append-only, independent of Git) to this project.
    fileHistoryStore.configure(projectId);

    if (changed) {
      this.#runtimeFilesLoadedProjectId = undefined;
      this.filesHydrated.set(false);

      /*
       * Clear per-project state before (re)hydrating. The workbench is a module
       * singleton, so without this reset project A's pending patch proposals,
       * their captured original contents, the self-repair tracker, and the
       * unsaved-file set all leak into project B — and #hydrateAgentPatchProposals
       * merges (setKey) project B's proposals on top of the stale A entries.
       * Accepting a leaked proposal would then apply A's diff against B's files.
       */
      this.#resetProjectScopedState();
    }

    /*
     * Hydrate the AgentPatchProposal queue from the server every time the
     * workbench rebinds to a different project. The fetch is best-effort
     * (logs + empty list on failure), so a slow or unavailable API doesn't
     * block the IDE booting; the nanostore remains the source of truth.
     */
    if (changed && projectId) {
      void this.#hydrateAgentPatchProposals(projectId);
    }
  }

  #resetProjectScopedState() {
    this.agentPatchProposals.set({});
    this.#agentPatchOriginals.clear();
    this.agentPatchSelfRepair.set({});
    this.unsavedFiles.set(new Set<string>());

    /*
     * Cancel pending autosave timers from the previous project/runtime. Left
     * running, a stale timer fires after the workbench re-binds and writes the
     * old project's buffered content into the NEW project's runtime (data
     * corruption), and leaks a timer per switch.
     */
    for (const timer of this.#autosaveTimers.values()) {
      clearTimeout(timer);
    }

    this.#autosaveTimers.clear();

    /*
     * Drop any buffered workspace-log lines and the pending flush timer from the
     * previous project/runtime. Left alone, a timer scheduled by project A fires
     * after the provider resets workspaceLogs to [] for project B and flushes
     * A's buffered lines into B's freshly-reset log atom (cross-project log
     * leak), and the stale buffer/timer persist across switches.
     */
    if (this.#workspaceLogFlushTimer) {
      clearTimeout(this.#workspaceLogFlushTimer);
      this.#workspaceLogFlushTimer = undefined;
    }

    this.#pendingWorkspaceLogLines = [];
  }

  async #hydrateAgentPatchProposals(projectId: string) {
    const proposals = await fetchOpenAgentPatchProposals(projectId);

    if (this.#projectId !== projectId) {
      // The workbench has been re-bound to another project while we waited.
      return;
    }

    for (const proposal of proposals) {
      const existing = this.agentPatchProposals.get()[proposal.id];

      if (existing && existing.updatedAt >= proposal.updatedAt) {
        /*
         * Local copy is at least as fresh — typically because the streaming
         * action runner re-created the proposal between our fetch firing
         * and resolving. Don't clobber the more recent local state.
         */
        continue;
      }

      this.agentPatchProposals.setKey(proposal.id, proposal);
      this.#agentPatchOriginals.set(proposal.actionId, proposal.originalContent);
    }

    this.#dropResolvedMissingImportFailures();
  }

  #syncAgentPatchProposalToServer(proposalId: string) {
    const projectId = this.#projectId;

    if (!projectId) {
      return;
    }

    const proposal = this.agentPatchProposals.get()[proposalId];

    if (!proposal) {
      void deleteAgentPatchProposalRemote(projectId, proposalId);
      return;
    }

    if (isTerminalAgentPatchStatus(proposal.status)) {
      void deleteAgentPatchProposalRemote(projectId, proposalId);
      return;
    }

    void putAgentPatchProposal(projectId, proposal);
  }

  async loadRuntimeFiles(rootPath = '.') {
    let runtimeError: unknown;

    try {
      await this.#filesStore.reloadFromRuntime(rootPath);
    } catch (error) {
      runtimeError = error;
    }

    if (runtimeError || (this.#projectId && this.#filesStore.filesCount === 0)) {
      const loadedFromProjectStorage = await this.loadProjectStorageFiles().catch((error) => {
        if (runtimeError) {
          throw runtimeError;
        }

        throw error;
      });

      if (loadedFromProjectStorage) {
        return;
      }

      if (runtimeError) {
        throw runtimeError;
      }
    }

    this.setDocuments(this.files.get());
    this.#runtimeFilesLoadedProjectId = this.#projectId;
    this.#markFilesHydrated(this.#projectId);
    this.#dropResolvedMissingImportFailures();
  }

  async loadProjectStorageFiles() {
    const projectId = this.#projectId;

    if (!projectId) {
      return false;
    }

    const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/export/zip`, {
      credentials: 'include',
      headers: { accept: 'application/json' },
    });

    if (!response.ok) {
      throw Object.assign(new Error(), { code: 'PROJECT_FILE_ARCHIVE_HTTP_ERROR', status: response.status });
    }

    const payload = (await response.json()) as ProjectExportResponse;

    if (this.#projectId !== projectId) {
      return false;
    }

    const archiveBase64 = payload.archive?.base64;

    if (!archiveBase64) {
      return false;
    }

    const files = await this.#projectStorageFilesFromArchive(archiveBase64);

    if (this.#projectId !== projectId) {
      return false;
    }

    if (!files.length) {
      return false;
    }

    this.#filesStore.replaceWithProjectStorageFiles(files);
    this.setDocuments(this.files.get());
    this.#runtimeFilesLoadedProjectId = projectId;
    this.#markFilesHydrated(projectId);
    this.#dropResolvedMissingImportFailures();

    return true;
  }

  /**
   * Flip the reactive `filesHydrated` flag once a load has settled for the given
   * project — but only if it's still the active project (a slow load that
   * resolves after the user switched projects must not mark the NEW project as
   * hydrated with the OLD project's data). The pending-prompt replay gate reads
   * this to know the empty→populated transition is complete.
   */
  #markFilesHydrated(projectId: string | undefined) {
    if (!projectId || this.#projectId !== projectId) {
      return;
    }

    if (!this.filesHydrated.get()) {
      this.filesHydrated.set(true);
    }
  }

  async #projectStorageFilesFromArchive(archiveBase64: string): Promise<ProjectStorageFile[]> {
    const zip = await JSZip.loadAsync(archiveBase64, { base64: true });
    const files: ProjectStorageFile[] = [];

    for (const entry of Object.values(zip.files)) {
      if (entry.dir) {
        continue;
      }

      const bytes = await entry.async('uint8array');

      /*
       * Binary entries (image/font/etc.) are kept as base64 instead of dropped:
       * the FileTree copy/duplicate path reads isBinary entries via
       * base64ToUint8Array(content), so empty content produced a 0-byte file and
       * the asset could never render. Standard base64 (atob-decodable) matches
       * that reader.
       */
      const decoded = decodeArchiveEntry(
        bytes,
        (input) => PROJECT_ARCHIVE_TEXT_DECODER.decode(input),
        uint8ArrayToBase64,
      );

      files.push({ path: entry.name, content: decoded.content, isBinary: decoded.isBinary });
    }

    return files;
  }

  refreshAllPreviews() {
    this.#previewsStore.refreshAllPreviews();
  }

  async refreshRuntimePorts() {
    await this.#previewsStore.refreshPorts();

    /*
     * BUG-UX-DEV-BLOCKED-STUCK: a latched `error` state (transient "stream
     * closed" on reopen, a dead first launch…) must RESOLVE the moment a port is
     * really up. `serving === true` (HTTP answers + live process, server-side
     * probe) counts even while the aggregate `ready` is still vetoed by a
     * lagging manager status / stale client beacon — otherwise the status bar
     * sat on "Dev: blocked" over a serving app.
     */
    if (this.previews.get().some((preview) => preview.ready !== false || preview.serving === true)) {
      const current = this.previewServerState.get();
      this.previewServerState.set({ status: 'running', command: current.command });
    }
  }

  async startPreviewServer(options: { forceInstall?: boolean; forceRestart?: boolean } = {}) {
    /*
     * Dedup concurrent starts synchronously (before any await) — see #previewStarting.
     * A USER-initiated recovery (Run / Reinstall → forceRestart) must bypass this
     * dedup: a PRIOR start that WEDGED (an unbounded runtime await in
     * #runStartPreviewServer never returned, so #previewStarting/#previewStartPromise
     * were never cleared) would otherwise make every subsequent start — including the
     * Run button — early-return the dead promise and relaunch NOTHING. That is the
     * "Run does nothing" no-op. On an explicit forceRestart we punch through and
     * relaunch for real.
     */
    const forceRestart = options.forceRestart ?? false;

    if (!forceRestart && this.#previewStartPromise) {
      return this.#previewStartPromise;
    }

    if (!forceRestart && this.#previewStarting) {
      return workbenchText('workbenchRuntime.preview.starting');
    }

    this.#previewStarting = true;

    try {
      return await this.#runStartPreviewServer(options);
    } finally {
      this.#previewStarting = false;
    }
  }

  async #runStartPreviewServer(options: { forceInstall?: boolean; forceRestart?: boolean } = {}) {
    const forceInstall = options.forceInstall ?? false;
    const forceRestart = options.forceRestart ?? false;
    const previousPreviewState = this.previewServerState.get();

    if (
      previousPreviewState.status !== 'starting' &&
      previousPreviewState.status !== 'running' &&
      previousPreviewState.status !== 'static'
    ) {
      this.previewServerState.set({
        status: 'starting',
        command: previousPreviewState.command ?? workbenchText('workbenchRuntime.preview.detecting'),
      });
    }

    /*
     * BUG-IDE-PANEL-RECLICK-REPROVISION-001 — reattach fast-path evaluated
     * BEFORE any recovery. A redundant, NON-forced start against an
     * already-serving preview (re-clicking the active Webview tab, a panel
     * re-activation, a stray auto-kick) must be a strict no-op: no
     * #ensureWorkspaceProvisioned (a stale stopped/error status in the store
     * would replace the LIVE pod), no manifest sync, no install and no
     * stopPreviewServer (which killed the healthy dev command mid-stream).
     * Live repro (24/08, desktop prod): re-clicking the active Webview tab
     * reprovisioned the workspace, collapsed the file tree from 12 to 1 file
     * and killed the running preview command ("Command stream closed before
     * completion / exited with code 1"). The ports snapshot is refreshed first
     * so the decision sees reality, and a genuinely dead pod fails the
     * ready/deps probes and falls through to the recovery path below.
     */
    if (!forceInstall && !forceRestart) {
      await this.refreshRuntimePorts().catch(() => undefined);

      if (this.#previewStartPromise) {
        return this.#previewStartPromise;
      }

      if (await this.#canShortCircuitToExistingPreview()) {
        this.previewServerState.set({ status: 'running' });
        this.appendWorkspaceLog(workbenchText('workbenchRuntime.preview.reattached'));

        return workbenchText('workbenchRuntime.preview.reattachedResult');
      }
    }

    /*
     * Recover a reaped workspace before doing anything else. The Run / Reinstall
     * buttons issue dev-server commands at the EXISTING workspace pod; once the
     * manager has reconciled the pod away (status stopped/error) those commands
     * just fail again. Reprovision the pod first so the recovery buttons actually
     * revive a dead workspace, not only a stopped dev process.
     */
    await this.#ensureWorkspaceProvisioned();

    await this.refreshRuntimePorts().catch(() => undefined);

    if (!forceRestart && this.#previewStartPromise) {
      return this.#previewStartPromise;
    }

    if (this.#canUseStaticHtmlPreview()) {
      const staticPreview = workbenchText('workbenchRuntime.preview.staticCommand');
      this.previewServerState.set({ status: 'static', command: staticPreview });
      this.appendWorkspaceLog(workbenchText('workbenchRuntime.preview.staticReady'));

      return staticPreview;
    }

    if (!this.#findPackageJsonEntry()) {
      await this.loadRuntimeFiles('.').catch(() => {
        this.appendWorkspaceLog(workbenchText('workbenchRuntime.preview.reloadFailed'));
      });
    }

    /*
     * Reattach fast-path (reopen of a still-running workspace). If the pod is
     * already serving a genuinely-ready port with its dependencies installed,
     * adopt that dev server AS-IS instead of cold-rebuilding it: skip the
     * manifest sync / install / dev-server relaunch below, which would needlessly
     * stop and restart an app that is already up (the "from-scratch rebuild on
     * reopen" the resume path exists to avoid). A manual Reinstall (forceInstall)
     * or a manual Run (forceRestart) always bypasses this — the user asked to
     * relaunch, and adopting a "detected-ready" port that is actually a DYING
     * untracked PTY dev server (bound 5173 then crashing) is exactly how Run
     * became a no-op that reattaches to a corpse. Evaluating it BEFORE the manifest
     * sync is what prevents a spurious dependenciesChanged from tearing down a live
     * server on a NON-forced (auto) start.
     */
    if (!forceInstall && !forceRestart && (await this.#canShortCircuitToExistingPreview())) {
      this.previewServerState.set({ status: 'running' });
      this.appendWorkspaceLog(workbenchText('workbenchRuntime.preview.reattached'));

      return workbenchText('workbenchRuntime.preview.reattachedResult');
    }

    let dependenciesChanged = false;

    dependenciesChanged = await this.#syncPreviewManifestFromRuntime().catch(() => {
      this.appendWorkspaceLog(workbenchText('workbenchRuntime.preview.dependencySyncSkipped'));

      return false;
    });

    const shouldInstall = dependenciesChanged || forceInstall;

    if (shouldInstall || this.#findPackageJsonEntry()) {
      await this.loadRuntimeFiles('.').catch(() => undefined);
    }

    if (shouldInstall || forceRestart) {
      /*
       * A forced restart always tears down first, so the relaunch below reaches
       * streamCommand — where the agent's conflict-heal frees port 5173 from ANY
       * holder (including the untracked jsh-PTY dev server that stopPreviewServer's
       * tracked-only kill cannot reap) before binding a fresh, tracked dev server.
       */
      await this.stopPreviewServer();
    } else if (await this.#canShortCircuitToExistingPreview()) {
      this.previewServerState.set({ status: 'running' });
      return workbenchText('workbenchRuntime.preview.existingResult');
    }

    let command: PreviewCommand;

    try {
      command = await this.#detectPreviewCommand(shouldInstall);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.previewServerState.set({
        status: 'error',
        command: previousPreviewState.command ?? workbenchText('workbenchRuntime.preview.detecting'),
        error: message,
      });
      this.appendWorkspaceLog(message);

      throw error;
    }

    /*
     * Bulletproof install guarantee. Whatever command detection chose (including
     * a bare `npx vite`, or a path that ran before package.json content was
     * hydrated), a project with runtime dependencies whose node_modules is still
     * missing MUST install first — otherwise vite serves with the app's imports
     * (react, etc.) unresolved and the preview 404s/blanks. Prepend the install
     * setup command if it isn't already there. Best-effort: a runtime probe
     * failure leaves the detected command untouched.
     */
    try {
      const pkgEntry = this.#findPackageJsonEntry();

      if (pkgEntry && pkgEntry[1]?.type === 'file') {
        let pkg: PreviewPackageManifest = {};

        if (pkgEntry[1].content) {
          try {
            pkg = JSON.parse(pkgEntry[1].content) as PreviewPackageManifest;
          } catch {
            pkg = {};
          }
        }

        const hasRuntimeDeps = Object.keys({ ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) }).some(
          (dep) => dep !== 'vite' && dep !== 'typescript',
        );

        /*
         * FAIL CLOSED: if the "are dependencies installed?" probe itself fails (the
         * runtime is transiently unreachable — a 502 during provisioning, the exact
         * window this bulletproof guard exists for), assume NOT installed and run the
         * install. The old `.catch(() => true)` did the opposite — a probe failure was
         * read as "installed", the install was SKIPPED, and `npm run dev` then died
         * with `vite: command not found` (exit 127) against an empty node_modules,
         * leaving no process and a 502 preview. An extra install is idempotent and
         * cheap; skipping a needed one is a dead preview.
         */
        const installed = await this.#packageDirectoryHasInstalledPreviewDependencies(pkgEntry[0], pkg).catch(
          () => false,
        );

        const alreadyInstalling = (command.setupCommands ?? []).some((c) => /install/i.test(c.label));

        if (hasRuntimeDeps && !installed && !alreadyInstalling) {
          const installCmd = this.#installCommandForPackage(pkgEntry[0], {
            packageManager: (pkg as { packageManager?: string }).packageManager,
          });
          command = { ...command, setupCommands: [installCmd, ...(command.setupCommands ?? [])] };
          this.appendWorkspaceLog(
            workbenchText('workbenchRuntime.preview.dependenciesMissing', {
              installCommand: installCmd.label,
              previewCommand: command.label,
            }),
          );
        }
      }
    } catch {
      // best-effort guarantee; fall through with the detected command as-is
    }

    this.toggleTerminal(true);

    this.#previewStartPromise = Promise.resolve(command.label);
    this.#previewCommandRunning = true;
    this.previewServerState.set({ status: 'starting', command: command.label });

    void (async () => {
      try {
        for (const setupCommand of command.setupCommands ?? []) {
          const directory = setupCommand.cwd
            ? workbenchText('workbenchRuntime.preview.directory', { directory: setupCommand.cwd })
            : '';
          this.appendWorkspaceLog(
            workbenchText('workbenchRuntime.preview.preparing', { command: setupCommand.label, directory }),
          );

          const setupExitCode = await this.#runSetupCommandWithRetry(setupCommand);

          if (setupExitCode !== 0) {
            this.previewServerState.set({
              status: 'error',
              command: command.label,
              error: workbenchText('workbenchRuntime.preview.setupFailed', {
                command: setupCommand.label,
                exitCode: setupExitCode,
              }),
            });

            return;
          }
        }

        const directory = command.cwd
          ? workbenchText('workbenchRuntime.preview.directory', { directory: command.cwd })
          : '';
        this.appendWorkspaceLog(
          workbenchText('workbenchRuntime.preview.startCommand', { command: command.label, directory }),
        );

        const devExitCode = await this.#streamWorkspaceCommand(command, {
          exitMessage: workbenchText('workbenchRuntime.preview.commandExited'),
          refreshPortsOnOutput: true,
        });

        /*
         * FAIL CLOSED, honestly. A long-lived dev server does not exit; if
         * streamCommand RETURNED a non-zero code the dev command DIED (most often
         * exit 127 `vite: command not found` against an empty node_modules, or a
         * config crash) — the app is NOT running. Surface a clear error instead of
         * letting the finally below optimistically report `running`/`idle` off a
         * lingering/phantom port. This is the "workspace RUNNING + 0 processes + 502
         * but status says Running on Port 5173" lie the P0 hinged on.
         */
        if (devExitCode !== 0) {
          this.previewServerState.set({
            status: 'error',
            command: command.label,
            error:
              devExitCode === 127
                ? workbenchText('workbenchRuntime.preview.devMissingDependencies', { command: command.label })
                : workbenchText('workbenchRuntime.preview.devExited', {
                    command: command.label,
                    exitCode: devExitCode,
                  }),
          });
        }
      } catch (error) {
        /*
         * On garde le message RÉEL de l'erreur (et non un libellé générique) :
         * c'est le seul indice exploitable quand le démarrage casse pour une
         * raison inattendue.
         */
        const message = error instanceof Error ? error.message : String(error);
        this.previewServerState.set({ status: 'error', command: command.label, error: message });
        this.appendWorkspaceLog(message);
      } finally {
        this.#previewStartPromise = undefined;
        this.#previewCommandRunning = false;

        if (this.previewServerState.get().status !== 'error') {
          this.previewServerState.set({
            status: this.previews.get().some((preview) => preview.ready !== false || preview.serving === true)
              ? 'running'
              : 'idle',
            command: command.label,
          });
        }
      }
    })();

    [500, 1000, 2000, 3500, 5500, 8000].forEach((delay) => {
      window.setTimeout(() => void this.refreshRuntimePorts().catch(() => undefined), delay);
    });

    return command.label;
  }

  /*
   * Whether #runStartPreviewServer may skip the install/launch and report the
   * already-running dev server. A port that was merely DETECTED (ready can be
   * undefined, i.e. `!== false`) against an empty/incomplete node_modules must
   * NOT suppress a needed install — that strands the iframe on a blank/500 app.
   * Require a genuinely-ready port AND installed dependencies for the chosen
   * package dir.
   */
  async #canShortCircuitToExistingPreview() {
    const pkgEntry = this.#findPackageJsonEntry();

    /*
     * No package.json → nothing to install; trust a detected port (static/other
     * project shapes), preserving the prior behaviour for those.
     */
    if (!pkgEntry || pkgEntry[1]?.type !== 'file') {
      return this.previews.get().some((preview) => preview.ready !== false);
    }

    let pkg: PreviewPackageManifest = {};

    if (pkgEntry[1].content) {
      try {
        pkg = JSON.parse(pkgEntry[1].content) as PreviewPackageManifest;
      } catch {
        pkg = {};
      }
    }

    const dependenciesInstalled = await this.#packageDirectoryHasInstalledPreviewDependencies(pkgEntry[0], pkg).catch(
      () => false,
    );

    return shouldUseExistingPreviewServer(this.previews.get(), dependenciesInstalled);
  }

  /*
   * If the workspace pod has been stopped/reaped, reprovision it via the runtime
   * adapter before issuing preview commands. No-op when the workspace is healthy
   * or its status is unknown (webcontainer mode reports no session). Best-effort:
   * a failure is logged and surfaced via workspaceStatus, but does not throw — the
   * downstream command attempt will produce the actionable error.
   */
  async #ensureWorkspaceProvisioned() {
    if (!workspaceNeedsReprovision(this.workspaceStatus.get())) {
      return;
    }

    if (typeof this.#runtime.startWorkspace !== 'function') {
      return;
    }

    this.appendWorkspaceLog(workbenchText('workbenchRuntime.preview.workspaceReprovisioning'));

    try {
      const session = await withRuntimeRetry(() => this.#runtime.startWorkspace());
      this.workspaceStatus.set(session);
    } catch {
      this.appendWorkspaceLog(workbenchText('workbenchRuntime.preview.workspaceReprovisionFailed'));
    }
  }

  isPreviewServerStarting() {
    return Boolean(this.#previewStartPromise) || this.#previewCommandRunning;
  }

  async stopPreviewServer() {
    this.previewServerState.set({ status: 'stopping', command: this.previewServerState.get().command });

    const processes = await this.#runtime.listProcesses().catch(() => []);

    const previewProcesses = processes.filter((process) => {
      const command = [process.command, ...(process.args ?? [])].join(' ').toLowerCase();

      return (
        process.status === 'running' &&
        (command.includes('vite') ||
          command.includes('npm run dev') ||
          command.includes('npm run start') ||
          command.includes('next dev'))
      );
    });

    for (const process of previewProcesses) {
      await this.#runtime.killProcess(process.id).catch((error) => {
        this.appendWorkspaceLog(error instanceof Error ? error.message : String(error));
      });
    }

    await this.refreshRuntimePorts().catch(() => undefined);

    /*
     * Clear the in-flight start guard. startPreviewServer() early-returns when
     * #previewStartPromise is set (it is a resolved promise once the dev command
     * is streaming), so if a stop leaves it stale the NEXT start — the Run button,
     * or reopening the project — returns the dead promise and never relaunches the
     * dev server, stranding it on "starting". The streaming finally normally
     * clears it, but a kill (or a stop racing an in-flight start) can beat that.
     * restartPreviewServer/reinstallDependencies already cleared it manually; do
     * it here so EVERY stop→start path relaunches.
     */
    this.#previewStartPromise = undefined;
    this.#previewCommandRunning = false;
    this.previewServerState.set({ status: 'idle' });

    return previewProcesses.length;
  }

  async restartPreviewServer() {
    await this.stopPreviewServer();

    /*
     * forceRestart: an explicit user Run must relaunch for real — punch through a
     * wedged start guard AND the "reattach to existing" short-circuit, so it can
     * never be a no-op that adopts a dead/dying preview.
     */
    return this.startPreviewServer({ forceRestart: true });
  }

  /**
   * User-triggerable recovery action: force a fresh dependency install and
   * restart the preview. Used when the initial install was skipped (e.g. the
   * workspace pod returned a transient 502 during provisioning) and the editor
   * is left with an empty node_modules / broken preview.
   */
  async reinstallDependencies() {
    this.appendWorkspaceLog(workbenchText('workbenchRuntime.preview.reinstalling'));
    await this.stopPreviewServer();

    return this.startPreviewServer({ forceInstall: true, forceRestart: true });
  }

  /*
   * Run a preview setup command (npm/pnpm/yarn install) with a bounded retry on
   * TRANSIENT failure. #streamWorkspaceCommand returns a non-zero exit (not a
   * throw) both for a genuine install error and for an interrupted command
   * stream; we re-run only when the recent log tail looks transient
   * (stream-closed / 502 / network), with exponential backoff, so a single
   * cold-start drop mid-install doesn't blank the preview while a real package
   * error still fails fast.
   */
  async #runSetupCommandWithRetry(setupCommand: PreviewCommand): Promise<number> {
    let exitCode = 0;

    for (let attempt = 1; attempt <= PREVIEW_SETUP_RETRY_ATTEMPTS; attempt++) {
      const tailStart = this.#currentWorkspaceLogLength();

      exitCode = await this.#streamWorkspaceCommand(setupCommand, {
        exitMessage: workbenchText('workbenchRuntime.preview.setupExited'),
      });

      if (exitCode === 0) {
        return 0;
      }

      const isLastAttempt = attempt >= PREVIEW_SETUP_RETRY_ATTEMPTS;
      const transient = isTransientCommandFailure(this.#workspaceLogTailSince(tailStart));

      if (isLastAttempt || !transient) {
        return exitCode;
      }

      const delayMs = PREVIEW_SETUP_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
      this.appendWorkspaceLog(
        workbenchText('workbenchRuntime.preview.transientRetry', {
          command: setupCommand.label,
          exitCode,
          seconds: Math.round(delayMs / 1000),
          attempt: attempt + 1,
          maxAttempts: PREVIEW_SETUP_RETRY_ATTEMPTS,
        }),
      );
      await new Promise<void>((resolve) => {
        setTimeout(resolve, delayMs);
      });
    }

    return exitCode;
  }

  #currentWorkspaceLogLength() {
    this.flushWorkspaceLogs();

    return this.workspaceLogs.get().length;
  }

  #workspaceLogTailSince(startLength: number) {
    this.flushWorkspaceLogs();

    return this.workspaceLogs.get().slice(Math.max(0, startLength));
  }

  async #streamWorkspaceCommand(
    command: CommandRequest & { label: string },
    options: { exitMessage: string; refreshPortsOnOutput?: boolean },
  ) {
    let exitCode = 0;

    /*
     * Throttle port refreshes. A dev server emits hundreds of output lines while
     * installing/building; refreshing ports (a GET /ports round-trip) on EVERY
     * line previously produced a request storm — and when the workspace agent is
     * transiently unreachable (502/abort), each line fired another doomed request
     * (observed: hundreds of aborted /ports calls flooding the API). Cap to at
     * most one refresh per 1.5s with a trailing refresh, and never block the
     * output stream on the network call (no await).
     */
    const PORT_REFRESH_THROTTLE_MS = 1500;

    let lastPortRefresh = 0;
    let trailingPortRefresh: ReturnType<typeof setTimeout> | undefined;

    const refreshPortsThrottled = () => {
      const now = Date.now();
      const since = now - lastPortRefresh;

      if (since >= PORT_REFRESH_THROTTLE_MS) {
        lastPortRefresh = now;
        void this.refreshRuntimePorts().catch(() => undefined);
      } else if (!trailingPortRefresh) {
        trailingPortRefresh = setTimeout(() => {
          trailingPortRefresh = undefined;
          lastPortRefresh = Date.now();
          void this.refreshRuntimePorts().catch(() => undefined);
        }, PORT_REFRESH_THROTTLE_MS - since);
      }
    };

    try {
      for await (const event of this.#runtime.streamCommand({
        command: command.command,
        args: command.args,
        cwd: command.cwd,
        env: command.env,
      })) {
        this.appendWorkspaceLog(event);

        if (options.refreshPortsOnOutput && (event.type === 'stdout' || event.type === 'stderr')) {
          refreshPortsThrottled();
        }

        /*
         * Fold each event into the exit code. An `error` event (the adapter's
         * synthetic "stream closed before completion" for an interrupted command —
         * npm install killed by a pod restart / LB idle-kill / network drop) folds
         * to a non-zero code so the caller doesn't treat a half-finished install as
         * success and launch the preview against a broken node_modules.
         */
        exitCode = foldCommandExitCode(exitCode, event);

        if (event.type === 'exit' && exitCode !== 0) {
          this.appendWorkspaceLog(`${options.exitMessage} ${exitCode}`);
        }

        if (event.type === 'error') {
          this.appendWorkspaceLog(
            `${options.exitMessage} ${exitCode} (${event.error?.message ?? workbenchText('workbenchRuntime.preview.streamInterrupted')})`,
          );
        }
      }
    } finally {
      if (trailingPortRefresh) {
        clearTimeout(trailingPortRefresh);
      }

      /*
       * Always do one final refresh so a port opened by the last output line
       * (or after the stream ends) is still detected despite the throttle.
       */
      if (options.refreshPortsOnOutput) {
        void this.refreshRuntimePorts().catch(() => undefined);
      }
    }

    return exitCode;
  }

  async #detectPreviewCommand(forceInstall: boolean): Promise<PreviewCommand> {
    let packageJsonEntry = this.#findPackageJsonEntry();

    /*
     * Hydrate the package.json content if the files store only has the tree entry
     * (content lazily unloaded). Without this the parse below is skipped and we
     * fall through to the bare `npx vite` fallback — which fails (exit 1) for any
     * app whose vite.config imports a devDep plugin (e.g. @vitejs/plugin-react),
     * since `npx vite` installs no project dependencies. This is exactly what left
     * complex generated apps stuck on "Stopped runtime" with node_modules empty.
     */
    if (packageJsonEntry && packageJsonEntry[1]?.type === 'file' && !packageJsonEntry[1].content) {
      const cwd = this.#runtimeCwdForPackageJson(packageJsonEntry[0]);
      const relPath = cwd ? `${cwd}/package.json` : 'package.json';

      const content = await this.#runtime
        .readFile(relPath)
        .then((result) => result.content)
        .catch(() => undefined);

      if (content) {
        packageJsonEntry = [packageJsonEntry[0], { ...packageJsonEntry[1], content } as (typeof packageJsonEntry)[1]];
      }
    }

    if (packageJsonEntry?.[1]?.type === 'file' && packageJsonEntry[1].content) {
      try {
        const pkg = JSON.parse(packageJsonEntry[1].content) as {
          scripts?: Record<string, string>;
          packageManager?: string;
          dependencies?: Record<string, string>;
          devDependencies?: Record<string, string>;
        };

        const scripts = pkg.scripts ?? {};
        const cwd = this.#runtimeCwdForPackageJson(packageJsonEntry[0]);
        const setupCommands = await this.#previewSetupCommands(packageJsonEntry[0], pkg, forceInstall);
        const dependencies = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
        const shouldRunViteWithoutInstall = this.#canRunViteWithoutDependencyInstall(packageJsonEntry[0], dependencies);

        if (scripts.dev) {
          const devScript = scripts.dev.toLowerCase();
          const hostArgs = this.#devScriptHostArgs(devScript);

          if (devScript.includes('vite') && this.#isSimpleViteDevScript(scripts.dev)) {
            if (dependencies.vite && !shouldRunViteWithoutInstall) {
              return {
                command: 'npm',
                args: ['run', 'dev', ...hostArgs],
                label: workbenchText('workbenchRuntime.command.npmDev'),
                cwd,
                setupCommands,
              };
            }

            return {
              command: 'npx',
              args: ['--yes', 'vite', ...this.#viteDevArgsFromScript(scripts.dev)],
              label: workbenchText('workbenchRuntime.command.npxVite'),
              cwd,
              setupCommands,
            };
          }

          if (devScript.includes('vite') && (!dependencies.vite || shouldRunViteWithoutInstall)) {
            return {
              command: 'npx',
              args: ['--yes', 'vite', '--host', '0.0.0.0'],
              label: workbenchText('workbenchRuntime.command.npxVite'),
              cwd,
            };
          }

          return {
            command: 'npm',
            args: ['run', 'dev', ...hostArgs],
            label: workbenchText('workbenchRuntime.command.npmDev'),
            cwd,
            setupCommands,
          };
        }

        if (scripts.start) {
          return {
            command: 'npm',
            args: ['run', 'start'],
            label: workbenchText('workbenchRuntime.command.npmStart'),
            cwd,
            setupCommands,
          };
        }
      } catch (error) {
        console.warn('Failed to parse package.json for preview command:', error);
      }
    }

    /*
     * Install-aware fallback: if a package.json FILE exists but we couldn't parse
     * its content, it is still a real npm project — install then `npm run dev`
     * rather than bare `npx vite` (which fails for any plugin-using vite.config).
     * Only fall back to npx vite when there is genuinely no package.json.
     */
    const fallbackPkg = this.#findPackageJsonEntry();

    if (fallbackPkg) {
      const cwd = this.#runtimeCwdForPackageJson(fallbackPkg[0]);

      return {
        command: 'npm',
        args: ['run', 'dev'],
        label: workbenchText('workbenchRuntime.command.npmDev'),
        cwd,
        setupCommands: [this.#installCommandForPackage(fallbackPkg[0], {})],
      };
    }

    return {
      command: 'npx',
      args: ['--yes', 'vite', '--host', '0.0.0.0'],
      label: workbenchText('workbenchRuntime.command.npxVite'),
    };
  }

  #findPackageJsonEntry() {
    const candidates = Object.entries(this.files.get()).filter(
      ([filePath, dirent]) => dirent?.type === 'file' && this.#isPackageJsonPath(filePath),
    );

    if (candidates.length <= 1) {
      return candidates[0];
    }

    /*
     * Multiple package.json (full-stack/monorepo generations): the preview must
     * run the BROWSABLE app, not e.g. a backend-only server picked by arbitrary
     * file order. Rank by: (1) has a `dev` script (a runnable dev server),
     * preferring one whose dev script looks like a frontend (vite/next/etc.);
     * (2) shallowest path (root over nested client/ or server/). This keeps the
     * preview pointed at the UI even when the model splits packages despite the
     * single-root-package.json requirement.
     */
    const depth = (p: string) => p.replaceAll('\\', '/').replace(/^\/+/, '').split('/').length;

    const scoreOf = ([filePath, dirent]: [string, (typeof candidates)[number][1]]) => {
      let dev: string | undefined;

      if (dirent?.type === 'file' && dirent.content) {
        try {
          dev = (JSON.parse(dirent.content) as { scripts?: Record<string, string> }).scripts?.dev;
        } catch {
          dev = undefined;
        }
      }

      const frontend = dev
        ? /\b(vite|next|astro|remix|react-scripts|nuxt|vue-cli-service|webpack)\b/i.test(dev)
        : false;

      // higher is better: frontend dev (3) > any dev (2) > none (0); shallower wins ties
      return (frontend ? 3 : dev ? 2 : 0) * 1000 - depth(filePath);
    };

    return candidates.slice().sort((a, b) => scoreOf(b) - scoreOf(a))[0];
  }

  #findIndexHtmlEntry() {
    return Object.entries(this.files.get()).find(([filePath, dirent]) => {
      return dirent?.type === 'file' && this.#isIndexHtmlPath(filePath);
    });
  }

  #canUseStaticHtmlPreview() {
    if (this.#findPackageJsonEntry()) {
      return false;
    }

    const indexHtmlEntry = this.#findIndexHtmlEntry();
    const indexHtmlFile = indexHtmlEntry?.[1];
    const content = indexHtmlFile?.type === 'file' && !indexHtmlFile.isBinary ? indexHtmlFile.content : undefined;

    if (!content) {
      return false;
    }

    return !/<script\b[^>]*\bsrc\s*=/i.test(content);
  }

  #isPackageJsonPath(filePath: string) {
    const normalizedPath = filePath.replaceAll('\\', '/').replace(/^\/+/, '');
    const normalizedWorkDir = WORK_DIR.replace(/^\/+/, '');

    return (
      normalizedPath === 'package.json' ||
      normalizedPath === `${normalizedWorkDir}/package.json` ||
      normalizedPath.endsWith('/package.json')
    );
  }

  #isIndexHtmlPath(filePath: string) {
    const normalizedPath = filePath.replaceAll('\\', '/').replace(/^\/+/, '');
    const normalizedWorkDir = WORK_DIR.replace(/^\/+/, '');

    return (
      normalizedPath === 'index.html' ||
      normalizedPath === `${normalizedWorkDir}/index.html` ||
      normalizedPath.endsWith('/index.html')
    );
  }

  #packageJsonCwd(packageJsonPath: string) {
    const normalizedPath = packageJsonPath.replaceAll('\\', '/').replace(/^\/+/, '');
    const workdirPrefix = `${WORK_DIR.replace(/^\/+/, '')}/`;

    const relativePath = normalizedPath.startsWith(workdirPrefix)
      ? normalizedPath.slice(workdirPrefix.length)
      : normalizedPath;

    const directory = relativePath.replace(/\/?package\.json$/, '');

    return directory && directory !== relativePath ? directory : undefined;
  }

  #runtimeCwdForPackageJson(packageJsonPath: string) {
    return this.#packageJsonCwd(packageJsonPath);
  }

  #installCommandForPackage(packageJsonPath: string, pkg: { packageManager?: string }): PreviewCommand {
    const cwd = this.#runtimeCwdForPackageJson(packageJsonPath);
    const packageManager = pkg.packageManager?.toLowerCase() ?? '';
    const hasPnpmLock = this.#packageDirectoryHasFile(packageJsonPath, 'pnpm-lock.yaml');
    const hasYarnLock = this.#packageDirectoryHasFile(packageJsonPath, 'yarn.lock');

    /*
     * Workspace pods run with NODE_ENV=production (the agent needs it for its own
     * security checks), which makes every package manager default to omitting
     * devDependencies. But the dev server itself (vite, @vitejs/plugin-react, the
     * framework CLI, …) lives in devDependencies, so a production install leaves
     * `npm run dev` failing with exit 127 ("vite: command not found") and a
     * permanently blank preview. Force dev dependencies in regardless of NODE_ENV.
     */
    if (packageManager.startsWith('pnpm') || hasPnpmLock) {
      return {
        command: 'pnpm',
        args: ['install', '--prod=false'],
        label: workbenchText('workbenchRuntime.command.pnpmInstall'),
        cwd,
      };
    }

    if (packageManager.startsWith('yarn') || hasYarnLock) {
      return {
        command: 'yarn',
        args: ['install', '--production=false'],
        label: workbenchText('workbenchRuntime.command.yarnInstall'),
        cwd,
      };
    }

    return {
      command: 'npm',
      args: ['install', '--include=dev', '--prefer-offline', '--no-audit', '--no-fund'],
      label: workbenchText('workbenchRuntime.command.npmInstall'),
      cwd,
    };
  }

  async #previewSetupCommands(
    packageJsonPath: string,
    pkg: PreviewPackageManifest & { packageManager?: string },
    forceInstall: boolean,
  ) {
    if (!forceInstall && (await this.#packageDirectoryHasInstalledPreviewDependencies(packageJsonPath, pkg))) {
      return [];
    }

    await this.#removeCorruptJsonLockfiles(packageJsonPath);

    return [this.#installCommandForPackage(packageJsonPath, pkg)];
  }

  /*
   * A corrupt or empty package-lock.json / npm-shrinkwrap.json makes `npm install`
   * abort before it does anything — npm parses the lockfile up front and dies with
   * "Unexpected end of JSON input". node_modules then never populates and the dev
   * server fails to boot with "Cannot find package 'vite'", leaving a permanently
   * blank preview. This happened to a cached template seeded with a truncated
   * lockfile. These files are machine-generated, so the safe recovery is to delete
   * an unparseable one and let the install regenerate it from package.json. Only
   * npm's lockfiles are JSON; yarn/pnpm lockfiles can't hit this failure mode.
   */
  async #removeCorruptJsonLockfiles(packageJsonPath: string) {
    const cwd = this.#runtimeCwdForPackageJson(packageJsonPath);

    for (const fileName of ['package-lock.json', 'npm-shrinkwrap.json']) {
      const relativePath = cwd ? `${cwd}/${fileName}` : fileName;

      let content: string;

      try {
        content = (await this.#runtime.readFile(relativePath)).content;
      } catch {
        // Absent (the common case) or unreadable — nothing to repair.
        continue;
      }

      const isCorrupt =
        !content.trim() ||
        (() => {
          try {
            JSON.parse(content);
            return false;
          } catch {
            return true;
          }
        })();

      if (!isCorrupt) {
        continue;
      }

      /*
       * try/catch (not .catch) so a synchronous throw — e.g. a runtime adapter
       * without deleteFile — can never abort preview-command detection.
       */
      try {
        await this.#runtime.deleteFile(relativePath);
        this.appendWorkspaceLog(workbenchText('workbenchRuntime.preview.corruptLockRemoved', { file: fileName }));
      } catch {
        this.appendWorkspaceLog(workbenchText('workbenchRuntime.preview.corruptLockRemoveFailed', { file: fileName }));
      }
    }
  }

  async #packageDirectoryHasInstalledPreviewDependencies(packageJsonPath: string, pkg: PreviewPackageManifest) {
    const cwd = this.#runtimeCwdForPackageJson(packageJsonPath);
    const nodeModulesPath = cwd ? `${cwd}/node_modules` : 'node_modules';

    return hasInstalledPreviewDependencies(pkg, (directory) => this.#runtime.listFiles(directory), nodeModulesPath);
  }

  async #packageDirectoryHasRuntimeDirectory(packageJsonPath: string, directoryName: string) {
    try {
      const cwd = this.#runtimeCwdForPackageJson(packageJsonPath) ?? '.';
      const nodes = await this.#runtime.listFiles(cwd);

      return nodes.some((node) => node.type === 'directory' && node.name === directoryName);
    } catch {
      return false;
    }
  }

  #packageDirectoryHasFile(packageJsonPath: string, fileName: string) {
    const files = this.files.get();
    const cwd = this.#packageJsonCwd(packageJsonPath);
    const relativePath = cwd ? `${cwd}/${fileName}` : fileName;
    const normalizedWorkDir = WORK_DIR.replace(/^\/+/, '');
    const candidates = new Set([relativePath, `${WORK_DIR}/${relativePath}`, `${normalizedWorkDir}/${relativePath}`]);

    return Array.from(candidates).some((candidate) => Boolean(files[candidate]));
  }

  #isSimpleViteDevScript(script: string) {
    const trimmed = script.trim();

    if (!trimmed || /[;&|<>$`]/.test(trimmed)) {
      return false;
    }

    const tokens = trimmed.split(/\s+/);
    const viteIndex = tokens.findIndex((token) => token === 'vite' || token.endsWith('/vite'));

    return (
      viteIndex >= 0 &&
      tokens.slice(0, viteIndex).every((token) => token === 'npx' || token === 'pnpm' || token === 'exec')
    );
  }

  #viteDevArgsFromScript(script: string) {
    const tokens = script.trim().split(/\s+/);
    const viteIndex = tokens.findIndex((token) => token === 'vite' || token.endsWith('/vite'));
    const args = viteIndex >= 0 ? tokens.slice(viteIndex + 1) : [];
    const hasHost = args.some((arg) => arg === '--host' || arg.startsWith('--host=') || arg === '-h');

    return hasHost ? args : [...args, '--host', '0.0.0.0'];
  }

  #devScriptHostArgs(devScript: string) {
    if (devScript.includes('--host') || devScript.includes(' -h ') || devScript.includes(' --hostname ')) {
      return [];
    }

    return devScript.includes('next') ? ['--', '-H', '0.0.0.0'] : ['--', '--host', '0.0.0.0'];
  }

  #packageDirectoryFileContent(packageJsonPath: string, fileName: string) {
    const files = this.files.get();
    const cwd = this.#packageJsonCwd(packageJsonPath);
    const relativePath = cwd ? `${cwd}/${fileName}` : fileName;
    const normalizedWorkDir = WORK_DIR.replace(/^\/+/, '');
    const candidates = [relativePath, `${WORK_DIR}/${relativePath}`, `${normalizedWorkDir}/${relativePath}`];

    for (const candidate of candidates) {
      const file = files[candidate];

      if (file?.type === 'file' && typeof file.content === 'string') {
        return file.content;
      }
    }

    return undefined;
  }

  #canRunViteWithoutDependencyInstall(packageJsonPath: string, dependencies: Record<string, string>) {
    const indexHtml = this.#packageDirectoryFileContent(packageJsonPath, 'index.html');

    if (indexHtml && !/<script\b[^>]*\btype=["']module["'][^>]*>/i.test(indexHtml)) {
      return true;
    }

    const runtimeDependencies = Object.keys(dependencies).filter(
      (dependency) => dependency !== 'vite' && dependency !== 'typescript',
    );

    return runtimeDependencies.length === 0;
  }

  appendWorkspaceLog(event: CommandEvent | string) {
    const lines = workspaceLogLines(event);

    if (!lines.length) {
      return;
    }

    this.#pendingWorkspaceLogLines.push(...lines);

    /*
     * Only the high-frequency streamed stdout/stderr burst needs coalescing.
     * Discrete one-off status lines (and terminal exit/error events) flush
     * synchronously so callers that read workspaceLogs right after appending
     * still see them immediately.
     */
    const isStreamedOutput = typeof event !== 'string' && (event.type === 'stdout' || event.type === 'stderr');

    if (!isStreamedOutput) {
      this.flushWorkspaceLogs();

      return;
    }

    if (this.#workspaceLogFlushTimer) {
      return;
    }

    this.#workspaceLogFlushTimer = setTimeout(() => {
      this.#workspaceLogFlushTimer = undefined;
      this.#flushWorkspaceLogs();
    }, WORKSPACE_LOG_FLUSH_INTERVAL_MS);
  }

  /**
   * Flush buffered streamed log lines into the workspaceLogs atom in a single
   * store update. Exposed (not private) so tests and teardown paths can force a
   * synchronous flush; safe to call when nothing is buffered.
   */
  flushWorkspaceLogs() {
    if (this.#workspaceLogFlushTimer) {
      clearTimeout(this.#workspaceLogFlushTimer);
      this.#workspaceLogFlushTimer = undefined;
    }

    this.#flushWorkspaceLogs();
  }

  #flushWorkspaceLogs() {
    if (this.#pendingWorkspaceLogLines.length === 0) {
      return;
    }

    const incoming = this.#pendingWorkspaceLogLines;
    this.#pendingWorkspaceLogLines = [];
    this.workspaceLogs.set(appendWorkspaceLogLines(this.workspaceLogs.get(), incoming, WORKSPACE_LOG_LIMIT));
  }

  #dropResolvedAgentPatchLogs(relativePath: string) {
    const nextLogs = dropFailedPatchLogsForPath(this.workspaceLogs.get(), relativePath);

    if (nextLogs) {
      this.workspaceLogs.set(nextLogs);
    }
  }

  #dropResolvedMissingImportFailures() {
    const files = this.#workspaceImportValidationFiles();
    const nextLogs = dropResolvedMissingImportPatchLogs(this.workspaceLogs.get(), files);

    if (nextLogs) {
      this.workspaceLogs.set(nextLogs);
    }

    this.#dropResolvedMissingImportProposals(files);
  }

  #dropResolvedMissingImportProposals(files: ReadonlyMap<string, string>) {
    const projectId = this.#projectId;

    if (!projectId || this.#runtimeFilesLoadedProjectId !== projectId || files.size === 0) {
      return;
    }

    const proposals = this.agentPatchProposals.get();
    const nextProposals = { ...proposals };
    const removedIds: string[] = [];

    for (const [proposalId, proposal] of Object.entries(proposals)) {
      if (proposal.status !== 'failed') {
        continue;
      }

      if (!isResolvedMissingImportPatchFailure(proposal.error, files)) {
        continue;
      }

      delete nextProposals[proposalId];
      removedIds.push(proposalId);
      this.#agentPatchOriginals.delete(proposal.actionId);
    }

    if (!removedIds.length) {
      return;
    }

    this.agentPatchProposals.set(nextProposals);

    for (const proposalId of removedIds) {
      void deleteAgentPatchProposalRemote(projectId, proposalId);
    }
  }

  addToExecutionQueue(callback: () => Promise<void>) {
    /*
     * Swallow per-task rejections here: a rejected queue promise would skip the `.then`
     * of every subsequently-enqueued task, permanently stalling the queue.
     */
    this.#globalExecutionQueue = this.#globalExecutionQueue
      .then(() => callback())
      .catch((error) => {
        console.error('Execution queue task failed', error);
      });
  }

  get previews() {
    return this.#previewsStore.previews;
  }

  get files() {
    return this.#filesStore.files;
  }

  get currentDocument(): ReadableAtom<EditorDocument | undefined> {
    return this.#editorStore.currentDocument;
  }

  get selectedFile(): ReadableAtom<string | undefined> {
    return this.#editorStore.selectedFile;
  }

  get firstArtifact(): ArtifactState | undefined {
    return this.#getArtifact(this.artifactIdList[0]);
  }

  get filesCount(): number {
    return this.#filesStore.filesCount;
  }

  get showTerminal() {
    return this.#terminalStore.showTerminal;
  }
  get boltTerminal() {
    return this.#terminalStore.boltTerminal;
  }
  get alert() {
    return this.actionAlert;
  }
  clearAlert() {
    this.actionAlert.set(undefined);
  }

  get SupabaseAlert() {
    return this.supabaseAlert;
  }

  clearSupabaseAlert() {
    this.supabaseAlert.set(undefined);
  }

  get DeployAlert() {
    return this.deployAlert;
  }

  clearDeployAlert() {
    this.deployAlert.set(undefined);
  }

  toggleTerminal(value?: boolean) {
    this.#terminalStore.toggleTerminal(value);
  }

  attachTerminal(terminal: ITerminal, command?: string, paneKey?: number) {
    this.#terminalStore.attachTerminal(terminal, command, paneKey);
  }
  attachBoltTerminal(terminal: ITerminal) {
    this.#terminalStore.attachBoltTerminal(terminal);
  }

  restartBoltTerminal(terminal: ITerminal) {
    this.#terminalStore.restartBoltTerminal(terminal);
  }

  restartTerminal(terminal: ITerminal, command?: string) {
    this.#terminalStore.restartTerminal(terminal, command);
  }

  detachTerminal(terminal: ITerminal) {
    this.#terminalStore.detachTerminal(terminal);
  }

  onTerminalResize(cols: number, rows: number) {
    this.#terminalStore.onTerminalResize(cols, rows);
  }

  setDocuments(files: FileMap) {
    /*
     * Pass the dirty set so the editor keeps unsaved edits instead of resetting
     * them to on-disk content when the file tree updates for any reason.
     */
    this.#editorStore.setDocuments(files, this.unsavedFiles.get());

    if (this.#filesStore.filesCount > 0 && this.currentDocument.get() === undefined) {
      // we find the first file and select it
      for (const [filePath, dirent] of Object.entries(files)) {
        if (dirent?.type === 'file') {
          this.setSelectedFile(filePath);
          break;
        }
      }
    }
  }

  setShowWorkbench(show: boolean) {
    this.showWorkbench.set(show);
  }

  setCurrentDocumentContent(newContent: string) {
    const filePath = this.currentDocument.get()?.filePath;

    if (!filePath) {
      return;
    }

    const originalContent = this.#filesStore.getFile(filePath)?.content;
    const unsavedChanges = originalContent !== undefined && originalContent !== newContent;

    this.#editorStore.updateFile(filePath, newContent);

    const currentDocument = this.currentDocument.get();

    if (currentDocument) {
      const previousUnsavedFiles = this.unsavedFiles.get();

      if (unsavedChanges && previousUnsavedFiles.has(currentDocument.filePath)) {
        return;
      }

      const newUnsavedFiles = new Set(previousUnsavedFiles);

      if (unsavedChanges) {
        newUnsavedFiles.add(currentDocument.filePath);
      } else {
        newUnsavedFiles.delete(currentDocument.filePath);
      }

      this.unsavedFiles.set(newUnsavedFiles);
    }
  }

  scheduleFileAutosave(filePath: string, content: string, delayMs = 800) {
    const previousTimer = this.#autosaveTimers.get(filePath);

    if (previousTimer) {
      clearTimeout(previousTimer);
    }

    const timer = setTimeout(() => {
      this.#autosaveTimers.delete(filePath);

      const document = this.#editorStore.documents.get()[filePath];
      const persistedFile = this.#filesStore.getFile(filePath);

      if (!document || document.value !== content || persistedFile?.content === content) {
        return;
      }

      this.saveFile(filePath).catch((error) => {
        console.error(`Autosave failed for ${filePath}`, error);

        /*
         * Surface autosave failures instead of swallowing them — silent loss of
         * edits is the worst outcome. Dedupe per file (toastId) so a repeatedly
         * failing autosave shows one non-stacking toast; the file stays in the
         * unsaved set so a manual save can still retry.
         */
        toast.error(
          workbenchText('workbenchRuntime.files.autosaveFailed', { file: filePath.split('/').pop() ?? filePath }),
          {
            toastId: `autosave-fail-${filePath}`,
          },
        );
      });
    }, delayMs);

    this.#autosaveTimers.set(filePath, timer);
  }

  setCurrentDocumentScrollPosition(position: ScrollPosition) {
    const editorDocument = this.currentDocument.get();

    if (!editorDocument) {
      return;
    }

    const { filePath } = editorDocument;

    this.#editorStore.updateScrollPosition(filePath, position);
  }

  setSelectedFile(filePath: string | undefined) {
    this.#editorStore.setSelectedFile(filePath);
  }

  async saveFile(filePath: string, options?: SaveFileOptions) {
    const pendingAutosave = this.#autosaveTimers.get(filePath);

    if (pendingAutosave) {
      clearTimeout(pendingAutosave);
      this.#autosaveTimers.delete(filePath);
    }

    const documents = this.#editorStore.documents.get();
    const document = documents[filePath];

    if (document === undefined) {
      return;
    }

    /*
     * For scoped locks, we would need to implement diff checking here
     * to determine if the user is modifying existing code or just adding new code
     * This is a more complex feature that would be implemented in a future update
     */

    await this.#filesStore.saveFile(filePath, document.value, options);

    const newUnsavedFiles = new Set(this.unsavedFiles.get());
    newUnsavedFiles.delete(filePath);

    this.unsavedFiles.set(newUnsavedFiles);

    // Append a File History version for this human save (deduped if unchanged).
    void fileHistoryStore.capture(filePath, document.value, 'save');

    this.#emitFileApplied(filePath, 'user');
  }

  async writeFileContent(filePath: string, content: string) {
    const documents = this.#editorStore.documents.get();

    if (documents[filePath]) {
      this.#editorStore.updateFile(filePath, content);
    }

    await this.#filesStore.saveFile(filePath, content);

    const newUnsavedFiles = new Set(this.unsavedFiles.get());
    newUnsavedFiles.delete(filePath);
    this.unsavedFiles.set(newUnsavedFiles);

    // Append a File History version for this programmatic/agent write.
    void fileHistoryStore.capture(filePath, content, 'agent');

    this.#emitFileApplied(filePath, 'user');
  }

  /**
   * Restore a File History version append-only: write its content to disk and
   * record it as a NEW version (`source: 'restore'`) so nothing in the history
   * is lost. Returns the created version, or undefined if the content already
   * matches the latest (no-op restore).
   */
  async restoreFileVersion(filePath: string, content: string, restoredFromSeq: number) {
    const documents = this.#editorStore.documents.get();

    if (documents[filePath]) {
      this.#editorStore.updateFile(filePath, content);
    }

    await this.#filesStore.saveFile(filePath, content);

    const newUnsavedFiles = new Set(this.unsavedFiles.get());
    newUnsavedFiles.delete(filePath);
    this.unsavedFiles.set(newUnsavedFiles);

    const version = await fileHistoryStore.capture(filePath, content, 'restore', { restoredFromSeq });
    this.#emitFileApplied(filePath, 'user');

    return version;
  }

  async saveCurrentDocument() {
    const currentDocument = this.currentDocument.get();

    if (currentDocument === undefined) {
      return;
    }

    await this.saveFile(currentDocument.filePath);
  }

  resetCurrentDocument() {
    const currentDocument = this.currentDocument.get();

    if (currentDocument === undefined) {
      return;
    }

    const { filePath } = currentDocument;
    const file = this.#filesStore.getFile(filePath);

    if (!file) {
      return;
    }

    this.setCurrentDocumentContent(file.content);
  }

  /**
   * Formats the current editor buffer in place with Prettier. Rejects (without
   * mutating the buffer) when no document is open, the file type is
   * unsupported, or the content fails to parse — callers surface the error.
   */
  async formatCurrentDocument() {
    const currentDocument = this.currentDocument.get();

    if (currentDocument === undefined) {
      throw new Error(workbenchText('workbenchRuntime.files.noOpenFile'));
    }

    const { filePath, value } = currentDocument;

    /*
     * Don't rewrite a locked file's content via format — same lock enforcement as
     * the editor (read-only), AI writes, Search, and the file-tree ops.
     */
    if (this.isFileLocked(filePath).locked) {
      this.actionAlert.set({
        type: 'warning',
        title: workbenchText('workbenchRuntime.files.lockedTitle'),
        description: workbenchText('workbenchRuntime.files.formatLocked', { file: filePath }),
        content: '',
        source: 'preview',
      });

      return;
    }

    const { formatDocument } = await import('~/utils/formatDocument');
    const formatted = await formatDocument(value, filePath);

    if (formatted !== value) {
      this.setCurrentDocumentContent(formatted);
    }
  }

  async saveAllFiles() {
    for (const filePath of this.unsavedFiles.get()) {
      await this.saveFile(filePath);
    }
  }

  getFileModifcations() {
    return this.#filesStore.getFileModifications();
  }

  getModifiedFiles() {
    return this.#filesStore.getModifiedFiles();
  }

  resetAllFileModifications() {
    this.#filesStore.resetFileModifications();
  }

  setAgentPatchReviewRequired(required: boolean) {
    this.agentPatchReviewRequired.set(required);
  }

  dismissAgentPatchProposal(proposalId: string) {
    const proposal = this.agentPatchProposals.get()[proposalId];

    if (!proposal) {
      return;
    }

    this.agentPatchProposals.setKey(proposalId, {
      ...proposal,
      status: proposal.status === 'accepted' ? 'accepted' : 'rejected',
      updatedAt: new Date().toISOString(),
    });
    this.#syncAgentPatchProposalToServer(proposalId);
  }

  async rejectAgentPatchProposal(proposalId: string) {
    const proposal = this.agentPatchProposals.get()[proposalId];

    if (!proposal) {
      return;
    }

    const artifact = this.#getArtifact(proposal.artifactId);

    artifact?.runner.skipAction(proposal.actionId);
    this.#agentPatchOriginals.delete(proposal.actionId);
    this.agentPatchProposals.setKey(proposalId, {
      ...proposal,
      status: 'rejected',
      updatedAt: new Date().toISOString(),
    });
    this.#syncAgentPatchProposalToServer(proposalId);
    this.#dropResolvedAgentPatchLogs(proposal.relativePath);
    this.appendWorkspaceLog(workbenchText('workbenchRuntime.patch.rejected', { file: proposal.relativePath }));
  }

  async acceptAgentPatchProposal(
    proposalId: string,
    acceptedHunkIds?: string[],
  ): Promise<'accepted' | 'failed' | 'ignored' | 'rejected'> {
    const proposal = this.agentPatchProposals.get()[proposalId];

    if (!proposal || proposal.status === 'applying') {
      return 'ignored';
    }

    const acceptedIds = acceptedHunkIds?.length ? acceptedHunkIds : proposal.hunks.map((hunk) => hunk.id);

    if (!acceptedIds.length) {
      await this.rejectAgentPatchProposal(proposalId);
      return 'rejected';
    }

    /*
     * Enforce the file lock on the review-and-accept path, just like the editor,
     * Search, formatCurrentDocument, and the non-streaming AI write do. Without
     * this a user who locked a file to protect it could have it silently
     * overwritten on disk by clicking Accept / Accept-all, defeating the lock
     * feature for the entire agent-patch journey.
     */
    if (this.isFileLocked(proposal.filePath).locked) {
      const message = workbenchText('workbenchRuntime.patch.locked', { file: proposal.relativePath });
      this.agentPatchProposals.setKey(proposalId, {
        ...proposal,
        status: 'failed',
        updatedAt: new Date().toISOString(),
        error: message,
      });
      this.#syncAgentPatchProposalToServer(proposalId);
      this.actionAlert.set({
        type: 'warning',
        title: workbenchText('workbenchRuntime.files.lockedTitle'),
        description: message,
        content: message,
        source: 'preview',
      });
      this.appendWorkspaceLog(workbenchText('workbenchRuntime.patch.lockedLog', { file: proposal.relativePath }));

      return 'ignored';
    }

    this.agentPatchProposals.setKey(proposalId, {
      ...proposal,
      status: 'applying',
      updatedAt: new Date().toISOString(),
      error: undefined,
    });
    this.#syncAgentPatchProposalToServer(proposalId);

    /*
     * Serialize the whole apply per file path: two multi-agent lanes writing the
     * same file (package.json / index.html) at once made the remote diverge from
     * the base each lane computed against, failing with "Remote file changed
     * since it was loaded" instead of merging. One-at-a-time per path removes the
     * interleave; different paths still apply concurrently.
     */
    return this.#agentPatchApplyMutex.run(proposal.filePath, async () => {
      try {
        let acceptedContent = applyReviewableDiffHunks({
          originalContent: proposal.originalContent,
          hunks: proposal.hunks,
          acceptedHunkIds: acceptedIds,
        });

        try {
          await this.#validateAgentPatchProposal(proposal, acceptedContent);
        } catch (validationError) {
          /*
           * The hunk-applied content failed validation. Recover where possible
           * instead of hard-failing (and repeatedly toasting "Couldn't apply …"):
           * JSON files MERGE the agent's intent onto the current file (bug #21),
           * and non-JSON files fall back to the complete emitted file when the
           * whole proposal was accepted and that full content validates on its
           * own. resolveFailedAgentPatchContent re-throws when no VALID fallback
           * exists, so truncated/invalid streams still fail loudly.
           */
          acceptedContent = await resolveFailedAgentPatchContent(
            {
              relativePath: proposal.relativePath,
              acceptedContent,
              proposedContent: proposal.proposedContent,
              acceptedEveryHunk:
                proposal.hunks.length > 0 && proposal.hunks.every((hunk) => acceptedIds.includes(hunk.id)),
              currentContent: this.#filesStore.getFile(proposal.filePath)?.content ?? proposal.originalContent,
              validationError,
            },
            {
              validate: (content) => this.#validateAgentPatchProposal(proposal, content),
              mergeJson: mergeJsonContent,
              scaffoldPackageJson: () =>
                `${JSON.stringify({ name: 'app', private: true, version: '0.0.0', type: 'module' }, null, 2)}\n`,
              onLog: (message) => this.appendWorkspaceLog(message),
            },
          );
        }

        /*
         * Reconcile against the freshest local content BEFORE writing so a parallel
         * multi-agent lane's changes (package.json deps, the entry index.html)
         * aren't clobbered. Under #agentPatchApplyMutex this observes the previous
         * same-path lane's applied result; JSON unions both edits, other files keep
         * ours (coherent last-write-wins). Both writes below then emit this result.
         */
        const freshBeforeWrite = this.#filesStore.getFile(proposal.filePath)?.content;

        if (
          freshBeforeWrite !== undefined &&
          freshBeforeWrite !== proposal.originalContent &&
          freshBeforeWrite !== acceptedContent
        ) {
          const reconciled = reconcileRemoteWrite(proposal.relativePath, freshBeforeWrite, acceptedContent);

          if (reconciled !== acceptedContent) {
            acceptedContent = reconciled;
            this.appendWorkspaceLog(
              workbenchText('workbenchRuntime.patch.reconciled', { file: proposal.relativePath }),
            );
          }
        }

        const fileExistsInEditor = Boolean(this.#editorStore.documents.get()[proposal.filePath]);

        if (fileExistsInEditor) {
          this.#editorStore.updateFile(proposal.filePath, acceptedContent);

          /*
           * onRemoteConflict:'reconcile' — if the file still changed under us (the
           * store/remote briefly out of sync), merge/adopt instead of failing the
           * lane with "Remote file changed since it was loaded".
           */
          await this.saveFile(proposal.filePath, { onRemoteConflict: 'reconcile' });
        }

        const artifact = this.#getArtifact(proposal.artifactId);

        await writeAcceptedAgentFile(this.#runtime, proposal.relativePath, acceptedContent);
        artifact?.runner.skipAction(proposal.actionId);

        if (!fileExistsInEditor) {
          await this.loadRuntimeFiles('.').catch(() => {
            this.appendWorkspaceLog(workbenchText('workbenchRuntime.patch.refreshSkipped'));
          });
        }

        this.#agentPatchOriginals.delete(proposal.actionId);
        this.resetAllFileModifications();
        this.agentPatchProposals.setKey(proposalId, {
          ...proposal,
          proposedContent: acceptedContent,
          status: 'accepted',
          updatedAt: new Date().toISOString(),
        });
        this.#syncAgentPatchProposalToServer(proposalId);
        this.#emitFileApplied(proposal.relativePath, 'agent', {
          artifactId: proposal.artifactId,
          actionId: proposal.actionId,
        });
        this.#dropResolvedAgentPatchLogs(proposal.relativePath);
        this.#dropResolvedMissingImportFailures();
        this.appendWorkspaceLog(workbenchText('workbenchRuntime.patch.accepted', { file: proposal.relativePath }));

        await this.#createProjectAgentCheckpoint(
          workbenchText('workbenchRuntime.patch.checkpointLabel', { file: proposal.relativePath }),
        ).catch(() => {
          this.appendWorkspaceLog(workbenchText('workbenchRuntime.patch.checkpointSkipped'));
        });

        return 'accepted';
      } catch {
        const message = workbenchText('workbenchRuntime.patch.applyFailed');
        this.agentPatchProposals.setKey(proposalId, {
          ...proposal,
          status: 'failed',
          updatedAt: new Date().toISOString(),
          error: message,
        });
        this.#syncAgentPatchProposalToServer(proposalId);
        this.appendWorkspaceLog(workbenchText('workbenchRuntime.patch.failedLog', { file: proposal.relativePath }));

        return 'failed';
      }
    });
  }

  async acceptAllAgentPatchProposals(proposalIds?: string[], hunkSelections?: Record<string, string[]>) {
    const proposals = this.agentPatchProposals.get();

    const ids = proposalIds?.length
      ? proposalIds
      : Object.values(proposals)
          .filter((proposal) => proposal.status === 'pending')
          .map((proposal) => proposal.id);

    /*
     * Phase 0 #3 — apply patches in topological order so an imported
     * sibling lands before its importer. The pure helper scans imports
     * with a regex and falls back to source order on cycles, so a
     * worst case here is the same one we had before.
     */
    const orderedProposals = topologicallySortFileActions(
      ids.flatMap((id) => {
        const proposal = proposals[id];

        if (!proposal) {
          return [];
        }

        return [{ filePath: proposal.relativePath, content: proposal.proposedContent, id }];
      }),
    );

    const orderedIds = orderedProposals.ordered.map((entry) => entry.id);

    if (orderedProposals.cyclic && orderedProposals.cycleParticipants.length > 0) {
      this.appendWorkspaceLog(
        workbenchText('workbenchRuntime.patch.importCycle', {
          files: orderedProposals.cycleParticipants.join(', '),
        }),
      );
    }

    for (const proposalId of orderedIds) {
      await this.acceptAgentPatchProposal(proposalId, hunkSelections?.[proposalId]);
    }
  }

  /**
   * Revert an already-accepted agent patch by re-running the original file
   * content through the artifact action runner. Lets the "Undo" toast button
   * roll back a silent auto-apply without going through the snapshots panel.
   */
  async revertAgentPatchProposal(proposalId: string) {
    const proposal = this.agentPatchProposals.get()[proposalId];

    if (!proposal || proposal.status !== 'accepted') {
      return;
    }

    const artifact = this.#getArtifact(proposal.artifactId);

    if (!artifact) {
      this.appendWorkspaceLog(workbenchText('workbenchRuntime.patch.revertMissing', { file: proposal.relativePath }));
      return;
    }

    try {
      const fileExistsInEditor = Boolean(this.#editorStore.documents.get()[proposal.filePath]);

      if (fileExistsInEditor) {
        this.#editorStore.updateFile(proposal.filePath, proposal.originalContent);
        await this.saveFile(proposal.filePath);
      }

      /*
       * runAction throws (unreachable "Action not found") if the actionId was
       * never registered, so the on-disk revert silently failed — only the editor
       * buffer was rolled back. Register the synthetic revert action first.
       */
      const revertAction = {
        artifactId: proposal.artifactId,
        messageId: proposal.messageId,
        actionId: `${proposal.actionId}-revert`,
        action: {
          type: 'file' as const,
          filePath: proposal.relativePath,
          content: proposal.originalContent,
        },
      };
      artifact.runner.addAction(revertAction);
      await artifact.runner.runAction(revertAction, false);

      this.agentPatchProposals.setKey(proposalId, {
        ...proposal,
        status: 'reverted',
        updatedAt: new Date().toISOString(),
      });
      this.#syncAgentPatchProposalToServer(proposalId);
      this.#emitFileApplied(proposal.relativePath, 'agent', {
        artifactId: proposal.artifactId,
        actionId: `${proposal.actionId}-revert`,
      });
      this.appendWorkspaceLog(workbenchText('workbenchRuntime.patch.reverted', { file: proposal.relativePath }));
    } catch {
      this.appendWorkspaceLog(workbenchText('workbenchRuntime.patch.revertFailed', { file: proposal.relativePath }));
    }
  }

  async #createProjectAgentCheckpoint(label: string) {
    if (!this.#projectId) {
      return;
    }

    const form = new FormData();
    form.set('intent', 'create');
    form.set('label', label);

    const response = await fetch(`/api/projects/${encodeURIComponent(this.#projectId)}/ide-panel/snapshots`, {
      method: 'POST',
      body: form,
      credentials: 'include',
    });

    if (!response.ok) {
      throw Object.assign(new Error(), { code: 'SNAPSHOT_ENDPOINT_HTTP_ERROR', status: response.status });
    }
  }

  getDeletedPaths() {
    return this.#filesStore.getDeletedPaths();
  }

  setDeletedPaths(paths: string[]) {
    this.#filesStore.setDeletedPaths(paths);
  }

  /**
   * Lock a file to prevent edits
   * @param filePath Path to the file to lock
   * @returns True if the file was successfully locked
   */
  lockFile(filePath: string) {
    return this.#filesStore.lockFile(filePath);
  }

  /**
   * Lock a folder and all its contents to prevent edits
   * @param folderPath Path to the folder to lock
   * @returns True if the folder was successfully locked
   */
  lockFolder(folderPath: string) {
    return this.#filesStore.lockFolder(folderPath);
  }

  /**
   * Unlock a file to allow edits
   * @param filePath Path to the file to unlock
   * @returns True if the file was successfully unlocked
   */
  unlockFile(filePath: string) {
    return this.#filesStore.unlockFile(filePath);
  }

  /**
   * Unlock a folder and all its contents to allow edits
   * @param folderPath Path to the folder to unlock
   * @returns True if the folder was successfully unlocked
   */
  unlockFolder(folderPath: string) {
    return this.#filesStore.unlockFolder(folderPath);
  }

  /**
   * Check if a file is locked
   * @param filePath Path to the file to check
   * @returns Object with locked status, lock mode, and what caused the lock
   */
  isFileLocked(filePath: string) {
    return this.#filesStore.isFileLocked(filePath);
  }

  /**
   * Check if a folder is locked
   * @param folderPath Path to the folder to check
   * @returns Object with locked status, lock mode, and what caused the lock
   */
  isFolderLocked(folderPath: string) {
    return this.#filesStore.isFolderLocked(folderPath);
  }

  async createFile(filePath: string, content: string | Uint8Array = '') {
    try {
      const success = await this.#filesStore.createFile(filePath, content);

      if (success) {
        this.setSelectedFile(filePath);

        /*
         * For empty files, we need to ensure they're not marked as unsaved
         * Only check for empty string, not empty Uint8Array
         */
        if (typeof content === 'string' && content === '') {
          const newUnsavedFiles = new Set(this.unsavedFiles.get());
          newUnsavedFiles.delete(filePath);
          this.unsavedFiles.set(newUnsavedFiles);
        }
      }

      return success;
    } catch (error) {
      console.error('Failed to create file:', error);
      throw error;
    }
  }

  async createFolder(folderPath: string) {
    try {
      return await this.#filesStore.createFolder(folderPath);
    } catch (error) {
      console.error('Failed to create folder:', error);
      throw error;
    }
  }

  async deleteFile(filePath: string) {
    try {
      const currentDocument = this.currentDocument.get();
      const isCurrentFile = currentDocument?.filePath === filePath;

      const success = await this.#filesStore.deleteFile(filePath);

      if (success) {
        const newUnsavedFiles = new Set(this.unsavedFiles.get());

        if (newUnsavedFiles.has(filePath)) {
          newUnsavedFiles.delete(filePath);
          this.unsavedFiles.set(newUnsavedFiles);
        }

        if (isCurrentFile) {
          const files = this.files.get();

          let nextFile: string | undefined = undefined;

          for (const [path, dirent] of Object.entries(files)) {
            if (dirent?.type === 'file') {
              nextFile = path;
              break;
            }
          }

          this.setSelectedFile(nextFile);
        }
      }

      return success;
    } catch (error) {
      console.error('Failed to delete file:', error);
      throw error;
    }
  }

  async deleteFolder(folderPath: string) {
    try {
      const currentDocument = this.currentDocument.get();
      const isInCurrentFolder = currentDocument?.filePath?.startsWith(folderPath + '/');

      const success = await this.#filesStore.deleteFolder(folderPath);

      if (success) {
        const unsavedFiles = this.unsavedFiles.get();
        const newUnsavedFiles = new Set<string>();

        for (const file of unsavedFiles) {
          if (!file.startsWith(folderPath + '/')) {
            newUnsavedFiles.add(file);
          }
        }

        if (newUnsavedFiles.size !== unsavedFiles.size) {
          this.unsavedFiles.set(newUnsavedFiles);
        }

        if (isInCurrentFolder) {
          const files = this.files.get();

          let nextFile: string | undefined = undefined;

          for (const [path, dirent] of Object.entries(files)) {
            if (dirent?.type === 'file') {
              nextFile = path;
              break;
            }
          }

          this.setSelectedFile(nextFile);
        }
      }

      return success;
    } catch (error) {
      console.error('Failed to delete folder:', error);
      throw error;
    }
  }

  abortAllActions() {
    Object.values(this.artifacts.get()).forEach((artifact) => artifact.runner.abortAll());
  }

  abortStreamingFileActions() {
    Object.values(this.artifacts.get()).forEach((artifact) => artifact.runner.abortStreamingFileActions());
  }

  setReloadedMessages(messages: string[]) {
    this.#reloadedMessages = new Set(messages);
  }

  addArtifact({ messageId, title, id, type }: ArtifactCallbackData) {
    const artifact = this.#getArtifact(id);

    if (artifact) {
      return;
    }

    if (!this.artifactIdList.includes(id)) {
      this.artifactIdList.push(id);
    }

    this.artifacts.setKey(id, {
      id,
      title,
      closed: false,
      type,
      runner: new ActionRunner(
        this.#runtime,
        () => this.boltTerminal,
        (alert) => {
          if (this.#reloadedMessages.has(messageId)) {
            return;
          }

          this.actionAlert.set(alert);
        },
        (alert) => {
          if (this.#reloadedMessages.has(messageId)) {
            return;
          }

          this.supabaseAlert.set(alert);
        },
        (alert) => {
          if (this.#reloadedMessages.has(messageId)) {
            return;
          }

          this.deployAlert.set(alert);
        },

        /*
         * Unify the dev-server launch: the AI's `start` action delegates here
         * instead of typing `npm run dev` into an untracked jsh PTY, so the dev
         * server is launched ONCE, through the tracked + install-aware
         * startPreviewServer/streamCommand path (which /processes sees and the
         * conflict-heal can reap). Normal (non-forced) start so it dedups against
         * the client's own auto-run rather than double-launching.
         */
        () => this.startPreviewServer(),
      ),
    });
  }

  updateArtifact({ artifactId }: ArtifactCallbackData, state: Partial<ArtifactUpdateState>) {
    if (!artifactId) {
      return;
    }

    const artifact = this.#getArtifact(artifactId);

    if (!artifact) {
      return;
    }

    const wasClosed = artifact.closed;
    this.artifacts.setKey(artifactId, { ...artifact, ...state });

    if (state.closed && !wasClosed) {
      this.addToExecutionQueue(async () => {
        await artifact.runner.waitForIdle();
        await this.#validatePendingAgentPatchProposalsForArtifact(artifactId);
        await this.#refreshPreviewAfterArtifactClose(artifactId);
      });
    }
  }
  addAction(data: ActionCallbackData) {
    // this._addAction(data);

    this.addToExecutionQueue(() => this._addAction(data));
  }
  async _addAction(data: ActionCallbackData) {
    const { artifactId } = data;

    const artifact = this.#getArtifact(artifactId);

    if (!artifact) {
      unreachable('Artifact not found');
    }

    return artifact.runner.addAction(data);
  }

  runAction(data: ActionCallbackData, isStreaming: boolean = false) {
    if (isStreaming) {
      this.actionStreamSampler(data, isStreaming);
    } else {
      this.addToExecutionQueue(() => this._runAction(data, isStreaming));
    }
  }
  async _runAction(data: ActionCallbackData, isStreaming: boolean = false) {
    const { artifactId } = data;

    const artifact = this.#getArtifact(artifactId);

    if (!artifact) {
      unreachable('Artifact not found');
    }

    const action = artifact.runner.actions.get()[data.actionId];

    if (!action || action.executed) {
      return;
    }

    if (this.#reloadedMessages.has(data.messageId)) {
      artifact.runner.skipAction(data.actionId);
      return;
    }

    if (data.action.type === 'diff') {
      /*
       * Anchored diff edit. This is the EARLIEST seam common to BOTH the review
       * proposal and the auto-apply write: resolve the diff into the full applied
       * file content ONCE here, then substitute the exact equivalent of a
       * `type="file"` action so the entire file pipeline below runs unchanged —
       * the review proposal (built via buildReviewableDiffHunks) and the direct
       * write (sanitize / self-repair / writeFile / project-doctor reconcile)
       * both operate on the applied FULL content, never the raw blocks.
       */
      if (isStreaming) {
        // A partial search/replace payload is unparseable — render nothing, never apply.
        return;
      }

      const resolution = await artifact.runner.resolveDiffAction(data.action);

      if (!resolution.ok) {
        /*
         * Auto full-file re-emit recovery BEFORE surfacing a user-facing error.
         * This interception seam resolves diffs itself, so the runner's own
         * #runDiffAction fallback never runs — wire the SAME recovery here (a
         * drifted anchor / malformed block asks the model to re-emit the COMPLETE
         * file, then normalizes onto the file pipeline below). Only with an existing
         * base file; `missing-file` has nothing to repair. Purely additive on an
         * already-failing branch: on failure it falls through to the strict alert,
         * so it can never regress a working apply. Stop cancels via abortSignal.
         */
        const recovered =
          (resolution.kind === 'apply-failed' || resolution.kind === 'malformed') &&
          typeof resolution.original === 'string'
            ? await artifact.runner.recoverDiffViaFullFileReemit(
                data.action.filePath,
                resolution.original,
                data.action.content,
                action.abortSignal,
              )
            : null;

        if (recovered == null) {
          /*
           * STRICT fail-safe: the base file is left byte-unchanged. Surface the
           * failure and ask the model for a full-file re-emission; write nothing.
           */
          this.actionAlert.set({
            type: 'warning',
            title: workbenchText('workbenchRuntime.diff.title'),
            description: workbenchText('workbenchRuntime.diff.description'),
            content: workbenchText('workbenchRuntime.diff.description'),
            source: 'preview',
          });
          this.appendWorkspaceLog(workbenchText('workbenchRuntime.diff.log'));
          artifact.runner.skipAction(data.actionId);

          return;
        }

        // Recovered: substitute the re-emitted FULL file and continue the pipeline.
        data = {
          ...data,
          action: {
            type: 'file',
            filePath: data.action.filePath,
            content: recovered,
          },
        };
      } else {
        data = {
          ...data,
          action: {
            type: 'file',
            filePath: data.action.filePath,
            content: resolution.content,
          },
        };
      }
    }

    if (data.action.type === 'file') {
      if (this.agentPatchReviewRequired.get()) {
        this.#queueAgentPatchProposal(data, isStreaming);

        if (!isStreaming) {
          artifact.runner.skipAction(data.actionId);
        }

        return;
      }

      await this.#createAutomaticSnapshotBeforeLargeAiChange(data);

      const fullPath = path.join(this.#runtime.workdir, data.action.filePath);

      /*
       * For scoped locks, we would need to implement diff checking here
       * to determine if the AI is modifying existing code or just adding new code
       * This is a more complex feature that would be implemented in a future update
       */

      if (this.selectedFile.value !== fullPath) {
        this.setSelectedFile(fullPath);
      }

      if (this.currentView.value !== 'code') {
        this.currentView.set('code');
      }

      if (isStreaming) {
        const doc = this.#editorStore.documents.get()[fullPath];

        if (!doc && !this.#streamMaterializedPaths.has(fullPath)) {
          this.#streamMaterializedPaths.add(fullPath);
          await artifact.runner.runAction(data, true);
        }

        /*
         * Don't stomp the editor buffer of a file the user is actively editing:
         * if the target has unsaved edits or is locked, preserve the user's
         * work and surface a one-time conflict alert instead of silently
         * overwriting it with the streamed AI content.
         */
        const hasUnsavedEdits = this.unsavedFiles.get().has(fullPath);
        const lockState = this.isFileLocked(fullPath);

        if (hasUnsavedEdits || lockState.locked) {
          const conflictTitle = workbenchText('workbenchRuntime.write.conflictTitle');

          if (this.actionAlert.value?.title !== conflictTitle) {
            this.actionAlert.set({
              type: 'warning',
              title: conflictTitle,
              description: workbenchText('workbenchRuntime.write.conflictDescription', {
                file: data.action.filePath,
              }),
              content: '',
              source: 'preview',
            });
          }

          return;
        }

        this.#editorStore.updateFile(fullPath, data.action.content);

        return;
      }

      /*
       * Enforce file locks on the authoritative (non-streaming) write too. The
       * streaming branch above blocks the live preview, but the final on-disk
       * write is dispatched a second time with isStreaming=false; without this
       * guard a locked file would be silently overwritten on disk, destroying
       * the user's protected content and defeating the lock feature entirely.
       */
      const nonStreamingLockState = this.isFileLocked(fullPath);

      if (nonStreamingLockState.locked) {
        const message = workbenchText('workbenchRuntime.write.locked', { file: data.action.filePath });
        this.actionAlert.set({
          type: 'warning',
          title: workbenchText('workbenchRuntime.write.blockedTitle'),
          description: message,
          content: message,
          source: 'preview',
        });
        this.appendWorkspaceLog(workbenchText('workbenchRuntime.write.blockedLog', { file: data.action.filePath }));
        artifact.runner.skipAction(data.actionId);

        return;
      }

      await artifact.runner.runAction(data);

      const completedAction = artifact.runner.actions.get()[data.actionId];

      if (completedAction?.status === 'failed') {
        const message = workbenchText('workbenchRuntime.write.failed', { file: data.action.filePath });

        this.actionAlert.set({
          type: 'error',
          title: workbenchText('workbenchRuntime.write.blockedTitle'),
          description: message,
          content: message,
          source: 'preview',
        });
        this.appendWorkspaceLog(workbenchText('workbenchRuntime.write.blockedLog', { file: data.action.filePath }));

        return;
      }

      /*
       * BUG-AGENT-002 — fail-closed status. "Terminé" used to be declared from
       * the parser alone: the action was ticked complete whether or not the
       * bytes ever reached the runtime pod. That is exactly how a run reported
       * "Terminé 100 %" on 20 files while `src/main.tsx` was absent from the
       * pod and the preview stayed blank.
       *
       * Read the file back instead of trusting the write. Only presence and
       * readability are asserted, NOT byte equality: the write path legitimately
       * rewrites the payload (content sanitizer, self-repair loop), so comparing
       * against `data.action.content` would cry wolf on every repaired file.
       */
      /*
       * Le chemin est capturé AVANT la closure : dans `() => …`, TypeScript perd
       * le rétrécissement de `data.action` vers une action de fichier, puisque
       * l'appel est différé.
       */
      const cheminEcrit = data.action.filePath;
      const confirmation = await confirmWriteWithinDeadline(() => this.#runtime.readFile(cheminEcrit));

      if (confirmation !== 'confirmed') {
        const message =
          confirmation === 'timeout'
            ? workbenchText('workbenchRuntime.write.notConfirmed', {
                file: data.action.filePath,
                seconds: Math.round(WRITE_CONFIRMATION_TIMEOUT_MS / 1000),
              })
            : workbenchText('workbenchRuntime.write.failed', { file: data.action.filePath });

        artifact.runner.failAction(data.actionId, message);
        this.actionAlert.set({
          type: 'error',
          title: workbenchText('workbenchRuntime.write.blockedTitle'),
          description: message,
          content: message,
          source: 'preview',
        });
        this.appendWorkspaceLog(workbenchText('workbenchRuntime.write.blockedLog', { file: data.action.filePath }));

        return;
      }

      await this.loadRuntimeFiles('.').catch(() => {
        this.appendWorkspaceLog(workbenchText('workbenchRuntime.write.refreshSkipped'));
      });

      const writtenFile = this.#filesStore.getFile(fullPath);
      this.#editorStore.updateFile(fullPath, writtenFile?.content ?? data.action.content);
      this.resetAllFileModifications();
      this.#emitFileApplied(data.action.filePath, 'agent', {
        artifactId: data.artifactId,
        actionId: data.actionId,
      });
      this.#dropResolvedMissingImportFailures();
    } else {
      if (this.agentPatchReviewRequired.get() && this.#hasOpenAgentPatchProposalsForArtifact(artifactId)) {
        artifact.runner.skipAction(data.actionId);
        this.appendWorkspaceLog(workbenchText('workbenchRuntime.write.commandReviewPending'));

        return;
      }

      await artifact.runner.runAction(data);
    }
  }

  #hasOpenAgentPatchProposalsForArtifact(artifactId: string) {
    const proposals = Object.values(this.agentPatchProposals.get());

    return proposals.some(
      (proposal) => proposal.artifactId === artifactId && !isTerminalAgentPatchStatus(proposal.status),
    );
  }

  #workspaceImportValidationFiles() {
    const files = new Map<string, string>();

    for (const [filePath, file] of Object.entries(this.#filesStore.files.get())) {
      if (file?.type === 'file' && !file.isBinary) {
        files.set(this.#relativeWorkbenchPath(filePath), file.content);
      }
    }

    for (const [filePath, document] of Object.entries(this.#editorStore.documents.get())) {
      if (!document.isBinary) {
        files.set(this.#relativeWorkbenchPath(filePath), document.value);
      }
    }

    return files;
  }

  #relativeWorkbenchPath(filePath: string) {
    return filePath.replaceAll('\\', '/').replace(this.#runtime.workdir, '').replace(/^\/+/, '');
  }

  #agentPatchValidationFiles(artifactId: string, currentFile?: GeneratedFile) {
    const files = this.#workspaceImportValidationFiles();

    for (const proposal of Object.values(this.agentPatchProposals.get())) {
      if (proposal.artifactId !== artifactId) {
        continue;
      }

      if (proposal.status === 'rejected' || proposal.status === 'failed' || proposal.status === 'reverted') {
        continue;
      }

      files.set(this.#relativeWorkbenchPath(proposal.relativePath), proposal.proposedContent);
    }

    if (currentFile) {
      files.set(this.#relativeWorkbenchPath(currentFile.path), currentFile.content);
    }

    return files;
  }

  async #validateAgentPatchProposal(proposal: AgentPatchProposal, proposedContent: string) {
    const generatedFile = {
      path: proposal.relativePath,
      content: proposedContent,
    };

    await validateGeneratedFile(generatedFile, this.#agentPatchValidationFiles(proposal.artifactId, generatedFile));
  }

  async #validatePendingAgentPatchProposalsForArtifact(artifactId: string) {
    const proposals = Object.values(this.agentPatchProposals.get()).filter(
      (proposal) => proposal.artifactId === artifactId && proposal.status === 'pending',
    );

    if (!proposals.length) {
      return;
    }

    const validationFiles = this.#workspaceImportValidationFiles();

    for (const proposal of proposals) {
      validationFiles.set(this.#relativeWorkbenchPath(proposal.relativePath), proposal.proposedContent);
    }

    try {
      await validateGeneratedFiles(
        proposals.map((proposal) => ({
          path: proposal.relativePath,
          content: proposal.proposedContent,
        })),
        validationFiles,
      );
    } catch (error) {
      const message = workbenchText('workbenchRuntime.validation.failed');
      const failedPath = error instanceof Error && 'filePath' in error ? String(error.filePath) : null;

      for (const proposal of proposals) {
        const proposalPath = this.#relativeWorkbenchPath(proposal.relativePath);

        if (failedPath && proposalPath !== failedPath) {
          continue;
        }

        const artifact = this.#getArtifact(proposal.artifactId);

        artifact?.runner.skipAction(proposal.actionId);
        this.agentPatchProposals.setKey(proposal.id, {
          ...proposal,
          status: 'failed',
          updatedAt: new Date().toISOString(),
          error: message,
        });
        this.#syncAgentPatchProposalToServer(proposal.id);
        this.appendWorkspaceLog(
          workbenchText('workbenchRuntime.validation.patchBlocked', { file: proposal.relativePath }),
        );
      }
    }
  }

  #queueAgentPatchProposal(data: ActionCallbackData, isStreaming: boolean) {
    if (data.action.type !== 'file') {
      return;
    }

    const fullPath = path.join(this.#runtime.workdir, data.action.filePath);
    const existingFile = this.#filesStore.getFile(fullPath);
    const existingDocument = this.#editorStore.documents.get()[fullPath];

    const originalContent =
      this.#agentPatchOriginals.get(data.actionId) ??
      (existingFile?.type === 'file' ? existingFile.content : undefined) ??
      existingDocument?.value ??
      '';

    this.#agentPatchOriginals.set(data.actionId, originalContent);

    const now = new Date().toISOString();
    const proposalId = `${data.artifactId}:${data.actionId}`;
    const previous = this.agentPatchProposals.get()[proposalId];
    const hunks = buildReviewableDiffHunks(data.action.filePath, originalContent, data.action.content);

    this.agentPatchProposals.setKey(proposalId, {
      id: proposalId,
      artifactId: data.artifactId,
      messageId: data.messageId,
      actionId: data.actionId,
      filePath: fullPath,
      relativePath: data.action.filePath,
      originalContent,
      proposedContent: data.action.content,
      hunks,
      status: previous?.status === 'accepted' || previous?.status === 'rejected' ? previous.status : 'pending',
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
    });
    this.#syncAgentPatchProposalToServer(proposalId);

    if (this.selectedFile.value !== fullPath) {
      this.setSelectedFile(fullPath);
    }

    if (this.currentView.value !== 'diff') {
      this.currentView.set('diff');
    }

    if (!isStreaming) {
      this.appendWorkspaceLog(
        workbenchText('workbenchRuntime.validation.waitingForReview', { file: data.action.filePath }),
      );
    }
  }

  async #refreshPreviewAfterArtifactClose(artifactId: string) {
    await this.loadRuntimeFiles('.').catch(() => {
      this.appendWorkspaceLog(workbenchText('workbenchRuntime.validation.previewRefreshSkipped'));
    });

    const previewManifestChanged = await this.#syncPreviewManifestFromRuntime().catch(() => {
      this.appendWorkspaceLog(
        workbenchText('workbenchRuntime.validation.dependencySyncSkipped', { artifact: artifactId }),
      );

      return false;
    });

    if (previewManifestChanged) {
      await this.loadRuntimeFiles('.').catch(() => undefined);
    }

    /*
     * Persist the generated app to durable project storage FIRST — before the
     * import-validation gate. validateGeneratedFiles throws MissingImportError for
     * any relative import that doesn't yet resolve (very common mid-generation: a
     * module emitted in a later boltAction, or a path typo), and the early-return
     * below previously skipped the save entirely, so the just-generated app was
     * LOST. Validation must only decide whether to (re)start the preview, never
     * whether the files are saved.
     */
    await this.#persistRuntimeFilesToProjectStorage(artifactId);

    if (!(await this.#validateWorkspaceImportsAfterArtifactClose(artifactId))) {
      return;
    }

    if (!this.#findPackageJsonEntry()) {
      return;
    }

    await this.restartPreviewServer().catch(() => {
      this.appendWorkspaceLog(
        workbenchText('workbenchRuntime.validation.previewRestartSkipped', { artifact: artifactId }),
      );
    });
  }

  async #validateWorkspaceImportsAfterArtifactClose(artifactId: string) {
    const files = this.#workspaceImportValidationFiles();

    const generatedFiles: GeneratedFile[] = [...files.entries()]

      /*
       * Exclude ALL .json files from this preview-path validation. This method
       * exists to catch unresolved IMPORTS in source files; JSON files (package.json,
       * tsconfig.json, *.config.json, …) have no JS imports, so dropping them loses
       * nothing for that check. Crucially, a malformed or empty config JSON (e.g. a
       * project seeded from storage where an earlier write was cut short, or a
       * tsconfig still mid-stream) must NOT hard-block the preview: validateGeneratedFiles
       * JSON-parses every .json and throws GeneratedFileJsonError, which returned
       * early and surfaced a dead "Preview Error: Invalid JSON in tsconfig.json:
       * Unexpected end of JSON input" with no path to recovery — even though vite
       * serves fine without a valid tsconfig and buildPreviewManifestRepair
       * synthesizes a valid package manifest moments later in startPreviewServer.
       * The agent-apply path (validateGeneratedFiles at patch time, above) still
       * validates every JSON the model emits, so the agent feedback loop is intact.
       */
      .filter(([filePath]) => !(filePath.split('/').pop() ?? '').toLowerCase().endsWith('.json'))
      .map(([filePath, content]) => ({
        path: filePath,
        content,
      }));

    try {
      await validateGeneratedFiles(generatedFiles);

      return true;
    } catch {
      const message = workbenchText('workbenchRuntime.validation.invalidImportDescription');

      this.actionAlert.set({
        type: 'error',
        title: workbenchText('workbenchRuntime.validation.invalidImportTitle'),
        description: message,
        content: message,
        source: 'preview',
      });
      this.appendWorkspaceLog(
        workbenchText('workbenchRuntime.validation.previewRestartBlocked', { artifact: artifactId }),
      );

      return false;
    }
  }

  async #syncPreviewManifestFromRuntime() {
    /*
     * A freshly provisioned workspace pod often returns 502/503 from the runtime
     * proxy for the first few seconds while it is still coming up. Without
     * retrying, the manifest sync (and therefore dependency installation) is
     * skipped entirely, leaving node_modules empty and the preview dead. Retry
     * the whole sync with exponential backoff on transient errors — the file
     * writes here are idempotent so re-running is safe.
     *
     * Budget: 8 attempts (~0.75+1.5+3+6+8+8+8 ≈ 35s) so the FIRST open of a
     * brand-new project — or the reopen of an older project whose workspace pod
     * was GC'd and must be re-provisioned cold — survives the gap between the pod
     * reporting Ready and the agent actually serving /files. The earlier 6-attempt
     * (~19s) budget could still expire on a slow cold/re-provision (sustained
     * 502s), silently skipping the sync → empty node_modules → dead preview; the
     * user is then directed to the "reinstall dependencies" recourse.
     */
    return withRuntimeRetry(() => this.#syncPreviewManifestFromRuntimeOnce(), {
      attempts: 8,
      onRetry: (attempt, delayMs) => {
        this.appendWorkspaceLog(
          workbenchText('workbenchRuntime.dependencies.retry', {
            attempt,
            seconds: Math.round(delayMs / 100) / 10,
          }),
        );
      },
    });
  }

  async #syncPreviewManifestFromRuntimeOnce() {
    const files = await collectRuntimeTextFiles(this.#runtime, '.', {
      excludeDirectory: (name) => PROJECT_STORAGE_SYNC_EXCLUDED_DIRECTORIES.has(name),
      excludeFile: (name) => PROJECT_STORAGE_SYNC_EXCLUDED_FILES.has(name),
    });

    /*
     * Project Doctor (holistic, pre-"Done"): reconcile default-import ↔
     * named-export mismatches across the WHOLE graph (not just the App entry the
     * per-file pass covers) and audit import resolution. This is where the
     * parallel role-lanes' inter-file inconsistencies get healed before the
     * manifest repair (package.json / vite / barrels) runs on the fixed files.
     */
    const doctor = runProjectDoctor(files);

    for (const [doctorPath, doctorContent] of Object.entries(doctor.fixups)) {
      await this.#runtime.writeFile(doctorPath, doctorContent);
      files[doctorPath] = doctorContent;
    }

    if (Object.keys(doctor.fixups).length) {
      this.appendWorkspaceLog(
        workbenchText('workbenchRuntime.doctor.fixedExports', {
          files: Object.keys(doctor.fixups).join(', '),
        }),
      );
    }

    for (const item of doctor.unresolved) {
      this.appendWorkspaceLog(
        workbenchText('workbenchRuntime.doctor.unresolvedImport', {
          specifier: item.specifier,
          importer: item.importer,
        }),
      );
    }

    const repair = buildPreviewManifestRepair(files);

    let changed = Object.keys(doctor.fixups).length > 0;

    if (repair.packageJson && (repair.packageJson.created || repair.packageJson.changed)) {
      await this.#runtime.writeFile(repair.packageJson.path, repair.packageJson.content);
      changed = true;

      if (repair.packageJson.created) {
        this.appendWorkspaceLog(
          workbenchText('workbenchRuntime.doctor.createdManifest', { file: repair.packageJson.path }),
        );
      }

      if (repair.packageJson.missingDependencies.length) {
        this.appendWorkspaceLog(
          workbenchText('workbenchRuntime.doctor.addedDependencies', {
            dependencies: repair.packageJson.missingDependencies.join(', '),
          }),
        );
      }

      if (repair.packageJson.addedScripts.length) {
        this.appendWorkspaceLog(
          workbenchText('workbenchRuntime.doctor.addedScripts', {
            scripts: repair.packageJson.addedScripts.join(', '),
          }),
        );
      }

      if (repair.packageJson.upgradedDependencies.length) {
        this.appendWorkspaceLog(
          workbenchText('workbenchRuntime.doctor.upgradedReact', {
            dependencies: repair.packageJson.upgradedDependencies.join(', '),
          }),
        );
      }
    }

    for (const file of repair.supplementalFiles) {
      await this.#runtime.writeFile(file.path, file.content);
      this.appendWorkspaceLog(workbenchText('workbenchRuntime.doctor.createdRuntimeFile', { file: file.path }));
      changed = true;
    }

    return changed;
  }

  async #persistRuntimeFilesToProjectStorage(artifactId: string) {
    /*
     * Capture projectId + runtime as a consistent snapshot up-front. This is a
     * long async flow (collect files, zip) and WorkbenchStore is a singleton
     * whose #projectId/#runtime flip synchronously on a project switch. Re-reading
     * the LIVE this.#projectId at the destructive replaceExisting POST below meant
     * a switch mid-flow sent one project's files to ANOTHER project's storage,
     * overwriting it. Bind both here and use the captured pair throughout.
     */
    const projectId = this.#projectId;
    const runtime = this.#runtime;

    if (!projectId) {
      return;
    }

    try {
      const files = await collectRuntimeTextFiles(runtime, '.', {
        excludeDirectory: (name) => PROJECT_STORAGE_SYNC_EXCLUDED_DIRECTORIES.has(name),
        excludeFile: (name) => PROJECT_STORAGE_SYNC_EXCLUDED_FILES.has(name),
      });

      const zip = new JSZip();

      let fileCount = 0;
      let totalBytes = 0;

      for (const [filePath, content] of Object.entries(files)) {
        const byteLength = new TextEncoder().encode(content).byteLength;

        if (byteLength > PROJECT_STORAGE_SYNC_MAX_FILE_BYTES) {
          this.appendWorkspaceLog(workbenchText('workbenchRuntime.storage.skippedLargeFile', { file: filePath }));
          continue;
        }

        if (totalBytes + byteLength > PROJECT_STORAGE_SYNC_MAX_TOTAL_BYTES) {
          this.appendWorkspaceLog(workbenchText('workbenchRuntime.storage.sizeLimit'));
          break;
        }

        zip.file(filePath, content);
        fileCount++;
        totalBytes += byteLength;
      }

      if (!fileCount) {
        return;
      }

      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/files/import/zip`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ zipBase64: await zip.generateAsync({ type: 'base64' }), replaceExisting: true }),
      });

      if (!response.ok) {
        throw Object.assign(new Error(), { code: 'PROJECT_IMPORT_HTTP_ERROR', status: response.status });
      }

      this.appendWorkspaceLog(
        workbenchText('workbenchRuntime.storage.synced', { count: fileCount, artifact: artifactId }),
      );
    } catch {
      this.appendWorkspaceLog(workbenchText('workbenchRuntime.storage.skipped', { artifact: artifactId }));
    }
  }

  async #createAutomaticSnapshotBeforeLargeAiChange(data: ActionCallbackData) {
    if (this.#runtime.mode !== 'remote-kubernetes') {
      return;
    }

    if (this.#snapshottedArtifacts.has(data.artifactId)) {
      return;
    }

    const contentLength = data.action.type === 'file' ? data.action.content.length : 0;

    if (contentLength < 8_000) {
      return;
    }

    try {
      await this.#runtime.createSnapshot(
        workbenchText('workbenchRuntime.snapshot.beforeAi', { artifact: data.artifactId }),
      );

      /*
       * Mark as snapshotted only AFTER success. Setting the dedup marker first
       * meant a transient createSnapshot failure (exactly when a safety snapshot
       * matters) permanently suppressed the retry for this artifact.
       */
      this.#snapshottedArtifacts.add(data.artifactId);
    } catch (error) {
      console.warn('Failed to create automatic pre-AI snapshot:', error);
    }
  }

  actionStreamSampler = createSampler(async (data: ActionCallbackData, isStreaming: boolean = false) => {
    return await this._runAction(data, isStreaming);
  }, ACTION_STREAM_SAMPLE_INTERVAL_MS);

  #emitFileApplied(
    filePath: string,
    source: 'agent' | 'user' | 'system',
    metadata?: {
      artifactId?: string;
      actionId?: string;
    },
  ) {
    workspaceEvents.emit('file:applied', {
      filePath,
      source,
      ...metadata,
    });
  }

  #getArtifact(id: string) {
    const artifacts = this.artifacts.get();
    return artifacts[id];
  }

  async downloadZip() {
    const zip = new JSZip();
    const files = this.files.get();

    // Get the project name from the description input, or use a default name
    const projectName = (description.value ?? 'project').toLocaleLowerCase().split(' ').join('_');

    // Generate a simple 6-character hash based on the current timestamp
    const timestampHash = Date.now().toString(36).slice(-6);
    const uniqueProjectName = `${projectName}_${timestampHash}`;

    for (const [filePath, dirent] of Object.entries(files)) {
      if (dirent?.type === 'file') {
        const relativePath = extractRelativePath(filePath);

        /*
         * Binary files are stored base64-encoded — decode them into the zip so
         * images/fonts/assets are included instead of being silently dropped.
         */
        const fileOptions = dirent.isBinary ? { base64: true } : undefined;

        // split the path into segments
        const pathSegments = relativePath.split('/');

        // if there's more than one segment, we need to create folders
        if (pathSegments.length > 1) {
          let currentFolder = zip;

          for (let i = 0; i < pathSegments.length - 1; i++) {
            currentFolder = currentFolder.folder(pathSegments[i])!;
          }
          currentFolder.file(pathSegments[pathSegments.length - 1], dirent.content, fileOptions);
        } else {
          // if there's only one segment, it's a file in the root
          zip.file(relativePath, dirent.content, fileOptions);
        }
      }
    }

    // Generate the zip file and save it
    const content = await zip.generateAsync({ type: 'blob' });
    saveAs(content, `${uniqueProjectName}.zip`);
  }

  async syncFiles(targetHandle: FileSystemDirectoryHandle) {
    const files = this.files.get();
    const syncedFiles = [];

    for (const [filePath, dirent] of Object.entries(files)) {
      if (dirent?.type === 'file') {
        const relativePath = extractRelativePath(filePath);
        const pathSegments = relativePath.split('/');

        let currentHandle = targetHandle;

        for (let i = 0; i < pathSegments.length - 1; i++) {
          currentHandle = await currentHandle.getDirectoryHandle(pathSegments[i], { create: true });
        }

        // create or get the file
        const fileHandle = await currentHandle.getFileHandle(pathSegments[pathSegments.length - 1], {
          create: true,
        });

        /*
         * Write binary files too. They are stored base64-encoded, so decode them
         * into a Uint8Array before writing; otherwise (with the old `!isBinary`
         * filter) every image/font/favicon/PDF asset was silently dropped while
         * the caller still reported "Files synced successfully".
         */
        const writable = await fileHandle.createWritable();
        await writable.write(syncWriteContent(dirent));
        await writable.close();

        syncedFiles.push(relativePath);
      }
    }

    return syncedFiles;
  }

  async pushToRepository(
    provider: 'github' | 'gitlab',
    repoName: string,
    commitMessage?: string,
    username?: string,
    token?: string,
    isPrivate: boolean = false,
    branchName: string = 'main',
  ) {
    try {
      const isGitHub = provider === 'github';
      const isGitLab = provider === 'gitlab';

      const authToken = token || Cookies.get(isGitHub ? 'githubToken' : 'gitlabToken');
      const owner = username || Cookies.get(isGitHub ? 'githubUsername' : 'gitlabUsername');

      if (!authToken || !owner) {
        throw new Error(workbenchText('workbenchRuntime.repository.credentialsMissing', { provider }));
      }

      const files = this.files.get();

      if (!files || Object.keys(files).length === 0) {
        throw new Error(workbenchText('workbenchRuntime.repository.noFiles'));
      }

      if (isGitHub) {
        // Initialize Octokit with the auth token
        const octokit = new Octokit({ auth: authToken });

        // Check if the repository already exists before creating it
        let repo: RestEndpointMethodTypes['repos']['get']['response']['data'];
        let visibilityJustChanged = false;

        try {
          const resp = await octokit.repos.get({ owner, repo: repoName });
          repo = resp.data;
          console.log('Repository already exists, using existing repo');

          // Check if we need to update visibility of existing repo
          if (repo.private !== isPrivate) {
            console.log(
              `Updating repository visibility from ${repo.private ? 'private' : 'public'} to ${isPrivate ? 'private' : 'public'}`,
            );

            try {
              // Update repository visibility using the update method
              const { data: updatedRepo } = await octokit.repos.update({
                owner,
                repo: repoName,
                private: isPrivate,
              });

              console.log('Repository visibility updated successfully');
              repo = updatedRepo;
              visibilityJustChanged = true;

              // Add a delay after changing visibility to allow GitHub to fully process the change
              console.log('Waiting for visibility change to propagate...');
              await new Promise((resolve) => setTimeout(resolve, 3000)); // 3 second delay
            } catch (visibilityError) {
              console.error('Failed to update repository visibility:', visibilityError);

              // Continue with push even if visibility update fails
            }
          }
        } catch (error) {
          if (error instanceof Error && 'status' in error && error.status === 404) {
            // Repository doesn't exist, so create a new one
            console.log(`Creating new repository with private=${isPrivate}`);

            // Create new repository with specified privacy setting
            const createRepoOptions = {
              name: repoName,
              private: isPrivate,
              auto_init: true,
            };

            console.log('Create repo options:', createRepoOptions);

            const { data: newRepo } = await octokit.repos.createForAuthenticatedUser(createRepoOptions);

            console.log('Repository created:', newRepo.html_url, 'Private:', newRepo.private);
            repo = newRepo;

            // Add a small delay after creating a repository to allow GitHub to fully initialize it
            console.log('Waiting for repository to initialize...');
            await new Promise((resolve) => setTimeout(resolve, 2000)); // 2 second delay
          } else {
            console.error('Cannot create repo:', error);
            throw error; // Some other error occurred
          }
        }

        // Get all files
        const files = this.files.get();

        if (!files || Object.keys(files).length === 0) {
          throw new Error(workbenchText('workbenchRuntime.repository.noFiles'));
        }

        // Function to push files with retry logic
        const pushFilesToRepo = async (attempt = 1): Promise<string> => {
          const maxAttempts = 3;

          try {
            console.log(`Pushing files to repository (attempt ${attempt}/${maxAttempts})...`);

            // Create blobs for each file
            const blobs = await Promise.all(
              Object.entries(files).map(async ([filePath, dirent]) => {
                if (dirent?.type === 'file') {
                  /*
                   * Guard on file type, not content truthiness: an empty file
                   * (content === '') is a legitimate file (.gitkeep, empty
                   * __init__.py, placeholder modules) and must be committed.
                   * Treat missing content as an empty blob.
                   */
                  const content = dirent.content ?? '';

                  const { data: blob } = await octokit.git.createBlob({
                    owner: repo.owner.login,
                    repo: repo.name,

                    /*
                     * Binary files are stored as a base64 string already
                     * (FilesStore sets isBinary + base64 content), so re-encoding
                     * them produced base64-of-base64 and corrupted the asset on
                     * push. Send binary content as-is; encode text as base64
                     * (Buffer.from('').toString('base64') === '' is a valid
                     * empty blob).
                     */
                    content: dirent.isBinary ? content : Buffer.from(content).toString('base64'),
                    encoding: 'base64',
                  });

                  return { path: extractRelativePath(filePath), sha: blob.sha };
                }

                return null;
              }),
            );

            const validBlobs = blobs.filter(Boolean); // Filter out any undefined blobs

            if (validBlobs.length === 0) {
              throw new Error(workbenchText('workbenchRuntime.repository.noValidFiles'));
            }

            // Refresh repository reference to ensure we have the latest data
            const repoRefresh = await octokit.repos.get({ owner, repo: repoName });
            repo = repoRefresh.data;

            /*
             * Push to the requested branch (falling back to the repo default),
             * not unconditionally to the default branch.
             */
            const targetBranch = branchName || repo.default_branch || 'main';

            /*
             * Resolve the base commit: prefer the target branch's tip, but if
             * that branch doesn't exist yet, branch off the repo's default branch.
             */
            let latestCommitSha: string;
            let targetRefExists = true;

            try {
              const { data: ref } = await octokit.git.getRef({
                owner: repo.owner.login,
                repo: repo.name,
                ref: `heads/${targetBranch}`,
              });
              latestCommitSha = ref.object.sha;
            } catch {
              targetRefExists = false;

              const { data: defaultRef } = await octokit.git.getRef({
                owner: repo.owner.login,
                repo: repo.name,
                ref: `heads/${repo.default_branch || 'main'}`,
              });
              latestCommitSha = defaultRef.object.sha;
            }

            // Create a new tree
            const { data: newTree } = await octokit.git.createTree({
              owner: repo.owner.login,
              repo: repo.name,
              base_tree: latestCommitSha,
              tree: validBlobs.map((blob) => ({
                path: blob!.path,
                mode: '100644',
                type: 'blob',
                sha: blob!.sha,
              })),
            });

            // Create a new commit
            const { data: newCommit } = await octokit.git.createCommit({
              owner: repo.owner.login,
              repo: repo.name,
              message: commitMessage || workbenchText('workbenchRuntime.repository.initialCommit'),
              tree: newTree.sha,
              parents: [latestCommitSha],
            });

            // Update the target branch ref, or create it when pushing to a new branch.
            if (targetRefExists) {
              await octokit.git.updateRef({
                owner: repo.owner.login,
                repo: repo.name,
                ref: `heads/${targetBranch}`,
                sha: newCommit.sha,
              });
            } else {
              await octokit.git.createRef({
                owner: repo.owner.login,
                repo: repo.name,
                ref: `refs/heads/${targetBranch}`,
                sha: newCommit.sha,
              });
            }

            console.log('Files successfully pushed to repository');

            return repo.html_url;
          } catch (error) {
            console.error(`Error during push attempt ${attempt}:`, error);

            // If we've just changed visibility and this is not our last attempt, wait and retry
            if ((visibilityJustChanged || attempt === 1) && attempt < maxAttempts) {
              const delayMs = attempt * 2000; // Increasing delay with each attempt
              console.log(`Waiting ${delayMs}ms before retry...`);
              await new Promise((resolve) => setTimeout(resolve, delayMs));

              return pushFilesToRepo(attempt + 1);
            }

            throw error; // Rethrow if we're out of attempts
          }
        };

        // Execute the push function with retry logic
        const repoUrl = await pushFilesToRepo();

        // Return the repository URL
        return repoUrl;
      }

      if (isGitLab) {
        const gitLabApiService = new GitLabApiService(authToken, 'https://gitlab.com');

        // Check or create repo
        let repo = await gitLabApiService.getProject(owner, repoName);

        if (!repo) {
          repo = await gitLabApiService.createProject(repoName, isPrivate);
          await new Promise((r) => setTimeout(r, 2000)); // Wait for repo initialization
        }

        // Check if branch exists, create if not
        const branchAlreadyExists = await gitLabApiService.branchExists(repo.id, branchName).catch(() => false);

        if (!branchAlreadyExists && repo.default_branch) {
          /*
           * Only fork from an existing default branch. A freshly-created GitLab
           * project (initialize_with_readme: false) is empty and has no
           * default_branch — calling createBranch with an undefined ref throws
           * and aborts the whole push. commitFiles below creates the branch
           * implicitly on the first commit, so skip createBranch in that case.
           */
          await gitLabApiService.createBranch(repo.id, branchName, repo.default_branch);
          await new Promise((r) => setTimeout(r, 1000));
        }

        const actions = Object.entries(files).reduce(
          (acc, [filePath, dirent]) => {
            if (dirent?.type === 'file') {
              /*
               * Guard on file type, not content truthiness: an empty file
               * (content === '') is a legitimate file (.gitkeep, empty
               * __init__.py, placeholder modules) and must be committed.
               * Treat missing content as an empty string.
               */
              acc.push({
                action: 'create',
                file_path: extractRelativePath(filePath),
                content: dirent.content ?? '',

                /*
                 * Binary content is stored as base64; tell GitLab so it decodes
                 * it instead of committing the literal base64 text (corruption).
                 */
                ...(dirent.isBinary ? { encoding: 'base64' as const } : {}),
              });
            }

            return acc;
          },
          [] as { action: 'create' | 'update'; file_path: string; content: string; encoding?: 'base64' | 'text' }[],
        );

        // Check which files exist and update action accordingly
        for (const action of actions) {
          const fileCheck = await gitLabApiService.getFile(repo.id, action.file_path, branchName);

          if (fileCheck.ok) {
            action.action = 'update';
          }
        }

        // Commit all files
        await gitLabApiService.commitFiles(repo.id, {
          branch: branchName,
          commit_message: commitMessage || workbenchText('workbenchRuntime.repository.multipleFilesCommit'),
          actions,
        });

        return repo.web_url;
      }

      // Should not reach here since we only handle GitHub and GitLab
      throw new Error(workbenchText('workbenchRuntime.repository.unsupportedProvider', { provider }));
    } catch (error) {
      console.error('Error pushing to repository:', error);
      throw error; // Rethrow the error for further handling
    }
  }
}

export const workbenchStore = new WorkbenchStore();
