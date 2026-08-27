/**
 * @vitest-environment jsdom
 */

import { readFileSync } from 'node:fs';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import SupportTicketPage, { action, ErrorBoundary, loader, meta } from './support_.$id';
import { formatAbsoluteTime } from '~/lib/format-relative';
import {
  formatSupportTicketDetailCharacterCount,
  formatSupportTicketDetailMessageCount,
  getSupportTicketDetailCopy,
  supportTicketDetailActionError,
  supportTicketDetailAuthorLabel,
  supportTicketDetailCategoryLabel,
  supportTicketDetailEn,
  supportTicketDetailFr,
  supportTicketDetailLoadError,
  supportTicketDetailStatusLabel,
} from '~/lib/i18n/catalogs/support-ticket-detail';

const testState = vi.hoisted(() => ({
  actionData: undefined as unknown,
  apiRequest: vi.fn(),
  firstOrganization: vi.fn(),
  language: 'fr' as 'en' | 'fr',
  loaderData: undefined as unknown,
  navigationState: 'idle' as 'idle' | 'loading' | 'submitting',
  formMethod: undefined as string | undefined,
  revalidate: vi.fn(),
  revalidatorState: 'idle' as 'idle' | 'loading',
  routeError: undefined as unknown,
}));

vi.mock('~/lib/enterprise-api.server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/lib/enterprise-api.server')>();

  return {
    ...actual,
    apiRequest: testState.apiRequest,
    firstOrganization: testState.firstOrganization,
  };
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: testState.language, resolvedLanguage: testState.language },
    t: (key: string) => key,
  }),
}));

vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>();

  return {
    ...actual,
    Form: ({ children, className, method }: { children: React.ReactNode; className?: string; method?: string }) => (
      <form className={className} method={method}>
        {children}
      </form>
    ),
    useActionData: () => testState.actionData,
    useLoaderData: () => testState.loaderData,
    useNavigation: () => ({ state: testState.navigationState, formMethod: testState.formMethod }),
    useRevalidator: () => ({ state: testState.revalidatorState, revalidate: testState.revalidate }),
    useRouteError: () => testState.routeError,
  };
});

vi.mock('~/components/dashboard/SaaSLayout', () => ({
  AppShell: ({ children, description, title }: { children: React.ReactNode; description: string; title: string }) => (
    <main>
      <h1>{title}</h1>
      <p>{description}</p>
      {children}
    </main>
  ),
}));

vi.mock('~/components/ui/RelativeTime', () => ({
  RelativeTime: ({ className, prefix, value }: { className?: string; prefix?: string; value: string }) => (
    <time className={className} dateTime={value}>
      {prefix ? `${prefix} · ` : ''}
      {value}
    </time>
  ),
}));

const readyTicket = {
  language: 'fr',
  loadState: 'ready',
  loadErrorCode: null,
  ticket: {
    id: 'ticket-1',
    subject: 'API timeout on api.customer.example',
    status: 'PENDING',
    category: 'runtime',
    createdAt: '2026-08-04T09:30:00.000Z',
  },
  messages: [
    {
      id: 'message-1',
      authorType: 'USER',
      body: 'Please keep const API_URL unchanged.',
      createdAt: '2026-08-04T09:31:00.000Z',
    },
    {
      id: 'message-2',
      authorType: 'ADMIN',
      body: 'We are reviewing workspace ws_prod_1.',
      createdAt: '2026-08-04T09:45:00.000Z',
    },
  ],
} as const;

beforeEach(() => {
  testState.actionData = undefined;
  testState.apiRequest.mockReset();
  testState.firstOrganization.mockReset();
  testState.language = 'fr';
  testState.loaderData = readyTicket;
  testState.navigationState = 'idle';
  testState.formMethod = undefined;
  testState.revalidate.mockReset();
  testState.revalidatorState = 'idle';
  testState.routeError = undefined;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderRoute() {
  return render(
    <MemoryRouter initialEntries={['/support/ticket-1?lang=fr']}>
      <SupportTicketPage />
    </MemoryRouter>,
  );
}

function loaderArgs(
  url = 'https://e-code.ai/support/ticket-1',
  id: string | undefined = 'ticket-1',
  headers?: HeadersInit,
): Parameters<typeof loader>[0] {
  return {
    context: {},
    params: { id },
    request: new Request(url, { headers }),
  } as Parameters<typeof loader>[0];
}

function actionArgs(
  body: string,
  { id = 'ticket-1', url = 'https://e-code.ai/support/ticket-1?lang=fr' }: { id?: string; url?: string } = {},
): Parameters<typeof action>[0] {
  return {
    context: {},
    params: { id },
    request: new Request(url, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ body }).toString(),
    }),
  } as Parameters<typeof action>[0];
}

