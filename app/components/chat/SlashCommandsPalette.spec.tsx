/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SlashCommandsPalette } from './SlashCommandsPalette';

describe('<SlashCommandsPalette />', () => {
  afterEach(() => {
    cleanup();
  });

  it('lists every built-in command for an empty query', () => {
    render(<SlashCommandsPalette query="" onSelect={() => undefined} />);

    const options = screen.getAllByRole('option');
    expect(options.length).toBe(11); // 11 built-ins (clear, discuss, build, plan, help, file, snapshot, preview-error, open, diff, run)
    expect(screen.getByText('/clear')).toBeTruthy();
    expect(screen.getByText('/plan')).toBeTruthy();
  });

  it('filters to the matching command on a query', () => {
    render(<SlashCommandsPalette query="plan" onSelect={() => undefined} />);

    expect(screen.getAllByRole('option').length).toBe(1);
    expect(screen.getByText('/plan')).toBeTruthy();
  });

  it('shows the empty state when nothing matches', () => {
    render(<SlashCommandsPalette query="zzzzzz" onSelect={() => undefined} />);
    expect(screen.getByText('No matching commands')).toBeTruthy();
  });

  it('moves the active index on arrow keys', () => {
    render(<SlashCommandsPalette query="" onSelect={() => undefined} />);

    const listbox = screen.getByRole('listbox');
    const options = screen.getAllByRole('option');
    expect(options[0].getAttribute('aria-selected')).toBe('true');

    fireEvent.keyDown(listbox, { key: 'ArrowDown' });
    expect(options[1].getAttribute('aria-selected')).toBe('true');

    fireEvent.keyDown(listbox, { key: 'ArrowUp' });
    expect(options[0].getAttribute('aria-selected')).toBe('true');
  });

  it('emits the selected command on Enter and click', () => {
    const onSelect = vi.fn();
    render(<SlashCommandsPalette query="" onSelect={onSelect} />);

    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0][0].id).toBe('build');

    onSelect.mockClear();
    fireEvent.click(screen.getAllByRole('option')[2]);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('emits onDismiss on Escape', () => {
    const onDismiss = vi.fn();
    render(<SlashCommandsPalette query="" onSelect={() => undefined} onDismiss={onDismiss} />);

    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Escape' });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
