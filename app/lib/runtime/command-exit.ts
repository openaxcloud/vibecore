import type { CommandEvent } from '@vibecore/runtime-contract';

/**
 * Fold a streamed CommandEvent into the running exit code.
 *
 * A clean `exit` uses its code. Critically, an `error` event — the adapter's
 * synthetic "stream closed before completion" emitted when a command's WebSocket
 * drops before any exit (a long `npm install` interrupted by a pod restart, an LB
 * idle-kill, or a network blip during cold start) — must surface as a NON-zero exit.
 * Otherwise the default exit code 0 is returned and callers treat a half-finished
 * install as success, launching the preview against a broken node_modules (blank
 * page / 404s). Other event types (stdout/stderr) leave the code unchanged.
 */
export function foldCommandExitCode(current: number, event: CommandEvent): number {
  if (event.type === 'exit') {
    return event.exitCode ?? 0;
  }

  if (event.type === 'error') {
    return current || 1;
  }

  return current;
}
