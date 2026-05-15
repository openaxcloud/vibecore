import { describe, expect, it } from 'vitest';

import { applyPlanStatusUpdate, parsePlanChecklist, summarizePlanProgress, type PlanChecklist } from './plan-checklist';

describe('parsePlanChecklist', () => {
  it('returns undefined for empty input', () => {
    expect(parsePlanChecklist('')).toBeUndefined();
    expect(parsePlanChecklist('   \n   ')).toBeUndefined();
  });

  it('parses a basic todo list', () => {
    const plan = parsePlanChecklist(
      ['- [ ] Read the existing files', '- [x] Write the new module', '- [-] Run the tests'].join('\n'),
    );

    expect(plan).toBeDefined();
    expect(plan?.items).toEqual([
      { id: 'plan-item-0', description: 'Read the existing files', status: 'pending' },
      { id: 'plan-item-1', description: 'Write the new module', status: 'completed' },
      { id: 'plan-item-2', description: 'Run the tests', status: 'in_progress' },
    ]);
  });

  it('captures a title from text preceding the first item', () => {
    const plan = parsePlanChecklist(['## Plan', '', '- [ ] Step one', '- [ ] Step two'].join('\n'));

    expect(plan?.title).toBe('Plan');
    expect(plan?.items).toHaveLength(2);
  });

  it('treats `!` and `?` as failed', () => {
    const plan = parsePlanChecklist(['- [!] Something broke', '- [?] Need clarification'].join('\n'));

    expect(plan?.items.every((item) => item.status === 'failed')).toBe(true);
  });

  it('attaches plain follow-up lines to the previous item as result text', () => {
    const plan = parsePlanChecklist(
      ['- [x] Built the runner', '  Generated 3 files', '  Tests passed', '', '- [ ] Deploy'].join('\n'),
    );

    expect(plan?.items[0].result).toBe('Generated 3 files Tests passed');
    expect(plan?.items[1].result).toBeUndefined();
  });

  it('drops follow-up lines when no item exists yet', () => {
    const plan = parsePlanChecklist(['stray comment', '- [ ] First'].join('\n'));
    expect(plan?.title).toBe('stray comment');
    expect(plan?.items).toHaveLength(1);
  });
});

describe('summarizePlanProgress', () => {
  it('counts items by status and computes the completion ratio', () => {
    const plan: PlanChecklist = {
      items: [
        { id: 'a', description: 'a', status: 'completed' },
        { id: 'b', description: 'b', status: 'completed' },
        { id: 'c', description: 'c', status: 'in_progress' },
        { id: 'd', description: 'd', status: 'pending' },
        { id: 'e', description: 'e', status: 'failed' },
      ],
    };

    const progress = summarizePlanProgress(plan);
    expect(progress.completed).toBe(2);
    expect(progress.inProgress).toBe(1);
    expect(progress.pending).toBe(1);
    expect(progress.failed).toBe(1);
    expect(progress.total).toBe(5);
    expect(progress.completionRatio).toBeCloseTo(0.4);
  });

  it('returns a zero ratio for an empty plan', () => {
    expect(summarizePlanProgress({ items: [] }).completionRatio).toBe(0);
  });
});

describe('applyPlanStatusUpdate', () => {
  it('updates the matching item and preserves the rest', () => {
    const plan: PlanChecklist = {
      items: [
        { id: 'a', description: 'a', status: 'pending' },
        { id: 'b', description: 'b', status: 'pending' },
      ],
    };

    const next = applyPlanStatusUpdate(plan, { id: 'b', status: 'completed', result: 'done in 3 lines' });
    expect(next.items[0]).toBe(plan.items[0]);
    expect(next.items[1].status).toBe('completed');
    expect(next.items[1].result).toBe('done in 3 lines');
    expect(next).not.toBe(plan);
  });

  it('returns the original plan when the update is a no-op', () => {
    const plan: PlanChecklist = {
      items: [{ id: 'a', description: 'a', status: 'pending' }],
    };

    const next = applyPlanStatusUpdate(plan, { id: 'a', status: 'pending' });
    expect(next).toBe(plan);
  });

  it('ignores updates for unknown ids', () => {
    const plan: PlanChecklist = {
      items: [{ id: 'a', description: 'a', status: 'pending' }],
    };

    const next = applyPlanStatusUpdate(plan, { id: 'ghost', status: 'completed' });
    expect(next).toBe(plan);
  });
});
