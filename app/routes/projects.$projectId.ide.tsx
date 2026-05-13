import { useStore } from '@nanostores/react';
import { type LoaderFunctionArgs, type MetaFunction } from '@remix-run/cloudflare';
import { useLoaderData } from '@remix-run/react';
import { Link } from '@remix-run/react';
import {
  Activity,
  AlertTriangle,
  Bell,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  Clock3,
  Copy,
  Download,
  Files,
  Home,
  PenLine,
  Play,
  Rocket,
  Settings,
  Share2,
  Square,
  Trash2,
  User,
} from 'lucide-react';
import { lazy, Suspense, useMemo, useState, type MouseEvent, type ReactNode } from 'react';
import { ClientOnly } from 'remix-utils/client-only';
import { BaseChat } from '~/components/chat/BaseChat';
import { PanelBoundary, PanelLoading } from '~/components/ui/PanelBoundary';
import { apiErrorMessage, apiRequest, json } from '~/lib/enterprise-api.server';
import { ProjectWorkspaceProvider } from '~/lib/runtime/ProjectWorkspaceProvider';
import { workbenchStore } from '~/lib/stores/workbench';

const ProjectIdeChat = lazy(() => import('~/components/chat/Chat.client').then((module) => ({ default: module.Chat })));

type ProjectLoaderData = {
  projectId: string;
  project: {
    id: string;
    name: string;
  };
  collaborators: Array<{ id?: string; userId?: string; roleKey?: string }>;
  notifications: Array<{ id?: string; action: string; createdAt?: string; metadata?: unknown }>;
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

    const [collaboratorsResult, dashboardResult] = await Promise.all([
      apiRequest<{ collaborators: ProjectLoaderData['collaborators'] }>(
        request,
        `/projects/${projectId}/collaborators`,
      ).catch(() => ({ collaborators: [] })),
      apiRequest<{ recentActivity?: ProjectLoaderData['notifications'] }>(
        request,
        `/projects/${projectId}/dashboard`,
      ).catch(() => ({ recentActivity: [] })),
    ]);

    return json<ProjectLoaderData>({
      projectId,
      project: result.project,
      collaborators: collaboratorsResult.collaborators ?? [],
      notifications: dashboardResult.recentActivity ?? [],
    });
  } catch (error) {
    const message = await apiErrorMessage(error, 'Project API unavailable');

    return json<ProjectLoaderData>({
      projectId,
      project: { id: projectId, name: projectId },
      collaborators: [],
      notifications: [],
      projectApiError: message,
    });
  }
};

export default function ProjectIdeRoute() {
  const { projectId, project, collaborators, notifications, projectApiError } = useLoaderData<typeof loader>();

  return (
    <ProjectWorkspaceProvider projectId={projectId} initialError={projectApiError}>
      <div className="bolt-project-ide-shell h-dvh w-screen overflow-hidden">
        <IdeProjectTopBar
          projectId={projectId}
          projectName={project.name}
          collaborators={collaborators}
          notifications={notifications}
          projectApiError={projectApiError}
        />
        <main className="h-dvh pt-9">
          <ClientOnly fallback={<BaseChat chatStarted projectIdeMode projectId={projectId} />}>
            {() => (
              <PanelBoundary title="Bolt IDE">
                <Suspense fallback={<PanelLoading title="Loading Bolt IDE..." />}>
                  <ProjectIdeChat forceWorkbench projectIdeMode projectId={projectId} />
                </Suspense>
              </PanelBoundary>
            )}
          </ClientOnly>
        </main>
      </div>
    </ProjectWorkspaceProvider>
  );
}

