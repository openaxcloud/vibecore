import {
  Building2,
  CheckCircle,
  Chrome,
  Code2,
  Eye,
  EyeOff,
  Github,
  Lock,
  Mail,
  Shield,
  Sparkles,
  User as UserIcon,
} from 'lucide-react';
import { useState } from 'react';
import { Form, Link, useActionData, useNavigation } from 'react-router';
import { AuthField, AuthOauthButton, AuthScreen, AuthSubmit, useAuthOauthPending } from '~/components/auth/AuthScreen';
import { PASSWORD_MIN_LENGTH, PasswordStrengthMeter } from '~/components/auth/PasswordStrength';
import {
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
    // Preserve ?prompt= (and any other query) so the homepage builder prompt survives the host hop.
    const search = new URL(request.url).search;
    return redirect(`https://app.e-code.ai/register${search}`, { status: 301 });
  }

  return null;
}

/*
 * The homepage builder form sends the visitor's app idea as ?prompt=. After registration we forward
 * it to the new-project composer so the first thing they see is their idea ready to build.
 */
function postRegisterDestination(request: Request): string {
  const prompt = new URL(request.url).searchParams.get('prompt')?.trim();

  if (prompt) {
    return `/projects/new?prompt=${encodeURIComponent(prompt)}`;
  }

  return '/dashboard';
}

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

  if (password.length < PASSWORD_MIN_LENGTH) {
    return json<ActionResult>(
      {
        error: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`,
        fields: { name, email, organizationName },
      },
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
      redirectOn401: false,
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
    return redirect(postRegisterDestination(request), {
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
        error: `Signup failed. The API service is temporarily unreachable. Please try again in a moment.`,
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
  const { pendingProvider, startOAuth } = useAuthOauthPending();
  const [showPassword, setShowPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showOrgField, setShowOrgField] = useState(Boolean(actionData?.fields?.organizationName));

  return (
    <AuthScreen
      eyebrow="Free to get started"
      title="Create your account"
      description="Spin up your first workspace, invite teammates and start shipping with the AI agent in minutes."
      error={actionData?.error}
      backTo="/"
      backLabel="Back to home"
      heroEyebrow="Start free, scale on demand"
      heroTitle="Build production apps with an AI co-pilot"
      heroBody="Provision a workspace, share live previews and ship to your own infrastructure — all from a single browser tab."
      heroAside={
        <>
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
        </>
      }
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="vc-auth-link font-semibold hover:underline">
            Sign in
          </Link>
        </>
      }
      belowCard={
        <p className="vc-auth-legal mt-5 text-center text-[11px] leading-5 sm:mt-6">
          By creating an account, you agree to our{' '}
          <Link to="/terms" className="underline">
            Terms
          </Link>{' '}
          and{' '}
          <Link to="/privacy" className="underline">
            Privacy Policy
          </Link>
          .
        </p>
      }
    >
      <Form method="post" className="space-y-4 sm:space-y-5">
        <AuthField
          label="Full name"
          name="name"
          autoComplete="name"
          defaultValue={actionData?.fields?.name ?? ''}
          placeholder="Ada Lovelace"
          icon={<UserIcon className="h-4 w-4" />}
        />

        <AuthField
          label="Work email"
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={actionData?.fields?.email ?? ''}
          placeholder="you@company.com"
          icon={<Mail className="h-4 w-4" />}
        />

        <label className="block">
          <span className="vc-auth-label text-[13px] font-medium">Password</span>
          <span className="relative mt-2 block">
            <Lock className="vc-auth-field-icon pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
            <input
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              required
              minLength={PASSWORD_MIN_LENGTH}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={`At least ${PASSWORD_MIN_LENGTH} characters`}
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
          {/* Live gauge + checklist replaces the old static hint text. */}
          <PasswordStrengthMeter password={password} className="mt-3" />
        </label>

        <label className="block">
          <span className="vc-auth-label text-[13px] font-medium">Confirm password</span>
          <span className="relative mt-2 block">
            <Lock className="vc-auth-field-icon pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
            <input
              name="confirmPassword"
              type={showConfirmPassword ? 'text' : 'password'}
              autoComplete="new-password"
              required
              minLength={8}
              placeholder="Re-enter the same password"
              className="vc-auth-input h-12 w-full rounded-md border px-10 pr-12 text-[16px] outline-none transition-colors sm:h-11 sm:text-[13px]"
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword((value) => !value)}
              className="vc-auth-input-action absolute right-2 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-md transition-colors sm:h-8 sm:w-8"
              aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
            >
              {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </span>
        </label>

        {showOrgField ? (
          <AuthField
            label="Organization name"
            name="organizationName"
            autoComplete="organization"
            defaultValue={actionData?.fields?.organizationName ?? ''}
            placeholder="Acme Inc."
            icon={<Building2 className="h-4 w-4" />}
            hint="Leave blank to create a personal workspace — you can rename it later in settings."
          />
        ) : (
          <button
            type="button"
            onClick={() => setShowOrgField(true)}
            className="vc-auth-inline-link text-[12px] font-semibold hover:underline"
          >
            + Add an organization name (optional)
          </button>
        )}

        {/*
         * Hard block mirrors the SERVER rule only (registerSchema: min 8) plus
         * an in-flight OAuth redirect. The 12+/number/symbol checklist above is
         * recommended strength guidance and never blocks submission.
         */}
        <AuthSubmit
          label="Create account"
          loadingLabel="Creating account..."
          isSubmitting={isSubmitting}
          disabled={pendingProvider !== null || password.length < PASSWORD_MIN_LENGTH}
        />
      </Form>

      <div className="vc-auth-secondary-actions mt-5 grid gap-3 border-t pt-5 sm:grid-cols-2">
        <AuthOauthButton
          provider="github"
          label="Sign up with GitHub"
          icon={<Github className="h-4 w-4" />}
          pendingProvider={pendingProvider}
          onStart={startOAuth}
          disabled={isSubmitting}
        />
        <AuthOauthButton
          provider="google"
          label="Sign up with Google"
          icon={<Chrome className="h-4 w-4" />}
          pendingProvider={pendingProvider}
          onStart={startOAuth}
          disabled={isSubmitting}
        />
      </div>
    </AuthScreen>
  );
}
