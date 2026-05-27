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

    expect(screen.getByRole('heading', { name: 'Sync branches' })).toBeTruthy();
    expect((screen.getByLabelText(/Local branch/i) as HTMLInputElement).value).toBe('main');
    expect((screen.getByLabelText(/Remote branch/i) as HTMLInputElement).value).toBe('main');
    expect(screen.getByText('Pull remote updates into this workspace branch.')).toBeTruthy();
    expect(screen.getByText('Push local commits to this remote branch.')).toBeTruthy();
  });

  it('submits the matching Git intent for each action', () => {
    const submittedIntents: Array<FormDataEntryValue | null> = [];

    const onSubmit = vi.fn((event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      submittedIntents.push(new FormData(event.currentTarget).get('intent'));
    });

    render(<GitBranchSyncControls branch="main" idPrefix="test-git" onSubmit={onSubmit} />);

    fireEvent.click(screen.getByRole('button', { name: 'Pull' }));
    fireEvent.click(screen.getByRole('button', { name: 'Push' }));

    expect(onSubmit).toHaveBeenCalledTimes(2);
    expect(submittedIntents).toEqual(['pull', 'push']);
  });
});