describe('support ticket detail catalog', () => {
  it('keeps complete EN/FR parity and English fallback', () => {
    expect(Object.keys(supportTicketDetailFr).sort()).toEqual(Object.keys(supportTicketDetailEn).sort());
    expect(getSupportTicketDetailCopy('de')['supportTicketDetail.reply.submit']).toBe('Send message');
  });

  it('localizes enums, plurals, numbers, validation, and date formatting', () => {
    const frenchMaximum = new Intl.NumberFormat('fr-FR').format(10_000);

    expect(supportTicketDetailStatusLabel('PENDING', 'fr')).toBe('En attente');
    expect(supportTicketDetailStatusLabel('new_status', 'fr')).toBe('État indisponible');
    expect(supportTicketDetailCategoryLabel('runtime', 'fr')).toBe('Environnement d’exécution et espaces de travail');
    expect(supportTicketDetailAuthorLabel('USER', 'fr')).toBe('Vous');
    expect(formatSupportTicketDetailMessageCount(1, 'fr')).toBe('1 message');
    expect(formatSupportTicketDetailMessageCount(12_345, 'fr')).toBe(
      `${new Intl.NumberFormat('fr-FR').format(12_345)} messages`,
    );
    expect(formatSupportTicketDetailCharacterCount(3, 10_000, 'fr')).toBe(`3 / ${frenchMaximum} caractères`);
    expect(supportTicketDetailActionError('messageTooLong', 'fr')).toBe(
      `Limitez votre message à ${frenchMaximum} caractères.`,
    );
    expect(formatAbsoluteTime('2026-07-03T10:00:00.000Z', 'fr')).toMatch(/3 juil\. 2026/);
  });

  it('returns safe load descriptors without any upstream detail', () => {
    const descriptor = supportTicketDetailLoadError('unavailable', 'fr');

    expect(descriptor).toEqual({
      title: 'Impossible de charger la conversation d’assistance',
      description: 'La conversation est temporairement indisponible. Aucun message n’a été modifié.',
      retryable: true,
    });
  });
});

