/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FileMentionsPalette } from './FileMentionsPalette';
import type { FileMentionCandidate } from '~/lib/hooks/useFileMentions';

vi.mock('~/lib/hooks/useFileMentions', () => ({
  useFileMentions: (query: string): FileMentionCandidate[] => {
    const all: FileMentionCandidate[] = [
      { absolutePath: '/home/project/src/App.tsx', displayPath: 'src/App.tsx', basename: 'App.tsx', score: 100 },
      {
        absolutePath: '/home/project/src/components/Header.tsx',
        displayPath: 'src/components/Header.tsx',
        basename: 'Header.tsx',
        score: 80,
      },
      {
        absolutePath: '/home/project/src/lib/utils/format.ts',
        displayPath: 'src/lib/utils/format.ts',
        basename: 'format.ts',
        score: 60,
      },
    ];

    const trimmed = query.trim().toLowerCase();

    if (trimmed === '') {
      return all;
    }

    return all.filter((candidate) => candidate.basename.toLowerCase().includes(trimmed));
  },
}));

describe('<FileMentionsPalette />', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders every candidate from the hook in source order', () => {
    render(<FileMentionsPalette query="" onSelect={() => undefined} />);

    expect(screen.getAllByRole('option')).toHaveLength(3);
    expect(screen.getByText('App.tsx')).toBeTruthy();
    expect(screen.getByText('Header.tsx')).toBeTruthy();
  });

  it('shows the empty state when nothing matches', () => {
    render(<FileMentionsPalette query="zzz" onSelect={() => undefined} />);
    expect(screen.getByText('No matching files')).toBeTruthy();
  });

  it('moves the active index on ArrowDown / ArrowUp', () => {
    render(<FileMentionsPalette query="" onSelect={() => undefined} />);

    const listbox = screen.getByRole('listbox');
    const options = screen.getAllByRole('option');

    expect(options[0].getAttribute('aria-selected')).toBe('true');

    fireEvent.keyDown(listbox, { key: 'ArrowDown' });
    expect(options[1].getAttribute('aria-selected')).toBe('true');

    fireEvent.keyDown(listbox, { key: 'ArrowDown' });
    expect(options[2].getAttribute('aria-selected')).toBe('true');

    // Pressing ArrowDown again clamps at the last item.
    fireEvent.keyDown(listbox, { key: 'ArrowDown' });
    expect(options[2].getAttribute('aria-selected')).toBe('true');

    fireEvent.keyDown(listbox, { key: 'ArrowUp' });
    expect(options[1].getAttribute('aria-selected')).toBe('true');
  });

  it('selects the active candidate on Enter', () => {
    const onSelect = vi.fn();
    render(<FileMentionsPalette query="" onSelect={onSelect} />);

    const listbox = screen.getByRole('listbox');
    fireEvent.keyDown(listbox, { key: 'ArrowDown' });
    fireEvent.keyDown(listbox, { key: 'Enter' });

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0][0].basename).toBe('Header.tsx');
  });

  it('selects on click', () => {
    const onSelect = vi.fn();
    render(<FileMentionsPalette query="" onSelect={onSelect} />);

    fireEvent.click(screen.getAllByRole('option')[2]);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0][0].displayPath).toBe('src/lib/utils/format.ts');
  });

  it('calls onDismiss on Escape', () => {
    const onDismiss = vi.fn();
    render(<FileMentionsPalette query="" onSelect={() => undefined} onDismiss={onDismiss} />);

    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Escape' });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('resets the active index when the query changes', () => {
    const { rerender } = render(<FileMentionsPalette query="" onSelect={() => undefined} />);

    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'ArrowDown' });
    expect(screen.getAllByRole('option')[1].getAttribute('aria-selected')).toBe('true');

    rerender(<FileMentionsPalette query="App" onSelect={() => undefined} />);
    expect(screen.getAllByRole('option')[0].getAttribute('aria-selected')).toBe('true');
  });
});
