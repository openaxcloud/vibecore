export type ProjectOverviewStackItem = {
  name: string;
  category: 'runtime' | 'frontend' | 'backend' | 'data' | 'tooling' | 'testing' | 'mobile';
  source: string;
};

export type ProjectOverviewScript = {
  name: string;
  command: string;
  runCommand: string;
  manifestPath: string;
};

export type ProjectOverviewCommit = {
  sha?: string;
  shortSha?: string;
  message: string;
  author?: string;
  date?: string;
};

export type ProjectOverviewMember = {
  id: string;
  userId: string;
  roleKey?: string;
  status: string;
  mode?: string;
  filePath?: string;
  lastSeenAt?: string;
};

export type ProjectOverviewActivity = {
  action: string;
  createdAt?: string;
  actorUserId?: string;
};

export type ProjectOverviewInsights = {
  summary: {
    projectCreatedAt?: string;
    projectUpdatedAt?: string;
    sourceType?: string;
    workspaceStatus: string;
    runtimeMode: string;
    branch: string;
    fileCount: number;
    activeMemberCount: number;
    scriptCount: number;
  };
  stack: ProjectOverviewStackItem[];
  scripts: ProjectOverviewScript[];
  commits: ProjectOverviewCommit[];
  members: ProjectOverviewMember[];
  activity: ProjectOverviewActivity[];
};

type OverviewProject = {
  id?: string;
  name?: string;
  sourceType?: string;
  gitDefaultBranch?: string;
  createdAt?: string;
  updatedAt?: string;
};

type OverviewFile = {
  path?: string;
  sizeBytes?: number;
  updatedAt?: string;
};

type OverviewManifest = {
  path?: string;
  name?: string;
  packageManager?: string;
  scripts?: Record<string, string>;
};

type OverviewDependency = {
  name?: string;
  version?: string;
  scope?: string;
  manifestPath?: string;
};

type OverviewCommitInput = {
  sha?: string;
  shortSha?: string;
  message?: string;
  author?: string;
  date?: string;
};

type OverviewCollaborator = {
  id?: string;
  userId?: string;
  roleKey?: string;
  createdAt?: string;
};

type OverviewPresence = {
  id?: string;
  userId?: string;
  sessionId?: string;
  status?: string;
  mode?: string;
  filePath?: string;
  updatedAt?: string;
  createdAt?: string;
};

export type BuildProjectOverviewInput = {
  project?: OverviewProject | null;
  dashboard?: {
    project?: OverviewProject;
    workspace?: { status?: string; runtimeMode?: string } | null;
    files?: OverviewFile[];
    git?: { branch?: string };
    recentActivity?: ProjectOverviewActivity[];
  } | null;
  packages?: {
    packageManager?: string;
    manifests?: OverviewManifest[];
    dependencies?: OverviewDependency[];
    files?: OverviewFile[];
  } | null;
  gitGraph?: { commits?: OverviewCommitInput[] } | null;
  collaboration?: {
    collaborators?: OverviewCollaborator[];
    presence?: OverviewPresence[];
  } | null;
};

const scriptPriority = ['dev', 'start', 'build', 'preview', 'test', 'lint', 'typecheck', 'check'];

const stackDefinitions: Array<{
  name: string;
  category: ProjectOverviewStackItem['category'];
  dependencies?: string[];
  files?: RegExp[];
}> = [
  { name: 'React', category: 'frontend', dependencies: ['react'] },
  { name: 'Vite', category: 'tooling', dependencies: ['vite'], files: [/^vite\.config\.[mc]?[jt]s$/] },
  { name: 'TypeScript', category: 'tooling', dependencies: ['typescript'], files: [/\.(ts|tsx)$/] },
  { name: 'Next.js', category: 'frontend', dependencies: ['next'], files: [/^next\.config\./] },
  { name: 'Remix', category: 'frontend', dependencies: ['@remix-run/react', '@remix-run/node'] },
  { name: 'Astro', category: 'frontend', dependencies: ['astro'], files: [/^astro\.config\./] },
  { name: 'Vue', category: 'frontend', dependencies: ['vue'] },
  { name: 'Svelte', category: 'frontend', dependencies: ['svelte', '@sveltejs/kit'] },
  { name: 'Tailwind CSS', category: 'tooling', dependencies: ['tailwindcss'], files: [/^tailwind\.config\./] },
  { name: 'Fastify', category: 'backend', dependencies: ['fastify'] },
  { name: 'Express', category: 'backend', dependencies: ['express'] },
  { name: 'Prisma', category: 'data', dependencies: ['@prisma/client', 'prisma'], files: [/^prisma\/schema\.prisma$/] },
  { name: 'PostgreSQL', category: 'data', dependencies: ['pg', 'postgres'] },
  { name: 'MongoDB', category: 'data', dependencies: ['mongodb', 'mongoose'] },
  { name: 'Redis', category: 'data', dependencies: ['redis', 'ioredis'] },
  { name: 'Supabase', category: 'data', dependencies: ['@supabase/supabase-js'] },
  { name: 'Vitest', category: 'testing', dependencies: ['vitest'] },
  { name: 'Playwright', category: 'testing', dependencies: ['@playwright/test', 'playwright'] },
  { name: 'React Native', category: 'mobile', dependencies: ['react-native', 'expo'] },
];

