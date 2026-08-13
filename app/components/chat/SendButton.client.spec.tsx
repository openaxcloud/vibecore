/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SendButton } from './SendButton.client';

describe('<SendButton />', () => {
  afterEach(() => {
    cleanup();
  });

  it('anchors to the composer input lower-right corner', () => {
    render(<SendButton show isStreaming={false} onClick={vi.fn()} />);

    const button = screen.getByRole('button', { name: 'Send message' });
    const className = button.getAttribute('class') ?? '';

    expect(className).toContain('bolt-composer-send-button');
    expect(className).toContain('bottom-2');
    expect(className).toContain('right-2');
    expect(className).not.toContain('top-');
    expect(className).not.toContain('left-');
    expect(button.style.position).toBe('absolute');
    expect(button.style.right).toBe('8px');
    expect(button.style.bottom).toBe('8px');
  });

  it('can render as a toolbar control without absolute positioning', () => {
    render(<SendButton show isStreaming={false} variant="toolbar" onClick={vi.fn()} />);

    const button = screen.getByRole('button', { name: 'Send message' });
    const className = button.getAttribute('class') ?? '';

    expect(className).toContain('bolt-composer-send-button-toolbar');
    expect(className).not.toContain('bottom-2');
    expect(className).not.toContain('right-2');
    expect(button.style.position).toBe('relative');
    expect(button.style.right).toBe('');
    expect(button.style.bottom).toBe('');
  });

  it('keeps the click handler disabled when the provider state disables send', () => {
    const onClick = vi.fn();

    render(<SendButton show isStreaming={false} disabled onClick={onClick} />);

    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

    expect(onClick).not.toHaveBeenCalled();
  });
});
