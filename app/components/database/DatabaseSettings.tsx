import { Check, ChevronDown, Copy, Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import { DatabaseRollbackPanel } from './DatabaseRollbackPanel';
import { classNames } from '~/utils/classNames';

/*
 * Database Settings tab — Replit-parity structure (Connection string + Storage +
 * Advanced) in the E-Code orange theme. All values are real and supplied by the
 * parent from the live database API; the secret connection string is masked by
 * default with reveal + copy. Zero mock — when a value is unknown it renders a
 * neutral state rather than a fabricated number.
 */

export interface DatabaseSettingsProps {
  /** e.g. "Development Database" / "Production Database". */
  name: string;
  active?: boolean;

  /** The DATABASE_URL value, if the API exposes it (otherwise masked-only). */
  connectionString?: string;
  storageUsedBytes?: number;
  storageQuotaBytes?: number;

  /** Extra "Connection details" rows for the Advanced section (label → value). */
  connectionDetails?: Array<{ label: string; value: string }>;

  /** Remove this database (parent wires the real action). */
  onRemove?: () => void;

  /**
   * Project id — enables the point-in-time restore section (folded in from the
   * old top-level Backups tab during the 5->3 tab consolidation). The rollback
   * panel self-hides until the DB_ROLLBACK_ENABLED flag is on, so it is inert
   * today and renders nothing when projectId is absent.
   */
  projectId?: string;
}

function formatBytes(bytes?: number): string | null {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) {
    return null;
  }

  const mb = bytes / (1024 * 1024);

  if (mb < 1024) {
    return `${mb < 10 ? mb.toFixed(2) : Math.round(mb)}MB`;
  }

  return `${(mb / 1024).toFixed(2)}GB`;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-bolt-elements-textTertiary">
      {children}
    </h4>
  );
}

export function DatabaseSettings({
  name,
  active,
  connectionString,
  storageUsedBytes,
  storageQuotaBytes,
  connectionDetails,
  onRemove,
  projectId,
}: DatabaseSettingsProps) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const used = formatBytes(storageUsedBytes);
  const quota = formatBytes(storageQuotaBytes);

  const pct =
    typeof storageUsedBytes === 'number' && typeof storageQuotaBytes === 'number' && storageQuotaBytes > 0
      ? Math.min(100, Math.round((storageUsedBytes / storageQuotaBytes) * 100))
      : undefined;

  const copy = () => {
    if (!connectionString) {
      return;
    }

    void navigator.clipboard
      ?.writeText(connectionString)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {
        /* clipboard can reject in insecure contexts — non-fatal */
      });
  };

  const masked = connectionString ? '•'.repeat(Math.min(32, Math.max(12, connectionString.length))) : '••••••••••••';

  return (
    <div className="flex flex-col gap-6 p-4">
      <div className="flex items-center gap-2">
        <h3 className="text-[15px] font-semibold text-bolt-elements-textPrimary">{name}</h3>
        {active ? (
          <span className="rounded-full bg-[var(--ecode-accent,#F26207)]/15 px-2 py-0.5 text-[11px] font-medium text-[var(--ecode-accent,#F26207)]">
            Active
          </span>
        ) : null}
      </div>

      {/* Connection string */}
      <section className="flex flex-col gap-2">
        <SectionTitle>Connection string</SectionTitle>
        <div className="flex items-center gap-2 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-2">
          <span className="shrink-0 font-mono text-[12px] text-bolt-elements-textSecondary">DATABASE_URL</span>
          <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-bolt-elements-textPrimary">
            {revealed && connectionString ? connectionString : masked}
          </span>
          <button
            type="button"
            onClick={() => setRevealed((v) => !v)}
            disabled={!connectionString}
            title={revealed ? 'Hide' : 'Reveal'}
            aria-label={revealed ? 'Hide connection string' : 'Reveal connection string'}
            className="shrink-0 rounded p-1 text-bolt-elements-textTertiary hover:bg-bolt-elements-background-depth-3 hover:text-bolt-elements-textPrimary disabled:opacity-40"
          >
            {revealed ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
          </button>
          <button
            type="button"
            onClick={copy}
            disabled={!connectionString}
            title="Copy"
            aria-label="Copy connection string"
            className="shrink-0 rounded p-1 text-bolt-elements-textTertiary hover:bg-bolt-elements-background-depth-3 hover:text-bolt-elements-textPrimary disabled:opacity-40"
          >
            {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
          </button>
        </div>
        <p className="text-[12px] text-bolt-elements-textTertiary">
          The address and password your app uses to talk to this database.
        </p>
      </section>

      {/* Storage */}
      <section className="flex flex-col gap-2">
        <SectionTitle>Storage</SectionTitle>
        {used ? (
          <>
            <div className="text-[13px] text-bolt-elements-textPrimary">
              {used}
              {quota ? <span className="text-bolt-elements-textTertiary"> of {quota}</span> : null}
              {pct !== undefined ? <span className="text-bolt-elements-textTertiary"> · {pct}% used</span> : null}
            </div>
            {pct !== undefined ? (
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-bolt-elements-background-depth-3">
                <div className="h-full rounded-full bg-[var(--ecode-accent,#F26207)]" style={{ width: `${pct}%` }} />
              </div>
            ) : null}
          </>
        ) : (
          <p className="text-[12px] text-bolt-elements-textTertiary">
            Storage usage appears once the database reports it.
          </p>
        )}
      </section>

      {/* Advanced */}
      <section className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => setAdvancedOpen((v) => !v)}
          className="flex w-fit items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-bolt-elements-textTertiary hover:text-bolt-elements-textSecondary"
          aria-expanded={advancedOpen}
        >
          <ChevronDown
            className={classNames('h-3.5 w-3.5 transition-transform', advancedOpen && 'rotate-180')}
            aria-hidden
          />
          Advanced
        </button>
        {advancedOpen ? (
          <div className="rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-3">
            <div className="text-[12px] font-medium text-bolt-elements-textPrimary">
              Connection details — {connectionDetails?.length ?? 1} URL
            </div>
            <dl className="mt-2 grid gap-1.5">
              {(
                connectionDetails ?? [
                  { label: 'DATABASE_URL', value: revealed && connectionString ? connectionString : masked },
                ]
              ).map((d) => (
                <div key={d.label} className="grid grid-cols-[120px_minmax(0,1fr)] gap-2 text-[12px]">
                  <dt className="text-bolt-elements-textSecondary">{d.label}</dt>
                  <dd className="min-w-0 truncate font-mono text-bolt-elements-textPrimary">{d.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        ) : null}
      </section>

      {onRemove ? (
        <section className="flex flex-col gap-2 border-t border-bolt-elements-borderColor pt-4">
          <button
            type="button"
            onClick={onRemove}
            className="w-fit rounded-md border border-red-500/40 px-3 py-1.5 text-[13px] font-medium text-red-500 hover:bg-red-500/10"
          >
            Remove database
          </button>
        </section>
      ) : null}

      {/*
       * Point-in-time restore — folded in from the old top-level "Backups" tab
       * (5->3 tab consolidation). Self-hides until DB_ROLLBACK_ENABLED is on.
       */}
      {projectId ? (
        <section className="border-t border-bolt-elements-borderColor pt-4">
          <DatabaseRollbackPanel projectId={projectId} />
        </section>
      ) : null}
    </div>
  );
}
