/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentPatchReviewQueue } from './AgentPatchReviewQueue';
import { createI18nInstance } from '~/lib/i18n/runtime';
import { workbenchStore, type AgentPatchProposal } from '~/lib/stores/workbench';
import { buildReviewableDiffHunks } from '~/utils/diff';

vi.mock('~/lib/stores/workbench', () => ({
  workbenchStore: {
    acceptAgentPatchProposal: vi.fn(async () => 'accepted'),
    rejectAgentPatchProposal: vi.fn(async () => undefined),
    acceptAllAgentPatchProposals: vi.fn(async () => undefined),
  },
}));

afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());

function proposal(overrides: Partial<AgentPatchProposal> = {}): AgentPatchProposal {
  const filePath = '/home/project/src/example.ts';
  return {
    id: 'artifact:file',
    artifactId: 'artifact',
    messageId: 'message',
    actionId: 'file',
    filePath,
    relativePath: 'src/example.ts',
    originalContent: '',
    proposedContent: 'export const example = 1;',
    hunks: buildReviewableDiffHunks(filePath, '', 'export const example = 1;'),
    status: 'failed',
    createdAt: '2026-10-22T00:00:00Z',
    updatedAt: '2026-10-22T00:00:00Z',
    error: 'The workspace did not confirm this change.',
    ...overrides,
  };
}

function renderQueue(proposals: AgentPatchProposal[], autoApplyEnabled = true, language = 'en') {
  return render(
    <I18nextProvider i18n={createI18nInstance(language)}>
      <AgentPatchReviewQueue proposals={proposals} autoApplyEnabled={autoApplyEnabled} />
    </I18nextProvider>,
  );
}

describe('AI patch review presentation', () => {
  it.each([
    ['en', '1 change could not be applied. Open the details to retry.', 'Details and retry', 'Retry this change'],
    [
      'fr',
      '1 modification n’a pas pu être appliquée. Ouvrez les détails pour réessayer.',
      'Détails et nouvelle tentative',
      'Réessayer cette modification',
    ],
  ])(
    'keeps a failed change visible with collapsed details and an explicit retry in %s',
    async (language, summary, details, retry) => {
      const change = proposal();
      const { container } = renderQueue([change], true, language);
      expect(screen.getByRole('status').textContent).toBe(summary);

      const disclosure = container.querySelector('details')!;
      expect(disclosure.open).toBe(false);
      expect(screen.queryByRole('button', { name: retry })).toBeNull();
      expect(workbenchStore.acceptAgentPatchProposal).not.toHaveBeenCalled();
      expect(workbenchStore.acceptAllAgentPatchProposals).not.toHaveBeenCalled();
      fireEvent.click(screen.getByText(details));
      expect(disclosure.open).toBe(true);
      expect(screen.getByText(change.error!).closest('details')?.open).toBe(true);
      await waitFor(() => expect(screen.getByRole('button', { name: retry })).toBeTruthy());
      fireEvent.click(screen.getByRole('button', { name: retry }));
      expect(workbenchStore.acceptAgentPatchProposal).toHaveBeenCalledTimes(1);
      expect(workbenchStore.acceptAgentPatchProposal).toHaveBeenCalledWith(
        change.id,
        change.hunks.map((hunk) => hunk.id),
      );
    },
  );

  it.each([{ conflit: true }, { relueDeLaBase: true }, { tronquee: true }])(
    'opens the review when automatic application is unsafe: %j',
    (flags) => {
      const { container } = renderQueue([proposal(flags)]);
      expect(container.querySelector('details')?.open).toBe(true);
      expect(screen.getByText('Changes need your review')).toBeTruthy();
      expect(workbenchStore.acceptAgentPatchProposal).not.toHaveBeenCalled();
    },
  );

  it('honours the explicit review preference for otherwise applicable pending changes', () => {
    const { container } = renderQueue([proposal({ status: 'pending', error: undefined })], false);
    expect(container.querySelector('details')?.open).toBe(true);
    expect(screen.getByText('Changes need your review')).toBeTruthy();
    expect(workbenchStore.acceptAllAgentPatchProposals).not.toHaveBeenCalled();
  });

  it('does not show a review queue for safe pending changes handled by auto-apply', () => {
    const { container } = renderQueue([proposal({ status: 'pending', error: undefined })]);
    expect(container.childElementCount).toBe(0);
  });
});
