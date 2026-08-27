import { CheckCircle2, CircleAlert, Loader2, ShieldCheck, Wrench } from 'lucide-react';
import { AsyncPanelError, AsyncPanelSkeleton } from '~/components/dashboard/AsyncPanelState';
import { auditActionLabel, auditResourceLabel, type AuditLogsLanguage } from '~/lib/i18n/catalogs/audit-logs';
import {
  formatOrganizationSecurityCopy,
  type OrganizationSecurityCopy,
} from '~/lib/i18n/catalogs/organization-security';
import { formatUserAreaDateTime } from '~/lib/i18n/user-area-locale';
import { classNames } from '~/utils/classNames';

export type EnterpriseCapabilityKey =
  | 'single-tenant'
  | 'static-outbound-ip'
  | 'vpc-peering'
  | 'data-warehouse'
  | 'security-center';

export type EnterpriseCapabilityState = 'not-entitled' | 'ready' | 'operator-required';

export type EnterpriseCapability = {
  key: EnterpriseCapabilityKey;
  entitled: boolean;
  provisioned: boolean;
  state: EnterpriseCapabilityState;
  surface: 'security-center-events' | 'cloud-tenant-factory' | null;
};

export type EnterpriseCapabilities = {
  version: string;
  plan: 'starter' | 'core' | 'pro' | 'enterprise';
  capabilities: EnterpriseCapability[];
};

export type SecurityCenterEvent = {
  id: string;
  organizationId?: string;
  actorUserId?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  createdAt: string;
  resolved: boolean;
  note?: string;
  resolvedAt?: string;
};

export type OrganizationCapabilitiesErrorKind = 'permission' | 'temporary';
export type SecurityCenterErrorKind = 'permission' | 'operator-required' | 'temporary';

export function mergeSecurityCenterEvents(
  current: readonly SecurityCenterEvent[],
  incoming: readonly SecurityCenterEvent[],
): SecurityCenterEvent[] {
  const seen = new Set(current.map((event) => event.id));
  const merged = [...current];

  for (const event of incoming) {
    if (!seen.has(event.id)) {
      seen.add(event.id);
      merged.push(event);
    }
  }

  return merged;
}

function capabilityCopy(
  copy: OrganizationSecurityCopy,
  capability: EnterpriseCapabilityKey,
): { title: string; description: string } {
  if (capability === 'single-tenant') {
    return {
      title: copy['organizationSecurity.capabilities.singleTenant.title'],
      description: copy['organizationSecurity.capabilities.singleTenant.description'],
    };
  }

  if (capability === 'static-outbound-ip') {
    return {
      title: copy['organizationSecurity.capabilities.staticOutboundIp.title'],
      description: copy['organizationSecurity.capabilities.staticOutboundIp.description'],
    };
  }

  if (capability === 'vpc-peering') {
    return {
      title: copy['organizationSecurity.capabilities.vpcPeering.title'],
      description: copy['organizationSecurity.capabilities.vpcPeering.description'],
    };
  }

  if (capability === 'data-warehouse') {
    return {
      title: copy['organizationSecurity.capabilities.dataWarehouse.title'],
      description: copy['organizationSecurity.capabilities.dataWarehouse.description'],
    };
  }

  return {
    title: copy['organizationSecurity.capabilities.securityCenter.title'],
    description: copy['organizationSecurity.capabilities.securityCenter.description'],
  };
}

function capabilityStateCopy(copy: OrganizationSecurityCopy, state: EnterpriseCapabilityState): string {
  if (state === 'ready') {
    return copy['organizationSecurity.capabilities.state.ready'];
  }

  if (state === 'operator-required') {
    return copy['organizationSecurity.capabilities.state.operatorRequired'];
  }

  return copy['organizationSecurity.capabilities.state.notEntitled'];
}

function planCopy(copy: OrganizationSecurityCopy, plan: EnterpriseCapabilities['plan']): string {
  return copy[`organizationSecurity.capabilities.plan.${plan}` as keyof OrganizationSecurityCopy];
}

function capabilityStateStyle(state: EnterpriseCapabilityState): string {
  if (state === 'ready') {
    return 'border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-[var(--status-success-text)]';
  }

  if (state === 'operator-required') {
    return 'border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] text-[var(--status-warning-text)]';
  }

  return 'border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 text-bolt-elements-textSecondary';
}

