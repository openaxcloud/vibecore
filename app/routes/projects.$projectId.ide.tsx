import { json, type LoaderFunctionArgs, type MetaFunction } from '@remix-run/cloudflare';
import { useLoaderData } from '@remix-run/react';
import { ClientOnly } from 'remix-utils/client-only';
import { Link, useSearchParams } from '@remix-run/react';
import { useState } from 'react';
import { useStore } from '@nanostores/react';
import {
  Activity,
  Braces,
  Command,
  FileCode2,
  Gauge,
  GitBranch,
  Globe2,
  Layers,
  Lock,
  Rocket,
  Settings,
  Terminal,
  Users,
  Zap,
} from 'lucide-react';
import { BaseChat } from '~/components/chat/BaseChat';
import { Chat } from '~/components/chat/Chat.client';
import { SignOutButton } from '~/components/dashboard/SaaSLayout';
import { Header } from '~/components/header/Header';
import { ProjectWorkspaceProvider } from '~/lib/runtime/ProjectWorkspaceProvider';
import { workbenchStore } from '~/lib/stores/workbench';
import { useResponsiveLayout } from '@vibecore/editor';

export const meta: MetaFunction<typeof loader> = ({ data }) => [
  { title: data ? `Bolt IDE - ${data.projectId}` : 'Bolt IDE' },
  { name: 'description', content: 'Bolt IDE connected to a persistent project workspace.' },
];

export const loader = ({ params }: LoaderFunctionArgs) => {
  if (!params.projectId) {
    throw new Response('Project not found', { status: 404 });
  }

  return json({ projectId: params.projectId });
};

export default function ProjectIdeRoute() {
  const { projectId } = useLoaderData<typeof loader>();

  return (
    <ProjectWorkspaceProvider projectId={projectId}>
      <div className="bolt-project-ide-shell flex h-full w-full flex-col bg-bolt-elements-background-depth-1">
        <Header />
        <IdeProjectToolbar projectId={projectId} />
        <ClientOnly fallback={<BaseChat chatStarted projectIdeMode projectId={projectId} />}>
          {() => <Chat forceWorkbench projectIdeMode projectId={projectId} />}
        </ClientOnly>
      </div>
    </ProjectWorkspaceProvider>
  );
}

