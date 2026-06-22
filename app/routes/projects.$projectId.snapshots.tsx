import { Layers, RotateCcw } from 'lucide-react';
import type { MetaFunction } from 'react-router';
import { Form, useActionData, useLoaderData, useNavigation } from 'react-router';
import { ActivityList, ProjectShell } from '~/components/dashboard/SaaSLayout';
import { Button } from '~/components/ui/Button';
import {
  apiErrorMessage,
  apiRequest,
  json,
  redirect,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';
import { projectAction, projectPageLoader } from '~/lib/project-route.server';

type SnapshotsData = {
  snapshots: Array<{ id: string; label?: string; kind: string; byteLength?: number; createdAt?: string }>;
};

/**
 * True when `error` is a react-router redirect Response (3xx with a Location
 * header). apiRequest throws one of these when the session expired (401) or MFA
 * is required (403) on a page-navigation route, so the snapshot create/restore
 * actions must re-throw it to let the browser follow the login/MFA redirect
 * instead of swallowing a body-less redirect into an inline "Snapshot … failed."
 * banner.
 */
export function isReauthRedirect(error: unknown): error is Response {
  return error instanceof Response && error.status >= 300 && error.status < 400;
}

export const meta: MetaFunction = () => [{ title: 'Project snapshots - E-Code' }];
export const loader = (args: EnterpriseLoaderArgs) =>
  projectPageLoader<SnapshotsData>(args, (projectId) => `/projects/${projectId}/snapshots`);
export const action = (args: EnterpriseActionArgs) =>
  projectAction(args, {
    create: async ({ request, projectId, body }) => {
      try {
        await apiRequest(request, `/projects/${projectId}/snapshots`, {
          method: 'POST',
          body: JSON.stringify({ label: body.label || 'Manual checkpoint', kind: 'manual', manifest: {} }),
        });
      } catch (error) {
        /* Let login/MFA re-auth redirects (302 → /login?returnTo=…) propagate instead of swallowing them. */
        if (isReauthRedirect(error)) {
          throw error;
        }

        /* Surface RBAC/validation/storage failures inline instead of throwing to the error boundary. */
        const status = error instanceof Response ? error.status : 400;

        return json({ error: await apiErrorMessage(error, 'Snapshot create failed.') }, { status });
      }
      return redirect(`/projects/${projectId}/snapshots`);
    },
    restore: async ({ request, projectId, body }) => {
      try {
        await apiRequest(request, `/projects/${projectId}/snapshots/${body.snapshotId}/restore`, { method: 'POST' });
      } catch (error) {
        /* Let login/MFA re-auth redirects (302 → /login?returnTo=…) propagate instead of swallowing them. */
        if (isReauthRedirect(error)) {
          throw error;
        }

        /* A failed restore (409 SNAPSHOT_STORAGE_MISSING / CHECKSUM_MISMATCH) should show inline, not crash. */
        const status = error instanceof Response ? error.status : 400;

        return json({ error: await apiErrorMessage(error, 'Snapshot restore failed.') }, { status });
      }
      return redirect(`/projects/${projectId}/snapshots`);
    },
  });

export default function ProjectSnapshotsPage() {
  const { project, data } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const busy = navigation.state !== 'idle';
  const actionData = useActionData<typeof action>() as { error?: string } | undefined;

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
            <Button type="submit" disabled={busy} aria-busy={busy}>
              {busy ? 'Working…' : 'Create snapshot'}
            </Button>
          </Form>
          {actionData?.error ? (
            <p className="text-sm text-red-500" role="alert">
              {actionData.error}
            </p>
          ) : null}
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
              <Button type="submit" variant="outline" className="max-w-full" disabled={busy} aria-busy={busy}>
                <span className="inline-flex max-w-full items-center gap-1">
                  Restore
                  <span className="min-w-0 max-w-[12rem] truncate" title={snapshot.label ?? snapshot.id}>
                    {snapshot.label ?? snapshot.id}
                  </span>
                </span>
              </Button>
            </Form>
          ))}
        </div>
      </div>
    </ProjectShell>
  );
}
