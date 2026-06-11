import type { MetaFunction } from '@remix-run/cloudflare';
import { Form, useLoaderData } from '@remix-run/react';
import { Layers, RotateCcw } from 'lucide-react';
import { ActivityList, ProjectShell } from '~/components/dashboard/SaaSLayout';
import { Button } from '~/components/ui/Button';
import {
  apiRequest,
  redirect,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';
import { projectAction, projectPageLoader } from '~/lib/project-route.server';

type SnapshotsData = {
  snapshots: Array<{ id: string; label?: string; kind: string; byteLength?: number; createdAt?: string }>;
};

export const meta: MetaFunction = () => [{ title: 'Project snapshots - VibeCore' }];
export const loader = (args: EnterpriseLoaderArgs) =>
  projectPageLoader<SnapshotsData>(args, (projectId) => `/projects/${projectId}/snapshots`);
export const action = (args: EnterpriseActionArgs) =>
  projectAction(args, {
    create: async ({ request, projectId, body }) => {
      await apiRequest(request, `/projects/${projectId}/snapshots`, {
        method: 'POST',
        body: JSON.stringify({ label: body.label || 'Manual checkpoint', kind: 'manual', manifest: {} }),
      });
      return redirect(`/projects/${projectId}/snapshots`);
    },
    restore: async ({ request, projectId, body }) => {
      await apiRequest(request, `/projects/${projectId}/snapshots/${body.snapshotId}/restore`, { method: 'POST' });
      return redirect(`/projects/${projectId}/snapshots`);
    },
  });

export default function ProjectSnapshotsPage() {
  const { project, data } = useLoaderData<typeof loader>();

  return (
    <ProjectShell
      projectId={project.id}
      title="Snapshots"
      description="Manual and automatic project checkpoints for rollback, AI safety and exports."
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <ActivityList
          items={
            data.snapshots.length
              ? data.snapshots.map((snapshot) => ({
                  title: snapshot.label ?? snapshot.kind,
                  detail: `${snapshot.kind} - ${snapshot.byteLength ?? 0} bytes - ${snapshot.createdAt ? new Date(snapshot.createdAt).toLocaleString() : 'recorded'}`,
                  icon: Layers,
                }))
              : [
                  {
                    title: 'No snapshots yet',
                    detail: 'Create a real snapshot from persistent project files.',
                    icon: RotateCcw,
                  },
                ]
          }
        />
        <div className="space-y-4 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-6">
          <Form method="post" className="grid gap-3">
            <input type="hidden" name="intent" value="create" />
            <input
              className="h-10 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 text-sm outline-none"
              name="label"
              placeholder="Manual checkpoint"
            />
            <Button type="submit">Create snapshot</Button>
          </Form>
          {data.snapshots.map((snapshot) => (
            <Form
              method="post"
              key={snapshot.id}
              onSubmit={(event) => {
                // Restore overwrites the live project files with the snapshot.
                if (!window.confirm('Restore this snapshot? It overwrites the current project files.')) {
                  event.preventDefault();
                }
              }}
            >
              <input type="hidden" name="intent" value="restore" />
              <input type="hidden" name="snapshotId" value={snapshot.id} />
              <Button type="submit" variant="outline">
                Restore {snapshot.label ?? snapshot.id}
              </Button>
            </Form>
          ))}
        </div>
      </div>
    </ProjectShell>
  );
}
