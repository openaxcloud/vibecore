import { Form, useActionData, useLoaderData } from 'react-router';
import { EnterpriseFormPage, TextField, PrimaryButton } from '~/components/enterprise/EnterpriseFormPage';
import {
  apiRequest,
  formObject,
  json,
  requirePlatformAdmin,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';

/*
 * Admin OAuth providers — platform admins paste each provider's OAuth app
 * client_id / client_secret and read the exact callback URLs to register.
 *
 * Three groups, all DB-backed and editable here (step-up password gated):
 *
 *  1. Sign-in providers (GitHub / Google) — the social-login OAuth apps. The
 *     login flow reads these DB-first (resolveLoginProviderCredentials) and falls
 *     back to the *_CLIENT_ID/*_CLIENT_SECRET env vars, so an empty row keeps the
 *     current env-based behaviour. POST → /admin/login-providers.
 *
 *  2. Git connectors (GitHub / GitLab / Bitbucket) — the OAuth apps used by the
 *     in-IDE Connect flow. POST → /admin/connectors/oauth (connectorCredentialsFor
 *     reads DB-first). Distinct OAuth apps from the sign-in ones (different
 *     callback URLs), so they have their own credentials.
 *
 *  3. API-key connectors (Vercel / Netlify / Supabase) — no platform OAuth app;
 *     each user pastes their own personal token in the IDE Connect panel. Shown
 *     here as a reference (where to mint the token) only.
 *
 * The client secret is WRITE-ONLY everywhere — never returned to the browser,
 * only whether one is set (`hasSecret`).
 *
 * Reached by direct URL at /admin/oauth-providers; gated to platform-admin.
 */

type Connector = {
  provider: string;
  displayName: string;
  enabled: boolean;
  clientId: string;
  hasSecret: boolean;
  scopes: string[];
  authorizeUrl: string;
  callbackUrl: string;
};

type LoginProvider = {
  provider: string;
  displayName: string;
  callbackUrl: string;
  enabled: boolean;
  clientId: string;
  hasSecret: boolean;
  scopes: string[];
  envClientIdPresent: boolean;
  envSecretPresent: boolean;
};

/* Short, provider-specific "how to register the OAuth app" guidance shown in-UI. */
const LOGIN_HOWTO: Record<string, { console: string; steps: string[] }> = {
  github: {
    console: 'https://github.com/settings/developers → OAuth Apps → New OAuth App',
    steps: [
      'Set "Authorization callback URL" to the callback URL shown above.',
      'Copy the Client ID and generate a Client secret.',
      'Paste both here and save — sign-in goes live immediately (no redeploy).',
    ],
  },
  google: {
    console:
      'https://console.cloud.google.com → APIs & Services → Credentials → Create OAuth client ID (Web application)',
    steps: [
      'Add the callback URL above under "Authorized redirect URIs".',
      'Configure the OAuth consent screen (email + profile scopes) if prompted.',
      'Copy the Client ID + Client secret, paste here and save.',
    ],
  },
};

const CONNECTOR_HOWTO: Record<string, { console: string; steps: string[] }> = {
  github: {
    console: 'https://github.com/settings/developers → OAuth Apps (a SEPARATE app from sign-in)',
    steps: [
      'Use the connector callback URL above (…/integrations/oauth/github/callback).',
      'Grant repo + read:user + user:email scopes.',
    ],
  },
  gitlab: {
    console: 'https://gitlab.com/-/profile/applications',
    steps: [
      'Set Redirect URI to the connector callback URL above.',
      'Scopes: read_user, read_api, read_repository, write_repository.',
    ],
  },
  bitbucket: {
    console: 'https://bitbucket.org/account/settings/app-passwords/ → OAuth consumers',
    steps: [
      'Set Callback URL to the connector callback URL above.',
      'Permissions: account, repository (read/write), pull requests.',
    ],
  },
};

type ApiKeyConnector = {
  provider: string;
  displayName: string;
  authType: string;
  enabled: boolean;
  tokenConsoleUrl: string;
  configureEndpoint: string;
};

/* Per-provider "how to get a token" copy for the API-key connectors. */
const API_KEY_HOWTO: Record<string, string> = {
  vercel:
    'vercel.com → Account Settings → Tokens → Create. Users paste it in the IDE Connect panel; the platform deploys to their Vercel account.',
  netlify:
    'app.netlify.com → User settings → Applications → Personal access tokens → New token. Used for "Deploy to Netlify" against the user account.',
  supabase:
    'supabase.com → Account → Access Tokens → Generate. Used by the Database panel "Connect Supabase" flow (list projects + connection string).',
};

export async function loader({ request }: EnterpriseLoaderArgs) {
  await requirePlatformAdmin(request);

  const [connectorsData, loginData, apiKeyData] = await Promise.all([
    apiRequest<{ connectors: Connector[] }>(request, '/admin/connectors/oauth'),
    apiRequest<{ providers: LoginProvider[] }>(request, '/admin/login-providers'),
    apiRequest<{ connectors: ApiKeyConnector[] }>(request, '/admin/connectors/api-key'),
  ]);

  return json({
    connectors: connectorsData.connectors ?? [],
    loginProviders: loginData.providers ?? [],
    apiKeyConnectors: apiKeyData.connectors ?? [],
  });
}

async function reauthenticate(request: Request, password: string) {
  try {
    await apiRequest(request, '/auth/reauth', {
      method: 'POST',
      redirectOn401: false,
      body: JSON.stringify({ password }),
    });

    return undefined;
  } catch (error) {
    if (error instanceof Response && error.status === 401) {
      return 'Incorrect password. Re-enter your password to confirm this change.';
    }

    throw error;
  }
}

async function mutationError(error: unknown): Promise<string> {
  if (error instanceof Response) {
    const payload = (await error.json().catch(() => ({}))) as { error?: string; code?: string };

    if (payload.code === 'ADMIN_REAUTH_REQUIRED') {
      return 'Re-authentication expired. Enter your password and submit again.';
    }

    if (payload.code === 'PLATFORM_ADMIN_REQUIRED') {
      return 'This action requires a platform administrator account.';
    }

    return payload.error ?? 'The provider configuration could not be saved.';
  }

  return 'The admin service is not reachable. Please try again in a moment.';
}

export async function action({ request }: EnterpriseActionArgs) {
  await requirePlatformAdmin(request);

  const body = formObject(await request.formData()) as {
    kind?: string;
    provider?: string;
    clientId?: string;
    clientSecret?: string;
    scopes?: string;
    enabled?: string;
    password?: string;
  };

  if (!body.provider) {
    return json({ error: 'Missing provider.' }, { status: 400 });
  }

  if (!body.password) {
    return json({ error: 'Enter your password to confirm this change.' }, { status: 400 });
  }

  let reauthError: string | undefined;

  try {
    reauthError = await reauthenticate(request, body.password);
  } catch (error) {
    return json({ error: await mutationError(error) }, { status: 502 });
  }

  if (reauthError) {
    return json({ error: reauthError }, { status: 401 });
  }

  /*
   * Only send clientSecret when the admin actually typed a new one, so an empty
   * field leaves the stored (write-only) secret untouched rather than clearing it.
   */
  const payload: Record<string, unknown> = {
    provider: body.provider,
    enabled: body.enabled === 'on' || body.enabled === 'true',
  };

  if (typeof body.clientId === 'string') {
    payload.clientId = body.clientId.trim();
  }

  if (typeof body.clientSecret === 'string' && body.clientSecret.length > 0) {
    payload.clientSecret = body.clientSecret;
  }

  const isLogin = body.kind === 'login';
  const isApiKey = body.kind === 'apikey';

  const endpoint = isLogin
    ? '/admin/login-providers'
    : isApiKey
      ? '/admin/connectors/api-key'
      : '/admin/connectors/oauth';

  if (isLogin && typeof body.scopes === 'string') {
    payload.scopes = body.scopes;
  }

  // The api-key toggle endpoint only accepts { provider, enabled }.
  const sentPayload = isApiKey ? { provider: body.provider, enabled: payload.enabled } : payload;

  try {
    await apiRequest(request, endpoint, {
      method: 'POST',
      redirectOn401: false,
      body: JSON.stringify(sentPayload),
    });

    return json({ status: `${body.provider} ${isLogin ? 'sign-in' : 'connector'} configuration saved.` });
  } catch (error) {
    return json({ error: await mutationError(error) }, { status: 403 });
  }
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <label className="block text-sm font-medium">
      {label}
      <input
        readOnly
        value={value}
        onFocus={(e) => e.currentTarget.select()}
        className="mt-2 w-full select-all rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-2 font-mono text-xs text-bolt-elements-textSecondary outline-none"
      />
    </label>
  );
}

