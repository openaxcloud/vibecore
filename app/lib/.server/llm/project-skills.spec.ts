import { describe, expect, it } from 'vitest';
import {
  composeSkillsContext,
  formatInstalledSkillsContext,
  formatSkillsContext,
  type InstalledSkillForPrompt,
  type ResolvedSkill,
} from './project-skills';

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

const installedSkill = (over: Partial<InstalledSkillForPrompt>): InstalledSkillForPrompt => ({
  ownerRepo: 'anthropics/skills',
  name: 'Anthropic Skills',
  description: 'Reference agent skills.',
  instructions: 'Always write tests before code.',
  enabled: true,
  scope: 'project',
  ...over,
});

describe('formatInstalledSkillsContext', () => {
  it('emits each installed skill instructions block under installed_skills', () => {
    const context = formatInstalledSkillsContext([
      installedSkill({}),
      installedSkill({ ownerRepo: 'owasp/cheatsheets', name: 'OWASP', instructions: 'Validate all input.' }),
    ]);

    expect(context).toContain('<installed_skills>');
    expect(context).toContain('</installed_skills>');
    expect(context).toContain('### Anthropic Skills (anthropics/skills)');
    expect(context).toContain('Always write tests before code.');
    expect(context).toContain('### OWASP (owasp/cheatsheets)');
    expect(context).toContain('Validate all input.');
  });
});

describe('composeSkillsContext', () => {
  it('folds installed-skill instructions in alongside builtin skills', () => {
    const context = composeSkillsContext([skill({})], [installedSkill({})]);

    expect(context).toBeDefined();
    expect(context).toContain('<project_skills>');
    expect(context).toContain('- Code Review (quality): Review diffs for correctness.');
    expect(context).toContain('<installed_skills>');
    expect(context).toContain('Always write tests before code.');
  });

  it('returns just the builtin section when nothing is installed', () => {
    const context = composeSkillsContext([skill({})], []);

    expect(context).toContain('<project_skills>');
    expect(context).not.toContain('<installed_skills>');
  });

  it('returns just the installed section when no builtin skills are enabled', () => {
    const context = composeSkillsContext([], [installedSkill({})]);

    expect(context).toContain('<installed_skills>');
    expect(context).not.toContain('<project_skills>');
  });

  it('returns undefined when there are no skills at all', () => {
    expect(composeSkillsContext([], [])).toBeUndefined();
  });
});
