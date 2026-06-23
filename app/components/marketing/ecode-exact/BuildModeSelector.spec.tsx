/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BuildModeSelector } from './EcodeExactLandingControls';

afterEach(cleanup);

function renderSelector(overrides: Partial<Parameters<typeof BuildModeSelector>[0]> = {}) {
  const onOpenChange = vi.fn();
  const onSelectMode = vi.fn();

  render(<BuildModeSelector open onOpenChange={onOpenChange} onSelectMode={onSelectMode} {...overrides} />);

  return { onOpenChange, onSelectMode };
}

describe('BuildModeSelector dismissal', () => {
  it('dismisses when pressing Escape', () => {
    const { onOpenChange } = renderSelector();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('does not dismiss on unrelated keys', () => {
    const { onOpenChange } = renderSelector();

    fireEvent.keyDown(document, { key: 'a' });

    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('dismisses when clicking the backdrop overlay itself', () => {
    const { onOpenChange } = renderSelector();

    const overlay = screen.getByTestId('build-mode-selector-dialog');
    fireEvent.click(overlay);

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('does not dismiss when clicking inside the dialog panel', () => {
    const { onOpenChange } = renderSelector();

    const option = screen.getByTestId('build-option-design-first');
    fireEvent.click(option);

    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('does not register an Escape listener while closed', () => {
    const { onOpenChange } = renderSelector({ open: false });

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
