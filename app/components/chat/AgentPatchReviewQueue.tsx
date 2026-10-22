import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { workbenchStore, type AgentPatchProposal } from '~/lib/stores/workbench';
import { propositionsAMontrer } from '~/utils/agent-auto-apply';

export function AgentPatchReviewQueue({
  proposals,
  autoApplyEnabled,
}: {
  proposals: AgentPatchProposal[];
  autoApplyEnabled?: boolean;
}) {
  const { t } = useTranslation();
  const [selectedHunksByProposal, setSelectedHunksByProposal] = useState<Record<string, Set<string>>>({});

  /*
   * Avec l'application automatique, la file ne montre que ce qu'elle ne
   * prendra JAMAIS (conflit, proposition relue, tronquée, échec) — elle était
   * vide, et ces propositions attendaient une revue que personne ne voyait.
   */
  const visibleProposals = useMemo(
    () => propositionsAMontrer(proposals, Boolean(autoApplyEnabled)),
    [proposals, autoApplyEnabled],
  );

  useEffect(() => {
    setSelectedHunksByProposal((current) => {
      let changed = false;

      const next = { ...current };

      for (const proposal of visibleProposals) {
        if (!next[proposal.id]) {
          next[proposal.id] = new Set(proposal.hunks.map((hunk) => hunk.id));
          changed = true;
        }
      }

      for (const proposalId of Object.keys(next)) {
        if (!visibleProposals.some((proposal) => proposal.id === proposalId)) {
          delete next[proposalId];
          changed = true;
        }
      }

      return changed ? next : current;
    });
  }, [visibleProposals]);

  const requiresReview =
    !autoApplyEnabled ||
    visibleProposals.some((proposal) => proposal.conflit || proposal.relueDeLaBase || proposal.tronquee);

  const [detailsOpen, setDetailsOpen] = useState(requiresReview);

  useEffect(() => {
    if (requiresReview) {
      setDetailsOpen(true);
    }
  }, [requiresReview]);

  if (!visibleProposals.length) {
    return null;
  }

  const toggleHunk = (proposalId: string, hunkId: string) => {
    setSelectedHunksByProposal((current) => {
      const selected = new Set(current[proposalId] ?? []);

      if (selected.has(hunkId)) {
        selected.delete(hunkId);
      } else {
        selected.add(hunkId);
      }

      return { ...current, [proposalId]: selected };
    });
  };

  const pendingForBulk = visibleProposals.filter((proposal) => proposal.status !== 'applying');

  const acceptAll = () => {
    /*
     * Apply the whole batch through the store's bulk path, which topologically
     * sorts by import dependencies and awaits each accept sequentially. Firing
     * the accepts concurrently here (the previous behaviour) raced the per-accept
     * resetAllFileModifications/loadRuntimeFiles/saveFile calls against each other
     * and could land an importer before the file it imports.
     */
    const ids: string[] = [];
    const hunkSelections: Record<string, string[]> = {};

    for (const proposal of pendingForBulk) {
      const selected = selectedHunksByProposal[proposal.id] ?? new Set(proposal.hunks.map((hunk) => hunk.id));

      if (selected.size === 0) {
        continue;
      }

      ids.push(proposal.id);
      hunkSelections[proposal.id] = Array.from(selected);
    }

    if (ids.length === 0) {
      return;
    }

    void workbenchStore.acceptAllAgentPatchProposals(ids, hunkSelections);
  };
  const rejectAll = () => {
    for (const proposal of pendingForBulk) {
      workbenchStore.rejectAgentPatchProposal(proposal.id);
    }
  };

  return (
    <section className="bolt-project-agent-patch-review" aria-label={t('chat.copy.aiPatchReviewQueue_b6f83c83')}>
      {!requiresReview ? (
        <p role="status" className="text-sm text-bolt-elements-textPrimary">
          {t('baseChatAst.patch.failed', { count: visibleProposals.length })}
        </p>
      ) : null}
      <details
        open={detailsOpen}
        onToggle={(event) => setDetailsOpen(event.currentTarget.open)}
        className="bolt-project-agent-patch-review-details"
      >
        <summary className="cursor-pointer text-sm text-bolt-elements-textSecondary focus-visible:outline focus-visible:outline-2">
          {requiresReview ? t('baseChatAst.patch.decisionRequired') : t('baseChatAst.patch.detailsAndRetry')}
        </summary>
        <div hidden={!detailsOpen}>
          <div className="bolt-project-agent-patch-review-head">
            <div>
              <strong>{t('chat.copy.reviewAiChanges_5c09969d')}</strong>
              <span>
                {autoApplyEnabled
                  ? t('baseChatAst.patch.failed', { count: visibleProposals.length })
                  : t('baseChatAst.patch.review', { count: visibleProposals.length })}
              </span>
            </div>
            <div className="bolt-project-agent-patch-review-bulk">
              <button
                type="button"
                className="bolt-project-agent-patch-review-bulk-accept"
                disabled={pendingForBulk.length === 0}
                onClick={acceptAll}
              >
                {requiresReview ? t('chat.copy.acceptAll_821d1f79') : t('baseChatAst.patch.retryChanges')}
              </button>
              <button
                type="button"
                className="bolt-project-agent-patch-review-bulk-reject"
                disabled={pendingForBulk.length === 0}
                onClick={rejectAll}
              >
                {t('chat.copy.rejectAll_35c291a4')}
              </button>
            </div>
          </div>
          <div className="bolt-project-agent-patch-review-list">
            {visibleProposals.map((proposal) => {
              const selectedHunks =
                selectedHunksByProposal[proposal.id] ?? new Set(proposal.hunks.map((hunk) => hunk.id));

              const selectedCount = selectedHunks.size;
              const busy = proposal.status === 'applying';

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
                        {t('baseChatAst.patch.hunks', { count: proposal.hunks.length })} ·{' '}
                        {t('baseChatAst.patch.selected', { count: selectedCount })}
                      </span>
                    </div>
                    <div className="bolt-project-agent-patch-actions">
                      <button
                        type="button"
                        disabled={busy || selectedCount === 0}
                        onClick={() => workbenchStore.acceptAgentPatchProposal(proposal.id, Array.from(selectedHunks))}
                      >
                        {proposal.status === 'failed' && !proposal.conflit
                          ? t('baseChatAst.patch.retryChange')
                          : t('chat.copy.acceptFile_72208421')}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => workbenchStore.rejectAgentPatchProposal(proposal.id)}
                      >
                        {t('chat.copy.rejectFile_a52b87d3')}
                      </button>
                    </div>
                  </div>
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
                        const checked = selectedHunks.has(hunk.id);

                        return (
                          <div
                            key={hunk.id}
                            className="bolt-project-agent-patch-hunk bolt-project-agent-patch-hunk--flat"
                          >
                            <div className="bolt-project-agent-patch-hunk-head">
                              <label onClick={(event) => event.stopPropagation()}>
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleHunk(proposal.id, hunk.id)}
                                />
                                {t('chat.copy.hunk_1920d3ca')}
                                {index + 1}
                              </label>
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
