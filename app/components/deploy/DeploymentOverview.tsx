import { Check, Copy, Globe, LockKeyhole, QrCode, ShieldCheck, Users } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { QRCode } from 'react-qrcode-logo';
import { getDeploymentType } from './deployment-types';
import { classNames } from '~/utils/classNames';

export interface OverviewDeployment {
  status: string;
  environment?: string;
  url?: string;
  customDomain?: string;
  framework?: string;
  createdAt?: string;
  finishedAt?: string;
  accessPolicy?: {
    mode: 'PUBLIC' | 'PASSWORD_PROTECTED' | 'WORKSPACE_ONLY' | 'INVITE_ONLY';
    version: number;
  };
  accessPolicyState?: 'ACTIVE' | 'LOCKED';
}

/**
 * Replit "Production" overview: label→value rows (Status / Visibility / Domain
 * with copy + QR / Type + resources / Database). Measured from Replit — 14px
 * labels+values, blue action accent (`--vc-ide-accent-action`), dark surfaces kept. Read-only; the
 * deploy actions live in the wizard. `deploymentType` is the selected tier so the
 * Type row shows the right resource summary.
 */
export function DeploymentOverview({
  deployment,
  deploymentTypeId = 'static',
  databaseConnected = false,
  usageHref = '/usage',
  onManage,
  onBuyDomain,
  onManageDatabase,
}: {
  deployment?: OverviewDeployment;
  deploymentTypeId?: string;

  /** Whether a production database is attached (drives the Database row state). */
  databaseConnected?: boolean;

  /** Link target for "See all usage". */
  usageHref?: string;

  /** Switch to the Manage view (Type → Manage). */
  onManage?: () => void;

  /** Switch to the Domains view ("Buy a new domain"). */
  onBuyDomain?: () => void;

  /** Open database management. */
  onManageDatabase?: () => void;
}) {
  const { t, i18n } = useTranslation();

  if (!deployment) {
    return (
      <div className="rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-4 py-10 text-center">
        <Globe className="mx-auto h-7 w-7 text-bolt-elements-textTertiary" aria-hidden />
        <p className="mt-3 text-sm font-medium text-bolt-elements-textPrimary">
          {t('idePanels.deployment.emptyTitle')}
        </p>
        <p className="mt-1 text-xs text-bolt-elements-textSecondary">{t('idePanels.deployment.emptyBody')}</p>
      </div>
    );
  }

  const ready = deployment.status === 'READY';
  const type = getDeploymentType(deploymentTypeId);

  const resourceDetail = deploymentTypeResource(deploymentTypeId, t);
  const status = deploymentStatus(deployment.status, t);
  const environment = deploymentEnvironment(deployment.environment, t);
  const finishedAt = formatDeploymentTime(deployment.finishedAt, i18n.resolvedLanguage ?? i18n.language);
  const accessMode = deployment.accessPolicy?.mode ?? 'INVITE_ONLY';

  const accessPresentation =
    deployment.accessPolicyState === 'LOCKED'
      ? { label: t('idePanels.deployment.accessLocked'), icon: ShieldCheck }
      : accessMode === 'PUBLIC'
        ? { label: t('idePanels.deployment.public'), icon: Globe }
        : accessMode === 'PASSWORD_PROTECTED'
          ? { label: t('idePanels.deployment.passwordProtected'), icon: LockKeyhole }
          : accessMode === 'WORKSPACE_ONLY'
            ? { label: t('idePanels.deployment.workspaceOnly'), icon: Users }
            : { label: t('idePanels.deployment.inviteOnly'), icon: ShieldCheck };

  const AccessIcon = accessPresentation.icon;

  return (
    <dl className="grid gap-px overflow-hidden rounded-md border border-bolt-elements-borderColor bg-bolt-elements-borderColor">
      <Row label={t('idePanels.deployment.status')}>
        <span className="inline-flex items-center gap-2">
          <span className={classNames('h-2 w-2 rounded-full', ready ? 'bg-green-500' : 'bg-yellow-500')} aria-hidden />
          <span className="font-medium text-bolt-elements-textPrimary">{status}</span>
          {finishedAt ? <span className="text-bolt-elements-textTertiary">· {finishedAt}</span> : null}
        </span>
      </Row>
      <Row label={t('idePanels.deployment.visibility')}>
        <span className="inline-flex items-center gap-1.5">
          <AccessIcon className="h-3.5 w-3.5 text-bolt-elements-textTertiary" aria-hidden />
          {accessPresentation.label}
          {deployment.accessPolicy?.version ? (
            <span className="text-xs text-bolt-elements-textTertiary">
              {t('idePanels.deployment.accessPolicyVersion', { version: deployment.accessPolicy.version })}
            </span>
          ) : null}
        </span>
      </Row>
      <Row label={t('idePanels.deployment.domain')}>
        <div className="flex flex-col gap-2">
          {deployment.url ? (
            <DomainValue url={deployment.url} />
          ) : (
            <span className="text-bolt-elements-textTertiary">{t('idePanels.deployment.pending')}</span>
          )}
          {deployment.customDomain ? <DomainValue url={`https://${deployment.customDomain}`} /> : null}
          <button type="button" onClick={onBuyDomain} className="inline-flex w-fit items-center gap-1.5 text-[13px]">
            <span className="text-[var(--vc-ide-accent-action)] hover:underline">
              {t('idePanels.deployment.buyDomain')}
            </span>
            <span className="rounded bg-bolt-elements-background-depth-3 px-1.5 py-0.5 text-[11px] uppercase tracking-wide text-bolt-elements-textTertiary">
              {t('idePanels.deployment.beta')}
            </span>
          </button>
        </div>
      </Row>
      <Row label={t('idePanels.deployment.type')}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>
            <span className="font-medium text-bolt-elements-textPrimary">
              {deploymentTypeName(type?.id ?? deploymentTypeId, t)}
            </span>
            {resourceDetail ? <span className="text-bolt-elements-textTertiary"> · {resourceDetail}</span> : null}
          </span>
          <button
            type="button"
            onClick={onManage}
            className="text-[13px] text-[var(--vc-ide-accent-action)] hover:underline"
          >
            {t('idePanels.deployment.manage')}
          </button>
          <a
            href={usageHref}
            className="text-[13px] text-bolt-elements-textTertiary hover:text-bolt-elements-textPrimary hover:underline"
          >
            {t('idePanels.deployment.seeUsage')}
          </a>
        </div>
      </Row>
      <Row label={t('idePanels.deployment.database')}>
        <div className="flex flex-col gap-1">
          <span className="inline-flex items-center gap-2">
            <span
              className={classNames(
                'h-2 w-2 rounded-full',
                databaseConnected ? 'bg-green-500' : 'bg-bolt-elements-textTertiary',
              )}
              aria-hidden
            />
            <span className="text-bolt-elements-textPrimary">
              {databaseConnected
                ? t('idePanels.deployment.databaseConnected')
                : t('idePanels.deployment.databaseDisconnected')}
            </span>
            <button
              type="button"
              onClick={onManageDatabase}
              className="text-[13px] text-[var(--vc-ide-accent-action)] hover:underline"
            >
              {t('idePanels.deployment.manage')}
            </button>
          </span>
          <span className="text-[12px] text-bolt-elements-textTertiary">
            {databaseConnected
              ? t('idePanels.deployment.databaseConnectedBody')
              : t('idePanels.deployment.databaseDisconnectedBody')}
          </span>
        </div>
      </Row>
      <Row label={t('idePanels.deployment.environment')}>
        <span className="capitalize">{environment}</span>
      </Row>
    </dl>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-1 bg-bolt-elements-background-depth-2 px-4 py-2.5 text-[14px] sm:grid-cols-[120px_minmax(0,1fr)] sm:gap-3">
      <dt className="text-bolt-elements-textSecondary">{label}</dt>
      <dd className="min-w-0 text-bolt-elements-textPrimary">{children}</dd>
    </div>
  );
}

