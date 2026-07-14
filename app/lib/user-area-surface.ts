export type UserAreaSurface = {
  title: string;
  description: string;
  backTo: string;
  backLabel: string;
};

const EXACT_SURFACES: Record<string, UserAreaSurface> = {
  '/dashboard': {
    title: 'Dashboard',
    description: 'Your workspace overview is temporarily unavailable.',
    backTo: '/projects',
    backLabel: 'View projects',
  },
  '/projects': {
    title: 'Projects',
    description: 'Your project library is temporarily unavailable.',
    backTo: '/dashboard',
    backLabel: 'Back to dashboard',
  },
  '/recent-projects': {
    title: 'Recent projects',
    description: 'Your recent project activity is temporarily unavailable.',
    backTo: '/projects',
    backLabel: 'View all projects',
  },
  '/billing': {
    title: 'Billing overview',
    description: 'Subscription and billing details are temporarily unavailable.',
    backTo: '/dashboard',
    backLabel: 'Back to dashboard',
  },
  '/usage': {
    title: 'Usage overview',
    description: 'Usage and quota details are temporarily unavailable.',
    backTo: '/dashboard',
    backLabel: 'Back to dashboard',
  },
  '/notifications': {
    title: 'Notifications',
    description: 'Your inbox and notification preferences are temporarily unavailable.',
    backTo: '/dashboard',
    backLabel: 'Back to dashboard',
  },
  '/api-keys': {
    title: 'API keys',
    description: 'API key management is temporarily unavailable.',
    backTo: '/security-settings',
    backLabel: 'Security settings',
  },
  '/support': {
    title: 'Support',
    description: 'Support requests are temporarily unavailable.',
    backTo: '/dashboard',
    backLabel: 'Back to dashboard',
  },
  '/invoices': {
    title: 'Invoices',
    description: 'Invoice history is temporarily unavailable.',
    backTo: '/billing',
    backLabel: 'Billing overview',
  },
  '/organization-members': {
    title: 'Organization members',
    description: 'Member management is temporarily unavailable.',
    backTo: '/dashboard',
    backLabel: 'Back to dashboard',
  },
  '/organization-invitations': {
    title: 'Organization invitations',
    description: 'Organization invitations are temporarily unavailable.',
    backTo: '/organization-members',
    backLabel: 'Organization members',
  },
  '/organization-security': {
    title: 'Organization security',
    description: 'Organization security controls are temporarily unavailable.',
    backTo: '/security-settings',
    backLabel: 'Security settings',
  },
  '/security-settings': {
    title: 'Security settings',
    description: 'Account security controls are temporarily unavailable.',
    backTo: '/account-settings',
    backLabel: 'Account settings',
  },
  '/account-settings': {
    title: 'Account',
    description: 'Account settings are temporarily unavailable.',
    backTo: '/dashboard',
    backLabel: 'Back to dashboard',
  },
  '/account-settings/connected': {
    title: 'Account',
    description: 'Connected accounts are temporarily unavailable.',
    backTo: '/account-settings',
    backLabel: 'Account settings',
  },
  '/account-settings/data': {
    title: 'Account',
    description: 'Data and privacy controls are temporarily unavailable.',
    backTo: '/account-settings',
    backLabel: 'Account settings',
  },
};

const PROJECT_SURFACES: Record<string, Pick<UserAreaSurface, 'title' | 'description'>> = {
  '': { title: 'Project overview', description: 'Project details are temporarily unavailable.' },
  activity: { title: 'Project activity', description: 'Project activity is temporarily unavailable.' },
  collaborators: { title: 'Project collaborators', description: 'Project collaborators are temporarily unavailable.' },
  database: { title: 'Project database', description: 'Project database details are temporarily unavailable.' },
  deployments: { title: 'Project deployments', description: 'Project deployments are temporarily unavailable.' },
  domains: { title: 'Project domains', description: 'Project domains are temporarily unavailable.' },
  env: { title: 'Environment variables', description: 'Project environment variables are temporarily unavailable.' },
  logs: { title: 'Project logs', description: 'Project logs are temporarily unavailable.' },
  secrets: { title: 'Project secrets', description: 'Project secrets are temporarily unavailable.' },
  settings: { title: 'Project settings', description: 'Project settings are temporarily unavailable.' },
  snapshots: { title: 'Project snapshots', description: 'Project snapshots are temporarily unavailable.' },
};

export function resolveUserAreaSurface(pathname: string): UserAreaSurface {
  const normalizedPath = pathname.length > 1 ? pathname.replace(/\/+$/u, '') : pathname;
  const exactSurface = EXACT_SURFACES[normalizedPath];

  if (exactSurface) {
    return exactSurface;
  }

  const projectMatch = normalizedPath.match(/^\/projects\/[^/]+(?:\/([^/]+))?$/u);

  if (projectMatch) {
    const projectSurface = PROJECT_SURFACES[projectMatch[1] ?? ''] ?? PROJECT_SURFACES[''];

    return {
      ...projectSurface,
      backTo: '/projects',
      backLabel: 'View projects',
    };
  }

  return {
    title: 'Workspace',
    description: 'This workspace page is temporarily unavailable.',
    backTo: '/dashboard',
    backLabel: 'Back to dashboard',
  };
}
