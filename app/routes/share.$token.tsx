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

import type { LoaderFunctionArgs, MetaFunction } from '@remix-run/cloudflare';
import { json } from '@remix-run/cloudflare';
import { useLoaderData } from '@remix-run/react';

import type { ShareLinkPayload } from '~/lib/chat/share-link';
import { apiBaseUrl } from '~/lib/enterprise-api.server';

interface LoaderData {
  payload?: ShareLinkPayload;
  error?: string;
}

export const loader = async ({ params }: LoaderFunctionArgs) => {
  const token = params.token ?? '';

  if (!token) {
    return json<LoaderData>({ error: 'Missing share token.' }, { status: 400 });
  }

  try {
    const response = await fetch(`${apiBaseUrl()}/chat-shares/${encodeURIComponent(token)}`, {
      headers: { accept: 'application/json' },
    });

    if (!response.ok) {
      return json<LoaderData>(
        { error: 'This share link is invalid, expired, or has been revoked.' },
        { status: response.status === 404 ? 404 : 400 },
      );
    }

    const data = (await response.json()) as { share?: { payload?: ShareLinkPayload } };
    const payload = data.share?.payload;

    if (!payload) {
      return json<LoaderData>({ error: 'The shared conversation is unavailable.' }, { status: 404 });
    }

    return json<LoaderData>({ payload });
  } catch {
    return json<LoaderData>({ error: 'Failed to load share link.' }, { status: 502 });
  }
};

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  const payload = (data as LoaderData | undefined)?.payload;
  const title = payload?.title ? `${payload.title} · E-Code share` : 'E-Code share';

  return [{ title }];
};

export default function ShareRoute() {
  const data = useLoaderData<typeof loader>();
  const { payload, error } = data as LoaderData;

  if (error || !payload) {
    return (
      <main className="bolt-share-view bolt-share-view-error" role="alert">
        <h1>Share link unavailable</h1>
        <p>{error ?? 'The link payload could not be decoded.'}</p>
      </main>
    );
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
