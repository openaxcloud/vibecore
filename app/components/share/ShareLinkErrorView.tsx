/**
 * Branded error surface for the public share-link routes (G29).
 *
 * `/share/:token` (chat-share viewer) and `/projects/share/:token` (project
 * share-link redeem) used to render bare, unstyled error text on a blank page
 * when a token was invalid, expired, or revoked. This view renders those
 * states inside `PublicShell` — the marketing chrome (branded header/footer)
 * already used by /templates and the 404 splat route — with a clear message
 * and a CTA back home.
 *
 * The typed `kind` mirrors what the API actually distinguishes:
 * - chat shares (`GET /chat-shares/:token`): `CHAT_SHARE_INVALID` (bad/tampered
 *   signature) vs `CHAT_SHARE_NOT_FOUND` (unknown token, expired, revoked, or
 *   source project deleted — the store collapses those into one 404).
 * - project links (`GET /collaboration/share-links/:token`):
 *   `SHARE_LINK_INVALID` (unknown/expired/revoked, likewise collapsed) vs
 *   `SHARE_LINK_PROJECT_MISSING` (link valid but the project was deleted).
 * Expired and revoked are NOT separable server-side, so the copy names both.
 */

import { useEffect } from 'react';
import { Link } from 'react-router';

import { LinkButton, PublicShell } from '~/components/dashboard/SaaSLayout';

export type ShareLinkErrorKind =
  | 'not-found' // unknown token, expired, or revoked (API collapses these)
  | 'invalid' // malformed / tampered token (failed signature verification)
  | 'project-missing' // link resolved but the underlying project is gone
  | 'unavailable'; // upstream/network failure or missing snapshot

const COPY: Record<ShareLinkErrorKind, { badge: string; heading: string; body: string }> = {
  'not-found': {
    badge: 'Share link',
    heading: 'This share link is no longer available',
    body: 'The link may have expired, been revoked by its owner, or never existed. Ask the person who shared it with you for a fresh link.',
  },
  invalid: {
    badge: 'Share link',
    heading: 'This share link is invalid',
    body: 'The link looks malformed or incomplete — it may have been truncated when it was copied. Ask the sender to share it again.',
  },
  'project-missing': {
    badge: 'Share link',
    heading: 'This project is no longer available',
    body: 'The share link is valid, but the project behind it has been deleted, so there is nothing left to open.',
  },
  unavailable: {
    badge: 'Share link',
    heading: 'We could not load this share link',
    body: 'Something went wrong while loading the shared content. Try again in a moment, or ask the sender for a new link.',
  },
};

export function ShareLinkErrorView({ kind }: { kind: ShareLinkErrorKind }) {
  const copy = COPY[kind];

  /*
   * When this view renders from a route ErrorBoundary, route `meta` never ran
   * (same Remix v2 limitation handled in the `$.tsx` splat route), so set the
   * document title client-side.
   */
  useEffect(() => {
    document.title = 'Share link unavailable · E-Code';
  }, []);

  return (
    <PublicShell>
      <section
        className="mx-auto flex min-h-[60vh] w-full max-w-2xl flex-col items-center justify-center gap-6 px-6 py-24 text-center"
        role="alert"
        aria-labelledby="share-error-heading"
      >
        <span className="text-sm font-semibold uppercase tracking-[0.2em] text-bolt-elements-textTertiary">
          {copy.badge}
        </span>
        <h1 id="share-error-heading" className="text-3xl font-semibold text-bolt-elements-textPrimary">
          {copy.heading}
        </h1>
        <p className="max-w-md text-sm leading-6 text-bolt-elements-textSecondary">{copy.body}</p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <LinkButton to="/">Back to homepage</LinkButton>
          <LinkButton to="/dashboard" variant="outline">
            Go to dashboard
          </LinkButton>
        </div>
        <Link to="/help-center" className="text-xs text-bolt-elements-textTertiary underline-offset-4 hover:underline">
          Visit the help center
        </Link>
      </section>
    </PublicShell>
  );
}
