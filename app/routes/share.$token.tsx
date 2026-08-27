/**
 * Public, read-only conversation snapshot.
 *
 * The opaque token is verified by `GET /chat-shares/:token`. This route never
 * decodes it client-side and never exposes upstream diagnostics. The response
 * is normalized before rendering because the public API intentionally strips
 * private conversation, author, organization, and (usually) project ids.
 */

import { useTranslation } from 'react-i18next';
import type { LoaderFunctionArgs, MetaFunction } from 'react-router';
import { data as json } from 'react-router';
import { isRouteErrorResponse, useLoaderData, useRevalidator, useRouteError } from 'react-router';

import { PublicShell } from '~/components/dashboard/SaaSLayout';
import type { ShareLinkErrorKind } from '~/components/share/ShareLinkErrorView';
import { ShareLinkErrorView } from '~/components/share/ShareLinkErrorView';
import { apiBaseUrl } from '~/lib/enterprise-api.server';
import {
  formatShareRouteCopy,
  formatShareRouteDate,
  formatShareRouteMessageCount,
  getShareRouteCopy,
  resolveShareRouteLanguage,
} from '~/lib/i18n/catalogs/share-route';
import { resolveRequestLocale } from '~/lib/i18n/request-locale';

const SHARE_REQUEST_TIMEOUT_MS = 15_000;
const MESSAGE_ROLES = ['user', 'assistant', 'system'] as const;

type PublicShareMessageRole = (typeof MESSAGE_ROLES)[number];

export interface PublicShareMessage {
  id: string;
  role: PublicShareMessageRole;
  content: string;
}

export interface PublicSharePayload {
  title?: string;
  projectId?: string;
  createdAt: string;
  visibleMessageIds: readonly string[];
  inlineMessages?: readonly PublicShareMessage[];
  allowFork: boolean;
}

export interface ShareRouteLoaderData {
  language: 'en' | 'fr';
  payload?: PublicSharePayload;
  errorKind?: ShareLinkErrorKind;
}

export const handle = { serverRenderedMarketing: true, suppressDocumentSeo: true } as const;

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function isPublicShareMessageRole(value: unknown): value is PublicShareMessageRole {
  return typeof value === 'string' && (MESSAGE_ROLES as readonly string[]).includes(value);
}

/** Fail-closed parser for the deliberately reduced public API projection. */
export function parsePublicShareResponse(value: unknown): PublicSharePayload | null {
  const root = asRecord(value);
  const share = asRecord(root?.share);
  const storedPayload = asRecord(share?.payload);

  if (!share || !storedPayload) {
    return null;
  }

  const createdAt =
    typeof share.createdAt === 'string'
      ? share.createdAt
      : typeof storedPayload.createdAt === 'string'
        ? storedPayload.createdAt
        : undefined;

  const visibleMessageIds = storedPayload.visibleMessageIds;

  if (
    !createdAt ||
    Number.isNaN(new Date(createdAt).getTime()) ||
    !Array.isArray(visibleMessageIds) ||
    !visibleMessageIds.every((messageId): messageId is string => typeof messageId === 'string')
  ) {
    return null;
  }

  const rawInlineMessages = storedPayload.inlineMessages;

  let inlineMessages: PublicShareMessage[] | undefined;

  if (rawInlineMessages !== undefined) {
    if (!Array.isArray(rawInlineMessages)) {
      return null;
    }

    inlineMessages = [];

    for (const value of rawInlineMessages) {
      const message = asRecord(value);

      if (
        !message ||
        typeof message.id !== 'string' ||
        !isPublicShareMessageRole(message.role) ||
        typeof message.content !== 'string'
      ) {
        return null;
      }

      inlineMessages.push({ id: message.id, role: message.role, content: message.content });
    }
  }

  const title =
    typeof share.title === 'string'
      ? share.title
      : typeof storedPayload.title === 'string'
        ? storedPayload.title
        : undefined;

  const projectId = typeof share.projectId === 'string' && share.projectId.length > 0 ? share.projectId : undefined;
  const allowFork = typeof share.allowFork === 'boolean' ? share.allowFork : storedPayload.allowFork === true;

  return {
    ...(title !== undefined ? { title } : {}),
    ...(projectId !== undefined ? { projectId } : {}),
    createdAt,
    visibleMessageIds,
    ...(inlineMessages !== undefined ? { inlineMessages } : {}),
    allowFork,
  };
}

