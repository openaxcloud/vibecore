import { describe, expect, it } from 'vitest';
import { findOpenSkillCatalogEntry, OPEN_SKILL_CATALOG } from './open-skill-catalog.js';

describe('OPEN_SKILL_CATALOG', () => {
  it('identifies an exact standard skill folder and never claims prior approval', () => {
    const ids = OPEN_SKILL_CATALOG.map((entry) => entry.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(OPEN_SKILL_CATALOG.every((entry) => entry.skillPath.startsWith('skills/'))).toBe(true);
    expect(OPEN_SKILL_CATALOG.every((entry) => entry.auditStatus === 'requires_audit')).toBe(true);
    expect(findOpenSkillCatalogEntry('anthropics/skills:skills/pdf')).toMatchObject({
      ownerRepo: 'anthropics/skills',
      skillPath: 'skills/pdf',
      ref: 'main',
    });
  });
});
