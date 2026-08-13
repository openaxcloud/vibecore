/**
 * Mobile / tablet IDE tab configuration (e-code "Replit-style" bottom navigation).
 *
 * This is pure data extracted from `BaseChat.tsx` so it can be unit-tested and kept
 * in sync. Two mobile surfaces consume these definitions:
 *   - the **Tools sheet**   → `ECODE_MOBILE_TOOLS`
 *   - the **Panels / More menu** → `ECODE_MOBILE_MORE_ITEMS`
 *
 * Both surfaces dispatch the selected id through `MOBILE_TOOL_TO_MANAGEMENT_PANEL`
 * to resolve which management panel (Skills, Ports, Object Storage, …) to open.
 * A tool id that names a management panel but is missing from this map silently
 * no-ops on mobile — that was the Skills/Ports "tab won't open" bug.
 */

export const SHELL_TERMINAL_LABEL = 'Shell (Terminal)';

export type MobileToolItem = {
  id: string;
  section: 'search' | 'tools';
  titleKey: string;
  descriptionKey: string;
  icon: string;
  tone?: string;
};

export const ECODE_MOBILE_TOOLS: readonly MobileToolItem[] = [
  {
    id: 'search',
    section: 'search',
    titleKey: 'mobileIdeTabs.search.title',
    descriptionKey: 'mobileIdeTabs.search.description',
    icon: 'i-ph:magnifying-glass',
  },
  {
    id: 'files',
    section: 'search',
    titleKey: 'mobileIdeTabs.files.title',
    descriptionKey: 'mobileIdeTabs.files.description',
    icon: 'i-ph:folder-open',
  },
  {
    id: 'editor',
    section: 'search',
    titleKey: 'mobileIdeTabs.editor.title',
    descriptionKey: 'mobileIdeTabs.editor.description',
    icon: 'i-ph:code',
  },
  {
    id: 'overview',
    section: 'tools',
    titleKey: 'mobileIdeTabs.overview.title',
    descriptionKey: 'mobileIdeTabs.overview.description',
    icon: 'i-ph:gauge',
    tone: 'info',
  },
  {
    id: 'agent',
    section: 'tools',
    titleKey: 'mobileIdeTabs.agent.title',
    descriptionKey: 'mobileIdeTabs.agent.description',
    icon: 'agent',
    tone: 'agent',
  },
  {
    id: 'deployments',
    section: 'tools',
    titleKey: 'mobileIdeTabs.deployments.title',
    descriptionKey: 'mobileIdeTabs.deployments.description',
    icon: 'i-ph:rocket-launch',
    tone: 'success',
  },
  {
    id: 'object-storage',
    section: 'tools',
    titleKey: 'mobileIdeTabs.objectStorage.title',
    descriptionKey: 'mobileIdeTabs.objectStorage.description',
    icon: 'i-ph:hard-drives',
  },
  {
    id: 'settings',
    section: 'tools',
    titleKey: 'mobileIdeTabs.settings.title',
    descriptionKey: 'mobileIdeTabs.settings.description',
    icon: 'i-ph:gear',
    tone: 'info',
  },
  {
    id: 'terminal',
    section: 'tools',
    titleKey: SHELL_TERMINAL_LABEL,
    descriptionKey: 'mobileIdeTabs.terminal.description',
    icon: 'i-ph:terminal-window',
  },
  {
    id: 'database',
    section: 'tools',
    titleKey: 'mobileIdeTabs.database.title',
    descriptionKey: 'mobileIdeTabs.database.description',
    icon: 'i-ph:database',
    tone: 'info',
  },
  {
    id: 'locks',
    section: 'tools',
    titleKey: 'mobileIdeTabs.locks.title',
    descriptionKey: 'mobileIdeTabs.locks.description',
    icon: 'i-ph:lock',
    tone: 'warning',
  },
  {
    id: 'debugger',
    section: 'tools',
    titleKey: 'mobileIdeTabs.debugger.title',
    descriptionKey: 'mobileIdeTabs.debugger.description',
    icon: 'i-ph:bug',
  },
  {
    id: 'git',
    section: 'tools',
    titleKey: 'mobileIdeTabs.git.title',
    descriptionKey: 'mobileIdeTabs.git.description',
    icon: 'i-ph:git-branch',
    tone: 'warning',
  },
  {
    id: 'packages',
    section: 'tools',
    titleKey: 'mobileIdeTabs.packages.title',
    descriptionKey: 'mobileIdeTabs.packages.description',
    icon: 'i-ph:package',
  },
  {
    id: 'skills',
    section: 'tools',
    titleKey: 'mobileIdeTabs.skills.title',
    descriptionKey: 'mobileIdeTabs.skills.description',
    icon: 'i-ph:sparkle',
  },
  {
    id: 'studio',
    section: 'tools',
    titleKey: 'mobileIdeTabs.studio.title',
    descriptionKey: 'mobileIdeTabs.studio.description',
    icon: 'i-ph:robot',
  },
  {
    id: 'integrations',
    section: 'tools',
    titleKey: 'mobileIdeTabs.integrations.title',
    descriptionKey: 'mobileIdeTabs.integrations.description',
    icon: 'i-ph:package',
  },
  {
    id: 'extensions',
    section: 'tools',
    titleKey: 'mobileIdeTabs.extensions.title',
    descriptionKey: 'mobileIdeTabs.extensions.description',
    icon: 'i-ph:puzzle-piece',
  },
  {
    id: 'collaborators',
    section: 'tools',
    titleKey: 'mobileIdeTabs.collaborators.title',
    descriptionKey: 'mobileIdeTabs.collaborators.description',
    icon: 'i-ph:users',
    tone: 'info',
  },
  {
    id: 'preview',
    section: 'tools',
    titleKey: 'mobileIdeTabs.preview.title',
    descriptionKey: 'mobileIdeTabs.preview.description',
    icon: 'i-ph:monitor',
  },
  {
    id: 'logs',
    section: 'tools',
    titleKey: 'mobileIdeTabs.logs.title',
    descriptionKey: 'mobileIdeTabs.logs.description',
    icon: 'i-ph:list-magnifying-glass',
    tone: 'info',
  },
  {
    id: 'secrets',
    section: 'tools',
    titleKey: 'mobileIdeTabs.secrets.title',
    descriptionKey: 'mobileIdeTabs.secrets.description',
    icon: 'i-ph:key',
  },
  {
    id: 'security',
    section: 'tools',
    titleKey: 'mobileIdeTabs.security.title',
    descriptionKey: 'mobileIdeTabs.security.description',
    icon: 'i-ph:shield-check',
    tone: 'danger',
  },
  {
    id: 'monitoring',
    section: 'tools',
    titleKey: 'mobileIdeTabs.monitoring.title',
    descriptionKey: 'mobileIdeTabs.monitoring.description',
    icon: 'i-ph:chart-line',
  },
  {
    id: 'domains',
    section: 'tools',
    titleKey: 'mobileIdeTabs.domains.title',
    descriptionKey: 'mobileIdeTabs.domains.description',
    icon: 'i-ph:globe',
  },
  {
    id: 'ports',
    section: 'tools',
    titleKey: 'mobileIdeTabs.ports.title',
    descriptionKey: 'mobileIdeTabs.ports.description',
    icon: 'i-ph:plugs',
  },
  {
    id: 'env',
    section: 'tools',
    titleKey: 'mobileIdeTabs.env.title',
    descriptionKey: 'mobileIdeTabs.env.description',
    icon: 'i-ph:brackets-curly',
  },
  {
    id: 'workflows',
    section: 'tools',
    titleKey: 'mobileIdeTabs.workflows.title',
    descriptionKey: 'mobileIdeTabs.workflows.description',
    icon: 'i-ph:lightning',
    tone: 'warning',
  },
  {
    id: 'activity',
    section: 'tools',
    titleKey: 'mobileIdeTabs.activity.title',
    descriptionKey: 'mobileIdeTabs.activity.description',
    icon: 'i-ph:activity',
  },
  {
    id: 'snapshots',
    section: 'tools',
    titleKey: 'mobileIdeTabs.snapshots.title',
    descriptionKey: 'mobileIdeTabs.snapshots.description',
    icon: 'i-ph:stack',
  },
  {
    id: 'commands',
    section: 'tools',
    titleKey: 'mobileIdeTabs.commands.title',
    descriptionKey: 'mobileIdeTabs.commands.description',
    icon: 'i-ph:command',
    tone: 'info',
  },
  {
    id: 'share',
    section: 'tools',
    titleKey: 'mobileIdeTabs.share.title',
    descriptionKey: 'mobileIdeTabs.share.description',
    icon: 'i-ph:share-network',
    tone: 'info',
  },
];