function CapabilityIcon({ state }: { state: EnterpriseCapabilityState }) {
  if (state === 'ready') {
    return <CheckCircle2 className="h-4 w-4" aria-hidden />;
  }

  if (state === 'operator-required') {
    return <Wrench className="h-4 w-4" aria-hidden />;
  }

  return <CircleAlert className="h-4 w-4" aria-hidden />;
}

function CapabilityGrid({
  copy,
  capabilities,
}: {
  copy: OrganizationSecurityCopy;
  capabilities: EnterpriseCapabilities;
}) {
  return (
    <section aria-labelledby="enterprise-capabilities-title" data-testid="enterprise-capabilities-panel">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2
            id="enterprise-capabilities-title"
            className="break-words text-base font-semibold text-bolt-elements-textPrimary"
          >
            {copy['organizationSecurity.capabilities.title']}
          </h2>
          <p className="mt-1 break-words text-sm leading-6 text-bolt-elements-textSecondary">
            {copy['organizationSecurity.capabilities.description']}
          </p>
        </div>
        <span className="inline-flex min-h-7 shrink-0 items-center self-start rounded-full border border-bolt-elements-borderColor px-2.5 text-[11px] font-medium text-bolt-elements-textSecondary">
          {planCopy(copy, capabilities.plan)} ·{' '}
          {formatOrganizationSecurityCopy(copy['organizationSecurity.capabilities.version'], {
            version: capabilities.version,
          })}
        </span>
      </div>

      <ul className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2">
        {capabilities.capabilities.map((capability) => {
          const labels = capabilityCopy(copy, capability.key);

          return (
            <li
              key={capability.key}
              className="min-w-0 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-4"
            >
              <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <h3 className="break-words text-sm font-semibold text-bolt-elements-textPrimary">{labels.title}</h3>
                  <p className="mt-1 break-words text-xs leading-5 text-bolt-elements-textSecondary">
                    {labels.description}
                  </p>
                </div>
                <span
                  className={classNames(
                    'inline-flex min-h-7 shrink-0 items-center self-start rounded-full border px-2.5 text-[11px] font-medium',
                    capabilityStateStyle(capability.state),
                  )}
                >
                  <CapabilityIcon state={capability.state} />
                  <span className="ml-1.5">{capabilityStateCopy(copy, capability.state)}</span>
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function SecurityEventCard({
  event,
  copy,
  language,
}: {
  event: SecurityCenterEvent;
  copy: OrganizationSecurityCopy;
  language: AuditLogsLanguage;
}) {
  const timestamp =
    formatUserAreaDateTime(event.createdAt, undefined, language) ??
    copy['organizationSecurity.securityCenter.dateUnavailable'];

  return (
    <li className="min-w-0 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-4">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="break-words text-sm font-semibold text-bolt-elements-textPrimary">
            {auditActionLabel(event.action, language)}
          </p>
          <p className="mt-1 break-words text-xs text-bolt-elements-textSecondary">{timestamp}</p>
        </div>
        <span
          className={classNames(
            'inline-flex min-h-7 shrink-0 items-center self-start rounded-full border px-2.5 text-[11px] font-medium',
            event.resolved
              ? 'border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-[var(--status-success-text)]'
              : 'border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] text-[var(--status-warning-text)]',
          )}
        >
          {event.resolved
            ? copy['organizationSecurity.securityCenter.resolved']
            : copy['organizationSecurity.securityCenter.open']}
        </span>
      </div>

      <dl className="mt-3 grid min-w-0 gap-3 text-xs sm:grid-cols-2">
        <div className="min-w-0">
          <dt className="font-medium text-bolt-elements-textTertiary">
            {copy['organizationSecurity.securityCenter.resource']}
          </dt>
          <dd className="mt-1 break-words text-bolt-elements-textPrimary">
            {auditResourceLabel(event.resourceType, language)}
            {event.resourceId ? (
              <code className="ml-1 break-all font-mono text-[0.7rem]">{event.resourceId}</code>
            ) : null}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="font-medium text-bolt-elements-textTertiary">
            {copy['organizationSecurity.securityCenter.actor']}
          </dt>
          <dd className="mt-1 break-all font-mono text-[0.7rem] text-bolt-elements-textPrimary">
            {event.actorUserId ?? copy['organizationSecurity.securityCenter.actorUnknown']}
          </dd>
        </div>
      </dl>

      {event.note ? (
        <p className="mt-3 break-words rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-2 text-xs leading-5 text-bolt-elements-textSecondary">
          <span className="font-medium text-bolt-elements-textPrimary">
            {copy['organizationSecurity.securityCenter.note']}:{' '}
          </span>
          {event.note}
        </p>
      ) : null}
    </li>
  );
}

function SecurityCenter({
  copy,
  language,
  capability,
  events,
  openCount,
  errorKind,
  nextCursor,
  loadingMore,
  loadMoreErrorKind,
  retrying,
  onRetry,
  onLoadMore,
  onRetryLoadMore,
}: {
  copy: OrganizationSecurityCopy;
  language: AuditLogsLanguage;
  capability: EnterpriseCapability | null;
  events: SecurityCenterEvent[];
  openCount: number;
  errorKind: SecurityCenterErrorKind | null;
  nextCursor: string | null;
  loadingMore: boolean;
  loadMoreErrorKind: SecurityCenterErrorKind | null;
  retrying: boolean;
  onRetry: () => void;
  onLoadMore: () => void;
  onRetryLoadMore: () => void;
}) {
  if (errorKind) {
    const operatorRequired = errorKind === 'operator-required';
    return (
      <AsyncPanelError
        compact
        tone={operatorRequired || errorKind === 'permission' ? 'warning' : 'error'}
        title={
          operatorRequired
            ? copy['organizationSecurity.securityCenter.operatorTitle']
            : errorKind === 'permission'
              ? copy['organizationSecurity.securityCenter.permissionTitle']
              : copy['organizationSecurity.securityCenter.errorTitle']
        }
        description={
          operatorRequired
            ? copy['organizationSecurity.securityCenter.operatorDescription']
            : errorKind === 'permission'
              ? copy['organizationSecurity.securityCenter.permissionDescription']
              : copy['organizationSecurity.securityCenter.errorDescription']
        }
        retryLabel={copy['organizationSecurity.securityCenter.retry']}
        retrying={retrying}
        onRetry={onRetry}
      />
    );
  }

  if (!capability || capability.state !== 'ready' || capability.surface !== 'security-center-events') {
    const operatorRequired = capability?.state === 'operator-required';
    return (
      <section
        aria-labelledby="security-center-title"
        className={classNames(
          'rounded-lg border p-4',
          operatorRequired
            ? 'border-[var(--status-warning-border)] bg-[var(--status-warning-bg)]'
            : 'border-bolt-elements-borderColor bg-bolt-elements-background-depth-1',
        )}
      >
        <div className="flex min-w-0 items-start gap-3">
          <ShieldCheck
            className={classNames(
              'mt-0.5 h-5 w-5 shrink-0',
              operatorRequired ? 'text-[var(--status-warning-text)]' : 'text-bolt-elements-textTertiary',
            )}
            aria-hidden
          />
          <div className="min-w-0">
            <h2
              id="security-center-title"
              className="break-words text-base font-semibold text-bolt-elements-textPrimary"
            >
              {copy['organizationSecurity.securityCenter.title']}
            </h2>
            <p className="mt-1 break-words text-sm leading-6 text-bolt-elements-textSecondary">
              {operatorRequired
                ? copy['organizationSecurity.securityCenter.operatorDescription']
                : copy['organizationSecurity.securityCenter.notEntitledDescription']}
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby="security-center-title" data-testid="security-center-panel">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 id="security-center-title" className="break-words text-base font-semibold text-bolt-elements-textPrimary">
            {copy['organizationSecurity.securityCenter.title']}
          </h2>
          <p className="mt-1 break-words text-sm leading-6 text-bolt-elements-textSecondary">
            {copy['organizationSecurity.securityCenter.description']}
          </p>
        </div>
        <span className="inline-flex min-h-7 shrink-0 items-center self-start rounded-full border border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] px-2.5 text-[11px] font-medium text-[var(--status-warning-text)]">
          {formatOrganizationSecurityCopy(copy['organizationSecurity.securityCenter.openCount'], { count: openCount })}
        </span>
      </div>

      {events.length === 0 ? (
        <div className="mt-4 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-4 py-8 text-center">
          <CheckCircle2 className="mx-auto h-6 w-6 text-[var(--status-success-text)]" aria-hidden />
          <h3 className="mt-3 text-sm font-semibold text-bolt-elements-textPrimary">
            {copy['organizationSecurity.securityCenter.emptyTitle']}
          </h3>
          <p className="mt-1 text-xs leading-5 text-bolt-elements-textSecondary">
            {copy['organizationSecurity.securityCenter.emptyDescription']}
          </p>
        </div>
      ) : (
        <>
          <ul className="mt-4 grid min-w-0 gap-3">
            {events.map((event) => (
              <SecurityEventCard key={event.id} event={event} copy={copy} language={language} />
            ))}
          </ul>
          {loadMoreErrorKind ? (
            <AsyncPanelError
              compact
              className="mt-4"
              tone={loadMoreErrorKind === 'temporary' ? 'error' : 'warning'}
              title={copy['organizationSecurity.securityCenter.loadMoreErrorTitle']}
              description={
                loadMoreErrorKind === 'operator-required'
                  ? copy['organizationSecurity.securityCenter.operatorDescription']
                  : loadMoreErrorKind === 'permission'
                    ? copy['organizationSecurity.securityCenter.permissionDescription']
                    : copy['organizationSecurity.securityCenter.loadMoreErrorDescription']
              }
              retryLabel={copy['organizationSecurity.securityCenter.loadMoreRetry']}
              retrying={loadingMore}
              onRetry={onRetryLoadMore}
            />
          ) : nextCursor ? (
            <div className="mt-4 flex min-w-0 border-t border-bolt-elements-borderColor pt-4">
              <button
                type="button"
                onClick={onLoadMore}
                disabled={loadingMore}
                aria-busy={loadingMore}
                className="inline-flex min-h-[44px] w-full min-w-0 items-center justify-center gap-2 rounded-md border border-bolt-elements-borderColor px-4 text-sm font-medium text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-bolt-elements-focus disabled:cursor-wait disabled:opacity-60 sm:w-auto"
              >
                {loadingMore ? (
                  <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
                ) : null}
                {loadingMore
                  ? copy['organizationSecurity.securityCenter.loadingMore']
                  : copy['organizationSecurity.securityCenter.loadMore']}
              </button>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

export function OrganizationCapabilitiesPanel({
  copy,
  language,
  capabilities,
  capabilitiesErrorKind,
  securityEvents,
  securityOpenCount,
  securityErrorKind,
  securityNextCursor,
  securityLoadingMore,
  securityLoadMoreErrorKind,
  loading,
  retrying,
  onRetry,
  onLoadMore,
  onRetryLoadMore,
}: {
  copy: OrganizationSecurityCopy;
  language: AuditLogsLanguage;
  capabilities: EnterpriseCapabilities | null;
  capabilitiesErrorKind: OrganizationCapabilitiesErrorKind | null;
  securityEvents: SecurityCenterEvent[];
  securityOpenCount: number;
  securityErrorKind: SecurityCenterErrorKind | null;
  securityNextCursor: string | null;
  securityLoadingMore: boolean;
  securityLoadMoreErrorKind: SecurityCenterErrorKind | null;
  loading: boolean;
  retrying: boolean;
  onRetry: () => void;
  onLoadMore: () => void;
  onRetryLoadMore: () => void;
}) {
  if (loading) {
    return (
      <div className="grid gap-6" aria-busy="true">
        <AsyncPanelSkeleton label={copy['organizationSecurity.capabilities.loading']} rows={4} />
        <AsyncPanelSkeleton label={copy['organizationSecurity.securityCenter.loading']} rows={3} />
      </div>
    );
  }

  if (capabilitiesErrorKind || !capabilities) {
    const permission = capabilitiesErrorKind === 'permission';
    return (
      <AsyncPanelError
        title={
          permission
            ? copy['organizationSecurity.capabilities.permissionTitle']
            : copy['organizationSecurity.capabilities.errorTitle']
        }
        description={
          permission
            ? copy['organizationSecurity.capabilities.permissionDescription']
            : copy['organizationSecurity.capabilities.errorDescription']
        }
        tone={permission ? 'warning' : 'error'}
        retryLabel={copy['organizationSecurity.capabilities.retry']}
        retrying={retrying}
        onRetry={onRetry}
      />
    );
  }

  const securityCapability =
    capabilities.capabilities.find((capability) => capability.key === 'security-center') ?? null;

  return (
    <div className="grid min-w-0 gap-8">
      <CapabilityGrid copy={copy} capabilities={capabilities} />
      <SecurityCenter
        copy={copy}
        language={language}
        capability={securityCapability}
        events={securityEvents}
        openCount={securityOpenCount}
        errorKind={securityErrorKind}
        nextCursor={securityNextCursor}
        loadingMore={securityLoadingMore}
        loadMoreErrorKind={securityLoadMoreErrorKind}
        retrying={retrying}
        onRetry={onRetry}
        onLoadMore={onLoadMore}
        onRetryLoadMore={onRetryLoadMore}
      />
    </div>
  );
}
