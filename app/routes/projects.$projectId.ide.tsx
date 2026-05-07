import { useStore } from '@nanostores/react';
import { type LoaderFunctionArgs, type MetaFunction } from '@remix-run/cloudflare';
import { useLoaderData } from '@remix-run/react';
import { Link } from '@remix-run/react';
import {
  Bell,
  ChevronDown,
  CircleHelp,
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
import { lazy, Suspense, useEffect, useState, type MouseEvent, type ReactNode } from 'react';
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
  notifications: Array<{ action: string; createdAt?: string }>;
  projectApiError?: string;
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
}: {
  projectId: string;
  projectName: string;
  collaborators: ProjectLoaderData['collaborators'];
  notifications: ProjectLoaderData['notifications'];
}) {
  const loading = useStore(workbenchStore.workspaceLoading);
  const status = useStore(workbenchStore.workspaceStatus);
  const error = useStore(workbenchStore.workspaceError);
  const previews = useStore(workbenchStore.previews);
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [filesPanelOpen, setFilesPanelOpen] = useState(true);
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

  useEffect(() => {
    const handleFilesPanelState = (event: Event) => {
      const nextOpen = (event as CustomEvent<{ open?: boolean }>).detail?.open;

      if (typeof nextOpen === 'boolean') {
        setFilesPanelOpen(nextOpen);
      }
    };

    window.addEventListener('vibecore:project-files-panel-state', handleFilesPanelState);

    return () => window.removeEventListener('vibecore:project-files-panel-state', handleFilesPanelState);
  }, []);

  return (
    <header className="bolt-project-topbar fixed left-0 top-0 z-50 flex h-9 w-screen items-center justify-between border-b px-2 text-[12px]">
      <div className="bolt-project-topbar-left">
        <Link to="/dashboard" className="bolt-project-topbar-icon-button" aria-label="VibeCore dashboard">
          <Home className="h-4 w-4" aria-hidden />
        </Link>
        <div className="bolt-project-topbar-brand" aria-label="Project">
          <span>E-Code</span>
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
            <div className="absolute left-0 top-full z-50 mt-1 w-56 rounded-lg border border-[#2B3245] bg-[#1A2030] p-1.5 shadow-[0_24px_64px_rgba(0,4,20,0.7)]">
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
            {notifications.length > 0 && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-[#F85149]" />}
          </button>
          {notificationsOpen && (
            <div
              className="absolute right-0 top-full z-50 mt-1 w-80 rounded-xl border border-[#2B3245] bg-[#1A2030] p-3 shadow-[0_24px_64px_rgba(0,4,20,0.7)]"
              role="dialog"
              aria-label="Project notifications"
            >
              <div className="mb-2 flex items-center justify-between gap-3">
                <strong className="text-[13px] font-semibold text-[#F5F9FC]">Notifications</strong>
                <span className="text-[11px] text-[#6E7681]">{notifications.length} project events</span>
              </div>
              {notifications.length ? (
                <div className="grid max-h-80 gap-2 overflow-y-auto pr-1">
                  {notifications.slice(0, 8).map((notification, index) => (
                    <Link
                      key={`${notification.action}-${notification.createdAt ?? index}`}
                      to={`/projects/${projectId}/ide?panel=activity`}
                      className="rounded-md border border-[#2B3245] bg-[#0E1525] p-2.5 text-left hover:bg-[#2B3245]"
                      onClick={() => setNotificationsOpen(false)}
                    >
                      <span className="block text-[12px] font-medium text-[#F5F9FC]">{notification.action}</span>
                      <span className="mt-1 block text-[11px] text-[#C2C8CC]">
                        {notification.createdAt
                          ? new Date(notification.createdAt).toLocaleString()
                          : 'Recorded by backend'}
                      </span>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="rounded-md border border-[#2B3245] bg-[#0E1525] p-3 text-[12px] text-[#C2C8CC]">
                  No project notifications recorded yet.
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
                className="inline-flex h-5 w-5 items-center justify-center rounded-full border-[1.5px] border-[#0E1525] bg-[#2B3245] text-[10px] font-semibold text-[#F5F9FC]"
              >
                {(collaborator.userId ?? 'U').slice(0, 1).toUpperCase()}
              </span>
            ))}
          {collaborators.length > 3 && (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full border-[1.5px] border-[#0E1525] bg-[#1A2030] px-1 text-[9px] font-semibold text-[#C2C8CC]">
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
            className="inline-flex h-[22px] w-[22px] cursor-pointer list-none items-center justify-center rounded-full bg-[#2B3245] hover:ring-1 hover:ring-[#0099FF]"
            aria-label="User menu"
          >
            <User className="h-3.5 w-3.5" aria-hidden />
          </summary>
          {userMenuOpen && (
            <div className="absolute right-0 top-full z-50 mt-1 w-44 rounded-lg border border-[#2B3245] bg-[#1A2030] p-1.5 shadow-[0_24px_64px_rgba(0,4,20,0.7)]">
              <ProjectMenuItem to="/account-settings">Profile</ProjectMenuItem>
              <ProjectMenuItem to="/settings">Settings</ProjectMenuItem>
              <ProjectMenuItem to="/billing">Billing</ProjectMenuItem>
              <form method="post" action="/logout">
                <button
                  type="submit"
                  className="flex h-8 w-full items-center rounded-md px-2 text-left text-[12px] text-[#F5F9FC] hover:bg-[#2B3245]"
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
            window.dispatchEvent(new CustomEvent('vibecore:toggle-project-files-panel'));
          }}
        >
          <Files className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
    </header>
  );
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
      className="flex h-8 items-center gap-2 rounded-md px-2 text-[12px] text-[#F5F9FC] hover:bg-[#2B3245]"
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
      className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[12px] text-[#F5F9FC] hover:bg-[#2B3245] disabled:opacity-60"
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
