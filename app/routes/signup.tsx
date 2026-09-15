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
import { useTranslation } from 'react-i18next';
import type { MetaFunction } from 'react-router';
import { Form, Link, useActionData, useNavigation } from 'react-router';
import { AuthField, AuthOauthButton, AuthScreen, AuthSubmit, useAuthOauthPending } from '~/components/auth/AuthScreen';
import { PASSWORD_MIN_LENGTH, PasswordStrengthMeter } from '~/components/auth/PasswordStrength';
import { AUTH_HERO_STATS } from '~/lib/auth-hero-stats';
import {
  apiRequest,
  formObject,
  json,
  redirect,
  sessionCookie,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';
import type { TranslationKey } from '~/lib/i18n/dictionary';
import { resolveRequestLocale } from '~/lib/i18n/request-locale';
import { translateServerMessage } from '~/lib/i18n/server';

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  const language = data?.language ?? 'en';

  return [
    { title: translateServerMessage(language, 'auth.signup.metaTitle') },
    { name: 'description', content: translateServerMessage(language, 'auth.signup.metaDescription') },
  ];
};

type SignupFeedbackCode =
  | 'AUTH_EMAIL_REQUIRED'
  | 'AUTH_PASSWORD_TOO_SHORT'
  | 'AUTH_PASSWORD_MISMATCH'
  | 'AUTH_EMAIL_EXISTS'
  | 'AUTH_SIGNUP_FAILED'
  | 'AUTH_SIGNUP_UNAVAILABLE';

const SIGNUP_FEEDBACK_KEYS = {
  AUTH_EMAIL_REQUIRED: 'auth.feedback.emailRequired',
  AUTH_PASSWORD_TOO_SHORT: 'auth.feedback.passwordTooShort',
  AUTH_PASSWORD_MISMATCH: 'auth.feedback.passwordsMismatch',
  AUTH_EMAIL_EXISTS: 'auth.feedback.emailExists',
  AUTH_SIGNUP_FAILED: 'auth.feedback.signupFailed',
  AUTH_SIGNUP_UNAVAILABLE: 'auth.feedback.signupUnavailable',
} as const satisfies Record<SignupFeedbackCode, TranslationKey>;

const SIGNUP_FEATURES = [
  { icon: Shield, key: 'auth.signup.featureSecurity' },
  { icon: Sparkles, key: 'auth.signup.featureAgent' },
  { icon: Code2, key: 'auth.signup.featureIde' },
  { icon: CheckCircle, key: 'auth.signup.featureProviders' },
] as const;

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

  return json({ language: resolveRequestLocale(request).language });
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
  | {
      errorCode: SignupFeedbackCode;
      errorParams?: { count: number };
      fields?: { name?: string; email?: string; organizationName?: string };
    }
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
      { errorCode: 'AUTH_EMAIL_REQUIRED', fields: { name, email, organizationName } },
      { status: 400 },
    );
  }

  if (password.length < PASSWORD_MIN_LENGTH) {
    return json<ActionResult>(
      {
        errorCode: 'AUTH_PASSWORD_TOO_SHORT',
        errorParams: { count: PASSWORD_MIN_LENGTH },
        fields: { name, email, organizationName },
      },
      { status: 400 },
    );
  }

  if (password !== confirmPassword) {
    return json<ActionResult>(
      { errorCode: 'AUTH_PASSWORD_MISMATCH', fields: { name, email, organizationName } },
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
      let errorCode: SignupFeedbackCode = 'AUTH_SIGNUP_FAILED';

      try {
        const payload = (await error.json()) as { error?: string; code?: string };

        if (payload.code === 'AUTH_EMAIL_EXISTS') {
          errorCode = 'AUTH_EMAIL_EXISTS';
        }
      } catch {
        // Never expose transport or API prose; the client translates a stable code.
      }

      return json<ActionResult>({ errorCode, fields: { name, email, organizationName } }, { status: error.status });
    }

    return json<ActionResult>(
      {
        errorCode: 'AUTH_SIGNUP_UNAVAILABLE',
        fields: { name, email, organizationName },
      },
      { status: 503 },
    );
  }
}

