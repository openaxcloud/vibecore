import { describe, expect, it } from 'vitest';
import {
  SKILL_REPO_CATALOG,
  findRepoEntry,
  isValidOwnerRepo,
  normalizeOwnerRepo,
} from '../skills-repo-catalog.js';
import { TestApiStore } from './test-api-store.js';

describe('skills-repo-catalog: owner/repo validation', () => {
  it('accepts well-formed owner/repo slugs', () => {
    expect(isValidOwnerRepo('anthropics/skills')).toBe(true);
    expect(isValidOwnerRepo('OWASP/CheatSheetSeries')).toBe(true);
    expect(isValidOwnerRepo('foo-bar/baz.qux_1')).toBe(true);
  });

  it('rejects malformed, traversal, and non-owner/repo strings', () => {
    expect(isValidOwnerRepo('noslash')).toBe(false);
    expect(isValidOwnerRepo('too/many/segments')).toBe(false);
    expect(isValidOwnerRepo('owner/')).toBe(false);
    expect(isValidOwnerRepo('/repo')).toBe(false);
    expect(isValidOwnerRepo('../etc/passwd')).toBe(false);
    expect(isValidOwnerRepo('owner/..')).toBe(false);
    expect(isValidOwnerRepo('own er/repo')).toBe(false);
    expect(isValidOwnerRepo('owner/repo?x=1')).toBe(false);
    expect(isValidOwnerRepo('')).toBe(false);
  });

  it('normalizes trailing .git and whitespace', () => {
    expect(normalizeOwnerRepo('  anthropics/skills.git ')).toBe('anthropics/skills');
    expect(normalizeOwnerRepo('anthropics/skills')).toBe('anthropics/skills');
    expect(normalizeOwnerRepo('bad input')).toBeUndefined();
  });

  it('finds curated catalog entries case-insensitively', () => {
    expect(SKILL_REPO_CATALOG.length).toBeGreaterThanOrEqual(8);
    expect(findRepoEntry('anthropics/skills')?.name).toBe('Anthropic Skills');
    expect(findRepoEntry('ANTHROPICS/SKILLS')?.ownerRepo).toBe('anthropics/skills');
    expect(findRepoEntry('does/not-exist')).toBeUndefined();
  });
});

describe('TestApiStore installed-skills round-trip', () => {
  it('installs, lists, counts, toggles, and uninstalls', async () => {
    const store = new TestApiStore();

    const first = await store.installSkill({
      scope: 'project',
      scopeId: 'proj_1',
      ownerRepo: 'anthropics/skills',
      name: 'Anthropic Skills',
      description: 'desc',
      instructions: 'do the thing',
      homepageUrl: 'https://github.com/anthropics/skills',
      installedByUserId: 'user_1',
    });

    expect(first.created).toBe(true);
    expect(first.record.enabled).toBe(true);

    // Duplicate install is idempotent (created=false, same row).
    const dup = await store.installSkill({
      scope: 'project',
      scopeId: 'proj_1',
      ownerRepo: 'anthropics/skills',
      name: 'Anthropic Skills',
      description: 'desc',
      instructions: 'do the thing',
    });
    expect(dup.created).toBe(false);
    expect(dup.record.id).toBe(first.record.id);

    // A workspace-scoped install of the same repo is a distinct row.
    await store.installSkill({
      scope: 'workspace',
      scopeId: 'ws_1',
      ownerRepo: 'anthropics/skills',
      name: 'Anthropic Skills',
      description: 'desc',
      instructions: 'ws instructions',
    });

    const projectSkills = await store.listInstalledSkills('project', 'proj_1');
    expect(projectSkills).toHaveLength(1);
    expect(projectSkills[0].ownerRepo).toBe('anthropics/skills');

    const counts = await store.countInstallsByRepo();
    expect(counts['anthropics/skills']).toBe(2);

    const toggled = await store.setInstalledSkillEnabled({
      scope: 'project',
      scopeId: 'proj_1',
      ownerRepo: 'anthropics/skills',
      enabled: false,
    });
    expect(toggled?.enabled).toBe(false);

    const removed = await store.uninstallSkill('project', 'proj_1', 'anthropics/skills');
    expect(removed).toBe(true);
    expect(await store.listInstalledSkills('project', 'proj_1')).toHaveLength(0);

    // Workspace row survives the project-scope uninstall.
    expect(await store.listInstalledSkills('workspace', 'ws_1')).toHaveLength(1);
  });
});
