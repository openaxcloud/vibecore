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
 * Git connectors (GitHub / GitLab / Bitbucket) are DB-backed and editable here:
 * the connect flow reads these credentials DB-first (see /admin/connectors/oauth
 * + connectorCredentialsFor). The client secret is WRITE-ONLY — it is never
 * returned to the browser, only whether one is set (`hasSecret`).
 *
 * Login providers (GitHub login + Google via OIDC) are configured via environment
 * variables on the API service today, so they are shown here as a read-only
 * reference (callback URL + the env var names to set) rather than an editable
 * form. Making login providers DB-editable is a separate backend change.
 *
 * Reached by direct URL at /admin/oauth-providers; gated to platform-admin like
 * the rest of /admin/*.
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

const APP_ORIGIN = 'https://app.e-code.ai';

const LOGIN_PROVIDERS = [
  {
    name: 'GitHub (login)',
    callbackUrl: `${APP_ORIGIN}/auth/oidc/callback`,
    clientIdEnv: 'GITHUB_CLIENT_ID',
    clientSecretEnv: 'GITHUB_CLIENT_SECRET',
    console: 'https://github.com/settings/developers → OAuth Apps',
  },
  {
    name: 'Google (login)',
    callbackUrl: `${APP_ORIGIN}/auth/oidc/callback`,
    clientIdEnv: 'GOOGLE_CLIENT_ID',
    clientSecretEnv: 'GOOGLE_CLIENT_SECRET',
    console: 'https://console.cloud.google.com → APIs & Services → Credentials',
  },
] as const;

export async function loader({ request }: EnterpriseLoaderArgs) {
  await requirePlatformAdmin(request);

  const data = await apiRequest<{ connectors: Connector[] }>(request, '/admin/connectors/oauth');

  return json({ connectors: data.connectors ?? [] });
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
    provider?: string;
    clientId?: string;
    clientSecret?: string;
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

  try {
    await apiRequest(request, '/admin/connectors/oauth', {
      method: 'POST',
      redirectOn401: false,
      body: JSON.stringify(payload),
    });

    return json({ status: `${body.provider} OAuth configuration saved.` });
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

export default function AdminOauthProvidersPage() {
  const { connectors } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>() as { status?: string; error?: string } | undefined;

  return (
    <EnterpriseFormPage
      title="OAuth providers"
      description="Configure the OAuth apps used for Git connectors and sign-in. Paste each provider's client ID / secret and register the callback URL shown below in the provider's console."
      status={actionData?.status}
      error={actionData?.error}
    >
      <section className="space-y-6">
        <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-bolt-elements-textSecondary">
          Git connectors (editable)
        </h2>

        {connectors.length === 0 ? (
          <p className="text-sm text-bolt-elements-textSecondary">No connector catalog rows found.</p>
        ) : (
          connectors.map((c) => (
            <Form
              method="post"
              key={c.provider}
              className="space-y-4 rounded-lg border border-bolt-elements-borderColor p-4"
            >
              <div className="flex items-center justify-between">
                <strong className="text-bolt-elements-textPrimary">{c.displayName}</strong>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    c.enabled && c.hasSecret
                      ? 'bg-[var(--ecode-accent)]/15 text-[var(--ecode-accent)]'
                      : 'bg-bolt-elements-background-depth-2 text-bolt-elements-textSecondary'
                  }`}
                >
                  {c.enabled ? (c.hasSecret ? 'Enabled · secret set' : 'Enabled · no secret') : 'Disabled'}
                </span>
              </div>

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

              <TextField
                label="Confirm with your password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />

              <div className="text-xs text-bolt-elements-textSecondary">
                Scopes: <span className="font-mono">{c.scopes.join(', ') || '—'}</span>
              </div>

              <PrimaryButton>Save {c.displayName}</PrimaryButton>
            </Form>
          ))
        )}
      </section>

      <section className="mt-8 space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-bolt-elements-textSecondary">
          Sign-in providers (environment-configured)
        </h2>
        <p className="text-sm text-bolt-elements-textSecondary">
          Login providers are read from environment variables on the API service. Register the callback URL below in
          each provider console and set the matching variables; making these editable here is a separate backend change.
        </p>

        {LOGIN_PROVIDERS.map((p) => (
          <div key={p.name} className="space-y-3 rounded-lg border border-bolt-elements-borderColor p-4">
            <strong className="text-bolt-elements-textPrimary">{p.name}</strong>
            <ReadOnlyField label="Callback / redirect URL" value={p.callbackUrl} />
            <div className="grid gap-3 sm:grid-cols-2">
              <ReadOnlyField label="Client ID env var" value={p.clientIdEnv} />
              <ReadOnlyField label="Client secret env var" value={p.clientSecretEnv} />
            </div>
            <p className="text-xs text-bolt-elements-textSecondary">Console: {p.console}</p>
          </div>
        ))}
      </section>
    </EnterpriseFormPage>
  );
}
