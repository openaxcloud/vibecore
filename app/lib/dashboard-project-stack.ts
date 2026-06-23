/*
 * Pure helper for the dashboard "Recent projects" cards.
 *
 * Extracted so the stack-label fallback is unit-testable and so the user-facing
 * brand string stays correct: a fresh blank/template project has neither a git
 * repository URL nor a sourceType, and must still read as an "E-Code project"
 * rather than leaking the upstream codename.
 */

type StackSource = {
  gitRepositoryUrl?: string | null;
  sourceType?: string | null;
};

/**
 * The tech-stack label shown on a project card. Prefers the git repository URL,
 * then the project's sourceType, and finally falls back to the E-Code brand for
 * projects that carry neither (e.g. blank or template projects).
 */
export function projectStackLabel(project: StackSource): string {
  const gitUrl = project.gitRepositoryUrl?.trim();

  if (gitUrl) {
    return gitUrl;
  }

  const sourceType = project.sourceType?.trim();

  if (sourceType) {
    return sourceType;
  }

  return 'E-Code project';
}