function HowTo({ console: consoleUrl, steps }: { console: string; steps: string[] }) {
  return (
    <details className="rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-xs">
      <summary className="cursor-pointer font-medium text-bolt-elements-textSecondary">How to set this up</summary>
      <p className="mt-2 text-bolt-elements-textSecondary">
        Provider console: <span className="font-mono">{consoleUrl}</span>
      </p>
      <ol className="mt-2 list-decimal space-y-1 pl-4 text-bolt-elements-textSecondary">
        {steps.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
    </details>
  );
}

function StatusPill({ enabled, hasSecret }: { enabled: boolean; hasSecret: boolean }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs ${
        enabled && hasSecret
          ? 'bg-[var(--vc-ide-accent-success)]/15 text-[var(--status-success-text)]'
          : 'bg-bolt-elements-background-depth-2 text-bolt-elements-textSecondary'
      }`}
    >
      {enabled ? (hasSecret ? 'Enabled · secret set' : 'Enabled · no secret') : 'Disabled'}
    </span>
  );
}

export default function AdminOauthProvidersPage() {
  const { connectors, loginProviders, apiKeyConnectors } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>() as { status?: string; error?: string } | undefined;

  return (
    <EnterpriseFormPage
      title="OAuth providers"
      description="Configure the OAuth apps used for sign-in and Git connectors. Paste each provider's client ID / secret and register the callback URL shown below in the provider's console. Saved changes take effect immediately — no redeploy."
      status={actionData?.status}
      error={actionData?.error}
    >
      <section className="space-y-6">
        <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-bolt-elements-textSecondary">
          Sign-in providers (editable)
        </h2>
        <p className="text-sm text-bolt-elements-textSecondary">
          These are the social-login OAuth apps. Credentials saved here are stored encrypted and used by the login flow
          DB-first; if left blank the service falls back to the environment variables.
        </p>

        {loginProviders.map((p) => (
          <Form
            method="post"
            key={`login-${p.provider}`}
            className="space-y-4 rounded-lg border border-bolt-elements-borderColor p-4"
          >
            <div className="flex items-center justify-between">
              <strong className="text-bolt-elements-textPrimary">{p.displayName}</strong>
              <StatusPill enabled={p.enabled} hasSecret={p.hasSecret || p.envSecretPresent} />
            </div>

            <input type="hidden" name="kind" value="login" />
            <input type="hidden" name="provider" value={p.provider} />

            <ReadOnlyField
              label="Callback / redirect URL (register this in the provider console)"
              value={p.callbackUrl}
            />

            {!p.hasSecret && p.envClientIdPresent ? (
              <p className="text-xs text-bolt-elements-textSecondary">
                Currently using environment-variable credentials. Saving here overrides them (DB-first).
              </p>
            ) : null}

            <TextField label="Client ID" name="clientId" defaultValue={p.clientId} placeholder="OAuth app client ID" />
            <TextField
              label={p.hasSecret ? 'Client secret (leave blank to keep current)' : 'Client secret'}
              name="clientSecret"
              type="password"
              autoComplete="off"
              placeholder={p.hasSecret ? '•••••••• (unchanged)' : 'OAuth app client secret'}
            />
            <TextField
              label="Scopes (optional, space or comma separated)"
              name="scopes"
              defaultValue={p.scopes.join(' ')}
              placeholder={p.provider === 'google' ? 'openid email profile' : 'read:user user:email'}
            />

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="enabled" defaultChecked={p.enabled} className="h-4 w-4" />
              Enabled (show this sign-in button)
            </label>

            {LOGIN_HOWTO[p.provider] ? <HowTo {...LOGIN_HOWTO[p.provider]} /> : null}

            <TextField
              label="Confirm with your password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />

            <PrimaryButton>Save {p.displayName}</PrimaryButton>
          </Form>
        ))}
      </section>

      <section className="mt-8 space-y-6">
        <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-bolt-elements-textSecondary">
          Git connectors (editable)
        </h2>
        <p className="text-sm text-bolt-elements-textSecondary">
          OAuth apps for the in-IDE Connect flow. These are separate apps from sign-in (different callback URLs).
        </p>

        {connectors.length === 0 ? (
          <p className="text-sm text-bolt-elements-textSecondary">No connector catalog rows found.</p>
        ) : (
          connectors.map((c) => (
            <Form
              method="post"
              key={`connector-${c.provider}`}
              className="space-y-4 rounded-lg border border-bolt-elements-borderColor p-4"
            >
              <div className="flex items-center justify-between">
                <strong className="text-bolt-elements-textPrimary">{c.displayName}</strong>
                <StatusPill enabled={c.enabled} hasSecret={c.hasSecret} />
              </div>

              <input type="hidden" name="kind" value="connector" />
              <input type="hidden" name="provider" value={c.provider} />

              <ReadOnlyField
                label="Callback / redirect URL (register this in the provider console)"
                value={c.callbackUrl}
              />

              <TextField
                label="Client ID"
                name="clientId"
                defaultValue={c.clientId}
                placeholder="OAuth app client ID"
              />
              <TextField
                label={c.hasSecret ? 'Client secret (leave blank to keep current)' : 'Client secret'}
                name="clientSecret"
                type="password"
                autoComplete="off"
                placeholder={c.hasSecret ? '•••••••• (unchanged)' : 'OAuth app client secret'}
              />

              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="enabled" defaultChecked={c.enabled} className="h-4 w-4" />
                Enabled
              </label>

              <div className="text-xs text-bolt-elements-textSecondary">
                Scopes: <span className="font-mono">{c.scopes.join(', ') || '—'}</span>
              </div>

              {CONNECTOR_HOWTO[c.provider] ? <HowTo {...CONNECTOR_HOWTO[c.provider]} /> : null}

              <TextField
                label="Confirm with your password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />

              <PrimaryButton>Save {c.displayName}</PrimaryButton>
            </Form>
          ))
        )}
      </section>

      <section className="mt-8 space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-bolt-elements-textSecondary">
          API-key connectors (per-user token)
        </h2>
        <p className="text-sm text-bolt-elements-textSecondary">
          Deploy/database connectors that use a personal access token rather than a shared OAuth app — each user pastes
          their own token in the IDE Connect panel (validated live and stored encrypted server-side). There is no
          platform-wide secret; enable/disable each connector for the whole instance here.
        </p>

        {apiKeyConnectors.map((c) => (
          <Form
            method="post"
            key={`apikey-${c.provider}`}
            className="space-y-3 rounded-lg border border-bolt-elements-borderColor p-4"
          >
            <div className="flex items-center justify-between">
              <strong className="text-bolt-elements-textPrimary">{c.displayName}</strong>
              <span
                className={`rounded-full px-2 py-0.5 text-xs ${
                  c.enabled
                    ? 'bg-[var(--vc-ide-accent-success)]/15 text-[var(--status-success-text)]'
                    : 'bg-bolt-elements-background-depth-2 text-bolt-elements-textSecondary'
                }`}
              >
                {c.enabled ? 'Enabled · API key (per-user)' : 'Disabled'}
              </span>
            </div>

            <input type="hidden" name="kind" value="apikey" />
            <input type="hidden" name="provider" value={c.provider} />

            <p className="text-xs text-bolt-elements-textSecondary">
              Token console: <span className="font-mono">{c.tokenConsoleUrl}</span>
            </p>
            {API_KEY_HOWTO[c.provider] ? (
              <p className="text-xs text-bolt-elements-textSecondary">{API_KEY_HOWTO[c.provider]}</p>
            ) : null}
            <p className="text-xs text-bolt-elements-textSecondary">
              Per-user connect endpoint: <span className="font-mono">{c.configureEndpoint}</span>
            </p>

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="enabled" defaultChecked={c.enabled} className="h-4 w-4" />
              Enabled (available to users)
            </label>

            <TextField
              label="Confirm with your password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />

            <PrimaryButton>Save {c.displayName}</PrimaryButton>
          </Form>
        ))}
      </section>
    </EnterpriseFormPage>
  );
}
