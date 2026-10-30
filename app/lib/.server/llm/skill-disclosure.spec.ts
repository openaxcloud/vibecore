import { describe, expect, it } from 'vitest';

import {
  discloseInstalledSkills,
  isSkillTriggered,
  SkillDisclosureSession,
  type DisclosableSkill,
} from './skill-disclosure';

function clock() {
  let n = 0;

  return () => `2026-07-31T00:00:${String(n++).padStart(2, '0')}.000Z`;
}

const commitHelper: DisclosableSkill = {
  ownerRepo: 'ecode/commit-helper',
  name: 'commit-helper',
  description: 'Write clear Conventional Commits messages',
  instructions: 'BODY: how to write commits',
  resources: [{ path: 'references/conventional-commits.md', bytes: 1620 }],
};

const owasp: DisclosableSkill = {
  ownerRepo: 'OWASP/CheatSheetSeries',
  name: 'cheatsheetseries',
  description: 'Application-security cheat sheets for security reviews',
  instructions: 'BODY: security review guidance',
};

describe('discloseInstalledSkills — progressive disclosure (RPL-SK-001.2)', () => {
  it('loads L2 ONLY for the skill triggered by the prompt; L1 for all', () => {
    const result = discloseInstalledSkills([commitHelper, owasp], 'help me write a commit message', clock());

    // L1 manifest lists BOTH skills.
    expect(result.context).toContain('- commit-helper: Write clear Conventional Commits messages');
    expect(result.context).toContain('- cheatsheetseries: Application-security cheat sheets for security reviews');

    // Only commit-helper's body (L2) is loaded — its name matches the prompt.
    expect(result.triggered).toEqual(['ecode/commit-helper']);
    expect(result.context).toContain('BODY: how to write commits');
    expect(result.context).not.toContain('BODY: security review guidance');

    // Trace proves it: two L1 entries, then exactly one L2 (commit-helper).
    const levels = result.trace.map((entry) => entry.level);
    expect(levels).toEqual([1, 1, 2]);
    expect(result.trace[2]).toMatchObject({ level: 2, skill: 'commit-helper' });

    // The security skill's body bytes never entered context.
    expect(result.bytesByLevel[2]).toBe(Buffer.byteLength('BODY: how to write commits'));
  });

  it('triggers the security skill when the prompt is about security', () => {
    const result = discloseInstalledSkills([commitHelper, owasp], 'do a security review for injection risks', clock());

    // "security" matches owasp's identity term; commit not mentioned.
    expect(result.triggered).toEqual(['OWASP/CheatSheetSeries']);
    expect(result.context).toContain('BODY: security review guidance');
    expect(result.context).not.toContain('BODY: how to write commits');
  });

  it('with no prompt, loads all bodies (never silently drops a capability)', () => {
    const result = discloseInstalledSkills([commitHelper, owasp], undefined, clock());
    expect(result.triggered.sort()).toEqual(['OWASP/CheatSheetSeries', 'ecode/commit-helper']);
    expect(result.trace.filter((e) => e.level === 2)).toHaveLength(2);
  });

  it('an unrelated prompt loads NO bodies — only L1 stays in context', () => {
    const result = discloseInstalledSkills([commitHelper, owasp], 'what is the capital of France', clock());
    expect(result.triggered).toEqual([]);
    expect(result.context).toContain('<available_skills>');
    expect(result.context).not.toContain('<active_skills>');
    expect(result.trace.every((e) => e.level === 1)).toBe(true);
  });

  it('empty install list → empty context', () => {
    const result = discloseInstalledSkills([], 'anything', clock());
    expect(result.context).toBe('');
    expect(result.trace).toEqual([]);
  });

  it('isSkillTriggered matches identity terms case-insensitively', () => {
    expect(isSkillTriggered(commitHelper, 'COMMIT please')).toBe(true);
    expect(isSkillTriggered(commitHelper, 'unrelated text')).toBe(false);
    expect(isSkillTriggered(commitHelper, undefined)).toBe(true);
  });
});

const shortSkill: DisclosableSkill = {
  ownerRepo: 'qa/ui',
  name: 'UI',
  description: '',
  instructions: 'SYNTHETIC_EXPLICIT_BODY',
};

