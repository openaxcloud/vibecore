import type { TerminalSession } from '@vibecore/runtime-contract';
import { describe, expect, it } from 'vitest';
import { buildResizePlan, type TerminalSessionEntry } from './terminal-resize';
import type { ITerminal } from '~/types/terminal';

function makeSession(cols: number | undefined, rows: number | undefined): TerminalSessionEntry {
  const terminal = { cols, rows } as ITerminal;
  const process = {} as TerminalSession;

  return { terminal, process };
}

describe('buildResizePlan', () => {
  it('resizes each PTY to its own measured geometry, not a broadcast geometry', () => {
    const narrow = makeSession(80, 24);
    const wide = makeSession(200, 50);

    /* A split-view resize event carries one pane's geometry (here the wide one). */
    const plan = buildResizePlan([narrow, wide], 200, 50);

    const narrowTarget = plan.find((target) => target.process === narrow.process);
    const wideTarget = plan.find((target) => target.process === wide.process);

    /* The narrow pane must keep its own 80x24 — not get clobbered by the 200x50 event. */
    expect(narrowTarget).toMatchObject({ cols: 80, rows: 24 });
    expect(wideTarget).toMatchObject({ cols: 200, rows: 50 });
  });

  it('falls back to the event geometry only when a terminal has not yet reported a size', () => {
    const unfit = makeSession(undefined, undefined);

    const plan = buildResizePlan([unfit], 120, 30);

    expect(plan).toEqual([{ process: unfit.process, cols: 120, rows: 30 }]);
  });

  it('skips sessions whose resolved geometry is non-positive', () => {
    const zero = makeSession(0, 24);
    const valid = makeSession(100, 40);

    const plan = buildResizePlan([zero, valid], 0, 0);

    expect(plan).toHaveLength(1);
    expect(plan[0].process).toBe(valid.process);
  });
});
