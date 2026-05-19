import { Form, Link, useActionData, useLoaderData, useNavigation } from '@remix-run/react';
import {
  ArrowRight,
  CheckCircle,
  ChevronLeft,
  Code2,
  Github,
  Eye,
  EyeOff,
  Chrome,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  Shield,
  Sparkles,
} from 'lucide-react';
import { useState } from 'react';
import {
  apiRequest,
  apiBaseUrl,
  formObject,
  json,
  redirect,
  sessionCookie,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';

/*
 * Marketing host (`e-code.ai`) shouldn't expose the sign-in form. The
 * canonical sign-in URL is `https://app.e-code.ai/login` — visitors who
 * hit `e-code.ai/login` (or `www.e-code.ai/login`) are 301-redirected
 * there so OAuth callbacks, password managers and SEO all converge.
 */
export async function loader({ request }: EnterpriseLoaderArgs) {
  const host = request.headers.get('host')?.toLowerCase() ?? '';

  if (host === 'e-code.ai' || host === 'www.e-code.ai') {
    return redirect('https://app.e-code.ai/login', { status: 301 });
  }

  const url = new URL(request.url);
  const oauth = url.searchParams.get('oauth');
  const oauthError = url.searchParams.get('error');
  const oauthDetail = url.searchParams.get('detail');

  return json({
    oauth: oauth && oauthError ? { provider: oauth, error: oauthError, detail: oauthDetail } : null,
  });
}

const heroImage = 'https://images.unsplash.com/photo-1555066931-4365d14bab8c?q=80&w=2070&auto=format&fit=crop';

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
      body: JSON.stringify({
        email: body.email,
        password: body.password,
        ...(mfaCode ? { mfaCode } : {}),
      }),
    });

    const redirectTo =
      process.env.ADMIN_MFA_REQUIRED !== 'false' && result.user?.platformAdmin && !result.user.mfaEnabled
        ? '/mfa-setup'
        : '/dashboard';

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
            rememberMe,
          },
          { status: error.status },
        );
      } catch {
        message = error.statusText || message;
      }

      return json({ error: message, mfaRequired: false }, { status: error.status });
    }

    return json(
      {
        error: `Login failed. API service is not reachable at ${apiBaseUrl()}. Start it with pnpm run dev:api or pnpm run dev:all.`,
      },
      { status: 503 },
    );
  }
}

