/**
 * Read-only share view for a conversation snapshot (Sprint 7).
 *
 * The route decodes the base64url token via `decodeShareLinkPayload`
 * and renders the embedded conversation messages. The actual signing
 * + ACL check happens server-side once that endpoint exists; this
 * file is the public-facing landing surface that the share link the
 * agent panel hands the user lands on.
 *
 * For now we render whatever the payload claims — a future iteration
 * will hydrate full message bodies from a server-side store keyed by
 * `visibleMessageIds` (the payload only carries the id list to keep
 * the URL short).
 */

import type { LoaderFunctionArgs, MetaFunction } from '@remix-run/cloudflare';
import { json } from '@remix-run/cloudflare';
import { useLoaderData } from '@remix-run/react';

import { decodeShareLinkPayload, type ShareLinkPayload } from '~/lib/chat/share-link';

interface LoaderData {
  payload?: ShareLinkPayload;
  error?: string;
}

export const loader = ({ params }: LoaderFunctionArgs) => {
  const token = params.token ?? '';

  if (!token) {
    return json<LoaderData>({ error: 'Missing share token.' }, { status: 400 });
  }

  try {
    const payload = decodeShareLinkPayload(token);

    return json<LoaderData>({ payload });
  } catch (error) {
    return json<LoaderData>(
      { error: error instanceof Error ? error.message : 'Failed to decode share link.' },
      { status: 400 },
    );
  }
};

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  const payload = (data as LoaderData | undefined)?.payload;
  const title = payload?.title ? `${payload.title} · Vibecore share` : 'Vibecore share';

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
          <time dateTime={payload.createdAt}>{new Date(payload.createdAt).toLocaleString()}</time>
        </p>
      </header>
      <section className="bolt-share-view-message-list" aria-label="Message list">
        <p className="bolt-share-view-disclaimer">
          This is a read-only snapshot of the conversation. {payload.visibleMessageIds.length} message
          {payload.visibleMessageIds.length === 1 ? '' : 's'} in the bundle.
        </p>
        <ol>
          {payload.visibleMessageIds.map((messageId) => (
            <li key={messageId} className="bolt-share-view-message-id">
              <code>{messageId}</code>
            </li>
          ))}
        </ol>
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
