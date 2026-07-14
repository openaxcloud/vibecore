import { Layers, RotateCcw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { MetaFunction } from 'react-router';
import { Form, useActionData, useFetcher, useLoaderData, useNavigation } from 'react-router';
import { toast } from 'react-toastify';
import { ActivityList, ProjectShell } from '~/components/dashboard/SaaSLayout';
import { Button } from '~/components/ui/Button';
import { ConfirmationDialog } from '~/components/ui/Dialog';
import { RelativeTime } from '~/components/ui/RelativeTime';
import {
  apiErrorMessage,
  apiRequest,
  json,
  redirect,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';
import { projectAction, projectPageLoader } from '~/lib/project-route.server';
import { isReauthRedirect } from '~/lib/route-reauth';
import { userFacingLabel } from '~/lib/user-facing-labels';

type SnapshotSummary = { id: string; label?: string; kind: string; byteLength?: number; createdAt?: string };

type SnapshotsData = {
  snapshots: Array<SnapshotSummary>;
};

/** One file entry of the server-computed restore diffstat. */
type DiffEntry = { path: string; sizeBytes: number };

/**
 * Dry-run diffstat computed by GET /projects/:id/snapshots/:id/restore-preview:
 * the snapshot's archived files compared byte-for-byte against the project's
 * current files. `files` lists are capped server-side (counts are exact).
 */
type RestorePreview = {
  snapshotId: string;
  label?: string;
  createdAt?: string;
  byteLength?: number;
  counts: { added: number; changed: number; removed: number; unchanged: number };
  files: { added: DiffEntry[]; changed: DiffEntry[]; removed: DiffEntry[] };
  truncated: boolean;
};

type PreviewFetcherData = { preview: RestorePreview } | { error: string };
type RestoreFetcherData =
  | { ok: true; restoredLabel: string; safetySnapshotId?: string; safetySnapshotLabel?: string }
  | { error: string };

/**
 * True when `error` is a react-router redirect Response (3xx with a Location
 * header). apiRequest throws one of these when the session expired (401) or MFA
 * is required (403) on a page-navigation route, so the snapshot create/restore
 * actions must re-throw it to let the browser follow the login/MFA redirect
 * instead of swallowing a body-less redirect into an inline "Snapshot … failed."
 * banner.
 */
export const meta: MetaFunction = () => [{ title: 'Project snapshots - E-Code' }];
export { UserAreaRouteErrorBoundary as ErrorBoundary } from '~/components/dashboard/UserAreaRouteError';
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
    preview: async ({ request, projectId, body }) => {
      /* Server-computed restore diffstat shown in the confirm dialog before a restore runs. */
      try {
        const result = await apiRequest<{ preview: RestorePreview }>(
          request,
          `/projects/${projectId}/snapshots/${body.snapshotId}/restore-preview`,
        );

        return json({ preview: result.preview });
      } catch (error) {
        if (isReauthRedirect(error)) {
          throw error;
        }

        const status = error instanceof Response ? error.status : 400;

        return json({ error: await apiErrorMessage(error, 'Could not compute the restore preview.') }, { status });
      }
    },
    restore: async ({ request, projectId, body }) => {
      try {
        const result = await apiRequest<{
          snapshot?: SnapshotSummary;
          safetySnapshot?: { id: string; label?: string };
        }>(request, `/projects/${projectId}/snapshots/${body.snapshotId}/restore`, { method: 'POST' });

        /*
         * Return JSON (loaders revalidate after the action anyway) so the UI can
         * toast the automatic safety snapshot the API took before overwriting.
         */
        return json({
          ok: true as const,
          restoredLabel: result.snapshot?.label ?? body.snapshotId,
          safetySnapshotId: result.safetySnapshot?.id,
          safetySnapshotLabel: result.safetySnapshot?.label,
        });
      } catch (error) {
        /* Let login/MFA re-auth redirects (302 → /login?returnTo=…) propagate instead of swallowing them. */
        if (isReauthRedirect(error)) {
          throw error;
        }

        /* A failed restore (409 SNAPSHOT_STORAGE_MISSING / CHECKSUM_MISMATCH) should show inline, not crash. */
        const status = error instanceof Response ? error.status : 400;

        return json({ error: await apiErrorMessage(error, 'Snapshot restore failed.') }, { status });
      }
    },
  });

/**
 * Capped path list for one diffstat category (added/changed/removed).
 * Rendered with block-level <span>s (not <ul>) because the dialog description
 * is a <p> element — flow content inside it would be invalid HTML.
 */
function DiffFileList({ entries, totalCount, tone }: { entries: DiffEntry[]; totalCount: number; tone: string }) {
  if (totalCount === 0) {
    return null;
  }

  return (
    <span className="block space-y-0.5">
      {entries.map((entry) => (
        <span key={entry.path} className="flex min-w-0 items-baseline gap-2 font-mono text-xs">
          <span className={tone} aria-hidden="true">
            •
          </span>
          <span className="min-w-0 flex-1 truncate" title={entry.path}>
            {entry.path}
          </span>
          <span className="shrink-0 text-bolt-elements-textTertiary">{entry.sizeBytes} B</span>
        </span>
      ))}
      {totalCount > entries.length ? (
        <span className="block text-xs text-bolt-elements-textTertiary">…and {totalCount - entries.length} more</span>
      ) : null}
    </span>
  );
}

