/*
 * Slug generation, shared by the two call sites that MUST agree.
 *
 * `slugify` builds the slug stored on a project; `slugifyRouteSegment`
 * normalizes an incoming url segment before lookup. If only one of them
 * transliterates, a freshly generated slug stops resolving — so they live here,
 * on one implementation, instead of being duplicated in prisma-store.ts and
 * app.ts and drifting apart.
 *
 * Diacritics are stripped BEFORE the `a-z0-9` filter. Without that step every
 * accented letter collapsed to a dash, and since project names are whatever the
 * customer typed — accented on the first word, in French — the address bar
 * carried it for the life of the project:
 *
 *   "Créez une page de tarification"  ->  cr-ez-une-page-de-tarification
 *
 * Slugs already stored without accents are unaffected: normalizing them is a
 * no-op, so existing project urls keep resolving.
 */

/** Unicode combining marks left behind by NFD decomposition. */
const COMBINING_MARKS = /[\u0300-\u036f]/g;

function baseSlug(value: string) {
  return value
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Slug persisted on a project / organization, derived from its display name. */
export function slugify(value: string) {
  return baseSlug(value);
}

/**
 * Normalizes an incoming url segment before lookup. Drops a leading `@` first —
 * account segments are addressed as `/@org-slug/project-slug`.
 */
export function slugifyRouteSegment(value: string) {
  return baseSlug(value.replace(/^@+/, ''));
}
