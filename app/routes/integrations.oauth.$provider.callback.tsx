import { useEffect } from 'react';
import { data as json, type LoaderFunctionArgs } from 'react-router';
import { useLoaderData } from 'react-router';
import { apiRequest } from '~/lib/enterprise-api.server';
import { oauthErrorDisplayMessage, providerDisplayLabel } from '~/lib/user-facing-labels';

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

interface CallbackOutcomePayload {
  ok: boolean;
  provider: string;
  userConnectionId?: string;
  accountLabel?: string;
  scopes?: string[];
  errorCode?: string;
  errorMessage?: string;
}

const ALLOWED_PROVIDERS = new Set(['github', 'gitlab', 'bitbucket']);

export async function loader({ params, request }: LoaderFunctionArgs) {
  const provider = params.provider;

  if (!provider || !ALLOWED_PROVIDERS.has(provider)) {
    return json<CallbackOutcomePayload>({
      ok: false,
      provider: provider ?? 'unknown',
      errorCode: 'CONNECTOR_UNKNOWN_PROVIDER',
      errorMessage: 'This connector is not yet wired into the integrations panel.',
    });
  }

  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const providerError = url.searchParams.get('error');
  const providerErrorDescription = url.searchParams.get('error_description');

  if (providerError) {
    return json<CallbackOutcomePayload>({
      ok: false,
      provider,
      errorCode: 'PROVIDER_DENIED',
      errorMessage: providerErrorDescription ?? providerError,
    });
  }

  if (!code || !state) {
    return json<CallbackOutcomePayload>({
      ok: false,
      provider,
      errorCode: 'OAUTH_CALLBACK_MISSING_PARAMS',
      errorMessage: 'The OAuth provider did not return a code or state.',
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

    return json<CallbackOutcomePayload>({
      ok: true,
      provider: result.provider,
      userConnectionId: result.userConnectionId,
      accountLabel: result.accountLabel,
      scopes: result.scopes,
    });
  } catch (error) {
    if (error instanceof Response) {
      /*
       * `apiRequest` may throw a redirect Response (e.g. to /login on 401).
       * Let those propagate so the redirect actually happens.
       */
      if (error.status >= 300 && error.status < 400) {
        throw error;
      }

      let parsed: { error?: string; code?: string } = {};

      try {
        parsed = (await error.clone().json()) as { error?: string; code?: string };
      } catch {
        parsed = {};
      }

      return json<CallbackOutcomePayload>({
        ok: false,
        provider,
        errorCode: parsed.code ?? 'OAUTH_CALLBACK_FAILED',
        errorMessage: parsed.error ?? `Callback failed with HTTP ${error.status}`,
      });
    }

    return json<CallbackOutcomePayload>({
      ok: false,
      provider,
      errorCode: 'OAUTH_CALLBACK_FAILED',
      errorMessage: error instanceof Error ? error.message : 'Unknown failure',
    });
  }
}

export default function IntegrationOauthCallbackPage() {
  const outcome = useLoaderData<typeof loader>();
  const providerLabel = providerDisplayLabel(outcome.provider);

  useEffect(() => {
    const opener = window.opener as Window | null;

    if (opener && !opener.closed) {
      try {
        opener.postMessage(
          {
            type: outcome.ok ? 'e-code.connector.connection.resolved' : 'e-code.connector.connection.failed',
            provider: outcome.provider,
            userConnectionId: outcome.userConnectionId,
            accountLabel: outcome.accountLabel,
            scopes: outcome.scopes,
            errorCode: outcome.errorCode,
            errorMessage: outcome.errorMessage,
          },
          window.location.origin,
        );
      } catch {
        // Cross-origin postMessage failures fall through to the manual close below.
      }
    }

    const close = window.setTimeout(() => {
      try {
        window.close();
      } catch {
        // Some browsers block window.close on tabs the script did not open.
      }
    }, 600);

    return () => window.clearTimeout(close);
  }, [outcome]);

  if (outcome.ok) {
    return (
      <main
        style={{
          fontFamily: 'var(--vc-font-interface)',
          padding: '32px',
          maxWidth: 480,
          background: 'var(--ecode-background)',
          color: 'var(--ecode-text)',
          minHeight: '100vh',
        }}
      >
        <h1 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Connection successful</h1>
        <p style={{ color: 'var(--ecode-text-secondary)' }}>
          Connected to {providerLabel} as <strong>{outcome.accountLabel ?? 'your account'}</strong>. You can close this
          window.
        </p>
      </main>
    );
  }

  return (
    <main
      style={{
        fontFamily: 'var(--vc-font-interface)',
        padding: '32px',
        maxWidth: 480,
        background: 'var(--ecode-background)',
        color: 'var(--ecode-text)',
        minHeight: '100vh',
      }}
    >
      <h1 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>{providerLabel} connection failed</h1>
      <p style={{ color: 'var(--ecode-text-secondary)' }}>
        {oauthErrorDisplayMessage(outcome.errorCode ?? outcome.errorMessage)}
      </p>
      <p style={{ color: 'var(--ecode-text-muted)', fontSize: 12, marginTop: 8 }}>
        Return to E-Code and try the connection again.
      </p>
    </main>
  );
}