describe('explicit installed skill selection', () => {
  it.each([
    ['UI', 'Utilise UI.'],
    ['sql', 'Utilise SQL.'],
    ['Été', 'Utilise ÉTÉ.'],
    ['Été', 'Utilise E\u0301te\u0301.'],
    ['校对', 'Utilise 校对.'],
    ['a+b', 'Utilise a+b.'],
  ])('loads the actual body for the complete name %s', (name, prompt) => {
    const result = discloseInstalledSkills([{ ...shortSkill, name }], prompt, clock());
    expect(result.triggered).toEqual(['qa/ui']);
    expect(result.context).toContain('SYNTHETIC_EXPLICIT_BODY');
    expect(result.trace.map((entry) => entry.level)).toEqual([1, 2]);
  });

  it('recognizes a short manifest name independently of the displayed name', () => {
    expect(isSkillTriggered({ ...shortSkill, name: 'Other', manifestName: 'sql' }, 'Utilise sql.')).toBe(true);
  });

  it.each(['build', 'éUI', 'UIé', 'x_UI', 'UI_suffix', 'not-UI', 'UI-plus', '界UI', 'UI界', '💡build'])(
    'does not match UI within %s',
    (prompt) => {
      expect(isSkillTriggered(shortSkill, prompt)).toBe(false);
    },
  );

  it('escapes punctuation in names instead of interpreting it as a regular expression', () => {
    expect(isSkillTriggered({ ...shortSkill, name: 'a+b' }, 'Use aaab')).toBe(false);
  });

  it('selects an explicit complete repository even when its name is short', () => {
    const result = discloseInstalledSkills([shortSkill], 'Utilise QA/UI.', clock());
    expect(result.triggered).toEqual(['qa/ui']);
    expect(result.context).toContain('SYNTHETIC_EXPLICIT_BODY');
  });

  it('prioritizes explicit repositories over shared names and lexical matches', () => {
    const result = discloseInstalledSkills(
      [
        { ...shortSkill, ownerRepo: 'first/review', name: 'review', instructions: 'BODY_FIRST' },
        { ...shortSkill, ownerRepo: 'second/review', name: 'review', instructions: 'BODY_SECOND' },
      ],
      'Utilise first/review pour cette review.',
      clock(),
    );
    expect(result.triggered).toEqual(['first/review']);
    expect(result.context).toContain('BODY_FIRST');
    expect(result.context).not.toContain('BODY_SECOND');
    expect(result.trace.map((entry) => entry.level)).toEqual([1, 1, 2]);
  });

  it('allows multiple explicitly named repositories', () => {
    const result = discloseInstalledSkills(
      [shortSkill, { ...shortSkill, ownerRepo: 'qa/sql', name: 'sql' }],
      'Utilise qa/ui et qa/sql.',
      clock(),
    );
    expect(result.triggered).toEqual(['qa/ui', 'qa/sql']);
  });

  it.each(['other/qa/ui', 'qa/ui-extra', 'qa/ui/extra'])(
    'does not mistake %s for the complete short repository',
    (prompt) => {
      expect(isSkillTriggered(shortSkill, prompt)).toBe(false);
    },
  );

  it('ignores empty aliases and distinguishes an empty prompt from a missing prompt', () => {
    const skill = { ...shortSkill, name: '', manifestName: ' ' };
    expect(isSkillTriggered(skill, '')).toBe(false);
    expect(isSkillTriggered(skill, 'bonjour')).toBe(false);
    expect(isSkillTriggered(skill, undefined)).toBe(true);
  });
});

describe('installed resource disclosure limits', () => {
  it('does not represent a requested resource as loaded or provide fake contents', () => {
    const result = discloseInstalledSkills(
      [commitHelper],
      'Use ecode/commit-helper and references/conventional-commits.md',
    );
    expect(result.context).toContain('BODY: how to write commits');
    expect(result.context).toContain('Bundled resource contents are NOT available');
    expect(result.context).toContain('Do not claim to');
    expect(result.context).not.toContain('fetch on demand');
    expect(result.trace.some((entry) => entry.level === 3)).toBe(false);
    expect(result.bytesByLevel[3]).toBe(0);
  });
});

it('refuses metadata-only resource access without recording a successful L3 load', () => {
  const session = new SkillDisclosureSession(
    [
      {
        name: 'fixture',
        description: 'Synthetic reference',
        resources: [{ path: 'reference.md', bytes: 42 }],
        loadBody: () => 'Synthetic instructions',
      },
    ],
    clock(),
  );
  expect(() => session.openResource('fixture', 'reference.md')).toThrow('no available resource');
  expect(session.trace()).toEqual([]);
  expect(session.bytesByLevel()[3]).toBe(0);
});