export default function SignupPage() {
  const { t } = useTranslation();

  const actionData = useActionData<typeof action>() as
    | {
        errorCode?: SignupFeedbackCode;
        errorParams?: { count: number };
        fields?: { name?: string; email?: string; organizationName?: string };
      }
    | undefined;

  const navigation = useNavigation();
  const isSubmitting = navigation.state === 'submitting';
  const { pendingProvider, startOAuth } = useAuthOauthPending();
  const [showPassword, setShowPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showOrgField, setShowOrgField] = useState(Boolean(actionData?.fields?.organizationName));

  const error = actionData?.errorCode
    ? t(SIGNUP_FEEDBACK_KEYS[actionData.errorCode], actionData.errorParams)
    : undefined;

  return (
    <AuthScreen
      eyebrow={t('auth.signup.eyebrow')}
      title={t('auth.signup.title')}
      description={t('auth.signup.description')}
      error={error}
      backTo="/"
      backLabel={t('auth.common.backHome')}
      heroEyebrow={t('auth.signup.heroEyebrow')}
      heroTitle={t('auth.signup.heroTitle')}
      heroBody={t('auth.signup.heroBody')}
      heroAside={
        <>
          <div className="mt-9 grid gap-4">
            {SIGNUP_FEATURES.map((feature) => {
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
            {/* Chiffres depuis AUTH_HERO_STATS (source unique partagée avec /login). */}
            {AUTH_HERO_STATS.slice(0, 2).map((item, index) => (
              <div key={item.value}>
                <div className="text-3xl font-bold">{item.value}</div>
                <div className="vc-auth-hero-stat-label mt-1 text-[12px]">
                  {t(index === 0 ? 'auth.signup.statProviders' : 'auth.signup.statLanguages')}
                </div>
              </div>
            ))}
          </div>
        </>
      }
      footer={
        <>
          {t('auth.signup.footerPrompt')}{' '}
          <Link to="/login" className="vc-auth-link font-semibold hover:underline">
            {t('auth.signup.signIn')}
          </Link>
        </>
      }
      belowCard={
        <>
          {/* Parité avec /login : la preuve sociale reste visible sous 1024px. */}
          <div className="vc-auth-mobile-stats mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:hidden">
            {AUTH_HERO_STATS.map((item) => (
              <div key={item.value} className="vc-auth-mobile-stat rounded-lg px-3 py-3 text-center">
                <div className="text-[16px] font-bold">{item.value}</div>
                <div className="mt-1 text-[11px]">{t(item.labelKey)}</div>
              </div>
            ))}
          </div>

          <p className="vc-auth-legal mt-5 text-center text-[11px] leading-5 sm:mt-6">
            {t('auth.signup.legalPrefix')}{' '}
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
      <Form method="post" className="space-y-4 sm:space-y-5">
        <AuthField
          label={t('auth.common.fullName')}
          name="name"
          autoComplete="name"
          defaultValue={actionData?.fields?.name ?? ''}
          placeholder={t('auth.common.fullNamePlaceholder')}
          icon={<UserIcon className="h-4 w-4" />}
        />

        <AuthField
          label={t('auth.common.workEmail')}
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={actionData?.fields?.email ?? ''}
          placeholder={t('auth.common.emailPlaceholder')}
          icon={<Mail className="h-4 w-4" />}
        />

        <label className="block">
          <span className="vc-auth-label text-[13px] font-medium">{t('auth.common.password')}</span>
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
              placeholder={t('auth.common.passwordMinCharacters', { count: PASSWORD_MIN_LENGTH })}
              className="vc-auth-input h-12 w-full rounded-md border px-10 pr-12 text-[16px] outline-none transition-colors sm:h-11 sm:text-[13px]"
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
          {/* Live gauge + checklist replaces the old static hint text. */}
          <PasswordStrengthMeter password={password} className="mt-3" />
        </label>

        <label className="block">
          <span className="vc-auth-label text-[13px] font-medium">{t('auth.common.confirmPassword')}</span>
          <span className="relative mt-2 block">
            <Lock className="vc-auth-field-icon pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
            <input
              name="confirmPassword"
              type={showConfirmPassword ? 'text' : 'password'}
              autoComplete="new-password"
              required
              minLength={8}
              placeholder={t('auth.common.samePasswordPlaceholder')}
              className="vc-auth-input h-12 w-full rounded-md border px-10 pr-12 text-[16px] outline-none transition-colors sm:h-11 sm:text-[13px]"
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword((value) => !value)}
              className="vc-auth-input-action absolute right-1 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-md transition-colors lg:right-2 lg:h-8 lg:w-8"
              aria-label={showConfirmPassword ? t('auth.common.hidePassword') : t('auth.common.showPassword')}
            >
              {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </span>
        </label>

        {showOrgField ? (
          <AuthField
            label={t('auth.common.organizationName')}
            name="organizationName"
            autoComplete="organization"
            defaultValue={actionData?.fields?.organizationName ?? ''}
            placeholder={t('auth.common.organizationPlaceholder')}
            icon={<Building2 className="h-4 w-4" />}
            hint={t('auth.signup.organizationHint')}
          />
        ) : (
          <button
            type="button"
            onClick={() => setShowOrgField(true)}
            className="vc-auth-inline-link inline-flex min-h-11 items-center px-1 text-[12px] font-semibold hover:underline"
          >
            {t('auth.signup.addOrganization')}
          </button>
        )}

        {/*
         * Hard block mirrors the SERVER rule only (registerSchema: min 8) plus
         * an in-flight OAuth redirect. The 12+/number/symbol checklist above is
         * recommended strength guidance and never blocks submission.
         */}
        <AuthSubmit
          label={t('auth.signup.submit')}
          loadingLabel={t('auth.signup.submitting')}
          isSubmitting={isSubmitting}
          disabled={pendingProvider !== null || password.length < PASSWORD_MIN_LENGTH}
        />
      </Form>

      <div className="vc-auth-secondary-actions mt-5 grid gap-3 border-t pt-5 sm:grid-cols-2">
        <AuthOauthButton
          provider="github"
          label={t('auth.signup.github')}
          icon={<Github className="h-4 w-4" />}
          pendingProvider={pendingProvider}
          onStart={startOAuth}
          disabled={isSubmitting}
        />
        <AuthOauthButton
          provider="google"
          label={t('auth.signup.google')}
          icon={<Chrome className="h-4 w-4" />}
          pendingProvider={pendingProvider}
          onStart={startOAuth}
          disabled={isSubmitting}
        />
      </div>
    </AuthScreen>
  );
}
