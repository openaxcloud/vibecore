import type { RuntimeAdapter } from '@vibecore/runtime-contract';

import { path } from '~/utils/path';

/**
 * Subset of the runtime adapter surface this helper actually touches.
 * Keeping it narrow lets unit tests provide a tiny test double and lets
 * callers in non-streaming contexts (hydrated proposals, accept-after-reload)
 * reuse the same write path without dragging the full adapter dependency.
 */
export type AgentFileWriteRuntime = Pick<RuntimeAdapter, 'createDirectory' | 'writeFile'>;

/**
 * Replay an accepted agent patch's write directly through the runtime
 * adapter. Used when no streaming artifact is available — typically because
 * the IDE was reloaded after the proposal landed on the server and the
 * client hydrated it from Postgres rather than from a live stream.
 *
 * Mirrors the directory + file write the ActionRunner would otherwise do
 * inside `#runFileAction`, so the filesystem state is identical to a live
 * accept. Sanitisation + Phase 0 #2 validation already ran during the
 * original streaming write, so the proposedContent stored in the proposal
 * is safe to forward verbatim.
 */
export async function writeAcceptedAgentFile(
  runtime: AgentFileWriteRuntime,
  relativePath: string,
  content: string,
): Promise<void> {
  const folder = path.dirname(relativePath).replace(/\/+$/g, '');

  if (folder && folder !== '.') {
    await runtime.createDirectory(folder);
  }

  await runtime.writeFile(relativePath, content);
}
