/**
 * @vitest-environment jsdom
 */

import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Security from './Security';

/*
 * The Security page composes the heavy public marketing shell. None of that
 * chrome matters for the Trust Center CTA behaviour under test, so we substitute
 * lightweight passthrough doubles. The real EcodeExactUi `Link` is kept so the
 * CTA renders the same anchor/Remix navigation it does in production.
 */
vi.mock('~/components/marketing/ecode-exact/EcodeExactShell', () => ({
  EcodeExactPublicFooter: () => <footer data-testid="footer" />,
  EcodeExactPublicNavbar: () => <nav data-testid="navbar" />,
}));

function renderSecurity() {
  return render(
    <MemoryRouter initialEntries={['/security']}>
      <Security />
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
});

describe('Security page — Trust Center CTA', () => {
  it('renders the CTA as a real link, not a self-reloading button', () => {
    renderSecurity();

    const cta = screen.getByTestId('button-security-trust-center');

    /*
     * Must be an anchor (client-side navigation), never a <button> that
     * self-reloads the current page via window.location.
     */
    expect(cta.tagName).toBe('A');
  });

  it('points the CTA at a real destination distinct from the current /security page', () => {
    renderSecurity();

    const cta = screen.getByTestId('button-security-trust-center') as HTMLAnchorElement;
    const href = cta.getAttribute('href');

    expect(href).toBeTruthy();

    // The page itself is mounted at /security; the CTA must not point back at it.
    expect(href).not.toBe('/security');
    expect(href).toBe('/contact');
  });
});
