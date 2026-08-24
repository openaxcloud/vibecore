/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PanelButton, PanelEmptyState, PanelInput } from './PanelPrimitives';

afterEach(cleanup);

describe('<PanelButton />', () => {
  it('keeps the historical default type="submit" when no type is given', () => {
    render(<PanelButton>Save</PanelButton>);
    expect(screen.getByRole('button', { name: 'Save' })).toHaveProperty('type', 'submit');
  });

  it('respects an explicit type="button" (was silently overridden before the extraction)', () => {
    /*
     * Régression du panneau Secrets : « Import .env » (type="button") vit dans
     * le <form> de création de secret ; l'ancien PanelButton forçait
     * type="submit" APRÈS le spread des props, donc le clic soumettait aussi
     * le form et déclenchait la validation HTML des champs requis.
     */
    const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault());
    const onClick = vi.fn();

    render(
      <form onSubmit={onSubmit}>
        <input name="key" required />
        <PanelButton type="button" variant="outline" onClick={onClick}>
          Import .env
        </PanelButton>
      </form>,
    );

    const button = screen.getByRole('button', { name: 'Import .env' });
    expect(button).toHaveProperty('type', 'button');

    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('renders the outline variant and merges custom class names', () => {
    render(
      <PanelButton type="button" variant="outline" className="custom-marker">
        Cancel
      </PanelButton>,
    );

    const button = screen.getByRole('button', { name: 'Cancel' });
    expect(button.className).toContain('border-bolt-elements-borderColor');
    expect(button.className).toContain('custom-marker');
    expect(button.className).not.toContain('button-primary-background');
  });

  it('renders the primary variant by default', () => {
    render(<PanelButton>Create</PanelButton>);
    expect(screen.getByRole('button', { name: 'Create' }).className).toContain(
      'bg-bolt-elements-button-primary-background',
    );
  });
});

describe('<PanelInput />', () => {
  it('keeps the shared field chrome and merges custom class names', () => {
    render(<PanelInput aria-label="Secret key" className="custom-marker" />);

    const input = screen.getByLabelText('Secret key');
    expect(input.className).toContain('h-9');
    expect(input.className).toContain('border-bolt-elements-borderColor');
    expect(input.className).toContain('custom-marker');
  });
});

describe('<PanelEmptyState />', () => {
  it('renders title and description through the canonical EmptyState card', () => {
    render(<PanelEmptyState title="No checkpoints yet" description="Create a checkpoint before major edits." />);

    expect(screen.getByRole('heading', { name: 'No checkpoints yet' })).toBeTruthy();
    expect(screen.getByText('Create a checkpoint before major edits.')).toBeTruthy();
  });

  it('exposes an optional action button', () => {
    const onAction = vi.fn();
    render(<PanelEmptyState title="No custom domains yet" actionLabel="Add domain" onAction={onAction} />);

    fireEvent.click(screen.getByRole('button', { name: 'Add domain' }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });
});