function IdeProjectToolbar({ projectId }: { projectId: string }) {
  const [searchParams] = useSearchParams();
  const loading = useStore(workbenchStore.workspaceLoading);
  const status = useStore(workbenchStore.workspaceStatus);
  const error = useStore(workbenchStore.workspaceError);
  const [panelMenuOpen, setPanelMenuOpen] = useState(false);
  const layout = useResponsiveLayout();
  const showProjectMenu = !layout.isMobile;
  const activePanel = searchParams.get('panel') ?? 'editor';
  const statusLabel = loading
    ? 'Workspace starting'
    : error
      ? 'Workspace error'
      : status?.status
        ? `Workspace ${status.status}`
        : 'Workspace not started';

  const projectMenu = [
    { id: 'editor', label: 'Editor', to: `/projects/${projectId}/ide`, icon: FileCode2 },
    { id: 'preview', label: 'Preview', to: `/projects/${projectId}/ide?panel=preview`, icon: Zap },
    { id: 'overview', label: 'Overview', to: `/projects/${projectId}/ide?panel=overview`, icon: Gauge },
    { id: 'deployments', label: 'Deploy', to: `/projects/${projectId}/ide?panel=deployments`, icon: Rocket },
    { id: 'env', label: 'Env vars', to: `/projects/${projectId}/ide?panel=env`, icon: Braces },
    { id: 'secrets', label: 'Secrets', to: `/projects/${projectId}/ide?panel=secrets`, icon: Lock },
    { id: 'git', label: 'Git', to: `/projects/${projectId}/ide?panel=git`, icon: GitBranch },
    { id: 'activity', label: 'Activity', to: `/projects/${projectId}/ide?panel=activity`, icon: Activity },
    { id: 'logs', label: 'Logs', to: `/projects/${projectId}/ide?panel=logs`, icon: Terminal },
    { id: 'collaborators', label: 'Collaborators', to: `/projects/${projectId}/ide?panel=collaborators`, icon: Users },
    { id: 'domains', label: 'Domains', to: `/projects/${projectId}/ide?panel=domains`, icon: Globe2 },
    { id: 'snapshots', label: 'Snapshots', to: `/projects/${projectId}/ide?panel=snapshots`, icon: Layers },
    { id: 'settings', label: 'Settings', to: `/projects/${projectId}/ide?panel=settings`, icon: Settings },
  ];

  return (
    <div className="flex items-center justify-between gap-2 border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-2 text-xs text-bolt-elements-textSecondary">
      <div className="flex min-w-0 items-center gap-2">
        <Link
          to={`/projects/${projectId}/ide?panel=logs`}
          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-bolt-elements-borderColor px-2 py-1 hover:bg-bolt-elements-background-depth-3"
        >
          <Zap className="h-3.5 w-3.5" aria-hidden />
          {statusLabel}
        </Link>
        <span className="inline-flex shrink-0 rounded-md border border-bolt-elements-borderColor px-2 py-1 text-bolt-elements-textTertiary">
          Presence ready
        </span>
        {layout.isMobile && (
          <Link
            to={`/projects/${projectId}/ide?panel=deployments`}
            className="inline-flex shrink-0 items-center gap-1 rounded-md border border-bolt-elements-borderColor px-2 py-1 hover:bg-bolt-elements-background-depth-3"
          >
            <Rocket className="h-3.5 w-3.5" aria-hidden />
            Deploy
          </Link>
        )}
        <Link
          to={`/projects/${projectId}/ide?panel=snapshots`}
          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-bolt-elements-borderColor px-2 py-1 hover:bg-bolt-elements-background-depth-3"
        >
          <Layers className="h-3.5 w-3.5" aria-hidden />
          Snapshots
        </Link>
        {showProjectMenu && (
          <div className="flex min-w-0 items-center gap-1 overflow-x-auto" aria-label="Project IDE menu">
            {projectMenu.slice(0, 11).map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={[
                    'inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 hover:bg-bolt-elements-background-depth-3',
                    activePanel === item.id ? 'bg-bolt-elements-background-depth-3 text-bolt-elements-textPrimary' : '',
                  ].join(' ')}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden />
                  {item.label}
                </Link>
              );
            })}
          </div>
        )}
        <details
          className="relative shrink-0"
          open={panelMenuOpen}
          onToggle={(event) => setPanelMenuOpen(event.currentTarget.open)}
        >
          <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-md border border-bolt-elements-borderColor px-2 py-1 hover:bg-bolt-elements-background-depth-3">
            <span className="text-sm leading-none">+</span>
            Panels
          </summary>
          {panelMenuOpen && (
            <div className="absolute left-0 top-full z-50 mt-2 grid w-56 gap-1 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-2 shadow-xl">
              {projectMenu.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={[
                      'flex items-center gap-2 rounded-md px-2 py-2 hover:bg-bolt-elements-background-depth-3',
                      activePanel === item.id
                        ? 'bg-bolt-elements-background-depth-3 text-bolt-elements-textPrimary'
                        : '',
                    ].join(' ')}
                  >
                    <Icon className="h-4 w-4" aria-hidden />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          )}
        </details>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Link
          to="/command-palette"
          className="inline-flex items-center gap-1 rounded-md border border-bolt-elements-borderColor px-2 py-1 hover:bg-bolt-elements-background-depth-3"
        >
          <Command className="h-3.5 w-3.5" aria-hidden />
          Shortcuts
        </Link>
        <SignOutButton
          compact
          className="h-7 border border-bolt-elements-borderColor px-2 py-1 hover:bg-bolt-elements-background-depth-3"
        />
      </div>
    </div>
  );
}
