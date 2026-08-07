import { userAreaEn, type UserAreaTranslationKey } from './i18n/catalogs/user-area';

export type UserAreaSurface = {
  title: string;
  description: string;
  backTo: string;
  backLabel: string;
};

export type UserAreaTranslate = (
  key: UserAreaTranslationKey,
  values?: Readonly<Record<string, string | number>>,
) => string;

export const defaultUserAreaTranslate: UserAreaTranslate = (key, values) => {
  const message = userAreaEn[key];

  return Object.entries(values ?? {}).reduce<string>(
    (result, [name, value]) => result.replaceAll(`{${name}}`, String(value)),
    String(message),
  );
};

type SurfaceDefinition = Readonly<{
  titleKey: UserAreaTranslationKey;
  descriptionKey: UserAreaTranslationKey;
  backTo: string;
  backLabelKey: UserAreaTranslationKey;
}>;

const EXACT_SURFACES: Record<string, SurfaceDefinition> = {
  '/dashboard': {
    titleKey: 'userArea.surface.dashboard.title',
    descriptionKey: 'userArea.surface.dashboard.description',
    backTo: '/projects',
    backLabelKey: 'userArea.routeError.viewProjects',
  },
  '/projects': {
    titleKey: 'userArea.surface.projects.title',
    descriptionKey: 'userArea.surface.projects.description',
    backTo: '/dashboard',
    backLabelKey: 'userArea.routeError.backDashboard',
  },
  '/recent-projects': {
    titleKey: 'userArea.surface.recentProjects.title',
    descriptionKey: 'userArea.surface.recentProjects.description',
    backTo: '/projects',
    backLabelKey: 'userArea.routeError.viewAllProjects',
  },
  '/billing': {
    titleKey: 'userArea.surface.billing.title',
    descriptionKey: 'userArea.surface.billing.description',
    backTo: '/dashboard',
    backLabelKey: 'userArea.routeError.backDashboard',
  },
  '/usage': {
    titleKey: 'userArea.surface.usage.title',
    descriptionKey: 'userArea.surface.usage.description',
    backTo: '/dashboard',
    backLabelKey: 'userArea.routeError.backDashboard',
  },
  '/notifications': {
    titleKey: 'userArea.surface.notifications.title',
    descriptionKey: 'userArea.surface.notifications.description',
    backTo: '/dashboard',
    backLabelKey: 'userArea.routeError.backDashboard',
  },
  '/api-keys': {
    titleKey: 'userArea.surface.apiKeys.title',
    descriptionKey: 'userArea.surface.apiKeys.description',
    backTo: '/security-settings',
    backLabelKey: 'userArea.routeError.securitySettings',
  },
  '/support': {
    titleKey: 'userArea.surface.support.title',
    descriptionKey: 'userArea.surface.support.description',
    backTo: '/dashboard',
    backLabelKey: 'userArea.routeError.backDashboard',
  },
  '/invoices': {
    titleKey: 'userArea.surface.invoices.title',
    descriptionKey: 'userArea.surface.invoices.description',
    backTo: '/billing',
    backLabelKey: 'userArea.routeError.billingOverview',
  },
  '/organization-members': {
    titleKey: 'userArea.surface.organizationMembers.title',
    descriptionKey: 'userArea.surface.organizationMembers.description',
    backTo: '/dashboard',
    backLabelKey: 'userArea.routeError.backDashboard',
  },
  '/organization-invitations': {
    titleKey: 'userArea.surface.organizationInvitations.title',
    descriptionKey: 'userArea.surface.organizationInvitations.description',
    backTo: '/organization-members',
    backLabelKey: 'userArea.routeError.organizationMembers',
  },
  '/organization-security': {
    titleKey: 'userArea.surface.organizationSecurity.title',
    descriptionKey: 'userArea.surface.organizationSecurity.description',
    backTo: '/security-settings',
    backLabelKey: 'userArea.routeError.securitySettings',
  },
  '/security-settings': {
    titleKey: 'userArea.surface.securitySettings.title',
    descriptionKey: 'userArea.surface.securitySettings.description',
    backTo: '/account-settings',
    backLabelKey: 'userArea.routeError.accountSettings',
  },
  '/account-settings': {
    titleKey: 'userArea.surface.account.title',
    descriptionKey: 'userArea.surface.account.description',
    backTo: '/dashboard',
    backLabelKey: 'userArea.routeError.backDashboard',
  },
  '/account-settings/connected': {
    titleKey: 'userArea.surface.account.title',
    descriptionKey: 'userArea.surface.connectedAccounts.description',
    backTo: '/account-settings',
    backLabelKey: 'userArea.routeError.accountSettings',
  },
  '/account-settings/data': {
    titleKey: 'userArea.surface.account.title',
    descriptionKey: 'userArea.surface.dataPrivacy.description',
    backTo: '/account-settings',
    backLabelKey: 'userArea.routeError.accountSettings',
  },
};

