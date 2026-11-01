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
afterEach(() => {
  vi.mocked(showCoalescedAppliedToast).mock.lastCall?.[1].onDismissAll?.();
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
});
