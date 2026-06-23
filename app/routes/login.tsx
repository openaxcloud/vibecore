import { CheckCircle, Chrome, Code2, Eye, EyeOff, Github, KeyRound, Lock, Mail, Shield, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { MetaFunction } from 'react-router';
import { Form, Link, useActionData, useLoaderData, useNavigation } from 'react-router';
import { AuthField, AuthScreen, AuthSubmit } from '~/components/auth/AuthScreen';
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

  return json({
    oauth: oauth && oauthError ? { provider: oauth, error: oauthError, detail: oauthDetail } : null,
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

      try {
        const payload = (await error.json()) as { error?: string; code?: string };
        message = payload.error ?? message;

        const mfaRequired = payload.code === 'AUTH_MFA_REQUIRED';

        return json(
          {
            error: message,
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
      } catch {
        message = error.statusText || message;
      }

      return json({ error: message, mfaRequired: false }, { status: error.status });
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
    | { oauth?: { provider: string; error: string; detail?: string | null } | null }
    | undefined;

  const loginActionData = actionData as
    | { error?: string; mfaRequired?: boolean; email?: string; password?: string; rememberMe?: boolean }
    | undefined;

  const oauthErrorMessage = loaderData?.oauth
    ? `Sign-in with ${loaderData.oauth.provider} failed (${loaderData.oauth.error}${
        loaderData.oauth.detail ? `: ${loaderData.oauth.detail}` : ''
      }).`
    : null;

  const navigation = useNavigation();
  const isSubmitting = navigation.state === 'submitting';
  const [showPassword, setShowPassword] = useState(false);
  const mfaRequired = Boolean(loginActionData?.mfaRequired);
  const error = loginActionData?.error ?? oauthErrorMessage ?? undefined;

  return (
    <AuthScreen
      eyebrow="Secure workspace access"
      title="Welcome back"
      description="Sign in to continue building, previewing and deploying production applications with the E-Code IDE."
      error={error}
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
            <div>
              <div className="text-3xl font-bold">21</div>
              <div className="mt-1 text-[12px] text-white/72">AI providers</div>
            </div>
            <div>
              <div className="text-3xl font-bold">29+</div>
              <div className="mt-1 text-[12px] text-white/72">Languages</div>
            </div>
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
            {[
              { value: '21', label: 'AI models' },
              { value: '29+', label: 'Languages' },
              { value: '99.9%', label: 'Uptime path' },
              { value: 'SOC2', label: 'Ready controls' },
            ].map((item) => (
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
      <Form method="post" className="space-y-4 sm:space-y-5">
        <AuthField
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={loginActionData?.email ?? ''}
          placeholder="you@company.com"
          icon={<Mail className="h-4 w-4" />}
        />

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
          </label>
        )}

        <AuthField
          label={mfaRequired ? 'MFA code required' : 'MFA or recovery code'}
          name="mfaCode"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          minLength={6}
          maxLength={32}
          required={mfaRequired}
          placeholder="123456 or recovery code"
          icon={<KeyRound className="h-4 w-4" />}
          hint={mfaRequired ? 'Enter your authenticator app code, or one of your one-time recovery codes.' : undefined}
        />

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

        <AuthSubmit label="Sign in" loadingLabel="Signing in..." isSubmitting={isSubmitting} />
      </Form>

      <div className="vc-auth-secondary-actions mt-5 grid gap-3 border-t pt-5 sm:grid-cols-2">
        <Link
          to="/auth/oauth/github"
          className="vc-auth-secondary-action inline-flex h-11 items-center justify-center gap-2 rounded-md border px-3 text-[13px] font-semibold transition-colors"
        >
          <Github className="h-4 w-4" />
          GitHub
        </Link>
        <Link
          to="/auth/oauth/google"
          className="vc-auth-secondary-action inline-flex h-11 items-center justify-center gap-2 rounded-md border px-3 text-[13px] font-semibold transition-colors"
        >
          <Chrome className="h-4 w-4" />
          Google
        </Link>
      </div>
    </AuthScreen>
  );
}
