/**
 * RPL-IDE-001.5 — the single registry of Project Editor tools.
 *
 * Before this module the tool list existed twice, hand-maintained, in
 * `BaseChat.tsx`: once for the tab-strip "+" popup and once for the command
 * palette. Both had drifted from `PROJECT_EDITOR_TOOLS` (the engine's source of
 * truth) — `studio`, `domains`, `locks`, `overview`, `logs`, `activity`,
 * `collaborators`, `debugger` and `editor` were rendered as panels but were
 * unreachable from the palette, and `studio`/`domains` from either surface.
 *
 * Everything the UI needs about a tool is derived here from the engine's list,
 * and `project-editor-tool-catalog.spec.ts` fails the build if a tool ever lacks
 * an entry again. Labels and descriptions stay in `BaseChat` (they need `t` and
 * `panelTitle`); this module owns identity, icon, accent, grouping and dock
 * membership.
 */
import { PROJECT_EDITOR_TOOLS, type ProjectEditorTool } from '~/lib/project-editor-layout';

/** Group headings in the All-tools popup, in display order. */
export const PROJECT_EDITOR_TOOL_CATEGORIES = [
  'workspace',
  'runtime',
  'data',
  'project',
  'delivery',
  'security',
  'team',
  'configuration',
] as const;

export type ProjectEditorToolCategory = (typeof PROJECT_EDITOR_TOOL_CATEGORIES)[number];

export interface ProjectEditorToolDescriptor {
  id: ProjectEditorTool;
  icon: string;

  /** CSS custom property carrying the tool's accent — theme-aware by construction. */
  accent: string;
  category: ProjectEditorToolCategory;
}

const ACCENT_ACTION = 'var(--vc-ide-accent-action)';
const ACCENT_WARNING = 'var(--vc-ide-accent-warning)';
const ACCENT_SUCCESS = 'var(--vc-ide-accent-success)';
const ACCENT_ERROR = 'var(--vc-ide-accent-error)';
const ACCENT_MUTED = 'var(--vc-ide-text-secondary)';

/**
 * Icons and accents match what the tab popup already rendered, so this
 * consolidation is not a visual redesign. `studio` and `domains` take the icons
 * the mobile tab metadata already used for them.
 */
export const PROJECT_EDITOR_TOOL_CATALOG: Record<ProjectEditorTool, ProjectEditorToolDescriptor> = {
  overview: { id: 'overview', icon: 'i-ph:gauge', accent: ACCENT_ACTION, category: 'workspace' },
  editor: { id: 'editor', icon: 'i-ph:code', accent: ACCENT_ACTION, category: 'workspace' },
  files: { id: 'files', icon: 'i-ph:files', accent: ACCENT_WARNING, category: 'workspace' },
  search: { id: 'search', icon: 'i-ph:magnifying-glass', accent: ACCENT_ACTION, category: 'workspace' },
  locks: { id: 'locks', icon: 'i-ph:lock', accent: ACCENT_WARNING, category: 'workspace' },

  terminal: { id: 'terminal', icon: 'i-ph:terminal-window', accent: ACCENT_SUCCESS, category: 'runtime' },
  logs: { id: 'logs', icon: 'i-ph:list-magnifying-glass', accent: ACCENT_SUCCESS, category: 'runtime' },
  preview: { id: 'preview', icon: 'i-ph:browser', accent: ACCENT_ACTION, category: 'runtime' },
  ports: { id: 'ports', icon: 'i-ph:plugs', accent: ACCENT_SUCCESS, category: 'runtime' },

  database: { id: 'database', icon: 'i-ph:database', accent: ACCENT_ACTION, category: 'data' },
  'object-storage': { id: 'object-storage', icon: 'i-ph:package', accent: ACCENT_WARNING, category: 'data' },

  git: { id: 'git', icon: 'i-ph:git-branch', accent: ACCENT_SUCCESS, category: 'project' },
  packages: { id: 'packages', icon: 'i-ph:cube', accent: ACCENT_WARNING, category: 'project' },
  skills: { id: 'skills', icon: 'i-ph:sparkle', accent: ACCENT_ACTION, category: 'project' },
  integrations: { id: 'integrations', icon: 'i-ph:plugs-connected', accent: ACCENT_SUCCESS, category: 'project' },
  workflows: { id: 'workflows', icon: 'i-ph:git-branch', accent: ACCENT_SUCCESS, category: 'project' },
  debugger: { id: 'debugger', icon: 'i-ph:bug', accent: ACCENT_ACTION, category: 'project' },
  extensions: { id: 'extensions', icon: 'i-ph:puzzle-piece', accent: ACCENT_MUTED, category: 'project' },
  snapshots: { id: 'snapshots', icon: 'i-ph:stack', accent: ACCENT_ACTION, category: 'project' },
  studio: { id: 'studio', icon: 'i-ph:robot', accent: ACCENT_ACTION, category: 'project' },

  deployments: { id: 'deployments', icon: 'i-ph:rocket-launch', accent: ACCENT_ACTION, category: 'delivery' },
  monitoring: { id: 'monitoring', icon: 'i-ph:chart-line', accent: ACCENT_ACTION, category: 'delivery' },
  domains: { id: 'domains', icon: 'i-ph:globe', accent: ACCENT_ACTION, category: 'delivery' },

  security: { id: 'security', icon: 'i-ph:shield-check', accent: ACCENT_ERROR, category: 'security' },

  activity: { id: 'activity', icon: 'i-ph:activity', accent: ACCENT_ACTION, category: 'team' },
  collaborators: { id: 'collaborators', icon: 'i-ph:users', accent: ACCENT_MUTED, category: 'team' },

  env: { id: 'env', icon: 'i-ph:brackets-curly', accent: ACCENT_WARNING, category: 'configuration' },
  secrets: { id: 'secrets', icon: 'i-ph:lock', accent: ACCENT_WARNING, category: 'configuration' },
  settings: { id: 'settings', icon: 'i-ph:gear', accent: ACCENT_MUTED, category: 'configuration' },
};