async function readUpstreamErrorCode(response: Response): Promise<string | undefined> {
  try {
    const body = asRecord(await response.json());
    const error = asRecord(body?.error);
    const code = error?.code ?? body?.code;

    return typeof code === 'string' ? code : undefined;
  } catch {
    return undefined;
  }
}

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const language = resolveShareRouteLanguage(resolveRequestLocale(request).language);
  const token = params.token ?? '';

  if (!token) {
    return json<ShareRouteLoaderData>({ language, errorKind: 'invalid' }, { status: 400 });
  }

  try {
    const response = await fetch(`${apiBaseUrl()}/chat-shares/${encodeURIComponent(token)}`, {
      headers: {
        accept: 'application/json',
        'accept-language': language,
      },
      signal: AbortSignal.timeout(SHARE_REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      const code = await readUpstreamErrorCode(response);

      const errorKind: ShareLinkErrorKind =
        code === 'CHAT_SHARE_INVALID' ? 'invalid' : response.status === 404 ? 'not-found' : 'unavailable';

      const status = errorKind === 'unavailable' ? 502 : response.status === 404 ? 404 : 400;

      return json<ShareRouteLoaderData>({ language, errorKind }, { status });
    }

    const payload = parsePublicShareResponse(await response.json());

    if (!payload) {
      return json<ShareRouteLoaderData>({ language, errorKind: 'unavailable' }, { status: 502 });
    }

    return json<ShareRouteLoaderData>({ language, payload });
  } catch {
    return json<ShareRouteLoaderData>({ language, errorKind: 'unavailable' }, { status: 502 });
  }
};

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  const loaderData = data as ShareRouteLoaderData | undefined;
  const language = resolveShareRouteLanguage(loaderData?.language);
  const copy = getShareRouteCopy(language);

  const title = loaderData?.payload
    ? loaderData.payload.title
      ? formatShareRouteCopy(copy['shareRoute.seo.titled'], { title: loaderData.payload.title })
      : copy['shareRoute.seo.defaultTitle']
    : copy['shareRoute.seo.unavailableTitle'];

  /*
   * This capability-token route intentionally adds no canonical/hreflang,
   * Open Graph, or Twitter descriptors. Advertising either locale variant
   * would disclose the secret URL. The root document still derives the active
   * `<html lang>` from this loader's `language` field.
   */
  return [
    { title },
    { name: 'description', content: copy['shareRoute.seo.description'] },
    { name: 'robots', content: 'noindex, nofollow, noarchive, nosnippet, noimageindex' },
    { name: 'googlebot', content: 'noindex, nofollow, noarchive, nosnippet, noimageindex' },
    { name: 'referrer', content: 'no-referrer' },
  ];
};

function RetryableShareError({ kind }: { kind: ShareLinkErrorKind }) {
  const revalidator = useRevalidator();
  const retryable = kind === 'unavailable';

  return (
    <ShareLinkErrorView
      kind={kind}
      onRetry={retryable ? () => revalidator.revalidate() : undefined}
      isRetrying={retryable && revalidator.state !== 'idle'}
    />
  );
}

/** Branded, localized recovery for unexpected loader and render failures. */
export function ErrorBoundary() {
  const error = useRouteError();
  const kind: ShareLinkErrorKind = isRouteErrorResponse(error) && error.status === 404 ? 'not-found' : 'unavailable';

  return <RetryableShareError kind={kind} />;
}

/** Explicit localized state while the public snapshot loader is pending. */
export function HydrateFallback() {
  const { i18n } = useTranslation();
  const language = resolveShareRouteLanguage(i18n.resolvedLanguage ?? i18n.language);
  const copy = getShareRouteCopy(language);

  return (
    <PublicShell>
      <main
        className="mx-auto my-4 flex min-h-[60vh] w-[calc(100%-1rem)] max-w-3xl min-w-0 flex-col items-center justify-center gap-4 overflow-hidden rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-4 py-16 text-center shadow-sm sm:my-8 sm:w-[calc(100%-2rem)] sm:px-6 lg:my-12"
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <div
          className="h-3 w-28 max-w-full animate-pulse rounded-full bg-bolt-elements-background-depth-3 motion-reduce:animate-none"
          aria-hidden="true"
        />
        <h1 className="break-words text-2xl font-semibold text-bolt-elements-textPrimary sm:text-3xl">
          {copy['shareRoute.page.loading']}
        </h1>
        <p className="break-words text-sm text-bolt-elements-textSecondary">
          {copy['shareRoute.page.loadingDescription']}
        </p>
      </main>
    </PublicShell>
  );
}

