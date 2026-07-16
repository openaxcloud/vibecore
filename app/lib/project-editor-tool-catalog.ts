import { PROJECT_EDITOR_TOOLS, type ProjectEditorTool } from './project-editor-layout';

export type ProjectEditorToolCategory =
  | 'Project Editor'
  | 'Runtime'
  | 'Data'
  | 'Configuration'
  | 'Project'
  | 'Delivery'
  | 'Security'
  | 'Team';

export interface ProjectEditorToolMetadata {
  id: ProjectEditorTool;
  title: string;
  description: string;
  icon: string;
  color: string;
  category: ProjectEditorToolCategory;
}

const PROJECT_EDITOR_TOOL_METADATA = {
  editor: {
    title: 'Code',
    description: 'Code editor',
    icon: 'i-ph:code',
    color: 'var(--vc-ide-accent-action)',
    category: 'Project Editor',
  },
  preview: {
    title: 'Webview',
    description: 'App preview',
    icon: 'i-ph:browser',
    color: 'var(--vc-ide-accent-action)',
    category: 'Runtime',
  },
  files: {
    title: 'Files',
    description: 'Browse project files',
    icon: 'i-ph:files',
    color: 'var(--vc-ide-accent-warning)',
    category: 'Project Editor',
  },
  search: {
    title: 'Search',
    description: 'Find in files',
    icon: 'i-ph:magnifying-glass',
    color: 'var(--vc-ide-accent-action)',
    category: 'Project Editor',
  },
  locks: {
    title: 'Locks',
    description: 'Locked files',
    icon: 'i-ph:lock',
    color: 'var(--vc-ide-accent-warning)',
    category: 'Project Editor',
  },
  overview: {
    title: 'Overview',
    description: 'Project summary',
    icon: 'i-ph:gauge',
    color: 'var(--vc-ide-accent-action)',
    category: 'Project Editor',
  },
  studio: {
    title: 'Agent Studio',
    description: 'Agent supervisor',
    icon: 'i-ph:robot',
    color: 'var(--vc-ide-accent-action)',
    category: 'Project',
  },
  database: {
    title: 'Database',
    description: 'SQL browser',
    icon: 'i-ph:database',
    color: 'var(--vc-ide-accent-action)',
    category: 'Data',
  },
  'object-storage': {
    title: 'Object Storage',
    description: 'File storage',
    icon: 'i-ph:package',
    color: 'var(--vc-ide-accent-warning)',
    category: 'Data',
  },
  packages: {
    title: 'Packages',
    description: 'Dependencies manager',
    icon: 'i-ph:cube',
    color: 'var(--vc-ide-accent-warning)',
    category: 'Project',
  },
  skills: {
    title: 'Skills',
    description: 'Agent skills',
    icon: 'i-ph:sparkle',
    color: 'var(--vc-ide-accent-action)',
    category: 'Project',
  },
  monitoring: {
    title: 'Monitoring',
    description: 'App metrics',
    icon: 'i-ph:chart-line',
    color: 'var(--vc-ide-accent-action)',
    category: 'Delivery',
  },
  ports: {
    title: 'Ports',
    description: 'Forwarded ports',
    icon: 'i-ph:plugs',
    color: 'var(--vc-ide-accent-success)',
    category: 'Runtime',
  },
  extensions: {
    title: 'Extensions',
    description: 'Marketplace',
    icon: 'i-ph:puzzle-piece',
    color: 'var(--vc-ide-text-secondary)',
    category: 'Project',
  },
  integrations: {
    title: 'Integrations',
    description: 'Connected services',
    icon: 'i-ph:plugs-connected',
    color: 'var(--vc-ide-accent-success)',
    category: 'Project',
  },
  workflows: {
    title: 'Workflows',
    description: 'Task automation',
    icon: 'i-ph:git-branch',
    color: 'var(--vc-ide-accent-success)',
    category: 'Project',
  },
  debugger: {
    title: 'Debugger',
    description: 'Breakpoints and launch configs',
    icon: 'i-ph:bug',
    color: 'var(--vc-ide-accent-action)',
    category: 'Project',
  },
  deployments: {
    title: 'Deployments',
    description: 'Publish your app',
    icon: 'i-ph:rocket-launch',
    color: 'var(--vc-ide-accent-action)',
    category: 'Delivery',
  },
  security: {
    title: 'Security',
    description: 'Security scanner',
    icon: 'i-ph:shield-check',
    color: 'var(--vc-ide-accent-error)',
    category: 'Security',
  },
  env: {
    title: 'Environment variables',
    description: 'Project environment variables',
    icon: 'i-ph:brackets-curly',
    color: 'var(--vc-ide-accent-warning)',
    category: 'Configuration',
  },
  secrets: {
    title: 'Secrets',
    description: 'Encrypted project secrets',
    icon: 'i-ph:lock',
    color: 'var(--vc-ide-accent-warning)',
    category: 'Configuration',
  },
  git: {
    title: 'Git',
    description: 'Version control',
    icon: 'i-ph:git-branch',
    color: 'var(--vc-ide-accent-success)',
    category: 'Project',
  },
  activity: {
    title: 'Activity',
    description: 'Project timeline',
    icon: 'i-ph:activity',
    color: 'var(--vc-ide-accent-action)',
    category: 'Team',
  },
  terminal: {
    title: 'Shell (Terminal)',
    description: 'Project shell',
    icon: 'i-ph:terminal-window',
    color: 'var(--vc-ide-accent-success)',
    category: 'Runtime',
  },
  logs: {
    title: 'Logs',
    description: 'Runtime logs',
    icon: 'i-ph:list-magnifying-glass',
    color: 'var(--vc-ide-accent-success)',
    category: 'Runtime',
  },
  collaborators: {
    title: 'Collaborators',
    description: 'Team access',
    icon: 'i-ph:users',
    color: 'var(--vc-ide-text-secondary)',
    category: 'Team',
  },
  domains: {
    title: 'Domains',
    description: 'Custom domains',
    icon: 'i-ph:globe',
    color: 'var(--vc-ide-accent-action)',
    category: 'Delivery',
  },
  snapshots: {
    title: 'Snapshots',
    description: 'Rollback points',
    icon: 'i-ph:stack',
    color: 'var(--vc-ide-accent-action)',
    category: 'Project',
  },
  settings: {
    title: 'Settings',
    description: 'Project settings',
    icon: 'i-ph:gear',
    color: 'var(--vc-ide-text-secondary)',
    category: 'Configuration',
  },
} as const satisfies Record<ProjectEditorTool, Omit<ProjectEditorToolMetadata, 'id'>>;

/** One ordered, exhaustive source for the Tools dock palette and Pane add-tab palette. */
export const PROJECT_EDITOR_TOOL_CATALOG: readonly ProjectEditorToolMetadata[] = PROJECT_EDITOR_TOOLS.map((id) => ({
  id,
  ...PROJECT_EDITOR_TOOL_METADATA[id],
}));

export function projectEditorToolMetadata(tool: ProjectEditorTool): ProjectEditorToolMetadata {
  return { id: tool, ...PROJECT_EDITOR_TOOL_METADATA[tool] };
}
