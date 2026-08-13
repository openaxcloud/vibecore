/**
 * @vitest-environment jsdom
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/*
 * The Accessibility page composes the heavy public marketing shell (navbar/footer)
 * and a set of UI primitives. None of that is relevant to the contact-address
 * behaviour under test, so we substitute lightweight passthrough doubles.
 */
vi.mock('~/components/marketing/ecode-exact/EcodeExactShell', () => ({
  EcodeExactPublicFooter: () => <footer data-testid="footer" />,
  EcodeExactPublicNavbar: () => <nav data-testid="navbar" />,
}));

vi.mock('~/components/marketing/ecode-exact/EcodeExactUi', () => ({
  Badge: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
  Button: ({ children, ...props }: { children?: React.ReactNode } & Record<string, unknown>) => (
    <button {...props}>{children}</button>
  ),
  Card: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  CardContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  CardDescription: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  CardHeader: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  useMarketingNavigate: () => () => {},
}));

import Accessibility from './Accessibility';

afterEach(() => {
  cleanup();
});

describe('Accessibility page – report-an-issue contact', () => {
  it('links the accessibility report to the public E-Code address', () => {
    render(<Accessibility />);

    const link = screen.getByTestId('link-accessibility-report');

    expect(link.getAttribute('href')).toBe('mailto:accessibility@e-code.ai');
    expect(link.textContent).toBe('accessibility@e-code.ai');
  });

  it('does not leak the internal vibecore.dev codename anywhere on the page', () => {
    const { container } = render(<Accessibility />);

    expect(container.innerHTML).not.toContain('vibecore.dev');
  });
});
