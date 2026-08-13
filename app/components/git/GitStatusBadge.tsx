import { classNames } from '~/utils/classNames';
import { describeGitFileStatus, getGitStatusLegendItems } from '~/utils/git-status-display';

type GitStatusBadgeSize = 'compact' | 'default';

interface GitStatusBadgeProps {
  status: unknown;
  className?: string;
  size?: GitStatusBadgeSize;
}

const sizeClassNames: Record<GitStatusBadgeSize, string> = {
  compact: 'h-4 min-w-4 px-1 text-[10px]',
  default: 'h-5 min-w-5 px-1.5 text-[11px]',
};

export function GitStatusBadge({ status, className, size = 'default' }: GitStatusBadgeProps) {
  const statusInfo = describeGitFileStatus(status);
  const title = `${statusInfo.displayCode} = ${statusInfo.label}. ${statusInfo.description}`;

  return (
    <span
      className={classNames(
        'inline-flex shrink-0 items-center justify-center rounded border font-semibold leading-none',
        sizeClassNames[size],
        statusInfo.toneClassName,
        className,
      )}
      title={title}
      aria-label={`Git status ${title}`}
    >
      {statusInfo.displayCode}
      <span className="sr-only"> {statusInfo.label}</span>
    </span>
  );
}

export function GitStatusLegend({ className }: { className?: string }) {
  return (
    <div
      className={classNames(
        'rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-2 text-[11px] leading-5 text-bolt-elements-textSecondary',
        className,
      )}
    >
      <strong className="mr-2 text-bolt-elements-textPrimary">Status guide:</strong>
      <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1 align-middle">
        {getGitStatusLegendItems().map((item) => (
          <span key={item.key} className="inline-flex items-center gap-1.5" title={item.description}>
            <GitStatusBadge status={item.key} size="compact" />
            <span>{item.label}</span>
          </span>
        ))}
      </span>
    </div>
  );
}
