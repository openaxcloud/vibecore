import { describe, expect, it } from 'vitest';
import { formatSkillsContext, type ResolvedSkill } from './project-skills';

const skill = (over: Partial<ResolvedSkill>): ResolvedSkill => ({
  id: 'code-review',
  name: 'Code Review',
  description: 'Review diffs for correctness.',
  category: 'quality',
  enabled: true,
  source: 'builtin',
  ...over,
});

describe('formatSkillsContext', () => {
  it('lists each skill with name, category and description', () => {
    const context = formatSkillsContext([
      skill({}),
      skill({ id: 'debugger', name: 'Debugger', category: 'quality', description: 'Reproduce and explain errors.' }),
    ]);

    expect(context).toContain('<project_skills>');
    expect(context).toContain('</project_skills>');
    expect(context).toContain('- Code Review (quality): Review diffs for correctness.');
    expect(context).toContain('- Debugger (quality): Reproduce and explain errors.');
  });

  it('instructs the agent to apply enabled skills and ignore unlisted ones', () => {
    const context = formatSkillsContext([skill({})]);

    expect(context).toMatch(/ENABLED/);
    expect(context).toMatch(/Skills not listed here are disabled/);
  });
});
