import { userAreaEn, userAreaFr } from './i18n/catalogs/user-area';
import type { SupportedLanguage } from './i18n/language';

export type ProjectLifecycle = 'deployed' | 'draft' | 'archived';

type ProjectLifecycleSource = {
  deletedAt?: string | null;
  deploymentCount?: number | null;
};

export function projectLifecycle({ deletedAt, deploymentCount }: ProjectLifecycleSource): ProjectLifecycle {
  if (deletedAt) {
    return 'archived';
  }

  return (deploymentCount ?? 0) > 0 ? 'deployed' : 'draft';
}

export function projectLifecycleDisplayLabel(lifecycle: ProjectLifecycle, language: SupportedLanguage = 'en'): string {
  const copy = language === 'fr' ? userAreaFr : userAreaEn;

  return {
    deployed: copy['userArea.project.statusDeployed'],
    draft: copy['userArea.project.statusDraft'],
    archived: copy['userArea.project.statusArchived'],
  }[lifecycle];
}

export function projectDeploymentSummary(deploymentCount?: number | null, language: SupportedLanguage = 'en'): string {
  const copy = language === 'fr' ? userAreaFr : userAreaEn;
  const count = Number.isFinite(deploymentCount) ? Math.max(0, Math.floor(deploymentCount ?? 0)) : 0;

  if (count === 0) {
    return copy['userArea.project.notDeployed'];
  }

  const template =
    copy[count === 1 ? 'userArea.project.deploymentCount_one' : 'userArea.project.deploymentCount_other'];

  return template.replace('{count}', new Intl.NumberFormat(language === 'fr' ? 'fr-FR' : 'en-US').format(count));
}
