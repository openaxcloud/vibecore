const DEFAULT_TAGS_LIMIT = 30;

/**
 * Clamp a raw `?limit=` query value into a safe, non-negative integer for
 * `getEcodeTemplateTags(limit)` which performs `.slice(0, limit)`.
 *
 * A negative limit (e.g. `?limit=-2`) would otherwise slip through a bare
 * `Number.isFinite` check and become `.slice(0, -2)`, dropping real tags from
 * the end of the list instead of returning a bounded result. NaN / Infinity /
 * negatives all fall back to the default; valid values are floored to an int.
 */
export function clampTemplateTagsLimit(raw: number, fallback = DEFAULT_TAGS_LIMIT): number {
  return Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : fallback;
}
