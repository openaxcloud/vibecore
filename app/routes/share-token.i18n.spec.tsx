/** @vitest-environment jsdom */

import { readFileSync } from 'node:fs';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ShareRoute, {
  handle,
  HydrateFallback,
  loader,
  meta,
  parsePublicShareResponse,
  type ShareRouteLoaderData,
} from './share.$token';
import {
  formatShareRouteCopy,
  formatShareRouteDate,
  formatShareRouteMessageCount,
  formatShareRouteNumber,
  getShareRouteCopy,
  shareRouteEn,
  shareRouteFr,
} from '~/lib/i18n/catalogs/share-route';

const harness = vi.hoisted(() => ({
  language: 'fr',
  loaderData: {} as unknown,
  routeError: undefined as unknown,
  revalidator: {
    state: 'idle',
    revalidate: vi.fn(),
  },
  fetch: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: harness.language, resolvedLanguage: harness.language },
  }),
}));

vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>();

  return {
    ...actual,
    useLoaderData: () => harness.loaderData,
    useRevalidator: () => harness.revalidator,
    useRouteError: () => harness.routeError,
  };
});

vi.mock('~/components/dashboard/SaaSLayout', () => ({
  PublicShell: ({ children }: { children: ReactNode }) => <div data-testid="public-shell">{children}</div>,
}));

vi.mock('~/lib/enterprise-api.server', () => ({
  apiBaseUrl: () => 'https://api.e-code.test',
}));

const frenchPayload: NonNullable<ShareRouteLoaderData['payload']> = {
  title: 'Titre rédigé par l’utilisateur',
  projectId: 'project_ID-kept-verbatim',
  createdAt: '2026-08-05T14:30:00.000Z',
  visibleMessageIds: ['message-id-1', 'message-id-2'],
  inlineMessages: [
    { id: 'message-id-1', role: 'user', content: 'const greeting = "Hello";\nAPI_URL=/v1/messages' },
    { id: 'message-id-2', role: 'assistant', content: 'Contenu rédigé par l’utilisateur' },
  ],
  allowFork: true,
};

type LoaderResult = {
  data: ShareRouteLoaderData;
  init?: ResponseInit;
};

async function runLoader({
  token = 'opaque-token',
  url = 'https://e-code.ai/share/opaque-token',
  headers,
}: {
  token?: string;
  url?: string;
  headers?: HeadersInit;
} = {}): Promise<LoaderResult> {
  return (await loader({
    request: new Request(url, { headers }),
    params: { token },
    context: {},
  } as Parameters<typeof loader>[0])) as LoaderResult;
}

function renderRoute() {
  return render(
    <MemoryRouter initialEntries={['/share/opaque-token']}>
      <ShareRoute />
    </MemoryRouter>,
  );
}

