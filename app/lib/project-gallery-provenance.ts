export type ProjectGalleryProvenance = {
  sourceGalleryAppId: string;
  sourceGalleryAppVersionId: string;
  sourceGalleryAppSlug: string;
  sourceGalleryAppName: string;
  sourceProjectId?: string;
};

type ProjectLike = { sourceType?: string };
type ActivityLike = { action?: string; metadata?: unknown };

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function nonEmptyString(value: unknown, maxLength = 200): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= maxLength ? normalized : undefined;
}

/**
 * Reads the durable provenance written when a Gallery remix reaches READY.
 * There is deliberately no ID/slug compatibility fallback: a provenance link
 * is rendered only when the complete, current contract is available.
 */
export function projectGalleryProvenance(
  project: ProjectLike,
  activities: ActivityLike[],
): ProjectGalleryProvenance | undefined {
  if (project.sourceType !== 'gallery-remix') return undefined;

  for (const activity of activities) {
    if (activity.action !== 'project.remix.create') continue;
    const metadata = record(activity.metadata);
    if (!metadata) continue;

    const sourceGalleryAppId = nonEmptyString(metadata.sourceGalleryAppId);
    const sourceGalleryAppVersionId = nonEmptyString(metadata.sourceGalleryAppVersionId);
    const sourceGalleryAppSlug = nonEmptyString(metadata.sourceGalleryAppSlug);
    const sourceGalleryAppName = nonEmptyString(metadata.sourceGalleryAppName);

    if (!sourceGalleryAppId || !sourceGalleryAppVersionId || !sourceGalleryAppSlug || !sourceGalleryAppName) {
      continue;
    }

    const sourceProjectId = nonEmptyString(metadata.sourceProjectId);

    return {
      sourceGalleryAppId,
      sourceGalleryAppVersionId,
      sourceGalleryAppSlug,
      sourceGalleryAppName,
      ...(sourceProjectId ? { sourceProjectId } : {}),
    };
  }

  return undefined;
}

export function projectGallerySourcePath(provenance: ProjectGalleryProvenance): string {
  return `/gallery/${encodeURIComponent(provenance.sourceGalleryAppSlug)}`;
}
