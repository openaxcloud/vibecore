import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { data as json, type LoaderFunctionArgs, type MetaFunction, useLoaderData } from 'react-router';
import { apiRequest } from '~/lib/enterprise-api.server';
import {
  formatIntegrationOauthCallbackCopy,
  getIntegrationOauthCallbackCopy,
  integrationOauthCallbackErrorMessage,
  integrationOauthCallbackProviderLabel,
  resolveIntegrationOauthCallbackLanguage,
  type IntegrationOauthCallbackErrorCode,
} from '~/lib/i18n/catalogs/integration-oauth-callback';
import { localeResponseHeaders, resolveRequestLocale } from '~/lib/i18n/request-locale';
import { isReauthRedirect } from '~/lib/route-reauth';

/*
 * Frontend callback page for the IDE Integrations OAuth flow. The popup
 * opened by the panel lands here after the provider redirect. The loader
 * forwards the code + state to the API (which verifies the state HMAC,
 * exchanges the code, encrypts the token, and creates the UserConnection +
 * ProjectConnectionLink). The page then posts a structured message to
 * window.opener and closes itself so the panel can refresh.
 *
 * See docs/INTEGRATIONS_MASTER_PLAN.md section 7 ("Agent layer integration")
 * for how the parent window consumes the postMessage event.
 */

type CallbackOutcomePayload =
  | {
      ok: true;
      language: 'en' | 'fr';
      provider: string;
      userConnectionId: string;
      accountLabel: string;
      scopes: string[];
    }
  | {
      ok: false;
      language: 'en' | 'fr';
      provider: string;
      errorCode: IntegrationOauthCallbackErrorCode;
    };

type CallbackOutcomeInput =
  | Omit<Extract<CallbackOutcomePayload, { ok: true }>, 'language'>
  | Omit<Extract<CallbackOutcomePayload, { ok: false }>, 'language'>;

const ALLOWED_PROVIDERS = new Set(['github', 'gitlab', 'bitbucket']);

export const meta: MetaFunction<typeof loader> = ({ data, matches }) => {
  const rootData = matches.find((match) => match.id === 'root')?.data as { language?: string } | undefined;
  const language = data?.language ?? rootData?.language;
  const copy = getIntegrationOauthCallbackCopy(language);
  const title = copy['integrationOauthCallback.meta.title'];
  const description = copy['integrationOauthCallback.meta.description'];

  return [
    { title },
    { name: 'description', content: description },
    { name: 'robots', content: 'noindex, nofollow, noarchive' },
    { name: 'googlebot', content: 'noindex, nofollow, noarchive' },
    { property: 'og:title', content: title },
    { property: 'og:description', content: description },
    { name: 'twitter:title', content: title },
    { name: 'twitter:description', content: description },
  ];
};

function oauthFailureCode(error: Response): IntegrationOauthCallbackErrorCode {
  if (error.status === 429) {
    return 'OAUTH_CALLBACK_RATE_LIMITED';
  }

  if (error.status >= 400 && error.status < 500) {
    return 'OAUTH_CALLBACK_REJECTED';
  }

  if (error.status >= 500) {
    return 'OAUTH_CALLBACK_UNAVAILABLE';
  }

  return 'OAUTH_CALLBACK_FAILED';
}

export async function loader({ params, request }: LoaderFunctionArgs) {
  const localeResolution = resolveRequestLocale(request);
  const language = resolveIntegrationOauthCallbackLanguage(localeResolution.language);

  const response = (payload: CallbackOutcomeInput) => {
    const outcome: CallbackOutcomePayload = payload.ok ? { ...payload, language } : { ...payload, language };

    return json<CallbackOutcomePayload>(outcome, {
      headers: localeResponseHeaders(request, localeResolution),
    });
  };

  const provider = params.provider;

  if (!provider || !ALLOWED_PROVIDERS.has(provider)) {
    return response({
      ok: false,
      provider: provider ?? 'unknown',
      errorCode: 'CONNECTOR_UNKNOWN_PROVIDER',
    });
  }

  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const providerError = url.searchParams.get('error');

  if (providerError) {
    return response({
      ok: false,
      provider,
      errorCode: 'PROVIDER_DENIED',
    });
  }

  if (!code || !state) {
    return response({
      ok: false,
      provider,
      errorCode: 'OAUTH_CALLBACK_MISSING_PARAMS',
    });
  }

  try {
    const result = await apiRequest<{
      userConnectionId: string;
      provider: string;
      accountLabel: string;
      scopes: string[];
    }>(request, `/api/integrations/oauth/${provider}/callback`, {
      method: 'POST',
      body: JSON.stringify({ code, state }),
    });

    return response({
      ok: true,
      provider: result.provider,
      userConnectionId: result.userConnectionId,
      accountLabel: result.accountLabel,
      scopes: result.scopes,
    });
  } catch (error) {
    if (isReauthRedirect(error)) {
      throw error;
    }

    const errorCode = error instanceof Response ? oauthFailureCode(error) : 'OAUTH_CALLBACK_FAILED';

    console.error('[integration-oauth-callback]', { provider, errorCode });

    return response({ ok: false, provider, errorCode });
  }
}

