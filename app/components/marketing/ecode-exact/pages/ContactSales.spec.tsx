/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * The Contact Sales page composes the heavy public marketing shell and a set of
 * UI primitives. None of that chrome matters for the submit-fallback behaviour
 * under test, so we substitute lightweight passthrough doubles. The lead form
 * itself is plain HTML in this component, so it renders as-is.
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

import ContactSales, { buildContactSalesMailto } from './ContactSales';

const ORIGINAL_FETCH = globalThis.fetch;

afterEach(() => {
  cleanup();
  toastSpy.mockReset();
  globalThis.fetch = ORIGINAL_FETCH;
});

describe('buildContactSalesMailto', () => {
  it('builds a mailto to sales@e-code.ai carrying the full lead', () => {
    const mailto = buildContactSalesMailto({
      name: 'Ada Lovelace',
      email: 'ada@acme.com',
      company: 'Acme Inc.',
      teamSize: '51–200',
      message: 'We need SSO and single-tenant for 120 engineers.',
      pagePath: '/contact-sales',
    });

    expect(mailto.startsWith('mailto:sales@e-code.ai?')).toBe(true);

    const decoded = decodeURIComponent(mailto);
    expect(decoded).toContain('subject=E-Code Enterprise inquiry — Acme Inc.');
    expect(decoded).toContain('Name: Ada Lovelace');
    expect(decoded).toContain('Work email: ada@acme.com');
    expect(decoded).toContain('Company: Acme Inc.');
    expect(decoded).toContain('Team size: 51–200');
    expect(decoded).toContain('We need SSO and single-tenant for 120 engineers.');
  });

  it('omits optional fields that are absent', () => {
    const decoded = decodeURIComponent(
      buildContactSalesMailto({
        name: '',
        email: '',
        company: '',
        teamSize: '',
        message: 'Just a message.',
        pagePath: '/contact-sales',
      }),
    );

    expect(decoded).not.toContain('Name:');
    expect(decoded).not.toContain('Company:');
    expect(decoded).not.toContain('Team size:');
    expect(decoded).toContain('Just a message.');
  });
});

describe('ContactSales submit', () => {
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
        pathname: '/contact-sales',
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
    fireEvent.change(screen.getByLabelText('Work email'), { target: { value: 'ada@acme.com' } });
    fireEvent.change(screen.getByLabelText('Company'), { target: { value: 'Acme Inc.' } });
    fireEvent.change(screen.getByLabelText('How can we help?'), {
      target: { value: 'We need SSO and single-tenant for 120 engineers.' },
    });

    const form = screen.getByTestId('form-contact-sales');
    fireEvent.submit(form);
  };

  it('does not perform a native GET navigation (the original silent-discard bug)', async () => {
    /*
     * A throwing fetch stands in for the absent backend; the handler must still
     * preventDefault and route the lead to the mailto fallback, never lose it.
     */
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('network down')) as unknown as typeof fetch;

    render(<ContactSales />);
    fillAndSubmit();

    await waitFor(() => {
      expect(hrefAssigned).toBeDefined();
    });

    expect(hrefAssigned!.startsWith('mailto:sales@e-code.ai?')).toBe(true);

    const decoded = decodeURIComponent(hrefAssigned!);
    expect(decoded).toContain('Company: Acme Inc.');
    expect(decoded).toContain('We need SSO and single-tenant for 120 engineers.');

    expect(toastSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        description: expect.stringContaining('sales@e-code.ai'),
      }),
    );
  });

  it('falls back to a client-side mailto when the server rejects without a fallbackMailto', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Contact-sales intake is not configured.' }),
    }) as unknown as typeof fetch;

    render(<ContactSales />);
    fillAndSubmit();

    await waitFor(() => {
      expect(hrefAssigned).toBeDefined();
    });

    expect(hrefAssigned!.startsWith('mailto:sales@e-code.ai?')).toBe(true);
    expect(toastSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        description: expect.stringContaining('sales@e-code.ai'),
      }),
    );
  });

  it('uses the server fallbackMailto verbatim when one is provided', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ fallbackMailto: 'mailto:sales@e-code.ai?subject=server-built' }),
    }) as unknown as typeof fetch;

    render(<ContactSales />);
    fillAndSubmit();

    await waitFor(() => {
      expect(hrefAssigned).toBe('mailto:sales@e-code.ai?subject=server-built');
    });
  });

  it('replaces the form with a confirmation carrying the API-allocated reference number', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, reference: 'CMCX42AB' }),
    }) as unknown as typeof fetch;

    render(<ContactSales />);
    fillAndSubmit();

    await waitFor(() => {
      expect(screen.getByTestId('contact-sales-success')).toBeDefined();
    });

    // The confirmation replaces the form and quotes the server-issued reference.
    expect(screen.queryByTestId('form-contact-sales')).toBeNull();
    expect(screen.getByTestId('contact-sales-reference').textContent).toBe('CMCX42AB');
    expect(screen.getByTestId('contact-sales-success').textContent).toContain('1 business day');

    // No mailto navigation on success.
    expect(hrefAssigned).toBeUndefined();
  });

  it('blocks submit and shows inline errors when required fields are missing', async () => {
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    render(<ContactSales />);
    fireEvent.submit(screen.getByTestId('form-contact-sales'));

    await waitFor(() => {
      expect(document.getElementById('contact-email-error')?.textContent).toBe('Enter your work email.');
    });

    expect(document.getElementById('contact-name-error')?.textContent).toBe('Enter your name.');
    expect(document.getElementById('contact-company-error')?.textContent).toBe('Enter your company name.');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(hrefAssigned).toBeUndefined();
  });

  it('validates the email format on blur', async () => {
    render(<ContactSales />);

    const email = screen.getByLabelText('Work email');
    fireEvent.change(email, { target: { value: 'not-an-email' } });
    fireEvent.blur(email);

    await waitFor(() => {
      expect(screen.getByText('Enter a valid email address.')).toBeDefined();
    });

    // Correcting the address and blurring again clears the error.
    fireEvent.change(email, { target: { value: 'ada@acme.com' } });
    fireEvent.blur(email);

    await waitFor(() => {
      expect(screen.queryByText('Enter a valid email address.')).toBeNull();
    });
  });
});
