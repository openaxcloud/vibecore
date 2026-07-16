import { useStore } from '@nanostores/react';
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
import { type LoaderFunctionArgs, type MetaFunction } from 'react-router';
import { useLoaderData } from 'react-router';
import { Link } from 'react-router';
import { ClientOnly } from 'remix-utils/client-only';
import { buildIdeNotifications, restartWorkspace, type IdeNotificationKind } from './projects.$projectId.ide.helpers';
import { BaseChat } from '~/components/chat/BaseChat';
import { ProjectBreadcrumbSeparator } from '~/components/project-ide/ProjectBreadcrumbSeparator';
import { ConfirmationDialog } from '~/components/ui/Dialog';
import { InputDialog } from '~/components/ui/InputDialog';
import { ZoneErrorBoundary } from '~/components/ui/PanelBoundary';
import { configuredToast } from '~/components/ui/use-toast';
import { friendlyLabel, pickFriendlyLabel } from '~/lib/labels/friendly-id';
import { loadProjectIdeData, type ProjectLoaderData } from '~/lib/project-ide-loader.server';
import { CurrentWorkspaceProvider } from '~/lib/runtime/CurrentWorkspaceContext';
import { ProjectWorkspaceProvider } from '~/lib/runtime/ProjectWorkspaceProvider';
import { isWorkspaceReallyRunning, workspaceUiState } from '~/lib/runtime/workspace-status';
import { workbenchStore } from '~/lib/stores/workbench';
import { projectIdePath, withProjectSearch } from '~/utils/project-url';

const ProjectIdeChat = lazy(() => import('~/components/chat/Chat.client').then((module) => ({ default: module.Chat })));

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  // Prefer the human project name over the raw id for the browser tab title.
  const projectName = data?.project?.name?.trim() || data?.projectId;

  return [
    { title: projectName ? `${projectName} — E-Code IDE` : 'E-Code IDE' },
    { name: 'description', content: 'E-Code IDE connected to a persistent project workspace.' },
  ];
};

const IDE_CLIENT_SEARCH_PARAMS = new Set(['panel', 'commit']);

function routeKeyWithoutClientIdeParams(url: URL) {
  const searchParams = new URLSearchParams(url.search);

  for (const param of IDE_CLIENT_SEARCH_PARAMS) {
    searchParams.delete(param);
  }

  const search = searchParams.toString();

  return `${url.pathname}${search ? `?${search}` : ''}`;
}

export const shouldRevalidate = ({
  currentUrl,
  nextUrl,
  formMethod,
  defaultShouldRevalidate,
}: {
  currentUrl: URL;
  nextUrl: URL;
  formMethod?: string;
  defaultShouldRevalidate: boolean;
}) => {
  if (formMethod && formMethod.toUpperCase() !== 'GET') {
    return defaultShouldRevalidate;
  }

  if (
    currentUrl.origin === nextUrl.origin &&
    routeKeyWithoutClientIdeParams(currentUrl) === routeKeyWithoutClientIdeParams(nextUrl) &&
    currentUrl.search !== nextUrl.search
  ) {
    return false;
  }

  return defaultShouldRevalidate;
};

