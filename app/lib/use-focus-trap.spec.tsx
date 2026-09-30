/**
 * @vitest-environment jsdom
 */
import { act, render } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { useFocusTrap } from './use-focus-trap';

/*
 * BUG-QA0928-MODALE-SANS-FOCUS — sur WebKit, Tab ne passe pas par les boutons :
 * le piège, qui n'agissait qu'aux bords (dernier → premier), laissait le
 * navigateur emmener le focus HORS de la modale dès la première tabulation
 * (mesuré le 2026-09-30, `modale-accueil-prend-le-focus.spec.ts`, projet
 * webkit-iphone).
 *
 * jsdom ne déplace jamais le focus sur Tab : ce que ce test voit bouger, c'est
 * le piège, et lui seul — exactement la garantie qui doit tenir sur tout moteur.
 */

function Modale() {
  const ref = useFocusTrap<HTMLDivElement>(true);

  return (
    <div ref={ref} role="dialog">
      <button type="button">Fermer</button>
      <button type="button">Design</button>
      <button type="button">Application complète</button>
    </div>
  );
}

const tab = (shiftKey = false) =>
  act(() => {
    document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true }));
  });

describe('useFocusTrap', () => {
  /*
   * jsdom n'a pas de mise en page : `offsetParent` y vaut toujours `null`, et le
   * filtre de visibilité du piège ne verrait plus rien. On donne à chaque élément
   * un `offsetParent` (son parent), comme dans un vrai rendu où il est visible.
   */
  const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetParent');

  beforeAll(() => {
    Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
      configurable: true,
      get(this: HTMLElement) {
        return this.parentElement;
      },
    });
  });

  afterAll(() => {
    if (original) {
      Object.defineProperty(HTMLElement.prototype, 'offsetParent', original);
    }
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('entre dans la modale à l’ouverture', () => {
    const { getByText } = render(<Modale />);

    expect(document.activeElement).toBe(getByText('Fermer'));
  });

  it('Tab passe à l’élément suivant DANS la modale, sans compter sur le navigateur', () => {
    const { getByText } = render(<Modale />);

    tab();
    expect(document.activeElement).toBe(getByText('Design'));

    tab();
    expect(document.activeElement).toBe(getByText('Application complète'));
  });

  it('boucle aux deux bords, dans les deux sens', () => {
    const { getByText } = render(<Modale />);

    tab(true);
    expect(document.activeElement).toBe(getByText('Application complète'));

    tab();
    expect(document.activeElement).toBe(getByText('Fermer'));
  });
});