export const ECODE_MOBILE_MORE_ITEMS: readonly string[] = [
  'preview',
  'agent',
  'overview',
  'files',
  'editor',
  'deployments',
  'git',
  'packages',
  'skills',
  'studio',
  'database',
  'object-storage',
  'secrets',
  'env',
  'terminal',
  'debugger',
  'logs',
  'search',
  'locks',
  'commands',
  'workflows',
  'integrations',
  'collaborators',
  'activity',
  'snapshots',
  'extensions',
  'monitoring',
  'ports',
  'security',
  'settings',
];

/**
 * Maps a mobile tool/menu id (including aliases) to the IDE management panel it opens.
 * Keys must cover every management-panel tool surfaced in `ECODE_MOBILE_TOOLS` /
 * `ECODE_MOBILE_MORE_ITEMS`; a missing key makes the tab silently fail to open on mobile.
 */
export const MOBILE_TOOL_TO_MANAGEMENT_PANEL: Record<string, string> = {
  deployments: 'deployments',
  publishing: 'deployments',
  deploy: 'deployments',
  'object-storage': 'object-storage',
  'app-storage': 'object-storage',
  storage: 'object-storage',
  database: 'database',
  'kv-store': 'database',
  debugger: 'debugger',
  debug: 'debugger',
  developer: 'debugger',
  git: 'git',
  activity: 'activity',
  history: 'activity',
  integrations: 'integrations',
  collaborators: 'collaborators',
  collaboration: 'collaborators',
  collaborate: 'collaborators',
  multiplayer: 'collaborators',
  packages: 'packages',
  secrets: 'secrets',
  env: 'env',
  auth: 'settings',
  settings: 'settings',
  workflows: 'workflows',
  snapshots: 'snapshots',
  checkpoints: 'snapshots',
  extensions: 'extensions',
  security: 'security',
  logs: 'logs',
  monitoring: 'monitoring',
  ports: 'ports',
  skills: 'skills',
  studio: 'studio',
  domains: 'domains',
  overview: 'overview',
};
