import type { Change } from 'diff';

export type ActionType = 'file' | 'shell' | 'supabase' | 'diff';

export interface BaseAction {
  content: string;
}

export interface FileAction extends BaseAction {
  type: 'file';
  filePath: string;
}

/**
 * Anchored search/replace ("diff-edit") action. Same shape as a FileAction
 * (a `filePath` + `content`), but `content` is the RAW Aider-style
 * search/replace block text (`<<<<<<< SEARCH … ======= … >>>>>>> REPLACE`)
 * rather than the file's full new contents. The runner applies it as a patch
 * via `app/utils/search-replace.ts` instead of overwriting the whole file.
 * Parsing/streaming lands in increment 2/5; application in increment 3/5.
 */
export interface DiffAction extends BaseAction {
  type: 'diff';
  filePath: string;
}

/**
 * Outcome metadata for a resolved `diff` action, attached to the runner's
 * action state so the chat-UI render surface (the artifact ActionList) can
 * show a labelled "Edit <path> (targeted patch)" row with a +N/−M hunk pill
 * on success, or a compact "could not apply" marker on a fail-safe fallback.
 *
 * Populated by the action runner AFTER `resolveDiffAction`; absent while the
 * action is still streaming (nothing has been applied yet).
 */
export interface DiffApplyMeta {
  /** `applied` = patch landed on the file; `failed` = fail-safe, nothing written. */
  status: 'applied' | 'failed';

  /** Number of SEARCH/REPLACE blocks parsed from the payload (0 when malformed). */
  blockCount: number;

  /** `+` lines across every applied hunk (0 on failure). */
  addedLines: number;

  /** `−` lines across every applied hunk (0 on failure). */
  removedLines: number;

  /** Number of unified-diff hunks the apply produced (0 on failure). */
  hunkCount: number;

  /** Why the apply failed, when `status === 'failed'`. */
  failureKind?: 'missing-file' | 'malformed' | 'apply-failed';
}

export interface ShellAction extends BaseAction {
  type: 'shell';
}

export interface StartAction extends BaseAction {
  type: 'start';
}

export interface BuildAction extends BaseAction {
  type: 'build';
}

export interface SupabaseAction extends BaseAction {
  type: 'supabase';
  operation: 'migration' | 'query';
  filePath?: string;
  projectId?: string;
}

export type BoltAction = FileAction | ShellAction | StartAction | BuildAction | SupabaseAction | DiffAction;

export type BoltActionData = BoltAction | BaseAction;

export interface ActionAlert {
  type: string;
  title: string;
  description: string;
  content: string;
  source?: 'terminal' | 'preview'; // Add source to differentiate between terminal and preview errors
}

export interface SupabaseAlert {
  type: string;
  title: string;
  description: string;
  content: string;
  source?: 'supabase';
}

export interface DeployAlert {
  type: 'success' | 'error' | 'info';
  title: string;
  description: string;
  content?: string;
  url?: string;
  stage?: 'building' | 'deploying' | 'complete';
  buildStatus?: 'pending' | 'running' | 'complete' | 'failed';
  deployStatus?: 'pending' | 'running' | 'complete' | 'failed';
  source?: 'vercel' | 'netlify' | 'github' | 'gitlab';
}

export interface LlmErrorAlertType {
  type: 'error' | 'warning';
  title: string;
  description: string;
  content?: string;
  provider?: string;
  errorType?: 'authentication' | 'rate_limit' | 'quota' | 'network' | 'unknown';
}

export interface FileHistory {
  originalContent: string;
  lastModified: number;
  changes: Change[];
  versions: {
    timestamp: number;
    content: string;
  }[];

  // Novo campo para rastrear a origem das mudanças
  changeSource?: 'user' | 'auto-save' | 'external';
}
