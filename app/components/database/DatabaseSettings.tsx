import { Check, ChevronDown, Copy, Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DatabaseRollbackPanel } from './DatabaseRollbackPanel';
import {
  formatDatabaseSettingsBytes,
  formatDatabaseStudioCopy,
  formatDatabaseStudioNumber,
  formatDatabaseStudioPlural,
  getDatabaseStudioCopy,
} from '~/lib/i18n/catalogs/database-studio';
import { classNames } from '~/utils/classNames';

const DATABASE_URL_KEY = 'DATABASE_URL';

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
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const copy = getDatabaseStudioCopy(language);
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const used = formatDatabaseSettingsBytes(storageUsedBytes, language);
  const quota = formatDatabaseSettingsBytes(storageQuotaBytes, language);

  const pct =
    typeof storageUsedBytes === 'number' && typeof storageQuotaBytes === 'number' && storageQuotaBytes > 0
      ? Math.min(100, Math.round((storageUsedBytes / storageQuotaBytes) * 100))
      : undefined;

  const copyConnectionString = () => {
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
    <div className="flex min-w-0 flex-col gap-6 overflow-x-hidden p-4">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <h3 className="min-w-0 break-words text-[15px] font-semibold text-bolt-elements-textPrimary">{name}</h3>
        {active ? (
          <span className="rounded-full bg-[var(--ecode-accent,#F26207)]/15 px-2 py-0.5 text-[11px] font-medium text-[var(--ecode-accent,#F26207)]">
            {copy['databaseSettings.active']}
          </span>
        ) : null}
      </div>

      {/* Connection string */}
      <section className="flex flex-col gap-2">
        <SectionTitle>{copy['databaseSettings.connectionString']}</SectionTitle>
        <div className="flex min-w-0 flex-wrap items-center gap-2 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-2 sm:flex-nowrap">
          <span className="shrink-0 font-mono text-[12px] text-bolt-elements-textSecondary">{DATABASE_URL_KEY}</span>
          <span className="min-w-0 flex-1 basis-full truncate font-mono text-[12px] text-bolt-elements-textPrimary sm:basis-auto">
            {revealed && connectionString ? connectionString : masked}
          </span>
          <button
            type="button"
            onClick={() => setRevealed((v) => !v)}
            disabled={!connectionString}
            title={revealed ? copy['databaseSettings.hide'] : copy['databaseSettings.reveal']}
            aria-label={
              revealed ? copy['databaseSettings.hideConnectionString'] : copy['databaseSettings.revealConnectionString']
            }
            className="shrink-0 rounded p-1 text-bolt-elements-textTertiary hover:bg-bolt-elements-background-depth-3 hover:text-bolt-elements-textPrimary disabled:opacity-40"
          >
            {revealed ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
          </button>
          <button
            type="button"
            onClick={copyConnectionString}
            disabled={!connectionString}
            title={copied ? copy['databaseSettings.copied'] : copy['databaseSettings.copy']}
            aria-label={copy['databaseSettings.copyConnectionString']}
            className="shrink-0 rounded p-1 text-bolt-elements-textTertiary hover:bg-bolt-elements-background-depth-3 hover:text-bolt-elements-textPrimary disabled:opacity-40"
          >
            {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
          </button>
        </div>
        <p className="text-[12px] text-bolt-elements-textTertiary">{copy['databaseSettings.connectionDescription']}</p>
      </section>

      {/* Storage */}
      <section className="flex flex-col gap-2">
        <SectionTitle>{copy['databaseSettings.storage']}</SectionTitle>
        {used ? (
          <>
            <div className="break-words text-[13px] text-bolt-elements-textPrimary">
              {quota ? formatDatabaseStudioCopy(copy['databaseSettings.storageOf'], { used, quota }) : used}
              {pct !== undefined ? (
                <span className="text-bolt-elements-textTertiary">
                  {' · '}
                  {formatDatabaseStudioCopy(copy['databaseSettings.storagePercent'], {
                    percent: formatDatabaseStudioNumber(pct, language),
                  })}
                </span>
              ) : null}
            </div>
            {pct !== undefined ? (
              <div
                className="h-1.5 w-full overflow-hidden rounded-full bg-bolt-elements-background-depth-3"
                role="progressbar"
                aria-label={formatDatabaseStudioCopy(copy['databaseSettings.storageProgress'], {
                  percent: formatDatabaseStudioNumber(pct, language),
                })}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={pct}
              >
                <div className="h-full rounded-full bg-[var(--ecode-accent,#F26207)]" style={{ width: `${pct}%` }} />
              </div>
            ) : null}
          </>
        ) : (
          <p className="text-[12px] text-bolt-elements-textTertiary">{copy['databaseSettings.storageUnavailable']}</p>
        )}
      </section>

      {/* Advanced */}
      <section className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => setAdvancedOpen((v) => !v)}
          className="flex w-full min-w-0 items-center gap-1.5 whitespace-normal text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-bolt-elements-textTertiary hover:text-bolt-elements-textSecondary sm:w-fit"
          aria-expanded={advancedOpen}
        >
          <ChevronDown
            className={classNames('h-3.5 w-3.5 transition-transform', advancedOpen && 'rotate-180')}
            aria-hidden
          />
          {copy['databaseSettings.advanced']}
        </button>
        {advancedOpen ? (
          <div className="rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-3">
            <div className="break-words text-[12px] font-medium text-bolt-elements-textPrimary">
              {formatDatabaseStudioPlural(language, connectionDetails?.length ?? 1, {
                one: copy['databaseSettings.connectionDetails_one'],
                other: copy['databaseSettings.connectionDetails_other'],
              })}
            </div>
            <dl className="mt-2 grid gap-1.5">
              {(
                connectionDetails ?? [
                  { label: DATABASE_URL_KEY, value: revealed && connectionString ? connectionString : masked },
                ]
              ).map((d) => (
                <div
                  key={d.label}
                  className="grid min-w-0 grid-cols-1 gap-1 text-[12px] sm:grid-cols-[120px_minmax(0,1fr)] sm:gap-2"
                >
                  <dt className="break-words text-bolt-elements-textSecondary">{d.label}</dt>
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
            className="w-full whitespace-normal rounded-md border border-red-500/40 px-3 py-1.5 text-[13px] font-medium text-red-500 hover:bg-red-500/10 sm:w-fit"
          >
            {copy['databaseSettings.remove']}
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
