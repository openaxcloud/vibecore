import rawSkillsCatalog from './skills-catalog.copy.json' with { type: 'json' };

export const SKILL_CATALOG_LOCALES = ['en', 'fr'] as const;
export type SkillCatalogLocale = (typeof SKILL_CATALOG_LOCALES)[number];

/** A skill as exposed to the IDE — localized catalog metadata + the project's resolved state. */
export interface Skill {
  id: string;
  name: string;
  description: string;

  /** Stable category code used for filtering and persistence. */
  category: string;

  /** Localized category label for display. */
  categoryLabel: string;
  enabled: boolean;
  source: 'builtin' | 'custom';
  updatedAt: string | null;
}

/** A static localized catalog entry (no per-project state). */
export interface SkillCatalogEntry {
  id: string;
  name: string;
  description: string;
  category: string;
  categoryLabel: string;
  defaultEnabled: boolean;
}

export interface SkillOverride {
  skillId: string;
  enabled: boolean;
  updatedAt: string;
}

type LocalizedSkillCopy = Readonly<{ name: string; description: string }>;
type SkillCatalogSourceEntry = Readonly<{
  id: string;
  category: string;
  defaultEnabled: boolean;
  copy: Readonly<Record<SkillCatalogLocale, LocalizedSkillCopy>>;
}>;
type SkillsCatalogSource = Readonly<{
  categories: Readonly<Record<SkillCatalogLocale, Readonly<Record<string, string>>>>;
  entries: readonly SkillCatalogSourceEntry[];
}>;

const DEFAULT_LOCALE: SkillCatalogLocale = 'en';
const CATALOG_SOURCE = rawSkillsCatalog as SkillsCatalogSource;

export function normalizeSkillCatalogLocale(locale?: string | null): SkillCatalogLocale {
  return locale?.trim().toLowerCase().split(/[-_]/)[0] === 'fr' ? 'fr' : DEFAULT_LOCALE;
}

function buildCatalog(locale: SkillCatalogLocale): readonly SkillCatalogEntry[] {
  return Object.freeze(
    CATALOG_SOURCE.entries.map((entry) => {
      const copy = entry.copy[locale] ?? entry.copy.en;

      const categoryLabel =
        CATALOG_SOURCE.categories[locale][entry.category] ?? CATALOG_SOURCE.categories.en[entry.category];

      return Object.freeze({
        id: entry.id,
        name: copy.name,
        description: copy.description,
        category: entry.category,
        categoryLabel: categoryLabel ?? entry.category,
        defaultEnabled: entry.defaultEnabled,
      });
    }),
  );
}

const SKILL_CATALOG_BY_LOCALE = Object.freeze({
  en: buildCatalog('en'),
  fr: buildCatalog('fr'),
}) satisfies Readonly<Record<SkillCatalogLocale, readonly SkillCatalogEntry[]>>;

/** Backward-compatible English default for existing consumers. */
export const SKILL_CATALOG = SKILL_CATALOG_BY_LOCALE.en;

const CATALOG_IDS = new Set(SKILL_CATALOG.map((entry) => entry.id));

export function skillCatalogForLocale(locale?: string | null): readonly SkillCatalogEntry[] {
  return SKILL_CATALOG_BY_LOCALE[normalizeSkillCatalogLocale(locale)];
}

export function isKnownSkill(skillId: string): boolean {
  return CATALOG_IDS.has(skillId);
}

export function resolveProjectSkills(overrides: readonly SkillOverride[], locale?: string | null): Skill[] {
  const overrideById = new Map(overrides.map((row) => [row.skillId, row]));

  return skillCatalogForLocale(locale).map((entry) => {
    const override = overrideById.get(entry.id);

    return {
      id: entry.id,
      name: entry.name,
      description: entry.description,
      category: entry.category,
      categoryLabel: entry.categoryLabel,
      source: 'builtin' as const,
      enabled: override ? override.enabled : entry.defaultEnabled,
      updatedAt: override ? override.updatedAt : null,
    };
  });
}

export function resolveSkill(
  skillId: string,
  overrides: readonly SkillOverride[],
  locale?: string | null,
): Skill | undefined {
  return resolveProjectSkills(overrides, locale).find((skill) => skill.id === skillId);
}
