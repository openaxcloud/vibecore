import { Form, Link, useActionData, useNavigation } from '@remix-run/react';
import {
  ArrowRight,
  Building2,
  CheckCircle,
  ChevronLeft,
  Chrome,
  Code2,
  Eye,
  EyeOff,
  Github,
  Loader2,
  Lock,
  Mail,
  Shield,
  Sparkles,
  User as UserIcon,
} from 'lucide-react';
import { useState } from 'react';
import {
  apiBaseUrl,
  apiRequest,
  formObject,
  json,
  redirect,
  sessionCookie,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';

/*
 * Mirror login.tsx: the marketing host shouldn't expose the signup form.
 * Visitors who land on `e-code.ai/register` or `e-code.ai/signup` are
 * 301-redirected to `app.e-code.ai/register` so password managers and
 * OAuth callbacks all converge on a single canonical hostname.
 */
export async function loader({ request }: EnterpriseLoaderArgs) {
  const host = request.headers.get('host')?.toLowerCase() ?? '';

  if (host === 'e-code.ai' || host === 'www.e-code.ai') {
    return redirect('https://app.e-code.ai/register', { status: 301 });
  }

  return null;
}

const heroImage = 'https://images.unsplash.com/photo-1555066931-4365d14bab8c?q=80&w=2070&auto=format&fit=crop';

type ActionResult =
  | { error: string; fields?: { name?: string; email?: string; organizationName?: string } }
  | { ok: true };

export async function action({ request }: EnterpriseActionArgs) {
  const body = formObject(await request.formData());

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const confirmPassword = typeof body.confirmPassword === 'string' ? body.confirmPassword : '';
  const organizationName = typeof body.organizationName === 'string' ? body.organizationName.trim() : '';

  /*
   * Server-side cross-checks duplicating the HTML5 constraints. The
   * browser enforces the same rules, but a hostile client (or a curl
   * call) can bypass them, and the API rejects with a 400 anyway —
   * mirroring the rules here gives us a friendly inline error instead
   * of a generic 400 from Fastify.
   */
  if (!email) {
    return json<ActionResult>(
      { error: 'Email is required.', fields: { name, email, organizationName } },
      { status: 400 },
    );
  }

  if (password.length < 8) {
    return json<ActionResult>(
      { error: 'Password must be at least 8 characters.', fields: { name, email, organizationName } },
      { status: 400 },
    );
  }

  if (password !== confirmPassword) {
    return json<ActionResult>(
      { error: 'Passwords do not match.', fields: { name, email, organizationName } },
      { status: 400 },
    );
  }

  try {
    const result = await apiRequest<{ token: string }>(request, '/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email,
        password,

        /*
         * The Zod schema on the API treats these as `z.string().min(1).optional()`,
         * which rejects empty strings. Drop the key when the user left the
         * field blank so the server falls back to its default
         * "${email}'s Organization" naming.
         */
        ...(name ? { name } : {}),
        ...(organizationName ? { organizationName } : {}),
      }),
    });

    /*
     * `/auth/register` returns a session cookie, so the user is logged
     * in immediately. The verification email (logged or sent depending
     * on `EmailProvider`) is non-blocking — they can verify later from
     * `/verify-email`. This keeps the MVP path frictionless while we
     * wire up Resend / SES.
     */
    return redirect('/dashboard', {
      headers: { 'Set-Cookie': sessionCookie(result.token) },
    });
  } catch (error) {
    if (error instanceof Response) {
      let message = 'Could not create your account.';

      try {
        const payload = (await error.json()) as { error?: string; code?: string };

        if (payload.code === 'AUTH_EMAIL_EXISTS') {
          message = 'An account with this email already exists. Try signing in instead.';
        } else if (payload.error) {
          message = payload.error;
        }
      } catch {
        message = error.statusText || message;
      }

      return json<ActionResult>(
        { error: message, fields: { name, email, organizationName } },
        { status: error.status },
      );
    }

    return json<ActionResult>(
      {
        error: `Signup failed. API service is not reachable at ${apiBaseUrl()}. Start it with pnpm run dev:api or pnpm run dev:all.`,
        fields: { name, email, organizationName },
      },
      { status: 503 },
    );
  }
}