function DomainValue({ url }: { url: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);

  const copy = () => {
    void navigator.clipboard
      ?.writeText(url)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {
        // Clipboard can reject (permissions / insecure context) — don't crash the panel.
      });
  };

  return (
    <div className="flex flex-col gap-1">
      <span className="flex min-w-0 items-center gap-2">
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="truncate text-[var(--vc-ide-accent-action)] hover:underline"
        >
          {url}
        </a>
        <button
          type="button"
          onClick={copy}
          title={copied ? t('idePanels.deployment.urlCopied') : t('idePanels.deployment.copyUrl')}
          aria-label={copied ? t('idePanels.deployment.urlCopied') : t('idePanels.deployment.copyUrl')}
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-bolt-elements-textTertiary hover:bg-bolt-elements-background-depth-3 hover:text-bolt-elements-textPrimary"
        >
          {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
        </button>
        <button
          type="button"
          onClick={() => setShowQr((value) => !value)}
          aria-pressed={showQr}
          title={showQr ? t('idePanels.deployment.hideQr') : t('idePanels.deployment.showQr')}
          aria-label={showQr ? t('idePanels.deployment.hideQr') : t('idePanels.deployment.showQr')}
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-bolt-elements-textTertiary hover:bg-bolt-elements-background-depth-3 hover:text-bolt-elements-textPrimary"
        >
          <QrCode className="h-3.5 w-3.5" aria-hidden />
        </button>
      </span>
      {showQr ? (
        <span className="mt-1 inline-block w-fit rounded border border-bolt-elements-borderColor bg-white p-1">
          <QRCode value={url} size={96} quietZone={4} />
        </span>
      ) : null}
    </div>
  );
}

