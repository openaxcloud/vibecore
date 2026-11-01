/** @vitest-environment jsdom */
import { toast } from 'react-toastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { showCoalescedAppliedToast } from './AppliedFilesToast';
import { scheduleAppliedFilesToast } from './schedule-applied-files-toast';
import { workbenchStore } from '~/lib/stores/workbench';

vi.mock('react-toastify', () => ({ toast: { isActive: vi.fn(() => true), dismiss: vi.fn() } }));
vi.mock('./AppliedFilesToast', () => ({ AGENT_APPLIED_TOAST_ID: 'applied', showCoalescedAppliedToast: vi.fn() }));
vi.mock('~/lib/stores/workbench', () => ({ workbenchStore: { revertAgentPatchProposal: vi.fn() } }));
vi.mock('~/lib/stores/constat-de-generation', () => ({ constatDeGenerationStore: { get: () => undefined } }));

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  vi.mocked(toast.isActive).mockReturnValue(true);
});
afterEach(async () => {
  vi.mocked(showCoalescedAppliedToast).mock.lastCall?.[1].onDismissAll?.();
  await vi.runAllTimersAsync();
  document.body.replaceChildren();
  vi.useRealTimers();
});

describe('shared auto-apply and retry notification', () => {
  it('keeps every identity across updates and deduplicates repeated confirmation', () => {
    scheduleAppliedFilesToast('initial.ts', 'initial');
    vi.advanceTimersByTime(80);
    scheduleAppliedFilesToast('retried.ts', 'retried');
    scheduleAppliedFilesToast('retried.ts', 'retried');
    vi.advanceTimersByTime(80);
    expect(showCoalescedAppliedToast).toHaveBeenLastCalledWith(
      ['initial.ts', 'retried.ts'],
      expect.anything(),
      undefined,
    );
    vi.mocked(showCoalescedAppliedToast).mock.lastCall![1].onUndoAll();
    expect(vi.mocked(workbenchStore.revertAgentPatchProposal).mock.calls).toEqual([['initial'], ['retried']]);
  });

  it('preserves the first retried file after the previous notification has closed', () => {
    scheduleAppliedFilesToast('old.ts', 'old');
    vi.advanceTimersByTime(80);
    vi.mocked(toast.isActive).mockReturnValue(false);
    scheduleAppliedFilesToast('new.ts', 'new');
    vi.advanceTimersByTime(80);
    expect(showCoalescedAppliedToast).toHaveBeenLastCalledWith(['new.ts'], expect.anything(), undefined);
    vi.mocked(showCoalescedAppliedToast).mock.lastCall![1].onUndoAll();
    expect(workbenchStore.revertAgentPatchProposal).toHaveBeenCalledExactlyOnceWith('new');
  });
  it('Undo includes B confirmed during the debounce before the visible A toast updates', () => {
    scheduleAppliedFilesToast('a.ts', 'a');
    vi.advanceTimersByTime(80);

    const visible = vi.mocked(showCoalescedAppliedToast).mock.lastCall![1];
    scheduleAppliedFilesToast('b.ts', 'b');
    visible.onUndoAll();
    expect(vi.mocked(workbenchStore.revertAgentPatchProposal).mock.calls).toEqual([['a'], ['b']]);
  });

  it.each([0, 80])('keeps B arriving during async Undo before/after its flush (%i ms)', async (elapsed) => {
    let finish!: () => void;
    vi.mocked(workbenchStore.revertAgentPatchProposal).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    scheduleAppliedFilesToast('a.ts', 'a');
    vi.advanceTimersByTime(80);

    const old = vi.mocked(showCoalescedAppliedToast).mock.lastCall![1];
    old.onUndoAll();
    scheduleAppliedFilesToast('b.ts', 'b');
    scheduleAppliedFilesToast('a.ts', 'a');
    old.onUndoAll();
    old.onDismissAll?.();
    vi.advanceTimersByTime(elapsed);
    finish();
    await vi.runAllTimersAsync();
    expect(showCoalescedAppliedToast).toHaveBeenLastCalledWith(['b.ts'], expect.anything(), undefined);
    expect(toast.dismiss).not.toHaveBeenCalled();
    vi.mocked(showCoalescedAppliedToast).mock.lastCall![1].onUndoAll();
    expect(vi.mocked(workbenchStore.revertAgentPatchProposal).mock.calls).toEqual([['a'], ['b']]);
  });

  it('manual dismissal only closes displayed A and retains unseen confirmed B', () => {
    scheduleAppliedFilesToast('a.ts', 'a');
    vi.advanceTimersByTime(80);

    const old = vi.mocked(showCoalescedAppliedToast).mock.lastCall![1];
    scheduleAppliedFilesToast('b.ts', 'b');
    old.onDismissAll?.();
    vi.advanceTimersByTime(80);
    expect(showCoalescedAppliedToast).toHaveBeenLastCalledWith(['b.ts'], expect.anything(), undefined);
    old.onUndoAll();
    expect(workbenchStore.revertAgentPatchProposal).not.toHaveBeenCalled();
    vi.mocked(showCoalescedAppliedToast).mock.lastCall![1].onUndoAll();
    expect(workbenchStore.revertAgentPatchProposal).toHaveBeenCalledExactlyOnceWith('b');
  });
  it('keeps B confirmed during the manual dismissal animation until the old toast is removed', async () => {
    scheduleAppliedFilesToast('a.ts', 'a');
    vi.advanceTimersByTime(80);

    const exitingToast = document.createElement('div');
    exitingToast.id = 'applied';
    document.body.appendChild(exitingToast);

    const old = vi.mocked(showCoalescedAppliedToast).mock.lastCall![1];
    old.onDismissAll?.();
    scheduleAppliedFilesToast('b.ts', 'b');
    vi.advanceTimersByTime(80);
    expect(showCoalescedAppliedToast).toHaveBeenCalledTimes(1);
    exitingToast.remove();
    await vi.runAllTimersAsync();
    expect(showCoalescedAppliedToast).toHaveBeenLastCalledWith(['b.ts'], expect.anything(), undefined);
    old.onUndoAll();
    vi.mocked(showCoalescedAppliedToast).mock.lastCall![1].onUndoAll();
    expect(workbenchStore.revertAgentPatchProposal).toHaveBeenCalledExactlyOnceWith('b');
  });
});
