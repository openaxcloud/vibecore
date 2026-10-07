import { describe, expect, it } from 'vitest';

import { discloseInstalledSkills, isSkillTriggered, type DisclosableSkill } from './skill-disclosure';

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
