import type { WorkspaceStatus } from '@vibecore/runtime-contract';

/**
 * Inputs the file explorer's empty branch uses to decide *why* there are no
 * files to show.
 */
export interface EmptyExplorerInput {
  /** Whether the file map is empty (no files to render). */
  filesEmpty: boolean;

  /** True while the workspace is being provisioned / files are being loaded. */
  workspaceLoading: boolean;

  /** The remote workspace lifecycle status, when known. */
  workspaceStatus?: WorkspaceStatus;

  /** A non-empty provisioning/runtime error message, when the workspace failed. */
  workspaceError?: string;

  /**
   * True when there is no remote workspace at all (e.g. WebContainer mode or no
   * project bound). In that case an empty tree is genuinely "no files", never a
   * crashed runtime.
   */
  hasWorkspace: boolean;
}

export interface EmptyExplorerView {
  variant: 'loading' | 'error' | 'empty';
  icon: string;
  title: string;
  description: string;

  /** Whether to offer a reconnect/retry affordance (error recovery). */
  showReconnect: boolean;
}

/**
 * Decide which empty-explorer state to render.
 *
 * The bug this guards against: the file explorer used to *always* show the
 * reassuring "Project files will appear here once the workspace is loaded."
 * copy whenever `files` was empty. When a remote runtime fails to provision or
 * is garbage-collected (a recurring prod failure), `files` stays empty forever
 * and the user is told the workspace is "loading" indefinitely — no error, no
 * retry, no signal the runtime is dead. We distinguish:
 *   - loading: provisioning in flight → spinner + "Loading workspace files…"
 *   - error:   crashed / errored runtime → real error + Reconnect affordance
 *   - empty:   workspace genuinely ready but has no files → original copy
 */
export function resolveEmptyExplorerState(input: EmptyExplorerInput): EmptyExplorerView {
  const { workspaceLoading, workspaceStatus, workspaceError, hasWorkspace } = input;

  const runtimeCrashed = workspaceStatus === 'error' || workspaceStatus === 'stopped';
  const hasError = Boolean(workspaceError) || (hasWorkspace && runtimeCrashed);

  /*
   * A genuine error wins over a stale "loading" flag: a crashed runtime that is
   * still nominally marked loading must not be reported as merely loading.
   */
  if (hasError) {
    return {
      variant: 'error',
      icon: 'i-ph:warning-circle',
      title: 'Workspace unavailable',
      description:
        workspaceError ?? 'The workspace runtime stopped or failed to start. Reconnect to load your project files.',
      showReconnect: true,
    };
  }

  if (workspaceLoading || (hasWorkspace && workspaceStatus !== 'running')) {
    return {
      variant: 'loading',
      icon: 'i-svg-spinners:90-ring-with-bg',
      title: 'Loading workspace files…',
      description: 'Provisioning your workspace. Files will appear here once it is ready.',
      showReconnect: false,
    };
  }

  return {
    variant: 'empty',
    icon: 'i-ph:folder-open',
    title: 'No files available',
    description: 'Project files will appear here once the workspace is loaded.',
    showReconnect: false,
  };
}
