/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PanelButton, PanelEmptyState, PanelInput, PanelSectionTitle } from './PanelPrimitives';

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

  it('renders THE primary IDE style by default (accent action plein, décision UNIF lot 4)', () => {
    render(<PanelButton>Create</PanelButton>);

    const className = screen.getByRole('button', { name: 'Create' }).className;

    // Style tranché : plein --vc-ide-accent-action + texte blanc (= CTA EmptyState).
    expect(className).toContain('bg-[var(--vc-ide-accent-action)]');
    expect(className).toContain('text-white');

    // L'ancien style teinté n'est plus émis par les primitives de panneau.
    expect(className).not.toContain('button-primary-background');
  });

  it('expose une taille sm (28 px / 12 px) pour toolbars et bannières', () => {
    render(
      <PanelButton type="button" size="sm">
        Retry
      </PanelButton>,
    );

    const className = screen.getByRole('button', { name: 'Retry' }).className;
    expect(className).toContain('h-7');
    expect(className).toContain('text-xs');
  });

  it('expose une variante danger (bordure + texte accent erreur)', () => {
    render(
      <PanelButton type="button" variant="danger" size="sm">
        Delete bucket
      </PanelButton>,
    );

    const className = screen.getByRole('button', { name: 'Delete bucket' }).className;
    expect(className).toContain('border-[var(--vc-ide-accent-error)]/50');
    expect(className).toContain('text-[var(--vc-ide-accent-error)]');
  });

  it('expose une variante menu (item ⋮ pleine largeur, aligné à gauche)', () => {
    render(
      <PanelButton type="button" variant="menu" role="menuitem">
        Refresh now
      </PanelButton>,
    );

    const className = screen.getByRole('menuitem', { name: 'Refresh now' }).className;
    expect(className).toContain('w-full');
    expect(className).toContain('text-left');

    // Un item de menu n'a pas le gabarit CTA (pas de hauteur figée h-9/h-7).
    expect(className).not.toContain('h-9');
    expect(className).not.toContain('h-7');
  });
});

describe('<PanelButton /> — tailles et états partagés (UNIF, lot F)', () => {
  it('rend la taille compacte 28 px pour les actions de panneau (size="sm")', () => {
    render(
      <PanelButton type="button" variant="outline" size="sm">
        Retry
      </PanelButton>,
    );

    const button = screen.getByRole('button', { name: 'Retry' });
    expect(button.className).toContain('h-7');
    expect(button.className).toContain('text-xs');
    expect(button.className).not.toContain('h-9');
  });

  it('garde le CTA md par défaut et applique les états focus/hover partagés', () => {
    render(<PanelButton>Save</PanelButton>);

    const button = screen.getByRole('button', { name: 'Save' });
    expect(button.className).toContain('h-9');
    expect(button.className).toContain('focus-visible:ring-2');
    expect(button.className).toContain('hover:opacity-90');
    expect(button.className).toContain('disabled:opacity-60');
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

  it('expose une taille sm (28 px / 12 px) pour filtres et toolbars', () => {
    render(<PanelInput aria-label="Filter objects" size="sm" />);

    const input = screen.getByLabelText('Filter objects');
    expect(input.className).toContain('h-7');
    expect(input.className).toContain('text-xs');
    expect(input.className).not.toContain('h-9');
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

describe('<PanelSectionTitle />', () => {
  it('rend un titre de section 13 px / 600 (niveau par défaut)', () => {
    render(<PanelSectionTitle className="mb-2">Danger zone</PanelSectionTitle>);

    const heading = screen.getByRole('heading', { level: 3, name: 'Danger zone' });
    expect(heading.className).toContain('text-[13px]');
    expect(heading.className).toContain('font-semibold');
    expect(heading.className).toContain('mb-2');
  });

  it('rend un intertitre de groupe 11 px capitales (level="group")', () => {
    render(<PanelSectionTitle level="group">Buckets</PanelSectionTitle>);

    const heading = screen.getByRole('heading', { level: 4, name: 'Buckets' });
    expect(heading.className).toContain('text-[11px]');
    expect(heading.className).toContain('uppercase');
    expect(heading.className).toContain('tracking-wide');
  });
});
