export interface ProjectUrlRef {
  id: string;
  slug?: string | null;
  organizationSlug?: string | null;
  organization?: { slug?: string | null } | null;
}

function cleanSegment(value?: string | null) {
  const trimmed = value?.trim().replace(/^@+/, '');

  if (!trimmed || trimmed.includes('/')) {
    return undefined;
  }

  return trimmed;
}

export function slugifyProjectUrlSegment(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/^@+/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function canonicalProjectPath(project: ProjectUrlRef) {
  const organizationSlug = cleanSegment(project.organizationSlug ?? project.organization?.slug);
  const projectSlug = cleanSegment(project.slug);

  if (organizationSlug && projectSlug) {
    return `/@${encodeURIComponent(organizationSlug)}/${encodeURIComponent(projectSlug)}`;
  }

  return `/projects/${encodeURIComponent(project.id)}`;
}

export function legacyProjectIdePath(projectId: string) {
  return `/projects/${encodeURIComponent(projectId)}/ide`;
}

export function projectIdePath(
  project: ProjectUrlRef,
  options: { panel?: string; searchParams?: URLSearchParams } = {},
) {
  const hasCanonicalSlugs =
    cleanSegment(project.organizationSlug ?? project.organization?.slug) && cleanSegment(project.slug);

  const basePath = hasCanonicalSlugs ? canonicalProjectPath(project) : legacyProjectIdePath(project.id);

  return withProjectSearch(basePath, options);
}

export function projectPanelPath(project: ProjectUrlRef, panel: string) {
  return projectIdePath(project, { panel });
}

export function withProjectSearch(path: string, options: { panel?: string; searchParams?: URLSearchParams } = {}) {
  const params = new URLSearchParams(options.searchParams);

  if (options.panel && options.panel !== 'editor') {
    params.set('panel', options.panel);
  } else if (options.panel === 'editor') {
    params.delete('panel');
  }

  const search = params.toString();

  return search ? `${path}?${search}` : path;
}

export function canonicalAccountSlugFromParam(accountParam?: string) {
  if (!accountParam?.startsWith('@')) {
    return undefined;
  }

  return slugifyProjectUrlSegment(accountParam);
}
