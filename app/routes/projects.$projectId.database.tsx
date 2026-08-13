import { AlertTriangle, Camera, Clock, Database, History, RotateCcw, ShieldCheck } from 'lucide-react';
import { useMemo, useState } from 'react';
import type React from 'react';
import type { MetaFunction } from 'react-router';
import { Form, useActionData, useLoaderData, useNavigation } from 'react-router';
import { ProjectShell } from '~/components/dashboard/SaaSLayout';
import { Button } from '~/components/ui/Button';
import { ConfirmationDialog } from '~/components/ui/Dialog';
import {
  apiErrorMessage,
  apiRequest,
  isApiResponse,
  json,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';
import { formatUserAreaDateTime } from '~/lib/i18n/user-area-locale';
import type { ProjectRecord } from '~/lib/project-route.server';
import { isReauthRedirect } from '~/lib/route-reauth';
import { statusDisplayLabel, userFacingLabel } from '~/lib/user-facing-labels';
import { classNames } from '~/utils/classNames';

/*
 * Replit-parity database point-in-time restore — a real, functional project page
 * (replaces the former marketing shell). Lists recovery points + the continuous
 * PITR window and lets an entitled user request a restore to an exact instant.
 * Everything is gated server-side behind DB_ROLLBACK_ENABLED (the backend 404s
 * with FEATURE_NOT_ENABLED while dormant) AND the plan's rollback entitlement, so
 * this page renders an honest "not available" state until the feature ships.
 */

type Entitlement = { allowed: boolean; retentionDays: number };
type Instance = {
  id: string;
  status: string;
  engine: string;
  sizeBytes: number;
  retentionDays: number;
  pitrEnabled: boolean;
  environment?: string;
} | null;
type RecoveryPoint = {
  id: string;
  kind: string;
  label?: string;
  lsn?: string;
  timestamp: string;
  expiresAt?: string;
};
type RestoreWindow = {
  earliestMs: number;
  earliest: string;
  latestMs: number;
  latest: string;
  retentionDays: number;
} | null;
type Restore = { id: string; status: string; targetTimestamp?: string; error?: string; createdAt: string };

type LoaderData = {
  project: ProjectRecord;
  enabled: boolean;
  entitlement: Entitlement;
  instance: Instance;
  recoveryPoints: RecoveryPoint[];
  window: RestoreWindow;
  restores: Restore[];
};

export const meta: MetaFunction = () => [{ title: 'Database restore - E-Code' }];
export { UserAreaRouteErrorBoundary as ErrorBoundary } from '~/components/dashboard/UserAreaRouteError';

export async function loader(args: EnterpriseLoaderArgs) {
  const { request, params } = args;
  const projectId = params.projectId;

  if (!projectId) {
    throw json({ error: 'Project not found' }, { status: 404 });
  }

  const projectResult = await apiRequest<{ project: ProjectRecord }>(request, `/projects/${projectId}`);

  const notEnabled: Omit<LoaderData, 'project'> = {
    enabled: false,
    entitlement: { allowed: false, retentionDays: 0 },
    instance: null,
    recoveryPoints: [],
    window: null,
    restores: [],
  };

  try {
    /*
     * The panel (instance + restores + entitlement) and the recovery-points list
     * are two backend routes; both 404 with FEATURE_NOT_ENABLED while dormant.
     */
    const [panel, points] = await Promise.all([
      apiRequest<{
        entitlement: Entitlement;
        instance: Instance;
        snapshots: RecoveryPoint[];
        restores: Restore[];
      }>(request, `/projects/${projectId}/database`),
      apiRequest<{ entitlement: Entitlement; window: RestoreWindow; recoveryPoints: RecoveryPoint[] }>(
        request,
        `/projects/${projectId}/database/recovery-points`,
      ),
    ]);

    return json<LoaderData>(
      {
        project: projectResult.project,
        enabled: true,
        entitlement: panel.entitlement,
        instance: panel.instance,
        recoveryPoints: points.recoveryPoints,
        window: points.window,
        restores: panel.restores,
      },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (error) {
    if (isReauthRedirect(error)) {
      throw error;
    }

    // FEATURE_NOT_ENABLED (flag off) → render the dormant "not available" state.
    if (isApiResponse(error, 404)) {
      return json<LoaderData>({ project: projectResult.project, ...notEnabled });
    }

    const message = await apiErrorMessage(error, 'Database panel unavailable');
    const status = isApiResponse(error) && error.status !== 500 ? error.status : 502;
    throw json({ error: message }, { status });
  }
}

export async function action({ request, params }: EnterpriseActionArgs) {
  const projectId = params.projectId;

  if (!projectId) {
    throw json({ error: 'Project not found' }, { status: 404 });
  }

  const form = await request.formData();
  const intent = String(form.get('intent') ?? 'restore');

  const path =
    intent === 'provision'
      ? `/projects/${projectId}/database/provision`
      : intent === 'snapshot'
        ? `/projects/${projectId}/database/snapshots`
        : `/projects/${projectId}/database/restore`;

  const payload: Record<string, string> = {};

  if (intent === 'restore') {
    const targetTimestamp = String(form.get('targetTimestamp') ?? '');
    const snapshotId = String(form.get('snapshotId') ?? '');

    if (snapshotId) {
      payload.snapshotId = snapshotId;
    } else if (targetTimestamp) {
      // A datetime-local value has no timezone; interpret it in the user's zone.
      payload.targetTimestamp = new Date(targetTimestamp).toISOString();
    }
  } else if (intent === 'snapshot') {
    const label = String(form.get('label') ?? '').trim();

    if (label) {
      payload.label = label;
    }
  }

  try {
    const result = await apiRequest(request, path, { method: 'POST', body: JSON.stringify(payload) });

    return json({ ok: true, intent, ...(result as Record<string, unknown>) });
  } catch (error) {
    if (isReauthRedirect(error)) {
      throw error;
    }

    const message = await apiErrorMessage(error, 'Database request failed');

    return json({ ok: false, error: message }, { status: isApiResponse(error) ? error.status : 502 });
  }
}

function toLocalInputValue(iso: string): string {
  // Convert an ISO instant to a `datetime-local`-compatible value in local time.
  const date = new Date(iso);
  const offsetMs = date.getTimezoneOffset() * 60_000;

  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

export default function ProjectDatabaseRestorePage() {
  const {
    project,
    enabled,
    entitlement,
    instance,
    recoveryPoints,
    window: restoreWindow,
    restores,
  } = useLoaderData<typeof loader>();

  const actionData = useActionData<{ ok?: boolean; error?: string; intent?: string }>();
  const navigation = useNavigation();
  const busy = navigation.state !== 'idle';

  const notAvailable = !enabled || !entitlement.allowed;

  return (
    <ProjectShell
      projectId={project.id}
      title="Point-in-time restore"
      description="Roll this project's managed database back to an exact moment within your plan's retention window."
    >
      {actionData?.error ? (
        <div
          role="alert"
          className="mb-6 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-4 py-3 text-sm text-bolt-elements-textPrimary"
        >
          <span className="inline-flex items-center gap-2 text-bolt-elements-icon-error">
            <AlertTriangle className="h-4 w-4" aria-hidden />
          </span>{' '}
          {actionData.error}
        </div>
      ) : null}
      {actionData?.ok && actionData.intent === 'restore' ? (
        <div
          role="status"
          className="mb-6 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-4 py-3 text-sm text-bolt-elements-textPrimary"
        >
          Restore requested — track its progress in the history below.
        </div>
      ) : null}

      {notAvailable ? (
        <NotAvailablePanel enabled={enabled} retentionDays={entitlement.retentionDays} />
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="grid gap-6">
            <InstanceCard instance={instance} retentionDays={entitlement.retentionDays} />
            <RecoveryPointsCard points={recoveryPoints} busy={busy} disabled={!instance} />
            <RestoreHistoryCard restores={restores} />
          </div>
          <RestorePanel window={restoreWindow} busy={busy} disabled={!instance} />
        </div>
      )}
    </ProjectShell>
  );
}

function NotAvailablePanel({ enabled, retentionDays }: { enabled: boolean; retentionDays: number }) {
  return (
    <div className="grid gap-4 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-6 shadow-md">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1">
          <ShieldCheck className="h-4 w-4 text-bolt-elements-textTertiary" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-bolt-elements-textPrimary">
            Point-in-time restore is not available
          </h2>
          <p className="mt-1 text-sm text-bolt-elements-textSecondary">
            {!enabled
              ? 'Managed database rollback is not enabled for this instance yet.'
              : retentionDays > 0
                ? `Your plan includes a ${retentionDays}-day recovery window, but no eligible database is provisioned.`
                : 'Your current plan does not include database point-in-time restore. Upgrade to a plan with a recovery window to roll back to any moment.'}
          </p>
          {enabled && retentionDays === 0 ? (
            <a
              href="/usage"
              className="mt-3 inline-flex text-xs font-medium text-[var(--vc-ide-accent-action)] hover:underline"
            >
              View plans
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function InstanceCard({ instance, retentionDays }: { instance: Instance; retentionDays: number }) {
  return (
    <section className="grid gap-4 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-5 shadow-md">
      <div className="flex items-center gap-2">
        <Database className="h-4 w-4 text-bolt-elements-item-contentAccent" aria-hidden />
        <h2 className="text-[14px] font-medium text-bolt-elements-textPrimary">Managed database</h2>
      </div>
      {instance ? (
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <Stat label="Status" value={statusDisplayLabel(instance.status)} />
          <Stat label="Engine" value={userFacingLabel(instance.engine, 'Managed database')} />
          <Stat label="Retention" value={`${retentionDays} days`} />
          <Stat label="Size" value={formatBytes(instance.sizeBytes)} />
        </dl>
      ) : (
        <div className="grid gap-3">
          <p className="text-sm text-bolt-elements-textSecondary">
            No managed database is provisioned for this project yet. Provision one to start capturing recovery points.
          </p>
          <Form method="post">
            <input type="hidden" name="intent" value="provision" />
            <Button type="submit" variant="outline" size="sm" className="gap-2">
              <Database className="h-3.5 w-3.5" aria-hidden /> Provision database
            </Button>
          </Form>
        </div>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1">
      <dt className="text-[11px] font-medium uppercase tracking-[0.04em] text-bolt-elements-textTertiary">{label}</dt>
      <dd className="text-sm font-medium text-bolt-elements-textPrimary">{value}</dd>
    </div>
  );
}

function RecoveryPointsCard({ points, busy, disabled }: { points: RecoveryPoint[]; busy: boolean; disabled: boolean }) {
  return (
    <section className="rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 shadow-md">
      <div className="flex items-center justify-between gap-2 border-b border-bolt-elements-borderColor px-5 py-4">
        <div className="flex items-center gap-2">
          <Camera className="h-4 w-4 text-bolt-elements-textTertiary" aria-hidden />
          <h2 className="text-[14px] font-medium text-bolt-elements-textPrimary">Recovery points</h2>
        </div>
        <Form method="post">
          <input type="hidden" name="intent" value="snapshot" />
          <Button type="submit" variant="outline" size="sm" className="gap-2" disabled={busy || disabled}>
            <Camera className="h-3.5 w-3.5" aria-hidden /> Take snapshot
          </Button>
        </Form>
      </div>
      <div className="divide-y divide-bolt-elements-borderColor">
        {points.length ? (
          points.map((point) => (
            <article key={point.id} className="grid gap-3 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_200px] sm:items-center">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <KindBadge kind={point.kind} />
                  <span className="text-sm font-medium text-bolt-elements-textPrimary">
                    {formatUserAreaDateTime(point.timestamp) ?? 'Date unavailable'}
                  </span>
                </div>
                <p className="mt-1 truncate text-xs text-bolt-elements-textSecondary">
                  {point.label ? `${point.label} — ` : ''}
                  {point.lsn ? `WAL LSN ${point.lsn}` : 'Continuous WAL archive'}
                </p>
              </div>
              <Form method="post" className="sm:justify-self-end">
                <input type="hidden" name="intent" value="restore" />
                <input type="hidden" name="snapshotId" value={point.id} />
                <ConfirmSubmit
                  busy={busy}
                  disabled={disabled}
                  message="Restore the database to this recovery point? This replaces the current data."
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Restore to this point
                </ConfirmSubmit>
              </Form>
            </article>
          ))
        ) : (
          <div className="grid place-items-center gap-2 px-5 py-12 text-center">
            <Camera className="h-7 w-7 text-bolt-elements-textTertiary" aria-hidden />
            <p className="text-sm font-medium text-bolt-elements-textPrimary">No recovery points yet</p>
            <p className="text-xs text-bolt-elements-textSecondary">
              Automatic snapshots appear here as they are captured, or take one manually.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

function RestorePanel({
  window: restoreWindow,
  busy,
  disabled,
}: {
  window: RestoreWindow;
  busy: boolean;
  disabled: boolean;
}) {
  const bounds = useMemo(() => {
    if (!restoreWindow) {
      return undefined;
    }

    return { min: toLocalInputValue(restoreWindow.earliest), max: toLocalInputValue(restoreWindow.latest) };
  }, [restoreWindow]);

  const [value, setValue] = useState(bounds?.max ?? '');
  const outOfRange = Boolean(bounds && value && (value < bounds.min || value > bounds.max));

  return (
    <aside className="grid content-start gap-4 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-5 shadow-md">
      <div className="flex items-center gap-2">
        <Clock className="h-4 w-4 text-bolt-elements-item-contentAccent" aria-hidden />
        <h2 className="text-[14px] font-medium text-bolt-elements-textPrimary">Restore to a point in time</h2>
      </div>
      {restoreWindow ? (
        <p className="text-xs text-bolt-elements-textSecondary">
          Choose any moment in your {restoreWindow.retentionDays}-day window, from{' '}
          <span className="text-bolt-elements-textPrimary">
            {formatUserAreaDateTime(restoreWindow.earliest) ?? 'date unavailable'}
          </span>{' '}
          to{' '}
          <span className="text-bolt-elements-textPrimary">
            {formatUserAreaDateTime(restoreWindow.latest) ?? 'date unavailable'}
          </span>
          .
        </p>
      ) : (
        <p className="text-xs text-bolt-elements-textSecondary">
          The continuous restore window becomes available once a database is provisioned.
        </p>
      )}

      <Form method="post" className="grid gap-3">
        <input type="hidden" name="intent" value="restore" />
        <label className="grid gap-2 text-xs font-medium uppercase tracking-[0.04em] text-bolt-elements-textTertiary">
          Target time
          <input
            type="datetime-local"
            name="targetTimestamp"
            value={value}
            min={bounds?.min}
            max={bounds?.max}
            onChange={(event) => setValue(event.target.value)}
            disabled={disabled || !bounds}
            required
            className="h-10 w-full rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 text-sm normal-case tracking-normal text-bolt-elements-textPrimary outline-none transition-colors focus:border-bolt-elements-focus"
          />
        </label>
        {outOfRange ? (
          <p className="text-xs text-bolt-elements-icon-error">Target is outside your retention window.</p>
        ) : null}
        <ConfirmSubmit
          block
          busy={busy}
          disabled={disabled || !bounds || !value || outOfRange}
          message="Restore the database to the selected time? This replaces the current data with the state at that moment."
        >
          <RotateCcw className="h-4 w-4" aria-hidden /> {busy ? 'Requesting…' : 'Restore to this time'}
        </ConfirmSubmit>
      </Form>
      <p className="text-[11px] text-bolt-elements-textTertiary">
        A restore replays the write-ahead log to your chosen instant. The current data is replaced — this cannot be
        undone.
      </p>
    </aside>
  );
}

function RestoreHistoryCard({ restores }: { restores: Restore[] }) {
  if (!restores.length) {
    return null;
  }

  return (
    <section className="rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 shadow-md">
      <div className="flex items-center gap-2 border-b border-bolt-elements-borderColor px-5 py-4">
        <History className="h-4 w-4 text-bolt-elements-textTertiary" aria-hidden />
        <h2 className="text-[14px] font-medium text-bolt-elements-textPrimary">Restore history</h2>
      </div>
      <div className="divide-y divide-bolt-elements-borderColor">
        {restores.map((restore) => (
          <article key={restore.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
            <RestoreStatusBadge status={restore.status} />
            <span className="text-bolt-elements-textPrimary">
              {restore.targetTimestamp
                ? (formatUserAreaDateTime(restore.targetTimestamp) ?? 'Date unavailable')
                : 'Latest'}
            </span>
            <span className="text-xs text-bolt-elements-textTertiary">
              requested {formatUserAreaDateTime(restore.createdAt) ?? 'date unavailable'}
            </span>
            {restore.error ? <span className="text-xs text-bolt-elements-icon-error">{restore.error}</span> : null}
          </article>
        ))}
      </div>
    </section>
  );
}

function ConfirmSubmit({
  children,
  message,
  busy,
  disabled,
  block,
}: {
  children: React.ReactNode;
  message: string;
  busy: boolean;
  disabled?: boolean;
  block?: boolean;
}) {
  // G5: token-styled confirmation dialog instead of window.confirm.
  const [pendingForm, setPendingForm] = useState<HTMLFormElement | null>(null);

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={busy || disabled}
        className={classNames('gap-2', block ? 'w-full justify-center' : '')}
        onClick={(event) => setPendingForm(event.currentTarget.form)}
      >
        {children}
      </Button>
      <ConfirmationDialog
        isOpen={pendingForm !== null}
        onClose={() => setPendingForm(null)}
        onConfirm={() => {
          const form = pendingForm;
          setPendingForm(null);
          form?.requestSubmit();
        }}
        title="Restore database?"
        description={message}
        confirmLabel="Restore"
        variant="destructive"
      />
    </>
  );
}

function KindBadge({ kind }: { kind: string }) {
  const manual = kind === 'manual';

  return (
    <span
      className={classNames(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium',
        'border-bolt-elements-borderColor text-bolt-elements-textSecondary',
      )}
    >
      {manual ? 'Manual' : 'Automatic'}
    </span>
  );
}

function RestoreStatusBadge({ status }: { status: string }) {
  const done = status === 'COMPLETED';
  const failed = status === 'FAILED';

  return (
    <span
      className={classNames(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium',
        done
          ? 'border-bolt-elements-borderColor text-bolt-elements-textPrimary'
          : failed
            ? 'border-bolt-elements-borderColor text-bolt-elements-icon-error'
            : 'border-bolt-elements-borderColor text-bolt-elements-textSecondary',
      )}
    >
      {statusDisplayLabel(status)}
    </span>
  );
}

function formatBytes(bytes: number): string {
  if (!bytes) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);

  return `${(bytes / 1024 ** exponent).toFixed(exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}
