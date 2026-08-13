import { CheckCircle, Chrome, Code2, Eye, EyeOff, Github, KeyRound, Lock, Mail, Shield, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
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
import { invalidateRuntimeToken } from '~/lib/runtime/RuntimeAdapterProvider';
import { oauthErrorDisplayMessage, providerDisplayLabel } from '~/lib/user-facing-labels';

export const meta: MetaFunction = () => [
  { title: 'Login - E-Code' },
  { name: 'description', content: 'Sign in to your E-Code workspace.' },
];

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
      let message = 'Login failed';
      let code: string | undefined;

      try {
        const payload = (await error.json()) as { error?: string; code?: string };
        message = payload.error ?? message;
        code = payload.code;
      } catch {
        message = error.statusText || message;
      }

      /*
       * Map ONLY the failure states the API really distinguishes.
       *
       * SECURITY: the API deliberately returns ONE generic 401
       * (AUTH_INVALID_CREDENTIALS) for both unknown-email and wrong-password
       * so this form cannot be used to enumerate accounts. Mirror that
       * honestly with a single combined message — never split the two
       * client-side.
       */
      if (code === 'AUTH_INVALID_CREDENTIALS') {
        message = 'Email or password is incorrect.';
      } else if (code === 'USER_SUSPENDED') {
        message = 'This account is suspended. Contact support if you believe this is a mistake.';
      } else if (error.status === 429) {
        /*
         * Login is rate-limited per IP (AUTH_LOGIN_RATE_LIMIT_MAX/minute).
         * Use the API's real Retry-After header (forwarded by apiRequest)
         * rather than inventing a delay.
         */
        const retryAfterSeconds = Number(error.headers.get('retry-after'));

        const wait =
          Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
            ? retryAfterSeconds >= 90
              ? `${Math.ceil(retryAfterSeconds / 60)} minutes`
              : `${Math.round(retryAfterSeconds)} seconds`
            : 'a minute';

        message = `Too many attempts — try again in ${wait}.`;
        code = 'RATE_LIMITED';
      }

      const mfaRequired = code === 'AUTH_MFA_REQUIRED';

      return json(
        {
          error: message,
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
        error: 'Login is temporarily unavailable. Please try again in a moment.',
      },
      { status: 503 },
    );
  }
}

