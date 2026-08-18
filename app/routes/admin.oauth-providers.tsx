import type { MetaFunction } from 'react-router';
import { Form, useActionData, useLoaderData, useNavigation } from 'react-router';
import { EnterpriseFormPage, TextField, PrimaryButton } from '~/components/enterprise/EnterpriseFormPage';
import {
  apiRequest,
  formObject,
  json,
  requirePlatformAdmin,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';
import {
  adminOauthInlineStatus,
  formatAdminOauthCopy,
  formatAdminOauthProviderCount,
  getAdminOauthProviderName,
  getAdminOauthProvidersCopy,
  isAdminOauthProvider,
  resolveAdminOauthErrorCode,
  type AdminOauthErrorCode,
  type AdminOauthProviderKind,
  type AdminOauthProvidersCopy,
  type AdminOauthProvidersKey,
  type AdminOauthStatusCode,
} from '~/lib/i18n/catalogs/admin-oauth-providers';
import { resolveRequestLocale } from '~/lib/i18n/request-locale';

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

type HowToGuide = {
  consoleUrl: string;
  consolePathKey: AdminOauthProvidersKey;
  stepKeys: readonly AdminOauthProvidersKey[];
};

const OAUTH_SCOPE_PLACEHOLDERS = {
  google: 'openid email profile',
  gitProvider: 'read:user user:email',
} as const;

/* Provider URLs remain technical constants; every explanatory sentence lives in the EN/FR catalog. */
const LOGIN_HOWTO: Readonly<Record<string, HowToGuide>> = {
  github: {
    consoleUrl: 'https://github.com/settings/developers',
    consolePathKey: 'adminOauth.howTo.login.github.consolePath',
    stepKeys: [
      'adminOauth.howTo.login.github.step1',
      'adminOauth.howTo.login.github.step2',
      'adminOauth.howTo.login.github.step3',
    ],
  },
  google: {
    consoleUrl: 'https://console.cloud.google.com',
    consolePathKey: 'adminOauth.howTo.login.google.consolePath',
    stepKeys: [
      'adminOauth.howTo.login.google.step1',
      'adminOauth.howTo.login.google.step2',
      'adminOauth.howTo.login.google.step3',
    ],
  },
};

const CONNECTOR_HOWTO: Readonly<Record<string, HowToGuide>> = {
  github: {
    consoleUrl: 'https://github.com/settings/developers',
    consolePathKey: 'adminOauth.howTo.connector.github.consolePath',
    stepKeys: ['adminOauth.howTo.connector.github.step1', 'adminOauth.howTo.connector.github.step2'],
  },
  gitlab: {
    consoleUrl: 'https://gitlab.com/-/profile/applications',
    consolePathKey: 'adminOauth.howTo.connector.gitlab.consolePath',
    stepKeys: ['adminOauth.howTo.connector.gitlab.step1', 'adminOauth.howTo.connector.gitlab.step2'],
  },
  bitbucket: {
    consoleUrl: 'https://bitbucket.org/account/settings/app-passwords/',
    consolePathKey: 'adminOauth.howTo.connector.bitbucket.consolePath',
    stepKeys: ['adminOauth.howTo.connector.bitbucket.step1', 'adminOauth.howTo.connector.bitbucket.step2'],
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

const API_KEY_HOWTO: Readonly<Record<string, AdminOauthProvidersKey>> = {
  vercel: 'adminOauth.howTo.apikey.vercel',
  netlify: 'adminOauth.howTo.apikey.netlify',
  supabase: 'adminOauth.howTo.apikey.supabase',
};

type ActionData = {
  statusCode?: AdminOauthStatusCode;
  errorCode?: AdminOauthErrorCode;
  provider?: string;
  kind?: AdminOauthProviderKind;
};

const SUCCESS_COPY_KEYS = {
  loginSaved: 'adminOauth.success.loginSaved',
  connectorSaved: 'adminOauth.success.connectorSaved',
  apiKeySaved: 'adminOauth.success.apiKeySaved',
} as const satisfies Record<AdminOauthStatusCode, AdminOauthProvidersKey>;

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  const copy = getAdminOauthProvidersCopy(data?.language);

  return [
    { title: copy['adminOauth.meta.title'] },
    { name: 'description', content: copy['adminOauth.meta.description'] },
  ];
};

export { UserAreaRouteErrorBoundary as ErrorBoundary } from '~/components/dashboard/UserAreaRouteError';

export async function loader({ request }: EnterpriseLoaderArgs) {
  await requirePlatformAdmin(request);

  const language = resolveRequestLocale(request).language;

  const [connectorsData, loginData, apiKeyData] = await Promise.all([
    apiRequest<{ connectors: Connector[] }>(request, '/admin/connectors/oauth'),
    apiRequest<{ providers: LoginProvider[] }>(request, '/admin/login-providers'),
    apiRequest<{ connectors: ApiKeyConnector[] }>(request, '/admin/connectors/api-key'),
  ]);

  return json({
    connectors: connectorsData.connectors ?? [],
    loginProviders: loginData.providers ?? [],
    apiKeyConnectors: apiKeyData.connectors ?? [],
    language,
  });
}

async function reauthenticate(request: Request, password: string) {
  await apiRequest(request, '/auth/reauth', {
    method: 'POST',
    redirectOn401: false,
    body: JSON.stringify({ password }),
  });
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

  const provider = body.provider?.trim() ?? '';

  const kind: AdminOauthProviderKind | undefined =
    body.kind === 'login' || body.kind === 'connector' || body.kind === 'apikey' ? body.kind : undefined;

  if (!kind) {
    return json<ActionData>({ errorCode: 'connectorTypeUnsupported' }, { status: 400 });
  }

  if (!provider) {
    return json<ActionData>({ errorCode: 'providerRequired' }, { status: 400 });
  }

  if (!isAdminOauthProvider(kind, provider)) {
    return json<ActionData>({ errorCode: 'providerUnsupported' }, { status: 400 });
  }

  if (!body.password) {
    return json<ActionData>({ errorCode: 'passwordRequired' }, { status: 400 });
  }

  try {
    await reauthenticate(request, body.password);
  } catch (error) {
    return json<ActionData>(
      { errorCode: await resolveAdminOauthErrorCode(error, 'reauth') },
      { status: adminOauthInlineStatus(error) },
    );
  }

  /*
   * Only send clientSecret when the admin actually typed a new one, so an empty
   * field leaves the stored (write-only) secret untouched rather than clearing it.
   */
  const payload: Record<string, unknown> = {
    provider,
    enabled: body.enabled === 'on' || body.enabled === 'true',
  };

  if (typeof body.clientId === 'string') {
    payload.clientId = body.clientId.trim();
  }

  if (typeof body.clientSecret === 'string' && body.clientSecret.length > 0) {
    payload.clientSecret = body.clientSecret;
  }

  const isLogin = kind === 'login';
  const isApiKey = kind === 'apikey';

  const endpoint = isLogin
    ? '/admin/login-providers'
    : isApiKey
      ? '/admin/connectors/api-key'
      : '/admin/connectors/oauth';

  if (isLogin && typeof body.scopes === 'string') {
    payload.scopes = body.scopes;
  }

  // The api-key toggle endpoint only accepts { provider, enabled }.
  const sentPayload = isApiKey ? { provider, enabled: payload.enabled } : payload;

  try {
    await apiRequest(request, endpoint, {
      method: 'POST',
      redirectOn401: false,
      body: JSON.stringify(sentPayload),
    });

    const statusCode: AdminOauthStatusCode = isLogin ? 'loginSaved' : isApiKey ? 'apiKeySaved' : 'connectorSaved';

    return json<ActionData>({ statusCode, provider, kind });
  } catch (error) {
    return json<ActionData>(
      { errorCode: await resolveAdminOauthErrorCode(error, 'save') },
      { status: adminOauthInlineStatus(error) },
    );
  }
}

function ReadOnlyField({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <label className="block min-w-0 break-words text-sm font-medium">
      {label}
      <input
        readOnly
        value={value}
        title={hint}
        onFocus={(e) => e.currentTarget.select()}
        className="mt-2 w-full max-w-full select-all rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-2 font-mono text-xs text-bolt-elements-textSecondary outline-none"
      />
    </label>
  );
}

function HowTo({ guide, copy }: { guide: HowToGuide; copy: AdminOauthProvidersCopy }) {
  return (
    <details className="min-w-0 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-xs">
      <summary className="cursor-pointer break-words font-medium text-bolt-elements-textSecondary">
        {copy['adminOauth.howTo.summary']}
      </summary>
      <p className="mt-2 min-w-0 break-words text-bolt-elements-textSecondary">
        {copy['adminOauth.howTo.console']} <span className="break-all font-mono">{guide.consoleUrl}</span>
        {' · '}
        <span>{copy[guide.consolePathKey]}</span>
      </p>
      <ol className="mt-2 list-decimal space-y-1 pl-4 text-bolt-elements-textSecondary">
        {guide.stepKeys.map((key) => (
          <li className="break-words" key={key}>
            {copy[key]}
          </li>
        ))}
      </ol>
    </details>
  );
}

function StatusPill({
  enabled,
  hasSecret,
  apiKey,
  copy,
}: {
  enabled: boolean;
  hasSecret?: boolean;
  apiKey?: boolean;
  copy: AdminOauthProvidersCopy;
}) {
  const label = enabled
    ? apiKey
      ? copy['adminOauth.status.apiKeyEnabled']
      : hasSecret
        ? copy['adminOauth.status.enabledSecret']
        : copy['adminOauth.status.enabledNoSecret']
    : copy['adminOauth.status.disabled'];

  return (
    <span
      className={`max-w-full break-words rounded-full px-2 py-0.5 text-center text-xs ${
        enabled && (apiKey || hasSecret)
          ? 'bg-[color-mix(in_srgb,var(--vc-ide-accent-success)_15%,transparent)] text-[var(--status-success-text)]'
          : 'bg-bolt-elements-background-depth-2 text-bolt-elements-textSecondary'
      }`}
    >
      {label}
    </span>
  );
}

function SectionHeader({
  id,
  title,
  description,
  count,
}: {
  id: string;
  title: string;
  description: string;
  count: string;
}) {
  return (
    <div className="min-w-0 space-y-2">
      <div className="flex min-w-0 flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h2
          className="min-w-0 break-words text-sm font-semibold uppercase tracking-[0.18em] text-bolt-elements-textSecondary"
          id={id}
        >
          {title}
        </h2>
        <span className="shrink-0 rounded-full bg-bolt-elements-background-depth-2 px-2 py-0.5 text-xs text-bolt-elements-textSecondary">
          {count}
        </span>
      </div>
      <p className="min-w-0 break-words text-sm text-bolt-elements-textSecondary">{description}</p>
    </div>
  );
}

export default function AdminOauthProvidersPage() {
  const { connectors, loginProviders, apiKeyConnectors, language } = useLoaderData<typeof loader>();
  const copy = getAdminOauthProvidersCopy(language);
  const actionData = useActionData<typeof action>() as ActionData | undefined;
  const navigation = useNavigation();
  const mutationBusy = navigation.state !== 'idle';
  const submittingProvider = navigation.formData?.get('provider');
  const submittingKind = navigation.formData?.get('kind');

  const actionProviderName =
    actionData?.provider && actionData.kind
      ? getAdminOauthProviderName(actionData.kind, actionData.provider, language)
      : undefined;

  const successKey = actionData?.statusCode ? SUCCESS_COPY_KEYS[actionData.statusCode] : undefined;

  const status =
    successKey && actionProviderName
      ? formatAdminOauthCopy(copy[successKey], { provider: actionProviderName })
      : undefined;

  const error = actionData?.errorCode ? copy[`adminOauth.error.${actionData.errorCode}`] : undefined;

  const isSubmitting = (kind: AdminOauthProviderKind, provider: string) =>
    mutationBusy && submittingKind === kind && submittingProvider === provider;

  return (
    <EnterpriseFormPage
      title={copy['adminOauth.page.title']}
      description={copy['adminOauth.page.description']}
      status={status}
      error={error}
    >
      <section className="min-w-0 space-y-6" aria-labelledby="admin-oauth-login-title">
        <SectionHeader
          id="admin-oauth-login-title"
          title={copy['adminOauth.section.login.title']}
          description={copy['adminOauth.section.login.description']}
          count={formatAdminOauthProviderCount(loginProviders.length, language)}
        />

        {loginProviders.length === 0 ? (
          <p
            className="min-w-0 break-words rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-3 text-sm text-bolt-elements-textSecondary"
            role="status"
          >
            {copy['adminOauth.section.login.empty']}
          </p>
        ) : (
          loginProviders.map((provider) => {
            const providerName = getAdminOauthProviderName('login', provider.provider, language);
            const guide = LOGIN_HOWTO[provider.provider];
            const saving = isSubmitting('login', provider.provider);

            return (
              <Form
                method="post"
                key={`login-${provider.provider}`}
                className="min-w-0 space-y-4 overflow-hidden rounded-lg border border-bolt-elements-borderColor p-4"
              >
                <div className="flex min-w-0 flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <strong className="min-w-0 break-words text-bolt-elements-textPrimary">{providerName}</strong>
                  <StatusPill
                    enabled={provider.enabled}
                    hasSecret={provider.hasSecret || provider.envSecretPresent}
                    copy={copy}
                  />
                </div>

                <input type="hidden" name="kind" value="login" />
                <input type="hidden" name="provider" value={provider.provider} />

                <ReadOnlyField
                  label={copy['adminOauth.field.callbackUrl']}
                  value={provider.callbackUrl}
                  hint={copy['adminOauth.field.readOnlyHint']}
                />

                {!provider.hasSecret && provider.envClientIdPresent ? (
                  <p className="min-w-0 break-words text-xs text-bolt-elements-textSecondary">
                    {copy['adminOauth.field.environmentFallback']}
                  </p>
                ) : null}

                <TextField
                  label={copy['adminOauth.field.clientId']}
                  name="clientId"
                  defaultValue={provider.clientId}
                  placeholder={copy['adminOauth.field.clientIdPlaceholder']}
                />
                <TextField
                  label={
                    provider.hasSecret
                      ? copy['adminOauth.field.clientSecretKeep']
                      : copy['adminOauth.field.clientSecret']
                  }
                  name="clientSecret"
                  type="password"
                  autoComplete="off"
                  placeholder={
                    provider.hasSecret
                      ? copy['adminOauth.field.clientSecretKeepPlaceholder']
                      : copy['adminOauth.field.clientSecretPlaceholder']
                  }
                />
                <TextField
                  label={copy['adminOauth.field.scopes']}
                  name="scopes"
                  defaultValue={provider.scopes.join(' ')}
                  placeholder={
                    provider.provider === 'google'
                      ? OAUTH_SCOPE_PLACEHOLDERS.google
                      : OAUTH_SCOPE_PLACEHOLDERS.gitProvider
                  }
                />

                <label className="flex min-w-0 items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="enabled"
                    defaultChecked={provider.enabled}
                    className="mt-0.5 h-4 w-4 shrink-0"
                  />
                  <span className="min-w-0 break-words">{copy['adminOauth.field.enabledLogin']}</span>
                </label>

                {guide ? <HowTo guide={guide} copy={copy} /> : null}

                <TextField
                  label={copy['adminOauth.field.password']}
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                />

                <div className="grid min-w-0 sm:inline-grid [&_button]:!h-auto [&_button]:min-h-[44px] [&_button]:max-w-full [&_button]:!whitespace-normal [&_button]:break-words [&_button]:text-center [&_button]:leading-tight">
                  <PrimaryButton disabled={mutationBusy} aria-busy={saving}>
                    {formatAdminOauthCopy(copy[saving ? 'adminOauth.action.saving' : 'adminOauth.action.save'], {
                      provider: providerName,
                    })}
                  </PrimaryButton>
                </div>
              </Form>
            );
          })
        )}
      </section>

      <section className="mt-8 min-w-0 space-y-6" aria-labelledby="admin-oauth-connectors-title">
        <SectionHeader
          id="admin-oauth-connectors-title"
          title={copy['adminOauth.section.connector.title']}
          description={copy['adminOauth.section.connector.description']}
          count={formatAdminOauthProviderCount(connectors.length, language)}
        />

        {connectors.length === 0 ? (
          <p
            className="min-w-0 break-words rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-3 text-sm text-bolt-elements-textSecondary"
            role="status"
          >
            {copy['adminOauth.section.connector.empty']}
          </p>
        ) : (
          connectors.map((provider) => {
            const providerName = getAdminOauthProviderName('connector', provider.provider, language);
            const guide = CONNECTOR_HOWTO[provider.provider];
            const saving = isSubmitting('connector', provider.provider);

            return (
              <Form
                method="post"
                key={`connector-${provider.provider}`}
                className="min-w-0 space-y-4 overflow-hidden rounded-lg border border-bolt-elements-borderColor p-4"
              >
                <div className="flex min-w-0 flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <strong className="min-w-0 break-words text-bolt-elements-textPrimary">{providerName}</strong>
                  <StatusPill enabled={provider.enabled} hasSecret={provider.hasSecret} copy={copy} />
                </div>

                <input type="hidden" name="kind" value="connector" />
                <input type="hidden" name="provider" value={provider.provider} />

                <ReadOnlyField
                  label={copy['adminOauth.field.callbackUrl']}
                  value={provider.callbackUrl}
                  hint={copy['adminOauth.field.readOnlyHint']}
                />

                <TextField
                  label={copy['adminOauth.field.clientId']}
                  name="clientId"
                  defaultValue={provider.clientId}
                  placeholder={copy['adminOauth.field.clientIdPlaceholder']}
                />
                <TextField
                  label={
                    provider.hasSecret
                      ? copy['adminOauth.field.clientSecretKeep']
                      : copy['adminOauth.field.clientSecret']
                  }
                  name="clientSecret"
                  type="password"
                  autoComplete="off"
                  placeholder={
                    provider.hasSecret
                      ? copy['adminOauth.field.clientSecretKeepPlaceholder']
                      : copy['adminOauth.field.clientSecretPlaceholder']
                  }
                />

                <label className="flex min-w-0 items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="enabled"
                    defaultChecked={provider.enabled}
                    className="mt-0.5 h-4 w-4 shrink-0"
                  />
                  <span className="min-w-0 break-words">{copy['adminOauth.field.enabled']}</span>
                </label>

                <div className="min-w-0 break-words text-xs text-bolt-elements-textSecondary">
                  {copy['adminOauth.field.scopesLabel']}{' '}
                  <span className="break-all font-mono">{provider.scopes.join(', ') || '—'}</span>
                </div>

                {guide ? <HowTo guide={guide} copy={copy} /> : null}

                <TextField
                  label={copy['adminOauth.field.password']}
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                />

                <div className="grid min-w-0 sm:inline-grid [&_button]:!h-auto [&_button]:min-h-[44px] [&_button]:max-w-full [&_button]:!whitespace-normal [&_button]:break-words [&_button]:text-center [&_button]:leading-tight">
                  <PrimaryButton disabled={mutationBusy} aria-busy={saving}>
                    {formatAdminOauthCopy(copy[saving ? 'adminOauth.action.saving' : 'adminOauth.action.save'], {
                      provider: providerName,
                    })}
                  </PrimaryButton>
                </div>
              </Form>
            );
          })
        )}
      </section>

      <section className="mt-8 min-w-0 space-y-6" aria-labelledby="admin-oauth-api-key-title">
        <SectionHeader
          id="admin-oauth-api-key-title"
          title={copy['adminOauth.section.apikey.title']}
          description={copy['adminOauth.section.apikey.description']}
          count={formatAdminOauthProviderCount(apiKeyConnectors.length, language)}
        />

        {apiKeyConnectors.length === 0 ? (
          <p
            className="min-w-0 break-words rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-3 text-sm text-bolt-elements-textSecondary"
            role="status"
          >
            {copy['adminOauth.section.apikey.empty']}
          </p>
        ) : (
          apiKeyConnectors.map((provider) => {
            const providerName = getAdminOauthProviderName('apikey', provider.provider, language);
            const guideKey = API_KEY_HOWTO[provider.provider];
            const saving = isSubmitting('apikey', provider.provider);

            return (
              <Form
                method="post"
                key={`apikey-${provider.provider}`}
                className="min-w-0 space-y-3 overflow-hidden rounded-lg border border-bolt-elements-borderColor p-4"
              >
                <div className="flex min-w-0 flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <strong className="min-w-0 break-words text-bolt-elements-textPrimary">{providerName}</strong>
                  <StatusPill enabled={provider.enabled} apiKey copy={copy} />
                </div>

                <input type="hidden" name="kind" value="apikey" />
                <input type="hidden" name="provider" value={provider.provider} />

                <p className="min-w-0 break-words text-xs text-bolt-elements-textSecondary">
                  {copy['adminOauth.field.tokenConsole']}{' '}
                  <span className="break-all font-mono">{provider.tokenConsoleUrl}</span>
                </p>
                {guideKey ? (
                  <p className="min-w-0 break-words text-xs text-bolt-elements-textSecondary">{copy[guideKey]}</p>
                ) : null}
                <p className="min-w-0 break-words text-xs text-bolt-elements-textSecondary">
                  {copy['adminOauth.field.connectEndpoint']}{' '}
                  <span className="break-all font-mono">{provider.configureEndpoint}</span>
                </p>

                <label className="flex min-w-0 items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="enabled"
                    defaultChecked={provider.enabled}
                    className="mt-0.5 h-4 w-4 shrink-0"
                  />
                  <span className="min-w-0 break-words">{copy['adminOauth.field.enabledForUsers']}</span>
                </label>

                <TextField
                  label={copy['adminOauth.field.password']}
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                />

                <div className="grid min-w-0 sm:inline-grid [&_button]:!h-auto [&_button]:min-h-[44px] [&_button]:max-w-full [&_button]:!whitespace-normal [&_button]:break-words [&_button]:text-center [&_button]:leading-tight">
                  <PrimaryButton disabled={mutationBusy} aria-busy={saving}>
                    {formatAdminOauthCopy(copy[saving ? 'adminOauth.action.saving' : 'adminOauth.action.save'], {
                      provider: providerName,
                    })}
                  </PrimaryButton>
                </div>
              </Form>
            );
          })
        )}
      </section>
    </EnterpriseFormPage>
  );
}
