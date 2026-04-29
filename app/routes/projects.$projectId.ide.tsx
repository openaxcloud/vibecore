import { type LoaderFunctionArgs, type MetaFunction } from '@remix-run/cloudflare';
import { useLoaderData } from '@remix-run/react';
import { ClientOnly } from 'remix-utils/client-only';
import { Link } from '@remix-run/react';
import { useState, type ReactNode } from 'react';
import { useStore } from '@nanostores/react';
import {
  Bell,
  ChevronDown,
  CircleHelp,
  Copy,
  Download,
  PenLine,
  Rocket,
  Settings,
  Share2,
  Sparkles,
  Trash2,
  User,
} from 'lucide-react';
import { BaseChat } from '~/components/chat/BaseChat';
import { Chat } from '~/components/chat/Chat.client';
import { apiRequest, json } from '~/lib/enterprise-api.server';
import { ProjectWorkspaceProvider } from '~/lib/runtime/ProjectWorkspaceProvider';
import { workbenchStore } from '~/lib/stores/workbench';

type ProjectLoaderData = {
  projectId: string;
  project: {
    id: string;
    name: string;
  };
};

export const meta: MetaFunction<typeof loader> = ({ data }) => [
  { title: data ? `Bolt IDE - ${data.projectId}` : 'Bolt IDE' },
  { name: 'description', content: 'Bolt IDE connected to a persistent project workspace.' },
];

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  if (!params.projectId) {
    throw new Response('Project not found', { status: 404 });
  }

  try {
    const result = await apiRequest<{ project: ProjectLoaderData['project'] }>(
      request,
      `/projects/${params.projectId}`,
    );

    return json<ProjectLoaderData>({ projectId: params.projectId, project: result.project });
  } catch {
    return json<ProjectLoaderData>({
      projectId: params.projectId,
      project: { id: params.projectId, name: params.projectId },
    });
  }
};

export default function ProjectIdeRoute() {
  const { projectId, project } = useLoaderData<typeof loader>();

  return (
    <ProjectWorkspaceProvider projectId={projectId}>
      <div className="bolt-project-ide-shell h-dvh w-screen overflow-hidden bg-[#0A0F1C] text-[#F5F9FC]">
        <IdeProjectTopBar projectId={projectId} projectName={project.name} />
        <main className="h-dvh pt-9">
          <ClientOnly fallback={<BaseChat chatStarted projectIdeMode projectId={projectId} />}>
            {() => <Chat forceWorkbench projectIdeMode projectId={projectId} />}
          </ClientOnly>
        </main>
      </div>
    </ProjectWorkspaceProvider>
  );
}

function IdeProjectTopBar({ projectId, projectName }: { projectId: string; projectName: string }) {
  const loading = useStore(workbenchStore.workspaceLoading);
  const status = useStore(workbenchStore.workspaceStatus);
  const error = useStore(workbenchStore.workspaceError);
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const state = loading ? 'building' : error ? 'crashed' : status?.status === 'running' ? 'running' : 'stopped';
  const statusLabel =
    state === 'building'
      ? 'Building...'
      : state === 'crashed'
        ? 'Crashed'
        : state === 'running'
          ? 'Running'
          : 'Stopped';

  return (
    <header className="fixed left-0 top-0 z-50 flex h-9 w-screen items-center justify-between border-b border-[#1A2030] bg-[#0E1525] px-2.5 text-[12px]">
      <div className="flex min-w-0 items-center gap-1.5">
        <Link
          to="/dashboard"
          className="inline-flex h-6 w-6 items-center justify-center rounded hover:bg-[#1A2030]"
          aria-label="VibeCore dashboard"
        >
          <Sparkles className="h-5 w-5 text-[#7B61FF]" aria-hidden />
        </Link>
        <details
          className="relative"
          open={projectMenuOpen}
          onToggle={(event) => setProjectMenuOpen(event.currentTarget.open)}
        >
          <summary className="inline-flex h-6 max-w-[220px] cursor-pointer list-none items-center gap-1 rounded px-1.5 text-[13px] font-medium text-[#F5F9FC] hover:bg-[#1A2030]">
            <span className="truncate">{projectName}</span>
            <ChevronDown className="h-3.5 w-3.5 text-[#6E7681]" aria-hidden />
          </summary>
          {projectMenuOpen && (
            <div className="absolute left-0 top-full z-50 mt-1 w-56 rounded-lg border border-[#2B3245] bg-[#1A2030] p-1.5 shadow-[0_24px_64px_rgba(0,4,20,0.7)]">
              <ProjectMenuItem
                to={`/projects/${projectId}/ide?panel=settings`}
                icon={<Settings className="h-3.5 w-3.5" />}
              >
                Settings
              </ProjectMenuItem>
              <ProjectMenuItem
                to={`/projects/${projectId}/ide?panel=settings`}
                icon={<PenLine className="h-3.5 w-3.5" />}
              >
                Rename
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
              <ProjectMenuAction
                action={`/api/projects/${projectId}/project-action`}
                intent="delete"
                projectName={projectName}
                icon={<Trash2 className="h-3.5 w-3.5 text-[#F85149]" />}
              >
                Delete
              </ProjectMenuAction>
            </div>
          )}
        </details>
        <Link
          to={`/projects/${projectId}/ide?panel=logs`}
          className="inline-flex h-6 items-center gap-1.5 rounded px-1.5 text-[11px] text-[#C2C8CC] hover:bg-[#1A2030]"
        >
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
      <div className="flex items-center gap-1.5">
        <Link
          to="/support"
          className="inline-flex h-6 w-6 items-center justify-center rounded hover:bg-[#1A2030]"
          aria-label="Help"
        >
          <CircleHelp className="h-3.5 w-3.5" aria-hidden />
        </Link>
        <Link
          to="/notifications"
          className="relative inline-flex h-6 w-6 items-center justify-center rounded hover:bg-[#1A2030]"
          aria-label="Notifications"
        >
          <Bell className="h-3.5 w-3.5" aria-hidden />
          <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-[#F85149]" />
        </Link>
        <div className="flex items-center -space-x-1" aria-label="Collaborators">
          {['A', 'M', 'S'].map((initial) => (
            <span
              key={initial}
              className="inline-flex h-5 w-5 items-center justify-center rounded-full border-[1.5px] border-[#0E1525] bg-[#2B3245] text-[10px] font-semibold text-[#F5F9FC]"
            >
              {initial}
            </span>
          ))}
        </div>
        <Link
          to={`/projects/${projectId}/ide?panel=collaborators`}
          className="inline-flex h-6 items-center gap-1 rounded border border-[#2B3245] px-2.5 text-[12px] font-medium text-[#F5F9FC] hover:bg-[#1A2030]"
        >
          <Share2 className="h-3 w-3" aria-hidden />
          Share
        </Link>
        <Link
          to={`/projects/${projectId}/ide?panel=deployments`}
          className="inline-flex h-6 items-center gap-1 rounded bg-gradient-to-r from-[#7B61FF] to-[#0099FF] px-3 text-[12px] font-medium text-white hover:brightness-110"
        >
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
      </div>
    </header>
  );
}

function ProjectMenuItem({ to, icon, children }: { to: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <Link to={to} className="flex h-8 items-center gap-2 rounded-md px-2 text-[12px] text-[#F5F9FC] hover:bg-[#2B3245]">
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
          await fetch(action, { method: 'POST', body: form, credentials: 'include' });
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