/**
 * The left rail's one-click shortcuts. Deliberately short: the dock is a
 * always-visible column, and past ~9 entries it stops fitting a 768 px-tall
 * viewport without scrolling. Everything else is one click away in All tools.
 */
export const PROJECT_EDITOR_DOCK_TOOLS: readonly ProjectEditorTool[] = [
  'files',
  'search',
  'git',
  'database',
  'secrets',
  'packages',
  'deployments',
  'terminal',
  'ports',
];

/**
 * Real, already-registered keybindings only. A dock that advertises shortcuts
 * which do nothing is worse than one that advertises none, so tools without a
 * binding simply show no hint.
 */
export const PROJECT_EDITOR_TOOL_SHORTCUTS: Partial<Record<ProjectEditorTool, string>> = {
  files: 'cmd+p',
  terminal: 'cmd+`',
  preview: 'cmd+enter',
  settings: 'cmd+,',
};

/**
 * Concrete i18n keys for the category headings. Deliberately a literal table
 * rather than a `baseChatAst.common.${category}` template: `t()`'s key type is a
 * union over the entire copy catalog, and handing it a template-literal type
 * makes TypeScript expand that union — which pushes a `tsc` run on
 * `BaseChat.tsx` from ~2 minutes to not finishing at all.
 */
export const PROJECT_EDITOR_TOOL_CATEGORY_LABEL_KEYS: Record<ProjectEditorToolCategory, string> = {
  workspace: 'baseChatAst.common.workspace',
  runtime: 'baseChatAst.common.runtime',
  data: 'baseChatAst.common.data',
  project: 'baseChatAst.common.project',
  delivery: 'baseChatAst.common.delivery',
  security: 'baseChatAst.common.security',
  team: 'baseChatAst.common.team',
  configuration: 'baseChatAst.common.configuration',
};

/** Catalog entries in category order — the order the All-tools popup renders. */
export function projectEditorToolsByCategory(): Array<[ProjectEditorToolCategory, ProjectEditorToolDescriptor[]]> {
  return PROJECT_EDITOR_TOOL_CATEGORIES.map(
    (category) =>
      [
        category,
        PROJECT_EDITOR_TOOLS.map((id) => PROJECT_EDITOR_TOOL_CATALOG[id]).filter((tool) => tool.category === category),
      ] as [ProjectEditorToolCategory, ProjectEditorToolDescriptor[]],
  ).filter(([, tools]) => tools.length > 0);
}

/** Every tool, in engine order. */
export function projectEditorToolList(): ProjectEditorToolDescriptor[] {
  return PROJECT_EDITOR_TOOLS.map((id) => PROJECT_EDITOR_TOOL_CATALOG[id]);
}
