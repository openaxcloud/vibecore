/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * The Report Abuse page composes the heavy public marketing shell and a set of
 * UI primitives. None of that chrome matters for the submit-fallback behaviour
 * under test, so we substitute lightweight passthrough doubles that still expose
 * the form controls (and their `name`s) the handler reads.
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
    Button: ({ children, asChild: _asChild, ...props }: any) => <button {...props}>{children}</button>,
    Card: Passthrough,
    CardContent: Passthrough,
    CardDescription: Passthrough,
    CardHeader: Passthrough,
    CardTitle: Passthrough,
    Input: (props: any) => <input {...props} />,
    Label: ({ children, ...props }: any) => <label {...props}>{children}</label>,
    Textarea: (props: any) => <textarea {...props} />,
    RadioGroup: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    RadioGroupItem: (props: any) => <input type="radio" {...props} />,
    Checkbox: (props: any) => <input type="checkbox" {...props} />,
  };
});

import ReportAbuse, { buildAbuseMailto } from './ReportAbuse';

const ORIGINAL_FETCH = globalThis.fetch;

afterEach(() => {
  cleanup();
  toastSpy.mockReset();
  globalThis.fetch = ORIGINAL_FETCH;
});

describe('buildAbuseMailto', () => {
  it('builds a mailto to abuse@e-code.ai carrying the full report', () => {
    const mailto = buildAbuseMailto({
      reportType: 'spam',
      targetUrl: 'https://e-code.ai/@evil',
      description: 'They posted scam links everywhere.',
      reporterEmail: 'me@example.com',
      username: '@evil',
      pagePath: '/report-abuse',
    });

    expect(mailto.startsWith('mailto:abuse@e-code.ai?')).toBe(true);

    const decoded = decodeURIComponent(mailto);
    expect(decoded).toContain('subject=E-Code abuse report: spam');
    expect(decoded).toContain('Report type: spam');
    expect(decoded).toContain('Target URL: https://e-code.ai/@evil');
    expect(decoded).toContain('Username: @evil');
    expect(decoded).toContain('Reporter email: me@example.com');
    expect(decoded).toContain('They posted scam links everywhere.');
  });

  it('omits optional fields that are absent', () => {
    const decoded = decodeURIComponent(
      buildAbuseMailto({
        reportType: 'code',
        targetUrl: 'https://e-code.ai/x',
        description: 'desc',
        pagePath: '/report-abuse',
      }),
    );

    expect(decoded).not.toContain('Username:');
    expect(decoded).not.toContain('Reporter email:');
  });
});

describe('ReportAbuse submit fallback', () => {
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
        pathname: '/report-abuse',
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
    fireEvent.change(screen.getByTestId('input-abuse-url'), {
      target: { value: 'https://e-code.ai/@evil' },
    });
    fireEvent.change(screen.getByTestId('input-abuse-description'), {
      target: {
        value: 'Evidence: https://a.com https://b.com https://c.com https://d.com https://e.com — clearly malicious.',
      },
    });

    // Submit via the form's submit event (the button is type=submit inside it).
    const form = screen.getByTestId('input-abuse-url').closest('form');
    expect(form).toBeTruthy();
    fireEvent.submit(form!);
  };

  it('falls back to a client-side mailto when the server rejects without a fallbackMailto', async () => {
    /*
     * Mirrors the route returning 400 for a spam-flagged report (5+ URLs) with
     * NO fallbackMailto in the body — the exact case that previously lost the
     * user's report behind a generic error toast.
     */
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({
        error: 'Your report was flagged as potential spam. Please contact abuse@e-code.ai if this is an error.',
      }),
    }) as unknown as typeof fetch;

    render(<ReportAbuse />);
    fillAndSubmit();

    await waitFor(() => {
      expect(hrefAssigned).toBeDefined();
    });

    expect(hrefAssigned!.startsWith('mailto:abuse@e-code.ai?')).toBe(true);

    const decoded = decodeURIComponent(hrefAssigned!);
    expect(decoded).toContain('Target URL: https://e-code.ai/@evil');
    expect(decoded).toContain('clearly malicious');

    // And the user is told their report was prepared for email, not just "Error".
    expect(toastSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        description: expect.stringContaining('abuse@e-code.ai'),
      }),
    );
  });

  it('falls back to a client-side mailto when the network request throws', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('network down')) as unknown as typeof fetch;

    render(<ReportAbuse />);
    fillAndSubmit();

    await waitFor(() => {
      expect(hrefAssigned).toBeDefined();
    });

    expect(hrefAssigned!.startsWith('mailto:abuse@e-code.ai?')).toBe(true);
  });

  it('uses the server fallbackMailto verbatim when one is provided', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ fallbackMailto: 'mailto:abuse@e-code.ai?subject=server-built' }),
    }) as unknown as typeof fetch;

    render(<ReportAbuse />);
    fillAndSubmit();

    await waitFor(() => {
      expect(hrefAssigned).toBe('mailto:abuse@e-code.ai?subject=server-built');
    });
  });
});
