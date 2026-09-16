import { CheckCircle, Chrome, Code2, Eye, EyeOff, Github, KeyRound, Lock, Mail, Shield, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { MetaFunction } from 'react-router';
import { Form, Link, useActionData, useLoaderData, useNavigation } from 'react-router';
import { AuthField, AuthOauthButton, AuthScreen, AuthSubmit, useAuthOauthPending } from '~/components/auth/AuthScreen';
import { FieldError, fieldErrorProps } from '~/components/ui/FieldError';
import { AUTH_HERO_STATS } from '~/lib/auth-hero-stats';
import {
  apiRequest,
  apiBaseUrl,
  formObject,
  json,
  readEnv,
  redirect,
  safeReturnTo,
  sessionCookie,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';
import type { TranslationKey } from '~/lib/i18n/dictionary';
import { resolveRequestLocale } from '~/lib/i18n/request-locale';
import { translateServerMessage } from '~/lib/i18n/server';
import { invalidateRuntimeToken } from '~/lib/runtime/RuntimeAdapterProvider';

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  const language = data?.language ?? 'en';

  return [
    { title: translateServerMessage(language, 'auth.login.metaTitle') },
    { name: 'description', content: translateServerMessage(language, 'auth.login.metaDescription') },
  ];
};

export type LoginFeedbackCode =
  | 'AUTH_INVALID_CREDENTIALS'
  | 'USER_SUSPENDED'
  | 'AUTH_MFA_REQUIRED'
  | 'AUTH_INVALID_MFA_CODE'
  | 'SSO_ENFORCED'
  | 'RATE_LIMITED_SECONDS'
  | 'RATE_LIMITED_MINUTES'
  | 'RATE_LIMITED_DEFAULT'
  | 'AUTH_LOGIN_FAILED'
  | 'AUTH_LOGIN_UNAVAILABLE';

const LOGIN_FEEDBACK_KEYS = {
  AUTH_INVALID_CREDENTIALS: 'auth.feedback.invalidCredentials',
  USER_SUSPENDED: 'auth.feedback.suspended',
  AUTH_MFA_REQUIRED: 'auth.feedback.mfaRequired',
  AUTH_INVALID_MFA_CODE: 'auth.feedback.invalidMfa',
  SSO_ENFORCED: 'auth.feedback.ssoEnforced',
  RATE_LIMITED_SECONDS: 'auth.feedback.rateLimitedSeconds',
  RATE_LIMITED_MINUTES: 'auth.feedback.rateLimitedMinutes',
  RATE_LIMITED_DEFAULT: 'auth.feedback.rateLimitedDefault',
  AUTH_LOGIN_FAILED: 'auth.feedback.loginFailed',
  AUTH_LOGIN_UNAVAILABLE: 'auth.feedback.loginUnavailable',
} as const satisfies Record<LoginFeedbackCode, TranslationKey>;

const OAUTH_ERROR_KEYS = {
  access_denied: 'auth.oauth.accessDenied',
  invalid_callback: 'auth.oauth.invalidCallback',
  temporarily_unavailable: 'auth.oauth.unavailable',
  not_configured: 'auth.oauth.unavailable',
  unsupported_provider: 'auth.oauth.unsupported',
  callback_failed: 'auth.oauth.callbackFailed',
  api_unreachable: 'auth.oauth.apiUnavailable',
  bad_response: 'auth.oauth.invalidResponse',
  missing_token: 'auth.oauth.invalidResponse',
} as const satisfies Record<string, TranslationKey>;

const LOGIN_FEATURES = [
  { icon: Shield, key: 'auth.login.featureSecurity' },
  { icon: Sparkles, key: 'auth.login.featureAgent' },
  { icon: Code2, key: 'auth.login.featureIde' },
  { icon: CheckCircle, key: 'auth.login.featureProduction' },
] as const;

export function oauthErrorTranslationKey(code?: string | null): TranslationKey {
  if (!code) {
    return 'auth.oauth.generic';
  }

  return OAUTH_ERROR_KEYS[code.trim().toLowerCase() as keyof typeof OAUTH_ERROR_KEYS] ?? 'auth.oauth.generic';
}

export function loginFeedbackFromFailure(
  apiCode: string | undefined,
  status: number,
  retryAfterHeader: string | null,
): { errorCode: LoginFeedbackCode; errorParams?: { count: number } } {
  if (status === 429) {
    const retryAfterSeconds = Number(retryAfterHeader);

    if (!Number.isFinite(retryAfterSeconds) || retryAfterSeconds <= 0) {
      return { errorCode: 'RATE_LIMITED_DEFAULT' };
    }

    if (retryAfterSeconds >= 90) {
      return {
        errorCode: 'RATE_LIMITED_MINUTES',
        errorParams: { count: Math.ceil(retryAfterSeconds / 60) },
      };
    }

    return {
      errorCode: 'RATE_LIMITED_SECONDS',
      errorParams: { count: Math.round(retryAfterSeconds) },
    };
  }

  switch (apiCode) {
    case 'AUTH_INVALID_CREDENTIALS':
    case 'USER_SUSPENDED':
    case 'AUTH_MFA_REQUIRED':
    case 'AUTH_INVALID_MFA_CODE':
    case 'SSO_ENFORCED':
      return { errorCode: apiCode };
    default:
      return { errorCode: 'AUTH_LOGIN_FAILED' };
  }
}

/*
 * Marketing host (`e-code.ai`) shouldn't expose the sign-in form. The
 * canonical sign-in URL is `https://app.e-code.ai/login` — visitors who
 * hit `e-code.ai/login` (or `www.e-code.ai/login`) are 301-redirected
 * there so OAuth callbacks, password managers and SEO all converge.
 */
export async function loader({ request }: EnterpriseLoaderArgs) {
  const host = request.headers.get('host')?.toLowerCase() ?? '';

  if (host === 'e-code.ai' || host === 'www.e-code.ai') {
    const requestUrl = new URL(request.url);
    const loginUrl = new URL('https://app.e-code.ai/login');
    const returnTo = safeReturnTo(requestUrl.searchParams.get('returnTo'));

    if (returnTo) {
      loginUrl.searchParams.set('returnTo', returnTo);
    }

    return redirect(loginUrl.toString(), { status: 301 });
  }

  const url = new URL(request.url);
  const oauth = url.searchParams.get('oauth');
  const oauthError = url.searchParams.get('error');
  const oauthDetail = url.searchParams.get('detail');

  /*
   * Social-login provider readiness so we only show sign-in buttons that actually
   * work (an admin can disable / not-configure github or google). Best-effort: on
   * any failure we fall back to showing both buttons (never hide on an API hiccup).
   */
  let providers: Array<{ provider: string; ready: boolean }> = [];

  try {
    const result = await apiRequest<{ providers: Array<{ provider: string; ready: boolean }> }>(
      request,
      '/auth/oauth/providers',
      { redirectOn401: false },
    );
    providers = result.providers ?? [];
  } catch {
    providers = [];
  }

  return json({
    language: resolveRequestLocale(request).language,
    oauth: oauth && oauthError ? { provider: oauth, error: oauthError, detail: oauthDetail } : null,
    providers,
  });
}

export async function action({ request }: EnterpriseActionArgs) {
  const body = formObject(await request.formData());
  const rememberMe = body.rememberMe === 'on' || body.rememberMe === 'true';
  const mfaCode = typeof body.mfaCode === 'string' ? body.mfaCode.trim() : '';

  try {
    const result = await apiRequest<{
      token: string;
      user?: { name?: string; email?: string; mfaEnabled?: boolean; platformAdmin?: boolean };
    }>(request, '/auth/login', {
      method: 'POST',
      redirectOn401: false,
      body: JSON.stringify({
        email: body.email,
        password: body.password,
        ...(mfaCode ? { mfaCode } : {}),
      }),
    });

    const requestUrl = new URL(request.url);

    const returnToParam =
      safeReturnTo(requestUrl.searchParams.get('returnTo')) ??
      safeReturnTo(typeof body.returnTo === 'string' ? body.returnTo : null);

    const mustEnrollMfa =
      readEnv('ADMIN_MFA_REQUIRED') !== 'false' && result.user?.platformAdmin && !result.user.mfaEnabled;

    const redirectTo = mustEnrollMfa ? '/mfa-setup' : (returnToParam ?? '/dashboard');

    return redirect(redirectTo, {
      headers: {
        'Set-Cookie': sessionCookie(result.token, rememberMe ? 60 * 60 * 24 * 30 : undefined),
      },
    });
  } catch (error) {
    if (error instanceof Response) {
      let code: string | undefined;

      try {
        const payload = (await error.json()) as { error?: string; code?: string };
        code = payload.code;
      } catch {
        // The UI intentionally ignores server prose and renders a stable localized fallback.
      }

      const feedback = loginFeedbackFromFailure(code, error.status, error.headers.get('retry-after'));

      const mfaRequired = code === 'AUTH_MFA_REQUIRED';

      return json(
        {
          ...feedback,
          code,
          mfaRequired,
          email: typeof body.email === 'string' ? body.email : '',

          /*
           * The API re-verifies the password on the MFA-completion step, but
           * the password input is uncontrolled and resets on re-render. Echo
           * it back ONLY when MFA is required so the second submit can carry
           * email + password + mfaCode together; otherwise the MFA login can
           * never complete. Not exposed elsewhere (no logging, hidden input).
           */
          password: mfaRequired && typeof body.password === 'string' ? body.password : '',
          rememberMe,
        },
        { status: error.status },
      );
    }

    /*
     * Do NOT leak the internal in-cluster API hostname (apiBaseUrl()) to end
     * users. Log the target server-side; show a generic message.
     */
    console.error(`Login failed: API service not reachable at ${apiBaseUrl()}`);

    return json(
      {
        errorCode: 'AUTH_LOGIN_UNAVAILABLE' as const,
      },
      { status: 503 },
    );
  }
}

export default function LoginPage() {
  const { t } = useTranslation();
  const actionData = useActionData<typeof action>();

  /*
   * Drop any cached runtime token when the login screen mounts. All logout paths
   * redirect here, and the token cache is a module-global that survives SPA
   * navigation — without this, the next user to log in in the SAME tab would
   * reuse the previous user's runtime token (cross-user reuse).
   */
  useEffect(() => {
    invalidateRuntimeToken();
  }, []);

  const loaderData = useLoaderData<typeof loader>() as
    | {
        oauth?: { provider: string; error: string; detail?: string | null } | null;
        providers?: Array<{ provider: string; ready: boolean }>;
        language?: string;
      }
    | undefined;

  /*
   * Show a social-login button only when its provider is ready (or when readiness
   * is unknown — API hiccup — so we never hide a working provider). A provider
   * explicitly reported not-ready (admin-disabled / unconfigured) is hidden.
   */
  const providerReady = (provider: string) =>
    loaderData?.providers?.find((p) => p.provider === provider)?.ready !== false;

  const loginActionData = actionData as
    | {
        errorCode?: LoginFeedbackCode;
        errorParams?: { count: number };
        code?: string;
        mfaRequired?: boolean;
        email?: string;
        password?: string;
        rememberMe?: boolean;
      }
    | undefined;

  const oauthProviderLabel = loaderData?.oauth
    ? (({ github: 'GitHub', google: 'Google', microsoft: 'Microsoft Entra ID' } as const)[
        loaderData.oauth.provider.toLowerCase() as 'github' | 'google' | 'microsoft'
      ] ?? t('auth.oauth.identityProvider'))
    : '';
  const oauthErrorMessage = loaderData?.oauth
    ? t(oauthErrorTranslationKey(loaderData.oauth.error), { provider: oauthProviderLabel })
    : null;

  const navigation = useNavigation();
  const isSubmitting = navigation.state === 'submitting';
  const { pendingProvider, startOAuth } = useAuthOauthPending();
  const [showPassword, setShowPassword] = useState(false);
  const mfaRequired = Boolean(loginActionData?.mfaRequired);

  const actionError = loginActionData?.errorCode
    ? t(LOGIN_FEEDBACK_KEYS[loginActionData.errorCode], loginActionData.errorParams)
    : undefined;

  const error = actionError ?? oauthErrorMessage ?? undefined;

  /*
   * E9 field-level errors: the ONLY per-field states the API distinguishes.
   * A generic 401 marks both credential fields (anti-enumeration — the API
   * never says which one is wrong); an invalid MFA code marks the code field.
   */
  const credentialsError = loginActionData?.code === 'AUTH_INVALID_CREDENTIALS' ? actionError : undefined;
  const mfaCodeError = loginActionData?.code === 'AUTH_INVALID_MFA_CODE' ? actionError : undefined;

  /*
   * E9 a11y: on every failed submit, move focus to the role="alert" banner
   * (tabIndex -1) so keyboard/screen-reader users land on the explanation
   * instead of a silently re-rendered form. Keyed on the actionData object —
   * a fresh instance arrives per submit, so repeat failures re-focus.
   */
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (loginActionData?.errorCode) {
      errorRef.current?.focus();
    }
  }, [loginActionData]);

  return (
    <AuthScreen
      eyebrow={t('auth.login.eyebrow')}
      title={t('auth.login.title')}
      description={t('auth.login.description')}
      backTo="/"
      backLabel={t('auth.common.backHome')}
      heroEyebrow={t('auth.login.heroEyebrow')}
      heroTitle={t('auth.login.heroTitle')}
      heroBody={t('auth.login.heroBody')}
      heroAside={
        <>
          <div className="mt-9 grid gap-4">
            {LOGIN_FEATURES.map((feature) => {
              const Icon = feature.icon;

              return (
                <div key={feature.key} className="flex items-center gap-3">
                  <div className="vc-auth-hero-chip grid h-10 w-10 place-items-center rounded-lg backdrop-blur-md">
                    <Icon className="h-5 w-5" />
                  </div>
                  <span className="vc-auth-hero-feature text-[14px] font-medium">{t(feature.key)}</span>
                </div>
              );
            })}
          </div>

          <div className="vc-auth-hero-divider mt-10 grid grid-cols-2 gap-5 border-t pt-8">
            {AUTH_HERO_STATS.slice(0, 2).map((item) => (
              <div key={item.value}>
                <div className="text-3xl font-bold">{item.value}</div>
                <div className="vc-auth-hero-stat-label mt-1 text-[12px]">{t(item.labelKey)}</div>
              </div>
            ))}
          </div>
        </>
      }
      footer={
        <>
          {t('auth.login.footerPrompt')}{' '}
          <Link to="/register" className="vc-auth-link font-semibold hover:underline">
            {t('auth.login.registerFree')}
          </Link>
        </>
      }
      belowCard={
        <>
          <div className="vc-auth-mobile-stats mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:hidden">
            {AUTH_HERO_STATS.map((item) => (
              <div key={item.value} className="vc-auth-mobile-stat rounded-lg px-3 py-3 text-center">
                <div className="text-[16px] font-bold">{item.value}</div>
                <div className="mt-1 text-[11px]">{t(item.labelKey)}</div>
              </div>
            ))}
          </div>

          <p className="vc-auth-legal mt-5 text-center text-[11px] leading-5 sm:mt-6">
            {t('auth.login.legalPrefix')}{' '}
            <Link to="/terms" className="underline">
              {t('auth.common.terms')}
            </Link>{' '}
            {t('auth.common.and')}{' '}
            <Link to="/privacy" className="underline">
              {t('auth.common.privacyPolicy')}
            </Link>
            .
          </p>
        </>
      }
    >
      {/*
       * Rendered locally (not via AuthScreen's `error` prop) so the banner can
       * carry a ref + tabIndex={-1} and receive focus on failed submits. Same
       * slot position and classes as the shell's own error banner.
       */}
      {error ? (
        <div
          ref={errorRef}
          tabIndex={-1}
          role="alert"
          className="vc-auth-alert vc-auth-alert-error mb-4 rounded-md px-3 py-2 text-[12px] outline-none"
        >
          {error}
        </div>
      ) : null}

      <Form method="post" className="space-y-4 sm:space-y-5">
        <div>
          <AuthField
            label={t('auth.common.email')}
            name="email"
            type="email"
            autoComplete="email"
            required
            defaultValue={loginActionData?.email ?? ''}
            placeholder={t('auth.common.emailPlaceholder')}
            icon={<Mail className="h-4 w-4" />}
            inputProps={fieldErrorProps('login-email', credentialsError)}
          />
          <FieldError fieldId="login-email" error={credentialsError} />
        </div>

        {/*
         * On the MFA step the password was already entered and verified on the
         * first submit; it is carried forward in a hidden input below. Hide the
         * visible password field entirely so (a) the user only enters the MFA
         * code, and (b) we never render two inputs named `password` (formObject
         * is last-key-wins, which would otherwise clobber the carry-forward).
         */}
        {mfaRequired ? null : (
          <label className="block">
            <span className="mb-2 flex items-center justify-between">
              <span className="vc-auth-label text-[13px] font-medium">{t('auth.common.password')}</span>
              <Link
                to="/forgot-password"
                className="vc-auth-link inline-flex min-h-11 items-center text-[12px] font-semibold hover:underline"
              >
                {t('auth.login.forgotPassword')}
              </Link>
            </span>
            <span className="relative block">
              <Lock className="vc-auth-field-icon pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
              <input
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                placeholder={t('auth.common.passwordPlaceholder')}
                className="vc-auth-input h-12 w-full rounded-md border px-10 pr-12 text-[16px] outline-none transition-colors sm:h-11 sm:text-[13px]"
                {...fieldErrorProps('login-password', credentialsError)}
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                className="vc-auth-input-action absolute right-1 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-md transition-colors lg:right-2 lg:h-8 lg:w-8"
                aria-label={showPassword ? t('auth.common.hidePassword') : t('auth.common.showPassword')}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </span>
            <FieldError fieldId="login-password" error={credentialsError} />
          </label>
        )}

        {/*
         * Progressive disclosure: the MFA/recovery-code field only appears once
         * the API has answered AUTH_MFA_REQUIRED on the first credential submit —
         * a bare login form no longer shows a second-factor box to everyone. It
         * auto-focuses when it mounts so the user can type the code immediately.
         */}
        {mfaRequired ? (
          <div>
            <AuthField
              label={t('auth.login.mfaLabel')}
              name="mfaCode"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              minLength={6}
              maxLength={32}
              required
              placeholder={t('auth.login.mfaPlaceholder')}
              icon={<KeyRound className="h-4 w-4" />}
              hint={t('auth.login.mfaHint')}
              inputProps={{ ...fieldErrorProps('login-mfa-code', mfaCodeError), autoFocus: true }}
            />
            <FieldError fieldId="login-mfa-code" error={mfaCodeError} />
          </div>
        ) : null}

        {/*
         * The visible password field is hidden on the MFA step (above). The API
         * re-verifies the password alongside the MFA code, so carry the
         * first-step password forward in this hidden input to complete MFA.
         * This is the only `password` input present during the MFA step; never
         * logged.
         */}
        {mfaRequired ? <input type="hidden" name="password" value={loginActionData?.password ?? ''} /> : null}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="vc-auth-checkbox-label flex min-h-11 cursor-pointer items-center gap-2 text-[12px]">
            <input
              type="checkbox"
              name="rememberMe"
              defaultChecked={loginActionData?.rememberMe ?? false}
              className="vc-auth-checkbox h-4 w-4 shrink-0 rounded"
            />
            {t('auth.login.remember')}
          </label>
        </div>

        <AuthSubmit
          label={t('auth.login.submit')}
          loadingLabel={t('auth.login.submitting')}
          isSubmitting={isSubmitting}
          disabled={pendingProvider !== null}
        />
      </Form>

      {providerReady('github') || providerReady('google') ? (
        <div className="vc-auth-secondary-actions mt-5 grid gap-3 border-t pt-5 sm:grid-cols-2">
          {providerReady('github') ? (
            <AuthOauthButton
              provider="github"
              label={t('auth.login.github')}
              icon={<Github className="h-4 w-4" />}
              pendingProvider={pendingProvider}
              onStart={startOAuth}
              disabled={isSubmitting}
            />
          ) : null}
          {providerReady('google') ? (
            <AuthOauthButton
              provider="google"
              label={t('auth.login.google')}
              icon={<Chrome className="h-4 w-4" />}
              pendingProvider={pendingProvider}
              onStart={startOAuth}
              disabled={isSubmitting}
            />
          ) : null}
        </div>
      ) : null}
    </AuthScreen>
  );
}
