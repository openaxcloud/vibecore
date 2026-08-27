/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InspectorPanel } from './InspectorPanel';
import { createI18nInstance } from '~/lib/i18n/runtime';

const selectedElement = {
  tagName: 'BUTTON',
  className: 'checkout-button primary',
  id: 'pay-now',
  textContent: 'User-authored checkout label',
  styles: { display: 'flex', color: 'rgb(1, 2, 3)' },
  rect: { x: 10, y: 20, width: 321.4, height: 48, top: 20, left: 10 },
};

function renderInspector(language: 'en' | 'fr' = 'fr', onClose = vi.fn()) {
  return render(
    <I18nextProvider i18n={createI18nInstance(language)}>
      <InspectorPanel selectedElement={selectedElement} isVisible onClose={onClose} />
    </I18nextProvider>,
  );
}

describe('InspectorPanel i18n', () => {
  afterEach(cleanup);

  it('renders French navigation while preserving DOM identifiers, CSS, and selected text', () => {
    renderInspector();

    expect(screen.getByRole('complementary', { name: 'Inspecteur d’élément' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Calculés' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Modèle de boîte' })).toBeTruthy();
    expect(document.body.textContent).toContain('button');
    expect(document.body.textContent).toContain('#pay-now');
    expect(document.body.textContent).toContain('.checkout-button');
    expect(document.body.textContent).toContain('User-authored checkout label');
    expect(document.body.textContent).toContain('display:');
    expect(document.body.textContent).not.toContain('Element inspector');
  });

  it('formats dimensions for French and exposes the localized close action', () => {
    const onClose = vi.fn();
    renderInspector('fr', onClose);

    fireEvent.click(screen.getByRole('tab', { name: 'Modèle de boîte' }));

    expect(screen.getByText('Largeur:')).toBeTruthy();
    expect(screen.getByText((_, element) => element?.textContent === '321 px')).toBeTruthy();
    expect(screen.getByText('Hauteur:')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Fermer l’inspecteur' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('keeps English as the fallback copy', () => {
    renderInspector('en');

    expect(screen.getByRole('complementary', { name: 'Element inspector' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Computed' })).toBeTruthy();
  });
});