export const loader = async ({ request, params }: LoaderFunctionArgs) =>
  loadProjectIdeData(request, params.projectId ?? '');

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
    workspaces,
    currentWorkspaceId,
    primaryWorkspaceId,
  } = useLoaderData<typeof loader>();

  const projectUrl = projectIdePath({ id: project.id, slug: project.slug, organizationSlug: organization?.slug });

  const optimisticShell = (
    <BaseChat
      chatStarted
      projectIdeMode
      projectId={projectId}
      projectUrl={projectUrl}
      initialIdePanels={initialIdePanels}
    />
  );

  return (
    <CurrentWorkspaceProvider
      currentWorkspaceId={currentWorkspaceId}
      primaryWorkspaceId={primaryWorkspaceId}
      workspaces={workspaces}
    >
      <ProjectWorkspaceProvider projectId={projectId} workspaceId={currentWorkspaceId} initialError={projectApiError}>
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
            projectUrl={projectUrl}
          />
          <main className="h-dvh pt-9">
            <ClientOnly fallback={optimisticShell}>
              {() => (
                <ZoneErrorBoundary zone="editor" title="E-Code IDE" boundaryId={`project:${projectId}:ide`}>
                  <Suspense fallback={optimisticShell}>
                    <ProjectIdeChat
                      forceWorkbench
                      projectIdeMode
                      projectId={projectId}
                      projectUrl={projectUrl}
                      initialIdePanels={initialIdePanels}
                    />
                  </Suspense>
                </ZoneErrorBoundary>
              )}
            </ClientOnly>
          </main>
        </div>
      </ProjectWorkspaceProvider>
    </CurrentWorkspaceProvider>
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
  projectUrl,
}: {
  projectId: string;
  project: ProjectLoaderData['project'];
  workspace: ProjectLoaderData['workspace'];
  organization: ProjectLoaderData['organization'];
  git: ProjectLoaderData['git'];
  collaborators: ProjectLoaderData['collaborators'];
  notifications: ProjectLoaderData['notifications'];
  projectApiError?: string;
  projectUrl: string;
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
        projectUrl,
        backendEvents: notifications,
        runtimeState: state,
        runtimeStatusLabel: statusLabel,
        runtimeError: projectApiError ?? error,
        previewPorts: previews.map((preview) => preview.port),
      }),
    [error, notifications, previews, projectApiError, projectUrl, state, statusLabel],
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

  const projectTooltip =
    projectLabel.isFallback && projectLabel.full !== projectLabel.display
      ? `${projectLabel.display} (${projectLabel.full})`
      : projectLabel.display;

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

  const toggleFilesPanel = (open: boolean) => {
    const detail = { open };

    workbenchStore.projectFilesPanelOpen.set(open);
    workbenchStore.requestProjectFilesPanel(open);
    window.dispatchEvent(new CustomEvent('vibecore:toggle-project-files-panel', { detail }));
  };

  const filesPanelToggleLabel = filesPanelOpen ? 'Close files panel' : 'Open files panel';

  return (
    <header className="bolt-project-topbar fixed left-0 top-0 z-50 flex w-screen items-center justify-between border-b text-[12px]">
      <div className="bolt-project-topbar-left">
        <Link to="/dashboard" className="bolt-project-topbar-icon-button" aria-label="E-Code dashboard">
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
          <ProjectBreadcrumbSeparator />
          {renamingProject ? (
            <form className="bolt-project-rename-form" onSubmit={submitInlineRename}>
              <input
                ref={renameInputRef}
                value={renameValue}
                onChange={(event) => setRenameValue(event.target.value)}
                onKeyDown={handleRenameKeyDown}
                className="bolt-project-rename-input"
                aria-label="Project name"
                aria-invalid={renameError ? true : undefined}
                aria-describedby={renameError ? 'project-rename-error' : undefined}
                title={renameError || 'Edit project name. Press Enter to save or Escape to cancel.'}
                disabled={renameSaving}
              />
              <button type="submit" className="bolt-project-rename-save" disabled={renameSaving || !renameValue.trim()}>
                {renameSaving ? 'Saving' : 'Save'}
              </button>
              {renameError ? (
                <p id="project-rename-error" role="alert" className="bolt-project-rename-error">
                  {renameError}
                </p>
              ) : null}
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
                  title={projectTooltip}
                  data-vc-tooltip={projectTooltip}
                  data-vc-tooltip-locked="true"
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
                  <span className="bolt-project-breadcrumb-value truncate" title={projectTooltip}>
                    {projectLabel.display}
                  </span>
                  <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                </summary>
                {projectMenuOpen && (
                  <div className="absolute left-0 top-full z-50 mt-1 w-56 rounded-lg border border-[var(--vc-ide-border-visible)] bg-[var(--vc-ide-bg-card)] p-1.5 shadow-[var(--vc-ui-shadow-xl)]">
                    <ProjectMenuItem
                      to={withProjectSearch(projectUrl, { panel: 'settings' })}
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
                      download
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
          <ProjectBreadcrumbSeparator />
          <Link
            to={withProjectSearch(projectUrl, { panel: 'git' })}
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
            data-testid="ide-files-panel-toggle"
            className={filesPanelOpen ? 'bolt-project-topbar-icon-button is-active' : 'bolt-project-topbar-icon-button'}
            aria-label={filesPanelToggleLabel}
            aria-pressed={filesPanelOpen}
            title={filesPanelToggleLabel}
            data-vc-tooltip={filesPanelToggleLabel}
            onClick={() => toggleFilesPanel(!filesPanelOpen)}
          >
            <Files className="h-3.5 w-3.5" aria-hidden />
          </button>
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
              className="bolt-project-overflow-popover absolute right-0 top-full z-50 mt-1 w-[min(360px,calc(100vw-1rem))] max-w-[calc(100vw-1rem)] rounded-xl border p-2"
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
                        <div key={notification.id} className="bolt-project-notification-row">
                          <Link
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
                          {notification.action?.kind === 'restart-workspace' ? (
                            <button
                              type="button"
                              data-testid="ide-notification-restart-workspace"
                              className="bolt-project-notification-action"
                              onClick={() => {
                                setOverflowMenuOpen(false);
                                restartWorkspace();
                              }}
                            >
                              <Play className="h-3 w-3 fill-current" aria-hidden />
                              <span>{notification.action.label}</span>
                            </button>
                          ) : null}
                        </div>
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
                  to={withProjectSearch(projectUrl, { panel: 'collaborators' })}
                  className="bolt-project-overflow-item"
                  onClick={() => setOverflowMenuOpen(false)}
                >
                  <Share2 className="h-3.5 w-3.5" aria-hidden />
                  <span>
                    {visibleCollaborators.length} collaborator{visibleCollaborators.length === 1 ? '' : 's'}
                  </span>
                </Link>
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
          {/* Replit parity: a visible Invite button (not an icon-only menu). The
              collaborators panel it opens already hosts both invite-by-email and
              the expirable share link (F14), so one button covers share + invite. */}
          <Link
            to={withProjectSearch(projectUrl, { panel: 'collaborators' })}
            className="bolt-project-topbar-outline-button"
            aria-label="Invite collaborators"
            title="Invite collaborators or create a share link"
          >
            <UserPlus className="h-3.5 w-3.5" aria-hidden />
            <span>Invite</span>
          </Link>
        </div>
        <div
          className="bolt-project-action-group bolt-project-action-group--primary"
          data-priority="high"
          aria-label="Run and publish"
        >
          {state === 'crashed' ? (
            <button
              type="button"
              data-testid="button-restart-workspace"
              className="bolt-project-run-button is-crashed"
              title="Restart workspace: re-provision the crashed runtime"
              data-vc-tooltip="Restart workspace"
              onClick={() => restartWorkspace()}
            >
              <Play className="h-3 w-3 fill-current" aria-hidden />
              <span>Restart workspace</span>
            </button>
          ) : (
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
          )}
          {/*
           * Unify publish on ONE path (Replit-parity: a single publish flow).
           * The most-visible Publish button MUST reach our auto-detecting deploy
           * pipeline (server/static, provider='server' included) — NOT the
           * external-provider wizard (Vercel/Netlify/…). That wizard used to be
           * the default here (panel=deployments -> ProjectDeploymentsPanel), so a
           * user clicking the top Publish never touched our server-deploy. Point
           * it at the project Deployments PAGE, whose DeployPublishCard detects
           * "express -> server deployment" and runs the snapshot->image->run
           * pipeline; the external providers live under that page's Manage tab as
           * an advanced option, no longer the default.
           */}
          <Link
            to={`/projects/${projectId}/deployments`}
            className="bolt-project-publish-button"
            title={
              (project.deploymentCount ?? 0) > 0
                ? 'Republish: ship a new deployment of this project'
                : 'Publish: create the first live deployment'
            }
          >
            <Rocket className="h-3 w-3" aria-hidden />
            {(project.deploymentCount ?? 0) > 0 ? 'Republish' : 'Publish'}
          </Link>
        </div>
      </div>
    </header>
  );
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
  download,
}: {
  to: string;
  icon?: ReactNode;
  children: ReactNode;
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;

  /*
   * When the target is a binary/download endpoint (e.g. the project export zip)
   * a React Router <Link> performs an in-app SPA fetch, which never turns the
   * response into a file download and honours Content-Disposition. Render a
   * native anchor with `download` so the browser does a real document
   * navigation instead.
   */
  download?: boolean;
}) {
  const className =
    'flex h-8 items-center gap-2 rounded-md px-2 text-[12px] text-[var(--vc-ide-text-primary)] hover:bg-[var(--vc-ide-bg-hover)]';

  if (download) {
    return (
      <a href={to} download className={className} onClick={onClick}>
        {icon}
        <span>{children}</span>
      </a>
    );
  }

  return (
    <Link to={to} className={className} onClick={onClick}>
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

  // G5: delete confirm / rename prompt now use token-styled dialogs.
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);

  const runAction = async (name?: string) => {
    setBusy(true);

    try {
      const form = new FormData();
      form.set('intent', intent);
      form.set('projectName', projectName);

      if (intent === 'rename') {
        if (!name) {
          setBusy(false);
          return;
        }

        form.set('name', name);
      }

      const response = await fetch(action, { method: 'POST', body: form, credentials: 'include' });

      const result = (await response.json().catch(() => ({}))) as {
        project?: { project?: { id?: string }; id?: string };
        error?: string;
      };

      if (!response.ok) {
        /*
         * Don't silently swallow quota/permission/server errors — the action
         * would otherwise appear to do nothing. Surface the reason.
         */
        configuredToast.error(result.error ?? `Could not ${intent} this project. Please try again.`);
      } else if (intent === 'delete') {
        window.location.href = '/projects';
      } else if (intent === 'duplicate' || intent === 'fork') {
        const nextProjectId = result.project?.project?.id ?? result.project?.id;

        if (nextProjectId) {
          window.location.href = `/projects/${nextProjectId}/ide`;
        }
      } else if (intent === 'rename') {
        window.location.reload();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        disabled={busy}
        className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[12px] text-[var(--vc-ide-text-primary)] hover:bg-[var(--vc-ide-bg-hover)] disabled:opacity-60"
        onClick={() => {
          if (intent === 'delete') {
            setConfirmDeleteOpen(true);
            return;
          }

          if (intent === 'rename') {
            setRenameOpen(true);
            return;
          }

          void runAction();
        }}
      >
        {icon}
        <span>{busy ? 'Working...' : children}</span>
      </button>
      {intent === 'delete' ? (
        <ConfirmationDialog
          isOpen={confirmDeleteOpen}
          onClose={() => setConfirmDeleteOpen(false)}
          onConfirm={() => {
            setConfirmDeleteOpen(false);
            void runAction();
          }}
          title={`Delete ${projectName}?`}
          description="The project and its workspace data are deleted. This cannot be undone."
          confirmLabel="Delete project"
          variant="destructive"
        />
      ) : null}
      {intent === 'rename' ? (
        <InputDialog
          isOpen={renameOpen}
          onClose={() => setRenameOpen(false)}
          onSubmit={(value) => {
            setRenameOpen(false);
            void runAction(value.trim());
          }}
          title="Rename project"
          label="New project name"
          initialValue={projectName}
          confirmLabel="Rename"
          validate={(value) => (value.trim() ? undefined : 'Enter a project name')}
        />
      ) : null}
    </>
  );
}