function connectorMessage(outcome: CallbackOutcomePayload) {
  if (outcome.ok) {
    return {
      type: 'e-code.connector.connection.resolved',
      provider: outcome.provider,
      userConnectionId: outcome.userConnectionId,
      accountLabel: outcome.accountLabel,
      scopes: outcome.scopes,
    };
  }

  return {
    type: 'e-code.connector.connection.failed',
    provider: outcome.provider,
    errorCode: outcome.errorCode,
    errorMessage: integrationOauthCallbackErrorMessage(outcome.errorCode, outcome.language),
  };
}

/*
 * This catalog-backed path replaces the former
 * oauthErrorDisplayMessage(outcome.errorCode ?? outcome.errorMessage) call:
 * the loader no longer exposes `errorMessage`, and French must never inherit
 * an English-only fallback or upstream provider prose.
 */

function closeCallbackWindow() {
  try {
    window.close();
  } catch {
    // Some browsers block window.close on tabs the script did not open.
  }
}

export default function IntegrationOauthCallbackPage() {
  const outcome = useLoaderData<typeof loader>();
  const { i18n } = useTranslation();
  const language = resolveIntegrationOauthCallbackLanguage(i18n.resolvedLanguage ?? i18n.language ?? outcome.language);
  const copy = getIntegrationOauthCallbackCopy(language);
  const providerLabel = integrationOauthCallbackProviderLabel(outcome.provider, language);

  useEffect(() => {
    const opener = window.opener as Window | null;

    if (opener && !opener.closed) {
      try {
        opener.postMessage(connectorMessage(outcome), window.location.origin);
      } catch {
        // Cross-origin postMessage failures fall through to the manual close below.
      }
    }

    const close = window.setTimeout(closeCallbackWindow, 600);

    return () => window.clearTimeout(close);
  }, [outcome]);

  const shell =
    'w-full min-w-0 max-w-xl rounded-xl border border-[var(--ecode-border)] bg-[var(--ecode-surface)] p-5 shadow-xl sm:p-8';
  const closeButton =
    'mt-6 inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-[var(--ecode-accent)] px-5 py-2.5 text-center text-sm font-semibold leading-5 whitespace-normal text-[var(--ecode-accent-contrast)] transition-colors hover:bg-[var(--ecode-accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ecode-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ecode-background)] sm:w-auto';

  if (outcome.ok) {
    const accountLabel = outcome.accountLabel || copy['integrationOauthCallback.success.accountFallback'];

    const connectedCopy = formatIntegrationOauthCallbackCopy(copy['integrationOauthCallback.success.connectedAs'], {
      provider: providerLabel,
      account: accountLabel,
    });

    return (
      <main
        data-ecode-oauth-callback="success"
        style={{ fontFamily: 'var(--vc-font-interface)' }}
        className="flex min-h-dvh w-full items-start justify-center overflow-x-hidden bg-[var(--ecode-background)] px-4 py-8 text-[var(--ecode-text)] sm:items-center sm:px-6"
      >
        <section className={shell} role="status" aria-live="polite" aria-labelledby="oauth-callback-title">
          <h1 id="oauth-callback-title" className="text-xl font-semibold leading-tight sm:text-2xl">
            {copy['integrationOauthCallback.success.title']}
          </h1>
          <p className="mt-3 break-words text-sm leading-6 text-[var(--ecode-text-secondary)] sm:text-base">
            {connectedCopy}
          </p>
          <p className="mt-3 break-words text-sm leading-6 text-[var(--ecode-text-muted)]">
            {copy['integrationOauthCallback.success.closeHint']}
          </p>
          <button
            type="button"
            className={closeButton}
            onClick={closeCallbackWindow}
            aria-label={copy['integrationOauthCallback.action.closeAria']}
          >
            {copy['integrationOauthCallback.action.close']}
          </button>
        </section>
      </main>
    );
  }

  const errorTitle = formatIntegrationOauthCallbackCopy(copy['integrationOauthCallback.error.title'], {
    provider: providerLabel,
  });

  return (
    <main
      data-ecode-oauth-callback="error"
      style={{ fontFamily: 'var(--vc-font-interface)' }}
      className="flex min-h-dvh w-full items-start justify-center overflow-x-hidden bg-[var(--ecode-background)] px-4 py-8 text-[var(--ecode-text)] sm:items-center sm:px-6"
    >
      <section className={shell} role="alert" aria-live="assertive" aria-labelledby="oauth-callback-title">
        <h1 id="oauth-callback-title" className="break-words text-xl font-semibold leading-tight sm:text-2xl">
          {errorTitle}
        </h1>
        <p className="mt-3 break-words text-sm leading-6 text-[var(--ecode-text-secondary)] sm:text-base">
          {integrationOauthCallbackErrorMessage(outcome.errorCode, language)}
        </p>
        <p className="mt-3 break-words text-sm leading-6 text-[var(--ecode-text-muted)]">
          {copy['integrationOauthCallback.error.retryHint']}
        </p>
        <button
          type="button"
          className={closeButton}
          onClick={closeCallbackWindow}
          aria-label={copy['integrationOauthCallback.action.closeAria']}
        >
          {copy['integrationOauthCallback.action.close']}
        </button>
      </section>
    </main>
  );
}
