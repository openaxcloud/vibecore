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
import { panelIcon } from '~/components/project-ide/panel-meta';
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
  overview: { id: 'overview', icon: panelIcon('overview'), accent: ACCENT_ACTION, category: 'workspace' },
  editor: { id: 'editor', icon: panelIcon('editor'), accent: ACCENT_ACTION, category: 'workspace' },
  files: { id: 'files', icon: panelIcon('files'), accent: ACCENT_WARNING, category: 'workspace' },
  search: { id: 'search', icon: panelIcon('search'), accent: ACCENT_ACTION, category: 'workspace' },
  locks: { id: 'locks', icon: panelIcon('locks'), accent: ACCENT_WARNING, category: 'workspace' },

  terminal: { id: 'terminal', icon: panelIcon('terminal'), accent: ACCENT_SUCCESS, category: 'runtime' },
  logs: { id: 'logs', icon: panelIcon('logs'), accent: ACCENT_SUCCESS, category: 'runtime' },
  preview: { id: 'preview', icon: panelIcon('preview'), accent: ACCENT_ACTION, category: 'runtime' },
  ports: { id: 'ports', icon: panelIcon('ports'), accent: ACCENT_SUCCESS, category: 'runtime' },

  database: { id: 'database', icon: panelIcon('database'), accent: ACCENT_ACTION, category: 'data' },
  'object-storage': {
    id: 'object-storage',
    icon: panelIcon('object-storage'),
    accent: ACCENT_WARNING,
    category: 'data',
  },

  git: { id: 'git', icon: panelIcon('git'), accent: ACCENT_SUCCESS, category: 'project' },
  packages: { id: 'packages', icon: panelIcon('packages'), accent: ACCENT_WARNING, category: 'project' },
  skills: { id: 'skills', icon: panelIcon('skills'), accent: ACCENT_ACTION, category: 'project' },
  integrations: { id: 'integrations', icon: panelIcon('integrations'), accent: ACCENT_SUCCESS, category: 'project' },
  workflows: { id: 'workflows', icon: panelIcon('workflows'), accent: ACCENT_SUCCESS, category: 'project' },
  debugger: { id: 'debugger', icon: panelIcon('debugger'), accent: ACCENT_ACTION, category: 'project' },
  extensions: { id: 'extensions', icon: panelIcon('extensions'), accent: ACCENT_MUTED, category: 'project' },
  snapshots: { id: 'snapshots', icon: panelIcon('snapshots'), accent: ACCENT_ACTION, category: 'project' },
  studio: { id: 'studio', icon: panelIcon('studio'), accent: ACCENT_ACTION, category: 'project' },

  deployments: { id: 'deployments', icon: panelIcon('deployments'), accent: ACCENT_ACTION, category: 'delivery' },
  monitoring: { id: 'monitoring', icon: panelIcon('monitoring'), accent: ACCENT_ACTION, category: 'delivery' },
  domains: { id: 'domains', icon: panelIcon('domains'), accent: ACCENT_ACTION, category: 'delivery' },

  security: { id: 'security', icon: panelIcon('security'), accent: ACCENT_ERROR, category: 'security' },

  activity: { id: 'activity', icon: panelIcon('activity'), accent: ACCENT_ACTION, category: 'team' },
  collaborators: { id: 'collaborators', icon: panelIcon('collaborators'), accent: ACCENT_MUTED, category: 'team' },

  env: { id: 'env', icon: panelIcon('env'), accent: ACCENT_WARNING, category: 'configuration' },
  secrets: { id: 'secrets', icon: panelIcon('secrets'), accent: ACCENT_WARNING, category: 'configuration' },
  settings: { id: 'settings', icon: panelIcon('settings'), accent: ACCENT_MUTED, category: 'configuration' },
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

/**
 * Every catalog entry in category order, aliased tools included. This is the
 * catalog view; the All-tools popup renders `projectEditorToolGridByCategory()`
 * instead, which drops the tools that are only a tab inside another tool.
 */