type Translate = (key: string, options?: Record<string, unknown>) => string;

function deploymentStatus(status: string, t: Translate): string {
  const keyByStatus: Record<string, string> = {
    READY: 'idePanels.deployment.statusReady',
    BUILDING: 'idePanels.deployment.statusBuilding',
    QUEUED: 'idePanels.deployment.statusQueued',
    PENDING: 'idePanels.deployment.statusPending',
    ERROR: 'idePanels.deployment.statusError',
    FAILED: 'idePanels.deployment.statusError',
    CANCELED: 'idePanels.deployment.statusCanceled',
    CANCELLED: 'idePanels.deployment.statusCanceled',
  };

  return t(keyByStatus[status.toUpperCase()] ?? 'idePanels.common.unavailable');
}

function deploymentEnvironment(environment: string | undefined, t: Translate): string {
  const keyByEnvironment: Record<string, string> = {
    preview: 'idePanels.deployment.environmentPreview',
    production: 'idePanels.deployment.environmentProduction',
    development: 'idePanels.deployment.environmentDevelopment',
    staging: 'idePanels.deployment.environmentStaging',
  };

  return t(keyByEnvironment[environment?.toLowerCase() ?? 'preview'] ?? 'idePanels.common.unavailable');
}

function deploymentTypeName(typeId: string, t: Translate): string {
  const keyByType: Record<string, string> = {
    static: 'idePanels.deployment.typeStatic',
    autoscale: 'idePanels.deployment.typeAutoscale',
    'reserved-vm': 'idePanels.deployment.typeReservedVm',
    scheduled: 'idePanels.deployment.typeScheduled',
  };

  return t(keyByType[typeId] ?? 'idePanels.common.unavailable');
}

function deploymentTypeResource(typeId: string, t: Translate): string | undefined {
  const keyByType: Record<string, string> = {
    static: 'idePanels.deployment.staticResources',
    autoscale: 'idePanels.deployment.autoscaleResources',
    'reserved-vm': 'idePanels.deployment.reservedVmResources',
    scheduled: 'idePanels.deployment.scheduledResources',
  };

  const key = keyByType[typeId];

  return key ? t(key) : undefined;
}

function formatDeploymentTime(value: string | undefined, language: string): string | undefined {
  if (!value) {
    return undefined;
  }

  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return undefined;
  }

  return new Intl.DateTimeFormat(language.startsWith('fr') ? 'fr-FR' : 'en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}
