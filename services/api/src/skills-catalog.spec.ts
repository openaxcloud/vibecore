import { describe, expect, it } from 'vitest';

import {
  SKILL_CATALOG,
  isKnownSkill,
  resolveProjectSkills,
  resolveSkill,
  skillCatalogForLocale,
  type SkillOverride,
} from './skills-catalog.js';

describe('skills catalog', () => {
  it('has unique, stable slugs and complete metadata', () => {
    const ids = SKILL_CATALOG.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);

    for (const entry of SKILL_CATALOG) {
      expect(entry.id).toMatch(/^[a-z0-9-]+$/);
      expect(entry.name.length).toBeGreaterThan(0);
      expect(entry.description.length).toBeGreaterThan(0);
      expect(entry.category.length).toBeGreaterThan(0);
      expect(typeof entry.defaultEnabled).toBe('boolean');
    }
  });

  it('isKnownSkill reflects catalog membership', () => {
    expect(isKnownSkill('code-review')).toBe(true);
    expect(isKnownSkill('not-a-skill')).toBe(false);
  });
});

describe('resolveProjectSkills', () => {
  it('localizes names, descriptions, and display labels while keeping stable codes', () => {
    const english = resolveProjectSkills([], 'en-US').find((skill) => skill.id === 'code-review');
    const french = resolveProjectSkills([], 'fr-FR').find((skill) => skill.id === 'code-review');

    expect(english).toMatchObject({ name: 'Code review', category: 'quality', categoryLabel: 'Quality' });
    expect(french).toMatchObject({ name: 'Revue de code', category: 'quality', categoryLabel: 'Qualité' });
    expect(french?.description).toContain('Analysez les diffs');
    expect(skillCatalogForLocale('de-DE')).toBe(SKILL_CATALOG);
  });

  it('returns the full catalog at defaults when there are no overrides', () => {
    const skills = resolveProjectSkills([]);

    expect(skills).toHaveLength(SKILL_CATALOG.length);

    for (const skill of skills) {
      const entry = SKILL_CATALOG.find((candidate) => candidate.id === skill.id)!;
      expect(skill.enabled).toBe(entry.defaultEnabled);
      expect(skill.source).toBe('builtin');
      expect(skill.updatedAt).toBeNull();
    }
  });

  it('applies an override that flips enabled and carries its updatedAt', () => {
    const off = SKILL_CATALOG.find((entry) => entry.defaultEnabled)!;
    const on = SKILL_CATALOG.find((entry) => !entry.defaultEnabled)!;
    const overrides: SkillOverride[] = [
      { skillId: off.id, enabled: false, updatedAt: '2026-06-29T00:00:00.000Z' },
      { skillId: on.id, enabled: true, updatedAt: '2026-06-29T01:00:00.000Z' },
    ];

    const skills = resolveProjectSkills(overrides);

    expect(skills.find((skill) => skill.id === off.id)).toMatchObject({
      enabled: false,
      updatedAt: '2026-06-29T00:00:00.000Z',
    });
    expect(skills.find((skill) => skill.id === on.id)).toMatchObject({
      enabled: true,
      updatedAt: '2026-06-29T01:00:00.000Z',
    });
  });

  it('ignores overrides for slugs that are not in the catalog', () => {
    const skills = resolveProjectSkills([
      { skillId: 'ghost-skill', enabled: true, updatedAt: '2026-06-29T00:00:00.000Z' },
    ]);

    expect(skills).toHaveLength(SKILL_CATALOG.length);
    expect(skills.some((skill) => skill.id === 'ghost-skill')).toBe(false);
  });

  it('resolveSkill returns a single resolved skill or undefined', () => {
    const overrides: SkillOverride[] = [
      { skillId: 'code-review', enabled: false, updatedAt: '2026-06-29T00:00:00.000Z' },
    ];

    expect(resolveSkill('code-review', overrides)).toMatchObject({ id: 'code-review', enabled: false });
    expect(resolveSkill('code-review', overrides, 'fr')).toMatchObject({ name: 'Revue de code' });
    expect(resolveSkill('not-a-skill', overrides)).toBeUndefined();
  });
});
