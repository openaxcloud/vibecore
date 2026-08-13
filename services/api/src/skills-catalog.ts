/**
 * Builtin Skills catalog (Replit/agent-IDE parity).
 *
 * The catalog is a static, code-owned list — the source of truth for which
 * skills exist. Per-project state is just a sparse set of enable/disable
 * *overrides* (table `ProjectSkill`); a project with no override row for a
 * skill sees that skill at its catalog `defaultEnabled`. This keeps the common
 * case (defaults) zero-write and makes the registry list a pure merge of the
 * catalog with the project's overrides.
 */

/** A skill as exposed to the IDE — catalog metadata + the project's resolved state. */
export interface Skill {
  id: string;
  name: string;
  description: string;
  category: string;
  enabled: boolean;
  source: 'builtin' | 'custom';
  /** ISO timestamp of the last override toggle, or null when at catalog default. */
  updatedAt: string | null;
}

/** A static catalog entry (no per-project state). */
export interface SkillCatalogEntry {
  id: string;
  name: string;
  description: string;
  category: string;
  defaultEnabled: boolean;
}

/** Minimal shape of a `ProjectSkill` override row the resolver needs. */
export interface SkillOverride {
  skillId: string;
  enabled: boolean;
  updatedAt: string;
}

/**
 * The builtin skills. Slugs are stable identifiers (used as `skillId` in the
 * override table and in the API path), so do not rename an `id` once shipped.
 */
export const SKILL_CATALOG: readonly SkillCatalogEntry[] = [
  {
    id: 'code-review',
    name: 'Code Review',
    description: 'Review diffs for correctness, security, and performance before you ship.',
    category: 'quality',
    defaultEnabled: true,
  },
  {
    id: 'test-generation',
    name: 'Test Generation',
    description: 'Generate unit and integration tests for the code you are writing.',
    category: 'quality',
    defaultEnabled: true,
  },
  {
    id: 'debugger',
    name: 'Debugger',
    description: 'Reproduce, isolate, and explain runtime errors and stack traces.',
    category: 'quality',
    defaultEnabled: true,
  },
  {
    id: 'refactor',
    name: 'Refactor',
    description: 'Restructure code for readability and reuse without changing behaviour.',
    category: 'productivity',
    defaultEnabled: true,
  },
  {
    id: 'documentation',
    name: 'Documentation',
    description: 'Write and maintain READMEs, API docs, and inline comments.',
    category: 'productivity',
    defaultEnabled: false,
  },
  {
    id: 'security-scan',
    name: 'Security Scan',
    description: 'Surface dependency CVEs, secrets, and common injection risks.',
    category: 'security',
    defaultEnabled: false,
  },
  {
    id: 'sql-assistant',
    name: 'SQL Assistant',
    description: 'Author and explain SQL against the project database.',
    category: 'data',
    defaultEnabled: false,
  },
  {
    id: 'dependency-upgrade',
    name: 'Dependency Upgrade',
    description: 'Propose safe dependency bumps and migrate breaking changes.',
    category: 'maintenance',
    defaultEnabled: false,
  },
  {
    id: 'accessibility',
    name: 'Accessibility',
    description: 'Audit UI for WCAG issues and propose accessible markup.',
    category: 'frontend',
    defaultEnabled: false,
  },
  {
    id: 'performance',
    name: 'Performance',
    description: 'Profile hotspots and suggest targeted optimizations.',
    category: 'quality',
    defaultEnabled: false,
  },
] as const;

const CATALOG_BY_ID = new Map(SKILL_CATALOG.map((entry) => [entry.id, entry]));

/** Whether a slug names a real builtin skill. */
export function isKnownSkill(skillId: string): boolean {
  return CATALOG_BY_ID.has(skillId);
}

/**
 * Resolve the catalog against a project's sparse overrides into the full,
 * sorted skill list the IDE renders. Pure — no I/O — so it is fully unit
 * tested. Overrides for slugs not in the catalog are ignored (a removed skill
 * never resurrects as a phantom entry).
 */
export function resolveProjectSkills(overrides: readonly SkillOverride[]): Skill[] {
  const overrideById = new Map(overrides.map((row) => [row.skillId, row]));

  return SKILL_CATALOG.map((entry) => {
    const override = overrideById.get(entry.id);

    return {
      id: entry.id,
      name: entry.name,
      description: entry.description,
      category: entry.category,
      source: 'builtin' as const,
      enabled: override ? override.enabled : entry.defaultEnabled,
      updatedAt: override ? override.updatedAt : null,
    };
  });
}

/** Resolve a single skill's state (used by enable/disable responses). */
export function resolveSkill(skillId: string, overrides: readonly SkillOverride[]): Skill | undefined {
  return resolveProjectSkills(overrides).find((skill) => skill.id === skillId);
}
