import { describe, expect, it } from 'vitest';
import type { FileMap } from './constants';
import { formatProjectRulesContext, isProjectRulePath, retrieveProjectRulesContext } from './project-rules';

const WORK_DIR = '/home/project';

function file(content: string, isBinary = false) {
  return { type: 'file' as const, content, isBinary };
}

describe('isProjectRulePath', () => {
  it('matches the well-known root rules filenames (case-insensitive)', () => {
    expect(isProjectRulePath('AGENTS.md')).toBe(true);
    expect(isProjectRulePath('agents.md')).toBe(true);
    expect(isProjectRulePath('.cursorrules')).toBe(true);
    expect(isProjectRulePath('CLAUDE.md')).toBe(true);
    expect(isProjectRulePath('.ecode/rules.md')).toBe(true);
  });

  it('matches Cursor .cursor/rules/*.md and *.mdc', () => {
    expect(isProjectRulePath('.cursor/rules/style.md')).toBe(true);
    expect(isProjectRulePath('.cursor/rules/api.mdc')).toBe(true);
  });

  it('does not match ordinary project files', () => {
    expect(isProjectRulePath('src/index.ts')).toBe(false);
    expect(isProjectRulePath('README.md')).toBe(false);
    expect(isProjectRulePath('.cursor/settings.json')).toBe(false);
  });
});

describe('retrieveProjectRulesContext', () => {
  it('returns undefined when there are no rules files', () => {
    const files: FileMap = { [`${WORK_DIR}/src/index.ts`]: file('export {}') };
    expect(retrieveProjectRulesContext(files)).toBeUndefined();
    expect(retrieveProjectRulesContext(undefined)).toBeUndefined();
  });

  it('collects rules files and injects their content into the system-prompt block', () => {
    const files: FileMap = {
      [`${WORK_DIR}/AGENTS.md`]: file('Always use TypeScript strict mode.'),
      [`${WORK_DIR}/src/app.ts`]: file('const x = 1;'),
    };

    const result = retrieveProjectRulesContext(files);
    expect(result).toBeDefined();
    expect(result!.files.map((rule) => rule.path)).toEqual(['AGENTS.md']);
    expect(result!.context).toContain('<project_rules>');
    expect(result!.context).toContain('Always use TypeScript strict mode.');
  });

  it('orders root rules before nested .cursor/rules files, alphabetically', () => {
    const files: FileMap = {
      [`${WORK_DIR}/.cursor/rules/z.md`]: file('rule z'),
      [`${WORK_DIR}/.cursor/rules/a.md`]: file('rule a'),
      [`${WORK_DIR}/AGENTS.md`]: file('root rule'),
    };

    const result = retrieveProjectRulesContext(files);
    expect(result!.files.map((rule) => rule.path)).toEqual(['AGENTS.md', '.cursor/rules/a.md', '.cursor/rules/z.md']);
  });

  it('ignores binary and empty rules files', () => {
    const files: FileMap = {
      [`${WORK_DIR}/AGENTS.md`]: file('\n\n'),
      [`${WORK_DIR}/.cursorrules`]: file('binary', true),
    };
    expect(retrieveProjectRulesContext(files)).toBeUndefined();
  });
});

describe('formatProjectRulesContext', () => {
  it('renders each rule under its path heading', () => {
    const context = formatProjectRulesContext([
      { path: 'AGENTS.md', content: 'Use pnpm.' },
      { path: '.cursor/rules/api.md', content: 'REST only.' },
    ]);
    expect(context).toContain('### AGENTS.md');
    expect(context).toContain('Use pnpm.');
    expect(context).toContain('### .cursor/rules/api.md');
    expect(context).toContain('REST only.');
  });
});
