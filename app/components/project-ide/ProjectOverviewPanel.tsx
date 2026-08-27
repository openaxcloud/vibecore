import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  formatProjectOverviewPanelCopy,
  formatProjectOverviewPanelCount,
  formatProjectOverviewPanelDate,
  formatProjectOverviewPanelNumber,
  getProjectOverviewPanelCopy,
  projectOverviewActivityLabel,
  projectOverviewCategoryLabel,
  projectOverviewMemberStatusLabel,
  projectOverviewRoleLabel,
  projectOverviewSourceLabel,
  projectOverviewWorkspaceStatusLabel,
  type ProjectOverviewPanelCopy,
} from '~/lib/i18n/catalogs/project-overview-panel';
import type {
  ProjectOverviewActivity,
  ProjectOverviewCommit,
  ProjectOverviewInsights,
  ProjectOverviewMember,
  ProjectOverviewScript,
  ProjectOverviewStackItem,
} from '~/lib/project-overview';
import {
  describeByteGauge,
  describeCpuGauge,
  type GaugeDisplay,
  type ProjectOverviewResources,
} from '~/lib/project-overview-resources';

type ProjectOverviewPanelProps = {
  data: {
    overview?: ProjectOverviewInsights;
    resources?: ProjectOverviewResources;
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
      id: collaborator.id ?? collaborator.userId ?? '',
      userId: collaborator.userId ?? collaborator.id ?? '',
      roleKey: collaborator.roleKey,
      status: 'member',
    })) as ProjectOverviewMember[],
    activity: recentActivity.slice(0, 5),
  } satisfies ProjectOverviewInsights;
}

function OverviewMetric({
  label,
  value,
  detail,
  ariaLabel,
}: {
  label: string;
  value: string | number;
  detail: string;
  ariaLabel: string;
}) {
  return (
    <div
      className="min-w-0 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-3"
      role="group"
      aria-label={ariaLabel}
    >
      <div className="break-words text-[11px] font-semibold uppercase tracking-[0.08em] text-bolt-elements-textTertiary">
        {label}
      </div>
      <div className="mt-2 break-all text-lg font-semibold text-bolt-elements-textPrimary">{value}</div>
      <div className="mt-1 break-all text-xs leading-5 text-bolt-elements-textSecondary">{detail}</div>
    </div>
  );
}

/*
 * SCR-008 — une jauge de ressource.
 *
 * La barre n'est dessinée QUE si `fill` est un nombre. Quand la consommation
 * est inconnue, ou qu'aucune limite n'existe à laquelle la rapporter, la barre
 * disparaît : une barre vide se lirait « 0 % consommé », ce qui inventerait la
 * mesure que le noyau n'a justement pas donnée.
 */
function OverviewGauge({
  label,
  display,
  detail,
  ariaLabel,
}: {
  label: string;
  display: GaugeDisplay;
  detail?: string;
  ariaLabel: string;
}) {
  const percent = display.fill === null ? undefined : Math.round(display.fill * 100);

  return (
    <div
      className="min-w-0 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-3"
      role="group"
      aria-label={ariaLabel}
      data-testid={`overview-gauge-${label.toLowerCase()}`}
      data-measured={display.fill === null ? 'false' : 'true'}
    >
      <div className="break-words text-[11px] font-semibold uppercase tracking-[0.08em] text-bolt-elements-textTertiary">
        {label}
      </div>
      <div className="mt-2 break-words text-base font-semibold text-bolt-elements-textPrimary">{display.value}</div>
      {percent === undefined ? null : (
        <div
          className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-bolt-elements-background-depth-3"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
        >
          <div
            className="h-full rounded-full bg-[var(--vc-ide-accent-action)]"
            style={{ width: `${Math.max(2, percent)}%` }}
          />
        </div>
      )}
      {detail ? (
        <div className="mt-1 break-words text-xs leading-5 text-bolt-elements-textSecondary">{detail}</div>
      ) : null}
    </div>
  );
}

