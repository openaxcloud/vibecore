import { json, type LoaderFunctionArgs, type MetaFunction } from '@remix-run/cloudflare';
import { useLoaderData } from '@remix-run/react';
import { ClientOnly } from 'remix-utils/client-only';
import { Link } from '@remix-run/react';
import { useStore } from '@nanostores/react';
import { Command, Layers, Rocket, Users, Zap } from 'lucide-react';
import { BaseChat } from '~/components/chat/BaseChat';
import { Chat } from '~/components/chat/Chat.client';
import { Header } from '~/components/header/Header';
import { ProjectWorkspaceProvider } from '~/lib/runtime/ProjectWorkspaceProvider';
import { workbenchStore } from '~/lib/stores/workbench';

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
      <div className="flex h-full w-full flex-col bg-bolt-elements-background-depth-1">
        <Header />
        <IdeProjectToolbar projectId={projectId} />
        <ClientOnly fallback={<BaseChat />}>{() => <Chat />}</ClientOnly>
      </div>
    </ProjectWorkspaceProvider>
  );
}

function IdeProjectToolbar({ projectId }: { projectId: string }) {
  const loading = useStore(workbenchStore.workspaceLoading);
  const status = useStore(workbenchStore.workspaceStatus);
  const error = useStore(workbenchStore.workspaceError);
  const statusLabel = loading
    ? 'Workspace starting'
    : error
      ? 'Workspace error'
      : status?.status
        ? `Workspace ${status.status}`
        : 'Workspace not started';

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-2 text-xs text-bolt-elements-textSecondary">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          to={`/projects/${projectId}/logs`}
          className="inline-flex items-center gap-1 rounded-md border border-bolt-elements-borderColor px-2 py-1 hover:bg-bolt-elements-background-depth-3"
        >
          <Zap className="h-3.5 w-3.5" aria-hidden />
          {statusLabel}
        </Link>
        <Link
          to={`/projects/${projectId}/collaborators`}
          className="inline-flex items-center gap-1 rounded-md border border-bolt-elements-borderColor px-2 py-1 hover:bg-bolt-elements-background-depth-3"
        >
          <Users className="h-3.5 w-3.5" aria-hidden />
          Presence
        </Link>
        <Link
          to={`/projects/${projectId}/snapshots`}
          className="inline-flex items-center gap-1 rounded-md border border-bolt-elements-borderColor px-2 py-1 hover:bg-bolt-elements-background-depth-3"
        >
          <Layers className="h-3.5 w-3.5" aria-hidden />
          Snapshots
        </Link>
        <Link
          to={`/projects/${projectId}/deployments`}
          className="inline-flex items-center gap-1 rounded-md border border-bolt-elements-borderColor px-2 py-1 hover:bg-bolt-elements-background-depth-3"
        >
          <Rocket className="h-3.5 w-3.5" aria-hidden />
          Deploy
        </Link>
        <Link
          to={`/projects/${projectId}/ide?panel=preview`}
          className="inline-flex items-center gap-1 rounded-md border border-bolt-elements-borderColor px-2 py-1 hover:bg-bolt-elements-background-depth-3"
        >
          Preview
        </Link>
      </div>
      <Link
        to="/command-palette"
        className="inline-flex items-center gap-1 rounded-md border border-bolt-elements-borderColor px-2 py-1 hover:bg-bolt-elements-background-depth-3"
      >
        <Command className="h-3.5 w-3.5" aria-hidden />
        Shortcuts
      </Link>
    </div>
  );
}
