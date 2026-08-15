import { AlertTriangle, Camera, Clock, Database, History, RotateCcw, ShieldCheck } from 'lucide-react';
import { useMemo, useState } from 'react';
import type React from 'react';
import { useTranslation } from 'react-i18next';
import type { MetaFunction } from 'react-router';
import { Form, useActionData, useLoaderData, useNavigation } from 'react-router';
import { ProjectShell } from '~/components/dashboard/SaaSLayout';
import { Button } from '~/components/ui/Button';
import { ConfirmationDialog } from '~/components/ui/Dialog';
import { useBillingEnabled } from '~/lib/billing/use-billing-enabled';
import {
  apiRequest,
  isApiResponse,
  json,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';
import {
  databaseRestoreStatusLabel,
  formatDatabaseRestoreBytes,
  formatDatabaseRestoreCopy,
  formatDatabaseRestoreDate,
  getDatabaseRestoreCopy,
  resolveDatabaseRestoreLanguage,
  selectDatabaseRestorePlural,
} from '~/lib/i18n/catalogs/database-restore';
import { resolveRequestLocale } from '~/lib/i18n/request-locale';
import type { ProjectRecord } from '~/lib/project-route.server';
import { isReauthRedirect } from '~/lib/route-reauth';
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

export const meta: MetaFunction = ({ matches }) => {
  const rootData = matches.find((match) => match.id === 'root')?.data as { language?: string } | undefined;

  return [{ title: getDatabaseRestoreCopy(rootData?.language)['databaseRestore.metaTitle'] }];
};
export { UserAreaRouteErrorBoundary as ErrorBoundary } from '~/components/dashboard/UserAreaRouteError';

export async function loader(args: EnterpriseLoaderArgs) {
  const { request, params } = args;
  const projectId = params.projectId;
  const copy = getDatabaseRestoreCopy(resolveRequestLocale(request).language);

  if (!projectId) {
    throw json({ error: copy['databaseRestore.errors.projectNotFound'] }, { status: 404 });
  }

  let projectResult: { project: ProjectRecord };

  try {
    projectResult = await apiRequest<{ project: ProjectRecord }>(request, `/projects/${projectId}`);
  } catch (error) {
    if (isReauthRedirect(error)) {
      throw error;
    }

    const status = isApiResponse(error) && error.status !== 500 ? error.status : 502;
    throw json({ error: copy['databaseRestore.errors.projectUnavailable'] }, { status });
  }

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

    const status = isApiResponse(error) && error.status !== 500 ? error.status : 502;
    throw json({ error: copy['databaseRestore.errors.panelUnavailable'] }, { status });
  }
}

export async function action({ request, params }: EnterpriseActionArgs) {
  const projectId = params.projectId;
  const copy = getDatabaseRestoreCopy(resolveRequestLocale(request).language);

  if (!projectId) {
    throw json({ error: copy['databaseRestore.errors.projectNotFound'] }, { status: 404 });
  }

  const form = await request.formData();
  const intent = String(form.get('intent') ?? 'restore');

  if (intent !== 'provision' && intent !== 'snapshot' && intent !== 'restore') {
    return json({ ok: false, error: copy['databaseRestore.errors.invalidAction'] }, { status: 400 });
  }

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
      const target = new Date(targetTimestamp);

      if (Number.isNaN(target.getTime())) {
        return json({ ok: false, error: copy['databaseRestore.errors.invalidTarget'] }, { status: 400 });
      }

      payload.targetTimestamp = target.toISOString();
    } else {
      return json({ ok: false, error: copy['databaseRestore.errors.targetRequired'] }, { status: 400 });
    }
  } else if (intent === 'snapshot') {
    const label = String(form.get('label') ?? '').trim();

    if (label) {
      payload.label = label;
    }
  }

  try {
    const result = await apiRequest(request, path, { method: 'POST', body: JSON.stringify(payload) });

    return json({ ...(result as Record<string, unknown>), ok: true, intent });
  } catch (error) {
    if (isReauthRedirect(error)) {
      throw error;
    }

    return json(
      { ok: false, error: copy['databaseRestore.errors.requestFailed'] },
      { status: isApiResponse(error) ? error.status : 502 },
    );
  }
}

