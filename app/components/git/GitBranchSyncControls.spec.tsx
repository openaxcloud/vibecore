/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { FormEvent } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GitBranchSyncControls } from './GitBranchSyncControls';

describe('<GitBranchSyncControls />', () => {
  afterEach(() => {
    cleanup();
  });

  it('labels pull and push branch fields with explicit context', () => {
    render(<GitBranchSyncControls branch="main" idPrefix="test-git" onSubmit={vi.fn()} />);

    expect(screen.getByRole('heading', { name: 'Remote Updates' })).toBeTruthy();

    /*
     * Pull and Push must carry explicit, distinct accessible context naming the
     * branch and the direction of the transfer — not just bare "Pull"/"Push".
     */

    const pull = screen.getByRole('button', {
      name: 'Pull remote updates from origin/main into this workspace branch',
    });

    const push = screen.getByRole('button', { name: 'Push local commits to origin/main' });

    expect(pull).toBeTruthy();
    expect(push).toBeTruthy();
    expect(pull.getAttribute('aria-label')).not.toBe(push.getAttribute('aria-label'));
  });

  it('submits the matching Git intent for each action', () => {
    const submittedIntents: Array<FormDataEntryValue | null> = [];

    const onSubmit = vi.fn((event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      submittedIntents.push(new FormData(event.currentTarget).get('intent'));
    });

    render(<GitBranchSyncControls branch="main" idPrefix="test-git" onSubmit={onSubmit} />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Pull remote updates from origin/main into this workspace branch' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Push local commits to origin/main' }));

    expect(onSubmit).toHaveBeenCalledTimes(2);
    expect(submittedIntents).toEqual(['pull', 'push']);
  });

  it('renders the refresh control with a comfortable hit area, not a bare icon glyph', () => {
    const onRefresh = vi.fn();

    render(<GitBranchSyncControls branch="main" idPrefix="test-git" onSubmit={vi.fn()} onRefresh={onRefresh} />);

    const refresh = screen.getByTestId('git-refresh');

    expect(refresh.getAttribute('aria-label')).toBe('Refresh git status');

    /*
     * The clickable element must carry its own sizing/hit-area utilities rather
     * than collapsing to the ~14px icon glyph box; the icon lives in a child span.
     */
    expect(refresh.className).toContain('h-8');
    expect(refresh.className).toContain('w-8');
    expect(refresh.className).not.toContain('i-ph:arrows-clockwise');
    expect(refresh.querySelector('.i-ph\\:arrows-clockwise')).toBeTruthy();

    fireEvent.click(refresh);
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});
