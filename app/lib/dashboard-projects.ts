import type { ProjectCard } from '~/components/dashboard/SaaSLayout';
import { projectStackLabel } from '~/lib/dashboard-project-stack';
import { userAreaEn, userAreaFr } from '~/lib/i18n/catalogs/user-area';
import type { SupportedLanguage } from '~/lib/i18n/language';
import { formatUserAreaDateTime } from '~/lib/i18n/user-area-locale';
import { projectLifecycle, projectLifecycleDisplayLabel } from '~/lib/project-card-presentation';
import { projectIdePath } from '~/utils/project-url';

export type ApiProject = {
  id: string;
  name: string;
  slug?: string;
  updatedAt?: string;
  sourceType?: string;
  gitRepositoryUrl?: string;
  deletedAt?: string | null;
  deploymentCount?: number;
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
  language?: SupportedLanguage,
): ProjectCard[] {
  const copy = language === 'fr' ? userAreaFr : userAreaEn;

  return [...projects]
    .sort((a, b) => {
      const at = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const bt = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;

      return bt - at;
    })
    .slice(0, limit)
    .map((project) => {
      const lifecycle = projectLifecycle(project);

      return {
        id: project.id,
        name: project.name,
        status: projectLifecycleDisplayLabel(lifecycle, language),
        lifecycle,
        deploymentCount: project.deploymentCount,
        updated: project.updatedAt
          ? (formatUserAreaDateTime(project.updatedAt, undefined, language) ?? copy['userArea.project.recently'])
          : copy['userArea.project.recently'],
        updatedAtIso: project.updatedAt,
        stack: projectStackLabel(project, language),
        sourceType: project.sourceType,

        /*
         * Real captured preview screenshot; the card falls back to a neutral
         * placeholder (not the old synthetic mock) until the first capture exists.
         */
        previewImageUrl: `/api/projects/${project.id}/thumbnail`,
        ideUrl: projectIdePath({ id: project.id, slug: project.slug, organizationSlug: organization?.slug }),
      };
    });
}