const PROJECT_SURFACES: Record<string, Pick<SurfaceDefinition, 'titleKey' | 'descriptionKey'>> = {
  '': {
    titleKey: 'userArea.surface.projectOverview.title',
    descriptionKey: 'userArea.surface.projectOverview.description',
  },
  activity: {
    titleKey: 'userArea.surface.projectActivity.title',
    descriptionKey: 'userArea.surface.projectActivity.description',
  },
  collaborators: {
    titleKey: 'userArea.surface.projectCollaborators.title',
    descriptionKey: 'userArea.surface.projectCollaborators.description',
  },
  database: {
    titleKey: 'userArea.surface.projectDatabase.title',
    descriptionKey: 'userArea.surface.projectDatabase.description',
  },
  deployments: {
    titleKey: 'userArea.surface.projectDeployments.title',
    descriptionKey: 'userArea.surface.projectDeployments.description',
  },
  domains: {
    titleKey: 'userArea.surface.projectDomains.title',
    descriptionKey: 'userArea.surface.projectDomains.description',
  },
  env: {
    titleKey: 'userArea.surface.projectEnv.title',
    descriptionKey: 'userArea.surface.projectEnv.description',
  },
  logs: {
    titleKey: 'userArea.surface.projectLogs.title',
    descriptionKey: 'userArea.surface.projectLogs.description',
  },
  secrets: {
    titleKey: 'userArea.surface.projectSecrets.title',
    descriptionKey: 'userArea.surface.projectSecrets.description',
  },
  settings: {
    titleKey: 'userArea.surface.projectSettings.title',
    descriptionKey: 'userArea.surface.projectSettings.description',
  },
  snapshots: {
    titleKey: 'userArea.surface.projectSnapshots.title',
    descriptionKey: 'userArea.surface.projectSnapshots.description',
  },
};

function localizeSurface(definition: SurfaceDefinition, translate: UserAreaTranslate): UserAreaSurface {
  return {
    title: translate(definition.titleKey),
    description: translate(definition.descriptionKey),
    backTo: definition.backTo,
    backLabel: translate(definition.backLabelKey),
  };
}

export function resolveUserAreaSurface(
  pathname: string,
  translate: UserAreaTranslate = defaultUserAreaTranslate,
): UserAreaSurface {
  const normalizedPath = pathname.length > 1 ? pathname.replace(/\/+$/u, '') : pathname;
  const exactSurface = EXACT_SURFACES[normalizedPath];

  if (exactSurface) {
    return localizeSurface(exactSurface, translate);
  }

  const projectMatch = normalizedPath.match(/^\/projects\/[^/]+(?:\/([^/]+))?$/u);

  if (projectMatch) {
    const projectSurface = PROJECT_SURFACES[projectMatch[1] ?? ''] ?? PROJECT_SURFACES[''];

    return localizeSurface(
      {
        ...projectSurface,
        backTo: '/projects',
        backLabelKey: 'userArea.routeError.viewProjects',
      },
      translate,
    );
  }

  return localizeSurface(
    {
      titleKey: 'userArea.surface.workspace.title',
      descriptionKey: 'userArea.surface.workspace.description',
      backTo: '/dashboard',
      backLabelKey: 'userArea.routeError.backDashboard',
    },
    translate,
  );
}
