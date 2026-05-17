import { useStore } from '@nanostores/react';
import { type LoaderFunctionArgs, type MetaFunction } from '@remix-run/cloudflare';
import { useLoaderData } from '@remix-run/react';
import { Link } from '@remix-run/react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  Clock3,
  Copy,
  Download,
  Files,
  GitBranch,
  Home,
  MoreHorizontal,
  PenLine,
  Play,
  Rocket,
  Settings,
  Share2,
  Square,
  Trash2,
  User,
  UserPlus,
} from 'lucide-react';
import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { ClientOnly } from 'remix-utils/client-only';
import { BaseChat } from '~/components/chat/BaseChat';
import { ZoneErrorBoundary } from '~/components/ui/PanelBoundary';
import { apiErrorMessage, apiRequest, json } from '~/lib/enterprise-api.server';
import { friendlyLabel, pickFriendlyLabel } from '~/lib/labels/friendly-id';
import { ProjectWorkspaceProvider } from '~/lib/runtime/ProjectWorkspaceProvider';
import { isWorkspaceReallyRunning, workspaceUiState } from '~/lib/runtime/workspace-status';
import { workbenchStore } from '~/lib/stores/workbench';

const ProjectIdeChat = lazy(() => import('~/components/chat/Chat.client').then((module) => ({ default: module.Chat })));

type ProjectLoaderData = {
  projectId: string;
  project: {
    id: string;
    name: string;
    organizationId?: string;
    gitDefaultBranch?: string;
  };
  workspace: {
    id?: string;
    name?: string;
    status?: string;
    runtimeMode?: string;
    ports?: Array<{ port?: number; ready?: boolean; url?: string }>;
  } | null;
  organization: {
    id: string;
    name?: string;
    slug?: string;
  } | null;
  git: {
    branch?: string;
  };
  collaborators: Array<{ id?: string; userId?: string; roleKey?: string }>;
  notifications: Array<{ id?: string; action: string; createdAt?: string; metadata?: unknown }>;
  initialIdePanels: Record<
    string,
    {
      panel: string;
      project: ProjectLoaderData['project'];
      status: 'ok' | 'empty' | 'error';
      data: unknown;
    }
  >;
  projectApiError?: string;
};

type IdeNotificationKind = 'success' | 'warning' | 'error' | 'info';
type IdeNotification = {
  id: string;
  title: string;
  detail: string;
  timeLabel: string;
  source: 'Backend activity' | 'Runtime' | 'Preview';
  kind: IdeNotificationKind;
  href: string;
};

export const meta: MetaFunction<typeof loader> = ({ data }) => [
  { title: data ? `Bolt IDE - ${data.projectId}` : 'Bolt IDE' },
  { name: 'description', content: 'Bolt IDE connected to a persistent project workspace.' },
];

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  if (!params.projectId) {
    throw new Response('Project not found', { status: 404 });
  }

  const projectId = params.projectId;

  try {
    const result = await apiRequest<{ project: ProjectLoaderData['project'] }>(request, `/projects/${projectId}`);

    const [collaboratorsResult, dashboardResult, organizationsResult] = await Promise.all([
      apiRequest<{ collaborators: ProjectLoaderData['collaborators'] }>(
        request,
        `/projects/${projectId}/collaborators`,
      ).catch(() => ({ collaborators: [] })),
      apiRequest<{
        workspace?: ProjectLoaderData['workspace'];
        git?: ProjectLoaderData['git'];
        recentActivity?: ProjectLoaderData['notifications'];
      }>(request, `/projects/${projectId}/dashboard`).catch(() => ({ workspace: null, git: {}, recentActivity: [] })),
      apiRequest<{ organizations: NonNullable<ProjectLoaderData['organization']>[] }>(request, '/orgs').catch(() => ({
        organizations: [],
      })),
    ]);
    const organization =
      organizationsResult.organizations.find((item) => item.id === result.project.organizationId) ??
      organizationsResult.organizations[0] ??
      null;

    return json<ProjectLoaderData>({
      projectId,
      project: result.project,
      workspace: dashboardResult.workspace ?? null,
      organization,
      git: dashboardResult.git ?? {},
      collaborators: collaboratorsResult.collaborators ?? [],
      notifications: dashboardResult.recentActivity ?? [],
      initialIdePanels: {
        git: {
          panel: 'git',
          project: result.project,
          status: 'ok',
          data: { status: dashboardResult.git ?? {} },
        },
      },
    });
  } catch (error) {
    const message = await apiErrorMessage(error, 'Project API unavailable');

    return json<ProjectLoaderData>({
      projectId,
      project: { id: projectId, name: projectId },
      workspace: null,
      organization: null,
      git: {},
      collaborators: [],
      notifications: [],
      initialIdePanels: {},
      projectApiError: message,
    });
  }
};

