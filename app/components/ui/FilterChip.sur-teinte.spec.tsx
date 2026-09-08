/** @vitest-environment jsdom */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FilterChip } from './FilterChip';

vi.mock('framer-motion', () => ({
  motion: {
    button: ({ children, ...props }: Record<string, unknown> & { children?: unknown }) => (
      <button {...(props as object)}>{children as never}</button>
    ),
    div: ({ children, ...props }: Record<string, unknown> & { children?: unknown }) => (
      <div {...(props as object)}>{children as never}</div>
    ),
  },
}));

describe('FilterChip actif — texte sur une teinte de sa propre couleur', () => {
  afterEach(cleanup);

  /*
   * LE DÉFAUT QUE CE TEST ÉPINGLE.
   *
   * La puce active pose l'accent SUR un fond `color-mix(… 12%)` du même accent.
   * Mesuré au pixel RENDU le 2026-09-08 (iPhone 390, thème clair, /projects) :
   * `rgb(194,65,12)` sur `248,232,225` donne 4,35 — sous les 4,5 de WCAG 1.4.3.
   *
   * La variante `-on-tint` existe pour ce cas précis. Le test tient le COUPLE :
   * un fond teinté impose la variante durcie.
   */
  it('utilise la variante -on-tint pour son texte, pas l’accent nu', () => {
    render(<FilterChip label="All" active onClick={() => {}} />);

    const puce = screen.getByRole('button', { name: /All/ });
    const classes = puce.className;

    expect(classes, 'le texte doit prendre la variante durcie').toContain('text-[var(--vc-ide-accent-action-on-tint)]');
    expect(classes, 'le texte ne doit PAS rester sur l’accent nu').not.toContain('text-[var(--vc-ide-accent-action)]');
  });

  /*
   * LE COUPLAGE, ET NON LA SEULE COULEUR (règle 6).
   *
   * Sans cette assertion, retirer le fond teinté laisserait le test vert alors
   * que la variante `-on-tint` n'aurait plus de raison d'être — et le jour où
   * quelqu'un remet un fond opaque, le durcissement resterait sans qu'on sache
   * pourquoi. Les deux moitiés doivent bouger ensemble.
   */
  it('pose bien un fond teinté à 12 % de l’accent', () => {
    render(<FilterChip label="All" active onClick={() => {}} />);

    const puce = screen.getByRole('button', { name: /All/ });

    expect(puce.getAttribute('style') ?? '').toContain('color-mix');
  });

  /*
   * LA MOITIÉ INVERSE : une puce INACTIVE n'est pas sur une teinte de l'accent,
   * elle ne doit donc pas emprunter la variante durcie — sinon on durcirait
   * partout et le test du haut passerait par accident.
   */
  it('une puce inactive n’emprunte pas la variante durcie', () => {
    render(<FilterChip label="Archived" onClick={() => {}} />);

    const puce = screen.getByRole('button', { name: /Archived/ });

    expect(puce.className).not.toContain('accent-action-on-tint');
    expect(puce.getAttribute('style') ?? '').not.toContain('color-mix');
  });
});
