/**
 * @vitest-environment jsdom
 */

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MessagePatchReview } from './MessagePatchReview';
import { REQUIRE_AI_CHANGE_REVIEW_STORAGE_KEY } from '~/lib/hooks/useAutoApplyEnabled';
import type { FileActionDiff } from '~/lib/hooks/useFileActionDiff';
import type { FileActionBlock } from '~/types/message-blocks';
import { buildReviewableDiffHunks, summarizeReviewableDiffHunks } from '~/utils/diff';

/*
 * Mock the workbench-aware diff hook so we don't need to spin up the
 * webcontainer in the test. We also stub the workbenchStore write path so
 * the default apply handler doesn't try to reach disk.
 */
function buildFakeDiff(action: FileActionBlock): FileActionDiff {
  const absolutePath = action.filePath.startsWith('/') ? action.filePath : `/home/project/${action.filePath}`;
  const original = '';
  const hunks = buildReviewableDiffHunks(absolutePath, original, action.content);

  return {
    absolutePath,
    filePath: action.filePath,
    originalContent: original,
    proposedContent: action.content,
    isNewFile: true,
    hunks,
    summary: summarizeReviewableDiffHunks(hunks),
  };
}

vi.mock('~/lib/hooks/useFileActionDiff', () => ({
  useFileActionDiff: buildFakeDiff,
  computeFileActionDiff: (_files: unknown, action: FileActionBlock) => buildFakeDiff(action),
}));

const { filesMock, selfRepairMock } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- needed to stay inside the hoisted closure
  const { map } = require('nanostores') as typeof import('nanostores');
  return {
    filesMock: map<Record<string, { type: 'file'; content: string; isBinary: false }>>({}),
    selfRepairMock: map<Record<string, { attempt: number; maxAttempts: number; errorMessage?: string }>>({}),
  };
});

vi.mock('~/lib/stores/workbench', () => ({
  workbenchStore: {
    files: filesMock,
    agentPatchSelfRepair: selfRepairMock,
    writeFileContent: vi.fn(async () => undefined),
  },
}));

const MESSAGE_WITH_TWO_FILES = [
  'I shipped two files.',
  '<boltArtifact id="a1" title="Stuff">',
  '<boltAction type="file" filePath="src/one.ts">export const one = 1;</boltAction>',
  '<boltAction type="file" filePath="src/two.ts">export const two = 2;</boltAction>',
  '</boltArtifact>',
].join('\n');

describe('<MessagePatchReview />', () => {
  afterEach(() => {
    window.localStorage.removeItem(REQUIRE_AI_CHANGE_REVIEW_STORAGE_KEY);
    cleanup();
  });

  it('renders nothing by default because auto-apply starts enabled', () => {
    const { container } = render(
      <MessagePatchReview messageId="m-default" content={MESSAGE_WITH_TWO_FILES} parts={undefined} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when review is not required (auto-apply enabled)', () => {
    window.localStorage.setItem(REQUIRE_AI_CHANGE_REVIEW_STORAGE_KEY, 'false');

    const { container } = render(
      <MessagePatchReview messageId="m-auto" content={MESSAGE_WITH_TWO_FILES} parts={undefined} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders the review panel when the user requires review of AI changes', () => {
    window.localStorage.setItem(REQUIRE_AI_CHANGE_REVIEW_STORAGE_KEY, 'true');

    const { container } = render(
      <MessagePatchReview messageId="m-review" content={MESSAGE_WITH_TWO_FILES} parts={undefined} />,
    );
    expect(container.firstChild).not.toBeNull();
    expect(container.querySelector('.bolt-message-patch-review')).not.toBeNull();
  });

  it('renders nothing when the message has no file actions', () => {
    const { container } = render(
      <MessagePatchReview messageId="m-empty" content="Just narration, no actions." parts={undefined} />,
    );
    expect(container.firstChild).toBeNull();
  });
});