describe('support ticket detail localized UI', () => {
  it('renders complete French chrome while preserving subjects, messages, identifiers, and URLs', () => {
    renderRoute();

    expect(screen.getByRole('heading', { level: 1, name: 'Demande d’assistance' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Retour à l’assistance' }).getAttribute('href')).toBe('/support?lang=fr');
    expect(screen.getByRole('heading', { name: 'API timeout on api.customer.example' })).toBeTruthy();
    expect(screen.getByText('Environnement d’exécution et espaces de travail ·', { exact: false })).toBeTruthy();
    expect(screen.getByText('Ouverte · 2026-08-04T09:30:00.000Z')).toBeTruthy();
    expect(screen.getByText('En attente')).toBeTruthy();
    expect(screen.getByText('2 messages')).toBeTruthy();
    expect(screen.getByRole('article', { name: 'Vous' })).toHaveProperty(
      'textContent',
      expect.stringContaining('Please keep const API_URL unchanged.'),
    );
    expect(screen.getByRole('article', { name: 'Assistance E-Code' })).toHaveProperty(
      'textContent',
      expect.stringContaining('We are reviewing workspace ws_prod_1.'),
    );
    expect(screen.getByLabelText('Votre message').getAttribute('placeholder')).toBe('Ajouter une réponse…');
    expect(document.getElementById('support-ticket-reply-count')?.textContent).toBe(
      `0 / ${new Intl.NumberFormat('fr-FR').format(10_000)} caractères`,
    );

    const submit = screen.getByRole('button', { name: 'Envoyer le message' });
    expect(submit.className).toContain('min-h-[44px]');
    expect(document.body.textContent).not.toMatch(
      /Back to support|Support request|No replies yet|Send message|Your message|Status unavailable/,
    );
  });

  it('updates the entire route chrome on a live FR to EN switch without changing user content', () => {
    const view = renderRoute();
    const textarea = screen.getByLabelText('Votre message');
    fireEvent.change(textarea, { target: { value: 'abc' } });
    expect(document.getElementById('support-ticket-reply-count')?.textContent).toBe(
      `3 / ${new Intl.NumberFormat('fr-FR').format(10_000)} caractères`,
    );

    testState.language = 'en';
    view.rerender(
      <MemoryRouter initialEntries={['/support/ticket-1']}>
        <SupportTicketPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Support request' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Back to support' }).getAttribute('href')).toBe('/support');
    expect(screen.getByText('Runtime and workspaces ·', { exact: false })).toBeTruthy();
    expect(screen.getByText('Pending')).toBeTruthy();
    expect(screen.getByRole('article', { name: 'You' }).textContent).toContain('Please keep const API_URL unchanged.');
    expect(screen.getByRole('button', { name: 'Send message' })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/Retour à l’assistance|Demande d’assistance|En attente/);
  });

  it('renders loading, recoverable error, empty, closed, and submitting states', () => {
    testState.revalidatorState = 'loading';

    const loading = renderRoute();
    expect(screen.getByRole('status', { name: 'Chargement de la conversation d’assistance' })).toBeTruthy();
    loading.unmount();

    testState.revalidatorState = 'idle';
    testState.loaderData = {
      language: 'fr',
      loadState: 'error',
      ticket: null,
      messages: [],
      loadErrorCode: 'unavailable',
    };
    renderRoute();

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('Impossible de charger la conversation d’assistance');
    fireEvent.click(within(alert).getByRole('button', { name: 'Recharger la conversation' }));
    expect(testState.revalidate).toHaveBeenCalledTimes(1);
    cleanup();

    testState.loaderData = {
      ...readyTicket,
      ticket: { ...readyTicket.ticket, status: 'CLOSED' },
      messages: [],
    };
    renderRoute();
    expect(screen.getByRole('heading', { name: 'Aucune réponse pour le moment' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Cette demande est fermée' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Ouvrir une nouvelle demande' }).getAttribute('href')).toBe(
      '/support?lang=fr',
    );
    expect(screen.queryByLabelText('Votre message')).toBeNull();
    cleanup();

    testState.loaderData = readyTicket;
    testState.navigationState = 'submitting';
    testState.formMethod = 'POST';
    renderRoute();

    const submitting = screen.getByRole('button', { name: 'Envoi du message…' }) as HTMLButtonElement;
    expect(submitting.disabled).toBe(true);
    expect(submitting.getAttribute('aria-busy')).toBe('true');
  });

  it('renders localized action errors and masks route-boundary details', () => {
    testState.actionData = { errorCode: 'messageTooLong' };
    renderRoute();
    expect(screen.getByRole('alert').textContent).toContain('Limitez votre message à');
    cleanup();

    testState.routeError = { status: 404, data: { error: 'Raw upstream English and secret=abc' } };
    render(
      <MemoryRouter>
        <ErrorBoundary />
      </MemoryRouter>,
    );
    expect(screen.getByRole('alert').textContent).toContain('Demande d’assistance introuvable');
    expect(document.body.textContent).not.toContain('Raw upstream English and secret=abc');
    expect(screen.queryByRole('button', { name: 'Recharger la conversation' })).toBeNull();
  });
});

describe('support ticket detail loader and action', () => {
  it('detects French, validates the payload, preserves user content, and emits private locale headers', async () => {
    testState.firstOrganization.mockResolvedValue({ id: 'org/one' });
    testState.apiRequest.mockResolvedValue({
      ticket: readyTicket.ticket,
      messages: [readyTicket.messages[0], null, { id: 4, body: 'invalid payload' }],
    });

    const result = (await loader(
      loaderArgs('https://e-code.ai/support/ticket-1', 'ticket-1', {
        'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
      }),
    )) as unknown as {
      data: typeof readyTicket;
      init: { headers: HeadersInit; status?: number };
    };

    const headers = new Headers(result.init.headers);

    expect(testState.apiRequest).toHaveBeenCalledWith(expect.any(Request), '/support/org%2Fone/tickets/ticket-1');
    expect(result.data.language).toBe('fr');
    expect(result.data.ticket.subject).toBe('API timeout on api.customer.example');
    expect(result.data.messages).toEqual([readyTicket.messages[0]]);
    expect(headers.get('Content-Language')).toBe('fr');
    expect(headers.get('Cache-Control')).toBe('private, no-store');
    expect(headers.get('X-Robots-Tag')).toBe('noindex, nofollow, noarchive');
    expect(headers.get('Set-Cookie')).toContain('vibecore-auto-lang=fr');
  });

  it('returns stable load codes instead of upstream English and rethrows re-auth redirects', async () => {
    const rawError = 'Raw API error: database=secret-host';
    testState.firstOrganization.mockResolvedValue({ id: 'org-1' });
    testState.apiRequest.mockRejectedValueOnce(
      new Response(JSON.stringify({ error: rawError }), {
        status: 503,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const failed = (await loader(loaderArgs())) as unknown as {
      data: { loadState: string; loadErrorCode: string; ticket: null; messages: unknown[] };
      init: { status: number };
    };
    expect(failed.init.status).toBe(502);
    expect(failed.data).toEqual({
      language: 'en',
      loadState: 'error',
      ticket: null,
      messages: [],
      loadErrorCode: 'unavailable',
    });
    expect(JSON.stringify(failed.data)).not.toContain(rawError);

    const redirectResponse = new Response(null, { status: 302, headers: { Location: '/login' } });
    testState.firstOrganization.mockRejectedValueOnce(redirectResponse);
    await expect(loader(loaderArgs())).rejects.toBe(redirectResponse);
  });

  it('validates message input before the API and preserves the exact accepted body', async () => {
    testState.firstOrganization.mockResolvedValue({ id: 'org-validation' });

    const missing = (await action(actionArgs('   '))) as unknown as {
      data: { errorCode: string };
      init: { status: number };
    };
    const tooLong = (await action(actionArgs('x'.repeat(10_001)))) as unknown as {
      data: { errorCode: string };
      init: { status: number };
    };

    expect(missing.init.status).toBe(400);
    expect(missing.data.errorCode).toBe('messageRequired');
    expect(tooLong.data.errorCode).toBe('messageTooLong');
    expect(testState.firstOrganization).toHaveBeenCalledTimes(2);
    expect(testState.apiRequest).not.toHaveBeenCalled();

    const exactBody = '  Keep API_URL=https://api.example.test\n  unchanged.  ';
    testState.firstOrganization.mockResolvedValue({ id: 'org/one' });
    testState.apiRequest.mockResolvedValue({ message: { id: 'message-3' } });

    const response = (await action(actionArgs(exactBody, { id: 'ticket/one' }))) as unknown as Response;

    expect(testState.apiRequest).toHaveBeenCalledWith(
      expect.any(Request),
      '/orgs/org%2Fone/support/tickets/ticket%2Fone/messages',
      {
        method: 'POST',
        body: JSON.stringify({ body: exactBody }),
      },
    );
    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('/support/ticket%2Fone?lang=fr');
    expect(response.headers.get('Content-Language')).toBe('fr');
  });

  it('maps action failures to safe codes and forwards a useful Retry-After header', async () => {
    const rawError = 'Raw backend English with bearer token secret';
    testState.firstOrganization.mockResolvedValue({ id: 'org-1' });
    testState.apiRequest.mockRejectedValue(
      new Response(JSON.stringify({ error: rawError }), {
        status: 429,
        headers: { 'content-type': 'application/json', 'Retry-After': '30' },
      }),
    );

    const result = (await action(actionArgs('Please help'))) as unknown as {
      data: { errorCode: string };
      init: { headers: HeadersInit; status: number };
    };

    expect(result.init.status).toBe(429);
    expect(result.data).toEqual({ errorCode: 'rateLimited' });
    expect(JSON.stringify(result.data)).not.toContain(rawError);
    expect(new Headers(result.init.headers).get('Retry-After')).toBe('30');
  });

  it('rethrows action re-auth redirects before accepting message input', async () => {
    const redirectResponse = new Response(null, { status: 302, headers: { Location: '/login' } });
    testState.firstOrganization.mockRejectedValueOnce(redirectResponse);

    await expect(action(actionArgs('Please help'))).rejects.toBe(redirectResponse);
    expect(testState.apiRequest).not.toHaveBeenCalled();
  });
});

describe('support ticket detail SEO and source guards', () => {
  it('emits localized private-page SEO without exposing ticket content', () => {
    const descriptors = meta({
      data: { ...readyTicket, language: 'fr' },
      location: {} as never,
      matches: [{ id: 'root', data: { language: 'fr' } }] as never,
      params: { id: 'ticket-1' },
    });

    expect(descriptors).toContainEqual({ title: 'Demande d’assistance — E-Code' });
    expect(descriptors).toContainEqual(
      expect.objectContaining({ name: 'description', content: expect.stringContaining('conversation privée') }),
    );
    expect(descriptors).toContainEqual({
      name: 'robots',
      content: 'noindex,nofollow,noarchive,nosnippet,noimageindex',
    });
    expect(JSON.stringify(descriptors)).not.toContain(readyTicket.ticket.subject);
  });

  it('has zero targeted hardcoded-copy findings and resilient async/mobile primitives', async () => {
    const file = 'app/routes/support_.$id.tsx';
    const source = readFileSync(file, 'utf8');
    const { scanSource } = await import('../../scripts/i18n/source-scanner.mjs');
    const result = scanSource(source, file);

    expect(result.parseErrors).toEqual([]);
    expect(result.findings).toEqual([]);
    expect(source).toContain('min-h-[44px]');
    expect(source).toContain('[overflow-wrap:anywhere]');
    expect(source).toContain('AsyncPanelSkeleton');
    expect(source).toContain('AsyncPanelError');
    expect(source).toContain('useRevalidator');
    expect(source).toContain('localeResponseHeaders');
    expect(source).toContain('noindex,nofollow,noarchive');
    expect(source).not.toContain('apiErrorMessage');
    expect(source).not.toContain('error.message');
    expect(source).not.toContain('statusDisplayLabel');
  });
});
