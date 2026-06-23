import type { ProjectCard } from '~/components/dashboard/SaaSLayout';
import { projectIdePath } from '~/utils/project-url';

export type ApiProject = {
  id: string;
  name: string;
  slug?: string;
  updatedAt?: string;
  sourceType?: string;
  gitRepositoryUrl?: string;
};

/**
 * Maps raw API projects to the {@link ProjectCard} shape used by the dashboard
 * and command-palette surfaces, sorted most-recently-updated first and capped
 * to `limit` cards. Pure so it can be unit-tested without an API round-trip.
 */
export function toProjectCards(
  projects: ApiProject[],
  organization?: { slug?: string } | null,
  limit = 6,
): ProjectCard[] {
  return [...projects]
    .sort((a, b) => {
      const at = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const bt = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;

      return bt - at;
    })
    .slice(0, limit)
    .map((project) => ({
      id: project.id,
      name: project.name,
      status: 'Ready',
      updated: project.updatedAt ? new Date(project.updatedAt).toLocaleString() : 'recently',
      stack: project.gitRepositoryUrl ?? project.sourceType ?? 'E-Code project',
      sourceType: project.sourceType,
      previewImageUrl: `/api/projects/${project.id}/homepage-preview`,
      ideUrl: projectIdePath({ id: project.id, slug: project.slug, organizationSlug: organization?.slug }),
    }));
}
