import { useMemo } from 'react';
import { buildFileHistoryInlineDiff } from '~/lib/file-history/diff';

export interface InlineFileHistoryDiffProps {
  selectedContent: string;
  latestContent: string;
}

export function InlineFileHistoryDiff({ selectedContent, latestContent }: InlineFileHistoryDiffProps) {
  const diff = useMemo(
    () => buildFileHistoryInlineDiff(selectedContent, latestContent),
    [latestContent, selectedContent],
  );

  if (diff.additions === 0 && diff.removals === 0) {
    return (
      <div className="vc-file-history-no-diff" role="status">
        <span className="i-ph:checks-duotone" aria-hidden />
        <strong>No changes from the latest version</strong>
        <span>This revision and the latest file content are identical.</span>
      </div>
    );
  }

  return (
    <div className="vc-file-history-diff" data-testid="file-history-inline-diff">
      <div className="vc-file-history-diff-summary" aria-label="Inline comparison summary">
        <span className="vc-file-history-diff-stat is-added">+{diff.additions}</span>
        <span className="vc-file-history-diff-stat is-removed">−{diff.removals}</span>
        <span>Selected version → latest</span>
      </div>
      {diff.truncated ? (
        <div className="vc-file-history-diff-limit" role="status">
          Showing the first {diff.rows.length.toLocaleString()} of {diff.totalRows.toLocaleString()} changed and context
          lines.
        </div>
      ) : null}
      <div className="vc-file-history-diff-scroll" role="table" aria-label="Selected version compared with latest">
        {diff.rows.map((row) => (
          <div key={row.key} className={`vc-file-history-diff-row is-${row.kind}`} role="row">
            <span className="vc-file-history-diff-line" role="cell" aria-label="Old line">
              {row.oldLine ?? ''}
            </span>
            <span className="vc-file-history-diff-line" role="cell" aria-label="New line">
              {row.newLine ?? ''}
            </span>
            <span className="vc-file-history-diff-marker" role="cell" aria-hidden>
              {row.kind === 'added' ? '+' : row.kind === 'removed' ? '−' : ' '}
            </span>
            <code role="cell">{row.text || ' '}</code>
          </div>
        ))}
      </div>
    </div>
  );
}