export default function ProjectIdeRoute() {
  const {
    projectId,
    project,
    workspace,
    organization,
    git,
    collaborators,
    notifications,
    initialIdePanels,
    projectApiError,
  } = useLoaderData<typeof loader>();
  const optimisticShell = (
    <BaseChat chatStarted projectIdeMode projectId={projectId} initialIdePanels={initialIdePanels} />
  );

  return (
    <ProjectWorkspaceProvider projectId={projectId} initialError={projectApiError}>
      <div className="bolt-project-ide-shell h-dvh w-screen overflow-hidden">
        <IdeProjectTopBar
          projectId={projectId}
          project={project}
          workspace={workspace}
          organization={organization}
          git={git}
          collaborators={collaborators}
          notifications={notifications}
          projectApiError={projectApiError}
        />
        <main className="h-dvh pt-9">
          <ClientOnly fallback={optimisticShell}>
            {() => (
              <ZoneErrorBoundary zone="editor" title="Bolt IDE" boundaryId={`project:${projectId}:ide`}>
                <Suspense fallback={optimisticShell}>
                  <ProjectIdeChat
                    forceWorkbench
                    projectIdeMode
                    projectId={projectId}
                    initialIdePanels={initialIdePanels}
                  />
                </Suspense>
              </ZoneErrorBoundary>
            )}
          </ClientOnly>
        </main>
      </div>
    </ProjectWorkspaceProvider>
  );
}