export default function ShareRoute() {
  const data = useLoaderData<typeof loader>() as ShareRouteLoaderData;
  const { i18n } = useTranslation();
  const language = resolveShareRouteLanguage(i18n.resolvedLanguage ?? i18n.language ?? data.language);
  const copy = getShareRouteCopy(language);
  const { payload, errorKind } = data;

  if (errorKind || !payload) {
    return <RetryableShareError kind={errorKind ?? 'unavailable'} />;
  }

  const date = formatShareRouteDate(payload.createdAt, language) ?? copy['shareRoute.meta.dateUnavailable'];
  const messageCount = payload.visibleMessageIds.length;

  return (
    <PublicShell>
      <main
        className="mx-auto my-4 flex min-h-[60vh] w-[calc(100%-1rem)] max-w-3xl min-w-0 flex-col overflow-hidden rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 text-bolt-elements-textPrimary shadow-sm sm:my-8 sm:w-[calc(100%-2rem)] lg:my-12"
        aria-labelledby="share-conversation-heading"
        data-testid="share-conversation"
      >
        <header className="min-w-0 border-b border-bolt-elements-borderColor px-4 py-5 sm:px-6 sm:py-6">
          <h1
            id="share-conversation-heading"
            className="max-w-full break-words text-2xl font-semibold leading-tight sm:text-3xl"
          >
            {payload.title || copy['shareRoute.page.fallbackTitle']}
          </h1>
          <p className="mt-3 flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-1 break-words text-sm leading-6 text-bolt-elements-textSecondary">
            {payload.projectId ? (
              <>
                <span>{copy['shareRoute.meta.fromProject']}</span>
                <code className="max-w-full break-all rounded bg-bolt-elements-background-depth-2 px-1.5 py-0.5 text-xs text-bolt-elements-textPrimary">
                  {payload.projectId}
                </code>
                <span>{copy['shareRoute.meta.on']}</span>
              </>
            ) : (
              <span>{copy['shareRoute.meta.sharedOn']}</span>
            )}
            <time dateTime={payload.createdAt}>{date}</time>
            <span>{copy['shareRoute.meta.timeZone']}</span>
          </p>
        </header>

        <section className="min-w-0 flex-1 px-4 py-5 sm:px-6 sm:py-6" aria-labelledby="share-message-list-heading">
          <h2 id="share-message-list-heading" className="sr-only">
            {copy['shareRoute.messages.heading']}
          </h2>
          <p className="break-words rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-3 text-sm leading-6 text-bolt-elements-textSecondary sm:px-4">
            {formatShareRouteMessageCount(messageCount, language)}
          </p>

          {payload.inlineMessages && payload.inlineMessages.length > 0 ? (
            <ol className="m-0 mt-5 grid min-w-0 list-none gap-4 p-0">
              {payload.inlineMessages.map((message) => (
                <li
                  key={message.id}
                  className="min-w-0 overflow-hidden rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2"
                  data-role={message.role}
                >
                  <div className="border-b border-bolt-elements-borderColor px-3 py-2 text-xs font-semibold uppercase tracking-wide text-bolt-elements-textTertiary sm:px-4">
                    {copy[`shareRoute.role.${message.role}`]}
                  </div>
                  <pre className="m-0 max-w-full overflow-x-auto whitespace-pre-wrap break-words px-3 py-4 font-mono text-sm leading-6 text-bolt-elements-textPrimary [overflow-wrap:anywhere] sm:px-4">
                    {message.content}
                  </pre>
                </li>
              ))}
            </ol>
          ) : payload.visibleMessageIds.length > 0 ? (
            <ol className="m-0 mt-5 grid min-w-0 list-none gap-2 p-0">
              {payload.visibleMessageIds.map((messageId) => (
                <li
                  key={messageId}
                  className="min-w-0 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-3 sm:px-4"
                >
                  <code className="block max-w-full break-all text-sm text-bolt-elements-textPrimary">{messageId}</code>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-5 break-words rounded-lg border border-dashed border-bolt-elements-borderColor px-4 py-8 text-center text-sm text-bolt-elements-textSecondary">
              {copy['shareRoute.messages.empty']}
            </p>
          )}
        </section>

        {payload.allowFork ? (
          <footer className="border-t border-bolt-elements-borderColor px-4 py-4 sm:px-6">
            <button
              type="button"
              className="inline-flex min-h-[44px] w-full min-w-[44px] items-center justify-center rounded-md border border-bolt-elements-borderColor px-4 py-2 text-center text-sm font-medium text-bolt-elements-textSecondary opacity-70 sm:w-auto"
              disabled
              aria-disabled="true"
            >
              {copy['shareRoute.fork.disabled']}
            </button>
          </footer>
        ) : null}
      </main>
    </PublicShell>
  );
}
