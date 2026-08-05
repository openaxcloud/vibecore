import { KeyRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { MetaFunction } from 'react-router';
import { Form, Link, useActionData, useNavigation, useSearchParams } from 'react-router';
import { AuthField, AuthScreen, AuthSubmit } from '~/components/auth/AuthScreen';
import {
  apiRequest,
  formObject,
  json,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';
import type { TranslationKey } from '~/lib/i18n/dictionary';
import { resolveRequestLocale } from '~/lib/i18n/request-locale';
import { translateServerMessage } from '~/lib/i18n/server';
import { isReauthRedirect } from '~/lib/route-reauth';

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  const language = data?.language ?? 'en';

  return [
    { title: translateServerMessage(language, 'auth.verify.metaTitle') },
    { name: 'description', content: translateServerMessage(language, 'auth.verify.metaDescription') },
  ];
};

type VerifyFeedbackCode =
  | 'AUTH_EMAIL_ALREADY_VERIFIED'
  | 'AUTH_VERIFICATION_SENT_DEV'
  | 'AUTH_VERIFICATION_SENT'
  | 'AUTH_EMAIL_VERIFIED'
  | 'AUTH_INVALID_VERIFICATION_TOKEN'
  | 'AUTH_VERIFICATION_FAILED'
  | 'AUTH_VERIFICATION_UNAVAILABLE';

const VERIFY_FEEDBACK_KEYS = {
  AUTH_EMAIL_ALREADY_VERIFIED: 'auth.feedback.emailAlreadyVerified',
  AUTH_VERIFICATION_SENT_DEV: 'auth.feedback.verificationSentDev',
  AUTH_VERIFICATION_SENT: 'auth.feedback.verificationSent',
  AUTH_EMAIL_VERIFIED: 'auth.feedback.emailVerified',
  AUTH_INVALID_VERIFICATION_TOKEN: 'auth.feedback.invalidVerificationToken',
  AUTH_VERIFICATION_FAILED: 'auth.feedback.verificationFailed',
  AUTH_VERIFICATION_UNAVAILABLE: 'auth.feedback.verificationUnavailable',
} as const satisfies Record<VerifyFeedbackCode, TranslationKey>;

export function loader({ request }: EnterpriseLoaderArgs) {
  return json({ language: resolveRequestLocale(request).language });
}

export async function action({ request }: EnterpriseActionArgs) {
  const body = formObject(await request.formData());

  try {
    if (body.intent === 'resend') {
      /*
       * Re-issues a fresh token and emails it. Requires the just-registered session (signup logs the
       * user in), and is rate-limited to 5/min on the API. In non-production the API echoes the token.
       */
      const result = await apiRequest<{ alreadyVerified?: boolean; verificationToken?: string }>(
        request,
        '/auth/send-verification',
        { method: 'POST', redirectOn401: false, body: JSON.stringify({}) },
      );

      if (result.alreadyVerified) {
        return json({ statusCode: 'AUTH_EMAIL_ALREADY_VERIFIED' as const });
      }

      return result.verificationToken
        ? json({
            statusCode: 'AUTH_VERIFICATION_SENT_DEV' as const,
            statusParams: { token: result.verificationToken },
          })
        : json({ statusCode: 'AUTH_VERIFICATION_SENT' as const });
    }

    await apiRequest(request, '/auth/verify-email', {
      method: 'POST',
      redirectOn401: false,
      body: JSON.stringify(body),
    });

    return json({ statusCode: 'AUTH_EMAIL_VERIFIED' as const });
  } catch (error) {
    /*
     * A 3xx re-auth redirect (e.g. apiRequest throws `redirect('/mfa-setup')` when the
     * API answers a page-navigation POST with 403 MFA_REQUIRED) must be re-thrown so the
     * framework performs the redirect, not swallowed into a generic inline error.
     */
    if (isReauthRedirect(error)) {
      throw error;
    }

    if (error instanceof Response) {
      let errorCode: VerifyFeedbackCode = 'AUTH_VERIFICATION_FAILED';

      try {
        const payload = (await error.json()) as { code?: string };

        if (payload.code === 'AUTH_INVALID_VERIFICATION_TOKEN') {
          errorCode = 'AUTH_INVALID_VERIFICATION_TOKEN';
        }
      } catch {
        // Never expose transport or API prose; the client translates a stable code.
      }

      return json({ errorCode }, { status: error.status });
    }

    return json({ errorCode: 'AUTH_VERIFICATION_UNAVAILABLE' as const }, { status: 503 });
  }
}

export default function VerifyEmailPage() {
  const { t } = useTranslation();

  const actionData = useActionData<typeof action>() as
    | {
        statusCode?: VerifyFeedbackCode;
        statusParams?: { token: string };
        errorCode?: VerifyFeedbackCode;
      }
    | undefined;

  const navigation = useNavigation();
  const isSubmitting = navigation.state === 'submitting';

  /*
   * Tokens emailed to users are long opaque strings — typing them by
   * hand is a usability tax. Accept `?token=...` from the verification
   * link so the field is pre-filled and the user only has to click
   * "Verify email".
   */
  const [searchParams] = useSearchParams();
  const tokenFromUrl = searchParams.get('token') ?? '';

  /*
   * Client-side 60s cooldown on resend so users can't hammer the button (the API
   * also throttles 5/min). Starts on each resend submit; a 1s tick drives the
   * countdown label.
   */
  const [cooldownEndsAt, setCooldownEndsAt] = useState(0);
  const [nowTs, setNowTs] = useState(() => Date.now());

  useEffect(() => {
    if (cooldownEndsAt <= Date.now()) {
      return undefined;
    }

    const timer = setInterval(() => setNowTs(Date.now()), 1000);

    return () => clearInterval(timer);
  }, [cooldownEndsAt]);

  const resendSecondsLeft = cooldownEndsAt > nowTs ? Math.ceil((cooldownEndsAt - nowTs) / 1000) : 0;

  const status = actionData?.statusCode
    ? t(VERIFY_FEEDBACK_KEYS[actionData.statusCode], actionData.statusParams)
    : undefined;

  const error = actionData?.errorCode ? t(VERIFY_FEEDBACK_KEYS[actionData.errorCode]) : undefined;

  return (
    <AuthScreen
      eyebrow={t('auth.verify.eyebrow')}
      title={t('auth.verify.title')}
      description={t('auth.verify.description')}
      status={status}
      error={error}
      heroEyebrow={t('auth.verify.heroEyebrow')}
      heroTitle={t('auth.verify.heroTitle')}
      heroBody={t('auth.verify.heroBody')}
      footer={
        <>
          {t('auth.verify.footerPrefix')} <span className="font-semibold">{t('auth.verify.footerResend')}</span>{' '}
          {t('auth.verify.footerMiddle')}{' '}
          <Link to="/login" className="vc-auth-link font-semibold hover:underline">
            {t('auth.verify.footerSignIn')}
          </Link>{' '}
          {t('auth.verify.footerSuffix')}
        </>
      }
    >
      <Form method="post" className="space-y-4 sm:space-y-5">
        <AuthField
          label={t('auth.common.verificationToken')}
          name="token"
          required
          minLength={16}
          defaultValue={tokenFromUrl}
          placeholder={t('auth.common.verificationTokenPlaceholder')}
          autoComplete="one-time-code"
          icon={<KeyRound className="h-4 w-4" />}
          hint={t('auth.verify.tokenHint')}
        />
        <AuthSubmit
          label={t('auth.verify.submit')}
          loadingLabel={t('auth.verify.submitting')}
          isSubmitting={isSubmitting}
        />
      </Form>
      <Form method="post" className="mt-3" onSubmit={() => setCooldownEndsAt(Date.now() + 60_000)}>
        <input type="hidden" name="intent" value="resend" />
        <button
          type="submit"
          disabled={isSubmitting || resendSecondsLeft > 0}
          className="vc-auth-link text-sm font-semibold hover:underline disabled:opacity-60"
        >
          {resendSecondsLeft > 0
            ? t('auth.verify.resendAvailable', { count: resendSecondsLeft })
            : t('auth.verify.resend')}
        </button>
      </Form>
    </AuthScreen>
  );
}
