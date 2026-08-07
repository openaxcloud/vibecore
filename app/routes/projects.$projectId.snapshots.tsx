import { Layers, RotateCcw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { MetaFunction } from 'react-router';
import { Form, useActionData, useFetcher, useLoaderData, useNavigation, useRevalidator } from 'react-router';
import { toast } from 'react-toastify';
import { AsyncPanelError, AsyncPanelSkeleton } from '~/components/dashboard/AsyncPanelState';
import { ProjectShell } from '~/components/dashboard/SaaSLayout';
import { Button } from '~/components/ui/Button';
import { ConfirmationDialog } from '~/components/ui/Dialog';
import { RelativeTime } from '~/components/ui/RelativeTime';
import {
  apiRequest,
  formObject,
  json,
  redirect,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';
import {
  formatProjectSnapshotBytes,
  formatProjectSnapshotsCopy,
  formatProjectSnapshotsPlural,
  getProjectSnapshotsCopy,
  projectSnapshotDisplayLabel,
  projectSnapshotKindLabel,
  projectSnapshotsErrorCodeForStatus,
  projectSnapshotsErrorMessage,
  resolveProjectSnapshotsLanguage,
  type ProjectSnapshotsCopy,
  type ProjectSnapshotsErrorCode,
  type ProjectSnapshotsLanguage,
} from '~/lib/i18n/catalogs/project-snapshots';
import { resolveRequestLocale } from '~/lib/i18n/request-locale';
import type { ProjectRecord } from '~/lib/project-route.server';
import { isReauthRedirect } from '~/lib/route-reauth';

type SnapshotSummary = {
  id: string;
  label?: string;
  kind: string;
  byteLength?: number;
  createdAt?: string;
};

type SnapshotsData = {
  snapshots: SnapshotSummary[];
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

type PreviewFetcherData = { preview: RestorePreview } | { errorCode: ProjectSnapshotsErrorCode; snapshotId: string };

type RestoreFetcherData =
  | {
      ok: true;
      snapshotId: string;
      restoredLabel: string;
      safetySnapshotCreated: boolean;
    }
  | { errorCode: ProjectSnapshotsErrorCode; snapshotId: string };

type CreateActionData = { errorCode?: ProjectSnapshotsErrorCode };

function normalizeSnapshots(payload: unknown): SnapshotSummary[] {
  if (!payload || typeof payload !== 'object' || !Array.isArray((payload as SnapshotsData).snapshots)) {
    return [];
  }

  return (payload as SnapshotsData).snapshots.flatMap((candidate) => {
    if (!candidate || typeof candidate.id !== 'string' || !candidate.id.trim()) {
      return [];
    }

    return [
      {
        id: candidate.id,
        label: typeof candidate.label === 'string' && candidate.label.trim() ? candidate.label : undefined,
        kind: typeof candidate.kind === 'string' ? candidate.kind : '',
        byteLength:
          typeof candidate.byteLength === 'number' && Number.isFinite(candidate.byteLength) && candidate.byteLength >= 0
            ? candidate.byteLength
            : undefined,
        createdAt: typeof candidate.createdAt === 'string' ? candidate.createdAt : undefined,
      },
    ];
  });
}

function nonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function normalizeDiffEntries(value: unknown): DiffEntry[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const entries: DiffEntry[] = [];

  for (const candidate of value) {
    if (
      !candidate ||
      typeof candidate !== 'object' ||
      typeof (candidate as DiffEntry).path !== 'string' ||
      !nonNegativeInteger((candidate as DiffEntry).sizeBytes)
    ) {
      return null;
    }

    entries.push({ path: (candidate as DiffEntry).path, sizeBytes: (candidate as DiffEntry).sizeBytes });
  }

  return entries;
}

function normalizeRestorePreview(payload: unknown, expectedSnapshotId: string): RestorePreview | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const preview = (payload as { preview?: unknown }).preview;

  if (!preview || typeof preview !== 'object') {
    return null;
  }

  const candidate = preview as Partial<RestorePreview>;
  const counts = candidate.counts;
  const files = candidate.files;

  if (
    candidate.snapshotId !== expectedSnapshotId ||
    !counts ||
    !nonNegativeInteger(counts.added) ||
    !nonNegativeInteger(counts.changed) ||
    !nonNegativeInteger(counts.removed) ||
    !nonNegativeInteger(counts.unchanged) ||
    !files ||
    typeof candidate.truncated !== 'boolean'
  ) {
    return null;
  }

  const added = normalizeDiffEntries(files.added);
  const changed = normalizeDiffEntries(files.changed);
  const removed = normalizeDiffEntries(files.removed);

  if (!added || !changed || !removed) {
    return null;
  }

  return {
    snapshotId: candidate.snapshotId,
    ...(typeof candidate.label === 'string' ? { label: candidate.label } : {}),
    ...(typeof candidate.createdAt === 'string' ? { createdAt: candidate.createdAt } : {}),
    ...(nonNegativeInteger(candidate.byteLength) ? { byteLength: candidate.byteLength } : {}),
    counts,
    files: { added, changed, removed },
    truncated: candidate.truncated,
  };
}

function snapshotPageUrl(projectId: string, language: ProjectSnapshotsLanguage): string {
  const path = `/projects/${encodeURIComponent(projectId)}/snapshots`;

  return language === 'fr' ? `${path}?lang=fr` : path;
}

export const meta: MetaFunction<typeof loader> = ({ data, matches }) => {
  const rootData = matches.find((match) => match.id === 'root')?.data as { language?: string } | undefined;
  const copy = getProjectSnapshotsCopy(data?.language ?? rootData?.language);
  const title = copy['projectSnapshots.meta.title'];
  const description = copy['projectSnapshots.meta.description'];

  return [
    { title },
    { name: 'description', content: description },
    { property: 'og:title', content: title },
    { property: 'og:description', content: description },
    { name: 'twitter:title', content: title },
    { name: 'twitter:description', content: description },
  ];
};

export { UserAreaRouteErrorBoundary as ErrorBoundary } from '~/components/dashboard/UserAreaRouteError';

export async function loader({ request, params }: EnterpriseLoaderArgs) {
  const language = resolveProjectSnapshotsLanguage(resolveRequestLocale(request).language);
  const copy = getProjectSnapshotsCopy(language);
  const projectId = params.projectId;

  if (!projectId) {
    throw json({ error: copy['projectSnapshots.error.projectUnavailable'] }, { status: 404 });
  }

  const safeProjectId = encodeURIComponent(projectId);
  const projectPromise = apiRequest<{ project?: ProjectRecord }>(request, `/projects/${safeProjectId}`);

  const snapshotsPromise = apiRequest<SnapshotsData>(request, `/projects/${safeProjectId}/snapshots`).then(
    (result) => ({ available: true as const, snapshots: normalizeSnapshots(result) }),
    (error: unknown) => {
      if (isReauthRedirect(error)) {
        throw error;
      }

      return { available: false as const, snapshots: [] };
    },
  );

  const [projectResult, snapshotsResult] = await Promise.all([projectPromise, snapshotsPromise]);

  if (!projectResult.project?.id) {
    throw json({ error: copy['projectSnapshots.error.projectUnavailable'] }, { status: 502 });
  }

  return json({
    project: projectResult.project,
    data: { snapshots: snapshotsResult.snapshots },
    snapshotsUnavailable: !snapshotsResult.available,
    language,
  });
}

function actionError(error: unknown, snapshotId?: string) {
  if (isReauthRedirect(error)) {
    throw error;
  }

  const status = error instanceof Response ? error.status : 503;

  const errorCode =
    error instanceof Response ? projectSnapshotsErrorCodeForStatus(error.status) : ('unavailable' as const);

  return json(snapshotId ? { errorCode, snapshotId } : { errorCode }, { status });
}

export async function action({ request, params }: EnterpriseActionArgs) {
  const language = resolveProjectSnapshotsLanguage(resolveRequestLocale(request).language);
  const copy = getProjectSnapshotsCopy(language);
  const projectId = params.projectId;

  if (!projectId) {
    return json<CreateActionData>({ errorCode: 'projectUnavailable' }, { status: 404 });
  }

  const body = formObject(await request.formData()) as {
    intent?: string;
    label?: string;
    snapshotId?: string;
    snapshotLabel?: string;
  };

  const safeProjectId = encodeURIComponent(projectId);

  if (body.intent === 'create') {
    const label = body.label?.trim() || copy['projectSnapshots.create.placeholder'];

    try {
      await apiRequest(request, `/projects/${safeProjectId}/snapshots`, {
        method: 'POST',
        body: JSON.stringify({ label, kind: 'manual', manifest: {} }),
      });

      return redirect(snapshotPageUrl(projectId, language));
    } catch (error) {
      return actionError(error);
    }
  }

  if (body.intent !== 'preview' && body.intent !== 'restore') {
    return json<CreateActionData>({ errorCode: 'unsupported' }, { status: 400 });
  }

  const snapshotId = body.snapshotId?.trim();

  if (!snapshotId) {
    return json({ errorCode: 'snapshotRequired' as const, snapshotId: '' }, { status: 400 });
  }

  const safeSnapshotId = encodeURIComponent(snapshotId);

  if (body.intent === 'preview') {
    try {
      const result = await apiRequest<unknown>(
        request,
        `/projects/${safeProjectId}/snapshots/${safeSnapshotId}/restore-preview`,
      );

      const preview = normalizeRestorePreview(result, snapshotId);

      if (!preview) {
        return json<PreviewFetcherData>({ errorCode: 'unavailable', snapshotId }, { status: 502 });
      }

      return json<PreviewFetcherData>({ preview });
    } catch (error) {
      return actionError(error, snapshotId);
    }
  }

  try {
    const result = await apiRequest<{ safetySnapshot?: { id?: string } }>(
      request,
      `/projects/${safeProjectId}/snapshots/${safeSnapshotId}/restore`,
      { method: 'POST' },
    );

    return json<RestoreFetcherData>({
      ok: true,
      snapshotId,
      restoredLabel: body.snapshotLabel?.trim() || copy['projectSnapshots.kind.snapshot'],
      safetySnapshotCreated: Boolean(result.safetySnapshot?.id),
    });
  } catch (error) {
    return actionError(error, snapshotId);
  }
}

/** Capped, responsive path list for one restore-diff category. */
function DiffFileList({
  entries,
  totalCount,
  tone,
  language,
}: {
  entries: DiffEntry[];
  totalCount: number;
  tone: string;
  language: ProjectSnapshotsLanguage;
}) {
  if (totalCount === 0) {
    return null;
  }

  return (
    <span className="block space-y-1">
      {entries.map((entry) => (
        <span
          key={entry.path}
          className="flex min-w-0 flex-col gap-0.5 rounded px-1 py-0.5 font-mono text-xs sm:flex-row sm:items-baseline sm:gap-2"
        >
          <span className={tone} aria-hidden="true">
            •
          </span>
          <code className="min-w-0 flex-1 break-all font-mono">{entry.path}</code>
          <span className="shrink-0 text-bolt-elements-textTertiary">
            {formatProjectSnapshotBytes(entry.sizeBytes, language)}
          </span>
        </span>
      ))}
      {totalCount > entries.length ? (
        <span className="block break-words text-xs text-bolt-elements-textTertiary">
          {formatProjectSnapshotsPlural('projectSnapshots.restore.more', totalCount - entries.length, language)}
        </span>
      ) : null}
    </span>
  );
}

/** Dialog body: real diffstat (or its loading/error states) for a pending restore. */
function RestorePreviewBody({
  expectedSnapshotId,
  state,
  data,
  restoreErrorCode,
  copy,
  language,
}: {
  expectedSnapshotId: string;
  state: 'loading' | 'idle';
  data?: PreviewFetcherData;
  restoreErrorCode?: ProjectSnapshotsErrorCode;
  copy: ProjectSnapshotsCopy;
  language: ProjectSnapshotsLanguage;
}) {
  const preview = data && 'preview' in data && data.preview.snapshotId === expectedSnapshotId ? data.preview : null;

  const previewErrorCode =
    data && 'errorCode' in data && data.snapshotId === expectedSnapshotId ? data.errorCode : undefined;

  const restoreError = projectSnapshotsErrorMessage(restoreErrorCode, language);

  if (state === 'loading' || (!preview && !previewErrorCode)) {
    return (
      <span className="block space-y-3 text-left">
        <span className="block break-words text-sm text-bolt-elements-textSecondary" role="status">
          {copy['projectSnapshots.restore.loadingPreview']}
        </span>
        {restoreError ? (
          <span className="block break-words text-sm text-bolt-elements-icon-error" role="alert">
            {restoreError}
          </span>
        ) : null}
      </span>
    );
  }

  if (previewErrorCode) {
    return (
      <span className="block space-y-3 text-left">
        <span className="block break-words text-sm text-bolt-elements-icon-error" role="alert">
          {projectSnapshotsErrorMessage(previewErrorCode, language)}{' '}
          {copy['projectSnapshots.restore.previewUnavailable']}
        </span>
        {restoreError ? (
          <span className="block break-words text-sm text-bolt-elements-icon-error" role="alert">
            {restoreError}
          </span>
        ) : null}
      </span>
    );
  }

  if (!preview) {
    return (
      <span className="block break-words text-sm text-bolt-elements-textSecondary" role="status">
        {copy['projectSnapshots.restore.loadingPreview']}
      </span>
    );
  }

  const { counts, files, truncated } = preview;
  const total = counts.added + counts.changed + counts.removed;

  return (
    <span className="block min-w-0 space-y-3 text-left">
      <span className="block break-words text-sm text-bolt-elements-textSecondary">
        {copy['projectSnapshots.restore.safetyDescription']}
      </span>
      {total === 0 ? (
        <span className="block break-words text-sm text-bolt-elements-textPrimary">
          {formatProjectSnapshotsPlural('projectSnapshots.restore.noDifferences', counts.unchanged, language)}
        </span>
      ) : (
        <>
          <span className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <span className="break-words text-bolt-elements-icon-success">
              {formatProjectSnapshotsPlural('projectSnapshots.restore.added', counts.added, language)}
            </span>
            <span className="break-words text-bolt-elements-icon-warning">
              {formatProjectSnapshotsPlural('projectSnapshots.restore.changed', counts.changed, language)}
            </span>
            <span className="break-words text-bolt-elements-icon-error">
              {formatProjectSnapshotsPlural('projectSnapshots.restore.removed', counts.removed, language)}
            </span>
            <span className="break-words text-bolt-elements-textTertiary">
              {formatProjectSnapshotsPlural('projectSnapshots.restore.unchanged', counts.unchanged, language)}
            </span>
          </span>
          <span className="block max-h-56 min-w-0 space-y-2 overflow-y-auto rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-2">
            <DiffFileList
              entries={files.added}
              totalCount={counts.added}
              tone="text-bolt-elements-icon-success"
              language={language}
            />
            <DiffFileList
              entries={files.changed}
              totalCount={counts.changed}
              tone="text-bolt-elements-icon-warning"
              language={language}
            />
            <DiffFileList
              entries={files.removed}
              totalCount={counts.removed}
              tone="text-bolt-elements-icon-error"
              language={language}
            />
          </span>
          {truncated ? (
            <span className="block break-words text-xs text-bolt-elements-textTertiary">
              {copy['projectSnapshots.restore.truncated']}
            </span>
          ) : null}
        </>
      )}
      {restoreError ? (
        <span className="block break-words text-sm text-bolt-elements-icon-error" role="alert">
          {restoreError}
        </span>
      ) : null}
    </span>
  );
}

function SnapshotList({
  snapshots,
  busy,
  onRestore,
  copy,
  language,
}: {
  snapshots: SnapshotSummary[];
  busy: boolean;
  onRestore: (snapshot: SnapshotSummary) => void;
  copy: ProjectSnapshotsCopy;
  language: ProjectSnapshotsLanguage;
}) {
  return (
    <section className="min-w-0 overflow-hidden rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-bolt-elements-borderColor px-4 py-3 sm:px-5">
        <h2 className="break-words text-base font-semibold text-bolt-elements-textPrimary">
          {copy['projectSnapshots.list.title']}
        </h2>
        {snapshots.length ? (
          <span className="text-xs text-bolt-elements-textTertiary">
            {formatProjectSnapshotsPlural('projectSnapshots.list.count', snapshots.length, language)}
          </span>
        ) : null}
      </div>
      {snapshots.length ? (
        <ul className="divide-y divide-bolt-elements-borderColor">
          {snapshots.map((snapshot) => {
            const kind = projectSnapshotKindLabel(snapshot.kind, language);
            const label = projectSnapshotDisplayLabel(snapshot.label, snapshot.kind, language);

            return (
              <li key={snapshot.id} className="flex min-w-0 flex-col gap-3 p-4 sm:flex-row sm:items-center sm:px-5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-bolt-elements-background-depth-3">
                  <Layers className="h-4 w-4" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="break-words text-sm font-medium text-bolt-elements-textPrimary">{label}</h3>
                  <p className="mt-1 flex flex-wrap gap-x-1 break-words text-xs leading-relaxed text-bolt-elements-textSecondary">
                    <span>
                      {formatProjectSnapshotsCopy(copy['projectSnapshots.snapshot.size'], {
                        kind,
                        size: formatProjectSnapshotBytes(snapshot.byteLength, language),
                      })}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {snapshot.createdAt ? (
                        <RelativeTime value={snapshot.createdAt} />
                      ) : (
                        copy['projectSnapshots.snapshot.recorded']
                      )}
                    </span>
                  </p>
                  <p className="mt-1 break-all font-mono text-[0.7rem] text-bolt-elements-textTertiary">
                    {formatProjectSnapshotsCopy(copy['projectSnapshots.snapshot.identifier'], { id: snapshot.id })}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="!h-auto min-h-[44px] w-full shrink-0 !whitespace-normal break-words py-2 text-center leading-tight sm:w-auto sm:max-w-64"
                  disabled={busy}
                  onClick={() => onRestore(snapshot)}
                  aria-label={formatProjectSnapshotsCopy(copy['projectSnapshots.restore.open'], { label })}
                >
                  <RotateCcw className="mr-2 h-4 w-4 shrink-0" aria-hidden />
                  {formatProjectSnapshotsCopy(copy['projectSnapshots.restore.open'], { label })}
                </Button>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="flex min-w-0 items-start gap-3 p-5 sm:p-6">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-bolt-elements-background-depth-3">
            <RotateCcw className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <h3 className="break-words text-sm font-semibold text-bolt-elements-textPrimary">
              {copy['projectSnapshots.list.emptyTitle']}
            </h3>
            <p className="mt-1 break-words text-sm leading-6 text-bolt-elements-textSecondary">
              {copy['projectSnapshots.list.emptyDescription']}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

export default function ProjectSnapshotsPage() {
  const { project, data, snapshotsUnavailable, language: loaderLanguage } = useLoaderData<typeof loader>();
  const language = resolveProjectSnapshotsLanguage(loaderLanguage);
  const copy = getProjectSnapshotsCopy(language);
  const navigation = useNavigation();
  const revalidator = useRevalidator();
  const actionData = useActionData<typeof action>() as CreateActionData | undefined;
  const actionError = projectSnapshotsErrorMessage(actionData?.errorCode, language);
  const previewFetcher = useFetcher<PreviewFetcherData>();
  const restoreFetcher = useFetcher<RestoreFetcherData>();
  const [pendingRestore, setPendingRestore] = useState<SnapshotSummary | null>(null);
  const handledRestoreResult = useRef<RestoreFetcherData | null>(null);
  const creating = navigation.state !== 'idle' && navigation.formData?.get('intent')?.toString() === 'create';
  const restoring = restoreFetcher.state !== 'idle';
  const retrying = revalidator.state !== 'idle';
  const pendingLabel = projectSnapshotDisplayLabel(pendingRestore?.label, pendingRestore?.kind, language);

  const currentRestoreError =
    restoreFetcher.data && 'errorCode' in restoreFetcher.data && restoreFetcher.data.snapshotId === pendingRestore?.id
      ? restoreFetcher.data.errorCode
      : undefined;

  /* Toast each restore outcome once; fetcher.data persists across renders. */
  useEffect(() => {
    if (restoreFetcher.state !== 'idle' || !restoreFetcher.data) {
      return;
    }

    if (handledRestoreResult.current === restoreFetcher.data) {
      return;
    }

    handledRestoreResult.current = restoreFetcher.data;

    if ('errorCode' in restoreFetcher.data) {
      toast.error(projectSnapshotsErrorMessage(restoreFetcher.data.errorCode, language));
      return;
    }

    const message = formatProjectSnapshotsCopy(
      copy[
        restoreFetcher.data.safetySnapshotCreated
          ? 'projectSnapshots.status.restoredWithSafety'
          : 'projectSnapshots.status.restored'
      ],
      { label: restoreFetcher.data.restoredLabel },
    );
    toast.success(message);
    setPendingRestore(null);
  }, [copy, language, restoreFetcher.data, restoreFetcher.state]);

  const openRestoreDialog = (snapshot: SnapshotSummary) => {
    setPendingRestore(snapshot);
    previewFetcher.submit({ intent: 'preview', snapshotId: snapshot.id }, { method: 'post' });
  };

  return (
    <ProjectShell
      projectId={project.id}
      title={copy['projectSnapshots.page.title']}
      description={copy['projectSnapshots.page.description']}
    >
      <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(300px,380px)]">
        <div className="min-w-0">
          {snapshotsUnavailable ? (
            retrying ? (
              <AsyncPanelSkeleton label={copy['projectSnapshots.list.loading']} rows={4} />
            ) : (
              <AsyncPanelError
                title={copy['projectSnapshots.list.errorTitle']}
                description={copy['projectSnapshots.list.errorDescription']}
                retryLabel={copy['projectSnapshots.list.retry']}
                onRetry={() => revalidator.revalidate()}
              />
            )
          ) : (
            <SnapshotList
              snapshots={data.snapshots}
              busy={creating || restoring}
              onRestore={openRestoreDialog}
              copy={copy}
              language={language}
            />
          )}
        </div>

        <section className="h-fit min-w-0 space-y-4 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4 sm:p-6">
          <div className="min-w-0">
            <h2 className="break-words text-base font-semibold text-bolt-elements-textPrimary">
              {copy['projectSnapshots.create.title']}
            </h2>
            <p className="mt-1 break-words text-sm leading-6 text-bolt-elements-textSecondary">
              {copy['projectSnapshots.create.description']}
            </p>
          </div>
          <Form method="post" className="grid min-w-0 gap-3">
            <input type="hidden" name="intent" value="create" />
            <label className="min-w-0 text-sm font-medium text-bolt-elements-textPrimary" htmlFor="snapshot-label">
              {copy['projectSnapshots.create.label']}
            </label>
            <input
              id="snapshot-label"
              className="min-h-[44px] min-w-0 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-sm outline-none focus:border-bolt-elements-focus"
              name="label"
              placeholder={copy['projectSnapshots.create.placeholder']}
              autoComplete="off"
              maxLength={160}
            />
            <Button
              type="submit"
              disabled={creating || restoring}
              aria-busy={creating}
              className="!h-auto min-h-[44px] !whitespace-normal break-words py-2 text-center leading-tight"
            >
              {copy[creating ? 'projectSnapshots.create.busy' : 'projectSnapshots.create.submit']}
            </Button>
          </Form>
          {actionError ? (
            <p
              className="break-words rounded-md border border-[var(--status-error-border)] bg-[var(--status-error-bg)] p-3 text-sm text-[var(--status-error-text)]"
              role="alert"
            >
              {actionError}
            </p>
          ) : null}
        </section>
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
            restoreFetcher.submit(
              {
                intent: 'restore',
                snapshotId: pendingRestore.id,
                snapshotLabel: pendingLabel,
              },
              { method: 'post' },
            );
          }
        }}
        title={formatProjectSnapshotsCopy(copy['projectSnapshots.restore.title'], { label: pendingLabel })}
        description={
          pendingRestore ? (
            <RestorePreviewBody
              expectedSnapshotId={pendingRestore.id}
              state={previewFetcher.state !== 'idle' ? 'loading' : 'idle'}
              data={previewFetcher.data}
              restoreErrorCode={currentRestoreError}
              copy={copy}
              language={language}
            />
          ) : (
            copy['projectSnapshots.restore.loadingPreview']
          )
        }
        confirmLabel={copy['projectSnapshots.restore.confirm']}
        cancelLabel={copy['projectSnapshots.restore.cancel']}
        variant="destructive"
        isLoading={restoring}
      />
    </ProjectShell>
  );
}
