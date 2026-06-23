import { describe, expect, it } from 'vitest';

import {
  applyPlanStatusUpdate,
  extractAndStripPlanChecklist,
  parsePlanChecklist,
  summarizePlanProgress,
  type PlanChecklist,
} from './plan-checklist';

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

describe('extractAndStripPlanChecklist', () => {
  it('returns undefined when no plan is present', () => {
    expect(extractAndStripPlanChecklist('just narration with no checkboxes')).toBeUndefined();
    expect(extractAndStripPlanChecklist('')).toBeUndefined();
  });

  it('strips a plan block from the middle of a message', () => {
    const source = [
      'Sure, here is the plan:',
      '## Plan',
      '- [ ] Read existing files',
      '- [x] Write the module',
      '',
      'Once these complete, the preview will refresh.',
    ].join('\n');

    const result = extractAndStripPlanChecklist(source);
    expect(result).toBeDefined();
    expect(result!.plan.items).toHaveLength(2);
    expect(result!.plan.title).toBe('Plan');
    expect(result!.remainingText).toContain('Sure, here is the plan:');
    expect(result!.remainingText).toContain('the preview will refresh');
    expect(result!.remainingText).not.toContain('[ ]');
    expect(result!.remainingText).not.toContain('[x]');
  });

  it('absorbs indented follow-up notes attached to the last item', () => {
    const source = ['- [x] Built the runner', '  Generated 3 files', '  Tests passed', '', 'Trailing prose.'].join(
      '\n',
    );

    const result = extractAndStripPlanChecklist(source);
    expect(result?.remainingText).toBe('Trailing prose.');
    expect(result?.plan.items[0].result).toContain('Generated 3 files');
  });

  it('returns an empty remainingText when the message is the plan only', () => {
    const result = extractAndStripPlanChecklist('- [ ] One\n- [ ] Two');
    expect(result?.remainingText).toBe('');
  });

  it('does not swallow indented prose separated from the plan by a blank line', () => {
    const source = [
      '## Plan',
      '- [x] Implement the feature',
      '- [ ] Document it',
      '',
      '    const example = doTheThing();',
      '    console.log(example);',
      '',
      'That snippet shows the new API.',
    ].join('\n');

    const result = extractAndStripPlanChecklist(source);
    expect(result).toBeDefined();
    expect(result!.plan.items).toHaveLength(2);

    /*
     * The blank-line gap ends the plan block: the indented code block and the
     * following paragraph must survive in the rendered body, not be stripped.
     */
    expect(result!.remainingText).toContain('const example = doTheThing();');
    expect(result!.remainingText).toContain('console.log(example);');
    expect(result!.remainingText).toContain('That snippet shows the new API.');

    // And it must not have leaked into an item's result note.
    expect(result!.plan.items.some((item) => item.result?.includes('const example'))).toBe(false);
  });

  it('does not absorb a prose sentence directly above the list as the title', () => {
    const source = ['This app needs a login page and a dashboard.', '- [ ] Build login', '- [ ] Build dashboard'].join(
      '\n',
    );

    const result = extractAndStripPlanChecklist(source);
    expect(result).toBeDefined();
    expect(result!.plan.items).toHaveLength(2);

    /*
     * The leading prose line is not separated from the checkboxes by a blank
     * line and is not a heading, so it must NOT become the plan title — it has
     * to survive in the rendered Markdown body instead of being stripped.
     */
    expect(result!.plan.title).toBeUndefined();
    expect(result!.remainingText).toContain('This app needs a login page and a dashboard.');
  });

  it('still absorbs a heading directly above the list as the title', () => {
    const source = ['## Build the app', '- [ ] Build login', '- [ ] Build dashboard'].join('\n');

    const result = extractAndStripPlanChecklist(source);
    expect(result?.plan.title).toBe('Build the app');
    expect(result?.remainingText).toBe('');
  });

  it('still absorbs a prose title separated from the list by a blank line', () => {
    const source = ['Here is my plan', '', '- [ ] Build login', '- [ ] Build dashboard'].join('\n');

    const result = extractAndStripPlanChecklist(source);
    expect(result?.plan.title).toBe('Here is my plan');
    expect(result?.remainingText).toBe('');
  });

  it('still absorbs indented notes that immediately follow the last item', () => {
    const source = [
      '- [x] Built the runner',
      '  Generated 3 files',
      '',
      '  Indented prose after a gap should be kept.',
    ].join('\n');

    const result = extractAndStripPlanChecklist(source);
    expect(result?.plan.items[0].result).toBe('Generated 3 files');
    expect(result?.remainingText).toContain('Indented prose after a gap should be kept.');
  });
});
