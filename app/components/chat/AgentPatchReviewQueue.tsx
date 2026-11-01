import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { scheduleAppliedFilesToast } from './schedule-applied-files-toast';
import { workbenchStore, type AgentPatchProposal } from '~/lib/stores/workbench';
import { canRetryAgentPatchAutomatically, propositionsAMontrer } from '~/utils/agent-auto-apply';

export function AgentPatchReviewQueue({ proposals }: { proposals: AgentPatchProposal[]; autoApplyEnabled?: boolean }) {
  const { t } = useTranslation();

  // A stored manual-review preference must not resurrect Accept/Reject controls.
  const visibleProposals = useMemo(() => propositionsAMontrer(proposals, true), [proposals]);
  const [detailsOpen, setDetailsOpen] = useState(false);

  if (!visibleProposals.length) {
    return null;
  }

  const retryable = visibleProposals.filter(canRetryAgentPatchAutomatically);

  const retry = async (ids: string[]) => {
    const results = await workbenchStore.retryAutomaticAgentPatchProposals(ids);

    for (const result of results) {
      const proposal = proposals.find(({ id }) => id === result.id);

      // Only confirmed writes enter the same Undo batch used by initial auto-apply.
      if (result.status === 'accepted' && proposal) {
        scheduleAppliedFilesToast(proposal.relativePath, proposal.id);
      }
    }
  };

  const retryAll = () => void retry(retryable.map(({ id }) => id));

  return (
    <section
      className="bolt-project-agent-patch-review bolt-project-agent-patch-review--automatic"
      aria-label={t('chat.copy.aiPatchReviewQueue_b6f83c83')}
    >
      {
        <p role="status" className="text-sm text-bolt-elements-textPrimary">
          {t('baseChatAst.patch.failed', { count: visibleProposals.length })}
        </p>
      }
      <details
        open={detailsOpen}
        onToggle={(event) => setDetailsOpen(event.currentTarget.open)}
        className="bolt-project-agent-patch-review-details"
      >
        <summary className="cursor-pointer text-sm text-bolt-elements-textSecondary focus-visible:outline focus-visible:outline-2">
          {t('baseChatAst.patch.detailsAndRetry')}
        </summary>
        <div hidden={!detailsOpen}>
          <div className="bolt-project-agent-patch-review-head">
            <div className="bolt-project-agent-patch-review-bulk">
              <button type="button" disabled={!retryable.length} onClick={retryAll}>
                {t('baseChatAst.patch.retryChanges')}
              </button>
            </div>
          </div>
          <div className="bolt-project-agent-patch-review-list">
            {visibleProposals.map((proposal) => {
              return (
                <article key={proposal.id} className="bolt-project-agent-patch-card" data-status={proposal.status}>
                  <div className="bolt-project-agent-patch-card-head">
                    <div>
                      <strong title={proposal.relativePath}>{proposal.relativePath}</strong>
                      <span>
                        {/*
                         * BUG-QA-I18N-COUNT-002 : compteurs collés au libellé, et
                         * pluriel fabriqué avec un « s » ANGLAIS ajouté à une chaîne
                         * traduite (« Segments » en français par accident).
                         */}
                        {t('baseChatAst.patch.hunks', { count: proposal.hunks.length })}
                      </span>
                    </div>
                    <div className="bolt-project-agent-patch-actions">
                      <button
                        type="button"
                        disabled={!canRetryAgentPatchAutomatically(proposal)}
                        onClick={() => void retry([proposal.id])}
                      >
                        {t('baseChatAst.patch.retryChange')}
                      </button>
                    </div>
                  </div>
                  {!canRetryAgentPatchAutomatically(proposal) ? <p>{t('baseChatAst.patch.regenerateSafely')}</p> : null}
                  {proposal.error ? <p className="bolt-project-agent-patch-error">{proposal.error}</p> : null}
                  <details className="bolt-project-agent-patch-hunks-toggle">
                    <summary>
                      <span className="bolt-project-agent-patch-hunks-toggle-label">
                        {t('chat.copy.showDiff_78016e77')}
                        <span className="bolt-project-agent-patch-hunks-toggle-count">
                          {t('baseChatAst.counts.hunks', { count: proposal.hunks.length })}
                        </span>
                      </span>
                      <span className="bolt-project-agent-patch-hunks-toggle-chevron i-ph:caret-down" aria-hidden />
                    </summary>
                    <div className="bolt-project-agent-patch-hunks">
                      {proposal.hunks.map((hunk, index) => {
                        return (
                          <div
                            key={hunk.id}
                            className="bolt-project-agent-patch-hunk bolt-project-agent-patch-hunk--flat"
                          >
                            <div className="bolt-project-agent-patch-hunk-head">
                              <span>
                                {t('chat.copy.hunk_1920d3ca')} {index + 1}
                              </span>
                              <span>
                                -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines}
                              </span>
                            </div>
                            <pre
                              aria-label={t('chat.copy.diffHunkValue0ForValue1_15b99314', {
                                value0: index + 1,
                                value1: proposal.relativePath,
                              })}
                            >
                              {hunk.lines.map((line) => (
                                <code key={line.id} data-line-type={line.type}>
                                  {line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '}
                                  {line.content}
                                </code>
                              ))}
                            </pre>
                          </div>
                        );
                      })}
                    </div>
                  </details>
                </article>
              );
            })}
          </div>
        </div>
      </details>
    </section>
  );
}
