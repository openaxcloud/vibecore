/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';

const { toast } = vi.hoisted(() => ({
  toast: Object.assign(vi.fn(), { isActive: vi.fn(() => false), update: vi.fn(), dismiss: vi.fn() }),
}));
vi.mock('react-toastify', () => ({ toast }));

import { AGENT_APPLIED_CONTAINER_ID, showCoalescedAppliedToast } from './AppliedFilesToast';

afterEach(() => {
  document.body.replaceChildren();
  vi.clearAllMocks();
  toast.isActive.mockReturnValue(false);
});

describe('applied-file notification destination', () => {
  it('uses the visible dock and updates the same container as files accumulate', () => {
    const dock = document.createElement('div');
    dock.id = AGENT_APPLIED_CONTAINER_ID;
    document.body.appendChild(dock);
    vi.spyOn(dock, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList);
    showCoalescedAppliedToast(['a.ts'], { onUndoAll: vi.fn() });
    expect(toast).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        containerId: AGENT_APPLIED_CONTAINER_ID,
        closeButton: false,
      }),
    );
    toast.isActive.mockReturnValue(true);
    showCoalescedAppliedToast(['a.ts', 'b.ts'], { onUndoAll: vi.fn() });
    expect(toast.update).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        containerId: AGENT_APPLIED_CONTAINER_ID,
      }),
    );
  });

  it('keeps the same persistent container when the Agent panel is not visible', () => {
    const dock = document.createElement('div');
    dock.id = AGENT_APPLIED_CONTAINER_ID;
    document.body.appendChild(dock);
    showCoalescedAppliedToast(['a.ts'], { onUndoAll: vi.fn() });
    expect(toast).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        containerId: AGENT_APPLIED_CONTAINER_ID,
        closeButton: false,
      }),
    );
  });
});