function toLocalInputValue(iso: string): string {
  // Convert an ISO instant to a `datetime-local`-compatible value in local time.
  const date = new Date(iso);
  const offsetMs = date.getTimezoneOffset() * 60_000;

  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

export default function ProjectDatabaseRestorePage() {
  const billingOn = useBillingEnabled();
  const { i18n } = useTranslation();
  const language = resolveDatabaseRestoreLanguage(i18n.resolvedLanguage ?? i18n.language);
  const copy = getDatabaseRestoreCopy(language);

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

  const successCopy =
    actionData?.intent === 'restore'
      ? copy['databaseRestore.success.restore']
      : actionData?.intent === 'snapshot'
        ? copy['databaseRestore.success.snapshot']
        : actionData?.intent === 'provision'
          ? copy['databaseRestore.success.provision']
          : undefined;

  return (
    <ProjectShell
      projectId={project.id}
      title={copy['databaseRestore.title']}
      description={copy['databaseRestore.description']}
    >
      {actionData?.error ? (
        <div
          role="alert"
          className="mb-6 break-words rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-4 py-3 text-sm text-bolt-elements-textPrimary"
        >
          <span className="inline-flex items-center gap-2 text-bolt-elements-icon-error">
            <AlertTriangle className="h-4 w-4" aria-hidden />
          </span>{' '}
          {actionData.error}
        </div>
      ) : null}
      {actionData?.ok && successCopy ? (
        <div
          role="status"
          className="mb-6 break-words rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-4 py-3 text-sm text-bolt-elements-textPrimary"
        >
          {successCopy}
        </div>
      ) : null}

      {notAvailable ? (
        <NotAvailablePanel enabled={enabled} retentionDays={entitlement.retentionDays} billingOn={billingOn} />
      ) : (
        <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
          <div className="grid min-w-0 gap-6">
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

function NotAvailablePanel({
  enabled,
  retentionDays,
  billingOn = false,
}: {
  enabled: boolean;
  retentionDays: number;
  billingOn?: boolean;
}) {
  const { i18n } = useTranslation();
  const language = resolveDatabaseRestoreLanguage(i18n.resolvedLanguage ?? i18n.language);
  const copy = getDatabaseRestoreCopy(language);

  return (
    <div className="grid gap-4 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-6 shadow-md">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1">
          <ShieldCheck className="h-4 w-4 text-bolt-elements-textTertiary" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="break-words text-sm font-semibold text-bolt-elements-textPrimary">
            {copy['databaseRestore.notAvailable.title']}
          </h2>
          <p className="mt-1 break-words text-sm text-bolt-elements-textSecondary">
            {!enabled
              ? copy['databaseRestore.notAvailable.disabled']
              : retentionDays > 0
                ? formatDatabaseRestoreCopy(
                    selectDatabaseRestorePlural(
                      copy,
                      'databaseRestore.notAvailable.noInstance',
                      retentionDays,
                      language,
                    ),
                    { count: new Intl.NumberFormat(language === 'fr' ? 'fr-FR' : 'en-US').format(retentionDays) },
                  )
                : copy['databaseRestore.notAvailable.plan']}
          </p>
          {/* KILL-SWITCH FACTURATION : « voir les plans » mène à /usage. */}
          {enabled && retentionDays === 0 && billingOn ? (
            <a
              href="/usage"
              className="mt-3 inline-flex text-xs font-medium text-[var(--vc-ide-accent-action)] hover:underline"
            >
              {copy['databaseRestore.notAvailable.viewPlans']}
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function InstanceCard({ instance, retentionDays }: { instance: Instance; retentionDays: number }) {
  const { i18n } = useTranslation();
  const language = resolveDatabaseRestoreLanguage(i18n.resolvedLanguage ?? i18n.language);
  const copy = getDatabaseRestoreCopy(language);

  const formattedDays = formatDatabaseRestoreCopy(
    selectDatabaseRestorePlural(copy, 'databaseRestore.instance.days', retentionDays, language),
    { count: new Intl.NumberFormat(language === 'fr' ? 'fr-FR' : 'en-US').format(retentionDays) },
  );

  return (
    <section className="grid gap-4 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-5 shadow-md">
      <div className="flex items-center gap-2">
        <Database className="h-4 w-4 text-bolt-elements-item-contentAccent" aria-hidden />
        <h2 className="break-words text-[14px] font-medium text-bolt-elements-textPrimary">
          {copy['databaseRestore.instance.title']}
        </h2>
      </div>
      {instance ? (
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <Stat
            label={copy['databaseRestore.instance.status']}
            value={databaseRestoreStatusLabel(instance.status, copy)}
          />
          <Stat
            label={copy['databaseRestore.instance.engine']}
            value={instance.engine || copy['databaseRestore.instance.title']}
          />
          <Stat label={copy['databaseRestore.instance.retention']} value={formattedDays} />
          <Stat
            label={copy['databaseRestore.instance.size']}
            value={formatDatabaseRestoreBytes(instance.sizeBytes, language)}
          />
        </dl>
      ) : (
        <div className="grid gap-3">
          <p className="break-words text-sm text-bolt-elements-textSecondary">
            {copy['databaseRestore.instance.empty']}
          </p>
          <Form method="post">
            <input type="hidden" name="intent" value="provision" />
            <Button type="submit" variant="outline" size="sm" className="gap-2">
              <Database className="h-3.5 w-3.5" aria-hidden />
              <span className="min-w-0 whitespace-normal text-left">{copy['databaseRestore.instance.provision']}</span>
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
  const { i18n } = useTranslation();
  const language = resolveDatabaseRestoreLanguage(i18n.resolvedLanguage ?? i18n.language);
  const copy = getDatabaseRestoreCopy(language);

  return (
    <section className="rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 shadow-md">
      <div className="flex items-center justify-between gap-2 border-b border-bolt-elements-borderColor px-5 py-4">
        <div className="flex items-center gap-2">
          <Camera className="h-4 w-4 text-bolt-elements-textTertiary" aria-hidden />
          <h2 className="break-words text-[14px] font-medium text-bolt-elements-textPrimary">
            {copy['databaseRestore.recovery.title']}
          </h2>
        </div>
        <Form method="post">
          <input type="hidden" name="intent" value="snapshot" />
          <Button
            type="submit"
            variant="outline"
            size="sm"
            className="h-auto min-h-8 gap-2 whitespace-normal text-left"
            disabled={busy || disabled}
          >
            <Camera className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {copy['databaseRestore.recovery.takeSnapshot']}
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
                    {formatDatabaseRestoreDate(point.timestamp, language) ??
                      copy['databaseRestore.recovery.dateUnavailable']}
                  </span>
                </div>
                <p className="mt-1 truncate text-xs text-bolt-elements-textSecondary">
                  {point.label ? `${point.label} — ` : ''}
                  {point.lsn ? `WAL LSN ${point.lsn}` : copy['databaseRestore.recovery.continuousArchive']}
                </p>
              </div>
              <Form method="post" className="sm:justify-self-end">
                <input type="hidden" name="intent" value="restore" />
                <input type="hidden" name="snapshotId" value={point.id} />
                <ConfirmSubmit busy={busy} disabled={disabled} message={copy['databaseRestore.recovery.confirm']}>
                  <RotateCcw className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span className="min-w-0 whitespace-normal text-left">
                    {copy['databaseRestore.recovery.restore']}
                  </span>
                </ConfirmSubmit>
              </Form>
            </article>
          ))
        ) : (
          <div className="grid place-items-center gap-2 px-5 py-12 text-center">
            <Camera className="h-7 w-7 text-bolt-elements-textTertiary" aria-hidden />
            <p className="text-sm font-medium text-bolt-elements-textPrimary">
              {copy['databaseRestore.recovery.emptyTitle']}
            </p>
            <p className="max-w-prose text-xs text-bolt-elements-textSecondary">
              {copy['databaseRestore.recovery.emptyDescription']}
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
  const { i18n } = useTranslation();
  const language = resolveDatabaseRestoreLanguage(i18n.resolvedLanguage ?? i18n.language);
  const copy = getDatabaseRestoreCopy(language);

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
        <h2 className="break-words text-[14px] font-medium text-bolt-elements-textPrimary">
          {copy['databaseRestore.panel.title']}
        </h2>
      </div>
      {restoreWindow ? (
        <p className="break-words text-xs text-bolt-elements-textSecondary">
          {formatDatabaseRestoreCopy(
            selectDatabaseRestorePlural(copy, 'databaseRestore.panel.window', restoreWindow.retentionDays, language),
            {
              count: new Intl.NumberFormat(language === 'fr' ? 'fr-FR' : 'en-US').format(restoreWindow.retentionDays),
              from:
                formatDatabaseRestoreDate(restoreWindow.earliest, language) ??
                copy['databaseRestore.recovery.dateUnavailable'],
              to:
                formatDatabaseRestoreDate(restoreWindow.latest, language) ??
                copy['databaseRestore.recovery.dateUnavailable'],
            },
          )}
        </p>
      ) : (
        <p className="text-xs text-bolt-elements-textSecondary">{copy['databaseRestore.panel.noWindow']}</p>
      )}

      <Form method="post" className="grid gap-3">
        <input type="hidden" name="intent" value="restore" />
        <label className="grid gap-2 text-xs font-medium uppercase tracking-[0.04em] text-bolt-elements-textTertiary">
          {copy['databaseRestore.panel.targetTime']}
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
          <p className="text-xs text-bolt-elements-icon-error">{copy['databaseRestore.panel.outOfRange']}</p>
        ) : null}
        <ConfirmSubmit
          block
          busy={busy}
          disabled={disabled || !bounds || !value || outOfRange}
          message={copy['databaseRestore.panel.confirm']}
        >
          <RotateCcw className="h-4 w-4 shrink-0" aria-hidden />
          <span className="min-w-0 whitespace-normal">
            {busy ? copy['databaseRestore.panel.requesting'] : copy['databaseRestore.panel.restore']}
          </span>
        </ConfirmSubmit>
      </Form>
      <p className="break-words text-[11px] text-bolt-elements-textTertiary">{copy['databaseRestore.panel.warning']}</p>
    </aside>
  );
}

function RestoreHistoryCard({ restores }: { restores: Restore[] }) {
  const { i18n } = useTranslation();
  const language = resolveDatabaseRestoreLanguage(i18n.resolvedLanguage ?? i18n.language);
  const copy = getDatabaseRestoreCopy(language);

  if (!restores.length) {
    return null;
  }

  return (
    <section className="rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 shadow-md">
      <div className="flex items-center gap-2 border-b border-bolt-elements-borderColor px-5 py-4">
        <History className="h-4 w-4 text-bolt-elements-textTertiary" aria-hidden />
        <h2 className="break-words text-[14px] font-medium text-bolt-elements-textPrimary">
          {copy['databaseRestore.history.title']}
        </h2>
      </div>
      <div className="divide-y divide-bolt-elements-borderColor">
        {restores.map((restore) => (
          <article key={restore.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
            <RestoreStatusBadge status={restore.status} />
            <span className="text-bolt-elements-textPrimary">
              {restore.targetTimestamp
                ? (formatDatabaseRestoreDate(restore.targetTimestamp, language) ??
                  copy['databaseRestore.recovery.dateUnavailable'])
                : copy['databaseRestore.history.latest']}
            </span>
            <span className="text-xs text-bolt-elements-textTertiary">
              {formatDatabaseRestoreCopy(copy['databaseRestore.history.requested'], {
                date:
                  formatDatabaseRestoreDate(restore.createdAt, language) ??
                  copy['databaseRestore.recovery.dateUnavailable'],
              })}
            </span>
            {restore.error ? (
              <span className="break-words text-xs text-bolt-elements-icon-error">
                {copy['databaseRestore.history.safeError']}
              </span>
            ) : null}
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
  const { i18n } = useTranslation();
  const copy = getDatabaseRestoreCopy(i18n.resolvedLanguage ?? i18n.language);

  // G5: token-styled confirmation dialog instead of window.confirm.
  const [pendingForm, setPendingForm] = useState<HTMLFormElement | null>(null);

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={busy || disabled}
        className={classNames('h-auto min-h-8 gap-2 whitespace-normal', block ? 'w-full justify-center' : '')}
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
        title={copy['databaseRestore.confirm.title']}
        description={message}
        confirmLabel={copy['databaseRestore.confirm.label']}
        variant="destructive"
      />
    </>
  );
}

function KindBadge({ kind }: { kind: string }) {
  const { i18n } = useTranslation();
  const copy = getDatabaseRestoreCopy(i18n.resolvedLanguage ?? i18n.language);
  const manual = kind === 'manual';

  return (
    <span
      className={classNames(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium',
        'border-bolt-elements-borderColor text-bolt-elements-textSecondary',
      )}
    >
      {manual ? copy['databaseRestore.kind.manual'] : copy['databaseRestore.kind.automatic']}
    </span>
  );
}

function RestoreStatusBadge({ status }: { status: string }) {
  const { i18n } = useTranslation();
  const copy = getDatabaseRestoreCopy(i18n.resolvedLanguage ?? i18n.language);
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
      {databaseRestoreStatusLabel(status, copy)}
    </span>
  );
}
