/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DiffActionRow } from './DiffActionRow';
import type { DiffApplyMeta } from '~/types/actions';

afterEach(() => cleanup());

describe('DiffActionRow — chat-UI render surface for a diff action', () => {
  it('labels the edit as a targeted patch and opens the file on click', () => {
    const onOpenFile = vi.fn();
    render(<DiffActionRow filePath="src/BigComponent.tsx" onOpenFile={onOpenFile} />);

    expect(screen.getByText('Edit')).toBeTruthy();
    expect(screen.getByText('(targeted patch)')).toBeTruthy();

    const code = screen.getByText('src/BigComponent.tsx');
    expect(code).toBeTruthy();

    fireEvent.click(code);
    expect(onOpenFile).toHaveBeenCalledWith('src/BigComponent.tsx');
  });

  it('shows a +N/−M hunk pill on a successful apply', () => {
    const diffApply: DiffApplyMeta = {
      status: 'applied',
      blockCount: 2,
      addedLines: 5,
      removedLines: 3,
      hunkCount: 2,
    };

    const { container } = render(<DiffActionRow filePath="src/big.ts" diffApply={diffApply} />);

    expect(screen.getByText('+5')).toBeTruthy();
    expect(screen.getByText('−3')).toBeTruthy();

    // Reuses the shared file-proposal diff pill classes (no parallel viewer).
    expect(container.querySelector('.bolt-file-action-diff-added')).toBeTruthy();
    expect(container.querySelector('.bolt-file-action-diff-removed')).toBeTruthy();

    // No failure marker on success.
    expect(screen.queryByText('Could not apply')).toBeNull();
  });

  it('shows a "Could not apply" marker on a fail-safe fallback (never silent)', () => {
    const diffApply: DiffApplyMeta = {
      status: 'failed',
      blockCount: 0,
      addedLines: 0,
      removedLines: 0,
      hunkCount: 0,
      failureKind: 'apply-failed',
    };

    render(<DiffActionRow filePath="src/answer.ts" diffApply={diffApply} />);

    expect(screen.getByText('Could not apply')).toBeTruthy();

    // The path is still visible — the action is never silently absent.
    expect(screen.getByText('src/answer.ts')).toBeTruthy();

    // No +N/−M pill when nothing applied.
    expect(screen.queryByText(/^\+/)).toBeNull();
  });

  it('renders the label with no pill while streaming (diffApply undefined)', () => {
    render(<DiffActionRow filePath="src/x.ts" />);

    expect(screen.getByText('Edit')).toBeTruthy();
    expect(screen.getByText('src/x.ts')).toBeTruthy();
    expect(screen.queryByText('Could not apply')).toBeNull();
  });
});
