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
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { PublicShell } from '~/components/dashboard/SaaSLayout';
import { getShareRouteCopy, resolveShareRouteLanguage, type ShareRouteKey } from '~/lib/i18n/catalogs/share-route';

export type ShareLinkErrorKind =
  | 'not-found' // unknown token, expired, or revoked (API collapses these)
  | 'invalid' // malformed / tampered token (failed signature verification)
  | 'project-missing' // link resolved but the underlying project is gone
  | 'unavailable'; // upstream/network failure or missing snapshot

const COPY_KEYS: Record<ShareLinkErrorKind, { headingKey: ShareRouteKey; bodyKey: ShareRouteKey }> = {
  'not-found': {
    headingKey: 'shareRoute.error.notFound.heading',
    bodyKey: 'shareRoute.error.notFound.body',
  },
  invalid: {
    headingKey: 'shareRoute.error.invalid.heading',
    bodyKey: 'shareRoute.error.invalid.body',
  },
  'project-missing': {
    headingKey: 'shareRoute.error.projectMissing.heading',
    bodyKey: 'shareRoute.error.projectMissing.body',
  },
  unavailable: {
    headingKey: 'shareRoute.error.unavailable.heading',
    bodyKey: 'shareRoute.error.unavailable.body',
  },
};

export interface ShareLinkErrorViewProps {
  kind: ShareLinkErrorKind;
  onRetry?: () => void;
  isRetrying?: boolean;
}

const primaryActionClassName =
  'inline-flex min-h-[44px] w-full min-w-[44px] items-center justify-center rounded-md bg-bolt-elements-button-primary-background px-4 py-2 text-sm font-medium text-bolt-elements-button-primary-text transition-colors hover:bg-bolt-elements-button-primary-backgroundHover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-action-primary)] focus-visible:ring-offset-2 motion-reduce:transition-none sm:w-auto';
const secondaryActionClassName =
  'inline-flex min-h-[44px] w-full min-w-[44px] items-center justify-center rounded-md border border-bolt-elements-borderColor px-4 py-2 text-sm font-medium text-bolt-elements-textPrimary transition-colors hover:bg-bolt-elements-background-depth-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-action-primary)] focus-visible:ring-offset-2 motion-reduce:transition-none sm:w-auto';

export function ShareLinkErrorView({ kind, onRetry, isRetrying = false }: ShareLinkErrorViewProps) {
  const { i18n } = useTranslation();
  const language = resolveShareRouteLanguage(i18n.resolvedLanguage ?? i18n.language);
  const copy = getShareRouteCopy(language);
  const copyKeys = COPY_KEYS[kind];

  /*
   * When this view renders from a route ErrorBoundary, route `meta` never ran
   * (same Remix v2 limitation handled in the `$.tsx` splat route), so set the
   * document title client-side.
   */
  useEffect(() => {
    document.title = copy['shareRoute.seo.unavailableTitle'];
  }, [copy]);

  return (
    <PublicShell>
      <section
        className="mx-auto flex min-h-[60vh] w-full min-w-0 max-w-2xl flex-col items-center justify-center gap-5 overflow-hidden px-4 py-16 text-center sm:gap-6 sm:px-6 sm:py-24"
        role="alert"
        aria-labelledby="share-error-heading"
        aria-describedby="share-error-description"
        aria-busy={isRetrying || undefined}
      >
        <span className="text-sm font-semibold uppercase tracking-[0.2em] text-bolt-elements-textTertiary">
          {copy['shareRoute.error.badge']}
        </span>
        <h1
          id="share-error-heading"
          className="max-w-full break-words text-3xl font-semibold text-bolt-elements-textPrimary sm:text-4xl"
        >
          {copy[copyKeys.headingKey]}
        </h1>
        <p
          id="share-error-description"
          className="max-w-md break-words text-sm leading-6 text-bolt-elements-textSecondary"
        >
          {copy[copyKeys.bodyKey]}
        </p>
        <div className="flex w-full max-w-md flex-col items-stretch justify-center gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          {onRetry ? (
            <button
              type="button"
              className={primaryActionClassName}
              disabled={isRetrying}
              aria-busy={isRetrying || undefined}
              onClick={onRetry}
            >
              {copy[isRetrying ? 'shareRoute.error.actions.retrying' : 'shareRoute.error.actions.retry']}
            </button>
          ) : (
            <Link to="/" className={primaryActionClassName}>
              {copy['shareRoute.error.actions.home']}
            </Link>
          )}
          <Link to="/dashboard" className={secondaryActionClassName}>
            {copy['shareRoute.error.actions.dashboard']}
          </Link>
        </div>
        <Link
          to="/help-center"
          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center break-words px-3 text-xs text-bolt-elements-textTertiary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-action-primary)] focus-visible:ring-offset-2"
        >
          {copy['shareRoute.error.actions.help']}
        </Link>
      </section>
    </PublicShell>
  );
}
