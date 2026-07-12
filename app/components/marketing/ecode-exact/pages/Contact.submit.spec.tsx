/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * The Contact page composes the heavy public marketing shell and a set of UI
 * primitives. None of that chrome matters for the submit behaviour under test,
 * so we substitute lightweight passthrough doubles — mirroring the
 * ContactSales.spec.tsx setup. The message form itself is plain HTML in this
 * component, so it renders as-is.
 */
vi.mock('~/components/marketing/ecode-exact/EcodeExactShell', () => ({
  EcodeExactPublicFooter: () => <footer data-testid="footer" />,
  EcodeExactPublicNavbar: () => <nav data-testid="navbar" />,
}));

const toastSpy = vi.fn();

vi.mock('~/components/marketing/ecode-exact/EcodeExactLandingControls', () => ({
  useEcodeToast: () => ({ toast: toastSpy }),
}));

vi.mock('~/components/marketing/ecode-exact/EcodeExactUi', () => {
  const Passthrough = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;

  return {
    Badge: Passthrough,
    Card: Passthrough,
    CardContent: Passthrough,
    CardDescription: Passthrough,
    CardHeader: Passthrough,
    CardTitle: Passthrough,
  };
});

import Contact from './Contact';

const ORIGINAL_FETCH = globalThis.fetch;

afterEach(() => {
  cleanup();
  toastSpy.mockReset();
  globalThis.fetch = ORIGINAL_FETCH;
});

describe('Contact submit', () => {
  let hrefAssigned: string | undefined;

  beforeEach(() => {
    hrefAssigned = undefined;

    /*
     * jsdom's window.location.href is not writable by default; intercept it so
     * we can observe the mailto fallback without navigating.
     */
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        ...window.location,
        pathname: '/contact',
        set href(value: string) {
          hrefAssigned = value;
        },
        get href() {
          return hrefAssigned ?? '';
        },
      },
    });
  });

  const fillAndSubmit = () => {
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Ada Lovelace' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ada@example.com' } });
    fireEvent.change(screen.getByLabelText('Topic'), { target: { value: 'Support' } });
    fireEvent.change(screen.getByLabelText('Message'), {
      target: { value: 'My workspace will not start.' },
    });

    fireEvent.submit(screen.getByTestId('form-contact'));
  };

  it('POSTs the message to the general-contact intake and shows the reference', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, reference: 'CMCX42AB' }),
    });
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    render(<Contact />);
    fillAndSubmit();

    await waitFor(() => {
      expect(screen.getByTestId('contact-success')).toBeDefined();
    });

    // The message went to the real intake route with the routing topic.
    expect(fetchSpy).toHaveBeenCalledWith('/api/contact/general', expect.objectContaining({ method: 'POST' }));

    const sentBody = JSON.parse(String((fetchSpy.mock.calls[0][1] as RequestInit).body));
    expect(sentBody.topic).toBe('Support');
    expect(sentBody.message).toBe('My workspace will not start.');
    expect(sentBody.pagePath).toBe('/contact');

    // The confirmation replaces the form and quotes the server-issued reference.
    expect(screen.queryByTestId('form-contact')).toBeNull();
    expect(screen.getByTestId('contact-reference').textContent).toBe('CMCX42AB');

    // No mailto navigation on success.
    expect(hrefAssigned).toBeUndefined();
  });

  it('falls back to the mailto when the backend is unreachable (message never lost)', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('network down')) as unknown as typeof fetch;

    render(<Contact />);
    fillAndSubmit();

    await waitFor(() => {
      expect(hrefAssigned).toBeDefined();
    });

    expect(hrefAssigned!.startsWith('mailto:hello@e-code.ai?')).toBe(true);

    const decoded = decodeURIComponent(hrefAssigned!);
    expect(decoded).toContain('Topic: Support');
    expect(decoded).toContain('My workspace will not start.');

    expect(toastSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        description: expect.stringContaining('hello@e-code.ai'),
      }),
    );
  });

  it('blocks submit and shows inline errors when required fields are missing', async () => {
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    render(<Contact />);
    fireEvent.submit(screen.getByTestId('form-contact'));

    await waitFor(() => {
      expect(document.getElementById('contact-email-error')?.textContent).toBe('Enter your email.');
    });

    expect(document.getElementById('contact-name-error')?.textContent).toBe('Enter your name.');
    expect(document.getElementById('contact-message-error')?.textContent).toBe('Tell us briefly how we can help.');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(hrefAssigned).toBeUndefined();
  });
});
