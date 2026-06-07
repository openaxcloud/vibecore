/* eslint-disable import/order */
import { Octokit, type RestEndpointMethodTypes } from '@octokit/rest';
import type { CommandEvent, CommandRequest, RuntimeAdapter, WorkspaceSession } from '@vibecore/runtime-contract';
import fileSaver from 'file-saver';
import Cookies from 'js-cookie';
import JSZip from 'jszip';
import { atom, map, type MapStore, type ReadableAtom, type WritableAtom } from 'nanostores';
import { EditorStore } from './editor';
import { FilesStore, type FileMap, type ProjectStorageFile } from './files';
import { PreviewsStore } from './previews';
import { TerminalStore } from './terminal';
import type { EditorDocument, ScrollPosition } from '~/components/editor/codemirror/CodeMirrorEditor';
import { description } from '~/lib/persistence';
import {
  deleteAgentPatchProposalRemote,
  fetchOpenAgentPatchProposals,
  isTerminalAgentPatchStatus,
  putAgentPatchProposal,
} from '~/lib/persistence/agentPatchProposalSync';
import { runtimeAdapter } from '~/lib/runtime/RuntimeAdapterProvider';
import { ActionRunner } from '~/lib/runtime/action-runner';
import { hasInstalledPreviewDependencies, type PreviewPackageManifest } from '~/lib/runtime/preview-dependencies';
import { buildPreviewManifestRepair } from '~/lib/runtime/preview-manifest';
import { collectRuntimeTextFiles } from '~/lib/runtime/runtime-files';
import { writeAcceptedAgentFile } from '~/lib/runtime/agent-file-write';
import { topologicallySortFileActions } from '~/lib/runtime/topological-apply';
import { workspaceEvents } from '~/lib/runtime/workspace-events';
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
import { createSampler } from '~/utils/sampler';
import type { ActionAlert, DeployAlert, SupabaseAlert } from '~/types/actions';

