/**
 * Read-only share view for a conversation snapshot (Sprint 7; hardened in
 * audit M5/M7).
 *
 * The token is no longer a self-describing base64 payload. The loader hands it
 * to the API's `GET /chat-shares/:token`, which verifies the HMAC signature and
 * returns the server-stored snapshot. A forged or tampered token never decodes
 * to anything — it fails signature verification on the API and renders the
 * "unavailable" state below.
 */

import type { LoaderFunctionArgs, MetaFunction } from 'react-router';
import { data as json } from 'react-router';
import { isRouteErrorResponse, useLoaderData, useRouteError } from 'react-router';

import type { ShareLinkErrorKind } from '~/components/share/ShareLinkErrorView';
import { ShareLinkErrorView } from '~/components/share/ShareLinkErrorView';
import type { ShareLinkPayload } from '~/lib/chat/share-link';
import { apiBaseUrl } from '~/lib/enterprise-api.server';

interface LoaderData {
  payload?: ShareLinkPayload;

  /*
   * Typed error state (G29): the API's `GET /chat-shares/:token` distinguishes
   * a tampered/malformed token (`CHAT_SHARE_INVALID`) from an unknown, expired,
   * or revoked one (`CHAT_SHARE_NOT_FOUND` — the store collapses those three
   * into a single 404, so they cannot be told apart further). The route maps
   * each to branded copy inside PublicShell instead of bare error text.
   */
  errorKind?: ShareLinkErrorKind;
}

export const loader = async ({ params }: LoaderFunctionArgs) => {
  const token = params.token ?? '';

  if (!token) {
    return json<LoaderData>({ errorKind: 'invalid' }, { status: 400 });
  }

  try {
    const response = await fetch(`${apiBaseUrl()}/chat-shares/${encodeURIComponent(token)}`, {
      headers: { accept: 'application/json' },
    });

    if (!response.ok) {
      /*
       * Read the API's typed error code (best effort — the body may not be
       * JSON if a proxy answered). 404 + CHAT_SHARE_INVALID = failed HMAC
       * verification; 404 + CHAT_SHARE_NOT_FOUND = unknown/expired/revoked.
       */
      let code: string | undefined;

      try {
        const body = (await response.json()) as { error?: { code?: string } };
        code = body.error?.code;
      } catch {
        code = undefined;
      }

      const errorKind: ShareLinkErrorKind =
        code === 'CHAT_SHARE_INVALID' ? 'invalid' : response.status === 404 ? 'not-found' : 'unavailable';

      return json<LoaderData>({ errorKind }, { status: response.status === 404 ? 404 : 400 });
    }

    const data = (await response.json()) as { share?: { payload?: ShareLinkPayload } };
    const payload = data.share?.payload;

    if (!payload) {
      return json<LoaderData>({ errorKind: 'unavailable' }, { status: 404 });
    }

    return json<LoaderData>({ payload });
  } catch {
    return json<LoaderData>({ errorKind: 'unavailable' }, { status: 502 });
  }
};

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  const loaderData = data as LoaderData | undefined;

  if (!loaderData?.payload) {
    return [{ title: 'Share link unavailable · E-Code' }, { name: 'robots', content: 'noindex' }];
  }

  const title = loaderData.payload.title ? `${loaderData.payload.title} · E-Code share` : 'E-Code share';

  return [{ title }];
};

/*
 * Loader errors are RETURNED (not thrown), so this boundary only catches the
 * unexpected: a thrown Response from the framework or a render error. Render
 * it branded (inside PublicShell) instead of the bare root boundary.
 */
export function ErrorBoundary() {
  const error = useRouteError();

  return (
    <ShareLinkErrorView kind={isRouteErrorResponse(error) && error.status === 404 ? 'not-found' : 'unavailable'} />
  );
}

export default function ShareRoute() {
  const data = useLoaderData<typeof loader>();
  const { payload, errorKind } = data as LoaderData;

  if (errorKind || !payload) {
    return <ShareLinkErrorView kind={errorKind ?? 'unavailable'} />;
  }

  return (
    <main className="bolt-share-view" aria-label="Shared conversation">
      <header className="bolt-share-view-header">
        <h1>{payload.title ?? 'Shared conversation'}</h1>
        <p className="bolt-share-view-meta">
          Shared from project <code>{payload.projectId}</code> on{' '}
          {/*
            Format with an explicit fixed locale + UTC timezone so the SSR render
            (web pod, server TZ) and the client hydration (visitor TZ) produce the
            same string. A bare toLocaleString() depends on the runtime locale and
            caused a hydration mismatch on this public share page.
          */}
          <time dateTime={payload.createdAt}>
            {new Date(payload.createdAt).toLocaleString('en-US', {
              dateStyle: 'medium',
              timeStyle: 'short',
              timeZone: 'UTC',
            })}{' '}
            UTC
          </time>
        </p>
      </header>
      <section className="bolt-share-view-message-list" aria-label="Message list">
        <p className="bolt-share-view-disclaimer">
          This is a read-only snapshot of the conversation. {payload.visibleMessageIds.length} message
          {payload.visibleMessageIds.length === 1 ? '' : 's'} in the bundle.
        </p>
        {payload.inlineMessages && payload.inlineMessages.length > 0 ? (
          <ol className="bolt-share-view-thread">
            {payload.inlineMessages.map((message) => (
              <li key={message.id} className="bolt-share-view-message" data-role={message.role}>
                <div className="bolt-share-view-message-role">{message.role}</div>
                <pre className="bolt-share-view-message-content">{message.content}</pre>
              </li>
            ))}
          </ol>
        ) : (
          <ol>
            {payload.visibleMessageIds.map((messageId) => (
              <li key={messageId} className="bolt-share-view-message-id">
                <code>{messageId}</code>
              </li>
            ))}
          </ol>
        )}
      </section>
      {payload.allowFork ? (
        <footer className="bolt-share-view-footer">
          <button type="button" disabled aria-disabled>
            Fork this conversation (sign in to enable)
          </button>
        </footer>
      ) : null}
    </main>
  );
}