export default function LoginPage() {
  const actionData = useActionData<typeof action>();

  const loaderData = useLoaderData<typeof loader>() as
    | { oauth?: { provider: string; error: string; detail?: string | null } | null }
    | undefined;

  const loginActionData = actionData as
    | { error?: string; mfaRequired?: boolean; email?: string; rememberMe?: boolean }
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

  return (
    <main className="min-h-dvh overflow-x-hidden bg-[#0A0F1C] text-[#F5F9FC] lg:grid lg:grid-cols-[minmax(0,0.96fr)_minmax(420px,1.04fr)]">
      <section className="relative flex min-h-dvh items-start justify-center overflow-y-auto px-4 py-5 sm:px-6 sm:py-8 md:px-10 lg:items-center lg:px-12 lg:py-10 xl:px-20">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(0,153,255,0.14),transparent_28%),radial-gradient(circle_at_84%_86%,rgba(123,97,255,0.16),transparent_32%)]" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-[linear-gradient(180deg,rgba(14,21,37,0.72),transparent)] sm:h-36" />
        <div className="relative z-10 flex min-h-[calc(100dvh-40px)] w-full max-w-[520px] flex-col justify-center sm:min-h-[calc(100dvh-64px)] lg:min-h-0 lg:max-w-[460px] xl:max-w-[500px]">
          <Link
            to="/"
            className="mb-5 inline-flex w-fit items-center gap-2 rounded-md px-1 py-1 text-[12px] font-medium text-[#6E7681] transition-colors hover:text-[#F5F9FC] focus:outline-none focus:ring-2 focus:ring-[#0099FF] focus:ring-offset-2 focus:ring-offset-[#0A0F1C] sm:mb-7 sm:text-[13px]"
          >
            <ChevronLeft className="h-4 w-4" />
            Back to home
          </Link>

          <div className="mb-6 flex items-center gap-3 sm:mb-8">
            <div className="grid h-10 w-10 place-items-center rounded-lg border border-[#2B3245] bg-[#0E1525] shadow-[0_12px_32px_rgba(0,4,20,0.45)] sm:h-11 sm:w-11">
              <img src="/assets/logo.svg" alt="E-code" className="h-6 w-6 rounded object-contain sm:h-7 sm:w-7" />
            </div>
            <div>
              <p className="text-[15px] font-semibold leading-none text-white">E-code</p>
              <p className="mt-1 text-[12px] text-[#6E7681]">Enterprise Development Platform</p>
            </div>
          </div>

          <div className="mb-5 sm:mb-7">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#2B3245] bg-[#1A2030] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.4px] text-[#C2C8CC] sm:mb-4 sm:text-[11px]">
              <Sparkles className="h-3.5 w-3.5 text-[#F26207]" />
              Secure workspace access
            </div>
            <h1 className="max-w-[11ch] text-[clamp(2rem,9vw,2.75rem)] font-bold leading-[1.02] tracking-normal text-white sm:max-w-none">
              Welcome back
            </h1>
            <p className="mt-3 max-w-[36rem] text-[13px] leading-6 text-[#C2C8CC] sm:text-[14px] lg:max-w-sm">
              Sign in to continue building, previewing and deploying production applications with the E-code IDE.
            </p>
          </div>

          <div className="rounded-xl border border-[#2B3245] bg-[rgba(14,21,37,0.88)] p-4 shadow-[0_24px_64px_rgba(0,4,20,0.62)] backdrop-blur-xl sm:p-6 md:p-7 lg:p-6">
            {loginActionData?.error ? (
              <div className="mb-4 rounded-md border border-[#F85149]/40 bg-[#F85149]/10 px-3 py-2 text-[12px] text-[#FCA5A5]">
                {loginActionData.error}
              </div>
            ) : oauthErrorMessage ? (
              <div className="mb-4 rounded-md border border-[#F85149]/40 bg-[#F85149]/10 px-3 py-2 text-[12px] text-[#FCA5A5]">
                {oauthErrorMessage}
              </div>
            ) : null}

            <Form method="post" className="space-y-4 sm:space-y-5">
              <label className="block">
                <span className="text-[13px] font-medium text-[#F5F9FC]">Email</span>
                <span className="relative mt-2 block">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6E7681]" />
                  <input
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    defaultValue={loginActionData?.email ?? ''}
                    placeholder="you@company.com"
                    className="h-12 w-full rounded-md border border-[#2B3245] bg-[#0A0F1C] px-10 text-[16px] text-white outline-none transition-colors placeholder:text-[#6E7681] focus:border-[#0099FF] focus:ring-2 focus:ring-[#0099FF]/20 sm:h-11 sm:text-[13px]"
                  />
                </span>
              </label>

              <label className="block">
                <span className="mb-2 flex items-center justify-between">
                  <span className="text-[13px] font-medium text-[#F5F9FC]">Password</span>
                  <Link to="/forgot-password" className="text-[12px] font-semibold text-[#F26207] hover:underline">
                    Forgot password?
                  </Link>
                </span>
                <span className="relative block">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6E7681]" />
                  <input
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    placeholder="Enter your password"
                    className="h-12 w-full rounded-md border border-[#2B3245] bg-[#0A0F1C] px-10 pr-12 text-[16px] text-white outline-none transition-colors placeholder:text-[#6E7681] focus:border-[#0099FF] focus:ring-2 focus:ring-[#0099FF]/20 sm:h-11 sm:text-[13px]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    className="absolute right-2 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-md text-[#6E7681] transition-colors hover:bg-[#1A2030] hover:text-white focus:outline-none focus:ring-2 focus:ring-[#0099FF] sm:h-8 sm:w-8"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </span>
              </label>

              <label className="block">
                <span className="text-[13px] font-medium text-[#F5F9FC]">
                  {mfaRequired ? 'MFA code required' : 'MFA or recovery code'}
                </span>
                <span className="relative mt-2 block">
                  <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6E7681]" />
                  <input
                    name="mfaCode"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    minLength={6}
                    maxLength={32}
                    required={mfaRequired}
                    placeholder="123456 or recovery code"
                    className="h-12 w-full rounded-md border border-[#2B3245] bg-[#0A0F1C] px-10 text-[16px] text-white outline-none transition-colors placeholder:text-[#6E7681] focus:border-[#0099FF] focus:ring-2 focus:ring-[#0099FF]/20 sm:h-11 sm:text-[13px]"
                  />
                </span>
                {mfaRequired ? (
                  <span className="mt-2 block text-[12px] leading-5 text-[#C2C8CC]">
                    Enter your authenticator app code, or one of your one-time recovery codes.
                  </span>
                ) : null}
              </label>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <label className="flex min-h-9 cursor-pointer items-center gap-2 text-[12px] text-[#C2C8CC]">
                  <input
                    type="checkbox"
                    name="rememberMe"
                    defaultChecked={loginActionData?.rememberMe ?? false}
                    className="h-4 w-4 shrink-0 rounded border-[#2B3245] bg-[#0A0F1C] accent-[#F26207]"
                  />
                  Remember me for 30 days
                </label>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-gradient-to-r from-[#F26207] to-[#F99D25] px-4 text-[14px] font-bold text-white shadow-[0_12px_32px_rgba(242,98,7,0.26)] transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-[#0099FF] focus:ring-offset-2 focus:ring-offset-[#0E1525] disabled:cursor-not-allowed disabled:opacity-60 sm:h-11 sm:text-[13px]"
              >
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {isSubmitting ? 'Signing in...' : 'Sign in'}
                {!isSubmitting ? <ArrowRight className="h-4 w-4" /> : null}
              </button>
            </Form>

            <div className="mt-5 grid gap-3 border-t border-[#1A2030] pt-5 sm:grid-cols-2">
              <Link
                to="/auth/oauth/github"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-[#2B3245] bg-[#0A0F1C] px-3 text-[13px] font-semibold text-[#F5F9FC] transition-colors hover:bg-[#1A2030] focus:outline-none focus:ring-2 focus:ring-[#0099FF]"
              >
                <Github className="h-4 w-4" />
                GitHub
              </Link>
              <Link
                to="/auth/oauth/google"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-[#2B3245] bg-[#0A0F1C] px-3 text-[13px] font-semibold text-[#F5F9FC] transition-colors hover:bg-[#1A2030] focus:outline-none focus:ring-2 focus:ring-[#0099FF]"
              >
                <Chrome className="h-4 w-4" />
                Google
              </Link>
            </div>

            <div className="mt-5 border-t border-[#1A2030] pt-5 text-center text-[13px] text-[#6E7681]">
              Don&apos;t have an account?{' '}
              <Link to="/register" className="font-semibold text-[#7B61FF] hover:underline">
                Register for free
              </Link>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:hidden">
            {[
              { value: '21', label: 'AI models' },
              { value: '29+', label: 'Languages' },
              { value: '99.9%', label: 'Uptime path' },
              { value: 'SOC2', label: 'Ready controls' },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-lg border border-[#1A2030] bg-[#0E1525]/80 px-3 py-3 text-center"
              >
                <div className="text-[16px] font-bold text-white">{item.value}</div>
                <div className="mt-1 text-[10px] text-[#6E7681]">{item.label}</div>
              </div>
            ))}
          </div>

          <p className="mt-5 text-center text-[11px] leading-5 text-[#6E7681] sm:mt-6">
            By signing in, you agree to our{' '}
            <Link to="/terms" className="underline hover:text-[#F5F9FC]">
              Terms
            </Link>{' '}
            and{' '}
            <Link to="/privacy" className="underline hover:text-[#F5F9FC]">
              Privacy Policy
            </Link>
            .
          </p>
        </div>
      </section>

      <section className="relative hidden min-h-dvh overflow-hidden lg:block">
        <img src={heroImage} alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(242,98,7,0.92),rgba(249,157,37,0.84))]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.22),transparent_26%),radial-gradient(circle_at_80%_86%,rgba(10,15,28,0.36),transparent_30%)]" />
        <div className="relative z-10 flex min-h-dvh items-center justify-center p-8 xl:p-12">
          <div className="max-w-[28rem] text-white xl:max-w-md">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-white/18 px-4 py-2 text-[13px] font-semibold backdrop-blur-md">
              <Sparkles className="h-4 w-4" />
              AI-powered development
            </div>
            <h2 className="text-[clamp(2.25rem,4vw,3.25rem)] font-bold leading-[1.03] tracking-normal">
              Build faster with enterprise-grade tools
            </h2>
            <p className="mt-5 text-[15px] leading-7 text-white/88">
              Ship production-ready applications with an AI agent, live preview, secure workspaces and deployment
              workflows.
            </p>

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
          </div>
        </div>
      </section>
    </main>
  );
}
