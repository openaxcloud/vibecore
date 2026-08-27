/*
 * Pure helper for the dashboard "Recent projects" cards.
 *
 * Extracted so project cards never expose raw repository URLs or source-type
 * identifiers as customer copy.
 */

import { userAreaEn, userAreaFr } from './i18n/catalogs/user-area';
import type { SupportedLanguage } from './i18n/language';
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
export function projectStackLabel(project: StackSource, language: SupportedLanguage = 'en'): string {
  const copy = language === 'fr' ? userAreaFr : userAreaEn;
  const gitUrl = project.gitRepositoryUrl?.trim();

  if (gitUrl) {
    try {
      const hostname = new URL(gitUrl).hostname.toLowerCase();

      if (hostname === 'github.com' || hostname.endsWith('.github.com')) {
        return copy['userArea.project.stackGithub'];
      }

      if (hostname === 'gitlab.com' || hostname.endsWith('.gitlab.com')) {
        return copy['userArea.project.stackGitlab'];
      }

      if (hostname === 'bitbucket.org' || hostname.endsWith('.bitbucket.org')) {
        return copy['userArea.project.stackBitbucket'];
      }
    } catch {
      // A malformed legacy URL is still a Git source, but is never echoed.
    }

    return copy['userArea.project.stackGit'];
  }

  const sourceType = project.sourceType?.trim().toLowerCase();

  if (sourceType) {
    const knownSourceLabels: Record<string, string> = {
      blank: copy['userArea.project.stackEcode'],
      prompt: copy['userArea.project.stackEcode'],
      agent: copy['userArea.project.stackEcode'],
      template: copy['userArea.project.stackTemplate'],
      github: copy['userArea.project.stackGithub'],
      gitlab: copy['userArea.project.stackGitlab'],
      bitbucket: copy['userArea.project.stackBitbucket'],
      git: copy['userArea.project.stackGit'],
      import: copy['userArea.project.stackImported'],
    };

    return (
      knownSourceLabels[sourceType] ??
      (language === 'fr'
        ? copy['userArea.project.stackEcode']
        : humanizeTechnicalIdentifier(sourceType, copy['userArea.project.stackEcode']))
    );
  }

  return copy['userArea.project.stackEcode'];
}
