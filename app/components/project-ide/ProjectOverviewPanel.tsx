import type { ReactNode } from 'react';
import type {
  ProjectOverviewActivity,
  ProjectOverviewCommit,
  ProjectOverviewInsights,
  ProjectOverviewMember,
  ProjectOverviewScript,
  ProjectOverviewStackItem,
} from '~/lib/project-overview';

type ProjectOverviewPanelProps = {
  data: {
    overview?: ProjectOverviewInsights;
    recentActivity?: ProjectOverviewActivity[];
    commits?: ProjectOverviewCommit[];
    collaborators?: Array<{ id?: string; userId?: string; roleKey?: string }>;
    files?: Array<{ path?: string }>;
    git?: { branch?: string };
    workspace?: { status?: string; runtimeMode?: string } | null;
  };
  project: {
    id?: string;
    name?: string;
    sourceType?: string;
    gitDefaultBranch?: string;
    createdAt?: string;
    updatedAt?: string;
  };
};

function formatDate(value?: string) {
  if (!value) {
    return 'Unknown';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function titleCase(value?: string) {
  if (!value) {
    return 'Unknown';
  }

  return value
    .split(/[-_.\s]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function fallbackOverview(data: ProjectOverviewPanelProps['data'], project: ProjectOverviewPanelProps['project']) {
  const commits = data.commits ?? [];
  const collaborators = data.collaborators ?? [];
  const recentActivity = data.recentActivity ?? [];

  return {
    summary: {
      projectCreatedAt: project.createdAt,
      projectUpdatedAt: project.updatedAt,
      sourceType: project.sourceType,
      workspaceStatus: data.workspace?.status ?? 'No workspace',
      runtimeMode: data.workspace?.runtimeMode ?? 'unavailable',
      branch: data.git?.branch ?? project.gitDefaultBranch ?? 'main',
      fileCount: data.files?.length ?? 0,
      activeMemberCount: collaborators.length,
      scriptCount: 0,
    },
    stack: [] as ProjectOverviewStackItem[],
    scripts: [] as ProjectOverviewScript[],
    commits,
    members: collaborators.map((collaborator) => ({
      id: collaborator.id ?? collaborator.userId ?? 'member',
      userId: collaborator.userId ?? collaborator.id ?? 'member',
      roleKey: collaborator.roleKey,
      status: 'member',
    })) as ProjectOverviewMember[],
    activity: recentActivity.slice(0, 5),
  } satisfies ProjectOverviewInsights;
}

function OverviewMetric({ label, value, detail }: { label: string; value: string | number; detail: string }) {
  return (
    <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-bolt-elements-textTertiary">
        {label}
      </div>
      <div className="mt-2 truncate text-lg font-semibold text-bolt-elements-textPrimary">{value}</div>
      <div className="mt-1 truncate text-xs text-bolt-elements-textSecondary">{detail}</div>
    </div>
  );
}

function OverviewSection({ title, action, children }: { title: string; action?: string; children: ReactNode }) {
  return (
    <section className="min-w-0">
      <div className="mb-2 flex min-w-0 items-center justify-between gap-3">
        <h3 className="m-0 truncate text-xs font-semibold uppercase tracking-[0.08em] text-bolt-elements-textTertiary">
          {title}
        </h3>
        {action ? <span className="shrink-0 text-[11px] text-bolt-elements-textTertiary">{action}</span> : null}
      </div>
      {children}
    </section>
  );
}

function EmptyOverviewBlock({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-4 text-sm text-bolt-elements-textSecondary">
      {children}
    </div>
  );
}

function StackList({ stack }: { stack: ProjectOverviewStackItem[] }) {
  if (!stack.length) {
    return (
      <EmptyOverviewBlock>
        No stack detected yet. Add a package.json or framework files to populate this.
      </EmptyOverviewBlock>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {stack.map((item) => (
        <div
          key={`${item.name}-${item.source}`}
          className="min-w-0 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-2"
          title={`${item.name} detected from ${item.source}`}
        >
          <div className="text-sm font-semibold text-bolt-elements-textPrimary">{item.name}</div>
          <div className="mt-0.5 max-w-[180px] truncate text-[11px] text-bolt-elements-textTertiary">
            {titleCase(item.category)} · {item.source}
          </div>
        </div>
      ))}
    </div>
  );
}

function ScriptList({ scripts }: { scripts: ProjectOverviewScript[] }) {
  if (!scripts.length) {
    return <EmptyOverviewBlock>No npm scripts found in project manifests.</EmptyOverviewBlock>;
  }

  return (
    <div className="grid gap-2">
      {scripts.slice(0, 6).map((script) => (
        <div
          key={`${script.manifestPath}:${script.name}`}
          className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-2"
        >
          <div className="flex min-w-0 items-center justify-between gap-3">
            <strong className="truncate text-sm text-bolt-elements-textPrimary">{script.name}</strong>
            <code className="shrink-0 rounded bg-bolt-elements-background-depth-3 px-1.5 py-0.5 text-[11px] text-bolt-elements-textSecondary">
              {script.runCommand}
            </code>
          </div>
          <div className="mt-1 truncate text-xs text-bolt-elements-textSecondary">{script.command}</div>
        </div>
      ))}
    </div>
  );
}

function CommitList({ commits }: { commits: ProjectOverviewCommit[] }) {
  if (!commits.length) {
    return <EmptyOverviewBlock>No commits reported yet.</EmptyOverviewBlock>;
  }

  return (
    <div className="grid gap-2">
      {commits.map((commit, index) => (
        <div
          key={`${commit.sha ?? commit.message}-${commit.date ?? ''}-${index}`}
          className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-2"
        >
          <div className="truncate text-sm font-medium text-bolt-elements-textPrimary">{commit.message}</div>
          <div className="mt-1 flex min-w-0 items-center gap-2 text-[11px] text-bolt-elements-textTertiary">
            {commit.shortSha ? <code className="shrink-0">{commit.shortSha}</code> : null}
            {commit.author ? <span className="truncate">{commit.author}</span> : null}
            {commit.date ? <span className="shrink-0">{formatDate(commit.date)}</span> : null}
          </div>
        </div>
      ))}
    </div>
  );
}

function MemberList({ members }: { members: ProjectOverviewMember[] }) {
  if (!members.length) {
    return <EmptyOverviewBlock>No collaborators or active sessions yet.</EmptyOverviewBlock>;
  }

  return (
    <div className="grid gap-2">
      {members.slice(0, 6).map((member, index) => (
        <div
          key={`${member.userId}:${member.id}:${index}`}
          className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-2"
        >
          <div className="flex min-w-0 items-center justify-between gap-3">
            <strong className="truncate text-sm text-bolt-elements-textPrimary">{member.userId}</strong>
            <span className="shrink-0 rounded-full border border-bolt-elements-borderColor px-2 py-0.5 text-[11px] text-bolt-elements-textSecondary">
              {member.status}
            </span>
          </div>
          <div className="mt-1 truncate text-xs text-bolt-elements-textSecondary">
            {titleCase(member.roleKey)}
            {member.filePath ? ` · ${member.filePath}` : ''}
          </div>
        </div>
      ))}
    </div>
  );
}

function ActivityList({ activity }: { activity: ProjectOverviewActivity[] }) {
  if (!activity.length) {
    return <EmptyOverviewBlock>No project activity yet.</EmptyOverviewBlock>;
  }

  return (
    <div className="overflow-hidden rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2">
      {activity.map((event, index) => (
        <div
          key={`${event.action}-${event.createdAt ?? index}`}
          className="border-b border-bolt-elements-borderColor px-3 py-2 last:border-b-0"
        >
          <div className="truncate text-sm font-medium text-bolt-elements-textPrimary">{titleCase(event.action)}</div>
          <div className="mt-1 text-xs text-bolt-elements-textSecondary">{formatDate(event.createdAt)}</div>
        </div>
      ))}
    </div>
  );
}

export function ProjectOverviewPanel({ data, project }: ProjectOverviewPanelProps) {
  const resolved = data.overview?.summary ? data.overview : fallbackOverview(data, project);

  /*
   * `data.overview` arrives as untyped runtime data (the IDE panel casts an
   * `unknown` SSE/fetch payload), so a server response with a `summary` but a
   * missing/partial `stack`/`scripts`/`commits`/`members`/`activity` array would
   * crash the render at `.length`/`.map`. Coalesce every collection to an array.
   */
  const overview = {
    ...resolved,
    stack: resolved.stack ?? [],
    scripts: resolved.scripts ?? [],
    commits: resolved.commits ?? [],
    members: resolved.members ?? [],
    activity: resolved.activity ?? [],
  };

  const projectName = project.name ?? project.id ?? 'Project';

  return (
    <div className="grid gap-5" data-testid="project-overview-panel">
      <section className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-4 py-4">
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-bolt-elements-textTertiary">
              Project overview
            </div>
            <h3 className="m-0 mt-1 truncate text-base font-semibold text-bolt-elements-textPrimary">{projectName}</h3>
          </div>
          <div className="shrink-0 rounded-full border border-bolt-elements-borderColor px-2.5 py-1 text-xs text-bolt-elements-textSecondary">
            {titleCase(overview.summary.sourceType)}
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <OverviewMetric label="Files" value={overview.summary.fileCount} detail="Tracked project files" />
          <OverviewMetric label="Branch" value={overview.summary.branch} detail="Current Git branch" />
          <OverviewMetric
            label="Workspace"
            value={titleCase(overview.summary.workspaceStatus)}
            detail={overview.summary.runtimeMode}
          />
          <OverviewMetric
            label="Created"
            value={formatDate(overview.summary.projectCreatedAt)}
            detail={`Updated ${formatDate(overview.summary.projectUpdatedAt)}`}
          />
        </div>
      </section>

      <OverviewSection title="Detected Stack" action={`${overview.stack.length} signals`}>
        <StackList stack={overview.stack} />
      </OverviewSection>

      <div className="grid gap-5 xl:grid-cols-2">
        <OverviewSection title="Available npm Scripts" action={`${overview.summary.scriptCount} scripts`}>
          <ScriptList scripts={overview.scripts} />
        </OverviewSection>

        <OverviewSection title="Active Members" action={`${overview.summary.activeMemberCount} active`}>
          <MemberList members={overview.members} />
        </OverviewSection>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <OverviewSection title="Latest Commits">
          <CommitList commits={overview.commits} />
        </OverviewSection>

        <OverviewSection title="Latest Activity">
          <ActivityList activity={overview.activity} />
        </OverviewSection>
      </div>
    </div>
  );
}
