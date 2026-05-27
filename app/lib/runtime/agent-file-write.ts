import type { RuntimeAdapter } from '@vibecore/runtime-contract';

import { path } from '~/utils/path';
import { sanitizeFileContent } from '~/utils/sanitize-file-content';

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
 * accept. We still run the lightweight sanitizer here because review-first
 * mode queues file actions before `ActionRunner` gets a chance to sanitize
 * them.
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

  const sanitized = sanitizeFileContent(content, relativePath);

  await runtime.writeFile(relativePath, sanitized.sanitized);
}