/** Dialog body: real diffstat (or its loading/error states) for a pending restore. */
function RestorePreviewBody({ state, data }: { state: 'loading' | 'idle'; data?: PreviewFetcherData }) {
  if (state === 'loading' || !data) {
    return (
      <span className="text-sm text-bolt-elements-textSecondary" role="status">
        Comparing the snapshot with the current project files…
      </span>
    );
  }

  if ('error' in data) {
    return (
      <span className="text-sm text-bolt-elements-icon-error" role="alert">
        {data.error} You can still restore, but the change summary is unavailable.
      </span>
    );
  }

  const { counts, files, truncated } = data.preview;
  const total = counts.added + counts.changed + counts.removed;

  return (
    <span className="block space-y-3 text-left">
      <span className="block text-sm text-bolt-elements-textSecondary">
        Restoring overwrites the current project files. A safety snapshot of the current state is taken automatically
        first.
      </span>
      {total === 0 ? (
        <span className="block text-sm text-bolt-elements-textPrimary">
          No differences — the project already matches this snapshot ({counts.unchanged} files unchanged).
        </span>
      ) : (
        <>
          <span className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <span className="text-bolt-elements-icon-success">+{counts.added} added</span>
            <span className="text-bolt-elements-icon-warning">~{counts.changed} changed</span>
            <span className="text-bolt-elements-icon-error">−{counts.removed} removed</span>
            <span className="text-bolt-elements-textTertiary">{counts.unchanged} unchanged</span>
          </span>
          <span className="block max-h-48 space-y-2 overflow-y-auto rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-2">
            <DiffFileList entries={files.added} totalCount={counts.added} tone="text-bolt-elements-icon-success" />
            <DiffFileList entries={files.changed} totalCount={counts.changed} tone="text-bolt-elements-icon-warning" />
            <DiffFileList entries={files.removed} totalCount={counts.removed} tone="text-bolt-elements-icon-error" />
          </span>
          {truncated ? (
            <span className="block text-xs text-bolt-elements-textTertiary">
              File lists are capped; the counts above are exact.
            </span>
          ) : null}
        </>
      )}
    </span>
  );
}

export default function ProjectSnapshotsPage() {
  const { project, data } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const busy = navigation.state !== 'idle';
  const actionData = useActionData<typeof action>() as { error?: string } | undefined;

  const previewFetcher = useFetcher<PreviewFetcherData>();
  const restoreFetcher = useFetcher<RestoreFetcherData>();
  const [pendingRestore, setPendingRestore] = useState<SnapshotSummary | null>(null);
  const handledRestoreResult = useRef<RestoreFetcherData | null>(null);

  const restoring = restoreFetcher.state !== 'idle';

  /* Toast the restore outcome once (fetcher.data persists across renders). */
  useEffect(() => {
    if (restoreFetcher.state !== 'idle' || !restoreFetcher.data) {
      return;
    }

    if (handledRestoreResult.current === restoreFetcher.data) {
      return;
    }

    handledRestoreResult.current = restoreFetcher.data;

    if ('error' in restoreFetcher.data) {
      toast.error(restoreFetcher.data.error);
    } else {
      const { restoredLabel, safetySnapshotLabel } = restoreFetcher.data;
      toast.success(
        safetySnapshotLabel
          ? `Restored "${restoredLabel}". Safety snapshot "${safetySnapshotLabel}" was created first.`
          : `Restored "${restoredLabel}".`,
      );
      setPendingRestore(null);
    }
  }, [restoreFetcher.state, restoreFetcher.data]);

  const openRestoreDialog = (snapshot: SnapshotSummary) => {
    setPendingRestore(snapshot);

    /* Fetch the REAL diffstat (snapshot archive vs current files) for the confirm dialog. */
    previewFetcher.submit({ intent: 'preview', snapshotId: snapshot.id }, { method: 'post' });
  };

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
                  title: snapshot.label ?? userFacingLabel(snapshot.kind, 'Snapshot'),
                  detail: (
                    <>
                      {userFacingLabel(snapshot.kind, 'Snapshot')} - {snapshot.byteLength ?? 0} bytes -{' '}
                      {snapshot.createdAt ? <RelativeTime value={snapshot.createdAt} /> : 'recorded'}
                    </>
                  ),
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
            <p className="text-sm text-bolt-elements-icon-error" role="alert">
              {actionData.error}
            </p>
          ) : null}
          {data.snapshots.map((snapshot) => (
            <Button
              key={snapshot.id}
              type="button"
              variant="outline"
              className="max-w-full"
              disabled={busy || restoring}
              onClick={() => openRestoreDialog(snapshot)}
            >
              <span className="inline-flex max-w-full items-center gap-1">
                Restore
                <span className="min-w-0 max-w-[12rem] truncate" title={snapshot.label ?? snapshot.id}>
                  {snapshot.label ?? snapshot.id}
                </span>
              </span>
            </Button>
          ))}
        </div>
      </div>
      <ConfirmationDialog
        isOpen={pendingRestore !== null}
        onClose={() => {
          if (!restoring) {
            setPendingRestore(null);
          }
        }}
        onConfirm={() => {
          if (pendingRestore && !restoring) {
            restoreFetcher.submit({ intent: 'restore', snapshotId: pendingRestore.id }, { method: 'post' });
          }
        }}
        title={`Restore "${pendingRestore?.label ?? pendingRestore?.id ?? ''}"?`}
        description={
          <RestorePreviewBody state={previewFetcher.state !== 'idle' ? 'loading' : 'idle'} data={previewFetcher.data} />
        }
        confirmLabel="Restore snapshot"
        cancelLabel="Cancel"
        variant="destructive"
        isLoading={restoring}
      />
    </ProjectShell>
  );
}
