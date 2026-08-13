import { Check, Copy, Globe, QrCode } from 'lucide-react';
import { useState } from 'react';
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
  if (!deployment) {
    return (
      <div className="rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-4 py-10 text-center">
        <Globe className="mx-auto h-7 w-7 text-bolt-elements-textTertiary" aria-hidden />
        <p className="mt-3 text-sm font-medium text-bolt-elements-textPrimary">Not published yet</p>
        <p className="mt-1 text-xs text-bolt-elements-textSecondary">
          Publish below to get a live URL, status and logs.
        </p>
      </div>
    );
  }

  const ready = deployment.status === 'READY';
  const type = getDeploymentType(deploymentTypeId);

  const resourceDetail =
    deploymentTypeId === 'static' ? 'Static hosting · served on the E-Code CDN edge' : type?.bestFor;

  return (
    <dl className="grid gap-px overflow-hidden rounded-md border border-bolt-elements-borderColor bg-bolt-elements-borderColor">
      <Row label="Status">
        <span className="inline-flex items-center gap-2">
          <span className={classNames('h-2 w-2 rounded-full', ready ? 'bg-green-500' : 'bg-yellow-500')} aria-hidden />
          <span className="font-medium text-bolt-elements-textPrimary">{deployment.status}</span>
          {deployment.finishedAt ? (
            <span className="text-bolt-elements-textTertiary">· {deployment.finishedAt}</span>
          ) : null}
        </span>
      </Row>
      <Row label="Visibility">
        <span className="inline-flex items-center gap-1.5">
          <Globe className="h-3.5 w-3.5 text-bolt-elements-textTertiary" aria-hidden />
          Public
        </span>
      </Row>
      <Row label="Domain">
        <div className="flex flex-col gap-2">
          {deployment.url ? (
            <DomainValue url={deployment.url} />
          ) : (
            <span className="text-bolt-elements-textTertiary">Pending</span>
          )}
          {deployment.customDomain ? <DomainValue url={`https://${deployment.customDomain}`} /> : null}
          <button type="button" onClick={onBuyDomain} className="inline-flex w-fit items-center gap-1.5 text-[13px]">
            <span className="text-[var(--vc-ide-accent-action)] hover:underline">Buy a new domain</span>
            <span className="rounded bg-bolt-elements-background-depth-3 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-bolt-elements-textTertiary">
              Beta
            </span>
          </button>
        </div>
      </Row>
      <Row label="Type">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>
            <span className="font-medium text-bolt-elements-textPrimary">{type?.name ?? 'Static'}</span>
            {resourceDetail ? <span className="text-bolt-elements-textTertiary"> · {resourceDetail}</span> : null}
          </span>
          <button
            type="button"
            onClick={onManage}
            className="text-[13px] text-[var(--vc-ide-accent-action)] hover:underline"
          >
            Manage
          </button>
          <a
            href={usageHref}
            className="text-[13px] text-bolt-elements-textTertiary hover:text-bolt-elements-textPrimary hover:underline"
          >
            See all usage
          </a>
        </div>
      </Row>
      <Row label="Database">
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
              {databaseConnected ? 'Production database connected' : 'No production database'}
            </span>
            <button
              type="button"
              onClick={onManageDatabase}
              className="text-[13px] text-[var(--vc-ide-accent-action)] hover:underline"
            >
              Manage
            </button>
          </span>
          <span className="text-[12px] text-bolt-elements-textTertiary">
            {databaseConnected
              ? 'Your production database is ready — your app can save and manage live user data securely.'
              : 'Attach a managed Postgres database to give your deployment persistent storage.'}
          </span>
        </div>
      </Row>
      <Row label="Environment">
        <span className="capitalize">{deployment.environment ?? 'preview'}</span>
      </Row>
    </dl>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-3 bg-bolt-elements-background-depth-2 px-4 py-2.5 text-[14px]">
      <dt className="text-bolt-elements-textSecondary">{label}</dt>
      <dd className="min-w-0 text-bolt-elements-textPrimary">{children}</dd>
    </div>
  );
}

function DomainValue({ url }: { url: string }) {
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
          title="Copy URL"
          aria-label="Copy URL"
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-bolt-elements-textTertiary hover:bg-bolt-elements-background-depth-3 hover:text-bolt-elements-textPrimary"
        >
          {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
        </button>
        <button
          type="button"
          onClick={() => setShowQr((value) => !value)}
          aria-pressed={showQr}
          title="Show QR code"
          aria-label="Show QR code"
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
