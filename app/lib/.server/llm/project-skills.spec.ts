import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  composeSkillsContext,
  formatInstalledSkillsContext,
  formatSkillsContext,
  retrieveSkillsForAgentContext,
  type InstalledSkillForPrompt,
  type ResolvedSkill,
} from './project-skills';
import { apiRequest } from '~/lib/enterprise-api.server';

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

vi.mock('~/lib/enterprise-api.server', () => ({ apiRequest: vi.fn() }));

describe('retrieveSkillsForAgentContext scope precedence', () => {
  const request = new Request('http://localhost/api/chat');
  const input = { projectId: 'synthetic-project', userPrompt: 'Reference tests' };

  beforeEach(() => {
    vi.mocked(apiRequest).mockReset();
  });

  function registry(
    project: InstalledSkillForPrompt[],
    workspace: InstalledSkillForPrompt[],
    builtin: ResolvedSkill[] = [],
  ) {
    vi.mocked(apiRequest).mockImplementation(async (_request, path) => {
      if (path.endsWith('/skills')) {
        return { skills: builtin };
      }

      if (path.endsWith('scope=project')) {
        return { skills: project };
      }

      if (path.endsWith('scope=workspace')) {
        return { skills: workspace };
      }

      throw new Error(`Unexpected test path: ${path}`);
    });
  }

  it('does not resurrect a disabled project override from an enabled workspace install', async () => {
    registry([installedSkill({ enabled: false })], [installedSkill({ scope: 'workspace' })]);
    expect(await retrieveSkillsForAgentContext(request, input)).toBeUndefined();
  });

  it('uses project instructions when both scopes enable the same repository', async () => {
    registry(
      [installedSkill({ instructions: 'Project-specific test guidance.' })],
      [installedSkill({ scope: 'workspace', instructions: 'Workspace-only guidance.' })],
    );

    const result = await retrieveSkillsForAgentContext(request, input);
    expect(result?.installed).toHaveLength(1);
    expect(result?.context).toContain('Project-specific test guidance.');
    expect(result?.context).not.toContain('Workspace-only guidance.');
    expect(result?.triggeredSkills).toEqual(['anthropics/skills']);
  });

  it('retains enabled workspace skills without a project override, excluding disabled ones', async () => {
    registry(
      [],
      [
        installedSkill({ scope: 'workspace' }),
        installedSkill({ ownerRepo: 'fixture/disabled', scope: 'workspace', enabled: false }),
      ],
    );

    const result = await retrieveSkillsForAgentContext(request, input);
    expect(result?.installed.map((entry) => entry.ownerRepo)).toEqual(['anthropics/skills']);
    expect(result?.context).toContain('Always write tests before code.');
    expect(result?.context).not.toContain('fixture/disabled');
  });

  it('injects only enabled builtin capabilities without fabricating executable tools', async () => {
    registry([], [], [skill({}), skill({ id: 'disabled', name: 'Disabled capability', enabled: false })]);

    const result = await retrieveSkillsForAgentContext(request, input);
    expect(result?.skills.map((entry) => entry.id)).toEqual(['code-review']);
    expect(result?.context).toContain('- Code Review (quality): Review diffs for correctness.');
    expect(result?.context).not.toContain('Disabled capability');
    expect(result?.installed).toEqual([]);
  });

  it('does not perform any lookup without a project', async () => {
    expect(await retrieveSkillsForAgentContext(request, {})).toBeUndefined();
    expect(apiRequest).not.toHaveBeenCalled();
  });
});