function OverviewSection({ title, action, children }: { title: string; action?: string; children: ReactNode }) {
  return (
    <section className="min-w-0">
      <div className="mb-2 flex min-w-0 flex-col gap-1 min-[420px]:flex-row min-[420px]:items-start min-[420px]:justify-between min-[420px]:gap-3">
        <h3 className="m-0 min-w-0 break-words text-xs font-semibold uppercase tracking-[0.08em] text-bolt-elements-textTertiary">
          {title}
        </h3>
        {action ? (
          <span className="break-words text-[11px] text-bolt-elements-textTertiary min-[420px]:shrink-0">{action}</span>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function EmptyOverviewBlock({ children }: { children: ReactNode }) {
  return (
    <div
      className="break-words rounded-lg border border-dashed border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-4 text-sm leading-6 text-bolt-elements-textSecondary"
      role="status"
    >
      {children}
    </div>
  );
}

function StackList({
  stack,
  copy,
  language,
}: {
  stack: ProjectOverviewStackItem[];
  copy: ProjectOverviewPanelCopy;
  language?: string;
}) {
  if (!stack.length) {
    return <EmptyOverviewBlock>{copy['projectOverview.empty.stack']}</EmptyOverviewBlock>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {stack.map((item) => (
        <div
          key={`${item.name}-${item.source}`}
          className="max-w-full min-w-0 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-2"
          title={formatProjectOverviewPanelCopy(copy['projectOverview.stack.detectedFrom'], {
            name: item.name,
            source: item.source,
          })}
          aria-label={formatProjectOverviewPanelCopy(copy['projectOverview.stack.detectedFrom'], {
            name: item.name,
            source: item.source,
          })}
        >
          <div className="break-all text-sm font-semibold text-bolt-elements-textPrimary">{item.name}</div>
          <div className="mt-0.5 max-w-full break-all text-[11px] text-bolt-elements-textTertiary">
            {projectOverviewCategoryLabel(item.category, language)} · {item.source}
          </div>
        </div>
      ))}
    </div>
  );
}

function ScriptList({ scripts, copy }: { scripts: ProjectOverviewScript[]; copy: ProjectOverviewPanelCopy }) {
  if (!scripts.length) {
    return <EmptyOverviewBlock>{copy['projectOverview.empty.scripts']}</EmptyOverviewBlock>;
  }

  return (
    <div className="grid gap-2">
      {scripts.slice(0, 6).map((script) => (
        <div
          key={`${script.manifestPath}:${script.name}`}
          className="min-w-0 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-2"
          role="group"
          aria-label={formatProjectOverviewPanelCopy(copy['projectOverview.script.aria'], {
            name: script.name,
            command: script.runCommand,
          })}
        >
          <div className="flex min-w-0 flex-col items-stretch gap-2 min-[420px]:flex-row min-[420px]:items-start min-[420px]:justify-between min-[420px]:gap-3">
            <strong className="min-w-0 break-all text-sm text-bolt-elements-textPrimary">{script.name}</strong>
            <code className="max-w-full overflow-x-auto whitespace-nowrap rounded bg-bolt-elements-background-depth-3 px-1.5 py-1 text-[11px] text-bolt-elements-textSecondary">
              {script.runCommand}
            </code>
          </div>
          <code className="mt-1 block max-w-full overflow-x-auto whitespace-nowrap text-xs text-bolt-elements-textSecondary">
            {script.command}
          </code>
        </div>
      ))}
    </div>
  );
}

function CommitList({
  commits,
  copy,
  language,
}: {
  commits: ProjectOverviewCommit[];
  copy: ProjectOverviewPanelCopy;
  language?: string;
}) {
  if (!commits.length) {
    return <EmptyOverviewBlock>{copy['projectOverview.empty.commits']}</EmptyOverviewBlock>;
  }

  return (
    <div className="grid gap-2">
      {commits.map((commit, index) => (
        <div
          key={`${commit.sha ?? commit.message}-${commit.date ?? ''}-${index}`}
          className="min-w-0 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-2"
        >
          <div className="break-words text-sm font-medium text-bolt-elements-textPrimary">{commit.message}</div>
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-bolt-elements-textTertiary">
            {commit.shortSha ? <code className="shrink-0">{commit.shortSha}</code> : null}
            {commit.author ? <span className="min-w-0 break-words">{commit.author}</span> : null}
            {commit.date ? (
              <span className="break-words">{formatProjectOverviewPanelDate(commit.date, language)}</span>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

function MemberList({
  members,
  copy,
  language,
}: {
  members: ProjectOverviewMember[];
  copy: ProjectOverviewPanelCopy;
  language?: string;
}) {
  if (!members.length) {
    return <EmptyOverviewBlock>{copy['projectOverview.empty.members']}</EmptyOverviewBlock>;
  }

  return (
    <div className="grid gap-2">
      {members.slice(0, 6).map((member, index) => (
        <div
          key={`${member.userId}:${member.id}:${index}`}
          className="min-w-0 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-2"
        >
          <div className="flex min-w-0 flex-col items-start gap-2 min-[420px]:flex-row min-[420px]:justify-between min-[420px]:gap-3">
            <strong className="min-w-0 break-all text-sm text-bolt-elements-textPrimary">
              {member.userId || copy['projectOverview.member.unknown']}
            </strong>
            <span className="max-w-full break-words rounded-full border border-bolt-elements-borderColor px-2 py-0.5 text-[11px] text-bolt-elements-textSecondary min-[420px]:shrink-0">
              {projectOverviewMemberStatusLabel(member.status, language)}
            </span>
          </div>
          <div className="mt-1 break-all text-xs text-bolt-elements-textSecondary">
            {projectOverviewRoleLabel(member.roleKey, language)}
            {member.filePath ? <> · {member.filePath}</> : null}
          </div>
        </div>
      ))}
    </div>
  );
}

function ActivityList({
  activity,
  copy,
  language,
}: {
  activity: ProjectOverviewActivity[];
  copy: ProjectOverviewPanelCopy;
  language?: string;
}) {
  if (!activity.length) {
    return <EmptyOverviewBlock>{copy['projectOverview.empty.activity']}</EmptyOverviewBlock>;
  }

  return (
    <div className="overflow-hidden rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2">
      {activity.map((event, index) => (
        <div
          key={`${event.action}-${event.createdAt ?? index}`}
          className="border-b border-bolt-elements-borderColor px-3 py-2 last:border-b-0"
        >
          <div className="break-all text-sm font-medium text-bolt-elements-textPrimary">
            {projectOverviewActivityLabel(event.action, language)}
          </div>
          <div className="mt-1 break-words text-xs text-bolt-elements-textSecondary">
            {formatProjectOverviewPanelDate(event.createdAt, language)}
          </div>
        </div>
      ))}
    </div>
  );
}

export function ProjectOverviewPanel({ data, project }: ProjectOverviewPanelProps) {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const copy = getProjectOverviewPanelCopy(language);
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

  const fileCount = Number.isFinite(overview.summary.fileCount) ? Math.max(0, overview.summary.fileCount) : 0;
  const scriptCount = Number.isFinite(overview.summary.scriptCount) ? Math.max(0, overview.summary.scriptCount) : 0;

  const activeMemberCount = Number.isFinite(overview.summary.activeMemberCount)
    ? Math.max(0, overview.summary.activeMemberCount)
    : 0;

  const projectName = project.name ?? project.id ?? copy['projectOverview.project.fallback'];
  const sourceLabel = projectOverviewSourceLabel(overview.summary.sourceType, language);
  const workspaceLabel = projectOverviewWorkspaceStatusLabel(overview.summary.workspaceStatus, language);
  const runtimeModeLabel = projectOverviewWorkspaceStatusLabel(overview.summary.runtimeMode ?? 'unavailable', language);
  const createdAtLabel = formatProjectOverviewPanelDate(overview.summary.projectCreatedAt, language);
  const updatedAtLabel = formatProjectOverviewPanelDate(overview.summary.projectUpdatedAt, language);

  const metricAriaLabel = (label: string, value: string, detail: string) =>
    formatProjectOverviewPanelCopy(copy['projectOverview.metric.aria'], { label, value, detail });

  /*
   * SCR-008 — jauges RAM / CPU / stockage. La source est le lecteur cgroup du
   * workspace-agent : `null` veut dire « le noyau ne l'expose pas », et se rend
   * « non communiqué », jamais zéro.
   */
  const resources = data.resources;

  const byteCopy = {
    unknown: copy['projectOverview.resources.unknown'],
    noLimit: copy['projectOverview.resources.noLimit'],
    usedOfLimit: copy['projectOverview.resources.usedOfLimit'],
  };

  const memoryGauge = describeByteGauge(resources?.memory, byteCopy, language);
  const storageGauge = describeByteGauge(resources?.storage, byteCopy, language);

  const cpuGauge = describeCpuGauge(
    resources?.cpu,
    { pending: copy['projectOverview.resources.cpuPending'] },
    language,
  );

  const cpuCores = resources?.cpu?.limitCores;

  const cpuDetail =
    typeof cpuCores === 'number' && Number.isFinite(cpuCores) && cpuCores > 0
      ? formatProjectOverviewPanelCopy(
          cpuCores === 1
            ? copy['projectOverview.resources.cpuCores']
            : copy['projectOverview.resources.cpuCoresPlural'],
          { cores: formatProjectOverviewPanelNumber(cpuCores, language) },
        )
      : undefined;

  const measuredAtLabel = resources?.measuredAt
    ? formatProjectOverviewPanelCopy(copy['projectOverview.resources.measuredAt'], {
        date: formatProjectOverviewPanelDate(resources.measuredAt, language),
      })
    : undefined;

  const gaugeAria = (label: string, display: GaugeDisplay, detail?: string) =>
    formatProjectOverviewPanelCopy(copy['projectOverview.resources.gaugeAria'], {
      label,
      value: display.value,
      detail: detail ?? '',
    });

  return (
    <div
      className="grid min-w-0 gap-5"
      data-testid="project-overview-panel"
      role="region"
      aria-label={formatProjectOverviewPanelCopy(copy['projectOverview.panel.aria'], { project: projectName })}
    >
      <section className="min-w-0 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-4 py-4">
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="break-words text-[11px] font-semibold uppercase tracking-[0.08em] text-bolt-elements-textTertiary">
              {copy['projectOverview.kicker']}
            </div>
            <h3 className="m-0 mt-1 break-all text-base font-semibold text-bolt-elements-textPrimary">{projectName}</h3>
          </div>
          <div
            className="max-w-full break-all rounded-full border border-bolt-elements-borderColor px-2.5 py-1 text-xs text-bolt-elements-textSecondary sm:shrink-0"
            title={formatProjectOverviewPanelCopy(copy['projectOverview.source.label'], { source: sourceLabel })}
            aria-label={formatProjectOverviewPanelCopy(copy['projectOverview.source.label'], { source: sourceLabel })}
          >
            {sourceLabel}
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <OverviewMetric
            label={copy['projectOverview.metric.files']}
            value={formatProjectOverviewPanelNumber(fileCount, language)}
            detail={copy['projectOverview.metric.filesDetail']}
            ariaLabel={metricAriaLabel(
              copy['projectOverview.metric.files'],
              formatProjectOverviewPanelNumber(fileCount, language),
              copy['projectOverview.metric.filesDetail'],
            )}
          />
          <OverviewMetric
            label={copy['projectOverview.metric.branch']}
            value={overview.summary.branch || 'main'}
            detail={copy['projectOverview.metric.branchDetail']}
            ariaLabel={metricAriaLabel(
              copy['projectOverview.metric.branch'],
              overview.summary.branch || 'main',
              copy['projectOverview.metric.branchDetail'],
            )}
          />
          <OverviewMetric
            label={copy['projectOverview.metric.workspace']}
            value={workspaceLabel}
            detail={runtimeModeLabel}
            ariaLabel={metricAriaLabel(copy['projectOverview.metric.workspace'], workspaceLabel, runtimeModeLabel)}
          />
          <OverviewMetric
            label={copy['projectOverview.metric.created']}
            value={createdAtLabel}
            detail={formatProjectOverviewPanelCopy(copy['projectOverview.metric.updated'], {
              date: updatedAtLabel,
            })}
            ariaLabel={metricAriaLabel(
              copy['projectOverview.metric.created'],
              createdAtLabel,
              formatProjectOverviewPanelCopy(copy['projectOverview.metric.updated'], { date: updatedAtLabel }),
            )}
          />
        </div>
      </section>

      <OverviewSection title={copy['projectOverview.section.resources']} action={measuredAtLabel}>
        <div className="grid gap-3 sm:grid-cols-3" data-testid="project-overview-resources">
          <OverviewGauge
            label={copy['projectOverview.resources.memory']}
            display={memoryGauge}
            ariaLabel={gaugeAria(copy['projectOverview.resources.memory'], memoryGauge)}
          />
          <OverviewGauge
            label={copy['projectOverview.resources.cpu']}
            display={cpuGauge}
            detail={cpuDetail}
            ariaLabel={gaugeAria(copy['projectOverview.resources.cpu'], cpuGauge, cpuDetail)}
          />
          <OverviewGauge
            label={copy['projectOverview.resources.storage']}
            display={storageGauge}
            ariaLabel={gaugeAria(copy['projectOverview.resources.storage'], storageGauge)}
          />
        </div>
        {resources?.unavailable ? (
          <p className="mt-2 text-xs leading-5 text-bolt-elements-textTertiary">
            {copy['projectOverview.resources.unavailable']}
          </p>
        ) : null}
      </OverviewSection>

      <OverviewSection
        title={copy['projectOverview.section.stack']}
        action={formatProjectOverviewPanelCount(language, overview.stack.length, {
          one: copy['projectOverview.count.signals.one'],
          other: copy['projectOverview.count.signals.other'],
        })}
      >
        <StackList stack={overview.stack} copy={copy} language={language} />
      </OverviewSection>

      <div className="grid gap-5 xl:grid-cols-2">
        <OverviewSection
          title={copy['projectOverview.section.scripts']}
          action={formatProjectOverviewPanelCount(language, scriptCount, {
            one: copy['projectOverview.count.scripts.one'],
            other: copy['projectOverview.count.scripts.other'],
          })}
        >
          <ScriptList scripts={overview.scripts} copy={copy} />
        </OverviewSection>

        <OverviewSection
          title={copy['projectOverview.section.members']}
          action={formatProjectOverviewPanelCount(language, activeMemberCount, {
            one: copy['projectOverview.count.activeMembers.one'],
            other: copy['projectOverview.count.activeMembers.other'],
          })}
        >
          <MemberList members={overview.members} copy={copy} language={language} />
        </OverviewSection>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <OverviewSection title={copy['projectOverview.section.commits']}>
          <CommitList commits={overview.commits} copy={copy} language={language} />
        </OverviewSection>

        <OverviewSection title={copy['projectOverview.section.activity']}>
          <ActivityList activity={overview.activity} copy={copy} language={language} />
        </OverviewSection>
      </div>
    </div>
  );
}
