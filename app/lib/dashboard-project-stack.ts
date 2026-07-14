/*
 * Pure helper for the dashboard "Recent projects" cards.
 *
 * Extracted so project cards never expose raw repository URLs or source-type
 * identifiers as customer copy.
 */

import { humanizeTechnicalIdentifier } from './user-facing-labels';

type StackSource = {
  gitRepositoryUrl?: string | null;
  sourceType?: string | null;
};

/**
 * The source label shown on a project card. Repository URLs are reduced to the
 * provider name, known source types use product vocabulary, and unknown values
 * are humanized instead of being rendered as implementation identifiers.
 */
export function projectStackLabel(project: StackSource): string {
  const gitUrl = project.gitRepositoryUrl?.trim();

  if (gitUrl) {
    try {
      const hostname = new URL(gitUrl).hostname.toLowerCase();

      if (hostname === 'github.com' || hostname.endsWith('.github.com')) {
        return 'GitHub repository';
      }

      if (hostname === 'gitlab.com' || hostname.endsWith('.gitlab.com')) {
        return 'GitLab repository';
      }

      if (hostname === 'bitbucket.org' || hostname.endsWith('.bitbucket.org')) {
        return 'Bitbucket repository';
      }
    } catch {
      // A malformed legacy URL is still a Git source, but is never echoed.
    }

    return 'Git repository';
  }

  const sourceType = project.sourceType?.trim().toLowerCase();

  if (sourceType) {
    const knownSourceLabels: Record<string, string> = {
      blank: 'E-Code project',
      prompt: 'E-Code project',
      agent: 'E-Code project',
      template: 'Template',
      github: 'GitHub repository',
      gitlab: 'GitLab repository',
      bitbucket: 'Bitbucket repository',
      git: 'Git repository',
      import: 'Imported project',
    };

    return knownSourceLabels[sourceType] ?? humanizeTechnicalIdentifier(sourceType, 'E-Code project');
  }

  return 'E-Code project';
}