export default function SignupPage() {
  const actionData = useActionData<typeof action>() as
    | { error?: string; fields?: { name?: string; email?: string; organizationName?: string } }
    | undefined;

  const navigation = useNavigation();
  const isSubmitting = navigation.state === 'submitting';
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showOrgField, setShowOrgField] = useState(Boolean(actionData?.fields?.organizationName));

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
              Free to get started
            </div>
            <h1 className="max-w-[12ch] text-[clamp(2rem,9vw,2.75rem)] font-bold leading-[1.02] tracking-normal text-white sm:max-w-none">
              Create your account
            </h1>
            <p className="mt-3 max-w-[36rem] text-[13px] leading-6 text-[#C2C8CC] sm:text-[14px] lg:max-w-sm">
              Spin up your first workspace, invite teammates and start shipping with the AI agent in minutes.
            </p>
          </div>

          <div className="rounded-xl border border-[#2B3245] bg-[rgba(14,21,37,0.88)] p-4 shadow-[0_24px_64px_rgba(0,4,20,0.62)] backdrop-blur-xl sm:p-6 md:p-7 lg:p-6">
            {actionData?.error ? (
              <div className="mb-4 rounded-md border border-[#F85149]/40 bg-[#F85149]/10 px-3 py-2 text-[12px] text-[#FCA5A5]">
                {actionData.error}
              </div>
            ) : null}

            <Form method="post" className="space-y-4 sm:space-y-5">
              <label className="block">
                <span className="text-[13px] font-medium text-[#F5F9FC]">Full name</span>
                <span className="relative mt-2 block">
                  <UserIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6E7681]" />
                  <input
                    name="name"
                    type="text"
                    autoComplete="name"
                    defaultValue={actionData?.fields?.name ?? ''}
                    placeholder="Ada Lovelace"
                    className="h-12 w-full rounded-md border border-[#2B3245] bg-[#0A0F1C] px-10 text-[16px] text-white outline-none transition-colors placeholder:text-[#6E7681] focus:border-[#0099FF] focus:ring-2 focus:ring-[#0099FF]/20 sm:h-11 sm:text-[13px]"
                  />
                </span>
              </label>

              <label className="block">
                <span className="text-[13px] font-medium text-[#F5F9FC]">Work email</span>
                <span className="relative mt-2 block">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6E7681]" />
                  <input
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    defaultValue={actionData?.fields?.email ?? ''}
                    placeholder="you@company.com"
                    className="h-12 w-full rounded-md border border-[#2B3245] bg-[#0A0F1C] px-10 text-[16px] text-white outline-none transition-colors placeholder:text-[#6E7681] focus:border-[#0099FF] focus:ring-2 focus:ring-[#0099FF]/20 sm:h-11 sm:text-[13px]"
                  />
                </span>
              </label>

              <label className="block">
                <span className="text-[13px] font-medium text-[#F5F9FC]">Password</span>
                <span className="relative mt-2 block">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6E7681]" />
                  <input
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
                    minLength={8}
                    placeholder="At least 8 characters"
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
                <span className="mt-2 block text-[11px] leading-5 text-[#6E7681]">
                  Use 8+ characters. Mix in letters, numbers and symbols for a stronger password.
                </span>
              </label>

              <label className="block">
                <span className="text-[13px] font-medium text-[#F5F9FC]">Confirm password</span>
                <span className="relative mt-2 block">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6E7681]" />
                  <input
                    name="confirmPassword"
                    type={showConfirmPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
                    minLength={8}
                    placeholder="Re-enter the same password"
                    className="h-12 w-full rounded-md border border-[#2B3245] bg-[#0A0F1C] px-10 pr-12 text-[16px] text-white outline-none transition-colors placeholder:text-[#6E7681] focus:border-[#0099FF] focus:ring-2 focus:ring-[#0099FF]/20 sm:h-11 sm:text-[13px]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((value) => !value)}
                    className="absolute right-2 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-md text-[#6E7681] transition-colors hover:bg-[#1A2030] hover:text-white focus:outline-none focus:ring-2 focus:ring-[#0099FF] sm:h-8 sm:w-8"
                    aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </span>
              </label>

              {showOrgField ? (
                <label className="block">
                  <span className="text-[13px] font-medium text-[#F5F9FC]">Organization name</span>
                  <span className="relative mt-2 block">
                    <Building2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6E7681]" />
                    <input
                      name="organizationName"
                      type="text"
                      autoComplete="organization"
                      defaultValue={actionData?.fields?.organizationName ?? ''}
                      placeholder="Acme Inc."
                      className="h-12 w-full rounded-md border border-[#2B3245] bg-[#0A0F1C] px-10 text-[16px] text-white outline-none transition-colors placeholder:text-[#6E7681] focus:border-[#0099FF] focus:ring-2 focus:ring-[#0099FF]/20 sm:h-11 sm:text-[13px]"
                    />
                  </span>
                  <span className="mt-2 block text-[11px] leading-5 text-[#6E7681]">
                    Leave blank to create a personal workspace — you can rename it later in settings.
                  </span>
                </label>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowOrgField(true)}
                  className="text-[12px] font-semibold text-[#F26207] hover:underline focus:outline-none focus:ring-2 focus:ring-[#0099FF] focus:ring-offset-2 focus:ring-offset-[#0E1525]"
                >
                  + Add an organization name (optional)
                </button>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-gradient-to-r from-[#F26207] to-[#F99D25] px-4 text-[14px] font-bold text-white shadow-[0_12px_32px_rgba(242,98,7,0.26)] transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-[#0099FF] focus:ring-offset-2 focus:ring-offset-[#0E1525] disabled:cursor-not-allowed disabled:opacity-60 sm:h-11 sm:text-[13px]"
              >
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {isSubmitting ? 'Creating account...' : 'Create account'}
                {!isSubmitting ? <ArrowRight className="h-4 w-4" /> : null}
              </button>
            </Form>

            <div className="mt-5 grid gap-3 border-t border-[#1A2030] pt-5 sm:grid-cols-2">
              <Link
                to="/auth/oauth/github"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-[#2B3245] bg-[#0A0F1C] px-3 text-[13px] font-semibold text-[#F5F9FC] transition-colors hover:bg-[#1A2030] focus:outline-none focus:ring-2 focus:ring-[#0099FF]"
              >
                <Github className="h-4 w-4" />
                Sign up with GitHub
              </Link>
              <Link
                to="/auth/oauth/google"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-[#2B3245] bg-[#0A0F1C] px-3 text-[13px] font-semibold text-[#F5F9FC] transition-colors hover:bg-[#1A2030] focus:outline-none focus:ring-2 focus:ring-[#0099FF]"
              >
                <Chrome className="h-4 w-4" />
                Sign up with Google
              </Link>
            </div>

            <div className="mt-5 border-t border-[#1A2030] pt-5 text-center text-[13px] text-[#6E7681]">
              Already have an account?{' '}
              <Link to="/login" className="font-semibold text-[#7B61FF] hover:underline">
                Sign in
              </Link>
            </div>
          </div>

          <p className="mt-5 text-center text-[11px] leading-5 text-[#6E7681] sm:mt-6">
            By creating an account, you agree to our{' '}
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
              Start free, scale on demand
            </div>
            <h2 className="text-[clamp(2.25rem,4vw,3.25rem)] font-bold leading-[1.03] tracking-normal">
              Build production apps with an AI co-pilot
            </h2>
            <p className="mt-5 text-[15px] leading-7 text-white/88">
              Provision a workspace, share live previews and ship to your own infrastructure — all from a single browser
              tab.
            </p>

            <div className="mt-9 grid gap-4">
              {[
                { icon: Shield, text: 'SOC2-ready controls, MFA and audit logs out of the box' },
                { icon: Sparkles, text: 'AI agent that writes, reviews and ships code with you' },
                { icon: Code2, text: 'Cloud IDE with terminal, preview and Git-native workflows' },
                { icon: CheckCircle, text: 'Bring your own keys for 21 AI providers' },
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
