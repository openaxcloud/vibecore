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

/**
 * Curated public skill repositories. Slugs are stable install keys — do not
 * rename an `ownerRepo` once shipped (installs reference it). Roughly a dozen
 * realistic, well-known public repos across common developer skill categories.
 */
export const SKILL_REPO_CATALOG: readonly SkillRepoCatalogEntry[] = [
  {
    ownerRepo: 'anthropics/skills',
    name: 'Anthropic Skills',
    description: 'Reference collection of agent skills — document editing, data work, and reusable workflows.',
    category: 'productivity',
    homepageUrl: 'https://github.com/anthropics/skills',
  },
  {
    ownerRepo: 'openai/openai-cookbook',
    name: 'OpenAI Cookbook',
    description: 'Recipes and patterns for building with large language models, adaptable as agent guidance.',
    category: 'knowledge',
    homepageUrl: 'https://github.com/openai/openai-cookbook',
  },
  {
    ownerRepo: 'github/gitignore',
    name: 'gitignore Templates',
    description: 'Curated .gitignore templates the agent can apply per language and framework.',
    category: 'devops',
    homepageUrl: 'https://github.com/github/gitignore',
  },
  {
    ownerRepo: 'goldbergyoni/nodebestpractices',
    name: 'Node.js Best Practices',
    description: 'Comprehensive Node.js production best-practice checklist for reviews and refactors.',
    category: 'quality',
    homepageUrl: 'https://github.com/goldbergyoni/nodebestpractices',
  },
  {
    ownerRepo: 'airbnb/javascript',
    name: 'Airbnb JavaScript Style Guide',
    description: 'Opinionated JavaScript/React style rules for consistent, review-ready code.',
    category: 'quality',
    homepageUrl: 'https://github.com/airbnb/javascript',
  },
  {
    ownerRepo: 'kentcdodds/testing-library-docs',
    name: 'Testing Library Guidance',
    description: 'User-centric testing patterns for writing resilient UI and integration tests.',
    category: 'testing',
    homepageUrl: 'https://github.com/testing-library/testing-library-docs',
  },
  {
    ownerRepo: 'OWASP/CheatSheetSeries',
    name: 'OWASP Cheat Sheets',
    description: 'Concise application-security guidance the agent can apply during security reviews.',
    category: 'security',
    homepageUrl: 'https://github.com/OWASP/CheatSheetSeries',
  },
  {
    ownerRepo: 'sindresorhus/awesome',
    name: 'Awesome Lists',
    description: 'Curated topic references the agent can draw on when researching a technology.',
    category: 'knowledge',
    homepageUrl: 'https://github.com/sindresorhus/awesome',
  },
  {
    ownerRepo: 'microsoft/TypeScript-Node-Starter',
    name: 'TypeScript Node Starter',
    description: 'Conventions for structuring a production TypeScript + Node backend project.',
    category: 'productivity',
    homepageUrl: 'https://github.com/microsoft/TypeScript-Node-Starter',
  },
  {
    ownerRepo: 'a11yproject/a11yproject.com',
    name: 'The A11Y Project',
    description: 'Practical accessibility guidance for auditing UI against WCAG expectations.',
    category: 'frontend',
    homepageUrl: 'https://github.com/a11yproject/a11yproject.com',
  },
  {
    ownerRepo: 'donnemartin/system-design-primer',
    name: 'System Design Primer',
    description: 'System-design fundamentals for architecture discussions and design reviews.',
    category: 'architecture',
    homepageUrl: 'https://github.com/donnemartin/system-design-primer',
  },
  {
    ownerRepo: 'jlevy/the-art-of-command-line',
    name: 'The Art of Command Line',
    description: 'Shell and command-line proficiency notes for scripting and automation tasks.',
    category: 'devops',
    homepageUrl: 'https://github.com/jlevy/the-art-of-command-line',
  },
] as const;

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

const CATALOG_BY_REPO = new Map(SKILL_REPO_CATALOG.map((entry) => [entry.ownerRepo.toLowerCase(), entry]));

/** Look up a curated catalog entry by `owner/repo` (case-insensitive). */
export function findRepoEntry(ownerRepo: string): SkillRepoCatalogEntry | undefined {
  return CATALOG_BY_REPO.get(ownerRepo.trim().toLowerCase());
}