function compact<T>(items: Array<T | undefined | null>): T[] {
  return items.filter((item): item is T => item !== undefined && item !== null);
}

function normalizePath(path?: string) {
  return String(path ?? '').replace(/^\.?\//, '');
}

function packageManagerCommand(packageManager?: string) {
  const normalized = packageManager?.toLowerCase() ?? '';

  if (normalized.startsWith('pnpm')) {
    return 'pnpm';
  }

  if (normalized.startsWith('yarn')) {
    return 'yarn';
  }

  if (normalized.startsWith('bun')) {
    return 'bun';
  }

  return 'npm';
}

function runCommandForScript(packageManager: string, scriptName: string) {
  if (packageManager === 'yarn') {
    return `yarn ${scriptName}`;
  }

  return `${packageManager} run ${scriptName}`;
}

export function detectProjectStack(input: {
  files?: OverviewFile[];
  dependencies?: OverviewDependency[];
  manifests?: OverviewManifest[];
  packageManager?: string;
}): ProjectOverviewStackItem[] {
  const paths = new Set((input.files ?? []).map((file) => normalizePath(file.path).toLowerCase()).filter(Boolean));

  const dependencyNames = new Set(
    (input.dependencies ?? []).map((dependency) => String(dependency.name ?? '').toLowerCase()).filter(Boolean),
  );

  const stack: ProjectOverviewStackItem[] = [];

  const add = (item: ProjectOverviewStackItem) => {
    if (!stack.some((existing) => existing.name === item.name)) {
      stack.push(item);
    }
  };

  const packageManager = packageManagerCommand(input.packageManager);

  add({ name: packageManager === 'npm' ? 'npm' : packageManager, category: 'runtime', source: 'package manager' });

  for (const definition of stackDefinitions) {
    const dependency = definition.dependencies?.find((name) => dependencyNames.has(name.toLowerCase()));

    if (dependency) {
      add({ name: definition.name, category: definition.category, source: dependency });
      continue;
    }

    const matchedFile = [...paths].find((path) => definition.files?.some((pattern) => pattern.test(path)));

    if (matchedFile) {
      add({ name: definition.name, category: definition.category, source: matchedFile });
    }
  }

  if (!stack.some((item) => item.name === 'Node.js') && (input.manifests?.length || paths.has('package.json'))) {
    add({ name: 'Node.js', category: 'runtime', source: 'package.json' });
  }

  return stack.slice(0, 10);
}

export function extractProjectScripts(input: {
  manifests?: OverviewManifest[];
  packageManager?: string;
}): ProjectOverviewScript[] {
  const packageManager = packageManagerCommand(input.packageManager);

  const scripts = (input.manifests ?? []).flatMap((manifest) =>
    Object.entries(manifest.scripts ?? {}).map(([name, command]) => ({
      name,
      command,
      manifestPath: normalizePath(manifest.path) || 'package.json',
      runCommand: runCommandForScript(packageManager, name),
    })),
  );

  return scripts
    .sort((left, right) => {
      const leftIndex = scriptPriority.indexOf(left.name);
      const rightIndex = scriptPriority.indexOf(right.name);
      const leftWeight = leftIndex === -1 ? scriptPriority.length : leftIndex;
      const rightWeight = rightIndex === -1 ? scriptPriority.length : rightIndex;

      return leftWeight - rightWeight || left.name.localeCompare(right.name);
    })
    .slice(0, 12);
}

export function normalizeProjectOverviewCommits(commits?: OverviewCommitInput[]): ProjectOverviewCommit[] {
  return (commits ?? [])
    .map((commit) => ({
      sha: commit.sha,
      shortSha: commit.shortSha ?? commit.sha?.slice(0, 8),
      message: commit.message?.trim() || 'Commit without message',
      author: commit.author,
      date: commit.date,
    }))
    .slice(0, 5);
}

const activeMemberStatuses = new Set(['active', 'editing', 'online', 'present']);

export function isActiveProjectOverviewStatus(status?: string): boolean {
  return activeMemberStatuses.has(String(status ?? '').toLowerCase());
}

/**
 * Normalizes collaborators + presence into the full (un-truncated) member list,
 * sorted with active members first. Callers that need a count of active members
 * must use this rather than the display-truncated {@link normalizeProjectOverviewMembers},
 * which slices to a fixed display cap.
 */
export function normalizeProjectOverviewMembersFull(input: {
  collaborators?: OverviewCollaborator[];
  presence?: OverviewPresence[];
}): ProjectOverviewMember[] {
  const presenceByUser = new Map<string, OverviewPresence>();

  for (const presence of input.presence ?? []) {
    if (presence.userId) {
      presenceByUser.set(presence.userId, presence);
    }
  }

  const collaboratorMembers = (input.collaborators ?? []).map((collaborator) => {
    const presence = collaborator.userId ? presenceByUser.get(collaborator.userId) : undefined;
    const userId = collaborator.userId ?? collaborator.id ?? 'unknown-user';

    return {
      id: collaborator.id ?? userId,
      userId,
      roleKey: collaborator.roleKey,
      status: presence?.status ?? 'invited',
      mode: presence?.mode,
      filePath: presence?.filePath,
      lastSeenAt: presence?.updatedAt ?? presence?.createdAt ?? collaborator.createdAt,
    };
  });

  const presenceOnlyMembers = (input.presence ?? [])
    .filter((presence) => presence.userId && !collaboratorMembers.some((member) => member.userId === presence.userId))
    .map((presence) => ({
      id: presence.id ?? presence.sessionId ?? presence.userId!,
      userId: presence.userId!,
      status: presence.status ?? 'active',
      mode: presence.mode,
      filePath: presence.filePath,
      lastSeenAt: presence.updatedAt ?? presence.createdAt,
    }));

  return [...presenceOnlyMembers, ...collaboratorMembers].sort((left, right) => {
    const leftActive = isActiveProjectOverviewStatus(left.status);
    const rightActive = isActiveProjectOverviewStatus(right.status);

    if (leftActive !== rightActive) {
      return leftActive ? -1 : 1;
    }

    return left.userId.localeCompare(right.userId);
  });
}

export function normalizeProjectOverviewMembers(input: {
  collaborators?: OverviewCollaborator[];
  presence?: OverviewPresence[];
}): ProjectOverviewMember[] {
  return normalizeProjectOverviewMembersFull(input).slice(0, 8);
}

export function buildProjectOverviewInsights(input: BuildProjectOverviewInput): ProjectOverviewInsights {
  const project = input.project ?? input.dashboard?.project ?? {};
  const files = input.packages?.files?.length ? input.packages.files : (input.dashboard?.files ?? []);
  const collaborators = input.collaboration?.collaborators ?? [];
  const presence = input.collaboration?.presence ?? [];
  const allMembers = normalizeProjectOverviewMembersFull({ collaborators, presence });
  const members = allMembers.slice(0, 8);

  const activeMemberCount = allMembers.filter((member) => isActiveProjectOverviewStatus(member.status)).length;

  const scripts = extractProjectScripts({
    manifests: input.packages?.manifests,
    packageManager: input.packages?.packageManager,
  });

  return {
    summary: {
      projectCreatedAt: project.createdAt,
      projectUpdatedAt: project.updatedAt,
      sourceType: project.sourceType,
      workspaceStatus: input.dashboard?.workspace?.status ?? 'No workspace',
      runtimeMode: input.dashboard?.workspace?.runtimeMode ?? 'unavailable',
      branch: input.dashboard?.git?.branch ?? project.gitDefaultBranch ?? 'main',
      fileCount: files.length,
      activeMemberCount,
      scriptCount: scripts.length,
    },
    stack: detectProjectStack({
      files,
      dependencies: input.packages?.dependencies,
      manifests: input.packages?.manifests,
      packageManager: input.packages?.packageManager,
    }),
    scripts,
    commits: normalizeProjectOverviewCommits(input.gitGraph?.commits),
    members,
    activity: compact(input.dashboard?.recentActivity ?? []).slice(0, 5),
  };
}