function IdeProjectTopBar({
  projectId,
  project,
  workspace,
  organization,
  git,
  collaborators,
  notifications,
  projectApiError,
}: {
  projectId: string;
  project: ProjectLoaderData['project'];
  workspace: ProjectLoaderData['workspace'];
  organization: ProjectLoaderData['organization'];
  git: ProjectLoaderData['git'];
  collaborators: ProjectLoaderData['collaborators'];
  notifications: ProjectLoaderData['notifications'];
  projectApiError?: string;
}) {
  const loading = useStore(workbenchStore.workspaceLoading);
  const error = useStore(workbenchStore.workspaceError);
  const previews = useStore(workbenchStore.previews);
  const runtimeWorkspaceStatus = useStore(workbenchStore.workspaceStatus);
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [overflowMenuOpen, setOverflowMenuOpen] = useState(false);
  const overflowMenuRef = useRef<HTMLDivElement>(null);
  const [displayProjectName, setDisplayProjectName] = useState(project.name);
  const [renamingProject, setRenamingProject] = useState(false);
  const [renameValue, setRenameValue] = useState(project.name);
  const [renameSaving, setRenameSaving] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const filesPanelOpen = useStore(workbenchStore.projectFilesPanelOpen);
  const effectiveWorkspace = runtimeWorkspaceStatus ?? workspace;
  const isReallyRunning = isWorkspaceReallyRunning(effectiveWorkspace, previews);
  const previewRunning = isReallyRunning;
  const workspaceState = workspaceUiState(effectiveWorkspace, { ports: previews, loading, error });

  const state =
    workspaceState === 'starting'
      ? 'building'
      : workspaceState === 'error'
        ? 'crashed'
        : workspaceState === 'running'
          ? 'running'
          : 'stopped';

  const statusLabel =
    state === 'building'
      ? 'Building...'
      : state === 'crashed'
        ? 'Crashed'
        : state === 'running'
          ? 'Running'
          : 'Stopped';
  const notificationItems = useMemo(
    () =>
      buildIdeNotifications({
        projectId,
        backendEvents: notifications,
        runtimeState: state,
        runtimeStatusLabel: statusLabel,
        runtimeError: projectApiError ?? error,
        previewPorts: previews.map((preview) => preview.port),
      }),
    [error, notifications, previews, projectApiError, projectId, state, statusLabel],
  );
  const actionableNotificationCount = notificationItems.filter(
    (item) => item.kind === 'warning' || item.kind === 'error',
  ).length;

  const visibleCollaborators = collaborators.length ? collaborators : [{ userId: 'you', roleKey: 'owner' }];

  const workspaceLabel = pickFriendlyLabel(
    [organization?.name, organization?.slug, workspace?.name, workspace?.id, project.organizationId],
    'Workspace',
  );

  const projectLabel = friendlyLabel(displayProjectName, 'Untitled project');

  const branchLabel = pickFriendlyLabel([git.branch, project.gitDefaultBranch], 'main');

  useEffect(() => {
    setDisplayProjectName(project.name);
    setRenameValue(project.name);
  }, [project.name]);

  useEffect(() => {
    if (renamingProject) {
      window.requestAnimationFrame(() => {
        renameInputRef.current?.focus();
        renameInputRef.current?.select();
      });
    }
  }, [renamingProject]);

  useEffect(() => {
    if (!overflowMenuOpen) {
      return undefined;
    }

    const closeOnOutside = (event: PointerEvent) => {
      const target = event.target;

      if (target instanceof Node && overflowMenuRef.current?.contains(target)) {
        return;
      }

      setOverflowMenuOpen(false);
    };

    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOverflowMenuOpen(false);
      }
    };

    document.addEventListener('pointerdown', closeOnOutside);
    document.addEventListener('keydown', closeOnEscape);

    return () => {
      document.removeEventListener('pointerdown', closeOnOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [overflowMenuOpen]);

  const startInlineRename = () => {
    setProjectMenuOpen(false);
    setRenameError(null);
    setRenameValue(displayProjectName);
    setRenamingProject(true);
  };

  const cancelInlineRename = () => {
    setRenameError(null);
    setRenameValue(displayProjectName);
    setRenamingProject(false);
  };

  const handleRenameKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      cancelInlineRename();
    }
  };

  const submitInlineRename = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const nextName = renameValue.trim();

    if (!nextName || nextName === displayProjectName) {
      cancelInlineRename();
      return;
    }

    setRenameSaving(true);
    setRenameError(null);

    try {
      const form = new FormData();
      form.set('intent', 'rename');
      form.set('projectName', displayProjectName);
      form.set('name', nextName);

      const response = await fetch(`/api/projects/${projectId}/project-action`, {
        method: 'POST',
        body: form,
        credentials: 'include',
      });

      if (!response.ok) {
        const result = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(result.error || 'Project rename failed.');
      }

      setDisplayProjectName(nextName);
      setRenameValue(nextName);
      setRenamingProject(false);
    } catch (error) {
      setRenameError(error instanceof Error ? error.message : 'Project rename failed.');
    } finally {
      setRenameSaving(false);
    }
  };

  return (
    <header className="bolt-project-topbar fixed left-0 top-0 z-50 flex w-screen items-center justify-between border-b text-[12px]">
      <div className="bolt-project-topbar-left">
        <Link to="/dashboard" className="bolt-project-topbar-icon-button" aria-label="VibeCore dashboard">
          <Home className="h-4 w-4" aria-hidden />
        </Link>
        <nav className="bolt-project-breadcrumb" aria-label="Project breadcrumb">
          <Link
            to="/projects"
            className="bolt-project-breadcrumb-segment bolt-project-breadcrumb-workspace"
            aria-label={`Workspace ${workspaceLabel.display}${
              workspaceLabel.isFallback && workspaceLabel.full !== workspaceLabel.display
                ? ` (id ${workspaceLabel.full})`
                : ''
            }`}
            title={
              workspaceLabel.isFallback && workspaceLabel.full !== workspaceLabel.display
                ? `Workspace: ${workspaceLabel.display} (${workspaceLabel.full})`
                : `Workspace: ${workspaceLabel.display}`
            }
          >
            <span className="bolt-project-breadcrumb-kicker">Workspace</span>
            <span className="bolt-project-breadcrumb-value truncate">{workspaceLabel.display}</span>
          </Link>
          <span className="bolt-project-breadcrumb-separator" aria-hidden>
            /
          </span>
          {renamingProject ? (
            <form className="bolt-project-rename-form" onSubmit={submitInlineRename}>
              <input
                ref={renameInputRef}
                value={renameValue}
                onChange={(event) => setRenameValue(event.target.value)}
                onKeyDown={handleRenameKeyDown}
                className="bolt-project-rename-input"
                aria-label="Project name"
                title={renameError || 'Edit project name. Press Enter to save or Escape to cancel.'}
                disabled={renameSaving}
              />
              <button type="submit" className="bolt-project-rename-save" disabled={renameSaving || !renameValue.trim()}>
                {renameSaving ? 'Saving' : 'Save'}
              </button>
            </form>
          ) : (
            <div className="bolt-project-name-shell">
              <details
                className="relative min-w-0"
                open={projectMenuOpen}
                onToggle={(event) => setProjectMenuOpen(event.currentTarget.open)}
              >
                <summary
                  className="bolt-project-name-trigger"
                  title={
                    projectLabel.isFallback && projectLabel.full !== projectLabel.display
                      ? `Project: ${projectLabel.display} (${projectLabel.full})`
                      : `Project: ${projectLabel.display}`
                  }
                  aria-label={`Project menu for ${projectLabel.display}${
                    projectLabel.isFallback && projectLabel.full !== projectLabel.display
                      ? ` (id ${projectLabel.full})`
                      : ''
                  }`}
                  onDoubleClick={(event) => {
                    event.preventDefault();
                    startInlineRename();
                  }}
                >
                  <span className="bolt-project-breadcrumb-kicker">Project</span>
                  <span className="bolt-project-breadcrumb-value truncate" title={projectLabel.display}>
                    {projectLabel.display}
                  </span>
                  <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                </summary>
                {projectMenuOpen && (
                  <div className="absolute left-0 top-full z-50 mt-1 w-56 rounded-lg border border-[var(--vc-ide-border-visible)] bg-[var(--vc-ide-bg-card)] p-1.5 shadow-[var(--vc-ui-shadow-xl)]">
                    <ProjectMenuItem
                      to={`/projects/${projectId}/ide?panel=settings`}
                      icon={<Settings className="h-3.5 w-3.5" />}
                      onClick={() => {
                        setProjectMenuOpen(false);
                        window.dispatchEvent(
                          new CustomEvent('vibecore:open-project-ide-panel', { detail: { panel: 'settings' } }),
                        );
                      }}
                    >
                      Settings
                    </ProjectMenuItem>
                    <ProjectMenuAction
                      action={`/api/projects/${projectId}/project-action`}
                      intent="fork"
                      projectName={displayProjectName}
                      icon={<Copy className="h-3.5 w-3.5" />}
                    >
                      Fork
                    </ProjectMenuAction>
                    <ProjectMenuAction
                      action={`/api/projects/${projectId}/project-action`}
                      intent="rename"
                      projectName={displayProjectName}
                      icon={<PenLine className="h-3.5 w-3.5" />}
                    >
                      Rename
                    </ProjectMenuAction>
                    <ProjectMenuAction
                      action={`/api/projects/${projectId}/project-action`}
                      intent="delete"
                      projectName={displayProjectName}
                      icon={<Trash2 className="h-3.5 w-3.5 text-[#F85149]" />}
                    >
                      Delete
                    </ProjectMenuAction>
                    <ProjectMenuAction
                      action={`/api/projects/${projectId}/project-action`}
                      intent="duplicate"
                      projectName={displayProjectName}
                      icon={<Copy className="h-3.5 w-3.5" />}
                    >
                      Duplicate
                    </ProjectMenuAction>
                    <ProjectMenuItem
                      to={`/api/projects/${projectId}/project-action?intent=export`}
                      icon={<Download className="h-3.5 w-3.5" />}
                    >
                      Export
                    </ProjectMenuItem>
                  </div>
                )}
              </details>
              <button
                type="button"
                className="bolt-project-inline-rename-button"
                aria-label={`Rename ${displayProjectName}`}
                title={`Rename ${displayProjectName}`}
                onClick={startInlineRename}
              >
                <PenLine className="h-3 w-3" aria-hidden />
              </button>
            </div>
          )}
          <span className="bolt-project-breadcrumb-separator" aria-hidden>
            /
          </span>
          <Link
            to={`/projects/${projectId}/ide?panel=git`}
            className="bolt-project-breadcrumb-segment bolt-project-breadcrumb-branch"
            aria-label={`Branch ${branchLabel.display}. Open Git panel.`}
            title={`Branch: ${branchLabel.display}. Open Git panel.`}
            onClick={() => {
              window.dispatchEvent(new CustomEvent('vibecore:open-project-ide-panel', { detail: { panel: 'git' } }));
            }}
          >
            <GitBranch className="h-3.5 w-3.5" aria-hidden />
            <span className="bolt-project-breadcrumb-kicker">Branch</span>
            <span className="bolt-project-breadcrumb-value truncate">{branchLabel.display}</span>
          </Link>
        </nav>
      </div>
      <div className="bolt-project-topbar-actions">
        <div
          ref={overflowMenuRef}
          className="bolt-project-action-group bolt-project-action-group--overflow"
          data-priority="overflow"
          aria-label="More actions"
        >
          <button
            type="button"
            className="bolt-project-topbar-icon-button"
            aria-label="More topbar actions"
            aria-haspopup="menu"
            aria-expanded={overflowMenuOpen}
            title="More actions"
            onClick={() => setOverflowMenuOpen((value) => !value)}
          >
            <MoreHorizontal className="h-3.5 w-3.5" aria-hidden />
            {notificationItems.length > 0 && (
              <span
                className="bolt-project-notification-dot"
                data-urgent={actionableNotificationCount > 0 ? 'true' : 'false'}
                aria-hidden
              />
            )}
          </button>
          {overflowMenuOpen && (
            <div
              role="dialog"
              aria-label="More IDE actions"
              className="bolt-project-overflow-popover absolute right-0 top-full z-50 mt-1 w-[360px] max-w-[calc(100vw-1rem)] rounded-xl border p-2"
            >
              <div className="bolt-project-overflow-section">
                <div className="bolt-project-notification-header">
                  <div>
                    <strong>IDE notifications</strong>
                    <span>Project activity and workspace signals</span>
                  </div>
                  <span className="bolt-project-notification-count">
                    {notificationItems.length} {notificationItems.length === 1 ? 'event' : 'events'}
                  </span>
                </div>
                {notificationItems.length ? (
                  <div className="bolt-project-notification-list">
                    {notificationItems.slice(0, 5).map((notification) => {
                      const Icon = notificationIcon(notification.kind);

                      return (
                        <Link
                          key={notification.id}
                          to={notification.href}
                          className="bolt-project-notification-item"
                          data-kind={notification.kind}
                          onClick={() => setOverflowMenuOpen(false)}
                        >
                          <span className="bolt-project-notification-icon" aria-hidden>
                            <Icon className="h-3.5 w-3.5" />
                          </span>
                          <span className="min-w-0">
                            <span className="bolt-project-notification-title">{notification.title}</span>
                            <span className="bolt-project-notification-detail">{notification.detail}</span>
                            <span className="bolt-project-notification-meta">
                              <span>{notification.source}</span>
                              <span aria-hidden>•</span>
                              <span>{notification.timeLabel}</span>
                            </span>
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                ) : (
                  <div className="bolt-project-notification-empty">
                    <CheckCircle2 className="h-4 w-4" aria-hidden />
                    <span>No IDE events recorded yet.</span>
                    <small>Runtime, preview and backend project activity will appear here automatically.</small>
                  </div>
                )}
              </div>
              <div className="bolt-project-overflow-section bolt-project-overflow-section--grid">
                <Link to="/support" className="bolt-project-overflow-item" onClick={() => setOverflowMenuOpen(false)}>
                  <CircleHelp className="h-3.5 w-3.5" aria-hidden />
                  <span>Help &amp; support</span>
                </Link>
                <Link
                  to={`/projects/${projectId}/ide?panel=collaborators`}
                  className="bolt-project-overflow-item"
                  onClick={() => setOverflowMenuOpen(false)}
                >
                  <Share2 className="h-3.5 w-3.5" aria-hidden />
                  <span>
                    {visibleCollaborators.length} collaborator{visibleCollaborators.length === 1 ? '' : 's'}
                  </span>
                </Link>
                <button
                  type="button"
                  className="bolt-project-overflow-item"
                  onClick={() => {
                    const detail = { open: !filesPanelOpen };
                    workbenchStore.requestProjectFilesPanel(detail.open);
                    window.dispatchEvent(new CustomEvent('vibecore:toggle-project-files-panel', { detail }));
                    setOverflowMenuOpen(false);
                  }}
                >
                  <Files className="h-3.5 w-3.5" aria-hidden />
                  <span>{filesPanelOpen ? 'Close files panel' : 'Open files panel'}</span>
                </button>
                <Link
                  to="/account-settings"
                  className="bolt-project-overflow-item"
                  onClick={() => setOverflowMenuOpen(false)}
                >
                  <User className="h-3.5 w-3.5" aria-hidden />
                  <span>Account</span>
                </Link>
              </div>
              <form method="post" action="/logout">
                <button type="submit" className="bolt-project-overflow-item bolt-project-overflow-item--danger">
                  <User className="h-3.5 w-3.5" aria-hidden />
                  <span>Sign out</span>
                </button>
              </form>
            </div>
          )}
        </div>
        <div className="bolt-project-action-group bolt-project-action-group--collaborate" data-priority="high">
          <details className="bolt-project-collaborate-menu">
            <summary
              className="bolt-project-topbar-icon-button"
              aria-label="Collaborate"
              title="Collaborate: share or invite"
              data-vc-tooltip="Collaborate"
            >
              <Share2 className="h-3.5 w-3.5" aria-hidden />
            </summary>
            <div
              role="menu"
              aria-label="Collaborate"
              className="bolt-project-collaborate-popover absolute right-0 top-full z-50 mt-1 w-[220px] rounded-xl border p-2"
            >
              <Link to={`/projects/${projectId}/ide?panel=collaborators`} className="bolt-project-overflow-item">
                <Share2 className="h-3.5 w-3.5" aria-hidden />
                <span>Share project</span>
              </Link>
              <Link to={`/projects/${projectId}/ide?panel=collaborators`} className="bolt-project-overflow-item">
                <UserPlus className="h-3.5 w-3.5" aria-hidden />
                <span>Invite collaborators</span>
              </Link>
            </div>
          </details>
        </div>
        <div
          className="bolt-project-action-group bolt-project-action-group--primary"
          data-priority="high"
          aria-label="Run and publish"
        >
          <button
            type="button"
            data-testid="button-run-stop"
            className={previewRunning ? 'bolt-project-run-button is-running' : 'bolt-project-run-button'}
            onClick={() => {
              if (previewRunning) {
                void workbenchStore.stopPreviewServer().catch(() => undefined);

                return;
              }

              window.dispatchEvent(
                new CustomEvent('vibecore:open-project-ide-panel', { detail: { panel: 'preview' } }),
              );
            }}
          >
            {previewRunning ? (
              <>
                <Square className="h-3 w-3 fill-current" aria-hidden />
                <span>Stop</span>
              </>
            ) : (
              <>
                <Play className="h-3 w-3 fill-current" aria-hidden />
                <span>Run</span>
              </>
            )}
          </button>
          <Link to={`/projects/${projectId}/ide?panel=deployments`} className="bolt-project-publish-button">
            <Rocket className="h-3 w-3" aria-hidden />
            Publish
          </Link>
        </div>
      </div>
    </header>
  );
}

function buildIdeNotifications({
  projectId,
  backendEvents,
  runtimeState,
  runtimeStatusLabel,
  runtimeError,
  previewPorts,
}: {
  projectId: string;
  backendEvents: ProjectLoaderData['notifications'];
  runtimeState: 'building' | 'crashed' | 'running' | 'stopped';
  runtimeStatusLabel: string;
  runtimeError?: string | null;
  previewPorts: number[];
}): IdeNotification[] {
  const runtimeNotification: IdeNotification = {
    id: `runtime-${runtimeState}`,
    title: `Workspace ${runtimeStatusLabel.toLowerCase()}`,
    detail:
      runtimeState === 'crashed'
        ? runtimeError || 'The workspace runtime reported an error.'
        : runtimeState === 'running'
          ? 'The IDE runtime is connected and ready for commands.'
          : runtimeState === 'building'
            ? 'The workspace is starting and preparing project services.'
            : 'The workspace runtime is currently idle.',
    timeLabel: 'Live',
    source: 'Runtime',
    kind: runtimeState === 'crashed' ? 'error' : runtimeState === 'building' ? 'warning' : 'info',
    href: `/projects/${projectId}/ide?panel=logs`,
  };

  const previewNotification: IdeNotification | null = previewPorts.length
    ? {
        id: `preview-${previewPorts.join('-')}`,
        title: 'Preview server available',
        detail: `Live preview ${previewPorts.length === 1 ? 'port' : 'ports'}: ${previewPorts.join(', ')}`,
        timeLabel: 'Live',
        source: 'Preview',
        kind: 'success',
        href: `/projects/${projectId}/ide?panel=preview`,
      }
    : null;

  const backendNotifications = backendEvents.map((event, index) => {
    const createdAt = event.createdAt ? new Date(event.createdAt) : null;

    return {
      id: event.id ?? `activity-${event.action}-${event.createdAt ?? index}`,
      title: formatActivityTitle(event.action),
      detail: activityDetail(event.action, event.metadata),
      timeLabel: createdAt ? createdAt.toLocaleString() : 'Recorded by API',
      source: 'Backend activity' as const,
      kind: classifyActivityKind(event.action),
      href: `/projects/${projectId}/ide?panel=activity`,
    };
  });

  return [runtimeNotification, ...(previewNotification ? [previewNotification] : []), ...backendNotifications].slice(
    0,
    12,
  );
}

function formatActivityTitle(action: string) {
  return action
    .replace(/[_:.-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function activityDetail(action: string, metadata: unknown) {
  if (metadata && typeof metadata === 'object' && 'message' in metadata && typeof metadata.message === 'string') {
    return metadata.message;
  }

  if (action.includes('deploy')) {
    return 'Deployment activity was recorded by the project API.';
  }

  if (action.includes('collaborator') || action.includes('member')) {
    return 'Team or collaborator access changed.';
  }

  if (action.includes('snapshot')) {
    return 'A project snapshot event was recorded.';
  }

  if (action.includes('settings')) {
    return 'Project configuration changed.';
  }

  if (action.includes('ai.tool')) {
    return 'An AI tool action changed the workspace.';
  }

  return 'Project activity recorded by the backend.';
}

function classifyActivityKind(action: string): IdeNotificationKind {
  const normalized = action.toLowerCase();

  if (normalized.includes('fail') || normalized.includes('error') || normalized.includes('delete')) {
    return 'error';
  }

  if (normalized.includes('warning') || normalized.includes('quota') || normalized.includes('security')) {
    return 'warning';
  }

  if (normalized.includes('create') || normalized.includes('deploy') || normalized.includes('snapshot')) {
    return 'success';
  }

  return 'info';
}

function notificationIcon(kind: IdeNotificationKind) {
  switch (kind) {
    case 'success':
      return CheckCircle2;
    case 'warning':
      return AlertTriangle;
    case 'error':
      return AlertTriangle;
    default:
      return kind === 'info' ? Activity : Clock3;
  }
}

function ProjectMenuItem({
  to,
  icon,
  children,
  onClick,
}: {
  to: string;
  icon?: ReactNode;
  children: ReactNode;
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  return (
    <Link
      to={to}
      className="flex h-8 items-center gap-2 rounded-md px-2 text-[12px] text-[var(--vc-ide-text-primary)] hover:bg-[var(--vc-ide-bg-hover)]"
      onClick={onClick}
    >
      {icon}
      <span>{children}</span>
    </Link>
  );
}

function ProjectMenuAction({
  action,
  intent,
  projectName,
  icon,
  children,
}: {
  action: string;
  intent: string;
  projectName: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      disabled={busy}
      className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[12px] text-[var(--vc-ide-text-primary)] hover:bg-[var(--vc-ide-bg-hover)] disabled:opacity-60"
      onClick={async () => {
        if (intent === 'delete' && !window.confirm(`Delete ${projectName}?`)) {
          return;
        }

        setBusy(true);

        try {
          const form = new FormData();
          form.set('intent', intent);
          form.set('projectName', projectName);

          if (intent === 'rename') {
            const name = window.prompt('New project name', projectName);

            if (!name) {
              setBusy(false);
              return;
            }

            form.set('name', name);
          }

          const response = await fetch(action, { method: 'POST', body: form, credentials: 'include' });

          const result = (await response.json().catch(() => ({}))) as {
            project?: { project?: { id?: string }; id?: string };
          };

          if (intent === 'delete' && response.ok) {
            window.location.href = '/projects';
          } else if ((intent === 'duplicate' || intent === 'fork') && response.ok) {
            const nextProjectId = result.project?.project?.id ?? result.project?.id;

            if (nextProjectId) {
              window.location.href = `/projects/${nextProjectId}/ide`;
            }
          } else if (intent === 'rename' && response.ok) {
            window.location.reload();
          }
        } finally {
          setBusy(false);
        }
      }}
    >
      {icon}
      <span>{busy ? 'Working...' : children}</span>
    </button>
  );
}