function IdeProjectTopBar({
  projectId,
  projectName,
  collaborators,
  notifications,
  projectApiError,
}: {
  projectId: string;
  projectName: string;
  collaborators: ProjectLoaderData['collaborators'];
  notifications: ProjectLoaderData['notifications'];
  projectApiError?: string;
}) {
  const loading = useStore(workbenchStore.workspaceLoading);
  const status = useStore(workbenchStore.workspaceStatus);
  const error = useStore(workbenchStore.workspaceError);
  const previews = useStore(workbenchStore.previews);
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const filesPanelOpen = useStore(workbenchStore.projectFilesPanelOpen);
  const previewRunning = previews.length > 0;
  const state = loading ? 'building' : error ? 'crashed' : status?.status === 'running' ? 'running' : 'stopped';

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

  return (
    <header className="bolt-project-topbar fixed left-0 top-0 z-50 flex h-9 w-screen items-center justify-between border-b px-2 text-[12px]">
      <div className="bolt-project-topbar-left">
        <Link to="/dashboard" className="bolt-project-topbar-icon-button" aria-label="VibeCore dashboard">
          <Home className="h-4 w-4" aria-hidden />
        </Link>
        <div className="bolt-project-topbar-brand" aria-label="Project">
          <span>VibeCore</span>
          <span aria-hidden>/</span>
        </div>
        <details
          className="relative"
          open={projectMenuOpen}
          onToggle={(event) => setProjectMenuOpen(event.currentTarget.open)}
        >
          <summary className="bolt-project-name-trigger">
            <span className="truncate">{projectName}</span>
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
                projectName={projectName}
                icon={<Copy className="h-3.5 w-3.5" />}
              >
                Fork
              </ProjectMenuAction>
              <ProjectMenuAction
                action={`/api/projects/${projectId}/project-action`}
                intent="rename"
                projectName={projectName}
                icon={<PenLine className="h-3.5 w-3.5" />}
              >
                Rename
              </ProjectMenuAction>
              <ProjectMenuAction
                action={`/api/projects/${projectId}/project-action`}
                intent="delete"
                projectName={projectName}
                icon={<Trash2 className="h-3.5 w-3.5 text-[#F85149]" />}
              >
                Delete
              </ProjectMenuAction>
              <ProjectMenuAction
                action={`/api/projects/${projectId}/project-action`}
                intent="duplicate"
                projectName={projectName}
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
        <Link to={`/projects/${projectId}/ide?panel=logs`} className="bolt-project-runtime-status">
          <span className="relative flex h-2 w-2">
            {state === 'building' && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#D29922] opacity-75" />
            )}
            <span
              className="relative inline-flex h-1.5 w-1.5 rounded-full"
              style={{
                backgroundColor:
                  state === 'running'
                    ? '#3FB950'
                    : state === 'building'
                      ? '#D29922'
                      : state === 'crashed'
                        ? '#F85149'
                        : '#6E7681',
              }}
            />
          </span>
          {statusLabel}
        </Link>
      </div>
      <div aria-hidden className="flex-1" />
      <div className="bolt-project-topbar-actions">
        <Link to="/support" className="bolt-project-topbar-icon-button" aria-label="Help">
          <CircleHelp className="h-3.5 w-3.5" aria-hidden />
        </Link>
        <div className="relative">
          <button
            type="button"
            className="bolt-project-topbar-icon-button relative"
            aria-label="Notifications"
            aria-expanded={notificationsOpen}
            onClick={() => setNotificationsOpen((value) => !value)}
          >
            <Bell className="h-3.5 w-3.5" aria-hidden />
            {notificationItems.length > 0 && (
              <span
                className="bolt-project-notification-dot"
                data-urgent={actionableNotificationCount > 0 ? 'true' : 'false'}
                aria-hidden
              />
            )}
          </button>
          {notificationsOpen && (
            <div
              className="bolt-project-notification-popover absolute right-0 top-full z-50 mt-1 w-[360px] max-w-[calc(100vw-1rem)] rounded-xl border p-3"
              role="dialog"
              aria-label="Project notifications"
            >
              <div className="bolt-project-notification-header">
                <div>
                  <strong>IDE notifications</strong>
                  <span>Project activity and live workspace signals</span>
                </div>
                <span className="bolt-project-notification-count">
                  {notificationItems.length} {notificationItems.length === 1 ? 'event' : 'events'}
                </span>
              </div>
              {notificationItems.length ? (
                <div className="bolt-project-notification-list">
                  {notificationItems.slice(0, 10).map((notification) => {
                    const Icon = notificationIcon(notification.kind);
                    return (
                      <Link
                        key={notification.id}
                        to={notification.href}
                        className="bolt-project-notification-item"
                        data-kind={notification.kind}
                        onClick={() => setNotificationsOpen(false)}
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
          )}
        </div>
        <div className="flex items-center -space-x-1" aria-label="Collaborators">
          {(collaborators.length ? collaborators : [{ userId: 'you', roleKey: 'owner' }])
            .slice(0, 3)
            .map((collaborator) => (
              <span
                key={collaborator.id ?? collaborator.userId}
                title={`${collaborator.userId ?? 'User'} (${collaborator.roleKey ?? 'member'})`}
                className="inline-flex h-5 w-5 items-center justify-center rounded-full border-[1.5px] border-[var(--vc-ide-bg-panel)] bg-[var(--vc-ide-bg-hover)] text-[10px] font-semibold text-[var(--vc-ide-text-primary)]"
              >
                {(collaborator.userId ?? 'U').slice(0, 1).toUpperCase()}
              </span>
            ))}
          {collaborators.length > 3 && (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full border-[1.5px] border-[var(--vc-ide-bg-panel)] bg-[var(--vc-ide-bg-card)] px-1 text-[9px] font-semibold text-[var(--vc-ide-text-secondary)]">
              +{collaborators.length - 3}
            </span>
          )}
        </div>
        <Link to={`/projects/${projectId}/ide?panel=collaborators`} className="bolt-project-topbar-outline-button">
          <Share2 className="h-3 w-3" aria-hidden />
          Share
        </Link>
        <button
          type="button"
          data-testid="button-run-stop"
          className={previewRunning ? 'bolt-project-run-button is-running' : 'bolt-project-run-button'}
          onClick={() => {
            if (previewRunning) {
              void workbenchStore.stopPreviewServer().catch(() => undefined);

              return;
            }

            window.dispatchEvent(new CustomEvent('vibecore:open-project-ide-panel', { detail: { panel: 'preview' } }));
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
        <details
          className="relative"
          open={userMenuOpen}
          onToggle={(event) => setUserMenuOpen(event.currentTarget.open)}
        >
          <summary
            className="inline-flex h-[22px] w-[22px] cursor-pointer list-none items-center justify-center rounded-full bg-[var(--vc-ide-bg-hover)] text-[var(--vc-ide-text-primary)] hover:ring-1 hover:ring-[var(--vc-ide-accent-action)]"
            aria-label="User menu"
          >
            <User className="h-3.5 w-3.5" aria-hidden />
          </summary>
          {userMenuOpen && (
            <div className="absolute right-0 top-full z-50 mt-1 w-44 rounded-lg border border-[var(--vc-ide-border-visible)] bg-[var(--vc-ide-bg-card)] p-1.5 shadow-[var(--vc-ui-shadow-xl)]">
              <ProjectMenuItem to="/account-settings">Profile</ProjectMenuItem>
              <ProjectMenuItem to="/settings">Settings</ProjectMenuItem>
              <ProjectMenuItem to="/billing">Billing</ProjectMenuItem>
              <form method="post" action="/logout">
                <button
                  type="submit"
                  className="flex h-8 w-full items-center rounded-md px-2 text-left text-[12px] text-[var(--vc-ide-text-primary)] hover:bg-[var(--vc-ide-bg-hover)]"
                >
                  Sign out
                </button>
              </form>
            </div>
          )}
        </details>
        <button
          type="button"
          data-testid="ide-files-panel-toggle"
          className={filesPanelOpen ? 'bolt-project-topbar-icon-button is-active' : 'bolt-project-topbar-icon-button'}
          aria-label={filesPanelOpen ? 'Close right panel' : 'Open right panel'}
          aria-pressed={filesPanelOpen}
          title={filesPanelOpen ? 'Close files' : 'Open files'}
          onClick={() => {
            const detail = { open: !filesPanelOpen };
            workbenchStore.requestProjectFilesPanel(detail.open);
            window.dispatchEvent(new CustomEvent('vibecore:toggle-project-files-panel', { detail }));
          }}
        >
          <Files className="h-3.5 w-3.5" aria-hidden />
        </button>
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
