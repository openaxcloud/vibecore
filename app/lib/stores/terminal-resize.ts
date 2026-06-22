import type { TerminalSession } from '@vibecore/runtime-contract';
import type { ITerminal } from '~/types/terminal';

export interface TerminalSessionEntry {
  terminal: ITerminal;
  process: TerminalSession;
}

export interface ResizeTarget {
  process: TerminalSession;
  cols: number;
  rows: number;
}

/**
 * Build the per-PTY resize plan for a terminal-resize event.
 *
 * Each visible terminal owns its own remote PTY. In split view two panes of
 * different pixel widths are on screen at once, and each fires its own resize
 * event from its ResizeObserver with its own geometry. The old code broadcast a
 * single (cols,rows) to EVERY session, so the last event to fire clobbered the
 * other pane's PTY geometry — its remote shell was set to the wrong width and its
 * output wrapped/truncated while the local xterm reflowed to the real size.
 *
 * The fix: resize each PTY to ITS OWN terminal's measured cols/rows. xterm tracks
 * the real geometry on the ITerminal instance after fit(), so we prefer that and
 * fall back to the event's broadcast geometry only when a terminal has not yet
 * reported a size (cols/rows still undefined before first fit). Sessions whose
 * resolved geometry is non-positive are skipped — a 0xN resize garbles the PTY.
 */
export function buildResizePlan(
  sessions: ReadonlyArray<TerminalSessionEntry>,
  fallbackCols: number,
  fallbackRows: number,
): ResizeTarget[] {
  const plan: ResizeTarget[] = [];

  for (const { terminal, process } of sessions) {
    const cols = terminal.cols ?? fallbackCols;
    const rows = terminal.rows ?? fallbackRows;

    if (cols > 0 && rows > 0) {
      plan.push({ process, cols, rows });
    }
  }

  return plan;
}
