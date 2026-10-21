/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { ConfirmationDialog } from './Dialog';

afterEach(cleanup);

it('dismisses a confirmation once when Radix already handles Escape', () => {
  const close = vi.fn();
  render(<ConfirmationDialog isOpen onClose={close} onConfirm={vi.fn()} title="Confirm" description="Details" />);
  fireEvent.keyDown(screen.getByRole('button', { name: 'Cancel' }), { key: 'Escape' });
  expect(close).toHaveBeenCalledTimes(1);
});

it('respects Escape consumed by another keyboard handler', () => {
  const close = vi.fn();
  const consume = (event: KeyboardEvent) => event.preventDefault();
  document.addEventListener('keydown', consume, true);

  try {
    render(<ConfirmationDialog isOpen onClose={close} onConfirm={vi.fn()} title="Confirm" description="Details" />);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Cancel' }), { key: 'Escape' });
    expect(close).not.toHaveBeenCalled();
  } finally {
    document.removeEventListener('keydown', consume, true);
  }
});

it('does not dismiss the parent when Escape closes a nested confirmation', () => {
  const closeParent = vi.fn();

  function Nested() {
    const [innerOpen, setInnerOpen] = useState(false);

    return (
      <ConfirmationDialog
        isOpen
        onClose={closeParent}
        onConfirm={vi.fn()}
        title="Parent"
        description={
          <span>
            <button onClick={() => setInnerOpen(true)}>Open child</button>
            <ConfirmationDialog
              isOpen={innerOpen}
              onClose={() => setInnerOpen(false)}
              onConfirm={vi.fn()}
              title="Child"
              description="Child details"
              cancelLabel="Cancel child"
            />
          </span>
        }
      />
    );
  }

  render(<Nested />);
  fireEvent.click(screen.getByRole('button', { name: 'Open child' }));
  fireEvent.keyDown(screen.getByRole('button', { name: 'Cancel child' }), { key: 'Escape' });
  expect(closeParent).not.toHaveBeenCalled();
  expect(screen.queryByRole('dialog', { name: 'Child' })).toBeNull();
  expect(screen.getByRole('dialog', { name: 'Parent' })).toBeTruthy();
});