export default function LoginPage() {
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
    | { error?: string; code?: string; mfaRequired?: boolean; email?: string; password?: string; rememberMe?: boolean }
    | undefined;

  const oauthErrorMessage = loaderData?.oauth
    ? `${providerDisplayLabel(loaderData.oauth.provider)} sign-in failed. ${oauthErrorDisplayMessage(loaderData.oauth.error)}`
    : null;

  const navigation = useNavigation();
  const isSubmitting = navigation.state === 'submitting';
  const { pendingProvider, startOAuth } = useAuthOauthPending();
  const [showPassword, setShowPassword] = useState(false);
  const mfaRequired = Boolean(loginActionData?.mfaRequired);
  const error = loginActionData?.error ?? oauthErrorMessage ?? undefined;

  /*
   * E9 field-level errors: the ONLY per-field states the API distinguishes.
   * A generic 401 marks both credential fields (anti-enumeration — the API
   * never says which one is wrong); an invalid MFA code marks the code field.
   */
  const credentialsError = loginActionData?.code === 'AUTH_INVALID_CREDENTIALS' ? loginActionData.error : undefined;
  const mfaCodeError = loginActionData?.code === 'AUTH_INVALID_MFA_CODE' ? loginActionData.error : undefined;

  /*
   * E9 a11y: on every failed submit, move focus to the role="alert" banner
   * (tabIndex -1) so keyboard/screen-reader users land on the explanation
   * instead of a silently re-rendered form. Keyed on the actionData object —
   * a fresh instance arrives per submit, so repeat failures re-focus.
   */
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (loginActionData?.error) {
      errorRef.current?.focus();
    }
  }, [loginActionData]);

  return (
    <AuthScreen
      eyebrow="Secure workspace access"
      title="Welcome back"
      description="Sign in to continue building, previewing and deploying production applications with the E-Code IDE."
      backTo="/"
      backLabel="Back to home"
      heroEyebrow="AI-powered development"
      heroTitle="Build faster inside your E-Code workspace"
      heroBody="Ship production-ready applications with an AI agent, live preview, secure workspaces and deployment workflows."
      heroAside={
        <>
          <div className="mt-9 grid gap-4">
            {[
              { icon: Shield, text: 'Secure SaaS authentication and workspace access' },
              { icon: Sparkles, text: 'AI agent builds complete apps from prompts' },
              { icon: Code2, text: 'IDE workflow with files, terminal, preview and deploys' },
              { icon: CheckCircle, text: 'Production paths for teams, admins and billing' },
            ].map((feature) => {
              const Icon = feature.icon;

              return (
                <div key={feature.text} className="flex items-center gap-3">
                  <div className="grid h-10 w-10 place-items-center rounded-lg bg-white/18 backdrop-blur-md">
                    <Icon className="h-5 w-5" />
                  </div>
                  <span className="text-[14px] font-medium text-white/92">{feature.text}</span>
                </div>
              );
            })}
          </div>

          <div className="mt-10 grid grid-cols-2 gap-5 border-t border-white/20 pt-8">
            {AUTH_HERO_STATS.slice(0, 2).map((item) => (
              <div key={item.label}>
                <div className="text-3xl font-bold">{item.value}</div>
                <div className="mt-1 text-[12px] text-white/72">{item.label}</div>
              </div>
            ))}
          </div>
        </>
      }
      footer={
        <>
          Don&apos;t have an account?{' '}
          <Link to="/register" className="vc-auth-link font-semibold hover:underline">
            Register for free
          </Link>
        </>
      }
      belowCard={
        <>
          <div className="vc-auth-mobile-stats mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:hidden">
            {AUTH_HERO_STATS.map((item) => (
              <div key={item.label} className="vc-auth-mobile-stat rounded-lg px-3 py-3 text-center">
                <div className="text-[16px] font-bold">{item.value}</div>
                <div className="mt-1 text-[10px]">{item.label}</div>
              </div>
            ))}
          </div>

          <p className="vc-auth-legal mt-5 text-center text-[11px] leading-5 sm:mt-6">
            By signing in, you agree to our{' '}
            <Link to="/terms" className="underline">
              Terms
            </Link>{' '}
            and{' '}
            <Link to="/privacy" className="underline">
              Privacy Policy
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
            label="Email"
            name="email"
            type="email"
            autoComplete="email"
            required
            defaultValue={loginActionData?.email ?? ''}
            placeholder="you@company.com"
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
              <span className="vc-auth-label text-[13px] font-medium">Password</span>
              <Link to="/forgot-password" className="vc-auth-link text-[12px] font-semibold hover:underline">
                Forgot password?
              </Link>
            </span>
            <span className="relative block">
              <Lock className="vc-auth-field-icon pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
              <input
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                placeholder="Enter your password"
                className="vc-auth-input h-12 w-full rounded-md border px-10 pr-12 text-[16px] outline-none transition-colors sm:h-11 sm:text-[13px]"
                {...fieldErrorProps('login-password', credentialsError)}
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                className="vc-auth-input-action absolute right-2 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-md transition-colors sm:h-8 sm:w-8"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
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
              label="MFA code required"
              name="mfaCode"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              minLength={6}
              maxLength={32}
              required
              placeholder="123456 or recovery code"
              icon={<KeyRound className="h-4 w-4" />}
              hint="Enter your authenticator app code, or one of your one-time recovery codes."
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
          <label className="vc-auth-checkbox-label flex min-h-9 cursor-pointer items-center gap-2 text-[12px]">
            <input
              type="checkbox"
              name="rememberMe"
              defaultChecked={loginActionData?.rememberMe ?? false}
              className="vc-auth-checkbox h-4 w-4 shrink-0 rounded"
            />
            Remember me for 30 days
          </label>
        </div>

        <AuthSubmit
          label="Sign in"
          loadingLabel="Signing in..."
          isSubmitting={isSubmitting}
          disabled={pendingProvider !== null}
        />
      </Form>

      {providerReady('github') || providerReady('google') ? (
        <div className="vc-auth-secondary-actions mt-5 grid gap-3 border-t pt-5 sm:grid-cols-2">
          {providerReady('github') ? (
            <AuthOauthButton
              provider="github"
              label="GitHub"
              icon={<Github className="h-4 w-4" />}
              pendingProvider={pendingProvider}
              onStart={startOAuth}
              disabled={isSubmitting}
            />
          ) : null}
          {providerReady('google') ? (
            <AuthOauthButton
              provider="google"
              label="Google"
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
