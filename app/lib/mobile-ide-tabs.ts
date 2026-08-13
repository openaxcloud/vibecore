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
  title: string;
  description: string;
  icon: string;
  tone?: string;
};

export const ECODE_MOBILE_TOOLS: readonly MobileToolItem[] = [
  {
    id: 'search',
    section: 'search',
    title: 'Search',
    description: 'Search through your files',
    icon: 'i-ph:magnifying-glass',
  },
  {
    id: 'files',
    section: 'search',
    title: 'Files',
    description: 'Find a file',
    icon: 'i-ph:folder-open',
  },
  {
    id: 'editor',
    section: 'search',
    title: 'Editor',
    description: 'Open code editor',
    icon: 'i-ph:code',
  },
  {
    id: 'overview',
    section: 'tools',
    title: 'Overview',
    description: 'Project summary',
    icon: 'i-ph:gauge',
    tone: 'info',
  },
  {
    id: 'agent',
    section: 'tools',
    title: 'AI Agent',
    description: 'Agent can make changes, review its work, and debug itself automatically.',
    icon: 'agent',
    tone: 'agent',
  },
  {
    id: 'deployments',
    section: 'tools',
    title: 'Deployments',
    description: 'Publish your app',
    icon: 'i-ph:rocket-launch',
    tone: 'success',
  },
  {
    id: 'object-storage',
    section: 'tools',
    title: 'Object Storage',
    description: 'File storage',
    icon: 'i-ph:hard-drives',
  },
  {
    id: 'settings',
    section: 'tools',
    title: 'Settings',
    description: 'Project settings',
    icon: 'i-ph:gear',
    tone: 'info',
  },
  {
    id: 'terminal',
    section: 'tools',
    title: SHELL_TERMINAL_LABEL,
    description: 'Workspace shell terminal',
    icon: 'i-ph:terminal-window',
  },
  {
    id: 'database',
    section: 'tools',
    title: 'Database',
    description: 'SQL browser',
    icon: 'i-ph:database',
    tone: 'info',
  },
  {
    id: 'locks',
    section: 'tools',
    title: 'Locks',
    description: 'Locked files',
    icon: 'i-ph:lock',
    tone: 'warning',
  },
  {
    id: 'debugger',
    section: 'tools',
    title: 'Debugger',
    description: 'Breakpoints and launch configs',
    icon: 'i-ph:bug',
  },
  {
    id: 'git',
    section: 'tools',
    title: 'Git',
    description: 'Version control for your App',
    icon: 'i-ph:git-branch',
    tone: 'warning',
  },
  {
    id: 'packages',
    section: 'tools',
    title: 'Packages',
    description: 'Dependencies manager',
    icon: 'i-ph:package',
  },
  {
    id: 'skills',
    section: 'tools',
    title: 'Skills',
    description: 'Agent skills',
    icon: 'i-ph:sparkle',
  },
  {
    id: 'studio',
    section: 'tools',
    title: 'Agent Studio',
    description: 'Agent supervisor',
    icon: 'i-ph:robot',
  },
  {
    id: 'integrations',
    section: 'tools',
    title: 'Integrations',
    description: 'Connected services',
    icon: 'i-ph:package',
  },
  {
    id: 'extensions',
    section: 'tools',
    title: 'Extensions',
    description: 'Marketplace',
    icon: 'i-ph:puzzle-piece',
  },
  {
    id: 'collaborators',
    section: 'tools',
    title: 'Collaborators',
    description: 'Team access',
    icon: 'i-ph:users',
    tone: 'info',
  },
  {
    id: 'preview',
    section: 'tools',
    title: 'Webview',
    description: 'Preview your App',
    icon: 'i-ph:monitor',
  },
  {
    id: 'logs',
    section: 'tools',
    title: 'Logs',
    description: 'Runtime logs',
    icon: 'i-ph:list-magnifying-glass',
    tone: 'info',
  },
  {
    id: 'secrets',
    section: 'tools',
    title: 'Secrets',
    description: 'Store sensitive information (like API keys) securely in your App',
    icon: 'i-ph:key',
  },
  {
    id: 'security',
    section: 'tools',
    title: 'Security',
    description: 'Security scanner',
    icon: 'i-ph:shield-check',
    tone: 'danger',
  },
  {
    id: 'monitoring',
    section: 'tools',
    title: 'Monitoring',
    description: 'App metrics',
    icon: 'i-ph:chart-line',
  },
  {
    id: 'ports',
    section: 'tools',
    title: 'Ports',
    description: 'Forwarded ports',
    icon: 'i-ph:plugs',
  },
  {
    id: 'env',
    section: 'tools',
    title: 'Environment variables',
    description: 'Environment variables',
    icon: 'i-ph:brackets-curly',
  },
  {
    id: 'workflows',
    section: 'tools',
    title: 'Workflows',
    description: 'Configure different ways to run your App',
    icon: 'i-ph:lightning',
    tone: 'warning',
  },
  {
    id: 'activity',
    section: 'tools',
    title: 'Activity',
    description: 'Project timeline',
    icon: 'i-ph:activity',
  },
  {
    id: 'snapshots',
    section: 'tools',
    title: 'Snapshots',
    description: 'Rollback points',
    icon: 'i-ph:stack',
  },
  {
    id: 'commands',
    section: 'tools',
    title: 'Commands',
    description: 'Open command palette',
    icon: 'i-ph:command',
    tone: 'info',
  },
  {
    id: 'share',
    section: 'tools',
    title: 'Share',
    description: 'Copy project link',
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