const { saveAs } = fileSaver;

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
  #runtime: RuntimeAdapter = runtimeAdapter;
  #previewsStore = new PreviewsStore(this.#runtime);
  #filesStore = new FilesStore(this.#runtime);
  #editorStore = new EditorStore(this.#filesStore);
  #terminalStore = new TerminalStore(this.#runtime);

  #reloadedMessages = new Set<string>();
  #previewStartPromise: Promise<string> | undefined;
  #previewCommandRunning = false;
  #projectId: string | undefined;
  #autosaveTimers = new Map<string, ReturnType<typeof setTimeout>>();

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
  #agentPatchOriginals = new Map<string, string>();
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

    if (changed) {
      this.#runtimeFilesLoadedProjectId = undefined;

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
      throw new Error(`project file archive returned ${response.status}`);
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
    this.#dropResolvedMissingImportFailures();

    return true;
  }

  async #projectStorageFilesFromArchive(archiveBase64: string): Promise<ProjectStorageFile[]> {
    const zip = await JSZip.loadAsync(archiveBase64, { base64: true });
    const files: ProjectStorageFile[] = [];

    for (const entry of Object.values(zip.files)) {
      if (entry.dir) {
        continue;
      }

      const bytes = await entry.async('uint8array');

      try {
        files.push({
          path: entry.name,
          content: PROJECT_ARCHIVE_TEXT_DECODER.decode(bytes),
          isBinary: false,
        });
      } catch {
        files.push({
          path: entry.name,
          content: '',
          isBinary: true,
        });
      }
    }

    return files;
  }

  refreshAllPreviews() {
    this.#previewsStore.refreshAllPreviews();
  }

  async refreshRuntimePorts() {
    await this.#previewsStore.refreshPorts();

    if (this.previews.get().some((preview) => preview.ready !== false)) {
      const current = this.previewServerState.get();
      this.previewServerState.set({ status: 'running', command: current.command });
    }
  }

  async startPreviewServer() {
    const previousPreviewState = this.previewServerState.get();

    if (
      previousPreviewState.status !== 'starting' &&
      previousPreviewState.status !== 'running' &&
      previousPreviewState.status !== 'static'
    ) {
      this.previewServerState.set({
        status: 'starting',
        command: previousPreviewState.command ?? 'Detecting preview command',
      });
    }

    await this.refreshRuntimePorts().catch(() => undefined);

    if (this.#previewStartPromise) {
      return this.#previewStartPromise;
    }

    if (this.#canUseStaticHtmlPreview()) {
      this.previewServerState.set({ status: 'static', command: 'static HTML preview' });
      this.appendWorkspaceLog('Using static HTML preview; dev server is not required for this project.');

      return 'static HTML preview';
    }

    if (!this.#findPackageJsonEntry()) {
      await this.loadRuntimeFiles('.').catch((error) => {
        this.appendWorkspaceLog(
          error instanceof Error ? `Preview file reload failed: ${error.message}` : 'Preview file reload failed',
        );
      });
    }

    let dependenciesChanged = false;

    dependenciesChanged = await this.#syncPreviewManifestFromRuntime().catch((error) => {
      this.appendWorkspaceLog(
        error instanceof Error
          ? `Dependency sync skipped before preview: ${error.message}`
          : 'Dependency sync skipped before preview',
      );

      return false;
    });

    if (dependenciesChanged || this.#findPackageJsonEntry()) {
      await this.loadRuntimeFiles('.').catch(() => undefined);
    }

    if (dependenciesChanged) {
      await this.stopPreviewServer();
    } else if (this.previews.get().some((preview) => preview.ready !== false)) {
      this.previewServerState.set({ status: 'running' });
      return 'existing preview server';
    }

    let command: PreviewCommand;

    try {
      command = await this.#detectPreviewCommand(dependenciesChanged);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.previewServerState.set({
        status: 'error',
        command: previousPreviewState.command ?? 'Detecting preview command',
        error: message,
      });
      this.appendWorkspaceLog(message);

      throw error;
    }

    this.toggleTerminal(true);

    this.#previewStartPromise = Promise.resolve(command.label);
    this.#previewCommandRunning = true;
    this.previewServerState.set({ status: 'starting', command: command.label });

    void (async () => {
      try {
        for (const setupCommand of command.setupCommands ?? []) {
          this.appendWorkspaceLog(
            `Preparing preview with ${setupCommand.label}${setupCommand.cwd ? ` in ${setupCommand.cwd}` : ''}`,
          );

          const setupExitCode = await this.#streamWorkspaceCommand(setupCommand, {
            exitMessage: 'Preview setup command exited with code',
          });

          if (setupExitCode !== 0) {
            return;
          }
        }

        this.appendWorkspaceLog(`Starting preview with ${command.label}${command.cwd ? ` in ${command.cwd}` : ''}`);
        await this.#streamWorkspaceCommand(command, {
          exitMessage: 'Preview command exited with code',
          refreshPortsOnOutput: true,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.previewServerState.set({ status: 'error', command: command.label, error: message });
        this.appendWorkspaceLog(message);
      } finally {
        this.#previewStartPromise = undefined;
        this.#previewCommandRunning = false;

        if (this.previewServerState.get().status !== 'error') {
          this.previewServerState.set({
            status: this.previews.get().some((preview) => preview.ready !== false) ? 'running' : 'idle',
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
    this.previewServerState.set({ status: 'idle' });

    return previewProcesses.length;
  }

  async restartPreviewServer() {
    await this.stopPreviewServer();
    this.#previewStartPromise = undefined;

    return this.startPreviewServer();
  }

  async #streamWorkspaceCommand(
    command: CommandRequest & { label: string },
    options: { exitMessage: string; refreshPortsOnOutput?: boolean },
  ) {
    let exitCode = 0;

    for await (const event of this.#runtime.streamCommand({
      command: command.command,
      args: command.args,
      cwd: command.cwd,
      env: command.env,
    })) {
      this.appendWorkspaceLog(event);

      if (options.refreshPortsOnOutput && (event.type === 'stdout' || event.type === 'stderr')) {
        await this.refreshRuntimePorts().catch(() => undefined);
      }

      if (event.type === 'exit') {
        exitCode = event.exitCode ?? 0;

        if (exitCode !== 0) {
          this.appendWorkspaceLog(`${options.exitMessage} ${exitCode}`);
        }
      }
    }

    return exitCode;
  }

  async #detectPreviewCommand(forceInstall: boolean): Promise<PreviewCommand> {
    const packageJsonEntry = this.#findPackageJsonEntry();

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
                label: 'npm run dev',
                cwd,
                setupCommands,
              };
            }

            return {
              command: 'npx',
              args: ['--yes', 'vite', ...this.#viteDevArgsFromScript(scripts.dev)],
              label: 'npx vite',
              cwd,
              setupCommands,
            };
          }

          if (devScript.includes('vite') && (!dependencies.vite || shouldRunViteWithoutInstall)) {
            return {
              command: 'npx',
              args: ['--yes', 'vite', '--host', '0.0.0.0'],
              label: 'npx vite',
              cwd,
            };
          }

          return {
            command: 'npm',
            args: ['run', 'dev', ...hostArgs],
            label: 'npm run dev',
            cwd,
            setupCommands,
          };
        }

        if (scripts.start) {
          return {
            command: 'npm',
            args: ['run', 'start'],
            label: 'npm run start',
            cwd,
            setupCommands,
          };
        }
      } catch (error) {
        console.warn('Failed to parse package.json for preview command:', error);
      }
    }

    return {
      command: 'npx',
      args: ['--yes', 'vite', '--host', '0.0.0.0'],
      label: 'npx vite',
    };
  }

  #findPackageJsonEntry() {
    return Object.entries(this.files.get()).find(([filePath, dirent]) => {
      return dirent?.type === 'file' && this.#isPackageJsonPath(filePath);
    });
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

    if (packageManager.startsWith('pnpm') || hasPnpmLock) {
      return { command: 'pnpm', args: ['install'], label: 'pnpm install', cwd };
    }

    if (packageManager.startsWith('yarn') || hasYarnLock) {
      return { command: 'yarn', args: ['install'], label: 'yarn install', cwd };
    }

    return {
      command: 'npm',
      args: ['install', '--prefer-offline', '--no-audit', '--no-fund'],
      label: 'npm install',
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
        content = await this.#runtime.readFile(relativePath);
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
        this.appendWorkspaceLog(`Removed corrupt ${fileName} so the install can regenerate it`);
      } catch (error) {
        this.appendWorkspaceLog(
          error instanceof Error
            ? `Could not remove corrupt ${fileName}: ${error.message}`
            : `Could not remove corrupt ${fileName}`,
        );
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

    this.workspaceLogs.set([...this.workspaceLogs.get(), ...lines].slice(-WORKSPACE_LOG_LIMIT));
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
    this.#globalExecutionQueue = this.#globalExecutionQueue.then(() => callback());
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

  attachTerminal(terminal: ITerminal, command?: string) {
    this.#terminalStore.attachTerminal(terminal, command);
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

  async saveFile(filePath: string) {
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

    await this.#filesStore.saveFile(filePath, document.value);

    const newUnsavedFiles = new Set(this.unsavedFiles.get());
    newUnsavedFiles.delete(filePath);

    this.unsavedFiles.set(newUnsavedFiles);
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
    this.#emitFileApplied(filePath, 'user');
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
      throw new Error('No file is open to format');
    }

    const { filePath, value } = currentDocument;
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
    this.appendWorkspaceLog(`AI patch rejected: ${proposal.relativePath}`);
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

    this.agentPatchProposals.setKey(proposalId, {
      ...proposal,
      status: 'applying',
      updatedAt: new Date().toISOString(),
      error: undefined,
    });
    this.#syncAgentPatchProposalToServer(proposalId);

    try {
      const acceptedContent = applyReviewableDiffHunks({
        originalContent: proposal.originalContent,
        hunks: proposal.hunks,
        acceptedHunkIds: acceptedIds,
      });

      await this.#validateAgentPatchProposal(proposal, acceptedContent);

      const fileExistsInEditor = Boolean(this.#editorStore.documents.get()[proposal.filePath]);

      if (fileExistsInEditor) {
        this.#editorStore.updateFile(proposal.filePath, acceptedContent);
        await this.saveFile(proposal.filePath);
      }

      const artifact = this.#getArtifact(proposal.artifactId);

      await writeAcceptedAgentFile(this.#runtime, proposal.relativePath, acceptedContent);
      artifact?.runner.skipAction(proposal.actionId);

      if (!fileExistsInEditor) {
        await this.loadRuntimeFiles('.').catch((error) => {
          this.appendWorkspaceLog(
            error instanceof Error
              ? `File refresh skipped after accepting AI patch: ${error.message}`
              : 'File refresh skipped after accepting AI patch',
          );
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
      this.appendWorkspaceLog(`AI patch accepted: ${proposal.relativePath}`);

      await this.#createProjectAgentCheckpoint(`AI accepted ${proposal.relativePath}`).catch((error) => {
        this.appendWorkspaceLog(
          error instanceof Error
            ? `AI checkpoint skipped after patch accept: ${error.message}`
            : 'AI checkpoint skipped after patch accept',
        );
      });

      return 'accepted';
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to apply AI patch.';
      this.agentPatchProposals.setKey(proposalId, {
        ...proposal,
        status: 'failed',
        updatedAt: new Date().toISOString(),
        error: message,
      });
      this.#syncAgentPatchProposalToServer(proposalId);
      this.appendWorkspaceLog(`AI patch failed: ${proposal.relativePath}: ${message}`);

      return 'failed';
    }
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
        `AI patch bulk apply: import cycle detected (${orderedProposals.cycleParticipants.join(', ')}) — falling back to source order`,
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
      this.appendWorkspaceLog(`AI patch revert skipped (artifact gone): ${proposal.relativePath}`);
      return;
    }

    try {
      const fileExistsInEditor = Boolean(this.#editorStore.documents.get()[proposal.filePath]);

      if (fileExistsInEditor) {
        this.#editorStore.updateFile(proposal.filePath, proposal.originalContent);
        await this.saveFile(proposal.filePath);
      }

      await artifact.runner.runAction(
        {
          artifactId: proposal.artifactId,
          messageId: proposal.messageId,
          actionId: `${proposal.actionId}-revert`,
          action: {
            type: 'file',
            filePath: proposal.relativePath,
            content: proposal.originalContent,
          },
        },
        false,
      );

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
      this.appendWorkspaceLog(`AI patch reverted: ${proposal.relativePath}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to revert AI patch.';
      this.appendWorkspaceLog(`AI patch revert failed: ${proposal.relativePath}: ${message}`);
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
      throw new Error(`snapshot endpoint returned ${response.status}`);
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

        if (!doc) {
          await artifact.runner.runAction(data, true);
        }

        this.#editorStore.updateFile(fullPath, data.action.content);

        return;
      }

      await artifact.runner.runAction(data);

      const completedAction = artifact.runner.actions.get()[data.actionId];

      if (completedAction?.status === 'failed') {
        const message = completedAction.error || `Failed to write ${data.action.filePath}`;

        this.actionAlert.set({
          type: 'error',
          title: 'AI file write blocked',
          description: message,
          content: message,
          source: 'preview',
        });
        this.appendWorkspaceLog(`AI file write blocked: ${data.action.filePath}: ${message}`);

        return;
      }

      await this.loadRuntimeFiles('.').catch((error) => {
        this.appendWorkspaceLog(
          error instanceof Error
            ? `File refresh skipped after AI write: ${error.message}`
            : 'File refresh skipped after AI write',
        );
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
        this.appendWorkspaceLog('AI command skipped until reviewed file changes are accepted or rejected.');

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
      const message = error instanceof Error ? error.message : 'Generated file validation failed.';
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
        this.appendWorkspaceLog(`AI patch blocked: ${proposal.relativePath}: ${message}`);
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
      this.appendWorkspaceLog(`AI patch waiting for review: ${data.action.filePath}`);
    }
  }

  async #refreshPreviewAfterArtifactClose(artifactId: string) {
    await this.loadRuntimeFiles('.').catch((error) => {
      this.appendWorkspaceLog(
        error instanceof Error ? `Preview file refresh skipped: ${error.message}` : 'Preview file refresh skipped',
      );
    });

    const previewManifestChanged = await this.#syncPreviewManifestFromRuntime().catch((error) => {
      this.appendWorkspaceLog(
        error instanceof Error
          ? `Dependency sync skipped after ${artifactId}: ${error.message}`
          : `Dependency sync skipped after ${artifactId}`,
      );

      return false;
    });

    if (previewManifestChanged) {
      await this.loadRuntimeFiles('.').catch(() => undefined);
    }

    if (!(await this.#validateWorkspaceImportsAfterArtifactClose(artifactId))) {
      return;
    }

    await this.#persistRuntimeFilesToProjectStorage(artifactId);

    if (!this.#findPackageJsonEntry()) {
      return;
    }

    await this.restartPreviewServer().catch((error) => {
      this.appendWorkspaceLog(
        error instanceof Error
          ? `Preview restart skipped after ${artifactId}: ${error.message}`
          : `Preview restart skipped after ${artifactId}`,
      );
    });
  }

  async #validateWorkspaceImportsAfterArtifactClose(artifactId: string) {
    const files = this.#workspaceImportValidationFiles();

    const generatedFiles: GeneratedFile[] = [...files.entries()]

      /*
       * Exclude package.json from this preview-path validation. A malformed or
       * empty package.json (e.g. a project seeded from storage where an earlier
       * write was cut short) must NOT hard-block the preview here: validateGeneratedFile
       * JSON-parses every .json and throws, which returned early and surfaced a
       * dead "Preview Error: Invalid JSON in package.json: Unexpected end of JSON
       * input" — yet buildPreviewManifestRepair, which runs moments later in
       * startPreviewServer, synthesizes a valid manifest from the source files.
       * Blocking here defeated that recovery. The agent-apply path (validateGeneratedFiles
       * at patch time) still rejects a corrupt manifest the model emits, so the
       * agent feedback loop is unaffected. package.json has no imports, so dropping
       * it loses nothing for the import check this method exists to perform.
       */
      .filter(([filePath]) => (filePath.split('/').pop() ?? '') !== 'package.json')
      .map(([filePath, content]) => ({
        path: filePath,
        content,
      }));

    try {
      await validateGeneratedFiles(generatedFiles);

      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Generated file import validation failed.';

      this.actionAlert.set({
        type: 'error',
        title: 'AI generated an invalid file import',
        description: message,
        content: message,
        source: 'preview',
      });
      this.appendWorkspaceLog(`Preview restart blocked after ${artifactId}: ${message}`);

      return false;
    }
  }

  async #syncPreviewManifestFromRuntime() {
    const files = await collectRuntimeTextFiles(this.#runtime, '.', {
      excludeDirectory: (name) => PROJECT_STORAGE_SYNC_EXCLUDED_DIRECTORIES.has(name),
      excludeFile: (name) => PROJECT_STORAGE_SYNC_EXCLUDED_FILES.has(name),
    });

    const repair = buildPreviewManifestRepair(files);

    let changed = false;

    if (repair.packageJson && (repair.packageJson.created || repair.packageJson.changed)) {
      await this.#runtime.writeFile(repair.packageJson.path, repair.packageJson.content);
      changed = true;

      if (repair.packageJson.created) {
        this.appendWorkspaceLog(`Created preview package manifest at ${repair.packageJson.path}`);
      }

      if (repair.packageJson.missingDependencies.length) {
        this.appendWorkspaceLog(
          `Added missing runtime dependencies: ${repair.packageJson.missingDependencies.join(', ')}`,
        );
      }

      if (repair.packageJson.addedScripts.length) {
        this.appendWorkspaceLog(`Added preview package scripts: ${repair.packageJson.addedScripts.join(', ')}`);
      }
    }

    for (const file of repair.supplementalFiles) {
      await this.#runtime.writeFile(file.path, file.content);
      this.appendWorkspaceLog(`Created preview runtime file ${file.path}`);
      changed = true;
    }

    return changed;
  }

  async #persistRuntimeFilesToProjectStorage(artifactId: string) {
    if (!this.#projectId) {
      return;
    }

    try {
      const files = await collectRuntimeTextFiles(this.#runtime, '.', {
        excludeDirectory: (name) => PROJECT_STORAGE_SYNC_EXCLUDED_DIRECTORIES.has(name),
        excludeFile: (name) => PROJECT_STORAGE_SYNC_EXCLUDED_FILES.has(name),
      });

      const zip = new JSZip();

      let fileCount = 0;
      let totalBytes = 0;

      for (const [filePath, content] of Object.entries(files)) {
        const byteLength = new TextEncoder().encode(content).byteLength;

        if (byteLength > PROJECT_STORAGE_SYNC_MAX_FILE_BYTES) {
          this.appendWorkspaceLog(`Project storage sync skipped large file ${filePath}`);
          continue;
        }

        if (totalBytes + byteLength > PROJECT_STORAGE_SYNC_MAX_TOTAL_BYTES) {
          this.appendWorkspaceLog('Project storage sync stopped at size limit');
          break;
        }

        zip.file(filePath, content);
        fileCount++;
        totalBytes += byteLength;
      }

      if (!fileCount) {
        return;
      }

      const response = await fetch(`/api/projects/${encodeURIComponent(this.#projectId)}/files/import/zip`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ zipBase64: await zip.generateAsync({ type: 'base64' }), replaceExisting: true }),
      });

      if (!response.ok) {
        throw new Error(`import returned ${response.status}`);
      }

      this.appendWorkspaceLog(`Project storage synced ${fileCount} files after ${artifactId}`);
    } catch (error) {
      this.appendWorkspaceLog(
        error instanceof Error
          ? `Project storage sync skipped after ${artifactId}: ${error.message}`
          : `Project storage sync skipped after ${artifactId}`,
      );
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

    this.#snapshottedArtifacts.add(data.artifactId);

    try {
      await this.#runtime.createSnapshot(`Before AI changes ${data.artifactId}`);
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
      if (dirent?.type === 'file' && !dirent.isBinary) {
        const relativePath = extractRelativePath(filePath);

        // split the path into segments
        const pathSegments = relativePath.split('/');

        // if there's more than one segment, we need to create folders
        if (pathSegments.length > 1) {
          let currentFolder = zip;

          for (let i = 0; i < pathSegments.length - 1; i++) {
            currentFolder = currentFolder.folder(pathSegments[i])!;
          }
          currentFolder.file(pathSegments[pathSegments.length - 1], dirent.content);
        } else {
          // if there's only one segment, it's a file in the root
          zip.file(relativePath, dirent.content);
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
      if (dirent?.type === 'file' && !dirent.isBinary) {
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

        // write the file content
        const writable = await fileHandle.createWritable();
        await writable.write(dirent.content);
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
        throw new Error(`${provider} token or username is not set in cookies or provided.`);
      }

      const files = this.files.get();

      if (!files || Object.keys(files).length === 0) {
        throw new Error('No files found to push');
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
          throw new Error('No files found to push');
        }

        // Function to push files with retry logic
        const pushFilesToRepo = async (attempt = 1): Promise<string> => {
          const maxAttempts = 3;

          try {
            console.log(`Pushing files to repository (attempt ${attempt}/${maxAttempts})...`);

            // Create blobs for each file
            const blobs = await Promise.all(
              Object.entries(files).map(async ([filePath, dirent]) => {
                if (dirent?.type === 'file' && dirent.content) {
                  const { data: blob } = await octokit.git.createBlob({
                    owner: repo.owner.login,
                    repo: repo.name,
                    content: Buffer.from(dirent.content).toString('base64'),
                    encoding: 'base64',
                  });
                  return { path: extractRelativePath(filePath), sha: blob.sha };
                }

                return null;
              }),
            );

            const validBlobs = blobs.filter(Boolean); // Filter out any undefined blobs

            if (validBlobs.length === 0) {
              throw new Error('No valid files to push');
            }

            // Refresh repository reference to ensure we have the latest data
            const repoRefresh = await octokit.repos.get({ owner, repo: repoName });
            repo = repoRefresh.data;

            // Get the latest commit SHA (assuming main branch, update dynamically if needed)
            const { data: ref } = await octokit.git.getRef({
              owner: repo.owner.login,
              repo: repo.name,
              ref: `heads/${repo.default_branch || 'main'}`, // Handle dynamic branch
            });

            const latestCommitSha = ref.object.sha;

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
              message: commitMessage || 'Initial commit from your app',
              tree: newTree.sha,
              parents: [latestCommitSha],
            });

            // Update the reference
            await octokit.git.updateRef({
              owner: repo.owner.login,
              repo: repo.name,
              ref: `heads/${repo.default_branch || 'main'}`, // Handle dynamic branch
              sha: newCommit.sha,
            });

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
        const branchRes = await gitLabApiService.getFile(repo.id, 'README.md', branchName).catch(() => null);

        if (!branchRes || !branchRes.ok) {
          // Create branch from default
          await gitLabApiService.createBranch(repo.id, branchName, repo.default_branch);
          await new Promise((r) => setTimeout(r, 1000));
        }

        const actions = Object.entries(files).reduce(
          (acc, [filePath, dirent]) => {
            if (dirent?.type === 'file' && dirent.content) {
              acc.push({
                action: 'create',
                file_path: extractRelativePath(filePath),
                content: dirent.content,
              });
            }

            return acc;
          },
          [] as { action: 'create' | 'update'; file_path: string; content: string }[],
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
          commit_message: commitMessage || 'Commit multiple files',
          actions,
        });

        return repo.web_url;
      }

      // Should not reach here since we only handle GitHub and GitLab
      throw new Error(`Unsupported provider: ${provider}`);
    } catch (error) {
      console.error('Error pushing to repository:', error);
      throw error; // Rethrow the error for further handling
    }
  }
}

export const workbenchStore = new WorkbenchStore();
