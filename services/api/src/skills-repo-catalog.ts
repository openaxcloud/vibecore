import rawSkillRepoCatalog from './skills-repo-catalog.json' with { type: 'json' };

/**
 * Community catalog of INSTALLABLE GitHub-repo skills (F#27).
 *
 * This is a code-owned, curated list of PUBLIC GitHub repositories that package
 * agent skills (a SKILL.md / AGENTS.md / README.md the agent can follow). It is
 * the browse surface for the "Community" tab: entries are what the user can
 * install. Installing fetches the repo's instructions server-side (SSRF-guarded)
 * and persists an `InstalledSkill` row.
 *
 * The descriptions here are OURS (short, factual summaries of what each repo is
 * for) — we do not copy any project's marketing copy. `installCount` is computed
 * live from the InstalledSkill table, not stored here.
 *
 * A curated catalog (rather than live GitHub search) is a deliberate trust
 * boundary: only vetted public repos are surfaced for one-click install. An
 * arbitrary `owner/repo` can still be installed via the API when it validates,
 * but the browse list is curated.
 */

export interface SkillRepoCatalogEntry {
  /** Canonical `owner/repo` GitHub slug — also the install key. */
  ownerRepo: string;
  /** Display name for the catalog card. */
  name: string;
  /** Our own one-line summary of what the skill does. */
  description: string;
  /** Coarse grouping for filtering. */
  category: string;
  /** Public homepage / repo URL. */
  homepageUrl: string;
}

export const SKILL_REPO_LOCALES = ['en', 'fr'] as const;

export type SkillRepoLocale = (typeof SKILL_REPO_LOCALES)[number];

type LocalizedDescriptions = Readonly<Partial<Record<SkillRepoLocale, string>>>;

type SkillRepoCatalogSourceEntry = Readonly<
  Omit<SkillRepoCatalogEntry, 'description'> & {
    descriptions: LocalizedDescriptions;
  }
>;

const DEFAULT_SKILL_REPO_LOCALE: SkillRepoLocale = 'en';

function normalizeSkillRepoLocale(locale: string | null | undefined): SkillRepoLocale {
  const primary = locale?.trim().toLowerCase().split(/[-_]/)[0];

  return primary === 'fr' ? 'fr' : DEFAULT_SKILL_REPO_LOCALE;
}

/**
 * Resolve one description without ever returning a catalogue identifier.
 * English is the per-entry fallback for an incomplete localized source.
 */
export function localizedSkillRepoDescription(descriptions: LocalizedDescriptions, locale?: string | null): string {
  const resolvedLocale = normalizeSkillRepoLocale(locale);
  const localized = descriptions[resolvedLocale]?.trim();

  return localized || descriptions.en?.trim() || '';
}

/**
 * Curated public skill repositories. Slugs are stable install keys — do not
 * rename an `ownerRepo` once shipped (installs reference it). Roughly a dozen
 * realistic, well-known public repos across common developer skill categories.
 */
const SKILL_REPO_CATALOG_SOURCE = rawSkillRepoCatalog.entries as readonly SkillRepoCatalogSourceEntry[];

function buildSkillRepoCatalog(locale: SkillRepoLocale): readonly SkillRepoCatalogEntry[] {
  return Object.freeze(
    SKILL_REPO_CATALOG_SOURCE.map((entry) =>
      Object.freeze({
        ownerRepo: entry.ownerRepo,
        name: entry.name,
        description: localizedSkillRepoDescription(entry.descriptions, locale),
        category: entry.category,
        homepageUrl: entry.homepageUrl,
      }),
    ),
  );
}

const SKILL_REPO_CATALOG_BY_LOCALE: Readonly<Record<SkillRepoLocale, readonly SkillRepoCatalogEntry[]>> = Object.freeze(
  {
    en: buildSkillRepoCatalog('en'),
    fr: buildSkillRepoCatalog('fr'),
  },
);

/** Resolve the curated server catalogue for a supported or browser-style locale. */
export function skillRepoCatalogForLocale(locale?: string | null): readonly SkillRepoCatalogEntry[] {
  return SKILL_REPO_CATALOG_BY_LOCALE[normalizeSkillRepoLocale(locale)];
}

/** Backward-compatible English default for existing server consumers. */
export const SKILL_REPO_CATALOG = SKILL_REPO_CATALOG_BY_LOCALE.en;

/**
 * Validate an `owner/repo` slug. GitHub owners and repo names allow ASCII
 * alphanumerics plus `-`, `_`, and `.` (owners are `-`-only in practice, but we
 * accept the repo character set for both segments to stay permissive without
 * allowing path traversal, spaces, or extra `/` segments). Exactly two segments.
 */
const OWNER_REPO_RE = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,99})\/[A-Za-z0-9._-]{1,100}$/;

export function isValidOwnerRepo(ownerRepo: string): boolean {
  if (typeof ownerRepo !== 'string') {
    return false;
  }

  const trimmed = ownerRepo.trim();

  if (!OWNER_REPO_RE.test(trimmed)) {
    return false;
  }

  // Reject traversal / hidden segments that the loose character class allows.
  const [owner, repo] = trimmed.split('/');

  if (owner === '.' || owner === '..' || repo === '.' || repo === '..') {
    return false;
  }

  return true;
}

/**
 * Normalize a raw `owner/repo` (trim; drop a trailing `.git`) and return it only
 * if valid, else undefined. Use before persisting or building a fetch URL.
 */
export function normalizeOwnerRepo(ownerRepo: string): string | undefined {
  if (typeof ownerRepo !== 'string') {
    return undefined;
  }

  const trimmed = ownerRepo.trim().replace(/\.git$/i, '');

  return isValidOwnerRepo(trimmed) ? trimmed : undefined;
}

const CATALOG_BY_REPO: Readonly<Record<SkillRepoLocale, ReadonlyMap<string, SkillRepoCatalogEntry>>> = Object.freeze({
  en: new Map(SKILL_REPO_CATALOG_BY_LOCALE.en.map((entry) => [entry.ownerRepo.toLowerCase(), entry])),
  fr: new Map(SKILL_REPO_CATALOG_BY_LOCALE.fr.map((entry) => [entry.ownerRepo.toLowerCase(), entry])),
});

/** Look up a curated catalog entry by `owner/repo` (case-insensitive). */
export function findRepoEntry(ownerRepo: string, locale?: string | null): SkillRepoCatalogEntry | undefined {
  return CATALOG_BY_REPO[normalizeSkillRepoLocale(locale)].get(ownerRepo.trim().toLowerCase());
}