describe('public conversation share i18n', () => {
  beforeEach(() => {
    harness.language = 'fr';
    harness.loaderData = { language: 'fr', payload: frenchPayload } satisfies ShareRouteLoaderData;
    harness.routeError = undefined;
    harness.revalidator.state = 'idle';
    harness.revalidator.revalidate.mockReset();
    harness.fetch.mockReset();
    vi.stubGlobal('fetch', harness.fetch);
    document.title = '';
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('keeps flat EN/FR parity, English fallback, interpolation, plurals, numbers, and UTC dates', () => {
    expect(Object.keys(shareRouteFr).sort()).toEqual(Object.keys(shareRouteEn).sort());
    expect(getShareRouteCopy('fr-CA')['shareRoute.page.fallbackTitle']).toBe('Conversation partagée');
    expect(getShareRouteCopy('de-DE')['shareRoute.page.fallbackTitle']).toBe('Shared conversation');
    expect(
      formatShareRouteCopy(shareRouteFr['shareRoute.seo.titled'], {
        title: 'Titre utilisateur',
      }),
    ).toBe('Titre utilisateur · Partage E-Code');
    expect(formatShareRouteMessageCount(1, 'fr')).toContain('1 message.');
    expect(formatShareRouteMessageCount(2, 'fr')).toContain('2 messages.');
    expect(formatShareRouteMessageCount(2, 'en')).toContain('2 messages.');
    expect(formatShareRouteNumber(12_345, 'fr')).toBe(new Intl.NumberFormat('fr-FR').format(12_345));
    expect(formatShareRouteDate('2026-08-05T14:30:00.000Z', 'fr')).toBe(
      new Intl.DateTimeFormat('fr-FR', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'UTC',
      }).format(new Date('2026-08-05T14:30:00.000Z')),
    );
    expect(formatShareRouteDate('invalid-date', 'fr')).toBeNull();
  });

  it('normalizes the reduced API projection and never restores stripped private identifiers', () => {
    const parsed = parsePublicShareResponse({
      share: {
        title: 'Public title',
        projectId: 'outer-project-id',
        createdAt: '2026-08-05T14:30:00.000Z',
        allowFork: true,
        payload: {
          authorUserId: 'private-author-id',
          conversationId: 'private-conversation-id',
          projectId: 'private-payload-project-id',
          visibleMessageIds: ['message-1'],
          inlineMessages: [{ id: 'message-1', role: 'system', content: 'USER_OWNED_CONTENT' }],
        },
      },
    });

    expect(parsed).toEqual({
      title: 'Public title',
      projectId: 'outer-project-id',
      createdAt: '2026-08-05T14:30:00.000Z',
      allowFork: true,
      visibleMessageIds: ['message-1'],
      inlineMessages: [{ id: 'message-1', role: 'system', content: 'USER_OWNED_CONTENT' }],
    });
    expect(parsed).not.toHaveProperty('authorUserId');
    expect(parsed).not.toHaveProperty('conversationId');
    expect(
      parsePublicShareResponse({
        share: {
          createdAt: 'not-a-date',
          payload: { visibleMessageIds: [], inlineMessages: [{ role: 'unknown' }] },
        },
      }),
    ).toBeNull();
  });

  it('detects French on the first request, supports an explicit English override, and forwards only the locale', async () => {
    harness.fetch.mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            share: {
              title: 'User title',
              createdAt: '2026-08-05T14:30:00.000Z',
              allowFork: false,
              payload: {
                visibleMessageIds: ['message-1'],
                inlineMessages: [{ id: 'message-1', role: 'assistant', content: 'User content' }],
              },
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      ),
    );

    const french = await runLoader({ headers: { 'Accept-Language': 'fr-FR, en;q=0.8' } });

    expect(french.data.language).toBe('fr');
    expect(french.data.payload).toMatchObject({ title: 'User title', allowFork: false });
    expect(french.data.payload).not.toHaveProperty('projectId');
    expect(harness.fetch).toHaveBeenNthCalledWith(
      1,
      'https://api.e-code.test/chat-shares/opaque-token',
      expect.objectContaining({
        headers: { accept: 'application/json', 'accept-language': 'fr' },
        signal: expect.any(AbortSignal),
      }),
    );

    const english = await runLoader({
      url: 'https://e-code.ai/share/opaque-token?lang=en',
      headers: { 'Accept-Language': 'fr-FR' },
    });

    expect(english.data.language).toBe('en');
    expect(english.data.payload?.title).toBe('User title');
    expect(harness.fetch).toHaveBeenNthCalledWith(
      2,
      'https://api.e-code.test/chat-shares/opaque-token',
      expect.objectContaining({
        headers: { accept: 'application/json', 'accept-language': 'en' },
      }),
    );

    const rememberedEnglish = await runLoader({
      headers: {
        'Accept-Language': 'fr-FR',
        Cookie: 'vibecore-lang=en',
      },
    });

    expect(rememberedEnglish.data.language).toBe('en');
    expect(harness.fetch).toHaveBeenNthCalledWith(
      3,
      'https://api.e-code.test/chat-shares/opaque-token',
      expect.objectContaining({
        headers: { accept: 'application/json', 'accept-language': 'en' },
      }),
    );
  });

  it('maps typed and malformed upstream failures to safe status-only states', async () => {
    const privateDiagnostic = 'Raw upstream English: database host and secret details';
    harness.fetch
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { code: 'CHAT_SHARE_INVALID', message: privateDiagnostic } }), {
          status: 404,
          headers: { 'content-type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { code: 'CHAT_SHARE_NOT_FOUND', message: privateDiagnostic } }), {
          status: 404,
          headers: { 'content-type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { code: 'UPSTREAM_FAILURE', message: privateDiagnostic } }), {
          status: 503,
          headers: { 'content-type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ share: { payload: { rawError: privateDiagnostic } } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );

    const invalid = await runLoader({ headers: { 'Accept-Language': 'fr-FR' } });
    const notFound = await runLoader({ headers: { 'Accept-Language': 'fr-FR' } });
    const unavailable = await runLoader({ headers: { 'Accept-Language': 'fr-FR' } });
    const malformed = await runLoader({ headers: { 'Accept-Language': 'fr-FR' } });

    expect(invalid.init?.status).toBe(404);
    expect(invalid.data).toEqual({ language: 'fr', errorKind: 'invalid' });
    expect(notFound.init?.status).toBe(404);
    expect(notFound.data).toEqual({ language: 'fr', errorKind: 'not-found' });
    expect(unavailable.init?.status).toBe(502);
    expect(unavailable.data).toEqual({ language: 'fr', errorKind: 'unavailable' });
    expect(malformed.init?.status).toBe(502);
    expect(malformed.data).toEqual({ language: 'fr', errorKind: 'unavailable' });
    expect(JSON.stringify([invalid.data, notFound.data, unavailable.data, malformed.data])).not.toContain(
      privateDiagnostic,
    );
  });

  it('renders complete French UI while preserving user content, code, ids, and URLs verbatim', () => {
    renderRoute();

    expect(screen.getByTestId('public-shell')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'Titre rédigé par l’utilisateur' })).toBeTruthy();
    expect(screen.getByText('Partagée depuis le projet')).toBeTruthy();
    expect(screen.getByText('project_ID-kept-verbatim')).toBeTruthy();
    expect(screen.getByText(formatShareRouteDate(frenchPayload.createdAt, 'fr') ?? '')).toBeTruthy();
    expect(screen.getByText(/Le contenu partagé comprend 2 messages\./u)).toBeTruthy();
    expect(screen.getByText('Utilisateur')).toBeTruthy();
    expect(screen.getByText('Assistant')).toBeTruthy();
    expect(
      screen.getByText(
        (_content, element) =>
          element?.tagName === 'PRE' && element.textContent === 'const greeting = "Hello";\nAPI_URL=/v1/messages',
      ),
    ).toBeTruthy();
    expect(screen.getByText('Contenu rédigé par l’utilisateur')).toBeTruthy();
    expect(
      screen
        .getByRole('button', { name: 'Dupliquer cette conversation (connectez-vous pour l’activer)' })
        .hasAttribute('disabled'),
    ).toBe(true);
    expect(document.body.textContent).not.toMatch(/Shared from project|read-only snapshot|Fork this conversation/u);
  });

  it('switches every route-owned label and locale formatter back to English', () => {
    harness.language = 'en';
    harness.loaderData = {
      language: 'en',
      payload: {
        createdAt: frenchPayload.createdAt,
        visibleMessageIds: ['message-id-1'],
        inlineMessages: [{ id: 'message-id-1', role: 'system', content: 'User content stays untouched' }],
        allowFork: false,
      },
    } satisfies ShareRouteLoaderData;

    renderRoute();

    expect(screen.getByRole('heading', { level: 1, name: 'Shared conversation' })).toBeTruthy();
    expect(screen.getByText('Shared on')).toBeTruthy();
    expect(screen.getByText(formatShareRouteDate(frenchPayload.createdAt, 'en') ?? '')).toBeTruthy();
    expect(screen.getByText(/shared content contains 1 message\./u)).toBeTruthy();
    expect(screen.getByText('System')).toBeTruthy();
    expect(screen.getByText('User content stays untouched')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/Conversation partagée|Partagée le|Système/u);
  });

  it('renders localized empty, loading, and recoverable error states without exposing a diagnostic', () => {
    harness.loaderData = {
      language: 'fr',
      payload: {
        createdAt: frenchPayload.createdAt,
        visibleMessageIds: [],
        allowFork: false,
      },
    } satisfies ShareRouteLoaderData;

    const view = renderRoute();

    expect(screen.getByText('Aucun message n’a été inclus dans cet instantané partagé.')).toBeTruthy();

    view.unmount();
    render(
      <MemoryRouter>
        <HydrateFallback />
      </MemoryRouter>,
    );
    expect(screen.getByRole('status').getAttribute('aria-busy')).toBe('true');
    expect(screen.getByText('Chargement de la conversation partagée…')).toBeTruthy();

    cleanup();
    harness.loaderData = { language: 'fr', errorKind: 'unavailable' } satisfies ShareRouteLoaderData;

    const errorView = renderRoute();

    expect(screen.getByRole('alert').textContent).toContain('Impossible de charger ce lien de partage');
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Accéder au tableau de bord' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Consulter le centre d’aide' })).toBeTruthy();
    expect(document.body.textContent).not.toContain('Raw upstream English');
    expect(document.title).toBe('Lien de partage indisponible · E-Code');

    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(harness.revalidator.revalidate).toHaveBeenCalledTimes(1);

    harness.revalidator.state = 'loading';
    errorView.rerender(
      <MemoryRouter>
        <ShareRoute />
      </MemoryRouter>,
    );

    const retrying = screen.getByRole('button', { name: 'Nouvelle tentative…' });
    expect(retrying.hasAttribute('disabled')).toBe(true);
    expect(retrying.getAttribute('aria-busy')).toBe('true');
  });

  it('renders both typed 404 states in French with safe navigation instead of a retry loop', () => {
    const cases = [
      ['invalid', 'Ce lien de partage n’est pas valide'],
      ['not-found', 'Ce lien de partage n’est plus disponible'],
    ] as const;

    for (const [errorKind, heading] of cases) {
      harness.loaderData = { language: 'fr', errorKind } satisfies ShareRouteLoaderData;

      const view = renderRoute();

      expect(screen.getByRole('heading', { level: 1, name: heading })).toBeTruthy();
      expect(screen.getByRole('link', { name: 'Retour à l’accueil' }).getAttribute('href')).toBe('/');
      expect(screen.queryByRole('button', { name: 'Réessayer' })).toBeNull();
      expect(document.body.textContent).not.toMatch(/invalid|no longer available|Back to homepage/u);

      view.unmount();
    }
  });

  it('emits localized private-page SEO, preserves the user title, and opts into SSR', () => {
    const frenchDescriptors = meta({
      data: { language: 'fr', payload: frenchPayload },
    } as Parameters<typeof meta>[0]);
    const englishDescriptors = meta({
      data: { language: 'en', payload: { ...frenchPayload, title: undefined } },
    } as Parameters<typeof meta>[0]);
    const frenchErrorDescriptors = meta({
      data: { language: 'fr', errorKind: 'invalid' },
    } as Parameters<typeof meta>[0]);

    expect(frenchDescriptors).toContainEqual({ title: 'Titre rédigé par l’utilisateur · Partage E-Code' });
    expect(frenchDescriptors).toContainEqual({
      name: 'description',
      content: 'Consultez une conversation E-Code partagée en lecture seule.',
    });
    expect(frenchDescriptors).toContainEqual({
      name: 'robots',
      content: 'noindex, nofollow, noarchive, nosnippet, noimageindex',
    });
    expect(frenchDescriptors).toContainEqual({ name: 'referrer', content: 'no-referrer' });
    expect(englishDescriptors).toContainEqual({ title: 'E-Code share' });
    expect(frenchErrorDescriptors).toContainEqual({ title: 'Lien de partage indisponible · E-Code' });
    expect(JSON.stringify(frenchDescriptors)).not.toMatch(/canonical|hreflang|og:|twitter:/iu);
    expect(handle).toEqual({ serverRenderedMarketing: true, suppressDocumentSeo: true });
  });

  it('has zero targeted scanner findings and explicit responsive, theme, touch, and accessibility safeguards', async () => {
    const sourcePaths = ['app/routes/share.$token.tsx', 'app/components/share/ShareLinkErrorView.tsx'];
    const { scanSource } = await import('../../scripts/i18n/source-scanner.mjs');

    for (const sourcePath of sourcePaths) {
      const source = readFileSync(sourcePath, 'utf8');
      const result = scanSource(source, sourcePath);

      expect(result.parseErrors).toEqual([]);
      expect(result.findings).toEqual([]);
    }

    const routeSource = readFileSync(sourcePaths[0], 'utf8');
    const errorSource = readFileSync(sourcePaths[1], 'utf8');

    expect(routeSource).toContain('min-w-0');
    expect(routeSource).toContain('break-words');
    expect(routeSource).toContain('[overflow-wrap:anywhere]');
    expect(routeSource).toContain('w-[calc(100%-1rem)]');
    expect(routeSource).toContain('sm:w-[calc(100%-2rem)]');
    expect(routeSource).toContain('bg-bolt-elements-background-depth-1');
    expect(routeSource).toContain('bg-bolt-elements-background-depth-2');
    expect(routeSource).toContain('text-bolt-elements-textPrimary');
    expect(routeSource).toContain('border-bolt-elements-borderColor');
    expect(routeSource).toContain('min-h-[44px]');
    expect(routeSource).toContain('aria-labelledby');
    expect(routeSource).toContain('aria-live');
    expect(routeSource).toContain('aria-busy');
    expect(routeSource).not.toContain('truncate');
    expect(routeSource).not.toContain('line-clamp');
    expect(routeSource).not.toMatch(/#[0-9a-f]{3,8}/iu);
    expect(routeSource).not.toContain('style={{');
    expect(errorSource).toContain('min-h-[44px]');
    expect(errorSource).toContain('focus-visible:ring-2');
    expect(errorSource).toContain('motion-reduce:transition-none');
  });
});