export function projectEditorToolsByCategory(): Array<[ProjectEditorToolCategory, ProjectEditorToolDescriptor[]]> {
  return PROJECT_EDITOR_TOOL_CATEGORIES.map(
    (category) =>
      [
        category,
        PROJECT_EDITOR_TOOLS.map((id) => PROJECT_EDITOR_TOOL_CATALOG[id]).filter((tool) => tool.category === category),
      ] as [ProjectEditorToolCategory, ProjectEditorToolDescriptor[]],
  ).filter(([, tools]) => tools.length > 0);
}

/** Every tool in engine order, aliased tools included. */
export function projectEditorToolList(): ProjectEditorToolDescriptor[] {
  return PROJECT_EDITOR_TOOLS.map((id) => PROJECT_EDITOR_TOOL_CATALOG[id]);
}

/**
 * A tool whose screen is already a tab inside another tool.
 *
 * Domains is the case that named this concept: the exact same
 * `ProjectDomainsPanel` is rendered by the standalone `domains` panel AND by
 * Deploy → Domains, so the All-tools grid offered two doors to one screen. A
 * domain is also meaningless without a deployment — the screen itself says the
 * CNAME/A instructions only unlock after the first successful deploy — so the
 * standalone card was a dead end for anyone who had not deployed yet.
 *
 * Aliased tools stay VALID panel ids on purpose. `?panel=domains` deep links,
 * layouts persisted before this change and the mobile Tools sheet entry all
 * keep working; they are canonicalised at open time into `tool` + `view`
 * instead of being rejected. Only the grid card disappears.
 */
export interface ProjectEditorToolAlias {
  /** The tool that really owns the screen. */
  tool: ProjectEditorTool;

  /** The sub-tab inside that tool which shows it. */
  view: string;
}

export const PROJECT_EDITOR_TOOL_ALIASES: Partial<Record<ProjectEditorTool, ProjectEditorToolAlias>> = {
  domains: { tool: 'deployments', view: 'domains' },
};

/** The alias record for `id`, or undefined when the tool owns its own screen. */
export function projectEditorToolAlias(id: ProjectEditorTool): ProjectEditorToolAlias | undefined {
  return PROJECT_EDITOR_TOOL_ALIASES[id];
}

/**
 * The tool that should actually be opened for `id` — itself for a normal tool,
 * the alias target for an aliased one. Aliases never chain (guarded by spec).
 */
export function resolveProjectEditorTool(id: ProjectEditorTool): ProjectEditorTool {
  return PROJECT_EDITOR_TOOL_ALIASES[id]?.tool ?? id;
}

/**
 * What a door should actually do when the user asks for `id`.
 *
 * Every call site (desktop `openWorkspacePanel`, mobile `activateMobileTool`)
 * funnels its decision through here rather than re-deriving it, because the
 * expensive failure on this repo is not a wrong table — it is a correct table
 * that one call site forgot to consult. `deployView` is set only when the owner
 * is the Deployments panel, which is the one panel that takes a tab request.
 */
export function resolveProjectEditorToolOpen(id: ProjectEditorTool): {
  panel: ProjectEditorTool;
  deployView?: string;
} {
  const alias = PROJECT_EDITOR_TOOL_ALIASES[id];

  if (!alias) {
    return { panel: id };
  }

  return alias.tool === 'deployments' ? { panel: alias.tool, deployView: alias.view } : { panel: alias.tool };
}

/** Every tool that gets its own card, in engine order. */
export function projectEditorToolGridList(): ProjectEditorToolDescriptor[] {
  return projectEditorToolList().filter((tool) => !PROJECT_EDITOR_TOOL_ALIASES[tool.id]);
}

/** Grid cards in category order — what the All-tools popup renders. */
export function projectEditorToolGridByCategory(): Array<[ProjectEditorToolCategory, ProjectEditorToolDescriptor[]]> {
  return projectEditorToolsByCategory()
    .map(
      ([category, tools]) =>
        [category, tools.filter((tool) => !PROJECT_EDITOR_TOOL_ALIASES[tool.id])] as [
          ProjectEditorToolCategory,
          ProjectEditorToolDescriptor[],
        ],
    )
    .filter(([, tools]) => tools.length > 0);
}
