/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { InlineFileActionDiff, type InlineFileActionDiffApplyDetail } from './InlineFileActionDiff';
import type { FileActionDiff } from '~/lib/hooks/useFileActionDiff';
import type { FileActionBlock } from '~/types/message-blocks';
import { buildReviewableDiffHunks, summarizeReviewableDiffHunks, type ReviewableDiffSummary } from '~/utils/diff';

/*
 * Mock the diff hook so the component test doesn't need to spin up the
 * webcontainer-aware workbench store. The hook is unit-tested separately
 * via its pure `computeFileActionDiff` helper.
 */
vi.mock('~/lib/hooks/useFileActionDiff', () => ({
  useFileActionDiff: (action: FileActionBlock): FileActionDiff =>
    diffFor(action, fixtures.get(action.actionId)?.original ?? '', fixtures.get(action.actionId)?.isNewFile ?? false),
}));

interface Fixture {
  original: string;
  isNewFile: boolean;
}

const fixtures = new Map<string, Fixture>();

function setFixture(actionId: string, fixture: Fixture) {
  fixtures.set(actionId, fixture);
}

function diffFor(action: FileActionBlock, original: string, isNewFile: boolean): FileActionDiff {
  const absolutePath = action.filePath.startsWith('/') ? action.filePath : `/home/project/${action.filePath}`;
  const hunks = buildReviewableDiffHunks(absolutePath, original, action.content);
  const summary: ReviewableDiffSummary = summarizeReviewableDiffHunks(hunks);

  return {
    absolutePath,
    filePath: action.filePath,
    originalContent: original,
    proposedContent: action.content,
    isNewFile,
    hunks,
    summary,
  };
}

function fileBlock(filePath: string, content: string, streaming = false): FileActionBlock {
  return {
    id: `block-${filePath}`,
    kind: 'fileAction',
    artifactId: 'art-1',
    actionId: `act-${filePath}`,
    filePath,
    content,
    streaming,
  };
}

describe('<InlineFileActionDiff />', () => {
  afterEach(() => {
    cleanup();
    fixtures.clear();
  });

  it('renders the file path, summary pill, and hunk lines for a settled diff', () => {
    setFixture('act-src/App.tsx', { original: 'export const App = () => null;\n', isNewFile: false });

    render(<InlineFileActionDiff action={fileBlock('src/App.tsx', 'export const App = () => <div />;\n')} />);

    expect(screen.getByText('src/App.tsx')).toBeTruthy();
    expect(screen.getByLabelText('1 added').textContent).toBe('+1');
    expect(screen.getByLabelText('1 removed').textContent).toBe('−1');
    expect(screen.getByText('export const App = () => <div />;')).toBeTruthy();
    expect(screen.getByText('export const App = () => null;')).toBeTruthy();
  });

  it('shows a streaming indicator and hides decision buttons mid-stream', () => {
    setFixture('act-src/Streaming.tsx', { original: 'old\n', isNewFile: false });

    render(<InlineFileActionDiff action={fileBlock('src/Streaming.tsx', 'new\n', true)} />);

    expect(screen.getByText(/Streaming patch/)).toBeTruthy();
    expect(screen.queryByLabelText('Accept file')).toBeNull();
  });

  it('toggles per-hunk inclusion with a checkbox', () => {
    setFixture('act-src/Decide.tsx', { original: 'one\n', isNewFile: false });

    render(<InlineFileActionDiff action={fileBlock('src/Decide.tsx', 'one\ntwo\n')} />);

    const checkbox = screen.getByRole<HTMLInputElement>('checkbox');
    expect(checkbox.checked).toBe(true);

    fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(false);
  });

  it('emits onApply with the accepted content built from selected hunks', () => {
    setFixture('act-src/Apply.tsx', { original: 'old\n', isNewFile: false });

    const onApply = vi.fn<(detail: InlineFileActionDiffApplyDetail) => void>();

    render(<InlineFileActionDiff action={fileBlock('src/Apply.tsx', 'new\n')} onApply={onApply} />);

    fireEvent.click(screen.getByRole('button', { name: 'Accept file' }));

    expect(onApply).toHaveBeenCalledTimes(1);

    const detail = onApply.mock.calls[0][0];
    expect(detail.absolutePath).toBe('/home/project/src/Apply.tsx');
    expect(detail.filePath).toBe('src/Apply.tsx');
    expect(detail.originalContent).toBe('old\n');
    expect(detail.acceptedContent).toBe('new\n');
    expect(detail.acceptedHunkIds).toHaveLength(1);
    expect(detail.rejectedHunkIds).toHaveLength(0);
  });

  it('renders the no-op message when proposed content matches the on-disk file', () => {
    const text = 'identical\nfile\n';
    setFixture('act-src/Same.tsx', { original: text, isNewFile: false });

    render(<InlineFileActionDiff action={fileBlock('src/Same.tsx', text)} />);

    expect(screen.getByText('Content is identical to the file on disk.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Accept file' })).toBeNull();
  });

  it('marks the file as a new file when the workbench has no matching path', () => {
    setFixture('act-src/brand-new.ts', { original: '', isNewFile: true });

    render(<InlineFileActionDiff action={fileBlock('src/brand-new.ts', 'export const created = true;\n')} />);

    const section = screen.getByLabelText('File action diff for src/brand-new.ts');
    expect(within(section).getByText('New file')).toBeTruthy();
    expect(within(section).getByLabelText('1 added').textContent).toBe('+1');
  });

  it('surfaces the AST self-repair banner when selfRepair is passed', () => {
    setFixture('act-src/Repair.tsx', { original: 'old\n', isNewFile: false });

    render(
      <InlineFileActionDiff
        action={fileBlock('src/Repair.tsx', 'new\n')}
        selfRepair={{ attempt: 1, maxAttempts: 2, errorMessage: 'Unexpected token at line 3' }}
      />,
    );

    expect(screen.getByText(/Self-repair attempt 1\/2/)).toBeTruthy();
    expect(screen.getByText('Unexpected token at line 3')).toBeTruthy();

    // Streaming + hunks should be replaced by the self-repair banner.
    expect(screen.queryByText(/Streaming patch/)).toBeNull();
  });
});
