/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MessagePatchReview } from './MessagePatchReview';
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

const { filesMock } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- needed to stay inside the hoisted closure
  const { map } = require('nanostores') as typeof import('nanostores');
  return { filesMock: map<Record<string, { type: 'file'; content: string; isBinary: false }>>({}) };
});

vi.mock('~/lib/stores/workbench', () => ({
  workbenchStore: {
    files: filesMock,
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
    cleanup();
  });

  it('renders nothing when the message has no file actions', () => {
    const { container } = render(
      <MessagePatchReview messageId="m-empty" content="Just narration, no actions." parts={undefined} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('lists every file action as its own inline diff card', () => {
    render(<MessagePatchReview messageId="m1" content={MESSAGE_WITH_TWO_FILES} parts={undefined} />);

    expect(screen.getByText('Files changed')).toBeTruthy();
    expect(screen.getByLabelText('2 files').textContent).toBe('2');
    expect(screen.getByLabelText('File action diff for src/one.ts')).toBeTruthy();
    expect(screen.getByLabelText('File action diff for src/two.ts')).toBeTruthy();
  });

  it('collapses and reopens the panel on toggle', () => {
    render(<MessagePatchReview messageId="m1" content={MESSAGE_WITH_TWO_FILES} parts={undefined} />);

    const toggle = screen.getByRole('button', { name: /Files changed/ });
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(screen.queryByLabelText('File action diff for src/one.ts')).toBeTruthy();

    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByLabelText('File action diff for src/one.ts')).toBeNull();

    fireEvent.click(toggle);
    expect(screen.queryByLabelText('File action diff for src/one.ts')).toBeTruthy();
  });

  it('shows aggregate +N / −M counts in the panel header', () => {
    render(<MessagePatchReview messageId="m1" content={MESSAGE_WITH_TWO_FILES} parts={undefined} />);

    // Both files are new → 1 added line each (no prior content), 0 removed.
    expect(screen.getByLabelText(/2 added, 0 removed across 2 files/)).toBeTruthy();
  });

  it('Apply all bulk-applies every file action with changes', async () => {
    const onApply = vi.fn().mockResolvedValue(undefined);
    render(<MessagePatchReview messageId="m1" content={MESSAGE_WITH_TWO_FILES} parts={undefined} onApply={onApply} />);

    const applyAll = screen.getByRole('button', { name: /Apply all 2 files/ });
    fireEvent.click(applyAll);

    /*
     * The handler is async; wait for the Apply-all button to leave the
     * "Applying…" state by polling for both onApply invocations.
     */
    await vi.waitFor(() => {
      expect(onApply).toHaveBeenCalledTimes(2);
    });

    expect(onApply.mock.calls[0][0].filePath).toBe('src/one.ts');
    expect(onApply.mock.calls[1][0].filePath).toBe('src/two.ts');

    // Each detail carries the full proposed content as acceptedContent.
    expect(onApply.mock.calls[0][0].acceptedHunkIds.length).toBeGreaterThan(0);
    expect(onApply.mock.calls[0][0].rejectedHunkIds).toEqual([]);
  });

  it('forwards onApply for each file action card', () => {
    const onApply = vi.fn();
    render(<MessagePatchReview messageId="m1" content={MESSAGE_WITH_TWO_FILES} parts={undefined} onApply={onApply} />);

    // Accept one hunk in the first card, click its Apply button.
    fireEvent.click(screen.getAllByRole('button', { name: 'Accept hunk' })[0]);
    fireEvent.click(screen.getAllByRole('button', { name: 'Apply accepted hunks' })[0]);

    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply.mock.calls[0][0].filePath).toBe('src/one.ts');
  });
});
