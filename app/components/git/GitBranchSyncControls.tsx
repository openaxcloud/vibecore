import type { FormEventHandler } from 'react';
import { isSshRemoteUrl } from '~/components/git/git-ssh-url';
import { classNames } from '~/utils/classNames';

interface GitBranchSyncControlsProps {
  branch: string;
  busy?: boolean;
  idPrefix: string;
  onSubmit: FormEventHandler<HTMLFormElement>;

  /** Repo origin URL (shown as a compact link, Replit-style). */
  repoUrl?: string | null;

  /** Human "last fetched Xago" string; omitted when never loaded. */
  lastFetched?: string;

  /** Refresh git status (the ↻ in the Remote Updates header). */
  onRefresh?: () => void;
  loading?: boolean;
}

function shortRepoLabel(url: string) {
  // org/repo from an https or ssh git URL, without the trailing ".git".
  const cleaned = url
    .replace(/\.git$/, '')
    .replace(/^git@[^:]+:/, '')
    .replace(/^https?:\/\/[^/]+\//, '');

  const parts = cleaned.split('/').filter(Boolean);

  return parts.slice(-2).join('/') || cleaned;
}

/*
 * "Remote Updates" section, matched to Replit's clean/compact layout: a header
 * with the repo link, the `origin/<branch> • upstream` line + "last fetched Xago"
 * + refresh, one full-width "Sync Changes" button, and compact Pull / Push
 * buttons side-by-side. Deliberately NO branch text inputs and NO verbose
 * per-action descriptions — pull/push use the current branch implicitly, exactly
 * like Replit. ecode orange is kept only for the primary Sync Changes accent.
 */
export function GitBranchSyncControls({
  branch,
  busy = false,
  idPrefix,
  onSubmit,
  repoUrl,
  lastFetched,
  onRefresh,
  loading = false,
}: GitBranchSyncControlsProps) {
  /*
   * Fixed px (not rem) so the Git pane keeps a true IDE density regardless of the
   * ecode app-wide responsive root-font scaling (which otherwise shrank these to
   * ~24px/10px). Standard IDE control density: 30px secondary buttons, 13px text.
   */
  const secondaryButton = classNames(
    'inline-flex h-[32px] w-full items-center justify-center gap-1.5 rounded-[6px] border border-bolt-elements-borderColor',
    'text-[13.3px] font-medium text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3 disabled:opacity-60',
    'focus:outline-none focus:ring-2 focus:ring-bolt-elements-focus focus:ring-offset-1 focus:ring-offset-bolt-elements-background-depth-2',
  );

  return (
    <section
      className="grid gap-2.5 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-3"
      aria-labelledby={`${idPrefix}-sync-heading`}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 id={`${idPrefix}-sync-heading`} className="text-[14px] font-medium text-bolt-elements-textPrimary">
          Remote Updates
        </h3>
        {repoUrl ? (
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <a
              href={repoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-w-0 items-center gap-1 truncate text-[12px] text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary"
              title={repoUrl}
            >
              <span className="i-ph:github-logo text-sm" aria-hidden />
              <span className="truncate">{shortRepoLabel(repoUrl)}</span>
            </a>
            {isSshRemoteUrl(repoUrl) ? (
              <span
                className="inline-flex shrink-0 items-center gap-1 rounded-full border border-bolt-elements-borderColor px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-bolt-elements-textTertiary"
                title="Authenticated with this project's SSH key, run inside the isolated workspace (manage in ⚙ Settings → SSH keys)"
              >
                <span className="i-ph:key text-[11px]" aria-hidden />
                SSH
              </span>
            ) : null}
          </span>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-2 text-[12px] text-bolt-elements-textSecondary">
        <code className="truncate">
          origin/{branch} <span className="text-bolt-elements-textTertiary">• upstream</span>
        </code>
        <span className="flex shrink-0 items-center gap-2">
          {lastFetched ? <span className="hidden sm:inline">last fetched {lastFetched}</span> : null}
          {onRefresh ? (
            <button
              type="button"
              data-testid="git-refresh"
              disabled={loading}
              onClick={onRefresh}
              title="Refresh git status"
              aria-label="Refresh git status"
              className={classNames(
                'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[6px] text-bolt-elements-textSecondary',
                'hover:bg-bolt-elements-background-depth-3 hover:text-bolt-elements-textPrimary disabled:opacity-50',
                'focus:outline-none focus:ring-2 focus:ring-bolt-elements-focus focus:ring-offset-1 focus:ring-offset-bolt-elements-background-depth-2',
              )}
            >
              <span className="i-ph:arrows-clockwise text-sm" aria-hidden />
            </button>
          ) : null}
        </span>
      </div>

      <form onSubmit={onSubmit}>
        <input name="intent" value="sync" type="hidden" />
        <input name="branch" value={branch} type="hidden" />
        <button
          type="submit"
          disabled={busy}
          data-testid="git-sync-changes"
          className={classNames(
            'inline-flex h-[32px] w-full items-center justify-center gap-2 rounded-[6px] text-[13.3px] font-semibold text-white disabled:opacity-60',
            'focus:outline-none focus:ring-2 focus:ring-bolt-elements-focus focus:ring-offset-2 focus:ring-offset-bolt-elements-background-depth-2',
          )}
          style={{ background: 'var(--ecode-accent, #F26207)' }}
        >
          <span className="i-ph:arrows-clockwise text-base" aria-hidden />
          Sync Changes
        </button>
      </form>

      <div className="grid grid-cols-2 gap-2">
        <form onSubmit={onSubmit}>
          <input name="intent" value="pull" type="hidden" />
          <input name="branch" value={branch} type="hidden" />
          <button
            type="submit"
            disabled={busy}
            className={secondaryButton}
            title={`Pull origin/${branch} into the workspace (clones it on the first pull into an empty tree)`}
            aria-label={`Pull remote updates from origin/${branch} into this workspace branch`}
          >
            <span className="i-ph:arrow-down text-sm" aria-hidden />
            Pull
          </button>
        </form>
        <form onSubmit={onSubmit}>
          <input name="intent" value="push" type="hidden" />
          <input name="branch" value={branch} type="hidden" />
          <button
            type="submit"
            disabled={busy}
            className={secondaryButton}
            title={`Push local commits to origin/${branch}`}
            aria-label={`Push local commits to origin/${branch}`}
          >
            <span className="i-ph:arrow-up text-sm" aria-hidden />
            Push
          </button>
        </form>
      </div>
    </section>
  );
}
